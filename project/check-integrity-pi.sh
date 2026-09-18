#!/usr/bin/env bash
# ============================================================================
# CEK INTEGRITAS SERVER — Grand Aceh Kuliner POS (dijalankan di komputer server)
#
# Memeriksa: (1) container aplikasi hidup, (2) backend menjawab /api/health,
# (3) integritas DATA lewat backend — relasi antar data, kewajaran angka
# transaksi, stok & HPP, akun, indeks database, dan kesegaran backup,
# (4) backup lokal terakhir di folder backups/.
#
# PEMAKAIAN (di folder proyek, tempat docker-compose.yml berada):
#   bash check-integrity-pi.sh                  # periksa sekarang + ringkasan berwarna
#   bash check-integrity-pi.sh --read-only      # hanya tampilkan hasil terakhir (tanpa memeriksa)
#   bash check-integrity-pi.sh --notify 62812xx # kirim ringkasan singkat ke WhatsApp
#   bash check-integrity-pi.sh --json           # keluarkan JSON mentah (untuk otomatisasi)
#
# Agar jalan otomatis tiap minggu (mis. Minggu 03:30) tambahkan ke crontab:
#   crontab -e   lalu:
#   30 3 * * 0 cd /path/ke/POS-grand && ./check-integrity-pi.sh --notify 62812xxxx >> backups/integrity.log 2>&1
#   (bisa juga cukup mengaktifkan "Cek integritas otomatis mingguan" di aplikasi →
#    Pengaturan → Fitur & Integrasi; hasilnya tersimpan & ringkasannya dikirim ke WA laporan)
#
# KODE KELUAR: 0 = sehat, 2 = ada peringatan, 1 = ada masalah berat / gagal memeriksa.
# Perbaikan temuan dilakukan di aplikasi: Pengaturan → Fitur & Integrasi → Integritas.
# ============================================================================
set -u
cd "$(dirname "$0")" || exit 1
DIR="$(pwd)"

READ_ONLY=0
NOTIFY=""
JSON_OUT=0
while [ $# -gt 0 ]; do
  case "$1" in
    --read-only|--readonly) READ_ONLY=1 ;;
    --notify) shift; NOTIFY="${1:-}" ;;
    --json) JSON_OUT=1 ;;
    -h|--help) sed -n '2,30p' "$0"; exit 0 ;;
    *) echo "Argumen tidak dikenal: $1 (pakai --help)"; exit 1 ;;
  esac
  shift
done

if [ -t 1 ]; then
  C_OK=$'\033[32m'; C_WARN=$'\033[33m'; C_ERR=$'\033[31m'; C_DIM=$'\033[2m'; C_B=$'\033[1m'; C_0=$'\033[0m'
else
  C_OK=""; C_WARN=""; C_ERR=""; C_DIM=""; C_B=""; C_0=""
fi

# Semua keluaran untuk manusia lewat say() — otomatis senyap di mode --json
# supaya keluarannya bisa langsung di-parse program lain.
say() { if [ "$JSON_OUT" = "0" ]; then printf '%s\n' "$*"; else return 0; fi; }

DOCKER="docker"
docker info >/dev/null 2>&1 || DOCKER="sudo docker"
compose() { $DOCKER compose "$@" 2>&1; }

ts() { date '+%Y-%m-%d %H:%M:%S'; }
TMP_REP="$(mktemp)"; TMP_HEALTH="$(mktemp)"
trap 'rm -f "$TMP_REP" "$TMP_HEALTH"' EXIT

RC_LOCAL=0        # 0 sehat, 2 peringatan, 1 berat (dari pemeriksaan lokal)
RC_REPORT=0       # hasil dari laporan integritas

say "${C_B}=== CEK INTEGRITAS SERVER — $(ts) ===${C_0}"
say "${C_DIM}Folder: $DIR${C_0}"

# ---------------------------------------------------------------- 1. container
say ""
say "${C_B}[1/4] Container aplikasi${C_0}"
PS_OUT="$(compose ps)"
UP_N="$(printf '%s\n' "$PS_OUT" | grep -cE '(^|[[:space:]])Up([[:space:]]|$)')"
if [ "${UP_N:-0}" -ge 1 ]; then
  say "  ${C_OK}OK${C_0}   ${UP_N} container hidup"
  say "$(printf '%s\n' "$PS_OUT" | sed 's/^/       /' | head -6)"
else
  say "  ${C_ERR}BERAT${C_0} tidak ada container yang hidup — jalankan: docker compose up -d --build"
  say "$(printf '%s\n' "$PS_OUT" | sed 's/^/       /' | head -8)"
  RC_LOCAL=1
fi

# ---------------------------------------------------------------- 2. health
HEALTH_CODE="$(curl -s -o "$TMP_HEALTH" -w '%{http_code}' -m 10 http://localhost/api/health 2>/dev/null || echo 000)"
if [ "$HEALTH_CODE" = "200" ]; then
  say "  ${C_OK}OK${C_0}   backend menjawab /api/health (HTTP 200)"
else
  say "  ${C_ERR}BERAT${C_0} /api/health tidak menjawab (HTTP $HEALTH_CODE) — cek: docker compose logs backend --tail 50"
  RC_LOCAL=1
fi

# ---------------------------------------------------------------- 3. laporan integritas
say ""
say "${C_B}[2/4] Pemeriksaan integritas data${C_0}"
GOT_REPORT=0
if [ -n "${GAK_REPORT_FILE:-}" ] && [ -f "${GAK_REPORT_FILE}" ]; then
  # Jalur khusus pengujian/otomatisasi: pakai file laporan yang sudah ada.
  cp "$GAK_REPORT_FILE" "$TMP_REP"; GOT_REPORT=1
  say "  ${C_DIM}(memakai file laporan: $GAK_REPORT_FILE)${C_0}"
elif [ "$READ_ONLY" = "1" ]; then
  say "  ${C_DIM}(mode --read-only: memakai hasil terakhir)${C_0}"
else
  SECRET="$(grep -E '^WEBHOOK_CRON_SECRET=' backend/.env.docker 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'" | tr -d '\r' | xargs || true)"
  if [ -n "$SECRET" ]; then
    PAYLOAD="{}"; [ -n "$NOTIFY" ] && PAYLOAD="{\"notify\":\"$NOTIFY\"}"
    CODE="$(curl -s -o "$TMP_REP" -w '%{http_code}' -m 180 -X POST http://localhost/api/cron/integrity \
      -H "Authorization: Bearer $SECRET" -H "Content-Type: application/json" -d "$PAYLOAD" 2>/dev/null || echo 000)"
    if [ "$CODE" = "200" ] && grep -q '"summary"' "$TMP_REP" 2>/dev/null; then
      GOT_REPORT=1
      [ "$NOTIFY" != "" ] && say "  ${C_DIM}ringkasan dikirim ke WhatsApp $NOTIFY${C_0}"
    else
      say "  ${C_WARN}CATATAN${C_0} pemeriksaan lewat API gagal (HTTP $CODE) — server mungkin belum di-update (./update-pos-pi.sh). Membaca hasil terakhir dari database."
    fi
  else
    say "  ${C_WARN}CATATAN${C_0} WEBHOOK_CRON_SECRET belum diisi di backend/.env.docker — pemeriksaan ulang lewat API tidak mungkin; membaca hasil terakhir."
  fi
fi

# Fallback: baca hasil terakhir langsung dari MongoDB (tanpa perlu login API)
if [ "$GOT_REPORT" = "0" ]; then
  DBNAME="$(grep -E '^DB_NAME=' backend/.env.docker 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'" | tr -d '\r' | xargs || true)"
  DBNAME="${DBNAME:-grandpos}"
  JS="var d=db.getSiblingDB('$DBNAME').settings.findOne({_id:'integrity'}); print(JSON.stringify(d && d.last ? d.last : null));"
  # PENTING: fungsi compose() di atas menggabungkan stderr (2>&1), sehingga pada MongoDB 4.4
  # (yang TIDAK punya 'mongosh') percobaan pertama menghasilkan pesan galat
  # "OCI runtime exec failed ... mongosh: executable file not found" — dulu itu ikut diterima
  # sebagai laporan lalu loop berhenti sebelum mencoba shell 'mongo' yang sebenarnya ada.
  # Sekarang hanya keluaran yang benar-benar laporan (JSON memuat "summary") yang diterima.
  for SH in mongosh mongo; do
    RAW="$(compose exec -T mongo $SH --quiet --eval "$JS" | tr -d '\r')"
    CAND="$(printf '%s\n' "$RAW" | grep -E '^\{.*"summary"' | tail -1)"
    if [ -n "$CAND" ]; then
      printf '%s' "$CAND" > "$TMP_REP"
      GOT_REPORT=1
      break
    fi
  done
fi

if [ "$GOT_REPORT" = "0" ] || ! grep -q '"summary"' "$TMP_REP" 2>/dev/null; then
  if [ "$JSON_OUT" = "1" ]; then
    echo "{}"
  else
    say "  ${C_ERR}BERAT${C_0} belum ada laporan integritas yang bisa dibaca."
    say "       Jalankan dulu pemeriksaan dari aplikasi: Pengaturan → Fitur & Integrasi → Integritas → ${C_B}Cek Sekarang${C_0}"
    say "       (atau pastikan server sudah di-update: ./update-pos-pi.sh)"
  fi
  RC_REPORT=1
elif ! command -v python3 >/dev/null 2>&1; then
  say "  ${C_WARN}python3 tidak ditemukan${C_0} — menampilkan laporan mentah:"
  if [ "$JSON_OUT" = "1" ]; then cat "$TMP_REP"; else cat "$TMP_REP"; fi
else
  python3 - "$TMP_REP" "$JSON_OUT" <<'PY'
import json, sys

path, json_out = sys.argv[1], sys.argv[2] == "1"
try:
    with open(path) as f:
        rep = json.load(f)
except Exception as e:
    print(f"Laporan tidak bisa dibaca: {e}")
    sys.exit(1)

if json_out:
    print(json.dumps(rep, ensure_ascii=False))
    s = rep.get("summary") or {}
    sys.exit(1 if s.get("error") else (2 if s.get("warn") else 0))

B, OK, WARN, ERR, DIM, Z = "\033[1m", "\033[32m", "\033[33m", "\033[31m", "\033[2m", "\033[0m"
if not sys.stdout.isatty():
    B = OK = WARN = ERR = DIM = Z = ""

s = rep.get("summary") or {}
print(f"  Laporan: {str(rep.get('at'))[:16].replace('T', ' ')} UTC · "
      f"{rep.get('duration_ms', 0)} ms · {rep.get('orders_scanned', 0)} transaksi diperiksa")
print()
for g in rep.get("groups") or []:
    checks = g.get("checks") or []
    bad = [c for c in checks if c.get("count")]
    head = f"{len(bad)} perlu perhatian" if bad else "semua normal"
    color = WARN if bad else OK
    print(f"{B}{g.get('label')}{Z} — {color}{head}{Z}")
    for c in checks:
        if not c.get("count"):
            if c.get("level") == "error":
                print(f"   {OK}OK{Z}   {c.get('name')}")
            continue
        tag = f"{ERR}{c['count']} BERAT{Z}" if c.get("level") == "error" else f"{WARN}{c['count']} PERHATIAN{Z}"
        print(f"   {tag}  {c.get('name')}")
        if c.get("note"):
            print(f"        {DIM}{c['note']}{Z}")
        for smp in (c.get("samples") or [])[:3]:
            print(f"        {DIM}• {smp}{Z}")
        if c.get("fix"):
            print(f"        → bisa diperbaiki otomatis di aplikasi: {c.get('fix_label') or c.get('fix')}")
    print()

info = rep.get("info") or {}
jml = info.get("jumlah_dokumen") or {}
print(f"{B}Info{Z} versi terpasang: {info.get('versi_terpasang') or '-'} · "
      + " · ".join(f"{k}: {v}" for k, v in list(jml.items())[:6]))
print(f"{B}Ringkasan{Z} {s.get('error', 0)} masalah berat · {s.get('warn', 0)} peringatan · "
      f"{s.get('ok', 0)} normal · {s.get('fixable', 0)} bisa diperbaiki otomatis")
if s.get("error") or s.get("warn"):
    print(f"{B}Perbaikan{Z} buka aplikasi → Pengaturan → Fitur & Integrasi → Integritas "
          f"(ada tombol Perbaiki per temuan).")

sys.exit(1 if s.get("error") else (2 if s.get("warn") else 0))
PY
fi
RC_REPORT=$?

# ---------------------------------------------------------------- 4. backup lokal
say ""
say "${C_B}[3/4] Backup lokal (folder backups/)${C_0}"
NEWEST="$(ls -t backups/*.gz backups/*.zip backups/*.dump 2>/dev/null | head -1 || true)"
if [ -z "$NEWEST" ]; then
  say "  ${C_WARN}PERHATIAN${C_0} belum ada file backup — jalankan: ./backup-pi.sh (atau ./setup-autobackup-pi.sh)"
  [ "$RC_LOCAL" -lt 2 ] && RC_LOCAL=2
elif find "$NEWEST" -mtime -3 2>/dev/null | grep -q .; then
  say "  ${C_OK}OK${C_0}   backup terakhir: $(basename "$NEWEST") ($(date -r "$NEWEST" '+%Y-%m-%d %H:%M' 2>/dev/null || echo '?'))"
else
  say "  ${C_WARN}PERHATIAN${C_0} backup terakhir lebih dari 3 hari: $(basename "$NEWEST")"
  say "       pasang backup otomatis harian: ./setup-autobackup-pi.sh"
  [ "$RC_LOCAL" -lt 2 ] && RC_LOCAL=2
fi
[ -f .vibecoder-version ] && say "  ${C_DIM}versi terpasang: $(cat .vibecoder-version)${C_0}"

# ---------------------------------------------------------------- kesimpulan
say ""
say "${C_B}[4/4] Kesimpulan${C_0}"
# Tingkat keparahan: 0 sehat < 2 peringatan < 1 berat. Dibandingkan lewat peringkat
# (bukan angka mentah) supaya "berat" tidak kalah oleh "peringatan".
sev() { case "$1" in 0) echo 0 ;; 2) echo 1 ;; *) echo 2 ;; esac; }
unsev() { case "$1" in 0) echo 0 ;; 1) echo 2 ;; *) echo 1 ;; esac; }
S_REP="$(sev "$RC_REPORT")"; S_LOC="$(sev "$RC_LOCAL")"
S_ALL=$S_REP; [ "$S_LOC" -gt "$S_REP" ] && S_ALL=$S_LOC
RC="$(unsev "$S_ALL")"
case "$RC" in
  0) say "  ${C_OK}${C_B}SEHAT${C_0} — tidak ditemukan masalah.$( [ "$READ_ONLY" = "1" ] && echo " (hasil terakhir)" )" ;;
  2) say "  ${C_WARN}${C_B}PERHATIAN${C_0} — ada temuan ringan/backup lama. Lihat daftar di atas." ;;
  *) say "  ${C_ERR}${C_B}PERLU TINDAKAN${C_0} — ada masalah berat. Perbaiki lewat aplikasi (Pengaturan → Fitur & Integrasi → Integritas) atau cek: docker compose logs backend --tail 50" ;;
esac
exit "$RC"
