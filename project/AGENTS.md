
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
7. **Pi**: `bash update-vibecoder-pi.sh` (untuk OTA bundle terbaru) **DAN** pasang
   `apk/Grand-Aceh-Kuliner-POS-v2.10.apk` di perangkat Sunmi — OTA saja TIDAK cukup, karena
   `openDrawer` ada di sisi native (Java), bukan di bundle.
