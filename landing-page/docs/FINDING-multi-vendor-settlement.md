# Temuan Bug — `close_shift` gagal bila satu shift punya ≥2 vendor bershare ≠ 0

Status: **DIPERBAIKI (FIXED)** — Opsi A, diverifikasi 2026-10-17.
Lihat "## Bukti perbaikan" di bawah.
(Ditemukan oleh: `tests/test_go_live_regression.py::test_r3_full_shift_reconciliation_exact`
pada PostgreSQL 16 hidup (compose `grandpos-db-1`), 2026-10-17.)

## Ringkasan

`app/services.py::generate_vendor_settlements` menulis satu baris
`cash_movements` per vendor, tetapi mengisi `reference_type='shift'` dan
`reference_id=shift_id` **yang sama** untuk semua vendor. Index unik parsial
`cash_movements_reference_unique` mengunci kombinasi
`(movement_type, reference_type, reference_id)`, sehingga vendor **kedua**
yang punya share ≠ 0 di shift yang sama menabrak constraint dan **seluruh
`close_shift` rollback**.

Artinya: begitu satu shift menjual produk dari dua vendor titipan
(mis. Kue Bhoi dari *Mitra Kue Aceh* dan Kopi Gayo dari *Titipan Kopi Gayo* —
keduanya ada di `db/seed.sql`), kasir **tidak bisa menutup shift sama sekali**.
Kas tertahan, settlement tidak pernah tercatat.

## Bukti verbatim

```
E   psycopg.errors.UniqueViolation: duplicate key value violates unique constraint "cash_movements_reference_unique"
E   DETAIL:  Key (movement_type, reference_type, reference_id)=(vendor_settlement, shift, 1) already exists.
```

Traceback:

```
tests/test_go_live_regression.py:542: in test_r3_full_shift_reconciliation_exact
app/services.py:625: in close_shift
    settlements = generate_vendor_settlements(cur, shift_id=shift_id, created_by=closed_by)
app/services.py:728: in generate_vendor_settlements
    movement = _one(
app/services.py:59: in _one
    cur.execute(sql, params)
```

## Kode penyebab

`app/services.py:728-735`:

```python
movement = _one(
    cur,
    "INSERT INTO cash_movements (shift_id, movement_type, direction, amount, reference_type, "
    "                            reference_id, reason, created_by) "
    "VALUES (%s, 'vendor_settlement', 'out', %s, 'shift', %s, %s, %s) RETURNING id",
    (shift_id, -amount, shift_id, f"Bagi hasil {row['vendor_name']}", created_by),
)
```

`reference_type` konstan `'shift'` dan `reference_id` konstan `shift_id` untuk
setiap vendor pada shift itu.

Constraint penyebab, `db/schema.sql:364-366`:

```sql
CREATE UNIQUE INDEX cash_movements_reference_unique
  ON cash_movements (movement_type, reference_type, reference_id)
  WHERE reference_id IS NOT NULL AND movement_type IN ('sale_cash', 'vendor_settlement');
```

Constraint itu **benar** dan perlu: ia yang mencegah satu order dibayar dua
kali (`sale_cash`) dan mencegah satu settlement dicatat dua kali
(`vendor_settlement`). Yang salah adalah kunci referensinya — bukan
constraint-nya.

## Bukti bahwa sisa logika R3 benar (bukan tes yang salah)

Probe terpisah dengan **satu** vendor bershare ≠ 0 lulus **16/16** asersi
(matematika `expected_cash`, variance 0, ringkasan `shifts`, settlement tepat
sekali, `v_shift_cash`, `v_daily_turnover`, `v_weekly_best_sellers`):

```
orders: fnb=76090 retail_weighted=450 qris=75000 debit=75000
cash_sales=76540 non_cash=150000 kopi_base=150450 vendor_cash=22568
expected = 75_000 + 76540 + 25_000 - 40_000 - 22568 = 113972
  [PASS] expected_cash exact: 113972
  [PASS] variance 0: 0
  [PASS] settlement amounts: {1: 0, 3: 22568}
  [PASS] vendor deducted once: {3: (1, -22568)}
  ... (16/16)
SCENARIO_B: 16/16 assertions pass with ONE non-zero vendor
```

Jadi kegagalan R3 murni berasal dari jalur multi-vendor, bukan dari
perhitungan kas, bukan dari ekspektasi tes.

## Dampak

* **Blocker go-live** untuk outlet yang menjual produk ≥2 vendor titipan dalam
  satu shift. Konfigurasi seed saat ini punya 3 vendor, 2 di antaranya
  share ≠ 0 (Mitra Kue Aceh 20 %, Titipan Kopi Gayo 15 %).
* Gejalanya adalah error 500 pada `POST /shifts/{id}/close`, bukan
  ketidakcocokan kas yang senyap — jadi tidak ada uang hilang, tetapi shift
  tidak bisa ditutup dan settlement tertahan.
* Tidak terdeteksi oleh unit test lama karena fake cursor tidak menegakkan
  index unik; hanya PostgreSQL hidup yang menangkapnya.

## Perbaikan yang diterapkan — Opsi A (FIXED)

**Pilihan: Opsi A.** Referensi cash movement menunjuk ke baris settlement,
bukan ke shift. Tidak ada perubahan skema dan tidak ada migrasi: kolom
`vendor_settlements.cash_movement_id` (sudah ada, nullable, UNIQUE) tetap
menjadi pointer dari settlement ke kas, dan `cash_movements.reference_id`
kini menunjuk balik ke settlement tersebut.

### Perubahan kode

`app/services.py::generate_vendor_settlements` — urutan tulis dibalik dan
kunci referensi diganti:

1. `INSERT INTO vendor_settlements (..., cash_movement_id = NULL, status='paid')`
   `ON CONFLICT (shift_id, vendor_id) DO UPDATE ... RETURNING *`
   — baris settlement selalu ada lebih dulu, sehingga punya `id` yang bisa
   dirujuk.
2. `INSERT INTO cash_movements (..., reference_type='vendor_settlement',
   reference_id=<id settlement>)` — hanya bila `vendor_amount != 0` dan
   settlement itu belum punya `cash_movement_id`. Sebelum insert, kode
   memeriksa movement yang sudah ada untuk settlement tersebut.
3. `UPDATE vendor_settlements SET cash_movement_id = <movement id> WHERE id = <id settlement>`
   — pointer diisi terakhir.

Karena `cash_movements_reference_unique` mengunci
`(movement_type, reference_type, reference_id)`, invarian yang sekarang
ditegakkan database adalah **"satu kejadian kas per settlement"** — lebih
kuat daripada "satu per shift" dan tidak lagi bertabrakan antar-vendor.
Constraint dan index **tidak diubah**.

`app/services.py::close_shift` — jalur idempoten:

* `generate_vendor_settlements` mengembalikan `cash_recorded` per baris:
  jumlah yang benar-benar ditulis ke ledger oleh pemanggilan itu (`0` untuk
  vendor yang settlement-nya sudah `paid`/sudah punya movement).
* `vendor_cash_total = vendor_cash_existing + Σ cash_recorded`, sehingga
  percobaan close ulang tidak menghitung payout yang sama dua kali
  (sebelumnya `Σ vendor_amount` dari semua baris, termasuk yang sudah lunas).
* Baris settlement `paid` yang sudah ada di-*reuse* tanpa INSERT settlement
  baru dan tanpa INSERT movement baru → close kedua = no-op untuk vendor.

### Perubahan data/analitik yang ikut diperlukan

`db/schema.sql` — view `v_shift_cash`:

* `cash_in_total`: `sum(-c.amount)` → `sum(c.amount)`
* `cash_out_total`: `sum(c.amount)` → `sum(-c.amount)`

Alasan: `cash_movements` menyimpan `cash_in` sebagai **positif** dan
`cash_out` sebagai **negatif** (lihat `CHECK cash_movements_sign_check`),
sementara `shifts.cash_in_total`/`cash_out_total` menyimpan nilai absolut
positif (`CHECK >= 0`). View lama membalik tanda sehingga `cash_in_total`
tampil `-25000` dan `cash_out_total` tampil `-40000`, tidak cocok dengan baris
`shifts` yang menjadi acuan R3. Ini murni perbaikan tanda baca view; tidak ada
semantik ledger yang berubah.

### Bukti perbaikan

`scripts/run_go_live_regression.sh --no-up` → **ALL 5 PASS** (verbatim):

```
  ID  RESULT  CHECK
  R1  PASS    R1 concurrent payment: exactly one winner, no double ledger/stock
  R2  PASS    R2 outbox/WhatsApp failure: sale commits, receipt queued pending
  R3  PASS    R3 shift reconciliation: exact expected_cash, variance 0, vendor once
  R4  PASS    R4 duplicate webhook same dedupe key: exactly one send
  R5  PASS    R5 grandpos_ai: 4 views readable, orders + CREATE TABLE denied
=========================================================================
RESULT: PASS — all 5 go-live checks executed and passed.
```

Bukti R3 (skenario dua vendor bershare ≠ 0 pada satu shift, PostgreSQL hidup):

```
R3 evidence: shift 1 -> opening 75.000 + cash 76540 + in 25.000 - out 40.000
- vendor 14468 = expected 122072; variance 0;
settlements {1: 0, 2: 14400, 3: 68}; v_shift_cash identical
```

Skenario "close dua kali" — tiga lapis asersi, semuanya lulus:

1. `close_shift` kedua pada shift `closed` → `BusinessRuleError("shift is already closed")`,
   jumlah movement `vendor_settlement` tetap 2.
2. `generate_vendor_settlements` dijalankan ulang pada shift yang sama
   (close terputus) → jumlah movement tetap 2, tidak ada INSERT baru.
3. `tests/test_api_integration.py::...::test_close_reuses_already_paid_settlements_without_duplicate_cash`
   → `expected_cash` tetap 135600 (payout dihitung sekali), nol
   `INSERT INTO cash_movements` dan nol `INSERT INTO vendor_settlements`.

Regresi kunci referensi (fake cursor yang menegakkan index unik):

* `test_two_vendors_on_one_shift_get_distinct_reference_keys` — dua vendor,
  satu shift → dua movement dengan `reference_id` berbeda (id settlement),
  tidak ada tabrakan. **Gagal** bila kunci dikembalikan ke `'shift'`/`shift_id`.
* `test_vendor_settlement_records_cash_exactly_once` — urutan tulis
  settlement → movement → pointer, dan `reference_id` = id settlement.
* `test_already_settled_vendor_is_not_charged_twice` — vendor `paid` tidak
  menghasilkan movement kedua.
* `test_paid_settlement_without_cash_pointer_recovers_its_movement` — baris
  `paid` tanpa pointer (close terputus di antara dua write) tetap dibayar
  **tepat sekali**, tidak dilewati dan tidak diduplikasi.

Suite penuh:

```
195 passed, 5 skipped, 1 warning in 1.48s       # pytest -q
tests 15 | suites 8 | pass 15 | fail 0           # node --test (gateway)
61 passed, 0 failed                              # python3 scripts/check_static.py
```

### Berkas yang berubah

| Berkas | Perubahan |
| --- | --- |
| `app/services.py` | `generate_vendor_settlements` (urutan tulis + kunci referensi + `cash_recorded`), `close_shift` (`vendor_cash_total` dari `cash_recorded`) |
| `db/schema.sql` | tanda `cash_in_total`/`cash_out_total` di view `v_shift_cash` |
| `tests/test_api_integration.py` | `SequenceCursor` (fake yang menegakkan index unik) + 3 tes regresi baru |
| `tests/test_go_live_regression.py` | asersi retry `generate_vendor_settlements` di R3 |
| `docs/FINDING-multi-vendor-settlement.md` | status → FIXED + bukti |

Tidak ada perubahan pada: nominal settlement, matematika bagi hasil
(`vendor_share_amount`, basis pra-diskon, ROUND_HALF_UP), semantik ledger kas,
DDL tabel/index, migrasi, atau konfigurasi deploy.

## Cara mereproduksi (sebelum perbaikan)

```bash
cd /root/grandpos/backend-landing-page
scripts/run_go_live_regression.sh --no-up     # R3 FAIL sebelum fix, ALL PASS sesudahnya
```

Repro minimal tanpa pytest: buka shift, jual 1 produk *Mitra Kue Aceh* dan
1 produk *Titipan Kopi Gayo*, lalu `close_shift(...)` → sebelum fix
`UniqueViolation` pada `cash_movements_reference_unique`.

## Lampiran: opsi yang dipertimbangkan saat investigasi

(Dipertahankan sebagai catatan keputusan; sudah tidak berlaku.)

Beri tiap settlement kunci referensi yang unik per vendor, sehingga index unik
tetap melindungi dari pencatatan ganda tetapi tidak menabrak antar-vendor.
Dua opsi, keduanya kecil dan tidak mengubah semantik kas:

**Opsi A (dipilih & diterapkan) — referensi ke baris settlement, bukan ke shift.**
Karena `vendor_settlements.cash_movement_id` sudah menunjuk ke movement, balik
arahnya: masukkan settlement dulu dengan `cash_movement_id = NULL`, lalu
`UPDATE` movement-nya dengan `reference_type='vendor_settlement'`,
`reference_id=<id settlement>`. Ini membuat "sekali per settlement" menjadi
invarian yang ditegakkan database, lebih kuat daripada "sekali per shift".

**Opsi B (tidak dipakai) — jadikan vendor bagian dari kunci.**
Tambah kolom referensi vendor pada `cash_movements` (perlu migrasi DDL), atau
ubah index menjadi `(movement_type, reference_type, reference_id, reason)`,
atau gunakan `reference_id = shift_id` + `reference_type='vendor:<vendor_id>'`.
Opsi B dengan `reference_type` dinamis tidak perlu migrasi skema sama sekali:

```sql
WHERE reference_type = 'vendor:' || vendor_id
```

Alasan memilih A: tidak menyentuh skema sama sekali, dan `reference_id` yang
menunjuk ke baris settlement membuat jejak audit ledger → settlement eksplisit
(dua arah: `vendor_settlements.cash_movement_id` dan
`cash_movements.reference_id`). Opsi B hanya menyandikan vendor di string
`reference_type`, yang lebih rapuh dan tidak memberi relasi yang bisa di-join.

**Idempoten (wajib, sudah diterapkan):** `close_shift` sekarang hanya
menambahkan `cash_recorded` dari pemanggilan berjalan, sehingga settlement
lama yang sudah `paid` tidak pernah menulis movement baru dan tidak dihitung
dua kali. Diuji lewat skenario "close dua kali" di R3 dan di
`tests/test_api_integration.py`.
