/**
 * Regresi modul koreksi jurnal (bekerja di memori, tanpa server).
 *
 * Yang dijaga:
 *  1. Dry-run tidak mengubah apa pun.
 *  2. Hak vendor yang dobel dikenali dari data (bukan dari daftar nomor tetap).
 *  3. Kelebihan bayar baris void dipisah ke `overpaid`, carry_out jadi 0.
 *  4. Kategori uang makan dipindah, nominal tidak berubah.
 *  5. Rollback: bila satu operasi gagal, TIDAK ADA perubahan yang tertinggal.
 *  6. Idempotensi: menjalankan dua kali tidak mengubah lagi.
 *
 * Run: node tests/journal-correction-integrity.js
 */
const path = require('path');
const fx = require(path.join(__dirname, '..', 'lib', 'journal-correction'));

let passed = 0;
let failed = 0;
function assert(cond, msg, extra) {
  if (cond) { passed += 1; console.log(`  ok   ${msg}`); }
  else { failed += 1; console.log(`  FAIL ${msg}${extra === undefined ? '' : ` -> ${JSON.stringify(extra)}`}`); }
}
const eq = (a, b, msg) => assert(a === b, `${msg} (harap ${b}, dapat ${a})`, a);

const BAKSO = 'c162c6bc-976c-48ee-b1e3-666ba56da89e';
const MIE = '8bea66fd-9e32-4db2-a221-015c7f80d9c3';

function makeDb() {
  return {
    // Koleksi yang benar-benar dibaca aplikasi.
    vendorSettlements: [
      { id: 'a1', settlement_no: 'STL-20260913-0002', date: '2026-09-13', vendor_id: BAKSO,
        vendor_name: 'BAKSO SARI RASA', vendor_share: 988200, carry_in: 0, total_due: 988200,
        paid: 961200, carry_out: 27000, created_at: '2026-09-13T16:03:04.957Z' },
      { id: 'a2', settlement_no: 'STL-20260913-0004', date: '2026-09-13', vendor_id: BAKSO,
        vendor_name: 'BAKSO SARI RASA', vendor_share: 988200, carry_in: 0, total_due: 988200,
        paid: 27000, carry_out: 961200, created_at: '2026-09-14T13:27:32.008Z' },
      { id: 'a3', settlement_no: 'STL-20260914-0002', date: '2026-09-14', vendor_id: MIE,
        vendor_name: 'MIE PANGSIT', vendor_share: 56000, carry_in: 0, total_due: 56000,
        paid: 56000, carry_out: 0, created_at: '2026-09-14T09:00:00.000Z' },
      { id: 'a4', settlement_no: 'STL-20260914-0004', date: '2026-09-14', vendor_id: MIE,
        vendor_name: 'MIE PANGSIT', vendor_share: 56000, carry_in: 13600, total_due: 69600,
        paid: 13600, carry_out: 56000, created_at: '2026-09-15T14:03:00.000Z' },
      { id: 'v1', settlement_no: 'STL-20260829-0001', date: '2026-08-29', vendor_id: BAKSO,
        vendor_name: 'BAKSO SARI RASA', vendor_share: 804300, carry_in: 0, total_due: 804300,
        paid: 5377200, carry_out: -4572900, voided: true, created_at: '2026-09-13T07:33:18.531Z' },
    ],
    cash_movements: [
      { id: 'm1', amount: 215000, category: 'Bahan Baku', note: 'uangmakan', created_at: '2026-09-14T10:00:00Z' },
      { id: 'm2', amount: 150000, category: 'Bahan Baku', note: 'uang makan', created_at: '2026-09-16T10:00:00Z' },
      { id: 'm3', amount: 300000, category: 'Bahan Baku', note: 'rogol + es', created_at: '2026-09-16T11:00:00Z' },
    ],
    cashCategories: ['Bahan Baku'],
  };
}

console.log('\n[1] Dry-run tidak mengubah data');
{
  const db = makeDb();
  const snapshotBefore = JSON.stringify(db);
  const plan = fx.planCorrections(db);
  eq(JSON.stringify(db), snapshotBefore, 'planCorrections tidak memodifikasi db');
  assert(plan.operations.length > 0, 'ada operasi yang terencana', plan.operations.length);
  const dup = plan.operations.filter((o) => o.op === 'fix_duplicate_share');
  eq(dup.length, 2, 'dua baris hak dobel terdeteksi (Bakso + Mie)');
}

console.log('\n[2] Hak dobel: bawa saldo, jangan lahirkan utang baru');
{
  const db = makeDb();
  const plan = fx.planCorrections(db);
  const bakso = plan.operations.find((o) => o.settlement_no === 'STL-20260913-0004');
  eq(bakso.before.vendor_share, 988200, 'sebelum: hak 988.200 tercatat dobel');
  eq(bakso.after.vendor_share, 0, 'sesudah: hak di baris susulan = 0');
  eq(bakso.after.carry_in, 27000, 'carry_in diambil dari sisa saldo baris pemegang hak');
  eq(bakso.after.total_due, 27000, 'tagihan = 27.000 (bukan 988.200)');
  eq(bakso.after.carry_out, 0, 'carry_out = 0 setelah 27.000 dibayar');
  assert(bakso.reason.includes('STL-20260913-0002'), 'alasan menyebut baris pemegang hak', bakso.reason);
}

console.log('\n[3] Kelebihan bayar baris void dipisah');
{
  const db = makeDb();
  const plan = fx.planCorrections(db);
  const v = plan.operations.find((o) => o.op === 'fix_void_overpay');
  eq(v.settlement_no, 'STL-20260829-0001', 'baris void terdeteksi');
  eq(v.after.carry_out, 0, 'carry_out negatif jadi 0');
  eq(v.after.overpaid, 4572900, 'kelebihan 4.572.900 dicatat terpisah');
  eq(v.after.total_due, 804300, 'tagihan asli dipertahankan');
}

console.log('\n[4] Kategori: pindah kartu, nominal tetap');
{
  const db = makeDb();
  const plan = fx.planCorrections(db);
  const cats = plan.operations.filter((o) => o.op === 'fix_category');
  eq(cats.length, 2, 'dua baris uang makan terdeteksi');
  assert(cats.every((c) => c.after.amount === c.before.amount), 'nominal tidak berubah');
  assert(!plan.operations.some((o) => o.op === 'fix_category' && o.id === 'm3'), '"rogol + es" tidak ikut diubah');
}

console.log('\n[5] Apply: hasil akhir seimbang & idempoten');
{
  const db = makeDb();
  const plan = fx.planCorrections(db);
  const res = fx.applyCorrections(db, plan.operations, { batchId: 'uji-1' });
  eq(res.applied, plan.operations.length, 'semua operasi diterapkan');

  const rows = db.vendorSettlements;
  assert(rows.every((r) => Math.abs((Number(r.carry_in) || 0) + (Number(r.vendor_share) || 0) - (Number(r.total_due) || 0)) < 0.01),
    'total_due = carry_in + vendor_share untuk semua baris');
  assert(rows.every((r) => (Number(r.carry_out) || 0) >= -0.01), 'tidak ada carry_out negatif');
  eq(rows.filter((r) => r.koreksi_audit).length, 3, 'tiga baris menyimpan koreksi_audit (2 dobel + 1 void)');
  assert(db.cashCategories.includes('Uang Makan'), 'kategori Uang Makan ditambahkan');
  const bb = db.cash_movements.filter((m) => m.category === 'Bahan Baku').reduce((a, m) => a + m.amount, 0);
  eq(bb, 300000, 'Bahan Baku tinggal 300.000 (hanya rogol + es)');

  // jalankan lagi: tidak boleh ada operasi baru
  const plan2 = fx.planCorrections(db);
  eq(plan2.operations.length, 0, 'koreksi kedua tidak mengubah apa pun (idempoten)');
}

console.log('\n[6] Rollback: satu kegagalan membatalkan seluruh koreksi');
{
  const db = makeDb();
  const plan = fx.planCorrections(db);
  // Sisipkan operasi yang sengaja meledak di tengah batch.
  const booby = { op: 'fix_category' };
  Object.defineProperty(booby, 'row', { get() { throw new Error('gagal sengaja'); } });
  const ops = [...plan.operations.slice(0, 2), booby];
  const before = JSON.stringify(db);
  let threw = false;
  try { fx.applyCorrections(db, ops, { batchId: 'uji-rollback' }); } catch (e) { threw = true; }
  assert(threw, 'error dilempar ke pemanggil');
  eq(JSON.stringify(db), before, 'data kembali persis seperti sebelum koreksi (tidak ada koreksi separuh)');
  assert(!db.vendorSettlements.some((r) => r.koreksi_audit), 'tidak ada jejak koreksi tertinggal');
}

console.log('\n[7] Memilih koleksi yang benar');
{
  const camelOnly = { vendorSettlements: [{ id: 'x' }], vendor_settlements: [] };
  eq(fx.resolveSettlementCollection(camelOnly), 'vendorSettlements', 'pakai camelCase bila ada isinya');
  const snakeOnly = { vendorSettlements: [], vendor_settlements: [{ id: 'y' }] };
  eq(fx.resolveSettlementCollection(snakeOnly), 'vendor_settlements', 'pakai snake_case bila camelCase kosong');
  const both = { vendorSettlements: [{ id: 'x' }], vendor_settlements: [{ id: 'y' }] };
  eq(fx.resolveSettlementCollection(both), 'vendorSettlements', 'bila dua-duanya berisi, ikuti yang dibaca aplikasi');

  // Kasus nyata di produksi: camelCase ADA tapi isinya hanya baris yang sudah
  // dibatalkan (sisa satu baris uji void), sementara data hidup ada di snake_case.
  const voidOnlyCamel = {
    vendorSettlements: [{ id: 'x', voided: true, vendor_share: 0 }],
    vendor_settlements: [
      { id: 'y1', vendor_share: 1000 },
      { id: 'y2', vendor_share: 2000 },
    ],
  };
  eq(fx.resolveSettlementCollection(voidOnlyCamel), 'vendor_settlements',
    'camelCase yang isinya hanya void TIDAK boleh menang');
  eq(fx.summarize(voidOnlyCamel).vendor_share_total, 3000,
    'ringkasan memakai koleksi yang benar (hak 3.000, bukan 0)');
}

console.log('\n[8] Ringkasan sebelum/sesudah');
{
  const db = makeDb();
  const before = fx.summarize(db);
  const plan = fx.planCorrections(db);
  fx.applyCorrections(db, plan.operations);
  const after = fx.summarize(db);
  eq(before.vendor_share_total, 988200 + 988200 + 56000 + 56000, 'hak vendor sebelum koreksi');
  eq(after.vendor_share_total, 988200 + 56000, 'hak vendor sesudah koreksi (dobel hilang)');
  eq(before.carry_out_negative, 1, 'sebelum: satu carry negatif');
  eq(after.carry_out_negative, 0, 'sesudah: tidak ada');
  eq(before.cash_out_by_category['Bahan Baku'], 665000, 'Bahan Baku sebelum');
  eq(after.cash_out_by_category['Bahan Baku'], 300000, 'Bahan Baku sesudah');
  eq(after.cash_out_by_category['Uang Makan'], 365000, 'Uang Makan sesudah');
  eq(before.cash_out_total, after.cash_out_total, 'total kas keluar TIDAK berubah (tidak mengarang uang)');
}

console.log(`\n=== ${passed} lulus, ${failed} gagal ===\n`);
process.exit(failed === 0 ? 0 : 1);
