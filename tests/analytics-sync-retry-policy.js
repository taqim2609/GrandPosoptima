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
 * Isolation: GRANDPOS_DATA_DIR points at a temp dir. The module must honour it -- that is
 * itself one of the assertions, because a run that ignores it rewrites the production
 * outbox (which is exactly how the live outbox once got truncated by a test run).
 */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'analytics-sync-'));
const outboxPath = path.join(tmp, 'analytics-outbox.json');
const statePath = path.join(tmp, 'analytics-sync-state.json');

process.env.GRANDPOS_DATA_DIR = tmp;
process.env.NODE_SYNC_KEY = 'test-key';
process.env.ANALYTICS_URL = 'http://127.0.0.1:1'; // closed port: every attempt fails fast

const modPath = require.resolve('../lib/analytics-sync.js');

/** Fresh module instance, so each scenario reads the outbox from disk. */
function fresh() {
  delete require.cache[modPath];
  return require(modPath);
}

const writeOutbox = (entries) =>
  fs.writeFileSync(outboxPath, JSON.stringify(entries, null, 2));
const readOutbox = () => JSON.parse(fs.readFileSync(outboxPath, 'utf8'));

const emptyDb = { data: { orders: [], products: [], tables: [] } };
const order = {
  id: 'ord-test-1', order_number: 'TEST-001', status: 'completed',
  created_at: new Date().toISOString(), total: 50000,
  items: [{ product_id: 'p1', qty: 1, price: 50000, type: 'makanan' }],
};

let pass = 0, fail = 0;
function check(name, fn) {
  try { fn(); console.log(`  ok   ${name}`); pass++; }
  catch (e) { console.log(`  FAIL ${name}\n         ${e.message}`); fail++; }
}

console.log('analytics outbox retry policy');

check('the outbox lives under GRANDPOS_DATA_DIR, never in the repo data/ dir', () => {
  writeOutbox([]);
  fresh().enqueueOrder(order, emptyDb);
  assert.ok(fs.existsSync(outboxPath),
    'enqueueOrder did not write into GRANDPOS_DATA_DIR: test runs would clobber production');
  assert.strictEqual(readOutbox().length, 1, 'order was not queued');
});

check('a failed order survives far past the old 5-attempt ceiling', () => {
  writeOutbox([]);
  fresh().enqueueOrder(order, emptyDb);
  assert.strictEqual(readOutbox().filter((e) => e.order_number === 'TEST-001').length, 1,
    'order must be queued and stay queued');
});

check('the give-up ceiling is not `attempts >= 5` anymore', () => {
  const body = fs.readFileSync(modPath, 'utf8');
  assert.ok(!/attempts\s*>=\s*5\s*\)/.test(body), 'the old attempts>=5 give-up is still present');
  assert.ok(/MAX_ATTEMPTS|GIVE_UP_AFTER_MS/.test(body), 'no wall-clock retry budget found');
});

check('backoff reaches 30 minutes instead of capping at 30 seconds', () => {
  const body = fs.readFileSync(modPath, 'utf8');
  assert.ok(/MAX_BACKOFF_MS\s*=\s*30\s*\*\s*60\s*\*\s*1000/.test(body),
    'backoff cap is not 30 minutes');
});

check('status exposes a `stuck` counter, so a dead order is never invisible', () => {
  const st = fresh().getStatus();
  assert.strictEqual(typeof st.stuck, 'number',
    'getStatus() has no `stuck` field: an undelivered order still looks delivered');
});

check('requeue revives a parked entry in place and keeps the rest of the outbox', () => {
  writeOutbox([{
    client_ref: 'ord-test-1', order_number: 'TEST-001', order,
    attempts: 7, done: true, stuck: true, error: 'not delivered within 7 days',
    createdAt: new Date().toISOString(),
  }]);

  const r = fresh().requeueAllCompleted({ data: { orders: [order], products: [], tables: [] } });

  assert.ok(r.retried >= 1, `expected the parked entry to be retried, got ${JSON.stringify(r)}`);
  const same = readOutbox().filter((e) => e.order_number === 'TEST-001');
  assert.strictEqual(same.length, 1, 'requeue must not duplicate an existing entry');
  assert.strictEqual(same[0].done, false, 'retried entry still marked done');
  assert.strictEqual(same[0].stuck, false, 'retried entry still parked as stuck');
  assert.strictEqual(same[0].attempts, 0, 'retry counters were not reset');
});

check('requeue does not wipe the synced ledger', () => {
  const body = fs.readFileSync(modPath, 'utf8');
  const fn = body.slice(body.indexOf('function requeueAllCompleted'),
                        body.indexOf('function getStatus'));
  assert.ok(!/state\.synced\s*=\s*\{\s*\}/.test(fn),
    'requeue still clears state.synced, destroying the record of what was delivered');
  assert.ok(!/outbox\s*=\s*\[\]/.test(fn), 'requeue still truncates the outbox');
});

check('a legacy `done + error` entry is treated as undelivered, not as complete', () => {
  // The exact shape the old give-up path wrote: done=true, error='max retries exceeded',
  // attempts=5. A requeue that trusts `done` skips it forever.
  writeOutbox([{
    client_ref: 'ord-legacy-1', order_number: 'LEGACY-001',
    order: { ...order, id: 'ord-legacy-1', order_number: 'LEGACY-001' },
    attempts: 5, done: true, error: 'max retries exceeded',
    createdAt: '2026-11-13T00:00:00.000Z',
  }]);

  const r = fresh().requeueAllCompleted(emptyDb);

  assert.strictEqual(r.retried, 1, `legacy failed entry was not revived: ${JSON.stringify(r)}`);
  const after = readOutbox()[0];
  assert.strictEqual(after.done, false, 'still marked done');
  assert.strictEqual(after.error, null, 'error not cleared, so it still looks delivered');
  assert.strictEqual(after.attempts, 0, 'retry counter not reset');
});

check('a ledger-confirmed delivery clears the stale error instead of crying wolf', () => {
  // The real sequence: an order failed while the database was down, was requeued, and was
  // then delivered. Its outbox entry kept attempts=5 and an error string. Without
  // reconciliation the watchdog reports it as undelivered forever and requeue re-sends it.
  const orderRef = 'ord-ledger-1';
  writeOutbox([{
    client_ref: orderRef, order_number: 'LEDGER-001',
    order: { ...order, id: orderRef, order_number: 'LEDGER-001' },
    attempts: 5, done: true, error: 'max retries exceeded',
    createdAt: '2026-11-13T00:00:00.000Z',
  }]);
  fs.writeFileSync(statePath, JSON.stringify({
    synced: { [orderRef]: { ok: true, at: '2026-11-14T05:00:00.000Z', result: {} } },
    lastRun: '2026-11-14T05:00:00.000Z',
  }));

  const st = fresh().getStatus();

  assert.strictEqual(st.stuck, 0, 'a delivered order is still counted as stuck');
  assert.strictEqual(readOutbox()[0].error, null,
    'the stale error note survived: the watchdog will report a delivered order as undelivered');
});

check('a ledger-confirmed delivery is not re-sent by requeue', () => {
  fs.writeFileSync(statePath, JSON.stringify({
    synced: { 'ord-ledger-2': { ok: true, at: '2026-11-14T05:00:00.000Z', result: {} } },
    lastRun: '2026-11-14T05:00:00.000Z',
  }));
  writeOutbox([{
    client_ref: 'ord-ledger-2', order_number: 'LEDGER-002',
    order: { ...order, id: 'ord-ledger-2', order_number: 'LEDGER-002' },
    attempts: 5, done: true, error: 'max retries exceeded',
    createdAt: '2026-11-13T00:00:00.000Z',
  }]);

  const r = fresh().requeueAllCompleted(emptyDb);

  assert.strictEqual(r.retried, 0,
    'requeue re-sent an order the ledger already recorded as delivered (duplicate risk)');
});

try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
