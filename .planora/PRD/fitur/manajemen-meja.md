# Fitur — Manajemen Meja dan Open Bill

Modul pengaturan tata letak meja makan di tempat (dine-in) serta pengelolaan pesanan yang sedang berjalan.

## Kebutuhan fungsional
- TBL-FR-001: Sistem harus menampilkan status visual setiap meja (kosong, terisi, reservasi) secara real-time.
- TBL-FR-002: Sistem harus mendukung fitur split bill (pemecahan pesanan meja menjadi beberapa pembayaran terpisah).
- TBL-FR-003: Sistem harus mendukung pemindahan meja (move table) dan penggabungan tagihan antar meja (merge tables).

## Kriteria penerimaan
- TBL-AC-001: Status meja otomatis berubah menjadi terisi segera setelah pesanan pertama disimpan oleh kasir.
- TBL-AC-002: Pemecahan tagihan (split bill) menghasilkan dua atau lebih order terpisah dengan total akumulatif yang sama persis dengan pesanan awal.
- TBL-AC-003: Meja asal otomatis berstatus kosong setelah dipindahkan seluruh pesanannya ke meja tujuan.
