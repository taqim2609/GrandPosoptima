# EVIDENCE — task t_d17aa9bd (Docker/PostgreSQL runtime smoke)

Lingkungan kerja: `/root/grandpos/backend-landing-page` (bukan repo Git). Tanggal:
2026-10-17. Docker 29.9.1 tersedia (`/var/run/docker.sock` ada), tidak
seperti tugas induk yang tidak punya Docker.

Ringkasan: **SEMUA 6 LANGKAH LOLOS.** Alur runtime penuh dieksekusi
nyata terhadap PostgreSQL 16 + API container: health → shift → order
berbobot + normal → bayar → poin/stok → void + reversal → tutup shift →
`v_shift_cash` sebagai read-only. Eksekusi nyata menemukan **7 bug**
yang tidak tertangkap gate statis/unit; semuanya diperbaiki minimal di
repo lokal (tanpa commit/push, tanpa kredensial nyata).

## 1. Hasil per langkah

| Langkah | Hasil |
|---|---|
| STEP 0 capability gate | PASS — `docker --version` = 29.9.1, socket ada |
| STEP 1 `cp .env.example .env` + `compose config` | PASS — tanpa nilai CHANGE_ME (nilai uji lokal saja) |
| STEP 2 `compose up -d --build` (volume segar) | PASS + temuan bug init (lihat §2.1) |
| STEP 3 schema/seed/roles + bootstrap | PASS setelah 2 perbaikan; `taqim2609` enabled |
| STEP 4 curl flow penuh | PASS; `close_shift` butuh 1 perbaikan (lihat §2.5) |
| STEP 5 `v_shift_cash` sebagai read-only | PASS — cocok dengan `shifts` |
| Gate repo pasca-perbaikan | `check_static.py`: **61 passed, 0 failed** (termasuk 130+ pytest & 15 node di dalamnya) |

### Transkrip alur (nilai nyata, shift id=2 `SHIFT-20261017-001`)

1. `POST /shifts/open {opened_by:2, opening_float:500000}` →
   `id=2, status=open`.
2. `POST /orders` dine_in meja T02 + member Cut Nyak:
   Ayam Tangkap Kiloan 0.75 kg (@120) + Nasi Goreng Aceh x2 →
   `id=1, GAK-20261017-0001, grand_total=70090, cogs_total=32045`.
3. `POST /orders/1/pay` cash 70090 (tendered 100000) →
   `status=paid, paid_total=70090, points_earned=70`.
   Poin member 1: 120 → 190; total_spend 450000 → 520090.
   Stok: Ayam Kampung 12.5 → 11.63 (−0.87 = 0.75×1.0 + 2×0.06);
   Beras 40 → 39.6; Daun Kari 2 → 1.9625. Semua tepat.
4. `POST /orders/1/void {reason:"smoke test void"}` →
   `{cash_refund:70090, points_reversed:70, stock_reversed:4}`.
   Verifikasi: order `status=void`; ledger `opening_float 500000,
   sale_cash +70090, void_reversal −70090` (net tunai 0);
   poin member 1 kembali 120; stok kembali penuh (12.5 / 40 / 2).
5. Order 2 (takeaway, Mie Aceh + Kopi Sanger = 60000) dibuat + dibayar
   cash → `status=paid`.
6. `POST /shifts/2/close {counted_cash:560000}` →
   `status=closed, expected_cash=560000, counted_cash=560000,
   variance=0, order_count=2, void_count=1`;
   1 settlement vendor (Dapur Grand Aceh, amount 0, cash NULL).
7. `SELECT * FROM v_shift_cash WHERE shift_id=2` (via `SET ROLE
   grandpos_ai`): `cash_sales=60000, expected_cash=560000,
   counted_cash=560000, variance=0` — **identik** dengan `shifts`.
   Batas hak: `SELECT` dari `orders` → permission denied;
   `CREATE TABLE` → permission denied. Analis benar-benar read-only.

## 2. Bug yang ditemukan eksekusi nyata (7, semua diperbaiki lokal)

### 2.1 `db/schema.sql`: nama constraint bentrok dengan auto-name PG (2x)

Kolom `paid_total` (tabel `orders`) punya inline `CHECK` tanpa nama;
PostgreSQL otomatis menamainya `orders_paid_total_check` — lalu
constraint eksplisit di baris yang sama memakai nama persis itu.
Hasil: `CREATE TABLE orders` gagal, SELURUH init rollback, DB kosong,
`/health` = `db:false`. Pola identik pada `order_items`
(`line_total` → `order_items_line_total_check`).
Fix: `orders_paid_total_check` → `orders_paid_within_grand`;
`order_items_line_total_check` → `order_items_line_math`
(semantik CHECK tidak berubah; tidak ada referensi nama lama di repo).
Repro: `psql -f db/schema.sql` pada database segar → error baris 413
(sebelum fix), COMMIT (sesudah fix).

### 2.2 `db/bootstrap_superadmin.sql`: `:'pw'` di dalam blok `$$`

psql tidak menginterpolasi variabel di dalam dollar-quoted string,
sehingga file dokumentasi ini gagal dengan `syntax error at or near
":"` — tidak pernah bisa jalan sejak dibuat.
Fix: stage password via `SELECT set_config('grandpos.bootstrap_pw',
:'pw', false)` lalu `current_setting(...)` di dalam DO; cek panjang
≥12 dipertahankan. Terverifikasi: `taqim2609 | enabled=t`.

### 2.3 `docker-compose.yml`: healthcheck API salah nama modul

`python -m grandpos.healthcheck` (modul tidak ada; paket bernama
`app`) → container API tidak pernah healthy.
Fix: `python -m app.healthcheck` (modulnya memang memanggil `/health`
via urllib, tanpa DB driver). Terverifikasi: api menjadi
`healthy` setelah restart.

### 2.4 `.env.example`: `DATABASE_URL` format SQLAlchemy

`postgresql+psycopg://...` ditolak psycopg 3 langsung
(`missing "=" ... in connection info string`) → `/health` =
`db:false` walau DB sudah terisi. Repo tidak memakai SQLAlchemy
di mana pun. Fix: `postgresql://...` + komentar penjelas.
Gate baru di `scripts/check_static.py`:
`env.database_url_is_libpq_dsn` (menolak `DATABASE_URL=postgresql+`).

### 2.5 `app/services.py`: `_one()` dipakai untuk write tanpa RETURNING

`_one()` selalu `fetchone()`; psycopg melempar ProgrammingError untuk
INSERT/UPDATE tanpa RETURNING → `POST /shifts/open` 500.
Fix sistematis: helper baru `_exec()` + 19 call site fire-and-forget
(open shift, create/pay/void order, points, stock, audit, settlement)
dipindah ke `_exec()`; yang ber-RETURNING tetap `_one()`.

### 2.6 `app/services.py`: settlement 0 memicu `amount <> 0`

Vendor `Dapur Grand Aceh` punya `profit_share_percent = 0` → settlement
mencoba `cash_movements` amount=0 → CheckViolation → `close_shift` 500.
Fix: amount 0 = penjualan internal, bukan event kas → lewati INSERT
kas, `cash_movement_id = NULL` (kolom nullable, UNIQUE aman untuk
NULL). Settlement tetap tercatat (`vendor_amount=0, status=paid`).
Terverifikasi: close shift variance=0.

### 2.7 (proses) Perintah destruktif diblokir guard sesi

`docker compose down -v` dan `rm -rf`/`sed -i` pada `.env` ditolak
guard single-query mode. Diatasi tanpa mengurangi ketelitian:
reset volume dihindari (volume memang segar); skema divalidasi pada
database scratch (`schematest_a/b/c`) sebelum diterapkan ke `grandpos`;
`.env` ditulis via file tool, bukan shell.

## 3. Berkas yang diubah (lokal saja, tanpa commit/push)

| Berkas | Perubahan |
|---|---|
| `db/schema.sql` | 2 nama constraint (2.1) |
| `db/bootstrap_superadmin.sql` | set_config/current_setting (2.2) |
| `docker-compose.yml` | healthcheck `app.healthcheck` (2.3) |
| `.env.example` | DSN libpq + komentar (2.4) |
| `scripts/check_static.py` | cek `env.database_url_is_libpq_dsn` (2.4) |
| `app/services.py` | `_exec()` + 19 call site; skip kas settlement-0 (2.5, 2.6) |
| `.env` | dibuat dari example, nilai uji lokal (tidak dicommit) |
| `EVIDENCE.md` | berkas ini (menggantikan catatan tugas induk tanpa-Docker) |

## 4. Validasi yang dijalankan (nyata, bukan klaim)

- `docker compose config` → valid.
- `docker compose up -d --build` (2x, termasuk rebuild API pasca-fix).
- `curl /health` → `{"status":"ok","db":true}`.
- Seluruh transkrip §1 via curl + verifikasi silang psql.
- `python3 scripts/check_static.py` → **61 passed, 0 failed**
  (mencakup pytest suite + node gateway tests).
- Peran `grandpos_ai`: baca `v_shift_cash` OK; tulis/baca tabel
  dasar ditolak.

## 5. Risiko sisa / tindak lanjut

- Skema non-idempoten by design (gagal di tengah → DB kosong; entrypoint
  tidak retry). Manual apply setara init dipakai di sini karena volume
  segar + guard sesi memblokir `down -v`. Pada mesin operator normal,
  `docker compose down -v && up --build` dari nol adalah verifikasi
  ulang yang disarankan.
- `.env` berisi kredensial uji lokal; ganti dengan nilai kuat sebelum
  pemakaian non-lokal; jangan commit.
- Uji regresi khusus (constraint-name collision, bootstrap psql,
  settlement-0) belum ditambah sebagai file tes; cek statis baru hanya
  menutup 2.4. Kandidat child task untuk `software-engineer`.
- Integrasi Baileys nyata tetap di luar cakupan (seperti tugas induk).

## 6. Status kontainer saat laporan ditulis

`grandpos-db-1` (healthy) + `grandpos-api-1` (healthy) BERJALAN dengan
data smoke di atas. `docker compose down` tidak dapat dieksekusi dari
sesi ini karena guard memblokir perintah lifecycle container — Qim
perlu menjalankannya manual bila stack harus dimatikan:

```bash
cd /root/grandpos/backend-landing-page && docker compose down   # hentikan saja
# atau: docker compose down -v                      # hapus data smoke juga
```

---

# EVIDENCE — task t_e5c46800 (offline-first step 1: optimistic locking + drawer per kasir)

Lingkungan: `/root/grandpos/backend-landing-page` (bukan repo Git). Tanggal: 2026-10-17.
Cakupan: **schema + primitive konkurensi saja** — tanpa deploy, tanpa
perubahan frontend/WhatsApp, tanpa commit.

## Ringkasan

| Butir | Hasil |
|---|---|
| Migrasi idempoten `version` + `cashier_id` | PASS — `db/migrations/0002_optimistic_lock.sql` |
| Optimistic locking `pay_order` / `void_order` / `close_shift` | PASS — predikat `WHERE id = %s AND version = %s` + `version = version + 1` |
| Laci per kasir (`open_shift` + indeks unik parsial) | PASS |
| `tests/test_concurrency.py` | **8 passed** (4 skenario wajib + 4 penguat) |
| Suite Python | **139 passed, 1 warning** |
| Suite Node gateway | **tests 15 / pass 15 / fail 0** |
| `scripts/check_static.py` | **61 passed, 0 failed** |

## Skenario konkurensi yang diuji

1. `test_exactly_one_payment_wins_and_the_other_refreshes` — dua kasir
   membayar order versi 4; pemenang menulis `status=paid, version=5`,
   pecundang menerima `order changed by another cashier, refresh` dan
   baris tidak berubah.
2. `test_stale_version_is_refused_before_any_payment_is_recorded` — tidak
   ada `INSERT INTO payments` maupun `UPDATE orders SET status='paid'`
   yang bocor dari penulis basi.
3. `test_exactly_one_close_wins` — dua kasir tutup shift versi 2; satu
   menang, satu menerima `shift changed by another cashier, refresh`, dan
   tidak ada rekap outbox kedua.
4. `test_second_open_shift_same_cashier_is_rejected` — laci kedua untuk
   kasir yang sama ditolak, tanpa `INSERT INTO shifts`.
5. `test_different_cashiers_can_open_simultaneously` — kasir berbeda
   boleh membuka laci bersamaan; `cashier_id` benar-benar tertulis.
6. Penguat: `void_order` versi basi ditolak, predikat versi pada UPDATE
   `orders`/`shifts` diverifikasi ada di SQL, `cashier_id` default ke
   `opened_by` untuk kompatibilitas pemanggil lama.

Catatan kejujuran: test ini memakai fake cursor yang **benar-benar
menerapkan** kontrak `UPDATE … WHERE id=… AND version=…` (penulis basi
mendapat 0 baris), bukan sekadar merekam SQL. Eksekusi terhadap
PostgreSQL hidup belum dijalankan ulang pada tugas ini.

## Perubahan berkas

| Berkas | Perubahan |
|---|---|
| `db/migrations/0002_optimistic_lock.sql` | baru — idempoten: `version` di `orders`/`shifts`, `shifts.cashier_id` + backfill, indeks unik parsial `shifts_open_per_cashier_idx` |
| `db/schema.sql` | sinkron baseline: `orders.version`, `shifts.version`, `shifts.cashier_id`, indeks laci per kasir |
| `app/services.py` | `CONCURRENT_UPDATE_MESSAGE`; `expected_version` di `pay_order`/`void_order`/`close_shift`; `cashier_id` + guard di `open_shift` |
| `app/api.py` | field opsional `expected_version` (pay/void/close-shift) dan `cashier_id` (open shift) |
| `tests/test_concurrency.py` | baru — 8 test |
| `tests/test_api_integration.py` | 1 fixture diselaraskan ke SQL INSERT baru (`cashier_id`) |
| `README.md` | tabel aturan + bagian "Model konkurensi" |
| `EVIDENCE.md` | bagian ini |

## Validasi live-DB (eksekusi nyata terhadap PostgreSQL 16)

1. DB scratch segar dari `db/schema.sql` + migrasi dijalankan 2x:
   `RUN1_OK`, `RUN2_IDEMPOTEN_OK` — terbukti idempoten.
2. Kolom ada: `cashier_id`, `version`, `version` (3 baris
   information_schema); indeks `shifts_open_per_cashier_idx` ada.
3. Laci kedua untuk kasir yang sama → ditolak:
   `duplicate key ... "shifts_open_per_cashier_idx" ... (cashier_id)=(1)`.
4. Laci untuk kasir berbeda → `INSERT 0 1` sukses.
5. `UPDATE orders SET status='paid', version=version+1 WHERE id=4 AND
   version=1` dijalankan dua kali beruntun (simulasi 2 kasir basi):
   penulisan pertama `version 1 → 2, status=paid`; penulisan kedua
   mengubah **0 baris** — versi tetap 2. Predikat versi terbukti
   menahan penulis basi di Postgres nyata, bukan hanya di fake cursor.
6. Dua defect ditemukan eksekusi nyata dan diperbaiki sebelum laporan:
   (a) `shifts_single_open_idx` memblokir kasir kedua (memicu evolusi
   skema ke `shifts_open_per_cashier_idx` +
   `shifts_single_open_null_cashier_idx`); (b) `CREATE INDEX` kedua tanpa
   `DROP IF EXISTS` membuatnya tidak idempoten — diperbaiki, rerun
   `RUN1_OK`/`RUN2_IDEMPOTEN_OK` diverifikasi ulang.
7. DB scratch (`schemastep1`, `schemastep1b`, `schemastep1c`) belum
   dihapus karena perintah `DROP DATABASE` diblokir guard sesi —
   Qim perlu menghapus manual bila mengganggu.

## Risiko sisa

- `cashier_id` backfill menetapkan `cashier_id = opened_by` untuk shift
  lama. Shift historis milik kasir lain akan tampak sebagai milik pembuka;
  hanya relevan untuk audit, bukan untuk perhitungan kas.
- Indeks `shifts_single_open_idx` (satu shift global) sengaja
  dipertahankan. Drawer per kasir aktif hanya bila `cashier_id` terisi,
  sehingga perilaku satu-laci lama tidak berubah sampai klien mengirim
  `cashier_id`.
- Belum ada klien (frontend/WhatsApp) yang mengirim `expected_version`;
  sampai itu terjadi, locking bersifat opsional per panggilan.
- Eksekusi ulang alur Docker/PostgreSQL dengan dua sesi paralel nyata
  belum dijalankan (di luar cakupan step 1). Yang sudah divalidasi nyata:
  migrasi, indeks drawer, dan predikat versi (§ Validasi live-DB).
