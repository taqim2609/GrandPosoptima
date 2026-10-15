# Fitur — Manajemen Shift Kasir dan Rekonsiliasi Kas

Modul pencatatan kas awal, kas masuk, kas keluar, dan penutupan shift harian kasir.

## Kebutuhan fungsional
- SHF-FR-001: Sistem harus mewajibkan kasir membuka shift dengan nominal kas awal sebelum dapat melayani transaksi kasir.
- SHF-FR-002: Sistem harus menghitung uang bersih F&B dan Retail secara terpisah dengan memperhitungkan pengeluaran operasional masing-masing.
- SHF-FR-003: Sistem harus mengirimkan ringkasan laporan penutupan shift secara otomatis ke WhatsApp pemilik outlet.

## Kriteria penerimaan
- SHF-AC-001: Kasir tidak dapat memproses pesanan jika belum ada shift aktif yang dibuka.
- SHF-AC-002: Form tutup shift menampilkan perbandingan uang fisik yang dihitung kasir dengan estimasi sistem (*expected cash*) serta mendeteksi selisih kas.
- SHF-AC-003: Laporan penutupan shift tersimpan permanen dan status shift terkunci (*closed*) secara atomik.
