#!/usr/bin/env node
// Isolated probe for the "HPP tanpa mengisi pemakaian" flow:
//
//   nota belanja (foto / diketik)
//     -> stok + harga rata-rata bergerak
//     -> bahan ditandai dipakai di produk mana (tanpa qty)
//     -> pool belanja dibagi porsi terjual = prediksi HPP
//     -> products.cost_price terisi
//
// Pins the moving average, the allocation maths, that a recipe HPP always wins,
// the mapping endpoint, photo persistence, and that the old fake AI invoice
// stub can no longer invent items.
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const bcrypt = require('bcryptjs');

const ROOT = path.join(__dirname, '..');
const snap = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/pos-db.json'), 'utf8'));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gak-hpp-predict-'));

const user = {
  id: 'hpp-predict-owner', username: 'hpp-predict-owner', name: 'HPP Predict Owner',
  role: 'superadmin', role_base: 'superadmin', is_superadmin: true, active: true,
  password_hash: bcrypt.hashSync('hpp-predict-pass', 10),
};
snap.data.users = [user];
snap.data.voidRows = [];
snap.data.shifts = [];
snap.data.shiftHistory = [];
snap.data.recipes = [];
snap.data.costingRuns = [];
snap.data.ingredientNotas = [];
// No real vision key: the endpoint must say "belum aktif", not invent items.
snap.data.ai = { gemini_keys: ['AIzaSyDummyGeminiKeyAutoRotated1'] };
snap.data.settings = snap.data.settings || {};
snap.data.settings.ai = { gemini_keys: [] };
delete process.env.GEMINI_API_KEY;

snap.data.products = [
  { id: 'p-nasi', name: 'Nasi Goreng', price: 20000, type: 'makanan', cost: 0, cost_price: 0, active: true },
  { id: 'p-mie', name: 'Mie Aceh', price: 10000, type: 'makanan', cost: 0, cost_price: 0, active: true },
  { id: 'p-ayam', name: 'Ayam Tangkap', price: 30000, type: 'makanan', cost: 0, cost_price: 0, active: true },
];
snap.data.ingredients = [
  // Stok lama 5 @ Rp1.000 -> nota 10 @ Rp2.000 => rata-rata Rp1.666,67
  { id: 'ing-beras', name: 'Beras', unit: 'kg', stock: 5, cost: 1000, buy_price: 1000, used_in: ['p-nasi', 'p-mie'] },
  { id: 'ing-bumbu', name: 'Bumbu', unit: 'kg', stock: 0, cost: 0, buy_price: 0, used_in: ['p-nasi'] },
];
// Resep hanya untuk ayam; HPP-nya harus menang atas prediksi.
snap.data.recipes = [{
  id: 'rec-ayam', product_id: 'p-ayam', yield_units: 1,
  ingredients: [{ ingredient_id: 'ing-beras', qty: 1 }],
}];

const now = new Date().toISOString();
const sale = (id, items) => ({
  id, order_number: id, status: 'completed', paid_at: now, created_at: now,
  payment_method: 'cash', total: items.reduce((s, it) => s + it.price * it.qty, 0),
  items: items.map((it) => ({ product_id: it.product_id, name: it.name, qty: it.qty, price: it.price, cost: it.cost || 0 })),
});
snap.data.orders = [
  // Baris lama tanpa HPP (cost 0) harus memakai HPP katalog saat laporan dibuka.
  sale('ord-nasi', [{ product_id: 'p-nasi', name: 'Nasi Goreng', qty: 10, price: 20000 }]),
  // Baris yang sudah punya snapshot HPP tidak boleh berubah saat HPP diterapkan ulang.
  sale('ord-mie', [{ product_id: 'p-mie', name: 'Mie Aceh', qty: 30, price: 10000, cost: 700 }]),
  sale('ord-ayam', [{ product_id: 'p-ayam', name: 'Ayam Tangkap', qty: 5, price: 30000 }]),
];

fs.writeFileSync(path.join(tmp, 'pos-db.json'), JSON.stringify(snap));

const PORT = 3996;
process.env.PORT = String(PORT);
process.env.NODE_ENV = 'test';
process.env.GRANDPOS_DATA_DIR = tmp;
process.env.JWT_SECRET = 'hpp-predict-secret';
process.env.NODE_SYNC_KEY = '';

const app = require(path.join(ROOT, 'api-server.js'));
const req = (method, p, body, token) => new Promise((resolve, reject) => {
  const raw = body ? JSON.stringify(body) : null;
  const headers = raw ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(raw) } : {};
  if (token) headers.Authorization = `Bearer ${token}`;
  const r = http.request({ host: '127.0.0.1', port: PORT, path: p, method, headers }, (res) => {
    let s = '';
    res.on('data', (c) => { s += c; });
    res.on('end', () => { let b = s; try { b = JSON.parse(s); } catch (_) {} resolve({ status: res.statusCode, body: b }); });
  });
  r.on('error', reject);
  if (raw) r.write(raw);
  r.end();
});
const readDb = () => JSON.parse(fs.readFileSync(path.join(tmp, 'pos-db.json'), 'utf8')).data;

(async () => {
  const server = app.listen(PORT, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  try {
    const login = await req('POST', '/api/auth/login', { username: user.username, password: 'hpp-predict-pass' });
    assert.strictEqual(login.status, 200, JSON.stringify(login.body).slice(0, 200));
    const token = login.body.token;

    // 1. Nota: satu baris harga satuan, satu baris hanya total. Foto ikut disimpan.
    const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    const nota = await req('POST', '/api/ingredients/nota', {
      supplier: 'Toko Beras Aceh',
      invoice_no: 'INV-001',
      photo: `data:image/png;base64,${png}`,
      items: [
        { ingredient_id: 'ing-beras', qty: 10, unit_cost: 2000 },
        { ingredient_id: 'ing-bumbu', qty: 5, total_cost: 50000 },
      ],
    }, token);
    assert.strictEqual(nota.status, 200, JSON.stringify(nota.body).slice(0, 300));
    assert.strictEqual(nota.body.saved, 2);
    assert.strictEqual(nota.body.nota.supplier, 'Toko Beras Aceh');
    assert.ok(nota.body.nota.photo_path, 'foto nota tersimpan');
    assert.ok(fs.existsSync(path.join(tmp, nota.body.nota.photo_path)), 'berkas foto ada di data/nota');
    assert.strictEqual(nota.body.applied.applied.length, 2, 'dua produk non-resep menerima HPP');

    const photo = await req('GET', `/api/ingredients/nota/${nota.body.nota.id}/photo`, null, token);
    assert.strictEqual(photo.status, 200, 'foto nota bisa diambil kembali');

    await new Promise((r) => setTimeout(r, 700));
    const db = readDb();
    const beras = db.ingredients.find((i) => i.id === 'ing-beras');
    const bumbu = db.ingredients.find((i) => i.id === 'ing-bumbu');
    assert.strictEqual(beras.stock, 15, 'stok lama + qty nota');
    assert.ok(Math.abs(beras.cost - 1666.67) < 0.01, `moving average beras, dapat ${beras.cost}`);
    assert.strictEqual(bumbu.stock, 5);
    assert.strictEqual(bumbu.cost, 10000, 'total nota / qty saat unit_cost kosong');
    assert.strictEqual(bumbu.buy_price, 10000);

    // 2. Prediksi: pool beras 20.000 / 40 porsi = 500; bumbu 50.000 / 10 = 5.000.
    const prediction = await req('GET', '/api/costing/prediction?days=30', null, token);
    assert.strictEqual(prediction.status, 200, JSON.stringify(prediction.body).slice(0, 300));
    const row = (id) => prediction.body.products.find((p) => p.product_id === id);
    assert.strictEqual(row('p-nasi').predicted_hpp, 5500, 'nasi = 500 beras + 5.000 bumbu');
    assert.strictEqual(row('p-mie').predicted_hpp, 500, 'mie hanya memakai beras');
    assert.strictEqual(row('p-ayam').predicted_hpp, 1667, 'resep menang: 1 kg beras @ rata-rata 1.666,67');
    assert.strictEqual(row('p-ayam').source, 'recipe');
    assert.strictEqual(prediction.body.summary.coverage_percent, 100, 'semua omzet punya HPP');

    // 3. Prediksi sudah diterapkan ke katalog.
    const nasi = db.products.find((p) => p.id === 'p-nasi');
    const mie = db.products.find((p) => p.id === 'p-mie');
    assert.strictEqual(nasi.cost_price, 5500);
    assert.strictEqual(mie.cost_price, 500);
    assert.strictEqual(nasi.cost_source, 'predicted_allocation');

    // 3b. Laporan profit: baris order yang sudah punya snapshot cost tidak
    //     berubah; baris lama `cost = 0` memakai HPP katalog yang baru.
    const report = await req('GET', '/api/reports/period?start=2000-01-01&end=2100-01-01', null, token);
    assert.strictEqual(report.status, 200, JSON.stringify(report.body).slice(0, 200));
    assert.strictEqual(report.body.total_cost, 76000, 'nasi 10×5.500 + mie 30×700');

    // 4. Pindahkan pemakaian bumbu dari nasi ke mie, hitung ulang.
    const moved = await req('PUT', '/api/ingredients/ing-bumbu/usage-targets', { product_ids: ['p-mie'] }, token);
    assert.strictEqual(moved.status, 200);
    assert.deepStrictEqual(moved.body.product_ids, ['p-mie']);
    const rerun = await req('GET', '/api/costing/prediction?days=30', null, token);
    assert.strictEqual(rerun.body.products.find((p) => p.product_id === 'p-nasi').predicted_hpp, 500);
    // Bumbu 50.000 dibagi 30 porsi mie = 1.667; beras tetap 500.
    assert.strictEqual(rerun.body.products.find((p) => p.product_id === 'p-mie').predicted_hpp, 2167);

    // 5. Bahan yang belum dipetakan dilaporkan, bukan diam-diam HPP 0.
    await req('PUT', '/api/ingredients/ing-bumbu/usage-targets', { product_ids: [] }, token);
    const unmapped = await req('GET', '/api/costing/coverage?days=30', null, token);
    assert.strictEqual(unmapped.body.summary.products_without_mapping, 1);
    assert.strictEqual(unmapped.body.missing_mapping[0].id, 'ing-bumbu');

    // 6. Tanpa kunci vision nyata, scan tidak boleh mengarang bahan.
    const vision = await req('POST', '/api/ai/ingredient-vision', { image: `data:image/png;base64,${png}` }, token);
    assert.strictEqual(vision.status, 503, JSON.stringify(vision.body));
    assert.strictEqual(vision.body.mode, 'manual');

    console.log('PASS hpp-prediction-nota: moving average, allocation 500/5.000, recipe wins, mapping, photo, no fake AI');
  } finally {
    server.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
})().catch((err) => {
  console.error('FAIL hpp-prediction-nota-isolated.js');
  console.error(err && err.stack || err);
  process.exit(1);
});
