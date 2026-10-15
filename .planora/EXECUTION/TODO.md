# Checklist Eksekusi — Grand Aceh Kuliner POS

Buku besar pelacakan implementasi sistem.

## Checklist eksekusi
- [x] `TASK-001` — Alur Transaksi Kasir POS F&B dan Retail
  - Status: `done`
  - Workflow: `feature`
  - Phase: 01
  - Requirements: POS-FR-001, POS-FR-002, POS-FR-003
  - Dependencies: none
  - Validation: Uji transaksi dine-in, take-away, dan retail pada tablet dan web
  - Evidence: Modul POS aktif di production dan terverifikasi

- [x] `TASK-002` — Integrasi Printer Thermal dan Pembuka Laci Kasir Sunmi T2
  - Status: `done`
  - Workflow: `feature`
  - Phase: 01
  - Requirements: HW-FR-001, HW-FR-002, HW-FR-003
  - Dependencies: TASK-001
  - Validation: Pengujian metode openDrawer di MainActivity dan receipt.js
  - Evidence: APK v2.10 terdistribusi dan teruji membuka laci fisik

- [x] `TASK-003` — Manajemen Titipan Vendor dan Tutup Shift Satu Pintu
  - Status: `done`
  - Workflow: `feature`
  - Phase: 01
  - Requirements: VND-FR-001, VND-FR-002, VND-FR-003
  - Dependencies: TASK-001
  - Validation: Uji tutup shift dengan pembagian hasil vendor otomatis
  - Evidence: Vendor settlement tercatat di mutasi kas tanpa double deduction

- [ ] `TASK-004` — Pengamanan Anti Brute-Force Login Kasir dan Rate Limiting
  - Status: `pending`
  - Workflow: `feature`
  - Phase: 02
  - Requirements: SEC-FR-001, SEC-FR-002, SEC-FR-003
  - Dependencies: TASK-001
  - Validation: Uji penguncian akun kasir setelah 5 kali gagal autentikasi
  - Evidence: Menunggu implementasi proteksi rate limiting pada endpoint login backend

- [ ] `TASK-005` — Alarm Peringatan Stok Menipis via WhatsApp Otomatis
  - Status: `pending`
  - Workflow: `feature`
  - Phase: 02
  - Requirements: AUT-FR-001
  - Dependencies: TASK-001
  - Validation: Uji pengiriman pesan berkala saat stok bahan di bawah batas minimum
  - Evidence: Menunggu integrasi cron scheduler dengan WhatsApp Gateway

- [ ] `TASK-006` — Pencetakan Label Barcode dan SKU Produk Retail
  - Status: `pending`
  - Workflow: `feature`
  - Phase: 02
  - Requirements: POS-FR-001
  - Dependencies: TASK-001
  - Validation: Uji generate dan cetak label barcode pada printer label kasir
  - Evidence: Menunggu perancangan template label pada modul retail

- [ ] `TASK-007` — Filter Rentang Tanggal Fleksibel pada Asisten AI
  - Status: `pending`
  - Workflow: `feature`
  - Phase: 02
  - Requirements: AUT-FR-002
  - Dependencies: TASK-001
  - Validation: Uji query rentang tanggal khusus pada chat asisten AI
  - Evidence: Menunggu pembaruan prompt context dan parameter tool query

- [x] `TASK-008` — Landing Page Publik, Etalase Menu, Cerita Kuliner Aceh, dan Booking Meja Online
  - Status: `done`
  - Workflow: `feature`
  - Phase: 02
  - Requirements: LND-FR-001, LND-FR-002, LND-FR-003, LND-FR-004
  - Dependencies: TASK-001
  - Validation: Uji akses publik rute utama, filter menu, baca artikel, dan submit booking meja terhubung ke POS & WhatsApp
  - Evidence: LandingPage.jsx aktif di rute publik /, menu terbitan & artikel /api/public/* terverifikasi, formulir booking terhubung ke database reservasi POS dan WhatsApp, panel /articles aktif di admin
