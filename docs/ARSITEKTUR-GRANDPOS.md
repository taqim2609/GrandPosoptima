# GrandPOS — Arsitektur & Dependency (dokumen acuan)

> Diverifikasi langsung dari sistem pada **2026-10-30 21:55 WIB** (bukan dari ingatan/laporan agen).
> Kalau ada yang tidak cocok dengan kenyataan, **dokumen ini yang salah** — periksa ulang sistem lalu perbarui.

---

## 1. Gambaran besar — 3 node

```
┌─────────────────────┐        ┌──────────────────────┐        ┌─────────────────────┐
│  PI (kasir fisik)   │        │  GUDANG-644 (VPS)    │        │  Tailscale tailnet  │
│  100.109.98.56      │◄──────►│  100.117.186.13      │◄──────►│  tailf3a839.ts.net  │
│  Raspberry Pi       │  HTTP  │  Debian cloud        │        │                     │
└─────────────────────┘        └──────────────────────┘        └─────────────────────┘
```

| Node | Hostname tailnet | IP tailnet | Peran |
|---|---|---|---|
| Pi | `kasir-pi` | `100.109.98.56` | Kasir fisik di restoran. Nginx + SPA POS. **Mode kiosk**. LAN statis `192.168.8.254` — ini alamat resmi kasir. |
| Gudang-644 | `gudang-644.tailf3a839.ts.net` | `100.117.186.13` | VPS: backend API, DB, landing, MCP, WA gateway. **Landing page saja** — POS ditutup. |
| Landing | `landing.gudang-644.tailf3a839.ts.net` | (alias ke Gudang) | Subdomain landing page |

SSH Pi: `taqim258@100.109.98.56` (bukan root).

---

## 2. P1A — `grandpos_web_app` (POS engine, Node)

**Container:** `grandpos_web_app` · image `node:20-alpine` · port `0.0.0.0:3000->3000`

**Compose:** `/root/grandpos/deploy/docker-compose-p1a.yml` (project `deploy`, network `deploy_gak_network`)

**Source (bind mount rw):** `/root/grandpos/pos-engine` → `/app`

**Entrypoint:** `pos-engine/server.ts` → `require('./api-server.js')`
- `server.ts` hanya wrapper: import `api-server.js`, listen port 3000
- **`api-server.js` = 261 KB, file inti seluruh backend POS** (Express, semua route)
- Produksi: `express.static(dist)` + SPA fallback `index.html`
- Dev: Vite middleware mode

**Frontend:** `/root/grandpos/pos-engine/project/frontend/`
- Build: `craco` (CRA + override) → output `build/`
- `npm run build` = `FAST_REFRESH=false NODE_ENV=production craco build`
- `postbuild` = `node scripts/make-ota.js` → bikin `build/ota/bundle.zip` untuk OTA APK
- `npm run check:undef` = eslint config khusus deteksi undefined var
- 66 dependencies, 18 devDependencies
- **JANGAN** aktifkan `sw.js`, **JANGAN** hapus `polyfills.js`, **JANGAN** tambah dynamic import

**Static served:** `/root/grandpos/pos-engine/dist/` (dibuat oleh build)

**Aturan wajib baca sebelum sentuh kode:**
- `/root/grandpos/pos-engine/AGENTS.md` (7 KB — aturan emas UI)
- `/root/grandpos/pos-engine/project/AGENTS.md` (13 KB — instruksi proyek)

---

## 3. P1B — `grandpos-api-1` (FastAPI backend + landing API)

**Container:** `grandpos-api-1` · image `grandpos-api` (build lokal) · port `0.0.0.0:8000->8000`

**Compose:** `/root/grandpos/backend-landing-page/docker-compose.yml` (project name **`grandpos`**)
**Override:** `docker-compose.override.yml` (git-ignored) — buka port 8000 + bind DB ke Tailscale IP

**Source (bind mount):** `/srv/grandpos` → `/app` (lihat override)

**Stack:** FastAPI 0.143.0 + uvicorn 0.32.1 + pydantic 2.14.1 + psycopg 3.2.3 + PyYAML + httpx

**Modul (`app/`):**
| File | Fungsi |
|---|---|
| `api.py` (29.7 KB) | **Semua route HTTP**, termasuk `/api/landing/config` GET+PUT |
| `services.py` (36.9 KB) | Business logic inti |
| `mcp_reports.py` (33.6 KB) | Laporan MCP (sales, inventory, cash, member, dll) |
| `edge_sync.py` (19.6 KB) | Sinkronisasi Pi ↔ Gudang |
| `mcp_server.py` (19.1 KB) | MCP server (dipakai port 8001) |
| `outbox.py` / `outbox_delivery.py` | Antrean pesan WA keluar |
| `rules.py` (10.3 KB) | Validasi (`validate_landing_config`, dll) |
| `guard.py` (7.8 KB) | Auth/API key guard |
| `signing.py` (4.3 KB) | Signature request |
| `db.py`, `parsers.py`, `constants.py`, `healthcheck.py`, `mcp_db.py` | Pendukung |

**Endpoint landing:**
- `GET /api/landing/config` (butuh API key) → config dikelompokkan per section
- `PUT /api/landing/config` (butuh API key) → upsert + validasi section/key/value

---

## 4. Database — `grandpos-db-1`

**Container:** `grandpos-db-1` · image `postgres:16-alpine` · port `100.117.186.13:5432->5432`
**Volume:** named volume `grandpos_pgdata` → `/var/lib/postgresql/data` (**data asli di sini**)
**Timezone:** `Asia/Jakarta` (via `grandpos.timezone` setting)
**Dipakai bersama** oleh P1A dan P1B — **satu DB untuk semuanya**.

**Initdb mounts (urutan eksekusi, hanya jalan saat volume kosong):**
```
01-schema.sql          ← db/schema.sql (32 KB)
02-seed.sql            ← db/seed.sql (18 KB)
03-roles.sql           ← db/roles.sql
04-optimistic_lock.sql ← db/migrations/0002_optimistic_lock.sql
05-edge_sync.sql       ← db/migrations/0003_edge_sync.sql
06-landing_config.sql  ← db/migrations/0004_landing_config.sql   ← DITAMBAH 2026-10-30
```

**28 tabel:** `articles audit_logs cash_movements categories coupon_redemptions coupons edge_ingest_log edge_transactions ingredients inventory_movements landing_config member_point_ledger members order_items order_voids orders outbox_messages payments products promos recipes reservations settings shifts tables user_credentials users vendor_settlements vendors`

**Catatan penting:** initdb **hanya jalan sekali** saat volume kosong. Migration baru **tidak** otomatis diterapkan ke DB yang sudah ada — harus dijalankan manual atau recreate volume (berisiko).

---

## 5. Nginx Gudang-644

**Config:** `/etc/nginx/sites-available/grandpos` → symlink ke `sites-enabled/`

**Server block 1 — `gudang-644.tailf3a839.ts.net:80` (POS + API):**
| Location | Proxy ke | Guna |
|---|---|---|
| `/` | `127.0.0.1:3000` | SPA POS (P1A) |
| `/api/public/` | `127.0.0.1:3000` | API publik |
| `/api/pos/` | `127.0.0.1:3000` | API POS |
| `/api/mcp/` | `127.0.0.1:3000` | MCP via P1A |
| `/api/` | `127.0.0.1:3000` | API umum (catch-all) |
| `/mcp/` | `127.0.0.1:8001` | MCP server Python |
| `/wa-api/` | `127.0.0.1:8644/` | Hermes WA Gateway |

**Server block 2 — `landing.gudang-644.tailf3a839.ts.net:80` (landing):**
| Location | Target | Guna |
|---|---|---|
| `/` | `root /var/www/landing` + try_files → index.html | Landing SPA |
| `/static/` | `root /var/www/landing` (cache 1 tahun immutable) | Aset statis |
| `/api/landing/` | `127.0.0.1:8000` | Landing config API (P1B) |

**PENTING:** root landing = `/var/www/landing`, **bukan** `/root/grandpos/pos-engine/dist`.
Alasan: `/root` mode `700`, www-data tidak bisa baca. Build harus di-copy ke `/var/www/landing` setiap kali build ulang.

**Backup config:** `/etc/nginx/sites-available/grandpos.bak.*` + `/root/backup-grandpos-20261030-114909/grandpos.nginx.current`

---

## 6. MCP Server (port 8001)

**systemd:** `grandpos-mcp.service` (enabled, running)
- WorkingDirectory: `/root/grandpos/backend-landing-page`
- ExecStart: `venv_mcp/bin/python app/mcp_server.py`
- `MCP_HOST=127.0.0.1`, `MCP_PORT=8001`
- `MCP_DATABASE_URL` → `postgresql://grandpos_app@100.117.186.13:5432/grandpos`
- Restart=always, RestartSec=5

**Dipakai oleh:** profil Hermes `business-analyst` (laporan harian via tool `mcp__grandpos__*`)

---

## 7. Pi (kasir fisik)

**Container:** `project-frontend-1` · image `f995fc250554` · port `0.0.0.0:80->80`
**Compose working_dir (label):** `/home/taqim258/grand-aceh-pos/project` — **direktori ini sudah TIDAK ADA di disk**; container tetap jalan dari image.
**Nginx config di dalam container:** `/etc/nginx/conf.d/default.conf`

| Location | Target | Guna |
|---|---|---|
| `/` (root `/usr/share/nginx/html`) | try_files → SPA POS | **Mode kiosk** — root = POS, bukan landing |
| `/api/landing/` | `http://100.117.186.13:8000` | Landing config → P1B Gudang |
| `/api/` | `http://100.117.186.13` | API → nginx Gudang port 80 |
| `/static/` | lokal | Aset POS |
| `/ota/` | lokal | Bundle OTA APK |
| `/index.html` | lokal | SPA fallback |

**Catatan:** proxy pakai **IPv4 tailnet `100.117.186.13`**, bukan hostname — hostname resolve ke IPv6 yang tidak terjangkau container Pi.
**Redirect `/` → `/pos` sudah DIHAPUS** (2026-10-30): root langsung melayani SPA POS.
**Backup config Pi:** `/tmp/pi-nginx-default.conf.bak.*` (di host Pi, bukan container)

---

## 8. Dependency chain — siapa butuh siapa

```
Browser/Pi
   │
   ├─ port 80 Pi ──► project-frontend-1 (nginx + SPA POS)
   │                     ├─ /            → SPA lokal
   │                     ├─ /api/landing/ → 100.117.186.13:8000  (P1B)
   │                     └─ /api/        → 100.117.186.13:80    (nginx Gudang)
   │
   └─ port 80 Gudang ──► nginx
                            ├─ /              → 127.0.0.1:3000 (P1A)
                            ├─ /api/*         → 127.0.0.1:3000 (P1A)
                            ├─ /mcp/          → 127.0.0.1:8001 (MCP python)
                            ├─ /wa-api/       → 127.0.0.1:8644 (Hermes WA)
                            └─ Host: landing.*
                                 ├─ /           → /var/www/landing (static)
                                 └─ /api/landing/ → 127.0.0.1:8000 (P1B)

P1A (3000) ──┐
P1B (8000) ──┼──► grandpos-db-1 (5432, volume grandpos_pgdata)
MCP (8001) ──┘

P1A ──► Hermes WA Gateway 127.0.0.1:8644 (webhook outbox)
```

**Urutan start yang benar:** DB → P1B (api) → P1A (web) → MCP → nginx.
**Kalau DB mati:** P1A error 500, P1B error 500, MCP mati, landing config 500.

---

## 9. Perintah operasional

```bash
# Status
docker ps --filter name=grandpos
systemctl status grandpos-mcp nginx

# Rebuild P1B (JANGAN sentuh DB)
cd /root/grandpos/backend-landing-page
env -u DATABASE_URL docker compose up -d --build --no-deps api

# Rebuild P1A
cd /root/grandpos/deploy
docker compose -f docker-compose-p1a.yml up -d --build

# Build frontend POS
cd /root/grandpos/pos-engine/project/frontend
npm run build
cp -r /root/grandpos/pos-engine/dist/* /var/www/landing/   # WAJIB untuk landing

# Nginx
nginx -t && systemctl reload nginx     # reload, JANGAN restart

# Verifikasi cepat
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8000/api/landing/config
curl -s -o /dev/null -w "%{http_code}\n" -H "Host: landing.gudang-644.tailf3a839.ts.net" http://127.0.0.1/
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3000/
```

---

## 10. Jebakan yang sudah pernah menggigit

| Jebakan | Akibat | Pencegahan |
|---|---|---|
| `DATABASE_URL` di shell meng-override `.env` | api konek ke DB salah → HTTP 500 | `env -u DATABASE_URL docker compose ...` |
| `docker compose up` tanpa `--no-deps` | DB ikut di-recreate | Selalu `--no-deps` untuk api saja |
| Migration baru tidak di-mount | Tabel hilang saat DB fresh | Tambah ke `docker-entrypoint-initdb.d` |
| Landing root di `/root/...` | 403/500, www-data tak bisa baca | Copy ke `/var/www/landing` |
| Pi proxy pakai hostname | Resolve IPv6, tidak terjangkau → 000 | Pakai IPv4 `100.117.186.13` |
| `systemctl restart nginx` | Downtime | Pakai `reload` |
| Compose project P1B pernah hilang (`/root/grandpos-platform`) | Container dari image beku, kode drift | Compose benar: `/root/grandpos/backend-landing-page` |
| `sw.js` diaktifkan | Cache service worker nyangkut | Jangan aktifkan |
| `polyfills.js` dihapus | APK lama rusak | Jangan hapus |
| Dynamic import/chunk splitting | Bug chunk load di WebView | Jangan tambah |

---

## 11. Backup & rollback

- **Backup penuh produksi:** `/root/backup-grandpos-20261030-114909/`
  - `backup-grandpos-dump.sql` (DB dump)
  - `grandpos.nginx.current` (nginx Gudang)
  - `p1a-compose.yml`, `p1b-compose.yml`, `p1b-compose.override.yml`, `p1b.env`
  - `container-grandpos-api-1.json`, `container-grandpos_web_app.json`
  - `pre-d2-*` (snapshot sebelum rebuild P1B)
- **Repo git:** `pos-engine/.git` dan `backend-landing-page/.git` ada, tapi `/root/grandpos` sendiri bukan repo.
- **Pi:** `/tmp/pi-nginx-default.conf.bak.*`

---

## 12. Hal yang BELUM dikerjakan / diketahui

1. **Landing page = build POS yang sama** (`dist/`), bukan halaman landing terpisah. Kalau mau landing beda tampilan, perlu dibuat.
2. **Jest & ESLint P1A gagal** — 2 test suite error `Cannot use import statement outside a module`, eslint output JSON rusak. Pre-existing, bukan akibat perubahan 2026-10-30.
3. **Pi compose dir hilang** (`/home/taqim258/grand-aceh-pos/project` tidak ada). Container jalan dari image; rebuild Pi butuh rekonstruksi compose.
4. **`/root/grandpos-platform`** hampir kosong (sisa `db/`), tapi dulu sumber image P1B. Jangan dihapus sebelum yakin.
5. **`gak_watchtower_updater`** jalan, poll registry tiap 24 jam, update image otomatis — bisa mengejutkan kalau ada image baru.
