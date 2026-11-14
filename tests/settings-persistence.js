#!/usr/bin/env node
/**
 * Guards settings persistence.
 *
 * The bug: the snapshot stored `settings` as an array of `{_id, ...}`, while every handler
 * in api-server.js treats it as an object (`db.settings.business`, `db.settings.wa`).
 * Assigning `db.settings.ui = {...}` therefore hung a property off an Array, which
 * JSON.stringify silently drops -- so every settings save returned 200 and vanished on the
 * next restart. Reads were equally broken: the seeded object was replaced by an array, so
 * GET returned "" for business/ui/features.
 *
 * The fix normalises at the load boundary, so the file on disk becomes the shape the code
 * already expects. This test pins both directions.
 *
 *   node tests/settings-persistence.js
 */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { normaliseSettings, loadSnapshot, saveSnapshot } = require('../lib/db-snapshot.js');

let pass = 0, fail = 0;
const check = (name, fn) => {
  try { fn(); console.log(`  ok   ${name}`); pass++; }
  catch (e) { console.log(`  FAIL ${name}\n         ${e.message}`); fail++; }
};

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'settings-persist-'));
const file = path.join(tmp, 'pos-db.json');
const write = (data) => fs.writeFileSync(file, JSON.stringify(data));

console.log('settings persistence');

check('a collection-shaped settings array becomes an object keyed by _id', () => {
  const out = normaliseSettings([
    { _id: 'wa', api_key: 'k' },
    { _id: 'business', outlet_name: 'Toko' },
  ]);
  assert.strictEqual(Array.isArray(out), false, 'settings is still an array');
  assert.strictEqual(out.wa.api_key, 'k');
  assert.strictEqual(out.business.outlet_name, 'Toko');
});

check('an already-object settings value is left alone', () => {
  const input = { wa: { api_key: 'k' } };
  assert.strictEqual(normaliseSettings(input), input);
});

check('settings can be read as an object after loading a legacy snapshot', () => {
  write({ version: 1, saved_at: 'x', data: {
    settings: [{ _id: 'business', outlet_name: 'Toko Lama' }, { _id: 'ui', pos: { theme: 'dark' } }],
    products: [],
  }});
  const db = { settings: { business: { outlet_name: 'seed' } } };
  loadSnapshot(db, { filePath: file });
  assert.strictEqual(Array.isArray(db.settings), false, 'loadSnapshot left settings as an array');
  assert.strictEqual(db.settings.business.outlet_name, 'Toko Lama', 'stored value did not win over seed');
  assert.strictEqual(db.settings.ui.pos.theme, 'dark');
});

check('a settings write survives a save/load round trip', () => {
  // Exactly what PUT /api/settings/business does: assign a property, then persist.
  write({ version: 1, saved_at: 'x', data: { settings: [{ _id: 'business', outlet_name: 'Lama' }] } });
  const db = {};
  loadSnapshot(db, { filePath: file });
  db.settings.business = { ...db.settings.business, outlet_name: 'Baru' };
  saveSnapshot(db, { filePath: file });

  const reread = {};
  loadSnapshot(reread, { filePath: file });
  assert.strictEqual(reread.settings.business.outlet_name, 'Baru',
    'the setting was lost across a restart -- every settings save returns 200 but writes nothing');
});

check('persisting settings keeps every sibling collection', () => {
  write({ version: 1, saved_at: 'x', data: {
    settings: [{ _id: 'wa', api_key: 'k' }, { _id: 'business', outlet_name: 'Lama' }],
  }});
  const db = {};
  loadSnapshot(db, { filePath: file });
  db.settings.business.outlet_name = 'Baru';
  saveSnapshot(db, { filePath: file });

  const reread = {};
  loadSnapshot(reread, { filePath: file });
  assert.strictEqual(reread.settings.wa.api_key, 'k', 'the wa settings were dropped');
  assert.strictEqual(reread.settings.business.outlet_name, 'Baru');
});

try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
