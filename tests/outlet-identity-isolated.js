#!/usr/bin/env node
// Isolated probe for outlet identity: the receipt reads GET /api/settings/outlet,
// but the endpoint used to read and write settings.business. Saving the outlet in
// Pengaturan Perangkat therefore never reached the receipt, and uploading a logo
// replaced the branding logo while the receipt kept the old one.
//
// Pins: legacy business fallback, PUT persistence into settings.outlet, mirrored
// business keys (WhatsApp reservation phone), and that an explicitly cleared logo
// stays cleared instead of resurrecting the platform logo.
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const bcrypt = require('bcryptjs');

const ROOT = path.join(__dirname, '..');
const snap = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/pos-db.json'), 'utf8'));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gak-outlet-'));

snap.data.users = [{
  id: 'outlet-owner', username: 'outlet-owner', name: 'Outlet Owner',
  role: 'superadmin', role_base: 'superadmin', is_superadmin: true, active: true,
  password_hash: bcrypt.hashSync('outlet-pass', 10),
}];
snap.data.orders = [];
snap.data.voidRows = [];
// Legacy state: identity only in settings.business, no settings.outlet at all.
snap.data.settings = snap.data.settings || {};
delete snap.data.settings.outlet;
snap.data.settings.business = {
  order_prefix: 'GAK-', service_tax_percent: 0,
  name: 'Grand Aceh Kuliner', address: 'Jl Sultan Iskandar Muda', phone: '+62-811-6818-142',
};
snap.data.settings.platform = { app_name: 'Grand POS', logo_url: 'data:image/png;base64,PLATFORM' };
snap.data.settings.business.logo_url = 'data:image/png;base64,BUSINESS';
fs.writeFileSync(path.join(tmp, 'pos-db.json'), JSON.stringify(snap));

const PORT = 3996;
process.env.PORT = String(PORT);
process.env.NODE_ENV = 'test';
process.env.GRANDPOS_DATA_DIR = tmp;
process.env.JWT_SECRET = 'outlet-identity-secret';
process.env.NODE_SYNC_KEY = '';
delete process.env.GRANDPOS_SNAPSHOT_FILE;

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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const server = app.listen(PORT, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  try {
    const login = await req('POST', '/api/auth/login', { username: 'outlet-owner', password: 'outlet-pass' });
    assert.strictEqual(login.status, 200, JSON.stringify(login.body).slice(0, 200));
    const token = login.body.token;

    // 1) Legacy snapshot: identity only in business must still reach the receipt.
    const legacy = await req('GET', '/api/settings/outlet', null, token);
    assert.strictEqual(legacy.status, 200);
    assert.strictEqual(legacy.body.name, 'Grand Aceh Kuliner', 'legacy business name is used');
    assert.strictEqual(legacy.body.address, 'Jl Sultan Iskandar Muda', 'legacy business address is used');
    assert.strictEqual(legacy.body.phone, '+62-811-6818-142', 'legacy business phone is used');
    assert.strictEqual(legacy.body.logo_url, 'data:image/png;base64,BUSINESS', 'business logo is the fallback');

    // 2) Saving the outlet must land in settings.outlet (what the receipt reads).
    const saved = await req('PUT', '/api/settings/outlet', {
      name: 'Warung Uji', address: 'Jl Uji 1', phone: '0800-000',
      logo_url: 'data:image/png;base64,OUTLET',
    }, token);
    assert.strictEqual(saved.status, 200, JSON.stringify(saved.body).slice(0, 200));
    assert.strictEqual(saved.body.name, 'Warung Uji');
    assert.strictEqual(saved.body.logo_url, 'data:image/png;base64,OUTLET');

    const reread = await req('GET', '/api/settings/outlet', null, token);
    assert.strictEqual(reread.body.name, 'Warung Uji', 'outlet save survives a re-read');
    assert.strictEqual(reread.body.logo_url, 'data:image/png;base64,OUTLET');

    // The business keys are mirrored so other readers (reservation WhatsApp) agree.
    const biz = await req('GET', '/api/settings/business', null, token);
    assert.strictEqual(biz.body.name, 'Warung Uji');
    assert.strictEqual(biz.body.phone, '0800-000');
    assert.strictEqual(biz.body.order_prefix, 'GAK-', 'unrelated business settings are untouched');

    // 3) Clearing the logo must not resurrect the platform/business logo.
    const cleared = await req('PUT', '/api/settings/outlet', { logo_url: '' }, token);
    assert.strictEqual(cleared.status, 200);
    assert.strictEqual(cleared.body.logo_url, '', 'an explicitly cleared logo stays empty');
    const rereadCleared = await req('GET', '/api/settings/outlet', null, token);
    assert.strictEqual(rereadCleared.body.logo_url, '', 'cleared logo stays empty on re-read');

    // 4) It must be on disk, not just in memory (debounced saver = 250 ms).
    await sleep(700);
    const onDisk = JSON.parse(fs.readFileSync(path.join(tmp, 'pos-db.json'), 'utf8'));
    const diskSettings = onDisk.data ? onDisk.data.settings : onDisk.settings;
    assert(diskSettings.outlet, 'settings.outlet was not persisted');
    assert.strictEqual(diskSettings.outlet.name, 'Warung Uji', 'persisted outlet name');
    assert.strictEqual(diskSettings.business.name, 'Warung Uji', 'persisted mirrored business name');

    // 5) Writing the outlet is an admin action.
    const anon = await req('PUT', '/api/settings/outlet', { name: 'Hacker' });
    assert.ok(anon.status === 401 || anon.status === 403, `unauthenticated write must be rejected, got ${anon.status}`);

    console.log('PASS outlet identity: legacy business fallback reaches the receipt, save writes settings.outlet (persisted), '
      + 'business mirrors identity keys, cleared logo stays cleared, anonymous write rejected');
  } finally {
    server.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
})().catch((e) => { console.error('FAIL', e.stack || e); process.exitCode = 1; });
