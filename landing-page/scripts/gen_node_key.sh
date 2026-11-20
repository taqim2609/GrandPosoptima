#!/bin/sh
# Buat NODE_SYNC_KEY (token kiosk Pi -> gudang) bila belum ada di .env.
# Nilai tidak pernah dicetak: hanya panjangnya yang dilaporkan.
set -e
ENV_FILE=/root/grandpos/backend-landing-page/.env

if grep -q '^NODE_SYNC_KEY=' "$ENV_FILE"; then
  echo "NODE_SYNC_KEY sudah ada, tidak diubah."
  exit 0
fi

KEY=$(head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n' | head -c 48)
if [ ${#KEY} -lt 32 ]; then
  echo "GAGAL: entropi tidak cukup" >&2
  exit 1
fi

printf '\n# Token sinkronisasi kiosk (Raspberry Pi -> gudang). Terpisah dari POS_API_KEY.\nNODE_SYNC_KEY=%s\n' "$KEY" >> "$ENV_FILE"
LEN=$(grep '^NODE_SYNC_KEY=' "$ENV_FILE" | tail -1 | awk -F= '{print length($2)}')
echo "NODE_SYNC_KEY ditambahkan (panjang $LEN karakter, nilai tidak ditampilkan)."
