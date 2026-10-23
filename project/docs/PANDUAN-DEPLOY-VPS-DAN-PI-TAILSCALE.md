# Panduan Operasional Go-Live: VPS, Raspberry Pi (Tailscale) & Android APK / Capgo OTA

Dokumen ini berisi panduan teknis dan langkah operasional untuk menyebarkan (*deploy*) seluruh ekosistem **GrandPOS** di VPS online, Raspberry Pi lokal toko, serta perangkat kasir Android Sunmi T2.

---

## 1. Arsitektur Inti & Informasi Koneksi Server

### A. VPS Go-Live (Database & Engine REST API)
- **PostgreSQL 16**: `postgresql://grandpos_app:9d089517ba54dea2d7806cc6bb47141428891343468ed1f949c3e660b3f7a0ae@127.0.0.1:5432/grandpos`
- **FastAPI REST API**: `http://127.0.0.1:8000`
- **X-API-Key Wajib**: `65325897d59d3d5d5e0b86a69e818dffc9d051aee365193b8c1dda174ada551b`
- **MCP SSE Server**: `http://127.0.0.1:8001/sse`
- **Catatan Keamanan**: Skema database PostgreSQL dikunci (tidak ada migrasi DDL otomatis yang mengubah struktur tabel).

---

## 2. Langkah Deployment di VPS

Untuk memasang aplikasi Web POS dan mengonfigurasi service Systemd di VPS Linux (Debian 12 / Ubuntu):

1. Masuk ke server VPS via SSH:
   ```bash
   ssh root@<IP_SERVER_VPS>
   ```

2. Jalankan skrip installer 1-klik:
   ```bash
   curl -fsSL http://localhost:3000/scripts/install-vps-one-click.sh | bash
   # Atau jika kode repositori sudah di-clone:
   cd /root/grandpos/pos-engine
   sudo bash scripts/install-vps-one-click.sh
   ```

3. Verifikasi status service Systemd:
   ```bash
   systemctl status grandpos-web.service
   ```

4. Uji kesehatan REST API dan MCP Server:
   ```bash
   curl -H "X-API-Key: 65325897d59d3d5d5e0b86a69e818dffc9d051aee365193b8c1dda174ada551b" \
     http://127.0.0.1:8000/health
   ```

---

## 3. Langkah Deployment di Raspberry Pi (Kasir Toko Offline-First)

Raspberry Pi berfungsi sebagai kasir utama di outlet toko dengan keunggulan transaksi offline-first dan koneksi jaringan Tailscale:

1. Jalankan skrip instalasi Raspberry Pi:
   ```bash
   sudo bash install-pi.sh
   ```

2. Hubungkan Raspberry Pi ke jaringan Tailscale:
   ```bash
   sudo bash setup-tailscale.sh
   ```
   Buka tautan autentikasi Tailscale di browser HP/Laptop untuk mengotorisasi Raspberry Pi (`grandpos-pi`) ke dalam jaringan mesh Tailscale Anda.

3. Alamat server lokal kasir di outlet:
   - Akses lokal LAN: `http://grandpos.local:3000` atau `http://<IP_LOKAL_PI>:3000`
   - Akses via Tailscale: `http://<IP_TAILSCALE_PI>:3000`

---

## 4. Pembaharuan Android APK & Capgo OTA

Untuk perangkat kasir **Sunmi T2** atau Tablet Android:

1. **Target Server Auto-Fallback**:
   - Aplikasi Android secara otomatis memprioritaskan IP lokal Raspberry Pi (`http://grandpos.local:3000` / `http://<IP_PI>:3000`).
   - Jika Raspberry Pi offline atau sedang di luar toko, aplikasi secara otomatis menggunakan IP Tailscale VPS (`http://100.117.186.13:8000`).

2. **Perangkat Keras Sunmi T2 Native**:
   - Pencetakan struk printer thermal dan pembukaan laci uang (*cash drawer*) dikendalikan langsung oleh Sunmi Native SDK (`openDrawer`).

3. **Mekanisme Update Capgo OTA (Over-The-Air)**:
   - Setiap ada pembaruan tampilan atau logika kasir, jalankan perintah pembuat paket OTA:
     ```bash
     npm run ota
     ```
   - Berkas `bundle.zip` dan `version.json` akan dihasilkan secara otomatis di folder `/build/ota/`. Perangkat Android kasir akan mendeteksi dan memperbarui bundle aplikasi secara otomatis tanpa perlu instalasi ulang file APK.

---

## 5. Ringkasan Pengujian & System Health

Buka aplikasi kasir di browser atau APK, navigasikan ke menu **System Health** untuk memeriksa:
- Status real-time **Google Cloud / AI Studio Server**
- Status **FastAPI REST API (Port 8000)** dan **MCP SSE Server (Port 8001)**
- Status **PostgreSQL 16 Database**
- Status **Node Raspberry Pi Toko** & **Capgo OTA Bundle Version**
