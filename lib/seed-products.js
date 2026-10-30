#!/usr/bin/env node
/**
 * Generate SQL to seed P1A products into analytics products table
 * Upserts by SKU (unique constraint) — idempotent.
 */
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '../data/pos-db.json');
const OUT_PATH = path.join(__dirname, '../data/seed-products.sql');

function loadDb() {
  return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
}

function mapCategory(type) {
  switch (type) {
    case 'makanan': return 1;
    case 'minuman': return 2;
    case 'vendor': return 1;
    case 'retail': return 3;
    default: return 1;
  }
}

function mapChannel(type) {
  return type === 'retail' ? 'retail' : 'fnb';
}

function mapUnit(p) {
  // weight_sale products are sold by weight with weight_unit (e.g. 'ons')
  if (p.weight_sale && p.weight_unit) {
    return { sold_by_weight: true, unit: p.weight_unit };
  }
  return { sold_by_weight: false, unit: 'pcs' };
}

function main() {
  const db = loadDb();
  const products = db.data?.products || [];
  console.log(`Total P1A products: ${products.length}`);

  const lines = [
    '-- Auto-generated seed for P1A products into analytics products table',
    '-- Run via: docker exec -i grandpos-db-1 psql -U grandpos_app -d grandpos < seed-products.sql',
    '',
    'BEGIN;',
    ''
  ];

  let count = 0;
  for (const p of products) {
    if (!p.sku || !p.name) continue;
    if (!p.active) continue;
    if (p.price == null || p.price <= 0) continue;

    const categoryId = mapCategory(p.type);
    const channel = mapChannel(p.type);
    const { sold_by_weight, unit } = mapUnit(p);
    const basePrice = Math.round(p.price || 0);
    const costPrice = Math.round(p.cost || 0);
    const name = p.name.replace(/'/g, "''");
    const sku = p.sku;

    lines.push(
      `INSERT INTO products (sku, name, category_id, channel, base_price, cost_price, ` +
      `sold_by_weight, unit, weight_rounding, is_active) ` +
      `VALUES ('${sku}', '${name}', ${categoryId}, '${channel}', ${basePrice}, ${costPrice}, ` +
      `${sold_by_weight}, '${unit}', 0.001, true) ` +
      `ON CONFLICT (sku) DO UPDATE SET ` +
      `name = EXCLUDED.name, ` +
      `category_id = EXCLUDED.category_id, ` +
      `channel = EXCLUDED.channel, ` +
      `base_price = EXCLUDED.base_price, ` +
      `cost_price = EXCLUDED.cost_price, ` +
      `sold_by_weight = EXCLUDED.sold_by_weight, ` +
      `unit = EXCLUDED.unit, ` +
      `is_active = EXCLUDED.is_active, ` +
      `updated_at = now();`
    );
    count++;
  }

  lines.push('');
  lines.push(`-- Seeded ${count} products`);
  lines.push('COMMIT;');

  fs.writeFileSync(OUT_PATH, lines.join('\n'));
  console.log(`Generated ${count} product upserts → ${OUT_PATH}`);
}

main();