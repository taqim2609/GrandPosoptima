#!/usr/bin/env bash
# ============================================================
# Perbaikan Izin (Bebas Sudo) Grand Aceh Kuliner POS di Pi
# ============================================================
set -e
cd "$(dirname "$0")"

TARGET_USER="${SUDO_USER:-$USER}"
[ -z "$TARGET_USER" ] && TARGET_USER="pi"

echo "=== Memperbaiki Izin Grand Aceh POS untuk user: $TARGET_USER ==="

# 1. Tambahkan user ke grup docker agar tidak butuh sudo
if command -v docker >/dev/null 2>&1; then
  sudo usermod -aG docker "$TARGET_USER" 2>/dev/null || true
  sudo chmod 666 /var/run/docker.sock 2>/dev/null || true
  echo "[OK] User '$TARGET_USER' telah dimasukkan ke grup docker."
fi

# 2. Kembalikan kepemilikan folder proyek ke user biasa (bukan root)
DIR="$(pwd)"
sudo chown -R "$TARGET_USER:$TARGET_USER" "$DIR" 2>/dev/null || true
sudo chmod -R u+rwX "$DIR" 2>/dev/null || true

# 3. Pastikan skrip shell executable
chmod +x *.sh 2>/dev/null || true

echo
echo "============================================================"
echo "  Izin Berhasil Diperbaiki! Anda sekarang BEBAS SUDO."
echo "============================================================"
echo "Mulai sekarang, update 1-klik dan skrip update dapat berjalan"
echo "langsung tanpa perlu password atau sudo."
echo
echo "Tips: Jika di terminal masih muncul pesan docker permission,"
echo "cukup ketik: newgrp docker  (atau reboot Pi sekali)."
echo "============================================================"
