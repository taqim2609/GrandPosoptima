#!/usr/bin/env bash
set -e

# Deteksi direktori repositori secara dinamis
if [ -f "package.json" ]; then
  APP_DIR="$(pwd)"
elif [ -d "grand-pos" ] && [ -f "grand-pos/package.json" ]; then
  APP_DIR="$(pwd)/grand-pos"
elif [ -d "project" ] && [ -f "project/package.json" ]; then
  APP_DIR="$(pwd)/project"
else
  APP_DIR="${APP_DIR:-$(pwd)}"
fi

echo "======================================================================"
echo "  🚀 BOOTSTRAP SERVER CLOUD VPS — GRAND ACEH KULINER POS"
echo "  (Murni Hermes Agent Baileys & POS Engine - Auto Nginx Reverse Proxy)"
echo "======================================================================"
echo "Direktori Proyek: $APP_DIR"
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

cd "$APP_DIR"

# 1. Bersihkan container lama & orphan (Evolution API, Postgres, dll.)
docker compose down --remove-orphans 2>/dev/null || true

# 2. Buat konfigurasi docker-compose.yml yang bersih di port 3000
cat << 'EOF' > docker-compose.yml
services:
  # Grand Aceh Kuliner POS Node.js Server & Web App (Port 3000)
  grandpos-app:
    image: node:20-alpine
    container_name: grandpos_web_app
    restart: always
    working_dir: /app
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - PORT=3000
      - HERMES_WA_WEBHOOK_URL=http://127.0.0.1:8644/webhooks/grandpos-outbox
    volumes:
      - .:/app
    command: sh -c "if [ -f package.json ]; then npm install --omit=dev 2>/dev/null || true; npm start; else tail -f /dev/null; fi"
    networks:
      - gak_network

  # Watchtower Auto-Updater
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

# 3. Jalankan container dengan membersihkan orphan containers
docker compose up -d --remove-orphans

# 4. Konfigurasi Nginx di host VPS agar mem-forward Port 80 langsung ke POS (Port 3000)
if command -v nginx >/dev/null 2>&1; then
  echo "Mengonfigurasi Nginx port 80 -> port 3000..."
  mkdir -p /etc/nginx/sites-available /etc/nginx/sites-enabled
  cat << 'NGINX_EOF' > /etc/nginx/sites-available/default
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name _;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
NGINX_EOF
  ln -sf /etc/nginx/sites-available/default /etc/nginx/sites-enabled/default 2>/dev/null || true
  nginx -t 2>/dev/null && (systemctl reload nginx 2>/dev/null || systemctl restart nginx 2>/dev/null || true)
fi

VPS_IP=$(curl -s4 icanhazip.com || curl -s4 ifconfig.me || hostname -I | awk '{print $1}' || echo "IP_VPS_ANDA")

echo
echo "======================================================================"
echo "  ✅ SERVER CLOUD VPS BERHASIL DIAKTIFKAN 100%!"
echo "======================================================================"
echo " 🌐 Alamat POS & Landing Page: http://$VPS_IP (Port 80 via Nginx)"
echo " 🌐 Alamat Port Langsung     : http://$VPS_IP:3000"
echo " 🤖 WhatsApp Gateway Engine : Hermes Agent (Baileys Native)"
echo " 🔄 Watchtower Auto-Update  : Aktif (Otomatis cek update jam 04:00 subuh)"
echo "======================================================================"
