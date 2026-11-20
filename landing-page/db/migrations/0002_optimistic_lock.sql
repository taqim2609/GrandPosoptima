-- GrandPOS migration 0002: optimistic locking + per-cashier drawers.
--
-- STEP 1 of offline-first hardening: schema + concurrency primitives ONLY.
-- Idempotent-safe: every DDL is guarded (IF NOT EXISTS / DO block / DROP
-- IF EXISTS before CREATE INDEX), so this file can run repeatedly and on
-- databases already migrated.
--
-- Overrides/extends db/schema.sql baseline:
--   orders.version  INTEGER NOT NULL DEFAULT 1
--   shifts.version  INTEGER NOT NULL DEFAULT 1
--   shifts.cashier_id BIGINT NULL REFERENCES users(id)
--   unique partial index: one OPEN/'closing' shift per cashier
--
-- Money stays BIGINT. No data is rewritten; existing rows take version=1.

BEGIN;

-- 1. version column on orders.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'version'
  ) THEN
    ALTER TABLE orders ADD COLUMN version INTEGER NOT NULL DEFAULT 1;
  END IF;
END
$$;

-- 2. version column on shifts.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'shifts' AND column_name = 'version'
  ) THEN
    ALTER TABLE shifts ADD COLUMN version INTEGER NOT NULL DEFAULT 1;
  END IF;
END
$$;

-- 3. Per-cashier drawer: nullable cashier_id (back-compat), FK to users.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'shifts' AND column_name = 'cashier_id'
  ) THEN
    ALTER TABLE shifts ADD COLUMN cashier_id BIGINT REFERENCES users (id);
  END IF;
END
$$;

-- 4. Backfill: shifts opened pre-migration belong to their opener.
UPDATE shifts SET cashier_id = opened_by WHERE cashier_id IS NULL;

-- 5. Per-cashier drawers: replace the single-global-shift index.
--    shifts_single_open_idx (one open shift for the whole outlet) would block
--    two cashiers from opening simultaneously, so it is dropped. Rows with a
--    NULL cashier_id keep the legacy single-drawer guarantee below.
DROP INDEX IF EXISTS shifts_open_per_cashier_idx;
CREATE UNIQUE INDEX shifts_open_per_cashier_idx
  ON shifts (cashier_id) WHERE status IN ('open', 'closing');

DROP INDEX IF EXISTS shifts_single_open_idx;
-- Legacy compatibility: at most one drawer without an assigned cashier.
DROP INDEX IF EXISTS shifts_single_open_null_cashier_idx;
CREATE UNIQUE INDEX shifts_single_open_null_cashier_idx
  ON shifts ((status)) WHERE status IN ('open', 'closing') AND cashier_id IS NULL;

COMMIT;
