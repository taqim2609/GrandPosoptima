/**
 * Verification that the hardcoded `X-Gak-Token` credential is gone from the codebase
 * and that no request header can substitute for a real session.
 *
 * Two layers:
 *   A. STATIC  - the literal must not exist in any tracked source file, and the
 *                server must no longer read an `x-gak-token` header as identity.
 *   B. RUNTIME - boots the REAL api-server.js on an ephemeral port against a
 *                throw-away data copy and asserts the formerly bypassable endpoints
 *                demand a real session, while a valid session still works.
 *
 * Run: node tests/x-gak-token-bypass-removed.js
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { execFileSync } = require('child_process');

const REPO = path.join(__dirname, '..');
const LEGACY_LITERAL = 'gak_rpt_7f3c9e1b';

const results = [];
function assert(name, condition, extra) {
  results.push({ name, pass: Boolean(condition), ...(extra ? { extra } : {}) });
}

// ---------------------------------------------------------------------------
// A. Static checks
// ---------------------------------------------------------------------------
function trackedFilesWithLiteral() {
  try {
    const out = execFileSync(
      'git',
      ['grep', '-l', LEGACY_LITERAL, '--', '.', ':!node_modules', ':!dist', ':!project/frontend/build'],
      { cwd: REPO, encoding: 'utf8' }
    );
    return out.trim().split('\n').filter(Boolean);
  } catch (err) {
    // git grep exits 1 when nothing matches, which is the pass case.
    return [];
  }
}

const literalFiles = trackedFilesWithLiteral();
assert(
  'legacy literal absent from every tracked source file',
  literalFiles.length === 0,
  { files: literalFiles }
);

const serverSource = fs.readFileSync(path.join(REPO, 'api-server.js'), 'utf8');
assert(
  'api-server.js no longer reads an x-gak-token header',
  !/x-gak-token/i.test(serverSource),
  { occurrences: (serverSource.match(/x-gak-token/gi) || []).length }
);

// ---------------------------------------------------------------------------
// B. Runtime checks
// ---------------------------------------------------------------------------
const liveSnapshot = path.join(REPO, 'data', 'pos-db.json');
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gak-token-'));
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

(async () => {
  const server = app.listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  const { port } = server.address();

  const reportBody = { ts: new Date().toISOString(), report: { probe: 'bypass-check' } };
  const legacyHeader = { 'X-Gak-Token': LEGACY_LITERAL };

  // The legacy credential must never authenticate, on any endpoint.
  for (const [method, p, body] of [
    ['POST', '/api/rpt', reportBody],
    ['POST', '/api/system/health/sync-now', undefined],
    ['POST', '/api/system/health/speed-test', undefined],
    ['GET', '/api/auth/me', undefined],
  ]) {
    const r = await call(port, method, p, { body, headers: legacyHeader });
    assert(`${method} ${p} with legacy literal -> 401`, r.status === 401, { status: r.status });
  }

  // Anonymous access to the same endpoints must also be refused.
  const anonRpt = await call(port, 'POST', '/api/rpt', { body: reportBody });
  assert('anonymous POST /api/rpt -> 401', anonRpt.status === 401, { status: anonRpt.status });

  const anonSync = await call(port, 'POST', '/api/system/health/sync-now');
  assert('anonymous POST /api/system/health/sync-now -> 401', anonSync.status === 401, {
    status: anonSync.status,
  });

  const anonSpeed = await call(port, 'POST', '/api/system/health/speed-test');
  assert('anonymous POST /api/system/health/speed-test -> 401', anonSpeed.status === 401, {
    status: anonSpeed.status,
  });

  // A real session must still work on both endpoints.
  const session = `Bearer ${jwt.sign(
    { id: 'u-gakuliner', username: 'gakuliner', role: 'admin', role_base: 'admin' },
    process.env.JWT_SECRET,
    { expiresIn: '10m' }
  )}`;

  const authRpt = await call(port, 'POST', '/api/rpt', {
    body: reportBody,
    headers: { Authorization: session },
  });
  assert('authenticated POST /api/rpt -> 200', authRpt.status === 200, { status: authRpt.status });

  const authSync = await call(port, 'POST', '/api/system/health/sync-now', {
    headers: { Authorization: session },
  });
  assert('authenticated POST /api/system/health/sync-now -> 200', authSync.status === 200, {
    status: authSync.status,
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
