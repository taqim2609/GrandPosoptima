#!/usr/bin/env bash
# ==============================================================================
# Grand Aceh Kuliner POS — Setup Raspberry Pi sebagai Client POS Kasir
# Menghubungkan Pi ke PC Master Server & Evolution API via Tailscale
# ==============================================================================
set -e

echo "======================================================================"
echo "  GRAND ACEH KULINER POS - SETUP RASPBERRY PI (POS CLIENT KASIR)"
echo "  Peran: Terminal Kasir Layar Sentuh & Printer Kasir Lokal"
echo "  Server Utama & Evolution API berada di Komputer PC via Tailscale"
echo "======================================================================"
echo

# 1. Pasang & Aktifkan Tailscale
echo "==> [1/4] Memeriksa & Memasang Tailscale di Raspberry Pi..."
if ! command -v tailscale >/dev/null 2>&1; then
    curl -fsSL https://tailscale.com/install.sh | sh
fi

echo "    Menghubungkan ke Tailscale..."
sudo tailscale up --hostname=grandpos-pi-kasir

PI_IP=$(tailscale ip -4 | head -n1 || echo "")
echo "    [OK] IP Tailscale Raspberry Pi Anda: $PI_IP"
echo

# 2. Input IP Tailscale PC Master
echo "==> [2/4] Masukkan Alamat IP Tailscale PC Master Server Anda"
echo "    (Bisa dilihat di layar PC setelah menjalankan setup-pc-master.bat / .sh)"
read -p "    IP Tailscale PC Master (contoh: 100.80.10.1): " MASTER_IP

if [ -z "$MASTER_IP" ]; then
    MASTER_IP="grandpos-pc-master"
    echo "    Menggunakan default hostname MagicDNS: $MASTER_IP"
fi

# 3. Buat Skrip Kiosk Browser Otomatis
echo "==> [3/4] Menyiapkan Shortcut & Autostart Kiosk Kasir..."
mkdir -p "$HOME/.config/autostart"

cat <<EOF > "$HOME/start-pos-kiosk.sh"
#!/bin/bash
# Menunggu jaringan Tailscale siap
sleep 5
# Nonaktifkan screen saver & sleep di layar kasir
xset s off 2>/dev/null || true
xset -dpms 2>/dev/null || true
xset s noblank 2>/dev/null || true

# Buka Chromium dalam mode Kiosk Kasir mengarah ke PC Master
if command -v chromium-browser >/dev/null 2>&1; then
    chromium-browser --noerrdialogs --disable-infobars --kiosk --incognito "http://${MASTER_IP}/pos"
elif command -v chromium >/dev/null 2>&1; then
    chromium --noerrdialogs --disable-infobars --kiosk --incognito "http://${MASTER_IP}/pos"
else
    echo "Browser Chromium belum terpasang. Jalankan: sudo apt-get install -y chromium-browser"
fi
EOF

chmod +x "$HOME/start-pos-kiosk.sh"

# Autostart Desktop
cat <<EOF > "$HOME/.config/autostart/grandpos.desktop"
[Desktop Entry]
Type=Application
Name=Grand POS Kasir
Exec=$HOME/start-pos-kiosk.sh
X-GNOME-Autostart-enabled=true
EOF

# Shortcut di Desktop
mkdir -p "$HOME/Desktop"
cat <<EOF > "$HOME/Desktop/Buka POS Kasir.desktop"
[Desktop Entry]
Type=Application
Name=Buka POS Kasir (PC Master)
Exec=$HOME/start-pos-kiosk.sh
Icon=utilities-terminal
Terminal=false
EOF
chmod +x "$HOME/Desktop/Buka POS Kasir.desktop" 2>/dev/null || true

echo
echo "======================================================================"
echo "  SETUP RASPBERRY PI CLIENT SELESAI!"
echo "======================================================================"
echo "  - Terminal Kasir ini terhubung ke PC Master di: http://${MASTER_IP}"
echo "  - WhatsApp Evolution API dikelola langsung di PC Master"
echo "  - Untuk membuka kasir sekarang, jalankan: ~/start-pos-kiosk.sh"
echo "  - Setiap kali Raspberry Pi dinyalakan, POS kasir akan terbuka otomatis!"
echo "======================================================================"
echo
