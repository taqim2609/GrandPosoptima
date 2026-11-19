#!/usr/bin/env node
// Isolated probe for the "two stores" cleanup:
//
//   - WhatsApp used to live in settings.wa AND whatsappConfig. The status route
//     read settings.wa, the sender read settings.wa, while whatsappConfig kept a
//     hard-coded placeholder Evolution "connected" status. The two disagreed.
//   - Branding used to live in db.platform AND settings.platform; the stale
//     settings.platform copy (old colors, dead /uploads logo) only confused readers.
//   - settings["metrics_process:N"] were leftover counters nothing read.
//
// Pins: settings.wa is authoritative, whatsappConfig becomes a derived mirror,
// placeholder Evolution values are ignored, a live probe decides status, and the
// legacy platform/metrics keys are removed on boot.
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const bcrypt = require('bcryptjs');

const ROOT = path.join(__dirname, '..');
const snap = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/pos-db.json'), 'utf8'));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gak-wa-branding-'));

snap.data.users = [{
  id: 'wa-owner', username: 'wa-owner', name: 'WA Owner',
  role: 'superadmin', role_base: 'superadmin', is_superadmin: true, active: true,
  password_hash: bcrypt.hashSync('wa-pass', 10),
}];
snap.data.orders = [];
snap.data.voidRows = [];
snap.data.settings = snap.data.settings || {};

// Real gateway values: WACloud works, so they must survive.
snap.data.settings.wa = {
  api_key: 'wacloud-test-key',
  device_id: '9caba95a-70ef-4361-b2a2-4e7b0a0a8499',
  device_name: 'Wa Cafe',
  phone: '081269001122',
  recipients: ['081269001122'],
};
// Stale duplicate with the seeded placeholder URL and a cached "connected".
snap.data.whatsappConfig = {
  provider: 'evolution',
  configured: true,
  evolution_url: 'https://evolution-api-pos-xyz.asia-southeast1.run.app',
  evolution_api_key: 'GAK_EVOLUTION_SECRET_KEY_2026',
  evolution_instance: 'grand-aceh-pos',
  device_id: 'grand-aceh-pos',
  device_name: 'Evolution Cloud Run (Kasir POS)',
  status: 'connected',
};
snap.data.platform = {
  app_name: 'Grand Aceh Kuliner',
  tagline: 'KULINER POS',
  primary: '#E63946',
  accent: '#F97316',
  logo_url: '',
  has_custom: false,
};
snap.data.settings.platform = {
  app_name: 'Grand POS',
  tagline: 'Grand POS',
  primary: '#0ea5e9',
  logo_url: '/uploads/logo-dead.png',
};
snap.data.settings['metrics_process:8'] = { pid: 8, cpu: 1 };
snap.data.settings['metrics_process:9'] = { pid: 9, cpu: 1 };

fs.writeFileSync(path.join(tmp, 'pos-db.json'), JSON.stringify(snap));

const PORT = 3998;
process.env.PORT = String(PORT);
process.env.NODE_ENV = 'test';
process.env.GRANDPOS_DATA_DIR = tmp;
process.env.JWT_SECRET = 'wa-branding-secret';
process.env.NODE_SYNC_KEY = '';
delete process.env.GRANDPOS_SNAPSHOT_FILE;

// The probe must never reach the real provider from a test.
const seenRequests = [];
global.fetch = async (url) => {
  seenRequests.push(String(url));
  return {
    ok: true,
    status: 200,
    json: async () => ({
      success: true,
      data: [{ id: '9caba95a-70ef-4361-b2a2-4e7b0a0a8499', name: 'Wa Cafe', status: 'connected' }],
    }),
  };
};

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
    const login = await req('POST', '/api/auth/login', { username: 'wa-owner', password: 'wa-pass' });
    assert.strictEqual(login.status, 200, JSON.stringify(login.body).slice(0, 200));
    const token = login.body.token;

    // 1) Status is decided by a probe, not by a stored string.
    const status = await req('GET', '/api/whatsapp/status', null, token);
    assert.strictEqual(status.status, 200, JSON.stringify(status.body));
    assert.strictEqual(status.body.provider, 'wacloud');
    assert.strictEqual(status.body.status, 'connected');
    assert.strictEqual(status.body.state, 'connected');
    assert.strictEqual(status.body.device_id_matches, true);
    assert.ok(seenRequests.some((u) => u.endsWith('/devices')), 'status probes WACloud devices');

    // 3) Config view exposes the merged config and no fake localhost Evolution.
    const cfg = await req('GET', '/api/whatsapp/config', null, token);
    assert.strictEqual(cfg.status, 200);
    assert.strictEqual(cfg.body.provider, 'wacloud');
    assert.strictEqual(cfg.body.evolution_url, '', 'empty, not http://localhost:8080');
    assert.strictEqual(cfg.body.status, 'unknown', 'no unverified connected claim');
    assert.strictEqual(cfg.body.configured, true);

    // 4) A save updates settings.wa and the mirror together.
    const put = await req('PUT', '/api/whatsapp/config', { device_name: 'Wa Cafe Baru' }, token);
    assert.strictEqual(put.status, 200, JSON.stringify(put.body));
    assert.strictEqual(put.body.wa.device_name, 'Wa Cafe Baru');
    const after = await req('GET', '/api/whatsapp/config', null, token);
    assert.strictEqual(after.body.device_name, 'Wa Cafe Baru');
    const mirror = await req('GET', '/api/app-info', null, token);
    assert.strictEqual(mirror.body.tagline, 'KULINER POS', 'branding still comes from db.platform');

    // 5) The cleanup is persisted by the next successful mutation.
    await new Promise((r) => setTimeout(r, 700));
    const persisted = JSON.parse(fs.readFileSync(path.join(tmp, 'pos-db.json'), 'utf8')).data;
    assert.strictEqual(persisted.settings.platform, undefined, 'settings.platform is removed');
    assert.strictEqual(persisted.settings['metrics_process:8'], undefined, 'metrics_process:8 is removed');
    assert.strictEqual(persisted.settings['metrics_process:9'], undefined, 'metrics_process:9 is removed');
    assert.strictEqual(persisted.platform.tagline, 'KULINER POS', 'db.platform is untouched');
    assert.strictEqual(persisted.whatsappConfig.provider, 'wacloud', 'mirror follows the working gateway');
    assert.strictEqual(persisted.whatsappConfig.evolution_url, '', 'placeholder Evolution URL is dropped');
    assert.strictEqual(persisted.whatsappConfig.device_id, '9caba95a-70ef-4361-b2a2-4e7b0a0a8499');
    assert.strictEqual(persisted.whatsappConfig.status, undefined, 'no cached connected status in the mirror');

    console.log('PASS whatsapp-branding-unified.js');
  } finally {
    server.close();
  }
})().catch((err) => {
  console.error('FAIL whatsapp-branding-unified.js');
  console.error(err && err.stack || err);
  process.exit(1);
});
