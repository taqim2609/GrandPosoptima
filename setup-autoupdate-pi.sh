#!/usr/bin/env bash
# ============================================================
# Setup Auto-Update Otomatis Grand Aceh Kuliner POS (Pi/Linux)
# ============================================================
set -e
cd "$(dirname "$0")"
DIR="$(pwd)"
mkdir -p logs

chmod +x update-pi.sh 2>/dev/null || true

# Jadwal default: Setiap hari pukul 03:30 dini hari (Waktu sepi transaksi)
# Skrip menarik pembaruan terbaru dari Git, lalu rebuild & restart otomatis.
CRON_SCHEDULE="${1:-30 3 * * *}"

CRON_CMD="$CRON_SCHEDULE cd $DIR && ./update-pi.sh >> $DIR/logs/autoupdate.log 2>&1"

( crontab -l 2>/dev/null | grep -v 'update-aistudio-pi.sh' | grep -v 'update-vibecoder-pi.sh' | grep -v 'update-pi.sh' ; echo "$CRON_CMD" ) | crontab -

echo "============================================================"
echo "  UPDATE OTOMATIS BERHASIL DIAKTIFKAN!"
echo "============================================================"
echo "Jadwal       : Setiap hari pukul 03:30 dini hari"
echo "Sumber       : Git / GitHub"
echo "Log File     : $DIR/logs/autoupdate.log"
echo "Lihat Jadwal : crontab -l"
echo "Ubah/Matikan : crontab -e (hapus baris update-pi.sh)"
echo "============================================================"
