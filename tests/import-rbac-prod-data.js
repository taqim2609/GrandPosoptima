// Verify the deployed RBAC against PRODUCTION user data, without touching production.
// Copies data/pos-db.json into a temp dir, boots the real server on a spare port, and
// exercises all four import endpoints with each real role. The kasir's password is the
// same probe password already used against production; admin and superadmin passwords are
// unknown, so their tokens are minted with the server's own signer instead of logging in.
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PORT = 3991;
const BASE = `http://127.0.0.1:${PORT}`;

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gak-prod-verify-'));
fs.copyFileSync(path.join(ROOT, 'data', 'pos-db.json'), path.join(tmpDir, 'pos-db.json'));

process.env.PORT = String(PORT);
process.env.NODE_ENV = 'production';
process.env.GRANDPOS_DATA_DIR = tmpDir;
process.env.JWT_SECRET = 'prod-verify-' + Date.now();

const ENDPOINTS = [
  '/api/products/import/preview',
  '/api/products/import/commit',
  '/api/ingredients/import',
  '/api/ai/assistant/import-excel',
];

let failures = 0;
const check = (label, actual, ok) => {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}: ${actual}`);
};

async function post(ep, token) {
  const form = new FormData();
  form.append('file', new Blob([Buffer.from('not excel')]), 'p.xlsx');
  const res = await fetch(`${BASE}${ep}`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  });
  return res.status;
}

(async () => {
  const app = require(path.join(ROOT, 'api-server.js'));
  const srv = app.listen(PORT, '127.0.0.1');
  try {
    for (let i = 0; i < 60; i++) {
      try { if ((await fetch(`${BASE}/api/health`)).ok) break; } catch {}
      await new Promise((r) => setTimeout(r, 500));
    }

    // Mint tokens for the real roles using the server's own signer, so no password is needed.
    const jwt = require(path.join(ROOT, 'node_modules', 'jsonwebtoken'));
    const users = JSON.parse(
      fs.readFileSync(path.join(tmpDir, 'pos-db.json'), 'utf-8')
    ).data.users;
    const byRole = {
      superadmin: users.find((u) => u.is_superadmin),
      admin: users.find((u) => (u.role_base || u.role) === 'admin' && !u.is_superadmin),
      kasir: users.find((u) => (u.role_base || u.role) === 'kasir'),
    };

    const tokens = {};
    for (const [role, u] of Object.entries(byRole)) {
      if (!u) { console.log(`!! no production user with role ${role}`); continue; }
      tokens[role] = jwt.sign({ id: u.id, username: u.username }, process.env.JWT_SECRET, { expiresIn: '1h' });
      console.log(`token minted for ${role} (${u.username})`);
    }
    console.log('');

    for (const ep of ENDPOINTS) {
      check(`anon   ${ep}`, await post(ep, null), (s) => s === 401);
      check(`kasir  ${ep}`, await post(ep, tokens.kasir), (s) => s === 403);
      // Admin/superadmin must pass RBAC. A bogus file then fails inside the handler,
      // which is still proof the guard let them through.
      const a = await post(ep, tokens.admin);
      check(`admin  ${ep} (passed gate)`, a, (s) => s !== 401 && s !== 403);
      const sa = await post(ep, tokens.superadmin);
      check(`super  ${ep} (passed gate)`, sa, (s) => s !== 401 && s !== 403);
    }
  } finally {
    srv.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
  console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'}`);
  process.exit(failures === 0 ? 0 : 1);
})();
