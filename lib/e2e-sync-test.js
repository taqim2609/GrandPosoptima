#!/usr/bin/env node
/* End-to-end smoke test for live P1A → analytics sync */
const BASE = process.env.BASE || 'http://127.0.0.1:3000';
const KEY = process.env.NODE_SYNC_KEY || '5165e51710e1728591b940b8d65fd753223a5f01e1f41ce8';
const ANALYTICS = process.env.ANALYTICS_URL || 'http://172.20.0.1:8000';

async function api(method, path, body, token) {
  const res = await fetch(BASE + path, {
    method,
    headers: Object.assign({ 'Content-Type': 'application/json' }, token ? { Authorization: 'Bearer ' + token } : {}),
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data };
}

(async () => {
  const login = await api('POST', '/api/auth/login', { username: 'kasir2', password: 'kasir123' });
  if (login.status !== 200) throw new Error('login gagal: ' + JSON.stringify(login));
  const token = login.data.token;
  console.log('✅ login ok');

  let cur = await api('GET', '/api/shifts/current', null, token);
  console.log('shift status:', JSON.stringify(cur.data).slice(0, 300));
  if (!cur.data || cur.data.status !== 'open') {
    const open = await api('POST', '/api/shifts/open', { opening_cash_fnb: 100000, opening_cash_retail: 0 }, token);
    console.log('open shift →', open.status, JSON.stringify(open.data).slice(0, 200));
  } else {
    console.log('⚠️ shift sudah open, lanjut');
  }

  // ambil produk
  const prod = await api('GET', '/api/products', null, token);
  const list = Array.isArray(prod.data) ? prod.data : (prod.data.data || prod.data.items || []);
  const p = list.find((x) => x.active !== false);
  console.log('produk sample:', JSON.stringify({ id: p.id, name: p.name, sku: p.sku, price: p.price, type: p.type }));

  // create order
  const orderPayload = {
    items: [{ product_id: p.id, name: p.name, type: p.type, qty: 1, price: p.price, subtotal: p.price }],
    order_type: 'dine_in',
    payment_method: 'cash',
    amount_paid: p.price,
    subtotal: p.price,
    total: p.price
  };
  const created = await api('POST', '/api/orders', orderPayload, token);
  console.log('create order →', created.status, JSON.stringify(created.data).slice(0, 300));
  if (created.status >= 300) throw new Error('create order gagal');
  const order = created.data;

  // pay
  const paid = await api('POST', '/api/orders/' + order.id + '/pay', { payment_method: 'cash', amount_paid: p.price }, token);
  console.log('pay order →', paid.status, JSON.stringify(paid.data).slice(0, 300));
  if (paid.status >= 300) throw new Error('pay gagal');

  // tunggu worker sync (interval 10s)
  for (let i = 0; i < 12; i++) {
    await new Promise((r) => setTimeout(r, 2500));
    const st = await fetch(BASE + '/api/analytics/sync/status').then((r) => r.json()).catch(() => ({}));
    const e = (st.entries || []).find((x) => x.client_ref === order.id);
    if (e && e.done) {
      console.log('✅ tersinkron ke analytics:', JSON.stringify(e.result).slice(0, 400));
      break;
    }
    console.log(`  menunggu... (${i + 1})`, e ? JSON.stringify(e).slice(0, 200) : 'belum ada entry');
  }
})().catch((e) => { console.error('❌', e.message); process.exit(1); });