/**
 * GrandPOS Analytics Sync Module
 * 
 * Handles async, idempotent sync of completed orders from P1A POS Engine
 * to GrandPOS Analytics (PostgreSQL) via /sync/orders endpoint.
 * 
 * Architecture:
 * - Outbox pattern: writes to data/analytics-outbox.json
 * - Background worker drains outbox with exponential backoff
 * - Idempotency via client_ref (order.id) + edge_transactions unique constraint
 */

const fs = require('fs');
const path = require('path');

const OUTBOX_PATH = path.join(__dirname, '../data/analytics-outbox.json');
const STATE_PATH = path.join(__dirname, '../data/analytics-sync-state.json');

// Config via env (with sensible defaults)
const ANALYTICS_URL = process.env.ANALYTICS_URL || 'http://172.20.0.1:8000';
const NODE_KEY = process.env.NODE_SYNC_KEY || '';
const NODE_ID = process.env.NODE_ID || 'gudang-644';

// Internal
let outbox = [];
let state = { synced: {}, lastRun: null };
let workerInterval = null;
let isDraining = false;

// P1A item type → analytics channel
const TYPE_CHANNEL = { makanan: 'fnb', minuman: 'fnb', vendor: 'fnb', retail: 'retail' };
const ORDER_TYPE_MAP = { dine_in: 'dine_in', take_away: 'takeaway', takeaway: 'takeaway', retail: 'retail' };

function loadOutbox() {
  try {
    const raw = fs.readFileSync(OUTBOX_PATH, 'utf8');
    outbox = JSON.parse(raw);
  } catch {
    outbox = [];
  }
}

function saveOutbox() {
  fs.writeFileSync(OUTBOX_PATH, JSON.stringify(outbox, null, 2));
}

function loadState() {
  try {
    state = JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
  } catch {
    state = { synced: {}, lastRun: null };
  }
}

function saveState() {
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
}

function resolveSku(productId, productsById) {
  const p = productsById.get(productId);
  if (!p) return null;
  return p.sku && String(p.sku).trim() ? p.sku : null;
}

function mapOrderToTxn(order, productsById, tablesById) {
  const items = (order.items || []).map((item) => {
    const sku = resolveSku(item.product_id, productsById);
    const rawType = (item.type || 'makanan').toLowerCase();
    const channel = TYPE_CHANNEL[rawType] || 'fnb';
    const qty = Number(item.qty) || 1;
    const price = Math.round(Number(item.price) || 0);
    const weight = item.weight ? Number(item.weight) : null;
    const weightUnit = item.weight_unit;

    // edge_sync reads `weight` field (kg) → weight_grams = weight * 1000
    // P1A uses 'ons' = 100g. Convert: weight_kg = weight_ons / 10.
    let weight_kg = null;
    if (weight != null && weightUnit === 'ons') {
      weight_kg = weight / 10;
    } else if (weight != null) {
      weight_kg = weight;
    }

    return {
      sku,
      name: item.name,
      type: rawType,
      qty,
      price,
      weight: weight_kg,
      weight_unit: weightUnit,
      note: item.notes || null
    };
  });

  const pm = order.payment_method || 'cash';
  const paymentMethodType = pm === 'qris' ? 'qris' : 'cash';
  const paymentMethodName = order.payment_method_name || (pm === 'qris' ? 'QRIS' : 'Tunai');

  // table_id UUID → table_code (analytics tables use name "1", "2", etc.)
  const table = order.table_id ? tablesById.get(order.table_id) : null;
  const table_code = table ? table.name : null;

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

// Main drain function: processes pending items in outbox
async function drainOutbox(dbRef) {
  if (isDraining || outbox.length === 0) return;
  if (!NODE_KEY) {
    console.warn('[AnalyticsSync] NODE_SYNC_KEY not set — skipping sync');
    return;
  }

  isDraining = true;
  const productsById = new Map((dbRef?.data?.products || []).map((p) => [p.id, p]));
  const tablesById = new Map((dbRef?.data?.tables || []).map((t) => [t.id, t]));

  for (const entry of outbox) {
    if (entry.done) continue;
    if (entry.attempts >= 5) {
      console.warn(`[AnalyticsSync] Max retries reached for ${entry.client_ref}, giving up`);
      entry.error = 'max retries exceeded';
      entry.lastAttempt = new Date().toISOString();
      continue;
    }

    // Exponential backoff
    const delayMs = Math.min(1000 * Math.pow(2, entry.attempts), 30000);
    if (entry.nextAttempt && new Date(entry.nextAttempt) > new Date()) {
      continue; // not yet time to retry
    }

    try {
      const txn = mapOrderToTxn(entry.order, productsById, tablesById);
      const result = await syncOrder(txn);

      if (result.accepted > 0 || result.duplicate > 0) {
        entry.done = true;
        entry.result = result;
        entry.syncedAt = new Date().toISOString();
        state.synced[entry.client_ref] = { ok: true, at: entry.syncedAt, result };
        console.log(`[AnalyticsSync] ✅ ${entry.order_number} (${entry.client_ref})`);
      } else if (result.rejected > 0) {
        entry.error = result.errors?.[0]?.error || 'rejected by server';
        entry.attempts += 1;
        entry.nextAttempt = new Date(Date.now() + delayMs).toISOString();
        console.error(`[AnalyticsSync] ❌ ${entry.order_number}: ${entry.error} (attempt ${entry.attempts})`);
      }
    } catch (err) {
      entry.error = err.message;
      entry.attempts += 1;
      entry.nextAttempt = new Date(Date.now() + delayMs).toISOString();
      console.error(`[AnalyticsSync] ❌ ${entry.order_number}: ${err.message} (attempt ${entry.attempts})`);
    }

    saveOutbox();
    saveState();

    // Small delay between requests
    await new Promise((r) => setTimeout(r, 100));
  }

  isDraining = false;
}

// Public API
function initSync(dbRef) {
  if (!NODE_KEY) {
    console.warn('[AnalyticsSync] NODE_SYNC_KEY not configured — sync disabled');
    return;
  }
  loadOutbox();
  loadState();
  // Start background drainer
  workerInterval = setInterval(() => drainOutbox(dbRef), 10000); // every 10s
  console.log('[AnalyticsSync] Worker started (interval 10s)');
}

function enqueueOrder(order, dbRef) {
  // Only sync completed/paid orders
  if (!order || order.status !== 'completed') return;

  const clientRef = order.id;
  // Idempotency: already in outbox or already synced
  if (outbox.some((e) => e.client_ref === clientRef && !e.done)) return;
  if (state.synced[clientRef]?.ok) return;

  const entry = {
    client_ref: clientRef,
    order_number: order.order_number,
    order, // keep full order for retry
    attempts: 0,
    createdAt: new Date().toISOString()
  };
  outbox.push(entry);
  saveOutbox();
  console.log(`[AnalyticsSync] 📥 Enqueued ${order.order_number} (${clientRef})`);
}

function shutdownSync() {
  if (workerInterval) clearInterval(workerInterval);
  workerInterval = null;
  console.log('[AnalyticsSync] Worker stopped');
}

// For manual backfill: clear state and re-queue all completed orders
function requeueAllCompleted(dbRef) {
  const orders = (dbRef?.data?.orders || []).filter((o) => o.status === 'completed');
  state.synced = {};
  outbox = [];
  for (const order of orders) {
    enqueueOrder(order, dbRef);
  }
  saveState();
  saveOutbox();
  console.log(`[AnalyticsSync] Re-queued ${orders.length} completed orders`);
  return { queued: orders.length };
}

function getStatus() {
  return {
    enabled: !!NODE_KEY,
    node_id: NODE_ID,
    analytics_url: ANALYTICS_URL,
    pending: outbox.filter((e) => !e.done).length,
    failed: outbox.filter((e) => !e.done && e.attempts > 0).length,
    synced: Object.keys(state.synced).length,
    entries: outbox.map((e) => ({
      client_ref: e.client_ref,
      order_number: e.order_number,
      done: !!e.done,
      attempts: e.attempts || 0,
      error: e.error || null,
      result: e.result || null
    }))
  };
}

module.exports = {
  initSync,
  enqueueOrder,
  shutdownSync,
  requeueAllCompleted,
  drainOutbox,
  getStatus,
  mapOrderToTxn // for testing
};