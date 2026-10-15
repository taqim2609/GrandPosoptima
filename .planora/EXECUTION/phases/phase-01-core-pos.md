# Fase 01 — Fondasi POS & Hardware Kasir

Implementasi alur kasir utama dan hardware printer thermal [POS-FR-001, HW-FR-001, VND-FR-001].

## Dependensi
- Fase 00: Keputusan dan Arsitektur Awal selesai.

## Workflow eksekusi
- feature: Pembuatan modul transaksi kasir F&B dan Retail [POS-FR-001, POS-FR-002].
- feature: Integrasi Sunmi T2 SDK bridge untuk cetak thermal dan laci kasir [HW-FR-001, HW-FR-002].
- feature: Manajemen titipan vendor dan tutup shift kasir [VND-FR-001, VND-FR-002, VND-FR-003].

## Kriteria keluar
- Transaksi kasir dapat diselesaikan dan menghasilkan mutasi kas yang benar.
- Struk thermal tercetak rapi dan laci kasir terbuka secara otomatis.
