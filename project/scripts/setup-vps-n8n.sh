#!/usr/bin/env bash
# ==============================================================================
# Setup Automated Script untuk Deploy Grand Aceh POS + n8n 1.110.1 di Server VPS
# ==============================================================================

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${BLUE}===================================================================${NC}"
echo -e "${BLUE}  DEPLOYMENT INSTALLER: GRAND ACEH POS + N8N 1.110.1 di VPS        ${NC}"
echo -e "${BLUE}===================================================================${NC}"

if [ "$EUID" -ne 0 ]; then
  echo -e "${RED}⚠️  Harap jalankan script ini sebagai root atau dengan sudo:${NC}"
  echo -e "   sudo ./scripts/setup-vps-n8n.sh"
  exit 1
fi

# 1. Cek & Install Docker jika belum terinstall
if ! command -v docker &> /dev/null; then
  echo -e "${YELLOW}🐳 Installing Docker Engine...${NC}"
  apt-get update -y
  apt-get install -y curl ca-certificates gnupg ufw
  curl -fsSL https://get.docker.com | sh
  echo -e "${GREEN}✓ Docker berhasil diinstall!${NC}"
else
  echo -e "${GREEN}✓ Docker sudah terinstall.${NC}"
fi

# 2. Cek Docker Compose
if ! docker compose version &> /dev/null; then
  echo -e "${YELLOW}📦 Installing Docker Compose plugin...${NC}"
  apt-get install -y docker-compose-plugin
fi

# 3. Setup Firewall UFW
echo -e "${YELLOW}🛡️  Mengkonfigurasi UFW Firewall (Port 22, 80, 443, 9000)...${NC}"
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 9000/tcp
ufw --force enable
echo -e "${GREEN}✓ Firewall UFW aktif!${NC}"

# 4. Buat .env.vps jika belum ada
if [ ! -f .env.vps ]; then
  echo -e "${YELLOW}📝 Membuat file .env.vps dari .env.vps.example...${NC}"
  cp .env.vps.example .env.vps
  echo -e "${GREEN}✓ File .env.vps dibuat. Jangan lupa sesuaikan domain & password di .env.vps!${NC}"
fi

# 5. Build dan jalankan Docker Stack VPS
echo -e "${YELLOW}🚀 Memulai build & jalankan container Docker VPS (n8n v1.110.1 + Portainer)...${NC}"
docker compose -f docker-compose.vps.yml --env-file .env.vps up -d --build

echo -e "${GREEN}===================================================================${NC}"
echo -e "${GREEN}🎉 DEPLOYMENT BERHASIL DIPROSES!                                   ${NC}"
echo -e "${GREEN}===================================================================${NC}"
echo -e "Status Container:"
docker compose -f docker-compose.vps.yml ps

echo -e "\n${BLUE}Akses Service Anda:${NC}"
echo -e " 📍 POS App:        https://$(grep DOMAIN_POS .env.vps | cut -d '=' -f2)"
echo -e " 📍 n8n v1.110.1:   https://$(grep DOMAIN_N8N .env.vps | cut -d '=' -f2)"
echo -e " 📍 WhatsApp API:   https://$(grep DOMAIN_WA .env.vps | cut -d '=' -f2)"
echo -e " 📍 Portainer UI:   http://IP_VPS:9000 (Panel Manajemen Visual Docker)"
echo -e "\n${YELLOW}Gunakan 'docker compose -f docker-compose.vps.yml logs -f' untuk cek log live.${NC}"
