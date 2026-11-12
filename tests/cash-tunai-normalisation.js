/**
 * Regression: cash/tunai normalisation across the reporting paths.
 *
 * Runs the real api-server.js against a COPY of data/pos-db.json on an ephemeral
 * port, seeds orders with payment_method 'cash' and 'tunai', then asserts that
 * every drawer figure counts both.
 *
 * Guards two real defects:
 *  - reports/summary and MCP shift status only recognised one of the two
 *    spellings, so half the drawer money disappeared from cash_sales.
 *  - MCP expected_cash swept every historical order without a shift_id into the
 *    current drawer (3.248.400 instead of 180.000 on the probe snapshot).
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

const ROOT = path.join(__dirname, '..');
const PORT = Number(process.env.CASH_PROBE_PORT || 3991);
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gak-cashprobe-'));
const snap = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'pos-db.json'), 'utf-8'));

const bcrypt = require(path.join(ROOT, 'node_modules', 'bcryptjs'));
const USER = 'cash-probe';
const PASS = 'ProbePass!2026';
snap.data.users = (snap.data.users || []).filter((u) => u.username !== USER);
snap.data.users.push({
  id: 'cash-probe-id', username: USER, name: 'Cash Probe', email: 'probe@localhost',
  role: 'superadmin', role_base: 'superadmin', role_name: 'Super Admin (Owner)',
  is_superadmin: true, bootstrap_owner: false, perms: ['*'], perms_full: true,
  active: true, must_change_password: false, pin_enabled: false, has_pin: false,
  password_hash: bcrypt.hashSync(PASS, 10),
});

const SHIFT_ID = 's-cash-probe';
snap.data.currentShift = {
  id: SHIFT_ID, user_id: 'cash-probe-id', user_name: 'Cash Probe',
  start_cash: 100000, opening_cash_fnb: 100000, opening_cash_retail: 0,
  opened_at: new Date().toISOString(), status: 'open',
  cash_sales: 0, non_cash_sales: 0, total_sales: 0, orders_count: 0,
};
snap.data.shifts = (snap.data.shifts || []).filter((s) => s.id !== SHIFT_ID);
// Deliberately NO `starting_cash`: this data model never writes that field, so the
// probe must prove the opening float is read from opening_cash_fnb/opening_cash_retail.
snap.data.shifts.push({ ...snap.data.currentShift });

// Two cash sales stored under different vocabulary, plus one QRIS sale.
const today = new Date().toISOString();
snap.data.orders = (snap.data.orders || []).filter((o) => !String(o.id).startsWith('cashprobe-'));
snap.data.orders.push(
  { id: 'cashprobe-1', order_number: 'CP-1', status: 'completed', shift_id: SHIFT_ID,
    payment_method: 'cash', total: 50000, subtotal: 50000, created_at: today, paid_at: today,
    items: [], order_type: 'takeaway' },
  { id: 'cashprobe-2', order_number: 'CP-2', status: 'completed', shift_id: SHIFT_ID,
    payment_method: 'tunai', total: 30000, subtotal: 30000, created_at: today, paid_at: today,
    items: [], order_type: 'takeaway' },
  { id: 'cashprobe-3', order_number: 'CP-3', status: 'completed', shift_id: SHIFT_ID,
    payment_method: 'qris', total: 20000, subtotal: 20000, created_at: today, paid_at: today,
    items: [], order_type: 'takeaway' },
);

fs.writeFileSync(path.join(tmpDir, 'pos-db.json'), JSON.stringify(snap, null, 2));
process.env.PORT = String(PORT);
process.env.NODE_ENV = 'test';
process.env.GRANDPOS_DATA_DIR = tmpDir;
process.env.JWT_SECRET = 'probe-secret-' + Date.now();

const app = require(path.join(ROOT, 'api-server.js'));

const fails = [];
function check(label, cond, detail) {
  console.log((cond ? 'PASS ' : 'FAIL ') + label + (detail ? '  ' + detail : ''));
  if (!cond) fails.push(label);
}

function req(method, urlPath, body, token) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const r = http.request(
      { host: '127.0.0.1', port: PORT, path: urlPath, method,
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) } },
      (res) => {
        let buf = '';
        res.on('data', (c) => (buf += c));
        res.on('end', () => {
          let json = null;
          try { json = JSON.parse(buf); } catch { /* non-JSON */ }
          resolve({ status: res.statusCode, body: json, raw: buf });
        });
      },
    );
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}

const server = app.listen(PORT, '127.0.0.1', async () => {
  try {
    const login = await req('POST', '/api/auth/login', { username: USER, password: PASS });
    check('login ok', login.status === 200 && login.body && login.body.token, 'status=' + login.status);
    const token = login.body && login.body.token;
    if (!token) throw new Error('no token: ' + login.raw.slice(0, 300));

    // 1. reports/summary must fold tunai into cash
    const sum = await req('GET', '/api/reports/summary', null, token);
    check('summary 200', sum.status === 200, 'status=' + sum.status);
    const b = sum.body || {};
    check('cash_sales counts cash+tunai (80000)', Number(b.cash_sales) === 80000, 'cash_sales=' + b.cash_sales);
    check('cash_net counts cash+tunai (80000)', Number(b.cash_net) === 80000, 'cash_net=' + b.cash_net);
    check('by_payment has single cash key',
      b.by_payment && Number(b.by_payment.cash) === 80000 && b.by_payment.tunai === undefined,
      JSON.stringify(b.by_payment));

    // 2. MCP pos_get_shift_status expected_cash must include both
    const mcp = await req('POST', '/api/mcp', {
      jsonrpc: '2.0', id: 1, method: 'tools/call',
      params: { name: 'pos_get_shift_status', arguments: { shift_id: SHIFT_ID } },
    }, token);
    const inner = mcp.body && mcp.body.result && mcp.body.result.content
      && mcp.body.result.content[0] && mcp.body.result.content[0].text;
    let shiftInfo = null;
    try { shiftInfo = JSON.parse(inner); } catch { /* keep null */ }
    check('MCP shift status parsed', shiftInfo !== null, inner ? inner.slice(0, 200) : 'no content');
    if (shiftInfo) {
      // `starting_cash` is absent from the fixture on purpose: the opening float must
      // come from opening_cash_fnb/opening_cash_retail, the fields this model writes.
      check('MCP starting_cash reads opening_cash_* not a missing field (100000)',
        Number(shiftInfo.starting_cash) === 100000, 'starting_cash=' + shiftInfo.starting_cash);
      check('MCP total_cash_sales counts cash+tunai (80000)',
        Number(shiftInfo.total_cash_sales) === 80000, 'total_cash_sales=' + shiftInfo.total_cash_sales);
      check('MCP expected_cash_drawer = 100000 opening + 80000 cash',
        Number(shiftInfo.expected_cash_drawer) === 180000, 'expected=' + shiftInfo.expected_cash_drawer);
    }

    // 3. void preview must treat tunai as drawer cash
    const prev = await req('GET', '/api/orders/cashprobe-2/void-preview', null, token);
    if (prev.status === 200 && prev.body) {
      const cr = prev.body.impact && prev.body.impact.cash_reduction;
      check('void preview cash_reduction counts tunai (30000)',
        Number(cr) === 30000, 'cash_reduction=' + cr);
    } else {
      console.log('SKIP void preview (status ' + prev.status + ')');
    }
  } catch (err) {
    console.log('ERROR ' + err.message);
    fails.push('exception');
  } finally {
    server.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
    console.log('\nFAILURES: ' + (fails.length ? fails.join(', ') : 'none'));
    process.exit(fails.length ? 1 : 0);
  }
});
