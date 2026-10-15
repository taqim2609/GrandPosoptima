# PRD — Grand Aceh Kuliner POS

Sistem Point of Sale (POS) hybrid modern yang dirancang khusus untuk operasional restoran/rumah makan Aceh dengan integrasi F&B, toko retail, dan konsinyasi titipan vendor.

## Ringkasan
Grand Aceh Kuliner POS adalah platform kasir komprehensif yang melayani dua model bisnis dalam satu atap: F&B (makanan & minuman dine-in dan take-away) serta Retail (toko kelontong & oleh-oleh khas Aceh), ditambah sistem titipan vendor konsinyasi bagi hasil. Berjalan dalam arsitektur hybrid (server lokal Docker di Raspberry Pi/PC Master, sinkronisasi cloud, dan antrean offline cerdas) serta terintegrasi langsung dengan perangkat kasir Sunmi T2 (printer thermal dan auto open cash drawer).

## Masalah
1. **Pencatatan Campur Aduk F&B dan Retail**: Usaha kuliner khas Aceh kerap menjual makanan matang (berbasis porsi atau timbangan ons) bersamaan dengan produk retail/camilan kemasan. Menggabungkan keduanya dalam satu perhitungan memicu kerancuan HPP, margin kotor, dan perhitungan pajak layanan.
2. **Ketergantungan Internet yang Fatal**: Restoran fisik tidak boleh terhenti saat koneksi internet atau WiFi toko down. Sistem cloud murni sering membuat kasir macet dan pelanggan mengantre panjang.
3. **Kerumitan Konsinyasi & Kebocoran Kas Vendor**: Rekonsiliasi produk titipan vendor sering menimbulkan selisih kas fisik di kasir jika pencairan bagian vendor tidak tercatat terintegrasi satu pintu saat tutup shift.
4. **Masalah Hardware Kasir**: Sering terjadi kegagalan cetak struk thermal dan laci kasir macet pada aplikasi web umum saat dijalankan di Android POS.
5. **Keamanan Login Kasir & Pengawasan Operasional**: Belum adanya pembatasan percobaan login (anti brute-force) serta kebutuhan otomatisasi notifikasi stok menipis dan laporan omzet ke pemilik outlet via WhatsApp.

## Tujuan
1. Menyediakan alur kasir instan untuk transaksi F&B dan Retail dengan pemisahan pencatatan keuangan dan HPP yang tegas.
2. Menjamin operasional kasir 100% tetap berjalan tanpa gangguan saat offline melalui antrean sinkronisasi IndexedDB idempoten.
3. Mengotomatiskan perhitungan bagi hasil vendor dan pemotongan kas shift kasir secara akurat tanpa risiko pembayaran ganda.
4. Mendukung pencetakan struk thermal (58mm/80mm) dan pembukaan laci kasir otomatis pada perangkat Sunmi T2 dan printer Bluetooth.
5. Memperketat keamanan autentikasi kasir dan menyediakan automasi laporan harian via WhatsApp Gateway.

## Non-goals
1. Sistem ini bukan sistem ERP multi-cabang korporasi dengan rantai pasok global.
2. Sistem ini tidak mendukung pencampuran item F&B dan Retail dalam satu lembar struk/order demi integritas akuntansi dan pajak.
3. Sistem ini tidak bergantung 100% pada koneksi internet cloud eksternal.

## Target Pengguna
1. **Kasir**: Mengoperasikan pesanan meja, transaksi kasir cepat, pembayaran multi-metode, cetak struk, dan buka/tutup shift.
2. **Petugas Input / Gudang**: Mengelola katalog produk, stok bahan, resep HPP, dan penerimaan barang titipan vendor.
3. **Pemilik Outlet (Owner/Admin)**: Memantau laporan omzet F&B/Retail, analisis laba kotor, verifikasi settlement vendor, dan pengawasan via bot WhatsApp.

## Scope
1. Kasir POS F&B (Dine-in dengan manajemen meja, Take-away) dan POS Retail cepat.
2. Produk berbasis timbangan berat (ons/kg) dan diskon bertingkat dengan alasan wajib.
3. Manajemen bagi hasil vendor dengan rincian per produk dan penyelesaian shift satu pintu.
4. Buka/tutup shift kasir dengan rekonsiliasi kas dan pelaporan otomatis via WhatsApp.
5. Integrasi hardware Sunmi T2 (printer thermal monospace dan auto open cash drawer).
6. Fitur keamanan anti brute-force login kasir dengan rate limiting.
7. Alarm peringatan stok menipis otomatis via WhatsApp.
8. Pencetakan label barcode / SKU produk retail.
9. Asisten AI untuk analisis penjualan, filter rentang tanggal laporan, dan audit struk.

## Risiko
1. **Koneksi Jaringan Lokal Terputus**: Ditangani dengan arsitektur hybrid dan antrean offline IndexedDB ber-ID klien unik (`client_ref`).
2. **Selisih Kas Kasir**: Ditangani dengan rekonsiliasi kas shift harian dan validasi alasan diskon di atas ambang batas.
3. **Kompatibilitas WebView Android Lama**: Ditangani dengan bundling tunggal CRACO tanpa dynamic import dan polyfill ES5 lengkap.

## Definition of Done
1. Seluruh transaksi kasir (F&B dine-in, take-away, retail) teruji menghasilkan mutasi kas dan data order yang benar.
2. Cetak struk dan pembukaan laci kasir berfungsi konsisten pada Sunmi T2 dan printer Bluetooth.
3. Laporan shift dan rekap bagi hasil vendor akurat tanpa duplikasi pencatatan.
4. Seluruh kebutuhan fungsional (`*-FR-*`) dan kriteria penerimaan (`*-AC-*`) tervalidasi dengan bukti pengujian nyata.
