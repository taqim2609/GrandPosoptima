-- 0003_edge_sync.sql — sinkronisasi kiosk (Raspberry Pi) -> gudang-644.
--
-- Latar belakang
-- --------------
-- Gudang 644 adalah pusat data (PostgreSQL) dan satu-satunya node yang
-- mengirim WhatsApp. Kiosk Pi menjalankan UI kasir + MongoDB sendiri supaya
-- kasir tetap bisa jualan saat tailnet putus. Karena itu Pi butuh dua jalur:
--
--   1. ``edge_transactions``  — antrean transaksi Pi yang belum terkirim ke
--      gudang. Baris ditulis oleh Pi, dikirim lewat ``POST /sync/orders``,
--      dan diproses oleh gudang menjadi orders/order_items/payments yang sah.
--   2. ``edge_ingest_log``    — catatan idempotensi per (node, client_ref)
--      supaya kiriman ulang setelah timeout jaringan TIDAK menggandakan
--      transaksi atau nomor order.
--
-- Kenapa tabel terpisah, bukan langsung orders
-- --------------------------------------------
-- Payload dari Pi berbentuk dokumen Mongo (string id, enum order_type
-- take_away, harga float). Menuliskannya langsung ke ``orders`` akan
-- melanggar constraint schema (orders_table_check, orders_totals_check,
-- FK products/users/shifts). Antrean mentah ini menampung payload apa adanya;
-- penerjemahan ke model relasional dilakukan oleh ``app/edge_sync.py`` yang
-- bisa gagal per-baris tanpa menggagalkan seluruh batch.
--
-- Catatan keamanan: ``dedupe_key`` UNIQUE adalah kunci anti-ganda. Pi
-- membentuknya dari ``client_ref`` transaksinya, jadi retry memukul baris
-- yang sama.

BEGIN;

CREATE TABLE IF NOT EXISTS edge_transactions (
  id                BIGSERIAL PRIMARY KEY,
  -- Identitas kiosk pengirim, mis. "pi-kiosk-01". Dipakai untuk jejak audit
  -- dan membentuk dedupe_key bersama client_ref.
  node_id           TEXT NOT NULL,
  -- Kunci idempotensi dari sisi Pi (id transaksi Mongo).
  client_ref        TEXT NOT NULL,
  -- Dokumen transaksi utuh apa adanya (order, item, pembayaran, kasir).
  payload           jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  -- 'pending'  -> baru masuk, belum diproses
  -- 'applied'  -> sudah diterjemahkan menjadi orders di gudang
  -- 'rejected' -> gagal divalidasi/diproses; lihat last_error
  status            TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'applied', 'rejected')),
  -- Nomor order gudang yang terbentuk (NULL selama belum applied).
  order_number      TEXT UNIQUE REFERENCES orders (order_number),
  attempts          INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  last_error        TEXT,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  -- SATU baris per (node, transaksi). Kiriman ulang Pi tidak menggandakan.
  CONSTRAINT edge_transactions_dedupe_key UNIQUE (node_id, client_ref)
);

CREATE INDEX IF NOT EXISTS edge_transactions_status_idx
  ON edge_transactions (status, created_at);
CREATE INDEX IF NOT EXISTS edge_transactions_node_idx
  ON edge_transactions (node_id, created_at DESC);

COMMENT ON TABLE edge_transactions IS
  'Antrean transaksi mentah dari kiosk Pi; diterjemahkan ke orders oleh app/edge_sync.py.';
COMMENT ON COLUMN edge_transactions.client_ref IS
  'Id transaksi asli di sisi Pi; bersama node_id membentuk kunci idempotensi.';
COMMENT ON COLUMN edge_transactions.payload IS
  'Dokumen transaksi Pi apa adanya (JSON). Tidak pernah dieksekusi sebagai SQL.';

-- Riwayat ringkas setiap percobaan ingest. Berguna saat Pi melaporkan
-- "sudah kirim tapi tidak muncul": baris ini membuktikan payload diterima
-- dan apa hasilnya, tanpa perlu membongkar log.
CREATE TABLE IF NOT EXISTS edge_ingest_log (
  id             BIGSERIAL PRIMARY KEY,
  node_id        TEXT NOT NULL,
  client_ref     TEXT NOT NULL,
  -- 'accepted' | 'duplicate' | 'rejected'
  outcome        TEXT NOT NULL CHECK (outcome IN ('accepted', 'duplicate', 'rejected')),
  order_number   TEXT,
  detail         TEXT,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS edge_ingest_log_node_idx
  ON edge_ingest_log (node_id, created_at DESC);

-- Trigger updated_at konsisten dengan tabel lain di schema ini.
DROP TRIGGER IF EXISTS edge_transactions_touch ON edge_transactions;
CREATE TRIGGER edge_transactions_touch
  BEFORE UPDATE ON edge_transactions
  FOR EACH ROW EXECUTE FUNCTION update_timestamp();

COMMIT;
