# TASK BREAKDOWN RATA-RATA (Evenly-Sized Tasks)
Target: ~1-2 jam per task, scope terbatas & jelas, tidak overlap.
Total: **24 task** (digabung dari Review 05-11 + Landing L-01-07).
Urutan eksekusi: **R-01 → R-24** (berurutan, dependency linear).

---

## KATEGORI A: Audit Backend (FastAPI / P1B) — 10 Task

### R-01  Audit API: Public Endpoints (`app/api.py` — public routes)
- **Scope**: Hanya endpoint public (`/api/public/*`: menu, articles, tables, booking)
- **File**: `app/api.py` (baris public routes), `app/constants.py`
- **Output**: Daftar endpoint + validasi input + error handling + status code
- **Bukan**: Auth endpoints, admin endpoints, internal routes

### R-02  Audit API: Auth & Admin Endpoints (`app/api.py` — protected routes)
- **Scope**: Endpoint butuh auth (`/api/auth/*`, `/api/admin/*`, `/api/settings/*`, `/api/reports/*`)
- **File**: `app/api.py` (baris protected routes), `app/guard.py` (import saja, baca tidak edit)
- **Output**: RBAC check, token validation, error response konsistensi
- **Bukan**: Public endpoints, MCP routes

### R-03  Audit API: Contract Alignment (Express vs FastAPI)
- **Scope**: Tabel perbandingan endpoint Express (P1A) vs FastAPI (P1B) yang fungsinya sama
- **File**: `app/api.py` + `pos-engine/api-server.js` + `pos-engine/routes/allMissingRoutes.js`
- **Output**: Tabel before/after: path, method, request/response schema, status code
- **Fokus**: status order (`completed` vs `paid`), money format, date format

### R-04  Audit Services: Money & Calculation (`app/services.py` — perhitungan uang)
- **Scope**: Fungsi harga, diskon, HPP, margin, pembulatan, vendor settlement
- **File**: `app/services.py` (fungsi terkait uang saja)
- **Output**: Daftar fungsi + tipe data (NUMERIC/BIGINT) vs float JS + edge case
- **Bukan**: Fungsi non-uang, DB connection

### R-05  Audit Services: Business Logic Non-Uang (`app/services.py` — lain)
- **Scope**: Fungsi stok, kategori, produk, member, shift, inventory (bukan uang)
- **File**: `app/services.py` (fungsi non-uang)
- **Output**: Daftar fungsi + validasi input + error handling

### R-06  Audit Database: Schema & Drift (`db/schema.sql`, `db/seed.sql`, `db/roles.sql`)
- **Scope**: Skema tabel, tipe data, constraint, indeks, seed data, role
- **File**: `db/schema.sql`, `db/seed.sql`, `db/roles.sql`
- **Output**: Daftar tabel + kolom kunci + drift vs in-memory `pos-engine` (tipe data, nama kolom)
- **Termasuk**: Identifikasi tabel yang butuh `landing_config` (R-13 nanti)

### R-07  Audit Database: Migrations & Connection (`db/migrations/`, `app/db.py`)
- **Scope**: File migrasi, koneksi DB, session management, pool
- **File**: `db/migrations/` (semua), `app/db.py`
- **Output**: Status migrasi (applied/pending), koneksi config, pool settings

### R-08  Audit MCP: Server & Tools Registry (`app/mcp_server.py`, `app/mcp_db.py`)
- **Scope**: MCP server setup, daftar 17 tool read-only, DSN koneksi
- **File**: `app/mcp_server.py`, `app/mcp_db.py`
- **Output**: Daftar tool + read-only enforcement + DSN check (grandpos vs paperclip-db)
- **Probe**: 1 tool read-only (mis. `sales_today`), catat output mentah

### R-09  Audit MCP: Reports (`app/mcp_reports.py`)
- **Scope**: Laporan `report_query`, `daily_turnover`, `inventory`, `vendor_settlement`, `cash_movements`, `shifts`, `members`, `products`
- **File**: `app/mcp_reports.py`
- **Output**: Daftar report + parameter + output schema + konsistensi data vs POS engine

### R-10  Audit Security & Sync (`app/guard.py`, `app/rules.py`, `app/signing.py`, `app/outbox.py`, `app/outbox_delivery.py`, `app/parsers.py`, `app/edge_sync.py`)
- **Scope**: Otorisasi, validasi aturan, signing, outbox queue, parsing, sinkronisasi P1A↔P1B
- **File**: 7 file di atas
- **Output**: Temuan per file: celah auth, validasi hilang, signing algo, idempotensi outbox, parser safety, sync mechanism (1-way/2-way, conflict resolution)

---

## KATEGORI B: Audit POS Engine (Express / P1A) — 6 Task

### R-11  Audit Routes: Cashier & POS Core (`pos-engine/api-server.js`, `routes/allMissingRoutes.js` — cashier routes)
- **Scope**: Rute kasir/transaksi: `/api/orders`, `/api/shifts`, `/api/payments`, `/api/cash`, `/api/void`, `/api/refund`
- **File**: `api-server.js` (cashier section), `allMissingRoutes.js` (cashier routes)
- **Output**: Auth guard, validasi, duplicate route, status code, money handling

### R-12  Audit Routes: Settings & Config (`pos-engine/api-server.js`, `routes/allMissingRoutes.js` — settings routes)
- **Scope**: Rute pengaturan: `/api/settings/*`, `/api/business/*`, `/api/landing/*` (existing), `/api/public/*`
- **File**: `api-server.js` (settings section), `allMissingRoutes.js` (settings routes)
- **Output**: Auth, validasi, konsistensi dengan FastAPI

### R-13  Audit Routes: MCP & Internal (`pos-engine/routes/mcpServer.js`, `routes/allMissingRoutes.js` — MCP/internal)
- **Scope**: 11 tool MCP pos_*, rute sintetis 200, rute internal/debug
- **File**: `mcpServer.js`, `allMissingRoutes.js` (MCP/internal section)
- **Output**: Read-only enforcement, input validation, synthetic route removal

### R-14  Audit Frontend: POS & Transaction Pages (pos-engine/project/frontend/src/pages)
- **Scope**: Halaman transaksional: `POS.jsx`, `Shift.jsx`, `Orders.jsx`, `Payments.jsx`, `VoidRefund.jsx`, `Cash.jsx`, `Tables.jsx`
- **File**: 7 file halaman di atas
- **Output**: Ketaatan AGENTS.md (ErrorBoundary key, format rupiah "Rp ", tanggal WIB, Lucide icons, no dynamic import)

### R-15  Audit Frontend: Settings & Master Data Pages
- **Scope**: Halaman settings & master: `Settings*.jsx` (12 file), `Categories.jsx`, `Products.jsx`, `Ingredients.jsx`, `Inventory.jsx`, `Members.jsx`, `Vendors.jsx`, `VendorSettlement.jsx`, `Users.jsx`, `Roles*.jsx`
- **File**: ~20 file halaman
- **Output**: Sama R-14 + validasi form, konsistensi UI

### R-16  Audit Frontend: Components, Lib, & Utilities
- **Scope**: 26 komponen + 23 lib (`components/`, `lib/`, `hooks/`, `context/`, `services/`, `config/`)
- **File**: Semua file di folder tersebut
- **Output**: Helper terpusat (format rupiah, tanggal WIB), no duplicate logic, ketaatan AGENTS.md

---

## KATEGORI C: Verifikasi Lintasan Produksi — 3 Task

### R-17  Verifikasi MCP Tools: Probe Read-Only (Express P1A + FastAPI P1B)
- **Scope**: Jalankan probe read-only minimal 2 tool per grup (P1A pos_*, P1B reports)
- **File**: Tidak edit file — hanya jalankan probe via terminal/curl
- **Output**: Output mentah JSON per tool + status OK/gagal + latency

### R-18  Verifikasi Infra: Nginx, Docker, Systemd, .env
- **Scope**: Cek konfigurasi produksi
- **File**: `/etc/nginx/sites-available/grandpos`, `docker-compose*.yml`, `/etc/systemd/system/grandpos*.service`, `.env` (Gudang & Pi)
- **Output**: Tabel: item, status (OK/perlu perhatian), catatan — **tidak restart, tidak edit**

### R-19  Verifikasi Coverage Uji: Pytest + Jest
- **Scope**: Cek test yang ada & yang hilang
- **File**: `backend-landing-page/tests/` (14 file pytest), `pos-engine/project/frontend/` (Jest config + test file)
- **Output**: Daftar area ber-test & tidak ber-test, rekomendasi penambahan

---

## KATEGORI D: Landing Page Implementation — 5 Task

### R-20  Landing-01: Inventarisasi & Keputusan Pohon Acuan
- **Scope**: Bandingkan `pos-engine/src/` vs `pos-engine/project/frontend/src/` untuk file landing. Tentukan pohon acuan (satu saja).
- **File**: 5 file di `src/` + 1 file di `project/frontend/src/`
- **Output**: Keputusan Qim (pilih pohon mana), daftar file yang dipindah/dihapus

### R-21  Landing-02A: Database Migration — Tabel `landing_config`
- **Scope**: Tambah tabel `landing_config` di `db/schema.sql` + migrasi + seed default dari `landing-page.config.js`
- **File**: `db/schema.sql`, `db/seed.sql`, `db/migrations/` (file baru)
- **Output**: Migrasi SQL + seed + verifikasi `node --check` / `psql` dry-run

### R-22  Landing-02B: API Endpoint `/api/landing/*` di FastAPI
- **Scope**: CRUD config landing di `app/api.py` + auth JWT (pakai guard existing) + validasi input
- **File**: `app/api.py` (tambah route), `app/guard.py` (referensi), `app/rules.py` (validasi)
- **Output**: Endpoint `GET/PUT /api/landing/config` + test manual curl

### R-23  Landing-03/04/05: Infrastructure (Nginx Gudang + Slim P1A + Nginx Pi)
- **Scope**: 
  - (a) Nginx Gudang: server block subdomain `landing.gudang-644...` → static build; `/api/landing/*` → P1B:8000
  - (b) Slim P1A: hapus cashier routes dari `api-server.js` & `allMissingRoutes.js`, landing jadi static served Nginx
  - (c) Nginx Pi: hapus redirect landing, tambah proxy `/api/landing/*` → Gudang:8000
- **File**: `/etc/nginx/sites-available/grandpos`, `pos-engine/api-server.js`, `pos-engine/routes/allMissingRoutes.js`, Pi nginx config
- **Output**: Config nginx baru (backup dulu), P1A slim build, Pi nginx config — **tidak restart, hanya file config**

### R-24  Landing-06/07: Frontend Pi + Verifikasi E2E
- **Scope**: 
  - (a) Pi frontend: hapus route landing, `SettingsLandingPage` panggil API Gudang `/api/landing/*`
  - (b) E2E: edit landing dari POS Pi → tersimpan PG → landing Gudang tampil baru
- **File**: `project/frontend/src/pages/SettingsLandingPage.jsx` (Pi), `project/frontend/src/services/landingService.js` (Pi), `project/frontend/src/App.js` (hapus route)
- **Output**: Perubahan file + bukti verifikasi manual (screenshot/log)

---

## DEPENDENCY LINEAR (wajib urut)

```
R-01 → R-02 → R-03 → R-04 → R-05 → R-06 → R-07 → R-08 → R-09 → R-10
    → R-11 → R-12 → R-13 → R-14 → R-15 → R-16 → R-17 → R-18 → R-19
    → R-20 → R-21 → R-22 → R-23 → R-24
```

**Catatan dependency khusus:**
- R-21 butuh R-06 (schema.sql) + R-07 (migrasi)
- R-22 butuh R-01/R-02 (api.py structure) + R-10 (guard/rules)
- R-23 butuh R-18 (nginx config) + R-11/R-12/R-13 (api-server.js routes)
- R-24 butuh R-14/R-15/R-16 (frontend structure) + R-22 (API ready)

---

## CONSTRAINTS (semua task)
- Read-only untuk R-01 s.d. R-19 (audit only, tidak edit kode)
- R-20 s.d. R-24: edit diperbolehkan tapi wajib bukti path+baris
- Tidak refactor `OfflineContext.jsx`, tidak aktifkan `sw.js`, tidak hapus `polyfills.js`, tidak dynamic import
- Tidak deploy tanpa otorisasi Qim
- Probe MCP hanya read-only
- Setiap task laporan Bahasa Indonesia dengan bukti mentah