-- GrandPOS seed data — Grand Aceh Kuliner
-- Safe to run repeatedly (idempotent upserts on natural keys).
--
-- SECURITY: this file never contains a usable password. `taqim2609` is seeded
-- as SUPERADMIN with a credential row that is explicitly disabled and flagged
-- `bootstrap_required = TRUE`. The hash is produced by an operator-run
-- bootstrap step (see README "Bootstrap the superadmin") that reads the
-- password from the environment / a secret prompt. Until that step runs, the
-- account cannot authenticate.
--
-- The bootstrap step may also be driven from psql:
--   \set superadmin_password :'GRANDPOS_SUPERADMIN_PASSWORD'
-- and then executed with the crypt() expression shown at the bottom.

BEGIN;

SET LOCAL grandpos.timezone = 'Asia/Jakarta';

-- ---------------------------------------------------------------------------
-- Staff
-- ---------------------------------------------------------------------------

INSERT INTO users (username, display_name, role, phone, default_shift)
VALUES
  ('taqim2609', 'Qim (Superadmin)', 'superadmin', NULL, 'pagi'),
  ('kasir1',    'Kasir Pagi',        'cashier',    NULL, 'pagi'),
  ('kasir2',    'Kasir Sore',        'cashier',    NULL, 'sore'),
  ('dapur1',    'Dapur',             'kitchen',    NULL, 'pagi'),
  ('owner1',    'Owner Grand Aceh',  'owner',      NULL, 'pagi')
ON CONFLICT (username) DO UPDATE
  SET display_name = EXCLUDED.display_name,
      role = EXCLUDED.role,
      updated_at = now();

-- Explicitly locked credentials for every seeded account.
INSERT INTO user_credentials (user_id, password_hash, bootstrap_required, disabled)
SELECT u.id, NULL, TRUE, TRUE
FROM users u
WHERE u.username IN ('taqim2609', 'kasir1', 'kasir2', 'dapur1', 'owner1')
ON CONFLICT (user_id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Settings
-- ---------------------------------------------------------------------------

INSERT INTO settings (key, value, description)
VALUES
  ('outlet.name',            '"Grand Aceh Kuliner"', 'Nama outlet'),
  ('outlet.address',         '"Banda Aceh"',         'Alamat outlet'),
  ('outlet.timezone',        '"Asia/Jakarta"',       'Zona waktu operasional'),
  ('outlet.currency',        '"IDR"',                'Mata uang, integer IDR'),
  ('pos.service_charge_pct', '0',                    'Service charge dalam persen'),
  ('pos.tax_pct',            '0',                    'PB1/pajak dalam persen'),
  ('member.points_per_1000', '1',                    'Poin per Rp1.000 pembelian bersih'),
  ('member.points_value',    '100',                  'Nilai rupiah 1 poin saat redeem'),
  ('whatsapp.deliver_only',  'true',                 'Webhook Hermes hanya mengirim, tidak memicu agen'),
  ('whatsapp.outbox_route',  '"/webhooks/grandpos-outbox"', 'Rute webhook outbox')
ON CONFLICT (key) DO UPDATE
  SET value = EXCLUDED.value,
      description = EXCLUDED.description,
      updated_at = now();

-- ---------------------------------------------------------------------------
-- Floor plan (denah meja)
-- ---------------------------------------------------------------------------

INSERT INTO tables (code, label, seats, zone, sort_order)
VALUES
  ('T01', 'Meja 1',  2, 'indoor',  1),
  ('T02', 'Meja 2',  2, 'indoor',  2),
  ('T03', 'Meja 3',  4, 'indoor',  3),
  ('T04', 'Meja 4',  4, 'indoor',  4),
  ('T05', 'Meja 5',  6, 'indoor',  5),
  ('T06', 'Meja 6',  6, 'indoor',  6),
  ('TL01', 'Leshan 1', 4, 'outdoor', 7),
  ('TL02', 'Leshan 2', 4, 'outdoor', 8)
ON CONFLICT (code) DO UPDATE
  SET label = EXCLUDED.label,
      seats = EXCLUDED.seats,
      zone = EXCLUDED.zone,
      sort_order = EXCLUDED.sort_order,
      updated_at = now();

-- ---------------------------------------------------------------------------
-- Vendors (titipan bagi hasil)
-- ---------------------------------------------------------------------------

INSERT INTO vendors (name, contact_phone, profit_share_percent)
VALUES
  ('Dapur Grand Aceh',       NULL, 0.000),
  ('Mitra Kue Aceh',         NULL, 20.000),
  ('Titipan Kopi Gayo',      NULL, 15.000)
ON CONFLICT (name) DO UPDATE
  SET profit_share_percent = EXCLUDED.profit_share_percent,
      updated_at = now();

-- ---------------------------------------------------------------------------
-- Categories
-- ---------------------------------------------------------------------------

INSERT INTO categories (name, slug, channel, sort_order)
VALUES
  ('Makanan Aceh',   'makanan-aceh',   'fnb',    1),
  ('Minuman Aceh',   'minuman-aceh',   'fnb',    2),
  ('Kue & Snack',    'kue-snack',      'retail', 3),
  ('Kopi Kemasan',   'kopi-kemasan',   'retail', 4)
ON CONFLICT (slug) DO UPDATE
  SET name = EXCLUDED.name,
      channel = EXCLUDED.channel,
      sort_order = EXCLUDED.sort_order,
      updated_at = now();

-- ---------------------------------------------------------------------------
-- Products — menu khas Aceh + retail, incl. weighted items (harga = berat x base)
-- ---------------------------------------------------------------------------

WITH c AS (SELECT slug, id FROM categories), v AS (SELECT name, id FROM vendors)
INSERT INTO products
  (sku, name, category_id, channel, base_price, cost_price, sold_by_weight, unit,
   weight_rounding, points_earn_rate, vendor_id)
SELECT
  m.sku, m.name, c.id, m.channel::channel_type, m.base_price, m.cost_price,
  m.sold_by_weight, m.unit, m.weight_rounding, m.points_earn_rate, v.id
FROM (VALUES
  ('MKA-001', 'Mie Aceh',         'makanan-aceh', 'fnb',    38000::BIGINT, 18000::BIGINT, FALSE, 'portion', 0.001::NUMERIC, 0.5::NUMERIC, 'Dapur Grand Aceh'),
  ('MKA-002', 'Ayam Tangkap',     'makanan-aceh', 'fnb',    55000::BIGINT, 27000::BIGINT, FALSE, 'portion', 0.001::NUMERIC, 0.5::NUMERIC, 'Dapur Grand Aceh'),
  ('MKA-003', 'Nasi Goreng Aceh', 'makanan-aceh', 'fnb',    35000::BIGINT, 16000::BIGINT, FALSE, 'portion', 0.001::NUMERIC, 0.5::NUMERIC, 'Dapur Grand Aceh'),
  ('MKA-004', 'Ayam Tangkap Kiloan', 'makanan-aceh', 'fnb', 120::BIGINT,   60::BIGINT,    TRUE,  'gram',    0.001::NUMERIC, 0.5::NUMERIC, 'Dapur Grand Aceh'),
  ('MNA-001', 'Kopi Sanger',      'minuman-aceh', 'fnb',    22000::BIGINT, 8000::BIGINT,  FALSE, 'glass',   0.001::NUMERIC, 0.5::NUMERIC, 'Dapur Grand Aceh'),
  ('MNA-002', 'Teh Tarik',        'minuman-aceh', 'fnb',    15000::BIGINT, 5000::BIGINT,  FALSE, 'glass',   0.001::NUMERIC, 0.5::NUMERIC, 'Dapur Grand Aceh'),
  ('RTL-001', 'Kopi Gayo 250g',   'kopi-kemasan', 'retail', 75000::BIGINT, 45000::BIGINT, FALSE, 'pcs',     0.001::NUMERIC, 1.0::NUMERIC, 'Titipan Kopi Gayo'),
  ('RTL-002', 'Kopi Gayo Bubuk Kiloan', 'kopi-kemasan', 'retail', 180::BIGINT, 95::BIGINT, TRUE, 'gram',  0.001::NUMERIC, 1.0::NUMERIC, 'Titipan Kopi Gayo'),
  ('RTL-003', 'Kue Bhoi',         'kue-snack',    'retail', 12000::BIGINT, 6000::BIGINT,  FALSE, 'pcs',     0.001::NUMERIC, 1.0::NUMERIC, 'Mitra Kue Aceh'),
  ('RTL-004', 'Timphan',          'kue-snack',    'retail', 10000::BIGINT, 4500::BIGINT,  FALSE, 'pcs',     0.001::NUMERIC, 1.0::NUMERIC, 'Mitra Kue Aceh')
) AS m(sku, name, cat_slug, channel, base_price, cost_price, sold_by_weight, unit, weight_rounding, points_earn_rate, vendor_name)
JOIN c ON c.slug = m.cat_slug
JOIN v ON v.name = m.vendor_name
ON CONFLICT (sku) DO UPDATE
  SET name = EXCLUDED.name,
      category_id = EXCLUDED.category_id,
      channel = EXCLUDED.channel,
      base_price = EXCLUDED.base_price,
      cost_price = EXCLUDED.cost_price,
      sold_by_weight = EXCLUDED.sold_by_weight,
      unit = EXCLUDED.unit,
      vendor_id = EXCLUDED.vendor_id,
      updated_at = now();

-- ---------------------------------------------------------------------------
-- Ingredients (bahan dapur) — a few deliberately below minimum stock
-- ---------------------------------------------------------------------------

INSERT INTO ingredients (sku, name, unit, stock_qty, min_stock_qty, reorder_qty, last_cost_price)
VALUES
  ('BHN-001', 'Mie Kuning',          'kg',   18.000,  10.000, 20.000, 14000),
  ('BHN-002', 'Ayam Kampung',        'kg',   12.500,  15.000, 25.000, 42000),
  ('BHN-003', 'Bumbu Mie Aceh',      'kg',    6.000,   4.000, 10.000, 25000),
  ('BHN-004', 'Biji Kopi Gayo',      'kg',    9.750,  12.000, 20.000, 95000),
  ('BHN-005', 'Santan Kelapa',       'liter', 14.000,   8.000, 16.000, 18000),
  ('BHN-006', 'Beras Pandan Wangi',  'kg',   40.000,  25.000, 50.000, 15500),
  ('BHN-007', 'Gula Aren',           'kg',    3.500,   5.000, 10.000, 28000),
  ('BHN-008', 'Daun Kari',           'kg',    2.000,   1.000,  3.000, 30000),
  ('BHN-009', 'Tepung Beras',        'kg',   20.000,  10.000, 25.000, 12000),
  ('BHN-010', 'Kelapa Parut',        'kg',    7.250,   6.000, 12.000, 16000)
ON CONFLICT (sku) DO UPDATE
  SET name = EXCLUDED.name,
      unit = EXCLUDED.unit,
      stock_qty = EXCLUDED.stock_qty,
      min_stock_qty = EXCLUDED.min_stock_qty,
      reorder_qty = EXCLUDED.reorder_qty,
      last_cost_price = EXCLUDED.last_cost_price,
      updated_at = now();

-- ---------------------------------------------------------------------------
-- Recipes (BOM); weighted products consume per gram
-- ---------------------------------------------------------------------------

WITH p AS (SELECT sku, id FROM products), i AS (SELECT sku, id FROM ingredients)
INSERT INTO recipes (product_id, ingredient_id, qty_per_unit)
SELECT p.id, i.id, r.qty
FROM (VALUES
  ('MKA-001', 'BHN-001', 0.200::NUMERIC),
  ('MKA-001', 'BHN-002', 0.080::NUMERIC),
  ('MKA-001', 'BHN-003', 0.030::NUMERIC),
  ('MKA-001', 'BHN-005', 0.100::NUMERIC),
  ('MKA-002', 'BHN-002', 0.250::NUMERIC),
  ('MKA-002', 'BHN-008', 0.020::NUMERIC),
  ('MKA-003', 'BHN-006', 0.200::NUMERIC),
  ('MKA-003', 'BHN-002', 0.060::NUMERIC),
  ('MKA-004', 'BHN-002', 1.000::NUMERIC),
  ('MKA-004', 'BHN-008', 0.050::NUMERIC),
  ('MNA-001', 'BHN-004', 0.020::NUMERIC),
  ('MNA-001', 'BHN-005', 0.050::NUMERIC),
  ('MNA-002', 'BHN-005', 0.030::NUMERIC),
  ('MNA-002', 'BHN-007', 0.010::NUMERIC),
  ('RTL-003', 'BHN-009', 0.040::NUMERIC),
  ('RTL-003', 'BHN-010', 0.030::NUMERIC),
  ('RTL-004', 'BHN-009', 0.030::NUMERIC),
  ('RTL-004', 'BHN-010', 0.040::NUMERIC)
) AS r(product_sku, ingredient_sku, qty)
JOIN p ON p.sku = r.product_sku
JOIN i ON i.sku = r.ingredient_sku
ON CONFLICT (product_id, ingredient_id) DO UPDATE
  SET qty_per_unit = EXCLUDED.qty_per_unit,
      updated_at = now();

-- ---------------------------------------------------------------------------
-- Members, promo, coupon
-- ---------------------------------------------------------------------------

INSERT INTO members (member_code, name, phone, points_balance, tier, total_spend)
VALUES
  ('MBR-0001', 'Cut Nyak',   '0811000001', 120, 'silver', 450000),
  ('MBR-0002', 'Teuku Umar', '0811000002', 40,  'bronze', 120000)
ON CONFLICT (member_code) DO UPDATE
  SET name = EXCLUDED.name,
      phone = EXCLUDED.phone,
      updated_at = now();

INSERT INTO promos (code, name, kind, value, min_subtotal, max_discount, channel)
VALUES
  ('DISKON-10', 'Diskon 10% semua menu', 'percent', 10, 100000, 25000, NULL),
  ('HEMAT-5K',  'Potongan Rp5.000',      'amount',  5000,  50000, NULL, 'retail')
ON CONFLICT (code) DO UPDATE
  SET name = EXCLUDED.name,
      kind = EXCLUDED.kind,
      value = EXCLUDED.value,
      min_subtotal = EXCLUDED.min_subtotal,
      max_discount = EXCLUDED.max_discount,
      channel = EXCLUDED.channel,
      updated_at = now();

INSERT INTO coupons (code, member_id, promo_id, status)
SELECT 'KUPON-MBR0001-001', m.id, p.id, 'issued'
FROM members m, promos p
WHERE m.member_code = 'MBR-0001' AND p.code = 'DISKON-10'
ON CONFLICT (code) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Content
-- ---------------------------------------------------------------------------

INSERT INTO articles (slug, title, excerpt, body, category, status, published_at)
VALUES
  ('selamat-datang-grand-aceh', 'Selamat Datang di Grand Aceh Kuliner',
   'Restoran khas Aceh dengan sentuhan retail oleh-oleh.',
   'Grand Aceh Kuliner menyajikan Mie Aceh, Ayam Tangkap, dan Kopi Sanger dengan bahan segar setiap hari.',
   'berita', 'published', now())
ON CONFLICT (slug) DO UPDATE
  SET title = EXCLUDED.title,
      excerpt = EXCLUDED.excerpt,
      updated_at = now();

-- ---------------------------------------------------------------------------
-- Landing Page Configuration
-- ---------------------------------------------------------------------------
-- Seed dari src/config/landing-page.config.js (DEFAULT_LANDING_CONFIG).
-- Upsert per (section, key) agar aman dijalankan berulang.

INSERT INTO landing_config (section, key, value, description)
VALUES
  -- Hero Banner
  ('hero', 'badge',           '"Restoran & Kuliner Otentik Aceh"',        'Badge di atas judul hero'),
  ('hero', 'title',           '"Cita Rasa Otentik Tanah Rencong"',         'Judul utama hero'),
  ('hero', 'subtitle',        '"Nikmati Kelezatan Mie Aceh Rempah, Nasi Gurih, dan Kopi Ulee Kareng Pilihan dengan Suasana Hangat dan Pelayanan Terbaik."', 'Subjudul hero'),
  ('hero', 'image_url',       '"/screenshot-desktop.png"',                 'URL gambar hero (relative ke public)'),
  ('hero', 'primary_cta',     '{"text": "Lihat Menu & Order", "link": "#menu"}',      'CTA utama hero'),
  ('hero', 'secondary_cta',   '{"text": "Reservasi Meja", "link": "#reservasi"}',       'CTA sekunder hero'),

  -- Statistik & Keunggulan Toko
  ('stats', 'show_section',   'true',                                     'Tampilkan section statistik'),
  ('stats', 'items',          '[{"id": "years", "label": "Tahun Berkelana Rasa", "value": "15+", "suffix": "Tahun"}, {"id": "recipes", "label": "Resep Warisan Khas", "value": "48+", "suffix": "Varian"}, {"id": "rating", "label": "Kepuasan Pelanggan", "value": "4.9/5.0", "suffix": "Bintang"}, {"id": "capacity", "label": "Kapasitas Pengunjung", "value": "120+", "suffix": "Kursi"}]', 'Array item statistik'),

  -- Highlight Promo & Pengumuman
  ('promo_banner', 'enabled',      'true',                                        'Aktifkan promo banner'),
  ('promo_banner', 'badge',        '"PROMO BULAN INI"',                            'Badge promo'),
  ('promo_banner', 'title',        '"Diskon 15% Paket Keluarga Mie Aceh Tumis + Es Kopi Sanger"', 'Judul promo'),
  ('promo_banner', 'subtitle',     '"Berlaku untuk Dine-in & Takeaway setiap hari Senin - Kamis jam 14:00 - 17:00 WIB."', 'Subjudul promo'),
  ('promo_banner', 'cta_text',     '"Klaim Kupon Member"',                         'Teks CTA promo'),
  ('promo_banner', 'cta_link',     '"#menu"',                                      'Link CTA promo'),

  -- Fitur Layanan Otentik
  ('features', 'items', '[{"id": "rempah", "title": "Rempah Asli Banda Aceh", "desc": "Bumbu diracik secara tradisional menggunakan lebih dari 18 jenis rempah khas Aceh pilihan.", "icon": "Flame"}, {"id": "halal", "title": "100% Halal & Thayyib", "desc": "Seluruh bahan makanan dan proses penyajian dijamin halal, bersih, dan higienis.", "icon": "ShieldCheck"}, {"id": "coffee", "title": "Kopi Saring Ulee Kareng", "desc": "Diseduh langsung dengan teknik saring tradisional oleh barista kopi Aceh berpengalaman.", "icon": "Coffee"}]', 'Array fitur layanan'),

  -- Jam Operasional & Kontak Toko
  ('contact_info', 'address',         '"Jl. T. Nyak Arief No. 88, Syiah Kuala, Banda Aceh"', 'Alamat toko'),
  ('contact_info', 'google_maps_url', '"https://maps.google.com/?q=Banda+Aceh"',             'Link Google Maps'),
  ('contact_info', 'phone',           '"0812-6900-1234"',                                    'Nomor telepon'),
  ('contact_info', 'whatsapp',        '"6281269001234"',                                     'Nomor WhatsApp (format internasional)'),
  ('contact_info', 'email',           '"info@grandacehkuliner.com"',                          'Email toko'),
  ('contact_info', 'opening_hours',   '"Setiap Hari: 08:00 - 23:00 WIB"',                   'Jam operasional'),
  ('contact_info', 'instagram',       '"@grandacehkuliner"',                                  'Handle Instagram'),

  -- Pengaturan Reservasi & Meja
  ('reservation', 'title',       '"Reservasi Meja & Ruangan"',                                'Judul reservasi'),
  ('reservation', 'subtitle',    '"Pesan tempat terlebih dahulu untuk acara keluarga, reuni, atau santap siang kolega."', 'Subjudul reservasi'),
  ('reservation', 'note',        '"Kapasitas area dan meja mengikuti data Manajemen Meja real-time."', 'Catatan reservasi'),
  ('reservation', 'max_pax',     '20',                                                        'Maksimal orang per reservasi'),

  -- Header Seksi Cerita & Filosofi Kuliner
  ('articles_header', 'badge',    '"Kisah & Filosofi Kuliner"',                                'Badge artikel'),
  ('articles_header', 'title',    '"Cerita di Balik Rempah Tanah Rencong"',                    'Judul artikel header'),
  ('articles_header', 'subtitle', '"Setiap mangkuk masakan dan cangkir kopi menyimpan sejarah panjang persilangan budaya pesisir, tradisi kenduri, dan kearifan masyarakat Aceh."', 'Subjudul artikel header'),

  -- Meta SEO & Google Search Snippet Preview
  ('seo', 'site_title',       '"Grand Aceh Kuliner — Restoran & Mie Aceh Otentik"',         'Judul situs'),
  ('seo', 'meta_title',       '"Grand Aceh Kuliner — Restoran & Mie Aceh Otentik"',         'Meta title SEO'),
  ('seo', 'meta_description', '"Nikmati Kelezatan Mie Aceh Rempah, Nasi Gurih, Kopi Ulee Kareng, dan Ayam Tangkap khas Banda Aceh dengan resep warisan otentik 100% halal."', 'Meta description SEO'),
  ('seo', 'og_image_url',     '"/screenshot-desktop.png"',                                    'Open Graph image'),
  ('seo', 'site_name',        '"Grand Aceh Kuliner"',                                         'Nama situs OG'),
  ('seo', 'canonical_url',    '"https://grandacehkuliner.com"',                               'Canonical URL'),
  ('seo', 'keywords',         '"Mie Aceh, Restoran Aceh, Kopi Sanger, Kuliner Banda Aceh, Halal Food"', 'Keywords SEO'),
  ('seo', 'twitter_handle',   '"@grandacehkuliner"',                                          'Twitter handle')
ON CONFLICT (section, key) DO UPDATE
  SET value = EXCLUDED.value,
      description = EXCLUDED.description,
      updated_at = now();

COMMIT;

-- ---------------------------------------------------------------------------
-- Bootstrap the superadmin (run manually, never committed with a literal)
-- ---------------------------------------------------------------------------
-- Option A — psql with an env-provided value:
--   psql \"$DATABASE_URL\" -v pw=\"$GRANDPOS_SUPERADMIN_PASSWORD\" -f db/bootstrap_superadmin.sql
-- Option B — inline:
--   UPDATE user_credentials c
--      SET password_hash = crypt(:'pw', gen_salt('bf', 12)),
--          disabled = FALSE,
--          bootstrap_required = FALSE,
--          updated_at = now()
--    FROM users u
--   WHERE u.id = c.user_id AND u.username = 'taqim2609' AND :'pw' <> '';
