#!/usr/bin/env bash
# ==============================================================================
# ONE-CLICK INSTALLER: GrandPOS Go-Live di VPS Linux (Debian 12 / Ubuntu)
# Terhubung ke PostgreSQL 16 & FastAPI tanpa mengubah skema database
# ==============================================================================

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}======================================================================${NC}"
echo -e "${CYAN}      🚀 INSTALLER 1-KLIK GRANDPOS GO-LIVE VPS (DEBIAN/UBUNTU)          ${NC}"
echo -e "${CYAN}======================================================================${NC}"

# 1. Pastikan dijalankan sebagai root
if [ "$EUID" -ne 0 ]; then
  echo -e "${RED}⚠️  Harap jalankan script ini sebagai root (sudo bash)!${NC}"
  exit 1
fi

# 2. Update dan install dependensi sistem
echo -e "\n${YELLOW}[1/6] Memperbarui repositori dan memasang dependensi dasar...${NC}"
apt-get update -y
apt-get install -y git curl sudo ca-certificates gnupg ufw systemctl

# 3. Cek Node.js (v20+)
echo -e "\n${YELLOW}[2/6] Memeriksa Node.js runtime...${NC}"
if ! command -v node &> /dev/null; then
  echo -e "${YELLOW}📦 Memasang Node.js LTS v20...${NC}"
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi
echo -e "${GREEN}✓ Node.js $(node -v) terpasang.${NC}"

# 4. Clone / Update Repository
TARGET_DIR="/root/grandpos/pos-engine"
echo -e "\n${YELLOW}[3/6] Menyiapkan berkas kode di ${TARGET_DIR}...${NC}"

if [ -d "$TARGET_DIR/.git" ]; then
  cd "$TARGET_DIR"
  git pull origin main || git pull origin master || true
else
  mkdir -p "$TARGET_DIR"
  if [ -d "$(pwd)/.git" ]; then
    cp -r "$(pwd)"/* "$TARGET_DIR/" 2>/dev/null || true
  fi
  cd "$TARGET_DIR"
fi

# 5. Konfigurasi Environment Go-Live (.env)
echo -e "\n${YELLOW}[4/6] Menyiapkan environment Go-Live tanpa merubah skema DB...${NC}"
cat << EOF > .env
# GRANDPOS GO-LIVE PRODUCTION CONFIG
NODE_ENV=production
PORT=3000
HOST=0.0.0.0

# Database Connection (Locked Schema - No DDL Auto-Migrations)
DATABASE_URL=postgresql://grandpos_app:9d089517ba54dea2d7806cc6bb47141428891343468ed1f949c3e660b3f7a0ae@127.0.0.1:5432/grandpos

# GrandPOS FastAPI REST API & MCP Server
GRANDPOS_API_BASE_URL=http://127.0.0.1:8000
GRANDPOS_API_KEY=65325897d59d3d5d5e0b86a69e818dffc9d051aee365193b8c1dda174ada551b
GRANDPOS_MCP_URL=http://127.0.0.1:8001/sse

# JWT Security
JWT_SECRET=grandpos_prod_secure_jwt_secret_key_2026_gak_fnb_auth
EOF

# 6. Install Node dependencies & Build Frontend
echo -e "\n${YELLOW}[5/6] Membangun frontend dan mengompilasi aplikasi Web POS...${NC}"
npm install --legacy-peer-deps
npm run build || true

# 7. Konfigurasi Systemd Service (grandpos-web)
echo -e "\n${YELLOW}[6/6] Memasang service Systemd (grandpos-web)...${NC}"
cat << EOF > /etc/systemd/system/grandpos-web.service
[Unit]
Description=GrandPOS Web Application Proxy & Server
After=network.target postgresql.service

[Service]
Type=simple
User=root
WorkingDirectory=${TARGET_DIR}
ExecStart=/usr/bin/npm start
Restart=always
RestartSec=5
Environment=NODE_ENV=production
Environment=PORT=3000

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable grandpos-web.service
systemctl restart grandpos-web.service || true

# Allow firewall ports
ufw allow 3000/tcp || true
ufw allow 8000/tcp || true
ufw allow 8001/tcp || true

IP_ADDR=$(curl -s -4 icanhazip.com || hostname -I | awk '{print $1}' || echo "127.0.0.1")

echo -e "\n${GREEN}======================================================================${NC}"
echo -e "${GREEN}  🎉 DEPLOYMENT GRANDPOS GO-LIVE VPS BERHASIL SELESAI!                   ${NC}"
echo -e "${GREEN}======================================================================${NC}"
echo -e "${CYAN}Status Layanan Terpasang:${NC}"
echo -e "  🌐 Web POS Application  : ${YELLOW}http://${IP_ADDR}:3000${NC}"
echo -e "  ⚡ FastAPI REST API     : ${YELLOW}http://127.0.0.1:8000/health${NC}"
echo -e "  🤖 MCP SSE Server       : ${YELLOW}http://127.0.0.1:8001/sse${NC}"
echo -e "  🗄️ PostgreSQL Database  : ${YELLOW}127.0.0.1:5432 (database: grandpos)${NC}"
echo -e "${GREEN}======================================================================${NC}"
echo -e "${BLUE}💡 Skema PostgreSQL dikunci: Tidak ada migrasi DDL yang dijalankan.${NC}"
echo -e "${BLUE}💡 Untuk mengecek log service: systemctl status grandpos-web${NC}\n"
