/**
 * Bukti visual: halaman Shift hanya punya SATU formulir input langsung.
 *
 * Menjalankan browser sungguhan terhadap server POS yang sedang menyala,
 * login sebagai kasir, membuka /shift, lalu memeriksa DOM:
 *  1. Tidak ada tab "Mode Terpandu" / "Input Langsung" maupun stepper 1-2-3.
 *  2. Form tutup shift tetap utuh: hitung fisik, kas akhir F&B/Retail,
 *     rekonsiliasi, transport, pengeluaran, dan tombol tutup shift tampil
 *     bersamaan tanpa perlu menekan "Lanjut".
 *
 * Run: node tests/shift-single-form-e2e.js [baseUrl]
 */
const path = require('path');

const { chromium } = require('/root/c-founder/node_modules/playwright');

const BASE = process.argv[2] || 'http://127.0.0.1:3000';
const USER = process.env.POS_E2E_USER || 'e2e-probe';
const PASS = process.env.POS_E2E_PASS || '';

let passed = 0;
let failed = 0;
function check(cond, msg, extra) {
  if (cond) { passed += 1; console.log(`  ok   ${msg}`); }
  else { failed += 1; console.log(`  FAIL ${msg}${extra === undefined ? '' : ` -> ${JSON.stringify(extra)}`}`); }
}

(async () => {
  // Pakai browser yang benar-benar terpasang di mesin ini (revisi cache bisa
  // berbeda dari yang diharapkan paket playwright).
  const candidates = [
    '/root/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome',
    '/root/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome',
    process.env.PLAYWRIGHT_CHROMIUM,
  ].filter(Boolean);
  const fs = require('fs');
  const executablePath = candidates.find((p) => { try { return fs.existsSync(p); } catch (_) { return false; } });
  const browser = await chromium.launch(executablePath ? { executablePath } : {});
  const page = await browser.newPage({ viewport: { width: 1280, height: 2200 } });

  try {
    // Login lewat API supaya token tersimpan seperti kasir sungguhan.
    const login = await page.request.post(`${BASE}/api/auth/login`, {
      data: { username: USER, password: PASS },
    });
    check(login.status() === 200, 'login API berhasil', login.status());
    const body = await login.json();

    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
    await page.evaluate((tok) => localStorage.setItem('gak_token', tok), body.token);
    await page.goto(`${BASE}/shift`, { waitUntil: 'networkidle' });

    // Tunggu kartu tutup shift muncul (shift harus terbuka di data uji).
    const card = page.locator('[data-testid="guided-shift-closing-container"]');
    await card.waitFor({ state: 'visible', timeout: 20000 });
    check(true, 'kartu Tutup Shift tampil');

    const html = await page.content();

    console.log('\n[1] Mode terpandu & tab benar-benar hilang');
    check(!/Mode Terpandu/i.test(html), 'tidak ada label "Mode Terpandu"');
    check(await page.locator('[data-testid="mode-guided-btn"]').count() === 0, 'tombol tab Mode Terpandu tidak ada');
    check(await page.locator('[data-testid="mode-manual-btn"]').count() === 0, 'tombol tab Input Langsung tidak ada');
    check(await page.locator('[data-testid="guided-stepper"]').count() === 0, 'stepper 1-2-3 tidak ada');
    check(await page.locator('[data-testid="step-1-next-btn"]').count() === 0, 'tombol "Lanjut ke Rekonsiliasi" tidak ada');

    console.log('\n[2] Semua bagian form tampil bersamaan (tanpa klik "Lanjut")');
    for (const [tid, label] of [
      ['cash-count-progress-summary', 'kartu progress hitung fisik'],
      ['closing-cash-fnb', 'input kas akhir F&B'],
      ['closing-cash-retail', 'input kas akhir Retail'],
      ['reconciliation-card', 'kartu rekonsiliasi selisih'],
      ['variance-reason-input', 'input alasan selisih'],
      ['close-expenses', 'blok pengeluaran'],
      ['close-shift-btn', 'tombol tutup shift'],
    ]) {
      const n = await page.locator(`[data-testid="${tid}"]`).count();
      check(n === 1, `${label} tampil sekali`, n);
    }

    console.log('\n[3] Input kas langsung bisa dipakai (tanpa ganti mode)');
    const fnb = page.locator('[data-testid="closing-cash-fnb"]');
    await fnb.fill('150000');
    const retail = page.locator('[data-testid="closing-cash-retail"]');
    await retail.fill('30000');
    check(await fnb.inputValue() === '150000', 'kas F&B bisa diketik langsung');
    check(await retail.inputValue() === '30000', 'kas Retail bisa diketik langsung');

    // Progress bar harus bereaksi terhadap input tanpa mode apa pun.
    const total = await page.locator('[data-testid="actual-cash-total"]').innerText();
    check(/180\.000|180,000/.test(total), 'total fisik ikut terhitung real-time', total);

    await page.screenshot({ path: path.join(__dirname, '..', 'shift-single-form.png'), fullPage: true });
    console.log('\n  (tangkapan layar: shift-single-form.png)');
  } catch (e) {
    failed += 1;
    console.log(`  FAIL exception -> ${e && e.message}`);
  } finally {
    await browser.close();
  }

  console.log(`\n=== ${passed} lulus, ${failed} gagal ===\n`);
  process.exit(failed === 0 ? 0 : 1);
})();
