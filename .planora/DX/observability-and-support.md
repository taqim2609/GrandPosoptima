# Observabilitas dan Diagnostik

Pemantauan kondisi sistem dan pengiriman log diagnostik.

## Endpoint Kesehatan
- `GET /api/health`: Memeriksa koneksi database MongoDB dan status worker.
- `POST /api/diag/send`: Mengirim laporan diagnostik ke server pusat.
