# GrandPOS Self-Hosted Platform — Implementation Contract

Build a production-oriented, locally runnable reference implementation for Grand Aceh Kuliner POS. Do not deploy, alter live Hermes config, create credentials, commit, push, or restart any service.

## Source request

Permintaan sumber (2026-10-17) berupa lampiran di luar repo dan tidak ikut
disalin; keputusan arsitektur di bawah adalah kontrak yang dihasilkan dari
permintaan itu.

## Architecture decisions

- PostgreSQL 16, not SQLite: concurrent cashier/shift writes, ledger integrity, transactional stock/member/vendor operations.
- Backend: choose FastAPI or Express and state the choice in README. Prefer the stack that yields the clearest transactions and tests.
- Money: integer IDR (`BIGINT`) only; weights use `NUMERIC`, never float.
- Jakarta timestamps and explicit audit fields.
- Keep core accounting in append-only ledger tables plus transactional service code. Do not rely only on mutable balance columns.
- The requested table names must exist. Supporting tables are allowed and expected (payments, inventory movements, member point ledger, coupon redemptions, audit/void records, etc.).

## Required files and capabilities

1. `db/schema.sql`: DDL for at least users, categories, products, tables, orders, order_items, shifts, cash_movements, members, promos, coupons, ingredients, recipes, reservations, vendors, vendor_settlements, articles, settings. Add enums, indexes, FK/check/unique constraints, supporting ledger/payment/inventory tables, and safe update timestamps.
2. `db/seed.sql`: username `taqim2609` as SUPERADMIN, table map, and Mie Aceh, Kopi Sanger, Ayam Tangkap, Nasi Goreng Aceh, Kopi Gayo, Teh Tarik. Never ship a known default password: seed a disabled/bootstrap-required account or use a documented environment-driven bootstrap mechanism.
3. `docker-compose.yml`, `.env.example`, health checks, persistent PostgreSQL volume, non-default credentials through env. No secrets committed.
4. REST API with health endpoint and transactional endpoints for order create, weighted items, payment, void/reversal, shift open/summary/close, cash in/out, low stock, dashboard, best sellers, vendor settlement, reservation intake.
5. Enforce business rules:
   - F&B dine-in/takeaway and retail separated.
   - selected products sold by weight: price = weight × base price with deterministic rounding.
   - outlet discount reduces revenue but not COGS/vendor commission bases.
   - vendor profit-share settlement generated at shift close and records cash expense exactly once.
   - member points/coupons awarded/redeemed only on PAID; compensating reversal on VOID; retries idempotent.
   - shift reconciliation: opening float + cash sales + cash in − cash out − vendor cash settlements; record physical cash and variance.
6. SQL/query helpers for today turnover/cash, low stock, weekly best sellers, active shift summary. Read-only DB role or allowlisted helper approach for AI; never allow arbitrary model-generated SQL against write credentials.
7. `pos-analyst/SOUL.md` or equivalent system prompt: Indonesian, Grand Aceh Kuliner-specific, concise, distinguishes revenue/cash/profit, names date/time range and missing data, no fabricated figures, read-only tools.
8. Hermes integration docs/config templates:
   - Correct supported OpenAI-compatible API Server adapter, not `hermes proxy` OAuth proxy. Desired standalone example port 8000, bearer key from env, `/v1/chat/completions`; clearly note actual live host may use default-profile multiplexer and profile-prefixed path. No real secret.
   - Webhook adapter example port 8644, `/webhooks/grandpos-outbox`, `deliver_only: true`, HMAC secret from env, WhatsApp delivery. Explain signing and replay protection expectations.
   - Do NOT invent `pre_gateway_dispatch`: current Hermes docs do not list that hook. Implement `/stok`, `/laporan-shift`, `/dashboard`, and `#reservasi Nama/Tgl/Jam/JumlahOrang` as a deterministic zero-LLM Baileys command router (or supported platform adapter boundary) calling allowlisted API endpoints; unknown/customer conversational messages may be forwarded to the named Hermes profile. Document why this replaces the invalid hook requirement.
9. WhatsApp/Baileys service or integration module with allowlisted owner/cashier phone numbers, normalized JIDs, zero-token exact command parsing, reservation validation, request timeout, rate limit, structured logs without message/body/secret leakage, outbound receipt and shift recap functions, webhook HMAC verification, idempotency, and tests.
10. README deployment steps, migrations/seed/bootstrap, smoke tests, backup/restore notes, security boundaries, rollback, and endpoint examples. Include an architecture diagram in Mermaid.

## Verification required

- Discover and obey any repository instructions first; preserve unrelated work.
- Run syntax/static checks, unit/integration tests, and `docker compose config`.
- If Docker daemon is available, build/start stack, wait for health, run migrations/seed, execute a real smoke flow: open shift → weighted + normal order → pay → verify points/stock → void → verify reversals → close shift → verify settlement and reconciliation. Tear down containers but preserve evidence; avoid deleting named volumes unless created solely for this test.
- If Docker is unavailable, report that exact blocker and run the strongest available non-Docker checks; do not claim runtime success.
- Provide exact changed files, commands, pass/fail counts, and remaining risks.
- Completion is local-only. No independent code-review card unless Qim explicitly requests review.
