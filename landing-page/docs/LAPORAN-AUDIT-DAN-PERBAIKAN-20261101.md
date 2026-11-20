# Laporan Hasil Audit dan Perbaikan GrandPOS Backend (FastAPI & MCP)

**Tanggal:** 1 November 2026 (WIB)  
**Host:** gudang-644 (Tailscale IP: 100.117.186.13)  
**Komponen:** P1B (`grandpos-api-1`:8000), MCP Server (`grandpos-mcp.service`:8001), PostgreSQL 16 (`grandpos-db-1`:5432)  
**Pemeriksa & Pelaksana:** Chieftain (Hermes Agent)

---

## 1. Ringkasan Eksekutif

Audit menyeluruh atas backend `backend-landing-page` (FastAPI + MCP Server) dilakukan melalui peninjauan kode dingin (*cold review*), pengujian regresi independen oleh subagent, uji mutasi (*mutation testing*), dan pengujian langsung pada container produksi yang berjalan.

Seluruh 48 task terkait pada board Kanban `kuliner` berstatus **DONE** dan terverifikasi secara fungsional. Seluruh 329 unit/integration tests lulus (29 skipped murni karena membutuhkan koneksi DB lokal tanpa mock).

---

## 2. Rincian Masalah yang Ditemukan dan Solusinya

### A. R-03-001: Divergensi Status Order & Validasi
- **Masalah:** `ORDER_STATUSES` di `app/constants.py` hanya berupa tuple konstanta yang tidak pernah diimpor atau divalidasi oleh modul logika bisnis `app/services.py` maupun `app/edge_sync.py`. Divergensi status antara Express (`open_bill`, `completed`, `paid`) dan FastAPI (`open`, `paid`, `void`) berisiko meloloskan status liar.
- **Perbaikan:**
  - `ORDER_STATUSES` diperbarui mencakup status kanonik: `("open_bill", "open", "completed", "paid", "void", "cancelled", "pending")`.
  - Fungsi validasi `_validate_order_status(status)` ditambahkan di `app/services.py` dan `app/edge_sync.py` untuk memvalidasi status pesanan sebelum mutasi atau pelaporan.
  - Test penjaga ditambahkan di `tests/test_rules.py`.

### B. R-03-002 & FIX-D: Format Mata Uang Rupiah (Canonical Format)
- **Masalah:** Terjadi divergensi format uang antar-layanan:
  - Struk WhatsApp (`app/outbox.py`): menggunakan format `Rp 76.000` (spasi + pemisah titik).
  - Laporan MCP (`app/mcp_reports.py`): menggunakan format `Rp76,000` (tanpa spasi + pemisah koma).
  - Tool MCP (`app/mcp_server.py`): memiliki 7 titik interpolasi raw string `Rp{...:,.0f}` (`Rp0`, `Rp76,000`).
- **Perbaikan:**
  - Format disatukan secara kanonik: `"Rp " + f"{int(value):,}".replace(",", ".")` (`_format_money()`).
  - `app/mcp_reports.py` dan seluruh 7 titik pada `app/mcp_server.py` dialihkan menggunakan helper kanonik tersebut.
  - Test di `tests/test_mcp_reports.py` diperbarui dari mengunci format salah `"Rp76,000"` menjadi `"Rp 76.000"`, ditambah suite penjaga `TestMcpServerMoneyFormat` yang melarang regex `Rp\{` di source `app/mcp_server.py`.

### C. R-03-003 & FIX-C: Batas Tanggal Laporan Mengikuti Timezone WIB (Asia/Jakarta)
- **Masalah:** Server menjalankan host/container dengan timezone UTC. Akibatnya:
  - Pemanggilan `date.today()` atau `datetime.now().date()` antara pukul 00:00–07:00 WIB menghasilkan tanggal UTC kemarin (misalnya tanggal 30 Oktober alih-alih 31 Oktober).
  - Tool `sales_today` di `app/mcp_server.py` dan fungsi `today_range()` menghitung omzet ke hari yang salah saat pagi hari.
- **Perbaikan:**
  - Ditambahkan helper terpusat `business_today()` dan `business_now()` di `app/db.py` dengan fallback environment `GRANDPOS_TZ` (default `Asia/Jakarta`).
  - Seluruh `date.today()` di `app/mcp_server.py` dan `app/parsers.py` dialihkan ke `business_today()`.
  - Test penjaga `test_wib_vs_utc_date_difference_at_midnight_crossover` di `tests/test_db.py` dan suite `tests/test_mcp_timezone.py` membuktikan test gagal jika sistem dipaksa UTC dan lulus dengan timezone WIB.

### D. R-04: Pembulatan Diskon Promo Menggunakan `ROUND_HALF_UP`
- **Masalah:** Pembagian diskon persentase sebelumnya menggunakan pembagian integer lantai `// 100`, memotong desimal dan merugikan perhitungan diskon rupiah.
- **Perbaikan:** Digantikan dengan fungsi `round_idr(Decimal(...) * Decimal(...) / Decimal(100))` menggunakan desimal dengan mode `ROUND_HALF_UP` di `app/rules.py`.

### E. R-05: Pemeriksaan Stok Bahan Sebelum Decrement
- **Masalah:** Memastikan `_consume_stock` di `app/services.py` memvalidasi kecukupan stok bahan resep sebelum mengurangkan kuantitas stok agar tidak terjadi stok negatif tanpa peringatan.
- **Perbaikan:** Guard divalidasi dan dilengkapi dengan unit test regresi di `tests/test_services_stock.py` (terbukti gagal saat guard stok dicabut).

### F. R-07 & R-08: Database Migrations & Host Rewrite MCP
- **Masalah:**
  - Migrasi `0002_optimistic_lock.sql` dan `0003_edge_sync.sql` sebelumnya tidak dimount di initdb compose, mengakibatkan instalasi fresh kehilangan tabel `edge_transactions`.
  - `_host_dsn()` menulis ulang host DB ke loopback `127.0.0.1` padahal PostgreSQL bind pada IP Tailscale `100.117.186.13`.
- **Perbaikan:**
  - Mount migrations 0002, 0003, dan 0004 dipasang lengkap di `docker-compose.yml`.
  - Rewrite compose host diarahkan ke IP Tailscale `100.117.186.13:5432` dengan override via `MCP_DB_HOST`.

### G. Perbaikan Kontrak API `LandingConfigIn` (P1B)
- **Masalah:** Model Pydantic `LandingConfigIn` menggunakan `model_config = {"extra": "allow"}` dengan field default kosong. Klien yang mengirim body tanpa pembungkus `{ config: ... }` (mis. `{"hero": {...}}`) diterima dengan HTTP 200 tetapi diabaikan secara diam-diam (silent no-op).
- **Perbaikan:**
  - Diubah menjadi `model_config = {"extra": "forbid"}` di `app/api.py`. Body tanpa wrapper ditolak tegas dengan **HTTP 422 Unprocessable Entity**.
  - Ditambahkan unit test kontrak di `tests/test_landing_rules.py`.

### H. Perbaikan Systemd MCP Server Crash-Loop
- **Masalah:** Penambahan impor `from app.db import business_today` pada `app/mcp_server.py` diletakkan sebelum bootstrap `sys.path.insert(0, _REPO_ROOT)`, menyebabkan service gagal start di bawah systemd (`ModuleNotFoundError: No module named 'app'`).
- **Perbaikan:** Impor dipindahkan setelah blok bootstrap `_REPO_ROOT`, service berjalan stabil.

### I. Opt-Out Watchtower Auto-Update
- **Masalah:** Container `gak_watchtower_updater` menjalankan polling tiap 24 jam dan mencoba menarik image `grandpos-api:latest` dari Docker Hub (menghasilkan log warning 401 Unauthorized), serta berisiko menimpa container produksi lokal jika nama image tabrakan di masa depan.
- **Perbaikan:** Ditambahkan label `com.centurylinklabs.watchtower.enable=false` pada service `api` di `docker-compose.yml`.

---

## 3. Hasil Verifikasi Pengujian

| Pengujian | Status | Rincian |
|---|---|---|
| **Pytest Full Suite** | **PASS** | 329 passed, 29 skipped (DB live), 0 failed |
| **Mutation Testing (WIB)** | **TERBUKTI** | Gagal saat timezone dipaksa UTC, lulus saat WIB |
| **Mutation Testing (Money)** | **TERBUKTI** | Gagal saat format uang dikembalikan ke format lama |
| **Live MCP Probe (`sales_today`)** | **PASS** | Melaporkan tanggal WIB `2026-11-01` & format `Rp 0` |
| **Live API Probe (`/health`)** | **PASS** | HTTP 200, `{"status":"ok","db":true}` |
| **Live API Contract (`PUT /api/landing/config`)** | **PASS** | HTTP 422 untuk body salah, HTTP 200 untuk body benar |
| **Database Integrity** | **PASS** | 33 tabel utuh, 37 record `landing_config`, 22 edge sync `applied` |

---

## 4. Hash File Produksi (Kesesuaian Container vs Disk)

Semua file berikut terverifikasi memiliki hash SHA-256 identik 100% antara file di host dan file di dalam container `grandpos-api-1`:
- `app/api.py`
- `app/db.py`
- `app/mcp_server.py`
- `app/mcp_reports.py`
- `app/outbox.py`
- `app/services.py`
- `app/constants.py`
- `app/edge_sync.py`
- `app/parsers.py`
- `app/rules.py`
