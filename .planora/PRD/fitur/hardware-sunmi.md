# Fitur — Integrasi Hardware Sunmi & Printer Thermal

Modul integrasi perangkat keras kasir pada Android Sunmi T2 dan printer eksternal Bluetooth/Epson.

## Kebutuhan fungsional
- HW-FR-001: Sistem harus dapat mencetak struk belanja kasir pada printer thermal bawaan Sunmi T2 dan printer Bluetooth ESC/POS.
- HW-FR-002: Sistem harus mengirimkan sinyal pembukaan laci kasir fisik (`openDrawer`) otomatis saat transaksi tunai selesai dicetak.
- HW-FR-003: Sistem harus menyediakan tombol tes buka laci kasir manual pada menu Pengaturan Perangkat untuk pengujian berkala.

## Kriteria penerimaan
- HW-AC-001: Printer thermal mencetak teks monospace dengan batas 42 karakter (80mm) atau 32 karakter (58mm) tanpa teks terpotong.
- HW-AC-002: Laci kasir fisik otomatis terbuka seketika perintah `openDrawer` atau sinyal raw ESC/POS dikirimkan.
- HW-AC-003: Bila printer dalam kondisi kertas habis atau cover terbuka, antarmuka kasir menampilkan notifikasi peringatan yang jelas.
