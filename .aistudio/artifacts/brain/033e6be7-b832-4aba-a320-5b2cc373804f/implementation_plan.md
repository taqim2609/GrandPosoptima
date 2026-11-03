# Migrasi Backend Rust, PRD Planora v3.0, & Panduan Komprehensif Hermes Agent

Rencana komprehensif arsitektur migrasi backend Grand Aceh Kuliner POS ke Rust (Axum/Tokio), pemisahan server frontend dan backend secara mandiri, penyusunan PRD Planora baru, penyediaan panduan AI Hermes Agent untuk modifikasi kode, pembaruan APK ke versi 3.0.0, serta audit integritas teks dan penghapusan istilah asing.

> [!IMPORTANT]
> **Keputusan Kunci & Konfirmasi Revisi (Hasil Klarifikasi Pengguna)**:
> - **Versi Rilis APK & OTA**: Ditetapkan sebagai **Versi 3.0.0 (Rilis Mayor Migrasi Arsitektur)**, memperbarui bundle OTA, metadata Capacitor, dan file APK release.
> - **Cakupan Panduan Hermes Agent**: **Komprehensif (Semua Aspek)** — mencakup standar aturan modifikasi kode, Golden Rules, prompt instruksi perbaikan/penambahan fitur, integrasi webhook otomatisasi WhatsApp 2-arah (HMAC V2), dan utilitas CLI toolchain.
> - **Hasil Audit "Vibecoder"**: Telah diperiksa melalui pemindaian menyeluruh di repositori (`grep`) dan terkonfirmasi **0 temuan (bersih)**. Seluruh terminologi dipastikan konsisten menggunakan standar resmi **Grand Aceh Kuliner POS**.
> - **Pemisahan Server Terisolasi**: Backend Rust berjalan sebagai daemon HTTP native mandiri (port 8000), frontend Vite/React berjalan di server terpisah (port 3000), dihubungkan via reverse proxy / environment `VITE_API_BASE_URL`.

---

## 1. Overview & Core Concept

- **Tujuan Utama**: Mentransformasi fondasi sistem Grand Aceh Kuliner POS menjadi arsitektur dual-service generasi baru:
  1. *Backend Rust Engine*: Layanan performa tinggi, zero-cost abstractions, memory-safe, dan startup instan (<50ms) yang sangat efisien untuk Raspberry Pi 3/4 dan terminal Sunmi T2.
  2. *Frontend Web & APK v3.0.0*: Antarmuka kasir layar sentuh React 19 berbasis single-bundle CRACO/Vite dengan dukungan thermal printer Sunmi, laci kasir otomatis, dan antrean offline IndexedDB.
- **Hermes Agent Operational Readiness**: Agen AI Hermes (Nous Research) dibekali dokumen panduan modifikasi kode yang mendalam agar agen dapat secara mandiri memelihara, memperluas fitur, memperbaiki bug, dan mengeksekusi otomatisasi WhatsApp tanpa merusak *Golden Rules* POS.
- **Target Pengguna**: Kasir restoran & retail, manajer toko, teknisi deployment, dan pengembang/agen AI otomatis.

---

## 2. User Experience & Visual Design

- **Stabilitas & Latensi Transaksi**:
  - Penambahan pesanan menu, scan barcode produk retail, dan perhitungan timbangan berat (ons/kg) memberikan feedback instan (<5ms) di layar kasir.
  - Alur dialog pembayaran multi-metode (Tunai, QRIS Netzme, Debit) dengan perhitungan kembalian dan pemisahan otomatis kas F&B vs Retail.
- **Indikator Diagnostik Server Mandiri**:
  - Menu Diagnostik dan System Health menampilkan status independen antara *Frontend Server* dan *Backend Rust Core Engine* dengan latency probe real-time.
- **Konsistensi Visual & Tipografi**:
  - Tema visual konsisten: Slate gelap untuk sidebar navigasi kasir, aksen Merah Aceh (`#E63946`) untuk aksi utama dan badge status, tipografi Manrope & Work Sans untuk angka kasir yang mudah dibaca dari jarak pandang kasir.

---

## 3. Key Product Decisions & Trade-Offs

- **Keputusan 1: Pemisahan Fisik Server Frontend & Backend**
  - *Pendekatan*: Frontend (port 3000) dan Backend (port 8000) berjalan sebagai dua proses terpisah. Di level runtime produksi lokal/VPS, Nginx atau Caddy bertindak sebagai ingress reverse proxy yang mengarahkan request `/api/*` ke backend Rust dan request lainnya ke frontend statis/SPA.
  - *Alasan*: Menghilangkan ketergantungan monolitik; frontend APK Android dapat langsung berkomunikasi ke backend mana pun melalui Tailscale mesh tanpa membutuhkan server Node.js perantara.

- **Keputusan 2: Pembaruan APK & Versi OTA ke 3.0.0**
  - *Pendekatan*: Menetapkan nomor versi `3.0.0` pada `package.json`, `capacitor.config.json`, `public/ota/version.json`, serta memperbarui nama file rilis APK menjadi `Grand-Aceh-Kuliner-POS-v3.0.0.apk`.
  - *Alasan*: Menandai lompatan arsitektural dari backend script Python/Node ke native compiled binary Rust.

- **Keputusan 3: Desain Panduan AI Hermes Agent (Self-Guiding Instructions)**
  - *Pendekatan*: Membuat dokumen panduan operasional lengkap di `PANDUAN-HERMES-AGENT.md` dan `dokumentasi/05-PANDUAN-KODING-HERMES-AGENT.md` yang merinci:
    1. Konvensi struktur direktori dan cara memodifikasi kode tanpa melanggar Golden Rules.
    2. Format prompt sistem untuk agen Hermes saat menangani task bug fix, penambahan endpoint, dan pengujian.
    3. Standar webhook WhatsApp 2-arah dengan autentikasi HMAC SHA256.
    4. Penggunaan script CLI pemeliharaan database dan indeks berkas.

---

## 4. Technical Architecture & Data Strategy

### Diagram Arsitektur Sistem Terpisah (v3.0.0)

```
┌────────────────────────────────────────────────────────────────────────┐
│                        CLIENT LAYER (FRONTEND)                         │
│                                                                        │
│   ┌─────────────────────────┐           ┌───────────────────────────┐  │
│   │   Sunmi T2 APK v3.0.0   │           │   Web POS & Back-Office   │  │
│   │   (Capacitor + Capgo)   │           │   (React 19 / Port 3000)  │  │
│   └────────────┬────────────┘           └─────────────┬─────────────┘  │
└────────────────┼──────────────────────────────────────┼────────────────┘
                 │                                      │                 
                 ▼                                      ▼                 
┌────────────────────────────────────────────────────────────────────────┐
│                      REVERSE PROXY & GATEWAY INGRESS                   │
│                                                                        │
│   • /api/*                   ──► Rust Backend Engine (Port 8000)       │
│   • /webhooks/hermes/*       ──► Hermes WA Dispatcher Adapter          │
│   • /*                       ──► Static Assets / SPA (Port 3000)       │
└────────────────────────────────────┬───────────────────────────────────┘
                                     │                                    
                                     ▼                                    
┌────────────────────────────────────────────────────────────────────────┐
│                    RUST BACKEND CORE (Port 8000)                       │
│                     [Axum 0.8 + Tokio Asynchronous]                    │
│                                                                        │
│   ┌─────────────────────┐  ┌──────────────────┐  ┌─────────────────┐   │
│   │ Tower HTTP & CORS   │  │ JWT Auth & RBAC  │  │ Idempotent Sync │   │
│   └──────────┬──────────┘  └────────┬─────────┘  └────────┬────────┘   │
│              │                      │                     │            │
│   ┌──────────▼──────────────────────▼─────────────────────▼────────┐   │
│   │                     DOMAIN LOGIC MODULES                       │   │
│   │  • Order Engine (F&B / Retail Strict Type Isolation)           │   │
│   │  • Weight-Scale Math (rust_decimal 128-bit fixed point)        │   │
│   │  • Consignment Vendor Split & Shift Closing Reconciliation    │   │
│   │  • Sunmi ESC/POS Monospace Receipt Streamer                    │   │
│   └─────────────────────────────────┬──────────────────────────────┘   │
└─────────────────────────────────────┼──────────────────────────────────┘
                                      │                                   
                 ┌────────────────────┴───────────────────┐               
                 ▼                                        ▼               
      ┌──────────────────────┐               ┌────────────────────────┐   
      │   MongoDB Primary    │               │  SQLite Edge Replica   │   
      │   (Driver mongodb)   │               │  (Emergency Offline)   │   
      └──────────────────────┘               └────────────────────────┘   
                 ▲                                                        
                 │ (Audit / Reports / Inbound Orders)                     
                 ▼                                                        
┌────────────────────────────────────────────────────────────────────────┐
│                   HERMES AGENT AI AUTOMATION SYSTEM                    │
│                                                                        │
│   • OpenAI-Compatible REST API (/v1/chat/completions)                  │
│   • WhatsApp Gateway 2-Arah (Baileys + Webhook HMAC SHA256)            │
│   • Automated Daily Sales Digest & Low Stock Warnings                  │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 5. Rencana Penyusunan Dokumen Planora v3.0

1. **`.planora/PRD/fitur/migrasi-backend-rust.md`**:
   - Spesifikasi fitur teknis migrasi dengan kode kebutuhan stabil:
     - `[RUST-FR-001]` Runtime Axum & Tokio asynchronous multi-threaded.
     - `[RUST-FR-002]` Pemisahan port dan isolasi server frontend-backend.
     - `[RUST-FR-003]` Perhitungan mata uang Rupiah & timbangan berat dengan fixed-point precision.
     - `[RUST-FR-004]` Pemrosesan transaksi titipan vendor dan tutup shift satu pintu.
     - `[RUST-FR-005]` Autentikasi JWT RS256/HS256 dengan proteksi anti brute-force.
     - `[RUST-FR-006]` Antrean sinkronisasi offline ber-ID unik `client_ref`.
     - `[RUST-FR-007]` Generator cetak struk ESC/POS 58mm/80mm monospace.
     - `[RUST-FR-008]` Endpoint audit & webhook adapter untuk Hermes Agent AI.
   - Kriteria penerimaan terukur (`[RUST-AC-001]` s/d `[RUST-AC-008]`).
2. **`.planora/PRD/PRD.md`**:
   - Pembaruan dokumen induk PRD yang mencatat transisi ke versi 3.0.0, arsitektur server terpisah, dan spesifikasi performa.
3. **`.planora/DX/api-rust-ergonomics.md` & `api-ergonomics.md`**:
   - Panduan API Rust dengan dokumentasi skema OpenAPI dan format error standar RFC 7807.
4. **`.planora/EXECUTION/TODO.md` & Phase 03**:
   - Buku besar tugas implementasi bertahap dari scaffolding Cargo hingga pengujian integrasi.

---

## 6. Rencana Panduan Koding AI Hermes Agent

Dokumen panduan baru `dokumentasi/05-PANDUAN-KODING-HERMES-AGENT.md` dan pembaruan `PANDUAN-HERMES-AGENT.md`:
- **Aturan Modifikasi Kode (Strict Conventions)**:
  - Larangan memodifikasi `OfflineContext.jsx` dan mengaktifkan `sw.js`.
  - Aturan single-bundle CRACO (tanpa dynamic import) demi Sunmi Android 7.
  - Larangan menampilkan kode teknis (`[SCR-*]`, `*-FR-*`, dll.) pada antarmuka kasir.
  - Selalu menggunakan ikon Lucide, bukan emoji.
  - Aturan pembulatan Rupiah dan pemisahan mutlak F&B vs Retail.
- **Workflow Agen AI**:
  - Langkah-langkah membaca berkas sebelum menulis (`Read-Before-Write`).
  - Cara mengeksekusi pengujian regresi dan verifikasi build frontend/backend.
  - Prosedur pembaruan indeks berkas secara otomatis via `python3 project/scripts/update_file_index.py`.
- **Integrasi WhatsApp & Webhook**:
  - Format payload webhook HMAC SHA256 untuk perintah bot `/stok`, `/laporan-shift`, `/omzet`.

---

## 7. Rencana Rilis Pembaruan APK v3.0.0 & Kebersihan Repositori

1. **Pembaruan Nomor Versi ke 3.0.0**:
   - `package.json`: `"version": "3.0.0"`
   - `capacitor.config.json`: Sinkronisasi versi dan nama aplikasi.
   - `public/ota/version.json`: Pembaruan rilis OTA v3.0.0.
   - Penyiapan paket APK rilis `Grand-Aceh-Kuliner-POS-v3.0.0.apk`.
2. **Pembersihan Istilah & Penulisan**:
   - Konfirmasi hasil pencarian: Istilah "vibecoder" telah dicek dan **0 temuan** di repositori.
   - Standarisasi penulisan nama di seluruh dokumentasi dan meta tag: **Grand Aceh Kuliner POS**.
3. **Verifikasi Server Terpisah**:
   - Memastikan `server.ts` dan konfigurasi dev/prod memisahkan penanganan static frontend dan backend API dengan route proxy `/api/*` yang bersih.
