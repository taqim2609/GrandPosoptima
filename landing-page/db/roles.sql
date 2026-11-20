-- GrandPOS roles, grants and row-level hardening.
-- Loaded by PostgreSQL's init entrypoint AFTER schema.sql and seed.sql.
--
-- Principle: the API's write role and the AI analyst role are different
-- database roles with different privileges. The AI analyst must never hold a
-- write-capable handle, and must not be able to read PII beyond the analytics
-- views.

BEGIN;

-- ---------------------------------------------------------------------------
-- AI analytics role: SELECT on the four analytics views only.
-- Password comes from the environment via GRANDPOS_AI_DB_PASSWORD; if the
-- environment does not provide one the role is created NOLOGIN so it cannot be
-- used until an operator explicitly enables it.
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  ai_password text := current_setting('grandpos.ai_db_password', true);
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'grandpos_ai') THEN
    IF ai_password IS NULL OR length(ai_password) < 12 THEN
      CREATE ROLE grandpos_ai NOLOGIN;
      RAISE NOTICE 'grandpos_ai created NOLOGIN: set grandpos.ai_db_password (>=12 chars) to enable.';
    ELSE
      EXECUTE format('CREATE ROLE grandpos_ai LOGIN PASSWORD %L', ai_password);
    END IF;
  ELSIF ai_password IS NOT NULL AND length(ai_password) >= 12 THEN
    EXECUTE format('ALTER ROLE grandpos_ai LOGIN PASSWORD %L', ai_password);
  END IF;
END
$$;

-- Lock the role out of the database by default, then grant only what is needed.
REVOKE ALL ON SCHEMA public FROM grandpos_ai;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM grandpos_ai;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM grandpos_ai;

GRANT USAGE ON SCHEMA public TO grandpos_ai;
GRANT SELECT ON v_daily_turnover      TO grandpos_ai;
GRANT SELECT ON v_shift_cash          TO grandpos_ai;
GRANT SELECT ON v_low_stock           TO grandpos_ai;
GRANT SELECT ON v_weekly_best_sellers TO grandpos_ai;

-- Future objects are NOT granted by default: a new view stays invisible to the
-- analyst until it is explicitly added here.
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM grandpos_ai;

-- Defence in depth: read-only transaction default, statement timeout and a
-- dedicated search_path so the analyst cannot reach another schema.
ALTER ROLE grandpos_ai SET default_transaction_read_only = on;
ALTER ROLE grandpos_ai SET statement_timeout = '15s';
ALTER ROLE grandpos_ai SET idle_in_transaction_session_timeout = '30s';
ALTER ROLE grandpos_ai SET search_path = public;

-- Even read-only, the analyst must not be able to write through the views.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'grandpos_ai') THEN
    EXECUTE 'REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON ALL TABLES IN SCHEMA public FROM grandpos_ai';
  END IF;
END
$$;

COMMIT;
