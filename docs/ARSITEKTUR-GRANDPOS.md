# GrandPOS — Arsitektur & Dependency (dokumen acuan)

> Diverifikasi langsung dari sistem pada **2026-11-20 12:22 WIB** (bukan dari
> ingatan/laporan agen). Versi sebelumnya (2026-10-30) sudah tidak berlaku:
> host berganti nama/IP, nginx dihapus, dan POS tidak lagi memakai PostgreSQL
> sebagai sumber kebenaran. Kalau ada yang tidak cocok dengan kenyataan,
> **dokumen ini yang salah** — periksa ulang sistem lalu perbarui.

---

## 1. Gambaran besar — 3 node

```
┌─────────────────────┐        ┌──────────────────────────┐        ┌─────────────────────┐
│  PI (kasir fisik)   │        │  GUDANG7783 (VPS)        │        │  Tailscale tailnet  │
│  100.109.98.56      │◄──────►│  100.70.161.30           │◄──────►│  tailf3a839.ts.net  │
│  Raspberry Pi       │  HTTP  │  Debian                  │        │                     │
└─────────────────────┘        └──────────────────────────┘        └─────────────────────┘
```

| Node | Hostname tailnet | IP tailnet | Peran |
|---|---|---|---|
| Pi | `kasir-pi` | `100.109.98.56` | Kasir fisik. Nginx + SPA POS mode kiosk. LAN statis `192.168.8.254`. |
| Gudang | `gudang7783.tailf3a839.ts.net` | `100.70.161.30` | VPS: POS engine, analytics API, MCP, PostgreSQL analitik, Hindsight. |
| Tailnet | — | — | `tailf3a839.ts.net`. Funnel hanya untuk Beszel (:10000). |

SSH Pi: `taqim258@100.109.98.56` (bukan root).

**Nama/IP lama (arsip, jangan dipakai):** host pernah bernama `gudang-644`
dengan IP `100.117.186.13`. Semua konfigurasi yang masih menyebut nilai itu
berarti belum diperbarui. Alamat `100.117.186.13` juga masih muncul di berkas
OTA (`nodes.fallback_vps`) sebagai fallback remote.

---

## 2. Peta runtime — container & service

**Docker** mengelola 7 container dalam 5 project Compose:

| Project | Compose file | Container | Port |
|---|---|---|---|
| `grandpos` | `/root/grandpos-project/pos-engine/deploy/docker-compose.host.yml` | `grandpos_web_app`, `pg-grandpos` | 3000 (host net), 127.0.0.1:5432 |
| `beszel` | `/srv/beszel/compose.yml` | `beszel`, `beszel-agent` | 127.0.0.1:8090 |
| `filebrowser` | `/srv/filebrowser/compose.yml` | `filebrowser` | 127.0.0.1:8081 |
| `hindsight` | `/srv/pg-hindsight/compose.yml` | `pg-hindsight` | 127.0.0.1:5433 |
| `homepage` | `/srv/homepage/compose.yml` | `homepage` | 127.0.0.1:8088 |

**systemd** menjalankan layanan Python (bukan container):

| Unit | Port | Kode |
|---|---|---|
| `grandpos-analytics.service` | `0.0.0.0:8000` | `uvicorn app.api:app` |
| `grandpos-mcp.service` | `127.0.0.1:8001` | `app/mcp_server.py` |
| `hermes-dashboard.service` | `127.0.0.1:9119` | `hermes dashboard` |

Dua layanan GrandPOS (analytics & MCP) berjalan dari
`/root/grandpos/backend-landing-page` + `venv_mcp`; `hermes-dashboard` dari
`/home/taqim258`. **Perhatikan:** itu folder lama, bukan
`/root/grandpos-project/backend-landing-page` yang dipakai repo. Isinya
disamakan manual; lihat §10.

Tidak ada nginx di host ini. Port 80/443 dipegang `kiri` (container engine,
port mapper) dan menjawab 404 — tidak ada lagi reverse proxy web.

---

## 3. POS engine — `grandpos_web_app`

**Container:** `grandpos_web_app` · image `node:20-alpine` · **`network_mode: host`** · port `3000`
**Command:** `sh -c ./node_modules/.bin/tsx server.ts` (tanpa watch)
**Restart:** `unless-stopped`

**Mount:**
| Host | Container | Mode |
|---|---|---|
| `/root/grandpos-project/pos-engine` | `/app` | **ro** |
| `/root/grandpos-project/pos-engine/data` | `/data` | rw |

**Env penting (nilai rahasia tidak ditulis di sini):** `GRANDPOS_DATA_DIR=/data`,
`NODE_ID=gudang7783`, `PORT=3000`, `ANALYTICS_URL=http://172.20.0.1:8000`,
`NODE_ENV=production`, `CORS_ORIGINS` (localhost, `:3000`, IP Pi, hostname
tailnet), `JWT_SECRET`, `NODE_SYNC_KEY`, `HERMES_WA_WEBHOOK_URL`.
Nilai asli hanya ada di `pos-engine/deploy/.env` (git-ignored).

**Kode yang berjalan = berkas di disk**, bukan image. Karena mount `/app` read-only,
setiap perubahan server **wajib restart container**:

```bash
sudo docker restart grandpos_web_app
```

**Entrypoint:** `server.ts` (tipis) → `api-server.js` (Express, semua route).
Produksi menyajikan `dist/` + SPA fallback `index.html`.

**Frontend:** `/root/grandpos-project/pos-engine/project/frontend/`
- Build `craco` → `build/`, lalu di-`rsync` ke `dist/`
- `postbuild` = `scripts/make-ota.js` → `build/ota/bundle.zip`
- Build butuh `sudo` karena `build/.well-known` bermasalah permission
- **JANGAN** aktifkan `sw.js`, **JANGAN** hapus `polyfills.js`, **JANGAN** tambah dynamic import

**Artefak saat ini:** `dist/index.html` dibangun 2026-11-19 16:03; bundle
`main.49e6eb94.js`; OTA `2.10.20261119160316` (645 KB, sha256 `e353714d…`).

**Aturan wajib baca sebelum sentuh kode:** `pos-engine/AGENTS.md`,
`pos-engine/project/AGENTS.md`, `pos-engine/project/frontend/AGENTS.md`.

---

## 4. Sumber data — JSON snapshot, bukan PostgreSQL

**Sumber kebenaran POS: `pos-engine/data/pos-db.json`** (705 KB, `saved_at`
2026-11-19T23:37Z). Struktur: `{ version, saved_at, collections, data }`;
koleksi ada di dalam `data`, bukan di root.

Isi saat diperiksa: **43 order**, **407 produk**, **2 bahan**, 0 resep,
0 nota belanja, 3 user, 14 shift. Semua `products.cost = 0` dan belum ada
`cost_price` — HPP/COGS baru terisi setelah nota pertama diinput.

Mutasi API disimpan lewat debounce saver ke berkas ini. Migrasi saat boot
**tidak** menulis snapshot.

**PostgreSQL (`pg-grandpos`) khusus analitik:**

| Item | Nilai |
|---|---|
| Container | `pg-grandpos` · `postgres:16-alpine` |
| Port | `127.0.0.1:5432` |
| Volume | `/srv/pgdata/grandpos` (**data asli di sini**) |
| Role aplikasi | `grandpos_app` |
| Pemakai | `grandpos-analytics.service` (:8000), `grandpos-mcp.service` (:8001) |

`POSTGRES_*` sengaja tidak diduplikasi di compose: cluster sudah diinisialisasi,
kredensial hidup di `.env` analytics.

**`pg-hindsight`** (`pgvector/pgvector:pg16`, `127.0.0.1:5433`,
`/srv/pgdata/hindsight`) terpisah — memori agen, bukan data POS.

> Konsekuensi: laporan POS **tidak** membaca PostgreSQL. Kalau butuh angka
> historis di SQL, datanya harus disalin lebih dulu oleh pipeline analitik.

---

## 5. Analytics API & MCP

**`grandpos-analytics.service`** — FastAPI (`app/api.py`) di `0.0.0.0:8000`,
`EnvironmentFile=/root/grandpos/backend-landing-page/.env`.
Verifikasi: `curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8000/health`
(dari luar tanpa kunci, `/api/landing/config` menjawab **401** — itu benar).

**`grandpos-mcp.service`** — `MCP_HOST=127.0.0.1`, `MCP_PORT=8001`,
`MCP_DATABASE_URL` ke role `grandpos_app`. Dipakai profil Hermes
`business-analyst` lewat tool `mcp__grandpos__*`.

**Modul utama `app/`:** `api.py`, `services.py` (logika bisnis), `rules.py`,
`edge_sync.py` (sinkron Pi ↔ gudang), `mcp_reports.py`, `mcp_server.py`,
`outbox*.py` (antrean WA), `guard.py`, `signing.py`, `db.py`, `parsers.py`.

Panduan operasional: `migration-meta/PANDUAN-ANALYTICS-SERVICE.md`.

---

## 6. Akses jaringan

**Gudang (100.70.161.30):**
| Port | Layanan | Catatan |
|---|---|---|
| 3000 | POS engine | **akses utama POS**; juga dipanggil Pi |
| 8000 | Analytics API | FastAPI systemd |
| 8001 | MCP | loopback saja |
| 5432 / 5433 | PostgreSQL | loopback saja |
| 80 / 443 | `kiri` port mapper | 404, bukan web server |
| 9119 | Hermes dashboard | tailnet |
| 10000 (Funnel) | Beszel | `https://gudang7783.tailf3a839.ts.net:10000` |
| 20128 | 9Router (AI gateway) | tailnet only |

Tidak ada lagi `landing.<host>` maupun `/var/www/landing`.

**Pi (100.109.98.56)** — nginx dalam container, mode kiosk:
| Location | Target |
|---|---|
| `/` | SPA POS lokal (`/usr/share/nginx/html`), fallback `index.html` |
| `/api/` | proxy ke POS di gudang (IPv4 tailnet, **bukan hostname** — IPv6 tak terjangkau) |
| `/ota/` | **lokal** (`/ota/bundle.zip`, `/ota/version.json`) |
| `/static/` | lokal |

Bukti 2026-11-20: `GET http://100.109.98.56/api/health` → 200 (proxy hidup),
`GET /api/ota/version` → `2.10.20261119160316` (dari server).

---

## 7. Dependency chain

```
Browser / Pi
   │
   ├─ port 80 Pi ──► nginx container (SPA kiosk)
   │                    ├─ /            → SPA lokal
   │                    ├─ /api/*       → 100.70.161.30:3000 (POS)
   │                    └─ /ota/*       → berkas lokal Pi
   │
   └─ port 3000 Gudang ──► grandpos_web_app (Express)
                              ├─ /api/*  → api-server.js
                              └─ /       → dist/ (SPA)

grandpos-analytics (8000) ─┐
grandpos-mcp (8001) ───────┼──► pg-grandpos (5432, /srv/pgdata/grandpos)
                           ┘
grandpos_web_app ──► data/pos-db.json (sumber kebenaran POS)
        └──────────► GrandPOS Analytics API (ANALYTICS_URL, opsional)
        └──────────► webhook Hermes `127.0.0.1:8644` (dikonfigurasi; listener
                     tidak aktif saat verifikasi 2026-11-20)
```

**Urutan start:** `pg-grandpos` → `grandpos_web_app` → `grandpos-analytics` →
`grandpos-mcp`. Kalau PostgreSQL mati, POS **tetap jalan** (data dari JSON);
yang mati hanya analitik/MCP.

---

## 8. Perintah operasional

```bash
# Status
docker ps
docker compose ls
systemctl status grandpos-analytics grandpos-mcp

# Semua container POS (adopsi Compose 2026-11-19)
cd /root/grandpos-project/pos-engine
docker compose -f deploy/docker-compose.host.yml up -d
docker compose -f deploy/docker-compose.host.yml ps

# Restart POS setelah ubah server-side
sudo docker restart grandpos_web_app
curl -sS http://127.0.0.1:3000/api/health

# Build frontend + OTA
cd /root/grandpos-project/pos-engine/project/frontend
sudo npm run build
sudo rsync -a --delete build/ ../../dist/     # atau ikuti catatan rilis

# Analytics / MCP
sudo systemctl restart grandpos-analytics
curl -sS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8000/health
```

`deploy/docker-compose.host.yml` mendefinisikan `watchtower`, tetapi
container-nya **tidak dijalankan** — jangan `up` tanpa sengaja, karena itu
mengaktifkan auto-update image.

---

## 9. Repo & dokumen

- Repo: `taqim2609/GrandPosoptima` (`main`). Kode POS di `pos-engine/`.
- POS terakhir dipush: `2a72351` (HPP otomatis dari nota).
- `landing-page/` = kode FastAPI/gateway (impor 2026-11-20).
- Dokumen: `migration-meta/`, `docs/`, `HANDOVER.md`.
- Di host ada dua salinan kode: `/root/grandpos-project` (kerja/repo) dan
  `/root/grandpos` (dipakai unit systemd). Lihat jebakan di §10.

---

## 10. Jebakan yang sudah pernah menggigit

| Jebakan | Akibat | Pencegahan |
|---|---|---|
| Dua salinan kode (`grandpos` vs `grandpos-project`) | Edit di satu tempat, yang jalan di tempat lain | Samakan berkas lalu restart unit; unit systemd menunjuk `/root/grandpos/...` |
| Lupa restart setelah ubah `api-server.js` | Kode disk ≠ kode berjalan | `docker restart grandpos_web_app` |
| Anggap PostgreSQL = data POS | Laporan/angka kosong, query tidak cocok | POS memakai `data/pos-db.json`; PostgreSQL hanya analitik |
| `POSTGRES_*` dihapus dari compose | Cluster lama aman, tapi re-init di volume kosong gagal | Jangan recreate volume `/srv/pgdata/grandpos` |
| Menjalankan `watchtower` | Image POS bisa diganti di tengah jam kasir | Biarkan service itu tidak dijalankan |
| Proxy Pi pakai hostname | Resolve IPv6, tak terjangkau → 000 | Pakai IPv4 tailnet |
| IP lama `100.117.186.13` | Koneksi gagal (host sekarang `100.70.161.30`) | Perbarui konfigurasi, jangan salin dokumen lama |
| Mengaktifkan `sw.js` | Cache service worker nyangkut | Jangan aktifkan |
| Menghapus `polyfills.js` | APK lama rusak | Jangan hapus |
| Dynamic import / chunk splitting | Bug chunk load di WebView | Jangan tambah |
| `rsync --delete` saat push | Menghapus berkas repo yang tidak ada lokal | Tanpa `--delete`, exclude cache |

---

## 11. Backup & rollback

Semua di `/root/backups/grandpos/` (root-only, 5,9 GB; akses perlu `sudo`):

| Isi | Keterangan |
|---|---|
| `pre-compose-20261119/` | `grandpos.sql` + `pos-db.json` sebelum adopsi Compose |
| `pos-db-pre-cutover-20261118T155637Z.json` | snapshot JSON sebelum cutover 2026-11-18 |
| `pos-db-before-docker-recovery-20261118T165918Z.json` | snapshot sebelum recovery Docker |
| `pre-grandpos-migration-20261117T172232Z.dump` | dump PostgreSQL pra-migrasi |
| `container-grandpos-web-app-pre-cutover-*.json` | `docker inspect` container lama |
| `runtime-pre-recovery-20261118T162915Z/` | backup runtime `docker/`, `containerd/`, `etc-docker/` (5,9 GB) |
| `containerd-meta-corrupt-20261118T162120Z.db` | salinan forensik metadata containerd yang korup |
| `docker-ghost-*/` | sisa/ghost container yang dibersihkan |

- **Volume PostgreSQL:** `/srv/pgdata/grandpos`, `/srv/pgdata/hindsight`.
- **Snapshot JSON POS:** salin `pos-engine/data/pos-db.json` sebelum mutasi besar.
- **Backup Pi:** `/tmp/pi-nginx-default.conf.bak.*` (di host Pi, hilang setelah reboot).
- **Rollback Compose:** lihat `migration-meta/PANDUAN-COMPOSE-HOST.md` §8.

> Backup produksi lama 2026-10-30 yang dulu disebut di dokumen ini
> (`/root/backup-grandpos-20261030-114909/`) **sudah tidak ada** di disk.

---

## 12. Status fitur & hal terbuka

**Sudah jalan:** HPP otomatis dari nota (foto/ketik → moving average → pilih
produk tanpa qty → prediksi → terapkan), COGS snapshot di laporan profit,
WhatsApp satu sumber `settings.wa`, branding satu sumber `db.platform`,
Compose host, Analytics API systemd.

**Belum / terbuka:**

1. **HPP live masih 0** — belum ada nota belanja maupun resep; menunggu input pemilik.
2. **OTA di Pi tertinggal.** Pi melayani `/ota/version.json` versi
   `2.10.20261118183852` (bundle 659.379 B), sedangkan server sudah
   `2.10.20261119160316` (660.030 B). Endpoint `/api/ota/version` di Pi
   meneruskan versi server, jadi hanya berkas lokal Pi yang belum disalin.
3. **Dua akun live** `kasir` dan `admin` masih aktif dengan PIN sama; `admin`
   ber-izin penuh. Perlu keputusan pemilik.
4. **Kunci AI** tersimpan di `settings.ai` (belum dimigrasi ke `db.ai`).
5. **Cetak struk tepat 1 lembar** belum terbukti di printer fisik.
6. **Jest & ESLint P1A** masih gagal (pre-existing, bukan akibat perubahan ini).
7. **`dist/` menyimpan beberapa bundle lama** (`main.03a49497.js`,
   `main.49e6eb94.js`, `main.70f4893f.js`) — sampah build, tidak dibersihkan
   agar APK yang masih menunjuk bundle lama tidak rusak.
8. **Webhook Hermes belum aktif di host** — `HERMES_WA_WEBHOOK_URL` masih
   menunjuk `127.0.0.1:8644`, tetapi port 8644 tidak listen saat verifikasi.
   Jangan menganggap pengiriman WA outbox aktif sebelum gateway dijalankan dan
   diuji.
