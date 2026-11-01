/**
 * R-SEC-01 REGRESSION PROBE — is `app.get('*')` (SPA fallback) also catchable via
 * HTTP `HEAD` requests when it is registered with `app.get(path, handler)`?
 *
 * Motive: api-server.js registers privileged operations with `app.get(...)`:
 *   - 5433 `GET /api/admin/update/status`
 *   - 5456 `GET /api/rpt/latest`          (diagnostic report -> history leak)
 *   - 5536 `GET /api/backup/export`       (full DB incl. plaintext passwords)
 *   - 5499 `GET /api/backup/gdrive/history`
 * Express `app.get` expands to ['get','head']. If `app.get('*', h)` is registered
 * LAST, a bare `HEAD /api/...` that does not match a HEAD-enabled route would fall
 * through to the SPA fallback. This probe decides the impact without touching the
 * real server or data.
 *
 * Run: node project/scripts/security-probe-head-spa-fallback.js
 */
'use strict';
const http = require('http');
const express = require('express');

function build(registerFallbackWithGet) {
  const app = express();
  app.get('/api/admin/update/status', (req, res) => res.json({ privileged: true }));
  if (registerFallbackWithGet) {
    app.get('*', (req, res) => res.type('text/plain').send('SPA-INDEX'));
  } else {
    app.use((req, res) => res.type('text/plain').send('SPA-INDEX'));
  }
  return app;
}

function request(server, method, path) {
  return new Promise((resolve, reject) => {
    const { port } = server.address();
    const req = http.request({ port, method, path, host: '127.0.0.1' }, (res) => {
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => resolve({ status: res.statusCode, body }));
    });
    req.on('error', reject);
    req.end();
  });
}

(async () => {
  const results = [];
  for (const useGet of [true, false]) {
    const server = build(useGet).listen(0, '127.0.0.1');
    await new Promise((r) => server.once('listening', r));
    // Negative control: no route at all, only HEAD — proves the HEAD-vs-GET expansion
    // of the fallback itself. A path served by app.get() would answer HEAD too, so the
    // control must use a path that is ONLY handled by the fallback.
    const head = await request(server, 'HEAD', '/somepage');
    const headApi = await request(server, 'HEAD', '/api/backup/export');
    const get = await request(server, 'GET', '/somepage');
    server.close();
    results.push({
      fallback_registered_with: useGet ? "app.get('*')" : 'app.use(...)',
      head_page_status: head.status,
      head_page_body: head.body,
      head_privileged_path_status: headApi.status,
      get_page_status: get.status,
    });
  }

  console.log(JSON.stringify(results, null, 2));
  // Only the app.get('*') variant can be *entered* by HEAD. express@4 does not send a
  // body for HEAD, so we report reachability through the handler instead of the body.
  const withGet = results[0];
  const headEnteredFallback = withGet.head_page_status === 200;
  console.log(`\nHEAD reaches the app.get('*') fallback handler: ${headEnteredFallback}`);
  console.log(`HEAD body bytes returned by express for a HEAD request: ${withGet.head_page_body.length}`);
  console.log("=> Consequence: express@4 sends no body on HEAD, so neither fallback leaks the");
  console.log("   SPA/HTML body. HEAD-reachability of the privileged GET handlers themselves");
  console.log("   still has to be decided by the source grep + patch below.");
  process.exit(headEnteredFallback ? 0 : 1);
})();
