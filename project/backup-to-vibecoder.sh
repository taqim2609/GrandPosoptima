#!/usr/bin/env bash
# ============================================================
# Kompatibilitas mundur: delegasi ke ./backup-to-cloud.sh
# ============================================================
cd "$(dirname "$0")"
if [ -f ./backup-to-cloud.sh ]; then
  exec bash ./backup-to-cloud.sh "$@"
fi
exit 1
