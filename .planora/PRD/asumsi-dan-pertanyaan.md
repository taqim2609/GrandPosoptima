# Asumsi dan Keputusan Arsitektur

Dokumentasi asumsi operasional dan keputusan teknis sistem Grand Aceh Kuliner POS.

## Asumsi Operasional
1. Kasir memiliki setidaknya satu perangkat kasir fisik (Sunmi T2 atau PC/Laptop dengan browser modern).
2. Server lokal menggunakan container Docker (Raspberry Pi atau PC Windows Master) pada jaringan WiFi toko.
3. Transaksi tunai dan QRIS statis tetap dapat diterima meskipun jaringan internet publik sedang terputus.

## Keputusan Arsitektur
1. **Single-Store Dual-Concept**: F&B dan Retail dipisahkan di level order untuk memudahkan pelaporan pajak dan margin.
2. **Idempotent Sync Queue**: Transaksi offline diberi UUID  sebelum dikirim ke backend agar tidak terjadi duplikasi.
3. **Vendor Settlement Satu Pintu**: Pembayaran vendor dicatat saat tutup shift untuk memastikan uang fisik kasir selalu cocok dengan laporan.
