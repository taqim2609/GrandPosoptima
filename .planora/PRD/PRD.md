# PRD — Grand Aceh Kuliner POS (v3.0.0)

Sistem Point of Sale (POS) hybrid modern performa tinggi yang dirancang khusus untuk operasional restoran/rumah makan Aceh dengan integrasi F&B, toko retail, konsinyasi titipan vendor, dan backend native Rust (Axum/Tokio) dalam topologi server terpisah.

## Ringkasan
Grand Aceh Kuliner POS v3.0.0 adalah platform kasir generasi baru yang melayani dua model bisnis dalam satu atap: F&B (makanan & minuman dine-in dan take-away) serta Retail (toko kelontong & oleh-oleh khas Aceh), ditambah sistem titipan vendor konsinyasi bagi hasil. Berjalan dalam arsitektur server terpisah:
- **Frontend Layer**: Web POS & Kiosk Klien (React 19, CRACO, Tailwind) dan aplikasi Android APK Sunmi T2 (Capacitor) yang melayani antarmuka kasir layar sentuh pada port 3000.
- **Backend Core**: Daemon native Rust (Axum 0.8 + Tokio asynchronous runtime) yang mengekspos endpoint `/api/*` pada port 8000 dengan latensi sub-milidetik, konsumsi RAM < 30MB, dan akurasi keuangan fixed-point (`rust_decimal`).
- **Data & Integrasi**: MongoDB primer dengan cache lokal SQLite untuk edge node, antrean offline IndexedDB idempoten, integrasi hardware printer thermal/drawer Sunmi T2, dan otomasi bot WhatsApp 2-arah melalui Hermes Agent AI.

## Masalah
1. **Pencatatan Campur Aduk F&B dan Retail**: Usaha kuliner khas Aceh kerap menjual makanan matang (berbasis porsi atau timbangan ons) bersamaan dengan produk retail/camilan kemasan. Menggabungkan keduanya dalam satu perhitungan memicu kerancuan HPP, margin kotor, dan perhitungan pajak layanan.
2. **Ketergantungan Internet yang Fatal**: Restoran fisik tidak boleh terhenti saat koneksi internet atau WiFi toko down. Sistem cloud murni sering membuat kasir macet dan pelanggan mengantre panjang.
3. **Kerumitan Konsinyasi & Kebocoran Kas Vendor**: Rekonsiliasi produk titipan vendor sering menimbulkan selisih kas fisik di kasir jika pencairan bagian vendor tidak tercatat terintegrasi satu pintu saat tutup shift.
4. **Masalah Hardware Kasir**: Sering terjadi kegagalan cetak struk thermal dan laci kasir macet pada aplikasi web umum saat dijalankan di Android POS.
5. **Overhead Runtime Interpreter**: Backend lama berbasis interpreter memakan konsumsi memori dan CPU signifikan pada komputer mini (Raspberry Pi 3/4) saat menangani transaksi antrean padat dan sinkronisasi batch.
6. **Keamanan Login Kasir & Pengawasan Operasional**: Kebutuhan pembatasan percobaan login (anti brute-force) serta otomatisasi notifikasi stok menipis dan laporan omzet ke pemilik outlet via WhatsApp Hermes.

## Tujuan
1. Menyediakan alur kasir instan (<5ms latency per action) untuk transaksi F&B dan Retail dengan pemisahan pencatatan keuangan dan HPP yang tegas.
2. Memisahkan proses runtime frontend dan backend secara independen untuk fleksibilitas deployment multi-node (Raspberry Pi, Windows Master, dan VPS Cloud).
3. Menjamin operasional kasir 100% tetap berjalan tanpa gangguan saat offline melalui antrean sinkronisasi IndexedDB idempoten ber-ID unik (`client_ref`).
4. Mengotomatiskan perhitungan bagi hasil vendor dan pemotongan kas shift kasir secara akurat tanpa risiko pembayaran ganda menggunakan aritmatika desimal presisi.
5. Mendukung pencetakan struk thermal (58mm/80mm) dan pembukaan laci kasir otomatis pada perangkat Sunmi T2 dan printer Bluetooth.
6. Memfasilitasi integrasi otomatisasi kecerdasan buatan Hermes Agent AI untuk pengawasan operasional dan perintah bot WhatsApp dua arah.

## Non-goals
1. Sistem ini bukan sistem ERP multi-cabang korporasi dengan rantai pasok global.
2. Sistem ini tidak mendukung pencampuran item F&B dan Retail dalam satu lembar struk/order demi integritas akuntansi dan pajak.
3. Sistem ini tidak menggabungkan runtime frontend dan backend ke dalam satu proses monolitik di lingkungan produksi.
4. Sistem ini tidak bergantung 100% pada koneksi internet cloud eksternal.

## Target Pengguna
1. **Kasir**: Mengoperasikan pesanan meja, transaksi kasir cepat, pembayaran multi-metode, cetak struk, dan buka/tutup shift.
2. **Petugas Input / Gudang**: Mengelola katalog produk, stok bahan, resep HPP, dan penerimaan barang titipan vendor.
3. **Pemilik Outlet (Owner/Admin)**: Memantau laporan omzet F&B/Retail, analisis laba kotor, verifikasi settlement vendor, dan pengawasan via bot WhatsApp.
4. **Agen AI (Hermes Agent)**: Menjalankan analisis performa penjualan, menjawab kueri operasional owner, dan mengirimkan ringkasan shift berkala.

## Scope
1. Kasir POS F&B (Dine-in dengan manajemen meja, Take-away) dan POS Retail cepat.
2. Backend native Rust (Axum + Tokio) dengan pemisahan server terisolasi.
3. Produk berbasis timbangan berat (ons/kg) dan diskon bertingkat dengan alasan wajib.
4. Manajemen bagi hasil vendor dengan rincian per produk dan penyelesaian shift satu pintu.
5. Buka/tutup shift kasir dengan rekonsiliasi kas dan pelaporan otomatis via WhatsApp.
6. Integrasi hardware Sunmi T2 (printer thermal monospace dan auto open cash drawer).
7. Fitur keamanan anti brute-force login kasir dengan rate limiting dan JWT token guards.
8. Alarm peringatan stok menipis otomatis via WhatsApp Hermes.
9. Pencetakan label barcode / SKU produk retail.
10. Paket APK rilis v3.0.0 dan OTA update bundle live.

## Risiko
1. **Koneksi Jaringan Lokal Terputus**: Ditangani dengan arsitektur hybrid dan antrean offline IndexedDB ber-ID klien unik (`client_ref`).
2. **Selisih Kas Kasir**: Ditangani dengan rekonsiliasi kas shift harian dan validasi alasan diskon di atas ambang batas.
3. **Kompatibilitas WebView Android Lama**: Ditangani dengan bundling tunggal CRACO tanpa dynamic import dan polyfill ES5 lengkap.
4. **Transisi Kode Backend**: Ditangani dengan kompatibilitas kontrak REST API `/api/*` yang transparan antara frontend dan backend Rust.

## Definition of Done
1. Seluruh transaksi kasir (F&B dine-in, take-away, retail) teruji menghasilkan mutasi kas dan data order yang benar pada backend terpisah.
2. Cetak struk dan pembukaan laci kasir berfungsi konsisten pada Sunmi T2 dan printer Bluetooth.
3. Laporan shift dan rekap bagi hasil vendor akurat tanpa duplikasi pencatatan.
4. Seluruh kebutuhan fungsional (`*-FR-*`, termasuk `RUST-FR-*`) dan kriteria penerimaan (`*-AC-*`) tervalidasi dengan bukti pengujian nyata.
5. Panduan koding Hermes Agent tersedia lengkap dan APK rilis v3.0.0 siap digunakan.
