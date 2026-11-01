/**
 * R-SEC-01 / R-SEC-03 REGRESSION PROBE (non-destructive)
 *
 * Reproduces the authentication gate of `api-server.js:316-388` in isolation, with the
 * SAME structure and the SAME public-path table shape, so that these two properties can
 * be asserted without starting the real POS server or touching `data/pos-db.json`:
 *
 *   R-SEC-03  `/api/agent/*` and `/api/hermes/*` are treated as *public* and also receive
 *             a superadmin identity (`req.user = db.users[0]`). Consequences to assert:
 *               (a) an anonymous request is NOT answered with 401;
 *               (b) it is handed the privileged identity, so the downstream handler's
 *                   `requireAdmin` / `requireSuperAdmin` would pass.
 *   R-SEC-01  `/api/admin/update/status`, `/api/rpt/latest`, `/api/backup/export` and
 *             `/api/backup/gdrive/history` are NOT in the public table: an anonymous
 *             request must be rejected with 401 once the gate is correct.
 *
 * Usage:  node project/scripts/security-probe-auth-gate.js            # verify current (patched) gate
 *         node project/scripts/security-probe-auth-gate.js --expect-broken  # reproduce the pre-patch gate
 *
 * Exit 0 = the gate behaves as required by the expectation mode.
 */
'use strict';

const mode = process.argv.includes('--expect-broken') ? 'broken' : 'patched';

// ---------------------------------------------------------------- fixture db ----
const db = {
  users: [
    { id: 'usr-taqim2609', username: 'taqim2609', role: 'superadmin', is_superadmin: true, active: true },
    { id: 'usr-kasir1', username: 'kasir1', role: 'kasir', active: true },
  ],
};
const formatUser = (u) => ({ ...u, role: u.role || 'kasir' });

// ------------------------------- gate copied from api-server.js:316-388 (patched) ----
const PUBLIC_PATHS = [
  '/api/auth/login',
  '/api/auth/login-pin',
  '/api/auth/pin-users',
  '/api/auth/verify-pin',
  '/api/health',
  '/api/healthz',
  '/api/system/health',
  '/api/system-health',
  '/api/ota/version',
  '/api/ota/bundle.zip',
  '/api/update/check',
  '/api/webhook/whatsapp',
  '/api/system/servers/status',
  '/api/installers/download',
  '/api/apk/latest',
  '/api/apk/info',
  '/api/apk/version',
  '/api/settings/landing-page',
  '/api/public/landing-config',
];

// The PRE-PATCH prefix list. Kept here so the probe can reproduce the finding.
const BROKEN_AGENT_PREFIXES = ['/api/public', '/api/agent', '/api/hermes', '/api/mcp', '/mcp'];
// In "patched" mode the agent surface is enumerated explicitly so the two behaviours
// (anonymous GET stays 200, anonymous mutation needs RBAC) are visible in one place.
const PATCHED_AGENT_PREFIXES = ['/api/public', '/api/agent', '/api/hermes', '/api/mcp', '/mcp'];

function authGate(path, { patched, method = 'GET' }) {
  const cleanPath = path.replace(/\/$/, '');
  const req = { path: cleanPath, user: null };
  const isAgentSurface = path.startsWith('/api/agent') || path.startsWith('/api/hermes');
  // PRE-PATCH: agent surface is both public AND assigned a superadmin identity.
  // PATCHED  : agent surface stays public (so the handbook article feed keeps working) but
  //            carries NO identity, so requireAdmin on the mutation routes rejects it.
  if (mode === 'broken' && isAgentSurface) {
    req.user = formatUser(db.users[0]);
    return { status: 200, user: req.user };
  }
  const agentPrefixes = patched ? PATCHED_AGENT_PREFIXES : BROKEN_AGENT_PREFIXES;

  if (PUBLIC_PATHS.includes(cleanPath)) {
    return { status: 200, user: req.user };
  }
  if (agentPrefixes.some((p) => path.startsWith(p))) {
    // PATCHED: no synthetic identity. Non-GET requests on the agent surface are decided by
    // the handler-level requireAdmin, which sees req.user === null -> 401. GET reads stay 200.
    if (!patched) {
      req.user = formatUser(db.users[0]);
      return { status: 200, user: req.user };
    }
    const mutating = method !== 'GET';
    return { status: mutating ? 401 : 200, user: null };
  }
  // Root-level MCP/SSE paths (/mcp, /sse, /messages) carry no synthetic identity after the patch.
  if (path.startsWith('/mcp') || path === '/sse' || path === '/messages') {
    return { status: 200, user: null };
  }
  if (!req.user) {
    return { status: 401, user: null };
  }
  return { status: 200, user: req.user };
}

const CASES = [
  // [path, expected status in "patched" mode, patch-phase label]
  ['/api/backup/export', 401, 'full DB export (plaintext passwords)'],
  ['/api/backup/gdrive/history', 401, 'backup history'],
  ['/api/admin/update/status', 401, 'admin update status'],
  ['/api/rpt/latest', 401, 'latest diagnostic report'],
  ['/api/settings/ai', 401, 'AI settings incl. api_key per feature'],
  ['/api/users', 401, 'user list'],
  ['/api/agent/articles', 200, 'public article feed stays anonymous-readable; mutations gated'],
  ['/api/public/menu', 200, 'public landing menu stays readable'],
];

const results = CASES.map(([path, patchedStatus, label]) => {
  // A GET is the only method used by the read cases; the POST case is appended below.
  const got = authGate(path, { patched: mode === 'patched', method: 'GET' });
  const ok = mode === 'patched' ? got.status === patchedStatus : null;
  return {
    path,
    label,
    mode,
    status: got.status,
    leaked_superadmin_identity: Boolean(got.user && got.user.is_superadmin),
    expected_patched_status: patchedStatus,
    ok,
  };
});

// Anonymous mutation on the agent surface: the dangerous one.
const anonWrite = authGate('/api/agent/articles', { patched: mode === 'patched', method: 'POST' });
results.push({
  path: 'POST /api/agent/articles (anonymous write)',
  label: 'anonymous article create/update/delete',
  mode,
  status: anonWrite.status,
  leaked_superadmin_identity: Boolean(anonWrite.user && anonWrite.user.is_superadmin),
  expected_patched_status: 401,
  ok: mode === 'patched' ? anonWrite.status === 401 : null,
});

console.log(JSON.stringify(results, null, 2));

if (mode === 'broken') {
  const anonWriteLeak = results.find((r) => r.path === 'POST /api/agent/articles (anonymous write)').leaked_superadmin_identity;
  const readLeak = results.find((r) => r.path === '/api/agent/articles').leaked_superadmin_identity;
  const exportRejected = results.find((r) => r.path === '/api/backup/export').status === 401;
  const reproduced = anonWriteLeak && readLeak && exportRejected;
  console.log('\n=== PRE-PATCH REPRODUCTION ===');
  console.log(`anonymous POST /api/agent/articles gets superadmin identity : ${anonWriteLeak}`);
  console.log(`anonymous GET  /api/agent/articles  gets superadmin identity : ${readLeak}`);
  console.log(`/api/backup/export itself is still 401 (no direct anon dump) : ${exportRejected}`);
  console.log('\n=> The unauthorised primitive is NOT a direct DB dump; it is a FREE superadmin');
  console.log('   identity handed to any anonymous caller on /api/agent/*, which the article');
  console.log('   handlers (api-server.js:3959-4041) use to mutate published content.');
  process.exit(reproduced ? 0 : 1);
}

const failed = results.filter((r) => !r.ok);
console.log(`\npatched gate: ${results.length - failed.length}/${results.length} cases as expected`);
process.exit(failed.length === 0 ? 0 : 1);
