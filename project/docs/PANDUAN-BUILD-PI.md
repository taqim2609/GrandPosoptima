# Panduan Build Frontend di Raspberry Pi

Dokumen ini menjelaskan cara membangun dan memasang image frontend Grand POS
pada Raspberry Pi (aarch64) **tanpa** membuat board kehabisan memori.

## Kenapa build di Pi sering gagal

`npm run build` (craco + terser) butuh heap jauh di atas RAM Pi:

| Sumber daya | Nilai terukur di Pi produksi |
| :--- | :--- |
| RAM total | 906 MB |
| Swap saat build (dengan swap 3 GB) | ~1,5 GB terpakai |
| Waktu `npm install` | ~15 menit |
| Waktu `npm run build` | praktis tidak selesai (load average > 10, dominan I/O wait) |

Gejalanya adalah kegagalan yang terlihat seperti error JavaScript, bukan OOM:

```
FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory
target frontend: failed to solve: process "/bin/sh -c ... npm run build" did not complete successfully: exit code: 1
```

## Cara yang direkomendasikan: build di mesin lain, kirim image

Builder dijalankan pada platform **native mesin build** (mis. amd64, cepat), lalu
berkas statis hasil build disalin ke image `nginx:alpine` **arm64**:

```bash
# di mesin build (bukan Pi)
cd project/frontend
docker buildx build --platform linux/arm64 \
  -f Dockerfile.crossbuild -t grandpos-frontend:<commit> --load .

docker save grandpos-frontend:<commit> | gzip -1 > /tmp/grandpos-frontend.tar.gz
scp /tmp/grandpos-frontend.tar.gz <user>@<pi>:/home/<user>/
```

```bash
# di Pi
docker load < ~/grandpos-frontend.tar.gz
docker tag grandpos-frontend:<commit> project-frontend:latest
cd ~/grand-aceh-pos/project
docker compose up -d --no-deps --force-recreate frontend
```

`Dockerfile.crossbuild` hanya alat bantu build; ia **tidak** di-commit. Image
yang dikirim tetap dibangun dari source commit yang di-checkout (`build/`
dikecualikan lewat `.dockerignore`), jadi provenance-nya adalah commit, bukan
artefak yang kebetulan ada di disk.

## Verifikasi setelah deploy

```bash
git rev-parse HEAD                     # commit yang diharapkan
docker exec project-frontend-1 sha256sum /usr/share/nginx/html/static/js/main.*.js
docker exec project-frontend-1 sh -c 'ls /usr/share/nginx/html/static/js/*.map 2>/dev/null | wc -l'   # harus 0
curl -s -o /dev/null -w '%{http_code}\n' http://localhost/
curl -s http://localhost/api/health
```

Marker commit di frontend harus dicari di **seluruh chunk**, bukan hanya
`main.*.js`, karena halaman dimuat lewat `lazyWithRetry(() => import(...))`
(code-splitting):

```bash
docker exec project-frontend-1 sh -c \
  'grep -rl grand-aceh-kuliner-pos /usr/share/nginx/html/static/js | wc -l'
```

## Swap di Pi

Swap hanya diperlukan bila build tetap dijalankan di Pi. Swap tidak persisten
kecuali ditambahkan ke `/etc/fstab`; setelah reboot, build di Pi akan OOM lagi.
Karena image kini dikirim siap-pakai, jangan jadikan build di Pi sebagai jalur
rutin.
