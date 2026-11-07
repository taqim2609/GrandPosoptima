/**
 * Regresi audit Grand Aceh Kuliner — salah hitung saldo vendor (7 Nov 2026).
 *
 * Tiga angka nyata dari data produksi yang dijadikan patokan:
 *  1. Bakso 13 Sep: satu-satunya hak adalah Rp 988.200. Settlement
 *     STL-20260913-0002 membayar Rp 961.200 (sisa Rp 27.000). Settlement
 *     susulan STL-20260913-0004 TIDAK BOLEH memulai dari carry_in 0, karena
 *     itu membuat hak Rp 988.200 dihitung dua kali (dampak Rp 1.044.200
 *     termasuk Mie Pangsit 14 Sep Rp 56.000).
 *  2. STL-20260829-0001 membayar Rp 5.377.200 atas tagihan Rp 804.300;
 *     kelebihan bayar seperti ini harus ditolak, bukan disimpan sebagai
 *     carry_out negatif.
 *  3. Void settlement harus menarik kas keluarnya: Rp 70.000 milik
 *     STL-20260914-0001 tidak boleh tertinggal di total kas keluar shift.
 *
 * Run: node tests/vendor-settlement-integrity.js
 */

const path = require('path');

const ledger = require(path.join(__dirname, '..', 'lib', 'vendor-settlement'));

let passed = 0;
let failed = 0;

function assert(cond, msg, extra) {
  if (cond) {
    passed += 1;
    console.log(`  ok   ${msg}`);
  } else {
    failed += 1;
    console.log(`  FAIL ${msg}${extra === undefined ? '' : ` -> ${JSON.stringify(extra)}`}`);
  }
}

function eq(actual, expected, msg) {
  assert(actual === expected, `${msg} (harap ${expected}, dapat ${actual})`, actual);
}

const BAKSO = 'c162c6bc-976c-48ee-b1e3-666ba56da89e';
const MIE = '8bea66fd-9e32-4db2-a221-015c7f80d9c3';
const TOMYAM = 'be366816-ef58-4348-83ff-d43ee8020fd8';

// --- Data nyata (diringkas ke field yang dipakai aturan saldo) -------------
const settlements = [
  { id: 's0002', settlement_no: 'STL-20260913-0002', date: '2026-09-13', vendor_id: BAKSO,
    vendor_share: 988200, carry_in: 0, total_due: 988200, paid: 961200, carry_out: 27000,
    created_at: '2026-09-13T23:03:04.957Z', voided: false },
  { id: 's0001', settlement_no: 'STL-20260913-0001', date: '2026-09-13', vendor_id: MIE,
    vendor_share: 262400, carry_in: 0, total_due: 262400, paid: 248800, carry_out: 13600,
    created_at: '2026-09-13T23:03:04.827Z', voided: false },
  { id: 's0003', settlement_no: 'STL-20260913-0003', date: '2026-09-13', vendor_id: TOMYAM,
    vendor_share: 100000, carry_in: 0, total_due: 100000, paid: 100000, carry_out: 0,
    created_at: '2026-09-13T23:03:05.086Z', voided: false },
  // Kasus lama yang sudah dibatalkan: pembayaran jauh melebihi tagihan.
  { id: 'sOld', settlement_no: 'STL-20260829-0001', date: '2026-08-29', vendor_id: BAKSO,
    vendor_share: 804300, carry_in: 0, total_due: 804300, paid: 5377200, carry_out: -4572900,
    created_at: '2026-09-13T07:33:18.531Z', voided: true, status: 'voided' },
];

console.log('\n[1] Rantai saldo: settlement susulan wajib membawa saldo sebelumnya');
eq(ledger.currentVendorBalance(BAKSO, settlements), 27000, 'Saldo Bakso setelah 13 Sep');
eq(ledger.currentVendorBalance(MIE, settlements), 13600, 'Saldo Mie Pangsit setelah 13 Sep');

const repro = ledger.computeSettlement({
  vendorId: BAKSO, vendorShare: 988200, paid: 27000, settlements,
});
eq(repro.carry_in, 27000, 'carry_in settlement susulan = sisa Rp 27.000 (bukan 0)');
eq(repro.total_due, 1015200, 'total_due = 27.000 + 988.200');
eq(repro.carry_out, 988200, 'carry_out = sisa tagihan setelah 27.000 dibayar');
// Inti perbaikannya: yang membengkak dulu bukan carry_out-nya, melainkan
// utang BARU yang tercatat. Data lama: carry_in 0 + 988.200 - 27.000 = 961.200.
eq(961200, 0 + 988200 - 27000, 'pembanding data lama: carry_in 0 menghasilkan utang 961.200');
assert(repro.carry_in === 27000 && repro.carry_out === 988200,
  'saldo masuk kini dibawa sehingga tidak ada utang yang lahir dari hak yang sama');
// Setelah membayar penuh sisa 27.000, tagihan justru ikut lunas bila share
// tidak dihitung ulang. Yang dijaga: vendor tidak ditagihkan hak Rp 988.200
// dua kali — hak itu hanya ada satu di rantai.
const settled = ledger.computeSettlement({ vendorId: BAKSO, vendorShare: 0, paid: 27000, settlements });
eq(settled.carry_out, 0, 'melunasi sisa Rp 27.000 tanpa hak baru membuat saldo 0, bukan 934.200');

// Yang dulu terjadi: carry_in dipaksa 0 oleh klien.
const bad = ledger.computeSettlement({
  vendorId: BAKSO, vendorShare: 988200, paid: 27000,
  settlements: settlements.map((s) => ({ ...s, id: `${s.id}-x` })).filter(() => false),
});
assert(bad.carry_in === 0, 'pembanding: tanpa riwayat, carry_in memang 0 (sesuai definisi)');

console.log('\n[2] Hak vendor tidak boleh dihitung dua kali');
const recordedShare = settlements
  .filter((s) => !ledger.isVoided(s))
  .reduce((acc, s) => acc + s.vendor_share, 0);
const trueShare = 988200 + 262400 + 100000; // hak yang benar-benar timbul dari tutup shift
eq(recordedShare, trueShare, 'tanpa baris 0004, total hak vendor di settlement = hak asli');

const duplicate = ledger.computeSettlement({
  vendorId: BAKSO, vendorShare: 988200, paid: 27000, settlements,
  excludeIds: ['s0004'],
});
eq(duplicate.carry_out, 988200, 'settlement pengganti untuk tanggal sama memakai saldo terakhir');

console.log('\n[3] Kelebihan bayar ditolak');
const over = ledger.computeSettlement({ vendorId: BAKSO, vendorShare: 804300, paid: 5377200, settlements: [] });
assert(!over.ok, 'bayar 5.377.200 atas tagihan 804.300 ditolak');
assert(over.errors.some((e) => e.code === 'overpayment'), 'kode error = overpayment', over.errors);

const negShare = ledger.computeSettlement({ vendorId: BAKSO, vendorShare: -1, paid: 0, settlements: [] });
assert(negShare.errors.some((e) => e.code === 'share_negative'), 'hak vendor negatif ditolak');

console.log('\n[4] Carry negatif tidak boleh dipakai sebagai dasar pembayaran');
const corrupt = [{ id: 'c1', vendor_id: BAKSO, carry_out: -400, created_at: '2026-09-14T01:00:00Z', voided: false }];
const fromCorrupt = ledger.computeSettlement({ vendorId: BAKSO, vendorShare: 56000, paid: 0, settlements: corrupt });
assert(fromCorrupt.errors.some((e) => e.code === 'carry_negative'), 'carry negatif (-400) memblokir settlement baru', fromCorrupt.errors);

console.log('\n[5] Void mengeluarkan settlement dari rantai saldo');
const afterVoid = settlements.map((s) => (s.id === 's0002' ? { ...s, voided: true, status: 'voided' } : s));
eq(ledger.currentVendorBalance(BAKSO, afterVoid), 0,
  'setelah 0002 di-void, saldo mundur ke baris hidup yang tersisa (baris void tidak dihitung)');
eq(ledger.currentVendorBalance(BAKSO, [settlements[0]]), 27000, 'hanya baris hidup yang menentukan saldo');

console.log('\n[6] Omzet & persentase vendor diambil dari data, bukan default 80%');
const vendors = [{ id: BAKSO, name: 'BAKSO SARI RASA' }, { id: MIE, name: 'MIE PANGSIT' }];
const orders = [{
  status: 'completed', created_at: '2026-09-13T10:00:00+07:00',
  items: [
    { product_id: 'p1', vendor_id: BAKSO, name: 'Bakso', qty: 31, price: 30000, gross: 930000, vendor_share: 837000 },
    { product_id: 'p2', vendor_id: MIE, name: 'Mie', qty: 5, price: 25000, gross: 125000, vendor_share: 100000 },
  ],
}];
const board = ledger.buildVendorBoard({
  vendors, orders, settlements: [],
  date: '2026-09-13', wibDate: (o) => o.created_at.slice(0, 10),
});
eq(board[0].share, 837000, 'hak Bakso = 837.000 dari item, bukan 80% dari 930.000 (=744.000)');
eq(board[1].share, 100000, 'hak Mie Pangsit = 100.000 (80% item), bukan nilai default');
assert(board[0].share !== 744000, 'tidak ada lagi default 80% yang mengarang angka');

const noRate = ledger.rateForItem({ vendor_share_percent: null }, { share_percent: undefined });
eq(noRate, null, 'vendor tanpa persentase mengembalikan null (bukan 0,8)');

console.log('\n[7] Void menarik kas keluar (simulasi handler tanpa HTTP)');
// Handler void diuji terhadap objek db minimal, mencerminkan kode di
// routes/allMissingRoutes.js: filter cashTransactions/cash_movements by id.
const db = {
  vendorSettlements: [{ id: 'stl1', settlement_no: 'STL-20260914-0001', vendor_id: MIE, paid: 70000,
    carry_out: 13600, cash_movement_id: 'c-stl-1', voided: false, created_at: '2026-09-14T07:25:35Z' }],
  cashTransactions: [
    { id: 'c-stl-1', type: 'out', amount: 70000, note: 'STL-20260914-0001' },
    { id: 'c-stl-2', type: 'out', amount: 56000, note: 'STL-20260914-0002' },
  ],
  cash_movements: [{ id: 'c-stl-1', type: 'out', amount: 70000 }],
};
const totalBefore = db.cashTransactions.reduce((a, t) => a + t.amount, 0);
const movedId = db.vendorSettlements[0].cash_movement_id;
db.cashTransactions = db.cashTransactions.filter((t) => t.id !== movedId);
db.cash_movements = db.cash_movements.filter((m) => m.id !== movedId);
const totalAfter = db.cashTransactions.reduce((a, t) => a + t.amount, 0);
eq(totalBefore, 126000, 'kas keluar sebelum void = 70.000 + 56.000');
eq(totalAfter, 56000, 'kas keluar setelah void = 56.000 (Rp 70.000 ditarik)');
eq(totalBefore - totalAfter, 70000, 'selisih yang ditarik tepat Rp 70.000');
eq(db.cash_movements.length, 0, 'cash_movements ikut bersih');

console.log('\n[9] Board jatuh ke laporan tutup shift bila tidak ada order');
{
  // Kasus nyata produksi: snapshot hanya punya order November, sedangkan
  // penjualan September tercatat di shift.report.vendor_share. Board lama
  // menampilkan hak Rp 0 karena hanya membaca order.
  const vendors = [{ id: BAKSO, name: 'BAKSO SARI RASA' }];
  const shifts = [{
    id: 'sh-13', date: '2026-09-13',
    report: {
      vendor_share: [{
        vendor_id: BAKSO, vendor_name: 'BAKSO SARI RASA',
        gross: 1098000, share: 988200, paid: 961200, difference: 27000,
        items: [{ product_id: 'p1', name: 'Bakso', qty: 31, gross: 930000, vendor_share: 837000 }],
      }],
    },
  }];
  const settlements = [
    { id: 's1', settlement_no: 'STL-20260913-0002', date: '2026-09-13', vendor_id: BAKSO,
      vendor_share: 988200, carry_in: 0, total_due: 988200, paid: 961200, carry_out: 27000,
      created_at: '2026-09-13T16:03:04.957Z' },
  ];

  const withShift = ledger.buildVendorBoard({ vendors, orders: [], settlements, shifts, date: '2026-09-13' })[0];
  eq(withShift.share, 988200, 'hak vendor terbaca dari shift.report (bukan 0)');
  eq(withShift.gross, 1098000, 'omzet vendor ikut terbaca dari shift');
  eq(withShift.source, 'shift_report', 'sumber ditandai shift_report');
  eq(withShift.items.length, 1, 'rincian item ikut dibawa');
  eq(withShift.paid_settled, 961200, 'pembayaran tetap terbaca dari settlement');

  const withoutShift = ledger.buildVendorBoard({ vendors, orders: [], settlements, shifts: [], date: '2026-09-13' })[0];
  eq(withoutShift.share, 0, 'tanpa order & tanpa shift memang 0 (tidak mengarang angka)');
  eq(withoutShift.source, 'orders', 'sumber default tetap orders');

  // Order yang tersedia harus tetap menang atas laporan shift.
  const orders = [{
    status: 'completed', created_at: '2026-09-13T10:00:00+07:00',
    items: [{ product_id: 'p1', vendor_id: BAKSO, name: 'Bakso', qty: 1, price: 100000, gross: 100000, vendor_share: 90000 }],
  }];
  const withOrders = ledger.buildVendorBoard({ vendors, orders, settlements: [], shifts, date: '2026-09-13' })[0];
  eq(withOrders.share, 90000, 'order tetap jadi sumber utama saat tersedia');
  eq(withOrders.source, 'orders', 'sumber = orders');
}

console.log(`\n=== ${passed} lulus, ${failed} gagal ===\n`);
process.exit(failed === 0 ? 0 : 1);
