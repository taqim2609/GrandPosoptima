#!/usr/bin/env node
// Isolated accounting probe: bakso x3, cash payment, then refund.
// The production snapshot is copied to a temporary data directory and never written.
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const bcrypt = require('bcryptjs');

const ROOT = path.join(__dirname, '..');
const snap = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/pos-db.json'), 'utf8'));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gak-bakso-cash-'));
const user = { id: 'isolated-owner', username: 'isolated-owner', name: 'Isolated Owner', role: 'superadmin', role_base: 'superadmin', is_superadmin: true, active: true, password_hash: bcrypt.hashSync('isolated-pass', 10) };
snap.data.users = [user];
snap.data.orders = [];
snap.data.voidRows = [];
snap.data.shifts = [];
snap.data.shiftHistory = [];
snap.data.currentShift = { id: 'isolated-shift', user_id: user.id, user_name: user.name, status: 'open', opened_at: new Date().toISOString(), opening_cash_fnb: 0, opening_cash_retail: 0, cash_sales: 0, non_cash_sales: 0, total_sales: 0, orders_count: 0 };
fs.writeFileSync(path.join(tmp, 'pos-db.json'), JSON.stringify(snap));

const product = snap.data.products.find((p) => /^bakso$/i.test(String(p.name).trim())) || snap.data.products.find((p) => /bakso/i.test(p.name));
assert(product, 'bakso product exists');
const stockBefore = Number(product.stock || 0);
const expectedTotal = Number(product.price) * 3;
const expectedVendorShare = Math.round(expectedTotal * Number(product.vendor_share_percent || 0)) / 100;
const expectedCogs = Number(product.cost || 0) * 3;
const PORT = 3994;
process.env.PORT = String(PORT); process.env.NODE_ENV = 'test'; process.env.GRANDPOS_DATA_DIR = tmp; process.env.JWT_SECRET = 'isolated-bakso-secret'; process.env.NODE_SYNC_KEY = '';
const app = require(path.join(ROOT, 'api-server.js'));
const req = (method, p, body, token) => new Promise((resolve, reject) => {
  const raw = body ? JSON.stringify(body) : null; const headers = raw ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(raw) } : {};
  if (token) headers.Authorization = `Bearer ${token}`;
  const r = http.request({ host: '127.0.0.1', port: PORT, path: p, method, headers }, (res) => { let s = ''; res.on('data', (c) => s += c); res.on('end', () => { let b = s; try { b = JSON.parse(s); } catch (_) {} resolve({ status: res.statusCode, body: b }); }); });
  r.on('error', reject); if (raw) r.write(raw); r.end();
});

(async () => {
  const server = app.listen(PORT, '127.0.0.1'); await new Promise((r) => server.once('listening', r));
  try {
    const login = await req('POST', '/api/auth/login', { username: user.username, password: 'isolated-pass' });
    assert.strictEqual(login.status, 200); const token = login.body.token;
    const order = await req('POST', '/api/orders', { items: [{ product_id: product.id, qty: 3 }], order_type: 'take_away', pay_now: true, payment_method: 'cash', amount_paid: Number(product.price) * 3 }, token);
    assert.strictEqual(order.status, 200); assert.strictEqual(Number(order.body.total), expectedTotal);
    assert.strictEqual(Number(order.body.amount_paid), expectedTotal);
    assert.strictEqual(Number(order.body.vendor_total_share), expectedVendorShare);
    assert.strictEqual(Number(order.body.items[0].cost || 0) * 3, expectedCogs);
    const outboxPath = path.join(tmp, 'analytics-outbox.json');
    const queuedBeforeRefund = JSON.parse(fs.readFileSync(outboxPath, 'utf8'));
    assert.strictEqual(queuedBeforeRefund.filter((x) => x.order?.id === order.body.id || x.order_id === order.body.id).length, 1, 'paid order enqueued exactly once');
    const afterPay = (await req('GET', '/api/shifts/current', null, token)).body;
    assert.strictEqual(Number(afterPay.cash_sales), Number(product.price) * 3);
    const afterPayDb = JSON.parse(fs.readFileSync(path.join(tmp, 'pos-db.json'), 'utf8')).data;
    assert.strictEqual(Number(afterPayDb.products.find((p) => p.id === product.id).stock), Math.max(0, stockBefore - 3));
    const voided = await req('POST', `/api/orders/${order.body.id}/void`, { action: 'refund', reason: 'Uji terisolasi refund bakso' }, token);
    assert.strictEqual(voided.status, 200); assert.strictEqual(voided.body.order.status, 'refunded');
    const afterVoid = (await req('GET', '/api/shifts/current', null, token)).body;
    assert.strictEqual(Number(afterVoid.cash_sales), 0);
    const afterVoidDb = JSON.parse(fs.readFileSync(path.join(tmp, 'pos-db.json'), 'utf8')).data;
    assert.strictEqual(Number(afterVoidDb.products.find((p) => p.id === product.id).stock), Math.max(0, stockBefore));
    assert.strictEqual(voided.body.order.status, 'refunded');
    assert.strictEqual(voided.body.order.void_reason, 'Uji terisolasi refund bakso');
    const audit = await req('GET', '/api/voids', null, token);
    assert.strictEqual(audit.status, 200);
    assert.strictEqual(audit.body.length, 1);
    assert.strictEqual(audit.body[0].order_id, order.body.id);
    const queuedAfterRefund = JSON.parse(fs.readFileSync(outboxPath, 'utf8'));
    assert.strictEqual(queuedAfterRefund.filter((x) => x.order?.id === order.body.id || x.order_id === order.body.id).length, 1, 'refund does not enqueue the sale a second time');
    console.log(`PASS isolated bakso x3: total=${order.body.total}, vendorShare=${expectedVendorShare}, COGS=${expectedCogs}, exactly one analytics enqueue, cash reversed, stock policy respected, refund audit visible`);
  } finally { server.close(); fs.rmSync(tmp, { recursive: true, force: true }); }
})().catch((e) => { console.error('FAIL', e.stack || e); process.exitCode = 1; });
