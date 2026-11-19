#!/usr/bin/env node
// Isolated accounting probe for the rules not covered by the cash/bakso test:
// discount must not reduce COGS or vendor share, service tax is bounded to the
// discounted base, client-sent totals are ignored, non-cash does not touch the
// drawer, split payments land per method, and client_ref is idempotent.
// Runs on a throwaway copy of the snapshot; production data is never written.
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const bcrypt = require('bcryptjs');

const ROOT = path.join(__dirname, '..');
const snap = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/pos-db.json'), 'utf8'));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gak-acct-rules-'));
const user = { id: 'acct-owner', username: 'acct-owner', name: 'Acct Owner', role: 'superadmin', role_base: 'superadmin', is_superadmin: true, active: true, password_hash: bcrypt.hashSync('acct-pass', 10) };
snap.data.users = [user];
snap.data.orders = [];
snap.data.voidRows = [];
snap.data.shifts = [];
snap.data.shiftHistory = [];
snap.data.currentShift = { id: 'acct-shift', user_id: user.id, user_name: user.name, status: 'open', opened_at: new Date().toISOString(), opening_cash_fnb: 100000, opening_cash_retail: 0, cash_sales: 0, non_cash_sales: 0, total_sales: 0, orders_count: 0 };

// Vendor product with a real COGS so discount/HPP interaction is observable.
// Must be set on the snapshot BEFORE it is written to disk.
const vendorProduct = snap.data.products.find((p) => p.vendor_id);
assert(vendorProduct, 'vendor product with vendor share exists');
vendorProduct.price = 30000;
vendorProduct.cost = 10000;
vendorProduct.vendor_share_percent = 90;
fs.writeFileSync(path.join(tmp, 'pos-db.json'), JSON.stringify(snap));
const product = { ...vendorProduct };

const PORT = 3995;
process.env.PORT = String(PORT); process.env.NODE_ENV = 'test'; process.env.GRANDPOS_DATA_DIR = tmp;
process.env.JWT_SECRET = 'acct-rules-secret'; process.env.NODE_SYNC_KEY = '';
const app = require(path.join(ROOT, 'api-server.js'));
const req = (method, p, body, token) => new Promise((resolve, reject) => {
  const raw = body ? JSON.stringify(body) : null;
  const headers = raw ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(raw) } : {};
  if (token) headers.Authorization = `Bearer ${token}`;
  const r = http.request({ host: '127.0.0.1', port: PORT, path: p, method, headers }, (res) => {
    let s = ''; res.on('data', (c) => s += c);
    res.on('end', () => { let b = s; try { b = JSON.parse(s); } catch (_) {} resolve({ status: res.statusCode, body: b }); });
  });
  r.on('error', reject); if (raw) r.write(raw); r.end();
});

(async () => {
  const server = app.listen(PORT, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  try {
    const login = await req('POST', '/api/auth/login', { username: user.username, password: 'acct-pass' });
    assert.strictEqual(login.status, 200); const token = login.body.token;
    const qty = 2;
    const gross = product.price * qty;              // 60.000
    const discount = 10000;
    const expectService = 5000;
    const expectTotal = gross - discount + expectService; // 55.000

    // 1) Percent discount + service tax; client totals must be ignored.
    const percent = await req('POST', '/api/orders', {
      items: [{ product_id: product.id, qty }], order_type: 'take_away', pay_now: true,
      payment_method: 'cash', amount_paid: 100000, discount_type: 'percent', discount_value: 10,
      service_tax: 5000, subtotal: 1, total: 1,
    }, token);
    assert.strictEqual(percent.status, 200);
    assert.strictEqual(Number(percent.body.subtotal), gross, 'subtotal from catalogue');
    assert.strictEqual(Number(percent.body.discount), 6000, 'percent discount computed server-side');
    assert.strictEqual(Number(percent.body.total), gross - 6000 + 5000, 'total ignores client total');
    assert.strictEqual(Number(percent.body.items[0].cost), product.cost, 'COGS not reduced by discount');
    assert.strictEqual(Number(percent.body.vendor_total_share), Math.round(gross * 0.9), 'vendor share on full price, not discounted');

    // 2) Amount discount cannot exceed subtotal; service tax bounded to discounted base.
    const amount = await req('POST', '/api/orders', {
      items: [{ product_id: product.id, qty: 1 }], order_type: 'take_away', pay_now: true,
      payment_method: 'cash', amount_paid: 100000, discount_type: 'amount', discount_value: 999999,
      service_tax: 999999,
    }, token);
    assert.strictEqual(amount.status, 200);
    assert.strictEqual(Number(amount.body.discount), product.price, 'discount clamped to subtotal');
    assert.strictEqual(Number(amount.body.total), 0, 'tax cannot exceed discounted base');
    void discount; void expectService; void expectTotal;

    // 3) QRIS must not enter the cash drawer.
    const cashBefore = Number((await req('GET', '/api/shifts/current', null, token)).body.cash_sales);
    const qris = await req('POST', '/api/orders', {
      items: [{ product_id: product.id, qty: 1 }], order_type: 'take_away', pay_now: true,
      payment_method: 'qris', amount_paid: product.price,
    }, token);
    assert.strictEqual(qris.status, 200);
    const afterQris = (await req('GET', '/api/shifts/current', null, token)).body;
    assert.strictEqual(Number(afterQris.cash_sales), cashBefore, 'QRIS leaves cash unchanged');
    assert.ok(Number(afterQris.non_cash_sales) >= product.price, 'QRIS counted as non-cash');

    // 4) Split payment lands per method.
    const split = await req('POST', '/api/orders', {
      items: [{ product_id: product.id, qty: 1 }], order_type: 'take_away', pay_now: true,
      splits: [{ payment_method: 'cash', amount: 10000 }, { payment_method: 'qris', amount: 20000 }],
    }, token);
    assert.strictEqual(split.status, 200);
    assert.strictEqual(Number(split.body.amount_paid), product.price, 'split total equals bill');
    const afterSplit = (await req('GET', '/api/shifts/current', null, token)).body;
    assert.strictEqual(Number(afterSplit.cash_sales), cashBefore + 10000, 'cash split only adds cash part');
    assert.strictEqual(Number(afterSplit.non_cash_sales), Number(afterQris.non_cash_sales) + 20000, 'qris split adds non-cash part');

    // 5) Invalid split is rejected, not silently accepted.
    const badSplit = await req('POST', '/api/orders', {
      items: [{ product_id: product.id, qty: 1 }], order_type: 'take_away', pay_now: true,
      splits: [{ payment_method: 'cash', amount: 1 }],
    }, token);
    assert.strictEqual(badSplit.status, 400, 'split that does not equal the bill is rejected');

    // 6) client_ref is idempotent: replay returns the same order, no second sale.
    const ref = 'acct-ref-' + Date.now();
    const first = await req('POST', '/api/orders', { client_ref: ref, items: [{ product_id: product.id, qty: 1 }], order_type: 'take_away', pay_now: true, payment_method: 'cash', amount_paid: product.price }, token);
    const second = await req('POST', '/api/orders', { client_ref: ref, items: [{ product_id: product.id, qty: 1 }], order_type: 'take_away', pay_now: true, payment_method: 'cash', amount_paid: product.price }, token);
    assert.strictEqual(first.status, 200); assert.strictEqual(second.status, 200);
    assert.strictEqual(second.body.id, first.body.id, 'replay returns the same order');

    console.log('PASS accounting rules: discount keeps COGS/vendor share, tax bounded, client totals ignored, QRIS non-cash, split per method, bad split 400, client_ref idempotent');
  } finally { server.close(); fs.rmSync(tmp, { recursive: true, force: true }); }
})().catch((e) => { console.error('FAIL', e.stack || e); process.exitCode = 1; });
