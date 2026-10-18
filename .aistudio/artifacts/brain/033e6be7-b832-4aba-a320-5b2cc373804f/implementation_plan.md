# Panduan Implementation Plan — Deployment VPS, Raspberry Pi (Tailscale Hybrid) & Android APK/OTA

Rencana ini mengatur otomatisasi deployment terpadu untuk tiga lapisan: **VPS Go-Live** (sebagai pusat data & REST API/MCP), **Raspberry Pi Lokal** (sebagai kasir utama offline-first dalam jaringan Tailscale), serta **Aplikasi Android APK & Capgo OTA** (untuk perangkat Kasir Sunmi T2 dengan SDK printer & cash drawer native), tanpa merubah skema database PostgreSQL live.

---

## Rincian Perubahan & Langkah Implementasi

### 1. Perlindungan Database (Database Schema Lock)
- Memastikan skema PostgreSQL di VPS (`postgresql://grandpos_app:***@127.0.0.1:5432/grandpos`) terkunci dari eksekusi DDL atau migrasi otomatis.
- Mengonfigurasi antrean sinkronisasi offline (`OfflineContext.jsx` & `offlineQueue.js`) agar transaksi dari Raspberry Pi / Android POS tersimpan di IndexedDB saat offline dan terkirim secara idempoten saat online via Tailscale IP.

### 2. Skrip Otomatisasi VPS (`scripts/install-vps-one-click.sh`)
- Menginstal dan mengonfigurasi service Systemd untuk Node web proxy di port 3000.
- Mengatur Caddy/Nginx reverse proxy ke port 3000 (Web), port 8000 (FastAPI REST API), dan port 8001 (MCP Server SSE).
- Membuka akses jaringan Tailscale agar aman diakses oleh Raspberry Pi dan perangkat Android.

### 3. Skrip Otomatisasi Raspberry Pi (`install-pi.sh` & `setup-tailscale.sh`)
- Memperbarui `install-pi.sh` agar secara otomatis:
  - Mengunduh & mengaktifkan Tailscale pada Raspberry Pi (`tailscale up`).
  - Mengonfigurasi environment kasir lokal (`GRANDPOS_API_BASE_URL` mengarah ke localhost dengan fallback ke Tailscale IP VPS jika lokal down).
  - Memasang service `grandpos-pi.service` agar aplikasi kasir langsung aktif saat Raspberry Pi dinyalakan.

### 4. Pembaharuan Android APK & Capgo OTA (`capacitor.config.json` & `make-ota.js`)
- Mengupdate konfigurasi Capacitor Android (`capacitor.config.json`) dan server selector untuk default ke IP lokal Raspberry Pi dengan auto-fallback ke Tailscale IP VPS.
- Memperbarui skrip pembuat bundle Capgo OTA (`scripts/make-ota.js`) untuk menghasilkan pembaruan instan tanpa harus re-install APK.
- Memastikan integrasi Sunmi T2 Native SDK bridge (`lib/print.js` dan `lib/device.js`) tetap aktif untuk cetak struk thermal dan pembukaan laci kasir (`openDrawer`).

### 5. Monitoring UI & Dashboard Tailscale (`SystemHealthPanel.jsx`, `OtaIndicator.jsx` & `TailscaleDashboard.jsx`)
- Menampilkan indikator status real-time untuk seluruh ekosistem:
  - **Node Lokal (Raspberry Pi)**: Status server web lokal, printer thermal Sunmi, dan IndexedDB queue.
  - **Node Remote (VPS via Tailscale)**: REST API (`127.0.0.1:8000`), MCP SSE (`8001`), dan status database.
  - **Status OTA App**: Versi bundle Capgo OTA aktif dan indikator update otomatis.

### 6. Panduan Operasional Lengkap (`PANDUAN-DEPLOY-VPS-DAN-PI-TAILSCALE.md`)
- Dokumentasi bahasa Indonesia berisi:
  - Cara menjalankan `install-vps-one-click.sh` di VPS.
  - Cara menghubungkan Raspberry Pi ke jaringan Tailscale menggunakan `install-pi.sh`.
  - Prosedur build & rilis Capgo OTA update untuk Android APK.
  - Prosedur pengujian mode offline (cabut LAN/WiFi) dan verifikasi auto-sync saat terhubung kembali ke VPS via Tailscale.

### 7. Verifikasi Build
- Menjalankan `compile_applet` untuk memastikan seluruh skrip, modul backend, dan komponen frontend terkompilasi tanpa error.

---

## Membutuhkan Konfirmasi
Silakan periksa rencana di atas dan klik **Proceed** jika Anda sudah setuju untuk saya mulai mengeksekusi semua perubahan.
