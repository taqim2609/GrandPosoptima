# Panduan Shift Harian (F&B & Retail) — satu shift per hari, dipakai bersama

Berlaku sejak rilis **2026-09-13**. Dokumen ini menjelaskan cara kerja shift setelah
perubahan besar sesuai permintaan pemilik.

## Ringkas aturan baru

| Hal | Sebelum | Sesudah |
|-----|---------|---------|
| Kepemilikan shift | Per AKUN (kasir yang membuka) | **Per TOKO, satu per hari** (dipakai bersama semua akun) |
| Jumlah shift | 1 dokumen gabungan F&B+Retail | **2 dokumen terpisah**: F&B dan Retail |
| Cara buka | Tiap akun buka shift sendiri | **Satu tombol** membuka F&B & Retail sekaligus |
| Kas awal | 1 nilai | **Terpisah**: kas awal F&B dan kas awal Retail |
| Akun lain | Harus buka shift baru | **Langsung memakai** shift hari itu |
| Yang dicatat | hanya kasir pembuka | **pembuka (`opened_by`) dan penutup (`closed_by`) selalu dicatat** |
| Pengeluaran | hanya halaman Pengeluaran & Kas | Boleh kapan saja selama shift buka **dan** diisi saat tutup shift |
| Tutup shift | per akun | **Sekaligus** F&B & Retail (kas akhir per toko) |

## Alur harian

1. **Buka shift (sekali sehari)** — halaman *Shift* atau gerbang di halaman *POS*:
   isi **Kas Awal F&B** dan **Kas Awal Retail**, tekan satu tombol.
   Server membuat dua dokumen shift (satu per toko) dengan satu `session_id`.
2. **Transaksi** — semua akun memakai shift yang sama:
   - order `dine_in` / `take_away` → shift **F&B**
   - order `retail` → shift **Retail**
   Order diberi `shift_id` saat **pembayaran** (jalur yang sama untuk online maupun
   antrean offline).
3. **Pengeluaran** — bisa kapan saja di halaman *Pengeluaran & Kas*
   (scope F&B → shift F&B, scope Retail → shift Retail), **dan** diisi langsung di
   form tutup shift (dibuat sebagai kas keluar toko terkait, `source="shift_close"`).
4. **Tutup shift** — satu tombol menutup F&B & Retail sekaligus:
   **uang transport (WAJIB)**, kas akhir per toko, pengeluaran tambahan, dan nominal
   bagi hasil vendor. Setelah itu muncul laporan gabungan + laporan per toko (termasuk
   **rincian metode pembayaran** dan **sisa kas tunai**), tombol Cetak & Kirim WA
   (memakai *Template WhatsApp → Laporan Shift*).
5. **Uang transport** — pengeluaran wajib setiap tutup shift, **tidak boleh 0**, dan
   **selalu dibebankan ke F&B** (kas keluar kategori `Transport`, `source="shift_close"`).
   Nominal diisi di form tutup shift (terisi otomatis dari *Pengaturan → Aplikasi →
   Uang transport* = `transport_amount`, bawaan Rp20.000). Perangkat/bundle lama yang
   belum mengirim nominal otomatis memakai nilai bawaan itu supaya tutup shift tidak gagal.

## Auto-kirim WhatsApp laporan shift

Setiap kali shift ditutup, laporan shift **langsung dikirim ke WhatsApp** memakai template
*Laporan Shift* — nomor tujuannya sama dengan nomor **Laporan Harian**
(`settings._id="report".recipients`). Bawaannya **AKTIF**; bisa dimatikan di
*Pengaturan → WhatsApp & Laporan → “Kirim laporan tutup shift otomatis ke WhatsApp”*
(`send_shift_auto`).

- Butuh **WhatsApp gateway siap** (API key + device terpilih) dan **nomor tujuan terisi** — bila
  belum, penutupan shift tetap berhasil dan halaman Shift memberi tahu alasannya
  (`wa_auto.skipped`).
- **Kegagalan WhatsApp TIDAK pernah menggagalkan penutupan shift** (ada batas waktu 25 detik):
  status shift sudah berubah sebelum pengiriman, jadi kegagalan dilaporkan sebagai pesan
  peringatan di layar, bukan error. Kasir tetap bisa mengirim ulang manual dengan tombol
  *Kirim Laporan Shift ke WhatsApp*.
- Body `POST /shifts/close` menerima `send_shift_wa` (opsional): kosong = ikuti Pengaturan,
  `false` = lewati kirim, `true` = paksa kirim. Status hasil disimpan di dokumen shift
  (`wa_auto`, `wa_auto_at`).

## Peringatan pengeluaran harian belum diisi

Saat tutup shift, sistem memeriksa **pengeluaran harian** (kas keluar pada tanggal shift itu,
termasuk yang dicatat lewat halaman *Pengeluaran & Kas* saat shift belum/tidak terbuka).
**Dua kategori otomatis TIDAK dihitung** karena bukan laporan belanja yang diisi kasir:
- **Uang transport** (`Transport`) — pengeluaran otomatis wajib saat tutup shift;
- **Bagi Hasil Vendor** — pembayaran bagi hasil vendor (settlement), otomatis lewat modul
  Settlement Vendor / isian "Diberikan" di tutup shift.

Pengecualian dilakukan **berdasarkan kategori**, bukan berdasarkan asal pencatatannya — jadi kas
keluar yang ditandai kategori "Bagi Hasil Vendor" lewat halaman *Pengeluaran & Kas* pun tidak
dihitung sebagai pengeluaran harian. Tanpa pengecualian ini, hari yang sebenarnya tidak ada
pengeluaran apa pun akan dianggap "sudah diisi" hanya karena uang transport/bagi hasil vendor
tercatat sebagai kas keluar.

- Bila **F&B & Retail sama-sama belum ada pengeluaran** dan form tutup shift juga tidak mengisi
  pengeluaran, tutup shift **ditolak 400** sampai kasir mencentang konfirmasi sadar
  (`ack_no_expense: true`) — atau mengisi pengeluarannya lebih dulu.
- Bila hanya salah satu toko yang kosong, hanya ditampilkan sebagai keterangan (tidak memblokir).
- Status per toko tersedia di `GET /shifts/current` → `expenses` (`fnb`/`retail`: `count`, `total`,
  dan `empty`).
- Laporan hasil tutup shift mencatat `expenses_empty` / `expenses_ack`, ikut tampil di layar,
  baris cetak, dan variabel template WA `{catatan_pengeluaran}`.

## Yang perlu diketahui

- **Shift toko dibuat otomatis** bila sesi hari itu sudah terbuka tetapi shift toko
  tersebut belum ada (mis. hari pertama setelah update, atau dibuka dari perangkat
  versi lama). Shift otomatis diberi `opening_cash = 0` dan penanda `auto_created`.
  Tujuannya supaya tidak ada transaksi yang tercatat tanpa shift.
- **Dua perangkat tidak bisa membuka shift dobel**: ada indeks unik parsial pada
  `shifts.open_key` (`"fnb:open"` / `"retail:open"`). Kunci dilepas saat shift ditutup.
- **Buka/tutup boleh siapa pun** yang punya izin modul *Shift* (Pengaturan → Roles & Izin).
- **Void/refund**: kasir boleh membatalkan transaksi pada shift yang **masih terbuka**
  (shift kini bersama, jadi bukan lagi “shift milik saya”). Transaksi pada shift yang
  sudah ditutup hanya bisa dibatalkan admin dengan melepas blokir + catatan.
- **Laporan per toko**: `expected_cash` tiap toko = kas awal toko + penjualan tunai toko
  − pengeluaran toko; `net_cash_*` = penjualan toko − pengeluaran toko
  (bagi hasil vendor & uang transport sudah termasuk di pengeluaran F&B saat dibayar).
- **Rincian metode pembayaran & sisa kas tunai** ada di laporan shift (layar, cetak, WA,
  dan ekspor): `by_payment` per metode (Tunai/QRIS/Transfer/…), `sisa_cash_*` =
  penjualan **tunai** toko − pengeluaran toko (uang laci sesudah belanja; kas awal TIDAK
  termasuk — itu ada di `expected_cash`).
- **Variabel template WA baru**: `catatan_pengeluaran`, `pengeluaran_fnb`, `pengeluaran_retail`,
  `rincian_metode`, `penjualan_tunai`,
  `penjualan_tunai_fnb`, `penjualan_tunai_retail`, `sisa_cash_fnb`, `sisa_cash_retail`,
  `sisa_cash`, `transport`. Template yang **sudah pernah diubah** tidak ikut berubah —
  tekan *Reset bawaan* atau tambahkan variabelnya manual.
- **Histori** dikelompokkan **per sesi** (F&B + Retail dalam satu baris) dan menampilkan
  pembuka → penutup.

## Migrasi data lama

Saat backend start, `_migrate_shift_scopes()` memberi `scope="fnb"`, `session_id`,
`date`, `opened_by`, dan `open_key` pada shift yang **sedang terbuka** saat update
(shift lama dianggap F&B). Shift lama yang sudah **tertutup** tidak disentuh — laporan
tersimpannya tetap apa adanya.

## Kalau ada masalah

- **POS menampilkan “Buka Shift Dulu” padahal shift sudah dibuka** → cek
  `GET /api/shifts/current`; kalau null, lihat log backend saat start
  (`docker compose logs backend | grep -i "migrasi shift"`).
- **“Shift hari ini sudah dibuka oleh …”** → memang benar: satu shift per hari.
  Tutup dulu bila ingin membuka yang baru.
- **Ada dua shift terbuka untuk toko yang sama** (sisa percobaan/versi lama) →
  Pengaturan → Fitur & Integrasi → **Integritas** akan melaporkannya sebagai
  peringatan `shift_open_duplicate`. Tutup shift yang tidak dipakai dari halaman Shift
  (jangan dihapus, laporannya tetap diperlukan).

## Berkas terkait

- Backend: `backend/server.py` — bagian `SHIFT HARIAN (F&B & Retail)`
  (`_open_shifts`, `_open_shift`, `_open_shift_any`, `_shift_for_order`, `_session_view`,
  `_session_reports`, `_combine_reports`, endpoint `/shifts/*`).
- Frontend: `frontend/src/pages/Shift.jsx` (halaman shift), `POS.jsx` (gerbang + chip),
  `Cash.jsx` (banner keterangan shift).
- Uji: `gak-repro/test_shift_daily_backend.py` (backend) & `gak-repro/repro-shift-daily.js` (UI).
