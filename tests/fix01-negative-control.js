/**
 * Fix-01 negative control — proves the regression test actually discriminates.
 *
 * For each assertion in tests/fix01-regression.js this script re-runs the SAME
 * check against the pre-patch source taken from `git show HEAD:<path>` and
 * expects it to FAIL (bug present), then against the working-tree source and
 * expects it to PASS (bug fixed). A test that passes on both sides would be
 * worthless; this file is what makes "19/19 passed" mean something.
 *
 * Nothing here mutates the working tree — the pre-patch sources are read out of
 * git into memory.
 */

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const REPO = path.join(__dirname, '..');

// Baseline commit = the last commit BEFORE Fix-01 landed. Using `HEAD` made this
// control silently useless once Fix-01 was committed: HEAD and the working tree became
// identical, so every check "passed on both sides" and the control stopped
// discriminating. Pin the pre-fix revision explicitly.
const PRE_FIX_REV = process.env.FIX01_BASELINE || '8de8958';

function headSource(relPath) {
  return execFileSync('git', ['show', `${PRE_FIX_REV}:${relPath}`], {
    cwd: REPO,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
}

function workSource(relPath) {
  return fs.readFileSync(path.join(REPO, relPath), 'utf8');
}

let rows = [];
function check(label, relPath, pattern, expectPre, expectPost) {
  const pre = headSource(relPath);
  const post = workSource(relPath);
  const preHit = pattern.test(pre);
  const postHit = pattern.test(post);
  // `expectPre/expectPost` are the DESIRED states:
  //   expectPre  === true  -> pattern SHOULD be present before the fix (bug present)
  //   expectPost === true  -> pattern SHOULD be present after the fix  (bug gone / guard added)
  const preOk = preHit === expectPre;
  const postOk = postHit === expectPost;
  rows.push({ label, preHit, postHit, preOk, postOk });
}

console.log('=== Fix-01 negative control (fail-before / fix-after) ===');
console.log('pre  = source at HEAD (before Fix-01), post = working tree (after Fix-01)\n');

// --- P0-C: shadowed duplicate order handlers in routes/allMissingRoutes.js ---
check(
  'GET /api/orders/:id shadow copy',
  'routes/allMissingRoutes.js',
  /app\.get\(\[\s*'\/api\/orders\/:id'/,
  true,  // present before fix
  false  // gone after fix
);
check(
  'PATCH /api/orders/:id/items shadow copy',
  'routes/allMissingRoutes.js',
  /app\.patch\(\[\s*'\/api\/orders\/:id\/items'/,
  true,
  false
);
check(
  'POST /api/orders/:id/pay shadow copy',
  'routes/allMissingRoutes.js',
  /app\.post\(\[\s*'\/api\/orders\/:id\/pay'/,
  true,
  false
);

// --- P0-C: startup duplicate-route guard ---
check(
  'duplicate-route guard exists',
  'api-server.js',
  /seenRoutes/,
  false, // absent before fix
  true   // present after fix
);

// --- P1-F: fabricated shift-close defaults ---
check(
  'shifts/close fabricated total_sales 131000',
  'api-server.js',
  /total_sales:\s*summary\.total_sales\s*\|\|\s*shift\.total_sales\s*\|\|\s*131000/,
  true,
  false
);
check(
  'shifts/close fabricated order_count 2',
  'api-server.js',
  /order_count:\s*summary\.order_count\s*\|\|\s*shift\.orders_count\s*\|\|\s*2/,
  true,
  false
);
check(
  'shifts/close fabricated by_type breakdown',
  'api-server.js',
  /by_type:\s*summary\.by_type\s*\|\|\s*\{[^}]*88000/,
  true,
  false
);
check(
  'shifts/close total_sales falls back to 0',
  'api-server.js',
  /total_sales:\s*summary\.total_sales\s*\|\|\s*0/,
  false,
  true
);

// --- P1-G: shifts/open double-open guard ---
check(
  'shifts/open 409 guard',
  'api-server.js',
  /res\.status\(409\)/,
  false,
  true
);

let fail = 0;
console.log('label'.padEnd(48) + 'pre-hit  post-hit  verdict');
console.log('-'.repeat(90));
for (const r of rows) {
  const ok = r.preOk && r.postOk;
  if (!ok) fail++;
  console.log(
    r.label.padEnd(48) +
      String(r.preHit).padEnd(9) +
      String(r.postHit).padEnd(10) +
      (ok ? 'OK (discriminates)' : 'BAD (test does not discriminate)')
  );
}

console.log('\n' + (rows.length - fail) + '/' + rows.length + ' controls discriminate');
process.exit(fail === 0 ? 0 : 1);
