/**
 * Verification for the landing-page write guard.
 *
 * Boots the REAL api-server.js on an ephemeral port against a throw-away copy of the
 * data snapshot, then asserts:
 *   1. anonymous POST /api/settings/landing-page is rejected (401) and leaves data untouched
 *   2. non-admin (kasir) POST is rejected (403) and leaves data untouched
 *   3. admin POST still succeeds (200) and persists
 *   4. the public GET mirror still works anonymously (200)
 *   5. authenticated GET /api/settings/landing-page still works (200)
 *
 * Run: node tests/landing-page-auth-guard.js
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

const REPO = path.join(__dirname, '..');
const liveSnapshot = path.join(REPO, 'data', 'pos-db.json');
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gak-landing-'));
if (fs.existsSync(liveSnapshot)) {
  fs.copyFileSync(liveSnapshot, path.join(tmpDir, 'pos-db.json'));
}

process.env.GRANDPOS_DATA_DIR = tmpDir;
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'verify-only-secret-0123456789abcdef';

const realLog = console.log;
const realWarn = console.warn;
console.log = () => {};
console.warn = () => {};

const jwt = require('jsonwebtoken');
const app = require(path.join(REPO, 'api-server.js'));

const results = [];
function assert(name, condition, extra) {
  results.push({ name, pass: Boolean(condition), ...(extra ? { extra } : {}) });
}

function call(port, method, p, { body, headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? null : Buffer.from(JSON.stringify(body));
    const req = http.request(
      {
        host: '127.0.0.1',
        port,
        method,
        path: p,
        headers: {
          ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': payload.length } : {}),
          ...headers,
        },
      },
      (res) => {
        let data = '';
        res.on('data', (c) => { data += c; });
        res.on('end', () => resolve({ status: res.statusCode, body: data }));
      }
    );
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function tokenFor(claims) {
  return `Bearer ${jwt.sign(claims, process.env.JWT_SECRET, { expiresIn: '10m' })}`;
}

(async () => {
  const server = app.listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  const { port } = server.address();

  const marker = `probe-${Date.now()}`;

  // 1. Anonymous write must be refused.
  const anon = await call(port, 'POST', '/api/settings/landing-page', { body: { hero_title: marker } });
  assert('anonymous POST /api/settings/landing-page -> 401', anon.status === 401, { status: anon.status });

  // 2. Non-admin write must be refused.
  const kasir = tokenFor({ id: 'u-kasir2', username: 'kasir2', role: 'kasir', role_base: 'kasir' });
  const nonAdmin = await call(port, 'POST', '/api/settings/landing-page', {
    body: { hero_title: marker },
    headers: { Authorization: kasir },
  });
  assert('kasir POST /api/settings/landing-page -> 403', nonAdmin.status === 403, { status: nonAdmin.status });

  // 3. Neither refused write may have mutated the stored config.
  const afterRefused = await call(port, 'GET', '/api/public/landing-config');
  assert(
    'refused writes did not mutate landing config',
    !afterRefused.body.includes(marker),
    { bodyHead: afterRefused.body.slice(0, 120) }
  );

  // 4. Public GET mirror stays anonymous-readable.
  assert('anonymous GET /api/public/landing-config -> 200', afterRefused.status === 200, {
    status: afterRefused.status,
  });

  // 5. Admin write still succeeds and persists.
  const admin = tokenFor({ id: 'u-gakuliner', username: 'gakuliner', role: 'admin', role_base: 'admin' });
  const adminWrite = await call(port, 'POST', '/api/settings/landing-page', {
    body: { hero_title: marker },
    headers: { Authorization: admin },
  });
  assert('admin POST /api/settings/landing-page -> 200', adminWrite.status === 200, {
    status: adminWrite.status,
  });
  const afterAdmin = await call(port, 'GET', '/api/public/landing-config');
  assert('admin write persisted to landing config', afterAdmin.body.includes(marker), {
    bodyHead: afterAdmin.body.slice(0, 120),
  });

  // 6. Authenticated read of the internal endpoint still works.
  const authRead = await call(port, 'GET', '/api/settings/landing-page', {
    headers: { Authorization: admin },
  });
  assert('authenticated GET /api/settings/landing-page -> 200', authRead.status === 200, {
    status: authRead.status,
  });

  server.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });

  console.log = realLog;
  console.warn = realWarn;

  console.log(JSON.stringify(results, null, 2));
  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} assertions passed`);
  process.exit(failed.length === 0 ? 0 : 1);
})().catch((err) => {
  console.log = realLog;
  console.warn = realWarn;
  console.error('[verify] crashed:', err);
  process.exit(2);
});
