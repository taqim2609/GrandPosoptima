#!/usr/bin/env node
// Uji perilaku gerbang POS terhadap bundle hasil build.
//
// Kenapa diuji di bundle, bukan di source: yang dikirim ke browser adalah bundle
// hasil minify. Kalau gerbang gagal ter-compile atau di-tree-shake, test source
// tetap hijau padahal produksi bocor.
//
// Kenapa diuji dengan mengeksekusi logika, bukan grep string: grep "100.109.98.56"
// juga cocok pada bundle lama yang tidak punya gerbang sama sekali. Itu false green.
const fs = require('fs');
const vm = require('vm');

const bundlePath = process.argv[2];
const bundle = fs.readFileSync(bundlePath, 'utf8');

// Cari fungsi penentu host di dalam bundle. Build produksi mempertahankan nama
// fungsinya (tidak di-minify pada level nama deklarasi fungsi lokal CRA), jadi
// kita bisa mengambil body-nya lalu menjalankannya untuk host tertentu.
function extractHostLogic(src) {
  // Pola: function isPosAllowedHost(...){ ... }  (nama dapat berubah, cari penanda uniknya)
  const marker = 'kasir-pi';
  const idx = src.indexOf(marker);
  if (idx === -1) return null;
  // mundur ke awal blok fungsi yang memuat marker
  let start = src.lastIndexOf('function', idx);
  if (start === -1) return null;
  // cari akhir blok dengan pencocokan kurawal
  let open = src.indexOf('{', start);
  if (open === -1) return null;
  let depth = 0;
  let end = -1;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') {
      depth--;
      if (depth === 0) { end = i + 1; break; }
    }
  }
  if (end === -1) return null;
  return src.slice(start, end);
}

const results = [];
const check = (name, fn) => {
  try {
    results.push({ name, pass: !!fn() });
  } catch (e) {
    results.push({ name, pass: false, error: e.message });
  }
};

const body = extractHostLogic(bundle);

check('bundle memuat fungsi gerbang host POS', () => body !== null);

if (body) {
  // Jalankan fungsi dengan window/localStorage/process tiruan untuk tiap skenario.
  const runFor = (hostname, opts = {}) => {
    const sandbox = {
      window: { location: { hostname } },
      localStorage: { getItem: () => (opts.localStorageDisabled ? 'true' : null) },
      process: { env: {} },
      console,
    };
    sandbox.window.Capacitor = opts.capacitor ? { isNativePlatform: () => true } : undefined;
    vm.createContext(sandbox);
    const fnName = body.match(/function\s+([A-Za-z0-9_$]+)/)[1];
    vm.runInContext(`${body}\n;globalThis.__r = ${fnName};`, sandbox);
    // panggil dengan hostname; fungsi membaca argumen, bukan window
    return vm.runInContext(`__r(${JSON.stringify(hostname)})`, sandbox);
  };

  check('gudang-644 (100.117.186.13) DITOLAK untuk POS', () => runFor('100.117.186.13') === false);
  check('landing.gudang-644 DITOLAK untuk POS', () => runFor('landing.gudang-644.tailf3a839.ts.net') === false);
  check('domain gudang-644 DITOLAK untuk POS', () => runFor('gudang-644.tailf3a839.ts.net') === false);
  check('kasir-pi (100.109.98.56) DIIZINKAN', () => runFor('100.109.98.56') === true);
  check('kasir-pi.tailf3a839.ts.net DIIZINKAN', () => runFor('kasir-pi.tailf3a839.ts.net') === true);
  check('localhost DIIZINKAN', () => runFor('localhost') === true);
  check('127.0.0.1 DIIZINKAN', () => runFor('127.0.0.1') === true);
  check('LAN 192.168.8.254 DIIZINKAN', () => runFor('192.168.8.254') === true);
  check('LAN 10.1.2.3 DIIZINKAN', () => runFor('10.1.2.3') === true);
  check('APK native DIIZINKAN', () => runFor('bebas', { capacitor: true }) === true);
  check('override localStorage DIIZINKAN', () => runFor('100.117.186.13', { localStorageDisabled: true }) === true);
}

check('tidak memuat token lama gak_rpt_7f3c9e1b', () => !bundle.includes('gak_rpt_7f3c9e1b'));

const passed = results.filter((r) => r.pass).length;
for (const r of results) {
  console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}${r.error ? ' — ' + r.error : ''}`);
}
console.log(`\n${passed}/${results.length} assertions passed`);
process.exit(passed === results.length ? 0 : 1);
