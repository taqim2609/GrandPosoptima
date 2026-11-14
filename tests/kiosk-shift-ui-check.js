/**
 * Uji UI terhadap KIOSK kasir TANPA kredensial produksi.
 *
 * Kiosk (project-frontend-1) hanya menyajikan SPA statis + mem-proxy /api/ ke
 * Gudang. Untuk membuktikan bahwa bundle yang disajikan kiosk benar-benar
 * menghasilkan UI "satu formulir input langsung", uji ini:
 *   1. memuat bundle LANGSUNG dari kiosk (http://<kiosk>/static/js/main.<hash>.js)
 *      dan memeriksa isinya (bukan bundle gudang),
 *   2. merender SPA kiosk di browser lalu menyuntikkan route /api/** dengan
 *      respons sintetis (shift terbuka + vendor) supaya halaman /shift tampil,
 *   3. memeriksa DOM: tidak ada tab "Mode Terpandu"/stepper, semua bagian form ada.
 *
 * Tidak ada kredensial yang dipakai atau ditebak.
 *
 * Run: node tests/kiosk-shift-ui-check.js http://100.109.98.56
 */
const fs = require('fs');
// Resolve playwright from this repo rather than an absolute path that may not exist.
const { chromium } = (() => {
  for (const id of [process.env.PLAYWRIGHT_MODULE, 'playwright-core', 'playwright']) {
    if (!id) continue;
    try { return require(id); } catch (_) {}
  }
  throw new Error('playwright not installed: npm i -D playwright-core');
})();

const BASE = process.argv[2] || 'http://100.109.98.56';

let passed = 0;
let failed = 0;
function check(cond, msg, extra) {
  if (cond) { passed += 1; console.log(`  ok   ${msg}`); }
  else { failed += 1; console.log(`  FAIL ${msg}${extra === undefined ? '' : ` -> ${JSON.stringify(extra)}`}`); }
}

// Data sintetis: satu shift terbuka, tanpa penjualan vendor.
const NOW = new Date().toISOString();
const SHIFT = {
  id: 's-ui-check', user_id: 'u', user_name: 'Kasir', opened_by: 'Kasir',
  start_cash: 0, opening_cash_fnb: 0, opening_cash_retail: 0,
  opened_at: NOW, status: 'open',
  cash_sales: 0, non_cash_sales: 0, total_sales: 0, orders_count: 0,
  wa_auto_shift: false,
};
const BUSINESS = { name: 'Grand Aceh Kuliner', fnb_label: 'F&B', retail_label: 'Retail', transport_amount: 20000 };

(async () => {
  const candidates = [
    '/root/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome',
    '/root/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome',
    process.env.PLAYWRIGHT_CHROMIUM,
  ].filter(Boolean);
  const executablePath = candidates.find((p) => { try { return fs.existsSync(p); } catch (_) { return false; } });

  const browser = await chromium.launch(executablePath ? { executablePath } : {});
  const page = await browser.newPage({ viewport: { width: 1280, height: 2200 } });

  const loadedAssets = [];

  try {
    console.log(`\nTarget kiosk: ${BASE}\n`);

    // --- [1] Bundle yang disajikan kiosk -----------------------------------
    console.log('[1] Bundle yang disajikan kiosk');
    const idx = await page.request.get(`${BASE}/`);
    const html = await idx.text();
    const mBundle = html.match(/static\/js\/main\.[a-z0-9]+\.js/);
    const mCss = html.match(/static\/css\/main\.[a-z0-9]+\.css/);
    const jsFile = mBundle ? mBundle[0].split('/').pop() : '';
    const cssFile = mCss ? mCss[0].split('/').pop() : '';
    check(Boolean(jsFile), 'index.html kiosk merujuk bundle JS', jsFile);

    const jsRes = await page.request.get(`${BASE}/static/js/${jsFile}`);
    const jsBody = await jsRes.text();
    check(jsRes.status() === 200, `bundle ${jsFile} dapat diunduh dari kiosk`, jsRes.status());
    check(!/Mode Terpandu/.test(jsBody), 'bundle kiosk TIDAK memuat teks "Mode Terpandu"');
    check(!/mode-guided-btn|mode-manual-btn|guided-stepper/.test(jsBody),
      'bundle kiosk TIDAK memuat tab/stepper mode terpandu');
    check(/guided-shift-closing-container/.test(jsBody) && /step-final-close/.test(jsBody),
      'bundle kiosk memuat formulir tutup shift versi baru');

    // --- [2] Render SPA kiosk dengan API sintetis -------------------------
    console.log('\n[2] Render halaman /shift dari kiosk (API disuntik)');
    await page.route('**/api/**', async (route) => {
      const url = route.request().url();
      let body = {};
      if (url.includes('/api/shifts/current/vendor')) body = { vendors: [] };
      else if (url.includes('/api/shifts/current')) body = SHIFT;
      else if (url.includes('/api/cash/categories')) body = { categories: ['Belanja Operasional'] };
      else if (url.includes('/api/cash')) body = { out_fnb: 0, out_retail: 0, empty: true };
      else if (url.includes('/api/reports/summary')) body = { cash_sales_fnb: 0, cash_sales_retail: 0, by_payment: {} };
      else if (url.includes('/api/settings/business') || url.includes('/api/settings/outlet')) body = BUSINESS;
      else if (url.includes('/api/shifts/history')) body = [];
      else if (url.includes('/api/auth/me')) body = { id: 'u', name: 'Kasir', role: 'kasir', perms: ['*'] };
      else if (url.includes('/api/ota/version')) body = { version: 'x' };
      else body = {};
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    });

    page.on('response', (res) => {
      const u = res.url();
      if (/\/static\/(js|css)\/main\.[a-z0-9]+\.(js|css)$/.test(u)) loadedAssets.push(u.split('/').pop());
    });

    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => {
      localStorage.setItem('gak_token', 'ui-check-token');
      localStorage.setItem('gak_user', JSON.stringify({ id: 'u', name: 'Kasir', role: 'kasir', perms: ['*'] }));
    });
    await page.goto(`${BASE}/shift`, { waitUntil: 'networkidle' });

    const uniq = [...new Set(loadedAssets)];
    check(uniq.includes(jsFile), `browser memuat bundle kiosk ${jsFile} (bukan bundle gudang)`, uniq);
    check(!uniq.some((f) => f === 'main.82fa4efe.js'), 'bundle lama main.82fa4efe.js tidak dimuat');

    // --- [3] DOM: satu formulir, tanpa mode terpandu ----------------------
    console.log('\n[3] DOM halaman Shift di kiosk');
    const card = page.locator('[data-testid="guided-shift-closing-container"]');
    await card.waitFor({ state: 'visible', timeout: 20000 });
    check(true, 'kartu Tutup Shift dirender');
    check(await page.locator('[data-testid="mode-guided-btn"]').count() === 0, 'tab "Mode Terpandu" tidak ada');
    check(await page.locator('[data-testid="mode-manual-btn"]').count() === 0, 'tab "Input Langsung" tidak ada');
    check(await page.locator('[data-testid="guided-stepper"]').count() === 0, 'stepper 1-2-3 tidak ada');
    check(!/Mode Terpandu/i.test(await page.content()), 'tidak ada teks "Mode Terpandu" di DOM');

    for (const [tid, label] of [
      ['cash-count-progress-summary', 'progress hitung fisik'],
      ['closing-cash-fnb', 'input kas F&B'],
      ['closing-cash-retail', 'input kas Retail'],
      ['reconciliation-card', 'rekonsiliasi selisih'],
      ['variance-reason-input', 'alasan selisih'],
      ['close-expenses', 'blok pengeluaran'],
      ['close-shift-btn', 'tombol tutup shift'],
    ]) {
      const n = await page.locator(`[data-testid="${tid}"]`).count();
      check(n === 1, `${label} tampil bersamaan`, n);
    }

    await page.screenshot({ path: '/tmp/kiosk-shift.png', fullPage: true });
    console.log('\n  (tangkapan layar: /tmp/kiosk-shift.png)');
  } catch (e) {
    failed += 1;
    console.log(`  FAIL exception -> ${e && e.message}`);
  } finally {
    await browser.close();
  }

  console.log(`\n=== ${passed} lulus, ${failed} gagal ===\n`);
  process.exit(failed === 0 ? 0 : 1);
})();
