# GrandPOS — Paket AI Studio (Grand Aceh Kuliner)

## 1. Arsitektur singkat
- Backend: FastAPI (app/api.py) + PostgreSQL 16. Uang BIGINT IDR. Berat NUMERIC. TZ Asia/Jakarta.
- Transaksi: conn.transaction() per alur bisnis. SELECT FOR UPDATE untuk shift. Idempotency key di pay.
- Kasir/POS UI -> REST API (port 8000) -> services.py -> rules.py -> PostgreSQL.
- AI: Hermes API Server /v1/chat/completions (profil pos-analyst) baca via role read-only grandpos_ai.
- WA: gateway Node/Baileys. Outbox webhook /webhooks/grandpos-outbox (HMAC, deliver_only). Inbound zero-LLM: /stok, /laporan-shift, /dashboard, #reservasi.
- Verifikasi: pytest 131 passed, node 15/0, static 61/0, smoke Postgres variance 0.

## 2. Skema DB (24 tabel + 4 view)
- users, user_credentials, settings, categories, products, vendors, vendor_settlements
- tables, members, promos, coupons, ingredients, recipes, inventory_movements
- shifts, cash_movements, orders, order_items, payments
- member_point_ledger, coupon_redemptions, audit_logs, order_voids
- reservations, articles, outbox_messages
- View: v_daily_turnover, v_shift_cash, v_low_stock, v_weekly_best_sellers
- File penuh: db/schema.sql (709 baris). Seed: db/seed.sql (taqim2609 SUPERADMIN nonaktif, meja, Mie Aceh, Kopi Sanger, Ayam Tangkap, Nasi Goreng Aceh, Kopi Gayo, Teh Tarik).

## 3. Jalur masuk (endpoint)
- GET /health
- POST /shifts/open, GET /shifts/active/summary, POST /shifts/{id}/close
- POST /cash-movements
- POST /orders, POST /orders/{id}/pay (header idempotency-key), POST /orders/{id}/void
- GET /reports/low-stock, GET /reports/dashboard, GET /reports/best-sellers
- GET /vendors/{id}/settlements
- POST /reservations/intake
- POST /wa/inbound (sender, text, delivery_id)
- Auth: API key via Depends(require_key). AI baca via grandpos_ai (SELECT view saja).

## 4. Aturan bisnis inti
1. F&B dine-in/takeaway vs retail pisah (order_type + channel).
2. Kiloan: total = weight_kg x base_price, HALF_UP ke IDR.
3. Diskon outlet: kurangi revenue, tidak potong HPP/komisi.
4. Settlement vendor saat close shift, sekali, amount 0 di-skip kas tapi tetap tercatat.
5. Poin/kupon hanya saat PAID, revert saat VOID (ledger kompensasi).
6. Rekonsiliasi: expected = opening_float + sale_cash + void_reversal + cash_in - cash_out - vendor_cash. variance = counted - expected.

## 5. Target deploy / VPS
- Dev saat ini: /root/grandpos/backend-landing-page (host gudang-644, Docker 29.9.1).
- Target produksi: server grandpos 100.109.98.56 (SSH taqim258@grandpos).
- Status: BELUM deploy. Stack smoke masih jalan lokal. Matikan manual: docker compose down.
- Yang dibutuhkan deploy: .env produksi, postgres volume, backup, CCTV? tidak. Perlu: API_SERVER_KEY, OUTBOX_SECRET, allowlist WA owner/kasir.

## 6. File rujukan
- db/schema.sql, db/seed.sql, db/roles.sql, db/bootstrap_superadmin.sql
- docker-compose.yml, .env.example, app/, gateway/, pos-analyst/SYSTEM_PROMPT.md
- README.md, EVIDENCE.md, docs/hermes-api-server.md, docs/hermes-webhook-outbox.md
