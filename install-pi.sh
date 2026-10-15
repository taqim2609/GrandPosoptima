#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"

# Jika dijalankan dari root repositori, otomatis masuk ke subdirektori project
if [ -d "project" ] && [ -f "project/docker-compose.yml" ]; then
  echo "[INFO] Menjalankan installer dari direktori project/ ..."
  cd project
fi

echo "============================================"
echo "  Grand Aceh Kuliner POS - Installer Pi/Linux"
echo "============================================"
echo

if ! command -v docker >/dev/null 2>&1; then
  echo "[ERROR] Docker belum terpasang. Pasang dulu:"
  echo "  curl -fsSL https://get.docker.com | sh"
  echo "Lalu jalankan ulang skrip ini."
  exit 1
fi

# Raspberry Pi / ARM -> MongoDB 4.4 (versi terbaru tidak jalan di CPU Pi)
if [ ! -f .env ]; then
  ARCH="$(uname -m)"
  case "$ARCH" in
    aarch64|armv7l|armv8*)
      echo "MONGO_IMAGE=mongo:4.4" > .env
      echo "[OK] Terdeteksi ARM ($ARCH) -> memakai mongo:4.4"
      ;;
  esac
fi

NEEDS_EDIT=0
if [ ! -f backend/.env.docker ]; then
  if [ -f backend/.env.docker.example ]; then
    cp backend/.env.docker.example backend/.env.docker
    echo "[OK] Dibuat file backend/.env.docker"
  fi
fi

# Buat JWT_SECRET acak otomatis bila masih placeholder
if [ -f backend/.env.docker ] && grep -q "GANTI_DENGAN_ACAK" backend/.env.docker; then
  RAND_SECRET=$(openssl rand -hex 32 2>/dev/null || date +%s%N | sha256sum | awk '{print $1}')
  sed -i "s/GANTI_DENGAN_ACAK_MINIMAL_32_KARAKTER/$RAND_SECRET/" backend/.env.docker 2>/dev/null || true
  sed -i "s/GANTI_DENGAN_ACAK/$RAND_SECRET/" backend/.env.docker 2>/dev/null || true
  echo "[OK] JWT_SECRET diisi secara otomatis dengan kunci acak aman."
fi

# Simpan path host untuk fitur "Update Sekarang" 1-klik dari aplikasi
touch .env
grep -v '^HOST_PROJECT_DIR=' .env > .env.tmp 2>/dev/null || true
echo "HOST_PROJECT_DIR=$(pwd)" >> .env.tmp
mv .env.tmp .env

echo
echo "Membangun & menjalankan... (unduhan pertama bisa memakan waktu)"
docker compose up -d --build

# Perbaiki izin agar update 1-klik di browser & update otomatis bebas dari kendala sudo
TARGET_USER="${SUDO_USER:-$USER}"
if [ -n "$TARGET_USER" ] && [ "$TARGET_USER" != "root" ]; then
  usermod -aG docker "$TARGET_USER" 2>/dev/null || true
  chown -R "$TARGET_USER:$TARGET_USER" "$(pwd)" 2>/dev/null || true
fi
chmod 666 /var/run/docker.sock 2>/dev/null || true
chmod +x *.sh 2>/dev/null || true

echo
echo "================= SELESAI ================="
IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
echo "Buka di browser:   http://${IP:-IP-KOMPUTER-INI}"
echo "==========================================="
