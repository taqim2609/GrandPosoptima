# Grand Aceh Kuliner POS

Sistem Point of Sale (POS) hybrid modern untuk F&B (Restoran/Rumah Makan khas Aceh) dan Retail, dilengkapi manajemen meja, pemesanan dine-in & take-away, transaksi retail per-item/per-berat, shift kasir, pergerakan kas, resep & bahan baku (HPP), titipan vendor bagi hasil, kupon & promo member, WhatsApp gateway, asisten AI terintegrasi, dan landing page publik.

## Arsitektur & Teknologi

- **Frontend**: React 19 SPA dengan Vite, Tailwind CSS, shadcn/Radix UI, Lucide Icons, dan React Router v7.
- **Backend**: Express API server terintegrasi (running on port 3000) dengan middleware Vite pada mode pengembangan (`npm run dev`) dan penyajian berkas statis pada mode produksi (`npm start`).
- **Autentikasi & Keamanan**: JWT Authentication, PIN Cepat Kasir, dan Role-Based Access Control (RBAC).
- **Database & Sinkronisasi**: Firebase Firestore terintegrasi dengan fallback in-memory store dan IndexedDB offline queue.

## Skrip Operasional

```bash
# Menjalankan server pengembangan (Express + Vite HMR di port 3000)
npm run dev

# Kompilasi & bundle produksi Vite ke dist/
npm run build

# Menjalankan server produksi
npm start

# Validasi linting kode
npm run lint
```

## Fitur Utama

1. **POS Kasir Cepat**: Pemisahan order F&B (dine-in dengan nomor meja, take-away) dan retail, diskon maksimal 100%, jual per berat, pembayaran tunai/QRIS/kartu/transfer, dan cetak struk thermal 58mm/80mm.
2. **Manajemen Meja & Reservasi**: Visualisasi status meja (kosong, terisi, booking), gabung/pisah/pindah meja, dan integrasi reservasi publik.
3. **Shift & Kas**: Buka/tutup shift kasir, pencatatan kas masuk/keluar, rekonsiliasi kas riil vs sistem, dan bagi hasil titipan vendor otomatis.
4. **Katalog & Inventori**: Manajemen produk makanan, minuman, retail, bahan baku, formula resep, HPP otomatis, dan pencatatan stok opname.
5. **Member & Loyalitas**: Sistem poin reward belanja dan kupon diskon berkode unik.
6. **Laporan & Analitik**: Laporan omzet, rincian metode pembayaran, pergerakan stok, dan rekap shift.
7. **Landing Page Publik**: Etalase menu terbitan, artikel budaya kuliner Aceh, dan formulir reservasi meja online.
