/**
 * Koreksi jurnal di MEMORI server, tanpa restart.
 *
 * Latar belakang: `api-server.js` memuat snapshot ke objek `db` di memori sekali
 * saat start (`loadSnapshot`), lalu setiap request yang mengubah data menulis
 * ulang seluruh snapshot dari memori ke disk. Akibatnya mengedit
 * `data/pos-db.json` saat server hidup selalu hilang pada tulis berikutnya —
 * pernah terjadi pada koreksi jurnal 7 Nov 2026.
 *
 * Modul ini menyediakan operasi koreksi yang bekerja pada `db` di memori lalu
 * memanggil `persistNow()`, sehingga perubahan benar-benar menjadi bagian dari
 * keadaan aplikasi.
 *
 * Aturan yang dijaga:
 *  - Dry-run adalah default. Menulis butuh `apply: true` eksplisit.
 *  - Semua operasi dijalankan atomik: bila satu langkah gagal, seluruh
 *    perubahan di memori dikembalikan seperti semula (tidak ada koreksi separuh).
 *  - Setiap baris yang berubah menyimpan `koreksi_audit` berisi nilai sebelum,
 *    sehingga koreksi bisa ditelusuri dan tidak perlu ditebak.
 *  - Modul ini TIDAK mengarang uang: nominal pembayaran tidak diubah, hanya
 *    penggolongan/pencatatan yang salah.
 */

const ROUND_EPS = 0.009;

function round2(v) {
  return Math.round((Number(v) || 0) * 100) / 100;
}

function isVoided(row) {
  return row && (row.voided === true || row.status === 'voided');
}

/**
 * Pilih koleksi settlement yang dipakai aplikasi.
 *
 * Kode membaca `db.vendorSettlements` (camelCase). Snapshot hasil impor Mongo
 * menyimpan `vendor_settlements` (snake_case). Koleksi camelCase bisa ADA tetapi
 * hanya berisi baris yang sudah dibatalkan (mis. sisa satu baris uji void),
 * sehingga "ada isinya" saja bukan kriteria yang cukup: koreksi harus mengenai
 * koleksi yang benar-benar memuat data hidup. Nilai = jumlah baris hidup,
 * tie-break ke camelCase karena itulah yang dibaca aplikasi.
 */
function resolveSettlementCollection(db, requested) {
  if (requested === 'vendor_settlements' || requested === 'vendorSettlements') return requested;
  const countLive = (rows) => (Array.isArray(rows) ? rows.filter((r) => !isVoided(r)).length : 0);
  const camel = db.vendorSettlements;
  const snake = db.vendor_settlements;
  const liveCamel = countLive(camel);
  const liveSnake = countLive(snake);
  if (liveCamel === 0 && liveSnake > 0) return 'vendor_settlements';
  if (liveSnake > liveCamel) return 'vendor_settlements';
  return 'vendorSettlements';
}

/**
 * Rencanakan koreksi tanpa mengubah apa pun.
 * Mengembalikan daftar operasi beserta nilai sebelum/sesudah.
 */
function planCorrections(db, options = {}) {
  const collectionKey = resolveSettlementCollection(db, options.collection);
  const rows = Array.isArray(db[collectionKey]) ? db[collectionKey] : [];
  const operations = [];

  // --- 1. Hak vendor yang tercatat dobel pada settlement susulan -------------
  // Baris susulan untuk vendor+tanggal yang haknya sudah dicatat baris lain
  // hanya boleh melunasi sisa saldo; menambah `vendor_share` di sana membuat
  // hak yang sama dihitung dua kali.
  const byVendorDate = new Map();
  rows.forEach((row) => {
    const key = `${row.vendor_id}|${row.date}`;
    if (!byVendorDate.has(key)) byVendorDate.set(key, []);
    byVendorDate.get(key).push(row);
  });

  byVendorDate.forEach((group, key) => {
    if (group.length < 2) return;
    const live = group.filter((r) => !isVoided(r) && (Number(r.vendor_share) || 0) > ROUND_EPS);
    if (live.length < 2) return;
    // Baris pertama (paling awal dibuat) memegang hak; sisanya harus 0.
    const sorted = [...live].sort((a, b) => (Date.parse(a.created_at) || 0) - (Date.parse(b.created_at) || 0));
    const holder = sorted[0];
    // Saldo yang benar bukan angka yang tersimpan di baris rusak ini, melainkan
    // sisa saldo baris pemegang hak (chain ke baris terakhir sebelum baris ini).
    const carryIn = round2(Number(holder.carry_out) || 0);
    sorted.slice(1).forEach((dup) => {
      const paid = round2(Number(dup.paid) || 0);
      operations.push({
        op: 'fix_duplicate_share',
        settlement_no: dup.settlement_no,
        id: dup.id,
        reason: `Hak vendor ${key.split('|')[0]} untuk ${key.split('|')[1]} sudah dicatat di ${holder.settlement_no} (Rp ${(Number(holder.vendor_share) || 0).toLocaleString('id-ID')}). Baris ini hanya melunasi sisa saldo Rp ${carryIn.toLocaleString('id-ID')}.`,
        before: {
          vendor_share: round2(dup.vendor_share),
          carry_in: round2(dup.carry_in),
          total_due: round2(dup.total_due),
          carry_out: round2(dup.carry_out),
        },
        after: {
          vendor_share: 0,
          carry_in: carryIn,
          total_due: carryIn,
          // Sisa setelah pembayaran tidak boleh negatif: kalau baris ini membayar
          // lebih dari sisa saldo, kelebihannya dicatat sebagai overpaid.
          carry_out: round2(Math.max(0, carryIn - paid)),
          overpaid: round2(Math.max(0, paid - carryIn)),
        },
        row: dup,
      });
    });
  });

  // --- 2. Kelebihan bayar pada baris yang sudah dibatalkan -------------------
  // Baris void tidak menentukan saldo, tetapi menyimpan hutang negatif. Nominal
  // kelebihan dipindah ke `overpaid` supaya tetap terlacak.
  rows.forEach((row) => {
    if (!isVoided(row)) return;
    const carryIn = round2(row.carry_in);
    const share = round2(row.vendor_share);
    const paid = round2(row.paid);
    const trueDue = round2(carryIn + share);
    const overpaid = round2(Math.max(0, paid - trueDue));
    if (overpaid <= ROUND_EPS) return;
    const carryOut = round2(row.carry_out);
    const alreadyOk = Math.abs(round2(row.overpaid) - overpaid) <= ROUND_EPS
      && Math.abs(round2(row.total_due) - trueDue) <= ROUND_EPS
      && Math.abs(carryOut) <= ROUND_EPS;
    if (alreadyOk) return;
    operations.push({
      op: 'fix_void_overpay',
      settlement_no: row.settlement_no,
      id: row.id,
      reason: 'Settlement dibatalkan dengan pembayaran melebihi tagihan; kelebihan dipisah ke `overpaid` agar tidak tersimpan sebagai hutang vendor.',
      before: { carry_out: carryOut, total_due: round2(row.total_due), paid },
      after: { carry_out: 0, total_due: trueDue, overpaid },
      row,
    });
  });

  // --- 3. Kategori kas yang salah -------------------------------------------
  // Catatan bernama "uang makan"/"uangmakan" adalah konsumsi staf, bukan bahan
  // baku. Nominalnya tidak diubah; hanya kategorinya.
  const movements = Array.isArray(db.cash_movements) ? db.cash_movements : [];
  movements.forEach((m) => {
    const note = String(m.note || '').toLowerCase().replace(/\s+/g, '');
    if (note !== 'uangmakan' && note !== 'uangmakan(staff)') return;
    if (m.category === 'Uang Makan') return;
    operations.push({
      op: 'fix_category',
      id: m.id,
      when: String(m.created_at || '').slice(0, 10),
      reason: 'Uang makan staf tercatat sebagai Bahan Baku sehingga biaya bahan baku terlihat lebih besar.',
      before: { category: m.category, amount: round2(m.amount) },
      after: { category: 'Uang Makan', amount: round2(m.amount) },
      row: m,
    });
  });

  return { collectionKey, operations };
}

/**
 * Terapkan operasi ke objek db di memori. Atomik: bila satu langkah melempar,
 * seluruh perubahan yang sudah dilakukan dikembalikan.
 */
function applyCorrections(db, ops, meta = {}) {
  const undo = [];
  const at = new Date().toISOString();
  const stamp = String(meta.stamp || at);

  const setField = (obj, field, value) => {
    const had = Object.prototype.hasOwnProperty.call(obj, field);
    const prev = obj[field];
    obj[field] = value;
    undo.push(() => {
      if (had) obj[field] = prev;
      else delete obj[field];
    });
  };

  try {
    ops.forEach((op) => {
      const row = op.row;
      if (!row) return;
      if (op.op === 'fix_duplicate_share') {
        setField(row, 'vendor_share', op.after.vendor_share);
        setField(row, 'carry_in', op.after.carry_in);
        setField(row, 'total_due', op.after.total_due);
        setField(row, 'carry_out', op.after.carry_out);
        if (op.after.overpaid > 0) setField(row, 'overpaid', op.after.overpaid);
        setField(row, 'koreksi_audit', {
          at,
          stamp,
          batch: meta.batchId || null,
          reason: op.reason,
          ...op.before,
          op: op.op,
        });
      } else if (op.op === 'fix_void_overpay') {
        setField(row, 'carry_out', op.after.carry_out);
        setField(row, 'total_due', op.after.total_due);
        setField(row, 'overpaid', op.after.overpaid);
        setField(row, 'koreksi_audit', {
          ...(row.koreksi_audit || {}),
          at,
          stamp,
          batch: meta.batchId || null,
          reason: op.reason,
          ...op.before,
          op: op.op,
        });
      } else if (op.op === 'fix_category') {
        setField(row, 'category_before_koreksi', row.category);
        setField(row, 'category', op.after.category);
        setField(row, 'koreksi_audit', {
          at,
          stamp,
          batch: meta.batchId || null,
          reason: op.reason,
          category_before: op.before.category,
          op: op.op,
        });
      }
    });

    if (ops.some((o) => o.op === 'fix_category')) {
      if (!Array.isArray(db.cashCategories)) db.cashCategories = [];
      if (!db.cashCategories.includes('Uang Makan')) {
        const had = Array.isArray(db.cashCategories);
        db.cashCategories.push('Uang Makan');
        undo.push(() => {
          const idx = db.cashCategories.indexOf('Uang Makan');
          if (idx >= 0) db.cashCategories.splice(idx, 1);
          if (!had) db.cashCategories = [];
        });
      }
    }
  } catch (err) {
    // Rollback mundur
    for (let i = undo.length - 1; i >= 0; i -= 1) {
      try { undo[i](); } catch (_) { /* lanjut memulihkan sisanya */ }
    }
    throw err;
  }

  return { applied: ops.length };
}

/**
 * Ringkasan dampak untuk laporan sebelum/sesudah. Dihitung dari isi db saat ini
 * sehingga aman dipanggil sebelum maupun sesudah koreksi.
 */
function summarize(db, collectionKey) {
  const key = collectionKey || resolveSettlementCollection(db);
  const rows = Array.isArray(db[key]) ? db[key] : [];
  const live = rows.filter((r) => !isVoided(r));
  const movements = Array.isArray(db.cash_movements) ? db.cash_movements : [];
  const byCategory = {};
  movements.forEach((m) => {
    const c = m.category || '(tanpa kategori)';
    byCategory[c] = round2((byCategory[c] || 0) + (Number(m.amount) || 0));
  });
  const byVendor = {};
  live.forEach((r) => {
    const n = r.vendor_name || r.vendor_id || 'Vendor';
    byVendor[n] = round2((byVendor[n] || 0) + (Number(r.vendor_share) || 0));
  });
  return {
    collection: key,
    settlement_rows: rows.length,
    live_settlement_rows: live.length,
    vendor_share_total: round2(live.reduce((a, r) => a + (Number(r.vendor_share) || 0), 0)),
    vendor_share_by_vendor: byVendor,
    carry_out_negative: rows.filter((r) => round2(r.carry_out) < -ROUND_EPS).length,
    cash_out_by_category: byCategory,
    cash_out_total: round2(Object.values(byCategory).reduce((a, b) => a + b, 0)),
  };
}

/**
 * Riwayat koreksi yang pernah diterapkan, dibaca dari jejak `koreksi_audit`
 * pada tiap baris. Dipakai agar operator bisa memeriksa apa yang sudah diubah
 * tanpa menebak dari angka.
 */
function correctionHistory(db, collectionKey) {
  const key = collectionKey || resolveSettlementCollection(db);
  const rows = Array.isArray(db[key]) ? db[key] : [];
  const settlements = rows
    .filter((r) => r && r.koreksi_audit)
    .map((r) => ({
      settlement_no: r.settlement_no,
      id: r.id,
      op: r.koreksi_audit.op,
      batch: r.koreksi_audit.batch || null,
      at: r.koreksi_audit.at,
      reason: r.koreksi_audit.reason,
    }));
  const movements = (Array.isArray(db.cash_movements) ? db.cash_movements : [])
    .filter((m) => m && m.koreksi_audit)
    .map((m) => ({
      id: m.id,
      when: String(m.created_at || '').slice(0, 10),
      op: m.koreksi_audit.op,
      batch: m.koreksi_audit.batch || null,
      at: m.koreksi_audit.at,
      category_before: m.koreksi_audit.category_before,
      category_now: m.category,
      reason: m.koreksi_audit.reason,
    }));
  return {
    collections: key,
    settlements_corrected: settlements.length,
    cash_movements_corrected: movements.length,
    settlements,
    cash_movements: movements,
  };
}

module.exports = {
  round2,
  isVoided,
  resolveSettlementCollection,
  planCorrections,
  applyCorrections,
  summarize,
  correctionHistory,
};
