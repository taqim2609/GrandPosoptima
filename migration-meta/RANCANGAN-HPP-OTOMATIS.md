# HPP otomatis dari nota belanja (prediksi tanpa qty pemakaian)

Status: **terimplementasi & ter-push ke repo (commit `2a72351`) 2026-11-19**
Tanggal rancangan awal: 2026-11-19 · Revisi: 2026-11-19 (mengikuti permintaan pemilik)

## 1. Yang diminta pemilik

> "Nota di foto atau diketik, kemudian bahannya dipilih digunakan di mana,
> tanpa dimasukkan berapa banyak digunakan, baru diprediksi HPP-nya."

Jadi input manusia hanya dua:

1. **Nota belanja** — difoto atau diketik (qty beli + harga/total).
2. **Bahan dipakai di produk mana** — centang menu, **tanpa jumlah pemakaian**.

Sistem yang menghitung sisanya.

## 2. Kondisi data saat ini (live)

| Data | Nilai 2026-11-19 |
| :--- | :--- |
| Produk | 407, **407 `cost = 0`**, belum ada `cost_price` |
| Resep | 0 |
| Bahan | 2 (`ayam`, `Bumbu Mie`), `cost = 0` |
| Nota / pembelian bahan | 0 |
| Order | 43 (100 produk terjual dalam 30 hari terakhir) |
| HPP di laporan | 0 → laba kotor = omzet |

Artinya fitur sudah siap, tetapi **angka HPP baru muncul setelah nota pertama
disimpan dan bahan dipetakan**. Itu bukan bug; memang belum ada datanya.

## 3. Alur yang berjalan

```
Nota (foto / ketik)
  -> stok bahan + qty bertambah
  -> harga rata-rata bergerak (ingredients.cost)
  -> bahan ditandai used_in = [produk...]   (tanpa qty)
  -> prediksi: pool belanja / porsi terjual
  -> products.cost_price (cost_source = predicted_allocation)
  -> order berikutnya membawa COGS
```

### 3.1 Nota

`POST /api/ingredients/nota`

```json
{
  "supplier": "Toko Beras Aceh",
  "invoice_no": "INV-001",
  "purchase_date": "2026-11-19",
  "photo": "data:image/jpeg;base64,...",
  "items": [
    { "ingredient_id": "ing-beras", "qty": 10, "unit_cost": 2000 },
    { "ingredient_id": "ing-bumbu", "qty": 5, "total_cost": 50000 }
  ]
}
```

- Boleh `unit_cost` **atau** hanya `total_cost` (harga satuan = total / qty).
- Bahan baru boleh dikirim hanya dengan `name`; dibuat otomatis.
- Foto disimpan ke `data/nota/<nota-id>.jpg` (maks 6 MB) dan bisa diambil di
  `GET /api/ingredients/nota/:id/photo`.
- `apply_hpp` default `true`: setelah nota disimpan, prediksi langsung
  dihitung dan diterapkan.

**Soal foto:** kunci Gemini vision di `settings.ai` sudah diuji aktif pada
2026-11-19. Endpoint mencoba beberapa model secara berurutan
(`gemini-3-flash-preview` → `gemini-flash-latest` → `gemini-2.5-flash`) karena
nama model lama bisa ditutup untuk kunci baru: `gemini-2.5-flash` sempat
menjawab 404 *"no longer available to new users"*. Model bisa dipaksa lewat
`GEMINI_VISION_MODEL` tanpa mengubah setelan pemilik.

Foto dibaca menjadi baris item (`name`, `qty`, `unit`, `unit_cost`,
`total_cost`), lalu **diperiksa manusia** di dialog sebelum disimpan. Foto
buram/tulisan tangan bisa salah baca — angka tetap boleh dikoreksi. Tanpa kunci
nyata, endpoint menjawab **503** dan menyuruh input manual; endpoint lama yang
mengarang dua bahan sudah dihapus.

### 3.2 Harga rata-rata bergerak

```
harga_baru = (stok_lama × harga_lama + qty_beli × harga_nota) / (stok_lama + qty_beli)
```

- Jika stok lama 0 atau harga lama belum pernah diisi → pakai harga nota.
- Nota tanpa harga tidak menghapus harga lama.
- `unit_cost` terakhir tetap disimpan di `buy_price` dan `last_purchase_cost`.
- Setiap baris menyimpan `cost_before` dan `cost_after` untuk jejak audit.

### 3.3 Pemakaian tanpa qty

`PUT /api/ingredients/:id/usage-targets`

```json
{ "product_ids": ["p-nasi", "p-mie"] }
```

Tersimpan sebagai `ingredients[].used_in`. Tidak ada field qty, tidak ada
pemakaian per transaksi.

### 3.4 Prediksi HPP

Untuk bahan `I` dengan total belanja `C` pada periode, dan produk
`P1…Pn` yang memakai `I`:

```
total_porsi = Σ porsi terjual(P1…Pn)
biaya_I_per_porsi = C / total_porsi
HPP(P) = Σ biaya_I_per_porsi   untuk semua I yang dipakai P
```

Contoh:

- Beras: belanja Rp20.000, dipakai di Nasi Goreng (10 porsi) dan Mie Aceh
  (30 porsi) → 40 porsi → **Rp500/porsi**.
- Bumbu: belanja Rp50.000, hanya dipakai Nasi Goreng (10 porsi) →
  **Rp5.000/porsi**.
- HPP Nasi Goreng = 500 + 5.000 = **Rp5.500**.
- HPP Mie Aceh = **Rp500**.

Asumsi yang dipakai: pemakaian bahan per porsi **setara** di semua produk yang
memakai bahan itu. Karena itu hasilnya disebut **prediksi**, bukan HPP audit.
Kalau pemakaian per menu berbeda jauh (mis. satu menu memakai 3× lebih banyak
daging), angka ini hanya rata-rata dan perlu resep untuk akurat.

### 3.5 Resep menang

Produk yang punya resep tidak diikutkan dalam pembagian pool dan tidak ditimpa
oleh prediksi. HPP-nya tetap dari `computeRecipeHpp` (`cost_source = recipe`,
`confidence = accurate`). Prediksi hanya menyentuh produk tanpa resep.

### 3.6 Transparansi

`GET /api/costing/prediction?days=30` mengembalikan:

- `summary.purchases_total`, `unallocated_pool`
- `summary.coverage_percent` — persentase omzet yang produknya sudah punya HPP
- `summary.products_without_mapping`
- `missing_mapping[]` — bahan yang sudah dibeli tetapi belum dipetakan
- `warnings[]` — mis. bahan sudah dibeli tetapi produk pemakainya belum terjual
- `ingredients[]` — pool, status (`ok` / `no_purchase` / `unmapped` / `no_sales`)
- `products[]` — HPP sekarang, prediksi, margin, sumber, rincian komponen

Bahan yang belum dipetakan **tidak** diam-diam dianggap HPP 0; ia muncul di
daftar `missing_mapping` dan pool-nya masuk `unallocated_pool`.

## 4. Yang berubah di data

### `ingredients`

| Field | Isi |
| :--- | :--- |
| `cost` | harga rata-rata per satuan (diisi dari nota) |
| `buy_price` | harga satuan nota terakhir |
| `cost_source` | `purchase` / `manual` |
| `last_purchase_at` | waktu nota terakhir |
| `last_purchase_cost` | harga satuan nota terakhir |
| `used_in` | daftar `product_id` yang memakai bahan (tanpa qty) |
| `used_in_updated_at` | kapan peta diubah |

### `ingredientPurchases` (baris nota)

Ditambah: `supplier`, `invoice_no`, `purchase_date`, `nota_id`,
`cost_before`, `cost_after`, `stock_before`, `stock_after`, `created_by`.

### `ingredientNotas` (baru)

`id`, `supplier`, `invoice_no`, `purchase_date`, `photo_path`, `note`,
`item_count`, `total_cost`, `created_at`, `created_by`.

### `products`

Ditambah: `cost_price`, `cost_source` (`recipe` / `predicted_allocation`),
`cost_updated_at`.

### `costingRuns` (baru)

Riwayat penerapan HPP: periode, jumlah produk diterapkan/dilewati, coverage.
Maksimal 200 entri.

## 5. Endpoint

| Endpoint | Fungsi |
| :--- | :--- |
| `POST /api/ingredients/nota` | simpan satu nota (banyak bahan, foto opsional) |
| `GET /api/ingredients/notas` | riwayat nota |
| `GET /api/ingredients/nota/:id/photo` | foto nota |
| `POST /api/ingredients/purchase-bulk` | kompatibilitas UI lama (sekarang lewat nota) |
| `POST /api/ingredients/:id/purchase` | beli satu bahan (tetap ada) |
| `GET/PUT /api/ingredients/:id/usage-targets` | bahan dipakai di produk mana |
| `GET /api/costing/prediction?days=30` | hitung prediksi (read-only) |
| `GET /api/costing/coverage` | ringkasan coverage + bahan belum dipetakan |
| `POST /api/costing/apply` | tulis prediksi ke `products.cost_price` (admin) |
| `POST /api/ai/ingredient-vision` | baca foto **hanya** bila kunci vision nyata ada |

## 6. Tampilan

Tab baru **Prediksi HPP** di halaman *Bahan & Belanja* (khusus admin):

- pilih periode 7/30/60/90 hari;
- kartu ringkasan: belanja periode, pool belum terpakai, coverage omzet,
  jumlah bahan belum dipetakan;
- peringatan bahan yang belum dipetakan + tombol **Atur pemakaian**;
- tabel produk: terjual, harga, HPP sekarang, prediksi HPP, margin, sumber;
- tombol **Terapkan HPP**;
- daftar bahan dengan tombol **Dipakai di…** (centang produk, tanpa qty).

Di tab **Pembelian Bahan**: input supplier, nomor nota, dan lampiran foto nota.
Baris pembelian massal tetap bisa diketik. Tombol scan AI tetap ada, tetapi
kalau kunci vision belum diisi ia menampilkan pesan agar input manual — tidak
lagi mengarang item.

## 7. Uji

`tests/hpp-prediction-nota-isolated.js` menahan:

1. Moving average dengan stok lama > 0.
2. Harga satuan dari `total_cost / qty`.
3. Alokasi pool sesuai porsi terjual (500 + 5.000 = 5.500).
4. Resep menang atas prediksi.
5. `PUT usage-targets` mengubah pembagian.
6. Bahan belum dipetakan muncul di `missing_mapping`.
7. Foto nota tersimpan dan bisa diambil.
8. Tanpa kunci vision, scan menjawab 503 (tidak mengarang bahan).
9. Laporan profit memakai snapshot `cost` di baris order; baris lama
   `cost = 0` memakai HPP katalog, sehingga menerapkan HPP ulang tidak
   mengubah laba order yang sudah ditutup.

Suite: `node run-tests.js --fast` → **30 passed, 0 failed, 2 skipped**.

## 8. Batasan yang harus disadari

- **Prediksi, bukan audit.** Pool dibagi rata per porsi. Menu dengan pemakaian
  bahan yang jauh lebih besar akan terlihat lebih murah dari sebenarnya.
- **Butuh penjualan pada periode yang sama.** Bahan dibeli tetapi menunya belum
  terjual → belum bisa diprediksi (muncul sebagai warning), bukan HPP 0.
- **Periode harus konsisten.** Belanja 30 hari dibagi penjualan 30 hari. Kalau
  stok menumpuk (belanja besar, penjualan kecil), HPP per porsi bisa terlalu
  tinggi; sebaliknya jika memakai stok lama, bisa terlalu rendah.
- **Retail/titipan** sebaiknya tidak dipetakan ke bahan dapur; HPP-nya lebih
  tepat dari harga beli produk.
- **Hasil baca foto tetap harus diperiksa.** Model vision sudah aktif, tetapi
  nota buram, tulisan tangan, atau struk thermal pudar bisa salah baca. Foto
  tetap disimpan sebagai bukti; angka yang salah bisa dikoreksi sebelum simpan.
- **Order lama** yang sudah terlanjur `cost = 0` tetap 0 di baris order; laporan
  laba memakai `cost_price` produk saat laporan dibuka, jadi produk yang HPP-nya
  sudah diterapkan akan langsung terlihat di laporan periode mana pun.

## 9. Langkah operasional untuk pemilik

Sekali di awal:

1. Buat bahan yang benar-benar dibeli (nama + satuan).
2. Untuk setiap bahan, klik **Dipakai di…** dan centang menu yang memakainya.
   Tidak perlu jumlah.
3. Simpan nota belanja pertama (foto boleh, angka diketik).
4. Buka **Prediksi HPP** → periksa → **Terapkan HPP**.

Rutin:

1. Setiap belanja, simpan nota (foto + qty + harga/total).
2. Sistem memperbarui harga bahan dan HPP produk otomatis.
3. Kasir berjualan seperti biasa; tidak ada isian pemakaian per transaksi.

Kontrol:

- Stok opname tetap dilakukan berkala (menu Stok Opname).
- Bahan yang tidak jadi dipakai bisa dilepas dari peta produk.
- Untuk menu andalan, isi **resep** agar HPP-nya akurat dan tidak ikut prediksi.

## 10. Keputusan yang masih diperlukan

1. Apakah angka prediksi boleh langsung dipakai untuk laporan laba, atau perlu
   ditinjau dulu setiap bulan?
2. Menu mana yang wajib punya resep (bukan prediksi)?
3. Apakah perlu mode "belanja bulanan" yang membagi pool per bulan, bukan per
   30 hari bergerak?
4. Apakah stok boleh minus saat ramai? (Saat ini belum ada konsumsi otomatis;
   stok baru berkurang lewat opname/pemakaian manual.)

## 11. Catatan akuntansi

- Pembelian bahan = **persediaan**, bukan beban langsung pada tanggal belanja.
- HPP diakui saat penjualan. Prediksi ini memberi angka COGS yang masuk akal
  selama belum ada resep.
- Untuk laporan pajak/audit, pakai HPP resep (akurat) atau opname fisik;
  jangan memakai angka prediksi sebagai bukti audit.
- Selisih opname dicatat sebagai penyesuaian persediaan, bukan HPP penjualan.
