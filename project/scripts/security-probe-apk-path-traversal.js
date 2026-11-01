/**
 * R-SEC-02 REGRESSION PROBE (non-destructive) — the PUBLIC route
 *   GET /apk/:name            (api-server.js)
 * used to resolve `path.join(__dirname, 'apk', req.params.name)` with no validation, so
 * `GET /apk/..%2fsecret.txt` served any file the process could read.
 *
 * This probe exercises BOTH the pre-patch shape and the patched guard against a throw-away
 * fixture directory in os.tmpdir(): it never reads, writes or serves anything from the
 * repository, and never starts the POS server.
 *
 * Run: node project/scripts/security-probe-apk-path-traversal.js
 * Exit 0 = pre-patch leaks AND the patched guard blocks it (both properties reproduced).
 */
'use strict';
const express = require('express');
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');

// --- fixture: tmp/apk/ (public) and tmp/secret.txt (must stay unreachable) -----
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gak-probe-'));
const apkDir = path.join(root, 'apk');
fs.mkdirSync(apkDir);
fs.writeFileSync(path.join(apkDir, 'app.apk'), 'PUBLIC-APK-BYTES');
fs.writeFileSync(path.join(root, 'secret.txt'), 'TOP-SECRET-NOT-FOR-PUBLIC');

/**
 * The patched guard, copied verbatim in behaviour from api-server.js `resolveInsideDir`.
 * Kept inline so this probe does not import (and therefore boot) the whole API server.
 */
function resolveInsideDir(baseDir, name) {
  if (!name || typeof name !== 'string') return null;
  if (name.includes('..') || name.includes('/') || name.includes('\\') || path.isAbsolute(name)) {
    return null;
  }
  const base = path.resolve(baseDir);
  const candidate = path.resolve(base, name);
  if (candidate !== base && !candidate.startsWith(base + path.sep)) return null;
  return candidate;
}

function buildApp(useGuard) {
  const app = express();
  app.get('/apk/:name', (req, res) => {
    const reqName = req.params?.name;
    const specificPath = useGuard ? resolveInsideDir(apkDir, reqName) : path.join(root, 'apk', reqName);
    if (!specificPath) return res.status(400).json({ detail: 'Nama berkas APK tidak valid.' });
    if (fs.existsSync(specificPath)) {
      return res.sendFile(specificPath, { headers: { 'Content-Type': 'text/plain' } });
    }
    res.status(404).send('APK not found');
  });
  return app;
}

function get(port, p) {
  return new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port, path: p }, (res) => {
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => resolve({ status: res.statusCode, body }));
    }).on('error', reject);
  });
}

async function probe(useGuard) {
  const server = buildApp(useGuard).listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  const { port } = server.address();
  const legit = await get(port, '/apk/app.apk');
  const dotdot = await get(port, '/apk/%2e%2e%2fsecret.txt');
  const encoded = await get(port, '/apk/..%2fsecret.txt');
  server.close();
  return {
    variant: useGuard ? 'patched (resolveInsideDir)' : 'pre-patch (path.join)',
    legit_status: legit.status,
    legit_body_ok: legit.body.trim() === 'PUBLIC-APK-BYTES',
    dotdot_status: dotdot.status,
    dotdot_leaked: dotdot.body.includes('TOP-SECRET'),
    encoded_status: encoded.status,
    encoded_leaked: encoded.body.includes('TOP-SECRET'),
  };
}

(async () => {
  const pre = await probe(false);
  const post = await probe(true);
  fs.rmSync(root, { recursive: true, force: true });

  console.log(JSON.stringify({ pre, post }, null, 2));

  const control_ok = pre.legit_body_ok && post.legit_body_ok;
  const prepatch_leaks = pre.dotdot_leaked || pre.encoded_leaked;
  const patched_blocks = !post.dotdot_leaked && !post.encoded_leaked;
  const patched_still_serves = post.legit_body_ok;

  console.log(`\npositive control (legit apk) in both variants : ${control_ok}`);
  console.log(`pre-patch traversal leaks a file outside apk/ : ${prepatch_leaks}`);
  console.log(`patched guard blocks traversal                 : ${patched_blocks}`);
  console.log(`patched guard still serves legit files         : ${patched_still_serves}`);

  process.exit(control_ok && prepatch_leaks && patched_blocks && patched_still_serves ? 0 : 1);
})();
