#!/usr/bin/env node
// Diagnosa: peta order/item P1A ke kontrak /sync/orders analytics.
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '../data/pos-db.json');
const db = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
const products = db.data?.products || [];
const byId = new Map(products.map((p) => [p.id, p]));
const orders = db.data?.orders || [];
const tables = db.data?.tables || [];
const CH = { makanan: 'fnb', minuman: 'fnb', vendor: 'fnb', retail: 'retail' };

console.log('saved_at:', db.saved_at);
console.log('products:', products.length, '| orders:', orders.length, '| tables:', tables.length);

const byStatus = {};
for (const o of orders) byStatus[o.status] = (byStatus[o.status] || 0) + 1;
console.log('byStatus:', JSON.stringify(byStatus));

const unresolved = [];
const noSku = [];
const mixed = [];
let weighted = 0;
for (const o of orders) {
  const chans = new Set();
  for (const it of o.items || []) {
    const p = byId.get(it.product_id);
    if (!p) unresolved.push([o.order_number, it.name, it.product_id]);
    else if (!p.sku || !String(p.sku).trim()) noSku.push([o.order_number, it.name, p.id]);
    chans.add(CH[it.type] || 'fnb');
    if (it.weight) weighted += 1;
  }
  if (chans.has('fnb') && chans.has('retail')) mixed.push([o.order_number, [...chans]]);
}
console.log('item dg product_id tak terresolve di P1A:', unresolved.length, JSON.stringify(unresolved.slice(0, 5)));
console.log('item dg produk P1A tanpa sku:', noSku.length, JSON.stringify(noSku.slice(0, 10)));
console.log('order campur fnb+retail:', JSON.stringify(mixed));
console.log('item bertimbangan (weight):', weighted);
console.log('order_type:', JSON.stringify([...new Set(orders.map((o) => o.order_type))]));
console.log('punya table_name:', orders.filter((o) => o.table_name).length, '| punya table_id:', orders.filter((o) => o.table_id).length);
console.log('contoh tables:', JSON.stringify(tables.slice(0, 6).map((t) => ({ id: t.id, name: t.name }))));
console.log('--- daftar order ---');
for (const o of orders) {
  console.log(
    `${o.order_number} | ${o.status} | ${o.total} | ${o.order_type} | meja=${o.table_name || o.table_id || '-'} | item=${(o.items || []).length} | pm=${o.payment_method} | paid_at=${o.paid_at || '-'}`
  );
}
