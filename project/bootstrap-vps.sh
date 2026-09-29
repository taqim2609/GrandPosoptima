#!/usr/bin/env bash
set -e
# ==============================================================================
# 🚀 1-Click Bootstrap Server Cloud VPS — Grand Aceh Kuliner POS
# (Menyiapkan Docker, Evolution API v2, n8n Automation & Watchtower Auto-Updater)
# ==============================================================================
APP_DIR="${APP_DIR:-$HOME/grand-aceh-vps}"
EVO_KEY="${EVOLUTION_API_KEY:-GrandAcehSecretKey2026}"
PORT_EVO="${PORT_EVO:-8080}"
PORT_N8N="${PORT_N8N:-5678}"

echo "======================================================================"
echo "  🚀 BOOTSTRAP SERVER CLOUD VPS — GRAND ACEH KULINER"
echo "======================================================================"
echo "Direktori VPS : $APP_DIR"
echo "Evolution Port: $PORT_EVO"
echo "n8n Port      : $PORT_N8N"
echo "API Key       : $EVO_KEY"
echo "======================================================================"
echo

# 1. Update sistem & pasang curl git jika belum ada
echo "[1/4] Memeriksa paket dasar Linux (curl, git, ufw)..."
if command -v apt-get >/dev/null 2>&1; then
  sudo apt-get update -y
  sudo apt-get install -y curl git ufw
elif command -v yum >/dev/null 2>&1; then
  sudo yum install -y curl git
fi

# 2. Pasang Docker & Docker Compose Plugin jika belum ada
echo "[2/4] Memeriksa Docker Engine & Docker Compose..."
if ! command -v docker >/dev/null 2>&1; then
  echo "Memasang Docker Engine..."
  curl -fsSL https://get.docker.com | sh
  sudo usermod -aG docker "$USER" 2>/dev/null || true
  sudo systemctl enable docker 2>/dev/null || true
  sudo systemctl start docker 2>/dev/null || true
  echo "[OK] Docker berhasil dipasang."
fi

# 3. Buat Folder & File docker-compose.yml
echo "[3/4] Menyiapkan konfigurasi container microservices (docker-compose.yml)..."
mkdir -p "$APP_DIR"
cd "$APP_DIR"

cat << 'EOF' > docker-compose.yml
version: "3.8"

services:
  # 1. Evolution API (WhatsApp Gateway 24/7)
  evolution-api:
    image: atendai/evolution-api:v2.1.2
    container_name: gak_evolution_api
    restart: always
    ports:
      - "8080:8080"
    environment:
      - SERVER_URL=http://localhost:8080
      - AUTHENTICATION_API_KEY=GrandAcehSecretKey2026
      - LOG_LEVEL=ERROR,WARN,INFO
      - DATABASE_PROVIDER=local
      - DATABASE_SAVE_DATA_INSTANCE=true
      - QRCODE_LIMIT=30
      - SESSION_SECRET_KEY=grandacehsecretkey2026
      - WEBSOCKET_ENABLED=true
    volumes:
      - evolution_instances:/evolution/instances
      - evolution_store:/evolution/store
    networks:
      - gak_network

  # 2. n8n Workflow Automation Engine
  n8n:
    image: n8nio/n8n:latest
    container_name: gak_n8n_automation
    restart: always
    ports:
      - "5678:5678"
    environment:
      - N8N_HOST=0.0.0.0
      - N8N_PORT=5678
      - N8N_PROTOCOL=http
      - NODE_ENV=production
      - WEBHOOK_URL=http://localhost:5678/
      - GENERIC_TIMEZONE=Asia/Jakarta
      - TZ=Asia/Jakarta
    volumes:
      - n8n_data:/home/node/.n8n
    networks:
      - gak_network

  # 3. Watchtower (Auto-Update Container Otomatis Setiap Hari)
  watchtower:
    image: containrrr/watchtower
    container_name: gak_watchtower_updater
    restart: always
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
    command: --interval 86400 --cleanup --schedule "0 0 4 * * *"
    networks:
      - gak_network

volumes:
  evolution_instances:
  evolution_store:
  n8n_data:

networks:
  gak_network:
    driver: bridge
EOF

# 4. Jalankan Container Docker
echo "[4/4] Menjalankan service di latar belakang (docker compose up -d)..."
docker compose down 2>/dev/null || true
docker compose up -d

# Ambil IP Publik VPS
VPS_IP=$(curl -s4 icanhazip.com || curl -s4 ifconfig.me || echo "IP_VPS_ANDA")

echo
echo "======================================================================"
echo "  ✅ INSTALASI SERVER CLOUD VPS BERHASIL 100%!"
echo "======================================================================"
echo " 🌐 Alamat IP VPS Anda     : http://$VPS_IP"
echo " 📱 Evolution API (WA)     : http://$VPS_IP:8080"
echo " 🔑 API Key Evolution      : $EVO_KEY"
echo " ⚙️ n8n Automation Web     : http://$VPS_IP:5678"
echo " 🔄 Watchtower Auto-Update : Aktif (Otomatis cek update jam 04:00 subuh)"
echo "======================================================================"
echo " Silakan masukkan http://$VPS_IP:8080 dan API Key di menu Pengaturan WhatsApp POS!"
echo "======================================================================"
