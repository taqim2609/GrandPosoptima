#!/usr/bin/env bash
set -e
# ==============================================================================
# Bootstrap Grand Aceh POS untuk Raspberry Pi (Berbasis GitHub Repositori)
# ==============================================================================
REPO_URL="${GITHUB_REPO_URL:-https://github.com/taqim2609/GrandPosoptima.git}"
APP_DIR="${APP_DIR:-$HOME/grand-pos}"

echo "======================================================================"
echo "  🍓 BOOTSTRAP GRAND ACEH POS — RASPBERRY PI (ARM ENGINE)"
echo "======================================================================"
echo "Sumber GitHub : $REPO_URL"
echo "Folder Tujuan : $APP_DIR"
echo

# 1. Pasang Git dan Docker jika belum ada
if command -v apt-get >/dev/null 2>&1; then
  sudo apt-get update -y
  sudo apt-get install -y git curl || true
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "Memasang Docker Engine untuk ARM/Raspberry Pi..."
  curl -fsSL https://get.docker.com | sh
  sudo usermod -aG docker "$USER" 2>/dev/null || true
  sudo systemctl enable docker 2>/dev/null || true
  echo "[OK] Docker terpasang."
fi

# 2. Unduh/Clone repositori langsung dari GitHub
if [ -d "$APP_DIR/.git" ]; then
  echo "Folder proyek sudah ada, menarik pembaruan terbaru dari GitHub..."
  cd "$APP_DIR" && git pull --ff-only || true
else
  echo "Melakukan git clone dari GitHub..."
  git clone "$REPO_URL" "$APP_DIR" || {
    if [ -d "$(dirname "$0")/project" ]; then
      mkdir -p "$APP_DIR"
      cp -r "$(dirname "$0")"/* "$APP_DIR/" 2>/dev/null || true
    fi
  }
fi

# 3. Jalankan installer Raspberry Pi
cd "$APP_DIR"
chmod +x install-pi.sh update-pi.sh setup-autoupdate-pi.sh 2>/dev/null || true
echo "Menjalankan installer Raspberry Pi..."
./install-pi.sh
