#!/usr/bin/env node
/**
 * Hapus akun `gakuliner` dan alihkan seluruh jejak kerjanya ke `taqim2609`.
 *
 * Kenapa dialihkan, bukan dibiarkan: akun ini mencatat 4 shift (13-18 Sep) dan
 * 3 baris kas keluar bagi hasil. Menghapus user tanpa mengalihkan referensi
 * meninggalkan `cashier_id` yatim, sehingga jejak audit keuangan yang justru
 * sedang diaudit kehilangan pemiliknya.
 *
 * PENTING: jalankan saat server POS berhenti (`docker stop grandpos_web_app`).
 * Server memuat snapshot sekali saat start lalu menulis ulang seluruh berkas
 * dari memori, jadi perubahan di disk akan tertimpa bila server hidup.
 *
 * Usage:
 *   node scripts/hapus-user-alihkan.js --dry-run
 *   node scripts/hapus-user-alihkan.js --apply
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SNAPSHOT = path.join(ROOT, 'data', 'pos-db.json');
const mode = process.argv.includes('--apply') ? 'apply' : 'dry-run';

const FROM_USERNAME = 'gakuliner';
const TO_USERNAME = 'taqim2609';

const snap = JSON.parse(fs.readFileSync(SNAPSHOT, 'utf8'));
const db = snap.data;

const from = (db.users || []).find((u) => u.username === FROM_USERNAME);
const to = (db.users || []).find((u) => u.username === TO_USERNAME);

if (!from) {
  console.log(`User "${FROM_USERNAME}" tidak ditemukan — mungkin sudah dihapus. Tidak ada yang dikerjakan.`);
  process.exit(0);
}
if (!to) {
  console.error(`User tujuan "${TO_USERNAME}" tidak ditemukan. Dibatalkan agar tidak ada referensi yatim.`);
  process.exit(1);
}
if (to.id === from.id) {
  console.error('User asal dan tujuan sama. Dibatalkan.');
  process.exit(1);
}

const fromId = from.id;
const toId = to.id;
const fromName = from.name || FROM_USERNAME;
const toName = to.name || TO_USERNAME;

// --- Kumpulkan referensi ---------------------------------------------------
const shiftRefs = [];
(db.shifts || []).forEach((s, i) => {
  const touched = ['cashier_id', 'opened_by_id', 'closed_by_id']
    .some((f) => s[f] === fromId);
  if (touched) shiftRefs.push({ index: i, id: s.id, date: s.date || s.opened_at });
});

const movementRefs = [];
(db.cash_movements || []).forEach((m, i) => {
  if (m.cashier_id === fromId) {
    movementRefs.push({ index: i, id: m.id, date: String(m.created_at || '').slice(0, 10), amount: m.amount, category: m.category });
  }
});

const totalMoved = movementRefs.reduce((a, m) => a + (Number(m.amount) || 0), 0);

// --- Terapkan --------------------------------------------------------------
if (mode === 'apply') {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '');
  const backup = `${SNAPSHOT}.bak-hapususer-${stamp}`;
  fs.copyFileSync(SNAPSHOT, backup);
  console.log(`Backup ditulis: ${backup}`);

  const auditNote = {
    at: new Date().toISOString(),
    reason: `Akun "${FROM_USERNAME}" dihapus; jejak kerja dialihkan ke "${TO_USERNAME}".`,
    from_user_id: fromId,
    from_user_name: fromName,
  };

  (db.shifts || []).forEach((s) => {
    let touched = false;
    // id + nama harus bergerak bersama, kalau tidak laporan menampilkan
    // pemilik yang berbeda dari UUID-nya.
    if (s.cashier_id === fromId) { s.cashier_id = toId; s.cashier_name = toName; touched = true; }
    if (s.opened_by_id === fromId) { s.opened_by_id = toId; s.opened_by = toName; touched = true; }
    if (s.closed_by_id === fromId) { s.closed_by_id = toId; s.closed_by = toName; touched = true; }
    if (touched) {
      if (!Array.isArray(s.reassign_audit)) s.reassign_audit = [];
      s.reassign_audit.push(auditNote);
    }
  });

  (db.cash_movements || []).forEach((m) => {
    if (m.cashier_id !== fromId) return;
    m.cashier_id = toId;
    m.cashier_name = toName;
    if (!Array.isArray(m.reassign_audit)) m.reassign_audit = [];
    m.reassign_audit.push(auditNote);
  });

  db.users = (db.users || []).filter((u) => u.id !== fromId);

  snap.saved_at = new Date().toISOString();
  fs.writeFileSync(SNAPSHOT, JSON.stringify(snap, null, 2));
}

// --- Laporan ---------------------------------------------------------------
console.log(`\nMode: ${mode.toUpperCase()}`);
console.log(`  Akun dihapus      : ${FROM_USERNAME} (${fromId}) — nama "${fromName}", role ${from.role}`);
console.log(`  Penerima jejak    : ${TO_USERNAME} (${toId}) — nama "${toName}", role ${to.role}`);
console.log(`\n  Shift dialihkan   : ${shiftRefs.length}`);
shiftRefs.forEach((s) => console.log(`    - ${s.date}  id=${String(s.id).slice(0, 8)}`));
console.log(`  Kas keluar dialihkan: ${movementRefs.length} baris, total Rp ${totalMoved.toLocaleString('id-ID')}`);
movementRefs.forEach((m) => console.log(`    - ${m.date}  ${m.category}  Rp ${Number(m.amount).toLocaleString('id-ID')}`));

const remaining = (db.users || []).filter((u) => u.id === fromId).length;
console.log(`\n  Sisa user ${FROM_USERNAME} di data: ${mode === 'apply' ? remaining : 1}`);
console.log(`  Total user sekarang: ${(db.users || []).length}`);
if (mode !== 'apply') console.log('\n(dry-run: tidak ada perubahan ditulis. Tambahkan --apply untuk menerapkan.)');
