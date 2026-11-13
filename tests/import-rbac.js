// Probe: only admins may reach the xlsx parser. xlsx@0.18.5 has no upstream fix,
// so narrowing who can call xlsx.read() is the mitigation. Verifies three identities
// against the four import endpoints, on a real server.

const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PORT = 3989;
const BASE = `http://127.0.0.1:${PORT}`;
const bcrypt = require(path.join(ROOT, 'node_modules', 'bcryptjs'));

const USERS = [
  { username: 'probe-admin', pass: 'pw-admin-123', role: 'admin', role_base: 'admin', is_superadmin: false },
  { username: 'probe-kasir', pass: 'pw-kasir-123', role: 'kasir', role_base: 'kasir', is_superadmin: false },
];

// Build a temp snapshot with the two extra identities, then boot the real server on it.
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gak-rbac-'));
const snap = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'pos-db.json'), 'utf-8'));
snap.data.users = (snap.data.users || []).filter((u) => !USERS.some((x) => x.username === u.username));
for (const u of USERS) {
  snap.data.users.push({
    id: `probe-${u.username}`,
    username: u.username,
    name: u.username,
    email: `${u.username}@localhost`,
    role: u.role,
    role_base: u.role_base,
    role_name: u.role,
    is_superadmin: u.is_superadmin,
    bootstrap_owner: false,
    perms: u.is_superadmin ? ['*'] : [],
    perms_full: u.is_superadmin,
    active: true,
    must_change_password: false,
    pin_enabled: false,
    has_pin: false,
    password_hash: bcrypt.hashSync(u.pass, 10),
  });
}
fs.writeFileSync(path.join(tmpDir, 'pos-db.json'), JSON.stringify(snap));

const ENDPOINTS = [
  '/api/products/import/preview',
  '/api/products/import/commit',
  '/api/ingredients/import',
  '/api/ai/assistant/import-excel',
];

let failures = 0;
function check(label, actual, expected) {
  const ok = actual === expected;
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}: got ${actual}, want ${expected}`);
}

async function login(username, password) {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) throw new Error(`login ${username} -> ${res.status} ${await res.text()}`);
  const body = await res.json();
  return body.access_token || body.token;
}

async function postWithFile(endpoint, token) {
  const form = new FormData();
  // Not a valid xlsx: the point is whether we reach the parser, so a 400 from the
  // handler proves the gate let us through, while 401/403 proves it did not.
  form.append('file', new Blob([Buffer.from('not an excel file')]), 'probe.xlsx');
  const res = await fetch(`${BASE}${endpoint}`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  });
  return res.status;
}

(async () => {
  process.env.PORT = String(PORT);
  process.env.NODE_ENV = 'production';
  process.env.GRANDPOS_DATA_DIR = tmpDir;
  process.env.JWT_SECRET = 'r3-probe-' + Date.now();

  // api-server.js exports the express app; the harness owns the listen().
  const app = require(path.join(ROOT, 'api-server.js'));
  const srv = app.listen(PORT, '127.0.0.1');
  try {
    for (let i = 0; i < 60; i++) {
      try { if ((await fetch(`${BASE}/api/health`)).ok) break; } catch {}
      await new Promise((r) => setTimeout(r, 500));
    }

    const adminToken = await login('probe-admin', 'pw-admin-123');
    const kasirToken = await login('probe-kasir', 'pw-kasir-123');
    console.log('both identities logged in\n');

    for (const ep of ENDPOINTS) {
      check(`anon      ${ep}`, await postWithFile(ep, null), 401);
      check(`kasir     ${ep}`, await postWithFile(ep, kasirToken), 403);
      // Admin must get past RBAC; the bogus file then fails inside the handler.
      const adminStatus = await postWithFile(ep, adminToken);
      check(`admin     ${ep} (passed gate)`, adminStatus !== 401 && adminStatus !== 403, true);
    }
  } finally {
    srv.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
  console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'}`);
  process.exit(failures === 0 ? 0 : 1);
})();
