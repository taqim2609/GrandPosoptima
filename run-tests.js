#!/usr/bin/env node
/**
 * Jalankan seluruh suite uji dengan argumen yang benar.
 *
 * Empat uji di repo ini TIDAK bisa dijalankan telanjang (`node tests/x.js`): dua butuh
 * URL/bundle sebagai argumen, satu butuh server terisolasi berisi akun uji. Dijalankan
 * apa adanya, keempatnya gagal dengan alasan yang tidak ada hubungannya dengan kode --
 * dan kegagalan itu menyamarkan uji yang benar-benar rusak.
 *
 *   node run-tests.js            # semua
 *   node run-tests.js --fast     # lewati uji browser (butuh chromium + Pi)
 *
 * Uji browser dilewati (SKIP) bila chromium tidak ada, bukan dinyatakan lulus.
 */
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const REPO = __dirname;
const FAST = process.argv.includes('--fast');
const PI = process.env.GRANDPOS_PI_URL || 'http://100.109.98.56';
const E2E_PORT = '3988';
const CHROME = [
  process.env.PLAYWRIGHT_CHROMIUM,
  ...fs.readdirSync('/root/.cache/ms-playwright', { withFileTypes: true })
    .filter((d) => d.isDirectory() && d.name.startsWith('chromium-'))
    .map((d) => path.join('/root/.cache/ms-playwright', d.name, 'chrome-linux64', 'chrome')),
].filter(Boolean).find((p) => { try { return fs.existsSync(p); } catch { return false; } });

const bundle = path.join(REPO, 'project/frontend/build/static/js');
const bundleFile = fs.existsSync(bundle)
  ? fs.readdirSync(bundle).find((f) => f.endsWith('.js') && !f.endsWith('.LICENSE.txt'))
  : null;

const run = (label, cmd, args, opts = {}) => {
  const r = spawnSync(cmd, args, { cwd: REPO, encoding: 'utf8', timeout: opts.timeout || 180000, maxBuffer: 32 * 1024 * 1024, ...opts });
  const out = `${r.stdout || ''}${r.stderr || ''}`;
  return { label, code: r.status, out };
};

const results = [];
const add = (label, code, out) => {
  // `null` means the process was killed or never started -- an error, not a skip.
  // Skips are decided before the spawn and pass null explicitly with a reason.
  const status = code === 0 ? 'PASS' : code === 'SKIP' ? 'SKIP' : 'FAIL';
  results.push({ label, status, out });
  console.log(`${status.padEnd(4)} ${label}`);
  if (status !== 'PASS') console.log(out.split('\n').slice(-4).map((l) => `       ${l}`).join('\n'));
};

// Uji biasa: berdiri sendiri, mengisolasi datanya sendiri.
const plain = fs.readdirSync(path.join(REPO, 'tests'))
  .filter((f) => f.endsWith('.js') && !f.startsWith('_'))
  .filter((f) => !['kiosk-shift-ui-check.js', 'shift-single-form-e2e.js', 'pos-host-gate.js'].includes(f));

for (const f of plain) {
  const r = run(f, 'node', [path.join('tests', f)]);
  add(f, r.code, r.out);
}

// pos-host-gate menguji BUNDLE, jadi butuh path bundle hasil build.
if (bundleFile) {
  const r = run('pos-host-gate.js', 'node', ['tests/pos-host-gate.js', path.join(bundle, bundleFile)]);
  add('pos-host-gate.js (bundle build)', r.code, r.out);
} else {
  add('pos-host-gate.js', 'SKIP', 'no build in project/frontend/build: run `npm run build` in project/frontend');
}

// Uji browser: butuh chromium dan, untuk kiosk, Pi yang hidup.
if (FAST || !CHROME) {
  add('kiosk-shift-ui-check.js', 'SKIP', FAST ? '--fast' : 'chromium not found in /root/.cache/ms-playwright');
  add('shift-single-form-e2e.js', 'SKIP', FAST ? '--fast' : 'chromium not found in /root/.cache/ms-playwright');
} else {
  const k = run('kiosk-shift-ui-check.js', 'node', ['tests/kiosk-shift-ui-check.js', PI], { timeout: 180000 });
  add(`kiosk-shift-ui-check.js (${PI})`, k.code, k.out);

  // Server terisolasi: snapshot sementara + akun uji ber-password dikenal.
  const server = require('child_process').spawn('node', ['tests/_e2e-server.js', E2E_PORT], {
    cwd: REPO, detached: true, stdio: 'ignore',
  });
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  (async () => {
    await wait(6000);
    const s = run('shift-single-form-e2e.js', 'node', ['tests/shift-single-form-e2e.js', `http://127.0.0.1:${E2E_PORT}`], {
      env: { ...process.env, POS_E2E_USER: 'e2e-probe', POS_E2E_PASS: 'e2e-pass-fixed' },
    });
    add('shift-single-form-e2e.js (isolated server)', s.code, s.out);
    try { process.kill(-server.pid); } catch {}

    const failed = results.filter((r) => r.status === 'FAIL');
    const skipped = results.filter((r) => r.status === 'SKIP');
    console.log(`\n${results.length - failed.length - skipped.length} passed, ${failed.length} failed, ${skipped.length} skipped`);
    process.exit(failed.length ? 1 : 0);
  })();
}
if (FAST || !CHROME) {
  const failed = results.filter((r) => r.status === 'FAIL');
  const skipped = results.filter((r) => r.status === 'SKIP');
  console.log(`\n${results.length - failed.length - skipped.length} passed, ${failed.length} failed, ${skipped.length} skipped`);
  process.exit(failed.length ? 1 : 0);
}
