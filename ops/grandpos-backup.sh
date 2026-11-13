#!/bin/sh
# pg_dump -Fc harian untuk database GrandPOS, dengan retensi.
# Read-only terhadap database produksi: hanya SELECT lewat pg_dump.
set -eu

CONTAINER=${CONTAINER:-grandpos-db-1}
DEST=${DEST:-/root/backups/grandpos}
KEEP_DAYS=${KEEP_DAYS:-14}
LOG_FILE=${LOG_FILE:-/var/log/grandpos-backup.log}

log() { printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" >>"$LOG_FILE"; }

mkdir -p "$DEST"
stamp=$(date -u +%Y%m%dT%H%M%SZ)
target="$DEST/grandpos-$stamp.dump"

# Kredensial diambil dari environment container, tidak pernah dicetak.
if docker exec "$CONTAINER" sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc -f /tmp/gp.dump' >/dev/null 2>&1; then
  docker cp "$CONTAINER:/tmp/gp.dump" "$target" >/dev/null
  docker exec "$CONTAINER" rm -f /tmp/gp.dump >/dev/null 2>&1 || true
else
  log "FAIL: pg_dump gagal di container $CONTAINER"
  exit 1
fi

# Dump yang tidak bisa dibaca sama saja tidak punya backup.
# Divalidasi dengan image postgres:16 (sama dengan server); pg_restore host bisa
# lebih tua (15.x) dan menolak dump 16.x.
if ! docker run --rm -v "$target:/tmp/gp.dump:ro" postgres:16-alpine pg_restore -l /tmp/gp.dump >/dev/null 2>&1; then
  log "FAIL: dump $target tidak lolos pg_restore -l"
  rm -f "$target"
  exit 1
fi

size=$(stat -c %s "$target")
log "ok: $target (${size} bytes)"

# Retensi: hanya menghapus dump di DEST, bukan direktori lain di /root/backups.
find "$DEST" -maxdepth 1 -name 'grandpos-*.dump' -type f -mtime "+$KEEP_DAYS" -delete 2>/dev/null || true
log "retention: dump lebih tua dari ${KEEP_DAYS} hari dihapus"
