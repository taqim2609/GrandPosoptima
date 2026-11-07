/**
 * Jalankan server POS sementara di atas SALINAN snapshot, dengan satu akun uji
 * ber-password dikenal, supaya uji browser (shift-single-form-e2e.js) bisa login
 * tanpa menyentuh data produksi.
 *
 * Pemakaian: node tests/_e2e-server.js <port> <dirData>
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const PORT = process.argv[2] || '3988';
const ROOT = path.join(__dirname, '..');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gak-e2e-'));
const snap = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'pos-db.json'), 'utf-8'));

const bcrypt = require(path.join(ROOT, 'node_modules', 'bcryptjs'));
const USER = 'e2e-probe';
const PASS = 'e2e-pass-fixed';
snap.data.users = (snap.data.users || []).filter((u) => u.username !== USER);
snap.data.users.push({
  id: 'e2e-probe-id',
  username: USER,
  name: 'E2E Probe',
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

// Pastikan shift terbuka supaya kartu tutup shift dirender.
const wib = new Date(Date.now() + 7 * 60 * 60 * 1000);
snap.data.currentShift = {
  id: 's-e2e',
  user_id: 'e2e-probe-id',
  user_name: 'E2E Probe',
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
snap.data.dashboardConfig = snap.data.dashboardConfig || {};

fs.writeFileSync(path.join(tmpDir, 'pos-db.json'), JSON.stringify(snap, null, 2));

process.env.PORT = String(PORT);
process.env.NODE_ENV = 'production'; // sajikan dist/ (build hasil `node build.js`)
process.env.GRANDPOS_DATA_DIR = tmpDir;
process.env.JWT_SECRET = 'e2e-shift-' + Date.now();

const app = require(path.join(ROOT, 'api-server.js'));
const distPath = path.join(ROOT, 'dist');
app.use(require('express').static(distPath));
app.get('*', (_req, res) => res.sendFile(path.join(distPath, 'index.html')));

const server = app.listen(Number(PORT), '127.0.0.1', () => {
  console.log(`[e2e-server] listening on http://127.0.0.1:${PORT} (data: ${tmpDir})`);
});

function shutdown() {
  server.close(() => {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}
    process.exit(0);
  });
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
