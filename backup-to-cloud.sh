#!/usr/bin/env bash
# ============================================================
# Backup database lalu kirim salinan ke Google AI Studio (cadangan cloud).
# Dipakai oleh tombol "Kirim Backup" di aplikasi dan bisa dijalankan manual:
#   ./backup-to-cloud.sh
#
# Backup LOKAL selalu dibuat di backups/ (sumber utama). Salinan di
# Google AI Studio adalah cadangan TAMBAHAN.
# ============================================================
set -e
cd "$(dirname "$0")"

mkdir -p backups
TS="$(date +%Y%m%d-%H%M%S)"
FILE="backups/gak-backup-$TS.gz"
echo "=== Backup Grand Aceh POS -> Google AI Studio ==="
echo "Membuat backup database -> $FILE"
docker compose exec -T mongo sh -c 'mongodump --archive --gzip' > "$FILE"
echo "[OK] Backup lokal tersimpan: $FILE ($(du -h "$FILE" | cut -f1))"

# Token & konfigurasi (prioritas: env, lalu backend/.env.docker).
# SECURITY: tidak ada fallback token ter-hardcode. Bila token/URL belum
# dikonfigurasi, skrip berhenti dengan status bukan-nol (backup lokal tetap ada).
TOKEN="${GAK_BACKUP_TOKEN:-$(grep -E '^GAK_BACKUP_TOKEN=' backend/.env.docker 2>/dev/null | tail -1 | cut -d= -f2- | tr -d '"' | tr -d "'" | tr -d '\r')}"
PASS="${GAK_BACKUP_PASS:-$(grep -E '^GAK_BACKUP_PASS=' backend/.env.docker 2>/dev/null | tail -1 | cut -d= -f2- | tr -d '"' | tr -d "'" | tr -d '\r')}"
URL="${GAK_BACKUP_URL:-}"

if [ -z "$TOKEN" ] || [ -z "$URL" ]; then
  echo "[GAGAL] GAK_BACKUP_TOKEN dan GAK_BACKUP_URL wajib diisi (env atau backend/.env.docker)." >&2
  echo "        Backup LOKAL sudah aman di $FILE, tetapi salinan cloud tidak dikirim." >&2
  exit 1
fi

UPFILE="$FILE"
if [ -n "$PASS" ]; then
  UPFILE="$FILE.enc"
  openssl enc -aes-256-cbc -pbkdf2 -salt -pass "pass:$PASS" -in "$FILE" -out "$UPFILE"
  echo "[OK] Backup dienkripsi AES-256 -> $UPFILE"
else
  echo "[PERINGATAN] GAK_BACKUP_PASS belum diset — backup dikirim TANPA enkripsi tambahan."
fi

echo "Mengirim ke Google AI Studio ($URL) ..."
if curl -fsSL -m 300 -X POST -H "X-Gak-Token: $TOKEN" -H "Content-Type: application/octet-stream" --data-binary "@$UPFILE" "$URL"; then
  echo ""
  echo "[OK] Salinan berhasil dikirim ke Google AI Studio."
else
  echo ""
  echo "[GAGAL] Kirim ke Google AI Studio gagal (cek internet/koneksi). Backup lokal tetap aman di $FILE."
fi

# Bersihkan file enkripsi sementara (backup asli di backups/ TETAP)
[ -n "$PASS" ] && rm -f "$UPFILE" 2>/dev/null || true
# Prune backup lokal lebih dari 30 hari
find backups -name 'gak-backup-*.gz' -mtime +30 -delete 2>/dev/null || true
echo "Selesai."
