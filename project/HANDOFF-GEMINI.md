# 🧠 HANDOFF — Grand Aceh Kuliner POS (untuk melanjutkan di Google Gemini)

> Cara pakai: tempel **seluruh isi file ini** ke chat Google Gemini (satu pesan pertama),
> lalu tulis permintaan Anda, misal: *"Lanjutkan pengembangan dari dokumen ini. [fitur yang diminta]..."*
> Gemini akan memahami konteks proyek tanpa perlu membaca kode dari awal.
>
> Terakhir diperbarui: 2026-09-08 · commit `b9303ca` · OTA `20260908114143`
> Pusat update: `https://taqim258.Google AI Studio/pos-grand-update` (versi `b9303ca`)

---

## 1. Ringkasan Proyek

**Grand Aceh Kuliner POS** = sistem POS (Point of Sale) untuk restoran/rumah makan Aceh yang
punya **dua toko dalam satu aplikasi**: **F&B** (makan di tempat & bawa pulang) dan **Retail**
(toko kelontong), plus produk **titipan vendor** dengan sistem bagi hasil. Berjalan **hybrid**:
server lokal di dalam toko (Raspberry Pi/PC, Docker) + tetap bisa dipakai **offline** (opsional,
bisa dimatikan) + update lewat internet (pusat update Google AI Studio) + aplikasi Android (APK
dengan update OTA). Bahasa aplikasi & komentar: **Indonesia**.

### Fitur utama saat ini (ringkas)
- POS 3 alur: dine-in (wajib meja), take-away, retail (tidak bisa dicampur F&B↔retail).
- Produk 4 tipe: `makanan`, `minuman`, `retail` (stok+HPP), `vendor` (bagi hasil % dari omzet).
- Jual **per berat** (F&B): harga per satuan berat × berat; HPP & share vendor ikut skala berat.
- Diskon % s/d **100%**; **HPP & bagian vendor TIDAK terpotong diskon** (ditanggung outlet).
- Member & poin (1 poin per RpX belanja; tukar 1 poin = RpY — bisa diubah admin).
- Promo otomatis (percent/happy-hour/min-spend/package/BOGO), Kupon diskon (kuota & masa berlaku).
- Split/pindah/gabung meja, bill sementara, void/refund dengan pembalikan efek (stok, poin, kupon).
- Shift (buka/tutup, kas awal/akhir, uang bersih F&B & Retail, bagi hasil vendor per shift).
- Laporan: harian/mingguan/bulanan, toggle F&B/Retail, tren, kategori, laba kotor (HPP),
  laba per produk, vendor (detail per produk, bisa expand), ekspor Excel/PDF, kirim WA.
- Pengeluaran & Kas (F&B/Retail terpisah) + scan struk via AI Vision + edit per baris.
- AI: **Asisten AI** (satu chat: jawab laporan + panduan aplikasi + usulan aksi yg diterapkan
  admin), ringkasan laporan, rekomendasi stok, import produk via Excel di chat, rotasi key Gemini.
- Reservasi meja, Resep & HPP otomatis, Member, Promo, Kupon, Stok opname, import/export Excel.
- Printer: Sunmi (SDK resmi), Epson ePOS, Bluetooth ESC/POS, browser; auto-print; laci kasir.
- Dashboard **widget** (tambah/hapus/urut per user + default per role; semua role punya dashboard).
- **Mode offline** per perangkat bisa dihidup/matikan (default MATI → POS terkunci saat server down).
- **Pengaturan Aplikasi** (admin, tanpa kode): label F&B/Retail, prefiks nomor order, ambang
  alasan diskon, perolehan/tukar poin, ambang stok, pajak layanan opsional %.

---

## 2. Arsitektur & Stack

```
Browser/APK Android (React 19)  ──HTTP/JSON──►  Nginx  ──►  FastAPI (backend)  ──►  MongoDB
       (Capacitor + Capgo OTA)                        │                            (Docker)
                                                    └── menyajikan / (frontend build)
```

| Lapisan | Teknologi | Lokasi |
|---|---|---|
| Backend | **Python + FastAPI**, MongoDB via **Motor** (async), JWT+bcrypt | `backend/server.py` (file tunggal ±4.100 baris) |
| Frontend | **React 19 + react-scripts (CRA)** via **CRACO**, Tailwind, shadcn/Radix, axios, recharts, react-router 7, lucide-react | `frontend/src/` |
| Android | **Capacitor 6** + **Capgo Updater** (OTA) | `frontend/android/` (APK v2.x) |
| Server lokal | **Docker Compose** (mongo, backend, frontend/nginx) di Raspberry Pi/PC | `docker-compose.yml` |
| Update | arsip `pos-grand.tar.gz` dari pusat update Google AI Studio | skrip `update-pi.sh` |
| WhatsApp | **wacloud.id** (HTTP API) — BUKAN whatsapp-web.js (nonaktif) | backend `_send_whatsapp()` |

### Pola backend penting
- Semua route prefix `/api`, didefinisikan `@api.get("/path")` pada router `api` (FastAPI APIRouter),
  di-`include_router` ke `app` di akhir file. Satu file raksasa — cari dengan `grep "@api."`.
- Helper auth: `get_current_user`, `require_admin`, `require_roles(*roles)`,
  `admin_or_input`, `admin_or_kasir`.
- Helper waktu WIB: `wib_today()`, `wib_day_range()`, `wib_day_of()`; simpan waktu `now_utc().isoformat()`.
- MongoDB collections: users, categories, products, vendors, tables, payment_methods, orders,
  shifts, cash_movements, members, promos, coupons, reservations, recipes, purchases,
  stock_opname, audit_logs, import_logs, counters, settings (`_id`: "ai"|"report"|"whatsapp"
  |"outlet"|"cash"|"business"|"dashboard").
- ID baru: `new_id()`; nomor order: `gen_order_number()` (prefix dari Pengaturan Aplikasi, default `GAK-`).
- **Seeding startup** (di `startup()`): buat index; buat/update admin dari env `ADMIN_EMAIL` +
  `ADMIN_PASSWORD` (kini **hanya** saat user belum ada, atau bila `ADMIN_FORCE_PASSWORD=1`);
  seed akun demo `kasir@grandaceh.com/kasir123`; seed metode bayar Cash/QRIS/Kartu bila kosong.

---

## 3. Struktur Repo (penting)

- `backend/server.py` — SEMUA logika backend & endpoint.
- `backend/.env.docker.example` — contoh env (salin ke `backend/.env.docker`; TIDAK di-track/terarsip).
- `frontend/src/App.js` — route; `components/Layout.jsx` — sidebar + role; `pages/*.jsx` — halaman.
- `frontend/src/lib/` — api.js (axios+base URL dinamis), format.js (rupiah/WIB), device.js
  (config perangkat, mode offline), receipt.js (struk), bluetooth.js, ota.js, diag.js,
  versions.js, business.js (pengaturan aplikasi + cache), utils.js.
- `frontend/src/context/OfflineContext.jsx` — antrean sinkron offline (JANGAN di-refactor).
- `frontend/build/` — hasil build **DI-TRACK** di git (untuk OTA & APK). Postbuild `scripts/make-ota.js`
  membuat `build/ota/bundle.zip`+`version.json` OTOMATIS setelah `yarn build`.
- `scripts/make-ota.js`, `scripts/userinfo-shim.js` (build APK), `scripts/seed_data.py`.
- `FEATURES.md`, `memory/PRD.md`, `docs/INTEGRASI-NETZME.md`, `PANDUAN-GITHUB.md`.
- **Update center (folder TERPISAH, di luar repo)**: `/home/aistudioco/workspace/taqim258/pos-grand-update/`
  berisi `pos-grand.tar.gz` + `version.json` + receiver PHP (`rpt.php`, `bkp.php`, `feat.php`) +
  `index.php` (landing). Jangan pindahkan/hapus — kuota app terbatas & receiver harus tetap ada.

---

## 4. Cara Menjalankan & Build

### Backend (lokal cepat, tanpa Docker — untuk tes endpoint)
```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate   # sekali
pip install -r requirements.txt                      # bila ada; server.py import motor/fastapi/dll
export MONGO_URL=mongodb://localhost:27017 DB_NAME=grandpos \
       JWT_SECRET=tes ADMIN_EMAIL=admin@x.com ADMIN_PASSWORD=x ADMIN_FORCE_PASSWORD=1
uvicorn server:app --reload --port 8000
```
Butuh MongoDB jalan (Docker: `docker run -p 27017:27017 mongo:7`). Endpoint health: `GET /api/health`.

### Frontend
```bash
cd frontend
corepack yarn install          # node_modules tersedia? lewati
CI=false GENERATE_SOURCEMAP=false REACT_APP_BACKEND_URL="" corepack yarn build
# postbuild make-ota.js otomatis menulis build/ota/{bundle.zip,version.json}
# Dev: REACT_APP_BACKEND_URL=http://localhost:8000 corepack yarn start
```

### APK Android (jarang; hanya bila ubah native)
Resep lengkap ada di AGENTS.md (JDK 17 di ~/jdk17, SDK ~/android-sdk, Gradle 8.2.1).
Ringkas: `export HOME=/home/aistudioco/workspace/taqim258` → cap sync (pakai userinfo-shim)
→ `gradle assembleDebug` di `frontend/android` → salin APK ke folder update center `apk/`.

### Update Pi (cara resmi terbitkan versi baru)
```bash
cd POS-grand && git add -A && git commit -m "..."
git ls-files -z | tar --null -czf ../pos-grand-update/pos-grand.tar.gz -T -
# tulis ../pos-grand-update/version.json: {"version":"<short-hash>","url":"pos-grand.tar.gz","updated":"<UTC>"}
# publish ulang folder pos-grand-update (static/php) lewat tim pengembang
```
Di Pi: `bash update-pi.sh` (unduh, ekstrak tanpa menimpa `.env`/`backups/`, rebuild Docker).
**WAJIB backend ikut ter-update** (arsip berisi server.py) — jangan hanya OTA frontend.
APK menerima OTA frontend otomatis (fetch `/api/ota/version`).

---

## 5. Konvensi & Aturan Emas (jangan dilanggar)

1. **JANGAN refactor `OfflineContext.jsx`** — merusak sinkronisasi offline.
2. **JANGAN aktifkan service worker** `frontend/public/sw.js` — konflik cache dengan Capgo OTA.
3. **JANGAN hapus polyfill** `<script src="%PUBLIC_URL%/polyfills.js">` dari `public/index.html`
   (WebView Android 7 butuh ES5 polyfill). Sumber kebenaran `public/`, bukan `build/`.
4. Build frontend TIDAK memakai webpack default: **CRACO** menonaktifkan code-splitting &
   `import()` dinamis (WebView lama). Jangan menambah `import()` dinamis / chunk async.
   `import(literal)` di-parse webpack; `import(variabel)` akan merusak Android 7.
5. Endpoint backend selalu prefix `/api`. Pydantic model untuk body. RBAC via Depends.
6. Uang dalam **float/rupiah bulat**; `round(..., 2)` di penyimpanan & laporan.
7. Role: **admin** (semua), **kasir** (POS/shift/kas/laporan/AI/reservasi), **input** (produk/stok/AI saja,
   dilarang di level API: orders/shift/cash/members write & laporan).
8. Offline sync order idempoten via `client_ref` unik (server cek duplikat).
9. Kupon & poin dipotong **hanya saat transaksi lunas** (`_finalize_payment`), dibalik saat void.
10. Angka "laba F&B" = fnb_total − HPP F&B − bagian vendor (expected). Uang bersih shift
    dihitung ulang saat tutup setelah nominal vendor dimasukkan.
11. Label F&B/Retail kini **dinamis** dari Pengaturan Aplikasi (`settings._id:"business"`,
    helper frontend `lib/business.js` → `labelsOf(biz)`); UI baru pakai `lb.fnb/lb.retail`.
12. Perubahan apa pun pada frontend source → jalankan `yarn build` (regenerasi `build/`+OTA) &
    commit `build/` — CI/manual sama-sama butuh.
13. Default baru yang mengubah perilaku produksi sebaiknya via **Pengaturan Aplikasi**, bukan hardcode.
14. Test data / kredensial asli TIDAK boleh masuk repo (sudah dibersihkan; jangan kembalikan).

---

## 6. Aturan Bisnis Kunci (angka & logika)

- **Diskon**: % diskon ≤ 100 di-clamp; `total = max(0, subtotal−diskon)`. Alasan wajib bila di atas
  ambang Pengaturan Aplikasi (default % >15 ATAU Rp >50.000). Diskon TIDAK memotong HPP & vendor_total.
- **Promo**: berjalan di create & pay & patch-items (dari `_apply_promos`); promo_discount dipotong
  dari subtotal sebelum kupon/poin.
- **Kupon**: `_apply_coupon` validasi kuota `max_uses`+`used_count` & `expires_at`; `used_count`
  di-increment di `_finalize_payment` (flag `coupon_counted`), di-decrement saat void/refund.
- **Poin member**: 1 poin per `member_earn_per_rupiah` (default Rp10.000) dari `order.total`;
  redeem `member_redeem_per_point` (default 1pt=Rp100), dipotong dari total; pemotongan & award
  hanya saat lunas; void/refund membalik keduanya.
- **Pajak layanan**: `service_tax_percent` (default 0). Urutan hitung:
  `subtotal → diskon → promo → kupon → redeem poin → TOTAL BERSIH → + service tax → final`.
  Disimpan di order `service_tax_rate` & `service_tax`; struk menampilkan baris "Pajak Layanan".
- **Berat**: line name `"Nama (3.25 ons)"`, `price = base_price × berat`, `cost = cost_asli × berat`,
  `vendor_total = line_price × share%` (harga jual penuh).
- **Vendor**: produk type=vendor punya `vendor_id`, `vendor_share_percent`. Omzet vendor dihitung
  dari harga jual (tanpa potongan diskon). `_vendor_share_from_orders` & `_vendor_report` memberi
  per-vendor + per-produk (`items[]`). `scope` vendor: "fnb"|"retail" dari kategori produknya.
- **Shift**: 1 shift terbuka per kasir. `expected_cash = opening_cash + tunai − pengeluaran`.
  `net_cash_fnb = fnb_total − out_fnb`; `net_cash_retail = retail_total − out_retail` (dihitung di
  `close_shift` SETELAH pembayaran vendor dibuat). Laporan tertutup tersimpan di `shift.report`.
  **Bagi hasil vendor = SATU PINTU**: nominal "Diberikan" di tutup shift otomatis dibuatkan
  dokumen `vendor_settlements` (`source="shift_close"`) + `cash_movements` (kategori "Bagi Hasil
  Vendor") oleh `_create_settlement`, jadi pembayaran sudah masuk `out_fnb` dan TIDAK boleh
  dikurangi lagi dari uang bersih; saldo utang vendor (`_vendor_balance`) ikut berkurang sehingga
  tidak bisa dibayar dua kali. `close_shift` memakai klaim atomik `status open→closed`.
- **Pengeluaran**: `cash_movements` type in/out (UI kini hanya "out") scope `fnb`|`retail`.
- **Meja**: `open_order_id` menandai open bill; reservasi terhubung meja+status.
- **Kategori produk** punya `type` sendiri (makanan/minuman/retail/vendor) — kategori menentukan
  scope; produk vendor dgn kategori retail → scope retail.

---

## 7. Endpoint Penting (prefix /api)

- Auth: `POST /auth/login`, `GET /auth/me`, `POST /auth/change-password`, `/users*` (admin).
- Katalog: `/categories*`, `/products*` (+template/export/import/import/commit-fix), `/vendors*`,
  `/tables*`, `/payment-methods*`, `/purchases*`, `/stock-opname*`, `/import-logs`, `/cash*`.
- Order: `POST /orders` (pay_now), `GET /orders`, `GET/PATCH /orders/{oid}`, `POST /orders/{oid}/pay`,
  `POST /orders/{oid}/void`, `POST /orders/{oid}/split`, `PATCH /orders/{oid}/table`,
  `POST /orders/{oid}/merge`, `GET /audit-logs`.
- Shift: `GET /shifts/current`, `POST /shifts/open|close`, `GET /shifts/current/vendor`,
  `GET /shifts` & `/shifts/history`, `POST /shifts/{sid}/send-wa`.
- Laporan: `GET /reports/summary?date=`, `GET /reports/range?start&end` (kini ada fnb/retail per hari),
  `GET /reports/period?start&end` (ada fnb_total/retail_total/gross_profit_*), `GET /reports/profit`,
  `GET /reports/vendors`, export excel/pdf, kirim WA.
- Member/Promo/Kupon/Reservasi/Resep: `/members*`, `/promos*`, `/coupons*`, `/reservations*`, `/recipes*`.
- AI: `/settings/ai*`, `/settings/ai/gemini-keys`, `/ai/assistant/chat|sessions*|apply`,
  `/ai/purchase-recommendation`, `/ai/expense-vision`, `/reports/ai-summary`, `/products/import/commit-fix`.
- Pengaturan: `GET/PUT /settings/outlet` (+logo upload), `GET/PUT /settings/report`,
  **`GET/PUT /settings/business`**, **`GET/PUT /settings/dashboard`**, `GET/PUT /settings/ai`.
- Sistem: `GET /health`, `GET /update/check`, `POST /admin/update`, `GET /admin/update/status`,
  `GET /ota/version` (publik), backup/import, reset-data, `POST /diag/send`.

---

## 8. Status Terkini & Catatan Riwayat (agar tidak mengulang)

- **2026-09-08 `b9303ca`**: F&amp;B→F&B; Pengaturan Aplikasi (business settings + service tax);
  dashboard widget per user/role; semua role dapat dashboard.
- **2026-09-08 `89e27a9`**: audit 10 bug — tutup shift crash vendor, uang bersih akurat, RBAC API
  admin+kasir utk order/shift/cash, HPP & vendor share ikut berat, kupon/poin hanya saat lunas &
  dibalik saat void, laba F&B kurangi vendor, laporan ikut toggle F&B/Retail, kredensial dibersihkan,
  password admin tak di-reset startup (env `ADMIN_FORCE_PASSWORD=1`).
- **2026-09-08 `582945f/b0229f8`**: mode offline toggle default MATI (POS terkunci saat server mati);
  fix total F&B/Retail Rp0 di Laporan; detail per-produk vendor di laporan & shift.
- Riwayat lengkap di `memory/PRD.md`, `AGENTS.md`, `FEATURES.md`.

---

## 9. IDE / Backlog yang Belum Dikerjakan (dari FEATURES.md + catatan)

- P1: Anti brute-force login (penguncian kasir setelah beberapa gagal) — belum ada rate-limit.
- P1: Alarm stok menipis via WhatsApp otomatis (wacloud.id) — backend punya scheduler harian.
- P2: Cetak label barcode/SKU produk retail.
- P2: Kirim WA seluruh laporan periode (saat ini per-vendor & shift & harian ada; periode belum).
- P3: Filter rentang tanggal di chat Asisten AI.
- Label kustom F&B/Retail belum dipakai di teks WA/export/PDF (hanya UI utama) — lanjutkan bila perlu.
- Backlog lama (dari FEATURES.md) masih relevan; `feature-requests.jsonl` di update center berisi
  permintaan pengguna (baca bila perlu).

---

## 10. Cara "Menyerahkan" Hasil Pengembangan Kembali

Alur yang dipakai saat ini (bukan GitHub): hasil pengembangan Gemini → minta **tim pengembang**
(atau lakukan sendiri jika bisa akses workspace):
1. Terapkan perubahan pada kode di repo (`POS-grand/`).
2. Build ulang frontend bila menyentuh frontend (`yarn build` → regenerasi OTA).
3. `git add -A && git commit -m "..."` → `git log --oneline -1` ambil short hash.
4. `git ls-files -z | tar --null -czf ../pos-grand-update/pos-grand.tar.gz -T -`
5. Perbarui `../pos-grand-update/version.json` dengan hash & timestamp.
6. Publish ulang folder `pos-grand-update` (tim pengembang PublishApp).
7. Di Pi: `bash update-pi.sh` → Docker rebuild → APK dapat OTA.

> Jika Gemini menghasilkan **kode yang berdiri sendiri** (mis. file baru), cukup salin isinya ke chat
> tim pengembang beserta penjelasan di mana menaruhnya.

---

# LAMPIRAN — Perlengkapan Kerja Sama dengan AI Eksternal

## A. Alur Bolak-Balik yang Aman (Gemini ⇄ tim pengembang ⇄ Pi)

```
Gemini (PC Anda)  ──kirim file/diff──►  tim pengembang (di sini: review+build+commit)
      ▲                                      │
      │                                      ▼  terbitkan pos-grand-update (tar+version.json)
Anda jalankan update di Pi  ◄─────────────────┘
      │
      ▼  APK dapat OTA otomatis
```

1. **Gemini selesai** → minta ringkasan: daftar file diubah + alasan.
2. **Kirim ke tim pengembang**: file kecil → tempel file UTUH; file besar (backend/server.py) → diff
   (`git diff`) atau potongan lama→baru; banyak file → zip hanya file yang berubah.
3. **tim pengembang** (jangan Anda lakukan): review sintaks → `yarn build` (regen OTA) bila frontend →
   commit → tar → version.json → publish `pos-grand-update` → verifikasi.
4. **Anda di Pi**: `cd ~/grand-aceh-pos && bash update-pi.sh` (tidak menimpa .env/backups).
5. **Rollback** bila bermasalah: minta tim pengembang terbitkan hash lama, update Pi sekali lagi.

Larangan untuk Gemini: sentuh `.env`/`backend/.env.docker`, `backups/`, `.git`, `.aistudio-version`,
`frontend/build/` manual, folder update center (receiver PHP). Beri tahu jenis perubahan:
frontend saja (cukup OTA) / backend ikut (Pi wajib update) / native Android (perlu rebuild APK).

## B. Prompt Awal untuk Sesi Gemini Baru

```
Kamu adalah pengembang senior yang akan mengerjakan proyek "Grand Aceh Kuliner POS".

SEBELUM mengerjakan apa pun:
1. Baca file HANDOFF-GEMINI.md (arsitektur, konvensi, aturan bisnis, endpoint, status) — sumber kebenaran.
2. Baca juga FEATURES.md dan memory/PRD.md bila perlu riwayat, lalu pahami struktur folder.

ATURAN MUTLAK:
- JANGAN sentuh: backend/.env.docker, .env, backups/, .git/, .aistudio-version, frontend/build/
  (build via CRACO+make-ota di sisi tim pengembang), isi folder pos-grand-update/ (receiver PHP).
- JANGAN tulis kredensial/password asli ke kode/dokumen.
- Backend = satu file backend/server.py (FastAPI, prefix /api, Pydantic + RBAC via Depends).
- Frontend hanya ubah frontend/src/. JANGAN tambah import() dinamis / code-splitting.
- JANGAN aktifkan sw.js / hapus polyfills.js dari index.html. JANGAN refactor OfflineContext.jsx.
- Uang float round(2). Role admin/kasir/input. Uang bersih shift dihitung ulang saat close.
- Perubahan perilaku bisnis → lewat Pengaturan Aplikasi (settings _id:"business") bila mungkin.
- Perubahan seminimal mungkin; jangan refactor besar tanpa diminta.

CARA BEKERJA: eksplorasi dulu, baru tulis kode; verifikasi konsistensi (await utk async, JSX valid).

TUGAS SAYA: [TULIS TUGAS DI SINI]

SELESAIKAN dengan LAPORAN AKHIR:
- Daftar file diubah/ditambah (path persis).
- Jenis perubahan: [frontend | backend | native-android].
- Ringkasan tiap perubahan (2-3 kalimat).
- Kode: file UTUH utk file kecil; diff/git diff utk file besar.
- Catatan tambahan (endpoint baru, butuh rebuild APK, dll).
```

Prompt lanjutan (sesi sama): ulangi dua paragraf terakhir + "Lanjutkan proyek Grand Aceh Kuliner
POS (konteks sudah kamu pahami). TUGAS BARU: …".

## C. Isian Skill "Spark" Gemini

**Nama Skill:** `grand-aceh-pos-dev`

**Deskripsi:**
```
Pengembangan dan perbaikan kode aplikasi "Grand Aceh Kuliner POS" — POS restoran F&B + Retail
(FastAPI + MongoDB di backend/server.py, React 19 di frontend/src/, Android Capacitor + OTA).
Aktifkan saat pengguna meminta: menambah/mengubah fitur POS, memperbaiki bug, menganalisis
laporan/keuangan/shift/vendor, mengubah aturan bisnis, atau menulis kode proyek ini. Sebelum
mulai baca HANDOFF-GEMINI.md di folder proyek; ikuti aturan mutlak di dalamnya. Tutup tiap tugas
dengan LAPORAN AKHIR berformat standar agar hasilnya bisa diterapkan kembali oleh tim pengembang.
```

**Instruksi:**
```
Kamu adalah pengembang senior proyek Grand Aceh Kuliner POS.

LANGKAH AWAL (wajib): baca HANDOFF-GEMINI.md; baca sekilas FEATURES.md & memory/PRD.md bila
perlu; eksplorasi file relevan sebelum menulis kode.

ATURAN MUTLAK — JANGAN PERNAH: (1) menyentuh backend/.env.docker, .env, backups/, .git/,
.aistudio-version, pos-grand-update/ (receiver PHP); (2) mengubah frontend/build/ manual
(build di sisi tim pengembang); (3) menambah import() dinamis / code-splitting; (4) mengaktifkan
sw.js / menghapus polyfills.js dari index.html; (5) me-refactor OfflineContext.jsx;
(6) menulis kredensial asli ke kode/dokumen.

KONVENSI: backend = satu file server.py, route prefix /api, pydantic + RBAC (require_admin /
admin_or_kasir / admin_or_input); created_at = now_utc().isoformat(); laporan pakai helper WIB;
uang round(2). Frontend: ikuti gaya file sekitar; pakai label dinamis lb.fnb/lb.retail dari
lib/business.js (jangan hardcode "F&B"/"Retail" di teks UI baru).

LOGIKA BISNIS KUNCI: diskon % ≤100, HPP & bagian vendor tidak terpotong diskon; produk berat:
price/cost × berat; urutan total: subtotal→diskon→promo→kupon→poin→+service tax→final; kupon
used_count & poin hanya saat lunas, void/refund membaliknya; laba F&B = fnb_total − HPP − bagian
vendor; uang bersih shift = dihitung ulang saat close (fnb − out_fnb − paid_vendor); order
offline idempoten via client_ref; prefix order dari Pengaturan Aplikasi.

CARA BEKERJA: perubahan minimal; verifikasi (async await; JSX valid); ringkas dampak jenis
perubahan (frontend/backend/native). Tutup dengan LAPORAN AKHIR: (1) daftar file; (2) jenis;
(3) ringkasan tiap perubahan; (4) kode utuh (file kecil) / diff (file besar); (5) catatan
tambahan (endpoint baru, perlu rebuild APK, perlu cek manual).
```
