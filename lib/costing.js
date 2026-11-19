'use strict';

// HPP otomatis tanpa mengisi pemakaian per transaksi.
//
// Alur yang didukung:
//   1. Nota belanja (foto atau diketik) -> qty + harga -> stok bertambah dan
//      harga rata-rata bergerak (`ingredients.cost`) diperbarui.
//   2. Bahan ditandai "dipakai di produk mana" (`used_in`) TANPA jumlah per
//      porsi. Ini yang diminta pemilik: cukup pilih kemana bahan itu pergi.
//   3. Sistem memprediksi HPP per produk dari pool belanja periode itu dibagi
//      jumlah porsi terjual yang memakai bahan tersebut.
//   4. Prediksi bisa diterapkan ke `products.cost_price`, sehingga order
//      berikutnya membawa COGS.
//
// Prediksi ini sengaja diberi label sumber (`predicted_allocation`) supaya
// tidak tertukar dengan HPP resep yang benar-benar dihitung per porsi.

const fs = require('fs');
const path = require('path');

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function roundRp(n) {
  return Math.round(Number(n) || 0);
}

function nowIso() {
  return new Date().toISOString();
}

function dataDir() {
  return process.env.GRANDPOS_DATA_DIR || path.join(__dirname, '..', 'data');
}

function ensureCollection(db, key) {
  if (!Array.isArray(db[key])) db[key] = [];
  return db[key];
}

/**
 * Catat satu baris pembelian bahan.
 *
 * `unit_cost` boleh tidak diisi bila nota hanya menulis total: harga satuan
 * dihitung dari total / qty. Harga rata-rata bergerak hanya dihitung ulang bila
 * harga satuan valid (> 0); nota tanpa harga tidak boleh menghapus harga lama.
 */
function applyPurchase(db, ing, input = {}, meta = {}) {
  const qty = Number(input.qty);
  if (!(qty > 0)) return { error: 'qty harus lebih dari 0' };

  const totalInput = Number(input.total_cost);
  let unitCost = Number(input.unit_cost);
  if (!(unitCost > 0) && totalInput > 0) unitCost = totalInput / qty;
  if (!(unitCost > 0)) unitCost = Number(ing.cost || ing.buy_price || 0);

  const prevStock = Number(ing.stock) || 0;
  const prevCost = Number(ing.cost) || Number(ing.buy_price) || 0;
  const newStock = round2(prevStock + qty);

  // Moving average: stok lama dinilai dengan harga lama, stok baru dengan nota.
  // Kalau stok lama 0 (atau harganya belum pernah diisi), pakai harga nota.
  let newCost = prevCost;
  if (unitCost > 0) {
    newCost = prevStock > 0 && prevCost > 0
      ? (prevStock * prevCost + qty * unitCost) / newStock
      : unitCost;
    newCost = round2(newCost);
  }

  ing.stock = newStock;
  if (unitCost > 0) {
    ing.cost = newCost;
    ing.buy_price = round2(unitCost);
    ing.cost_source = 'purchase';
    ing.last_purchase_at = meta.created_at || nowIso();
    ing.last_purchase_cost = round2(unitCost);
  }

  const record = {
    id: 'ipur-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
    ingredient_id: ing.id,
    ingredient_name: ing.name,
    qty,
    unit: ing.unit || input.unit || '',
    unit_cost: round2(unitCost),
    total_cost: roundRp(unitCost * qty),
    cost_before: prevCost,
    cost_after: Number(ing.cost) || 0,
    stock_before: prevStock,
    stock_after: newStock,
    supplier: meta.supplier || input.supplier || '',
    invoice_no: meta.invoice_no || input.invoice_no || '',
    purchase_date: meta.purchase_date || input.purchase_date || '',
    nota_id: meta.nota_id || '',
    note: meta.note || input.note || '',
    created_at: meta.created_at || nowIso(),
    created_by: meta.created_by || '',
  };

  ensureCollection(db, 'ingredientPurchases').unshift(record);
  return { record };
}

/** Simpan bahan mana saja yang memakai sebuah ingredient (tanpa qty). */
function setUsedIn(db, ing, productIds) {
  const valid = new Set(ensureCollection(db, 'products').map((p) => p.id));
  const list = Array.isArray(productIds) ? productIds : [];
  ing.used_in = [...new Set(list.map((id) => String(id)).filter((id) => valid.has(id)))];
  ing.used_in_updated_at = nowIso();
  return ing.used_in;
}

function periodRange({ days = 30, from, to } = {}) {
  const toTs = to ? new Date(to).getTime() : Date.now();
  const safeTo = Number.isFinite(toTs) ? toTs : Date.now();
  const fromTs = from ? new Date(from).getTime() : safeTo - Math.max(1, Number(days) || 30) * 86400000;
  return {
    from: new Date(Number.isFinite(fromTs) ? fromTs : safeTo - 30 * 86400000).toISOString(),
    to: new Date(safeTo).toISOString(),
    days: Math.max(1, Number(days) || 30),
  };
}

/**
 * Prediksi HPP per produk dari pool belanja + peta "bahan dipakai di mana".
 *
 * Untuk bahan I dengan total belanja C pada periode dan produk P1..Pn yang
 * memakainya, biaya per porsi I = C / (total porsi terjual P1..Pn). Angka itu
 * ditambahkan ke HPP setiap produk yang memakai I. Tidak perlu qty per porsi;
 * asumsinya pemakaian per porsi setara antar produk yang memakai bahan yang
 * sama. Itu sebabnya hasilnya disebut prediksi, bukan HPP audit.
 *
 * Produk yang sudah punya resep tidak diikutkan (resep lebih akurat dan
 * `computeRecipeHpp` yang menulis HPP-nya).
 */
function predictHpp(db, options = {}) {
  const period = periodRange(options);
  const fromTs = new Date(period.from).getTime();
  const toTs = new Date(period.to).getTime();
  const ingredients = ensureCollection(db, 'ingredients');
  const products = ensureCollection(db, 'products');
  const recipes = ensureCollection(db, 'recipes');

  const recipeByProduct = new Map();
  for (const r of recipes) {
    if (r && r.product_id) recipeByProduct.set(r.product_id, r);
  }

  const pools = new Map();
  const purchaseCount = new Map();
  for (const p of ensureCollection(db, 'ingredientPurchases')) {
    const ts = new Date(p.created_at || p.purchase_date || 0).getTime();
    if (!Number.isFinite(ts) || ts < fromTs || ts > toTs) continue;
    const id = p.ingredient_id;
    if (!id) continue;
    const total = Number(p.total_cost);
    const fallback = Number(p.qty || 0) * Number(p.unit_cost || 0);
    pools.set(id, (pools.get(id) || 0) + (Number.isFinite(total) && total > 0 ? total : fallback));
    purchaseCount.set(id, (purchaseCount.get(id) || 0) + 1);
  }

  // Penjualan periode ini menjadi pembagi pool. Hanya order yang benar-benar
  // selesai; void/refund tidak boleh menaikkan HPP.
  const unitsSold = new Map();
  const revenue = new Map();
  const voided = new Set(['void', 'voided', 'refund', 'refunded', 'cancelled', 'canceled']);
  for (const o of ensureCollection(db, 'orders')) {
    const status = String(o.status || 'completed').toLowerCase();
    if (voided.has(status)) continue;
    const ts = new Date(o.paid_at || o.completed_at || o.created_at || 0).getTime();
    if (!Number.isFinite(ts) || ts < fromTs || ts > toTs) continue;
    for (const it of Array.isArray(o.items) ? o.items : []) {
      const pid = it.product_id || it.id;
      if (!pid) continue;
      const qty = Number(it.qty) || 1;
      unitsSold.set(pid, (unitsSold.get(pid) || 0) + qty);
      revenue.set(pid, (revenue.get(pid) || 0) + (Number(it.price) || 0) * qty);
    }
  }

  const allocations = new Map(); // product_id -> { amount, components[] }
  const addAllocation = (pid, amount, component) => {
    const cur = allocations.get(pid) || { amount: 0, components: [] };
    cur.amount += amount;
    cur.components.push(component);
    allocations.set(pid, cur);
  };

  const ingredientRows = [];
  let unallocatedPool = 0;
  const warnings = [];

  for (const ing of ingredients) {
    const pool = roundRp(pools.get(ing.id) || 0);
    const mapped = (Array.isArray(ing.used_in) ? ing.used_in : [])
      .map((id) => products.find((p) => p.id === id))
      .filter(Boolean)
      // Resep menang; jangan membagi pool ke produk yang HPP-nya sudah akurat.
      .filter((p) => !recipeByProduct.has(p.id));

    const row = {
      ingredient_id: ing.id,
      name: ing.name,
      unit: ing.unit || '',
      stock: Number(ing.stock) || 0,
      cost: Number(ing.cost) || 0,
      pool,
      purchases: purchaseCount.get(ing.id) || 0,
      mapped_products: mapped.map((p) => ({ id: p.id, name: p.name })),
      status: 'ok',
      predicted_per_portion: 0,
    };

    if (pool <= 0) {
      row.status = 'no_purchase';
      ingredientRows.push(row);
      continue;
    }
    if (!mapped.length) {
      row.status = 'unmapped';
      unallocatedPool += pool;
      ingredientRows.push(row);
      continue;
    }

    const totalUnits = mapped.reduce((s, p) => s + (unitsSold.get(p.id) || 0), 0);
    if (totalUnits <= 0) {
      row.status = 'no_sales';
      unallocatedPool += pool;
      ingredientRows.push(row);
      warnings.push(`Bahan "${ing.name}" belum bisa diprediksi: belum ada penjualan produk yang memakainya pada periode ini.`);
      continue;
    }

    const perPortion = pool / totalUnits;
    row.predicted_per_portion = roundRp(perPortion);
    for (const p of mapped) {
      const units = unitsSold.get(p.id) || 0;
      if (units <= 0) continue;
      // Biaya per porsi, bukan total biaya bahan untuk semua porsi produk itu.
      addAllocation(p.id, perPortion, {
        ingredient_id: ing.id,
        ingredient: ing.name,
        pool,
        total_units: totalUnits,
        portion_cost: roundRp(perPortion),
      });
    }
    ingredientRows.push(row);
  }

  // Susun baris produk: resep, prediksi, atau belum punya HPP sama sekali.
  const productIds = new Set([
    ...allocations.keys(),
    ...recipeByProduct.keys(),
    ...unitsSold.keys(),
  ]);

  const rows = [];
  let revenueWithHpp = 0;
  let revenueTotal = 0;
  let hppProducts = 0;

  for (const pid of productIds) {
    const prod = products.find((p) => p.id === pid);
    if (!prod) continue;
    const sold = unitsSold.get(pid) || 0;
    const rev = revenue.get(pid) || 0;
    revenueTotal += rev;

    const recipe = recipeByProduct.get(pid);
    const allocation = allocations.get(pid);
    let predicted = 0;
    let source = 'none';
    let confidence = 'none';

    if (recipe && typeof options.recipeHpp === 'function') {
      const calc = options.recipeHpp(recipe);
      predicted = roundRp(calc && calc.hpp ? calc.hpp.hpp_per_unit : 0);
      source = 'recipe';
      confidence = 'accurate';
    } else if (allocation && allocation.amount > 0) {
      predicted = roundRp(allocation.amount);
      source = 'predicted_allocation';
      confidence = 'estimate';
    }

    if (predicted > 0) {
      hppProducts += 1;
      revenueWithHpp += rev;
    }

    const price = Number(prod.price) || 0;
    rows.push({
      product_id: pid,
      name: prod.name,
      category_id: prod.category_id || null,
      price,
      sold_units: round2(sold),
      revenue: roundRp(rev),
      current_cost_price: Number(prod.cost_price) || 0,
      predicted_hpp: predicted,
      source,
      confidence,
      margin_percent: price > 0 && predicted > 0
        ? round2(((price - predicted) / price) * 100)
        : null,
      components: allocation ? allocation.components.map((c) => ({
        ...c,
        allocated: roundRp((c.pool / c.total_units) * (unitsSold.get(pid) || 0)),
      })) : [],
    });
  }

  rows.sort((a, b) => b.revenue - a.revenue || String(a.name).localeCompare(String(b.name)));

  const soldRows = rows.filter((r) => r.sold_units > 0);
  const missingMapping = ingredients.filter((ing) => {
    const pool = pools.get(ing.id) || 0;
    const mapped = Array.isArray(ing.used_in) ? ing.used_in : [];
    return pool > 0 && mapped.length === 0;
  }).map((ing) => ({ id: ing.id, name: ing.name, pool: roundRp(pools.get(ing.id) || 0) }));

  const totalPurchases = [...pools.values()].reduce((s, v) => s + v, 0);

  return {
    method: 'allocated_by_sales_units',
    label: 'Prediksi: pool belanja bahan dibagi porsi terjual',
    period,
    summary: {
      purchases_total: roundRp(totalPurchases),
      unallocated_pool: roundRp(unallocatedPool),
      ingredients_total: ingredients.length,
      ingredients_purchased: ingredientRows.filter((r) => r.pool > 0).length,
      products_total: products.length,
      products_with_hpp: hppProducts,
      products_sold: soldRows.length,
      products_without_mapping: missingMapping.length,
      revenue_total: roundRp(revenueTotal),
      revenue_with_hpp: roundRp(revenueWithHpp),
      coverage_percent: revenueTotal > 0 ? round2((revenueWithHpp / revenueTotal) * 100) : 0,
    },
    ingredients: ingredientRows.sort((a, b) => b.pool - a.pool),
    missing_mapping: missingMapping.sort((a, b) => b.pool - a.pool),
    products: rows,
    warnings,
  };
}

/**
 * Tulis hasil prediksi ke `products.cost_price`. Produk beresep dilewati karena
 * HPP-nya sudah ditulis oleh resep; produk tanpa angka dilewati apa adanya.
 */
function applyPrediction(db, prediction, options = {}) {
  const wanted = Array.isArray(options.productIds) && options.productIds.length
    ? new Set(options.productIds)
    : null;
  const applied = [];
  const skipped = [];
  const products = ensureCollection(db, 'products');

  for (const row of prediction.products || []) {
    if (wanted && !wanted.has(row.product_id)) continue;
    const prod = products.find((p) => p.id === row.product_id);
    if (!prod) {
      skipped.push({ product_id: row.product_id, name: row.name, reason: 'product_missing' });
      continue;
    }
    if (row.source === 'recipe') {
      skipped.push({ product_id: prod.id, name: prod.name, reason: 'recipe_hpp_wins' });
      continue;
    }
    if (!(row.predicted_hpp > 0)) {
      skipped.push({ product_id: prod.id, name: prod.name, reason: 'no_prediction' });
      continue;
    }
    const previous = Number(prod.cost_price) || 0;
    prod.cost_price = roundRp(row.predicted_hpp);
    prod.cost_source = 'predicted_allocation';
    prod.cost_updated_at = nowIso();
    applied.push({
      product_id: prod.id,
      name: prod.name,
      previous_cost_price: previous,
      cost_price: prod.cost_price,
    });
  }

  ensureCollection(db, 'costingRuns').unshift({
    id: 'cost-' + Date.now(),
    method: prediction.method,
    period: prediction.period,
    applied: applied.length,
    skipped: skipped.length,
    coverage_percent: prediction.summary ? prediction.summary.coverage_percent : 0,
    created_at: nowIso(),
    created_by: options.created_by || '',
  });
  if (db.costingRuns.length > 200) db.costingRuns.length = 200;

  return { applied, skipped };
}

/** Simpan foto nota ke <data>/nota dan kembalikan path relatifnya. */
function saveNotaPhoto(dataUrl, id) {
  if (typeof dataUrl !== 'string' || !dataUrl) return '';
  const match = /^data:image\/(png|jpe?g|webp);base64,([A-Za-z0-9+/=\s]+)$/i.exec(dataUrl.trim());
  if (!match) return '';
  const ext = match[1].toLowerCase() === 'jpeg' ? 'jpg' : match[1].toLowerCase();
  const buf = Buffer.from(match[2], 'base64');
  if (!buf.length || buf.length > 6 * 1024 * 1024) return '';
  const dir = path.join(dataDir(), 'nota');
  fs.mkdirSync(dir, { recursive: true });
  const name = `${id}.${ext}`;
  fs.writeFileSync(path.join(dir, name), buf);
  return path.posix.join('nota', name);
}

module.exports = {
  round2,
  roundRp,
  dataDir,
  ensureCollection,
  applyPurchase,
  setUsedIn,
  periodRange,
  predictHpp,
  applyPrediction,
  saveNotaPhoto,
};
