/**
 * Fix-05 regression tests — server authority over money (Review-02 P0-B / P2)
 *
 * Guards against a regression where the POS API trusts totals, prices, discounts or
 * cash splits supplied by the client, or where the reporting layer goes back to
 * hard-coded numbers instead of the ledger.
 *
 * Run: node tests/fix05-server-authority.js
 */

const fs = require('fs');
const path = require('path');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'api-server.js'), 'utf8');

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

console.log('--- P0-B: totals are computed server-side ---');
assert(!/req\.body\.subtotal !== undefined \? req\.body\.subtotal/.test(SRC),
  'subtotal is not taken from the request body');
assert(!/req\.body\.total !== undefined \? req\.body\.total/.test(SRC),
  'total is not taken from the request body');
assert(/const itemsSubtotal = Math\.round/.test(SRC),
  'subtotal is summed from the resolved lines');
assert(/const known = Boolean\(prod\.id\)/.test(SRC),
  'line price/cost come from the product catalogue');
assert(/Math\.min\(Math\.max\(rawDiscountValue, 0\), 100\)/.test(SRC),
  'percent discount is clamped to 0..100');
assert(/discount = Math\.min\(discount, itemsSubtotal\)/.test(SRC),
  'discount can never exceed the subtotal');

console.log('--- P2: no fabricated cash split or report numbers ---');
assert(!/summary\.by_payment\?\.cash \* 0\.7/.test(SRC),
  'the arbitrary 70/30 cash split is gone');
assert(/const cash_sales_fnb = Number\(summary\.cash_sales_fnb \?\? 0\) \|\| 0;/.test(SRC),
  'per-channel cash sales come from the summary');
assert(!/\{ date: '2026-09-1[0-9]', total: [0-9]+ \}/.test(SRC),
  'the hard-coded 2026-09 chart series is gone');
assert(/chart_data: buildDailySeries\(targetDate, 7\)/.test(SRC),
  'chart data is derived from the order ledger');
assert(!/res\.json\(\{ revenue: 131000/.test(SRC),
  'the constant /reports/profit payload is gone');
assert(!/const top_products = top\.length > 0 \? top : db\.products\.slice/.test(SRC),
  'top_products no longer invents 12 units per product on an empty day');

console.log('--- P2: PATCH items keeps discount and service tax ---');
assert(/order\.discount = discount;/.test(SRC) && /order\.service_tax = serviceTax;/.test(SRC),
  'PATCH /orders/:id/items recomputes discount and service tax');

console.log('\n--- Summary ---');
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
process.exit(failed ? 1 : 0);
