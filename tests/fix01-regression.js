/**
 * Fix-01 Regression Tests — P0/P1 Bug Fixes
 * 
 * Tests for:
 * - P0-C: Duplicate route handlers removed + startup duplicate-route guard
 * - P1-F: shifts/close fabricated defaults eliminated
 * - P1-G: shifts/open rejects with 409 when shift already open
 * 
 * Run: node tests/fix01-regression.js
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

console.log('=== Fix-01 Regression Tests ===\n');

// --- Load source files ---
const apiServerPath = path.join(__dirname, '..', 'api-server.js');
const allMissingRoutesPath = path.join(__dirname, '..', 'routes', 'allMissingRoutes.js');

const apiServer = fs.readFileSync(apiServerPath, 'utf8');
const allMissingRoutes = fs.readFileSync(allMissingRoutesPath, 'utf8');

console.log('--- P0-C: Duplicate route handlers removed from allMissingRoutes.js ---');

// The three shadowed duplicates should be removed
assertNotContains(allMissingRoutes, /app\.get\(\[\s*'\/api\/orders\/:id'/, 'GET /api/orders/:id duplicate removed');
assertNotContains(allMissingRoutes, /app\.patch\(\[\s*'\/api\/orders\/:id\/items'/, 'PATCH /api/orders/:id/items duplicate removed');
assertNotContains(allMissingRoutes, /app\.post\(\[\s*'\/api\/orders\/:id\/pay'/, 'POST /api/orders/:id/pay duplicate removed');

console.log('\n--- P0-C: Startup duplicate-route guard in api-server.js ---');
// Check for duplicate detection logic during route registration
assertContains(apiServer, /routeRegistry|seenRoutes|duplicate.*route|route.*already.*registered/i, 'Duplicate route registration guard present');

console.log('\n--- P1-F: shifts/close fabricated defaults eliminated ---');
// The fabricated defaults (131000, 88000, 43000, 40000, 15000, etc.) should be replaced with 0 or removed
// Use more specific patterns to avoid matching comments
assertNotContains(apiServer, /total_sales:\s*summary\.total_sales\s*\|\|\s*shift\.total_sales\s*\|\|\s*131000/, 'Fabricated total_sales default 131000 removed');
assertNotContains(apiServer, /fnb_total:\s*summary\.fnb_total\s*\|\|\s*88000/, 'Fabricated fnb_total default 88000 removed');
assertNotContains(apiServer, /retail_total:\s*summary\.retail_total\s*\|\|\s*43000/, 'Fabricated retail_total default 43000 removed');
assertNotContains(apiServer, /gross_profit_fnb:\s*summary\.gross_profit_fnb\s*\|\|\s*40000/, 'Fabricated gross_profit_fnb default 40000 removed');
assertNotContains(apiServer, /gross_profit_retail:\s*summary\.gross_profit_retail\s*\|\|\s*15000/, 'Fabricated gross_profit_retail default 15000 removed');
assertNotContains(apiServer, /order_count:\s*summary\.order_count\s*\|\|\s*shift\.orders_count\s*\|\|\s*2/, 'Fabricated order_count default 2 removed');
assertNotContains(apiServer, /by_type:\s*summary\.by_type\s*\|\|\s*\{[^}]*88000/, 'Fabricated by_type defaults removed');
assertNotContains(apiServer, /by_payment:\s*summary\.by_payment\s*\|\|\s*\{[^}]*88000/, 'Fabricated by_payment defaults removed');

// Ensure 0 defaults are used instead
assertContains(apiServer, /summary\.total_sales \|\| 0/, 'total_sales falls back to 0');
assertContains(apiServer, /summary\.order_count \|\| 0/, 'order_count falls back to 0');
assertContains(apiServer, /summary\.fnb_total \|\| 0/, 'fnb_total falls back to 0');
assertContains(apiServer, /summary\.retail_total \|\| 0/, 'retail_total falls back to 0');
assertContains(apiServer, /summary\.gross_profit_fnb \|\| 0/, 'gross_profit_fnb falls back to 0');
assertContains(apiServer, /summary\.gross_profit_retail \|\| 0/, 'gross_profit_retail falls back to 0');

console.log('\n--- P1-G: shifts/open 409 when shift already open ---');
// Check for the guard that returns 409 if shift is open (Indonesian message)
assertContains(apiServer, /Shift sudah dibuka.*409|409.*Shift sudah dibuka|res\.status\(409\)/, 'shifts/open returns 409 when shift is open');

console.log('\n--- Summary ---');
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
process.exit(failed > 0 ? 1 : 0);