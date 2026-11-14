#!/usr/bin/env node
/**
 * Proves the analytics sync endpoints are admin-only, against a real server booted on a
 * throwaway copy of data/pos-db.json. No production data is touched and no password is
 * guessed: tokens are minted with the server's own signer.
 *
 *   node tests/analytics-sync-rbac.js
 *
 * anon -> 401, kasir -> 403, admin -> 200. The requeue endpoint mutates every undelivered
 * order at once, so a cashier reaching it from the till would be a real problem.
 */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const jwt = require('jsonwebtoken');

const REPO = path.join(__dirname, '..');
const PORT = 3992;
const SECRET = 'rbac-test-secret-not-a-real-one';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sync-rbac-'));
fs.copyFileSync(path.join(REPO, 'data/pos-db.json'), path.join(tmp, 'pos-db.json'));
// Keep the run hermetic: no outbox writes reach the real data dir.
fs.writeFileSync(path.join(tmp, 'analytics-outbox.json'), '[]');
fs.writeFileSync(path.join(tmp, 'analytics-sync-state.json'), '{"synced":{}}');

const users = JSON.parse(fs.readFileSync(path.join(tmp, 'pos-db.json'), 'utf8')).data.users;
const byRole = (r) => users.find((u) => u.active !== false && String(u.role || '').toLowerCase() === r);
const admin = users.find((u) => u.active !== false && /admin|owner/.test(String(u.role || '').toLowerCase()));
const kasir = byRole('kasir') || users.find((u) => u.active !== false && String(u.role || '').toLowerCase() !== 'admin');

if (!admin || !kasir) {
  console.error('need one admin and one non-admin account in the snapshot');
  process.exit(1);
}

const mint = (u) => jwt.sign(
  { id: u.id, username: u.username, role: u.role, role_base: u.role === 'admin' ? 'superadmin' : u.role,
    is_superadmin: u.role === 'admin' },
  SECRET, { expiresIn: '5m' }
);

function req(method, p, token) {
  return new Promise((resolve, reject) => {
    const headers = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    const r = http.request({ host: '127.0.0.1', port: PORT, path: p, method, headers }, (res) => {
      let b = '';
      res.on('data', (c) => (b += c));
      res.on('end', () => resolve({ status: res.statusCode, body: b }));
    });
    r.on('error', reject);
    r.end();
  });
}

(async () => {
  process.env.PORT = String(PORT);
  process.env.JWT_SECRET = SECRET;
  process.env.GRANDPOS_DATA_DIR = tmp;
  process.env.NODE_SYNC_KEY = '';
  process.env.NODE_ENV = 'production';

  const app = require(path.join(REPO, 'api-server.js'));
  const server = app.listen(PORT);

  let pass = 0, fail = 0;
  const check = async (name, fn) => {
    try { await fn(); console.log(`  ok   ${name}`); pass++; }
    catch (e) { console.log(`  FAIL ${name}\n         ${e.message}`); fail++; }
  };

  await new Promise((r) => setTimeout(r, 1200));
  console.log('analytics sync RBAC');

  await check('anon cannot read sync status', async () => {
    const r = await req('GET', '/api/analytics/sync/status');
    assert.strictEqual(r.status, 401, `expected 401, got ${r.status}`);
  });

  await check('anon cannot trigger requeue', async () => {
    const r = await req('POST', '/api/analytics/sync/requeue');
    assert.strictEqual(r.status, 401, `expected 401, got ${r.status}`);
  });

  await check('kasir cannot read sync status', async () => {
    const r = await req('GET', '/api/analytics/sync/status', mint(kasir));
    assert.strictEqual(r.status, 403, `expected 403, got ${r.status}`);
  });

  await check('kasir cannot trigger requeue', async () => {
    const r = await req('POST', '/api/analytics/sync/requeue', mint(kasir));
    assert.strictEqual(r.status, 403,
      `expected 403, got ${r.status} -- a cashier can rewrite the whole outbox`);
  });

  await check('admin can read sync status and sees the stuck counter', async () => {
    const r = await req('GET', '/api/analytics/sync/status', mint(admin));
    assert.strictEqual(r.status, 200, `expected 200, got ${r.status}`);
    const body = JSON.parse(r.body);
    assert.ok('stuck' in body, 'status payload has no stuck counter');
  });

  server.close();
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
