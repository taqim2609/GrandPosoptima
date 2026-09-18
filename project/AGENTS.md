
## Update 2026-09-14 — Cetak Daftar Belanja di APK + LACI KASIR Sunmi (b8d0eb6, APK v2.10)
Lanjutan keluhan pemilik setelah perbaikan cetak laporan shift/settlement:
(1) tombol Cetak **Daftar Belanja Bahan** juga tidak bisa di APK; (2) **laci kasir tidak terbuka
otomatis** meski opsi "Buka laci kasir" menyala.

1. **Daftar Belanja Bahan (`pages/Ingredients.jsx`)** — dulu `doPrint()` membangun tabel HTML lalu
   `window.open()` (tidak tercetak di APK). Kini memakai `printText()` dari `lib/print.js` dengan teks
   monospace: header + tanggal, kolom `#/BAHAN` … `JUMLAH` sejajar lebar 42 karakter, baris
   `   perkiraan` + `catatan:`, dan `ESTIMASI TOTAL` → **printer thermal Sunmi/Bluetooth** di APK,
   jendela cetak browser di web. Helper `buildListText(items)` dipisah supaya mudah diuji.
   `esc()` yang tak terpakai lagi di file itu sudah dihapus.
2. **AKAR laci tidak terbuka:** `SunmiBridge` di **MainActivity TIDAK PERNAH punya method `openDrawer`**,
   sedangkan `receipt.js` memanggil `sp.openDrawer` — syarat `if (cfg.cashDrawer && sp.openDrawer)`
   selalu gagal, jadi perintah tidak pernah dikirim (bukan masalah laci/kabel). Ditambahkan di bridge:
   `printerService.openDrawer(resultCallback)` dengan **cadangan perintah mentah** `ESC p 0 25 250`
   lewat `sendRAWData` bila openDrawer gagal; galatnya dicatat di `lastBindError`/`getDebugInfo()`.
   SDK `printerlibrary` 1.0.24 memang punya `openDrawer(InnerResultCallback)` & `sendRAWData` (diverifikasi
   dengan `javap` ke `classes.jar` di dalam AAR).
3. **Verifikasi tanpa transaksi**: `lib/device.js` kini punya `openCashDrawer()` (dipakai tombol baru
   **"Tes Buka Laci"** di Pengaturan → Perangkat) dan `getPrinterStatus()` menambah `sunmiDrawer`
   (apakah APK terpasang mendukung buka laci) → bila false, muncul petunjuk `dev-drawer-hint`
   "pasang APK v2.10+". Label opsi diperjelas menjadi **"Buka laci kasir otomatis setiap cetak struk"**
   karena itu perilaku sebenarnya (kode lama tidak membedakan tunai/non-tunai meski labelnya menyebut tunai).
4. **APK v2.10** (`versionCode 21`, `versionName "2.10"`, `versions.js APK_VERSION` disinkronkan):
   bundle `main.91b54d0b.js`, OTA tertanam `20260914143045`. Disimpan sebagai
   `pos-grand-update/apk/Grand-Aceh-Kuliner-POS-v2.10.apk`; **v2.9 dihapus** dan landing
   (`index.html` + `index.php`, keduanya identik) menautkan v2.10.
   Resep build yang dipakai: `npx cap sync android` (HOME=workspace + `NODE_OPTIONS=--require=<shim
   os.userInfo>` — JANGAN di-commit, ada di `.verify-tmp/`) lalu
   `~/gradle/gradle-8.2.1/bin/gradle --no-daemon assembleDebug` dengan `JAVA_HOME`/`ANDROID_HOME` dari
   `/var/lib/vibecoderco/shared-android-toolchain` dan `GRADLE_USER_HOME=$HOME/.gradle` (cache hangat → 31 dtk).
   Verifikasi isi APK: `aapt dump badging` → versionCode 21/versionName 2.10; `grep -a openDrawer classes*.dex`.
5. Uji `gak-repro/repro-print-sunmi.js` kini **37 pemeriksaan**: + skenario daftar belanja (bahan,
   jumlah, estimasi total, catatan, baris ≤42) dan + skenario laci (tombol Tes Buka Laci mengirim
   perintah, struk uji juga membuka laci, petunjuk APK lama tidak muncul). Dijalankan juga terhadap
   **isi tar LIVE** → 37 lulus. Regresi lulus: shift-daily (70), settlement (38), vendor-close (18),
   pospay, users (23), void (39), ing-cat (26), ing2.
6. Rilis: commit **b8d0eb6**, update center live **b8d0eb6** (tar 5.136.439 B; memuat build.gradle 2.10,
   MainActivity ber-openDrawer, bundle main.91b54d0b.js). Update center diverifikasi live: `version.json`,
   APK v2.10 (APK asli 9.186.841 B, `file` = Android package), tautan landing = v2.10, dan
   `apk/Grand-Aceh-Kuliner-POS-v2.9.apk` kini mengembalikan **HTML fallback** (200 text/html) — bukan APK.
7. **Pi**: `bash update-pos-pi.sh` (untuk OTA bundle terbaru) **DAN** pasang
   `apk/Grand-Aceh-Kuliner-POS-v2.10.apk` di perangkat Sunmi — OTA saja TIDAK cukup, karena
   `openDrawer` ada di sisi native (Java), bukan di bundle.

---

## 📋 INSTRUKSI SISTEM KUSTOM: PEMBANGUNAN APK NATIVE SUNMI T2 & INTEGRASI WEB APP

Dokumen ini berfungsi sebagai panduan instruksi sistem kustom (system instructions) bagi AI Agent atau pengembang untuk memelihara, mengompilasi, dan menghubungkan aplikasi kasir berbasis web (**Web App**) dengan aplikasi mobile native (**APK Android**) yang berjalan khusus pada perangkat **Sunmi T2** (atau perangkat kasir POS Sunmi lainnya).

---

### 1. ARSITEKTUR UTAMA, SERVER, & DATABASE

Aplikasi ini beroperasi dalam model **Hybrid Local + Cloud** yang kokoh dengan spesifikasi sebagai berikut:
- **Server Fisik (Lokal)**: Berjalan di **Raspberry Pi** menggunakan containerisasi Docker (`docker-compose.yml`).
- **Web Server & Reverse Proxy**: **Nginx** menangani perutean statis frontend dan lalu lintas API.
- **Database Utama**: **MongoDB (versi 4.4.18)** (dipilih khusus karena stabilitasnya yang tinggi pada arsitektur ARM v7/v8 Raspberry Pi 3).
- **Domain Jaringan Lokal (mDNS)**: Dapat diakses di jaringan lokal menggunakan hostname **`grandpos.local`** atau melalui IP VPN Tailscale untuk manajemen jarak jauh.

---

### 2. DAFTAR API UTAMA & BASE URL

Seluruh lalu lintas komunikasi data antara Web App (Frontend React) dan Server (Backend FastAPI) melewati API terpusat.

#### A. Konfigurasi Base URL
- **Base URL Frontend (React)**: Ditentukan secara fleksibel melalui variabel lingkungan `.env` pada baris:
  ```env
  REACT_APP_BACKEND_URL=http://grandpos.local:3000
  ```
  *(Atau dapat menggunakan IP lokal Raspberry Pi, localhost saat pengembangan, atau IP Tailscale).*
- **Letak Kode API Utama**: Seluruh endpoint backend ditulis dengan framework FastAPI di dalam berkas **`project/backend/server.py`**. Semuanya diawali dengan prefix `/api`.

#### B. Daftar Endpoint API Kritis untuk Integrasi APK
| Kategori | Endpoint | Metode | Deskripsi |
| :--- | :--- | :--- | :--- |
| **Autentikasi** | `/api/auth/login` | `POST` | Login kasir & dapatkan JWT token (`gak_token`) |
| **Autentikasi** | `/api/auth/me` | `GET` | Validasi kecocokan sesi kasir aktif |
| **Sinkronisasi** | `/api/sync/master` | `GET` | Menarik seluruh master data terbaru (produk, kategori, meja, dsb.) |
| **Sinkronisasi** | `/api/sync/push` | `POST` | Mengirim/mendorong antrean transaksi offline dari APK ke server |
| **Transaksi** | `/api/orders` | `POST` | Membuat transaksi baru secara langsung (online) |
| **Transaksi** | `/api/orders/{oid}/pay` | `POST` | Memproses pelunasan transaksi tertunda |
| **Mesin AI** | `/api/ai/parse-invoice` | `POST` | Ekstraksi otomatis data struk/faktur menggunakan Gemini Vision |
| **Mesin AI`** | `/api/ai/expense-vision` | `POST` | Scan pengeluaran kas otomatis lewat kamera Sunmi |
| **WhatsApp** | `/api/cron/daily-report`| `POST` | trigger laporan harian otomatis via WhatsApp |
| **Backup** | `/api/backup/export` | `GET` | Ekspor data transaksi untuk cadangan lokal |

---

### 3. FITUR-FITUR INTEGRASI NATIVE & APLIKASI YANG BISA DIMASUKKAN

Agar perangkat Sunmi T2 berfungsi dengan optimal, APK native menjembatani keterbatasan browser web biasa dengan mengakses API perangkat keras bawaan (*Sunmi SDK*) melalui Capacitor Bridge:

1. **Printer Thermal Sunmi Terintegrasi (Built-in Thermal Printer)**:
   - Web App mengirim teks monospace terformat khusus berukuran lebar maks **42 karakter** melalui jembatan Javascript `SunmiBridge`.
   - Cetak otomatis mencakup: Struk transaksi kasir (Dine-in, Take-away, Retail), struk penutupan shift (Settlement), laporan penutupan kas harian, dan Daftar Belanja Bahan makanan/minuman.
2. **Auto-Buka Laci Kasir (Cash Drawer Trigger)**:
   - Terintegrasi pada file jembatan native `MainActivity.java` melalui pemanggilan fungsi native SDK `printerService.openDrawer(resultCallback)`.
   - Dilengkapi fungsi cadangan (*raw-command backup*) mengirim kode biner laci kasir secara manual `ESC p 0 25 250` lewat fungsi `sendRAWData` jika pemanggilan SDK utama terhambat.
   - Tersedia tombol pengujian mandiri **"Tes Buka Laci"** pada menu *Pengaturan > Perangkat* untuk mendiagnosa sambungan kabel RJ11 laci kasir.
3. **Kamera & Pemindai Barcode (Integrated Barcode Scanning)**:
   - Kamera belakang atau pemindai bawaan Sunmi T2 dipetakan menggunakan plugin kamera Capacitor untuk memindai kode batang (barcode) produk retail, memudahkan kasir mencari barang dengan kecepatan tinggi.
4. **Offline-First Mode (Penjualan Luring Mandiri)**:
   - Manajemen antrean pintar menggunakan `localStorage` web yang dipantau oleh `OfflineContext.jsx`.
   - Jika mode offline diaktifkan di pengaturan perangkat, kasir tetap bisa melakukan transaksi secara luring penuh saat WiFi terputus. Transaksi disimpan sementara di dalam antrean antarmuka **Sync Manager**.

---

### 4. CARA SINKRONISASI WEB APP DAN APK

Penyelarasan data menggunakan pendekatan **Offline-First dengan Sinkronisasi On-Demand**:

1. **Pendeteksian Koneksi Otomatis**:
   - Web App di dalam APK memantau status jaringan menggunakan event listener `window.addEventListener('online')` dan `window.addEventListener('offline')`.
2. **Pemuatan Awal Data (Pull)**:
   - Saat aplikasi pertama kali dibuka (atau kasir menekan tombol refresh), aplikasi akan menembak `/api/sync/master` untuk mengunduh produk, varian, dan harga terbaru ke penyimpanan lokal APK.
3. **Pengiriman Antrean Offline (Push)**:
   - Transaksi yang dilakukan saat luring ditandai dengan ID unik sementara (`temp_id`).
   - Begitu perangkat kembali online, `OfflineContext.jsx` secara otomatis (atau via aksi kasir di **Sync Manager**) mengirimkan tumpukan pesanan tersebut ke `/api/sync/push` untuk disimpan permanen di database MongoDB server lokal.
   - Setelah sukses dikirim, antrean luring di bersihkan dari penyimpanan lokal perangkat.

---

### 5. CARA MEMBERITAHU JIKA ADA PERBAIKAN BARU (MEKANISME UPDATE & OTA)

Aplikasi POS ini menggunakan **Mekanisme Pembaruan Dua Jalur** agar kasir tidak perlu berulang kali menginstal ulang berkas APK secara manual:

#### Jalur A: Over-The-Air (OTA) Updates untuk Tampilan & Logika Web (Sangat Sering)
- **Teknologi**: Menggunakan integrasi **Capgo OTA** yang disederhanakan (`lib/ota.js` & `scripts/make-ota.js`).
- **Cara Kerja**:
  1. Pengembang mengubah kode HTML/React/CSS di frontend.
  2. Jalankan perintah kompilasi frontend: `yarn build` atau `npm run build` yang sekaligus mengeksekusi skrip kompilasi OTA (`node scripts/make-ota.js`). Skrip ini melahirkan arsip `build/ota/bundle.zip` dan memperbarui `version.json`.
  3. Berkas didorong ke peladen pembaruan.
  4. Saat APK kasir dijalankan di Sunmi T2, ia akan mencocokkan versinya dengan `version.json` di server. Jika server memiliki versi lebih baru, APK akan otomatis mengunduh paket luring `.zip` tersebut di latar belakang, mengekstraknya, dan memperbarui tampilan kasir secara instan pada boot berikutnya.
  - *Catatan Penting*: Service Worker (`sw.js`) dinonaktifkan sepenuhnya di lingkungan APK untuk mencegah konflik cache dengan mesin OTA Capgo.

#### Jalur B: Pembaruan APK Native untuk Akses Perangkat Keras Sunmi (Sangat Jarang)
- Jika ada perbaikan pada kode Java (Native Bridge), dependensi Gradle, atau driver printer di `MainActivity.java`, maka berkas APK fisik baru harus diinstal.
- **Notifikasi Perbaikan**:
  - Peladen lokal Pi mendeteksi rilis APK baru di folder static `public/apk/` (misalnya `Grand-Aceh-Kuliner-POS-v2.10.apk`).
  - Halaman landing admin (`index.html` / `index.php`) menyajikan tautan unduhan langsung berkas APK fisik tersebut.
  - Skrip cron di server lokal dapat memicu notifikasi otomatis ke grup WhatsApp kasir melalui endpoint `/api/cron/notify` untuk menginstruksikan instalasi APK versi terbaru.

---

### 6. PANDUAN LANGKAH PEMBANGUNAN & KOMPILASI APK NATIVE

Gunakan langkah-langkah berikut untuk mengompilasi APK secara lokal di dalam container pengembangan:

#### Langkah 1: Siapkan Jalur Toolchain & SDK Android
Pastikan variabel lingkungan SDK terarah dengan benar ke cache hangat container:
```bash
export ANDROID_HOME=/var/lib/vibecoderco/shared-android-toolchain
export JAVA_HOME=/var/lib/vibecoderco/shared-android-toolchain
export GRADLE_USER_HOME=$HOME/.gradle
```

#### Langkah 2: Bangun Aset Frontend & Sinkronkan ke Android
```bash
# 1. Kompilasi React menjadi bundel statis produksi
npm run build

# 2. Salin aset statis ke folder aset native Android milik Capacitor
npx cap sync android
```

#### Langkah 3: Kompilasi Menjadi APK Menggunakan Gradle
Jalankan kompilator Gradle untuk merakit berkas biner `.apk` versi debug:
```bash
$ANDROID_HOME/tools/bin/sdkmanager --licenses # Jika lisensi SDK belum disetujui
~/gradle/gradle-8.2.1/bin/gradle -p android/ --no-daemon assembleDebug
```
Berkas hasil kompilasi akan tercipta di jalur:
`android/app/build/outputs/apk/debug/app-debug.apk`

#### Langkah 4: Publikasikan APK ke Web Server
Salin berkas APK hasil rakitan tersebut ke direktori unduhan static aplikasi agar bisa langsung diunduh oleh tablet Sunmi kasir melalui peramban:
```bash
cp android/app/build/outputs/apk/debug/app-debug.apk public/apk/Grand-Aceh-Kuliner-POS-v2.10.apk
```
Sesuaikan penomoran versi di `version.json` agar pembaruan terdeteksi secara otomatis.

---