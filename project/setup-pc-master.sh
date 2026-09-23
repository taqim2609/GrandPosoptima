#!/usr/bin/env bash
# ==============================================================================
# Grand Aceh Kuliner POS — Setup PC Master Server (Linux / Ubuntu / Debian)
# Menjalankan Server POS, Database MongoDB, & Evolution API WhatsApp via Tailscale
# ==============================================================================
set -e

echo "======================================================================"
echo "  GRAND ACEH KULINER POS - SETUP PC MASTER SERVER (TAILSCALE)"
echo "======================================================================"
echo

# 1. Cek & Pasang Tailscale
echo "==> [1/4] Memeriksa status Tailscale..."
if ! command -v tailscale >/dev/null 2>&1; then
    echo "    Menginstall Tailscale..."
    curl -fsSL https://tailscale.com/install.sh | sh
    sudo tailscale up --hostname=grandpos-pc-master
else
    echo "    Tailscale sudah terpasang."
    sudo tailscale up --hostname=grandpos-pc-master || true
fi

PC_IP=$(tailscale ip -4 | head -n1 || echo "")
if [ -z "$PC_IP" ]; then
    echo "    [PENTING] Silakan login Tailscale melalui tautan yang diberikan di atas."
    exit 1
fi

echo "    [SUKSES] IP Tailscale PC Master: $PC_IP"
echo

# 2. Cek & Jalankan Docker
echo "==> [2/4] Menjalankan Server POS & Evolution API (Docker)..."
if command -v docker >/dev/null 2>&1; then
    docker compose -f docker-compose.pc-master.yml up -d
    echo "    [OK] Docker kontainer aktif!"
else
    echo "    [INFO] Docker tidak ditemukan. Menjalankan Node.js server lokal..."
    npm run build
    npm start &
fi

echo
# 3. Opsi Tailscale Serve / Funnel untuk AI Studio / Cloud
echo "==> [3/4] Konfigurasi Tailscale Serve untuk AI Studio..."
if command -v tailscale >/dev/null 2>&1; then
    echo "    Mengaktifkan Tailscale Serve untuk port 3000..."
    sudo tailscale serve --bg 3000 || true
fi

echo
echo "======================================================================"
echo "  SETUP PC MASTER SELESAI!"
echo "======================================================================"
echo "  IP Tailscale PC Master : $PC_IP"
echo "  Akses Web POS          : http://$PC_IP"
echo "  Evolution WhatsApp API : http://$PC_IP:8080"
echo "======================================================================"
echo "  Gunakan IP ($PC_IP) pada script 'setup-pi-client.sh' di Raspberry Pi!"
echo
