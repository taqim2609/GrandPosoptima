# Panduan Instalasi Lengkap — Grand Aceh Kuliner POS

Dokumen ini berisi panduan teknis langkah-demi-langkah untuk memasang (*install*) seluruh ekosistem **Grand Aceh Kuliner POS** (berbasis murni **Node.js, Express, React 19, & Hermes Agent Baileys**) pada berbagai jenis perangkat dan lingkungan.

---

## 📋 Ringkasan Perangkat & Skenario Instalasi

| Perangkat / Server | Fungsi Utama | Metode Instalasi |
| :--- | :--- | :--- |
| **GitHub Repository** | Kode Sumber & Auto-Update (`git pull`) | Clone & Script (`git clone` & `./update-pi.sh`) |
| **Server VPS Cloud** | Landing Page Publik, Hermes WA Gateway, Engine Sync Cloud | 1-Klik Bootstrap Script (`bootstrap-vps.sh`) / GitHub |
| **Raspberry Pi / PC Outlet** | Node Kasir Lokal Toko (Offline-First, Cetak Struk) | 1-Klik Script (`install-pi.sh` / `bootstrap-pi.sh`) / GitHub |
| **PC / Laptop Windows** | Terminal Kasir Touchscreen / Kasir Kas | Double-click File `.bat` (`Buka-POS-Desktop.bat`) |
| **Android Sunmi T2 / Tablet** | Kasir Mobile, Printer Thermal Hardware Built-in | File APK (`/apk/Grand-Aceh-Kuliner-POS-v2.10.apk`) |
| **Komputer Developer** | Pengembangan & Pengujian Kode Lokal | Node.js (`npm install` & `npm run dev`) |

---

## 🐱 Instalasi & Deployment Menggunakan GitHub

Menggunakan GitHub adalah metode paling direkomendasikan untuk mempermudah manajemen kode, kolaborasi, dan pembaruan aplikasi secara otomatis di server VPS maupun Raspberry Pi toko.

### A. Langkah Clone & Instalasi Awal dari GitHub:
1. Masuk ke server VPS atau Raspberry Pi via SSH / Terminal:
   ```bash
   cd ~
   ```
2. Clone repositori aplikasi dari GitHub Anda:
   ```bash
   git clone https://github.com/USERNAME_ANDA/grand-aceh-kuliner-pos.git grand-pos
   ```
3. Masuk ke folder proyek:
   ```bash
   cd grand-pos
   ```
4. Jalankan skrip installer sesuai perangkat:
   - **Di VPS Cloud**: `sudo bash bootstrap-vps.sh`
   - **Di Raspberry Pi / PC Toko**: `sudo bash install-pi.sh`

---

### B. Cara Memperbarui Aplikasi dari GitHub (1-Klik Auto-Update):
Setiap kali Anda melakukan perubahan kode di komputer lokal dan mengunggahnya ke GitHub (`git push`), Anda cukup menjalankan skrip pembaru otomatis di server:

```bash
./update-pi.sh
```

**Yang dilakukan skrip `./update-pi.sh` secara otomatis**:
1. Menarik pembaruan kode terbaru dari GitHub (`git pull --ff-only`).
2. Memperbaiki izin hak akses folder dan file Git jika terjadi kendala `sudo`.
3. Membangun ulang container Docker (`docker compose up -d --build`).
4. Membersihkan *cache image* lama yang tidak terpakai (`docker image prune`).

---

### C. Otomasi Auto-Update Harian via Cron Job (Opsional):
Jika Anda ingin VPS atau Raspberry Pi toko secara otomatis memeriksa & menarik update dari GitHub setiap hari tanpa perlu mengetik perintah manual:

1. Buka editor cron daemon:
   ```bash
   crontab -e
   ```
2. Tambahkan baris jadwal berikut di bagian paling bawah:
   ```cron
   # Cek & update otomatis dari GitHub setiap pukul 04:00 subuh
   0 4 * * * cd /root/grand-pos && ./update-pi.sh >> /tmp/pos-update.log 2>&1
   ```
3. Simpan dan keluar. Aplikasi akan selalu dalam versi paling baru secara otomatis.

---

## 1. 🚀 Instalasi di Server VPS Cloud (Linux Ubuntu / Debian)

Server VPS berfungsi sebagai pusat data publik, pengelola reservasi online 24/7, dan gerbang notifikasi WhatsApp murni menggunakan **Hermes Agent (Baileys Native)**.

### Langkah-langkah Instalasi:
1. Masuk ke server VPS Anda via SSH dari Terminal / PuTTY:
   ```bash
   ssh root@<IP_VPS_ANDA>
   ```

2. Jalankan perintah instalasi otomatis 1-klik berikut:
   ```bash
   curl -fsSL https://ais-pre-nqjmalpyxo6lgj3y3eagbr-754954417035.asia-southeast1.run.app/bootstrap-vps.sh | bash
   ```

3. Skrip akan otomatis:
   - Memasang Docker Engine.
   - Mengaktifkan **Grand Aceh POS Web & Engine** di port `3000`.
   - Mengkonfigurasi integrasi outbox ke **Hermes Agent (Baileys Native)** di port `8644`.
   - Mengaktifkan **Watchtower** untuk update otomatis container di latar belakang.

4. **Akses Dashboard VPS**:
   - Web Landing Page & POS: `http://<IP_VPS_ANDA>:3000`
   - Hermes Agent WhatsApp Gateway: `http://<IP_VPS_ANDA>:8644`

---

## 2. 🍓 Instalasi di Raspberry Pi / PC Master Toko (Offline-First)

Raspberry Pi atau PC Mini di outlet berfungsi sebagai server lokal kasir. Transaksi tetap berjalan 100% lancar meskipun koneksi internet toko terputus (Offline-First).

### Langkah-langkah Instalasi:
1. Buka Terminal di Raspberry Pi / Linux PC outlet.
2. Jalankan perintah installer 1-klik:
   ```bash
   curl -fsSL https://ais-pre-nqjmalpyxo6lgj3y3eagbr-754954417035.asia-southeast1.run.app/bootstrap-pi.sh | bash
   ```
   *Atau jika berkas repositori sudah diunduh di komputer:*
   ```bash
   sudo bash install-pi.sh
   ```

3. **Gunakan Tailscale untuk Akses Jarak Jauh (Opsional)**:
   Agar Raspberry Pi toko dapat diakses secara aman dari luar toko tanpa IP Publik:
   ```bash
   curl -fsSL https://tailscale.com/install.sh | sh
   sudo tailscale up
   ```

4. **Akses POS di Toko**:
   - Dari jaringan lokal Wi-Fi toko: `http://<IP_LOKAL_PI>:3000` atau `http://grandpos.local:3000`
   - Dari peramban kasir langsung: `http://localhost:3000/?pos=1`

---

## 3. 💻 Instalasi di PC Kasir Windows

Untuk PC Kasir berbasis Windows (Windows 10 / 11) dengan layar sentuh (Touchscreen):

### Langkah-langkah:
1. Buka folder repositori Grand Aceh Kuliner POS di File Explorer.
2. Klik ganda (*double-click*) pada berkas berikut sesuai kebutuhan:
   - **`Buat-Shortcut-Desktop.bat`**: Membuat ikon pintasan di Desktop Windows.
   - **`Buka-POS-Desktop.bat`**: Membuka antarmuka kasir POS secara otomatis di browser Google Chrome / Edge.
   - **`Buka-POS-KioskPrint.bat`**: Membuka layar kasir mode Kiosk Fullscreen dengan cetak struk otomatis tanpa dialog cetak.

---

## 4. 📱 Instalasi di Android Kasir (Sunmi T2 / Tablet / HP)

Untuk perangkat kasir Sunmi T2 Android (dengan printer thermal bawaan) atau Tablet Kasir:

### A. Instalasi Berkas APK Native
1. Salin berkas APK dari folder repositori:
   `apk/Grand-Aceh-Kuliner-POS-v2.10.apk`
2. Pasang (*install*) file APK ke perangkat Android.
3. Buka aplikasi **Grand Aceh POS**. Aplikasi akan otomatis mendeteksi koneksi ke Raspberry Pi lokal atau Server Cloud VPS.
4. Printer thermal bawaan Sunmi T2 dan laci uang (*cash drawer*) akan terhubung otomatis secara native (`openDrawer`).

### B. Pembaruan Otomatis Tanpa Re-Install (Capgo OTA)
Jika ada pembaruan fitur kasir di server, Anda **tidak perlu meng-install ulang file APK**. Cukup jalankan perintah berikut di komputer developer / server:
```bash
npm run ota
```
Aplikasi Android kasir akan mendeteksi bundle baru dan memperbarui dirinya secara otomatis via koneksi Over-The-Air (OTA).

---

## 5. 🛠️ Instalasi Mode Developer / Pengujian Lokal

Untuk keperluan pengembangan, modifikasi kode, atau uji coba di komputer lokal:

### Prasyarat:
- **Node.js**: versi 18.x atau lebih baru.
- **npm**: versi 9.x atau lebih baru.

### Langkah-langkah:
1. Unduh atau clone repositori aplikasi.
2. Buka Terminal / Command Prompt di folder utama aplikasi, lalu pasang dependensi:
   ```bash
   npm install
   ```

3. Jalankan server pengembangan lokal (Express API + Vite HMR di port 3000):
   ```bash
   npm run dev
   ```

4. Buka browser dan akses:
   - `http://localhost:3000`

---

## 🔑 Informasi Akun & Kredensial Default

- **Super Admin (Owner)**:
  - Username: `taqim2609` atau `admin`
  - Password: `admin123`
  - PIN 6 Digit Kasir: `260900`
- **Kasir POS**:
  - Username: `kasir`
  - Password: `kasir123`
  - PIN 6 Digit Kasir: `111111`

---

## ❓ Kendala & Solusi Populer (Troubleshooting)

1. **Aplikasi Menampilkan Landing Page padahal Diakses dari Raspberry Pi Toko**:
   - Pastikan URL diakses via IP lokal (misal `http://192.168.1.50:3000/?pos=1`) atau IP Tailscale (`100.x.x.x`). Parameter `?pos=1` akan menyimpan preferensi kasir secara otomatis.
2. **Printer Thermal / Cash Drawer Tidak Membuka di Android**:
   - Pastikan aplikasi berjalan di perangkat Sunmi Android resmi atau menggunakan koneksi Bluetooth ESC/POS yang sudah dipasangkan di Pengaturan Perangkat.
3. **Status Sync Offline di Visual Sync Status**:
   - Klik tombol **"Uji Latensi"** atau **"Sinkron Menu & Stok"** pada kartu status sinkronisasi di Dashboard untuk memperbarui koneksi ke Cloud API.
