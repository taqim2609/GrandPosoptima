/**
 * Regresi: bagi hasil vendor Rp 0 di tutup shift dan saat order dibuat.
 *
 * Gejala yang dilaporkan pemilik (8 Nov 2026): "penjualan hari ini bagi hasil
 * vendornya 0 padahal sudah diatur di produk". Produk benar-benar punya
 * `vendor_id` + `vendor_share_percent` (BAKSO 90%, MIE PANGSIT 80%, TOMYAM 80%),
 * order hari itu berisi 6 produk vendor seharga Rp 200.000, tetapi:
 *
 *   1. `POST /api/orders` tidak pernah menyalin `vendor_id` /
 *      `vendor_share_percent` / `vendor_share` ke baris item, sehingga sumber
 *      utama `lib/vendor-settlement.buildVendorBoard()` tidak menemukan apa pun.
 *   2. `GET /api/shifts/current/vendor` mengembalikan `share: 0` hard-coded,
 *      sehingga panel "Bagi Hasil Vendor" di halaman Shift selalu Rp 0.
 *   3. `POST /api/shifts/close` menerima `vendor_payments` lalu membuangnya:
 *      laporan shift tidak memuat `vendor_share` sama sekali, jadi fallback
 *      `shift.report.vendor_share` (dipakai board & settlement) juga kosong.
 *
 * Uji ini menjalankan server sungguhan di port acak di atas SALINAN snapshot
 * produksi (data asli tidak disentuh) dan memeriksa angka rupiahnya.
 *
 * Run: node tests/vendor-share-on-order.js
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

const ROOT = path.join(__dirname, '..');
const SNAPSHOT = path.join(ROOT, 'data', 'pos-db.json');

let passed = 0;
let failed = 0;
function assert(cond, msg, extra) {
  if (cond) {
    passed += 1;
    console.log(`  ok   ${msg}`);
  } else {
    failed += 1;
    console.log(`  FAIL ${msg}${extra === undefined ? '' : ` -> ${JSON.stringify(extra)}`}`);
  }
}
function eq(actual, expected, msg) {
  assert(actual === expected, `${msg} (harap ${expected}, dapat ${actual})`, actual);
}

// --- Siapkan snapshot sementara dari data produksi --------------------------
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gak-vendor-order-'));
const snap = JSON.parse(fs.readFileSync(SNAPSHOT, 'utf-8'));

const BAKSO = 'c162c6bc-976c-48ee-b1e3-666ba56da89e';
const MIE = '8bea66fd-9e32-4db2-a221-015c7f80d9c3';
const TOMYAM = 'be366816-ef58-4348-83ff-d43ee8020fd8';

// Keadaan bersih: tidak ada order/settlement/shift dari uji sebelumnya.
snap.data.orders = [];
snap.data.vendorSettlements = [];
snap.data.shifts = [];
snap.data.shiftHistory = [];
snap.data.currentShift = null;

// Shift yang sedang terbuka, meniru kasir hari ini.
const WIB_NOW = new Date(Date.now() + 7 * 60 * 60 * 1000);
const TODAY = WIB_NOW.toISOString().slice(0, 10);
snap.data.currentShift = {
  id: 's-vendor-share-test',
  user_id: 'test-user',
  user_name: 'Kasir Uji',
  start_cash: 0,
  opening_cash_fnb: 0,
  opening_cash_retail: 0,
  opened_at: new Date().toISOString(),
  status: 'open',
  cash_sales: 0,
  non_cash_sales: 0,
  total_sales: 0,
  orders_count: 0,
};

// Akun uji + password supaya uji lewat pintu auth yang sama dengan kasir.
const bcrypt = require(path.join(ROOT, 'node_modules', 'bcryptjs'));
const USER = 'vendor-share-probe';
const PASS = 'probe-' + Date.now();
snap.data.users = (snap.data.users || []).filter((u) => u.username !== USER);
snap.data.users.push({
  id: 'vendor-share-probe-id',
  username: USER,
  name: 'Vendor Share Probe',
  email: 'probe@localhost',
  role: 'superadmin',
  role_base: 'superadmin',
  role_name: 'Super Admin (Owner)',
  is_superadmin: true,
  bootstrap_owner: false,
  perms: ['*'],
  perms_full: true,
  active: true,
  must_change_password: false,
  pin_enabled: false,
  has_pin: false,
  password_hash: bcrypt.hashSync(PASS, 10),
});

fs.writeFileSync(path.join(tmpDir, 'pos-db.json'), JSON.stringify(snap, null, 2));

const PORT = 3987;
process.env.PORT = String(PORT);
process.env.NODE_ENV = 'test';
process.env.GRANDPOS_DATA_DIR = tmpDir;
process.env.JWT_SECRET = 'vendor-share-' + Date.now();

const app = require(path.join(ROOT, 'api-server.js'));

function request(method, urlPath, body, token) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const headers = {};
    if (payload) {
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = Buffer.byteLength(payload);
    }
    if (token) headers.Authorization = `Bearer ${token}`;
    const req = http.request({ host: '127.0.0.1', port: PORT, path: urlPath, method, headers }, (res) => {
      let raw = '';
      res.on('data', (c) => { raw += c; });
      res.on('end', () => {
        let parsed = raw;
        try { parsed = JSON.parse(raw); } catch (_) { /* teks biasa */ }
        resolve({ status: res.statusCode, body: parsed });
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

// Keranjang nyata: 6 produk vendor, total Rp 200.000 (persis kasus produksi).
const CART = [
  { product_id: '07720a41-becd-41dd-bb5a-69ad9a89f555', qty: 1 }, // Tomyam Udang 40.000 (80%)
  { product_id: '13935341-e790-4938-82bd-af9f89f96304', qty: 1 }, // Tomyam Cumi 40.000 (80%)
  { product_id: '2e4f21d0-0a49-4405-bc96-975b697b849f', qty: 1 }, // Bakso+Mie 30.000 (90%)
  { product_id: '512c19d6-0d63-44e7-a080-2b1317c56850', qty: 1 }, // Tahu+Kuah 30.000 (90%)
  { product_id: '3164ff46-e884-4063-9330-770f7b39aba8', qty: 1 }, // Mie+Bakso 25.000 (80%)
  { product_id: '35df1807-73c8-49fa-893c-e07125f3b8ca', qty: 1 }, // Mie+Bakso Besar 35.000 (80%)
];
// Hak vendor yang benar: 80%(40+40+25+35) + 90%(30+30) = 112.000 + 54.000
const EXPECT_TOMYAM = 64000;
const EXPECT_BAKSO = 54000;
const EXPECT_MIE = 48000;
const EXPECT_TOTAL = EXPECT_TOMYAM + EXPECT_BAKSO + EXPECT_MIE;

(async () => {
  const server = app.listen(PORT, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));

  try {
    const login = await request('POST', '/api/auth/login', { username: USER, password: PASS });
    eq(login.status, 200, 'login uji berhasil');
    const TOKEN = login.body && login.body.token;
    assert(typeof TOKEN === 'string' && TOKEN.length > 20, 'token JWT diterima');

    console.log('\n[1] Order vendor menyimpan vendor_id + vendor_share pada baris item');
    const order = await request('POST', '/api/orders', {
      items: CART, pay_now: true, payment_method: 'cash', amount_paid: 200000,
      order_type: 'take_away',
    }, TOKEN);
    eq(order.status, 200, 'POST /api/orders sukses');
    eq(Number(order.body.total), 200000, 'total order Rp 200.000');
    const line = order.body.items[0] || {};
    eq(line.vendor_id, TOMYAM, 'baris item membawa vendor_id produk');
    eq(Number(line.vendor_share_percent), 80, 'baris item membawa vendor_share_percent');
    eq(Number(line.vendor_share), 32000, 'baris item membawa vendor_share = 80% x 40.000');
    const perVendor = Array.isArray(order.body.vendor_share) ? order.body.vendor_share : [];
    eq(perVendor.length, 3, 'order membawa rekap 3 vendor');
    const sumShare = perVendor.reduce((a, v) => a + Number(v.share || 0), 0);
    eq(sumShare, EXPECT_TOTAL, `total hak vendor order = Rp ${EXPECT_TOTAL}`);

    console.log('\n[2] GET /shifts/current/vendor tidak lagi 0');
    const cur = await request('GET', '/api/shifts/current/vendor', null, TOKEN);
    eq(cur.status, 200, 'endpoint preview vendor sukses');
    const rows = (cur.body && cur.body.vendors) || [];
    eq(rows.length, 3, 'tiga vendor tampil di panel Shift');
    const byId = Object.fromEntries(rows.map((r) => [r.vendor_id, r]));
    eq(Number(byId[TOMYAM].share), EXPECT_TOMYAM, 'hak TOMYAM hari ini');
    eq(Number(byId[BAKSO].share), EXPECT_BAKSO, 'hak BAKSO SARI RASA hari ini');
    eq(Number(byId[MIE].share), EXPECT_MIE, 'hak MIE PANGSIT hari ini');
    eq(Number(byId[BAKSO].gross), 60000, 'omzet BAKSO hari ini Rp 60.000');
    eq(rows.reduce((a, r) => a + Number(r.share || 0), 0), EXPECT_TOTAL, 'total hak vendor hari ini tidak nol');

    console.log('\n[3] Board settlement membaca angka yang sama');
    const board = await request('GET', `/api/vendor-settlements/board?date=${TODAY}`, null, TOKEN);
    eq(board.status, 200, 'board settlement sukses');
    const boardRows = (board.body && board.body.rows) || [];
    eq(Number(board.body.summary.total_share), EXPECT_TOTAL, 'ringkasan board = hak vendor hari ini');
    const boardBakso = boardRows.find((r) => r.vendor_id === BAKSO) || {};
    eq(Number(boardBakso.share), EXPECT_BAKSO, 'board BAKSO = 54.000 (bukan 0)');

    console.log('\n[4] Tutup shift menyimpan vendor_share ke laporan shift');
    const closed = await request('POST', '/api/shifts/close', {
      closing_cash_fnb: 200000,
      closing_cash_retail: 0,
      transport: 0,
      expenses: [],
      vendor_payments: [
        { vendor_id: TOMYAM, paid: EXPECT_TOMYAM },
        { vendor_id: BAKSO, paid: EXPECT_BAKSO },
        { vendor_id: MIE, paid: EXPECT_MIE },
      ],
    }, TOKEN);
    eq(closed.status, 200, 'POST /api/shifts/close sukses');
    const rep = (closed.body && closed.body.report) || {};
    const repVendors = Array.isArray(rep.vendor_share) ? rep.vendor_share : [];
    eq(repVendors.length, 3, 'laporan shift memuat 3 baris vendor');
    eq(Number(rep.vendor_total_share), EXPECT_TOTAL, `vendor_total_share = Rp ${EXPECT_TOTAL}`);
    eq(Number(rep.vendor_total_paid), EXPECT_TOTAL, 'vendor_total_paid = nominal yang diserahkan');
    eq(Number(rep.vendor_total_outlet), 200000 - EXPECT_TOTAL, 'bagian outlet = omzet - hak vendor');
    const repBakso = repVendors.find((v) => v.vendor_id === BAKSO) || {};
    eq(Number(repBakso.share), EXPECT_BAKSO, 'baris BAKSO di laporan shift');
    eq(Number(repBakso.difference), 0, 'selisih 0 karena dibayar penuh');
    eq(repVendors[0].items.length > 0, true, 'rincian item vendor ikut tersimpan');

    console.log('\n[5] Settlement vendor tercatat dari pembayaran tutup shift');
    const stl = await request('GET', `/api/vendor-settlements?date=${TODAY}`, null, TOKEN);
    eq(stl.status, 200, 'daftar settlement sukses');
    const stlRows = Array.isArray(stl.body) ? stl.body : (stl.body.rows || []);
    eq(stlRows.length, 3, 'tiga settlement dibuat saat tutup shift');
    const totalPaidRecorded = stlRows.reduce((a, s) => a + Number(s.paid || 0), 0);
    eq(totalPaidRecorded, EXPECT_TOTAL, 'total yang tercatat sebagai pembayaran vendor');
  } catch (e) {
    failed += 1;
    console.log(`  FAIL exception -> ${e && e.message}`);
  } finally {
    server.close();
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}
  }

  console.log(`\n=== ${passed} lulus, ${failed} gagal ===\n`);
  process.exit(failed === 0 ? 0 : 1);
})();
