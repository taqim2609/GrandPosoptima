#!/bin/sh
# Verifikasi menyeluruh alur Gudang (644) <-> Kiosk Pi (100.109.98.56).
# Dijalankan di gudang-644.
GUDANG_HOST="gudang-644.tailf3a839.ts.net"
GUDANG_IP="100.117.186.13"
PI="100.109.98.56"

hr() { printf -- '--------------------------------------------------------------\n'; }

hr
printf '1) Gudang: root / -> 302 ke Pi /pos\n'
curl -s -o /dev/null -w "   http://%s/            -> %{http_code} %{redirect_url}\n" "$GUDANG_IP" "http://$GUDANG_IP/"
curl -s -o /dev/null -w "   /dashboard           -> %{http_code} %{redirect_url}\n" "http://$GUDANG_IP/dashboard"
curl -s -o /dev/null -w "   /pos                 -> %{http_code} %{redirect_url}\n" "http://$GUDANG_IP/pos"

hr
printf '2) Gudang: endpoint lokal TETAP hidup\n'
curl -s -o /dev/null -w "   GET /health          -> %{http_code}\n" "http://127.0.0.1:8000/health"
curl -s "http://127.0.0.1:8000/health"
printf '\n'
curl -s -o /dev/null -w "   GET /openapi.json    -> %{http_code}\n" "http://127.0.0.1:8000/openapi.json"
curl -s -o /dev/null -w "   GET /wa-api/         -> %{http_code}\n" "http://127.0.0.1:8644/"

hr
printf '3) Pi: kiosk UI + backend hidup\n'
curl -s -o /dev/null -w "   http://%s/           -> %{http_code} %{redirect_url}\n" "$PI" "http://$PI/"
curl -s -o /dev/null -w "   http://%s/pos        -> %{http_code}\n" "$PI" "http://$PI/pos"
curl -s -o /dev/null -w "   http://%s/api/health -> %{http_code}\n" "$PI" "http://$PI/api/health"
curl -s "http://$PI/api/health"
printf '\n'

hr
printf '4) Gudang -> Pi: jalur jaringan (tailnet)\n'
curl -s -m 10 -o /dev/null -w "   GET http://%s/api/health -> %{http_code}\n" "$PI" "http://$PI/api/health"

hr
printf '5) Antrean transaksi Pi (uploader)\n'
curl -s -m 10 "http://$PI/api/sync/outbox" | head -c 600
printf '\n'
hr
