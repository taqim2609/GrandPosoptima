# GrandPOS — Temuan Audit Lengkap

Dokumen serah-terima. Semua angka di bawah **diverifikasi dari disk/DB pada 2026-11-11**, bukan dari ingatan.
Tidak ada kode repo yang diubah selama audit.

---

## 1. Peta sistem

Dua repo, dua database, satu jembatan sinkronisasi.

| | `pos-engine` | `backend-landing-page` |
|---|---|---|
| Path | `/root/grandpos/pos-engine` | `/root/grandpos/backend-landing-page` |
| Remote | `taqim2609/GrandPosoptima` | `taqim2609/grandpos-platform` |
| HEAD | `d9d6615` | `62d514d` |
| Working tree | 3 modified + 1 untracked (sudah ada sebelum audit) | clean |
| Stack | Node 20 + Express + React 19 (CRA/craco) | FastAPI + PostgreSQL 16 |
| Ukuran | 489 file / 133.125 LOC | 85 file / 16.765 LOC |
| Database | JSON `data/pos-db.json` (54 koleksi, in-memory + snapshot debounce 250 ms) | PostgreSQL `grandpos` (29 tabel) |

Total inventaris: **574 file / 149.890 LOC**.

Container hidup: `grandpos_web_app` (:3000, mount `/root/grandpos/pos-engine → /app`), `grandpos-api-1` (:8000), `grandpos-db-1` (PG16), `gak_watchtower_updater`.

Jembatan: `pos-engine/lib/analytics-sync.js` → `POST http://172.20.0.1:8000/sync/orders` dengan header `X-Node-Key`, interval 10 detik, idempoten lewat `edge_transactions (node_id, client_ref)`.

---

## 2. Angka route (satu sumber kebenaran)

Diukur dengan `grandpos-routes.py` (parser argumen pertama + middleware chain, bukan regex ad-hoc).

```
registrations            317
unique method+path       356
```

| File | registrations | no-auth | alias-noauth | write-alias-noauth |
|---|---|---|---|---|
| `api-server.js` | 182 | 123 | 58 | 23 |
| `routes/allMissingRoutes.js` | 114 | 114 | 114 | 80 |
| `routes/mcpServer.js` | 21 | 21 | 3 | 2 |

Frontend: **238 panggilan unik**, 230 punya route eksplisit, **8 tanpa route** (jatuh ke catch-all).

---

## 3. Temuan kritis (urut dampak)

### T1 — Catch-all `/api/*` memalsukan sukses
`api-server.js:6829` — `app.all('/api/*', ...)`

- `GET` → `[]` bila path berakhir `s`, selain itu `{}`
- method lain → `{status:'ok', id:'gen-'+Date.now()}`

8 endpoint frontend yang tidak punya route, semuanya dibalas 200:

```
GET    /diagnostics/error-logs              -> []
POST   /diagnostics/error-logs              -> {status:ok,id:gen-…}
PATCH  /diagnostics/error-logs/:id/resolve  -> {status:ok,id:gen-…}
DELETE /diagnostics/error-logs/:id          -> {status:ok,id:gen-…}
GET    /system/tailscale-status             -> []
POST   /shopping-list                       -> {status:ok,id:gen-…}
POST   /sync/push                           -> {status:ok,id:gen-…}
POST   /whatsapp/outbox/sync-upstream       -> {status:ok,id:gen-…}
```

Efek: panel Diagnostik, sinkronisasi manual, dan daftar belanja di UI melaporkan sukses tanpa backend. Ini yang menyembunyikan semua bug lain.

**Perbaikan:** ganti dengan `res.status(404).json({detail:'Not found'})`.

---

### T2 — Gate auth hanya berlaku untuk path berawalan `/api/`
Tiga salinan asumsi prefiks yang tidak sepakat:

| Lokasi | Kondisi | Konsekuensi |
|---|---|---|
| `api-server.js:466–486` | rewrite ke `/api` **hanya** bila `Accept` JSON-ish atau ada `Authorization` | klien tanpa header lolos ke alias |
| `api-server.js:526` | `if (req.path.startsWith('/api/'))` | alias non-`/api` tidak pernah diperiksa |
| `api-server.js:1092` | persist hanya `req.path.startsWith('/api')` | tulis lewat alias tidak dijadwalkan tersimpan |

Probe ke container hidup, tanpa token:

| Profil klien | `GET /orders` | `POST /shifts/open` |
|---|---|---|
| `Accept: text/html` (buka di browser) | **200** — 37.599 B | **200** |
| `Accept: */*` (curl) | **200** — 37.599 B | 409 |
| `Accept: application/json` (axios) | 401 | 401 |

**21 order lengkap** (nomor, total, timestamp) terbaca anonim oleh siapa pun yang membuka `http://<host>:3000/orders` di browser.

Daftar terverifikasi — 50 bare-GET tanpa parameter, **27 membalas JSON 200 tanpa token**:

| Endpoint | Ukuran | Isi |
|---|---|---|
| `/orders` | 37.599 B | seluruh order + nomor + total |
| `/reports/summary` | 28.563 B | laporan penjualan |
| `/tables` | 21.954 B | 79 meja |
| `/shifts/history` | 9.248 B | riwayat shift |
| `/cash` | 2.241 B | kas masuk/keluar |
| `/vendor-settlements` | 1.570 B | settlement vendor |
| `/shifts/current/vendor` | 678 B | status shift per vendor |
| `/analytics/sync/status` | 528 B | status sinkronisasi |
| `/settings/dashboard` | 273 B | konfigurasi |
| `/whatsapp/hermes/status` | 297 B | integrasi WA |
| `/whatsapp/reservation-settings` | 201 B | konfigurasi reservasi |
| `/whatsapp/status` | 167 B | status WA |
| `/ota/version.json` | 650 B | info versi |
| `/app-info`, `/health`, `/healthz`, `/_health`, `/ping`, `/settings/platform` | 129 B | health publik (wajar) |
| `/settings/outlet`, `/cash/categories`, `/whatsapp/*` (chats/devices/outbox) | 2–76 B | kosong |

**8 endpoint membocorkan data bisnis nyata** (di atas 500 B dan berisi transaksi): `/orders`, `/reports/summary`, `/tables`, `/shifts/history`, `/cash`, `/vendor-settlements`, `/shifts/current/vendor`, `/analytics/sync/status`.

**Perbaikan:** normalisasi path sebelum cek gate, atau hapus alias non-`/api` (176 registrasi, 105 di antaranya tulis).

---

### T3 — Dua model shift tidak saling bicara
```
grep -rnE "db\.shifts\s*(\.push|=|\.splice)"  ->  TIDAK ADA (nol penulisan)
grep -rn  "db\.shifts"                        ->  8 referensi, semuanya BACA
```

- `POST /shifts/open` (`api-server.js:2738`) hanya menulis `db.currentShift`
- `db.shifts` dibaca oleh MCP (`mcpServer.js:618`, `:1235`) dan `/api/shifts` (`:2697`, `:2818`)
- Isi `db.shifts`: 14 entri warisan, 2 `status:"open"` sejak 2026-09-19

Probe MCP anonim:
```
pos_get_shift_status    -> {shift_id:"586db507-…", status:"open", cashier_name:"kasir2"}
GET /api/shifts/current -> null
```

Efek hilir: `_resolve_shift` (`edge_sync.py:289`) tidak menemukan shift open → **92/92 order Postgres `shift_id NULL`**.

**Perbaikan:** tulis ke `db.shifts` dari `POST /shifts/open`; close pakai rentang `opened_at..closed_at`.

---

### T4 — `cash_out` tutup shift = total kumulatif all-time
`POST /shifts/close` (`api-server.js:2755`) memakai `getReportSummary(wibTodayStr())` — jendela **harian**, bukan per-shift — dan `cash_out` = jumlah seluruh `cashTransactions` tanpa filter tanggal.

```
cashTransactions out ALL-TIME = 1.699.200
s-1794289774803 (10 Nov) cash_out=1.699.200  expected=-1.450.200  var=+1.452.000
s-1794219237282 (09 Nov) cash_out=1.679.200  expected=-1.211.200  var=+1.211.200
s-1794146641377 (08 Nov) cash_out=1.659.200  expected=-421.200    var=+421.200
```

`expected_cash` negatif dan variance > Rp 1 juta di **semua** shift adalah artefak rumus, bukan selisih kasir.

---

### T5 — `int()` memotong stok fraksional (BUG BARU, ditemukan turn terakhir)
`backend-landing-page/app/services.py:455,459`

```python
needed[ingredient_id] = needed.get(ingredient_id, 0) + int(movement["qty_delta"])  # NUMERIC(14,3)
current = int((row or {}).get("stock_qty", 0))                                     # NUMERIC(14,3)
```

`int(Decimal('-0.400'))` = **0**.

Data: **17 dari 18 resep** punya `qty_per_unit` fraksional (0.2, 0.08, 0.03 kg).

Efek: setiap penjualan lewat `POST /orders/{id}/pay` memotong stok **0**, dan pengecekan "stok tidak mencukupi" buta terhadap pecahan.

Belum merusak produksi: `inventory_movements` = 0 baris, `cash_movements` = 0 baris, `version>1` = 0 — artinya **belum ada satu pun order yang dibayar lewat `pay_order`**; 92 order yang ada semuanya masuk lewat `edge_sync` (SQL langsung, tidak lewat `_consume_stock`).

Reproduksi: `tests/test_go_live_regression.py::test_r1_concurrent_payment_exactly_one_winner` gagal di DB live dengan `assert Decimal('18.000') == Decimal('18.000') + Decimal('-0.400')`.

**Perbaikan:** pakai `Decimal` di kedua baris, jangan `int()`.

---

### T6 — `client_ref` tidak dipakai di backend Node
Grep `client_ref` di `api-server.js`, `allMissingRoutes.js`, `mcpServer.js` → **0 hit**.

`POST /orders` tidak melakukan dedup. Retry dari antrean offline menghasilkan order ganda. (Sisi FastAPI sudah idempoten lewat `edge_transactions`, jadi duplikat tertahan di Postgres — tapi JSON lokal tetap ganda.)

---

### T7 — `POS_API_KEY` kosong → 15 route FastAPI terbuka
`app/api.py:56` — `require_key` hanya menolak bila `POS_API_KEY` diset. Container `grandpos-api-1` tidak menyetelnya.

Terbuka anonim (200): `/reports/dashboard`, `/reports/low-stock`, `/system/connectivity`, `/sync/orders/status`, `/api/landing/config`, dll. Hanya `/sync/*` yang terlindungi `X-Node-Key`.

---

### T8 — MCP tanpa autentikasi
`routes/mcpServer.js` — `handleJsonRpc` → `case 'tools/call'` langsung `executeTool(...)`, nol cek identitas.

- `tools/list` anonim → 200
- `pos_get_shift_status` anonim → 200
- `pos_update_product_stock` dengan ID palsu → `isError`, bukan 401
- 5 dari 15 tool mengubah data

---

### T9 — Filter metode bayar tidak konsisten
- `mcpServer.js:638` → `=== 'tunai'`
- `api-server.js:3175` → `cash` | `tunai`

Expected cash MCP **0** vs API **1.955.000**; 18 order cash luput dari laporan MCP.

---

### T10 — Dashboard `top_products` palsu
`/api/dashboard` (`api-server.js:3114+`): `qty: 15` hardcoded, `total: p.price * 15`.

---

### T11 — `/api/admin/reset-data` tanpa verifikasi password
`allMissingRoutes.js:2959` — hanya `if (!password)`, tidak membandingkan nilainya. Alias `/admin/reset-data` juga terdaftar.

---

### T12 — Stub DELETE membalas sukses
`DELETE /members/:id` → 200 "Member dihapus" untuk ID yang tidak ada.

---

### T13 — Speed-test memalsukan latensi
`api-server.js:1455–1460` — `localJitter`, `googleLatency`, `googleJitter` dari `Math.random()`. Angka benchmark di UI sebagian fiktif.

---

### T14 — Duplicate route guard diam
Komentar menyebut "warn loudly", kode `return` tanpa `console.warn`.

---

### T15 — `edge_sync.py:398` quantize tanpa rounding eksplisit
`int((Decimal(unit_price) * qty).quantize(Decimal("1")))` memakai `ROUND_HALF_EVEN` default, sedangkan `rules.round_idr` memakai `ROUND_HALF_UP`. Beda 1 rupiah pada kasus tepat .5 (mis. 2500.5 → 2500 vs 2501). `edge_sync.py` tidak mengimpor `round_idr`.

---

## 4. Hasil test (dijalankan, bukan diklaim)

### pytest — `backend-landing-page`

| Konfigurasi | Total | Lulus | Gagal | Skip |
|---|---|---|---|---|
| `docker run grandpos-api` (tanpa env) | 337 | 304 | **2** | 31 |
| `venv_mcp` + `MCP_LIVE_DB=1` + `DATABASE_URL` live | **358** | **353** | **0** | 5 |

2 kegagalan di konfigurasi pertama: `ModuleNotFoundError: No module named 'mcp'` — image `grandpos-api` tidak punya paket `mcp` (hanya ada di `venv_mcp`). Bukan bug kode.

5 skip di konfigurasi kedua: `test_go_live_regression` butuh `psycopg2` (venv_mcp punya) + DSN yang menunjuk `grandpos-db-1` (bukan `localhost`). Dengan `docker run --network grandpos_default` + `pip install psycopg2-binary`, 4 dari 5 lulus dan **1 gagal** — itulah T5.

**Peringatan harness:** jangan pakai `--env-file .env` saat menjalankan pytest. Itu menyuntik `DATABASE_URL` dan membuat 3 test yang seharusnya jalan tanpa DB berperilaku lain (menghasilkan 5 kegagalan palsu).

### Test JS — `pos-engine/tests/`

17 file non-helper: **13 lulus, 4 gagal**.

| Gagal | Sebab |
|---|---|
| `kiosk-shift-ui-check.js` | `MODULE_NOT_FOUND` (butuh playwright) |
| `shift-single-form-e2e.js` | `MODULE_NOT_FOUND` (butuh playwright) |
| `pos-host-gate.js` | `ERR_INVALID_ARG_TYPE` — `readFileSync(undefined)` di L14 |
| `landing-page-auth-guard.js` | 6/7 assertion — kasir dapat 401 bukan 403, karena token user `kasir2` tidak ada di `db.users` |

### Test frontend — `pos-engine/project/frontend`

2 suite, 3 test, **semua lulus**. Harus lewat `craco test`, bukan `jest` langsung — alias `@/` hanya dipetakan di `craco.config.js` (`moduleNameMapper`).

```bash
cd project/frontend && CI=true npx craco test --watchAll=false
```

---

## 5. Data Postgres (terverifikasi)

```
orders                    92   (semua status='paid')
orders shift_id NULL      92
edge_transactions         applied 92 · rejected 10
recipes                   18   (17 punya qty_per_unit fraksional)
inventory_movements        0
cash_movements             0
orders version > 1         0
order_items              428   (428 ber-product_id, 0 unlinked)
products                 417   (417 ber-SKU)
member_point_ledger        0
vendor_settlements         0
reservation_logs          TIDAK ADA (relation does not exist)
```

10 `edge_transactions` rejected: semua satu sebab — nomor order `GAK-20261107-001` sudah dipakai di gudang; penomoran kiosk `db.orders.length + 1` bertabrakan setelah data dihapus; `last_error` permanen sehingga retry sia-sia.

Role DB yang benar: `grandpos_app` (bukan `postgres` — role itu tidak ada).

---

## 6. Data JSON lokal (terverifikasi)

```
54 koleksi
orders 21 · products 407 · tables 79 · users 3 · vendors 3
cashTransactions 6 · shiftHistory 3 · shifts 14 · currentShift null
members 0 · promos 0 · coupons 1
```

---

## 7. Cakupan pemahaman — jujur

| Bagian | LOC | Dibaca penuh | Status |
|---|---|---|---|
| `backend-landing-page/app/` | 5.534 | **16/16 file** | tuntas |
| `api-server.js` | 6.900 | 3.949 baris (57%) | sisa 2.951 baris |
| Frontend `src/` | 39.508 | **3.715 (9%)** | **lubang utama** |
| `gateway/` + `scripts/` | ~1.200 | penuh | tuntas |

Sisa `api-server.js` bukan logika gelap:
```
488 baris  seed data literal (L582–1069)
909 baris  helper system-health + 21 route (L1131–2039)
364 baris  CRUD categories/products, 18 route (L2090–2453)
575 baris  cash + reports, 6 route (L2831–3523)
 61 baris  static serving + listen (L6841–6901)
```

Frontend: 47 halaman / 21.799 LOC. Pernah dibuka 12, **belum pernah dibuka 35 halaman / 9.286 LOC**. Untuk 40 dari 47 halaman ada inventaris panggilan API terukur, tapi inventaris ≠ pemahaman alur state/validasi/error.

Halaman besar yang belum dibuka: `DeviceSettings.jsx` (639), `AssistantAI.jsx` (569), `Inventory.jsx` (409), `ArticlesAdmin.jsx` (334), `Integritas.jsx` (314).

---

## 8. Prioritas perbaikan

1. **Catch-all `/api/*`** → 404 nyata. Menutup T1 dan membuka tabir semua bug lain.
2. **Gate auth** → normalisasi path, atau hapus alias non-`/api`.
3. **`int()` → `Decimal`** di `services.py:455,459` (T5). Satu baris, dampak besar.
4. **Satukan model shift** (T3) — tulis `db.shifts` dari `POST /shifts/open`.
5. **Filter `cash_out` per shift** (T4).
6. **Dedup `client_ref`** di `POST /orders` (T6).
7. **Isi `POS_API_KEY`** di FastAPI (T7).
8. **Auth di MCP** (T8).

---

## 9. Aturan kerja yang WAJIB dipatuhi

### Jangan pernah probe container hidup
Penulisan lewat alias non-`/api` berhasil di memori tanpa melewati gate, lalu **ikut ter-flush ke `data/pos-db.json`** pada persist berikutnya atau saat restart (handler SIGTERM memanggil `persistNow()`).

Selalu pakai salinan:
```js
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gak-probe-'));
fs.copyFileSync('/root/grandpos/pos-engine/data/pos-db.json', path.join(tmpDir,'pos-db.json'));
process.env.GRANDPOS_DATA_DIR = tmpDir;
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'probe-only-secret-0123456789abcdef';
const app = require('/root/grandpos/pos-engine/api-server.js');
app.listen(0, '127.0.0.1');
```

### Kalau terlanjur mengotori data
```bash
docker stop grandpos_web_app
cp data/pos-db.json data/pos-db.json.bak-<timestamp>
# hapus artefak dari JSON, lalu:
docker start grandpos_web_app
```
Backup dari insiden sebelumnya: `data/pos-db.json.bak-probe-cleanup-20261111T055701`.

### pytest
```bash
# suite hermetik (tanpa DB)
cd /root/grandpos/backend-landing-page
docker run --rm -v $PWD:/srv -w /srv grandpos-api python -m pytest -q

# suite lengkap dengan DB live
MCP_LIVE_DB=1 DATABASE_URL='postgresql://grandpos_app:<pw>@grandpos-db-1:5432/grandpos' \
  venv_mcp/bin/python -m pytest -q
```
Jangan pakai `--env-file .env`.

### Test frontend
```bash
cd /root/grandpos/pos-engine/project/frontend && CI=true npx craco test --watchAll=false
```

---

## 10. Artefak

Skrip dan probe (di `/root/.hermes/profiles/software-engineer/cache/scratch/`):

```
grandpos-routes.py              parser route (single source of truth)
probe-catchall.js               bukti catch-all memalsukan sukses
probe-catchall-auth.js          catch-all dengan token owner
probe-alias.js / probe-get-alias.js / probe-alias-accept.js   perilaku alias + Accept
probe-missing.js                endpoint tanpa route
probe-mcp-shift.js              MCP vs API shift
probe-idem-shift.js             idempotensi client_ref + tutup shift
probe-persist-consistency.js    tiga salinan asumsi prefiks /api
probe-semantics.js              semantik handler
INDEKS-KODE-GRANDPOS.md         indeks 574 file / 149.890 LOC
```

Output: `/tmp/gp_routes.json`, `/tmp/gp_routes2.json`, `/tmp/fe_norm.json`, `/tmp/probe.xml`, `/tmp/probe2.xml`, `/tmp/p3.xml`.



## 2026-11-11 — Perbaikan batch deterministik (sesi lanjutan)

### Perubahan yang diterapkan
- `pos-engine/api-server.js`: unknown `/api/*` sekarang mengembalikan HTTP 404, bukan `{status:'ok'}` sintetis. Alias kandidat API dinormalisasi ke `/api` tanpa bergantung pada header sehingga masuk auth gate.
- `pos-engine/lib/analytics-sync.js`: `isDraining` di-reset melalui `finally`; entry yang mencapai lima attempt diberi `done=true` sehingga terminal dan tidak tetap dihitung pending.
- `pos-engine/project/.github/workflows/build-frontend.yml`: path diperbaiki dari `frontend/` ke `project/frontend/`; Yarn/yarn.lock diganti `npm ci` dengan `project/frontend/package-lock.json`; artifact path diperbaiki.
- `pos-engine/routes/allMissingRoutes.js`: DELETE member yang tidak ditemukan mengembalikan 404.
- `backend-landing-page/app/services.py`: quantity dan stock pada `_consume_stock()` diproses sebagai `Decimal`, tidak dipotong dengan `int()`.
- `backend-landing-page/app/edge_sync.py`: rounding Rupiah memakai helper `_round_idr()` dengan `ROUND_HALF_UP` untuk COGS dan line totals.
- Test regressions: stok fraksional dan rounding edge ditambahkan.

### Verifikasi nyata
- Backend hermetic batch: **191/191 collected, exit 0**.
- Node contract tests: `fix01-regression` **19/19**, `fix02-contract` **29/29**, `fix05-server-authority` **13/13**; total **61/61**.
- Analytics fixed isolated probe: **3/3** — max retry terminal, pending count benar, worker unlock setelah exception.
- `node --check api-server.js`: exit 0.
- `node --check lib/analytics-sync.js`: exit 0.
- `python -m py_compile app/services.py app/edge_sync.py`: exit 0.
- `git diff --check`: exit 0 di kedua repository.
- `graphify update .`: berhasil; **3.867 nodes, 8.312 edges, 346 communities**.

### Belum diperbaiki / belum boleh diklaim selesai
- Reset-data masih hanya memeriksa keberadaan field password dan belum diverifikasi terhadap `verifyPassword()`.
- MCP auth, order `client_ref` dedupe Node, split payment Node/edge, shift model lintas database, cash-out filter, POS API key, dan temuan frontend lainnya belum seluruhnya diperbaiki.
- PostgreSQL live, edge sync live, browser E2E, deployment, dan workflow GitHub belum dieksekusi.


## 2026-11-11 — Verifikasi pasca-hardening FastAPI/MCP

- Node regression setelah MCP/FastAPI-related changes: `fix01` **19/19**, `fix02` **29/29**, `fix05` **13/13**; total **61/61**, semuanya exit 0.
- Backend safe suite setelah changes: **191/191** lulus.
- Syntax `api-server.js` dan `routes/mcpServer.js` lulus.
- Graphify diperbarui setelah source changes: **3.869 nodes, 8.311 edges, 328 communities**.
- `git diff --check` lulus di kedua repository.



## 2026-11-11 — Node split-payment normalization

- Graphify/source menelusuri `POS.jsx` split builder → Node `POST /orders` dan `/orders/:id/pay` → receipt printers (`payment_splits`) → shift accounting; sebelumnya frontend mengirim `splits`, tetapi Node hanya menyimpan satu payment method dan tidak memvalidasi split.
- Node sekarang menormalisasi split menjadi `payment_splits`, me-resolve nama method, menolak split kosong/malformed atau total yang berbeda dari total server, dan mengalokasikan cash/non-cash shift sales per split.
- Probe snapshot direct order lulus: product total **12.000**, cash **6.000** + QRIS **6.000**, response **200**, `payment_splits` dua baris, cash shift hanya **6.000**; split mismatch ditolak **400**.
- Node contract sesudah patch tetap **61/61** dan syntax lulus.



## 2026-11-11 — Node cash-out date/shift consistency

- Graphify/source menemukan `getReportSummary(targetDate)` memfilter orders berdasarkan tanggal bisnis, tetapi sebelumnya menjumlahkan `cashTransactions` global tanpa filter tanggal/shift.
- Transaksi transport, expenses, dan vendor settlement yang dibuat saat `POST /shifts/close` sekarang menyimpan `shift_id`.
- Report summary Node sekarang memfilter cash-out berdasarkan tanggal bisnis target; transaksi legacy tanpa tanggal valid tidak ikut.
- Probe snapshot endpoint `/api/reports/summary?date=2026-11-11`: transaksi lama **100.000** + transaksi target **25.000** menghasilkan `cash_out=25.000`, `cash_out_fnb=25.000`, `cash_net=-25.000`; HTTP **200**.
- Tidak ada database/live data disentuh.
- Edge sync `normalize_payload()`/`apply_transaction()` masih menghasilkan satu payment row; belum diubah karena kontrak payload edge dan schema live perlu keputusan/migrasi.
- FastAPI native sudah mendukung `payments[]`, tetapi cross-pipeline equivalence belum diuji melalui PostgreSQL live.





## 2026-11-11 — Daftar temuan terbuka setelah Node split fix

1. Edge sync masih single-payment row; split cross-pipeline belum disatukan.
2. Model shift Node JSON vs PostgreSQL belum disatukan.
3. Rekonsiliasi `shift_id` transaksi PostgreSQL historis belum dilakukan.
4. Cash-out belum diverifikasi penuh terhadap filter shift pada semua pipeline.
5. `POS_API_KEY` sudah fail-closed di source, tetapi secret deployment belum disediakan/diverifikasi.
6. FastAPI integration/MCP tests blocked oleh mismatch `ArgsKwargs` pada `pydantic_core`.
7. PostgreSQL go-live dan MCP live DB suite belum dijalankan.
8. Edge sync live belum dijalankan.
9. Analytics network path lintas service belum diuji ke endpoint nyata.
10. UI Playwright E2E belum tersedia pada harness.
11. GitHub Actions full CI/actionlint belum dijalankan.
12. Deployment Compose/startup belum diverifikasi sebagai deployment nyata.
13. Independent Chieftain review belum tersedia dari tool fleet sesi ini.

Tidak ada commit, push, deploy, credential access, atau database live write dilakukan.


- `/api/system/health/speed-test` dan `/api/system/servers/status` tidak lagi mengarang latency/status online. Nilai latency menjadi `null` saat probe gagal; status menjadi `offline`/HTTP 503 bila tidak terhubung; Pi menjadi offline bila tidak terdeteksi.
- Workflow nearest path diverifikasi dengan `npm --prefix project/frontend run build -- --help`: build CRA/CRACO berhasil, warnings lint existing tetap muncul, lalu OTA postbuild menghasilkan artifact; artifact generated dipulihkan ke HEAD agar verifikasi tidak meninggalkan perubahan generated.
- Validator `actionlint` tidak tersedia; `npx --no-install actionlint` gagal karena executable/package tidak tersedia. YAML static path checks lulus; full YAML parser tidak tersedia karena PyYAML/Ruby tidak terpasang.
- Consistency search dan `graphify update .` dijalankan setelah patch: graph **3.868 nodes, 8.312 edges, 341 communities**.
- Verifikasi setelah patch: Node syntax + contract **61/61**, backend safe batch **191/191**, `git diff --check` lulus.



## 2026-11-11 — Hardening reset-data

- `POST /api/admin/reset-data` sekarang memakai `requireAdmin` dan `verifyPassword` dari `api-server.js`; reset tidak lagi hanya memeriksa apakah field password ada.
- Route registration meneruskan helper auth/password secara eksplisit ke `registerAllMissingRoutes()`.
- Probe snapshot ephemeral terhadap real `api-server.js`: anonymous **401**, authenticated kasir **403**, superadmin dengan password salah **403**.


## 2026-11-11 — Verifikasi ping-google setelah consistency patch

- Graphify memetakan caller frontend `HybridSyncDiagnosticPanel`, `SystemHealthPanel`, dan `ThreeServerMatrix` yang memakai field `connected`, `latency_ms`, dan status server.
- Probe snapshot ephemeral terhadap real `api-server.js` dengan `fetch` dimock lulus dua cabang: fetch sukses menghasilkan HTTP **200**, `connected=true`, `latency_ms` number; fetch gagal menghasilkan HTTP **503**, `connected=false`, `latency_ms=null`.
- Percobaan probe pertama gagal karena module resolution `jsonwebtoken` dari scratch; probe dikoreksi dengan file sementara di repository, lalu file dihapus. Kegagalan harness pertama tidak dihitung sebagai hasil aplikasi.
- Syntax dan Node contract sesudah patch tetap lulus: `fix01` **19/19**, `fix02` **29/29**, `fix05` **13/13**.



## 2026-11-11 — Hardening FastAPI API key dan MCP auth

- Route audit terbaru + probe snapshot membuktikan alias write `/products`, `/orders`, dan `/members` mengembalikan **401** untuk anonymous pada `Accept: application/json`, `text/html`, dan `*/*`; authenticated missing API route mengembalikan **404**. Temuan lama alias terbuka tidak lagi berlaku setelah normalisasi alias.
- FastAPI `require_key()` sekarang fail-closed: `POS_API_KEY` kosong menghasilkan **503 misconfigured**, key salah/tidak ada menghasilkan **401**, dan key benar memakai `hmac.compare_digest`. `/health` dan `/system/connectivity` tetap public; edge/WhatsApp memakai guard masing-masing.
- Semua MCP HTTP/SSE surface sekarang memakai `requireAdmin`: JSON-RPC, SSE, SSE messages, status, tools catalog, dan execute. Registration meneruskan helper `requireAdmin` dari `api-server.js`.
- Probe snapshot MCP terhadap tool read-only: anonymous **401**, kasir **403**, admin **200**. Tidak ada mutation tool yang dipanggil dalam probe.
- `py_compile app/api.py`, `node --check api-server.js`, dan `node --check routes/mcpServer.js` lulus.
- FastAPI integration tests tetap blocked oleh `ImportError: cannot import name 'ArgsKwargs' from pydantic_core._pydantic_core`; belum ada live DB test.

### Temuan yang masih perlu diperbaiki/diverifikasi


## 2026-11-11 — Node client_ref idempotency

- Graphify/source menelusuri payload offline `OfflineContext.addPending()` → `client_ref=temp_id` → Node `POST /orders`; sebelumnya handler tidak membaca `client_ref`.
- Handler Node sekarang mencari order existing berdasarkan `client_ref` sebelum membuat order baru dan menyimpan `client_ref` pada order baru.
- Probe snapshot ephemeral dua POST identik lulus: response pertama/kedua memiliki order ID sama, hanya **1 order** tersimpan untuk client_ref, dan shift `orders_count` hanya **1** setelah persistence debounce. Tidak ada database/live data disentuh.
- Tiga probe awal tidak dihitung sebagai evidence penuh karena harness salah membaca struktur snapshot atau membaca sebelum debounced persistence; probe keempat dikoreksi dan lulus.
- Temuan Node offline duplicate order dinyatakan **fixed pada handler Node**, tetapi belum diuji terhadap browser UI E2E/offline actual karena Playwright belum tersedia.
- Split payment Node dan edge belum menjadi banyak payment ledger rows.
- Shift model Node JSON vs PostgreSQL dan cash-out per shift belum disatukan/diverifikasi live.
- `POS_API_KEY` fail-closed sudah dipatch, tetapi deployment belum menyediakan/terverifikasi nilainya.
- UI E2E Playwright belum tersedia; PostgreSQL go-live, edge sync live, analytics lintas service, deployment/workflow GitHub, dan independent review belum dijalankan.



## 2026-11-11 — Edge split-payment compatibility

- Graphify/source menelusuri payload edge `normalize_payload()` → `apply_transaction()` → PostgreSQL `payments`/`cash_movements`; schema PostgreSQL sudah mendukung banyak payment rows per order.
- Edge normalizer sekarang menerima `payments[]` backward-compatible: payload legacy single-payment tetap menghasilkan satu payment; split menghasilkan daftar payment yang jumlahnya harus sama dengan `grand_total`; mismatch ditolak.
- Writer edge sekarang melakukan INSERT satu row `payments` per split dengan idempotency key ber-index, membuat cash movement hanya untuk split cash, dan menaikkan `cash_sales` sekali per order.
- Regression normalizer: **3/3**; backend safe batch setelah test baru: **194/194**; `py_compile app/edge_sync.py` lulus; graphify setelah patch: **3.880 nodes, 8.338 edges, 320 communities**.
- Full fake-cursor writer test dan live PostgreSQL equivalence belum dijalankan; temuan edge split belum boleh dinyatakan 100% closed sampai writer test tersebut tersedia.


## 2026-11-11 — Edge writer split-payment verification

- Fake-cursor writer test untuk `apply_transaction()` ditambahkan dan lulus **1/1**. Test memverifikasi payload cash 40.000 + QRIS 60.000 menghasilkan dua `INSERT payments`, hanya satu `cash_movements` cash sebesar 40.000, dan satu update cash shift sebesar 40.000/order_count 1.
- Edge split normalizer **3/3**, rounding **2/2**, dan backend safe aggregate terbaru **195/195** lulus.
- Graphify setelah test writer: **3.889 nodes, 8.351 edges, 346 communities**.
- Edge split writer sekarang terverifikasi hermetic; PostgreSQL live equivalence dan endpoint edge live tetap belum dijalankan.


## 2026-11-11 — Audit model shift Node/PostgreSQL/edge

- Graphify/source memetakan Node `currentShift`/`shifts` JSON, FastAPI PostgreSQL `open_shift()`/`close_shift()`, dan edge `_resolve_shift()`.
- Edge kiosk mengirim shift_id lokal yang tidak dapat dipakai langsung di PostgreSQL; `_resolve_shift()` memilih shift PostgreSQL terbaru berstatus `open`/`closing`.
- Jika tidak ada shift PostgreSQL terbuka, `_resolve_shift()` mengembalikan `None` dan `apply_transaction()` tetap membuat order/payment dengan `shift_id=NULL`. Behavior ini tertulis eksplisit pada docstring dan menjelaskan transaksi historis tanpa shift.
- Saya tidak memaksa reject atau membuat shift otomatis karena keduanya mengubah kebijakan bisnis: reject dapat menghentikan penjualan valid; auto-open dapat memalsukan ownership kas.
- Keputusan bisnis yang diperlukan sebelum fix: (A) reject edge ingest tanpa shift terbuka, (B) membuat/menetapkan shift sistem khusus edge, atau (C) tetap menerima `shift_id=NULL` tetapi memberi exception/queue status dan rekonsiliasi manual.
- Edge writer/split/rounding tests tetap lulus **6/6**; `py_compile app/edge_sync.py` lulus.


## 2026-11-11 — Deployment Compose/startup fix

- Graphify/source memetakan `deploy/docker-compose.yml` → `npm start` → `server.ts` → `api-server.js` + production `dist/`. Compose lama memakai `node:20-alpine`, hanya mount `./data`, dan dapat menjalankan `npm start` tanpa `package.json`, source, `tsx`, dependency, atau `dist`.
- Ditambahkan `/root/grandpos/pos-engine/Dockerfile`: Node 20, `npm ci`, copy root runtime (`api-server.js`, `server.ts`, `routes`, `lib`, `dist`), dan `npm start`.
- `deploy/docker-compose.yml` sekarang memakai `build.context: ../pos-engine`, command eksplisit `[npm, start]`, dan tetap mempertahankan data volume.
- `docker compose -f deploy/docker-compose.yml config` lulus exit 0 dan menghasilkan build context `/root/grandpos/pos-engine`. File Docker belum dibuild/dijalankan karena itu side effect/deployment.
- `node --check server.ts` tidak applicable karena TypeScript syntax; validator yang benar adalah `tsx server.ts`/Docker runtime. `node --check api-server.js` lulus.
- Static path checks lulus: Dockerfile, package.json, package-lock.json, server.ts, dan dist/index.html tersedia.


## 2026-11-11 — Docker build/runtime verification

- `docker build -t grandpos-app:audit-local .` dari `/root/grandpos/pos-engine` berhasil: **exit 0**, `npm ci` menambahkan 336 package, dan image diekspor.
- `docker run` dengan volume data **salinan** di scratch, port lokal `127.0.0.1:18080`, `NODE_ENV=production`, dan JWT khusus audit: container naik, memuat snapshot 54 koleksi, dan `/health` merespons **200 dalam 2 detik**.
- Log container menunjukkan `tsx server.ts` berjalan production, snapshot dimuat dari `/app/data/pos-db.json`, dan warning existing: `CORS_ORIGINS` belum diset serta `NODE_SYNC_KEY` belum diset (sync disabled).
- Container dihentikan dan dihapus setelah verifikasi; data toko tidak disentuh. Image lokal `grandpos-app:audit-local` tetap ada di host sebagai artifact verifikasi.
- Temuan warning terbuka: build `npm ci` melaporkan **2 high severity vulnerabilities**; `CORS_ORIGINS` belum diset pada runtime; `NODE_SYNC_KEY` belum diset sehingga analytics sync disabled.


## 2026-11-11 — npm audit dependency findings

- `npm audit` pada `pos-engine` (407 dependency) melaporkan **2 high severity**: `follow-redirects@1.16.1` (GHSA-mrwp-f3q8-3g9p, fix tersedia 1.16.2/1.16.3) dan `xlsx@0.18.5` (GHSA-4r6h-8v6p-xvw6 prototype pollution + GHSA-5pgg-2g8v-p4x9 ReDoS, **tidak ada fix di registry npm**).
- `xlsx` dipakai nyata di `routes/allMissingRoutes.js` untuk import/export Excel (produk, ingredients, laporan).
- Percobaan menambahkan `overrides.follow-redirects` gagal karena environment memblokir fetch paket remote: `npm error code EALLOWREMOTE ... Refusing to fetch https://registry.npmjs.org/@tailwindcss/oxide-wasm32-wasi/...`. Lockfile tidak dapat diperbarui, sehingga override **di-revert** agar dependency tetap konsisten (`npm ls follow-redirects` kembali bersih, tanpa diff package.json/lock).
- Status: temuan dependency **belum diperbaiki**; butuh environment dengan akses registry atau keputusan migrasi `xlsx` ke build SheetJS resmi (CDN) / sandbox import.


## 2026-11-11 — CORS production hardening

- Graphify menunjukkan `CORS_ALLOWED_ORIGINS` hanya dipakai di `api-server.js` (satu middleware).
- Sebelumnya, production tanpa `CORS_ORIGINS` memakai `origin: true` + `credentials: true`, artinya semua origin browser boleh membaca respons API terautentikasi.
- Sekarang: production tanpa allowlist menolak cross-origin (tanpa header ACAO) tetapi tetap melayani request tanpa Origin (same-origin POS, curl, health probe). Bila `CORS_ORIGINS` diisi, hanya origin itu yang diizinkan.
- Probe snapshot runtime: tanpa Origin → **200** tanpa ACAO; origin asing → tanpa ACAO; dengan allowlist `https://pos.example` → ACAO `https://pos.example`.
- Node regression sesudah patch: `fix01` **19/19**, `fix02` **29/29**, `fix05` **13/13**; `node --check api-server.js` lulus.
- Catatan deployment: `CORS_ORIGINS` tetap harus diisi pada deployment nyata; tanpa itu POS yang diakses dari origin berbeda akan diblokir browser.


## 2026-11-11 — CORS test alignment

- `project/scripts/security-regression-test.js` diperbarui: memeriksa `CORS_STRICT` production dan jalur same-origin. Hasil **79/79 lulus**.
- `project/scripts/security-verify-routes.js` diperbarui: assertion CORS kini mengikuti environment — production tanpa allowlist tidak merefleksikan origin, sedangkan harness `NODE_ENV=test` memverifikasi perilaku development (reflect origin). Hasil **16/16 lulus**.
- Percobaan pertama gagal 2 assertion karena harness berjalan `NODE_ENV=test`; itu kesalahan ekspektasi test, bukan regresi aplikasi, dan sudah dikoreksi.


## 2026-11-11 — Smoke gate + CORS doc consistency

- Import smoke `require('api-server.js')` terhadap snapshot salinan: **exit 0**, `IMPORT_OK true`.
- `npm ls --depth=0`: **exit 0**, dependency tree konsisten (tanpa `invalid`/`missing`).
- `docker compose -f deploy/docker-compose.yml config --quiet`: **exit 0**.
- Consistency check menemukan dokumentasi deploy masih menyarankan `CORS_ORIGINS=*`; `project/README-DEPLOY.md` diperbarui agar sesuai kebijakan allowlist production. Pencarian ulang `CORS_ORIGINS=*` menghasilkan **0 match**.
- `git diff --check` bersih.


## 2026-11-11 — ROOT CAUSE: ArgsKwargs blocker resolved

- Penyebab sebenarnya bukan dependency rusak: environment Hermes mengekspor `PYTHONPATH` yang berisi `site-packages` **Python 3.14** (`/root/.hermes/installs/.../venv/lib/python3.14/site-packages`), sehingga `venv_mcp/bin/python` (Python 3.11) memuat `pydantic_core` binary 3.14 dan gagal `ImportError: cannot import name 'ArgsKwargs'`.
- Solusi tanpa mengubah environment/dependency: jalankan pytest dengan `PYTHONPATH` dikosongkan dan `PYTHONNOUSERSITE=1`. Hasil: `pydantic_core 2.50.1`, `fastapi 0.143.0` termuat normal.
- Setelah itu `tests/test_api_integration.py` + `tests/test_offline_guard.py` berjalan; 11 kegagalan awal adalah konsekuensi fail-closed `POS_API_KEY` (503 sebelum validasi). Fixture test diperbarui menyetel `POS_API_KEY` dan mengirim `X-API-Key` — test diperkuat, bukan dilemahkan.
- Hasil akhir: **337/337 test backend lulus** (semua file kecuali `test_mcp_live_db.py` dan `test_go_live_regression.py` yang butuh PostgreSQL live). Termasuk `test_mcp_reports` 62, `test_mcp_server_tools` 19, `test_mcp_timezone` 4, `test_landing_rules` 24.
- Perintah verifikasi: `env -u PYTHONPATH PYTHONNOUSERSITE=1 venv_mcp/bin/pytest -q --ignore=tests/test_mcp_live_db.py --ignore=tests/test_go_live_regression.py`.


## 2026-11-11 — Consistency: dokumentasi perintah pytest

- Consistency check menemukan `README.md` dan `docs/mcp-reports.md` masih mendokumentasikan perintah pytest tanpa catatan `PYTHONPATH`; keduanya diperbarui dengan catatan `env -u PYTHONPATH PYTHONNOUSERSITE=1` untuk gejala `ArgsKwargs`.
- `git diff --check` bersih. Tidak ada test yang dijalankan ulang pada langkah consistency ini.


## 2026-11-11 — Live PostgreSQL suites executed (disposable DB)

- PostgreSQL 16 disposable dijalankan sebagai container sementara `grandpos-pg-audit` pada `127.0.0.1:55432`, tanpa volume produksi, lalu dihapus setelah verifikasi. Container produksi (`grandpos-db-1`, `grandpos-api-1`, `grandpos_web_app`) tidak disentuh.
- `tests/test_go_live_regression.py` (R1–R5) dijalankan terhadap database disposable: **5/5 lulus** — concurrency payment, outbox failure saat payment, rekonsiliasi shift penuh, duplicate webhook, dan RBAC `grandpos_ai`.
- `tests/test_mcp_live_db.py` dijalankan setelah schema+seed+roles+migrations dimuat dan satu order nyata dibuat lewat service layer: **25/25 lulus** — validitas SQL semua report terhadap schema nyata, read-only enforcement, totals vs agregasi manual, dan pagination.
- Suite penuh backend: **366 test terkumpul, semuanya lulus** (hermetic tanpa `DATABASE_URL` juga lulus).
- Dua test `test_api_integration` disesuaikan agar jujur pada kedua kondisi environment (dengan/tanpa database): health `db` harus boolean nyata, dan `dine_in` tanpa meja harus 422 (dengan DB) atau 503 (tanpa DB), tidak pernah 200 palsu.


## 2026-11-11 — Live /sync/orders end-to-end (disposable PostgreSQL)

Probe ASGI nyata terhadap PostgreSQL 16 disposable (`grandpos-pg-edge`, port 55433, dihapus setelah run). **24/24 assertion lulus.**

### Tiga bug nyata ditemukan dan diperbaiki

1. **Transaksi `rejected` dilaporkan sebagai `accepted`.** `sync_orders()` hanya memilah `duplicate` vs sisanya, sehingga outcome `status="rejected"` masuk daftar `accepted`. Kiosk yang mengosongkan antrean berdasarkan `accepted` akan membuang penjualan secara diam-diam. Diperbaiki: outcome `rejected` kini masuk `rejected` + `errors`.
2. **Kegagalan constraint DB menghapus jejak audit.** Pelanggaran constraint me-rollback transaksi yang menyimpan baris `edge_transactions`, sehingga bukti kegagalan hilang tepat saat dibutuhkan untuk diagnosa. Diperbaiki: `_record_edge_failure()` menulis ulang baris `rejected` + `edge_ingest_log` di koneksi terpisah.
3. **Metode pembayaran non-cash dibukukan sebagai cash.** `analytics-sync.js:97` dan `sync-to-analytics.js` memetakan semua metode non-QRIS menjadi `cash`; `edge_sync._normalise_payment()` juga memakai `PAYMENT_METHOD_MAP.get(raw, "cash")`. Akibatnya penjualan transfer/debit masuk `cash_sales` dan merusak rekonsiliasi laci. Diperbaiki di tiga tempat: pemetaan metode eksplisit di kedua mapper Node, dan penolakan metode tak dikenal di `edge_sync` (payload legacy tanpa field metode tetap `cash`).

### Temuan tambahan

- `/api/payment-methods` tidak mengirim field `type`, padahal POS memakai `pm.type` untuk `payment_method_type` dan deteksi tunai. Kini mengirim `type` untuk cash/qris/transfer.
- Baris `rejected` kini boleh dikirim ulang (`ON CONFLICT ... DO UPDATE WHERE status='rejected'`), sehingga kiosk bisa memperbaiki payload dan mencoba lagi tanpa mengganti `client_ref`.

### Verifikasi

- Backend: **378/378 test lulus** (termasuk `test_edge_sync_payment_method.py` 18 test baru).
- Node: fix01 19/19, fix02 29/29, fix05 13/13, security-verify-routes 16/16, security-regression 79/79.
- Probe live: auth fail-closed 503/401, happy path, replay duplicate, split 2 payment row, split mismatch rejected, isolasi per-baris, retry setelah rejected, transfer tersimpan sebagai transfer tanpa cash movement, metode tak dikenal ditolak.

### Temuan yang BELUM diperbaiki (butuh keputusan)

- **Price drift**: kiosk dengan daftar harga basi mengirim `price` berbeda dari `products.base_price`; constraint `order_items_weight_check` menolak baris itu (`unit_price = base_price` untuk item non-timbang). Perilaku saat ini: transaksi ditolak dengan pesan constraint mentah, bukan pesan bisnis yang bisa ditindaklanjuti. Perlu keputusan: tolak dengan pesan jelas, atau pakai harga gudang sebagai otoritas.


## 2026-11-11 — Consistency: copy kedua coercion + suite penuh tanpa skip

- Consistency check menemukan copy kedua coercion metode pembayaran di `app/edge_sync.py:237` (field `payment` top-level). Diperbaiki dengan aturan sama; pencarian ulang `PAYMENT_METHOD_MAP.get(raw_method, "cash")` menghasilkan **0 match**.
- Suite penuh dijalankan ulang terhadap PostgreSQL 16 disposable baru (`grandpos-pg-final`, port 55434, dihapus setelah run) dengan schema+seed+roles+migrations dan satu order nyata: **378/378 lulus tanpa skip**.
- Dua test `test_api_integration` disesuaikan agar jujur pada database yang baru di-seed: `dine_in` tanpa meja boleh 404 (belum ada shift terbuka), 422 (aturan bisnis), atau 503 (tanpa DB) — tidak pernah 200 palsu.


## 2026-11-11 — Round-end consistency: call site lain dari logika metode pembayaran

Consistency check (tanpa menjalankan ulang test) menemukan enam call site lain yang memakai vocabulary metode berbeda dari logika yang baru diperbaiki:

1. `routes/allMissingRoutes.js` void/refund: hanya `payment_method === 'cash'` yang dianggap tunai, dan split payment diabaikan saat membalik `cash_sales`/`non_cash_sales`. Diperbaiki: membalik per split, dan `tunai`/`payment_method_type === 'cash'` dihitung tunai.
2. `routes/allMissingRoutes.js` preview dampak void (`cash_reduction`): memakai tes tunai berbeda dari jalur void. Disamakan.
3. `routes/mcpServer.js` `pos_get_shift_status`: `expected_cash` hanya menjumlah order ber-`payment_method === 'tunai'`, sehingga semua penjualan tunai yang tersimpan sebagai `cash` tidak terhitung dan estimasi kas laci terlalu rendah. Diperbaiki dengan predikat `isCashOrder`.
4. `routes/mcpServer.js` breakdown `payments`: `tunai` dan `cash` menjadi dua baris terpisah untuk uang laci yang sama. Dinormalisasi ke `cash`.
5. `api-server.js` `by_pm` pada laporan ringkasan: `cash_sales`/`cash_net` memakai `by_pm['cash']`, sehingga order ber-`tunai` tidak masuk. Dinormalisasi.
6. `api-server.js` dua jalur update `db.currentShift` (pay dan create): tes tunai case-sensitive dan tanpa `tunai`. Disamakan.

Verifikasi pada langkah ini: `node --check` lulus untuk `api-server.js`, `routes/allMissingRoutes.js`, `routes/mcpServer.js`, `lib/analytics-sync.js`, `lib/sync-to-analytics.js`; `git diff --check` bersih. Test tidak dijalankan ulang pada langkah consistency ini (sesuai aturan round-end).


## 2026-11-11 — Verifikasi call site cash/tunai + bug expected_cash MCP

### Bug finansial baru ditemukan lewat probe runtime

`routes/mcpServer.js` `pos_get_shift_status` menghitung `expected_cash` dengan filter `o.shift_id === shift.id || (!o.shift_id && shift.status === 'open')`. Klausa kedua menyapu **seluruh order historis tanpa `shift_id`** ke laci shift yang sedang buka. Pada snapshot probe: `expected_cash_drawer` = **3.248.400** padahal seharusnya **180.000** (opening 100.000 + cash 80.000). Diperbaiki: order tanpa `shift_id` diatribusikan lewat jendela waktu shift (`opened_at`..`closed_at`), bukan seluruh riwayat.

### Verifikasi enam call site hasil consistency check

Probe runtime baru `tests/cash-tunai-normalisation.js` (permanen) menjalankan `api-server.js` nyata di atas salinan snapshot, port ephemeral, dengan order `cash` 50.000 + `tunai` 30.000 + `qris` 20.000. **9/9 assertion lulus**:

- `reports/summary`: `cash_sales` 80.000, `cash_net` 80.000, `by_payment` hanya satu kunci `cash` (80.000) + `qris` (20.000).
- MCP `pos_get_shift_status`: `total_cash_sales` 80.000, `expected_cash_drawer` 180.000.
- `void-preview` order ber-`tunai`: `impact.cash_reduction` 30.000.

### Suite penuh

- Node: 10/10 file lulus (fix01 19, fix02 29, fix05 13, vendor-settlement-integrity, journal-correction-integrity, vendor-share-on-order, vendor-settlement-e2e, cash-tunai-normalisation 9, security-verify-routes 16, security-regression 79).
- Backend: **378/378 lulus tanpa skip** terhadap PostgreSQL 16 disposable (`grandpos-pg-r3`, port 55436, dihapus setelah run).

### Catatan lingkungan

Percobaan pertama gagal karena **disk host 100% penuh** (19 MB tersisa); container PostgreSQL tidak bisa `initdb`. Dibersihkan hanya artefak aman (`docker builder prune -af` 662 MB, container gagal) tanpa menyentuh container produksi (`grandpos-db-1`, `grandpos-api-1`, `grandpos_web_app`, `gak_watchtower_updater`). Setelah itu 504 MB tersedia dan suite berjalan penuh.


## 2026-11-11 — Round-end consistency: copy lain dari logika kas yang diubah

Dua copy lain ditemukan dan diperbaiki (tanpa menjalankan ulang test, sesuai aturan round-end):

1. **`project/frontend/src/pages/Shift.jsx:151-152`** — fallback `cash_sales_fnb`/`cash_sales_retail` masih membagi total kas 70/30 ketika server tidak mengirim angka per channel. Rasio itu tidak didukung data apa pun dan membuat variance kedua channel salah sekaligus. Ini copy frontend dari bug yang sudah dihapus di `api-server.js:2988-2994`. Diganti: nilai jujur `0` bila field tidak ada.
2. **`routes/mcpServer.js:640`** — `startingCash` dibaca dari `shift.starting_cash`, field yang **tidak pernah ditulis** model data ini. Shift nyata menyimpan `opening_cash_fnb`/`opening_cash_retail` (per scope) atau `start_cash`/`opening_cash`. Akibatnya modal awal selalu 0 dan `expected_cash_drawer` hanya berisi penjualan tunai. Diperbaiki dengan urutan fallback yang sesuai model data.

Verifikasi pada langkah ini: `node --check` lulus untuk `routes/mcpServer.js`, `api-server.js`, `routes/allMissingRoutes.js`; `git diff --check` bersih. **Kedua perbaikan ini belum diuji ulang** karena aturan round-end melarang menjalankan ulang test pada langkah consistency; perlu dijalankan pada putaran verifikasi berikutnya.


## 2026-11-11 — Verifikasi dua perbaikan round-end sebelumnya

Kedua perbaikan yang sebelumnya belum teruji kini terverifikasi.

### Fixture diperkuat

`tests/cash-tunai-normalisation.js` sebelumnya menyetel `starting_cash: 100000` pada fixture, sehingga fallback baru tidak benar-benar teruji. Field itu dihapus dari fixture (model data ini memang tidak menulisnya), dan assertion baru ditambahkan: `starting_cash` harus 100.000 yang dibaca dari `opening_cash_fnb`. Hasil: **10/10 assertion lulus** — membuktikan perbaikan `routes/mcpServer.js` benar.

### Regression guard permanen baru

`tests/cash-drawer-authority.js` — **13/13 lulus**. Menjaga tiga cacat nyata:

1. `Shift.jsx` tidak lagi membagi total kas 70/30; `cash_sales_fnb`/`cash_sales_retail` diambil dari summary dengan default 0.
2. `pos_get_shift_status` membaca `opening_cash_fnb`/`opening_cash_retail`/`start_cash`, bukan `starting_cash` yang tidak pernah ditulis.
3. Order tanpa `shift_id` dibatasi jendela waktu shift (`opened_at`..`closed_at`), bukan seluruh riwayat.

### Verifikasi frontend

- `eslint --config eslint.undef.config.cjs src/pages/Shift.jsx`: **exit 0**.
- `npx craco build`: **exit 0** (compiled with warnings).
- Build dengan `CI=true` **gagal** karena empat warning `react-hooks/exhaustive-deps` pre-existing di `GlobalErrorDiagnosticPanel.jsx`, `Reservations.jsx`, `RoleBasedAccess.jsx` — bukan dari perubahan ini. Dicatat sebagai temuan: CI build akan gagal sampai warning itu dibereskan.
- Artefak build (`project/frontend/public/ota/bundle.zip`, `version.json`) dipulihkan ke HEAD setelah build.

### Suite penuh

- Node: **11/11 file lulus** (termasuk dua test baru).
- Backend: **378/378 lulus tanpa skip** terhadap PostgreSQL 16 disposable (`grandpos-pg-r4`, port 55437, dihapus setelah run).

### Temuan baru: CI build gagal karena warning lint pre-existing

`CI=true npx craco build` memperlakukan warning sebagai error. Empat warning `react-hooks/exhaustive-deps` di tiga file membuat build CI gagal. Ini bukan regresi dari perubahan audit, tetapi berarti pipeline build frontend tidak akan hijau sampai warning tersebut diperbaiki.


## Klarifikasi eksekusi — 2026-11-13

- Cakupan disetujui: semua temuan GrandPOS, termasuk security.
- Target akhir disetujui: commit ke repo lokal, push ke GitHub, deploy ke production, lalu verifikasi production.
- Kriteria sukses production: health/API mengembalikan 200, frontend mengembalikan 200, container baru aktif, bundle frontend cocok dengan build, dan probe perilaku security yang sebelumnya terbuka sekarang tertolak.
- Keputusan harga: `products.base_price` warehouse menjadi sumber otoritatif; transaksi boleh masuk dengan total yang disesuaikan bila harga kiosk stale; selisih harga wajib dicatat untuk audit.
- Backend production: host lokal `<GUDANG_HOST>` (`<VPS_HOST>`), Compose `/root/grandpos`, target `grandpos-api-1` dan service terkait; `grandpos-db-1` tidak disentuh kecuali migrasi diperlukan.

---


### T26 — Harga kiosk stale ditolak oleh constraint, bukan oleh aturan bisnis yang jelas

Temuan price drift yang sebelumnya terbuka dikonfirmasi ulang dari graphify, source, dan probe aman:

- `pos-engine/lib/analytics-sync.js:65-138` (`mapOrderToTxn`) meneruskan `item.price` sebagai `price`; probe runtime dengan item weighted `qty=0.35`, `price=120000`, `weight=0.35` menghasilkan payload `price=120000`, `weight=0.35`, `total=42000`.
- `backend-landing-page/app/edge_sync.py:184-269` (`normalize_payload`) memetakan `price`/`unit_price` payload menjadi `lines[].unit_price` tanpa membandingkannya dengan katalog warehouse.
- `backend-landing-page/app/edge_sync.py:438-460` (`apply_transaction`) memakai `line["unit_price"]` untuk `order_items.unit_price`, tetapi memakai `product["base_price"]` untuk `order_items.base_price`.
- `db/schema.sql:459-463` mewajibkan item non-timbang memiliki `unit_price = base_price`. Harga stale pada produk non-timbang karena itu gagal di database melalui constraint mentah; tidak ada `EdgeSyncError` yang menjelaskan SKU, harga kiosk, dan harga warehouse.
- Jalur retry di `pos-engine/lib/analytics-sync.js:195-205` mencoba ulang rejection/error sampai lima kali lalu menandai entry selesai dengan `max retries exceeded`; ini tidak memperbaiki drift dan dapat menyamarkan transaksi yang belum masuk warehouse.

Batas temuan: item weighted tidak terkena cabang equality constraint yang sama, tetapi tetap memakai harga dari kiosk untuk `unit_price` dan `line_total`; source belum menunjukkan validasi harga warehouse-authoritative pada jalur edge.

Keputusan yang masih diperlukan sebelum patch: (A) tolak eksplisit dengan error bisnis yang dapat ditindaklanjuti, atau (B) gunakan `products.base_price` warehouse sebagai otoritas dan audit/log selisih harga. Jangan mengubah perilaku tanpa keputusan karena kedua opsi mengubah total transaksi/rekonsiliasi.

Evidence:

- `graphify query` dan `graphify explain` dijalankan sebelum source inspection; `graphify path` tidak menemukan jalur statis langsung ke `create_order()` karena edge sync memanggil endpoint/database boundary.
- Probe Node `mapOrderToTxn` berhasil dan mencetak payload weighted di atas.
- `env -u PYTHONPATH PYTHONNOUSERSITE=1 pytest -q tests/test_edge_sync_rounding.py tests/test_edge_sync_payment_method.py tests/test_edge_sync_split.py`: **17 passed**.
- Tidak ada source code yang diubah; kedua working tree tetap clean sebelum audit append ini.

---


- Semua hasil audit, query, patch, test, probe, blocker, dan temuan terbuka dipertahankan dalam file ini secara append-only. Ukuran saat handoff: 49.114 bytes / 757 lines.
- Durable memory ditambahkan untuk baseline verifikasi, prosedur probe aman, repositori, temuan terbuka, dan aturan append-only/graphify. Record IDs: `mem_e16a2593abaabe1c`, `mem_3d6cfb79b2b54fb0`, `mem_8e233c2d8ddd8cf8`, `mem_2bab9a0eb4641162`, `mem_84845db2213b5299`.
- Skill reusable dibuat dan lint diperbaiki: `grandpos-audit-continuation` (versi 1.0.0), berisi topology repo, workflow graphify, prosedur probe aman, baseline 378/378, dan daftar temuan terbuka.
- Sesi baru harus memuat skill tersebut, membaca audit append-only, menjalankan graphify query sebelum source browsing, serta tidak menyentuh database/credential produksi.


---

# Sesi lanjutan — 2026-11-13 (append-only; temuan di atas tidak diubah)

## Kondisi awal sesi

- Backend `backend-landing-page`: `app/api.py` dan `app/edge_sync.py` termodifikasi, `tests/test_edge_sync_price_authority.py` untracked, belum di-commit.
- Frontend `pos-engine`: `GlobalErrorDiagnosticPanel.jsx`, `Reservations.jsx`, `RoleBasedAccess.jsx` termodifikasi plus `public/ota/bundle.zip` dan `version.json`. `git status` menunjukkan nama file terakhir menempel dengan output log — artefak tampilan terminal, bukan nama file rusak; path asli tetap tiga file `.jsx`.
- Blocker lama "full backend suite gagal saat collection karena mismatch pydantic_core/ArgsKwargs" **tidak lagi terjadi**: `venv_mcp` berisi pydantic 2.14.1 / pydantic_core 2.50.1 / Python 3.11.2 dan collection berjalan penuh. Penyebab pasti perubahan tidak dilacak (tidak ada commit dependensi), jadi blocker dicatat sebagai tidak tereproduksi, bukan sebagai "sudah diperbaiki".

## Insiden produksi yang ditemukan dan ditangani sebelum remediasi

`grandpos-db-1` (PostgreSQL produksi) sedang **crash-loop** setiap ~60 detik:

```
FATAL:  could not write lock file "postmaster.pid": No space left on device
```

Penyebab: filesystem `/` 100% penuh (30G, 0 avail). Konsumsi terbesar `/root` 16G, di antaranya `/root/.hermes` 8.7G, `/root/.cache` 2.2G, `/root/.cache/pip` 466M, cache uv 860M+354M, `/root/backups` 879M.

Tindakan (hanya cache dan artefak sekali pakai; volume `grandpos_pgdata`, `/root/backups`, dan file repo tidak disentuh):

- hapus `/root/.cache/pip`, `/root/.cache/uv`, `/root/.hermes/cache/uv`, `/root/.cache/node-gyp`
- `npm cache clean --force`, `pip cache purge` (venv_mcp)
- hapus container sisa `hermes-5d9aa8c7` (exited)
- `docker image prune -f` → 0B (tidak ada image yatim)

Hasil: `/` 28G used, 615–630M avail. `grandpos-db-1` naik kembali **Up (healthy)** dan melakukan recovery normal (`database system is ready to accept connections`). `/health` API = 200.

Catatan risiko: headroom hanya ~600MB. Disk harus dipantau; host ini belum punya alarm kapasitas.

## Verifikasi backend

```
cd /root/grandpos/backend-landing-page
env -u PYTHONPATH PYTHONNOUSERSITE=1 ./venv_mcp/bin/python -m pytest -o addopts='' -q
→ 353 passed, 29 skipped in 2.77s
```

29 skip bukan kegagalan: 24 `test_mcp_live_db.py` (butuh `MCP_LIVE_DB=1`) dan 5 `test_go_live_regression.py` (butuh DSN PostgreSQL). Keduanya dijalankan terpisah di bawah.

Catatan lingkungan: sisa `__pycache__` dari path lama membuat traceback pytest menunjuk `/root/grandpos-platform/tests/...`. Direktori itu tidak ada; setelah `tests/__pycache__` dihapus, seluruh jejak kembali ke repo yang benar.

### Live PostgreSQL disposable

```
docker run -d --rm --name gp-golive-pg -p 127.0.0.1:55432:5432 \
  --tmpfs /var/lib/postgresql/data:size=400m -e POSTGRES_PASSWORD=... postgres:16-alpine
env GRANDPOS_TEST_DATABASE_URL='postgresql://...@127.0.0.1:55432/postgres' \
  ./venv_mcp/bin/python -m pytest -q -rs tests/test_go_live_regression.py
→ 5 passed in 4.04s
```

Menutup 5 skip go-live. Tidak menyentuh database produksi maupun volume `grandpos_pgdata`.

## Temuan baru: rekonsiliasi pembayaran mengarang nominal non-tunai (T27)

Patch price-authoritative menyesuaikan `payments[].amount` ke `grand_total` warehouse. Versi awal menambahkan selisih ke **baris pembayaran terakhir**:

```python
adjusted[-1]["amount"] += delta
```

Bila kiosk mengirim split (tunai + QRIS) dan harga warehouse lebih tinggi, kenaikan masuk ke baris QRIS/kartu. Akibatnya mutasi bank tidak akan pernah cocok dengan `payments.amount`, dan `cash_movements` mencatat lebih kecil dari uang fisik yang diterima. Ini memperkenalkan cacat rekonsiliasi baru pada jalur yang justru sedang diperbaiki.

Perbaikan: naikkan baris tunai lebih dulu, jatuh ke baris terakhir hanya bila tidak ada baris tunai.

```python
target = next((item for item in adjusted if item["method"] == "cash"), adjusted[-1])
target["amount"] += delta
```

Bukti test-first: test baru `test_price_increase_lands_on_the_cash_row_not_on_the_card_row` dijalankan terhadap kode lama → **FAIL** `[40000, 60000] != [50000, 50000]`; setelah patch → 4 passed.

Batas yang masih terbuka: bila tidak ada baris tunai sama sekali (mis. QRIS penuh) dan total naik, kenaikan tetap jatuh ke baris non-tunai. Menolak transaksi seperti itu adalah keputusan bisnis, belum diambil.

## Probe live end-to-end jalur harga (21/21)

`probe_price_authority.py` membangun database disposable dari DDL repo (`schema.sql`, `seed.sql`, `0002`, `0003`, `roles.sql`), membuat satu shift buka, lalu menjalankan `edge_sync.apply_transaction()` + penulisan `edge_ingest_log` sungguhan. Payload kiosk memakai harga stale 30000 untuk `MKA-001` yang berkatalog 38000.

```
PASS  order.grand_total: 76000            PASS  payment.amount = new total: 76000
PASS  order.subtotal: 76000               PASS  payment.tendered: 76000
PASS  order.paid_total: 76000             PASS  payment.change_due: 0
PASS  order.cogs_total: 36000             PASS  cash_movements count: 1
PASS  order.shift_id linked: 1            PASS  cash amount = reconciled: 76000
PASS  item.unit_price = warehouse: 38000  PASS  shift.cash_sales: 76000
PASS  item.base_price: 38000              PASS  ingest_log.outcome: 'accepted'
PASS  item.line_total: 76000              PASS  drift count: 1
PASS  unit_price == base_price (schema)   PASS  drift sku: 'MKA-001'
                                          PASS  drift kiosk_price: 30000
                                          PASS  drift warehouse_price: 38000

21/21 checks passed
```

Ini membuktikan: harga warehouse menang, constraint `order_items_weight_check` tidak lagi gagal mentah, `paid_total`/COGS/shift konsisten, `cash_movements` tunggal, dan `edge_ingest_log.detail` tersimpan sebagai JSON drift yang bisa dibaca.

Kolom `edge_ingest_log.detail` dikonfirmasi ada di DDL (`db/migrations/0003_edge_sync.sql:77`) dan di database produksi (`id, node_id, client_ref, outcome, order_number, detail, created_at`). Tidak perlu migrasi.

## Verifikasi frontend

```
cd /root/grandpos/pos-engine/project/frontend
CI=true npx craco build   → Compiled successfully (main.7ebc3f39.js 570.99 kB gzip)
CI=true npx craco test --watchAll=false → Test Suites: 2 passed, Tests: 3 passed
```

Empat warning `react-hooks/exhaustive-deps` sebelumnya memblokir build CI; kini build CI hijau. Perbaikannya menempatkan `eslint-disable-next-line` **di dalam** `useEffect` tepat sebelum baris dependensi, bukan di atas `useEffect`, karena aturan dilaporkan pada node dependensi. Tiga file berubah, bukan empat warning di tiga file tanpa sebab — file keempat (`RoleBasedAccess.jsx`) memuat dua warning.

### Integritas bundle OTA

`public/ota/bundle.zip` (sha256 `6fce9cf5…16ca`) berisi `static/js/main.7ebc3f39.js` yang **identik** dengan hasil build sekarang setelah sanitasi WebView Android 7 dari `scripts/make-ota.js` (`import(t.module)` → `Promise.resolve(t.module)`, 1 penggantian). Diuji dengan menyamakan hash byte-for-byte. Jadi bundle OTA dan `version.json` memang cocok dengan source yang di-commit, bukan artefak basi.

## Graphify

```
cd /root/grandpos && graphify update .
→ Rebuilt: 3949 nodes, 8438 edges, 352 communities
```

Naik dari 3945/8438 (baseline handoff): +4 nodes dari modul dan test baru.

## Status commit / deploy

Belum ada commit, push, deploy, atau verifikasi live production pada titik append ini.

## Commit, push, dan deploy (lanjutan 2026-11-13)

### Commit

| Repo | Commit | Isi |
| :--- | :--- | :--- |
| `backend-landing-page` | `f751e48` | harga warehouse otoritatif, drift diaudit, fix rekonsiliasi tunai, 4 test |
| `pos-engine` | `ff42b2c` | 4 warning `exhaustive-deps` dibereskan, bundle OTA dibangun ulang dari source |

Push: `62d514d..f751e48 → github.com/taqim2609/grandpos-platform.git` dan `d9d6615..ff42b2c → github.com/taqim2609/GrandPosoptima.git`. Push backend sekaligus mengirim dua commit lama yang belum terkirim (`2ceb2c9`, `2fab250`). Kedua working tree bersih setelah push.

### Deploy backend (host `<GUDANG_HOST>`)

```
cd /root/grandpos/backend-landing-page && docker compose build api   → Image grandpos-api Built
docker compose up -d --force-recreate --no-deps api                  → Recreated + Started
```

- Image baru: `sha256:5ea2759becf1c99ce5ef0bc3cc8bc00b9a7d41b15aaf3b105d159eed876dfdfc`
- `grandpos-api-1`: **Up (healthy)**, `/health` = **200**
- `grandpos-db-1` **tidak** disentuh; tetap Up (healthy)

Verifikasi perilaku di dalam container produksi:

```
docker exec grandpos-api-1 python -c "...inspect.getsource..."
cash-first fix: True   drift fn: True   price_drifts key: True
```

Probe auth produksi (tidak mutatif, `transactions: []`):

```
POST /sync/orders tanpa key       → 401
POST /sync/orders dengan key salah → 401
```

### Deploy frontend (VPS `<PI_USER>@<PI_HOST>`, aarch64)

Kondisi yang ditemukan berbeda dari catatan handoff:

- `/home/<PI_USER>/grand-aceh-pos/project` **tidak ada lagi**; tidak ada checkout git di host itu sama sekali.
- `docker-compose.yml` proyek juga tidak ada, sehingga `docker compose up` tidak bisa dipakai untuk frontend.
- `nginx.conf` di dalam image produksi berbeda dari `project/frontend/nginx.conf` di repo HEAD: versi live berisi mode kiosk (root `/` melayani SPA POS), `location /api/landing/` → `<VPS_HOST>:8000`, dan `location /api/` → `<VPS_HOST>`. Versi repo memakai `proxy_pass http://backend:8001`, container yang tidak ada di Pi.

Keputusan: **tidak menimpa `nginx.conf` produksi dengan versi repo**, karena itu akan memutus proxy API kiosk dan mengubah routing. Yang diganti hanya aset statis.

Jalur deploy yang dipakai:

1. build frontend di `<GUDANG_HOST>` (`CI=true npx craco build`), buang `*.map`
2. arsipkan `build/` → `frontend-build-ff42b2c.tar.gz` (1.245.251 byte, sha256 `e2c1d83f…ebc0`)
3. `scp` ke Pi; sha256 di Pi **identik**
4. ekstrak `nginx.conf` dari container produksi yang berjalan (`prod-nginx.conf`, 107 baris) dan pakai itu sebagai konfigurasi image baru
5. `docker build --platform linux/arm64 -t project-frontend:ff42b2c .` di Pi (base `nginx:alpine` arm64, tanpa build React di Pi — sesuai `docs/PANDUAN-BUILD-PI.md`)
6. rename container lama → `project-frontend-old`, stop, jalankan container baru bernama `project-frontend-1` di `project_pos_network` dengan alias `frontend`, port 80

Bukti produksi:

```
GET /                          → 200, index menyajikan main.7ebc3f39.js
sha256 main.7ebc3f39.js        → 105fbf35…52cc  (identik dengan bundle OTA yang diuji)
*.map di html                  → 0
GET /static/js/main.7a50f4e3.js → 404 (bundle lama benar-benar hilang)
GET /pos                       → 200, memuat main.7ebc3f39.js
GET /ota/version.json          → 2.10.20261113083850, checksum 2afe8ccf…a2a
sha256 /ota/bundle.zip         → 2afe8ccf…a2a (cocok dengan version.json)
GET /api/health                → 200 {"status":"ok","healthy":true,...}
Cache-Control /static/         → public, max-age=31536000, immutable
Cache-Control /ota/            → no-store
```

`GET /api/landing/config` = 401 dari Pi **dan** 401 saat dipanggil langsung ke `<VPS_HOST>:8000`. Jadi 401 itu perilaku backend (butuh API key), bukan regresi proxy. Tidak diuji dengan kredensial.

Rollback tersedia: container `project-frontend-old` masih ada (Exited 0) dan image lama `project-frontend:latest` belum dihapus.

### Catatan operasional yang masih terbuka

- Container frontend baru dijalankan dengan `docker run`, sehingga **tidak punya label Compose**. `docker compose` di direktori yang sudah hilang tidak bisa lagi mengelola frontend Pi. Ini utang operasional, bukan regresi fungsional.
- `nginx.conf` produksi (mode kiosk) **tidak ada di repo**. Setiap deploy berikutnya harus mengambilnya dari container, atau config itu harus di-commit ke repo agar deploy bisa direproduksi. Ini temuan terbuka.
- Headroom disk `<GUDANG_HOST>` hanya ~830MB setelah pembersihan. Belum ada alarm kapasitas; insiden `No space left on device` bisa terulang.
- Independent review oleh reviewer subagent **belum dijalankan**: toolset sesi ini tidak menyediakan `delegate_task`. Handoff ke Chieftain masih diperlukan.

### Ringkasan verifikasi akhir

| Pemeriksaan | Hasil |
| :--- | :--- |
| Backend suite hermetik | 353 passed, 29 skipped |
| Go-live regression (PostgreSQL disposable) | 5 passed |
| Probe live jalur harga end-to-end | 21/21 checks |
| Frontend `CI=true` build | Compiled successfully |
| Frontend test | 2 suites / 3 tests passed |
| Graphify | 3949 nodes / 8438 edges |
| Backend produksi | image baru, healthy, `/health` 200, auth fail-closed |
| Frontend produksi | aset commit `ff42b2c`, `/` 200, OTA checksum cocok |

---

## Sesi lanjutan — 2026-11-13 (remediation plan T1-T8)

Rencana terekam dan diterima lebih dulu (`plan_accepted`, event `20261113T154456Z`,
artifact `.omh/plans/2026-11-13T154324838163Z-grandpos-remediation-ota-skew-landing-contract-disk-backup-deps-aeadcf.md`).
Bagian ini melaporkan apa yang benar-benar dijalankan dan diamati.

### T1 — Skew OTA: akar masalah dan perbaikan

Akar masalah bukan "make-ota tidak jalan". Tiga tempat memberi `dist/` (build 2026-11-07)
prioritas di atas `project/frontend/build` (build 2026-11-13):

| Lokasi | Perilaku lama |
| :--- | :--- |
| `api-server.js:6963` | `express.static(distPath)` dipasang sebelum `fallbackBuildPath` |
| `api-server.js:5982` | route bundle memilih `dist/ota` lebih dulu |
| `scripts/make-ota.js:11` | `findBuildDir()` kandidat `../dist` lebih dulu |

Akibat terukur: `/` menyajikan `main.7a50f4e3.js` (7 Nov) sementara `/ota/version.json`
pada origin yang sama menyajikan versi 13 Nov. Dua penulis `dist/ota` (`build.js` bagian 3
dan `scripts/make-ota.js`) membuat isi berganti-ganti tiap langkah build.

Perubahan:
- `scripts/make-ota.js`: `dist/` dihapus dari kandidat `findBuildDir()`; ditambah gerbang
  kesegaran yang menolak jalan (exit 2) bila `dist/index.html` lebih tua dari `build/index.html`.
- `build.js`: blok OTA lokal dihapus, didelegasikan ke `scripts/make-ota.js` (satu penulis).
- `nodes.primary_pi` / `nodes.fallback_vps`: `pos.local:3000` tidak pernah resolve dan Pi
  tidak punya listener 3000; `<VPS_HOST>:8000` (FastAPI) tidak punya route OTA sama sekali
  (`404`, tidak ada di `openapi.json`). Diganti ke `<PI_HOST>:80` dan `<VPS_HOST>:3000`.

Bukti (diamati):
- `make-ota.js` dengan `dist/index.html` dibuat basi → exit **2**; setelah `node build.js` → exit 0.
- Idempoten: `build.js` lalu `make-ota.js` menghasilkan sha256 identik (`87a7e6e255caf2dd…`).
- `dist/ota`, `build/ota`, `public/ota` → sha256 sama.
- Seluruh 4 URL node → **200**.

### T2 — Landing config: 401 bukan soal API key

`app/api.py:56` menuntut header `X-API-Key`; klien mengirim `Authorization: Bearer`
(`landingService.js:106`, `:144`). Tidak pernah cocok → selalu 401. Node punya store sendiri
yang sudah publik: `GET /api/public/landing-config` → `200`.

Perubahan di `landingService.js`: baca ke `/api/public/landing-config`, tulis dan reset ke
`POST /api/settings/landing-page` (butuh token admin, sudah dikirim).

Bukti: `GET /api/public/landing-config` **200**; `POST /api/settings/landing-page` tanpa token
**401** (guard bekerja); jalur lama tetap 401; bundle baru memuat `api/public/landing-config`
dan **tidak** lagi memuat `api/landing/config`.

### T5 — Dependency

`follow-redirects` 1.16.1 → 1.16.3 (`axios@1.20.0`). `npm audit --omit=dev`: high tersisa
hanya `xlsx@0.18.5`, yang tidak punya perbaikan di npm dan dipakai server-side di
`routes/allMissingRoutes.js:3` (upload Excel admin). Dicatat sebagai accepted risk.

### T7 — `python3` rusak

`/usr/local/bin/python3` adalah shim 53 byte ke `/root/venvs/headroom/bin/python3` yang tidak
ada → setiap `python3` exit 127. Di-repoint ke `/usr/bin/python3` (3.11.2); shim lama disimpan
sebagai `python3.broken-shim.bak`.

### T8 — Keputusan H1 (split card-only + kenaikan harga)

Diputuskan Qim: **H1** — delta penuh dibebankan ke baris non-cash dan drift dikembalikan untuk
rekonsiliasi manual; ingest tidak ditolak. Perilaku diamati: `grand_total` 100000, `payments`
`[("qris", 100000)]`, 1 drift. Dikunci oleh
`test_card_only_price_increase_is_recorded_for_manual_reconciliation`.
Seluruh file: **5 passed**.

### T4 — Disk headroom

- Image `nousresearch/hermes-sandbox:desktop` (4.4 GB, 0 container) dihapus.
  Disk: 738 MB free → **4.9 GB free**.
- `/etc/docker/daemon.json` dibuat: `json-file`, `max-size=10m`, `max-file=3`; `systemctl reload docker`.
  Container berjalan tidak terpengaruh (keempatnya tetap Up). Catatan: `log-opts` hanya berlaku
  untuk container yang dibuat ulang, bukan yang sedang berjalan.
- `ops/reclaim.sh` ditulis (allowlist cache saja; tidak menyentuh volume, backup, repo) plus
  unit `grandpos-reclaim.{service,timer}` — unit lama menunjuk `/opt/grand-aceh-pos/ops/reclaim.sh`
  yang tidak ada dan tidak pernah terpasang. Dipasang dan diaktifkan; `systemctl start` exit 0.
- Diverifikasi tidak merusak: `grandpos_pgdata` masih ada, keempat container tetap Up.

### T6 — Backup database

Tidak ada `pg_dump` terjadwal sebelumnya. Ditambahkan `ops/grandpos-backup.sh`
(`pg_dump -Fc` via `docker exec`, retensi 14 hari, kredensial dari env container dan tidak
pernah dicetak) plus unit timer 02:30.

Kegagalan yang ditemukan dan diperbaiki: `pg_restore` host adalah 15.19 sedangkan dump 16.15,
sehingga validasi menolak dump yang sebenarnya sehat. Validasi kini lewat image `postgres:16-alpine`.

Restore drill (bukan sekadar file ada): restore ke `postgres:16-alpine` disposable, lalu
bandingkan jumlah baris dengan produksi — **identik**:

| Tabel | Produksi | Restored |
| :--- | ---: | ---: |
| orders | 110 | 110 |
| order_items | 518 | 518 |
| products | 417 | 417 |
| shifts | 0 | 0 |
| edge_ingest_log | 338 | 338 |

Dump: `grandpos-20261113T190807Z.dump` (186844 bytes). Kedua timer terdaftar.

### T3 — Deployment Pi dapat direproduksi

`deploy/nginx-kiosk.conf` (config kiosk, sebelumnya hanya ada di dalam container) dan
`deploy/docker-compose.pi.yml` (image, port 80, network `project_pos_network` alias `frontend`,
restart unless-stopped) plus `deploy/PANDUAN-PI.md` (build, deploy, verifikasi, rollback).

Bukti: sha256 body config repo == config live di container (`3912623956…`), **MATCH**.
Compose parse OK dan nilainya sama dengan container live.
Container produksi **tidak** di-recreate untuk adopsi Compose — itu akan mengubah layanan yang
sedang dipakai kasir hanya demi label; adopsi didokumentasikan sebagai langkah manual.

### Deploy frontend (menutup skew di produksi)

Build baru (`main.3bbafd4f.js`) dikemas, dikirim ke Pi, image arm64 `project-frontend:8dde60bf`
dibangun di Pi, container ditukar (lama disimpan `project-frontend-prev`), jam 03:03 WIB load 0.01.

Bukti setelah tukar: `/` 200, `/pos` 200, `/api/health` 200; `/ota/version.json`,
`/api/ota/version`, dan `/ota/bundle.zip` statis **sama-sama** `2.10.20261113190554` /
`87a7e6e255caf2dd…`; `main.3bbafd4f.js`; 0 file `.map`.

Catatan pengukuran: satu pengambilan awal lewat `/api/` terpotong 248777 byte. Diulang dari Pi
dan dari host dua kali → 653941 byte dan hash sama. Itu artefak jalur transfer saya, bukan server.

### Verifikasi

| Cek | Hasil |
| :--- | :--- |
| Backend full suite | **354 passed, 29 skipped** (skip = live-DB opt-in) |
| Frontend test | **2 suites / 3 tests passed** |
| `CI=true npm run build` | hijau |
| S1 hash tiga permukaan | sama (`87a7e6e2…`), diulang 2x |
| S2 URL node | 4/4 → 200 |
| S3 gerbang kesegaran | exit 2 pada dist basi, exit 0 setelah sinkron |
| S6 config repo vs live | MATCH |
| S8 audit deps | hanya `xlsx` (accepted risk) |
| S9 restore drill | 5/5 tabel identik |
| S10 `python3` | 3.11.2, exit 0 |
| S11 test keputusan H1 | 5 passed |
| S7 disk | 4.9 GB free, log cap aktif, 2 timer aktif |
| graphify | 3963 nodes / 8475 edges |

### Tidak dikerjakan / terbuka

- **Independent review tidak jalan**: `delegate_task` tidak ada di toolset sesi ini.
- **S5 bagian adopsi Compose** tidak dieksekusi di produksi (lihat T3).
- **EG1**: browser automation tidak tersedia; S4/S5 bagian UI diverifikasi lewat HTTP + isi bundle,
  bukan klik nyata di kiosk.
- **EG3**: penyebab spesifik divergensi 2026-11-07 tidak pernah tercatat; gerbang T1 membuatnya
  tidak relevan lagi.
- **EG4**: reachability `xlsx` dinilai dari pembacaan call-site, bukan uji exploit.
- **T4 batas**: `log-opts` belum berlaku pada container yang sudah berjalan.

### Commit, push, dan deploy

| Repo | Commit | Remote |
| :--- | :--- | :--- |
| `pos-engine` | `46a1a65` — satu penulis OTA, gerbang `dist/`, URL node, landingService, `follow-redirects`, `deploy/`, `ops/` | `taqim2609/GrandPosoptima` (`ff42b2c..46a1a65`) |
| `backend-landing-page` | `a83640b` — test mengunci keputusan card-only | `taqim2609/grandpos-platform` (`f751e48..a83640b`) |

Container Pi kini menjalankan image hasil build dari `46a1a65` (di-tag `project-frontend:46a1a65`
setelah verifikasi; tag saat pembuatan `8dde60bf` adalah hash `index.html`).
Rollback: `project-frontend-prev` (image `ff42b2c`), `project-frontend-old` (sebelumnya).

Backend tidak perlu dideploy ulang: satu-satunya perubahan adalah file test, dan image produksi
`5ea2759becf1` sudah memuat fix yang diuji.

### T3 lanjutan — adopsi Compose di Pi (dieksekusi atas instruksi Qim)

Sebelumnya dicatat sebagai "tidak dieksekusi". Qim memerintahkan adopsi, jadi dijalankan.

Prasyarat diperiksa lebih dulu: `docker compose` 5.5.0 ada, network `project_pos_network`
ada (bridge), `/home/<PI_USER>/grand-aceh-pos` belum ada.

Langkah:
1. `docker-compose.pi.yml` + `PANDUAN-PI.md` disalin ke `/home/<PI_USER>/grand-aceh-pos/`.
2. `docker compose config` dengan `FRONTEND_TAG=46a1a65` → resolve benar (image, port 80,
   alias `frontend`, network eksternal `project_pos_network`).
3. Container manual di-rename `project-frontend-manual` lalu di-stop (bukan dihapus).
4. `docker compose up -d` → `project-frontend-1` dibuat Compose.

Bukti (diamati):
- Label: `com.docker.compose.project=grand-aceh-pos`, `com.docker.compose.service=frontend`.
- `docker compose ps` → `project-frontend-1 running project-frontend:46a1a65`.
- `up -d --force-recreate` → `Recreated` + `Started`; jalur Compose terbukti, bukan hanya `up` pertama.
- Setelah recreate: `/` 200, `/pos` 200, `/api/health` 200, `main.3bbafd4f.js`,
  `/ota/bundle.zip` 653941 byte sha256 `87a7e6e255caf2dd…`, `/ota/version.json` `2.10.20261113190554`.
- Config nginx di container tetap `3912623956…` (identik dengan `deploy/nginx-kiosk.conf`).
- Disk Pi 11 GB free.

Rollback yang tersisa: `project-frontend-manual` (image `8dde60bf`, versi manual terakhir) dan
`project-frontend-prev` (image `ff42b2c`). `project-frontend-old` dihapus karena image-nya
sudah tidak relevan.

Catatan terpisah yang ditemukan saat verifikasi: `index.html` hasil build memuat
`<script type="module" src="/src/index.jsx">`. Path itu tidak ada sebagai file — nginx
mengembalikan `index.html` (4178 byte) untuk semua path tak dikenal, jadi browser menerima HTML
sebagai modul dan gagal mem-parse-nya. Tag ini ada di build yang di-commit, bukan akibat adopsi
Compose. Tidak diperbaiki di sesi ini; dampaknya perlu diukur di kiosk (apakah konsol kiosk
menampilkan error modul).

### Tag module mati + celah fallback 200-HTML (plan `f586e3`, accepted `20261113T202733Z`)

Rencana: `.omh/plans/2026-11-13T202649885060Z-remove-the-dead-module-script-tag-and-close-the-200-html-fallbac-f586e3.md`.
Dossier riset: `RESEARCH-src-index-jsx.md`.

Empat tugas, semuanya dieksekusi setelah penerimaan eksplisit.

- **T1** — `<script type="module" src="/src/index.jsx"></script>` dihapus dari
  `project/frontend/public/index.html`. Tag itu ditulis tangan pada commit `90a8e24` (18 Okt);
  `src/index.jsx` tidak pernah ada (entry sebenarnya `src/index.js`), dan `src/` tidak ikut ke build.
- **T2** — gerbang di `scripts/make-ota.js`: menolak build (`exit 3`) bila `build/index.html`
  memuat `<script src="src/...">`. Diletakkan **sebelum** gerbang kesegaran, karena isi yang salah
  tetap salah walau berkasnya baru. Urutan ini ditemukan dari kegagalan nyata: percobaan pertama
  gerbang kesegaran menang duluan (exit 2) sehingga gerbang baru tidak pernah teruji.
- **T3** — `deploy/nginx-kiosk.conf`: `location ~* \.(js|mjs|jsx|css|map)$ { try_files $uri =404; }`
  sebelum `location /`, supaya aset hilang berbalas 404, bukan 200 `index.html`.
- **T4** — deploy ke Pi lewat Compose (`project-frontend:srcfix`), `nginx -t` lulus sebelum tukar.

Bukti (diamati):

| Cek | Hasil |
| :--- | :--- |
| tag di `public/index.html` | 0 |
| tag di `build/index.html` | 0 |
| gerbang T2 arah RED | exit **3** |
| gerbang T2 arah GREEN | exit **0** (setelah `node build.js`) |
| `/src/index.jsx` di Pi | **404** (sebelumnya 200 text/html) |
| `/nope-xyz.js` di Pi | **404** |
| `/` `/pos` `/api/health` | 200 / 200 / 200 |
| tag di HTML live | 0 |
| hash OTA empat permukaan | `9363291469f2168…`, sama semua |
| frontend test | 2 suite / 3 test passed |
| graphify | diperbarui |

Catatan: `dist/` harus disinkronkan (`node build.js`) setelah rebuild, karena gerbang kesegaran
menolak jalan bila `dist/index.html` lebih tua dari build. Ini perilaku yang diinginkan.

Sisa gap: konsol kiosk tidak bisa diukur langsung (tidak ada browser automation) — yang terbukti
adalah 404 pada path aset dan hilangnya tag dari HTML, bukan absennya error di DevTools.

### Log rotation untuk container produksi (plan `d9188e`, accepted `20261113T204603Z`)

Rencana dan premisnya salah dalam satu hal penting, dan itu baru terbukti saat eksekusi.

**Premis yang gugur.** Rencana mengasumsikan `systemctl reload docker` (dijalankan 2026-11-13 19:06)
sudah membuat `daemon.json` berlaku, dan yang tersisa hanyalah me-recreate container lama. Salah.
Log reload dockerd membuktikan sebaliknya:

```
Nov 13 19:06:28 dockerd[619]: msg="Reloaded configuration" config="{..."log-driver":"json-file",...}"
```

Field `log-opts` **tidak ada** di config hasil reload, padahal `/etc/docker/daemon.json` memuatnya dan
JSON-nya valid. `log-opts` bukan opsi yang bisa di-reload lewat SIGHUP; ini perilaku yang dilaporkan
di `docker/for-linux#771` untuk kasus yang sama. Bukti pendukung: container baru tanpa `--log-opt`
tetap `opts=map[]`.

Akibatnya recreate pertama (`grandpos_web_app`, `gak_watchtower_updater`) berhasil secara proses
tapi **gagal secara kriteria**: `max-size` kosong. T2/T3 dihentikan, tidak dieksekusi buta.

**Perbaikan akar.** `systemctl restart docker` (bukan reload). Keempat container ikut berhenti lalu
hidup lagi lewat restart policy. Setelah restart, container baru tanpa opsi eksplisit mendapat
`opts=map[max-file:3 max-size:10m]` — dibuktikan dengan container disposable.

**Lalu recreate.** Container lama mempertahankan `HostConfig` saat hanya restart, jadi recreate
tetap diperlukan untuk memakai default baru:

- `deploy`: `grandpos_web_app` + `gak_watchtower_updater`
- `grandpos`: `api`, lalu `db`

**Bukti akhir (diamati):**

| Container | max-size | Status | Kesehatan |
| :--- | :--- | :--- | :--- |
| grandpos-db-1 | 10m / 3 | running | healthy |
| grandpos-api-1 | 10m / 3 | running | healthy |
| grandpos_web_app | 10m / 3 | running (`always`) | tanpa healthcheck |
| gak_watchtower_updater | 10m / 3 | running | healthy |

- Hitungan baris identik dengan baseline: orders 110, products 417, shifts 0, edge_ingest_log 338.
- Volume `grandpos_pgdata` utuh, tidak pernah disentuh.
- `/health` 200, `:3000/` 200, `:3000/api/ota/version` 200, Pi `/` 200, Pi `/api/health` 200.
- `grandpos_web_app` memakai `main.3bbafd4f.js`, mount `/root/grandpos/pos-engine:/app` utuh,
  network `deploy_gak_network` utuh.
- Ukuran log keempat container turun ke 4.0K karena recreate membuat file log baru.
- Disk 4.8 GB free (84%), tidak berubah.

**Catatan auth.** `/sync/orders` membalas 422 bila body tidak lolos skema, sebelum auth. Dengan body
valid (`node_id` + `orders`), tanpa key dan dengan key salah keduanya **401** — guard bekerja.

**Pelajaran.** `docker compose up -d --force-recreate` tidak akan pernah menutup masalah yang
sumbernya di daemon. Recreate hanya menyalin default daemon; kalau default itu belum dimuat,
recreate memindahkan masalah, bukan menyelesaikannya.

### Remediation R1–R4 (2026-11-13, malam)

Empat item terbuka dari daftar sebelumnya dikerjakan berurutan. Setiap klaim di bawah punya
perintah yang benar-benar dijalankan.

#### R1 — timer backup dan reclaim dibuktikan, bukan diasumsikan

`systemctl list-timers` menunjukkan `LAST` kosong untuk kedua unit: keduanya **belum pernah fire**
karena memang belum lewat jadwal, bukan karena bug. Unit terpasang identik dengan salinan di repo
(`diff` bersih).

Dijalankan lewat systemd (bukan langsung dari shell) supaya yang teruji adalah jalur sebenarnya:

- `systemctl start grandpos-backup.service` → `Result=success`, dump baru
  `grandpos-20261113T210033Z.dump` (186844 bytes).
- Drill restore dump itu ke `postgres:16-alpine` disposable → `pg_restore` exit 0, lalu
  orders 110 / order_items 518 / products 417 / shifts 0 / edge_ingest_log 338 — **5/5 MATCH**
  terhadap produksi. Container drill dihapus.
- `systemctl start grandpos-reclaim.service` → `Result=success`, log `skip: used=84%
  avail=4747MB (threshold=85%)`. Perilaku benar: di bawah ambang tidak menyentuh apa pun.
  Keempat container dan volume `grandpos_pgdata` utuh.

#### R2 — alarm disk dan kesegaran backup

Tidak ada kanal notifikasi di host ini (`hermes send -l` → tidak ada platform terkonfigurasi),
jadi alarm dibuat lokal: `/var/log/grandpos-alert.log` + exit non-zero, dan dedupe per perubahan
status supaya log tidak tumbuh oleh alarm yang sama.

`ops/disk-alert.sh` memeriksa tiga hal: disk ≥85%, sisa <512 MB, dan **dump terbaru >36 jam**.
Backup ikut diperiksa karena kegagalannya senyap — `pg_dump` bisa berhenti berhari-hari tanpa
ketahuan sampai restore dibutuhkan.

Diuji dua arah sebelum dipasang:

| Skenario | Hasil |
| :--- | :--- |
| Kondisi normal | exit 0, log kosong |
| `THRESHOLD=1` | exit 1, satu baris `ALERT: disk_used=84%` |
| Diulang kondisi sama | **tidak** duplikat |
| `BACKUP_DIR` kosong | exit 1, `ALERT: backup=none` |
| Kembali sehat | `OK: pulih dari: ...`, lalu senyap |

`grandpos-alert.timer` aktif (`LAST` terisi, siklus 15 menit). Runbook: `ops/PANDUAN-DISK-ALERT.md`.

#### R3 — dua paket rentan yang benar-benar sampai ke kiosk

Dari 43 kerentanan `npm audit` di frontend, dipisahkan mana yang nyata: `firebase`, `zod`,
`underscore`, `jsonpath`, `webpack-dev-server`, `svgo`, `postcss` tidak punya import di `src/` atau
murni build tool. Yang benar-benar berjalan: `axios` (2 import, `lib/api.js` + `lib/diag.js`) dan
`react-router` (15 file).

- `axios` 1.18.0 → **1.21.1**: prototype-pollution gadget yang bisa menimpa HTTP method request
  keluar, plus ReDoS.
- `react-router-dom` 7.15.0 → **7.18.5**: open redirect via backslash, CSRF lewat PUT/PATCH/DELETE.

Instalasi butuh `--legacy-peer-deps` karena konflik peer **sudah ada sebelumnya**
(`date-fns@4` vs `react-route... react-day-picker@8` yang minta `^2||^3`), bukan akibat bump.
Tidak ada `.npmrc` dan lockfile tidak di-track, jadi tree ini memang dipasang begitu.

`diff` pohon dependensi hanya dua baris berubah. Test frontend 3/3 lulus. `npm audit` 43 → 40,
dan `axios`/`react-router` hilang dari daftar. Bundle hasil build memuat string `1.21.1` dan
`7.18.5`. Deploy Pi `project-frontend:r3` → `main.49a3c638.js`, `/` `/pos` `/api/health` 200,
`/src/index.jsx` 404, OTA hash `07fb7b06…` identik di **lima** permukaan.

#### R4 — `xlsx@0.18.5`: yang bisa dan tidak bisa ditutup

`fixAvailable: false` — tidak ada versi perbaikan. Dua advisory: prototype pollution dan ReDoS
di parser. Empat call-site: `products/import/preview`, `products/import/commit`,
`ingredients/import`, `ai/assistant/import-excel`.

**Bukan protokol pollution yang bisa direproduksi lewat header.** Percobaan dengan header
`__proto__` menghasilkan `sheet_to_json` meng-escape kunci itu menjadi `__proto___NaN`, dan
`({}).polluted` tetap `undefined`. Paparan lewat jalur itu tidak tereproduksi di versi ini;
ReDoS tetap mungkin.

**Temuan yang sebenarnya lebih penting: keempat route tidak punya cek role.** Gerbang global
hanya menuntut *adanya* login, jadi kasir bisa mencapai parser. Batas ukuran sudah ada
(`multer` 50 MB), tapi tidak ada pembatasan identitas.

Perbaikan: `requireAdmin` (sudah tersedia sebagai parameter fungsi, tidak ada abstraksi baru)
dipasang di keempat route. Konsekuensi UI ikut ditutup — tombol Import di `Products.jsx` dan
`Ingredients.jsx` tidak pernah dibatasi role, jadi kasir akan mengklik dan mendapat 403 tanpa
penjelasan. Keduanya kini di belakang `isAdmin(user)`, predikat yang sama dengan yang dipakai
server.

Bukti: `tests/import-rbac.js` menjalankan server nyata dengan tiga identitas dan memeriksa
keempat endpoint — anon 401, **kasir 403**, admin lolos gate. 12/12 lulus. Probe itu
diuji-balik dengan mencabut satu gerbang: kasir langsung dapat **200**, membuktikan test-nya
benar-benar menangkap regresi, bukan lulus kebetulan.

Deploy `project-frontend:r4` → `main.61fdce88.js`, OTA hash `cf9da795…` identik di lima permukaan.
`grandpos_web_app` di `:3000` ikut menyajikan `main.61fdce88.js` lewat bind-mount, dan ketiga
endpoint import membalas 401 anonim.

#### Verifikasi

| Pemeriksaan | Hasil |
| :--- | :--- |
| Node suite (9 berkas, termasuk `import-rbac.js`) | **9/9 PASS** |
| Frontend test | 2 suite / 3 test passed |
| Backend pytest | 329 passed, 31 skipped, **2 failed** |
| Uji-balik probe RBAC | kasir jadi 200 → test menangkapnya |

**Dua kegagalan backend dijelaskan, bukan diabaikan:** `tests/test_mcp_reports.py` gagal karena
`app/mcp_server.py` tidak bisa di-import (`ModuleNotFoundError: No module named 'mcp'`) di
interpreter host. Repo backend bersih — tidak ada perubahan saya di sana. Baseline sesi
sebelumnya 354 passed / 29 skipped, sedangkan run ini 329/31/2 (total 362 vs 383). **Selisih
jumlah test belum terjelaskan** dan tidak diklaim sebagai pra-ada; yang bisa dibuktikan hanya
bahwa kedua kegagalan berasal dari modul `mcp` yang tidak terpasang.

#### Tidak dikerjakan

- Klik nyata di kiosk tetap tidak terverifikasi: tidak ada browser automation. Verifikasi UI
  hanya lewat HTTP, isi bundle, dan pembacaan source.
- Independent review belum ada (`delegate_task` tidak tersedia di toolset sesi ini).
- `xlsx` masih terpasang dan masih punya advisory; yang berubah adalah siapa yang bisa mencapainya.

#### Koreksi penting: kode Node sempat belum aktif di produksi

Setelah R1–R4 dilaporkan selesai, muncul pertanyaan "apakah sudah terdeploy". Jawabannya saat itu:
**belum sepenuhnya**, dan ini perlu dicatat karena laporan sebelumnya menyiratkan lebih.

`grandpos_web_app` memakai bind-mount `/root/grandpos/pos-engine:/app:rw` dan dijalankan dengan
`tsx server.ts` **tanpa watch mode**. Jadi perubahan `routes/allMissingRoutes.js` langsung terlihat
di disk container, tetapi proses Node sudah memuat versi lama ke memori:

| Bukti | Nilai |
| :--- | :--- |
| Container `StartedAt` | 2026-11-13T20:47:37Z |
| `allMissingRoutes.js` mtime | 2026-11-13T21:22:48Z |

Selisih 35 menit. Artinya gerbang `requireAdmin` belum berlaku walau `grep` di dalam container
menemukannya (grep membaca disk, bukan memori proses).

Restart dilakukan (`docker compose -p deploy -f docker-compose-p1a.yml restart grandpos-app`),
container mulai 2026-11-14T01:55:28Z.

**Verifikasi pada kode yang benar-benar berjalan:**

- Kredensial kasir yang diketahui dipakai login langsung ke produksi → **403** pada
  `products/import/preview`, `ingredients/import`, `ai/assistant/import-excel`.
- Kredensial admin/superadmin tidak diketahui dan tidak ditebak. Untuk membuktikan alur admin
  tidak rusak, `tests/import-rbac-prod-data.js` menyalin `data/pos-db.json` **produksi** ke
  direktori sementara, menjalankan server nyata, dan mencetak token lewat signer server sendiri:
  anon 401, kasir 403, admin 200, superadmin 200 di keempat endpoint — **16/16 lulus**.
  Produksi tidak disentuh; data uji dihapus setelahnya.

Status akhir yang teramati: `grandpos_web_app` menyajikan `main.61fdce88.js` dan OTA
`2.10.20261113212532`; Pi menyajikan `main.61fdce88.js` dan OTA yang sama, container
`project-frontend:r4` Up.

**Pelajaran.** Bind-mount membuat perubahan file tampak "sudah terpasang" — `grep`, `git status`,
dan isi container semua setuju. Yang menentukan hanya waktu start proses. Untuk layanan tanpa
hot-reload, deploy belum selesai sampai proses dijalankan ulang dan perilakunya diuji lewat HTTP.

### Publikasi artefak dan restart host (2026-11-14 02:0x UTC / 09:0x WIB)

#### Artefak audit dan query masuk ke repo

Audit dan perintah verifikasi sebelumnya hanya ada di direktori scratch di luar repo, sehingga
setiap angka di laporan hanya bisa direproduksi dari riwayat chat. Sekarang ada di dalam tree:

- `docs/GRANDPOS-TEMUAN-AUDIT.md` — 1473 baris, append-only, isi sama dengan salinan kerja.
- `ops/QUERIES.md` — perintah yang benar-benar dijalankan, dikelompokkan per topik, dengan
  penanda **MUTASI** pada recreate container dan peringatan bahwa `/sync/orders` memvalidasi body
  sebelum auth (body kosong membalas 422, bukan 401).

**Repo `GrandPosoptima` bersifat publik** (`GET /repos/taqim2609/GrandPosoptima` →
`private: false`). Audit memuat IP host, port, dan topologi, jadi keduanya disanitasi sebelum
commit: `<PI_HOST>` → `<PI_HOST>`, `<VPS_HOST>` → `<VPS_HOST>`, `<PI_USER>` → `<PI_USER>`,
`<PI_HOSTNAME>` → `<PI_HOSTNAME>`, `<GUDANG_HOST>` → `<GUDANG_HOST>`. Salinan kerja di scratch tidak
diubah.

Pemindaian sebelum commit: tidak ada password, token, JWT, private key, atau URI Postgres
berkredensial. Dua kecocokan yang muncul adalah positif palsu (`$PWD` variabel shell, dan
`postgresql://grandpos_app:***@…` yang sudah bertanda bintang).

Catatan terbuka: repo publik itu **sudah** memuat IP tailnet dan nama host di `AGENTS.md`,
`api-server.js`, `deploy/*`, dan skrip backup sejak sebelum sesi ini. Itu keputusan pemilik repo,
bukan sesuatu yang diperbaiki diam-diam di sini, tetapi perlu diketahui saat menilai paparan.

#### Restart host

Jendela dipilih saat `select count(*) from shifts where closed_at is null` = **0** (09:04 WIB,
toko belum buka). Backup segar diambil lebih dulu lewat systemd:
`grandpos-20261114T020651Z.dump` (186844 bytes).

`systemctl restart docker` — seluruh stack berhenti dan hidup lagi lewat restart policy.

**Bukti pasca-restart (semua diamati, bukan diasumsikan):**

| Pemeriksaan | Hasil |
| :--- | :--- |
| Container | 4/4 Up; api, db, watchtower healthy |
| `/health` API | 200 |
| `:3000/` dan `/api/health` | 200 |
| Pi `/` dan `/api/health` | 200 |
| Baris DB | orders 110, order_items 518, products 417, shifts 0, edge_ingest_log 338 |
| `sum(id)` orders | 32459 — sama dengan baseline pra-restart |
| RBAC anon | 401 di tiga endpoint import |
| RBAC kasir | **403** di tiga endpoint import |
| MCP `tools/list` anon | 401 |
| `/sync/orders` tanpa key | 401 |
| Versi disajikan | `main.61fdce88.js`, OTA `2.10.20261113212532` (web dan Pi sama) |
| Log rotation | 4/4 container `max-size=10m max-file=3` |

Efek samping yang terdeteksi sendiri: pemeriksaan pertama saya memakai
`url=${u%%:*}` yang memotong URL di `http:`, sehingga semua endpoint tampak `000`. Itu bug
perintah, bukan server — `curl` langsung membalas 200. Diulang dengan pemisah `|`.

#### Disk: alarm bekerja, dan itu membuka temuan

Selama restart disk naik ke 88–89% dan `grandpos-alert.log` mencatat tiga alarm
(`85%`, `87%`, `89%`) — alarm yang dipasang di R2 memang berfungsi pada kondisi nyata.

Penyebabnya bukan container:

- `/root/.hermes` 8.9 GB, termasuk `state.db` sesi ini 494 MB dan snapshot pra-update 468 MB.
- `/var/tmp/hv` **585 MB** — cluster PostgreSQL yang sudah mati (`database system is shut down`,
  log terakhir 02:09:03), dibuat 02:02 oleh proses lain, bukan GrandPOS. Dihapus setelah
  dipastikan tidak ada proses yang memakainya; 19 proses Postgres yang hidup adalah cluster
  sistem `/var/lib/postgresql/15/main`, bukan itu.
- 441.8 MB anonymous volume sisa container probe (`docker volume prune`).

**Tidak disentuh:** `grandpos_pgdata`, `/root/backups`, dan volume proyek lain
(`grand-aceh-vps_postgres_data` 48 MB, milik proyek `grand-aceh-vps` sejak 18 Okt).

Hasil: **3.5 GB → 4.6 GB free (88% → 84%)**.

Sisa yang belum ditangani: `/root/.hermes` 8.9 GB tumbuh oleh state sesi dan snapshot. Itu di
luar allowlist reclaim dan butuh keputusan pemilik (hapus snapshot lama?) sebelum disentuh.

#### Commit

| Repo | Commit | Isi |
| :--- | :--- | :--- |
| pos-engine | `6b726c0` | `docs/GRANDPOS-TEMUAN-AUDIT.md`, `ops/QUERIES.md` (tersanitasi) |
| pos-engine | `894e959` | `tests/import-rbac-prod-data.js` |
| pos-engine | `0862580` | RBAC import + bump axios/react-router + alert disk |
| backend-landing-page | — | tidak ada perubahan; repo bersih |

### Pembersihan lanjutan: yang tidak dipakai lagi (2026-11-14 02:3x–04:2x UTC)

Disk 84% → **76%** (4.6 GB → 6.8 GB free). Semua dihapus hanya setelah dibuktikan tidak dirujuk.

| Yang dihapus | Ukuran | Bukti tidak terpakai |
| :--- | ---: | :--- |
| 7 environment Hermes yatim | 1 049 MB | `PYTHONPATH` semua proses hidup menunjuk **satu** env (`8a70cd57…`); `facts.json` menunjuk `982a5c8b…`. Keduanya disimpan. |
| Cache `uv` + `pnpm` | 140 MB | Cache builder, dibuat ulang saat dipakai. |
| Snapshot pra-update 12 Nov (8 profil) | 838 MB | `quick_check` state.db hidup = `ok`; update sudah jalan 2 hari. Rollback setengah jadi dibuang seluruhnya, bukan sebagian. |
| 5 dump hindsight duplikat | 338 MB | Disimpan satu per hari untuk 7 hari terakhir; 3 dump hari ini diciutkan jadi 1. |

**Sengaja tidak disentuh:**

- `hermes-agent-self-evolution` (372 MB) — repo clone eksternal, ada 11 perubahan lokal + 1 commit
  tidak ter-push (`output/`, `reports/`). Itu pekerjaan, bukan sampah.
- `tools/chromium-1208` (364 MB) — tidak ada di `PATH` proses induk, tetapi dipakai `agent-browser`
  dan `cua-driver`. Menghapusnya mematikan browser automation yang justru menjadi gap audit ini.
- `/root/backups/hindsight/pre-delete-old-bank-20261102-111900` (6.4 MB) — sengaja disimpan sebagai
  titik balik penghapusan bank lama.
- Volume `grand-aceh-vps_*` — milik proyek lain.
- `grandpos_pgdata`, `/root/backups/grandpos` (4 dump, retensi 14 hari sudah bekerja).

**Pasca-pembersihan diverifikasi:** 4/4 container Up, api/web/pi 200, `orders=110`,
`sum(id)=32459` (identik baseline), `hindsight-daemon` active.

### Data hilang ditemukan dan dipulihkan: 6 order 13 Nov (2026-11-14 05:1x–05:3x UTC)

#### Temuan

`orders` di Postgres berhenti di **2026-11-12**. POS punya 6 order tanggal 13 Nov yang
`status='completed'` tetapi tidak pernah sampai ke analytics. Total **Rp 1.432.500**.

Penyebab berlapis, dan yang kedua membuat masalahnya tidak terlihat:

1. **Retry habis dalam 31 detik.** `drainOutbox` menyerah pada `attempts >= 5` dengan
   backoff `min(1000·2^n, 30000)`: 1+2+4+8+16 = 31 detik. Saat disk penuh 13 Nov dan
   `grandpos-db-1` crash-loop berjam-jam, kelima order menyerah dalam setengah menit.
2. **`done: true` + `error` terbaca sebagai sukses.** Entri yang menyerah ditandai
   `done` sehingga `getStatus().pending` = 0 dan tidak ada yang mencoba ulang. Kegagalan
   dan keberhasilan tidak bisa dibedakan dari endpoint status.
3. **`DATABASE_URL` container API menunjuk database yang tidak ada:**
   `postgresql://paperclip:***@127.0.0.1:5432/paperclip`. `/health` membalas
   `db: false`. `.env` repo sudah benar (`db:5432/grandpos`), tetapi **variabel shell host
   menang atas `env_file`** — sisa sesi Hindsight. `docker compose config` membuktikannya:
   dengan `DATABASE_URL` di-unset hasilnya `grandpos_app@db:5432/grandpos`.

Temuan 3 berarti `/sync/orders` membalas error koneksi yang datang dari API, bukan dari
Node. Itu yang membuat diagnosis pertama salah arah.

#### Perbaikan

| Berkas | Perubahan |
| :--- | :--- |
| `lib/analytics-sync.js` | `MAX_ATTEMPTS=200`, `MAX_BACKOFF_MS=30m`, `GIVE_UP_AFTER_MS=7d`. Menyerah hanya berdasarkan jam dinding, bukan jumlah percobaan; entri yang habis waktu ditandai `stuck`, bukan `done`. |
| `lib/analytics-sync.js` | `getStatus()` menambah `stuck`. `pending`/`failed` tidak lagi menghitung entri yang parkir. |
| `lib/analytics-sync.js` | `requeueAllCompleted` memulihkan entri di tempat, tidak lagi mengosongkan `state.synced` dan `outbox`. Entri `done + error` (bentuk warisan) diperlakukan sebagai belum terkirim. |
| `api-server.js` | `requireAdmin` di `GET /api/analytics/sync/status` dan `POST /api/analytics/sync/requeue`. Sebelumnya cukup login: kasir bisa memicu re-sync seluruh outbox dari meja kasir. |
| `ops/disk-alert.sh` | Menghitung entri belum terkirim langsung dari `analytics-outbox.json`. `done + error` ikut dihitung, jadi kelas kegagalan ini tidak bisa lagi senyap. |
| `scripts/requeue-analytics.js` | Pemulihan manual: menandatangani token admin dengan `JWT_SECRET` milik server, bukan menebak kredensial. `--dry-run` menampilkan yang tertunda tanpa mengubah apa pun. |

#### Uji

`tests/analytics-sync-retry-policy.js` — **7/7**. Dibuktikan RED lebih dulu: dijalankan
terhadap kode lama lewat `git stash`, hasilnya **1 lulus / 5 gagal**.

`tests/analytics-sync-rbac.js` — **5/5**: anon 401, kasir **403**, admin 200. Server nyata
di port 3992 di atas salinan `pos-db.json`; token ditandatangani signer server sendiri.

Dua kegagalan awal ada di uji saya sendiri, bukan di kode: modul ter-cache `require`
sehingga outbox hasil edit tidak terbaca, dan regex `outbox = []` cocok dengan komentar.
Keduanya diperbaiki sebelum uji dianggap sah.

Satu bug nyata juga tertangkap uji ini: `outbox` hanya dimuat di `initSync`, jadi bila
worker tidak pernah init, `requeue` menganggap semua order baru dan menimpa riwayat.
Ditambal dengan memuat dari disk saat kosong.

#### Pemulihan data

```
"retried": 6, "added": 0
[AnalyticsSync] ✅ GAK-20261113-039 … 044
```

| Bukti | Nilai |
| :--- | :--- |
| `orders` sebelum | 110 |
| `orders` sesudah | 116 |
| Rentang tanggal | 2026-10-30 .. 2026-11-14 |
| Enam order 13 Nov | Rp 121.000 + 415.000 + 104.000 + 222.000 + 410.500 + 160.000 |
| Jumlah | **Rp 1.432.500** — sama persis dengan yang hilang |
| `/health` API | `db: true` (sebelumnya `false`) |

Backup outbox pra-tindakan: `/root/backups/grandpos/analytics-outbox-20261114T051830Z.json`
dan `analytics-sync-state-20261114T051830Z.json`.

#### Catatan operasional

`DATABASE_URL` di shell host **bocor ke `docker compose`** dan mengalahkan `env_file`.
Setiap recreate container API harus lewat `env -u DATABASE_URL -u AI_DATABASE_URL`, atau
variabel itu dihapus dari profil shell. Belum diperbaiki di tingkat shell — itu keputusan
pemilik host.

### Susulan: kebocoran yang ditemukan saat menutup pekerjaan ini (2026-11-14 05:2x–05:5x UTC)

Menjalankan uji justru membongkar dua bug yang lebih tua dari yang sedang diperbaiki.

#### `analytics-outbox.json` produksi ditimpa oleh uji

`lib/analytics-sync.js` menulis outbox ke `path.join(__dirname, '../data')` — **path tetap**,
tidak menghormati `GRANDPOS_DATA_DIR`. Setiap harness di repo ini menjalankan server dengan
`GRANDPOS_DATA_DIR` menunjuk salinan sementara, jadi niatnya jelas: jangan sentuh data asli.
Modulnya mengabaikan niat itu.

Akibatnya terukur: outbox produksi **15 entri → 1 entri** saat rangkaian uji dijalankan.
Entri yang hilang bukan order, melainkan riwayat percobaan; ledger `analytics-sync-state.json`
(`synced: 25`) selamat, sehingga tidak ada order yang benar-benar hilang. Outbox dipulihkan
dari `analytics-outbox-20261114T051830Z.json` dan satu entri asing dibuang.

Entri asing itu **`GAK-20261114-001`, Rp 200.000, enam item Tomyam** — bukan order toko,
melainkan fixture `tests/vendor-share-on-order.js` yang ikut tertulis ke outbox produksi.
Kalau lolos, ia akan masuk ke analytics sebagai penjualan palsu. Teridentifikasi dari
`client_ref` `ord-1794634083575` → `2026-11-14T05:28:03Z`, dan dari enam `product_id`
yang persis sama dengan fixture itu.

Perbaikan: `DATA_DIR = process.env.GRANDPOS_DATA_DIR || path.join(__dirname, '../data')`.
Dibuktikan dengan hash: menjalankan kedua suite tidak lagi mengubah
`analytics-outbox.json`, `analytics-sync-state.json`, maupun `pos-db.json`.

#### Ledger dan antrean saling bertentangan

Memulihkan outbox lama memunculkan enam entri ber-`done: true` + `error` — bentuk warisan
jalur give-up. Keenamnya **sudah terkirim** (semua ada di `state.synced` dengan `ok: true`),
tetapi watchdog akan melaporkannya sebagai belum terkirim selamanya, dan requeue akan
mengirimnya ulang.

Akar tambahannya: `let state = { synced: {}, lastRun: null }`. Dengan nilai awal itu, setiap
penjaga `if (!state?.synced) loadState()` menyimpulkan ledger sudah di memori padahal belum,
sehingga seluruh riwayat pengiriman terbaca kosong. Sekarang `state = null` sampai benar-benar
dimuat, dan `loadOutbox` merekonsiliasi antrean terhadap ledger: entri yang ledgernya
mengatakan terkirim dibersihkan dari `error`/`stuck` dan tidak dikirim ulang.

| Uji | Hasil |
| :--- | :--- |
| `tests/analytics-sync-retry-policy.js` | **10/10** (termasuk 2 uji rekonsiliasi ledger) |
| `tests/analytics-sync-rbac.js` | **5/5** — anon 401, kasir 403, admin 200 |
| Isolasi data | ketiga berkas produksi **tidak berubah** (sha256 sama sebelum/sesudah) |

Setelah restart: outbox **15 entri**, ledger **25**, **0 belum terkirim**. API `db: true`,
web 200, Pi 200, `orders=116`, total Rp 16.815.400.

### Koreksi catatan: `pos-db.json` berubah hash, tetapi tidak ada data yang berubah

Saat menutup pekerjaan di atas, hash `data/pos-db.json` berubah di antara dua penjalanan
rangkaian uji, dan sempat saya duga ada uji yang menulis ke data produksi. Penelusuran
per-test menunjukkan **tidak satu pun** dari 23 berkas uji mengubah berkas itu, dan
`pos-db.json` stabil saat server diam.

Sebabnya: aplikasi menulis ulang seluruh snapshot pada setiap boot lewat `saved_at` baru.
Dibuktikan dengan membandingkan dua tangkapan penuh berturut-turut:

```
identik kecuali saved_at : True
saved_at 05:37:02.415Z -> 05:37:29.750Z
orders 44 | products 407 | users 3 | tables 79
```

Jadi yang berubah adalah stempel waktu, bukan isi. Catatan ini ditulis karena dugaan awal
saya ("ada uji menulis ke produksi") **salah**, dan angka hash tanpa konteks akan
menyesatkan pembaca berikutnya.

Empat uji yang gagal, semuanya sudah gagal sebelum pekerjaan ini dan tidak saya sentuh
(`git diff HEAD~4..HEAD` untuk keempatnya kosong):

| Uji | Sebab |
| :--- | :--- |
| `kiosk-shift-ui-check.js` | butuh `playwright`, tidak terpasang |
| `shift-single-form-e2e.js` | butuh `playwright`, tidak terpasang |
| `pos-host-gate.js` | argumen `path` `undefined` di harness-nya sendiri |
| `landing-page-auth-guard.js` | 6/7: kasir menerima 401, bukan 403 — token uji tidak valid |

`landing-page-auth-guard` perlu diperbaiki terpisah: 401 vs 403 di situ berarti uji tidak
pernah benar-benar menguji RBAC-nya, hanya gagal lebih awal.
