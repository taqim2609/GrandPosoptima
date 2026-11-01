# Kontrak API & Data — Perubahan Fix-02

Dokumen ini mencatat penyelarasan (alignment) kontrak yang tidak konsisten antara backend, frontend, dan konfigurasi yang dilakukan dalam GrandPOS Fix-02.

## Ringkasan

Fix-02 menyelaraskan tiga bidang kontrak yang ditemukan tidak konsisten:
1. **Format mata uang (Rupiah)** di 4 berkas utilitas frontend — divergensi `"Rp"` vs `"Rp "`.
2. **Nilai konfigurasi uang kas keluar (`cash_out`)** di `getReportSummary()` backend — angka buatan (`50000`) diganti dengan perhitungan dari transaksi kas nyata.
3. **Keputusan terbuka** yang masih ambigu dan dicatat untuk diputuskan Qim (tidak ditebak).

Semua perubahan hanya menyentuh **satu sisi** kontrak di mana ada sisi kanonikal, dan tidak menambahkan dependensi baru.

---

## 1. Format Mata Uang (Rupiah)

**Sisi kanonikal:** `project/frontend/src/lib/format.js` — fungsi `rupiah()` yang diimpor oleh POS.jsx, Shift.jsx, Cash.jsx, Dashboard.jsx, Members.jsx, dan ShiftClosingReportView.jsx. Formatnya adalah `"Rp "` (dengan spasi).

**Masalah:** 4 berkas utilitas lain mencetak rupiah **tanpa** spasi (`"Rp"`) sehingga tampilan rupiah tidak konsisten di printer térmal, Epson ePOS-Print, Bluetooth ESC/POS, dan widget kustom.

| # | Berkas | Sebelum (belum selaras) | Sesudah (setelah Fix-02) | Keputusan |
|---|--------|-------------------------|--------------------------|-----------|
| 1 | `project/frontend/src/lib/bluetooth.js` | `"Rp" + Math.round(...)` | `"Rp " + Math.round(...)` | Ubah frontend ke kanonikal `"Rp "` |
| 2 | `project/frontend/src/lib/receipt.js` | `"Rp" + Math.round(...)` | `"Rp " + Math.round(...)` | Ubah frontend ke kanonikal `"Rp "` |
| 3 | `project/frontend/src/lib/device.js` | `"Rp" + Math.round(...)` | `"Rp " + Math.round(...)` | Ubah frontend ke kanonikal `"Rp "` |
| 4 | `project/frontend/src/lib/customWidgets.js` | `"Rp" + Math.round(v)...` | `"Rp " + Math.round(v)...` | Ubah frontend ke kanonikal `"Rp "` |

**Berkas referensi (tidak diubah, sebagai kanonikal):**
- `project/frontend/src/lib/format.js` — `export const rupiah = (n) => "Rp " + ...`
- `project/frontend/src/lib/print.js` — sudah `"Rp "` (sudah selaras)

**Verifikasi:** `tests/fix02-contract.js` dan `tests/fix02-negative-control.js` (17/17 discriminasi).

---

## 2. Nilai Konfigurasi Uang Kas Keluar (`cash_out`) — `getReportSummary()`

**Sisi kanonikal:** `POST /api/shifts/close` (api-server.js) — menghitung `cash_out_fnb` / `cash_out_retail` dari `db.cashTransactions` (scope `fnb` / `retail`). Ini adalah satu-satunya tempat yang sudah benar.

**Masalah:** `GET /api/reports/summary` → `getReportSummary()` mengembalikan angka buatan (fabricated defaults) yang sama jenisnya dengan bug P1-F yang sudah diperbaiki di Fix-01:
- `cash_out: 50000`
- `cash_out_fnb: 50000`
- `cash_net_fnb: ... - 50000`
- `cash_net: ... - 50000`

Angka `50000` tidak pernah dihitung dari transaksi kas yang nyata, sehingga laporan harian menampilkan pengeluaran yang belum terjadi.

| # | Lokasi | Sebelum (belum selaras) | Sesudah (setelah Fix-02) | Keputusan |
|---|--------|-------------------------|--------------------------|-----------|
| 1 | `api-server.js` `getReportSummary()` | `cash_out: 50000` | `cash_out: cash_out_total` (dihitung dari `cashTransactions`) | Ubah backend — komputasi nyata |
| 2 | `api-server.js` `getReportSummary()` | `cash_out_fnb: 50000` | `cash_out_fnb: cash_out_fnb` (dihitung dari `cashTransactions` scope `fnb`) | Ubah backend — komputasi nyata |
| 3 | `api-server.js` `getReportSummary()` | `cash_out_retail: 0` | `cash_out_retail: cash_out_retail` (dihitung dari `cashTransactions` scope `retail`) | Ubah backend — komputasi nyata |
| 4 | `api-server.js` `getReportSummary()` | `cash_net_fnb: ... - 50000` | `cash_net_fnb: ... - cash_out_fnb` | Ubah backend — komputasi nyata |
| 5 | `api-server.js` `getReportSummary()` | `cash_net_retail: ...` (tidak dikurangi) | `cash_net_retail: ... - cash_out_retail` | Ubah backend — komputasi nyata |
| 6 | `api-server.js` `getReportSummary()` | `cash_net: ... - 50000` | `cash_net: ... - cash_out_total` | Ubah backend — komputasi nyata |

**Verifikasi:** `tests/fix02-contract.js` (25/25 lulus) dan `tests/fix02-negative-control.js` (17/17 discriminasi).

---

## 3. Struktur Respons Error

Tidak ditemukan ketidakselarasan. Backend mengembalikan `{ detail: "..." }` secara konsisten (contoh: `res.status(400).json({ detail: '...' })`), dan frontend `apiError()` di `project/frontend/src/lib/api.js` membaca `e.response?.data?.detail`. Tidak perlu perubahan.

---

## 4. Enum Status Order & Shift

Tidak ditemukan ketidakselarasan yang memerlukan perubahan. Backend menggunakan `open_bill` / `open` / `pending` (terbuka) → `completed` / `paid` (lunas) → `voided` / `refunded` (dibatalkan). Frontend (POS.jsx, Tables.jsx, Shift.jsx) sudah mereferensikan enum yang sama. Tidak perlu perubahan.

---

## 5. Zona Waktu WIB

Backend menggunakan `wibTodayStr()` / `orderDateStr()` / `wibDateStr()` (UTC+7) secara konsisten untuk tanggal bisnis. Frontend menyediakan `wibToday()` di `project/frontend/src/lib/format.js`, tetapi beberapa pemanggilan `new Date(...).toLocaleString("id-ID")` di Shift.jsx, receipt.js, device.js, dan bluetooth.js masih menggunakan waktu perangkat (bukan WIB).

**Keputusan:** **Ditangguhkan sebagai keputusan terbuka** (lihat bagian Keputusan Terbuka). Memperbaiki semua pemanggilan tanggal ke WIB berdampak luas pada tampilan struk dan laporan; memerlukan konfirmasi Qim agar tidak merusak tampilan yang sudah diterima kasir.

---

## 6. Nilai Konfigurasi Lain (transport_amount)

Ditemukan perbedaan nilai konfigurasi yang belum selaras:
- `project/frontend/src/lib/business.js`: `transport_amount: 20000` (digunakan Shift.jsx)
- `src/lib/business.js` (pohon duplikat di root): `transport_amount: 0`
- Backend `db.settings.business` (api-server.js line 582): **tidak memiliki** field `transport_amount` sama sekali

**Keputusan:** **Ditangguhkan sebagai keputusan terbuka** (lihat bagian Keputusan Terbuka). Tidak diketahui dengan pasti pohon mana yang merupakan sumber kanonikal untuk build produksi, dan backend tidak menyediakan field ini. Mengubah salah satu sisi tanpa konfirmasi berisiko menimpa nilai admin yang sudah disimpan di database.

---

## Keputusan Terbuka (Belum Diselesaikan)

Berikut dicatat untuk diputuskan Qim, **tidak ditebak** dalam Fix-02:

| # | Masalah | Opsi | Rekomendasi awal |
|---|---------|------|------------------|
| A | Tanggal ditampilkan dengan `toLocaleString("id-ID")` (waktu perangkat) bukan WIB di beberapa berkas frontend | (1) Ubah semua ke WIB, (2) biarkan waktu perangkat, (3) buat helper `formatWib(date)` tunggal | (3) — buat helper tunggal, konsisten dengan backend `wibTodayStr()` |
| B | `transport_amount` berbeda antara `project/frontend/src/lib/business.js` (20000), `src/lib/business.js` (0), dan backend (tidak ada field) | (1) Tambahkan ke `db.settings.business` backend dengan nilai 20000, (2) searahkan root `src/lib/business.js` ke 20000, (3) biarkan seperti saat ini | (1) — backend sebagai tunggal sumber kebenaran, nilai 20000 agar sesuai frontend aktif |
| C | `getReportSummary()` masih memiliki data buatan lainnya: `chart_data` (tanggal 2026-09-11..16 hardcoded), `category_report` kategori dengan `qty: 10/15/5` dan total rasio `0.6/0.4`, `top_products` fallback dengan `qty: 12`, `margin: 45.0` | (1) Hitung dari order nyata, (2) kosongkan / gunakan 0 | Belum diputuskan — perlu penelitian lebih lanjut agar tidak merusak tampilan dashboard chart |

---

## Bukti Verifikasi

| Pemeriksaan | Hasil |
|-------------|-------|
| `node tests/fix02-contract.js` | 25/25 lulus |
| `node tests/fix02-negative-control.js` | 17/17 discriminasi (fail-before / fix-after) |
| `node tests/fix01-regression.js` | 19/19 lulus (no regression) |
| `node tests/fix01-functional.js` | Semua route shift terdaftar ✅ |
| `node tests/fix01-negative-control.js` | 9/9 discriminasi ✅ |
| `node -c` semua berkas yang diubah | OK (sintaks valid) |
| `npm run build` (frontend) | ✅ Build berhasil, OTA v2.10.20261029233121 |

---

## Berkas yang Diubah

- `project/frontend/src/lib/bluetooth.js` — format rupiah `"Rp "` (spasi ditambahkan)
- `project/frontend/src/lib/receipt.js` — format rupiah `"Rp "` (spasi ditambahkan)
- `project/frontend/src/lib/device.js` — format rupiah `"Rp "` (spasi ditambahkan)
- `project/frontend/src/lib/customWidgets.js` — format rupiah `"Rp "` (spasi ditambahkan)
- `api-server.js` — `getReportSummary()` menghitung `cash_out_*` dari `cashTransactions`, tidak lagi angka buatan `50000`

## Berkas Baru

- `tests/fix02-contract.js` — uji kontrak regresi Fix-02
- `tests/fix02-negative-control.js` — uji negatif diskriminasi (fail-before / fix-after)
- `project/docs/CONTRACT-ALIGNMENT-FIX02.md` — dokumentasi tabel sebelum/sesudah kontrak (berkas ini)
