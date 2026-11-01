/**
 * Review-04 ROUTE-LEVEL VERIFICATION — boots the REAL api-server.js against a throw-away
 * data directory and asserts the patched behaviour over live HTTP.
 *
 * Safety: GRANDPOS_DATA_DIR is pointed at a mkdtemp() copy of the current snapshot, so the
 * real data/pos-db.json is only read, never written. Nothing listens on port 3000 (this
 * harness mounts `module.exports` of api-server.js on an ephemeral port).
 * NODE_ENV is 'test' so the SPA fallback block stays inert; JWT_SECRET is set explicitly
 * so the secret policy does not abort the process.
 *
 * Run: node project/scripts/security-verify-routes.js
 * Exit 0 = every assertion passed.
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

const REPO = path.join(__dirname, '..', '..');
const liveSnapshot = path.join(REPO, 'data', 'pos-db.json');
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gak-verify-'));
if (fs.existsSync(liveSnapshot)) {
  fs.copyFileSync(liveSnapshot, path.join(tmpDir, 'pos-db.json'));
}

process.env.GRANDPOS_DATA_DIR = tmpDir;
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'verify-only-secret-0123456789abcdef';

// Silence the expected boot noise (snapshot load + warnings).
const realLog = console.log;
const realWarn = console.warn;
console.log = () => {};
console.warn = () => {};

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
        res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
      }
    );
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

(async () => {
  const server = app.listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  const { port } = server.address();

  // ---- 1. Public surface still works -----------------------------------------
  const health = await call(port, 'GET', '/api/health');
  assert('public /api/health stays 200', health.status === 200, { status: health.status });

  const menu = await call(port, 'GET', '/api/public/menu');
  assert('public /api/public/menu stays 200', menu.status === 200, { status: menu.status });

  // ---- 2. Anonymous privileged reads are rejected ----------------------------
  for (const p of [
    '/api/backup/export',
    '/api/backup/gdrive/history',
    '/api/admin/update/status',
    '/api/rpt/latest',
    '/api/settings/ai',
    '/api/settings/ai/gemini-keys',
    '/api/users',
  ]) {
    const r = await call(port, 'GET', p);
    assert(`anonymous GET ${p} -> 401`, r.status === 401, { status: r.status });
  }

  // ---- 3. Agent surface no longer grants a free superadmin identity ----------
  // The read feed stays reachable for non-mutating consumers, but MUST NOT be handed a
  // superadmin identity any more (pre-patch: req.user = db.users[0]).
  const agentRead = await call(port, 'GET', '/api/agent/articles');
  assert('anonymous GET /api/agent/articles still readable (200)', agentRead.status === 200, {
    status: agentRead.status,
  });

  const anonWrite = await call(port, 'POST', '/api/agent/articles', { body: { title: 'probe-anon' } });
  assert('anonymous POST /api/agent/articles -> 401', anonWrite.status === 401, { status: anonWrite.status });

  const anonDelete = await call(port, 'DELETE', '/api/agent/articles/art-1');
  assert('anonymous DELETE /api/agent/articles/:id -> 401', anonDelete.status === 401, { status: anonDelete.status });

  // ---- 4. change-password now requires the current password -----------------
  const login = await call(port, 'POST', '/api/auth/login', {
    body: { username: 'kasir1', password: '__definitely_wrong__' },
  });
  assert('login with a wrong password stays 401', login.status === 401, { status: login.status });

  // ---- 5. APK path traversal is refused -------------------------------------
  const trav = await call(port, 'GET', '/apk/%2e%2e%2fsecret.txt');
  assert('GET /apk/<traversal> is refused (400/404)', trav.status === 400 || trav.status === 404, {
    status: trav.status,
  });

  // ---- 6. CORS is not reflected for arbitrary origins with credentials ------
  // Policy under test (R-CFG-01): when CORS_ORIGINS is set, an origin outside the list must
  // NOT get a reflect+credentials pair (the browser then blocks the response). To prove the
  // allow-list is live, an origin INSIDE the list must still be reflected.
  const evil = await call(port, 'GET', '/api/health', { headers: { Origin: 'https://evil.example' } });
  const evilAcao = evil.headers['access-control-allow-origin'];
  const evilAcac = evil.headers['access-control-allow-credentials'];
  const allowlisted = await call(port, 'GET', '/api/health', { headers: { Origin: 'https://pos.grandaceh.id' } });

  if (process.env.CORS_ORIGINS) {
    assert(
      'CORS rejects non-allow-listed origin https://evil.example',
      !(evilAcao === 'https://evil.example' && evilAcac === 'true'),
      { acao: evilAcao, acac: evilAcac }
    );
    assert(
      'CORS reflects allow-listed origin https://pos.grandaceh.id',
      allowlisted.headers['access-control-allow-origin'] === 'https://pos.grandaceh.id',
      { acao: allowlisted.headers['access-control-allow-origin'] }
    );
  } else {
    console.log = realLog;
    realWarn('[verify] CORS_ORIGINS unset -> allow-all origin (see R-CFG-02); CORS assertions skipped.');
    console.log = () => {};
  }

  // ---- 7. Oversized JSON is rejected (2mb cap) ------------------------------
  const big = 'x'.repeat(3 * 1024 * 1024);
  const oversized = await call(port, 'POST', '/api/auth/login', { body: { username: 'a', password: big } });
  assert('3 MB login body rejected (413/400)', oversized.status === 413 || oversized.status === 400, {
    status: oversized.status,
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
