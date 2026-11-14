# Perintah verifikasi yang dipakai

Kumpulan perintah yang benar-benar dijalankan saat audit dan remediation. Semua di sini
read-only terhadap produksi, kecuali yang ditandai **MUTASI**.

Ganti `<KEY>` dengan kunci dari `.env`; jangan pernah menaruh nilai asli di berkas ini.

## Status layanan

```sh
# Kesehatan aplikasi
curl -s -o /dev/null -w 'api_health=%{http_code}\n' http://127.0.0.1:8000/health
curl -s -o /dev/null -w 'web_root=%{http_code}\n'   http://127.0.0.1:3000/
curl -s -o /dev/null -w 'web_ota=%{http_code}\n'    http://127.0.0.1:3000/api/ota/version
curl -s -o /dev/null -w 'pi_root=%{http_code}\n'    http://<PI_HOST>/
curl -s -o /dev/null -w 'pi_health=%{http_code}\n'  http://<PI_HOST>/api/health

# Container dan kesehatan
docker ps --format '{{.Names}}\t{{.Status}}\t{{.Image}}'
for c in $(docker ps --format '{{.Names}}'); do
  printf '%-26s ' "$c"
  docker inspect "$c" --format '{{.State.Status}} {{if .State.Health}}{{.State.Health.Status}}{{else}}no-healthcheck{{end}}'
done
```

## Disk dan pemakaian

```sh
df -h /
du -sh /var/lib/docker/volumes/grandpos_pgdata   # ukuran database
docker system df                                  # ruang yang bisa direklaim
du -sh /root/.cache/pip /root/.cache/uv /root/.npm/_cacache 2>/dev/null
```

## Log rotation

```sh
# Apakah batas log benar-benar terpasang pada container?
for c in $(docker ps --format '{{.Names}}'); do
  printf '%-26s ' "$c"
  docker inspect "$c" --format 'max-size={{index .HostConfig.LogConfig.Config "max-size"}} max-file={{index .HostConfig.LogConfig.Config "max-file"}}'
done

# Uji daemon, bukan container lama: container baru harus langsung mendapat batas.
docker run -d --name logprobe alpine sleep 20
docker inspect logprobe --format '{{.HostConfig.LogConfig.Config}}'
docker rm -f logprobe

# Ukuran berkas log per container
for c in $(docker ps --format '{{.Names}}'); do
  p=$(docker inspect "$c" --format '{{.LogPath}}'); printf '%-26s %s\n' "$c" "$(du -h "$p" 2>/dev/null | cut -f1)"
done
```

`systemctl reload docker` **tidak** menerapkan `log-opts`. Lihat `ops/PANDUAN-DOCKER-LOG.md`.

## Backup dan restore drill

```sh
# Jalankan lewat systemd, bukan langsung: yang diuji adalah jalur sebenarnya.
systemctl start grandpos-backup.service
systemctl show grandpos-backup.service -p Result -p ExecMainStatus
tail -3 /var/log/grandpos-backup.log
ls -lh /root/backups/grandpos/

# Drill restore ke Postgres disposable (JANGAN ke container produksi)
D=$(ls -t /root/backups/grandpos/*.dump | head -1)
docker run -d --name gp-drill -e POSTGRES_PASSWORD=<pwd-sementara> postgres:16-alpine
docker cp "$D" gp-drill:/tmp/gp.dump
docker exec gp-drill createdb -U postgres grandpos_restore
docker exec gp-drill pg_restore -U postgres -d grandpos_restore --no-owner --no-acl /tmp/gp.dump
docker rm -f gp-drill
```

Bandingkan hitungan baris hasil restore dengan produksi:

```sh
for t in orders order_items products shifts edge_ingest_log; do
  docker exec grandpos-db-1 sh -c "psql -U \"\$POSTGRES_USER\" -d \"\$POSTGRES_DB\" -tAc 'select count(*) from $t'"
done
```

## Timer dan alarm

```sh
systemctl list-timers grandpos-{backup,reclaim,alert}.timer --no-pager
tail -5 /var/log/grandpos-alert.log

# Uji alarm dua arah tanpa menunggu jadwal
THRESHOLD=1 LOG_FILE=/tmp/a.log STATE_FILE=/tmp/a.state ops/disk-alert.sh; echo $?   # 1 = alarm
BACKUP_DIR=/tmp/empty LOG_FILE=/tmp/a.log STATE_FILE=/tmp/a.state ops/disk-alert.sh  # backup=none
```

## Autentikasi dan RBAC

```sh
# Anonim harus 401 pada endpoint tulis
curl -s -o /dev/null -w '%{http_code}\n' -X POST http://127.0.0.1:3000/api/sync/orders \
  -H 'Content-Type: application/json' -H 'X-API-Key: ***' -d '{"node_id":"probe","orders":[]}'

# /sync/orders memvalidasi body SEBELUM auth: body kosong membalas 422, bukan 401.
# Kirim body yang lolos skema supaya guard benar-benar teruji.

# FastAPI: route yang dilindungi X-API-Key
for p in /reports/dashboard /reports/low-stock /sync/orders/status /api/landing/config; do
  printf '%-28s %s\n' "$p" "$(curl -s -o /dev/null -w %{http_code} http://127.0.0.1:8000$p)"
done

# MCP harus menolak anonim
curl -s -X POST http://127.0.0.1:3000/mcp -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

Matriks RBAC penuh tanpa menyentuh produksi:

```sh
cd /root/grandpos/pos-engine
node tests/import-rbac.js              # anon 401 / kasir 403 / admin lolos, server + data sintetis
node tests/import-rbac-prod-data.js    # sama, memakai salinan data/pos-db.json produksi
```

## OTA: satu hash di semua permukaan

```sh
for u in "http://<PI_HOST>/ota/bundle.zip" \
         "http://<PI_HOST>/api/ota/bundle.zip" \
         "http://<VPS_HOST>:3000/api/ota/bundle.zip"; do
  printf '%-52s ' "$u"; curl -s --max-time 90 "$u" | sha256sum | cut -c1-16
done
sha256sum /root/grandpos/pos-engine/dist/ota/bundle.zip | cut -c1-16
sha256sum /root/grandpos/pos-engine/project/frontend/build/ota/bundle.zip | cut -c1-16
```

Gerbang build (keduanya menghentikan `make-ota.js` sebelum menulis bundle):

```sh
grep -c 'src/index.jsx' /root/grandpos/pos-engine/project/frontend/build/index.html   # harus 0
grep -o 'main\.[a-z0-9]*\.js' /root/grandpos/pos-engine/dist/index.html                # harus sama dengan build/
```

## Deploy

```sh
# Backend (FastAPI)
cd /root/grandpos/backend-landing-page
docker compose up -d --force-recreate --no-deps api
docker compose up -d --force-recreate --no-deps db

# Node POS (bind-mount, TANPA hot reload)
cd /root/grandpos/deploy
docker compose -p deploy -f docker-compose-p1a.yml restart grandpos-app
```

**MUTASI** — recreate mengganti container. Jalankan saat tidak ada shift terbuka
(`select count(*) from shifts where closed_at is null` harus 0).

## Frontend ke Pi

```sh
# Bangun dan kemas
cd /root/grandpos/pos-engine/project/frontend && CI=true npm run build
cd /root/grandpos/pos-engine && node build.js
tar -czf /tmp/fe.tar.gz -C project/frontend/build .

# Kirim dan verifikasi checksum
scp /tmp/fe.tar.gz <PI_USER>@<PI_HOST>:/tmp/
ssh <PI_USER>@<PI_HOST> 'sha256sum /tmp/fe.tar.gz'

# Bangun image arm64 di Pi, ambil nginx dari container yang sedang jalan
ssh <PI_USER>@<PI_HOST> '
  rm -rf /tmp/febuild && mkdir -p /tmp/febuild/html
  tar -xzf /tmp/fe.tar.gz -C /tmp/febuild/html
  docker cp project-frontend-1:/etc/nginx/conf.d/default.conf /tmp/febuild/nginx.conf
  cd /tmp/febuild
  printf "FROM nginx:1.25-alpine\nCOPY nginx.conf /etc/nginx/conf.d/default.conf\nCOPY html/ /usr/share/nginx/html/\n" > Dockerfile
  docker build -q -t project-frontend:<tag> .
'

# Deploy lewat Compose (bukan docker run)
ssh <PI_USER>@<PI_HOST> 'cd /home/<PI_USER>/grand-aceh-pos && FRONTEND_TAG=<tag> docker compose -f docker-compose.pi.yml up -d'
```

Rollback: `FRONTEND_TAG=<tag-sebelumnya> docker compose -f docker-compose.pi.yml up -d`.

## Test suite

```sh
# Node (satu perintah per berkas; semuanya exit code)
cd /root/grandpos/pos-engine
for f in tests/fix01-*.js tests/fix02-*.js tests/fix05-*.js tests/cash-*.js tests/import-rbac.js; do
  printf '%-40s ' "$(basename $f)"; timeout 150 node "$f" >/tmp/s.log 2>&1 && echo PASS || { echo FAIL; tail -4 /tmp/s.log; }
done

# Frontend
cd /root/grandpos/pos-engine/project/frontend && CI=true npm test

# Backend (hermetik). `-o addopts=''` mematikan addopts yang butuh DB live.
cd /root/grandpos/backend-landing-page && python3 -m pytest -q -o addopts=''
```

Catatan: dua test di `tests/test_mcp_reports.py` gagal bila paket `mcp` tidak terpasang
(`ModuleNotFoundError: No module named 'mcp'`). Itu kondisi lingkungan, bukan regresi kode.

## Graph

```sh
cd /root/grandpos/pos-engine && graphify update .
python3 -c "import json;g=json.load(open('graphify-out/graph.json'));print('nodes',len(g['nodes']),'links',len(g['links']))"
```

## Audit dependensi

```sh
cd /root/grandpos/pos-engine/project/frontend
npm audit --omit=dev --json | python3 -c "
import sys,json
d=json.load(sys.stdin)
for n,v in sorted(d.get('vulnerabilities',{}).items()):
    print(f\"{v.get('severity'):9} {n:24} {'FIX' if v.get('fixAvailable') else 'NOFIX'}\")"

# Yang benar-benar masuk bundle: cek import di src/, bukan grep pada bundle.
for lib in axios firebase react-router zod underscore jsonpath; do
  printf '%-18s %s imports\n' "$lib" "$(grep -rl "from ['\"]$lib" src/ 2>/dev/null | wc -l)"
done
```

Instalasi di tree ini butuh `--legacy-peer-deps` karena konflik peer `date-fns@4` vs
`react-day-picker@8` yang sudah ada sebelum perubahan mana pun.