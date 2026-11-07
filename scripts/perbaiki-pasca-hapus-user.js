#!/usr/bin/env node
/**
 * Perbaikan lanjutan setelah pembersihan akun:
 *
 *  1. PULIHKAN kredensial `kasir2` (password + password_hash) yang hilang.
 *     Penyebab: saat `docker stop`, server menjalankan flush `persistNow()` yang
 *     menulis ulang snapshot dari MEMORI. Objek user di memori hanya memuat
 *     bentuk hasil `formatUser()` (tanpa field kredensial), sehingga field
 *     `password`/`password_hash` kasir2 ikut terhapus dari disk. Ini terjadi
 *     pada jendela 16:45 -> 16:56, bukan akibat skrip pengalihan user.
 *
 *  2. SAMAKAN dua nama koleksi settlement. Aplikasi membaca
 *     `db.vendorSettlements` (camelCase) sedangkan 24 baris nyata tersimpan di
 *     `vendor_settlements` (snakeCase). Selama keduanya berbeda, laporan bagi
 *     hasil vendor selalu 0 dan board kosong. Baris yang sudah ada di
 *     camelCase dipertahankan; baris dari snakeCase ditambahkan bila belum ada
 *     (dicocokkan lewat id/settlement_no) sehingga tidak ada duplikat.
 *
 * Jalankan HANYA saat server berhenti:
 *   docker stop grandpos_web_app
 *   node scripts/perbaiki-pasca-hapus-user.js --dry-run
 *   node scripts/perbaiki-pasca-hapus-user.js --apply
 *   docker start grandpos_web_app
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SNAPSHOT = path.join(ROOT, 'data', 'pos-db.json');
const CRED_SOURCE = path.join(ROOT, 'data', 'pos-db.json.bak-beforecleanup-20261107T164521');
const mode = process.argv.includes('--apply') ? 'apply' : 'dry-run';

const snap = JSON.parse(fs.readFileSync(SNAPSHOT, 'utf8'));
const db = snap.data;
const report = { credentials: [], settlements: {} };

// ── 1. Pulihkan kredensial kasir2 ──────────────────────────────────────────
const CRED_FIELDS = ['password', 'password_hash'];
if (fs.existsSync(CRED_SOURCE)) {
  const src = JSON.parse(fs.readFileSync(CRED_SOURCE, 'utf8')).data;
  (db.users || []).forEach((user) => {
    const old = (src.users || []).find((u) => u.id === user.id || u.username === user.username);
    if (!old) return;
    CRED_FIELDS.forEach((f) => {
      if (!user[f] && old[f]) {
        report.credentials.push({ username: user.username, field: f });
        if (mode === 'apply') user[f] = old[f];
      }
    });
  });
} else {
  report.credentials.push({ error: `berkas sumber kredensial tidak ada: ${CRED_SOURCE}` });
}

// ── 2. Samakan koleksi settlement ──────────────────────────────────────────
const camel = Array.isArray(db.vendorSettlements) ? db.vendorSettlements : [];
const snake = Array.isArray(db.vendor_settlements) ? db.vendor_settlements : [];

const keyOf = (r) => r.id || r.settlement_no || `${r.vendor_id}|${r.date}|${r.created_at}`;
const have = new Set(camel.map(keyOf));
const toAdd = snake.filter((r) => !have.has(keyOf(r)));

report.settlements = {
  camel_before: camel.length,
  snake_total: snake.length,
  to_add: toAdd.length,
  camel_after: camel.length + toAdd.length,
  sample: toAdd.slice(0, 3).map((r) => `${r.settlement_no} share=${r.vendor_share} voided=${!!r.voided}`),
};

if (mode === 'apply') {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '');
  const backup = `${SNAPSHOT}.bak-sinkron-${stamp}`;
  fs.copyFileSync(SNAPSHOT, backup);
  console.log(`Backup ditulis: ${backup}`);

  if (toAdd.length > 0) {
    db.vendorSettlements = [...camel, ...toAdd];
  }
  snap.saved_at = new Date().toISOString();
  fs.writeFileSync(SNAPSHOT, JSON.stringify(snap, null, 2));
}

// ── Laporan ────────────────────────────────────────────────────────────────
console.log(`\nMode: ${mode.toUpperCase()}`);
console.log('\n[1] Kredensial dipulihkan:');
report.credentials.forEach((c) => {
  if (c.error) console.log(`  ! ${c.error}`);
  else console.log(`  - ${c.username}: field "${c.field}" dikembalikan dari backup`);
});
if (report.credentials.length === 0) console.log('  (tidak ada yang perlu dipulihkan)');

console.log('\n[2] Penyamaan koleksi settlement:');
const s = report.settlements;
console.log(`  vendorSettlements sebelum : ${s.camel_before}`);
console.log(`  vendor_settlements (sumber): ${s.snake_total}`);
console.log(`  ditambahkan               : ${s.to_add}`);
console.log(`  vendorSettlements sesudah : ${mode === 'apply' ? (db.vendorSettlements || []).length : s.camel_after}`);
s.sample.forEach((x) => console.log(`    contoh: ${x}`));

if (mode !== 'apply') console.log('\n(dry-run: tidak ada perubahan ditulis. Tambahkan --apply untuk menerapkan.)');
