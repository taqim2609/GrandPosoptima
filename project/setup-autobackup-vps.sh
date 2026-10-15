#!/usr/bin/env bash
# ============================================================
# Pasang backup harian Pi->VPS ke crontab VPS (idempoten).
# ============================================================
# - Satu baris penanda (# gak-pos-backup) dikelola sendiri; menjalankan skrip
#   berkali-kali tidak menumpuk entri duplikat.
# - Log ke berkas, ambul waktu, dan exit nonzero tidak menghentikan cron lain.
#
# Pemakaian:
#   ./setup-autobackup-vps.sh            # pasang (default 02:30 tiap hari)
#   ./setup-autobackup-vps.sh "45 1 * * *"
#   ./setup-autobackup-vps.sh --remove   # hapus entri
# ============================================================
set -euo pipefail

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
BACKUP_SH="$SCRIPT_DIR/backup-pi-to-vps.sh"
LOG_FILE="${GAK_BACKUP_LOG:-/var/log/gak-pos-backup.log}"
MARKER="# gak-pos-backup"
SCHEDULE="${1:-30 2 * * *}"

command -v crontab >/dev/null 2>&1 || { echo "[GAGAL] crontab tidak tersedia." >&2; exit 1; }
[ -f "$BACKUP_SH" ] || { echo "[GAGAL] $BACKUP_SH tidak ditemukan." >&2; exit 1; }
chmod +x "$BACKUP_SH"

CURRENT="$(crontab -l 2>/dev/null || true)"
CLEANED="$(printf '%s\n' "$CURRENT" | grep -v -F "$MARKER" | grep -v 'backup-pi-to-vps.sh' || true)"

if [ "$SCHEDULE" = "--remove" ]; then
  printf '%s\n' "$CLEANED" | grep -v '^$' | crontab -
  echo "Entri backup dihapus dari crontab."
  exit 0
fi

LINE="$SCHEDULE $MARKER cd $SCRIPT_DIR && ./backup-pi-to-vps.sh >> $LOG_FILE 2>&1"
{ printf '%s\n' "$CLEANED" | grep -v '^$'; printf '%s\n' "$LINE"; } | crontab -

echo "Backup harian dipasang: $SCHEDULE"
echo "Skrip : $BACKUP_SH"
echo "Log   : $LOG_FILE"
crontab -l | grep -F "$MARKER"
