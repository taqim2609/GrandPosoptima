#!/usr/bin/env node
/**
 * Uji end-to-end HTTP endpoint koreksi jurnal.
 *
 * Yang dibuktikan:
 *  1. Butuh login + hak admin (401 tanpa token, 403 untuk kasir).
 *  2. GET tanpa `apply` = dry-run: melaporkan rencana, TIDAK mengubah data.
 *  3. POST `apply:true` mengoreksi MEMORI server dan menulis ke disk.
 *  4. Koreksi TETAP ADA setelah server menulis ulang snapshot (inti masalahnya).
 *  5. Menjalankan ulang tidak mengubah apa pun (idempoten).
 *
 * Server dinyalakan dengan salinan snapshot di direktori sementara; data asli
 * tidak disentuh. Jalankan: node tests/journal-correction-e2e.js
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const bcrypt = require('bcryptjs');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'data', 'pos-db.json');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gak-koreksi-e2e-'));
const TMP_DB = path.join(tmpDir, 'pos-db.json');

const BAKSO = 'c162c6bc-976c-48ee-b1e3-666ba56da89e';
const MIE = '8bea66fd-9e32-4db2-a221-015c7f80d9c3';

// ---- Siapkan snapshot uji: koleksi yang DIBACA aplikasi + data rusak nyata ----
const snap = JSON.parse(fs.readFileSync(SRC, 'utf8'));
if (!snap.data) throw new Error('snapshot sumber tidak berbentuk {data:...}');

snap.data.vendors = [
  { id: BAKSO, name: 'BAKSO SARI RASA', active: true },
  { id: MIE, name: 'MIE PANGSIT', active: true },
];
// Kosongkan camelCase agar modul memilih snake_case (meniru kondisi snapshot
// hasil impor) sekaligus menguji resolveSettlementCollection.
snap.data.vendorSettlements = [];
snap.data.vendor_settlements = [
  { id: 'a1', settlement_no: 'STL-20260913-0002', date: '2026-09-13', vendor_id: BAKSO,
    vendor_name: 'BAKSO SARI RASA', gross: 1098000, vendor_share: 988200, carry_in: 0,
    total_due: 988200, paid: 961200, carry_out: 27000, created_at: '2026-09-13T16:03:04.957Z' },
  { id: 'a2', settlement_no: 'STL-20260913-0004', date: '2026-09-13', vendor_id: BAKSO,
    vendor_name: 'BAKSO SARI RASA', gross: 1098000, vendor_share: 988200, carry_in: 0,
    total_due: 988200, paid: 27000, carry_out: 961200, created_at: '2026-09-14T13:27:32.008Z' },
  { id: 'a3', settlement_no: 'STL-20260914-0002', date: '2026-09-14', vendor_id: MIE,
    vendor_name: 'MIE PANGSIT', gross: 70000, vendor_share: 56000, carry_in: 0,
    total_due: 56000, paid: 56000, carry_out: 0, created_at: '2026-09-14T09:00:00.000Z' },
  { id: 'a4', settlement_no: 'STL-20260914-0004', date: '2026-09-14', vendor_id: MIE,
    vendor_name: 'MIE PANGSIT', gross: 70000, vendor_share: 56000, carry_in: 13600,
    total_due: 69600, paid: 13600, carry_out: 56000, created_at: '2026-09-15T14:03:00.000Z' },
  { id: 'v1', settlement_no: 'STL-20260829-0001', date: '2026-08-29', vendor_id: BAKSO,
    vendor_name: 'BAKSO SARI RASA', gross: 900000, vendor_share: 804300, carry_in: 0,
    total_due: 804300, paid: 5377200, carry_out: -4572900, voided: true,
    created_at: '2026-09-13T07:33:18.531Z' },
];
snap.data.cash_movements = [
  { id: 'm1', type: 'out', scope: 'fnb', amount: 215000, category: 'Bahan Baku', note: 'uangmakan', created_at: '2026-09-14T10:00:00+00:00' },
  { id: 'm2', type: 'out', scope: 'fnb', amount: 150000, category: 'Bahan Baku', note: 'uang makan', created_at: '2026-09-16T10:00:00+00:00' },
  { id: 'm3', type: 'out', scope: 'fnb', amount: 300000, category: 'Bahan Baku', note: 'rogol + es', created_at: '2026-09-16T11:00:00+00:00' },
];
snap.data.cashCategories = ['Bahan Baku', 'Transport'];
snap.data.orders = [];
snap.data.shiftHistory = [];
snap.data.currentShift = null;

const PASS = 'e2e-' + Date.now();
const ADMIN = 'e2e-admin';
const KASIR = 'e2e-kasir';
snap.data.users = (snap.data.users || []).filter((u) => ![ADMIN, KASIR].includes(u.username));
snap.data.users.push({
  id: 'u-admin', username: ADMIN, name: 'Admin Uji', role: 'admin', role_base: 'admin',
  is_superadmin: false, active: true, must_change_password: false,
  password_hash: bcrypt.hashSync(PASS, 10),
});
snap.data.users.push({
  id: 'u-kasir', username: KASIR, name: 'Kasir Uji', role: 'kasir', role_base: 'kasir',
  is_superadmin: false, active: true, must_change_password: false,
  password_hash: bcrypt.hashSync(PASS, 10),
});

fs.writeFileSync(TMP_DB, JSON.stringify(snap, null, 2));

const PORT = 3997;
process.env.PORT = String(PORT);
process.env.NODE_ENV = 'test';
process.env.GRANDPOS_DATA_DIR = tmpDir;
process.env.JWT_SECRET = 'e2e-' + Date.now();

const app = require(path.join(ROOT, 'api-server.js'));

let passed = 0;
let failed = 0;
function assert(cond, msg, extra) {
  if (cond) { passed += 1; console.log(`  ok   ${msg}`); }
  else { failed += 1; console.log(`  FAIL ${msg}${extra === undefined ? '' : ` -> ${JSON.stringify(extra)}`}`); }
}
const eq = (a, b, msg) => assert(a === b, `${msg} (harap ${b}, dapat ${a})`, a);

function request(method, urlPath, body, token) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const headers = {};
    if (payload) {
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = Buffer.byteLength(payload);
    }
    if (token) headers.Authorization = `Bearer ${token}`;
    const req = http.request({ host: '127.0.0.1', port: PORT, path: urlPath, method, headers }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        let json;
        try { json = JSON.parse(data); } catch (_) { json = data; }
        resolve({ status: res.statusCode, body: json });
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

const disk = () => JSON.parse(fs.readFileSync(TMP_DB, 'utf8')).data;

(async () => {
  const server = app.listen(PORT, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  try {
    console.log('\n[1] Guard akses');
    const noAuth = await request('GET', '/api/admin/journal-corrections');
    eq(noAuth.status, 401, 'tanpa token -> 401');

    const lk = await request('POST', '/api/auth/login', { username: KASIR, password: PASS });
    eq(lk.status, 200, 'login kasir berhasil');
    const kasirTok = lk.body.token;
    const forbidden = await request('GET', '/api/admin/journal-corrections', null, kasirTok);
    eq(forbidden.status, 403, 'kasir (bukan admin) -> 403');

    const la = await request('POST', '/api/auth/login', { username: ADMIN, password: PASS });
    eq(la.status, 200, 'login admin berhasil');
    const tok = la.body.token;

    console.log('\n[2] Dry-run default tidak mengubah data');
    const dry = await request('GET', '/api/admin/journal-corrections', null, tok);
    eq(dry.status, 200, 'GET -> 200');
    eq(dry.body.mode, 'dry-run', 'mode = dry-run');
    eq(dry.body.collection, 'vendor_settlements', 'memilih koleksi snake_case yang berisi data');
    assert(dry.body.planned > 0, 'ada rencana koreksi', dry.body.planned);
    eq(disk().vendor_settlements.find((r) => r.id === 'a2').vendor_share, 988200,
      'disk TIDAK berubah setelah dry-run');

    console.log('\n[3] Apply mengoreksi memori + disk');
    const apply = await request('POST', '/api/admin/journal-corrections', { apply: true }, tok);
    eq(apply.status, 200, 'POST apply -> 200');
    eq(apply.body.mode, 'apply', 'mode = apply');
    assert(apply.body.applied > 0, 'ada operasi diterapkan', apply.body.applied);
    assert(apply.body.persisted === true, 'persistNow() berhasil', apply.body.persist_error);
    eq(apply.body.after.carry_out_negative, 0, 'tidak ada carry_out negatif sesudah koreksi');
    assert(apply.body.after.vendor_share_total < apply.body.before.vendor_share_total,
      'hak vendor turun (dobel hilang)',
      { before: apply.body.before.vendor_share_total, after: apply.body.after.vendor_share_total });
    eq(apply.body.before.cash_out_total, apply.body.after.cash_out_total,
      'total kas keluar tidak berubah (tidak mengarang uang)');

    const afterDisk = disk();
    const a2 = afterDisk.vendor_settlements.find((r) => r.id === 'a2');
    eq(a2.vendor_share, 0, 'disk: hak dobel jadi 0');
    eq(a2.carry_in, 27000, 'disk: carry_in dari saldo pemegang hak');
    eq(a2.carry_out, 0, 'disk: tidak ada utang baru');
    assert(!!a2.koreksi_audit, 'disk: jejak koreksi_audit tersimpan');
    eq(afterDisk.cash_movements.find((m) => m.id === 'm1').category, 'Uang Makan', 'disk: kategori uang makan');
    eq(afterDisk.cash_movements.find((m) => m.id === 'm3').category, 'Bahan Baku', 'disk: rogol+es tetap Bahan Baku');
    assert(afterDisk.cashCategories.includes('Uang Makan'), 'disk: kategori Uang Makan terdaftar');

    console.log('\n[4] INTI: koreksi bertahan saat server menulis ulang snapshot');
    // Memicu persist lewat jalur tulis biasa (bukan endpoint koreksi), lalu cek
    // bahwa koreksi masih ada. Inilah yang gagal pada percobaan berbasis berkas.
    const touch = await request('POST', '/api/vendor-settlements',
      { date: '2026-09-30', vendor_id: MIE, paid: 0, create_cash_out: false }, tok);
    eq(touch.status, 200, 'request tulis lain berhasil (memicu persist)');
    await new Promise((r) => setTimeout(r, 500));

    const afterTouch = disk();
    const a2b = afterTouch.vendor_settlements.find((r) => r.id === 'a2');
    eq(a2b.vendor_share, 0, 'koreksi MASIH ADA setelah persist dari jalur lain');
    eq(a2b.carry_in, 27000, 'carry_in tetap terkoreksi');
    assert(!!a2b.koreksi_audit, 'koreksi_audit tetap ada');
    eq(afterTouch.cash_movements.filter((m) => m.category === 'Uang Makan').length, 2,
      'kategori uang makan bertahan');

    console.log('\n[5] Idempoten: menjalankan lagi tidak mengubah apa pun');
    const again = await request('POST', '/api/admin/journal-corrections', { apply: true }, tok);
    eq(again.status, 200, 'apply kedua -> 200');
    eq(again.body.applied, 0, 'tidak ada operasi baru');

    console.log('\n[6] Tidak ada sisa rencana setelah koreksi');
    // Endpoint tidak punya jalur untuk "merusak data", jadi uji batas `limit`
    // dilakukan pada modul (tests/journal-correction-integrity.js). Di sini cukup
    // dipastikan rencana sudah habis — bukti koreksi benar-benar tuntas.
    const dry2 = await request('GET', '/api/admin/journal-corrections', null, tok);
    eq(dry2.body.planned, 0, 'tidak ada rencana tersisa (semua sudah terkoreksi)');

    console.log(`\n=== ${passed} lulus, ${failed} gagal ===\n`);
  } catch (err) {
    console.error('E2E error:', err);
    failed += 1;
  } finally {
    server.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
    process.exit(failed === 0 ? 0 : 1);
  }
})();
