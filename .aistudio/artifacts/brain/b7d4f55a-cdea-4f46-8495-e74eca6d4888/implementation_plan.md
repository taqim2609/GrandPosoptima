# Planora: Landing Page Publik & Portal Reservasi Meja Grand Aceh Kuliner

Implementasi landing page publik interaktif berorientasi kuliner khas Aceh pada rute utama (`/`) sebelum login kasir, diintegrasikan secara resmi di bawah kerangka kerja **Planora** (`TASK-008`, `LND-FR-001` s.d. `LND-FR-004`). Fitur ini menampilkan etalase menu terbitan langsung dari database, rubrik artikel & filosofi kuliner Aceh yang dapat dikelola dari dashboard admin, sistem reservasi meja online yang terhubung ke antrean POS & notifikasi WhatsApp, serta akses cepat bagi staf untuk masuk ke POS.

---

### User Review & Critical Decisions

> [!IMPORTANT]
> Fitur ini telah didokumentasikan dan disinkronkan ke dalam paket spesifikasi resmi **Planora**:
> - **Planora Task**: Terdaftar sebagai `TASK-008` pada `.planora/EXECUTION/TODO.md` dan `.planora/EXECUTION/phases/phase-02-backlog.md` (Workflow: `feature`).
> - **PRD Requirement**: `.planora/PRD/fitur/landing-page-dan-reservasi.md` (`LND-FR-001`, `LND-FR-002`, `LND-FR-003`, `LND-FR-004`).
> - **UI Contract**: `.planora/UI/screens/landing-page.md` dan terdaftar di `.planora/UI/screens/screen-inventory.md`.
> - **Penempatan Rute**: Rute utama (`/`) menampilkan `LandingPage.jsx`, staf kasir tetap dapat masuk cepat ke POS melalui tombol "Masuk POS" di navigasi maupun langsung membuka `/pos` dan `/login`.
> - **Validasi Product Kit**: Seluruh berkas Planora telah lolos uji `validate_product_kit.py` dengan status 100% valid.

- **Confirmed Decision 1**: Rute publik `/` menjadi landing page utama dengan tombol CTA navigasi menuju `/login` dan `/pos`.
- **Confirmed Decision 2**: Reservasi online publik langsung masuk ke koleksi `reservations` sistem POS dan mengirim konfirmasi via WhatsApp.
- **Confirmed Decision 3**: Artikel & cerita kuliner Aceh tersimpan dinamis di database dengan panel kelola admin terintegrasi.
- **Confirmed Decision 4**: Seluruh pelacakan eksekusi diatur melalui Planora (`TASK-008`) dengan traceability penuh.

---

### 1. Overview & Core Concept

- **What It Does**: Memberikan wajah digital publik yang memikat bagi Grand Aceh Kuliner sebelum masuk ke aplikasi internal kasir. Pengunjung dapat menjelajahi hidangan otentik Aceh (Mie Aceh, Kuah Beulangong, Ayam Tangkap, Roti Canai, Kopi Sanger/Khop), membaca artikel sejarah dan filosofi rempah Aceh, serta memesan meja untuk makan di tempat secara instan.
- **Target Audience / Persona**: Pelanggan umum, keluarga, wisatawan kuliner, serta staf internal (kasir/admin) yang ingin masuk ke sistem operasional kasir harian.
- **Key Value**: Mengubah POS yang semula tertutup hanya untuk staf menjadi etalase pemasaran F&B modern yang meningkatkan reservasi meja pelanggan dan memperkuat branding budaya kuliner Aceh tanpa mengorbankan alur kerja kasir.

---

### 2. User Experience & Visual Design

- **Key User Flows**:
  1. *Eksplorasi Publik*: Pengunjung membuka `http://host:3000/` $\rightarrow$ Disambut Hero Section megah beraksen rempah Aceh $\rightarrow$ Menelusuri Menu Pilihan dengan filter kategori $\rightarrow$ Membaca artikel & filosofi kuliner.
  2. *Reservasi Meja*: Pengunjung mengklik tombol "Reservasi Meja" $\rightarrow$ Mengisi formulir (nama, no. WhatsApp, tanggal, jam, jumlah pax, preferensi tempat duduk/catatan) $\rightarrow$ Memilih meja yang tersedia $\rightarrow$ Submit $\rightarrow$ Mendapatkan kode booking instan dan tombol notifikasi WhatsApp.
  3. *Akses Kasir/Staf*: Staf mengklik tombol "Masuk POS" di sudut kanan atas $\rightarrow$ Diarahkan langsung ke rute `/login` atau langsung `/pos` bila sesi masih aktif.
  4. *Kelola Artikel Admin*: Admin masuk ke Dashboard $\rightarrow$ Membuka menu/tab "Artikel & Cerita" $\rightarrow$ Menulis/mengedit artikel, mengunggah sampul, mengatur status publish/draft.

- **Visual Identity & Theme**:
  - *Aesthetic Direction*: Warm Culinary Heritage & Modern Aceh Gastronomy — palet hangat rempah (kunyit, cengkeh, kayu manis), aksen emas tembaga, latar netral krem hangat dan abu arang elegan.
  - *Color Palette*:
    - Canvas Background: Neutral ivory `#FAF8F5` (light) & charcoal slate `#18181B` (dark accents).
    - Primary Brand Accent: Amber Gold / Rich Terracotta `#D97706` & Crimson Spice `#DC2626`.
    - Structural Surfaces: Pure White `#FFFFFF` dengan hairline border halus `#E4E4E7`.
  - *Typography & Hierarchy*:
    - Display Headings: `Plus Jakarta Sans` / `Outfit` berskala tegas `clamp(2.25rem, 4vw, 3.5rem)`.
    - Body Text: `DM Sans` / `Inter` berjarak baris nyaman `1.6`.
    - Meta & Harga: Tabular numerals `tabular-nums` untuk nominal Rupiah.
  - *Anti-Slop Discipline*: Bebas pill badges bertumpuk, bebas mechanical prefix `//`, menggunakan icon Lucide fungsional, dan visual makanan beresolusi tinggi.

- **Interactive Feedback & Motion**:
  - Filter kategori menu responsif tanpa reload halaman.
  - Modal detail artikel dengan navigasi baca cepat.
  - Validasi formulir reservasi seketika dengan status ketersediaan meja.
  - Toast notifikasi sukses dan tautan langsung ke WhatsApp kasir.

---

### 3. Key Product Decisions & Trade-Offs

- **Decision 1: Penataan Rute `/` vs `/pos` (Planora `LND-FR-001`)**:
  - *Chosen Approach*: Rute `/` menyajikan `LandingPage.jsx`, sedangkan rute `/pos` tetap menjadi rute utama kasir operasional. Sesi login tersimpan di localStorage/cookie sehingga staf yang sudah login dapat berpindah ke POS dengan 1 klik.
  - *Why*: Memenuhi kebutuhan pemasaran publik tanpa mengganggu jalur kerja kasir di Sunmi T2 atau PC kasir yang langsung membuka `/pos`.
  - *Alternatives Considered*: Menggabungkan landing page di dalam form login; ditolak karena mempersempit ruang visual showcase kuliner.

- **Decision 2: Endpoint Publik Khusus Tanpa Auth (Planora `LND-FR-002`, `LND-FR-004`)**:
  - *Chosen Approach*: Menyediakan endpoint `/api/public/menu`, `/api/public/articles`, dan `POST /api/public/reservations` tanpa mewajibkan token JWT.
  - *Why*: Pengunjung publik tidak memiliki akun sistem POS; endpoint membaca hanya data produk aktif dan artikel yang berstatus `published`.

- **Decision 3: Notifikasi Reservasi Dua Arah**:
  - *Chosen Approach*: Reservasi tercatat di database POS kasir (`db.reservations`) dan memunculkan notifikasi WhatsApp outbox untuk outlet, serta menyediakan direct click link `https://wa.me/...` untuk pelanggan.
  - *Why*: Menjamin pemilik/kasir langsung mengetahui ada pesanan meja baru meski sedang sibuk melayani pelanggan dine-in.

---

### 4. Technical Architecture & Data Strategy

```
┌────────────────────────────────────────────────────────────────────────┐
│                        Grand Aceh Kuliner POS                          │
├───────────────────────────────────┬────────────────────────────────────┤
│           Public Visitors         │           Internal Staff           │
│                 │                 │                 │                  │
│                 ▼                 │                 ▼                  │
│         Landing Page (/)          │         Login Page (/login)        │
│  ┌─────────────────────────────┐  │  ┌──────────────────────────────┐  │
│  │ Hero & Cultural Heritage    │  │  │ Kasir / Admin Authentication │  │
│  │ Published Menu Grid         │  │  └──────────────┬───────────────┘  │
│  │ Curated Aceh Food Articles  │  │                 ▼                  │
│  │ Online Table Booking Modal  │  │         POS Dashboard (/pos)       │
│  │ Quick CTA to POS Login      │  │   - Kasir Order & Dine-in Billing  │
│  └──────────────┬──────────────┘  │   - Meja & Antrean Reservasi       │
│                 │                 │   - Kelola Artikel Admin           │
└─────────────────┼─────────────────┴─────────────────┼──────────────────┘
                  │                                   │
                  ▼                                   ▼
        ┌───────────────────────────────────────────────────────┐
        │                 FastAPI Backend (/api)                │
        ├───────────────────────────┬───────────────────────────┤
        │ Public Endpoints (No Auth)│ Protected Endpoints (JWT) │
        │ - GET  /public/menu       │ - CRUD /articles (Admin)  │
        │ - GET  /public/articles   │ - CRUD /reservations      │
        │ - POST /public/booking    │ - CRUD /products & tables │
        └─────────────┬─────────────┴─────────────┬─────────────┘
                      │                           │
                      ▼                           ▼
        ┌───────────────────────────────────────────────────────┐
        │                  MongoDB Database                     │
        │ - db.products (is_active, category, price, image)     │
        │ - db.articles (title, slug, excerpt, content, cover)  │
        │ - db.reservations (customer, phone, table_id, status) │
        │ - db.tables (capacity, zone, active)                  │
        └───────────────────────────────────────────────────────┘
```

#### Data Model & Entities

1. **`db.articles`**:
   - `id`: String (UUID)
   - `title`: String ("Rahasia 16 Rempah Rahasia Kuah Beulangong Aceh")
   - `slug`: String
   - `category`: String ("Filosofi Rasa" / "Tradisi & Budaya" / "Resep & Bahan")
   - `excerpt`: String (ringkasan artikel)
   - `content`: String (markdown/HTML konten lengkap)
   - `cover_image`: String (URL atau asset path)
   - `author`: String ("Dapur Utama Grand Aceh")
   - `read_time`: String ("4 menit baca")
   - `status`: String ("published" | "draft")
   - `created_at`: Datetime UTC ISO
   - `updated_at`: Datetime UTC ISO

2. **`db.reservations` (Ekstensi untuk Booking Online Publik)**:
   - `id`: String (UUID)
   - `booking_code`: String (misal `GAK-2610-XXXX`)
   - `customer_name`: String
   - `phone`: String (WhatsApp number)
   - `date`: String (YYYY-MM-DD)
   - `time`: String (HH:MM)
   - `pax`: Integer
   - `table_id`: Optional[String] (meja yang dialokasikan)
   - `table_name`: Optional[String]
   - `seating_area`: String ("Utama", "Indoor Ber-AC", "Lesehan", "Outdoor")
   - `note`: Optional[String]
   - `source`: "online_landing_page"
   - `status`: "pending" (menunggu verifikasi kasir) | "confirmed"
   - `created_at`: Datetime UTC ISO

#### Rencana Pelaksanaan Komponen (`TASK-008`)

1. **Backend Endpoints (`project/backend/server.py`)**:
   - `GET /api/public/menu`: Mengambil daftar produk aktif dikelompokkan berdasarkan kategori F&B.
   - `GET /api/public/articles`: Mengambil daftar artikel status `published` dengan data benih (seeding) otomatis kisah kuliner Aceh legendaris (Kuah Beulangong, Mie Aceh, Kopi Sanger Khop, Ayam Tangkap).
   - `GET /api/public/articles/{slug_or_id}`: Detail artikel lengkap.
   - `GET /api/public/tables`: Daftar meja aktif untuk pilihan reservasi.
   - `POST /api/public/booking`: Menerima reservasi online publik, menyimpan ke database, dan meneruskan ke outbox WhatsApp.
   - `GET /api/articles`, `POST /api/articles`, `PUT /api/articles/{id}`, `DELETE /api/articles/{id}`: Manajemen artikel ber-auth admin.

2. **Frontend UI Components (`project/frontend/src/`)**:
   - `pages/LandingPage.jsx`: Halaman pendaratan publik lengkap dengan Hero, Story, Menu Showcase, Article Grid, Booking Section, dan Floating/Header POS CTA.
   - `pages/ArticlesAdmin.jsx` / integrasi modul Catalog/Dashboard: Antarmuka pengelolaan artikel bagi tim manajemen Grand Aceh Kuliner.
   - Penyesuaian `App.js`: Mendaftarkan rute `/` ke `LandingPage`, `/artikel/:slug` ke pembaca artikel publik, dan mempertahankan rute `/pos` serta `/login` tetap aman.
   - Menghubungkan reservasi baru ke visual antrean di `pages/Reservations.jsx` agar kasir dapat melihat badge reservasi online yang masuk.
