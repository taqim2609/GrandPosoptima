#!/bin/sh
# Alert kalau disk hampir penuh atau dump backup sudah terlalu tua.
# Tidak punya kanal push (tidak ada platform messaging terkonfigurasi di host ini),
# jadi alarm = entri log + exit non-zero supaya `systemctl --failed` menunjukkannya.
# Baca /var/log/grandpos-alert.log untuk riwayat.
set -eu

THRESHOLD=${THRESHOLD:-85}
MIN_FREE_MB=${MIN_FREE_MB:-512}
BACKUP_MAX_AGE_H=${BACKUP_MAX_AGE_H:-36}
BACKUP_DIR=${BACKUP_DIR:-/root/backups/grandpos}
LOG_FILE=${LOG_FILE:-/var/log/grandpos-alert.log}
STATE_FILE=${STATE_FILE:-/var/lib/grandpos-alert.state}

log() { printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" >>"$LOG_FILE"; }

used_pct=$(df --output=pcent / | tail -1 | tr -dc '0-9')
avail_mb=$(df --output=avail -m / | tail -1 | tr -dc '0-9')

problems=""
[ "$used_pct" -ge "$THRESHOLD" ] && problems="$problems disk_used=${used_pct}%"
[ "$avail_mb" -lt "$MIN_FREE_MB" ] && problems="$problems disk_avail=${avail_mb}MB"

# Backup basi: kegagalan senyap yang paling mahal.
newest=$(find "$BACKUP_DIR" -maxdepth 1 -name 'grandpos-*.dump' -type f -printf '%T@\n' 2>/dev/null | sort -n | tail -1)
if [ -z "$newest" ]; then
  problems="$problems backup=none"
else
  age_h=$(( ( $(date +%s) - ${newest%.*} ) / 3600 ))
  [ "$age_h" -gt "$BACKUP_MAX_AGE_H" ] && problems="$problems backup_age=${age_h}h"
fi

# Dedupe: log hanya saat status berubah, supaya file tidak tumbuh oleh alarm yang sama.
if [ -n "$problems" ]; then
  if [ "$(cat "$STATE_FILE" 2>/dev/null)" != "$problems" ]; then
    log "ALERT:$problems"
    printf '%s' "$problems" >"$STATE_FILE"
  fi
  exit 1
fi

[ -s "$STATE_FILE" ] && log "OK: pulih dari:$([ -s "$STATE_FILE" ] && cat "$STATE_FILE")"
: >"$STATE_FILE"
exit 0
