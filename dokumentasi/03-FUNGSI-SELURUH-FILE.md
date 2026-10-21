# 🗂️ Kamus Arsitektur & Fungsi Seluruh Berkas
## Grand Aceh Kuliner POS & Ekosistem Hermes Agent

Dokumen ini memetakan seluruh struktur repositori dan merinci tanggung jawab teknis setiap berkas di lingkungan backend, frontend, skrip instalasi, dan integrasi hardware.

---

## 🏛️ Struktur Direktori Utama

```
├── .agents/                 # Konfigurasi skill dan aturan eksekusi agen AI
├── .planora/                # Spesifikasi produk, PRD, UI, DX, dan TODO ledger
├── dokumentasi/             # Dokumentasi master instalasi, fitur, dan panduan kode
├── project/                 # Repositori sumber backend FastAPI, frontend, dan skrip
├── public/                  # Aset statis peramban, ikon PWA, logo, audio, polyfills
├── routes/                  # Endpoint API terpadu (MCP SSE & REST API Agen Hermes)
├── scripts/                 # Utilitas PWA generator, OTA bundler, dan installer VPS
├── src/                     # Source code aplikasi React 19 Frontend
├── server.ts                # Entry point server full-stack Express & Vite middleware
└── api-server.js            # Standalone API server ringan untuk dev/prod mode
```

---

## 1. Berkas Konfigurasi & Root Server

| Nama Berkas | Lokasi | Bahasa/Tipe | Fungsi & Tanggung Jawab Teknis |
|---|---|---|---|
| `server.ts` | `/server.ts` | TypeScript (Node) | **Server Utama Aplikasi Full-Stack**. Menginisialisasi Express pada Port 3000, memasang Vite middlewares di lingkungan dev, meng-handle rute statis, dan me-mount seluruh router `/api` (termasuk MCP SSE dan Agent API). |
| `api-server.js` | `/api-server.js` | JavaScript (Node) | **Server REST API Standalone**. Menyediakan endpoint mock/live database in-memory untuk POS jika dijalankan secara independen tanpa bundler Vite. |
| `package.json` | `/package.json` | JSON | **Manifes Dependensi Node.js**. Mendefinisikan paket React 19, Lucide React, Tailwind CSS, Vite, TSX, Express, dan skrip build (`npm run build`, `npm run dev`, `npm start`). |
| `vite.config.mjs` | `/vite.config.mjs` | JavaScript | **Konfigurasi Bundler Vite**. Mengatur plugin React, port 3000, alias path `@/`, serta konfigurasi proxy backend. |
| `tailwind.config.js` | `/tailwind.config.js` | JavaScript | **Konfigurasi Tailwind CSS**. Tema warna outlet, font kustom, breakpoint responsive kasir tablet/desktop. |
| `metadata.json` | `/metadata.json` | JSON | **Metadata Proyek AI Studio**. Menyimpan nama aplikasi, deskripsi, kapabilitas server-side, dan hak akses sistem. |
| `index.html` | `/index.html` | HTML | **Entry Point Single-Page App (SPA)**. Memuat root DOM `#root`, font, meta viewport layar sentuh, dan polyfill esensial untuk Android 7. |
| `AGENTS.md` | `/AGENTS.md` | Markdown | **Aturan Emas Agen (Constitution)**. Pedoman ketat bagi seluruh developer & AI: Dilarang menyentuh `OfflineContext.jsx`, dilarang mengaktifkan `sw.js`, dilarang merusak kompatibilitas single-bundle. |
| `INDEX-BERKAS.md` | `/INDEX-BERKAS.md` | Markdown | **Katalog Inventaris Berkas Otomatis**. Daftar seluruh 600+ berkas dalam proyek yang di-generate oleh skrip `update_file_index.py`. |

---

## 2. Lapisan Integrasi & Rute Backend (`/routes`)

| Nama Berkas | Lokasi | Fungsi Teknis & Alur Data |
|---|---|---|
| `mcpServer.js` | `/routes/mcpServer.js` | **Server Protokol Model Context Protocol (MCP)**.<br>• Menyediakan endpoint SSE stream pada `GET /api/mcp/sse`.<br>• Mengimplementasikan **11 Tools MCP** untuk Agen Hermes (kelola WA, cluster server, voucher promo, banner landing page, mutasi audit, ringkasan kasir, stok produk, meja F&B).<br>• Menyediakan **5 Resources MCP** (status POS, konfigurasi WA, cluster, promo aktif, log audit).<br>• Menyediakan **4 Prompts MCP** bawaan untuk diagnosa kasir, audit keamanan, dan analisis promosi. |
| `agentRoutes.js` | `/routes/agentRoutes.js` | **REST API Terpadu Khusus Agen AI Hermes**.<br>• `GET /api/agent/whatsapp/status` & `POST /api/agent/whatsapp/config`: Mengubah konfigurasi Baileys WhatsApp.<br>• `GET /api/agent/server/cluster` & `POST /api/agent/server/cluster/config`: Mengatur node server cluster (Gudang 644 vs Pi).<br>• `GET /api/agent/promos` & `POST /api/agent/promos`: CRUD kupon diskon kasir.<br>• `POST /api/agent/promos/landing-banner`: Mengubah hero banner promo di Landing Page publik.<br>• `GET /api/agent/audit-logs`: Mengambil riwayat mutasi sebelum & sesudah dari aksi agen AI. |

---

## 3. Frontend Contexts & State Management (`/src/contexts`)

| Nama Berkas | Lokasi | Fungsi Teknis & Logika Bisnis |
|---|---|---|
| `OfflineContext.jsx` | `/src/contexts/OfflineContext.jsx` | **⚡ JANTUNG OFFLINE-FIRST (ATURAN EMAS: DILARANG ME-REFACTOR)**.<br>Mengelola antrean transaksi di IndexedDB lokal browser. Memastikan kasir tetap bisa checkout tanpa sinyal internet, mendeteksi status online/offline, dan melakukan sinkronisasi idempoten otomatis ke server saat jaringan kembali terhubung. |
| `AuthContext.jsx` | `/src/contexts/AuthContext.jsx` | **Autentikasi & RBAC Kasir**.<br>Menyimpan token JWT sesi login, profil kasir aktif, hak akses role (Kasir, Supervisor, Manager, Owner), dan fungsi logout aman. |
| `CartContext.jsx` | `/src/contexts/CartContext.jsx` | **State Keranjang Belanja Hybrid**.<br>Menyimpan item terpilih, mendeteksi mode transaksi (F&B Meja vs Retail Barcode), menghitung subtotal, diskon item, pajak resto, dan total akhir. Memisahkan transaksi F&B dan Retail agar tidak tercampur. |

---

## 4. Halaman Antarmuka Pengguna (`/src/pages`)

| Nama Berkas | Lokasi | Peran & Fitur Antarmuka |
|---|---|---|
| `POS.jsx` | `/src/pages/POS.jsx` | **Layar Kasir Layar Sentuh Utama**.<br>Katalog produk grid, pencarian cepat, filter kategori, pemindai barcode, pemilih meja F&B, kalkulator bayar tunai/QRIS/kartu, dan pemicu cetak struk thermal. |
| `LandingPage.jsx` | `/src/pages/LandingPage.jsx` | **Landing Page Publik & Menu Online**.<br>Etalase publik restoran untuk pelanggan eksternal. Menampilkan hero banner promo dinamis yang dapat dikendalikan Hermes Agent, katalog menu khas Aceh, jam operasional, dan kontak outlet. |
| `SettingsMCP.jsx` | `/src/pages/SettingsMCP.jsx` | **Pusat Kontrol MCP & Audit Agen AI**.<br>Menampilkan status SSE MCP Server, playground pengujian 11 MCP Tools langsung dari browser, dan tab **Audit Mutasi Agen AI** untuk melihat diff data Before/After dari aksi Hermes. |
| `ShiftManagement.jsx` | `/src/pages/ShiftManagement.jsx` | **Manajemen Shift & Rekonsiliasi Kas**.<br>Formulir buka shift (modal awal), input kas masuk/keluar, hitung otomatis uang bersih F&B & Retail, rekonsiliasi kas fisik vs sistem, setor hak vendor, dan cetak laporan Z-Report. |
| `VendorManagement.jsx`| `/src/pages/VendorManagement.jsx`| **Manajemen Titipan Vendor Konsinyasi**.<br>Daftar pemasok produk titipan, pengaturan rasio bagi hasil (% atau flat), pelacakan stok vendor, dan riwayat penyelesaian (*settlement*) satu pintu. |
| `Reservations.jsx` | `/src/pages/Reservations.jsx` | **Buku Reservasi Meja Restoran**.<br>Jadwal kedatangan tamu, pencatatan DP (uang muka), alokasi meja, dan pengiriman notifikasi pengingat via WhatsApp. |
| `Inventory.jsx` | `/src/pages/Inventory.jsx` | **Manajemen Stok & Inventaris Gudang**.<br>Stok masuk, penyesuaian stok (*stock adjustment*), peringatan batas minimum stok (*low-stock alert*), dan riwayat mutasi bahan baku. |
| `Reports.jsx` | `/src/pages/Reports.jsx` | **Laporan Keuangan & Penjualan**.<br>Grafik omset harian/bulanan, laporan laba kotor, produk terlaris, analisis shift kasir, dan ekspor laporan ke format CSV/Excel. |
| `Login.jsx` | `/src/pages/Login.jsx` | **Halaman Masuk Kasir & Operator**.<br>Input PIN kasir cepat atau username/password manajer dengan pengamanan token JWT. |

---

## 5. Komponen UI Pendukung & Hardware Bridge (`/src/components`)

| Nama Berkas | Lokasi | Fungsi Teknis |
|---|---|---|
| `ReceiptPrinter.jsx` | `/src/components/ReceiptPrinter.jsx` | Komponen visual struk belanja kasir dengan format kertas 58mm/80mm, barcode struk, rincian pajak, dan ucapan terima kasih. |
| `TableLayout.jsx` | `/src/components/TableLayout.jsx` | Denah meja interaktif untuk mode F&B (Restoran), menampilkan status meja terisi/kosong secara visual warna-warni. |
| `BarcodeScanner.jsx`| `/src/components/BarcodeScanner.jsx`| Penangkap input barcode cepat dari scanner USB HID atau kamera tablet. |
| `Navbar.jsx` & `Sidebar.jsx` | `/src/components/` | Navigasi menu responsif aplikasi kasir dengan ikon Lucide. |
| `SunmiBridge.js` | `/src/utils/SunmiBridge.js` | Jembatan hardware Android Sunmi T2 untuk memicu pemotong kertas otomatis (*auto-cutter*) dan pembuka laci kasir (*cash drawer kick-out*). |

---

## 6. Skrip Shell Deployment & Pemeliharaan

| Nama Skrip | Lokasi | Lingkungan Sasaran | Fungsi Eksekusi |
|---|---|---|---|
| `bootstrap-vps.sh` | `/bootstrap-vps.sh` | Server Gudang 644 (VPS) | Skrip 1-klik untuk memasang Docker, Node.js 20, Nginx, dan menjalankan POS Engine serta WhatsApp Gateway di VPS. |
| `bootstrap-pi.sh` | `/bootstrap-pi.sh` | GrandPOS (Raspberry Pi) | Skrip clone repositori otomatis dan persiapan dependensi ARM untuk Raspberry Pi. |
| `install-pi.sh` | `/install-pi.sh` | GrandPOS (Raspberry Pi) | Skrip instalasi frontend kasir, dependensi ARM, dan penyiapan container lokal Pi. |
| `setup-tailscale.sh`| `/setup-tailscale.sh` | VPS & Raspberry Pi | Skrip instalasi VPN mesh privat Tailscale untuk menghubungkan Pi ke Gudang 644 secara aman tanpa IP publik statis. |
| `backup-pi-to-vps.sh`| `/backup-pi-to-vps.sh`| Raspberry Pi | Skrip otomatis pengiriman cadangan transaksi lokal dari Raspberry Pi ke Server Gudang 644. |
| `update-file-index.py`| `/project/scripts/update_file_index.py` | Seluruh Repositori | Skrip Python resmi untuk memindai seluruh direktori repositori dan memperbarui file `INDEX-BERKAS.md` secara atomik. |
