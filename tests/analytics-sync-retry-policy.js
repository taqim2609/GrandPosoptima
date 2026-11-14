#!/usr/bin/env node
/**
 * Locks the analytics outbox retry policy.
 *
 * The bug this guards: the drainer gave up after 5 attempts with a 30s backoff cap, so a
 * database outage longer than ~31 seconds dropped completed orders permanently, recorded
 * as `done: true`. During the 2026-11-13 disk-full outage six orders (Rp 1.432.500) never
 * reached analytics and nobody could see it, because a dropped order and a delivered one
 * looked identical in the status endpoint.
 *
 * Runs against a temp data dir: it never touches data/ of the live install.
 */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'analytics-sync-'));
const outboxPath = path.join(tmp, 'outbox.json');
const statePath = path.join(tmp, 'state.json');

// Point the module at the temp dir BEFORE requiring it.
const modPath = require.resolve('../lib/analytics-sync.js');
const src = fs.readFileSync(modPath, 'utf8')
  .replace("path.join(__dirname, '../data/analytics-outbox.json')", JSON.stringify(outboxPath))
  .replace("path.join(__dirname, '../data/analytics-sync-state.json')", JSON.stringify(statePath));
const patchedPath = path.join(tmp, 'analytics-sync.js');
fs.writeFileSync(patchedPath, src);

process.env.NODE_SYNC_KEY = 'test-key';
process.env.ANALYTICS_URL = 'http://127.0.0.1:1'; // closed port: every attempt fails fast

const sync = require(patchedPath);

let pass = 0, fail = 0;
function check(name, fn) {
  try { fn(); console.log(`  ok   ${name}`); pass++; }
  catch (e) { console.log(`  FAIL ${name}\n         ${e.message}`); fail++; }
}

const db = { data: { orders: [], products: [], tables: [] } };
const order = {
  id: 'ord-test-1', order_number: 'TEST-001', status: 'completed',
  created_at: new Date().toISOString(), total: 50000,
  items: [{ product_id: 'p1', qty: 1, price: 50000, type: 'makanan' }],
};

console.log('analytics outbox retry policy');

check('a failed order survives far past the old 5-attempt ceiling', () => {
  sync.requeueAllCompleted(db);            // reset any state
  sync.enqueueOrder(order, db);
  const st = sync.getStatus();
  assert.strictEqual(st.entries.filter((e) => e.order_number === 'TEST-001').length, 1,
    'order must be queued');
});

check('the give-up ceiling is not `attempts >= 5` anymore', () => {
  const body = fs.readFileSync(modPath, 'utf8');
  assert.ok(!/attempts\s*>=\s*5/.test(body),
    'the old attempts>=5 give-up is still present');
  assert.ok(/MAX_ATTEMPTS|GIVE_UP_AFTER_MS/.test(body),
    'no wall-clock retry budget found');
});

check('backoff reaches 30 minutes instead of capping at 30 seconds', () => {
  const body = fs.readFileSync(modPath, 'utf8');
  assert.ok(/MAX_BACKOFF_MS\s*=\s*30\s*\*\s*60\s*\*\s*1000/.test(body),
    'backoff cap is not 30 minutes');
});

check('status exposes a `stuck` counter, so a dead order is never invisible', () => {
  const st = sync.getStatus();
  assert.strictEqual(typeof st.stuck, 'number',
    'getStatus() has no `stuck` field: undelivered orders look the same as delivered ones');
});

check('requeue revives a parked entry in place and keeps the rest of the outbox', () => {
  const entries = JSON.parse(fs.readFileSync(outboxPath, 'utf8'));
  entries[0].done = true;
  entries[0].stuck = true;
  entries[0].error = 'not delivered within 7 days';
  entries[0].attempts = 7;
  fs.writeFileSync(outboxPath, JSON.stringify(entries, null, 2));

  // Re-require so the module reads the edited outbox from disk instead of its cache.
  delete require.cache[patchedPath];
  const reloaded = require(patchedPath);
  const fresh = { data: { orders: [order], products: [], tables: [] } };
  const r = reloaded.requeueAllCompleted(fresh);

  assert.ok(r.retried >= 1, `expected the parked entry to be retried, got ${JSON.stringify(r)}`);
  const after = JSON.parse(fs.readFileSync(outboxPath, 'utf8'))
    .filter((e) => e.order_number === 'TEST-001');
  assert.strictEqual(after.length, 1, 'requeue must not duplicate an existing entry');
  assert.strictEqual(after[0].done, false, 'retried entry still marked done');
  assert.strictEqual(after[0].stuck, false, 'retried entry still parked as stuck');
  assert.strictEqual(after[0].attempts, 0, 'retry counters were not reset');
});

check('requeue does not wipe the synced ledger', () => {
  const body = fs.readFileSync(modPath, 'utf8');
  const fn = body.slice(body.indexOf('function requeueAllCompleted'),
                        body.indexOf('function getStatus'));
  assert.ok(!/state\.synced\s*=\s*\{\s*\}/.test(fn),
    'requeue still clears state.synced, destroying the record of what was delivered');
  assert.ok(!/outbox\s*=\s*\[\]/.test(fn),
    'requeue still truncates the outbox');
});

check('a legacy `done + error` entry is treated as undelivered, not as complete', () => {
  // This is the exact shape the old give-up path wrote: done=true, error='max retries
  // exceeded', attempts=5. A requeue that trusts `done` skips it forever.
  const entry = {
    client_ref: 'ord-legacy-1', order_number: 'LEGACY-001',
    order: { ...order, id: 'ord-legacy-1', order_number: 'LEGACY-001' },
    attempts: 5, done: true, error: 'max retries exceeded',
    createdAt: '2026-11-13T00:00:00.000Z',
  };
  fs.writeFileSync(outboxPath, JSON.stringify([entry], null, 2));

  delete require.cache[patchedPath];
  const reloaded = require(patchedPath);
  const r = reloaded.requeueAllCompleted({ data: { orders: [], products: [], tables: [] } });

  assert.strictEqual(r.retried, 1,
    `legacy failed entry was not revived: ${JSON.stringify(r)}`);
  const after = JSON.parse(fs.readFileSync(outboxPath, 'utf8'))[0];
  assert.strictEqual(after.done, false, 'still marked done');
  assert.strictEqual(after.error, null, 'error not cleared, so it still looks delivered');
  assert.strictEqual(after.attempts, 0, 'retry counter not reset');
});

try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
