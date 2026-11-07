#!/usr/bin/env node
/**
 * Koreksi jurnal data Grand Aceh Kuliner — salah hitung saldo vendor & kategori.
 *
 * Dijalankan dengan --dry-run untuk melihat rencana, tanpa --dry-run untuk
 * menulis. Selalu membuat backup berstempel waktu sebelum menyentuh data.
 *
 * Alasan tiap koreksi (bukti angka dari snapshot 7 Nov 2026):
 *  1. STL-20260913-0004  BAKSO SARI RASA, paid 27.000, carry_in 0, vendor_share 988.200
 *     Membuat hak Rp 988.200 milik Bakso tercatat dua kali (STL-20260913-0002
 *     sudah membayar Rp 961.200 dari hak yang sama) dan melahirkan utang baru
 *     Rp 961.200. Baris ini bukan penjualan baru: ia hanya pembayaran sisa
 *     Rp 27.000. Koreksi: vendor_share 0, carry_in 27.000, total_due 27.000,
 *     carry_out 0, ditandai koreksi_audit supaya jejaknya jelas.
 *  2. STL-20260914-0004  MIE PANGSIT, paid 13.600, carry_in 13.600,
 *     vendor_share 56.000 → hak Mie Pangsit 14 Sep juga dobel (STL-20260914-0002
 *     sudah mencatat hak yang sama). Koreksi: vendor_share 0, carry_in 13.600,
 *     total_due 13.600, carry_out 0.
 *  3. Uang makan yang tercatat sebagai "Bahan Baku" (215.000 + 150.000 +
 *     135.000 + 150.000 = 650.000). Koreksi: kategori → "Uang Makan" (dibuat
 *     bila belum ada). Nominal tidak diubah — hanya kartunya.
 *
 * Usage:
 *   node scripts/koreksi-jurnal-vendor.js --dry-run
 *   node scripts/koreksi-jurnal-vendor.js --apply
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SNAPSHOT = path.join(ROOT, 'data', 'pos-db.json');
const mode = process.argv.includes('--apply') ? 'apply' : 'dry-run';

const UANG_MAKAN_CATEGORY = 'Uang Makan';

function round2(v) { return Math.round((Number(v) || 0) * 100) / 100; }

const snap = JSON.parse(fs.readFileSync(SNAPSHOT, 'utf8'));
const db = snap.data;

const plan = [];

// --- 1 & 2: hapus hak vendor yang dobel di settlement susulan --------------
const duplicateFix = [
  { no: 'STL-20260913-0004', expect: { vendor_id: 'c162c6bc-976c-48ee-b1e3-666ba56da89e', paid: 27000, carry_in: 0 } },
  { no: 'STL-20260914-0004', expect: { vendor_id: '8bea66fd-9e32-4db2-a221-015c7f80d9c3', paid: 13600, carry_in: 13600 } },
];

(duplicateFix || []).forEach(({ no, expect }) => {
  const row = (db.vendor_settlements || []).find((s) => s.settlement_no === no);
  if (!row) {
    plan.push({ target: no, action: 'SKIP', reason: 'tidak ditemukan (mungkin sudah dikoreksi)' });
    return;
  }
  if (row.vendor_id !== expect.vendor_id) {
    plan.push({ target: no, action: 'ABORT', reason: `vendor_id tidak seperti yang diharapkan (${row.vendor_id})` });
    return;
  }
  // Saldo pada titik waktu baris ini dibuat: hanya settlement hidup yang lebih
  // tua darinya yang boleh menentukan carry_in.
  const expectCarryIn = () => {
    const createdAt = Date.parse(row.created_at) || 0;
    const prior = (db.vendor_settlements || [])
      .filter((s) => s.vendor_id === row.vendor_id && s.id !== row.id)
      .filter((s) => !(s.voided === true || s.status === 'voided'))
      .filter((s) => (Date.parse(s.created_at) || 0) < createdAt)
      .sort((a, b) => (Date.parse(a.created_at) || 0) - (Date.parse(b.created_at) || 0));
    return prior.length ? prior[prior.length - 1].carry_out : 0;
  };
  if (row.vendor_share === 0 && Number(row.carry_in) === round2(expectCarryIn())) {
    plan.push({ target: no, action: 'SKIP', reason: 'vendor_share & carry_in sudah benar' });
    return;
  }
  const paid = Number(row.paid) || 0;
  // carry_in yang BENAR adalah saldo terakhir vendor tepat sebelum baris ini
  // dibuat — bukan angka yang tersimpan di baris rusak ini. Baris 0004 menyimpan
  // carry_in 0 padahal sisa Bakso saat itu Rp 27.000; memakai 0 akan membuat
  // carry_out negatif (bayar 27.000 tanpa tagihan).
  const carryIn = round2(expectCarryIn());
  plan.push({
    target: no,
    action: 'FIX-SHARE',
    before: {
      vendor_share: Number(row.vendor_share),
      carry_in: Number(row.carry_in) || 0,
      total_due: Number(row.total_due),
      carry_out: Number(row.carry_out),
    },
    after: {
      // Pembayaran pindah ke baris yang mencatat haknya; baris ini hanya
      // melunasi sisa saldo, jadi tidak boleh menambah hak baru.
      vendor_share: 0,
      carry_in: carryIn,
      total_due: carryIn,
      carry_out: round2(carryIn - paid),
    },
    row,
  });
});

// --- 4: baris void yang kelebihan bayar --------------------------------
// Baris void tidak menentukan saldo vendor, tetapi menyimpan hutang negatif
// (paid 5.377.200 atas tagihan 804.300) sehingga laporan tidak konsisten.
// Tata letak yang dipakai: `total_due` tetap memuat tagihan ASLI (sehingga
// total_due = carry_in + vendor_share tetap sah), `overpaid` menyimpan
// kelebihan bayar, dan `carry_out` disetel 0 karena baris ini tidak lagi
// menyisakan hutang. Dengan begitu: cash_out_nyata = paid - overpaid = total_due
// dan tidak ada satu pun angka yang saling bertentangan.
(db.vendor_settlements || []).forEach((s) => {
  const isVoid = s.voided === true || s.status === 'voided';
  if (!isVoid) return;
  const carryOut = Number(s.carry_out) || 0;
  const carryIn = Number(s.carry_in) || 0;
  const share = Number(s.vendor_share) || 0;
  const paid = Number(s.paid) || 0;
  const trueDue = round2(carryIn + share);
  const overpaid = round2(Math.max(0, paid - trueDue));
  if (overpaid <= 0.009) return;
  const alreadyOk = (!s.overpaid || Math.abs(s.overpaid - overpaid) < 0.01)
    && Math.abs((Number(s.total_due) || 0) - trueDue) < 0.01
    && Math.abs(carryOut) < 0.009;
  if (alreadyOk) return;
  plan.push({
    target: s.settlement_no,
    action: 'FIX-VOID-OVERPAY',
    before: { carry_out: carryOut, total_due: Number(s.total_due), paid },
    after: { carry_out: 0, total_due: trueDue, overpaid },
    row: s,
  });
});

// --- 5: kategori uang makan ------------------------------------------------
const UANG_MAKAN_KEYWORDS = ['uang makan', 'uangmakan'];
(db.cash_movements || []).forEach((m) => {
  const note = String(m.note || '').toLowerCase().replace(/\s+/g, ' ').trim();
  const isUangMakan = UANG_MAKAN_KEYWORDS.some((k) => note.replace(/\s/g, '') === k.replace(/\s/g, ''));
  if (!isUangMakan) return;
  if (m.category === UANG_MAKAN_CATEGORY) return;
  plan.push({
    target: m.id,
    action: 'FIX-CATEGORY',
    when: String(m.created_at).slice(0, 10),
    before: { category: m.category, amount: Number(m.amount) },
    after: { category: UANG_MAKAN_CATEGORY, amount: Number(m.amount) },
    row: m,
  });
});

// --- terapkan -------------------------------------------------------------
const baksoBefore = (db.vendor_settlements || [])
  .filter((s) => s.vendor_id === 'c162c6bc-976c-48ee-b1e3-666ba56da89e' && !s.voided)
  .reduce((a, s) => a + (Number(s.vendor_share) || 0), 0);
const bahanBakuBefore = (db.cash_movements || [])
  .filter((m) => m.category === 'Bahan Baku')
  .reduce((a, m) => a + (Number(m.amount) || 0), 0);

if (mode === 'apply') {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '');
  const backup = `${SNAPSHOT}.bak-koreksi-${stamp}`;
  fs.copyFileSync(SNAPSHOT, backup);
  console.log(`Backup ditulis: ${backup}`);

  plan.forEach((p) => {
    if (p.action === 'FIX-SHARE') {
      p.row.vendor_share = p.after.vendor_share;
      p.row.carry_in = p.after.carry_in;
      p.row.total_due = p.after.total_due;
      p.row.carry_out = p.after.carry_out;
      p.row.koreksi_audit = {
        at: new Date().toISOString(),
        reason: 'Hak vendor sudah tercatat di settlement sebelumnya; baris ini hanya melunasi sisa saldo.',
        vendor_share_before: p.before.vendor_share,
        carry_in_before: p.before.carry_in,
        carry_out_before: p.before.carry_out,
      };
    }
    if (p.action === 'FIX-VOID-OVERPAY') {
      p.row.carry_out = p.after.carry_out;
      p.row.overpaid = p.after.overpaid;
      p.row.total_due = p.after.total_due;
      p.row.koreksi_audit = {
        ...(p.row.koreksi_audit || {}),
        at: new Date().toISOString(),
        reason: 'Settlement dibatalkan dengan pembayaran melebihi tagihan; kelebihan dipisah ke `overpaid` sehingga tidak disimpan sebagai hutang vendor.',
        carry_out_before: p.before.carry_out,
        total_due_before: p.before.total_due,
        overpaid: p.after.overpaid,
      };
    }
    if (p.action === 'FIX-CATEGORY') {
      p.row.category_before_koreksi = p.row.category;
      p.row.category = p.after.category;
    }
  });

  if (!Array.isArray(db.cashCategories)) db.cashCategories = [];
  if (!db.cashCategories.includes(UANG_MAKAN_CATEGORY)) db.cashCategories.push(UANG_MAKAN_CATEGORY);

  snap.saved_at = new Date().toISOString();
  fs.writeFileSync(SNAPSHOT, JSON.stringify(snap, null, 2));
}

const baksoAfter = (db.vendor_settlements || [])
  .filter((s) => s.vendor_id === 'c162c6bc-976c-48ee-b1e3-666ba56da89e' && !s.voided)
  .reduce((a, s) => a + (Number(s.vendor_share) || 0), 0);
const bahanBakuAfter = (db.cash_movements || [])
  .filter((m) => m.category === 'Bahan Baku')
  .reduce((a, m) => a + (Number(m.amount) || 0), 0);

console.log(`\nMode: ${mode.toUpperCase()}`);
console.log('Rencana koreksi:');
plan.forEach((p, i) => {
  console.log(`  ${i + 1}. [${p.action}] ${p.target}${p.when ? ` (${p.when})` : ''}`);
  if (p.reason) console.log(`       ${p.reason}`);
  if (p.before) console.log(`       sebelum: ${JSON.stringify(p.before)}`);
  if (p.after) console.log(`       sesudah: ${JSON.stringify(p.after)}`);
});

console.log('\nRingkasan dampak:');
console.log(`  Hak vendor Bakso (settlement hidup): ${baksoBefore.toLocaleString('id-ID')} -> ${baksoAfter.toLocaleString('id-ID')}`);
console.log(`  Total kategori Bahan Baku:           ${bahanBakuBefore.toLocaleString('id-ID')} -> ${bahanBakuAfter.toLocaleString('id-ID')}`);
if (mode !== 'apply') console.log('\n(dry-run: tidak ada perubahan ditulis. Tambahkan --apply untuk menerapkan.)');
