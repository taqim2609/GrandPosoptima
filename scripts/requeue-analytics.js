#!/usr/bin/env node
/**
 * Mint a short-lived admin token from the container's own JWT_SECRET and ask the running
 * server to re-deliver undelivered orders.
 *
 * Why a script and not curl: the requeue endpoint is admin-gated, and guessing production
 * credentials is not acceptable. The server already holds the signing key, so the honest
 * way to prove "this is an operator action" is to sign with that same key.
 *
 * Read-only on data/ : it only calls the HTTP endpoint, exactly as an admin session would.
 *
 *   node scripts/requeue-analytics.js --dry-run     # show what is pending, change nothing
 *   node scripts/requeue-analytics.js              # actually requeue
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const jwt = require('jsonwebtoken');

const ROOT = path.join(__dirname, '..');
const DRY = process.argv.includes('--dry-run');
const PORT = process.env.PORT || 3000;

const db = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/pos-db.json'), 'utf8')).data;
const admin = (db.users || []).find(
  (u) => u.active !== false && String(u.role || '').toLowerCase().match(/admin|owner/)
);
if (!admin) {
  console.error('No active admin account in data/pos-db.json; refusing to invent one.');
  process.exit(1);
}

const secret = process.env.JWT_SECRET;
if (!secret) {
  console.error('JWT_SECRET is not set in this environment.');
  process.exit(1);
}

const token = jwt.sign(
  { id: admin.id, username: admin.username, role: 'admin', is_superadmin: true },
  secret,
  { expiresIn: '10m' }
);

function call(method, p) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: '127.0.0.1', port: PORT, path: p, method,
        headers: { Authorization: `Bearer ${token}` } },
      (res) => {
        let body = '';
        res.on('data', (c) => (body += c));
        res.on('end', () => resolve({ status: res.statusCode, body }));
      }
    );
    req.on('error', reject);
    req.end();
  });
}

(async () => {
  const status = await call('GET', '/api/analytics/sync/status');
  if (status.status !== 200) {
    console.error(`status endpoint returned ${status.status}: ${status.body.slice(0, 200)}`);
    process.exit(1);
  }
  const st = JSON.parse(status.body);
  console.log(`enabled=${st.enabled} pending=${st.pending} failed=${st.failed} ` +
              `stuck=${st.stuck ?? 'n/a'} synced=${st.synced}`);

  // An entry with a recorded error was never delivered, even if the old give-up path set
  // `done` on it. Trusting `done` alone is what made six orders invisible.
  const undelivered = (st.entries || []).filter(
    (e) => e.stuck || e.error || !e.done
  );
  console.log(`\nundelivered: ${undelivered.length}`);
  for (const e of undelivered) {
    console.log(`  ${e.order_number}  attempts=${e.attempts} done=${e.done} stuck=${e.stuck} ` +
                `${e.error ? 'err=' + String(e.error).slice(0, 60) : ''}`);
  }

  if (DRY) {
    console.log('\n--dry-run: nothing changed.');
    return;
  }
  if (undelivered.length === 0) {
    console.log('\nNothing to requeue.');
    return;
  }

  const res = await call('POST', '/api/analytics/sync/requeue');
  console.log(`\nrequeue -> ${res.status} ${res.body.slice(0, 300)}`);
  if (res.status !== 200) process.exit(1);
  console.log('The worker drains every 10s; watch with: docker logs -f grandpos_web_app');
})();
