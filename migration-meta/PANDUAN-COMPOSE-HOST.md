# Compose drift: dari `docker run` manual ke project Compose

Status: **selesai 2026-11-19 (ter-push ke repo: commit `2a72351`)**
Host: `gudang7783`

## 1. Masalah

Tujuh container berjalan, tetapi hanya `homepage` yang punya label Compose.
Lima layanan dibuat manual (`docker run` / tool lain) sehingga:

- tidak ada satu berkas pun yang mendokumentasikan image, mount, environment,
  port, dan command yang sebenarnya berjalan;
- `docker compose up/pull` tidak mengenali container itu sebagai miliknya;
- konfigurasi hanya bisa dibaca lewat `docker inspect`, dan mudah hilang saat
  container dihapus.

Layanan yang terdampak: `grandpos_web_app`, `pg-grandpos`, `pg-hindsight`,
`beszel` + `beszel-agent`, `filebrowser`.

## 2. Hasil sekarang

`docker compose ls`:

```
NAME         STATUS        CONFIG FILES
beszel       running(2)    /srv/beszel/compose.yml
filebrowser  running(1)    /srv/filebrowser/compose.yml
grandpos     running(2)    /root/grandpos-project/pos-engine/deploy/docker-compose.host.yml
hindsight    running(1)    /srv/pg-hindsight/compose.yml
homepage     running(1)    /srv/homepage/compose.yml
```

Tidak ada container dobel. Semua data tetap di bind mount lama:

| Layanan | Data |
| :--- | :--- |
| `grandpos_web_app` | `/root/grandpos-project/pos-engine` → `/app` (ro), `.../data` → `/data` (rw) |
| `pg-grandpos` | `/srv/pgdata/grandpos` |
| `pg-hindsight` | `/srv/pgdata/hindsight` |
| `beszel` | `/home/taqim258/beszel/data` |
| `beszel-agent` | `/home/taqim258/beszel/agent_data` |
| `filebrowser` | `/srv/filebrowser/files`, `/srv/filebrowser/data`, `/` → `/rootfs` |

## 3. Berkas

### POS: `pos-engine/deploy/docker-compose.host.yml`

- `grandpos-app` memakai `network_mode: host` karena container lama memang host
  networking; ini menjaga `ANALYTICS_URL` dan webhook Hermes tetap terjangkau.
- Kode di-bind-mount **read-only** ke `/app` dan dijalankan
  `./node_modules/.bin/tsx server.ts` — sama seperti sebelumnya.
- `pg-grandpos` memakai network eksternal `db_net` (dipakai bersama
  `pg-hindsight`) dan port `127.0.0.1:5432`.
- Variabel `POSTGRES_*` sengaja tidak diduplikasi: cluster sudah diinisialisasi
  dan kredensial hidup di `.env` analytics. Menambahkannya di sini tidak
  mengubah apa pun, tetapi membuat dua sumber rahasia.
- `watchtower` hanya aktif lewat profile: `--profile watchtower`. Container
  watchtower memang tidak berjalan, jadi jangan membuatnya tanpa diminta.

Rahasia ada di `pos-engine/deploy/.env` (git-ignored):

```
JWT_SECRET=...
NODE_SYNC_KEY=...
CORS_ORIGINS=...
ANALYTICS_URL=http://172.20.0.1:8000
HERMES_WA_WEBHOOK_URL=http://127.0.0.1:8644/webhooks/grandpos-outbox
POS_ENGINE_DIR=/root/grandpos-project/pos-engine
GRANDPOS_DATA_DIR_HOST=/root/grandpos-project/pos-engine/data
NODE_ID=gudang7783
```

Contoh tanpa nilai ada di `deploy/.env.example`.

### Layanan lain

- `/srv/filebrowser/compose.yml` — berkas sudah ada sebelumnya tetapi tidak
  dipakai; sekarang disamakan dengan `docker inspect` (env
  `FILEBROWSER_*`, mount `/rootfs` dengan propagation `rslave`).
- `/srv/beszel/compose.yml` — server + agent, agent memakai host network.
- `/srv/pg-hindsight/compose.yml` — pgvector, network `db_net`.

## 4. Cara adopsi yang dipakai

Compose **tidak** mau mengambil alih container yang tidak punya labelnya;
`up -d` akan gagal dengan `container name already in use`. Urutan yang benar:

```bash
# 1. Backup dulu
pg_dump ... > /root/backups/grandpos/.../grandpos.sql
cp data/pos-db.json /root/backups/grandpos/.../

# 2. Hentikan & hapus container lama (data ada di bind mount, aman)
sudo docker stop grandpos_web_app pg-grandpos
sudo docker rm grandpos_web_app pg-grandpos

# 3. Jalankan Compose
cd /root/grandpos-project/pos-engine/deploy
sudo docker compose -f docker-compose.host.yml up -d
```

Layanan lain diulang dengan pola yang sama di direktori compose masing-masing.

## 5. Perintah harian

```bash
# POS
cd /root/grandpos-project/pos-engine/deploy
sudo docker compose -f docker-compose.host.yml ps
sudo docker compose -f docker-compose.host.yml logs -f --tail=100 grandpos-app
sudo docker compose -f docker-compose.host.yml restart grandpos-app
sudo docker compose -f docker-compose.host.yml up -d --force-recreate --no-deps grandpos-app

# PostgreSQL POS
sudo docker compose -f docker-compose.host.yml exec pg-grandpos \
  psql -U grandpos_app -d grandpos

# Layanan lain
cd /srv/filebrowser && sudo docker compose ps
cd /srv/beszel && sudo docker compose ps
cd /srv/pg-hindsight && sudo docker compose ps
```

## 6. Verifikasi setelah adopsi

- `grandpos_web_app` dan `pg-grandpos` berlabel
  `com.docker.compose.project=grandpos`.
- `/api/health` → 200; login PIN → token.
- `pg-grandpos` menerima koneksi `grandpos_app` dan tabel analytics utuh
  (dump sebelum adopsi: 543 KB).
- `grandpos-analytics.service` → health 200.
- `filebrowser` → 200 di `127.0.0.1:8081`.
- `beszel` → 200 di `127.0.0.1:8090`.
- `pg-hindsight` → `pg_isready` accepting connections.
- Kiosk Pi (`100.109.98.56`) → frontend & API 200.

## 7. Peringatan

- **Jangan** `docker compose down -v`. Tidak ada named volume, tetapi perintah
  itu tetap menghapus container; data bind mount selamat, container harus
  dibuat ulang.
- **Jangan** menjalankan compose lama `/root/grandpos/deploy/docker-compose.yml`
  atau `/root/grandpos-project/pos-engine/deploy/docker-compose.pi.yml`.
  Keduanya memakai image/command berbeda dan akan membuat konfigurasi kedua.
- Recreate `grandpos-app` memutus kasir beberapa detik. Lakukan di luar jam
  ramai; container lama memang tidak punya restart otomatis saat recreate.
- `pg-hindsight` dan `pg-grandpos` berbagi network `db_net`. Jangan menghapus
  network itu selama salah satu container hidup.
- `filebrowser` memount seluruh `/` ke `/rootfs` sebagai root. Itu memang
  konfigurasi lamanya; jangan diekspos ke publik tanpa autentikasi.

## 8. Rollback

Bila Compose bermasalah, container lama bisa dibuat ulang manual dengan
parameter yang sama seperti pada `docker inspect` (tersimpan di dokumen ini dan
di riwayat sesi). Data tidak perlu dipulihkan karena tetap di bind mount.
Backup sebelum adopsi:

```
/root/backups/grandpos/pre-compose-20261119/grandpos.sql
/root/backups/grandpos/pre-compose-20261119/pos-db.json
```
