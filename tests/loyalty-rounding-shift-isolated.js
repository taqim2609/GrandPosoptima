#!/usr/bin/env node
// Isolated probe for the loyalty / rounding / shift-close rules:
//   - member points are earned and redeemed on the server, and reduced total
//   - a coupon is consumed once, capped, and rejected when expired/exhausted
//   - refund reverses exactly what was journaled (no point theft, no negative coupon)
//   - rounding is floored to the configured step and journaled
//   - closing a shift with a split payment only expects the cash part in the drawer
// Runs on a throwaway copy of the snapshot; production data is never written.
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const bcrypt = require('bcryptjs');

const ROOT = path.join(__dirname, '..');
const snap = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/pos-db.json'), 'utf8'));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gak-loyalty-'));

const user = {
  id: 'loyalty-owner', username: 'loyalty-owner', name: 'Loyalty Owner',
  role: 'superadmin', role_base: 'superadmin', is_superadmin: true, active: true,
  password_hash: bcrypt.hashSync('loyalty-pass', 10),
};
snap.data.users = [user];
snap.data.orders = [];
snap.data.voidRows = [];
snap.data.shifts = [];
snap.data.shiftHistory = [];
snap.data.settings = snap.data.settings || {};
snap.data.settings.business = {
  ...(snap.data.settings.business || {}),
  member_earn_per_rupiah: 10000,
  member_redeem_per_point: 100,
  rounding: 100,
};
snap.data.members = [{
  id: 'loyalty-member', name: 'Member Uji', phone: '081200000000',
  points: 50, total_spent: 0, active: true,
}];
snap.data.coupons = [{
  id: 'loyalty-coupon', code: 'UJI10', type: 'percent', value: 10,
  max_uses: 1, used_count: 0, active: true,
  expires_at: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
}];
snap.data.currentShift = {
  id: 'loyalty-shift', user_id: user.id, user_name: user.name, status: 'open',
  opened_at: new Date().toISOString(),
  opening_cash_fnb: 200000, opening_cash_retail: 0,
  cash_sales: 0, non_cash_sales: 0, total_sales: 0, orders_count: 0,
};

// Product priced at 33.333 so rounding and percent coupon both matter.
const product = snap.data.products.find((p) => p.vendor_id) || snap.data.products[0];
assert(product, 'a product exists');
product.price = 33333;
product.cost = 12000;
if (product.vendor_share_percent == null) product.vendor_share_percent = 50;
fs.writeFileSync(path.join(tmp, 'pos-db.json'), JSON.stringify(snap));

const PORT = 3996;
process.env.PORT = String(PORT);
process.env.NODE_ENV = 'test';
process.env.GRANDPOS_DATA_DIR = tmp;
process.env.JWT_SECRET = 'loyalty-secret';
process.env.NODE_SYNC_KEY = '';

const app = require(path.join(ROOT, 'api-server.js'));
const req = (method, p, body, token) => new Promise((resolve, reject) => {
  const raw = body ? JSON.stringify(body) : null;
  const headers = raw ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(raw) } : {};
  if (token) headers.Authorization = `Bearer ${token}`;
  const r = http.request({ host: '127.0.0.1', port: PORT, path: p, method, headers }, (res) => {
    let s = '';
    res.on('data', (c) => { s += c; });
    res.on('end', () => { let b = s; try { b = JSON.parse(s); } catch (_) {} resolve({ status: res.statusCode, body: b }); });
  });
  r.on('error', reject);
  if (raw) r.write(raw);
  r.end();
});

(async () => {
  const server = app.listen(PORT, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  try {
    const login = await req('POST', '/api/auth/login', { username: user.username, password: 'loyalty-pass' });
    assert.strictEqual(login.status, 200);
    const token = login.body.token;
    const member = () => req('GET', '/api/members', null, token).then((r) => r.body.find((m) => m.id === 'loyalty-member'));
    const coupon = () => req('GET', '/api/coupons', null, token).then((r) => r.body.find((c) => c.code === 'UJI10'));

    // ---------------------------------------------------------------- 1) earn
    const before = await member();
    assert.strictEqual(Number(before.points), 50, 'member starts at 50 points');

    const sale = await req('POST', '/api/orders', {
      items: [{ product_id: product.id, qty: 1 }],
      order_type: 'take_away', pay_now: true, payment_method: 'cash',
      member_id: 'loyalty-member', amount_paid: 100000,
    }, token);
    assert.strictEqual(sale.status, 200, JSON.stringify(sale.body).slice(0, 200));
    assert.strictEqual(Number(sale.body.total), 33300, 'grand total rounded down to 100');
    assert.strictEqual(Number(sale.body.rounding_adjustment), 33, 'rounding delta journaled');
    assert.strictEqual(Number(sale.body.points_earned), 3, '1 point per Rp10.000 earned');
    const afterEarn = await member();
    assert.strictEqual(Number(afterEarn.points), 53, 'member gained 3 points');
    assert.strictEqual(Number(afterEarn.total_spent), 33300, 'total_spent follows the rounded bill');
    assert.strictEqual(Number(sale.body.change), 100000 - 33300, 'change uses the rounded bill');

    // ------------------------------------------------------------- 2) redeem
    const redeemSale = await req('POST', '/api/orders', {
      items: [{ product_id: product.id, qty: 1 }],
      order_type: 'take_away', pay_now: true, payment_method: 'cash',
      member_id: 'loyalty-member', redeem_points: 10, amount_paid: 100000,
    }, token);
    assert.strictEqual(redeemSale.status, 200, JSON.stringify(redeemSale.body).slice(0, 200));
    assert.strictEqual(Number(redeemSale.body.redeem_value), 1000, '10 points = Rp1.000');
    assert.strictEqual(Number(redeemSale.body.total), 32300, 'total reduced by the point value, then rounded');
    const afterRedeem = await member();
    // 53 - 10 redeemed + 3 earned on the 32.300 bill = 46
    assert.strictEqual(Number(afterRedeem.points), 46, 'reedeemed and re-earned in one movement');

    // ------------------------------------------------------------- 3) coupon
    const couponSale = await req('POST', '/api/orders', {
      items: [{ product_id: product.id, qty: 3 }], order_type: 'take_away', pay_now: true,
      payment_method: 'cash', coupon_code: 'UJI10', amount_paid: 200000,
    }, token);
    assert.strictEqual(couponSale.status, 200, JSON.stringify(couponSale.body).slice(0, 200));
    assert.strictEqual(Number(couponSale.body.coupon_discount), 9999.9, '10% of 99.999 = 9.999,9 (2 decimals, repo convention)');
    assert.strictEqual(Number(couponSale.body.total), 89900, '99.999 - 9.999,9 = 89.999,1 -> rounded down to 89.900');
    assert.strictEqual(Number(couponSale.body.rounding_adjustment), 99.1, 'rounding delta journaled on the coupon sale');
    assert.strictEqual((await coupon()).used_count, 1, 'coupon consumed once');

    const exhausted = await req('POST', '/api/orders', {
      items: [{ product_id: product.id, qty: 1 }], order_type: 'take_away', pay_now: true,
      payment_method: 'cash', coupon_code: 'UJI10', amount_paid: 100000,
    }, token);
    assert.strictEqual(exhausted.status, 400, 'exhausted coupon is rejected');
    assert.match(String(exhausted.body.detail || ''), /kupon/i);

    const unknown = await req('POST', '/api/orders', {
      items: [{ product_id: product.id, qty: 1 }], order_type: 'take_away', pay_now: true,
      payment_method: 'cash', coupon_code: 'TIDAKADA', amount_paid: 100000,
    }, token);
    assert.strictEqual(unknown.status, 400, 'unknown coupon is rejected');

    const tooManyPoints = await req('POST', '/api/orders', {
      items: [{ product_id: product.id, qty: 1 }], order_type: 'take_away', pay_now: true,
      payment_method: 'cash', member_id: 'loyalty-member', redeem_points: 999999, amount_paid: 100000,
    }, token);
    assert.strictEqual(tooManyPoints.status, 400, 'redeeming more points than owned is rejected');

    // ------------------------------------------------------------- 4) refund
    const pointsBeforeRefund = Number((await member()).points);
    const spentBeforeRefund = Number((await member()).total_spent);
    const refunded = await req('POST', `/api/orders/${redeemSale.body.id}/void`, {
      action: 'refund', reason: 'Uji refund poin',
    }, token);
    assert.strictEqual(refunded.status, 200);
    assert.strictEqual(refunded.body.order.status, 'refunded');
    assert.strictEqual(refunded.body.effects.points_reverted, true, 'refund reports the point reversal');
    const afterRefund = await member();
    // The member must get back exactly what the sale moved: lose 3 earned, regain 10 redeemed.
    assert.strictEqual(Number(afterRefund.points), pointsBeforeRefund - 3 + 10, 'refund reverses only journaled points');
    assert.strictEqual(Number(afterRefund.total_spent), spentBeforeRefund - 32300, 'total_spent reverses the bill');

    const couponRefund = await req('POST', `/api/orders/${couponSale.body.id}/void`, {
      action: 'refund', reason: 'Uji refund kupon',
    }, token);
    assert.strictEqual(couponRefund.status, 200);
    assert.strictEqual(couponRefund.body.effects.coupon_reverted, true, 'coupon usage returned');
    assert.strictEqual((await coupon()).used_count, 0, 'coupon usage cannot go negative');

    // ------------------------------------------------- 5) shift close with split
    const cashBeforeSplit = Number((await req('GET', '/api/shifts/current', null, token)).body.cash_sales);
    const splitSale = await req('POST', '/api/orders', {
      items: [{ product_id: product.id, qty: 1 }], order_type: 'take_away', pay_now: true,
      splits: [{ payment_method: 'cash', amount: 13300 }, { payment_method: 'qris', amount: 20000 }],
    }, token);
    assert.strictEqual(splitSale.status, 200, JSON.stringify(splitSale.body).slice(0, 200));
    assert.strictEqual(Number(splitSale.body.total), 33300, 'split must equal the rounded bill');

    const shift = (await req('GET', '/api/shifts/current', null, token)).body;
    const expectedDrawer = 200000 + Number(shift.cash_sales);
    assert.strictEqual(Number(shift.cash_sales) - cashBeforeSplit, 13300, 'only the cash split sits in the drawer');

    const closed = await req('POST', '/api/shifts/close', {
      closing_cash_fnb: expectedDrawer, closing_cash_retail: 0,
    }, token);
    assert.strictEqual(closed.status, 200, JSON.stringify(closed.body).slice(0, 300));
    const report = closed.body.report || closed.body;
    const cashDiff = report.cash_difference ?? report.difference ?? report.cash_diff;
    if (cashDiff !== undefined) {
      assert.strictEqual(Number(cashDiff), 0, 'shift closes with an exact cash drawer');
    }

    console.log('PASS loyalty/rounding: points earned+redeemed server-side, coupon consumed once, '
      + 'refund reverses only journaled points (no point theft), coupon never negative, '
      + 'rounding floored and journaled, shift close expects only the cash split');
  } finally {
    server.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
})().catch((e) => { console.error('FAIL', e.stack || e); process.exitCode = 1; });
