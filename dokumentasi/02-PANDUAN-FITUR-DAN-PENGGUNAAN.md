# 📖 Panduan Lengkap Fitur & Operasional Kasir
## Grand Aceh Kuliner POS (Hybrid F&B, Retail & Konsinyasi Vendor)

Dokumen ini menjelaskan secara menyeluruh cara kerja, alur bisnis, serta petunjuk operasional setiap fitur yang ada di dalam aplikasi **Grand Aceh Kuliner POS**.

---

## 📑 Daftar Isi
1. [Prinsip Bisnis & Aturan Emas Sistem](#1-prinsip-bisnis--aturan-emas-sistem)
2. [Modul Transaksi F&B (Restoran & Rumah Makan Aceh)](#2-modul-transaksi-fb-restoran--rumah-makan-aceh)
3. [Modul Transaksi Retail (Kelontong & Oleh-oleh)](#3-modul-transaksi-retail-kelontong--oleh-oleh)
4. [Sistem Titipan Vendor Konsinyasi (Bagi Hasil Satu Pintu)](#4-sistem-titipan-vendor-konsinyasi-bagi-hasil-satu-pintu)
5. [Manajemen Shift Kasir & Rekonsiliasi Uang](#5-manajemen-shift-kasir--rekonsiliasi-uang)
6. [Diskon, Kupon Promo & Poin Member](#6-diskon-kupon-promo--poin-member)
7. [WhatsApp Gateway Otomatis (Baileys Port 8644)](#7-whatsapp-gateway-otomatis-baileys-port-8644)
8. [Landing Page Publik & Menu Online](#8-landing-page-publik--menu-online)
9. [Arsitektur Offline-First & Sinkronisasi Idempoten](#9-arsitektur-offline-first--sinkronisasi-idempoten)
10. [Pusat Kontrol MCP & Audit Mutasi Agen AI Hermes](#10-pusat-kontrol-mcp--audit-mutasi-agen-ai-hermes)

---

## 1. Prinsip Bisnis & Aturan Emas Sistem

Sistem Grand Aceh Kuliner POS dirancang dengan logika ketat untuk mencegah selisih kas dan salah hitung:

1. **Pemisahan Transaksi F&B dan Retail**:
   - Transaksi meja makan (Dine-in / Take-away F&B) tidak dicampur dalam satu struk dengan belanjaan toko kelontong (Retail). Ini menjaga akurasi laporan laba kotor masing-masing divisi.
2. **Aturan Perlindungan Vendor & HPP**:
   - Jika kasir memberikan diskon kepada pembeli, **diskon ditanggung 100% oleh outlet**.
   - HPP (*Harga Pokok Penjualan*) dan bagi hasil milik vendor konsinyasi **TIDAK PERNAH dipotong oleh diskon**.
3. **Penyelesaian Vendor Satu Pintu (*Shift Close Settlement*)**:
   - Pembagian hak vendor dilakukan saat kasir tutup shift. Sistem secara otomatis mencatat dokumen `vendor_settlements` dan mutasi kas keluar `cash_movements` kategori *"Bagi Hasil Vendor"*, sehingga memotong kas fisik shift secara akurat tanpa *double-deduction*.
4. **Poin & Kupon Atomik**:
   - Poin loyalty member dan penggunaan kupon hanya dipotong atau diberikan saat order berstatus `LUNAS`. Jika pesanan di-void atau di-refund, poin dan kupon otomatis dibalikkan secara atomik.
5. **Format Mata Uang Rupiah**:
   - Seluruh nominal disimpan dan dibulatkan dengan fungsi `round(..., 2)`.

---

## 2. Modul Transaksi F&B (Restoran & Rumah Makan Aceh)

Modul ini dioptimalkan untuk ritme cepat rumah makan, kedai kopi, dan restoran khas Aceh:

### A. Alur Pemesanan Dine-In (Makan di Tempat)
1. Buka layar kasir di menu navigasi utama **Kasir / POS**.
2. Pilih tab **F&B**.
3. Klik tombol **Pilih Meja**:
   - Meja hijau = Kosong (*Available*).
   - Meja oranye/merah = Sedang terisi (*Occupied/Billing*).
4. Klik item menu makanan (misal: *Mie Aceh Daging Spesial, Kari Bebek, Kopi Sanger Panas*).
5. Tambahkan opsi catatan dapur jika ada permintaan khusus (misal: *"Kurang pedas"*, *"Tanpa tauge"*).
6. Tekan tombol **Kirim ke Dapur**:
   - Printer dapur otomatis mencetak tiket pesanan (*kitchen ticket*).
   - Status meja berubah menjadi aktif terisi.

### B. Alur Take-Away (Bungkus)
1. Pada menu POS F&B, pilih opsi mode **Bungkus / Take Away**.
2. Masukkan nama pelanggan atau nomor antrean.
3. Masukkan item menu dan lakukan pembayaran langsung atau cetak antrean.

### C. Split Bill (Pisah Bayar) & Gabung Meja
- **Pisah Tagihan**: Kasir dapat memisahkan item pesanan ke dalam dua atau lebih pembayaran terpisah (berguna untuk rombongan yang ingin membayar sendiri-sendiri).
- **Gabung Meja**: Menggabungkan tagihan dari dua meja yang digabung tanpa kehilangan riwayat pesanan.

### D. Reservasi Meja & Down Payment (DP)
1. Buka menu **Reservasi**.
2. Tambahkan nama pemesan, kontak WhatsApp, tanggal/jam kedatangan, dan jumlah tamu.
3. Masukkan nominal uang muka (DP). DP otomatis tercatat pada mutasi kas shift aktif.
4. Saat pelanggan datang, reservasi diubah menjadi meja aktif, dan nominal DP otomatis memotong sisa tagihan akhir.

---

## 3. Modul Transaksi Retail (Kelontong & Oleh-oleh)

Modul ini dirancang untuk toko oleh-oleh khas Aceh, kelontong, dan bumbu dapur kemasan:

### A. Scanning Cepat Barcode
- Kasir cukup memindai barcode produk menggunakan barcode scanner USB atau Bluetooth.
- Sistem langsung mendeteksi produk dan menambahkannya ke keranjang kasir dalam waktu kurang dari 50 milidetik.

### B. Penjualan Berbasis Satuan Berat (Ons / Kg)
- Untuk komoditas seperti dendeng sapi, bubuk kopi Aceh curah, atau bumbu masak kiloan:
  - Satuan berat: `ons` (100 gram) atau `kg`.
  - Rumus: $\text{Harga Total} = \text{Harga Dasar} \times \text{Berat (ons/kg)}$.
  - HPP dan bagian vendor secara otomatis diskalakan proporsional terhadap bobot yang ditimbang.

### C. Multi-Satuan & Grosir
- Produk retail mendukung konversi otomatis (Pcs, Lusin, Dus).
- Kasir dapat memilih satuan yang dibeli pelanggan dan stok gudang otomatis terpotong sesuai rasio konversi.

---

## 4. Sistem Titipan Vendor Konsinyasi (Bagi Hasil Satu Pintu)

Sistem ini memudahkan outlet bekerja sama dengan produsen lokal (misal: kue basah, kripik emping, timphan Aceh):

1. **Pendaftaran Produk Vendor**:
   - Masukkan nama vendor (Supplier).
   - Tentukan skema bagi hasil:
     - *Persentase*: Toko mendapat misal 20%, Vendor 80%.
     - *Harga Beli Flat*: Toko menjual seharga Rp 15.000, hak vendor Rp 12.000, margin toko Rp 3.000.
2. **Penjualan Barang Vendor di Kasir**:
   - Produk vendor muncul di katalog POS kasir seperti produk biasa.
   - Saat kasir menjual barang vendor, sistem mencatat nilai penjualan dan menghitung porsi bagi hasil secara real-time di latar belakang.
3. **Penyelesaian (*Settlement*) Saat Tutup Shift Kasir**:
   - Ketika kasir mengakhiri shift kerjanya, sistem menampilkan ringkasan hak vendor yang terjual pada shift tersebut.
   - Kasir menyerahkan uang kas hak vendor kepada pihak vendor/penanggung jawab.
   - Sistem mencatat transaksi ini satu pintu ke `vendor_settlements` dan otomatis membuat mutasi kas keluar `cash_movements` berkategori *"Bagi Hasil Vendor"*.
   - Uang kas fisik yang disetor ke pemilik toko langsung bersih dari hak vendor tanpa kebingungan selisih.

---

## 5. Manajemen Shift Kasir & Rekonsiliasi Uang

Fitur shift kasir memastikan transparansi penuh antara kasir dan pemilik usaha:

### A. Buka Shift (Mulai Kerja)
1. Kasir login dengan akun masing-masing.
2. Muncul dialog **Buka Shift**:
   - Masukkan nominal **Modal Awal Kasir** (uang receh kembalian di laci kas).
   - Klik **Mulai Shift**. Laci kasir (*cash drawer*) dapat terbuka otomatis jika terhubung.

### B. Mutasi Kas Berjalan (*Cash Movements*)
Selama jam operasional, kasir dapat mencatat mutasi kas kasir:
- **Kas Masuk**: Setoran tambahan dari manajer, penerimaan DP reservasi tunai.
- **Kas Keluar**: Pembelian bumbu dapur darurat, beli es batu, bayar kurir, atau beban operasional kecil.

### C. Tutup Shift (Akhir Kerja & Rekonsiliasi)
1. Klik tombol **Tutup Shift** di pojok atas layar POS.
2. Sistem menampilkan ringkasan perhitungan otomatis:
   $$\text{Uang Bersih F&B} = \text{Total Tunai F&B} - \text{Kas Keluar F&B}$$
   $$\text{Uang Bersih Retail} = \text{Total Tunai Retail} - \text{Kas Keluar Retail}$$
   $$\text{Total Kas Sistem} = \text{Modal Awal} + \text{Total Uang Bersih} - \text{Setoran Vendor}$$
3. Kasir menghitung uang fisik di laci dan memasukkan nominal **Uang Fisik Dihitung**.
4. Sistem membandingkan:
   - Jika sama $\rightarrow$ Status **Cocok / Pas**.
   - Jika berbeda $\rightarrow$ Status **Selisih Lebih** atau **Selisih Kurang** (kasir wajib memasukkan catatan alasan).
5. Klik **Konfirmasi Tutup Shift**:
   - Printer thermal otomatis mencetak struk laporan shift (*Z-Report*).

---

## 6. Diskon, Kupon Promo & Poin Member

Grand Aceh Kuliner POS memiliki mesin promosi yang fleksibel:

- **Diskon Manual di Kasir**:
  - Pilihan tipe: Persentase (`%`) atau Nominal Rupiah (`Rp`).
  - *Batas Pengawasan*: Jika kasir memberikan diskon melebihi ambang batas toko (misal di atas 15%), sistem mewajibkan kasir memasukkan alasan diskon (misal: *"Komplain pelayanan"*, *"Keluarga pemilik"*).
- **Kupon Promo**:
  - Kode voucher unik (misal: `ACEHJAYA`, `JUMATBERKAH`).
  - Memiliki masa berlaku, kuota penggunaan, dan minimal belanja.
  - Dapat diaktifkan secara instan oleh **Hermes AI Agent**.
- **Poin Loyalty Pelanggan**:
  - Pelanggan yang terdaftar dengan nomor HP mengumpulkan poin setiap transaksi.
  - Poin dapat ditukarkan langsung memotong total tagihan kasir.

---

## 7. WhatsApp Gateway Otomatis (Baileys Port 8644)

Sistem terhubung ke mesin Baileys WhatsApp Gateway lokal di port 8644:

1. **Kirim Struk Digital Otomatis**:
   - Setelah kasir menekan tombol "Lunas", kasir dapat menekan opsi "Kirim WA".
   - Sistem mengirimkan struk rapi beserta rincian item, ucapan terima kasih, dan link pesanan langsung ke WhatsApp pelanggan.
2. **Notifikasi Pengingat Reservasi**:
   - Pelanggan yang memesan meja otomatis mendapat pesan konfirmasi dan pengingat H-2 jam sebelum waktu kedatangan.
3. **Pusat Pengaturan WhatsApp**:
   - Dapat diatur status aktif/nonaktifnya melalui menu **Pengaturan $\rightarrow$ Integrasi WhatsApp** atau langsung diperintahkan melalui Agen AI Hermes menggunakan alat `pos_manage_whatsapp_config`.

---

## 8. Landing Page Publik & Menu Online

Sistem menyertakan landing page modern berkecepatan tinggi yang menyatu dengan POS:

- **URL Akses**: Diakses langsung pada root server (`http://<ip-server-atau-domain>/`).
- **Fitur Utama**:
  - Hero Banner Promosi dinamis (judul, deskripsi, gambar, dan kode kupon).
  - Katalog Makanan Khas Aceh interaktif lengkap dengan foto resolusi tinggi, harga, dan label promo.
  - Informasi jam operasional, lokasi outlet, dan tombol cepat WhatsApp Customer Service.
- **Koneksi ke Agen Hermes**:
  - Agen AI Hermes dapat mengubah teks banner promo landing page kapan saja melalui perintah natural language atau MCP tool `pos_manage_promos_and_coupons`.

---

## 9. Arsitektur Offline-First & Sinkronisasi Idempoten

Kasir toko tidak boleh terhenti hanya karena kabel internet putus atau sinyal seluler drop:

- **Cara Kerja**:
  - Semua data katalog menu dan harga tersimpan di cache memori lokal.
  - Ketika internet mati, indikator di bagian atas layar POS akan menampilkan lencana oranye: **Mode Offline**.
  - Kasir tetap dapat menambah pesanan, menghitung kembalian, dan mencetak struk kasir melalui printer thermal USB/Bluetooth.
  - Transaksi yang terjadi disimpan secara aman di **IndexedDB** browser perangkat kasir dengan UUID unik idempoten.
- **Sinkronisasi Otomatis**:
  - Begitu koneksi internet atau jaringan Tailscale tersambung kembali, `OfflineContext.jsx` secara otomatis mendorong (*push*) seluruh antrean transaksi ke database pusat Gudang 644 tanpa ada risiko data terduplikasi (*idempotent guarantee*).

---

## 10. Pusat Kontrol MCP & Audit Mutasi Agen AI Hermes

Terletak di menu **Pengaturan $\rightarrow$ Agen AI & MCP** (`SettingsMCP.jsx`):

1. **Dashboard Status**:
   - Memantau URL endpoint SSE (`/api/mcp/sse`), status koneksi cluster server, dan jumlah tools yang aktif (11 tools).
2. **Tool Playground Interaktif**:
   - Pemilik outlet dapat menguji eksekusi alat MCP langsung dari browser dengan memilih kategori: *Semua, WhatsApp, Cluster Server, Promo & Banner, Kasir*.
3. **Tab Audit Mutasi Agen AI**:
   - Setiap kali Hermes Agent membuat perubahan (mengubah server, mengedit voucher promo, mengubah konfigurasi WhatsApp), sistem secara otomatis mencatat riwayat audit lengkap.
   - Dilengkapi tampilan perbandingan **Sebelum (Before)** dan **Sesudah (After)** dalam bentuk JSON diff yang transparan dan dapat dibatalkan jika diperlukan.
