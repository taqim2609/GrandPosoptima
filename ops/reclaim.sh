#!/bin/sh
# Allowlist-only disk reclaim for the GrandPOS host.
# Dihapus hanya cache sekali-pakai. TIDAK menyentuh: volume grandpos_pgdata,
# /root/backups, repo, database, atau image yang dipakai container.
set -eu

THRESHOLD=${THRESHOLD:-85}
MIN_FREE_MB=${MIN_FREE_MB:-512}
LOG_FILE=${LOG_FILE:-/var/log/grandpos-reclaim.log}

log() { printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" >>"$LOG_FILE"; }

used_pct=$(df --output=pcent / | tail -1 | tr -dc '0-9')
avail_mb=$(df --output=avail -m / | tail -1 | tr -dc '0-9')

if [ "$used_pct" -lt "$THRESHOLD" ] && [ "$avail_mb" -ge "$MIN_FREE_MB" ]; then
  log "skip: used=${used_pct}% avail=${avail_mb}MB (threshold=${THRESHOLD}% min_free=${MIN_FREE_MB}MB)"
  exit 0
fi

log "start: used=${used_pct}% avail=${avail_mb}MB"

# Cache paket: aman dibuang, akan dibuat ulang saat dibutuhkan.
rm -rf /root/.cache/pip /root/.cache/uv /root/.npm/_cacache /root/.cache/node-gyp 2>/dev/null || true
log "cache: pip/uv/npm/node-gyp dibersihkan"

# Image & container yatim. Tidak memakai --volumes, jadi data tidak tersentuh.
if command -v docker >/dev/null 2>&1; then
  docker container prune -f >/dev/null 2>&1 || true
  docker image prune -f >/dev/null 2>&1 || true
  log "docker: container+image yatim dipangkas (volume tidak disentuh)"
fi

avail_after=$(df --output=avail -m / | tail -1 | tr -dc '0-9')
log "done: avail=${avail_after}MB"

if [ -n "${RECLAIM_ALERT_CMD:-}" ] && [ "$avail_after" -lt "$MIN_FREE_MB" ]; then
  $RECLAIM_ALERT_CMD "GrandPOS disk masih sempit setelah reclaim: ${avail_after}MB tersisa di /" >/dev/null 2>&1 || true
  log "alert: dikirim karena avail=${avail_after}MB < ${MIN_FREE_MB}MB"
fi
