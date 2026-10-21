# Rencana Implementasi: Paket Dokumentasi Lengkap & Prompt Instalasi Hermes AI Agent

Dokumen ini merinci rencana pembuatan direktori `dokumentasi/` yang memuat seluruh prompt instalasi untuk Agen AI Hermes, panduan fitur & operasional kasir, fungsi lengkap seluruh file, serta indeks navigasi kode cepat untuk Grand Aceh Kuliner POS.

---

## 1. Analisis Arsitektur yang Sudah Ada (Existing Setup)

Berdasarkan inventaris repositori saat ini, sistem telah memiliki infrastruktur modular berbasis:
1. **Node 1: Server Gudang 644 (Cloud VPS)**
   - **Skrip Fondasi**: `bootstrap-vps.sh`, `scripts/install-vps-one-click.sh`.
   - **Komponen**:
     - POS Backend & MCP SSE Server (`server.ts` / Node 20 pada port `3000` atau FastAPI port `8000`).
     - Baileys WhatsApp Gateway (`HERMES_WA_WEBHOOK_URL` pada port `8644`).
     - Public Landing Page & Menu Online terintegrasi.
     - Nginx Reverse Proxy otomatis dengan sertifikat SSL Let's Encrypt / Caddy.
     - Master Database (PostgreSQL / MongoDB) yang menjadi sumber kebenaran tunggal (*single source of truth*).
2. **Node 2: GrandPOS (Raspberry Pi Toko)**
   - **Skrip Fondasi**: `bootstrap-pi.sh`, `install-pi.sh`, `setup-tailscale.sh`, `Buka-POS-Linux.desktop`.
   - **Komponen**:
     - React 19 Frontend Single-Bundle (CRACO/Vite) untuk layar sentuh kasir POS.
     - Koneksi printer thermal ESC/POS (USB/Bluetooth) & laci kasir (*cash drawer*).
     - Antrean sinkronisasi offline IndexedDB idempoten (`OfflineContext.jsx`) — transaksi tetap berjalan lancar saat internet padam dan otomatis tersinkronisasi saat online kembali.
3. **Jaringan Penghubung: Tailscale Private Mesh**
   - Menghubungkan Raspberry Pi di toko fisik dengan Gudang 644 secara aman tanpa perlu buka port publik atau IP publik statis di toko.

---

## 2. Struktur Paket Dokumentasi di Folder `dokumentasi/`

Seluruh dokumentasi akan dibuat rapi di dalam folder `/dokumentasi/` sesuai instruksi pengguna:

```
dokumentasi/
├── README.md                           # Pintu gerbang & indeks navigasi master dokumentasi
├── 01-PROMPT-HERMES-INSTALLER.md       # Prompt siap copy-paste untuk Agen AI Hermes (Instalasi Gudang 644 & Pi)
├── 02-PANDUAN-FITUR-DAN-PENGGUNAAN.md  # Manual operasional lengkap seluruh fitur POS, F&B, Retail, Vendor, WA, Promo
├── 03-FUNGSI-SELURUH-FILE.md           # Kamus arsitektur & fungsi detail tiap berkas (Backend, Frontend, Skrip)
└── 04-INDEX-NAVIGASI-KODE.md           # Indeks pencarian cepat file berdasarkan fitur & alur transaksi
```

---

## 3. Rincian Berkas Dokumentasi yang Akan Dibuat

### Berkas 1: `dokumentasi/01-PROMPT-HERMES-INSTALLER.md`
- **Tujuan**: Menjadi instruksi komprehensif, terstruktur, dan bebas ambiguitas yang siap dikirimkan langsung ke Agen AI Hermes untuk mengeksekusi instalasi mandiri di dua mesin:
  - **Instalasi Server Gudang 644**:
    - Persiapan environment (Docker, Node.js 20, Nginx, UFW).
    - Menjalankan Master Database & POS Backend Engine (Port 3000 / MCP SSE `/api/mcp/sse`).
    - Menjalankan WhatsApp Baileys Gateway di port 8644 & menghubungkan webhook.
    - Menyiapkan Landing Page publik pada domain outlet.
  - **Instalasi GrandPOS (Raspberry Pi)**:
    - Menjalankan bootstrap installer Pi (`bootstrap-pi.sh` / `install-pi.sh`).
    - Mengonfigurasi Tailscale agar tersambung ke Gudang 644 secara aman.
    - Mengatur autostart Kiosk Chromium mode layar sentuh untuk kasir (`Buka-POS-Linux.desktop`).
    - Verifikasi hardware: Port printer thermal USB/Bluetooth & cash drawer.
  - **Konfigurasi MCP Client pada Hermes**:
    - Cara menghubungkan Hermes ke SSE MCP Server (`http://<ip-tailscale>:3000/api/mcp/sse`).
    - Daftar 11 MCP Tools yang siap dipanggil Hermes untuk kontrol WhatsApp, server, promo, dan POS.
  - **Prosedur Pengujian & Healthcheck 1-Klik**:
    - Skrip verifikasi koneksi antar node, status database, outbox WA, dan printer thermal.

### Berkas 2: `dokumentasi/02-PANDUAN-FITUR-DAN-PENGGUNAAN.md`
- **Tujuan**: Panduan komprehensif untuk pemilik outlet, kasir, dan pengembang mengenai cara kerja dan penggunaan fitur:
  - **Modul Transaksi F&B**: Manajemen meja/dine-in, pesanan take-away, split bill, tiket dapur, reservasi meja.
  - **Modul Transaksi Retail**: Barcode scanner, multi-satuan, penjualan per berat (ons/kg) dengan kalkulasi dinamis.
  - **Titipan Vendor Konsinyasi (Satu Pintu)**: Mekanisme bagi hasil vendor, pencatatan otomatis saat tutup shift tanpa pemotongan ganda (*double-deduction*).
  - **Manajemen Shift Kasir**: Buka shift (modal awal), mutasi kas masuk/keluar, rekonsiliasi kas fisik vs sistem, hitung uang bersih F&B & Retail (`net_cash_fnb`, `net_cash_retail`).
  - **Diskon & Promo Dinamis**: Diskon persentase/nominal, kupon member, banner promo landing page (yang dapat dikelola langsung oleh Agen Hermes).
  - **WhatsApp Gateway Integrasi**: Pengiriman struk digital otomatis via Baileys port 8644, notifikasi reservasi, blast promo.
  - **Offline-First & Auto-Sync**: Alur kerja IndexedDB saat koneksi toko terputus dan pemulihan otomatis saat kembali online.
  - **Pengaturan & Audit Agen AI**: Antarmuka kontrol di `SettingsMCP.jsx` untuk memantau mutasi yang dilakukan oleh Hermes Agent.

### Berkas 3: `dokumentasi/03-FUNGSI-SELURUH-FILE.md`
- **Tujuan**: Penjelasan terperinci mengenai fungsi teknis setiap berkas dalam repositori:
  - **Backend & Integrasi**:
    - `server.ts` & `api-server.js`: Web server Express, proxy Vite, mounting endpoint `/api`.
    - `routes/mcpServer.js`: Model Context Protocol server (11 tools, 5 resources, 4 prompts, SSE stream).
    - `routes/agentRoutes.js`: Dedicated REST API untuk manajemen WhatsApp, cluster server, promo, dan audit log.
  - **Frontend Core & State**:
    - `src/contexts/OfflineContext.jsx`: IndexedDB sync queue (Aturan Emas: tidak boleh di-refactor).
    - `src/contexts/AuthContext.jsx`: Manajemen sesi kasir & RBAC peran pengguna.
    - `src/contexts/CartContext.jsx`: Keranjang belanja hybrid (F&B vs Retail terpisah).
  - **Komponen Halaman UI**:
    - `src/pages/POS.jsx`: Antarmuka kasir layar sentuh utama (katalog menu, pencarian, keypad bayar).
    - `src/pages/SettingsMCP.jsx`: Pusat kendali Agen AI, playground tool MCP, dan audit mutasi before/after.
    - `src/pages/LandingPage.jsx`: Etalase menu publik & banner promo interaktif.
  - **Skrip Instalasi & Pemeliharaan**:
    - Skrip bootstrap VPS & Pi, backup otomatis, sync Tailscale, dan perbaikan izin.

### Berkas 4: `dokumentasi/04-INDEX-NAVIGASI-KODE.md`
- **Tujuan**: Tabel lookup instan dan peta navigasi cepat:
  - Pencarian berdasarkan fungsi bisnis (misal: "Di mana letak kode hitung diskon?", "Di mana kode cetak struk ESC/POS?", "Di mana logika bagi hasil vendor?").
  - Menghubungkan konsep bisnis langsung ke berkas dan baris fungsi terkait.

### Berkas 5: `dokumentasi/README.md`
- **Tujuan**: Ringkasan indeks tingkat atas (*table of contents*) yang memudahkan siapa saja (manusia maupun AI) membuka panduan yang dibutuhkan.

---

## 4. Langkah Validasi & Penyelesaian
1. Membuat seluruh berkas dalam folder `/dokumentasi/`.
2. Menjalankan skrip pembaruan indeks berkas resmi:
   ```bash
   python3 project/scripts/update_file_index.py
   ```
   sehingga `INDEX-BERKAS.md` otomatis mencakup berkas-berkas dokumentasi baru.
3. Menjalankan `compile_applet` untuk memverifikasi bahwa seluruh struktur aplikasi tetap lulus kompilasi tanpa kesalahan.
4. Menyajikan ringkasan singkat yang mengarahkan pengguna ke folder `dokumentasi/`.
