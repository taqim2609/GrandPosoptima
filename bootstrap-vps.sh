#!/usr/bin/env bash
set -e
APP_DIR="${APP_DIR:-$HOME/grand-aceh-vps}"
EVO_KEY="${EVOLUTION_API_KEY:-GrandAcehSecretKey2026}"
PORT_EVO="${PORT_EVO:-8080}"
PORT_N8N="${PORT_N8N:-5678}"

mkdir -p "$APP_DIR"
cd "$APP_DIR"

cat << 'EOF' > docker-compose.yml
services:
  # Database PostgreSQL untuk Session WhatsApp yang Awet & Stabil
  postgres:
    image: postgres:15-alpine
    container_name: gak_postgres
    restart: always
    environment:
      - POSTGRES_USER=evolution
      - POSTGRES_PASSWORD=GrandAcehSecretDB2026
      - POSTGRES_DB=evolution
    volumes:
      - postgres_data:/var/lib/postgresql/data
    networks:
      - gak_network

  # 1. WhatsApp Evolution API Gateway
  evolution-api:
    image: evoapicloud/evolution-api:latest
    container_name: gak_evolution_api
    restart: always
    depends_on:
      - postgres
    ports:
      - "8080:8080"
    environment:
      - SERVER_URL=http://localhost:8080
      - AUTHENTICATION_API_KEY=GrandAcehSecretKey2026
      - DATABASE_ENABLED=true
      - DATABASE_PROVIDER=postgresql
      - DATABASE_CONNECTION_URI=postgresql://evolution:GrandAcehSecretDB2026@postgres:5432/evolution?schema=public
      - DATABASE_CONNECTION_CLIENT_NAME=evolution_v2
      - DATABASE_SAVE_DATA_INSTANCE=true
      - DATABASE_SAVE_DATA_NEW_MESSAGE=true
      - DATABASE_SAVE_MESSAGE_UPDATE=true
      - DATABASE_SAVE_DATA_CONTACTS=true
      - DATABASE_SAVE_DATA_CHATS=true
      - CACHE_REDIS_ENABLED=false
      - QRCODE_LIMIT=30
      - LOG_LEVEL=ERROR,WARN,INFO
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
      - N8N_SECURE_COOKIE=false
      - NODE_ENV=production
      - WEBHOOK_URL=http://localhost:5678/
      - GENERIC_TIMEZONE=Asia/Jakarta
      - TZ=Asia/Jakarta
    volumes:
      - n8n_data:/home/node/.n8n
    networks:
      - gak_network

  # 3. Watchtower Auto-Updater
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

volumes:
  postgres_data:
  evolution_instances:
  evolution_store:
  n8n_data:

networks:
  gak_network:
    driver: bridge
EOF

docker compose down 2>/dev/null || true
docker compose pull
docker compose up -d

VPS_IP=$(curl -s4 icanhazip.com || curl -s4 ifconfig.me || echo "IP_VPS_ANDA")

echo "======================================================================"
echo "  ✅ SERVER CLOUD VPS BERHASIL DIAKTIFKAN 100%!"
echo "  🌐 Alamat IP VPS Anda     : http://$VPS_IP"
echo "  📱 Evolution API (WA)     : http://$VPS_IP:8080"
echo "  🔑 API Key Evolution      : $EVO_KEY"
echo "  ⚙️ n8n Automation Web     : http://$VPS_IP:5678"
echo "======================================================================"
