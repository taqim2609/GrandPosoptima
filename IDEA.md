# IDEA.md — Blueprint Agen Hermes: Autonomous Restaurant & Retail Co-Pilot
## Grand Aceh Kuliner POS & Enterprise System

> **Versi Dokumen**: `1.0.0-PROD`  
> **Target Agent**: Hermes Agent (Nous Research / Hermes 3 / Qwen-2.5 / Function Calling & MCP)  
> **Arsitektur Sistem**: Grand Aceh Kuliner POS (F&B Restoran Khas Aceh, Retail Kelontong, Titipan Konsinyasi Vendor)  
> **Topologi**: Hybrid Multi-Node (Sunmi T2 Android POS, Raspberry Pi Kasir, Windows Master PC, Cloud VPS, Tailscale Mesh)

---

## 1. Visi Eksekutif: Dari Mesin Kasir Pasif Menjadi AI Co-Pilot Otonom

Sistem **Grand Aceh Kuliner POS** telah memiliki fondasi arsitektur hybrid yang tangguh: offline-first IndexedDB, sinkronisasi idempoten multi-server, dukungan perangkat keras Sunmi thermal printer, manajemen meja interaktif, serta server Model Context Protocol (**MCP**) bawaan.

Integrasi **Hermes Agent** bertujuan mengubah POS ini dari sekadar **alat pencatat transaksi (transaksional pasif)** menjadi **Co-Pilot Operasional Cerdas (Autonomous Operational Co-Pilot)** yang proaktif, berinisiatif, dan mampu berpikir multi-langkah (*multi-turn reasoning & tool calling*).

### Mengapa Hermes Agent?
1. **Kekuatan Penalaran Mandiri (Sovereign Reasoning)**: Model Hermes (Nous Research) memiliki keunggulan luar biasa dalam mengikuti instruksi kompleks (*instruction following*), *structured JSON output*, dan *agentic tool use*.
2. **Kepatuhan Protokol Standar Terbuka (MCP Native)**: Hermes secara native dapat berkomunikasi dengan endpoint Model Context Protocol (`/api/mcp` dan `/api/mcp/sse`) yang telah diimplementasikan di POS.
3. **Multi-Channel Presence**: Hermes beroperasi sekaligus di WhatsApp Gateway (Baileys), terminal terminal server (CLI), widget obrolan internal kasir (`/assistant-ai`), dan background cron monitoring.
4. **Privasi & Edge-Ready**: Dapat di-host mandiri (*self-hosted*) di VPS lokal maupun menggunakan SLM terkuantisasi (3B/7B) di PC Master/Raspberry Pi melalui Ollama/llama.cpp saat koneksi internet terputus.

---

## 2. Matriks 5 Persona Agen Hermes (The 5 Hermes Agent Personas)

Untuk mencegah agen bekerja serabutan, Hermes dikonfigurasi dengan 5 sub-agen (*personas*) yang memiliki spesialisasi peran dan hak akses terukur:

```
                      ┌─────────────────────────────────────────┐
                      │           HERMES SUPERVISOR             │
                      │       (Router & Intent Classifier)      │
                      └────────────────────┬────────────────────┘
                                           │
         ┌───────────────────┬─────────────┴──────┬───────────────────┐
         ▼                   ▼                    ▼                   ▼
┌─────────────────┐ ┌─────────────────┐ ┌──────────────────┐ ┌─────────────────┐
│   HERMES OPS    │ │ HERMES PANTRY   │ │  HERMES VENDOR   │ │ HERMES CONCIERGE│
│ (Kasir & Audit) │ │(Dapur & Resep)  │ │ (Konsinyasi Hak) │ │ (WA & Reservasi)│
└─────────────────┘ └─────────────────┘ └──────────────────┘ └─────────────────┘
                                     │
                                     ▼
                          ┌─────────────────────┐
                          │     HERMES SRE      │
                          │ (Kluster & Health)  │
                          └─────────────────────┘
```

---

### Persona 1: `Hermes Ops` — Kasir, Shift, & Detektif Audit Fraud
* **Fokus Utama**: Mengawasi operasional meja kasir, integritas penerimaan uang, dan audit transaksi abnormal.
* **Tanggung Jawab**:
  - **Live Shift Intelligence**: Membaca modal awal laci (*cash drawer initial float*), mutasi kas masuk/keluar, dan menghitung `net_cash_fnb` serta `net_cash_retail`.
  - **Deteksi Anomali Void & Refund**: Menganalisis log pembatalan pesanan (`pos_get_void_refund_audit`). Memberikan sinyal jika ada pesanan tunai yang di-void berulang kali oleh kasir tertentu tanpa alasan valid.
  - **Audit Diskon Tidak Wajar**: Mengawasi pemberian diskon yang melampaui ambang batas outlet tanpa otorisasi Supervisor.
  - **Laporan Tutup Shift Otomatis**: Menghasilkan ringkasan naratif saat kasir tutup shift dan mengirimkannya langsung ke WhatsApp Owner.

---

### Persona 2: `Hermes Pantry` — Intelijen Dapur Aceh & Pengendali Stok
* **Fokus Utama**: Manajemen bahan baku segar khas masakan Aceh (Mie Aceh, Daging Sapi/Kambing, Kepiting, Bebek, Bumbu Masak Aceh, Santan, Beras).
* **Tanggung Jawab**:
  - **Peringatan Bahan Menipis (Dynamic Low Stock Alert)**: Secara berkala memantau stok bahan mentah melalui tool `pos_get_low_stock`.
  - **Analisis HPP & Resep Dinamis**: Memeriksa komposisi resep (`pos_get_recipes`) dan menghitung lonjakan HPP (*Cost of Goods Sold*) ketika harga komoditas pasar (seperti cabai merah, bawang, atau daging sapi) naik.
  - **Rekomendasi Batch Memasak Harian**: Menghitung proyeksi kebutuhan porsi masakan berdasarkan tren historis hari (misal: lonjakan 45% penjualan Mie Aceh Goreng Seafood di Jumat malam dan akhir pekan).
  - **Opname Cepat Berbasis Suara/Teks**: Kasir atau kepala koki cukup mengetik *"Hermes, stok telur ayam pecah 1 karpet (30 butir)"*, dan agen mengeksekusi penyesuaian stok dengan audit trail otomatis.

---

### Persona 3: `Hermes Vendor` — Otomasi Konsinyasi & Bagi Hasil Satu Pintu
* **Fokus Utama**: Mengelola mitra titipan makanan/snack khas Aceh (Kue Timphan, Roti Canai, Kembang Loyang, Keripik Balado, dll.).
* **Tanggung Jawab**:
  - **Kalkulasi Bagi Hasil Otomatis**: Mengawasi penjualan produk vendor secara real-time melalui `pos_get_vendor_settlements`.
  - **Pemberitahuan Transparan ke Vendor**: Saat shift tutup, Hermes merangkum penjualan vendor dan menyusun draft voucher penagihan yang siap dikirim via WhatsApp ke masing-masing vendor.
  - **Kepatuhan Aturan "Satu Pintu"**: Memastikan bagian vendor yang dibayarkan saat tutup shift langsung tercatat sebagai dokumen `vendor_settlements` (`source="shift_close"`) dan mutasi kas keluar tanpa terjadinya double-deduction.
  - **Pencegahan Diskon Merugikan Vendor**: Memastikan secara ketat bahwa diskon promosi outlet TIDAK mengurangi hak bersih vendor.

---

### Persona 4: `Hermes Concierge` — Reservasi Meja & Layanan Pelanggan WhatsApp
* **Fokus Utama**: Menjadi customer-service interaktif melalui nomor WhatsApp Gateway restoran.
* **Tanggung Jawab**:
  - **Reservasi Meja Cerdas**: Menangkap pesan calon pelanggan via WhatsApp (contoh: *"Bisa pesan meja untuk rombongan keluarga 10 orang jam 7 malam ini?"*).
  - **Pengecekan Ketersediaan Meja Realtime**: Memeriksa layout dan status meja melalui `pos_get_tables_status`, menahan meja (*reserved*), dan mengonfirmasi waktu kedatangan.
  - **Pemberian Rekomendasi Menu Otentik**: Menjelaskan detail menu masakan Aceh, tingkat kepedasan, dan porsi keluarga kepada pelanggan baru.
  - **Pengecekan Poin & Kupon Member**: Menjawab pertanyaan member terkait sisa poin loyalitas dan menukarkan kupon diskon.

---

### Persona 5: `Hermes SRE` — Sentinel Pemeliharaan & Self-Healing Kluster
* **Fokus Utama**: Menjaga kestabilan kluster server hybrid POS (Raspberry Pi di kasir, PC Windows master di kasir utama, dan VPS Cloud).
* **Tanggung Jawab**:
  - **Monitoring Status Kluster**: Memantau node melalui `pos_manage_server_cluster` (`get_cluster_health`).
  - **Otomasi Pencadangan (Auto-Backup Guard)**: Memastikan proses backup harian ke Google Drive / VPS berjalan mulus tanpa merusak database transaksi aktif.
  - **Deteksi Latensi Tailscale Mesh**: Memberi peringatan jika koneksi peer-to-peer antar Raspberry Pi dan Master PC terputus, mengaktifkan peringatan mode offline sinkronisasi.

---

## 3. Peta Kemampuan MCP (Model Context Protocol Tools)

Agen Hermes terhubung langsung ke sistem POS menggunakan tool standar MCP yang telah aktif di aplikasi:

| Nama Tool MCP | Deskripsi Fungsi | Tingkat Keamanan |
| :--- | :--- | :---: |
| `pos_get_sales_summary` | Ambil omzet, total transaksi, pembagian F&B vs Retail, dan item terlaris | Read-Only |
| `pos_get_products` | Cari katalog menu, harga jual, HPP, stok barang, dan kategori | Read-Only |
| `pos_get_low_stock` | Cek stok produk & bahan baku dapur yang di bawah ambang batas aman | Read-Only |
| `pos_get_shift_status` | Cek status shift kasir aktif, modal kas awal, kas masuk/keluar, kasir bertugas | Read-Only |
| `pos_get_tables_status` | Cek denah meja, pesanan aktif tiap meja, meja terisi vs kosong | Read-Only |
| `pos_get_recent_orders` | Riwayat pesanan penjualan terbaru dengan rincian item & metode bayar | Read-Only |
| `pos_get_recipes` | Analisis resep masakan Aceh, gramatur bahan, dan marjin keuntungan | Read-Only |
| `pos_get_vendor_settlements` | Periksa rekap bagi hasil titipan konsinyasi vendor dan status lunas | Read-Only |
| `pos_get_void_refund_audit` | Audit riwayat pembatalan pesanan dan refund untuk cegah kebocoran | Read-Only (Audit) |
| `pos_update_product_stock` | Sesuaikan stok fisik (stock opname) dengan catatan alasan wajib | Safe-Write (Audited) |
| `pos_manage_whatsapp_config` | Kelola koneksi WA gateway, template pesan shift, struk, dan broadcast | Safe-Write (Audited) |
| `pos_manage_server_cluster` | Cek status Pi/PC/VPS, trigger backup instan, sync node Tailscale | Admin-Action |
| `pos_manage_promos_and_coupons`| Buat/nonaktifkan promo kasir, kupon member, dan banner landing page | Safe-Write (Audited) |
| `pos_audit_agent_actions` | Menampilkan riwayat mutasi yang telah dilakukan Hermes Agent | Read-Only (Log) |

---

## 4. Daftar 10 Ide Inovasi Implementasi Hermes Agent

Berikut adalah 10 ide implementasi terobosan yang dapat segera diaktifkan pada Grand Aceh Kuliner POS:

### 💡 Ide 1: "Morning Briefing & Night Recap" WhatsApp Otomatis ke Owner
* **Skenario**: Setiap pukul 08:30 pagi dan 23:30 malam, Hermes Agent otomatis mengumpulkan data penjualan dan inventaris, lalu menyusun ringkasan eksekutif ke grup WA Manajemen.
* **Contoh Format Output Hermes**:
  > *"🌅 **Laporan Pagi Grand Aceh Kuliner**  
  > • Shift pagi dibuka oleh: Kasir Rahmad (Kas Laci: Rp 500.000)  
  > • Peringatan Dapur: Bumbu Kari Aceh sisa 2,1 kg (kebutuhan estimasi 4,5 kg). Segera restock sebelum jam makan siang!  
  > • Reservasi Hari Ini: 3 Meja (Total 14 Pax, Jam 12:30 & 19:00)."*

---

### 💡 Ide 2: "Detektif Kasir" — Deteksi Kebocoran Kas Realtime (*Anomaly Sentinel*)
* **Skenario**: Jika kasir melakukan pembatalan nota (void) setelah struk dicetak atau terdapat selisih kas fisik laci minus > Rp 50.000 saat serah terima shift.
* **Aksi Hermes**:
  1. Hermes membaca data void via `pos_get_void_refund_audit`.
  2. Hermes menganalisis pola: Apakah transaksi dibatalkan setelah pesanan disajikan? Apakah kasir yang sama memiliki rasio void 3x lipat dibanding kasir lain?
  3. Mengirimkan sinyal "Peringatan Waspada Kebocoran" ke dashboard audit Supervisor dengan alasan objektif berbasis data.

---

### 💡 Ide 3: Bot Reservasi WhatsApp Interaktif Berbasis Natural Language
* **Skenario**: Pelanggan mengirim pesan di WhatsApp: *"Min, saya mau pesan meja untuk acara arisan 12 orang besok jam 1 siang, minta tempat yang dekat colokan listrik ya."*
* **Aksi Hermes**:
  1. Memanggil `pos_get_tables_status`.
  2. Menemukan kombinasi Meja M-05 & M-06 (kapasitas 12 kursi, area indoor AC).
  3. Menyimpan reservasi sementara di sistem POS.
  4. Membalas pelanggan dengan konfirmasi nomor booking ramah disertai penawaran paket menu makanan Aceh.

---

### 💡 Ide 4: Manajemen Titipan Kue & Konsinyasi Vendor Tanpa Kertas (*Zero-Paper Settlement*)
* **Skenario**: Pembuat kue tradisional Aceh menitipkan 50 potong Timphan Srikaya di etalase kasir retail pagi hari.
* **Aksi Hermes**:
  1. Mengawasi transaksi retail secara real-time.
  2. Saat shift malam tutup pukul 22:00, kasir mencatat sisa 8 potong fisik (42 potong terjual).
  3. Hermes menghitung: $42 \times \text{Harga Titipan}$, mencatat dokumen pelunasan `vendor_settlements` satu pintu, memotong kas shift, dan mengirim rekapan PDF/teks ke nomor WA Ibu Vendor secara otomatis.

---

### 💡 Ide 5: Peramalan Bahan Masakan Dapur Aceh Berbasis Cuaca & Kalender Hijriah
* **Skenario**: Musim hujan atau hari libur keagamaan (Jumat Agung, Maulid, Ramadhan) memiliki pola makan khas Aceh yang sangat spesifik (misal: Kuah Beulangong atau Sie Reuboh melonjak).
* **Aksi Hermes**:
  1. Hermes mengombinasikan data historis penjualan minggu lalu dengan kalender dan hari kerja/libur.
  2. Memberikan rekomendasi takaran potong daging sapi dan belanja daun temurui (daun kari) sebelum pasar subuh tutup.
  3. Meminimalkan pemborosan (*food waste*) bahan baku bersantan yang mudah basi.

---

### 💡 Ide 6: Pembaruan Banner Promo Landing Page Instan via Perintah Obrolan
* **Skenario**: Owner sedang berada di luar kota dan melihat stok Kopi Ulee Kareng Retail menumpuk di gudang. Owner ingin segera membuat promo flash sale.
* **Aksi Hermes**:
  1. Owner mengirim pesan WA ke Hermes: *"Hermes, buat promo Kopi Ulee Kareng diskon 20% sampai hari Minggu, tampilkan di banner utama website."*
  2. Hermes memverifikasi identitas nomor owner (RBAC Super Admin).
  3. Hermes memanggil `pos_manage_promos_and_coupons` dengan aksi `create_promo` dan `update_landing_banner`.
  4. Banner Landing Page publik langsung terupdate secara real-time tanpa perlu deployment atau edit kode website!

---

### 💡 Ide 7: Order Punching & Pembantu Kasir Cepat Berbasis Suara (Voice-to-Order)
* **Skenario**: Saat antrean panjang di jam makan siang, kasir berbicara langsung ke tablet: *"Dua Mie Aceh Daging pedas sedang, satu Nasi Goreng Kambing, dua Es Teh Tarik meja 4."*
* **Aksi Hermes**:
  1. Hermes melakukan Named Entity Recognition (NER) mencocokkan nama menu dengan katalog `pos_get_products`.
  2. Memasukkan item ke keranjang belanja POS secara instan dengan modifier rasa dan nomor meja yang tepat.
  3. Memotong waktu input kasir dari 45 detik menjadi hanya 5 detik.

---

### 💡 Ide 8: Self-Healing Cluster Guard (Deteksi Failover Master-Backup)
* **Skenario**: Kasir utama di PC Windows mengalami gangguan listrik mendadak.
* **Aksi Hermes SRE**:
  1. Hermes mendeteksi detak jantung (*heartbeat*) PC Windows terhenti via jaringan Tailscale.
  2. Memeriksa ketersediaan Raspberry Pi cadangan.
  3. Mengarahkan traffic frontend tablet kasir untuk beralih ke node Pi yang aktif.
  4. Mengirimkan notifikasi ke teknisi bahwa sistem beroperasi dalam mode failover cadangan.

---

### 💡 Ide 9: Pengingat Piutang & Tagihan Pelanggan Korporat / Catering
* **Skenario**: Rumah makan sering menerima pesanan katering kantor dengan pembayaran termin (tempo).
* **Aksi Hermes**:
  1. Mengidentifikasi transaksi status `pending` atau invoice belum lunas yang mendekati batas jatuh tempo.
  2. Mengirimkan pesan pengingat sopan melalui WhatsApp ke bendahara kantor pemesan disertai rincian pesanan dan nomor rekening resmi outlet.

---

### 💡 Ide 10: Asisten Konsultasi Resep & Pelatihan Staf Baru (Knowledge Base)
* **Skenario**: Koki baru ragu takaran rempah untuk porsi besar Kuah Pliek U atau Ayam Tangkap.
* **Aksi Hermes**:
  1. Staf membuka menu Asisten AI di POS dan bertanya: *"Berapa takaran daun pandan dan daun koja untuk 5 ekor ayam tangkap?"*
  2. Hermes membaca SOP resep baku dapur (`pos_get_recipes`) dan memberikan panduan memasak standar restoran, memastikan konsistensi cita rasa khas Aceh tetap terjaga 100%.

---

## 5. Konfigurasi File Agent Hermes (`hermes.json` / Profile Blueprint)

Untuk mengaktifkan profil agen ini di server VPS atau PC lokal Hermes, gunakan cetak biru konfigurasi berikut:

```json
{
  "name": "grand-aceh-pos-copilot",
  "version": "1.0.0",
  "description": "Autonomous Restaurant & Retail AI Co-Pilot for Grand Aceh Kuliner POS",
  "model": "nous-hermes-3-llama-3.1-8b",
  "temperature": 0.2,
  "system_prompt": "Anda adalah Hermes Co-Pilot, asisten eksekutif cerdas untuk Grand Aceh Kuliner POS (Restoran Khas Aceh, Retail Kelontong, dan Konsinyasi Vendor). Tugas Anda adalah membantu kasir, manajer dapur, dan pemilik restoran dalam mengelola penjualan, stok bahan, meja, vendor, dan memantau anomali kas. Selalu berikan jawaban yang presisi, santun, profesional, dan gunakan mata uang Rupiah (Rp). Patuhi aturan bisnis: Transaksi F&B dan Retail tidak boleh dicampur dalam satu transaksi; Satuan berat berskala proporsional; Diskon outlet tidak boleh memotong hak bagi hasil vendor; Nilai uang selalu dibulatkan rapi.",
  "mcp_servers": [
    {
      "name": "gak-pos-core",
      "transport": "sse",
      "url": "http://100.115.92.44:3000/api/mcp/sse",
      "headers": {
        "Authorization": "Bearer hermes_gak_pos_secret_key_2026"
      }
    }
  ],
  "capabilities": {
    "tools": true,
    "resources": true,
    "prompts": true
  },
  "cron_schedules": [
    {
      "cron": "30 22 * * *",
      "action": "run_prompt",
      "prompt_name": "daily_shift_closing_audit",
      "target_channel": "whatsapp_owner"
    },
    {
      "cron": "0 8 * * *",
      "action": "run_prompt",
      "prompt_name": "morning_low_stock_check",
      "target_channel": "whatsapp_kitchen"
    }
  ]
}
```

---

## 6. Protokol Keamanan & Batasan Tindakan Otonom (Safety Guardrails)

Untuk menjamin keamanan finansial dan operasional restoran, Hermes Agent dibatasi oleh protokol ketat:

1. **Prinsip Human-in-the-Loop untuk Tindakan Finansial Kritis**:
   - Hermes **TIDAK PERNAH** dapat memproses pencairan dana tunai keluar dari laci atau melakukan void transaksi secara sepihak. Hermes hanya menganalisis, menyarankan, dan mengaudit.
2. **Audit Trail Lengkap (Zero Invisible Changes)**:
   - Setiap mutasi yang dilakukan oleh Hermes (misalnya penyesuaian stok opname atau aktivasi diskon) wajib mencantumkan alasan (`reason`) dan tercatat permanen di `db.agentAuditLogs` yang dapat diaudit oleh Super Admin.
3. **Isolasi Domain F&B vs Retail**:
   - Hermes secara otomatis menolak penggabungan produk F&B (dapur) dan produk retail kelontong ke dalam satu order yang sama sesuai Aturan Emas POS.
4. **Proteksi Formula Bagi Hasil Vendor Titipan**:
   - Hermes memvalidasi bahwa setiap pembagian hasil vendor dihitung dari `base_cost` atau rasio kesepakatan murni sebelum diskon outlet diaplikasikan.

---

## 7. Rencana Tindak Lanjut & Penerapan (Implementation Steps)

1. **Langkah 1**: Pastikan service MCP POS berjalan aktif di port 3000 (`/api/mcp` dan `/api/mcp/sse`).
2. **Langkah 2**: Daftarkan MCP Endpoint ke instance Hermes Agent di VPS melalui Tailscale IP (`http://100.x.y.z:3000/api/mcp/sse`).
3. **Langkah 3**: Lakukan uji coba pemanggilan tool dari terminal Hermes (`pos_get_sales_summary`, `pos_get_low_stock`).
4. **Langkah 4**: Uji coba integrasi 2 arah di WhatsApp Gateway (perintah `/stok`, `/omzet`, `/shift`, dan dialog reservasi meja).
5. **Langkah 5**: Pantau riwayat audit agen di menu POS **Pengaturan** → **Integrasi MCP & Agen AI** (`/settings-mcp`).

---
*Dokumen ini merupakan spesifikasi resmi ide dan arsitektur integrasi Hermes Agent untuk ekosistem Grand Aceh Kuliner POS.*
