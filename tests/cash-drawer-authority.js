/**
 * Regression: drawer-cash figures are derived, never fabricated.
 *
 * Guards three real defects found while auditing the cash paths:
 *  1. `Shift.jsx` split total cash 70/30 between F&B and retail when the server
 *     omitted a per-channel figure — a ratio nothing in the data supported.
 *  2. `pos_get_shift_status` read `shift.starting_cash`, a field this data model
 *     never writes, so the opening float was always 0.
 *  3. `pos_get_shift_status` swept every historical order without a `shift_id`
 *     into the open drawer, inflating expected cash by millions.
 *
 * Run: node tests/cash-drawer-authority.js
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

let passed = 0;
let failed = 0;

function assert(cond, msg) {
  if (cond) {
    console.log(`  OK   ${msg}`);
    passed++;
  } else {
    console.log(`  FAIL ${msg}`);
    failed++;
  }
}

console.log('--- frontend: no invented per-channel cash split ---');
const SHIFT_JSX = read('project/frontend/src/pages/Shift.jsx');
assert(!/summary\?\.by_payment\?\.cash \* 0\.7/.test(SHIFT_JSX),
  'Shift.jsx no longer splits total cash 70/30');
assert(!/summary\?\.by_payment\?\.cash \* 0\.3/.test(SHIFT_JSX),
  'Shift.jsx no longer splits total cash 70/30 (retail leg)');
assert(/const expSalesCashFnb = Number\(summary\?\.cash_sales_fnb \?\? 0\) \|\| 0;/.test(SHIFT_JSX),
  'Shift.jsx takes F&B cash sales from the summary, defaulting to 0');
assert(/const expSalesCashRetail = Number\(summary\?\.cash_sales_retail \?\? 0\) \|\| 0;/.test(SHIFT_JSX),
  'Shift.jsx takes retail cash sales from the summary, defaulting to 0');

console.log('--- MCP: opening float comes from fields the model writes ---');
const MCP = read('routes/mcpServer.js');
assert(/opening_cash_fnb/.test(MCP) && /opening_cash_retail/.test(MCP),
  'expected drawer reads opening_cash_fnb/opening_cash_retail');
assert(/shift\.start_cash/.test(MCP),
  'expected drawer falls back to start_cash');
assert(!/const startingCash = Number\(shift\.starting_cash\) \|\| 0;/.test(MCP),
  'plain `starting_cash`-only read is gone');

console.log('--- MCP: unattributed orders are bounded by the shift window ---');
assert(!/\(!o\.shift_id && shift\.status === 'open'\)/.test(MCP),
  'no longer sweeps every historical order without a shift_id');
assert(/inShiftWindow/.test(MCP),
  'unattributed orders are filtered by the shift time window');
assert(/const shiftStart = Date\.parse\(shift\.opened_at/.test(MCP),
  'shift start is derived from opened_at');
assert(/const shiftEnd = shift\.closed_at \? \(Date\.parse\(shift\.closed_at\) \|\| Infinity\) : Infinity;/.test(MCP),
  'open shifts are bounded at +Infinity');

console.log('--- both cash vocabularies count as drawer money ---');
assert(/m === 'cash' \|\| m === 'tunai'/.test(MCP),
  'MCP cash predicate accepts cash and tunai');
const missingPredicate = !/isCashOrder/.test(MCP);
assert(!missingPredicate, 'MCP uses a single shared isCashOrder predicate');

console.log(`\nPassed: ${passed}`);
console.log(`Failed: ${failed}`);
process.exit(failed ? 1 : 0);