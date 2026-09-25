#!/bin/bash
set -e

echo "========================================================"
echo "    MEMULAI SETUP GRAND POS DI RASPBERRY PI (RINGAN)"
echo "========================================================"

# 1. Update sistem & Install Node.js
echo "[1/4] Menginstal Node.js runtime..."
sudo apt-get update
sudo apt-get install -y curl git
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# 2. Install Tailscale
echo "[2/4] Menginstal Tailscale VPN..."
if ! command -v tailscale >/dev/null 2>&1; then
  curl -fsSL https://tailscale.com/install.sh | sh
fi
sudo tailscale up --accept-dns=true

# 3. Download / Setup POS App
echo "[3/4] Mengunduh dependencies aplikasi POS..."
npm install --production

# 4. Buat Autostart Systemd Service (Otomatis nyala saat Raspberry Pi dinyalakan)
echo "[4/4] Membuat service background otomatis (systemd)..."
sudo bash -c "cat << 'EOF' > /etc/systemd/system/grandpos.service
[Unit]
Description=Grand POS Client Raspberry Pi
After=network.target

[Service]
Type=simple
User=$USER
WorkingDirectory=$(pwd)
ExecStart=/usr/bin/npm start
Restart=always
RestartSec=10
Environment=PORT=3000
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF"

sudo systemctl daemon-reload
sudo systemctl enable grandpos
sudo systemctl start grandpos

echo "========================================================"
echo " SUKSES! Grand POS di Raspberry Pi sudah aktif otomatis."
echo " Akses POS di browser: http://localhost:3000"
echo " IP Tailscale Pi: $(tailscale ip -4)"
echo "========================================================"
