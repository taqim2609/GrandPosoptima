/**
 * Vendor settlement ledger — aturan saldo (carry) dan pembayaran.
 *
 * Latar belakang (audit Grand Aceh Kuliner, 7 Nov 2026):
 *  - STL-20260913-0002 sudah membayar Rp 961.200 dari hak Bakso Rp 988.200,
 *    menyisakan Rp 27.000. Tiga puluh menit kemudian settlement manual
 *    STL-20260913-0004 dibuat dengan `carry_in = 0` sehingga sistem menganggap
 *    hak Rp 988.200 belum pernah timbul, membukukan Rp 27.000 sebagai
 *    pembayaran, lalu menulis ulang utang Rp 961.200. Hasilnya hak Bakso
 *    tercatat dua kali (Rp 988.200 ganda) dan utang vendor membengkak
 *    Rp 934.200 di atas yang sebenarnya.
 *  - STL-20260829-0001..0003 dan STL-20260914-0001 membayar lebih besar dari
 *    total tagihannya (paid 5.377.200 atas tagihan 804.300) sehingga
 *    `carry_out` menjadi negatif.
 *  - Settlement yang di-void tidak menarik kembali baris kas keluarnya,
 *    sehingga saldo kas ikut salah.
 *
 * Modul ini sengaja murni (tidak menyentuh `db` langsung) supaya aturan saldo
 * bisa diuji tanpa menyalakan server, dan supaya satu sumber kebenaran dipakai
 * bersama oleh endpoint board, create, dan void.
 */

/** Selisih di bawah ini dianggap nol (pembulatan sen). */
const EPSILON = 0.009;

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function round2(value) {
  return Math.round(num(value) * 100) / 100;
}

/** Urutan kronologis yang deterministik: waktu dibuat, lalu nomor settlement. */
function compareSettlements(a, b) {
  const ta = Date.parse(a && a.created_at ? a.created_at : '') || 0;
  const tb = Date.parse(b && b.created_at ? b.created_at : '') || 0;
  if (ta !== tb) return ta - tb;
  return String((a && a.settlement_no) || '').localeCompare(String((b && b.settlement_no) || ''));
}

function isVoided(settlement) {
  if (!settlement) return false;
  return settlement.voided === true || settlement.status === 'voided' || settlement.status === 'void';
}

/**
 * Seluruh settlement milik satu vendor, urut kronologis, yang di-void dibuang.
 */
function liveSettlementsFor(vendorId, settlements) {
  return (settlements || [])
    .filter((s) => s && s.vendor_id === vendorId && !isVoided(s))
    .sort(compareSettlements);
}

/**
 * Saldo hutang vendor saat ini = `carry_out` settlement hidup terakhir.
 * Vendor tanpa settlement hidup berarti tidak punya hutang tercatat.
 */
function currentVendorBalance(vendorId, settlements) {
  const rows = liveSettlementsFor(vendorId, settlements);
  if (rows.length === 0) return 0;
  return round2(rows[rows.length - 1].carry_out);
}

/**
 * `carry_in` yang WAJIB dipakai saat membuat settlement baru: selalu saldo
 * terakhir vendor, bukan angka yang dikirim klien. Inilah penambal dobel
 * hitung Rp 988.200 — klien tidak lagi bisa "lupa" membawa saldo.
 */
function expectedCarryIn(vendorId, settlements, options = {}) {
  // Saat membuat settlement pengganti untuk tanggal yang sama, settlement yang
  // sedang digantikan boleh diabaikan agar saldonya tidak terhitung dua kali.
  const excludeIds = new Set((options.excludeIds || []).filter(Boolean));
  const rows = liveSettlementsFor(vendorId, settlements).filter((s) => !excludeIds.has(s.id));
  if (rows.length === 0) return 0;
  return round2(rows[rows.length - 1].carry_out);
}

/**
 * Hitung satu settlement secara utuh dari angka yang tidak bisa dimanipulasi:
 * carry masuk, hak vendor (share) dan pembayaran.
 *
 * Mengembalikan `{ ok, errors, carry_in, total_due, carry_out, ... }`.
 * `errors` berisi kode yang bisa dipetakan ke HTTP 4xx oleh pemanggil.
 */
function computeSettlement({ vendorId, vendorShare, paid, settlements, excludeIds }) {
  const share = round2(vendorShare);
  const pay = round2(paid);
  const carryIn = expectedCarryIn(vendorId, settlements, { excludeIds });
  const totalDue = round2(carryIn + share);
  const errors = [];

  if (!vendorId) {
    errors.push({ code: 'vendor_required', detail: 'vendor_id wajib diisi.' });
  }
  if (share < 0) {
    errors.push({ code: 'share_negative', detail: `Hak vendor tidak boleh negatif (${share}).` });
  }
  if (pay < 0) {
    errors.push({ code: 'paid_negative', detail: `Nominal dibayar tidak boleh negatif (${pay}).` });
  }
  // Utang vendor tidak pernah negatif: carry yang negatif berarti data sudah
  // rusak sebelumnya dan tidak boleh dipakai sebagai dasar pembayaran baru.
  if (carryIn < -EPSILON) {
    errors.push({
      code: 'carry_negative',
      detail: `Saldo vendor ${carryIn} negatif — perbaiki settlement sebelumnya sebelum membayar lagi.`,
    });
  }
  // Pembayaran melebihi tagihan dulu diterima dan menghasilkan carry_out
  // negatif (STL-20260829-0001 paid 5.377.200 atas tagihan 804.300). Tolak.
  if (pay - totalDue > EPSILON) {
    errors.push({
      code: 'overpayment',
      detail: `Pembayaran ${pay} melebihi total tagihan ${totalDue} (kelebihan ${round2(pay - totalDue)}).`,
    });
  }

  return {
    ok: errors.length === 0,
    errors,
    vendor_id: vendorId || null,
    vendor_share: share,
    carry_in: carryIn,
    total_due: totalDue,
    paid: pay,
    carry_out: round2(totalDue - pay),
  };
}

/**
 * Baris board settlement per vendor untuk satu tanggal.
 *
 * `rows` diambil dari data order (`order.vendor_share` bila ada, kalau tidak
 * dihitung dari `order.items[].vendor_share`) — bukan dari daftar produk.
 * Persentase diambil dari item, atau dari `vendor.share_percent` bila item
 * tidak membawa angka; TIDAK ada default 80% yang diciptakan sendiri.
 */
function buildVendorBoard({ vendors, orders, settlements, date, wibDate }) {
  const dateOf = wibDate || ((o) => (o && o.created_at ? String(o.created_at).slice(0, 10) : ''));
  const paidOrders = (orders || []).filter((o) => {
    if (!o) return false;
    if (o.status !== 'completed' && o.status !== 'paid') return false;
    return dateOf(o) === date;
  });

  return (vendors || []).map((vendor) => {
    const items = [];
    let gross = 0;
    let share = 0;
    let shareFromConfiguredPercent = 0;

    paidOrders.forEach((order) => {
      const perVendor = Array.isArray(order.vendor_share)
        ? order.vendor_share.find((v) => v && v.vendor_id === vendor.id)
        : null;
      if (perVendor) {
        gross += num(perVendor.gross);
        share += num(perVendor.share);
        (perVendor.items || []).forEach((it) => items.push({ ...it }));
        return;
      }
      (order.items || []).forEach((it) => {
        if (!it || it.vendor_id !== vendor.id) return;
        const lineGross = num(it.gross) || num(it.price) * (num(it.qty) || 1);
        if (lineGross <= 0) return;
        const rate = rateForItem(it, vendor);
        const lineShare = it.vendor_share !== undefined && it.vendor_share !== null
          ? num(it.vendor_share)
          : round2(lineGross * rate);
        if (rate === null) {
          // Tidak ada persentase di item maupun di master vendor: jangan
          // mengarang 80%. Catat omzet saja dan tandai untuk ditinjau.
          shareFromConfiguredPercent += 0;
        }
        gross += lineGross;
        share += lineShare;
        items.push({
          product_id: it.product_id || it.id || null,
          name: it.name || '',
          qty: num(it.qty) || 1,
          gross: lineGross,
          vendor_share: lineShare,
        });
      });
    });

    const carryIn = currentVendorBalance(vendor.id, settlements);
    return {
      vendor_id: vendor.id,
      vendor_name: vendor.name,
      gross: round2(gross),
      share: round2(share),
      carry_in: carryIn,
      total_due: round2(carryIn + share),
      paid_settled: round2(
        (settlements || [])
          .filter((s) => s && s.vendor_id === vendor.id && !isVoided(s) && s.date === date)
          .reduce((acc, s) => acc + num(s.paid), 0)
      ),
      remaining: round2(carryIn + share - (settlements || [])
        .filter((s) => s && s.vendor_id === vendor.id && !isVoided(s) && s.date === date)
        .reduce((acc, s) => acc + num(s.paid), 0)),
      items,
      share_from_configured_percent: round2(shareFromConfiguredPercent),
    };
  });
}

/**
 * Persentase bagi hasil efektif: dari item, atau dari master vendor.
 * Mengembalikan null bila tidak ada sumber angka (bukan 0.8 default).
 */
function rateForItem(item, vendor) {
  const itemRate = num(item && (item.vendor_share_percent ?? item.share_percent));
  if (itemRate > 0) return itemRate > 1 ? itemRate / 100 : itemRate;
  const vendorRate = num(vendor && (vendor.share_percent ?? vendor.profit_share_percent));
  if (vendorRate > 0) return vendorRate > 1 ? vendorRate / 100 : vendorRate;
  return null;
}

module.exports = {
  EPSILON,
  num,
  round2,
  compareSettlements,
  isVoided,
  liveSettlementsFor,
  currentVendorBalance,
  expectedCarryIn,
  computeSettlement,
  buildVendorBoard,
  rateForItem,
};
