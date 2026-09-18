#!/usr/bin/env bash
# ============================================================
# Update Grand Aceh Kuliner POS dari Google AI Studio
# ============================================================
set -e
cd "$(dirname "$0")"

BASE_URL="${AISTUDIO_URL:-https://ais-dev-pweobuimlhj7oohblibyuh-754954417035.asia-southeast1.run.app}"
VER_FILE=".aistudio-version"
[ -f .vibecoder-version ] && [ ! -f "$VER_FILE" ] && cp .vibecoder-version "$VER_FILE" 2>/dev/null || true
CURL_ERR="/tmp/gak-curl-err.txt"

TS() { date "+%Y-%m-%d %H:%M:%S"; }

# ---------- mode diagnosa ----------
if [ "${1:-}" = "--test" ]; then
  echo "=== Diagnosa koneksi ke Google AI Studio ==="
  echo "Jam Pi          : $(date '+%Y-%m-%d %H:%M:%S %Z')"
  echo "curl            : $(command -v curl >/dev/null 2>&1 && curl --version | head -1 || echo TIDAK ADA)"
  echo "URL Pusat Update: $BASE_URL"
  echo "--- coba HTTPS (lihat baris terakhir) ---"
  curl -v --connect-timeout 15 -m 30 "$BASE_URL/version.json" -o /dev/null 2>&1 | tail -6 || true
  exit 0
fi

# ---------- fase 2 (dipanggil ulang oleh diri sendiri setelah ekstrak) ----------
if [ "${1:-}" = "--applied" ]; then
  REMOTE_VER="${2:-unknown}"
  NOTIFY="${3:-}"
  echo "[$(TS)] Ekstraksi selesai — membangun versi $REMOTE_VER ..."
else
  NOTIFY="${1:-}"
  echo "[$(TS)] Cek update dari Google AI Studio ($BASE_URL) ..."

  # --- versi remote vs versi lokal (dengan pesan error asli bila gagal) ---
  REMOTE_VER="$(curl -fsSL --connect-timeout 15 -m 30 "$BASE_URL/version.json" 2>"$CURL_ERR" \
    | sed -n 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -1 || true)"
  if [ -z "$REMOTE_VER" ]; then
    echo "[$(TS)] GAGAL membaca versi dari $BASE_URL"
    echo "[$(TS)] Penyebab dari curl:"
    sed 's/^/[curl] /' "$CURL_ERR" 2>/dev/null | tail -5 || true
    exit 0
  fi
    echo "   - CA:    sudo apt update && sudo apt install -y ca-certificates && sudo update-ca-certificates"
    echo "   - Jam:   cek 'date' — kalau salah: sudo date -s '$(date +%F\ %T)'"
    echo "   - Jaringan memblokir 443 ke server update (VPN/proxy/firewall?)"
    echo "   - Diagnosa lengkap: bash update-pos-pi.sh --test"
    exit 0
  fi

  LOCAL_VER="$(cat "$VER_FILE" 2>/dev/null || echo "")"
  if [ -n "$LOCAL_VER" ] && [ "$LOCAL_VER" = "$REMOTE_VER" ]; then
    echo "[$(TS)] Sudah versi terbaru ($REMOTE_VER). Tidak ada update."
    exit 0
  fi

  echo "[$(TS)] Versi baru ditemukan: ${LOCAL_VER:-(belum ada)} -> $REMOTE_VER. Mengunduh ..."
  if ! curl -fsSL --connect-timeout 15 -m 300 -o /tmp/gak-pos-update.tar.gz "$BASE_URL/pos-grand.tar.gz" 2>"$CURL_ERR"; then
    echo "[$(TS)] GAGAL mengunduh arsip. Penyebab dari curl:"
    sed 's/^/[curl] /' "$CURL_ERR" 2>/dev/null | tail -5 || true
    exit 0
  fi
  test -s /tmp/gak-pos-update.tar.gz

  # ===== Ekstraksi yang TAHAN IZIN & TAHAN JENIS tar =====
  # Kasus di Pi: folder sebagian milik root (update via sudo/container) dan
  # sebagian tar (busybox) MENOLAK menimpa file yang sudah ada ("File exists").
  # Solusi: perbaiki kepemilikan dulu (pola update-pi.sh), ekstrak ke folder
  # kosong di /tmp, lalu SALIN-TIMPA dengan cp (cp selalu menimpa).
  ME_UID="$(id -u 2>/dev/null || echo 1000)"
  GRP_GID="$(id -g 2>/dev/null || echo 1000)"
  if [ -n "$(find . ! -uid "$ME_UID" -print -quit 2>/dev/null)" ]; then
    echo "[$(TS)] Ada file milik user lain (biasanya root). Memperbaiki kepemilikan (perlu sudo SEKALI) ..."
    sudo chown -R "$ME_UID:$GRP_GID" . 2>/dev/null || echo "[$(TS)] (chown gagal — akan coba sudo saat menyalin)"
  fi

  XDIR="$(mktemp -d /tmp/gak-extract.XXXXXX)"
  if ! tar xzf /tmp/gak-pos-update.tar.gz -C "$XDIR" 2>/dev/null; then
    echo "[$(TS)] GAGAL mengekstrak arsip di /tmp (arsip rusak?)."
    rm -rf "$XDIR"
    exit 0
  fi

  if ! cp -a "$XDIR"/. . 2>/dev/null; then
    echo "[$(TS)] Menyalin ke folder gagal tanpa sudo — mencoba dengan sudo ..."
    if ! sudo cp -a "$XDIR"/. . 2>/dev/null; then
      echo "[$(TS)] GAGAL menyalin bahkan dengan sudo. Periksa izin folder secara manual."
      rm -rf "$XDIR"
      exit 0
    fi
    sudo chown -R "$ME_UID:$GRP_GID" . 2>/dev/null || true
  fi
  rm -rf "$XDIR"
  rm -f /tmp/gak-pos-update.tar.gz

  # Sanity check: file kunci harus ada setelah ekstraksi
  if [ ! -f docker-compose.yml ] || [ ! -f frontend/build/polyfills.js ]; then
    echo "[$(TS)] PERINGATAN: file kunci tidak ditemukan setelah ekstraksi — cek arsip."
  fi

  # Re-exec memakai file skrip versi BARU (arsip membawa skrip ini juga) —
  # supaya sisa langkah tidak dijalankan oleh file yang sedang ditimpa.
  exec bash "$0" --applied "$REMOTE_VER" "$NOTIFY"
fi

# ---------- bagian umum: build, catat versi, notifikasi ----------
# --- Simpan path host untuk fitur "Update Sekarang" 1-klik (.env bisa milik root) ---
DOCKER="docker"; docker info >/dev/null 2>&1 || DOCKER="sudo docker"
SUDO=""; [ -e .env ] && [ ! -w .env ] && SUDO="sudo"
ENV_TMP="$(mktemp)"
grep -v '^HOST_PROJECT_DIR=' .env > "$ENV_TMP" 2>/dev/null || true
echo "HOST_PROJECT_DIR=$(pwd)" >> "$ENV_TMP"
$SUDO cp "$ENV_TMP" .env && rm -f "$ENV_TMP"

echo "[$(TS)] Membangun & menjalankan versi terbaru ..."
$DOCKER compose up -d --build
$DOCKER image prune -f >/dev/null 2>&1 || true

# Catat versi (file bisa jadi milik root dari update 1-klik)
VER_TMP="$(mktemp)"; echo "$REMOTE_VER" > "$VER_TMP"
SUDO2=""; [ -e "$VER_FILE" ] && [ ! -w "$VER_FILE" ] && SUDO2="sudo"
$SUDO2 cp "$VER_TMP" "$VER_FILE" && rm -f "$VER_TMP"
echo "[$(TS)] Update selesai ke $REMOTE_VER."

# --- Notifikasi WhatsApp (opsional, hanya bila nomor diberikan) ---
if [ -n "$NOTIFY" ]; then
  SECRET="$(grep -E '^WEBHOOK_CRON_SECRET=' backend/.env.docker 2>/dev/null | cut -d= -f2- | tr -d '"' | tr -d "'" | tr -d '\r')"
  if [ -n "$SECRET" ]; then
    MSG="Grand Aceh Kuliner POS: server berhasil diperbarui ke versi $REMOTE_VER pada $(TS). Aplikasi kasir akan ikut ter-update otomatis."
    echo "[$(TS)] Menunggu backend siap lalu kirim notifikasi WA ke $NOTIFY ..."
    sleep 20
    curl -s -m 30 -X POST "http://localhost/api/cron/notify" \
      -H "Authorization: Bearer $SECRET" -H "Content-Type: application/json" \
      -d "{\"to\":\"$NOTIFY\",\"message\":\"$MSG\"}" >/dev/null \
      && echo "[$(TS)] Notifikasi WA terkirim ke $NOTIFY." \
      || echo "[$(TS)] Gagal kirim notifikasi WA (cek konfigurasi wacloud.id)."
  else
    echo "[$(TS)] WEBHOOK_CRON_SECRET tidak ada di backend/.env.docker — lewati notifikasi."
  fi
fi
