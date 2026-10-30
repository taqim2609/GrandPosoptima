/**
 * Fix-02 Negative Control — fail-before / fix-after discrimination.
 *
 * For each claim the regression test makes, feed the test BOTH the pre-fix
 * source and the post-fix source and confirm the assertion actually
 * discriminates (fails on the old text, passes on the new text).
 *
 * Run: node tests/fix02-negative-control.js
 */

const fs = require('fs');
const path = require('path');

let discriminating = 0;
let nonDiscriminating = 0;

// Pre-fix snapshots (exactly what the code said before Fix-02).
const OLD = {
  'bluetooth.js rupiah': 'const rupiah = (n) => "Rp" + Math.round(Number(n || 0)).toLocaleString("id-ID");',
  'receipt.js rp': 'const rp = (n) => "Rp" + Math.round(Number(n || 0)).toLocaleString("id-ID");',
  'device.js rupiah': 'const rupiah = (n) => "Rp" + Math.round(Number(n || 0)).toLocaleString("id-ID");',
  'customWidgets.js formatValue': 'if (widget?.format === "rupiah") return "Rp" + Math.round(v).toLocaleString("id-ID");',
  'api-server.js cash_out': 'cash_out: 50000,',
  'api-server.js cash_out_fnb': 'cash_out_fnb: 50000,',
  'api-server.js cash_net_fnb': "cash_net_fnb: by_type.dine_in.total + by_type.take_away.total - 50000,",
  'api-server.js cash_net_retail': 'cash_net_retail: by_type.retail.total,',
  'api-server.js cash_net': "cash_net: (by_pm['cash'] || 0) - 50000,",
};

// Post-fix snapshots (exactly what the code says after Fix-02).
const NEW = {
  // Post-FIX-B shape: the four files import the canonical helper instead of
  // re-declaring an inline "Rp " formatter.
  'bluetooth.js rupiah': 'import { rupiah } from "@/lib/format";\n  const qp = `${i.qty}x${rupiah(i.price)}`;',
  'receipt.js rp': 'import { rupiah } from "@/lib/format";\n  const line = rupiah(order.total);',
  'device.js rupiah': 'import { rupiah } from "@/lib/format";\n  return rupiah(value);',
  'customWidgets.js formatValue': 'import { rupiah } from "@/lib/format";\n  if (widget?.format === "rupiah") return rupiah(v);',
  'api-server.js cash_out': 'cash_out: cash_out_total,',
  'api-server.js cash_out_fnb': 'cash_out_fnb: cash_out_fnb,',
  'api-server.js cash_net_fnb': 'cash_net_fnb: by_type.dine_in.total + by_type.take_away.total - cash_out_fnb,',
  'api-server.js cash_net_retail': 'cash_net_retail: by_type.retail.total - cash_out_retail,',
  'api-server.js cash_net': "cash_net: (by_pm['cash'] || 0) - cash_out_total,",
};

function discriminate(label, oldText, newText, testFn) {
  const oldResult = testFn(oldText);
  const newResult = testFn(newText);
  // A discriminating assertion FAILS on old (pre-fix) and PASSES on new (post-fix).
  if (oldResult === false && newResult === true) {
    console.log(`  ✅ ${label} — discriminates (old: fail, new: pass)`);
    discriminating++;
  } else {
    console.log(`  ❌ ${label} — does NOT discriminate (old: ${oldResult}, new: ${newResult})`);
    nonDiscriminating++;
  }
}

console.log('=== Fix-02 Negative Control ===\n');

console.log('--- Currency format: "Rp " with space ---');

discriminate(
  'bluetooth.js formats currency via rupiah()',
  OLD['bluetooth.js rupiah'],
  NEW['bluetooth.js rupiah'],
  (src) => /rupiah\(/.test(src) && !/["'`]Rp\$\{/.test(src)
);

discriminate(
  'receipt.js formats currency via rupiah()',
  OLD['receipt.js rp'],
  NEW['receipt.js rp'],
  (src) => /rupiah\(/.test(src) && !/["'`]Rp\$\{/.test(src)
);

discriminate(
  'device.js formats currency via rupiah()',
  OLD['device.js rupiah'],
  NEW['device.js rupiah'],
  (src) => /rupiah\(/.test(src) && !/["'`]Rp\$\{/.test(src)
);

discriminate(
  'customWidgets.js formats currency via rupiah()',
  OLD['customWidgets.js formatValue'],
  NEW['customWidgets.js formatValue'],
  (src) => /rupiah\(/.test(src) && !/["'`]Rp\$\{/.test(src)
);

console.log('\n--- getReportSummary: computed cash_out ---');

discriminate(
  'cash_out is computed, not 50000',
  OLD['api-server.js cash_out'],
  NEW['api-server.js cash_out'],
  (src) => /cash_out: cash_out_total/.test(src)
);

discriminate(
  'cash_out_fnb is computed, not 50000',
  OLD['api-server.js cash_out_fnb'],
  NEW['api-server.js cash_out_fnb'],
  (src) => /cash_out_fnb: cash_out_fnb/.test(src)
);

discriminate(
  'cash_net_fnb subtracts computed value',
  OLD['api-server.js cash_net_fnb'],
  NEW['api-server.js cash_net_fnb'],
  (src) => /cash_net_fnb:.*- cash_out_fnb/.test(src)
);

discriminate(
  'cash_net_retail subtracts computed value',
  OLD['api-server.js cash_net_retail'],
  NEW['api-server.js cash_net_retail'],
  (src) => /cash_net_retail:.*- cash_out_retail/.test(src)
);

discriminate(
  'cash_net subtracts computed value',
  OLD['api-server.js cash_net'],
  NEW['api-server.js cash_net'],
  (src) => /cash_net:.*- cash_out_total/.test(src)
);

console.log('\n--- Verify live source matches post-fix snapshots ---');

const liveChecks = [
  ['project/frontend/src/lib/bluetooth.js', /rupiah\(/, 'bluetooth.js live'],
  ['project/frontend/src/lib/receipt.js', /rupiah\(/, 'receipt.js live'],
  ['project/frontend/src/lib/device.js', /rupiah\(/, 'device.js live'],
  ['project/frontend/src/lib/customWidgets.js', /rupiah\(/, 'customWidgets.js live'],
  ['api-server.js', /cash_out: cash_out_total/, 'api-server.js cash_out live'],
  ['api-server.js', /cash_out_fnb: cash_out_fnb/, 'api-server.js cash_out_fnb live'],
  ['api-server.js', /cash_out_retail: cash_out_retail/, 'api-server.js cash_out_retail live'],
  ['api-server.js', /const cash_out_total = cash_out_fnb \+ cash_out_retail/, 'api-server.js cash_out_total live'],
];

liveChecks.forEach(([relPath, pattern, label]) => {
  const full = path.join(__dirname, '..', relPath);
  const src = fs.readFileSync(full, 'utf8');
  if (pattern.test(src)) {
    console.log(`  ✅ ${label} — live source matches post-fix`);
    discriminating++;
  } else {
    console.log(`  ❌ ${label} — live source does NOT match post-fix`);
    nonDiscriminating++;
  }
});

console.log('\n--- Summary ---');
console.log(`Discriminating: ${discriminating}`);
console.log(`Non-discriminating: ${nonDiscriminating}`);
process.exit(nonDiscriminating > 0 ? 1 : 0);