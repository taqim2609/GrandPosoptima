# 📚 Dokumentasi Terpadu — Grand Aceh Kuliner POS & Hermes AI Agent

Selamat datang di pusat dokumentasi resmi **Grand Aceh Kuliner POS**. Direktori ini dirancang khusus untuk memandu pemilik outlet, pengembang sistem, dan **Agen AI Hermes** dalam mengoperasikan, mengelola, serta menyebarkan (*deploy*) seluruh ekosistem kasir hybrid F&B dan Retail.

---

## 🗺️ Peta Navigasi Dokumentasi

Direktori `/dokumentasi/` terbagi menjadi 4 modul utama:

| No | Berkas Dokumentasi | Fokus & Sasaran Pembaca | Deskripsi Isi |
|---|---|---|---|
| **01** | [`01-PROMPT-HERMES-INSTALLER.md`](./01-PROMPT-HERMES-INSTALLER.md) | **Agen AI Hermes / DevOps / Sysadmin** | Prompt siap salin (*copy-paste*) untuk Agen AI Hermes guna menginstal dan mengonfigurasi **Server Gudang 644 (VPS)** dan **GrandPOS (Raspberry Pi)** secara otomatis via SSH & Docker. |
| **02** | [`02-PANDUAN-FITUR-DAN-PENGGUNAAN.md`](./02-PANDUAN-FITUR-DAN-PENGGUNAAN.md) | **Kasir, Supervisor, & Manajer Toko** | Panduan operasional seluruh fitur sistem: Transaksi F&B (Meja/Takeaway), Retail (Barcode/Timbang Ons), Titipan Vendor (Konsinyasi), Tutup Shift Kasir, Diskon/Promo, WhatsApp Gateway, dan Landing Page. |
| **03** | [`03-FUNGSI-SELURUH-FILE.md`](./03-FUNGSI-SELURUH-FILE.md) | **Software Engineer & AI Architect** | Kamus arsitektur kode lengkap yang merinci fungsi teknis setiap berkas backend, frontend, skrip shell, konfigurasi lingkungan, dan skema data. |
| **04** | [`04-INDEX-NAVIGASI-KODE.md`](./04-INDEX-NAVIGASI-KODE.md) | **Developer & Coding Agent** | Indeks pencarian cepat (*quick-lookup table*) untuk menemukan lokasi kode berdasarkan fitur bisnis (misal: hitung HPP vendor, cetak struk ESC/POS, sinkronisasi offline IndexedDB). |

---

## 🏛️ Gambaran Arsitektur Sistem Dual-Node

Sistem Grand Aceh Kuliner POS menggunakan arsitektur hybrid yang memisahkan beban kerja database & komunikasi terpusat dengan frontend kasir toko:

```
┌────────────────────────────────────────────────────────────────────────┐
│                        SERVER GUDANG 644 (VPS)                         │
│                                                                        │
│   ┌───────────────────┐    ┌──────────────────┐    ┌───────────────┐   │
│   │   Master Database │    │  WhatsApp API    │    │  Public Web   │   │
│   │  (Postgres/Mongo) │◄───┤  (Baileys :8644) │    │  Landing Page │   │
│   └─────────┬─────────┘    └──────────────────┘    └───────┬───────┘   │
│             │                                              │           │
│             │              ┌──────────────────┐            │           │
│             └─────────────►│  MCP SSE Server  │◄───────────┘           │
│                            │    (Port 3000)   │                        │
│                            └────────┬─────────┘                        │
└─────────────────────────────────────┼──────────────────────────────────┘
                                      │
                         Koneksi Private Mesh Tailscale
                           (Enkripsi WireGuard Aman)
                                      │
┌─────────────────────────────────────┼──────────────────────────────────┐
│                                     ▼                                  │
│                      GRANDPOS (RASPBERRY PI OUTLET)                    │
│                                                                        │
│   ┌────────────────────────────────────────────────────────────────┐   │
│   │  React 19 Frontend Kiosk (Chromium Touchscreen)                │   │
│   │  - Antrean Sinkronisasi Idempoten (IndexedDB / OfflineContext) │   │
│   └──────────────────────┬─────────────────────────┬───────────────┘   │
│                          │                         │                   │
│                          ▼                         ▼                   │
│               Printer Thermal ESC/POS          Laci Kasir              │
│                 (USB / Bluetooth)            (Cash Drawer)             │
└────────────────────────────────────────────────────────────────────────┘
```

### Keunggulan Arsitektur Ini:
1. **Zero Database Collision**: Server Gudang 644 bertindak sebagai *single source of truth*. Raspberry Pi di toko kasir tidak menjalankan database replikasi yang rawan konflik ID transaksi.
2. **Offline-First Resilience**: Jika koneksi internet di outlet terputus, kasir tetap dapat melayani pesanan dan mencetak struk fisik. Semua order ditampung di IndexedDB browser dan disinkronkan otomatis begitu jaringan pulih.
3. **Kendali Penuh Hermes AI**: Hermes AI Agent dapat mengubah pengaturan WhatsApp, memicu broadcast, memperbarui banner promo landing page, dan mengaudit mutasi cluster server secara aman via protokol MCP SSE dan REST API.

---

## 🚀 Langkah Cepat Memulai

1. **Untuk Memasang Sistem ke Server & Pi**: Buka [`01-PROMPT-HERMES-INSTALLER.md`](./01-PROMPT-HERMES-INSTALLER.md), salin seluruh isi teks prompt, dan berikan ke Agen AI Hermes Anda.
2. **Untuk Memahami Cara Kerja Fitur Kasir**: Pelajari [`02-PANDUAN-FITUR-DAN-PENGGUNAAN.md`](./02-PANDUAN-FITUR-DAN-PENGGUNAAN.md).
3. **Untuk Mengembangkan atau Memodifikasi Kode**: Rujuk [`03-FUNGSI-SELURUH-FILE.md`](./03-FUNGSI-SELURUH-FILE.md) dan gunakan [`04-INDEX-NAVIGASI-KODE.md`](./04-INDEX-NAVIGASI-KODE.md) untuk navigasi file secara cepat.
