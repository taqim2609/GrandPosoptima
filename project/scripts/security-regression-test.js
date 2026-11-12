/**
 * GrandPOS Security Regression Test Suite
 * Tests for Review-04 security hardening patches
 * Run: node project/scripts/security-regression-test.js
 */

const fs = require('fs');
const path = require('path');

const API_SERVER_PATH = path.join(__dirname, '../../api-server.js');

let passed = 0;
let failed = 0;
const failures = [];

function assert(condition, message) {
  if (condition) {
    console.log(`  ✓ ${message}`);
    passed++;
  } else {
    console.log(`  ✗ ${message}`);
    failed++;
    failures.push(message);
  }
}

function assertContains(source, pattern, message) {
  const found = pattern.test(source);
  assert(found, message);
}

function assertNotContains(source, pattern, message) {
  const found = pattern.test(source);
  assert(!found, message);
}

// Load api-server.js source
const source = fs.readFileSync(API_SERVER_PATH, 'utf8');

console.log('\n=== GrandPOS Security Regression Tests ===\n');

console.log('--- R-AUTH: Authentication & Authorization ---');

// 1. Rate limiter constants and functions
assertContains(source, /const RATE_LIMIT_MAX = 10;/, 'RATE_LIMIT_MAX = 10');
assertContains(source, /const RATE_LIMIT_WINDOW_MS = 15 \* 60 \* 1000;/, 'RATE_LIMIT_WINDOW_MS = 15 min');
assertContains(source, /const rateLimitStore = new Map\(\);/, 'rateLimitStore Map initialized');
assertContains(source, /function rateLimitKey\(req, prefix = ''\)/, 'rateLimitKey function');
assertContains(source, /function checkRateLimit\(key\)/, 'checkRateLimit function');
assertContains(source, /function createRateLimiter\(prefix\)/, 'createRateLimiter factory');

// 2. Rate limiter applied to auth endpoints
assertContains(source, /createRateLimiter\('login'\)/, 'Rate limiter on /api/auth/login');
assertContains(source, /createRateLimiter\('login-pin'\)/, 'Rate limiter on /api/auth/login-pin');
assertContains(source, /createRateLimiter\('verify-pin'\)/, 'Rate limiter on /api/auth/verify-pin');

// 3. bcrypt import and password helpers
assertContains(source, /const bcrypt = require\('bcryptjs'\)/, 'bcryptjs imported');
assertContains(source, /const BCRYPT_ROUNDS = 10;/, 'BCRYPT_ROUNDS = 10');
assertContains(source, /function hashPassword\(plain\)/, 'hashPassword function');
assertContains(source, /function verifyPassword\(plain, user\)/, 'verifyPassword function');
assertContains(source, /bcrypt\.hashSync\(plain, BCRYPT_ROUNDS\)/, 'hashPassword uses bcrypt.hashSync');
assertContains(source, /bcrypt\.compareSync\(plain, user\.password_hash\)/, 'verifyPassword uses bcrypt.compareSync');
assertContains(source, /Legacy fallback: plaintext password/, 'Legacy plaintext fallback documented');
assertContains(source, /user\.password_hash = hashPassword\(plain\);/, 'Auto-migration to bcrypt on legacy verify');
assertContains(source, /delete user\.password_plain;/, 'Legacy plaintext cleared after migration');

// 4. Removed over-broad 'taqim' substring owner match (not in code, only in comment which was rewritten)
assertNotContains(source, /cleanUsername\.includes\(['"]taqim['"]\)/, 'No cleanUsername.includes("taqim") in code');
assertNotContains(source, /username\.includes\(['"]taqim['"]\)/, 'No username.includes("taqim") in code');
assertNotContains(source, /email\.includes\(['"]taqim['"]\)/, 'No email.includes("taqim") in code');
assertNotContains(source, /name\.includes\(['"]taqim['"]\)/, 'No name.includes("taqim") in code');
assertContains(source, /cleanUsername === 'taqim2609'/, 'Exact match: cleanUsername === "taqim2609"');
assertContains(source, /username === 'taqim2609'/, 'Exact match: username === "taqim2609"');
assertContains(source, /email === 'taqim2609@gmail\.com'/, 'Exact match: email === "taqim2609@gmail.com"');
assertContains(source, /substring[\s\S]*spaced alias[\s\S]*over-promoted/i, 'Comment documents removal of substring match');

// 5. isUserSuperAdmin and requireAdmin/requireSuperAdmin use only is_superadmin
assertContains(source, /const isSuper = Boolean\(req\.user\.is_superadmin\);/, 'requireAdmin uses is_superadmin');
assertContains(source, /const isSuper = Boolean\(req\.user\.is_superadmin\);[\s\S]*requireSuperAdmin/, 'requireSuperAdmin uses is_superadmin');
assertContains(source, /const isSuper = isUserSuperAdmin\(user\);/, 'generateToken uses isUserSuperAdmin');

console.log('\n--- R-CFG: Configuration & CORS ---');

// 6. CORS warning in production
assertContains(source, /const CORS_STRICT = CORS_ALLOWED_ORIGINS\.length === 0 && process\.env\.NODE_ENV === 'production'/, 'CORS_ORIGINS strict check in production');
assertContains(source, /console\.warn[\s\S]*CORS_ORIGINS is not set/, 'CORS production warning logged');
assertContains(source, /if \(!origin\) return callback\(null, true\)/, 'same-origin requests still served');

console.log('\n--- R-RBAC: Settings Endpoint Protection ---');

// 7. requireAdmin on mutating settings endpoints
const settingsMutators = [
  { endpoint: '/api/settings/outlet', method: 'put' },
  { endpoint: '/api/settings/rbac', method: 'put' },
  { endpoint: '/api/settings/business', method: 'put' },
  { endpoint: '/api/settings/ui', method: 'put' },
  { endpoint: '/api/settings/features', method: 'put' },
  { endpoint: '/api/settings/report', method: 'put' },
  { endpoint: '/api/settings/void', method: 'put' },
  { endpoint: '/api/settings/wa-templates', method: 'put' },
  { endpoint: '/api/settings/shopping', method: 'put' },
  // Landing-page settings moved out of P1A into the FastAPI service (R-22/D2):
  // /api/landing/config now lives in backend-landing-page/app/api.py behind
  // Depends(require_key). It is no longer a P1A route, so asserting requireAdmin
  // here would test a handler that does not exist.
  { endpoint: '/api/settings/dashboard', method: 'put' },
  { endpoint: '/api/settings/platform', method: 'put' },
  { endpoint: '/api/settings/platform/logo', method: 'post' },
  { endpoint: '/api/custom-widgets', method: 'post' }
];

for (const { endpoint, method } of settingsMutators) {
  const escaped = endpoint.replace(/\//g, '\\/');
  const pattern = new RegExp(`app\\.${method}\\(['"\\[].*${escaped}.*requireAdmin`);
  assertContains(source, pattern, `requireAdmin on ${method.toUpperCase()} ${endpoint}`);
}

console.log('\n--- R-DATA: Backup/Restore Safety ---');

// 8. Prototype pollution guard in backup import
assertContains(source, /const RESTORE_COLLECTION_NAME/, 'RESTORE_COLLECTION_NAME constant declared');
assertContains(source, /RESTORE_COLLECTION_NAME\.test\(collName\)/, 'Collection name validated against regex');
assertContains(source, /Entri dilewati \(nama koleksi tidak aman\)/, 'Unsafe collection name logged and skipped');
assertContains(source, /RESTORE_BLOCKED_COLLECTIONS.*new Set\(.*users.*\)/, 'users collection blocked from restore');
assertContains(source, /RESTORE_MAX_COLLECTIONS = 80;/, 'Max collections cap at 80');

// 9. Backup export redacts secrets (SECURITY-AUDIT M-4: unified with diagnostic redaction)
assertNotContains(source, /BACKUP_SECRET_FIELDS/, 'Legacy BACKUP_SECRET_FIELDS constant removed');
assertContains(source, /function redactBackupValue\(key, value\)/, 'redactBackupValue function');
assertContains(source, /function redactBackupValue\(key, value\)\s*\{\s*return redactDiagnosticReport\(value\);/, 'redactBackupValue delegates to redactDiagnosticReport');
assertContains(source, /credentials_redacted: SECRET_REDACTION_KEYS/, 'Backup metadata reports the unified key list');

console.log('\n--- R-LOG: Diagnostic Report Redaction ---');

// 10. Diagnostic report redaction
assertContains(source, /function redactDiagnosticReport\(obj/, 'redactDiagnosticReport function');
assertContains(source, /const SECRET_REDACTION_KEYS = \[/, 'Shared secret key list declared');
assertContains(source, /'password', 'password_plain', 'password_hash', 'pin', 'token'/, 'Secret keys list includes password family');
assertContains(source, /SECRET_REDACTION_KEYS[\s\S]{0,400}'token'/, 'Secret keys list includes token');
assertContains(source, /SECRET_REDACTION_KEYS[\s\S]{0,400}'api_key'/, 'Secret keys list includes api_key');
assertContains(source, /SECRET_REDACTION_KEYS[\s\S]{0,400}'secret'/, 'Secret keys list includes secret');
assertContains(source, /SECRET_REDACTION_KEYS[\s\S]{0,400}'authorization'/, 'Secret keys list includes authorization');
assertContains(source, /SECRET_REDACTION_KEYS[\s\S]{0,400}'cookie'/, 'Secret keys list includes cookie');
assertContains(source, /SECRET_REDACTION_KEYS[\s\S]{0,400}'session'/, 'Secret keys list includes session');
assertContains(source, /SECRET_REDACTION_KEYS[\s\S]{0,400}'jwt'/, 'Secret keys list includes jwt');
assertContains(source, /SECRET_REDACTION_KEYS[\s\S]{0,400}'bearer'/, 'Secret keys list includes bearer');
assertContains(source, /REDACTED/, 'Secrets replaced with [REDACTED]');
assertContains(source, /Intentionally log only the ts and a summary/, 'Full report body not logged');
assertContains(source, /JSON\.stringify\(report\)\.slice\(0, 500\)/, 'Log summary truncated');

console.log('\n--- Functional Helpers ---');

// 11. Password change requires current password + bcrypt verify
assertContains(source, /const providedPw = String\(current_password \|\| ''\)\.trim\(\);/, 'current_password extracted');
assertContains(source, /if \(!providedPw\)/, 'current_password mandatory check');
assertContains(source, /verifyPassword\(providedPw, user\)/, 'verifyPassword used for current password check');
assertContains(source, /user\.password_hash = hashPassword\(nextPw\)/, 'New password stored as bcrypt hash');
assertContains(source, /delete user\.password_plain;/, 'Legacy plaintext cleared on password change');
assertContains(source, /user\.password = undefined;/, 'Legacy password field cleared on password change');

// 12. User creation uses hashPassword
assertContains(source, /password_hash: hashPassword\(req\.body\?\.password \|\| '123456'\)/, 'User creation hashes password');
assertNotContains(source, /password_plain: req\.body\?\.password \|\| '123456'/, 'No plaintext password_plain on creation');

// 13. Password reset uses hashPassword
assertContains(source, /user\.password_hash = hashPassword\(newPw\);/, 'Password reset hashes new password');
assertNotContains(source, /user\.password_plain = newPw;/, 'No plaintext password_plain on reset');

console.log('\n--- Negative Controls ---');

// 14. No dynamic imports (Golden Rule)
assertNotContains(source, /import\(/, 'No dynamic import() calls');

console.log('\n=== Summary ===');
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log(`Total:  ${passed + failed}`);

if (failed > 0) {
  console.log('\nFailures:');
  failures.forEach(f => console.log(`  - ${f}`));
  process.exit(1);
} else {
  console.log('\nAll security regression tests passed!');
  process.exit(0);
}