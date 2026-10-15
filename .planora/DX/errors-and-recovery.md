# Penanganan Galat dan Pemulihan

Mekanisme penanganan kegagalan transaksi dan pemulihan data kasir.

## Antrean Offline
Ketika koneksi server lokal terputus, frontend menyimpan transaksi di IndexedDB.
Saat koneksi pulih, `OfflineContext` mengirim antrean secara sekuensial dengan verifikasi status dari backend.
