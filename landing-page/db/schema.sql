-- GrandPOS (Grand Aceh Kuliner) — PostgreSQL 16 schema
-- Money is integer IDR (BIGINT). Weights use NUMERIC, never float.
-- Timestamps are timestamptz; business dates/times are Jakarta-local (Asia/Jakarta).
-- Core accounting is append-only (ledger / movements / point ledger); mutable
-- balance columns exist only as cached materialisations that are always derived
-- from the ledgers inside the same transaction.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Genuinely immutable enum-like domains. Operational workflow status is kept as
-- TEXT + CHECK instead so a new value never needs a transactional migration
-- against a legacy type (a "safe migration" property for a live POS).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'channel_type') THEN
    CREATE TYPE channel_type AS ENUM ('fnb', 'retail');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'order_type') THEN
    CREATE TYPE order_type AS ENUM ('dine_in', 'takeaway', 'retail');
  END IF;
END
$$;

-- Domain validation helpers. Defined before any table references them.
CREATE OR REPLACE FUNCTION update_timestamp()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.created_at IS NULL THEN
    NEW.created_at := COALESCE(OLD.created_at, now());
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION check_period_dates()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.period_end <= NEW.period_start THEN
    RAISE EXCEPTION 'period_end must be after period_start';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION validate_json_object(value jsonb)
RETURNS boolean
LANGUAGE sql IMMUTABLE
AS $$
  SELECT value IS NULL OR jsonb_typeof(value) = 'object';
$$;

-- Business timezone. Parameterised so the schema is portable across servers.
CREATE OR REPLACE FUNCTION jkt_now() RETURNS timestamptz
LANGUAGE sql STABLE
AS $$ SELECT now() AT TIME ZONE current_setting('grandpos.timezone', true) $$;

CREATE OR REPLACE FUNCTION jkt_today() RETURNS date
LANGUAGE sql STABLE
AS $$ SELECT (now() AT TIME ZONE current_setting('grandpos.timezone', true))::date $$;


-- ---------------------------------------------------------------------------
-- Identity, staff, configuration
-- ---------------------------------------------------------------------------

CREATE TABLE users (
  id             BIGSERIAL PRIMARY KEY,
  username       TEXT NOT NULL UNIQUE,
  display_name   TEXT NOT NULL,
  role           TEXT NOT NULL CHECK (role IN ('superadmin', 'owner', 'cashier', 'kitchen', 'auditor')),
  phone          TEXT,
  avatar_url     TEXT,
  default_shift  TEXT,
  is_active      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX users_role_idx ON users (role) WHERE is_active;

-- Credentials live apart from the profile so the profile row can be read by
-- non-authentication code paths without ever touching a hash.
CREATE TABLE user_credentials (
  id             BIGSERIAL PRIMARY KEY,
  user_id        BIGINT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  password_hash  TEXT,
  bootstrap_required BOOLEAN NOT NULL DEFAULT TRUE,
  disabled       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id)
);
COMMENT ON COLUMN user_credentials.password_hash IS
  'Only ever populated by an explicit bootstrap/reset flow. Seeded rows keep this NULL and disabled=TRUE.';

CREATE TABLE settings (
  id             BIGSERIAL PRIMARY KEY,
  key            TEXT NOT NULL UNIQUE,
  value          jsonb NOT NULL CHECK (jsonb_typeof(value) IN ('string', 'number', 'boolean', 'object', 'array')),
  description    TEXT,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE landing_config (
  id             BIGSERIAL PRIMARY KEY,
  section        TEXT NOT NULL,
  key            TEXT NOT NULL,
  value          jsonb NOT NULL CHECK (jsonb_typeof(value) IN ('string', 'number', 'boolean', 'object', 'array')),
  description    TEXT,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (section, key)
);
COMMENT ON TABLE landing_config IS
  'Konfigurasi konten landing page & promosi. Di-seed dari landing-page.config.js; diubah via UI Settings -> Landing Page.';

-- ---------------------------------------------------------------------------
-- Catalogue
-- ---------------------------------------------------------------------------

CREATE TABLE categories (
  id             BIGSERIAL PRIMARY KEY,
  name           TEXT NOT NULL,
  slug           TEXT NOT NULL UNIQUE,
  channel        channel_type NOT NULL,
  sort_order     INTEGER NOT NULL DEFAULT 0,
  is_active      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE products (
  id                BIGSERIAL PRIMARY KEY,
  sku               TEXT NOT NULL UNIQUE,
  name              TEXT NOT NULL,
  category_id       BIGINT NOT NULL REFERENCES categories (id),
  channel           channel_type NOT NULL,
  base_price        BIGINT NOT NULL CHECK (base_price >= 0),
  cost_price        BIGINT NOT NULL DEFAULT 0 CHECK (cost_price >= 0),
  sold_by_weight    BOOLEAN NOT NULL DEFAULT FALSE,
  unit              TEXT NOT NULL DEFAULT 'pcs',
  weight_rounding   NUMERIC(10, 3) NOT NULL DEFAULT 0.001 CHECK (weight_rounding > 0),
  points_earn_rate  NUMERIC(8, 4) NOT NULL DEFAULT 0 CHECK (points_earn_rate >= 0),
  vendor_id         BIGINT,
  is_active         BOOLEAN NOT NULL DEFAULT TRUE,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT products_weight_unit_check CHECK (
    (sold_by_weight = FALSE AND unit IN ('pcs', 'portion', 'glass', 'cup', 'bottle'))
    OR (sold_by_weight = TRUE)
  )
);
CREATE INDEX products_channel_idx ON products (channel) WHERE is_active;
CREATE INDEX products_category_idx ON products (category_id);

-- ---------------------------------------------------------------------------
-- Vendors and consignment (titipan)
-- ---------------------------------------------------------------------------

CREATE TABLE vendors (
  id                    BIGSERIAL PRIMARY KEY,
  name                  TEXT NOT NULL UNIQUE,
  contact_phone         TEXT,
  owner_user_id         BIGINT REFERENCES users (id),
  profit_share_percent  NUMERIC(6, 3) NOT NULL CHECK (profit_share_percent >= 0 AND profit_share_percent <= 100),
  is_active             BOOLEAN NOT NULL DEFAULT TRUE,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE products
  ADD CONSTRAINT products_vendor_fk FOREIGN KEY (vendor_id) REFERENCES vendors (id);

-- Every product change to cost/price is auditable; consignment margin is
-- computed at settlement time from the recorded snapshot columns.
CREATE TABLE vendor_settlements (
  id                    BIGSERIAL PRIMARY KEY,
  shift_id              BIGINT NOT NULL,
  vendor_id             BIGINT NOT NULL REFERENCES vendors (id),
  gross_sales           BIGINT NOT NULL DEFAULT 0 CHECK (gross_sales >= 0),
  commission_base       BIGINT NOT NULL DEFAULT 0 CHECK (commission_base >= 0),
  discount_absorbed     BIGINT NOT NULL DEFAULT 0 CHECK (discount_absorbed >= 0),
  profit_share_percent  NUMERIC(6, 3) NOT NULL CHECK (profit_share_percent >= 0 AND profit_share_percent <= 100),
  vendor_amount         BIGINT NOT NULL DEFAULT 0 CHECK (vendor_amount >= 0),
  paid_via              TEXT NOT NULL DEFAULT 'cash' CHECK (paid_via IN ('cash', 'transfer')),
  cash_movement_id      BIGINT UNIQUE,
  status                TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'paid', 'void')),
  settled_at            timestamptz,
  created_by            BIGINT REFERENCES users (id),
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (shift_id, vendor_id)
);
CREATE INDEX vendor_settlements_shift_idx ON vendor_settlements (shift_id);

-- ---------------------------------------------------------------------------
-- Floor plan
-- ---------------------------------------------------------------------------

CREATE TABLE tables (
  id             BIGSERIAL PRIMARY KEY,
  code           TEXT NOT NULL UNIQUE,
  label          TEXT NOT NULL,
  seats          INTEGER NOT NULL CHECK (seats > 0),
  zone           TEXT NOT NULL DEFAULT 'indoor',
  status         TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'reserved', 'occupied', 'cleaning')),
  sort_order     INTEGER NOT NULL DEFAULT 0,
  is_active      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX tables_label_unique_ci ON tables (lower(label));

-- ---------------------------------------------------------------------------
-- Members, promos, coupons
-- ---------------------------------------------------------------------------

CREATE TABLE members (
  id                   BIGSERIAL PRIMARY KEY,
  member_code          TEXT NOT NULL UNIQUE,
  name                 TEXT NOT NULL,
  phone                TEXT NOT NULL UNIQUE,
  email                TEXT,
  points_balance       INTEGER NOT NULL DEFAULT 0 CHECK (points_balance >= 0),
  tier                 TEXT NOT NULL DEFAULT 'bronze' CHECK (tier IN ('bronze', 'silver', 'gold', 'platinum')),
  total_spend          BIGINT NOT NULL DEFAULT 0 CHECK (total_spend >= 0),
  is_active            BOOLEAN NOT NULL DEFAULT TRUE,
  joined_at            timestamptz NOT NULL DEFAULT now(),
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE promos (
  id             BIGSERIAL PRIMARY KEY,
  code           TEXT NOT NULL UNIQUE,
  name           TEXT NOT NULL,
  kind           TEXT NOT NULL CHECK (kind IN ('percent', 'amount')),
  value          BIGINT NOT NULL CHECK (value > 0),
  min_subtotal   BIGINT NOT NULL DEFAULT 0 CHECK (min_subtotal >= 0),
  max_discount   BIGINT CHECK (max_discount IS NULL OR max_discount >= 0),
  channel        channel_type,
  starts_at      timestamptz,
  ends_at        timestamptz,
  is_active      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT promos_percent_range CHECK (kind <> 'percent' OR value <= 100),
  CONSTRAINT promos_window CHECK (ends_at IS NULL OR starts_at IS NULL OR ends_at > starts_at)
);

CREATE TABLE coupons (
  id             BIGSERIAL PRIMARY KEY,
  code           TEXT NOT NULL UNIQUE,
  member_id      BIGINT REFERENCES members (id),
  promo_id       BIGINT NOT NULL REFERENCES promos (id),
  status         TEXT NOT NULL DEFAULT 'issued' CHECK (status IN ('issued', 'reserved', 'redeemed', 'expired', 'void')),
  issued_at      timestamptz NOT NULL DEFAULT now(),
  expires_at     timestamptz,
  redeemed_at    timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX coupons_member_idx ON coupons (member_id) WHERE status IN ('issued', 'reserved');

-- ---------------------------------------------------------------------------
-- Inventory (kitchen ingredients, recipes, movements)
-- ---------------------------------------------------------------------------

CREATE TABLE ingredients (
  id                BIGSERIAL PRIMARY KEY,
  sku               TEXT NOT NULL UNIQUE,
  name              TEXT NOT NULL,
  unit              TEXT NOT NULL,
  stock_qty         NUMERIC(14, 3) NOT NULL DEFAULT 0 CHECK (stock_qty >= 0),
  min_stock_qty     NUMERIC(14, 3) NOT NULL DEFAULT 0 CHECK (min_stock_qty >= 0),
  reorder_qty       NUMERIC(14, 3) NOT NULL DEFAULT 0 CHECK (reorder_qty >= 0),
  last_cost_price   BIGINT NOT NULL DEFAULT 0 CHECK (last_cost_price >= 0),
  is_active         BOOLEAN NOT NULL DEFAULT TRUE,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ingredients_low_stock_idx ON ingredients (stock_qty, min_stock_qty) WHERE is_active;

CREATE TABLE recipes (
  id                BIGSERIAL PRIMARY KEY,
  product_id        BIGINT NOT NULL REFERENCES products (id) ON DELETE CASCADE,
  ingredient_id     BIGINT NOT NULL REFERENCES ingredients (id),
  qty_per_unit      NUMERIC(14, 3) NOT NULL CHECK (qty_per_unit > 0),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id, ingredient_id)
);

-- Append-only. Corrections are new rows with movement_type='adjustment'
-- (positive or negative) referencing the movement they correct.
CREATE TABLE inventory_movements (
  id                 BIGSERIAL PRIMARY KEY,
  ingredient_id      BIGINT NOT NULL REFERENCES ingredients (id),
  movement_type      TEXT NOT NULL CHECK (movement_type IN ('purchase', 'sale_consumption', 'adjustment', 'waste', 'reversal')),
  qty_delta          NUMERIC(14, 3) NOT NULL CHECK (qty_delta <> 0),
  unit_cost          BIGINT NOT NULL DEFAULT 0 CHECK (unit_cost >= 0),
  order_id           BIGINT,
  order_item_id      BIGINT,
  reversal_of_id     BIGINT REFERENCES inventory_movements (id),
  reason             TEXT,
  created_by         BIGINT REFERENCES users (id),
  created_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX inventory_movements_ingredient_idx ON inventory_movements (ingredient_id, created_at DESC);
CREATE INDEX inventory_movements_order_idx ON inventory_movements (order_id) WHERE order_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Shifts and cash
-- ---------------------------------------------------------------------------

CREATE TABLE shifts (
  id                    BIGSERIAL PRIMARY KEY,
  code                  TEXT NOT NULL UNIQUE,
  opened_by             BIGINT NOT NULL REFERENCES users (id),
  closed_by             BIGINT REFERENCES users (id),
  cashier_id            BIGINT REFERENCES users (id),
  status                TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closing', 'closed')),
  opening_float         BIGINT NOT NULL CHECK (opening_float >= 0),
  opened_at             timestamptz NOT NULL DEFAULT now(),
  closed_at             timestamptz,
  cash_sales            BIGINT NOT NULL DEFAULT 0 CHECK (cash_sales >= 0),
  non_cash_sales        BIGINT NOT NULL DEFAULT 0 CHECK (non_cash_sales >= 0),
  cash_in_total         BIGINT NOT NULL DEFAULT 0 CHECK (cash_in_total >= 0),
  cash_out_total        BIGINT NOT NULL DEFAULT 0 CHECK (cash_out_total >= 0),
  vendor_cash_total     BIGINT NOT NULL DEFAULT 0 CHECK (vendor_cash_total >= 0),
  expected_cash         BIGINT,
  counted_cash          BIGINT CHECK (counted_cash IS NULL OR counted_cash >= 0),
  variance              BIGINT,
  order_count           INTEGER NOT NULL DEFAULT 0 CHECK (order_count >= 0),
  void_count            INTEGER NOT NULL DEFAULT 0 CHECK (void_count >= 0),
  version               INTEGER NOT NULL DEFAULT 1,
  notes                 TEXT,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT shifts_closed_fields CHECK (
    status <> 'closed' OR (closed_at IS NOT NULL AND closed_by IS NOT NULL AND expected_cash IS NOT NULL)
  )
);
-- Legacy compatibility: at most one drawer without an assigned cashier.
-- (schema.sql no longer ships shifts_single_open_idx; migrations drop it.)
CREATE UNIQUE INDEX shifts_single_open_null_cashier_idx ON shifts ((status)) WHERE status IN ('open', 'closing') AND cashier_id IS NULL;
CREATE INDEX shifts_opened_at_idx ON shifts (opened_at DESC);

-- Append-only cash ledger. Sign convention: amount > 0 is cash in,
-- amount < 0 is cash out; the direction/reason pair is also enforced.
CREATE TABLE cash_movements (
  id             BIGSERIAL PRIMARY KEY,
  shift_id       BIGINT NOT NULL REFERENCES shifts (id),
  movement_type  TEXT NOT NULL CHECK (movement_type IN (
                   'opening_float', 'sale_cash', 'sale_cash_reversal',
                   'cash_in', 'cash_out', 'vendor_settlement', 'vendor_settlement_reversal',
                   'void_reversal', 'closing_adjustment')),
  direction      TEXT NOT NULL CHECK (direction IN ('in', 'out')),
  amount         BIGINT NOT NULL CHECK (amount <> 0),
  reference_type TEXT,
  reference_id   BIGINT,
  reason         TEXT,
  created_by     BIGINT REFERENCES users (id),
  created_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cash_movements_sign_check CHECK (
    (direction = 'in' AND amount > 0) OR (direction = 'out' AND amount < 0)
  )
);
CREATE INDEX cash_movements_shift_idx ON cash_movements (shift_id, created_at);
CREATE UNIQUE INDEX cash_movements_reference_unique
  ON cash_movements (movement_type, reference_type, reference_id)
  WHERE reference_id IS NOT NULL AND movement_type IN ('sale_cash', 'vendor_settlement');

-- ---------------------------------------------------------------------------
-- Orders
-- ---------------------------------------------------------------------------

CREATE TABLE orders (
  id                  BIGSERIAL PRIMARY KEY,
  order_number        TEXT NOT NULL UNIQUE,
  channel             channel_type NOT NULL,
  order_type          order_type NOT NULL,
  status              TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'paid', 'void')),
  table_id            BIGINT REFERENCES tables (id),
  shift_id            BIGINT REFERENCES shifts (id),
  member_id           BIGINT REFERENCES members (id),
  reservation_id      BIGINT,
  customer_name       TEXT,
  customer_phone      TEXT,
  guest_count         INTEGER CHECK (guest_count IS NULL OR guest_count > 0),
  subtotal             BIGINT NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
  discount_total      BIGINT NOT NULL DEFAULT 0 CHECK (discount_total >= 0),
  service_total       BIGINT NOT NULL DEFAULT 0 CHECK (service_total >= 0),
  tax_total           BIGINT NOT NULL DEFAULT 0 CHECK (tax_total >= 0),
  grand_total         BIGINT NOT NULL DEFAULT 0 CHECK (grand_total >= 0),
  paid_total          BIGINT NOT NULL DEFAULT 0 CHECK (paid_total >= 0),
  cogs_total          BIGINT NOT NULL DEFAULT 0 CHECK (cogs_total >= 0),
  discount_source     TEXT CHECK (discount_source IN ('promo', 'manual', 'member')),
  promo_id            BIGINT REFERENCES promos (id),
  coupon_id           BIGINT REFERENCES coupons (id),
  points_earned       INTEGER NOT NULL DEFAULT 0 CHECK (points_earned >= 0),
  points_redeemed     INTEGER NOT NULL DEFAULT 0 CHECK (points_redeemed >= 0),
  note                TEXT,
  paid_at             timestamptz,
  voided_at           timestamptz,
  voided_by           BIGINT REFERENCES users (id),
  void_reason         TEXT,
  created_by          BIGINT NOT NULL REFERENCES users (id),
  version             INTEGER NOT NULL DEFAULT 1,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT orders_table_check CHECK (
    (order_type = 'dine_in' AND table_id IS NOT NULL)
    OR (order_type <> 'dine_in' AND table_id IS NULL)
  ),
  CONSTRAINT orders_totals_check CHECK (
    grand_total = subtotal - discount_total + service_total + tax_total
  ),
  CONSTRAINT orders_paid_within_grand CHECK (paid_total <= grand_total),
  CONSTRAINT orders_void_fields CHECK (
    status <> 'void' OR (voided_at IS NOT NULL AND voided_by IS NOT NULL AND void_reason IS NOT NULL)
  )
);
CREATE INDEX orders_created_at_idx ON orders (created_at DESC);
CREATE INDEX orders_status_idx ON orders (status);
CREATE INDEX orders_shift_idx ON orders (shift_id);
CREATE INDEX orders_member_idx ON orders (member_id) WHERE member_id IS NOT NULL;

CREATE TABLE order_items (
  id                BIGSERIAL PRIMARY KEY,
  order_id          BIGINT NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
  product_id        BIGINT NOT NULL REFERENCES products (id),
  product_name      TEXT NOT NULL,
  channel           channel_type NOT NULL,
  qty               NUMERIC(14, 3) NOT NULL CHECK (qty > 0),
  is_weighted       BOOLEAN NOT NULL DEFAULT FALSE,
  weight_grams      NUMERIC(14, 3) CHECK (weight_grams IS NULL OR weight_grams > 0),
  base_price        BIGINT NOT NULL CHECK (base_price >= 0),
  unit_price        BIGINT NOT NULL CHECK (unit_price >= 0),
  line_subtotal     BIGINT NOT NULL CHECK (line_subtotal >= 0),
  line_discount     BIGINT NOT NULL DEFAULT 0 CHECK (line_discount >= 0),
  line_total        BIGINT NOT NULL CHECK (line_total >= 0),
  unit_cost         BIGINT NOT NULL DEFAULT 0 CHECK (unit_cost >= 0),
  line_cost         BIGINT NOT NULL DEFAULT 0 CHECK (line_cost >= 0),
  vendor_id         BIGINT REFERENCES vendors (id),
  vendor_share_percent NUMERIC(6, 3),
  note              TEXT,
  status            TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'void')),
  voided_at         timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT order_items_weight_check CHECK (
    (is_weighted = FALSE AND weight_grams IS NULL AND unit_price = base_price)
    OR (is_weighted = TRUE AND weight_grams IS NOT NULL)
  ),
  CONSTRAINT order_items_line_math CHECK (line_total = line_subtotal - line_discount)
);
CREATE INDEX order_items_order_idx ON order_items (order_id);
CREATE INDEX order_items_product_idx ON order_items (product_id);
CREATE INDEX order_items_vendor_idx ON order_items (vendor_id) WHERE vendor_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Payments (append-only attempt log + terminal settlement rows)
-- ---------------------------------------------------------------------------

CREATE TABLE payments (
  id                BIGSERIAL PRIMARY KEY,
  order_id          BIGINT NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
  method            TEXT NOT NULL CHECK (method IN ('cash', 'qris', 'debit', 'credit', 'transfer', 'voucher')),
  amount            BIGINT NOT NULL CHECK (amount > 0),
  tendered          BIGINT CHECK (tendered IS NULL OR tendered >= 0),
  change_due        BIGINT CHECK (change_due IS NULL OR change_due >= 0),
  reference_no      TEXT,
  idempotency_key   TEXT,
  status            TEXT NOT NULL DEFAULT 'captured' CHECK (status IN ('captured', 'voided')),
  captured_by       BIGINT NOT NULL REFERENCES users (id),
  shift_id          BIGINT REFERENCES shifts (id),
  voided_at         timestamptz,
  void_reason       TEXT,
  created_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payments_cash_fields CHECK (
    method <> 'cash' OR (tendered IS NOT NULL AND change_due IS NOT NULL AND tendered >= amount)
  ),
  CONSTRAINT payments_change_check CHECK (
    method <> 'cash' OR change_due = tendered - amount
  )
);
CREATE UNIQUE INDEX payments_idempotency_unique ON payments (idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX payments_order_idx ON payments (order_id);

-- ---------------------------------------------------------------------------
-- Members: point and coupon ledgers (append-only)
-- ---------------------------------------------------------------------------

CREATE TABLE member_point_ledger (
  id             BIGSERIAL PRIMARY KEY,
  member_id      BIGINT NOT NULL REFERENCES members (id),
  order_id       BIGINT REFERENCES orders (id),
  entry_type     TEXT NOT NULL CHECK (entry_type IN ('earn', 'redeem', 'reversal', 'expire', 'adjust')),
  points         INTEGER NOT NULL CHECK (points <> 0),
  points_balance_after INTEGER NOT NULL CHECK (points_balance_after >= 0),
  reason         TEXT,
  reversal_of_id BIGINT REFERENCES member_point_ledger (id),
  created_by     BIGINT REFERENCES users (id),
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX member_point_ledger_order_entry
  ON member_point_ledger (order_id, entry_type)
  WHERE order_id IS NOT NULL AND entry_type IN ('earn', 'redeem', 'reversal');
CREATE INDEX member_point_ledger_member_idx ON member_point_ledger (member_id, created_at DESC);

CREATE TABLE coupon_redemptions (
  id             BIGSERIAL PRIMARY KEY,
  coupon_id      BIGINT NOT NULL REFERENCES coupons (id),
  order_id       BIGINT NOT NULL REFERENCES orders (id),
  discount_amount BIGINT NOT NULL CHECK (discount_amount >= 0),
  status         TEXT NOT NULL DEFAULT 'applied' CHECK (status IN ('applied', 'reversed')),
  reversed_at    timestamptz,
  created_by     BIGINT REFERENCES users (id),
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (coupon_id, order_id)
);
CREATE UNIQUE INDEX coupon_redemptions_active_unique ON coupon_redemptions (coupon_id) WHERE status = 'applied';

-- ---------------------------------------------------------------------------
-- Void / audit trail
-- ---------------------------------------------------------------------------

CREATE TABLE audit_logs (
  id             BIGSERIAL PRIMARY KEY,
  entity_type    TEXT NOT NULL,
  entity_id      BIGINT NOT NULL,
  action         TEXT NOT NULL,
  actor_id       BIGINT REFERENCES users (id),
  reason         TEXT,
  before_state   jsonb CHECK (validate_json_object(before_state)),
  after_state    jsonb CHECK (validate_json_object(after_state)),
  request_id     TEXT,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_logs_entity_idx ON audit_logs (entity_type, entity_id, created_at DESC);

CREATE TABLE order_voids (
  id             BIGSERIAL PRIMARY KEY,
  order_id       BIGINT NOT NULL REFERENCES orders (id),
  voided_by      BIGINT NOT NULL REFERENCES users (id),
  reason         TEXT NOT NULL CHECK (length(btrim(reason)) >= 3),
  cash_refund    BIGINT NOT NULL DEFAULT 0 CHECK (cash_refund >= 0),
  points_reversed INTEGER NOT NULL DEFAULT 0 CHECK (points_reversed >= 0),
  stock_reversed BOOLEAN NOT NULL DEFAULT FALSE,
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (order_id)
);

-- ---------------------------------------------------------------------------
-- Reservations
-- ---------------------------------------------------------------------------

CREATE TABLE reservations (
  id               BIGSERIAL PRIMARY KEY,
  code             TEXT NOT NULL UNIQUE,
  member_id        BIGINT REFERENCES members (id),
  table_id         BIGINT REFERENCES tables (id),
  customer_name    TEXT NOT NULL,
  customer_phone   TEXT NOT NULL,
  party_size       INTEGER NOT NULL CHECK (party_size > 0),
  reserved_date    date NOT NULL,
  reserved_time    time NOT NULL,
  status           TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'seated', 'cancelled', 'no_show')),
  source           TEXT NOT NULL DEFAULT 'whatsapp' CHECK (source IN ('whatsapp', 'walk_in', 'phone', 'web')),
  note             TEXT,
  created_by       BIGINT REFERENCES users (id),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX reservations_slot_idx ON reservations (reserved_date, reserved_time);

-- ---------------------------------------------------------------------------
-- Content
-- ---------------------------------------------------------------------------

CREATE TABLE articles (
  id             BIGSERIAL PRIMARY KEY,
  slug           TEXT NOT NULL UNIQUE,
  title          TEXT NOT NULL,
  excerpt        TEXT,
  body           TEXT NOT NULL DEFAULT '',
  category       TEXT NOT NULL DEFAULT 'berita',
  status         TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  author_id      BIGINT REFERENCES users (id),
  published_at   timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Webhook outbox (idempotent WhatsApp delivery)
-- ---------------------------------------------------------------------------

CREATE TABLE outbox_messages (
  id                BIGSERIAL PRIMARY KEY,
  event_type        TEXT NOT NULL,
  channel           TEXT NOT NULL DEFAULT 'whatsapp' CHECK (channel IN ('whatsapp', 'sms', 'email')),
  recipient         TEXT NOT NULL,
  payload           jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  dedupe_key        TEXT NOT NULL UNIQUE,
  status            TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'delivered')),
  attempts          INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  last_error        TEXT,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX outbox_status_idx ON outbox_messages (status, created_at);

-- ---------------------------------------------------------------------------
-- Deferred foreign keys (declared after both sides exist)
-- ---------------------------------------------------------------------------

ALTER TABLE orders
  ADD CONSTRAINT orders_reservation_fk FOREIGN KEY (reservation_id) REFERENCES reservations (id);
ALTER TABLE vendor_settlements
  ADD CONSTRAINT vendor_settlements_shift_fk FOREIGN KEY (shift_id) REFERENCES shifts (id);
ALTER TABLE vendor_settlements
  ADD CONSTRAINT vendor_settlements_cash_fk FOREIGN KEY (cash_movement_id) REFERENCES cash_movements (id);
ALTER TABLE inventory_movements
  ADD CONSTRAINT inventory_movements_order_fk FOREIGN KEY (order_id) REFERENCES orders (id);
ALTER TABLE inventory_movements
  ADD CONSTRAINT inventory_movements_order_item_fk FOREIGN KEY (order_item_id) REFERENCES order_items (id);

-- ---------------------------------------------------------------------------
-- Triggers: touch updated_at everywhere, validate settlement periods
-- ---------------------------------------------------------------------------

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'users','user_credentials','settings','landing_config','categories','products','vendors',
    'tables','members','promos','coupons','ingredients','recipes','shifts',
    'orders','order_items','reservations','articles','outbox_messages',
    'vendor_settlements'
  ]
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I_touch ON %I', t, t);
    EXECUTE format(
      'CREATE TRIGGER %I_touch BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION update_timestamp()',
      t, t);
  END LOOP;
END
$$;

-- ---------------------------------------------------------------------------
-- Read-only analytics surface for the AI analyst.
-- The application role never receives a write-capable handle for these views;
-- `ai_readonly` gets SELECT on the views only (see the GRANT block at the end).
-- ---------------------------------------------------------------------------

CREATE VIEW v_daily_turnover AS
SELECT
  (created_at AT TIME ZONE current_setting('grandpos.timezone', true))::date AS business_date,
  shift_id,
  channel,
  count(*) FILTER (WHERE status = 'paid')        AS paid_orders,
  count(*) FILTER (WHERE status = 'void')        AS void_orders,
  COALESCE(sum(grand_total) FILTER (WHERE status = 'paid'), 0) AS gross_turnover,
  COALESCE(sum(discount_total) FILTER (WHERE status = 'paid'), 0) AS total_discount,
  COALESCE(sum(grand_total - tax_total - service_total) FILTER (WHERE status = 'paid'), 0) AS net_revenue,
  COALESCE(sum(cogs_total) FILTER (WHERE status = 'paid'), 0) AS total_cogs
FROM orders
GROUP BY 1, 2, 3;

CREATE VIEW v_shift_cash AS
SELECT
  s.id AS shift_id,
  s.code,
  s.status,
  s.opening_float,
  COALESCE(sum(c.amount) FILTER (WHERE c.movement_type IN ('sale_cash', 'void_reversal')), 0) AS cash_sales,
  COALESCE(sum(c.amount) FILTER (WHERE c.movement_type = 'cash_in'), 0)             AS cash_in_total,
  COALESCE(sum(-c.amount) FILTER (WHERE c.movement_type = 'cash_out'), 0)            AS cash_out_total,
  COALESCE(sum(c.amount) FILTER (WHERE c.movement_type = 'vendor_settlement'), 0)    AS vendor_cash_total,
  s.expected_cash,
  s.counted_cash,
  s.variance
FROM shifts s
LEFT JOIN cash_movements c ON c.shift_id = s.id
GROUP BY s.id;

CREATE VIEW v_low_stock AS
SELECT
  i.id,
  i.sku,
  i.name,
  i.unit,
  i.stock_qty,
  i.min_stock_qty,
  i.reorder_qty,
  (i.min_stock_qty - i.stock_qty) AS shortage_qty,
  i.stock_qty <= i.min_stock_qty AS is_low
FROM ingredients i
WHERE i.is_active
ORDER BY (i.stock_qty - i.min_stock_qty), i.name;

CREATE VIEW v_weekly_best_sellers AS
SELECT
  date_trunc('week', (o.created_at AT TIME ZONE current_setting('grandpos.timezone', true)))::date AS week_start,
  oi.product_id,
  oi.product_name,
  oi.channel,
  sum(oi.qty)          AS units_sold,
  sum(oi.line_total)   AS revenue,
  sum(oi.line_cost)    AS cogs,
  sum(oi.line_total - oi.line_cost) AS gross_margin
FROM order_items oi
JOIN orders o ON o.id = oi.order_id
WHERE o.status = 'paid' AND oi.status = 'active'
GROUP BY 1, 2, 3, 4;

COMMIT;
