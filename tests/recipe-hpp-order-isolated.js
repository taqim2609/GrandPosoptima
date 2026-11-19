#!/usr/bin/env node
// Isolated probe: a product with no own `cost` must take its COGS from the recipe
// HPP, and that HPP must land on the order line. Pollutes nothing: the snapshot is
// copied to a temp dir and deleted afterwards.
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const bcrypt = require('bcryptjs');

const ROOT = path.join(__dirname, '..');
const snap = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/pos-db.json'), 'utf8'));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gak-recipe-hpp-'));

const user = {
  id: 'hpp-owner', username: 'hpp-owner', name: 'HPP Owner',
  role: 'superadmin', role_base: 'superadmin', is_superadmin: true, active: true,
  password_hash: bcrypt.hashSync('hpp-pass', 10),
};
snap.data.users = [user];
snap.data.orders = [];
snap.data.voidRows = [];
snap.data.shifts = [];
snap.data.shiftHistory = [];

const product = snap.data.products.find((p) => !p.vendor_id) || snap.data.products[0];
assert(product, 'a non-vendor product exists for the recipe');
product.price = 25000;
product.cost = 0;
product.cost_price = 0;

// Two ingredients: 2 x Rp4.000 + 1 x Rp7.500 = Rp15.500 for 2 portions -> Rp7.750/unit
snap.data.ingredients = [
  { id: 'ing-hpp-1', name: 'Daging', unit: 'gram', stock: 1000, cost: 4000, active: true },
  { id: 'ing-hpp-2', name: 'Bumbu', unit: 'gram', stock: 500, cost: 7500, active: true },
];
snap.data.recipes = [{
  id: 'rec-hpp-1',
  product_id: product.id,
  yield_units: 2,
  ingredients: [
    { ingredient_id: 'ing-hpp-1', qty: 2 },
    { ingredient_id: 'ing-hpp-2', qty: 1 },
  ],
}];
snap.data.currentShift = {
  id: 'hpp-shift', user_id: user.id, user_name: user.name, status: 'open',
  opened_at: new Date().toISOString(),
  opening_cash_fnb: 0, opening_cash_retail: 0,
  cash_sales: 0, non_cash_sales: 0, total_sales: 0, orders_count: 0,
};
fs.writeFileSync(path.join(tmp, 'pos-db.json'), JSON.stringify(snap));

const PORT = 3997;
process.env.PORT = String(PORT);
process.env.NODE_ENV = 'test';
process.env.GRANDPOS_DATA_DIR = tmp;
process.env.JWT_SECRET = 'recipe-hpp-secret';
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
    const login = await req('POST', '/api/auth/login', { username: user.username, password: 'hpp-pass' });
    assert.strictEqual(login.status, 200);
    const token = login.body.token;

    const recipe = await req('GET', `/api/recipes/${product.id}`, null, token);
    assert.strictEqual(recipe.status, 200, JSON.stringify(recipe.body).slice(0, 200));
    assert.strictEqual(recipe.body.hpp.total_cost, 15500, 'recipe total cost from ingredient costs');
    assert.strictEqual(recipe.body.hpp.hpp_per_unit, 7750, 'HPP per unit = 15.500 / 2 portions');

    const saved = await req('POST', '/api/recipes', {
      product_id: product.id, yield_units: 2,
      ingredients: [{ ingredient_id: 'ing-hpp-1', qty: 2 }, { ingredient_id: 'ing-hpp-2', qty: 1 }],
    }, token);
    assert.strictEqual(saved.status, 200);
    assert.strictEqual(saved.body.hpp.hpp_per_unit, 7750, 'POST /recipes recalculates the same HPP');

    const order = await req('POST', '/api/orders', {
      items: [{ product_id: product.id, qty: 3 }],
      order_type: 'take_away', pay_now: true, payment_method: 'cash', amount_paid: 100000,
    }, token);
    assert.strictEqual(order.status, 200, JSON.stringify(order.body).slice(0, 300));
    assert.strictEqual(Number(order.body.items[0].cost), 7750, 'order line COGS comes from the recipe HPP');
    const orderCogs = Number(order.body.items[0].cost) * Number(order.body.items[0].qty);
    assert.strictEqual(orderCogs, 23250, '3 portions carry Rp23.250 of COGS');

    // Margin sanity: the sale must still be profitable and the price untouched.
    assert.strictEqual(Number(order.body.items[0].price), 25000, 'selling price is not the HPP');
    assert.ok(Number(order.body.total) > orderCogs, 'total covers COGS');

    console.log(`PASS recipe HPP: ingredient cost -> HPP/unit ${recipe.body.hpp.hpp_per_unit}, `
      + `order line cost ${order.body.items[0].cost}, 3 porsi COGS ${orderCogs}`);
  } finally {
    server.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
})().catch((e) => { console.error('FAIL', e.stack || e); process.exitCode = 1; });
