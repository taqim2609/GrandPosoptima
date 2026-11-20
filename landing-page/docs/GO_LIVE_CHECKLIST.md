# GrandPOS — Checklist Go-Live (5 Item Regresi AI Studio)

Checklist pra-go-live dari AI Studio, sekarang **eksekutabel**. Setiap item
adalah satu tes integrasi yang berjalan terhadap **PostgreSQL hidup** (compose
service `db`, PostgreSQL 16) — bukan fake, bukan SQLite. Tidak ada item yang
bisa "lulus" karena tidak butuh database: bila database tidak terjangkau, tes
**skip dengan alasan eksplisit** dan runner mengembalikan exit code `2`
(gate tidak dijalankan ≠ gate lulus).

Berkas:

| Berkas | Peran |
| --- | --- |
| `tests/test_go_live_regression.py` | 5 tes (R1–R5) terhadap PostgreSQL hidup |
| `scripts/run_go_live_regression.sh` | Runner: nyalakan stack, tunggu health, jalankan 5 tes, cetak tabel PASS/FAIL |
| `docs/GO_LIVE_CHECKLIST.md` | Dokumen ini — pemetaan item → test id → bukti |

---

## Cara menjalankan

```bash
cd backend-landing-page

# Standar: nyalakan db bila belum jalan, jalankan 5 tes, cetak tabel
scripts/run_go_live_regression.sh

# Bila stack sudah jalan (tidak perlu compose up)
scripts/run_go_live_regression.sh --no-up

# Pakai nama database uji lain
GRANDPOS_TEST_DB=grandpos_golive_ci scripts/run_go_live_regression.sh
```

Jalankan langsung via pytest (DSN harus menunjuk ke cluster compose):

```bash
GRANDPOS_TEST_DATABASE_URL="postgresql://<user>:<pw>@<host>:5432/<prod_db>" \
  python -m pytest tests/test_go_live_regression.py -v
```

### Exit code runner

| Code | Arti |
| --- | --- |
| `0` | Kelima item dijalankan dan **lulus** |
| `1` | Ada item yang **gagal** |
| `2` | Gate **tidak dijalankan**: stack tidak sehat, atau tes skip (PostgreSQL tidak terjangkau) |

### Keamanan data

* Suite membuat database sekali pakai `GRANDPOS_TEST_DB` (default
  `grandpos_golive_test`) dari DDL repositori itu sendiri:
  `db/schema.sql` → `db/seed.sql` → `db/migrations/0002_optimistic_lock.sql`
  → `db/roles.sql`.
* Database produksi (`POSTGRES_DB`) dan volume `grandpos_pgdata` **tidak
  pernah** di-drop, di-truncate, atau ditulisi.
* Runner **tidak pernah** menjalankan `docker compose down -v`.
* Suite menolak jalan bila `GRANDPOS_TEST_DB` sama dengan `POSTGRES_DB`.
* `GRANDPOS_KEEP_TEST_DB=1` menyimpan database uji untuk forensik.

---

## Item 1 — Pembayaran bersamaan oleh dua kasir

| Field | Nilai |
| --- | --- |
| Test id | `tests/test_go_live_regression.py::test_r1_concurrent_payment_exactly_one_winner` |
| Perintah | `scripts/run_go_live_regression.sh` (atau pytest dengan `-k test_r1_`) |
| Risiko | Double-charge: pelanggan terbayar dua kali, kas dan stok terpotong dobel |

**Yang diverifikasi**

1. Dua kasir (`kasir1`, `kasir2`) membayar order yang sama dari dua koneksi
   paralel (`ThreadPoolExecutor`).
2. Tepat **satu** pembayaran sukses; yang kalah ditolak sebagai konflik
   konkurensi (`order is already paid` atau
   `order changed by another cashier, refresh`).
3. Tepat **satu** baris `payments`, **satu** baris `cash_movements`
   (`sale_cash`), dan **satu** batch `inventory_movements`
   (`sale_consumption`) per ingredient resep.
4. `orders.version` naik **satu** kali (optimistic lock tidak dobel).
5. `expected_version` basi (`999`) ditolak dengan pesan konkurensi dan **tidak
   menulis apa pun** (tidak ada payment, versi tidak berubah).

**Bukti yang dicetak** — nilai rupiah pembayaran yang menang, pesan penolakan
verbatim untuk kasir yang kalah, pesan verbatim guard versi basi, jumlah baris
payment/cash/stock.

---

## Item 2 — Kegagalan outbox/WhatsApp saat pembayaran

| Field | Nilai |
| --- | --- |
| Test id | `tests/test_go_live_regression.py::test_r2_outbox_failure_never_loses_the_sale` |
| Perintah | `scripts/run_go_live_regression.sh` |
| Risiko | Penjualan hilang karena kanal samping (WhatsApp) mati |

**Yang diverifikasi**

1. Kegagalan disuntikkan **di level database**: trigger `BEFORE INSERT` pada
   `outbox_messages` yang `RAISE EXCEPTION`, sehingga jalur SAVEPOINT benar
   benar diuji (bukan exception Python di fake).
2. Pembayaran **tetap commit**: `orders.status = 'paid'`, `paid_total` benar,
   ledger kas benar.
3. Tidak ada baris outbox parsial (enqueue gagal rollback ke savepoint-nya).
4. Setelah kanal sehat, receipt antre `pending` dengan `dedupe_key =
   receipt:<order_id>`.
5. Setelah percobaan kirim gagal (`mark_retry`, 503), baris tetap `pending`,
   `attempts = 1`, `last_error` tercatat, dan **belum due** kembali sebelum
   jendela backoff (1m/5m/15m) lewat.

**Bukti yang dicetak** — id order, nominal yang tetap terbayar, nama dedupe key
receipt yang antre.

---

## Item 3 — Rekonsiliasi shift penuh

| Field | Nilai |
| --- | --- |
| Test id | `tests/test_go_live_regression.py::test_r3_full_shift_reconciliation_exact` |
| Perintah | `scripts/run_go_live_regression.sh` |
| Risiko | Uang kas tidak cocok saat tutup shift; bagi hasil vendor dibayar dobel |

**Yang diverifikasi** (satu shift berisi F&B portion, F&B kiloan, retail
kiloan berbobot, dan retail non-tunai)

1. Matematika `expected_cash` tepat:
   `opening_float + sale_cash + void_reversal + cash_in − cash_out − vendor_cash`.
   Angka nyata dari seed: `75.000 + 76.540 + 25.000 − 40.000 − 14.468 =
   122.072`.
2. `variance = 0` ketika `counted_cash` sama dengan `expected_cash`.
3. Kolom ringkas `shifts` (`cash_sales`, `non_cash_sales`, `cash_in_total`,
   `cash_out_total`, `vendor_cash_total`) persis cocok dengan ledger.
4. Bagi hasil vendor dihitung dari basis **pra-diskon** dengan ROUND_HALF_UP:
   Mitra Kue Aceh 20 % = 14.400, Titipan Kopi Gayo 15 % = 68, Dapur Grand Aceh
   0 % = 0.
5. **Vendor dipotong tepat sekali**: satu baris `cash_movements` per vendor
   non-nol, dan vendor 0 % tidak membuat event kas sama sekali.
6. Tutup shift kedua kali ditolak (`already closed`) dan **tidak** memotong
   vendor lagi.
7. View analitik `v_shift_cash`, `v_daily_turnover`, dan
   `v_weekly_best_sellers` identik dengan baris shift yang ditutup.

**Bukti yang dicetak** — baris rumus `expected_cash` lengkap, variance, dan peta
settlement per vendor.

---

## Item 4 — Webhook duplikat dengan dedupe key sama

| Field | Nilai |
| --- | --- |
| Test id | `tests/test_go_live_regression.py::test_r4_duplicate_webhook_single_send` |
| Perintah | `scripts/run_go_live_regression.sh` |
| Risiko | Pelanggan menerima struk/pesan WhatsApp berkali-kali; gateway kirim ganda |

**Yang diverifikasi**

1. Enqueue pertama membuat satu baris `outbox_messages` (`pending`).
2. Duplikat berikutnya (`ON CONFLICT (dedupe_key) DO NOTHING`) **no-op** —
   tetap satu baris, termasuk ketika dua duplikat dikirim **paralel** dari dua
   koneksi.
3. Setelah pengiriman pertama (`status = 'sent'`), duplikat berikutnya tidak
   membuka ulang baris: state akhir tetap `{sent: 1}`.
4. Worker (`claim_due_messages`) **tidak pernah** mengambil ulang baris yang
   sudah `sent`.

**Bukti yang dicetak** — dedupe key, jumlah enqueue (termasuk 2 duplikat
paralel), dan state akhir.

---

## Item 5 — Role AI `grandpos_ai` hanya boleh baca 4 view

| Field | Nilai |
| --- | --- |
| Test id | `tests/test_go_live_regression.py::test_r5_ai_role_views_only` |
| Perintah | `scripts/run_go_live_regression.sh` |
| Risiko | AI/analis punya jalur tulis atau bisa membaca PII mentah |

**Yang diverifikasi**

1. `has_table_privilege('grandpos_ai', <view>, 'SELECT')` = **true** untuk
   keempat view: `v_daily_turnover`, `v_shift_cash`, `v_low_stock`,
   `v_weekly_best_sellers`.
2. `has_table_privilege('grandpos_ai', 'orders', 'SELECT')` = **false**, dan
   `has_schema_privilege('grandpos_ai', 'public', 'CREATE')` = **false**.
3. `information_schema.role_table_grants` menunjukkan himpunan tabel yang bisa
   dibaca `grandpos_ai` **persis** keempat view itu — tidak lebih.
4. Uji perilaku: sesi `SET ROLE grandpos_ai` berhasil `SELECT count(*)` dari
   keempat view, tetapi `SELECT ... FROM orders` ditolak (`permission denied`)
   dan `CREATE TABLE` ditolak — dan tabel probe terbukti tidak pernah ada.

**Bukti yang dicetak** — pesan error verbatim untuk `SELECT orders` dan
`CREATE TABLE`.

Catatan: `grandpos_ai` dibuat `NOLOGIN` oleh `db/roles.sql` sampai operator
mengisi `GRANDPOS_AI_DB_PASSWORD`. Karena itu tes memakai teknik `SET ROLE`
yang sama dengan smoke flow repositori, dan tidak pernah mengubah kredensial
klaster.

---

## Ringkasan perintah lengkap (bukti go-live)

```bash
cd backend-landing-page

scripts/run_go_live_regression.sh        # 5 item, tabel PASS/FAIL, exit code
python -m pytest -q                       # suite unit + integrasi penuh
node --test "gateway/test/*.test.js"      # batas layanan gateway
python3 scripts/check_static.py           # SQL, compose, env + dua suite di atas
```

Urutan risiko (paling berisiko lebih dulu): **R1 → R2 → R3 → R4 → R5**.

---

## Status eksekusi terakhir (2026-10-17, PostgreSQL 16 hidup)

| ID | Hasil | Catatan |
| --- | --- | --- |
| R1 | **PASS** | 1 payment / 1 cash_movement / 1 batch stok; kasir kalah ditolak; versi basi ditolak tanpa efek |
| R2 | **PASS** | Trigger `BEFORE INSERT` pada `outbox_messages` menyala; pembayaran tetap commit; receipt antre `pending` |
| R3 | **PASS** | Sebelumnya **FAIL** (bug multi-vendor). Sudah diperbaiki lewat Opsi A: cash movement menunjuk ke baris settlement (`reference_type='vendor_settlement'`), bukan ke shift. `expected_cash` 122072, variance 0, dua vendor ditagih tepat sekali. Lihat `docs/FINDING-multi-vendor-settlement.md` |
| R4 | **PASS** | 4x enqueue (termasuk 2 duplikat paralel) → tepat 1 baris, 1 kali kirim |
| R5 | **PASS** | 4 view terbaca; `orders` dan `CREATE TABLE` ditolak `permission denied` |

Runner mengembalikan **exit code 0** — kelima item gate go-live lulus
(`RESULT: PASS — all 5 go-live checks executed and passed.`). Tes R3 tidak
dilemahkan: perbaikan dilakukan di `app/services.py` (kunci referensi + jalur
idempoten), dan R3 mendapat asersi tambahan untuk skenario close-ulang.
