#!/bin/sh
# Uji kirim transaksi kiosk (Pi) -> gudang, termasuk idempotensi.
# Token dibaca dari .env dan TIDAK pernah dicetak.
set -e
ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
ENV_FILE="$ROOT/.env"
KEY=$(grep '^NODE_SYNC_KEY=' "$ENV_FILE" | tail -1 | cut -d= -f2-)
BASE=http://127.0.0.1:8000

echo "--- 1) tanpa token (harus 401) ---"
curl -s -o /dev/null -w 'status=%{http_code}\n' -X POST "$BASE/sync/orders" \
  -H 'Content-Type: application/json' \
  -d '{"node_id":"pi-kiosk-01","transactions":[]}'

echo "--- 2) token salah (harus 401) ---"
curl -s -o /dev/null -w 'status=%{http_code}\n' -X POST "$BASE/sync/orders" \
  -H 'Content-Type: application/json' -H 'X-Node-Key: token-palsu' \
  -d '{"node_id":"pi-kiosk-01","transactions":[]}'

echo "--- 3) kirim transaksi sah (harus 200 + accepted=1) ---"
REF="test-$(date +%s)"
cat > /tmp/edge_payload.json <<JSON
{"node_id":"pi-kiosk-01","transactions":[
 {"client_ref":"$REF",
  "order_number":"GAK-PI-$REF",
  "order_type":"take_away",
  "items":[{"sku":"MKA-001","name":"Mie Aceh","type":"makanan","qty":2,"price":38000}],
  "subtotal":76000,"total":76000,
  "payment_method_type":"cash","amount_paid":80000,
  "cashier_username":"kasir1","paid_at":"$(date -u +%Y-%m-%dT%H:%M:%S+00:00)"}
]}
JSON
curl -s -X POST "$BASE/sync/orders" -H 'Content-Type: application/json' \
  -H "X-Node-Key: $KEY" -d @/tmp/edge_payload.json
printf '\n'

echo "--- 4) kirim ULANG dengan client_ref sama (harus duplicate=1, tanpa order baru) ---"
curl -s -X POST "$BASE/sync/orders" -H 'Content-Type: application/json' \
  -H "X-Node-Key: $KEY" -d @/tmp/edge_payload.json
printf '\n'

echo "--- 5) status antrean ---"
curl -s "$BASE/sync/orders/status?limit=3" -H "X-Node-Key: $KEY" | head -c 900
printf '\n'

echo "--- 6) master data (ringkasan) ---"
curl -s "$BASE/sync/master" -H "X-Node-Key: $KEY" | head -c 200
printf '\n'
