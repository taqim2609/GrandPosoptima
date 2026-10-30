#!/usr/bin/env node
/**
 * Sync P1A POS Engine completed orders → GrandPOS Analytics via /sync/orders
 * - Resolves P1A product_id → P1A product.sku (seeded in analytics products)
 * - Converts weight (ons) → weight_grams for analytics
 * - Maps table_id → table_code (analytics tables use simple codes "1", "2", ...)
 */

const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '../data/pos-db.json');
const STATE_PATH = path.join(__dirname, '../data/analytics-sync-state.json');

// Config via env
const ANALYTICS_URL = process.env.ANALYTICS_URL || 'http://172.20.0.1:8000';
const NODE_KEY = process.env.NODE_SYNC_KEY || '5165e51710e1728591b940b8d65fd753223a5f01e1f41ce8';
const NODE_ID = process.env.NODE_ID || 'gudang-644';

function loadDb() {
  return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
}

function loadState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
  } catch {
    return { synced: {}, lastRun: null };
  }
}

function saveState(state) {
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
}

// P1A item type → analytics channel
const TYPE_CHANNEL = { makanan: 'fnb', minuman: 'fnb', vendor: 'fnb', retail: 'retail' };
const ORDER_TYPE_MAP = { dine_in: 'dine_in', take_away: 'takeaway', takeaway: 'takeaway', retail: 'retail' };

function resolveSku(productId, productsById) {
  const p = productsById.get(productId);
  if (!p) return null;
  return p.sku && String(p.sku).trim() ? p.sku : null;
}

function mapOrderToTxn(order, productsById) {
  const items = (order.items || []).map((item) => {
    const sku = resolveSku(item.product_id, productsById);
    const rawType = (item.type || 'makanan').toLowerCase();
    const channel = TYPE_CHANNEL[rawType] || 'fnb';
    const qty = Number(item.qty) || 1;
    const price = Math.round(Number(item.price) || 0);
    const weight = item.weight ? Number(item.weight) : null;
    const weightUnit = item.weight_unit;

    // edge_sync reads `weight` field and computes weight_grams = weight * 1000 (assuming kg).
    // P1A uses weight_unit 'ons' = 100g. Convert: weight_kg = weight_ons / 10.
    let weight_kg = null;
    if (weight != null && weightUnit === 'ons') {
      weight_kg = weight / 10; // ons → kg (1 ons = 0.1 kg)
    } else if (weight != null) {
      weight_kg = weight; // assume already kg
    }

    return {
      sku,
      name: item.name,
      type: rawType,
      qty,
      price,
      weight: weight_kg,          // edge_sync expects 'weight' field (kg)
      weight_unit: weightUnit,    // keep for reference (not used by edge_sync)
      note: item.notes || null
    };
  });

  const pm = order.payment_method || 'cash';
  const paymentMethodType = pm === 'qris' ? 'qris' : 'cash';
  const paymentMethodName = order.payment_method_name || (pm === 'qris' ? 'QRIS' : 'Tunai');

  // table_id UUID → table_code (analytics uses "1", "2", etc.)
  // P1A tables have name = "1", "2", etc. We'll send table_name = P1A table.name if exists.
  let table_code = null;
  if (order.table_id) {
    // We don't have tables map here; send table_id as code, analytics will try code or label match.
    // Better: send numeric table code if we can resolve. For now send table_id; analytics _resolve_table
    // matches code or label. P1A table names are "1", "2", etc. but order only has table_id.
    // We'll look up table_name from db.tables in main() and pass it.
    table_code = order.table_code || null; // will be set externally
  }

  return {
    client_ref: order.id,
    order_number: order.order_number,
    items,
    order_type: ORDER_TYPE_MAP[order.order_type] || order.order_type,
    table_code,
    total: Math.round(Number(order.total) || 0),
    subtotal: Math.round(Number(order.subtotal) || Number(order.total) || 0),
    discount: Math.round(Number(order.discount) || 0),
    service_tax: Math.round(Number(order.service_tax) || 0),
    payment_method: paymentMethodType,
    payment_method_type: paymentMethodType,
    payment_method_name: paymentMethodName,
    amount_paid: Math.round(Number(order.amount_paid) || Number(order.total) || 0),
    change: Math.round(Number(order.change) || 0),
    cashier_username: order.cashier_name || null,
    customer_name: order.customer_name || null,
    note: order.note || null,
    paid_at: order.paid_at || order.created_at,
    created_at: order.created_at
  };
}

async function syncOrder(txn) {
  const url = `${ANALYTICS_URL}/sync/orders`;
  const payload = { node_id: NODE_ID, transactions: [txn] };

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Node-Key': NODE_KEY },
    body: JSON.stringify(payload)
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${JSON.stringify(data)}`);
  if (!data.ok) throw new Error(`API error: ${JSON.stringify(data)}`);
  return data;
}

async function main() {
  console.log('=== P1A → Analytics Sync (Backfill) ===');
  console.log(`URL: ${ANALYTICS_URL} | Node: ${NODE_ID} | Key: ${NODE_KEY.slice(0,8)}...`);

  const db = loadDb();
  const state = loadState();
  const productsById = new Map((db.data?.products || []).map((p) => [p.id, p]));
  const tablesById = new Map((db.data?.tables || []).map((t) => [t.id, t]));

  const orders = (db.data?.orders || []).filter((o) => o.status === 'completed');
  console.log(`Completed orders: ${orders.length}`);

  // Reset state for fresh backfill (previous run had wrong count)
  state.synced = {};

  let accepted = 0, duplicate = 0, rejected = 0, failed = 0;

  for (const order of orders) {
    const clientRef = order.id;

    // Resolve table_code from P1A table
    const table = order.table_id ? tablesById.get(order.table_id) : null;
    const table_code = table ? table.name : null; // table.name is "1", "2", ...

    const txn = mapOrderToTxn(order, productsById);
    txn.table_code = table_code;

    try {
      console.log(`  ⏳ ${order.order_number} (${clientRef})...`);
      const result = await syncOrder(txn);
      console.log(`    ✅ accepted=${result.accepted}, duplicate=${result.duplicate}, rejected=${result.rejected}`);
      if (result.results?.length) {
        for (const r of result.results) {
          console.log(`      → order_id=${r.order_id}, order_number=${r.order_number}, status=${r.status}, shift_id=${r.shift_id}`);
        }
      }
      if (result.errors?.length) {
        for (const e of result.errors) console.log(`      ❌ ${e.client_ref}: ${e.error}`);
      }
      accepted += result.accepted;
      duplicate += result.duplicate;
      rejected += result.rejected;
      state.synced[clientRef] = { ok: true, at: new Date().toISOString(), result };
    } catch (err) {
      console.error(`    ❌ ${err.message}`);
      failed += 1;
      state.synced[clientRef] = { ok: false, at: new Date().toISOString(), error: err.message };
    }
    saveState(state);
    await new Promise((r) => setTimeout(r, 100));
  }

  state.lastRun = new Date().toISOString();
  saveState(state);

  console.log('\n=== Summary ===');
  console.log(`  Accepted: ${accepted}`);
  console.log(`  Duplicate: ${duplicate}`);
  console.log(`  Rejected: ${rejected}`);
  console.log(`  Failed (network/exception): ${failed}`);
  console.log(`  Total processed: ${orders.length}`);

  if (rejected + failed > 0) process.exit(1);
}

main().catch((err) => { console.error('Fatal:', err); process.exit(1); });