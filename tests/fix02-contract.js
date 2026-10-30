/**
 * Fix-02 Contract Alignment Regression Tests
 *
 * Tests for:
 * - Currency format canonicalization (Rp with space) across frontend lib files
 * - getReportSummary fabricated cash_out defaults eliminated (computed from transactions)
 *
 * Run: node tests/fix02-contract.js
 */

const fs = require('fs');
const path = require('path');

let passed = 0;
let failed = 0;

function assert(cond, msg) {
  if (cond) {
    console.log(`  ✅ ${msg}`);
    passed++;
  } else {
    console.log(`  ❌ ${msg}`);
    failed++;
  }
}

function assertNotContains(source, pattern, msg) {
  const found = pattern.test(source);
  if (!found) {
    console.log(`  ✅ ${msg}`);
    passed++;
  } else {
    console.log(`  ❌ ${msg} (found match)`);
    failed++;
  }
}

function assertContains(source, pattern, msg) {
  const found = pattern.test(source);
  if (found) {
    console.log(`  ✅ ${msg}`);
    passed++;
  } else {
    console.log(`  ❌ ${msg} (not found)`);
    failed++;
  }
}

console.log('=== Fix-02 Contract Alignment Tests ===\n');

// --- Load source files ---
const bluetoothPath = path.join(__dirname, '..', 'project', 'frontend', 'src', 'lib', 'bluetooth.js');
const receiptPath = path.join(__dirname, '..', 'project', 'frontend', 'src', 'lib', 'receipt.js');
const devicePath = path.join(__dirname, '..', 'project', 'frontend', 'src', 'lib', 'device.js');
const customWidgetsPath = path.join(__dirname, '..', 'project', 'frontend', 'src', 'lib', 'customWidgets.js');
const formatPath = path.join(__dirname, '..', 'project', 'frontend', 'src', 'lib', 'format.js');
const apiServerPath = path.join(__dirname, '..', 'api-server.js');

const bluetooth = fs.readFileSync(bluetoothPath, 'utf8');
const receipt = fs.readFileSync(receiptPath, 'utf8');
const device = fs.readFileSync(devicePath, 'utf8');
const customWidgets = fs.readFileSync(customWidgetsPath, 'utf8');
const format = fs.readFileSync(formatPath, 'utf8');
const apiServer = fs.readFileSync(apiServerPath, 'utf8');

console.log('--- Currency Format Canonicalization (Rp with space) ---');

// Canonical reference: format.js rupiah() uses "Rp "
assertContains(format, /export const rupiah = \(n\) =>\s*["']Rp\s+["']/, 'format.js rupiah() is canonical "Rp " (with space)');

// FIX-B consolidated the duplicated formatters into lib/format.js:rupiah(). The four
// files below no longer define their own `Rp ` literal — they import the canonical
// helper. Asserting the old inline literal made this suite fail on correct code, so the
// contract is now: each file formats currency through rupiah(), and rupiah() is the only
// place that spells the prefix.
assertContains(bluetooth, /rupiah\(/, 'bluetooth.js formats currency via rupiah()');
assertContains(receipt, /rupiah\(/, 'receipt.js formats currency via rupiah()');
assertContains(device, /rupiah\(/, 'device.js formats currency via rupiah()');
assertContains(customWidgets, /rupiah\(/, 'customWidgets.js formats currency via rupiah()');
// No file may reintroduce a bare "Rp" prefix without the space.
for (const [name, src] of [['bluetooth.js', bluetooth], ['receipt.js', receipt], ['device.js', device], ['customWidgets.js', customWidgets]]) {
  assertNotContains(src, /["'`]Rp\$\{/, `${name} does not build "Rp" without a space`);
}

// Ensure no "Rp" without space in these files (the old pattern)
assertNotContains(bluetooth, /const rupiah = \(n\) => ["']Rp["']/, 'bluetooth.js no longer uses "Rp" without space');
assertNotContains(receipt, /const rp = \(n\) => ["']Rp["']/, 'receipt.js no longer uses "Rp" without space');
assertNotContains(device, /const rupiah = \(n\) => ["']Rp["']/, 'device.js no longer uses "Rp" without space');
assertNotContains(customWidgets, /return ["']Rp["'] \+ Math\.round/, 'customWidgets.js no longer uses "Rp" without space');

console.log('\n--- getReportSummary: Fabricated cash_out defaults eliminated ---');

// The old fabricated defaults should be removed
assertNotContains(apiServer, /cash_out:\s*50000/, 'Fabricated cash_out: 50000 removed');
assertNotContains(apiServer, /cash_out_fnb:\s*50000/, 'Fabricated cash_out_fnb: 50000 removed');
assertNotContains(apiServer, /cash_out_retail:\s*0\s*,\s*cash_sales/, 'cash_out_retail now uses computed value (not hardcoded 0)');

// The -50000 subtractions should be replaced with computed variables
assertNotContains(apiServer, /cash_net_fnb:.*- 50000/, 'cash_net_fnb no longer subtracts hardcoded 50000');
assertNotContains(apiServer, /cash_net_retail:.*- 50000/, 'cash_net_retail no longer subtracts hardcoded 50000');
assertNotContains(apiServer, /cash_net:.*\(by_pm\['cash'\] \|\| 0\) - 50000/, 'cash_net no longer subtracts hardcoded 50000');

// New computed cash_out logic should be present
assertContains(apiServer, /const cashTxs = db\.cashTransactions \|\| \[\];/, 'getReportSummary reads cashTransactions');
assertContains(apiServer, /const cash_out_fnb = cashTxs\.filter\(\(t\) => t\.type === 'out' && \(t\.scope \|\| 'fnb'\) === 'fnb'\)\.reduce\(\(s, t\) => s \+ \(Number\(t\.amount\) \|\| 0\), 0\)/, 'cash_out_fnb computed from F&B scope cash transactions');
assertContains(apiServer, /const cash_out_retail = cashTxs\.filter\(\(t\) => t\.type === 'out' && t\.scope === 'retail'\)\.reduce\(\(s, t\) => s \+ \(Number\(t\.amount\) \|\| 0\), 0\)/, 'cash_out_retail computed from retail scope cash transactions');
assertContains(apiServer, /const cash_out_total = cash_out_fnb \+ cash_out_retail/, 'cash_out_total is sum of fnb and retail');

// Return object should reference computed variables
assertContains(apiServer, /cash_out: cash_out_total/, 'cash_out uses computed total');
assertContains(apiServer, /cash_out_fnb: cash_out_fnb/, 'cash_out_fnb uses computed fnb');
assertContains(apiServer, /cash_out_retail: cash_out_retail/, 'cash_out_retail uses computed retail');
assertContains(apiServer, /cash_net_fnb:.*- cash_out_fnb/, 'cash_net_fnb subtracts computed cash_out_fnb');
assertContains(apiServer, /cash_net_retail:.*- cash_out_retail/, 'cash_net_retail subtracts computed cash_out_retail');
assertContains(apiServer, /cash_net:.*- cash_out_total/, 'cash_net subtracts computed cash_out_total');

console.log('\n--- Summary ---');
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
process.exit(failed > 0 ? 1 : 0);