# Indeks Database MongoDB (akselerasi pencarian)

Dibuat dari audit pola query di `backend/server.py`. Indeks dipasang otomatis saat
backend start melalui `_ensure_indexes()` di `backend/server.py` (dipanggil dari
event `startup`). `create_index()` idempotent — aman dipanggil tiap boot.

> Berlaku untuk **MongoDB** (bukan SQL). Kolom yang diindeks = kolom yang benar-benar
> dipakai di filter `find/find_one/update/delete/count/aggregate` + pola `sort`.

## Rangkuman

| Koleksi | Indeks (baru ditandai ➕, sisanya dipertahankan) | Query yang dipercepat |
|---|---|---|
| **orders** (terpanas) | `order_number` unik · `client_ref` unik sparse · ➕ `id` unik · ➕ `(status, created_at↓)` · `(order_type, status)` · ➕ `(table_id, status)` · ➕ `(shift_id, status)` · `created_at↓` | akses per-order (get/pay/void/split/merge); semua laporan harian/periode (`status=paid` + rentang `created_at` — dashboard, /reports/summary, /range, /period, _vendor_report, /reports/profit, rekomendasi stok); peta meja dine-in open; cek open bill per meja; laporan shift |
| **products** | `sku` unik · ➕ `id` unik · `(type, active)` · `category_id` | `find_one({"id"})` di **setiap baris item** saat buat/ubah order & faktur; daftar per tipe; cek pemakaian kategori |
| **users** | `email` unik · ➕ `id` unik | login; otentikasi tiap request (`find_one({"id"})`) |
| **categories / vendors / tables / payment_methods** | ➕ `id` unik | validasi id di hampir tiap transaksi (kategori produk, vendor titipan, meja dine-in, metode bayar) |
| **members** | ➕ `id` unik · ➕ `phone` | lookup/tukar poin member saat bayar; cari member via telepon |
| **promos** | ➕ `id` unik | aplikasi promo otomatis tiap order |
| **coupons** | ➕ `id` unik · ➕ `code` unik | lookup kode kupon saat create & pay (2-3× per transaksi) |
| **shifts** | ➕ `id` unik · ➕ `(cashier_id, status)` | `find_one({cashier_id, status:"open"})` dipanggil hampir tiap aksi POS (pay, kas, tutup shift) |
| **reservations** | ➕ `id` unik · ➕ `(date, table_id)` | daftar reservasi harian; cek reservasi aktif per meja |
| **recipes** | ➕ `product_id` unik (natural key) | 1 resep per produk — get/update/delete/apply-hpp |
| **cash_movements** | ➕ `created_at` · ➕ `shift_id` | daftar kas harian (`/cash`, dashboard); pengeluaran per shift |
| **purchases** | ➕ `created_at` | daftar & ringkasan belanja harian |
| **stock_opname** | ➕ `created_at` | daftar opname per tanggal |

`settings`, `counters`, `audit_logs`, `import_logs`, `ai_assistant_sessions`
tidak ditambah indeks: dibaca via `_id` (PK natural), atau ukurannya kecil /
hanya di-sort tanpa filter (≤ ratusan dokumen).

## Rasional penting

1. **`id` unik di hampir semua koleksi** — aplikasi memakai id string kustom
   (`uuid4`) terpisah dari `_id` MongoDB, dan *semua* akses per-entitas memakai
   `find_one({"id": ...})`. Tanpa indeks, itu collection scan. Yang paling
   terasa: `products.id` (per baris keranjang) dan `orders.id`.
2. **`(status, created_at↓)` di orders** — seluruh lapisan laporan (dashboard,
   laporan harian/periode, vendor, profit, rekomendasi stok) mengulang pola yang
   sama `{status:"paid", created_at: {$gte,$lt}}` lalu mengurutkan menurun.
   Indeks ini mengubah scan puluhan ribu order menjadi range scan kecil.
3. **`(shift_id, status)` di orders** — tutup shift & preview vendor menarik semua
   order lunas per shift; dengan indeks ini hanya membuka halaman order shift tsb.
4. Indeks terpisah `(order_type,status)` dan `(status,created_at)` sengaja tidak
   digabung: MongoDB tidak bisa memakai kolom tengah yang hilang pada compound
   index, dan daftar order bisa difilter salah satu saja.

## Yang sengaja TIDAK diindeks

- `orders.items.product_id` (multikey) — hanya dipakai count saat hapus produk
  (jarang, admin). Index multikey membebani tiap insert order.
- `name` produk/kategori/vendor — pencarian dilakukan sisi frontend pada hasil
  `find({})` ≤ ribuan dokumen (diurutkan in-memory, tidak butuh indeks).
- Regex case-insensitive `^...$` utk cek nama duplikat — tak bisa memakai indeks
  biasa (butuh collation); koleksi kecil, biarkan.
- Koleksi master kecil (≤ ratusan baris) tanpa filter berat.

## Catatan operasional

- **Cara cek indeks terpasang** (di Pi):
  `docker compose exec mongo mongosh --quiet --eval 'db.getSiblingDB("grandpos").orders.getIndexes()'`
  (ganti `grandpos` sesuai DB_NAME).
- **Index unik gagal terpasang** → warning di log backend
  `index <koleksi> ... not applied (resolve duplicates?)`. Artinya ada data lama
  duplikat (mis. `order_number`/`coupons.code` dobel, atau dokumen tanpa field
  `id` >1). Startup tetap jalan; bersihkan duplikat lalu restart container
  backend agar indeks dibuat.
- **Kinerja menulis**: tiap insert/update kini memelihara indeks tambahan —
  trade-off standar; jumlah indeks per koleksi masih jauh di bawah batas 64 dan
  dipilih dari query yang benar-benar sering.
- Setelah update Pi (`bash update-pi.sh`), indeks otomatis dibuat saat
  container backend pertama start — tidak ada langkah manual.
