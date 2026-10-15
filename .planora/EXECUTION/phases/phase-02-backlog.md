# Fase 02 — Keamanan, Otomasi & Peningkatan Kasir

Penerapan fitur keamanan login, automasi WhatsApp, dan pencetakan label barcode [SEC-FR-001, AUT-FR-001].

## Dependensi
- Fase 01: Fondasi POS & Hardware Kasir selesai dan terverifikasi.

## Workflow eksekusi
- feature: Pengamanan anti brute-force login kasir dan rate limiting [SEC-FR-001, SEC-FR-002].
- feature: Alarm stok menipis otomatis via WhatsApp Gateway [AUT-FR-001].
- feature: Pencetakan label barcode / SKU retail [POS-FR-001].
- feature: Filter tanggal fleksibel pada Asisten AI [AUT-FR-002].

## Kriteria keluar
- Akun kasir terkunci sementara setelah 5 kali gagal autentikasi.
- WhatsApp gateway mengirimkan peringatan stok secara berkala saat stok menipis.
