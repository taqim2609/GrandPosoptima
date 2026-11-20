# PAKET KIRIM KE GOOGLE AI STUDIO — GrandPOS Grand Aceh Kuliner
# Salin SELURUH isi file ini (dari "PROMPT" sampai "PORT/IP") ke AI Studio.

================================================================
BAGIAN 1 — PROMPT (instruksi untuk AI Studio)
================================================================

Kamu adalah Principal Software Architect dan konsultan POS restoran untuk
Grand Aceh Kuliner (restoran F&B khas Aceh + retail, Banda Aceh).

KONTEKS: Kami membangun ulang backend POS mandiri pengganti Firebase.
Referensi implementasi sudah jadi dan terverifikasi (131 unit test lulus,
smoke test Postgres hidup variance kas 0). Detail arsitektur, skema SQL,
endpoint AI, WhatsApp, dan port/IP ada di bawah prompt ini — baca semuanya
sebelum menjawab.

TUGASMU:
1. Review arsitektur dan tunjukkan 3 risiko terbesar jika di-deploy ke
   1 outlet, 2 kasir, internet tidak stabil.
2. Tiap risiko: mitigasi konkret + trade-off.
3. Usulkan strategi offline-first paling sederhana namun aman (tanpa
   double-charge, tanpa transaksi hilang).
4. Beri 5 regression checklist sebelum go-live, urut dari paling berisiko.

BATASAN: Bahasa Indonesia, maksimal 600 kata, tanpa kode, fokus
arsitektur/risiko/keputusan.

================================================================
BAGIAN 2 — ARSITEKTUR SINGKAT
================================================================

- Backend FastAPI (app/api.py) + PostgreSQL 16. Uang BIGINT IDR,
  berat NUMERIC, timezone Asia/Jakarta.
- Tiap alur bisnis dalam 1 transaksi (conn.transaction()).
  Shift pakai SELECT FOR UPDATE. Bayar pakai idempotency key.
- Alur: Kasir/POS UI -> REST API port 8000 -> services.py
  (transaksi) -> rules.py (aturan murni) -> PostgreSQL.
- AI: Hermes API Server /v1/chat/completions (profil pos-analyst),
  baca DB hanya via role read-only grandpos_ai (SELECT 4 view saja).
- WhatsApp: gateway Node/Baileys. Keluar via webhook Hermes
  /webhooks/grandpos-outbox (HMAC, deliver_only). Masuk zero-LLM:
  /stok, /laporan-shift, /dashboard, #reservasi.
- Aturan inti: (1) F&B dine-in/takeaway vs retail pisah;
  (2) kiloan: harga = berat x base_price, HALF_UP;
  (3) diskon outlet tidak potong HPP/komisi;
  (4) settlement vendor sekali saat tutup shift;
  (5) poin/kupon hanya saat PAID, revert saat VOID;
  (6) expected_cash = opening_float + sale_cash + void_reversal
  + cash_in - cash_out - vendor_cash.

================================================================
BAGIAN 3 — KODE SQL DATABASE (skema penuh)
================================================================

--- docker-compose.yml (PostgreSQL 16 + API, tanpa secret) ---
name: grandpos
services:
  db:
    image: postgres:16-alpine
    restart: unless-stopped
    env_file: [.env]
    environment:
      POSTGRES_DB: ${POSTGRES_DB:?set POSTGRES_DB in .env}
      POSTGRES_USER: ${POSTGRES_USER:?set POSTGRES_USER in .env}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:?set POSTGRES_PASSWORD in .env}
      TZ: ${TZ:-Asia/Jakarta}
    command: [postgres, -c, grandpos.timezone=${TZ:-Asia/Jakarta}]
    volumes:
      - grandpos_pgdata:/var/lib/postgresql/data
      - ./db/schema.sql:/docker-entrypoint-initdb.d/01-schema.sql:ro
      - ./db/seed.sql:/docker-entrypoint-initdb.d/02-seed.sql:ro
      - ./db/roles.sql:/docker-entrypoint-initdb.d/03-roles.sql:ro
    ports: ["${POSTGRES_PORT:-5432}:5432"]
  api:
    build: {context: ., dockerfile: api/Dockerfile}
    restart: unless-stopped
    env_file: [.env]
    environment:
      DATABASE_URL: ${DATABASE_URL:?set DATABASE_URL in .env}
      AI_DATABASE_URL: ${AI_DATABASE_URL:-}
      API_PORT: ${API_PORT:-8000}
    depends_on: {db: {condition: service_healthy}}
    ports: ["${API_PORT:-8000}:8000"]
volumes: {grandpos_pgdata: {name: grandpos_pgdata}}

--- Daftar tabel (24) + view (4), file penuh db/schema.sql ---
users, user_credentials, settings, categories, products,
vendors, vendor_settlements, tables, members, promos, coupons,
ingredients, recipes, inventory_movements, shifts, cash_movements,
orders, order_items, payments, member_point_ledger, coupon_redemptions,
audit_logs, order_voids, reservations, articles, outbox_messages.
View: v_daily_turnover, v_shift_cash, v_low_stock, v_weekly_best_sellers.
Seed: taqim2609 (SUPERADMIN, nonaktif), denah meja, Mie Aceh,
Kopi Sanger, Ayam Tangkap, Nasi Goreng Aceh, Kopi Gayo, Teh Tarik.

--- Role AI read-only (db/roles.sql, ringkas) ---
Role grandpos_ai: NOLOGIN default, SELECT hanya pada 4 view analitik,
transaksi read-only, statement timeout 15 detik.

================================================================
BAGIAN 4 — KONFIGURASI ENDPOINT AI (Hermes API Server)
================================================================

Aktifkan di ~/.hermes/.env mesin Hermes:
  API_SERVER_ENABLED=true
  API_SERVER_KEY=<dari-secret-manager>

Contoh panggilan dari POS (standalone, port contoh 8000):
  curl http://127.0.0.1:8000/v1/chat/completions \
    -H "Authorization: Bearer ***" \
    -H "Content-Type: application/json" \
    -H "X-Hermes-Session-Key: grandpos-pos-analyst" \
    -d '{"model":"hermes-agent","messages":[
      {"role":"system","content":"<isi pos-analyst/SOUL.md>"},
      {"role":"user","content":"Berapa omzet dan kas shift hari ini?"}]}'

Jika host memakai multiplexer, path memakai prefix profil:
  POST http://host:8644/p/pos-analyst/v1/chat/completions
Cek `hermes gateway status` di host live untuk port/path aktual.
Model TIDAK PERNAH dapat kredensial tulis dan TIDAK PERNAH kirim SQL
bebas — hanya via role grandpos_ai atau helper allowlisted.

--- System prompt pos-analyst (isi lengkap) ---
"Grand Aceh Kuliner — Pos-Analyst system prompt.
Kepribadian: analis POS ringkas, akurat, jujur. Bahasa Indonesia,
memahami menu khas Aceh (Mie Aceh, Kopi Sanger, Ayam Tangkap,
Nasi Goreng Aceh, Kopi Gayo, Teh Tarik), BOM resep, konsinyasi vendor,
poin/kupon member, kas shift.
ATURAN KERAS: 1. HANYA jawab dari hasil tool read-only. Jangan menebak
atau mengarang angka/menu/tanggal/stok. 2. Bedakan omzet vs tunai vs
laba — tiga hal berbeda. 3. Selalu sebut rentang tanggal/waktu data;
jika kosong, katakan terus terang. 4. Tool hanya read-only. 5. Ringkas:
maksimal 3 angka penting + 1 kalimat kesimpulan.
GAYA: Indonesia santai-profesional. Rupiah Rp12.500 (tanpa desimal).
Di luar data (ramalan, keputusan besar): tandai sebagai opini."

================================================================
BAGIAN 5 — PENGATURAN WHATSAPP (gateway + webhook)
================================================================

--- Keluar: webhook adapter Hermes (POS -> WhatsApp) ---
Tambahkan ke ~/.hermes/config.yaml mesin Hermes:
  platforms:
    webhook:
      enabled: true
      extra:
        port: 8644
        rate_limit: 30
        routes:
          grandpos-outbox:
            secret: "${GRANDPOS_OUTBOX_SECRET}"
            events: [receipt, shift_recap, reservation_confirm]
            deliver_only: true
Secret di ~/.hermes/.env: GRANDPOS_OUTBOX_SECRET=<openssl rand -hex 32>
Signing: HMAC-SHA256, body JSON sort-keys kompak, string
"<unix-timestamp>.<canonical-json>", header X-Hub-Signature-256
plus X-GrandPOS-Timestamp/Event/Delivery. Toleransi 300 detik,
dedupe per delivery key (tidak kirim ganda).

--- Masuk: perintah zero-LLM (WhatsApp -> POS) ---
/stok -> GET /reports/low-stock
/laporan-shift -> GET /shifts/active/summary
/dashboard -> GET /reports/dashboard
#reservasi Nama/Tgl/Jam/JumlahOrang -> POST /reservations/intake
Hanya nomor allowlisted owner/kasir. Parse deterministik
(app/parsers.py + gateway/commands.js). Pesan umum pelanggan
saja yang diteruskan ke profil AI Hermes.
CATATAN: hook `pre_gateway_dispatch` TIDAK ADA di Hermes —
diganti router deterministik di lapisan Baileys (sudah jalan, 15 test lulus).

--- Endpoint REST GrandPOS (jalur masuk, auth API key) ---
GET /health
POST /shifts/open | GET /shifts/active/summary | POST /shifts/{id}/close
POST /cash-movements
POST /orders | POST /orders/{id}/pay | POST /orders/{id}/void
GET /reports/low-stock | GET /reports/dashboard | GET /reports/best-sellers
GET /vendors/{id}/settlements
POST /reservations/intake | POST /wa/inbound

================================================================
BAGIAN 6 — PORT / IP
================================================================

- API GrandPOS (dev sekarang): host gudang-644, API_PORT 8000,
  Postgres 5432, volume grandpos_pgdata. Stack smoke masih RUNNING
  lokal — matikan manual sebelum redeploy: `docker compose down`.
- Hermes API Server (contoh standalone): 127.0.0.1:8000
  /v1/chat/completions. Default Hermes: 127.0.0.1:8642.
- Hermes webhook outbox: port 8644,
  /webhooks/grandpos-outbox (multiplexer: /p/<profil>/webhooks/...).
- Server lama grandpos 100.109.98.56: GrandPosOptima SUDAH DIHAPUS
  TOTAL dari host ini maupun repo lokal. Repo GitHub
  taqim2609/GrandPosoptima masih ada (hapus manual bila perlu).
  JANGAN deploy stack baru ke 100.109.98.56 tanpa cek SSH dulu —
  itu host terpisah dan statusnya belum dikonfirmasi.
- Semua kredensial via .env (POSTGRES_PASSWORD, DATABASE_URL,
  GRANDPOS_SUPERADMIN_PASSWORD, GRANDPOS_OUTBOX_SECRET,
  API_SERVER_KEY). Tidak ada secret di file ini.

# AKHIR PAKET — salin dari "BAGIAN 1" sampai sini.
