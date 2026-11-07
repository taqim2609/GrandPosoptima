#!/usr/bin/env node
/**
 * Uji end-to-end HTTP untuk perbaikan salah hitung saldo vendor.
 *
 * Menyalakan api-server.js dengan salinan snapshot Grand Aceh di direktori
 * sementara (data asli tidak disentuh), lalu memanggil endpoint sungguhan:
 *   1. POST /vendor-settlements dengan nominal melebihi tagihan -> 409
 *   2. POST /vendor-settlements normal -> carry_in terisi dari riwayat
 *   3. POST /vendor-settlements tanpa vendor -> 404
 *   4. POST /vendor-settlements/:id/void -> kas keluar ikut ditarik
 *   5. GET  /vendor-settlements/board -> hak vendor dari data, bukan 80% default
 *
 * Run: node tests/vendor-settlement-e2e.js
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

const ROOT = path.join(__dirname, '..');
const SRC_SNAPSHOT = path.join(ROOT, 'data', 'pos-db.json');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gak-e2e-'));
const tmpSnapshot = path.join(tmpDir, 'pos-db.json');

// Siapkan data uji: 1 vendor dengan hak 988.200 pada 13 Sep dan settlement
// hidup yang menyisakan 27.000 — persis kondisi yang dulu memicu dobel hitung.
const snap = JSON.parse(fs.readFileSync(SRC_SNAPSHOT, 'utf8'));
const BAKSO = 'c162c6bc-976c-48ee-b1e3-666ba56da89e';
snap.data.vendors = [{ id: BAKSO, name: 'BAKSO SARI RASA', active: true }];
snap.data.orders = [{
  id: 'ord-e2e-1', order_number: 'GAK-E2E-001', status: 'completed',
  created_at: '2026-09-13T10:00:00+07:00', total: 1098000,
  items: [{ product_id: 'p1', vendor_id: BAKSO, name: 'Bakso', qty: 1, price: 1098000, gross: 1098000, vendor_share: 988200 }],
}];
snap.data.vendorSettlements = [{
  id: 'stl-first', settlement_no: 'STL-20260913-0002', date: '2026-09-13',
  vendor_id: BAKSO, vendor_name: 'BAKSO SARI RASA',
  gross: 1098000, vendor_share: 988200, carry_in: 0, total_due: 988200,
  paid: 961200, carry_out: 27000, payment_method: 'Tunai',
  created_at: '2026-09-13T16:03:04.957Z', status: 'completed', voided: false,
}];
snap.data.cashTransactions = [
  { id: 'c-live', type: 'out', scope: 'fnb', category: 'Bagi Hasil Vendor', amount: 961200,
    note: 'Settlement STL-20260913-0002', created_at: '2026-09-13T16:03:04.957Z' },
];
snap.data.shiftHistory = [];
snap.data.currentShift = null;
// Login memakai akun uji ber-hash bcrypt yang dibuat di runtime (bukan kredensial
// produksi): uji harus lewat pintu auth yang sama seperti kasir sungguhan.
const bcrypt = require(path.join(ROOT, 'node_modules', 'bcryptjs'));
const E2E_USER = 'e2e-probe';
const E2E_PASS = 'e2e-' + Date.now();
snap.data.users = (snap.data.users || []).filter((u) => u.username !== E2E_USER);
snap.data.users.push({
  id: 'e2e-user-id', username: E2E_USER, name: 'E2E Probe', email: 'e2e@localhost',
  role: 'superadmin', role_base: 'superadmin', role_name: 'Super Admin (Owner)',
  is_superadmin: true, bootstrap_owner: false, perms: ['*'], perms_full: true,
  active: true, must_change_password: false, pin_enabled: false, has_pin: false,
  password_hash: bcrypt.hashSync(E2E_PASS, 10),
});
fs.writeFileSync(tmpSnapshot, JSON.stringify(snap, null, 2));

const PORT = 3999;
process.env.PORT = String(PORT);
process.env.NODE_ENV = 'test';
process.env.GRANDPOS_DATA_DIR = tmpDir;
process.env.JWT_SECRET = 'e2e-' + Date.now();

const app = require(path.join(ROOT, 'api-server.js'));

let passed = 0;
let failed = 0;
function assert(cond, msg, extra) {
  if (cond) { passed += 1; console.log(`  ok   ${msg}`); }
  else { failed += 1; console.log(`  FAIL ${msg}${extra === undefined ? '' : ` -> ${JSON.stringify(extra)}`}`); }
}
function eq(a, b, msg) { assert(a === b, `${msg} (harap ${b}, dapat ${a})`, a); }

function request(method, urlPath, body, token) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const headers = {};
    if (payload) {
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = Buffer.byteLength(payload);
    }
    if (token) headers.Authorization = `Bearer ${token}`;
    const req = http.request(
      { host: '127.0.0.1', port: PORT, path: urlPath, method, headers },
      (res) => {
        let data = '';
        res.on('data', (c) => { data += c; });
        res.on('end', () => {
          let json = null;
          try { json = JSON.parse(data); } catch (_) { json = data; }
          resolve({ status: res.statusCode, body: json });
        });
      }
    );
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

(async () => {
  const server = app.listen(PORT, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));

  let TOKEN = null;
  try {
    console.log('\n[E2E-0] Login lewat API (auth tidak dilonggarkan)');
    const login = await request('POST', '/api/auth/login', { username: E2E_USER, password: E2E_PASS });
    eq(login.status, 200, 'HTTP status login');
    TOKEN = login.body && login.body.token;
    assert(typeof TOKEN === 'string' && TOKEN.length > 20, 'token JWT diterima');

    const noAuth = await request('POST', '/api/vendor-settlements', { date: '2026-09-13', vendor_id: BAKSO, paid: 1 });
    eq(noAuth.status, 401, 'tanpa token tetap 401 (guard auth utuh)');

    console.log('\n[E2E-1] Bayar melebihi tagihan harus ditolak (409)');
    const over = await request('POST', '/api/vendor-settlements', {
      date: '2026-09-13', vendor_id: BAKSO, paid: 5377200, create_cash_out: true,
    }, TOKEN);
    eq(over.status, 409, 'HTTP status overpayment');
    eq(over.body.code, 'overpayment', 'kode error');
    eq(over.body.carry_in, 27000, 'server melaporkan saldo masuk Rp 27.000');
    eq(over.body.total_due, 1015200, 'total tagihan 27.000 + 988.200');

    console.log('\n[E2E-2] Settlement normal: carry_in diambil dari ledger, bukan dari klien');
    const ok = await request('POST', '/api/vendor-settlements', {
      date: '2026-09-13', vendor_id: BAKSO, paid: 27000, create_cash_out: true,
      // Klien sengaja mengirim carry_in bohong; server harus mengabaikannya.
      carry_in: 0, vendor_share: 0,
    }, TOKEN);
    eq(ok.status, 200, 'HTTP status settlement baru');
    eq(ok.body.carry_in, 27000, 'carry_in dipaksa server = 27.000 (bukan 0 dari klien)');
    eq(ok.body.vendor_share, 988200, 'hak vendor dihitung server dari data order');
    eq(ok.body.carry_out, 988200, 'sisa tagihan setelah pembayaran');

    console.log('\n[E2E-3] Vendor tidak dikenal ditolak');
    const nf = await request('POST', '/api/vendor-settlements', { date: '2026-09-13', vendor_id: 'nope', paid: 1000 }, TOKEN);
    eq(nf.status, 404, 'HTTP status vendor tidak ada');

    console.log('\n[E2E-4] Void menarik kas keluar');
    const before = await request('GET', '/api/vendor-settlements/board?date=2026-09-13', null, TOKEN);
    const id = ok.body.id;
    const v = await request('POST', `/api/vendor-settlements/${id}/void`, { reason: 'uji e2e' }, TOKEN);
    eq(v.status, 200, 'HTTP status void');
    eq(v.body.cash_rows_reversed, 1, 'satu baris kas keluar ditarik');
    const v2 = await request('POST', `/api/vendor-settlements/${id}/void`, { reason: 'ulang' }, TOKEN);
    eq(v2.status, 409, 'void ganda ditolak');

    console.log('\n[E2E-5] Board memakai hak vendor dari data (bukan 80% default)');
    const board = await request('GET', '/api/vendor-settlements/board?date=2026-09-13', null, TOKEN);
    eq(board.status, 200, 'HTTP status board');
    const row = (board.body.rows || []).find((r) => r.vendor_id === BAKSO);
    assert(row !== undefined, 'baris vendor ada di board');
    eq(row.share, 988200, 'hak vendor = 988.200 dari item, bukan 80% x 1.098.000 = 878.400');
    eq(row.carry_in, 27000, 'saldo dibawa setelah baris baru di-void = 27.000');
    assert(before.status === 200, 'board awal juga 200');

    console.log(`\n=== ${passed} lulus, ${failed} gagal ===\n`);
  } catch (err) {
    console.error('E2E error:', err);
    failed += 1;
  } finally {
    server.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
    process.exit(failed === 0 ? 0 : 1);
  }
})();
