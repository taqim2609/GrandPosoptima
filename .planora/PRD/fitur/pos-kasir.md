# Fitur — Transaksi Kasir POS F&B dan Retail

Modul kasir utama untuk melayani pesanan F&B (makan di tempat & bawa pulang) serta transaksi Retail cepat.

## Kebutuhan fungsional
- POS-FR-001: Sistem harus menyediakan antarmuka kasir yang memisahkan mode transaksi F&B dan Retail secara tegas.
- POS-FR-002: Sistem harus mendukung pemilihan meja untuk pesanan dine-in, pemindahan meja, dan penggabungan meja.
- POS-FR-003: Sistem harus mendukung produk dengan satuan berat (ons/kg) dengan kalkulasi harga dan HPP proporsional.
- POS-FR-004: Sistem harus memvalidasi diskon belanja dan mewajibkan pengisian alasan jika melebihi ambang batas yang ditetapkan outlet.

## Kriteria penerimaan
- POS-AC-001: Kasir dapat menyelesaikan transaksi tunai, QRIS, atau kartu dalam waktu kurang dari 5 detik.
- POS-AC-002: Pesanan dine-in terkunci ke nomor meja hingga tagihan diselesaikan atau dibatalkan.
- POS-AC-003: Transaksi yang dibuat saat server terputus otomatis tersimpan di antrean IndexedDB dan tersinkronisasi idempoten saat terhubung kembali.
- POS-AC-004: Diskon di atas ambang batas (misal >15% atau >Rp 50.000) menolak penyimpanan transaksi jika kolom alasan diskon tidak diisi.
