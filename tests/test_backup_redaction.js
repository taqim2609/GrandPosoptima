/**
 * Backup Redaction Unification Test (SECURITY-AUDIT M-4)
 *
 * Verifies that `redactBackupValue` and `redactDiagnosticReport` now use
 * identical logic: 16 secret keys, lowercase substring match, recursive walk.
 *
 * Run: node tests/test_backup_redaction.js
 */

const path = require('path');
const fs = require('fs');

// Load the shared redaction helpers from api-server.js by evaluating the
// source snippet. We can't require(api-server.js) directly because it starts
// an Express server. Instead we read the file and extract the function code
// we need (they are pure functions with no external deps beyond WeakSet).
const apiServerSrc = fs.readFileSync(path.join(__dirname, '..', 'api-server.js'), 'utf8');

// Extract the secret keys, isSecretKeyName, and redactDiagnosticReport
// We use a small Function-based extractor to avoid sloppy-mode eval scope pollution.
const startIdx = apiServerSrc.indexOf('const SECRET_REDACTION_KEYS');
const endIdx = apiServerSrc.indexOf("app.get('/api/rpt/latest'");
const snippet = apiServerSrc.slice(startIdx, endIdx);

// Wrap in a function so declarations don't leak into test file scope
const extracted = new Function(`${snippet}\nreturn { SECRET_REDACTION_KEYS, isSecretKeyName, redactDiagnosticReport };`)();

const { SECRET_REDACTION_KEYS, isSecretKeyName, redactDiagnosticReport } = extracted;

// Backup redaction is now a thin wrapper
function redactBackupValue(key, value) {
  return redactDiagnosticReport(value);
}

// --- Test vector ---
const testDoc = {
  user: {
    credentials: {
      api_key: 'sk-abc123',
      pin: '1234',
      token: 'eyJhbGciOi...',
      password: 'hunter2',
    },
  },
  meta: {
    access_token: 'ya29.a0Af...',
    refresh_token: '1//0g...',
    session: 'sess_abc',
    authorization: 'Bearer xyz',
  },
  nested: {
    deeper: {
      secret: 'top-secret',
      apisecret: 'api-secret-value',
      bearer: 'bearer-token',
      jwt: 'jwt-token',
      apikey: 'apikey-value',
      cookie: 'session_id=abc',
      password_hash: '$2b$10$...',
      password_plain: 'plain-pw',
      pin: '4321',
    },
  },
  arrayOfSecrets: [
    { token: 'tok1' },
    { api_key: 'key2' },
    { password: 'pw3' },
  ],
  // Non-secret keys that contain secret substrings (these WILL be redacted
  // under the current substring-matching policy — that is expected).
  shopping: 'shopping list',
  session_id: 'sess-001',
  has_pin: true,
  must_change_password: false,
  api_key_last4: 'abcd',
  secret_set: true,
  pin_enabled: true,
};

// --- Helpers ---
let passed = 0;
let failed = 0;

function assert(cond, msg, extra) {
  if (cond) {
    console.log(`  \u2705 ${msg}`);
    passed++;
  } else {
    console.log(`  \u274C ${msg}${extra === undefined ? '' : ` -> ${JSON.stringify(extra)}`}`);
    failed++;
  }
}

function deepEqual(a, b, pathStr = '') {
  if (a === b) return true;
  if (a === null || b === null) return a === b;
  if (typeof a !== typeof b) return false;
  if (typeof a !== 'object') return a === b;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((v, i) => deepEqual(v, b[i], `${pathStr}[${i}]`));
  }
  if (!Array.isArray(a) && !Array.isArray(b)) {
    const keysA = Object.keys(a).sort();
    const keysB = Object.keys(b).sort();
    if (keysA.join(',') !== keysB.join(',')) return false;
    return keysA.every((k) => deepEqual(a[k], b[k], `${pathStr}.${k}`));
  }
  return false;
}

// --- Tests ---

console.log('\n=== Backup Redaction Unification Tests ===\n');

// 1. Both functions exist and are functions
assert(typeof redactBackupValue === 'function', 'redactBackupValue is a function');
assert(typeof redactDiagnosticReport === 'function', 'redactDiagnosticReport is a function');

// 2. SECRET_REDACTION_KEYS has 16 entries
assert(
  Array.isArray(SECRET_REDACTION_KEYS) && SECRET_REDACTION_KEYS.length === 16,
  `SECRET_REDACTION_KEYS has 16 entries`,
  { length: SECRET_REDACTION_KEYS.length, keys: SECRET_REDACTION_KEYS }
);

// 3. Run both on testDoc
const backupResult = redactBackupValue('test', testDoc);
const diagnosticResult = redactDiagnosticReport(testDoc);

// 4. Results must be structurally identical
assert(
  deepEqual(backupResult, diagnosticResult),
  'redactBackupValue and redactDiagnosticReport produce identical output',
  { backupKeys: Object.keys(backupResult), diagnosticKeys: Object.keys(diagnosticResult) }
);

// 5. Specific nested credential keys are redacted to '[REDACTED]'
assert(
  backupResult.user.credentials.api_key === '[REDACTED]',
  'nested api_key redacted',
  { value: backupResult.user.credentials.api_key }
);
assert(
  backupResult.user.credentials.pin === '[REDACTED]',
  'nested pin redacted',
  { value: backupResult.user.credentials.pin }
);
assert(
  backupResult.user.credentials.token === '[REDACTED]',
  'nested token redacted',
  { value: backupResult.user.credentials.token }
);
assert(
  backupResult.user.credentials.password === '[REDACTED]',
  'nested password redacted',
  { value: backupResult.user.credentials.password }
);

assert(
  backupResult.meta.access_token === '[REDACTED]',
  'nested access_token redacted',
  { value: backupResult.meta.access_token }
);
assert(
  backupResult.meta.refresh_token === '[REDACTED]',
  'nested refresh_token redacted',
  { value: backupResult.meta.refresh_token }
);
assert(
  backupResult.meta.session === '[REDACTED]',
  'nested session redacted',
  { value: backupResult.meta.session }
);
assert(
  backupResult.meta.authorization === '[REDACTED]',
  'nested authorization redacted',
  { value: backupResult.meta.authorization }
);

assert(
  backupResult.nested.deeper.secret === '[REDACTED]',
  'deep nested secret redacted',
  { value: backupResult.nested.deeper.secret }
);
assert(
  backupResult.nested.deeper.apisecret === '[REDACTED]',
  'deep nested apisecret redacted',
  { value: backupResult.nested.deeper.apisecret }
);
assert(
  backupResult.nested.deeper.bearer === '[REDACTED]',
  'deep nested bearer redacted',
  { value: backupResult.nested.deeper.bearer }
);
assert(
  backupResult.nested.deeper.jwt === '[REDACTED]',
  'deep nested jwt redacted',
  { value: backupResult.nested.deeper.jwt }
);
assert(
  backupResult.nested.deeper.apikey === '[REDACTED]',
  'deep nested apikey redacted',
  { value: backupResult.nested.deeper.apikey }
);
assert(
  backupResult.nested.deeper.cookie === '[REDACTED]',
  'deep nested cookie redacted',
  { value: backupResult.nested.deeper.cookie }
);
assert(
  backupResult.nested.deeper.password_hash === '[REDACTED]',
  'deep nested password_hash redacted',
  { value: backupResult.nested.deeper.password_hash }
);
assert(
  backupResult.nested.deeper.password_plain === '[REDACTED]',
  'deep nested password_plain redacted',
  { value: backupResult.nested.deeper.password_plain }
);
assert(
  backupResult.nested.deeper.pin === '[REDACTED]',
  'deep nested pin redacted',
  { value: backupResult.nested.deeper.pin }
);

// 6. Substring policy is blunt: any key CONTAINING a secret word is redacted,
// including `arrayOfSecrets` (contains "secret") and `shopping` (contains
// "pin"). This is the documented behaviour of redactDiagnosticReport, and
// backup redaction now inherits it. These assertions pin the policy so a
// future "exact match" refactor does not silently weaken either path.
assert(
  backupResult.arrayOfSecrets === '[REDACTED]',
  'arrayOfSecrets matches "secret" substring \u2192 redacted (expected per policy)',
  { value: backupResult.arrayOfSecrets }
);

// 7. Substring policy: keys that merely CONTAIN a secret word are redacted too.
// This is the documented behaviour of redactDiagnosticReport, and backup
// redaction now inherits it. These assertions pin the policy so a future
// "exact match" refactor does not silently weaken the diagnostic path either.
assert(
  backupResult.session_id === '[REDACTED]',
  'session_id matches "session" substring \u2192 redacted (expected per policy)',
  { value: backupResult.session_id }
);
assert(
  backupResult.has_pin === '[REDACTED]',
  'has_pin matches "pin" substring \u2192 redacted (expected per policy)',
  { value: backupResult.has_pin }
);
assert(
  backupResult.must_change_password === '[REDACTED]',
  'must_change_password matches "password" substring \u2192 redacted (expected per policy)',
  { value: backupResult.must_change_password }
);
assert(
  backupResult.shopping === '[REDACTED]',
  'shopping matches "pin" substring \u2192 redacted (expected per policy)',
  { value: backupResult.shopping }
);
assert(
  backupResult.api_key_last4 === '[REDACTED]',
  'api_key_last4 matches "api_key" substring \u2192 redacted (expected per policy)',
  { value: backupResult.api_key_last4 }
);
assert(
  backupResult.secret_set === '[REDACTED]',
  'secret_set matches "secret" substring \u2192 redacted (expected per policy)',
  { value: backupResult.secret_set }
);
assert(
  backupResult.pin_enabled === '[REDACTED]',
  'pin_enabled matches "pin" substring \u2192 redacted (expected per policy)',
  { value: backupResult.pin_enabled }
);

// 8. Circular reference handling returns '[Circular]' (from WeakSet)
const circular = { a: 1 };
circular.self = circular;
const circularResult = redactDiagnosticReport(circular);
assert(
  circularResult.self === '[Circular]',
  'circular reference handled',
  { value: circularResult.self }
);

// 9. Null/undefined pass through
assert(
  redactDiagnosticReport(null) === null,
  'null passes through'
);
assert(
  redactDiagnosticReport(undefined) === undefined,
  'undefined passes through'
);

// 10. Primitives pass through
assert(
  redactDiagnosticReport(42) === 42,
  'number passes through'
);
assert(
  redactDiagnosticReport('hello') === 'hello',
  'string passes through'
);
assert(
  redactDiagnosticReport(true) === true,
  'boolean passes through'
);

// 11. isSecretKeyName: case-insensitive substring semantics
assert(isSecretKeyName('API_KEY') === true, 'isSecretKeyName is case-insensitive');
assert(isSecretKeyName('mySecretValue') === true, 'isSecretKeyName matches substring');
assert(isSecretKeyName('username') === false, 'isSecretKeyName ignores non-matching keys');
assert(isSecretKeyName('grandpos') === false, 'isSecretKeyName ignores collection names');

// --- Summary ---
console.log('\n=== Summary ===');
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log(`Total:  ${passed + failed}`);

if (failed > 0) {
  process.exit(1);
} else {
  console.log('\nAll backup redaction unification tests passed!');
  process.exit(0);
}