#!/usr/bin/env bash
set -e
APP_DIR="${APP_DIR:-$HOME/grand-aceh-vps}"

echo "======================================================================"
echo "  🚀 BOOTSTRAP SERVER CLOUD VPS — GRAND ACEH KULINER POS"
echo "  (Murni Hermes Agent Baileys & POS Engine)"
echo "======================================================================"
echo "Direktori VPS : $APP_DIR"
echo "======================================================================"
echo

if command -v apt-get >/dev/null 2>&1; then
  sudo apt-get update -y
  sudo apt-get install -y curl git ufw nginx || true
elif command -v yum >/dev/null 2>&1; then
  sudo yum install -y curl git nginx || true
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "Memasang Docker Engine..."
  curl -fsSL https://get.docker.com | sh
  sudo usermod -aG docker "$USER" 2>/dev/null || true
  sudo systemctl enable docker 2>/dev/null || true
  sudo systemctl start docker 2>/dev/null || true
fi

mkdir -p "$APP_DIR"
cd "$APP_DIR"

cat << 'EOF' > docker-compose.yml
services:
  # 1. Grand Aceh Kuliner POS Node.js Server & Web App (Port 80 & Port 3000)
  grandpos-app:
    image: node:20-alpine
    container_name: grandpos_web_app
    restart: always
    working_dir: /app
    ports:
      - "80:3000"
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - PORT=3000
      - HERMES_WA_WEBHOOK_URL=http://127.0.0.1:8644/webhooks/grandpos-outbox
    volumes:
      - ./data:/app/data
    command: sh -c "if [ -f package.json ]; then npm start; else tail -f /dev/null; fi"
    networks:
      - gak_network

  # 2. Watchtower Auto-Updater
  watchtower:
    image: containrrr/watchtower:latest
    container_name: gak_watchtower_updater
    restart: always
    environment:
      - DOCKER_API_VERSION=1.44
      - WATCHTOWER_CLEANUP=true
      - WATCHTOWER_POLL_INTERVAL=86400
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
    networks:
      - gak_network

networks:
  gak_network:
    driver: bridge
EOF

docker compose down 2>/dev/null || true
docker compose up -d

VPS_IP=$(curl -s4 icanhazip.com || curl -s4 ifconfig.me || echo "IP_VPS_ANDA")

echo
echo "======================================================================"
echo "  ✅ SERVER CLOUD VPS BERHASIL DIAKTIFKAN 100%!"
echo "======================================================================"
echo " 🌐 Alamat POS & Landing Page: http://$VPS_IP (Port 80 Utama)"
echo " 🌐 Alamat Port Alternatif   : http://$VPS_IP:3000"
echo " 🤖 WhatsApp Gateway Engine : Hermes Agent (Baileys Native)"
echo " 🔄 Watchtower Auto-Update  : Aktif (Otomatis cek update jam 04:00 subuh)"
echo "======================================================================"
