#!/usr/bin/env bash
set -e
# Install Grand Aceh POS LANGSUNG dari Google AI Studio.
BASE_URL="${AISTUDIO_URL:-https://ais-dev-pweobuimlhj7oohblibyuh-754954417035.asia-southeast1.run.app}"
APP_DIR="${APP_DIR:-$HOME/grand-aceh-pos}"

echo "=== Bootstrap Grand Aceh POS (Raspberry Pi / Google AI Studio) ==="
echo "Sumber : $BASE_URL"
echo "Folder : $APP_DIR"
echo

# 1. Docker
if ! command -v docker >/dev/null 2>&1; then
  echo "Memasang Docker (butuh internet)..."
  curl -fsSL https://get.docker.com | sh
  sudo usermod -aG docker "$USER" 2>/dev/null || true
  sudo systemctl enable docker 2>/dev/null || true
  echo "[OK] Docker terpasang."
fi

# 2. Unduh kode terbaru dari Google AI Studio
mkdir -p "$APP_DIR"
echo "Mengunduh kode dari Google AI Studio..."
curl -fsSL -o /tmp/pos-grand.tar.gz "$BASE_URL/pos-grand.tar.gz"
tar xzf /tmp/pos-grand.tar.gz -C "$APP_DIR"
rm -f /tmp/pos-grand.tar.gz

# 3. Jalankan installer
cd "$APP_DIR"
chmod +x install-pi.sh update-aistudio-pi.sh update-pi.sh restart-pi.sh backup-pi.sh restore-pi.sh setup-autobackup-pi.sh setup-autoupdate-pi.sh backup-to-cloud.sh 2>/dev/null || true
echo "Menjalankan installer..."
sudo ./install-pi.sh
