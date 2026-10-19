#!/usr/bin/env bash
# ============================================================
# Backup Grand Aceh POS: Pi (produksi) -> VPS (off-site)
# ============================================================
# Sumber data: MongoDB 4.4.18 di Raspberry Pi (container produksi).
# Tujuan      : arsip .gz + .sha256 di Pi dan salinan di VPS.
#
# Prinsip keamanan:
#   - TIDAK ada token/secret/password yang di-hardcode (semua dari env).
#   - Akses Pi memakai SSH key (BatchMode) — tidak ada prompt password.
#   - mongodump dijalankan READ-ONLY lewat `docker exec` ke container produksi.
#   - Tulis ke berkas sementara lalu `mv` (atomic) — tidak ada arsip separuh jadi.
#   - SHA256 dihitung di KEDUA sisi dan harus sama, jika tidak -> exit nonzero.
#
# Pemakaian:
#   ./backup-pi-to-vps.sh              # jalankan backup
#   ./backup-pi-to-vps.sh --dry-run    # cek prasyarat + cetak rencana saja
#
# Konfigurasi (env, semuanya opsional kecuali bila prasyarat tidak terpenuhi):
#   GAK_BACKUP_SSH_TARGET   default: taqim258@grandpos
#   GAK_BACKUP_PI_DIR       default: /home/taqim258/backups
#   GAK_BACKUP_VPS_DIR      default: /root/backups
#   GAK_BACKUP_MONGO_CTR    default: grand-aceh-pos-mongo-1
#   GAK_BACKUP_DB           default: grand_aceh_pos
#   GAK_BACKUP_KEEP_DAYS    default: 14
# ============================================================
set -euo pipefail

SSH_TARGET="${GAK_BACKUP_SSH_TARGET:-taqim258@grandpos}"
PI_DIR="${GAK_BACKUP_PI_DIR:-/home/taqim258/backups}"
VPS_DIR="${GAK_BACKUP_VPS_DIR:-/root/backups}"
MONGO_CTR="${GAK_BACKUP_MONGO_CTR:-grand-aceh-pos-mongo-1}"
DB_NAME="${GAK_BACKUP_DB:-grand_aceh_pos}"
KEEP_DAYS="${GAK_BACKUP_KEEP_DAYS:-14}"

DRY_RUN=0
[ "${1:-}" = "--dry-run" ] && DRY_RUN=1

TS="$(date -u +%Y%m%dT%H%M%SZ)"
BASE="${TS}_${DB_NAME}"
PI_FILE="$PI_DIR/$BASE.gz"
SSH_OPTS=(-o BatchMode=yes -o ConnectTimeout=15 -o StrictHostKeyChecking=accept-new)

log()  { echo "[$(date -u +%H:%M:%S)] $*"; }
die()  { echo "[GAGAL] $*" >&2; exit 1; }

log "=== Backup Grand Aceh POS: Pi -> VPS ==="
log "target=$SSH_TARGET mongo=$MONGO_CTR db=$DB_NAME keep=${KEEP_DAYS}d"

# ---------- 0. prasyarat ----------
command -v ssh >/dev/null 2>&1 || die "ssh tidak ditemukan di VPS."
command -v sha256sum >/dev/null 2>&1 || die "sha256sum tidak ditemukan di VPS."

log "cek koneksi SSH + container produksi ..."
REMOTE_CTR="$(ssh "${SSH_OPTS[@]}" "$SSH_TARGET" "docker ps --format '{{.Names}}' | grep -Fx '$MONGO_CTR' || true")"
[ -n "$REMOTE_CTR" ] || die "container '$MONGO_CTR' tidak berjalan di $SSH_TARGET (atau SSH gagal)."

ssh "${SSH_OPTS[@]}" "$SSH_TARGET" "mkdir -p '$PI_DIR'"
ssh "${SSH_OPTS[@]}" "$SSH_TARGET" "test -f '$PI_DIR/.gdpr-keep-13291' || true"  # no-op: menjaga set -e ramah
mkdir -p "$VPS_DIR"

if [ "$DRY_RUN" -eq 1 ]; then
  log "[dry-run] akan membuat: $PI_FILE"
  log "[dry-run] akan menyalin   : $SSH_TARGET:$PI_FILE -> $VPS_DIR/"
  log "[dry-run] retensi         : hapus .gz/.sha256 lebih tua dari ${KEEP_DAYS} hari di kedua sisi"
  log "[dry-run] selesai tanpa mengubah apa pun."
  exit 0
fi

# ---------- 1. mongodump di Pi (read-only, lewat container) ----------
TMP_PI="$PI_DIR/.$BASE.gz.part"
log "menjalankan mongodump di Pi (via docker exec, read-only) ..."
ssh "${SSH_OPTS[@]}" "$SSH_TARGET" "set -euo pipefail
  rm -f '$TMP_PI'
  docker exec '$MONGO_CTR' mongodump --archive --gzip --db '$DB_NAME' > '$TMP_PI'
  test -s '$TMP_PI'
  mv -f '$TMP_PI' '$PI_FILE'
  sha256sum '$PI_FILE' | awk '{print \$1}' > '$PI_FILE.sha256'
"
PI_SHA="$(ssh "${SSH_OPTS[@]}" "$SSH_TARGET" "cut -d' ' -f1 '$PI_FILE.sha256'")"
PI_SIZE="$(ssh "${SSH_OPTS[@]}" "$SSH_TARGET" "stat -c%s '$PI_FILE'")"
[ -n "$PI_SHA" ] || die "checksum di Pi kosong."
log "arsip Pi: $(basename "$PI_FILE") size=${PI_SIZE}B sha256=$PI_SHA"

# ---------- 2. tarik ke VPS ----------
TMP_VPS="$VPS_DIR/.$BASE.gz.part"
log "menyalin arsip ke VPS ..."
rm -f "$TMP_VPS"
scp -q "${SSH_OPTS[@]}" "$SSH_TARGET:$PI_FILE" "$TMP_VPS" || die "scp arsip gagal."
VPS_SHA="$(sha256sum "$TMP_VPS" | awk '{print $1}')"
if [ "$VPS_SHA" != "$PI_SHA" ]; then
  rm -f "$TMP_VPS"
  die "checksum tidak cocok (Pi=$PI_SHA VPS=$VPS_SHA) — salinan VPS dibuang, arsip Pi tetap aman."
fi
mv -f "$TMP_VPS" "$VPS_DIR/$BASE.gz"
echo "$VPS_SHA  $VPS_DIR/$BASE.gz" > "$VPS_DIR/$BASE.gz.sha256"
log "verifikasi checksum OK di kedua sisi."

# ---------- 3. retensi ----------
log "membersihkan arsip lebih tua dari ${KEEP_DAYS} hari ..."
find "$VPS_DIR" -maxdepth 1 -name '*_'"$DB_NAME"'.gz'    -mtime "+$KEEP_DAYS" -delete 2>/dev/null || true
find "$VPS_DIR" -maxdepth 1 -name '*_'"$DB_NAME"'.gz.sha256' -mtime "+$KEEP_DAYS" -delete 2>/dev/null || true
ssh "${SSH_OPTS[@]}" "$SSH_TARGET" "find '$PI_DIR' -maxdepth 1 -name '*_${DB_NAME}.gz' -mtime +$KEEP_DAYS -delete 2>/dev/null || true; find '$PI_DIR' -maxdepth 1 -name '*_${DB_NAME}.gz.sha256' -mtime +$KEEP_DAYS -delete 2>/dev/null || true"

log "SELESAI. Pi: $PI_FILE | VPS: $VPS_DIR/$BASE.gz"
