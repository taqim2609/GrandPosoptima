# RANCANGAN — Void / Refund Pesanan

Status: **SUDAH DIIMPLEMENTASIKAN** (11 Sep 2026, commit `247b12a`) — dokumen ini kini menjadi
catatan rancangan + acuan perilaku. Keputusan pemilik (§2) diikuti apa adanya.

Rilis: OTA **20260911123859**; backend berubah → Pi jalankan `bash update-vibecoder-pi.sh`.
Uji: `gak-repro/test_void_backend.py` (70 pemeriksaan backend) & `gak-repro/repro-void.js`
(39 pemeriksaan UI; admin, kasir shift berjalan, kasir terkunci, POS).

**Dua bug produksi yang ditemukan saat pengerjaan & ikut diperbaiki** (lihat bagian §1 poin 1-2
dan catatan di akhir dokumen): blok klaim atomik `_finalize_payment` yang tertulis dua kali
(mematikan poin member, kuota kupon, penanda kupon, webhook, dan invalidasi cache), serta
`_route_module` yang membuat pemetaan modul void tidak pernah berlaku.

---

## 1. Kondisi sekarang (hasil pembacaan kode)

| Aspek | Keadaan saat ini |
|---|---|
| Endpoint | `POST /api/orders/{oid}/void` (`backend/server.py` ~baris 2312), body `VoidIn{reason, action: "void"\|"refund"}` |
| Hak akses | `require_admin` — **hanya admin**. Modul route yang terpakai = `transaksi` (karena `orders` + POST yang bukan `items`/`pay` → fallback `transaksi`) |
| Cakupan | **hanya seluruh order** (tidak ada void per item) — sudah sesuai keputusan |
| Jejak | `audit_logs` {order_id, order_number, action, reason, prev_status, by, by_id, amount, at} + order diberi `status`, `voided_at`, `void_reason`, `voided_by` |
| Efek samping (bila order tadinya `paid`) | stok retail dikembalikan, kupon −1 (bila `coupon_counted`), poin member dibalik (poin didapat ditarik, poin ditukar dikembalikan) |
| Yang TIDAK diperiksa | shift sudah ditutup / belum dibuka, batas nominal, batas waktu, urutan efek samping, dan **tidak ada klaim atomik** |
| UI | hanya tombol buang di halaman **Transaksi** (`Orders.jsx`, modul `transaksi`, admin saja). `GET /api/audit-logs` ada tapi tidak dipakai UI mana pun |
| Laporan | semua laporan memakai filter `status = paid` → void **otomatis** keluar dari penjualan, kas, laba, bagi hasil vendor, dan laporan shift. Tidak ada satu baris pun yang menampilkan berapa nilai void |

**Dua cacat nyata yang ikut diperbaiki oleh rancangan ini:**

1. **Race pada void** (kelas bug yang sama dengan yang sudah diperbaiki di `_finalize_payment`):
   `void_order` membaca order → menjalankan efek samping → baru mengubah status. Dua permintaan
   void bersamaan (atau klik dua kali karena jaringan lambat) bisa **mengembalikan stok dua kali**
   dan **membalik poin dua kali**. Rancangan ini memakai klaim atomik
   `update_one({id, status: <status lama>}, {...})` dan hanya menjalankan efek samping bila
   `matched_count == 1`.
2. **Kas laci terlihat "hilang"** saat kasir melihat laporan shift sendiri: void mengurangi
   penjualan tunai, tetapi tidak ada baris apa pun yang menjelaskan pengurangannya.

---

## 2. Keputusan pemilik (final, menjadi aturan)

1. **Kasir boleh void sendiri**, dengan batasan: **hanya order pada shift yang sedang terbuka**,
   **alasan wajib**, dan **semua tercatat**.
   *Pembaruan 2026-09-13:* shift kini **bersama** (satu shift per toko per hari, dipakai semua akun —
   lihat `docs/PANDUAN-SHIFT-HARIAN.md`), jadi yang menentukan bukan lagi "shift milik kasir itu"
   melainkan **"shift order itu masih terbuka?"**. Kasir mana pun yang bekerja pada shift hari itu
   boleh membatalkan transaksi di shift tersebut.
2. **Cukup void seluruh order** — tidak ada void sebagian item.
3. Order pada **shift yang sudah ditutup → DIBLOKIR**; hanya **admin** yang bisa melepas blokir
   secara sadar (aksi eksplisit + alasan + tercatat sebagai koreksi lintas shift).
4. Pengawasan cukup lewat **halaman “Void & Refund”**: riwayat + filter **kasir** dan **tanggal**.

---

## 3. Matriks aturan (hasil keputusan di atas)

Legenda: ✅ boleh • ⛔ ditolak • 🔓 boleh **hanya** bila admin menandai “lepas blokir”.

| Keadaan order | Kasir (modul `void`) | Admin |
|---|---|---|
| Lunas / bill terbuka, berada di **shift kasir yang sedang terbuka** | ✅ | ✅ |
| Berada di **shift yang sudah ditutup** | ⛔ | 🔓 (tercatat `cross_shift: true`) |
| **`shift_id` kosong** (transaksi dibuat tanpa shift terbuka) | ⛔ | 🔓 (alasan sama: di luar shift berjalan) |
| Berada di shift kasir **lain** yang masih terbuka | ⛔ | 🔓 |
| Kasir **belum membuka shift** | ⛔ | ✅ (shift sendiri tidak wajib untuk admin) |
| Order sudah `void`/`refunded` | ⛔ “sudah dibatalkan” (idempoten, bukan error 500) | ⛔ |
| Bill terbuka (`open`) yang menggantung | ✅ (tanpa efek stok/kupon/poin) | ✅ |

Aturan detail:

- **R1 — alasan wajib**, minimal `reason_min` huruf (default 5) untuk semua orang.
- **R2 — sekali saja**: void kedua pada order yang sama selalu ditolak (dan tidak menjalankan
  efek samping apa pun, bahkan bila dua permintaan datang bersamaan).
- **R3 — jenis**: `void` = transaksi dibatalkan; `refund` = uang pelanggan dikembalikan.
  Kasir boleh keduanya dalam shift berjalan (perbedaannya hanya keterangan + laporan);
  batas nominal kasir **opsional** (default: tanpa batas, `kasir_max_amount = 0`).
- **R4 — bill terbuka**: order yang dibatalkan melepas mejanya → meja kembali kosong & bisa dipakai.
- **R5 — kas**: **tidak** membuat catatan kas keluar (kalau dibuat, uang akan terhitung dua kali).
  Kas dihitung dari order lunas, jadi void otomatis mengurangi kas laci shift berjalan.
- **R6 — bagi hasil vendor**: order vendor yang di-void keluar dari perhitungan bagi hasil.
  Bila vendor **sudah dibayar** lewat Settlement untuk periode itu, dialog menampilkan
  **peringatan** (bagi hasil bisa jadi minus di periode berikutnya) — tetap boleh, tetap tercatat.
- **R7 — stok retail**: dikembalikan secara default (bisa dimatikan lewat pengaturan
  `restock_retail`, mis. bila sudah dilakukan stok opname setelah transaksi).
- **R8 — kupon & poin member**: dibalik seperti perilaku sekarang (kupon hanya bila
  `coupon_counted`, poin hanya bila transaksi memang pernah lunas).

---

## 4. Model data (perubahan)

### 4.1 Dokumen `orders` (tambahan field, tidak ada migrasi wajib)

| Field | Isi |
|---|---|
| `void_kind` | `"void"` \| `"refund"` (data lama: diturunkan dari `status`) |
| `void_prev_status` | status sebelum dibatalkan (`paid` / `open`) |
| `void_shift_id` | `shift_id` order (tempat transaksi itu terjadi) |
| `voided_in_shift_id` | shift saat pembatalan dilakukan → **beda** = koreksi lintas shift |
| `void_force` | `{cross_shift: bool, by, by_id, at, note}` bila blokir dilepas admin |
| `void_done` | penanda efek samping sudah dijalankan (idempotensi) |

### 4.2 `audit_logs` (tambahan field)

`kind` (void/refund), `order_shift_id`, `voided_in_shift_id`, `cross_shift` (bool),
`force_by`, `amount`, `items_count`, `prev_status`.

Indeks baru: `audit_logs (at desc)`, `audit_logs (by_id, at desc)`, `audit_logs (order_id)`,
`orders (status, voided_at)` — didaftarkan juga di `INTG_REQUIRED_INDEXES`.

### 4.3 Pengaturan baru — `settings._id = "void"`

Pola sama dengan `business`/`features` (`GET /settings/void` semua user terautentikasi, `PUT` admin):

```json
{
  "kasir_boleh_void": true,
  "wajib_alasan": true,
  "alasan_min": 5,
  "kasir_max_amount": 0,
  "kasir_hanya_shift_berjalan": true,
  "admin_boleh_lepas_blokir": true,
  "restock_retail": true
}
```

Semua default di atas = perilaku sesuai keputusan pemilik. `kasir_max_amount` disediakan
sebagai pengaman tambahan (0 = tanpa batas) — **bukan** permintaan eksplisit, bisa diabaikan.

---

## 5. Backend

### 5.1 `POST /api/orders/{oid}/void` (diperluas)

Body: `VoidIn{reason, action, force_cross_shift=False, force_note=""}`.

Urutan operasi (**wajib berurutan begini**):

1. Ambil order → 404 bila tidak ada.
2. Bila `status` sudah `void`/`refunded` → 400 idempoten (“sudah dibatalkan”).
3. Tentukan pemanggil boleh/tidak lewat `_void_policy(order, user)` yang mengembalikan
   `{allowed, reason_block, need_force, is_admin_force}` — satu fungsi, dipakai juga oleh preview
   supaya UI & server tidak pernah beda pendapat.
4. Pegaturan `settings.void` diterapkan (kasir dilarang total / nominal melebihi batas / dll).
5. **Klaim atomik**: `update_one({id, status: prev}, {$set: {status: baru, voided_at, void_reason,
   voided_by, void_kind, void_prev_status, voided_in_shift_id, void_done: true, (+void_force)}})`.
   `matched_count == 0` → 400 “sudah dibatalkan” **tanpa** efek samping.
6. **Efek samping** (`_void_side_effects(order, kind)`): stok retail, kupon, poin member,
   `_bump_rs_gen()`, `_cache_del("products:")`.
7. Tulis `audit_logs` lengkap (termasuk `cross_shift`).
8. Balikan `{status, kind, cross_shift, effects:{stok, kupon, poin}, audit}` — dipakai UI untuk
   menampilkan ringkasan setelah void.

Hak akses endpoint: `require_any_module("void")` (modul baru, §5.3). Pelepasan blokir
(`force_cross_shift`) hanya bila pemanggil **role dasar admin** atau Super Admin — bukan sekadar
punya modul `void`.

### 5.2 Endpoint baru

| Endpoint | Guna |
|---|---|
| `GET /api/orders/{oid}/void-preview` | Pratinjau sebelum konfirmasi: boleh/tidak, alasan blokir, apakah butuh lepas blokir, dan dampak (stok dikembalikan n item, kupon N, poin N, kas −RpX, bagi hasil vendor −RpY, peringatan settlement) |
| `GET /api/voids` | Riwayat + filter: `start`, `end` (default hari ini), `cashier_id`, `kind` (void/refund), `cross_shift`, `q` (nomor order), `shift_id`, `limit`+`skip`. Balikan `{rows, summary:{count, amount, by_kind, by_cashier}, total}` |
| `GET /api/settings/void` / `PUT /api/settings/void` | Baca/simpan pengaturan (§4.3) |

`GET /api/voids` membaca dari `orders` (status void/refunded) **di-join** dengan `audit_logs`
untuk kolom alasan/pelaku/shift. Bila audit lama tidak ada (data sebelum fitur), baris tetap
tampil dengan alasan/ pelaku dari dokumen order (`void_reason`/`voided_by`).

### 5.3 RBAC — modul baru `void`

- `RBAC_MODULE_LABELS["void"] = "Void & Refund"`.
- `RBAC_BASE_MODULES["kasir"]` ditambah `void` (kasir memang harus bisa).
- `RBAC_PATH_MODULE`: `"orders/{oid}/void"`, `"orders/{oid}/void-preview"`, `"voids"` → `"void"`;
  `"settings/void"` → `"pengaturan"` (fallback `settings` sudah begitu, cukup dipastikan).
- Halaman **Transaksi** tetap modul `transaksi` (admin) — tidak berubah; kasir memakai halaman
  **Void & Refund** + tombol di POS.
- `frontend/src/lib/rbac.js`: `RBAC_MODULES` + `BASE_MODULES.kasir` disinkronkan (wajib sama
  dengan backend). Matriks **Roles & Izin** otomatis memunculkan chip modul baru.

### 5.4 Laporan

- **Otomatis (sudah jalan)**: void mengeluarkan order dari penjualan, kas, laba, bagi hasil, shift.
- **Tambahan kecil (agar kas bisa dicocokkan)**: `_shift_report` dan `report_summary` menambah
  `void_count`, `void_amount`, `void_rows` (order void/refunded pada rentang/`shift_id` yang sama),
  ditampilkan di laporan shift + template WA shift dapat `{void_count}` & `{void_amount}`, dan
  `GET /voids` dipakai halaman baru.

---

## 6. Frontend

### 6.1 Halaman baru `/void` — “Void & Refund” (modul `void`)

- Nav baru (ikon `Ban`, setelah “Transaksi”), terlihat untuk admin & kasir.
- Kartu ringkasan: **jumlah void**, **jumlah refund**, **nilai total**, **% dari transaksi periode**.
- Filter: rentang tanggal (default hari ini), **kasir** (dropdown, sumber data dari hasil), jenis
  (semua/void/refund), centang **“lintas shift”**, kata kunci nomor order, tombol Reset.
- Tabel: waktu • nomor order • kasir • jenis (badge VOID/REFUND) • nominal • status awal → akhir •
  alasan • oleh • badge **“lintas shift”** bila `cross_shift`; klik baris → dialog detail
  (ringkasan item, pembayaran, alasan, pelaku, waktu, shift).
- Tombol **Ekspor Excel/PDF** (memakai pola ekspor laporan yang sudah ada) — opsional, tahap 2.
- Baris kosong diberi keterangan jelas (“tidak ada pembatalan pada periode ini”).

### 6.2 Transaksi (admin) — dialog diperkaya

- Tetap ada tombol void; dialog menampilkan **pratinjau dampak** (hasil `void-preview`) sebelum
  tombol konfirmasi aktif: “stok 3 item dikembalikan · kupon −1 · poin −120 · kas −Rp95.000”.
- Bila diblokir: kotak penjelasan + **checkbox “Lepas blokir (koreksi lintas shift)”** yang
  **hanya muncul untuk admin**, wajib mengisi catatan tambahan.
- Alasan wajib; tombol konfirmasi nonaktif sampai alasan memenuhi panjang minimum.
- Setelah sukses: toast ringkas + opsi **cetak bukti pembatalan** (struk mode “VOID” memakai
  `printReceipt` dengan penanda besar VOID/REFUND).

### 6.3 POS (kasir) — pintu utama kasir

- Pada daftar **bill terbuka**/**peta meja** POS: aksi **“Batalkan”** dengan dialog yang sama
  (alasan + pratinjau). Tanpa ini kasir harus keluar dari POS untuk kasus paling umum
  (salah input / pelanggan batal).
- Bila kasir belum membuka shift atau order di luar shift berjalan, tombol tampil dengan
  keterangan mengapa terkunci (tanpa perlu mencoba dan gagal).
- Setelah void: daftar bill & meja di-refresh otomatis.

### 6.4 Pengaturan

- **Pengaturan → Aplikasi**: kartu “Void & Refund” (§4.3).
- **Pengaturan → WhatsApp & Laporan**: chip variabel `{void_count}` / `{void_amount}` untuk
  template laporan harian & shift.

---

## 7. Uji yang harus lulus

### 7.1 Backend — `gak-repro/test_void_backend.py` (baru, target ±45 pemeriksaan)

- Kasir: boleh void order di shift berjalan; **ditolak** saat shift sudah ditutup; **ditolak** saat
  belum buka shift; **ditolak** untuk order ber-`shift_id` kosong; **ditolak** untuk order kasir lain.
- Admin: boleh lintas shift **hanya** dengan `force_cross_shift` + catatan; `force` **ditolak**
  untuk kasir (403); order ter-void mencatat `void_force`, `cross_shift: true`.
- Idempotensi & race: void dua kali → **satu** efek samping; simulasi klaim atomik `matched 0`.
- Efek samping: stok retail kembali tepat jumlahnya; kupon `used_count` −1 hanya bila
  `coupon_counted`; poin member kembali seperti semula (termasuk `total_spend`); bill terbuka
  tidak menyentuh stok/kupon/poin; `restock_retail=false` tidak mengembalikan stok.
- Aturan: alasan kosong/terlalu pendek ditolak; `kasir_max_amount` menolak nominal di atas batas;
  `kasir_boleh_void=false` menolak kasir tapi admin tetap boleh.
- Laporan: void menurunkan `report_summary.total_sales`, kas shift, laba, bagi hasil vendor;
  `void_count`/`void_amount` muncul di `_shift_report`; template WA shift terisi.
- RBAC: modul `void` ada & dipetakan dari ketiga path; kasir memilikinya; `stok_opname` tidak.
- `GET /voids`: filter tanggal/kasir/jenis berjalan; `summary` benar; data lama tanpa audit tetap tampil.
- Preview: `need_force` & daftar dampak cocok dengan hasil void sungguhan.

### 7.2 UI — `gak-repro/repro-void.js` (baru)

Halaman baru tampil & filter mengubah query; kotak ringkasan; dialog pratinjau dampak;
checkbox lepas blokir hanya untuk admin (kasir: tidak ada); tombol “Batalkan” di POS; toast &
refresh setelah void; 0 error JS di semua skenario (admin, kasir shift berjalan, kasir terkunci).

### 7.3 Regresi wajib lulus

`test_rbac_admin.py`, `test_ing_cat_backend.py`, `test_integrity_backend.py`,
`test_settlement_backend.py`, `test_users_backend.py`, `test_cli.py`, `test_klik1.py`,
`repro-pospay.js` (POS), `repro-users.js`, `repro-restructure.js`, `repro-integrity.js`,
`repro-ing-cat.js`, `repro-ing2.js` — plus `python3 scripts/check_server.py` dan
`cd frontend && corepack yarn check:undef` sebelum rilis.

---

## 8. Rencana kerja (urutan implementasi)

1. Backend: pengaturan `settings.void` + helper polis (`_void_policy`) + klaim atomik +
   `_void_side_effects` + audit lengkap. Uji backend §7.1 bagian aturan & efek samping.
2. Backend: endpoint `GET /voids`, `GET /orders/{oid}/void-preview`, `GET/PUT /settings/void`;
   modul RBAC `void`; indeks baru; `void_count/void_amount` di laporan shift & ringkasan harian.
3. Frontend: halaman `/void` + nav + `lib/rbac.js` sinkron; dialog void diperkaya (pratinjau +
   lepas blokir) di Transaksi; tombol “Batalkan” di POS.
4. Pengaturan: kartu Void & Refund + chip variabel WA.
5. Uji UI Playwright + seluruh regresi; perbaiki yang tersisa.
6. Rilis: commit → arsip `git ls-files` → `version.json` → PublishApp; catat di `AGENTS.md`;
   Pi `bash update-vibecoder-pi.sh` (backend berubah). OTA baru untuk web/APK; tanpa APK baru
   (bundle POS sudah memuat semuanya setelah update).

**Perkiraan**: 1 ronde penuh (backend + frontend + uji) — mirip skala modul Settlement Vendor.

---

## 9. Risiko & mitigasi

| Risiko | Mitigasi |
|---|---|
| Void pada order yang bagi hasilnya sudah dibayar → vendor saldo minus | Peringatan eksplisit di pratinjau + baris “koreksi” di rekap settlement periode berikutnya |
| Stok retail dikembalikan padahal sudah opname setelahnya | Pengaturan `restock_retail` (bisa dimatikan) + catatan di dialog |
| Kas laci “kurang” tanpa penjelasan saat tutup shift | Baris void di laporan shift + `{void_amount}` di WA shift + kartu di Dashboard shift |
| Kasir menyalahgunakan (void untuk menutupi selisih kas) | Semua void tercatat (pelaku, alasan, shift, lintas-shift) + halaman riwayat per kasir + batas nominal opsional + void keluar dari semua laporan otomatis |
| Dua void bersamaan menggandakan efek (stok/poin) | Klaim atomik + penanda `void_done` (§5.1 langkah 5) |
| Data lama tidak punya field baru | Semua field opsional dengan fallback (UI & laporan tidak error) |

## 10. Yang TIDAK termasuk (sesuai keputusan)

- Void **sebagian item** (hanya satu item salah) — ditunda.
- Alur **persetujuan** (kasir mengajukan, admin menyetujui) — ditunda.
- Kasir void **lintas shift** — ditolak permanen tanpa aksi admin.
- Rekap void di halaman **Laporan** & kirim WhatsApp tersendiri — hanya halaman Void & Refund
  (§6.1) plus satu baris di laporan shift; bisa ditambah kemudian bila dirasa kurang.


---

## 11. Catatan implementasi (apa yang benar-benar dibangun)

Berbeda sedikit dari rencana awal, dan itu disengaja:

1. **Penentu blokir = status shift DARI ORDER**, bukan shift si pemanggil (`_void_policy`).
   Jadi admin yang sedang tidak membuka shift tetap bisa membatalkan transaksi shift yang masih
   terbuka, dan yang butuh pelepasan blokir hanyalah transaksi pada shift yang **sudah ditutup**
   (atau `shift_id` kosong). Lebih masuk akal & tidak menyiksa admin.
2. **Klaim atomik + penanda `void_done`**, bukan `$unset coupon_counted` seperti kode lama.
3. **Halaman `/void` bisa diakses kasir** (modul `void`), bukan hanya admin — sesuai keputusan #4
   ("pengawasan lewat halaman Void & Refund").
4. **Kasir bisa melihat seluruh daftar void** (bukan hanya miliknya) — dipilih sengaja untuk
   keterbukaan; bila ingin dibatasi per-kasir tinggal menambahkan filter di `list_voids` (server).
5. **Tombol "Batalkan" di POS** muncul pada meja ber-open-bill (dialog yang sama dengan Transaksi).
6. **Pratinjau & eksekusi memakai polis yang sama** (`_void_policy`) supaya UI tidak pernah
   menampilkan tombol yang pasti ditolak server.
7. Ekspor Excel/PDF halaman Void & Refund **belum** dibuat (tahap 2 pada rencana) — datanya sudah
   lengkap di `GET /voids` bila nanti diperlukan.

### Bug produksi yang ikut diperbaiki
| # | Bug | Akibat sebelum diperbaiki |
|---|---|---|
| 1 | `_finalize_payment` punya blok klaim+efek samping **dua kali**; blok kedua tak pernah tercapai | Poin member **tidak pernah bertambah**, kuota kupon tidak pernah terpakai, `coupon_counted` tidak tersimpan, webhook `order.paid` tidak terkirim, cache laporan tidak dibatalkan — untuk transaksi jalur **bayar 1 request** (take-away/retail cepat) |
| 2 | `_route_module` menangkap semua `/orders` sebagai `transaksi` sebelum pemetaan 3-segmen | Modul izin `void` tidak akan pernah berlaku (kasir selalu ditolak) |

Uji regresi untuk keduanya ada di bagian 15 `test_void_backend.py` agar tidak kembali lagi.
