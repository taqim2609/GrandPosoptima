#!/usr/bin/env bash
# ==============================================================================
# ONE-CLICK INSTALLER: Grand Aceh POS di Debian 12 / Ubuntu VPS
# (Kompatibel dengan n8n yang sudah berjalan)
# ==============================================================================

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}======================================================================${NC}"
echo -e "${CYAN}      🚀 INSTALLER 1-KLIK GRAND ACEH KULINER POS (DEBIAN 12 / UBUNTU)  ${NC}"
echo -e "${CYAN}======================================================================${NC}"

# 1. Pastikan dijalankan sebagai root
if [ "$EUID" -ne 0 ]; then
  echo -e "${RED}⚠️  Harap jalankan script ini sebagai root!${NC}"
  exit 1
fi

# 2. Update dan install dependensi sistem dasar
echo -e "\n${YELLOW}[1/5] Memperbarui repositori dan memasang dependensi dasar...${NC}"
apt-get update -y
apt-get install -y git curl sudo ca-certificates gnupg ufw

# 3. Cek & Pasang Docker Engine jika belum ada
echo -e "\n${YELLOW}[2/5] Memeriksa instalasi Docker...${NC}"
if ! command -v docker &> /dev/null; then
  echo -e "${YELLOW}🐳 Memasang Docker Engine resmi...${NC}"
  curl -fsSL https://get.docker.com -o /tmp/get-docker.sh
  sh /tmp/get-docker.sh
  rm -f /tmp/get-docker.sh
  systemctl enable --now docker
  echo -e "${GREEN}✓ Docker Engine berhasil dipasang!${NC}"
else
  echo -e "${GREEN}✓ Docker sudah terpasang.${NC}"
fi

# 4. Clone atau update repository POS
echo -e "\n${YELLOW}[3/5] Mengunduh kode Grand Aceh POS ke /opt/grand-aceh-pos...${NC}"
TARGET_DIR="/opt/grand-aceh-pos"
REPO_URL="https://github.com/taqim2609/GrandPosoptima.git"

if [ -d "$TARGET_DIR/.git" ]; then
  echo -e "${CYAN}📁 Direktori sudah ada, memperbarui file via git pull...${NC}"
  cd "$TARGET_DIR"
  git pull origin main || git pull origin master || true
else
  mkdir -p "$TARGET_DIR"
  git clone "$REPO_URL" "$TARGET_DIR"
  cd "$TARGET_DIR"
fi

# 5. Buat file .env.vps jika belum ada
if [ ! -f .env.vps ]; then
  echo -e "${YELLOW}📝 Menyiapkan berkas konfigurasi .env.vps...${NC}"
  if [ -f .env.vps.example ]; then
    cp .env.vps.example .env.vps
  else
    cat << 'EOF' > .env.vps
DOMAIN_POS=localhost
DOMAIN_N8N=localhost:5678
DOMAIN_WA=localhost:8080
SSL_EMAIL=admin@grandpos.local
JWT_SECRET=grandpos_vps_super_secret_jwt_key_2026_auto
UVICORN_WORKERS=4
EVOLUTION_API_KEY=grandpos_evolution_secret_2026
EOF
  fi
  echo -e "${GREEN}✓ File .env.vps berhasil dibuat!${NC}"
fi

# 6. Konfigurasi Firewall UFW
echo -e "\n${YELLOW}[4/5] Mengkonfigurasi Firewall (Port 22, 80, 443, 9000, 5678)...${NC}"
ufw allow 22/tcp || true
ufw allow 80/tcp || true
ufw allow 443/tcp || true
ufw allow 9000/tcp || true
ufw allow 5678/tcp || true
ufw --force enable || true

# 7. Jalankan Docker Compose Standalone
echo -e "\n${YELLOW}[5/5] Membangun dan menjalankan container POS di VPS...${NC}"
if docker compose version &> /dev/null; then
  docker compose -f docker-compose.pos-standalone.yml --env-file .env.vps up -d --build
else
  docker-compose -f docker-compose.pos-standalone.yml --env-file .env.vps up -d --build
fi

IP_ADDR=$(curl -s -4 icanhazip.com || hostname -I | awk '{print $1}' || echo "IP_VPS_ANDA")

echo -e "\n${GREEN}======================================================================${NC}"
echo -e "${GREEN}  🎉 INSTALASI GRAND ACEH POS BERHASIL SELESAI!                        ${NC}"
echo -e "${GREEN}======================================================================${NC}"
echo -e "${CYAN}Layanan Anda sekarang aktif di:${NC}"
echo -e "  📱 Web POS Kasir      : ${YELLOW}http://${IP_ADDR}${NC}"
echo -e "  🖥️  Panel Portainer UI : ${YELLOW}http://${IP_ADDR}:9000${NC}"
echo -e "  ⚙️  n8n Automation     : ${YELLOW}http://${IP_ADDR}:5678${NC}"
echo -e "  💬 WhatsApp Gateway   : ${YELLOW}http://${IP_ADDR}:8080${NC}"
echo -e "${GREEN}======================================================================${NC}"
echo -e "${BLUE}💡 Folder proyek berada di: /opt/grand-aceh-pos${NC}"
echo -e "${BLUE}💡 Untuk melihat log container: docker ps atau buka Portainer di port 9000${NC}\n"
