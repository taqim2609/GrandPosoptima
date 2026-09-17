#!/usr/bin/env bash
# ============================================================================
# PENGUMPUL METRIK SERVER — Grand Aceh Kuliner POS
#
# AMAN: skrip ini HANYA MEMBACA (curl GET + perintah baca: free/df/uptime/
# docker stats/dbStats). Tidak mengubah, menghapus, atau me-restart apa pun.
#
# PEMAKAIAN (di folder proyek di komputer server, tempat docker-compose.yml ada):
#   cd ~/grand-aceh-pos
#   bash collect-metrics-pi.sh                 # bagian 1-4 (cepat, aman kapan saja)
#   bash collect-metrics-pi.sh --with-timing   # PLUS ukur waktu endpoint laporan (bagian 5)
#                                              #   → jalankan di LUAR jam ramai!
#
# Hasilnya disimpan sebagai metrics-report-<tanggal>.txt di folder yang sama.
# Buka file itu lalu kirim isinya ke chat VibeCoder (atau screenshot dari HP).
#
# Sandi admin TIDAK disimpan & TIDAK ikut ditulis ke file laporan: hanya
# ditanyakan sekali (ketikan tidak tampil) untuk mengambil satu token sementara.
# ============================================================================
set -u
cd "$(dirname "$0")" || exit 1
DIR="$(pwd)"

WITH_TIMING=0
if [ "${1:-}" = "--with-timing" ]; then WITH_TIMING=1; fi

TS="$(date '+%Y-%m-%d_%H%M%S')"
OUT="$DIR/metrics-report-$TS.txt"
TMPD="$(mktemp -d)"
trap 'rm -rf "$TMPD"' EXIT

# Alamat server POS. Default http://localhost (skrip dijalankan di server itu sendiri).
# Bisa di-override untuk pengujian/otomatisasi: GAK_URL=http://127.0.0.1:8080 bash collect-metrics-pi.sh
BASE="${GAK_URL:-http://localhost}"

DOCKER="docker"
docker info >/dev/null 2>&1 || DOCKER="sudo docker"

# Keluaran ganda: ke layar DAN ke file laporan
say() { printf '%s\n' "$*" | tee -a "$OUT"; }
sec() { printf '\n--- %s ---\n' "$*" | tee -a "$OUT"; }
run() { "$@" 2>&1 | tee -a "$OUT"; }

: > "$OUT"
say "=== LAPORAN METRIK SERVER Grand Aceh Kuliner POS ==="
say "Waktu pengambilan : $(date '+%Y-%m-%d %H:%M:%S %Z')"
say "Folder proyek     : $DIR"
if [ -f .vibecoder-version ]; then say "Versi terpasang    : $(cat .vibecoder-version)"; fi
say "(skrip baca-saja — tidak ada data yang diubah)"

# ---------------------------------------------------------------- 0. temuan cepat
sec "0. TEMUAN CEPAT (baca ini dulu)"
MEM_TOT_KB="$(awk '/^MemTotal:/{print $2}' /proc/meminfo 2>/dev/null || echo 0)"
MEM_AVAIL_KB="$(awk '/^MemAvailable:/{print $2}' /proc/meminfo 2>/dev/null || echo 0)"
SWAP_TOT_KB="$(awk '/^SwapTotal:/{print $2}' /proc/meminfo 2>/dev/null || echo 0)"
SWAP_FREE_KB="$(awk '/^SwapFree:/{print $2}' /proc/meminfo 2>/dev/null || echo 0)"
MEM_TOT_MB=$(( MEM_TOT_KB / 1024 )); MEM_AVAIL_MB=$(( MEM_AVAIL_KB / 1024 ))
SWAP_USED_MB=$(( (SWAP_TOT_KB - SWAP_FREE_KB) / 1024 ))

say "RAM total ${MEM_TOT_MB} MB · tersedia ${MEM_AVAIL_MB} MB · swap terpakai ${SWAP_USED_MB} MB"
if [ "$SWAP_USED_MB" -ge 100 ]; then
  say "  [TEMUAN] Swap terpakai ${SWAP_USED_MB} MB. Bila swap berada di kartu SD, setiap"
  say "           kehabisan RAM berubah jadi kelambatan besar (SD card ~1000x lebih lambat"
  say "           daripada RAM). Inilah penyebab khas 'kadang semua halaman lemot'."
elif [ "$MEM_AVAIL_MB" -lt 250 ] && [ "$MEM_TOT_MB" -gt 0 ]; then
  say "  [TEMUAN] Sisa RAM hanya ${MEM_AVAIL_MB} MB — mendekati batas, rawan kelambatan/restart."
else
  say "  [OK] Tekanan memori tidak berat."
fi

# Proyek Docker yang sedang berjalan
PROJ="$( ( $DOCKER ps --format '{{.Label "com.docker.compose.project"}}' 2>/dev/null || true ) | sort -u | grep -v '^$' )"
NPROJ="$(printf '%s\n' "$PROJ" | grep -c . || true)"
if [ "${NPROJ:-0}" -gt 1 ]; then
  say "  [TEMUAN] Ada ${NPROJ} proyek Docker berjalan bersamaan: $(printf '%s' "$PROJ" | tr '\n' ' ')"
  say "           Setiap proyek membawa backend + MongoDB sendiri. Di RAM ${MEM_TOT_MB} MB ini"
  say "           beban & memorinya berlipat. Bila proyek lain tidak dipakai, hentikan"
  say "           (lihat cara amannya di bagian 3 di bawah)."
elif [ "${NPROJ:-0}" = "1" ]; then
  say "  [OK] Hanya satu proyek Docker berjalan ($(printf '%s' "$PROJ" | tr -d '\n'))."
fi

# Jenis disk tempat folder proyek & database berada
ROOTDEV="$(df --output=source / 2>/dev/null | tail -1 | sed 's#/dev/##;s#[0-9]*$##' || true)"
case "$ROOTDEV" in
  mmcblk*) say "  [TEMUAN] Disk sistem = KARTU SD/eMMC ($ROOTDEV) dan database ada di dalamnya."
           say "           Ini sumber utama lambatnya query/laporan di Raspberry Pi. Pakai SSD/USB3"
           say "           untuk data (atau minimal pindahkan folder data MongoDB ke SSD) memberi"
           say "           lompatan kecepatan yang jauh lebih besar daripada mengganti bahasa." ;;
  nvme*|sd[a-z]) say "  [OK] Disk sistem = $ROOTDEV (bukan kartu SD)." ;;
  *) say "  [info] Disk sistem: ${ROOTDEV:-tidak diketahui}" ;;
esac

# ---------------------------------------------------------------- 1. kesehatan dasar
sec "1. Kesehatan dasar"
if [ -t 0 ]; then
  read -r -p "Username admin (mis. admin) : " AUSER
  read -r -s -p "Password admin              : " APASS; echo
else
  AUSER="${GAK_USER:-}"; APASS="${GAK_PASS:-}"
fi

TOKEN=""
LOGIN_NOTE=""
if [ -n "${AUSER:-}" ] && [ -n "${APASS:-}" ]; then
  for FIELD in username email; do
    [ -n "$TOKEN" ] && break
    BODY="{\"$FIELD\":\"$AUSER\",\"password\":\"$APASS\"}"
    RESP="$(curl -s -m 15 -w '\n%{http_code}' -X POST ${BASE}/api/auth/login \
      -H 'Content-Type: application/json' -d "$BODY" 2>/dev/null || true)"
    CODE="$(printf '%s' "$RESP" | tail -1)"
    JSONBODY="$(printf '%s' "$RESP" | sed '$d')"
    TOKEN="$(printf '%s' "$JSONBODY" | python3 -c 'import json,sys
try: print(json.load(sys.stdin).get("token") or "")
except Exception: print("")' 2>/dev/null)"
    if [ -z "$TOKEN" ]; then
      TOKEN="$(printf '%s' "$JSONBODY" | grep -o '"token"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed 's/.*"\([^"]*\)"$/\1/')"
    fi
    LOGIN_NOTE="via $FIELD → HTTP $CODE"
    if printf '%s' "$JSONBODY" | grep -q 'must_change_password'; then
      LOGIN_NOTE="$LOGIN_NOTE (akun wajib ganti password dulu)"
    fi
  done
fi
APASS=""; AUSER=""

if [ -n "$TOKEN" ]; then
  say "Login admin        : BERHASIL ($LOGIN_NOTE; token sementara tidak ditulis ke file)"
else
  say "Login admin        : GAGAL ($LOGIN_NOTE)"
  case "${CODE:-}" in
    401) say "                     → Username atau password salah. Coba login di aplikasi (browser)"
         say "                       dulu untuk memastikan; perhatikan pemakaian huruf besar/kecil." ;;
    403) say "                     → Akun dinonaktifkan, atau wajib ganti password dulu di aplikasi." ;;
    404) say "                     → Alamat server tidak dikenal (pastikan skrip dijalankan di server)." ;;
    422) say "                     → Format login tidak diterima (server versi lama?) — update server dulu." ;;
    000) say "                     → Server tidak menjawab di ${BASE} (cek: docker compose ps)." ;;
    *)   say "                     → Pastikan username & password benar." ;;
  esac
  say "                     Bila akun baru: buka aplikasi → login → ganti password wajib,"
  say "                     lalu jalankan skrip ini lagi."
  say "                     Bagian 2, 4, dan 5 akan kosong tanpa login."
fi

if curl -s -m 10 ${BASE}/api/health >/dev/null 2>&1; then
  say "/api/health        : OK"
else
  say "/api/health        : TIDAK MENJAWAB"
fi

say ""
say "Container (docker compose ps):"
run $DOCKER compose ps

# ---------------------------------------------------------------- 2. metrik endpoint
sec "2. Metrik performa endpoint (sejak backend terakhir dijalankan)"
if [ -n "$TOKEN" ]; then
  curl -s -m 30 ${BASE}/api/admin/metrics -H "Authorization: Bearer $TOKEN" \
    -o "$TMPD/metrics.json" 2>/dev/null || true
  if grep -q 'by_path' "$TMPD/metrics.json" 2>/dev/null; then
    python3 - "$TMPD/metrics.json" <<'PY' | tee -a "$OUT"
import json, sys
d = json.load(open(sys.argv[1]))
bp = d.get("by_path") or []

print(f"total request   : {d.get('total')}")
print(f"rata-rata       : {d.get('avg_ms')} ms")
print(f"error rate      : {d.get('error_rate')}%")
print(f"uptime backend  : {d.get('uptime_s')} detik   <-- bila kecil, data metrik masih tipis (baru restart)")
print(f"cache entri     : {d.get('cache_entries')}")
print(f"circuit breaker : {d.get('breakers')}")

print()
print("A. ENDPOINT PALING SERING DIPANGGIL (urut jumlah panggilan)")
print(f"   {'path':<44s} {'panggil':>8s} {'rata2 ms':>9s} {'error':>6s} {'total ms':>10s}")
for p in bp:
    tot = round((p.get("avg_ms") or 0) * (p.get("count") or 0))
    print(f"   {str(p.get('path'))[:44]:<44s} {p.get('count'):>8} {p.get('avg_ms'):>9} {p.get('errors'):>6} {tot:>10}")

print()
print("B. ENDPOINT PALING MEMBEBANI (urut TOTAL waktu: rata-rata x jumlah panggilan)")
print("   <-- bagian inilah yang menentukan server terasa berat atau tidak")
for p in sorted(bp, key=lambda x: -((x.get("avg_ms") or 0) * (x.get("count") or 0)))[:15]:
    tot = round((p.get("avg_ms") or 0) * (p.get("count") or 0))
    print(f"   {tot:>9} ms   {p.get('avg_ms'):>8} ms x {p.get('count'):>6} panggilan   {p.get('path')}")

sl = d.get("slow") or []
print()
print(f"C. REQUEST LAMBAT TERCATAT ({len(sl)} entri terakhir di ring buffer)")
for s in sl:
    print(f"   {s}")
if not sl:
    print("   (tidak ada — belum ada request melewati ambang, atau ring buffer baru direset saat restart)")
PY
  else
    say "(metrik tidak terbaca — token ditolak, atau server versi lama belum punya /admin/metrics)"
  fi
else
  say "(dilewati — tidak ada sesi login)"
fi

# ---------------------------------------------------------------- 3. sumber daya mesin
sec "3. Sumber daya komputer server"
say "Waktu hidup & beban:"; run uptime
say ""; say "Memori (free -h):"; run free -h
say ""; say "Ruang disk (df -h /):"; run df -h /
say ""; say "Jenis disk:"
run lsblk -o NAME,SIZE,ROTA,TRAN,MOUNTPOINT
say "  (mmcblk* = kartu SD/eMMC · nvme*/sd* = SSD/HDD USB. ROTA hanya menandai disk berputar,"
say "   jadi kartu SD tetap terbaca ROTA=0 — lihat nama perangkat, bukan angka ROTA.)"
say ""; say "Pemakaian resource container (docker stats):"
run $DOCKER stats --no-stream
say "  (bila kolom MEM USAGE menunjukkan 0B, host ini tidak mengekspos batas memori cgroup —"
say "   pakai angka 'free -h' di atas sebagai acuan.)"
say ""
say "Jumlah CPU : $(nproc 2>/dev/null || echo '?')"
say "Model CPU  : $(grep -m1 'model name\|Model' /proc/cpuinfo 2>/dev/null | head -1 | cut -d: -f2- | xargs || echo '?')"
say "Swap       : $(free -m 2>/dev/null | awk '/Swap/{print $2" MB total, terpakai "$3" MB"}')"
SUHU="$(vcgencmd measure_temp 2>/dev/null || true)"
if [ -z "$SUHU" ]; then
  SUHU="$(cat /sys/class/thermal/thermal_zone0/temp 2>/dev/null | awk '{printf "%.1f C", $1/1000}' || true)"
fi
say "Suhu CPU   : ${SUHU:-tidak tersedia}"
say "  (di atas 80 C = Pi menurunkan kecepatan CPU sendiri / throttling)"
say ""
say "SEMUA proyek Docker di mesin ini (bukan hanya folder ini):"
run $DOCKER ps --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Label "com.docker.compose.project"}}'
say ""
say "Bila ada proyek lain yang TIDAK dipakai, cara aman menghentikannya:"
say "  docker stop <nama-container>          # menghentikan tanpa menghapus data"
say "  # atau, dari folder proyek lain:  docker compose down"
say "  (JANGAN pakai 'down -v' — opsi -v menghapus volume/data.)"

# ---------------------------------------------------------------- 4. ukuran database
sec "4. Ukuran database (MongoDB) & jumlah dokumen"
DBNAME="$(grep -E '^DB_NAME=' backend/.env.docker 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"'\''\r' | xargs || true)"
DBNAME="${DBNAME:-grandpos}"
say "Nama database (dari backend/.env.docker): $DBNAME"
MONGO_CT="$( ( $DOCKER compose ps -q mongo 2>/dev/null || true ) | head -1 )"
cat > "$TMPD/dbstats.js" <<JS
var d = db.getSiblingDB('$DBNAME');
var s = d.stats();
print('nama database : ' + d + '  | dataSize: ' + s.dataSize + ' B  | storageSize: ' + s.storageSize + ' B');
print('jumlah koleksi: ' + d.getCollectionNames().length);
d.getCollectionNames().sort().forEach(function (c) {
  var col = d.getCollection(c);
  var st = col.stats();
  print('  ' + c + ' : ' + col.countDocuments() + ' dokumen, ' + st.storageSize + ' B');
});
JS
GOTDB=0
DBTXT=""
# Mongo 4.4 (yang dipakai di Pi) TIDAK punya 'mongosh' — coba keduanya, dan jangan
# memakai "| grep -q" langsung di ujung pipa (bisa memutus proses lebih awal).
for SH in mongosh mongo; do
  DBTXT="$( ( $DOCKER compose exec -T mongo $SH --quiet --eval "$(cat "$TMPD/dbstats.js")" 2>/dev/null || true ) | tr -d '\r')"
  case "$DBTXT" in *"nama database"*) GOTDB=1; break ;; esac
done
if [ "$GOTDB" = "0" ] && [ -n "$MONGO_CT" ]; then
  for SH in mongosh mongo; do
    DBTXT="$( ( $DOCKER exec "$MONGO_CT" $SH --quiet --eval "$(cat "$TMPD/dbstats.js")" 2>/dev/null || true ) | tr -d '\r')"
    case "$DBTXT" in *"nama database"*) GOTDB=1; break ;; esac
  done
fi
if [ "$GOTDB" = "1" ]; then
  printf '%s\n' "$DBTXT" | tee -a "$OUT"
else
  say "(tidak bisa membaca ukuran database)"
  say "Cek manual:  docker exec -it $( [ -n "$MONGO_CT" ] && echo "$MONGO_CT" || echo 'grand-aceh-pos-mongo-1' ) mongo $DBNAME"
  say "  lalu ketik:  db.stats()  dan  db.orders.countDocuments()"
fi

# ---------------------------------------------------------------- 5. waktu nyata endpoint
sec "5. Waktu NYATA endpoint laporan di hardware ini (end-to-end, termasuk database)"
if [ "$WITH_TIMING" = "0" ]; then
  say "Dilewati. Untuk mengukur, jalankan lagi dgn:"
  say "   bash collect-metrics-pi.sh --with-timing"
  say ""
  say "PENTING: hanya jalankan di LUAR jam ramai. Backend memakai SATU proses,"
  say "jadi selama laporan bulanan dihitung, aplikasi bisa terasa berhenti sejenak."
elif [ -z "$TOKEN" ]; then
  say "(dilewati — perlu login admin untuk mengukur endpoint ini)"
else
  TODAY="$(date '+%Y-%m-%d')"
  D30="$(date -d '-30 days' '+%Y-%m-%d' 2>/dev/null || date -v-30d '+%Y-%m-%d' 2>/dev/null || echo "$TODAY")"
  measure() {
    local label="$1" url="$2"
    local out code time
    out="$(curl -s -o /dev/null -w '%{http_code} %{time_total}' -m 180 "$url" -H "Authorization: Bearer $TOKEN" 2>/dev/null || echo '000 0')"
    code="${out%% *}"; time="${out##* }"
    printf '   %-46s %8s dtk   HTTP %s\n' "$label" "$time" "$code" | tee -a "$OUT"
  }
  say "Mengukur (tiap baris bisa makan beberapa detik):"
  measure "Hari ini — /reports/summary" "${BASE}/api/reports/summary?date=$TODAY"
  measure "30 hari  — /reports/range"   "${BASE}/api/reports/range?start=$D30&end=$TODAY"
  measure "30 hari  — /reports/period"  "${BASE}/api/reports/period?start=$D30&end=$TODAY"
  measure "Hari ini — /reports/vendors" "${BASE}/api/reports/vendors?date=$TODAY"
  measure "Katalog  — /products"        "${BASE}/api/products"
  measure "Ulangi /reports/summary (uji cache)" "${BASE}/api/reports/summary?date=$TODAY"
  say ""
  say "Catatan: perbandingan baris pertama vs terakhir menunjukkan efek cache."
  say "Bagian B di atas + angka di sini = dasar keputusan optimasi."
fi

# ---------------------------------------------------------------- selesai
sec "SELESAI"
say "Laporan tersimpan di: $OUT"
say "Buka file itu, lalu kirim isinya ke chat VibeCoder."
say "(Tidak ada sandi/token di dalam file — aman dikirim.)"
