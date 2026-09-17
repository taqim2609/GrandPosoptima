#!/usr/bin/env bash
# Periksa apakah penambahan WORKER BACKEND benar-benar membantu (khusus Pi/server mandiri).
#
# Latar: dulu backend berjalan 1 proses (uvicorn tanpa --workers). Satu proses melayani
# SEMUA request, sehingga laporan berat (mis. periode 30 hari, ±1 detik CPU di mesin uji,
# 4-8x lebih lama di Pi) MENAHAN semua request lain — kasir ikut menunggu walau CPU lengang.
# Skrip ini mengukur hal itu: menjalankan laporan berat BERSAMAAN lalu mengukur waktu
# /api/health. Bila health tetap cepat -> worker tambahan bekerja.
#
# Aman: hanya MEMBACA (login, satu laporan, health). Tidak mengubah data apa pun.
#
# Pakai:
#   bash check-workers-pi.sh                 # tanya username/password admin
#   GAK_USER=admin GAK_PASS=rahasia bash check-workers-pi.sh
#   GAK_URL=http://127.0.0.1:8080 bash check-workers-pi.sh        # untuk pengujian
#   GAK_URL=... GAK_USER=.. GAK_PASS=.. GAK_SKIP_REPORT=1 bash check-workers-pi.sh
set -uo pipefail

BASE="${GAK_URL:-http://localhost}"
COMPOSE_DIR="${GAK_DIR:-$(pwd)}"
REPORT_DAYS="${GAK_REPORT_DAYS:-30}"
PARALEL="${GAK_PARALEL:-3}"          # jumlah laporan berat yang dijalankan BERSAMAAN

C_G=$'\033[32m'; C_Y=$'\033[33m'; C_R=$'\033[31m'; C_B=$'\033[36m'; C_0=$'\033[0m'
say() { printf '%s\n' "$*"; }
sec() { printf '\n%s== %s ==%s\n' "$C_B" "$*" "$C_0"; }
ok()  { printf '  %s[OK]%s %s\n' "$C_G" "$C_0" "$*"; }
warn(){ printf '  %s[!]%s  %s\n' "$C_Y" "$C_0" "$*"; }
bad() { printf '  %s[X]%s  %s\n' "$C_R" "$C_0" "$*"; }
info(){ printf '  [info] %s\n' "$*"; }

# Berkas sementara diletakkan di luar folder proyek — skrip ini TIDAK menulis apa pun
# ke repo/data (hanya membaca), dan berkas sementaranya dibersihkan saat keluar.
TMPDIR_UJI="$(mktemp -d)"
TMP_MET0="$TMPDIR_UJI/met0.json"
trap 'rm -rf "$TMPDIR_UJI"' EXIT

say "${C_B}Periksa jumlah worker backend${C_0} — $(date '+%Y-%m-%d %H:%M:%S')"
say "Alamat server: $BASE"

# ------------------------------------------------------------------ 0. proses di container
sec "0. Proses backend di dalam container"
WORKERS_PROCS=0
if command -v docker >/dev/null 2>&1; then
  UPA="$(cd "$COMPOSE_DIR" 2>/dev/null && docker compose ps --format '{{.Service}} {{.State}}' 2>/dev/null | grep '^backend' || true)"
  if [ -n "$UPA" ]; then ok "container backend: $UPA"; else warn "container 'backend' tidak terlihat dari folder $COMPOSE_DIR"; fi
  # Hitung proses uvicorn dari /proc. PENTING: image backend (python:3.11-slim) TIDAK
  # memasang procps, jadi 'ps'/'pgrep' tidak ada — cara itu selalu menghasilkan 0 dan
  # membuat laporan seolah "docker tidak tersedia" (bug nyata yang pernah terjadi).
  WORKERS_PROCS="$(cd "$COMPOSE_DIR" 2>/dev/null && docker compose exec -T backend sh -c '
    n=0
    for f in /proc/[0-9]*/cmdline; do
      [ -r "$f" ] || continue
      if tr "\0" " " < "$f" 2>/dev/null | grep -q "uvicorn server:app"; then n=$((n+1)); fi
    done
    echo $n' 2>/dev/null | tr -dc "0-9" || true)"
  WORKERS_PROCS="${WORKERS_PROCS:-0}"
  ENVW="$(cd "$COMPOSE_DIR" 2>/dev/null && docker compose exec -T backend sh -c 'printf "%s" "${UVICORN_WORKERS:-}"' 2>/dev/null | tr -d '\r\n' || true)"
  RECENT="$(cd "$COMPOSE_DIR" 2>/dev/null && docker compose logs backend --tail 60 2>/dev/null | grep 'backend start' | tail -2 || true)"
  if [ "$WORKERS_PROCS" -ge 2 ]; then
    ok "proses uvicorn hidup: $WORKERS_PROCS (UVICORN_WORKERS=${ENVW:-?})"
  elif [ "$WORKERS_PROCS" -eq 1 ]; then
    warn "hanya 1 proses uvicorn (UVICORN_WORKERS=${ENVW:-?}) → laporan berat masih bisa menahan kasir"
    info "Naikkan: echo 'UVICORN_WORKERS=2' >> .env && docker compose up -d --build backend"
  else
    info "jumlah proses tidak terbaca dari container (lihat baris 'backend start' di bawah)"
  fi
  if [ -n "$RECENT" ]; then
    while IFS= read -r L; do
      [ -n "$L" ] && say "         log: $(printf '%s' "$L" | sed 's/.*backend-1 *| *//')"
    done <<EOF2
$RECENT
EOF2
  fi
else
  info "docker tidak tersedia di shell ini — bagian ini dilewati"
fi

# ------------------------------------------------------------------ 1. login
sec "1. Login & metrik"
if [ -t 0 ]; then
  read -r -p "Username admin (mis. admin) : " AUSER
  read -r -s -p "Password admin              : " APASS; echo
else
  AUSER="${GAK_USER:-}"; APASS="${GAK_PASS:-}"
fi
TOKEN=""; LOGIN_NOTE="belum dicoba"
if [ -n "${AUSER:-}" ] && [ -n "${APASS:-}" ]; then
  for FIELD in username email; do
    [ -n "$TOKEN" ] && break
    BODY="{\"$FIELD\":\"$AUSER\",\"password\":\"$APASS\"}"
    RESP="$(curl -s -m 15 -w '\n%{http_code}' -X POST "$BASE/api/auth/login" \
      -H 'Content-Type: application/json' -d "$BODY" 2>/dev/null || true)"
    CODE="$(printf '%s' "$RESP" | tail -1)"
    JSONBODY="$(printf '%s' "$RESP" | sed '$d')"
    TOKEN="$(printf '%s' "$JSONBODY" | python3 -c 'import json,sys
try: print(json.load(sys.stdin).get("token") or "")
except Exception: print("")' 2>/dev/null || true)"
    if [ -z "$TOKEN" ]; then
      TOKEN="$(printf '%s' "$JSONBODY" | grep -o '"token"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed 's/.*"\([^"]*\)"$/\1/' || true)"
    fi
    LOGIN_NOTE="via $FIELD → HTTP $CODE"
  done
else
  LOGIN_NOTE="tanpa kredensial (HANYA bagian 0/3 yang dijalankan)"
fi
APASS=""
if [ -n "$TOKEN" ]; then
  ok "login BERHASIL ($LOGIN_NOTE; sandi tidak disimpan)"
else
  warn "login GAGAL ($LOGIN_NOTE)"
  case "${CODE:-}" in
    401) info "username/password salah" ;;
    403) info "akun nonaktif atau wajib ganti password dulu" ;;
    000) info "server tidak menjawab di $BASE (cek: docker compose ps)" ;;
  esac
fi

if [ -n "$TOKEN" ]; then
  MET="$(curl -s -m 30 "$BASE/api/admin/metrics" -H "Authorization: Bearer $TOKEN" 2>/dev/null || true)"
  printf '%s' "$MET" > "$TMP_MET0"      # dipakai nanti untuk menghitung angka HANGAT (delta)
  # Server memberi tahu seberapa sering tiap worker menulis ringkasannya; tanpa menunggu
  # selang itu, angka "hangat" bisa tampak kosong karena worker lain belum menulis.
  printf '%s' "$MET" | python3 -c '
import json, sys
try:
    d = json.load(sys.stdin)
except Exception:
    raise SystemExit
print(d.get("metrics_flush_s") or 16)
' > "$TMPDIR_UJI/flush.txt" 2>/dev/null || echo 16 > "$TMPDIR_UJI/flush.txt"
  META_PARSER="$(mktemp)"
  cat > "$META_PARSER" <<'PY'
import json, sys
try:
    d = json.load(sys.stdin)
except Exception:
    print("  [info] metrik tidak terbaca (server versi lama / endpoint belum ada)")
    raise SystemExit
w = d.get("workers"); nodes = d.get("nodes") or []
print("  [info] metrik: total=%s request, error_rate=%s%%, avg=%s ms" % (d.get("total"), d.get("error_rate"), d.get("avg_ms")))
if w:
    print("  [info] workers dilaporkan server: %s; worker terlihat di metrik: %d" % (w, len(nodes)))
    for n in nodes[:6]:
        print("         pid %s: %s request, %s error" % (n.get("pid"), n.get("total"), n.get("errors")))
    print("  [info] angka di atas = PENJUMLAHAN semua worker (bukan 1 proses)")
else:
    print("  [info] server belum melaporkan jumlah worker (versi lama) — update server agar metrik digabung")
print("  [info] CATATAN: angka di atas menumpuk sejak container DIMULAI, jadi masih memuat")
print("         beban saat start (pembuatan indeks/migrasi + cache masih dingin).")
print("         Angka HANGAT (hanya selama pengukuran skrip ini) ada di bagian 4.")
top = sorted(d.get("by_path") or [], key=lambda x: -(float(x.get("avg_ms", 0)) * int(x.get("count", 0))))[:5]
if top:
    print("  [info] endpoint paling membebani (avg_ms x count):")
    for t in top:
        print("         %6sx  avg %8s ms  %s" % (t.get("count"), t.get("avg_ms"), t.get("path")))
PY
  printf '%s' "$MET" | python3 "$META_PARSER" 2>/dev/null || info "metrik tidak bisa diuraikan"
  rm -f "$META_PARSER"

  ERRS="$(printf '%s' "$MET" | python3 -c '
import json, sys
try:
    d = json.load(sys.stdin)
except Exception:
    raise SystemExit
rows = sorted([p for p in (d.get("by_path") or []) if p.get("errors")],
              key=lambda x: -int(x.get("errors", 0)))[:6]
for t in rows:
    print("         %4s error dari %5s request  %s" % (t.get("errors"), t.get("count"), t.get("path")))
' 2>/dev/null || true)"
  if [ -n "$ERRS" ]; then
    info "endpoint yang mengembalikan error (sejak container mulai):"
    printf '%s\n' "$ERRS"
    info "Sebagian error bisa terjadi saat update/restart (container dimatikan). Bila muncul lagi,"
    info "telusuri penyebabnya: docker compose logs backend --tail 200 | grep -iE 'error|traceback|SLOW'"
  fi
fi

# ------------------------------------------------------------------ 2. uji bersamaan
sec "2. Uji nyata: laporan berat BERSAMAAN sementara /api/health dipanggil"
if [ "${GAK_SKIP_REPORT:-0}" = "1" ]; then
  info "dilewati (GAK_SKIP_REPORT=1)"
elif [ -z "$TOKEN" ]; then
  info "butuh login admin untuk mengakses laporan — dilewati"
else
  END="$(date '+%Y-%m-%d')"
  START="$(date -d "-${REPORT_DAYS} day" '+%Y-%m-%d' 2>/dev/null || date -v-"${REPORT_DAYS}"d '+%Y-%m-%d')"
  URL="${BASE}/api/reports/period?start=${START}&end=${END}"

  # ---- garis dasar: health saat server SANTAI (pembanding) ----
  BSUM=0; BN=3
  for _ in 1 2 3; do
    BT="$(curl -s -o /dev/null -w '%{time_total}' -m 20 "$BASE/api/health" 2>/dev/null || echo 0)"
    BSUM="$(python3 -c "print($BSUM + ${BT:-0})" 2>/dev/null || echo "$BSUM")"
  done
  BAVG="$(python3 -c "print(round($BSUM / $BN, 3))" 2>/dev/null || echo '?')"
  info "health saat santai (pembanding): rata-rata ${BAVG}s"

  info "menjalankan ${PARALEL}x laporan periode ${START}..${END} bersamaan…"
  TMPD="$(mktemp -d)"
  PIDS=""
  for i in $(seq 1 "$PARALEL"); do
    ( curl -s -o "$TMPD/rep$i.out" -w '%{http_code} %{time_total}' -m 300 "$URL" \
        -H "Authorization: Bearer $TOKEN" > "$TMPD/rep$i.txt" 2>/dev/null || echo '000 0' > "$TMPD/rep$i.txt" ) &
    PIDS="$PIDS $!"
  done

  # selama laporan berjalan, ukur /api/health berkali-kali.
  # CATATAN: jangan memakai `jobs -pr` di dalam $( ) — subshell tidak melihat job milik
  # shell induk, sehingga loop langsung berakhir tanpa satu pun pengukuran (bug nyata).
  HMAX=0; HN=0; HSUM=0; HSLOW=0
  # Mulai mengukur SEGERA (tanpa jeda awal): laporan yang lebih cepat dari jeda awal
  # membuat loop selesai tanpa satu pun pengukuran (bug nyata yang pernah terjadi).
  while [ "$HN" -lt 80 ]; do
    HIDUP=0
    for p in $PIDS; do
      kill -0 "$p" 2>/dev/null && HIDUP=$((HIDUP + 1))
    done
    [ "$HIDUP" -eq 0 ] && break
    HT="$(curl -s -o /dev/null -w '%{time_total}' -m 20 "$BASE/api/health" 2>/dev/null || echo 0)"
    HN=$((HN + 1))
    HSUM="$(python3 -c "print($HSUM + ${HT:-0})" 2>/dev/null || echo "$HSUM")"
    BIG="$(python3 -c "print(1 if ${HT:-0} > $HMAX else 0)" 2>/dev/null || echo 0)"
    [ "$BIG" = "1" ] && HMAX="$HT"
    ISSLOW="$(python3 -c "print(1 if ${HT:-0} >= 1.0 else 0)" 2>/dev/null || echo 0)"
    [ "$ISSLOW" = "1" ] && HSLOW=$((HSLOW + 1))
    sleep 0.2
  done
  wait
  # hasil laporan
  REPTIMES=""
  for i in $(seq 1 "$PARALEL"); do
    R="$(cat "$TMPD/rep$i.txt" 2>/dev/null || echo '000 0')"
    REPTIMES="$REPTIMES $(printf '%s' "$R" | awk '{printf "%.2fs(%s)", $2, $1}')"
  done
  rm -rf "$TMPD"
  AVG="$(python3 -c "print(round($HSUM / max(1, $HN), 3))" 2>/dev/null || echo '?')"
  say "         laporan selesai:$REPTIMES"
  say "         /api/health selama beban: ${HN}x, rata-rata ${AVG}s, terlama ${HMAX}s, >=1s: ${HSLOW}x"
  if [ "$HN" -eq 0 ]; then
    warn "tidak ada pengukuran health selama beban (laporan selesai terlalu cepat / semua gagal)"
  elif [ "$HSLOW" -eq 0 ]; then
    ok "kasir TIDAK terhambat walau laporan berat dihitung (health tetap ~${AVG}s)"
    info "pembanding santai ${BAVG}s → saat beban ${AVG}s"
  else
    warn "ada ${HSLOW} permintaan health >= 1 detik saat laporan berjalan"
    info "Bila WORKERS sudah 2: penghambatnya kemungkinan RAM/disk (MongoDB di kartu SD),"
    info "bukan jumlah worker — jangan tambah worker lagi sebelum RAM/disk lega."
    info "Bila WORKERS masih 1: naikkan ke 2 lalu ulangi skrip ini."
  fi
fi

# ------------------------------------------------------------------ 3. RAM & swap
sec "3. RAM & swap (penentu berapa worker yang aman)"
if command -v free >/dev/null 2>&1; then
  free -h | sed 's/^/  /'
  SWAPUSED="$(free -m | awk '/Swap:/ {print $3}')"
  AVAIL="$(free -m | awk '/Mem:/ {print $7}')"
  if [ "${SWAPUSED:-0}" -gt 100 ]; then
    warn "swap terpakai ${SWAPUSED} MB → memori sesak; JANGAN tambah worker dulu"
  else
    ok "swap terpakai ${SWAPUSED} MB (aman)"
  fi
  if [ "${AVAIL:-0}" -lt 250 ]; then
    warn "RAM tersedia hanya ${AVAIL} MB → 2 worker sudah batas; pertimbangkan tambah RAM / pindah disk"
  else
    ok "RAM tersedia ${AVAIL} MB"
  fi
else
  info "perintah 'free' tidak tersedia"
fi
if command -v docker >/dev/null 2>&1; then
  # docker stats sering mengembalikan "0B / 0B" pada panggilan PERTAMA (belum ada sampel),
  # jadi panggilan kedua yang dipakai.
  cd "$COMPOSE_DIR" 2>/dev/null && docker stats --no-stream >/dev/null 2>&1 || true
  RAMC="$(cd "$COMPOSE_DIR" 2>/dev/null && docker stats --no-stream --format '{{.Name}} {{.MemUsage}}' 2>/dev/null | grep -i "backend\|mongo" || true)"
  [ -n "$RAMC" ] && say "$RAMC" | sed 's/^/  /'
fi

# ------------------------------------------------------------------ 4. angka hangat
sec "4. Angka HANGAT (hanya selama pengukuran skrip ini)"
if [ -s "$TMP_MET0" ] && [ -n "$TOKEN" ]; then
  TUNGGU="$(cat "$TMPDIR_UJI/flush.txt" 2>/dev/null || echo 16)"
  case "$TUNGGU" in (''|*[!0-9]*) TUNGGU=16 ;; esac
  TUNGGU=$((TUNGGU + 1))
  info "menunggu ${TUNGGU} dtk agar SEMUA worker menuliskan ringkasannya…"
  sleep "$TUNGGU"
  curl -s -m 30 "$BASE/api/admin/metrics" -H "Authorization: Bearer $TOKEN" -o "$TMPDIR_UJI/met1.json" 2>/dev/null || true
  python3 - "$TMP_MET0" "$TMPDIR_UJI/met1.json" <<'PY'
import json, sys
def muat(p):
    try:
        return json.load(open(p))
    except Exception:
        return None
a, b = muat(sys.argv[1]), muat(sys.argv[2])
if not a or not b:
    print("  [info] tidak bisa membandingkan metrik (respons tidak terbaca)")
    raise SystemExit
def ms(d, pat):
    for p in (d.get("by_path") or []):
        if p.get("path") == pat:
            return float(p.get("avg_ms", 0)) * int(p.get("count", 0)), int(p.get("count", 0)), int(p.get("errors", 0))
    return 0.0, 0, 0
d_total = int(b.get("total", 0)) - int(a.get("total", 0))
d_err = int(b.get("errors", 0)) - int(a.get("errors", 0))
if d_total <= 0:
    print("  [info] belum ada request baru selama pengukuran (server lengang)")
    raise SystemExit
ms_all = float(b.get("avg_ms", 0)) * int(b.get("total", 0)) - float(a.get("avg_ms", 0)) * int(a.get("total", 0))
print("  %s request selama pengukuran (delta), %s error, rata-rata %.1f ms" % (d_total, d_err, ms_all / d_total))
rows = []
paths = set([p.get("path") for p in (a.get("by_path") or [])] + [p.get("path") for p in (b.get("by_path") or [])])
for pat in paths:
    _, c0, e0 = ms(a, pat)
    m1, c1, e1 = ms(b, pat)
    dc, de = c1 - c0, e1 - e0
    if dc <= 0:
        continue
    # beban pada rentang delta = (total ms sekarang) - (total ms sebelumnya)
    m0 = ms(a, pat)[0]
    dms = m1 - m0
    rows.append((dms, dc, de, pat, dms / dc))
rows.sort(key=lambda r: -r[0])
if rows:
    print("  endpoint yang benar-benar diakses selama pengukuran (urut beban):")
    for dms, dc, de, pat, avg in rows[:8]:
        print("    %5sx  avg %8.1f ms  %s%s" % (dc, avg, pat, ("  (%s error)" % de) if de else ""))
    paling = rows[0]
    if paling[4] >= 1000:
        print("  [!] %s rata-rata %.0f ms — endpoint ini yang paling perlu diperhatikan" % (paling[3], paling[4]))
    else:
        print("  [OK] endpoint terberat selama pengukuran rata-rata %.0f ms — masuk akal untuk Pi ini" % paling[4])
PY
else
  info "perlu login admin + metrik untuk bagian ini (dilewati)"
fi

sec "Ringkasan"
if [ "${WORKERS_PROCS:-0}" -ge 1 ]; then WSHOW="$WORKERS_PROCS proses"; else WSHOW="tidak terbaca (lihat log di atas)"; fi
say "  Worker backend : $WSHOW (UVICORN_WORKERS=${ENVW:-?})"
say "  Cara menaikkan : echo 'UVICORN_WORKERS=3' >> .env && docker compose up -d --build backend"
say "  Cara menurunkan: echo 'UVICORN_WORKERS=1' >> .env && docker compose up -d --build backend"
say "  Panduan        : docs/PANDUAN-WORKER-UVICORN.md (di folder proyek / halaman berkas Update Center)"
exit 0
