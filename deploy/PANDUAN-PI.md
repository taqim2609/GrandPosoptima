# Kiosk frontend on the Pi — reproducible deploy

The Pi (`kasir-pi`, `100.109.98.56`) has no git checkout. Until 2026-11-13 its frontend
container was created by hand with `docker run`, so it could not be recreated from the repo.
This file plus `nginx-kiosk.conf` restore that.

## What runs there

| Property | Value |
| :--- | :--- |
| Container | `project-frontend-1` |
| Image | `project-frontend:<commit>` (built on the Pi, `linux/arm64`) |
| Network | `project_pos_network`, alias `frontend` |
| Port | `80:80` |
| Restart | `unless-stopped` |
| Nginx config | `nginx-kiosk.conf` (captured from the running container) |

`nginx-kiosk.conf` proxies `/api/landing/` to `100.117.186.13:8000` and everything else under
`/api/` to `100.117.186.13:3000`. The repo's `project/frontend/nginx.conf` proxies to
`backend:8001` and is a different file — deploying that one would break the kiosk.

## Build (on the Pi — cross-building from gudang-644 is faster)

Building on the Pi itself does not finish (`project/docs/PANDUAN-BUILD-PI.md`). Build the
static assets elsewhere and ship only the output:

```sh
cd project/frontend && CI=true npm run build
tar -czf /tmp/frontend-build.tar.gz --exclude='*.map' -C build .
scp /tmp/frontend-build.tar.gz taqim258@100.109.98.56:/tmp/
```

`scp` this directory's `nginx-kiosk.conf` alongside it.

## Deploy

```sh
ssh taqim258@100.109.98.56
mkdir -p /tmp/febuild && cd /tmp/febuild
tar -xzf /tmp/frontend-build.tar.gz -C build
cp /tmp/nginx-kiosk.conf build/../nginx.conf
docker build --platform linux/arm64 -t project-frontend:<commit> .
```

With `docker-compose.pi.yml` present, recreate declaratively:

```sh
cd /home/taqim258/grand-aceh-pos && FRONTEND_TAG=<commit> docker compose -f docker-compose.pi.yml up -d
```

Compose adoption requires removing the hand-made container once:

```sh
docker rename project-frontend-1 project-frontend-old && docker stop project-frontend-old
docker compose -f docker-compose.pi.yml up -d
```

## Verify

```sh
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1/            # 200
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1/pos         # 200 (SPA fallback)
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1/api/health  # 200
curl -s http://127.0.0.1/ | grep -o 'main\.[a-z0-9]*\.js'             # matches the built hash
curl -s http://127.0.0.1/ota/version.json | head -3                   # checksum matches /ota/bundle.zip
```

## Rollback

`project-frontend-old` is kept after a swap. To revert:

```sh
docker rm -f project-frontend-1
docker rename project-frontend-old project-frontend-1
docker start project-frontend-1
```
