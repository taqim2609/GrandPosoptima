# Dashboard POS Kasir & Visualisasi Data Real-Time Recharts

Mengembangkan dan memperbarui halaman Dashboard POS Kasir dengan integrasi **Recharts** untuk visualisasi tren transaksi F&B vs Retail, kartu peringkat menu terlaris dengan indikator tren naik/turun, serta pembaruan data real-time berbasis Server-Sent Events (SSE).

## User Review & Critical Decisions

> [!IMPORTANT]
> Keputusan desain dan fitur utama yang telah dikonfirmasi oleh pengguna pada Phase 1:

- **Tren Transaksi**: **Grafik Garis Ganda** yang memisahkan omzet F&B dan Retail per rentang jam operasional secara visual dan interaktif.
- **Visualisasi Menu Terlaris**: **Kartu Visual Peringkat** dilengkapi dengan indikator tren (naik, turun, stabil), lencana peringkat, porsi terjual, dan kontribusi omzet.
- **Pembaruan Data Real-Time**: **Otomatis via SSE Stream (`/api/system/sync/stream`)** yang langsung memperbarui dataset chart dan kartu statistik seketika saat transaksi baru masuk, dilengkapi efek pulsa (*pulse indicator*).

---

## 1. Overview & Core Concept

- **Tujuan Utama**: Memberikan gambaran bisnis real-time dan analitik visual yang responsif bagi kasir, manajer, dan owner restoran/toko dalam memantau penjualan harian, performa menu, dan arus transaksi F&B & Retail.
- **Target Pengguna**: Kasir POS, Supervisor Outlet, Admin Operasional, dan Owner Restoran.
- **Nilai Tambah**: Pengambil keputusan dapat mengidentifikasi jam sibuk, perbandingan omzet F&B vs Retail, serta menu terfavorit secara instan tanpa perlu memuat ulang (*refresh*) halaman secara manual.

---

## 2. User Experience & Visual Design

- **Alur Pengguna**:
  1. Pengguna membuka Dashboard (`/dashboard`) dan langsung disambut oleh ringkasan KPI (Omzet Hari Ini, Total Transaksi, Meja Terisi, dan Alert Stok Menipis).
  2. Bagian utama menampilkan **Grafik Garis Ganda Recharts** (omzet F&B vs Retail per jam) dengan tooltip kustom dalam format Rupiah.
  3. Bagian kanan/samping menampilkan **Kartu Peringkat Menu Terlaris** dengan lencana porsi, ikon tren (naik/turun), dan persentase kontribusi.
  4. Ketika ada transaksi baru yang diselesaikan di kasir, stream SSE memicu efek pulsa hijau ("Live Sync") dan grafik/kartu memperbarui nilainya secara halus (*smooth animation*).

- **Visual Identity & Theme**:
  - *Gaya Visual*: Clean, modern, high-contrast F&B cashier dashboard.
  - *Skema Warna*:
    - **F&B Omset**: Merah Khas Grand Aceh (`#E63946` / Crimson Red).
    - **Retail Omset**: Biru Khas Retail (`#2563EB` / Royal Blue).
    - **Latar & Kartu**: Neutral White (`#FFFFFF`) dengan border halus (`#E4E4E7`) dan aksen hijau real-time (`#10B981`).
  - *Tipografi*: Font Sans-Serif tebal untuk angka nominal Rupiah (Font Numeral Monospace/Bold) dan Sans-Serif bersih untuk label.

---

## 3. Key Product Decisions & Trade-Offs

1. **Recharts sebagai Library Visualisasi**:
   - *Pilihan*: Menggunakan Recharts (`ResponsiveContainer`, `LineChart`, `Line`, `XAxis`, `YAxis`, `Tooltip`, `CartesianGrid`).
   - *Alasan*: Kompatibel penuh dengan React 19, mendukung rendering SVG yang tajam pada layar sentuh Sunmi/POS, dan hemat memori.

2. **Gaya Komponen Menu Terlaris (Kartu Visual vs Chart)**:
   - *Pilihan*: Kartu Visual Peringkat dengan Indikator Tren (sesuai pilihan pengguna).
   - *Alasan*: Lebih mudah dibaca dalam waktu singkat oleh kasir dibanding chart lingkaran yang rumit saat transaksi ramai.

3. **Mekanisme Real-Time SSE Stream**:
   - *Pilihan*: Memanfaatkan endpoint SSE bawaan (`/api/system/sync/stream`) yang sudah ada di backend.
   - *Alasan*: Bebas overhead polling HTTP, lebih irit daya pada perangkat POS Android/Raspberry Pi, dan langsung bereaksi saat event `order_created` dipancarkan.

---

## 4. Technical Architecture & Data Strategy

### System & Event Flow Diagram

```
┌────────────────────────────────────────────────────────┐
│           Kasir POS / Pelanggan Web / Mobile           │
│                 (Transaksi Baru Selesai)               │
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│            Backend Express API (`/api/orders`)         │
│  - Menyimpan transaksi & broadcast real-time SSE event │
└───────────────────────────┬────────────────────────────┘
                            │
              (SSE Event: `order_created`)
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│         Dashboard Frontend (`Dashboard.jsx`)           │
│  ┌──────────────────────────────────────────────────┐  │
│  │ 1. KPI Cards (Total Omzet, Transaksi, Meja, Stok)│  │
│  ├──────────────────────────────────────────────────┤  │
│  │ 2. Dual Line Chart Recharts (F&B vs Retail)     │  │
│  ├──────────────────────────────────────────────────┤  │
│  │ 3. Kartu Rank Menu Terlaris (Tren Naik/Turun)    │  │
│  └──────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────┘
```

### Pemetaan Komponen & State Management

- **`Dashboard.jsx`**: Main view container yang mendengarkan SSE stream dan mengambil statistik `/api/dashboard` & `/api/reports/range`.
- **`DashboardCharts.jsx`**: Komponen khusus grafik Recharts yang merender:
  - `LineChart`: Garis F&B (`#E63946`) & Garis Retail (`#2563EB`).
  - Kustom Tooltip untuk pemformatan Rupiah instan (`rupiah(...)`).
- **`TopProductsRankCards.jsx`**: Komponen rendering kartu peringkat menu terlaris dengan lencana `#1`, `#2`, `#3`, persentase, dan indikator tren naik/turun.

---

## Plan Execution Checklist

- [ ] Integrasikan `recharts` pada `DashboardCharts.jsx` dengan tipe grafik Garis Ganda (F&B vs Retail).
- [ ] Buat komponen Kartu Peringkat Menu Terlaris dengan indikator tren naik/turun dan lencana porsi.
- [ ] Sambungkan listener SSE `/api/system/sync/stream` untuk memperbarui data dashboard secara real-time saat transaksi selesai.
- [ ] Jalankan pengujian `compile_applet` dan verifikasi visualisasi data.
