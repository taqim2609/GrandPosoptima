# GRANDPOS — Ringkasan Akhir Implementasi (2026-10-17)

## Status: SELESAI — semua gate hijau

| Gate | Hasil |
|---|---|
| pytest penuh | **195 passed, 5 skipped, 1 warning** |
| Node (gateway Baileys) | **15 pass / 0 fail** |
| check_static.py | **61 passed / 0 failed** |
| Go-live regression (PostgreSQL 16 hidup) | **R1–R5 ALL PASS, exit 0** |

## Yang dibangun

### Fondasi (tugas awal)
- PostgreSQL 16 + FastAPI, Docker Compose, tanpa Firebase.
- 24 tabel + 4 view analitik; seed taqim2609 (SUPERADMIN nonaktif) + menu Aceh.
- REST API lengkap: shift, order, bayar, void, kas, settlement, reservasi, laporan.
- Endpoint AI Hermes (pos-analyst, read-only via role `grandpos_ai`).
- WhatsApp gateway Baileys: outbox HMAC + perintah zero-LLM.

### Hardening offline-first (4 langkah dari rekomendasi AI Studio)
1. **Optimistic locking + laci per-kasir** — `orders.version`/`shifts.version`, `expected_version` di pay/void/close; `shifts.cashier_id` + index unik parsial. Pesan: "order changed by another cashier, refresh". (139 tes)
2. **Decouple WhatsApp** — outbox best-effort dalam SAVEPOINT, retry worker `SKIP LOCKED`, backoff 1m/5m/15m, dedupe key, `OUTBOX_ENABLED` kill-switch. Thermal print = bukti utama. (184 tes)
3. **Guard degraded-mode** — offline memblokir tutup shift + kas keluar (409), penjualan tetap boleh; `GET /system/connectivity`. (191 tes)
4. **5 regression go-live** — `tests/test_go_live_regression.py` + `scripts/run_go_live_regression.sh` + `docs/GO_LIVE_CHECKLIST.md`. (195 tes)

### 5 Regression (bukti nyata, PostgreSQL hidup)
- R1 2 kasir bayar bersamaan → tepat 1 pemenang ✅
- R2 WhatsApp mati saat bayar → penjualan tetap commit, struk antre ✅
- R3 rekonsiliasi penuh → expected 122.072, variance 0, vendor sekali ✅
- R4 webhook duplikat → 1 kirim ✅
- R5 role AI → 4 view boleh, orders + CREATE TABLE ditolak ✅

## Bug nyata yang tertangkap dan diperbaiki
1. **7 bug runtime** (smoke flow): constraint collision (2x), bootstrap, healthcheck, DSN, `_one` vs RETURNING, settlement skip 0%.
2. **Multi-vendor settlement blocker (R3)**: shift dengan ≥2 vendor titipan tidak bisa ditutup (HTTP 500). Fix Opsi A: settlement mereferensi baris settlement sendiri; close_shift idempoten. Detail: `docs/FINDING-multi-vendor-settlement.md` (status FIXED).
3. **Tanda cash_in/out terbalik di view `v_shift_cash`** — diperbaiki (murni tanda baca view).
4. **Tooling**: `rtk-rewrite` memalsukan output pytest → di-exclude di `/root/.config/rtk/config.toml`; `check_static.py` kini gagal bila pytest mengoleksi 0 tes.

## File kunci
- `db/schema.sql`, `db/seed.sql`, `db/roles.sql`, `db/migrations/0002_optimistic_lock.sql`
- `app/` (api, services, rules, outbox, outbox_delivery, signing, guard, parsers, db)
- `gateway/` (Baileys), `scripts/` (check_static, outbox_worker, run_go_live_regression)
- `docs/` (GO_LIVE_CHECKLIST, FINDING-multi-vendor-settlement, hermes-api-server, hermes-webhook-outbox, AISTUDIO_PACKET, AISTUDIO_SEND)

## Keadaan saat ini / sisa pekerjaan
- Stack Docker lokal (grandpos-db, grandpos-api) masih RUNNING di gudang-644 dengan data uji. Hentikan: `docker compose down` (tambah `-v` untuk hapus volume uji).
- Belum ada commit git (folder bukan repo). Belum deploy ke mana pun.
- Belum dibangun: Local Master-Worker fisik (PC master + LAN di outlet) — rekomendasi AI Studio untuk offline-first nyata.
- 4 temuan minor non-blocking step 2/3: dry-run tanpa secret raise SignatureError; duplikat WA at-least-once mungkin bila worker crash antara POST dan mark_sent (ditahan ReplayGuard); backoff lease 60s < batch worst-case 200s; (step 3) detail di komentar review.
- Repo GitHub `taqim2609/GrandPosoptima` (aplikasi lama) masih ada — hapus manual bila perlu.

## Cara menjalankan verifikasi ulang
```bash
cd /root/grandpos/backend-landing-page
python3 -m pytest -q
node --test gateway/test/*.test.js   # dari folder gateway/
python3 scripts/check_static.py
scripts/run_go_live_regression.sh    # 5 gate go-live, PostgreSQL hidup
```
