# Kebutuhan Non-Fungsional

Standar kualitas teknis sistem Grand Aceh Kuliner POS.

## 1. Performa dan Keandalan
- Waktu respon API kasir lokal maksimal 150ms pada Raspberry Pi 3/4.
- Kapasitas offline mampu menampung minimal 500 transaksi di IndexedDB lokal browser.

## 2. Kompatibilitas Hardware
- Berjalan stabil pada WebView Android 7.0+ (Sunmi OS 2.x).
- Mendukung protokol printer ESC/POS via USB, Bluetooth, dan Sunmi SDK internal.

## 3. Keamanan Data
- Otentikasi berbasis JWT dengan enkripsi sandi bcrypt.
- Hak akses bertingkat: Admin (akses penuh), Kasir (transaksi kasir, laporan shift), Input (katalog produk).
