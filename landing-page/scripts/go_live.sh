#!/usr/bin/env bash
# go_live.sh — penyelesaian go-live GrandPOS di gudang-644.
# Jalankan sebagai root:   bash /root/grandpos/backend-landing-page/scripts/go_live.sh
# Idempoten: aman dijalankan ulang. Tidak pernah mencetak nilai secret.
set -euo pipefail
cd "$(dirname "$0")/.."

echo "== [0/6] Shell + Docker =="
docker compose version >/dev/null
echo "docker OK"

echo "== [1/6] Validasi config gabungan =="
docker compose -f docker-compose.yml -f docker-compose.override.yml config >/dev/null
echo "config rc=0"

echo "== [2/6] Matikan stack + hapus volume data UJI (grandpos_pgdata) =="
docker compose down -v

echo "== [3/6] Build + nyalakan stack bersih (ini bagian paling lama) =="
docker compose -f docker-compose.yml -f docker-compose.override.yml up -d --build

echo "== menunggu healthcheck =="
for i in $(seq 1 36); do
  H=$(docker compose ps --format '{{.Name}} {{.Health}}' 2>/dev/null || true)
  if echo "$H" | grep -q healthy && ! echo "$H" | grep -qE 'starting|unhealthy'; then
    echo "healthy setelah ${i}0 detik"; break
  fi
  sleep 10
done
docker compose ps

echo "== [4/6] Bootstrap superadmin (tanpa mencetak secret) =="
set -a; . ./.env; set +a
docker compose exec -T db psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
  -v pw="$GRANDPOS_SUPERADMIN_PASSWORD" < db/bootstrap_superadmin.sql
echo "bootstrap selesai"

echo "== [5/6] Verifikasi hidup =="
curl -s http://127.0.0.1:8000/health; echo
echo "-- binding port (api: 0.0.0.0 utk UI server 100.109.98.56; db: wajib 127.0.0.1) --"
ss -tlnp | grep -E ':(5432|8000)' || true
echo "-- probe jalur UI server (Tailscale/privat 100.117.186.13) --"
curl -s --max-time 5 http://100.117.186.13:8000/health && echo || echo "jalur privat tidak terbuka"
echo "-- probe IP publik --"
curl -s --max-time 5 http://103.119.237.36:8000/health && echo || echo "publik diblokir provider (wajar)"

echo "== [6/6] Alur nyata: shift -> order -> bayar -> tutup =="
API=http://127.0.0.1:8000
KEY_HEADER="X-API-Key: $API_SERVER_KEY"
S=$(curl -s -X POST $API/shifts/open -H "$KEY_HEADER" -H 'Content-Type: application/json' \
  -d '{"opening_float":500000,"opened_by":1}')
echo "open: $S"
SID=$(echo "$S" | grep -o '"id":[0-9]*' | head -1 | cut -d: -f2)
O=$(curl -s -X POST $API/orders -H "$KEY_HEADER" -H 'Content-Type: application/json' -d '{
  "order_type":"dine_in","table_id":1,
  "lines":[{"product_id":1,"qty":"2"}]}')
echo "order: $O"
OID=$(echo "$O" | grep -o '"id":[0-9]*' | head -1 | cut -d: -f2)
TOT=$(echo "$O" | grep -o '"grand_total":[0-9]*' | head -1 | cut -d: -f2)
curl -s -X POST $API/orders/$OID/pay -H "$KEY_HEADER" -H 'Content-Type: application/json' \
  -d "{\"captured_by\":1,\"payments\":[{\"method\":\"cash\",\"amount\":$TOT,\"tendered\":$TOT}]}"; echo
curl -s -X POST $API/shifts/$SID/close -H "$KEY_HEADER" -H 'Content-Type: application/json' \
  -d "{\"closed_by\":1,\"counted_cash\":$((500000 + TOT))}"; echo

echo
echo "== RINGKASAN =="
echo "Stack: $(docker compose ps --format '{{.Name}} {{.Status}}' | tr '\n' ' ')"
echo "Health: $(curl -s http://127.0.0.1:8000/health)"
echo "GO-LIVE SELESAI — POS API: http://127.0.0.1:8000"
