# Roadmap Pengembangan

Rencana tahapan rilis dan prioritas pengembangan fitur Grand Aceh Kuliner POS.

## Fase 1 — Pondasi POS & Integrasi Hardware (Selesai / Live)
- Implementasi alur transaksi F&B (dine-in, take-away) dan Retail.
- Integrasi Sunmi T2 SDK: pencetakan struk thermal dan pembukaan laci otomatis ().
- Sistem buka/tutup shift kasir dan rekonsiliasi kas.

## Fase 2 — Titipan Vendor & Offline Queue (Selesai / Live)
- Perhitungan bagi hasil vendor per produk dan laporan settlement satu pintu.
- Antrean offline IndexedDB dengan sinkronisasi idempoten saat server tersambung.
- Mode dual-store F&B dan Retail dengan label dinamis dari pengaturan bisnis.

## Fase 3 — Otomasi & Peningkatan Kasir (Aktif / Backlog)
- Pengamanan anti brute-force login kasir dengan rate limiting.
- Pengiriman alarm peringatan stok menipis via WhatsApp otomatis.
- Pencetakan label barcode / SKU untuk produk retail.
- Filter tanggal fleksibel pada Asisten AI.
