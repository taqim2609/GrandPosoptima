# Fitur — Migrasi Backend Rust (Axum) & Pemisahan Server Terisolasi

Modul backend performa tinggi berbasis Rust (Axum + Tokio) dengan pemisahan proses fisik antara server frontend dan backend, perhitungan presisi Rupiah fixed-point, serta antrean sinkronisasi idempoten.

## Kebutuhan fungsional
- RUST-FR-001: Backend harus diimplementasikan menggunakan Rust dengan web framework Axum dan runtime asynchronous Tokio yang berjalan sebagai daemon HTTP mandiri di port 8000.
- RUST-FR-002: Arsitektur sistem harus memisahkan server frontend (port 3000) dan backend (port 8000) dengan komunikasi murni berbasis REST API dan konfigurasi CORS serta reverse proxy terisolasi.
- RUST-FR-003: Seluruh operasi hitung keuangan (harga jual, timbangan per ons/kg, potongan diskon, dan bagi hasil konsinyasi) harus menggunakan fixed-point arithmetic (`rust_decimal`) untuk menghindari floating point precision loss.
- RUST-FR-004: Sistem harus memvalidasi pemisahan mutlak pesanan F&B dan Retail pada level tipe data Rust (`enum OrderType`), menolak pesanan campuran secara strict.
- RUST-FR-005: Rekonsiliasi kas tutup shift kasir dan pencairan bagi hasil vendor harus diproses secara transaksional atomik untuk mencegah double-deduction kasir.
- RUST-FR-006: Backend harus menyediakan endpoint sinkronisasi batch idempoten yang memverifikasi `client_ref` untuk mencegah duplikasi order dari antrean offline IndexedDB.
- RUST-FR-007: Backend harus mengintegrasikan generator cetak struk ESC/POS monospace (32 kolom untuk 58mm, 42 kolom untuk 80mm) dan pemicu buka laci kasir (`openDrawer`).
- RUST-FR-008: Backend harus menyediakan adapter webhook dua arah dengan verifikasi signature HMAC SHA256 untuk otomatisasi bot WhatsApp Hermes Agent AI.

## Kriteria penerimaan
- RUST-AC-001: Backend Rust menghasilkan binary tunggal native tanpa dependensi interpreter eksternal dengan konsumsi memori idle < 30MB di Raspberry Pi / Linux.
- RUST-AC-002: Frontend web dan APK kasir dapat beroperasi secara mandiri dan mengarahkan API request ke backend lokal maupun remote via `VITE_API_BASE_URL`.
- RUST-AC-003: Uji perhitungan transaksi timbangan pecahan dan diskon bertingkat menghasilkan akurasi desimal 100% identik hingga 2 digit pecahan Rupiah.
- RUST-AC-004: Percobaan membuat order berisi gabungan item F&B dan item Retail menghasilkan respons error HTTP 422 Unprocessable Entity.
- RUST-AC-005: Dokumen `vendor_settlements` dan `cash_movements` tersimpan serentak dalam satu transaksi database saat shift ditutup.
- RUST-AC-006: Pengiriman payload order offline yang sama berulang kali hanya mencatat satu entri di database tanpa menggandakan mutasi kas atau poin.
- RUST-AC-007: Struk kasir yang di-generate menghasilkan layout teks monospace rata kiri-kanan yang presisi tanpa karakter anomali.
- RUST-AC-008: Webhook dari Hermes Agent diverifikasi dengan aman menggunakan secret key dan merespons dalam waktu < 50ms.
