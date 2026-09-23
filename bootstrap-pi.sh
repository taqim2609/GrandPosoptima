#!/usr/bin/env bash
set -e
# ==============================================================================
# Bootstrap Grand Aceh POS untuk Raspberry Pi (Tersinkron dengan Server Google)
# ==============================================================================
BASE_URL="${AISTUDIO_URL:-https://ais-pre-pweobuimlhj7oohblibyuh-754954417035.asia-southeast1.run.app}"
APP_DIR="${APP_DIR:-$HOME/grand-aceh-pos}"

echo "======================================================================"
echo "  🍓 BOOTSTRAP GRAND ACEH POS — RASPBERRY PI (ARM ENGINE)"
echo "======================================================================"
echo "Sumber Cloud : $BASE_URL"
echo "Folder Tujuan: $APP_DIR"
echo

# 1. Pasang Docker jika belum ada
if ! command -v docker >/dev/null 2>&1; then
  echo "Memasang Docker Engine untuk ARM/Raspberry Pi..."
  curl -fsSL https://get.docker.com | sh
  sudo usermod -aG docker "$USER" 2>/dev/null || true
  sudo systemctl enable docker 2>/dev/null || true
  echo "[OK] Docker terpasang."
fi

# 2. Unduh paket terbaru dari Google AI Studio / Cloud
mkdir -p "$APP_DIR"
echo "Mengunduh paket aplikasi dari server Google Cloud..."
if curl -fsSL -o /tmp/pos-grand.tar.gz "$BASE_URL/pos-grand.tar.gz" 2>/dev/null; then
  tar xzf /tmp/pos-grand.tar.gz -C "$APP_DIR"
  rm -f /tmp/pos-grand.tar.gz
elif [ -d "$(dirname "$0")/project" ]; then
  cp -r "$(dirname "$0")"/* "$APP_DIR/" 2>/dev/null || true
fi

# 3. Jalankan installer Raspberry Pi
cd "$APP_DIR"
chmod +x install-pi.sh update-pi.sh setup-autoupdate-pi.sh 2>/dev/null || true
echo "Menjalankan installer Raspberry Pi..."
./install-pi.sh
