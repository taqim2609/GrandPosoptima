-- GrandPOS migration 0004: landing_config table for landing-page content.
--
-- Tabel landing_config menyimpan konfigurasi konten landing page (hero banner,
-- statistik, promo, fitur, kontak, reservasi, artikel header, SEO) yang di-seed
-- dari landing-page.config.js dan dapat diubah admin melalui UI
-- Pengaturan -> Landing Page.
--
-- Idempotent: CREATE TABLE IF NOT EXISTS + DO block untuk trigger, sehingga
-- aman dijalankan berulang kali pada database yang sudah ter-migrasi.

BEGIN;

-- 1. Tabel landing_config (hanya jika belum ada).
CREATE TABLE IF NOT EXISTS landing_config (
  id             BIGSERIAL PRIMARY KEY,
  section        TEXT NOT NULL,
  key            TEXT NOT NULL,
  value          jsonb NOT NULL CHECK (jsonb_typeof(value) IN ('string', 'number', 'boolean', 'object', 'array')),
  description    TEXT,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (section, key)
);

-- 2. Trigger updated_at konsisten dengan tabel lain (idempoten via DO block).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'landing_config_touch'
      AND tgrelid = 'landing_config'::regclass
  ) THEN
    CREATE TRIGGER landing_config_touch
      BEFORE UPDATE ON landing_config
      FOR EACH ROW EXECUTE FUNCTION update_timestamp();
  END IF;
END
$$;

COMMENT ON TABLE landing_config IS
  'Konfigurasi konten landing page & promosi. Di-seed dari landing-page.config.js; diubah via UI Settings -> Landing Page.';

COMMENT ON COLUMN landing_config.section IS 'Bagian konfigurasi: hero, stats, promo_banner, features, contact_info, reservation, articles_header, seo.';
COMMENT ON COLUMN landing_config.key IS 'Kunci konfigurasi dalam section (mis. badge, title, max_pax).';
COMMENT ON COLUMN landing_config.value IS 'Nilai konfigurasi sebagai jsonb (string/number/boolean/object/array).';

CREATE INDEX IF NOT EXISTS landing_config_section_idx ON landing_config (section);

COMMIT;
