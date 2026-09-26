const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const AdmZip = require('adm-zip');

const frontendDir = path.join(__dirname, 'project', 'frontend');
const srcDir = path.join(frontendDir, 'build');
const destDir = path.join(__dirname, 'dist');

function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function copyRecursiveSync(src, dest) {
  if (!fs.existsSync(src)) return;
  const stats = fs.statSync(src);
  if (stats.isDirectory()) {
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }
    const children = fs.readdirSync(src);
    for (const child of children) {
      copyRecursiveSync(path.join(src, child), path.join(dest, child));
    }
  } else {
    fs.copyFileSync(src, dest);
  }
}

console.log('[Build] Checking React frontend build status...');
const hasFrontendBuild = fs.existsSync(srcDir) && fs.existsSync(path.join(srcDir, 'index.html')) && fs.existsSync(path.join(srcDir, 'static', 'js'));

const forceRebuild = process.argv.includes('--rebuild') || process.env.REBUILD_FRONTEND === 'true';
let srcNewer = false;
const buildIndex = path.join(srcDir, 'index.html');
if (fs.existsSync(buildIndex)) {
  const buildMtime = fs.statSync(buildIndex).mtimeMs;
  const checkNewer = (dir) => {
    if (!fs.existsSync(dir)) return false;
    const entries = fs.readdirSync(dir);
    for (const e of entries) {
      const full = path.join(dir, e);
      const stat = fs.statSync(full);
      if (stat.isDirectory()) {
        if (checkNewer(full)) return true;
      } else if (stat.mtimeMs > buildMtime) {
        return true;
      }
    }
    return false;
  };
  srcNewer = checkNewer(path.join(frontendDir, 'src'));
}

const shouldBuild = !hasFrontendBuild || srcNewer || forceRebuild;

if (shouldBuild) {
  console.log(`[Build] Rebuilding frontend (hasBuild: ${hasFrontendBuild}, srcNewer: ${srcNewer}, force: ${forceRebuild})...`);
  try {
    const hasNodeModules = fs.existsSync(path.join(frontendDir, 'node_modules', '@craco', 'craco'));
    if (!hasNodeModules) {
      execSync('npm install --legacy-peer-deps --include=dev', {
        cwd: frontendDir,
        stdio: 'inherit',
        env: { ...process.env, NODE_ENV: 'development' }
      });
    }
    execSync('npm run build', {
      cwd: frontendDir,
      stdio: 'inherit',
      env: { ...process.env, NODE_ENV: 'production' }
    });
  } catch (buildErr) {
    console.error('[Build] Frontend build failed:', buildErr.message);
    process.exit(1);
  }
}

console.log('[Build] Preparing static distribution directory...');
if (!fs.existsSync(destDir)) {
  fs.mkdirSync(destDir, { recursive: true });
}

if (fs.existsSync(srcDir)) {
  // 1. Sanitasi import() untuk WebView Android lama jika ada
  const jsDir = path.join(srcDir, 'static', 'js');
  const RE_IMPORT = /import\(([a-zA-Z_$][\w$]*\.module)\)/g;
  let patched = 0;
  if (fs.existsSync(jsDir)) {
    for (const f of fs.readdirSync(jsDir)) {
      if (!f.endsWith('.js') || f.endsWith('.LICENSE.txt')) continue;
      const p = path.join(jsDir, f);
      let content = fs.readFileSync(p, 'utf8');
      if (RE_IMPORT.test(content)) {
        content = content.replace(RE_IMPORT, 'Promise.resolve($1)');
        fs.writeFileSync(p, content);
        patched += 1;
      }
    }
  }
  if (patched > 0) {
    console.log(`[Build] Sanitasi import() WebView lama: ${patched} file dipatch`);
  }

  // 2. Salin seluruh isi build ke dist
  copyRecursiveSync(srcDir, destDir);
  console.log('[Build] Successfully copied assets from project/frontend/build to dist/');
} else if (fs.existsSync(destDir)) {
  console.log('[Build] Using pre-built static assets in dist/');
}

// 2a. Bersihkan file sourcemap (.map) agar ukuran build sangat ramping dan cepat dideploy
function removeMaps(dir) {
  if (!fs.existsSync(dir)) return;
  const entries = fs.readdirSync(dir);
  for (const e of entries) {
    const p = path.join(dir, e);
    const s = fs.statSync(p);
    if (s.isDirectory()) removeMaps(p);
    else if (e.endsWith('.map')) {
      try { fs.unlinkSync(p); } catch (_) {}
    }
  }
}
removeMaps(destDir);
removeMaps(srcDir);

// 2b. Ensure dist/index.html has CSS and JS bundle scripts properly injected
const publicIndex = path.join(__dirname, 'project', 'frontend', 'public', 'index.html');
const destIndex = path.join(destDir, 'index.html');
let htmlContent = '';
if (fs.existsSync(srcDir) && fs.existsSync(destIndex)) {
  htmlContent = fs.readFileSync(destIndex, 'utf8');
} else if (fs.existsSync(publicIndex)) {
  htmlContent = fs.readFileSync(publicIndex, 'utf8');
} else if (fs.existsSync(destIndex)) {
  htmlContent = fs.readFileSync(destIndex, 'utf8');
}

// Find entrypoint files from asset-manifest.json or static folder
let cssFile = '';
let jsFile = '';
const manifestPath = path.join(destDir, 'asset-manifest.json');
if (fs.existsSync(manifestPath)) {
  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    if (manifest.files) {
      cssFile = manifest.files['main.css'] || '';
      jsFile = manifest.files['main.js'] || '';
    }
  } catch (_) {}
}
if (!cssFile) {
  const cssDir = path.join(destDir, 'static', 'css');
  if (fs.existsSync(cssDir)) {
    const files = fs.readdirSync(cssDir).filter(f => f.startsWith('main.') && f.endsWith('.css'));
    if (files.length > 0) cssFile = '/static/css/' + files[0];
  }
}
if (!jsFile) {
  const jsDir = path.join(destDir, 'static', 'js');
  if (fs.existsSync(jsDir)) {
    const files = fs.readdirSync(jsDir).filter(f => f.startsWith('main.') && f.endsWith('.js') && !f.endsWith('.LICENSE.txt'));
    if (files.length > 0) jsFile = '/static/js/' + files[0];
  }
}

if (cssFile.startsWith('.')) cssFile = cssFile.slice(1);
if (cssFile && !cssFile.startsWith('/')) cssFile = '/' + cssFile;
if (jsFile.startsWith('.')) jsFile = jsFile.slice(1);
if (jsFile && !jsFile.startsWith('/')) jsFile = '/' + jsFile;

// Clean up %PUBLIC_URL%
htmlContent = htmlContent.replace(/%PUBLIC_URL%\/?/g, '/');

// Inject CSS into <head>
if (cssFile && !htmlContent.includes(cssFile)) {
  htmlContent = htmlContent.replace('</head>', `  <link rel="stylesheet" href="${cssFile}" />\n  </head>`);
}

// Inject JS into <body>
if (jsFile && !htmlContent.includes(jsFile)) {
  htmlContent = htmlContent.replace('</body>', `  <script defer="defer" src="${jsFile}"></script>\n  </body>`);
}

fs.writeFileSync(destIndex, htmlContent, 'utf8');
// Also write to root index.html so both paths serve identically
fs.writeFileSync(path.join(__dirname, 'index.html'), htmlContent, 'utf8');
console.log(`[Build] index.html updated: CSS=${cssFile || 'none'}, JS=${jsFile || 'none'}`);

// 3. Buat paket OTA bundle.zip dan version.json untuk update APK Android / Sunmi
try {
  const otaDir = path.join(destDir, 'ota');
  if (!fs.existsSync(otaDir)) {
    fs.mkdirSync(otaDir, { recursive: true });
  }
  const otaVersion = process.env.OTA_VERSION || `2.10.${stamp()}`;
  const zip = new AdmZip();

  // Tambahkan seluruh file dist kecuali folder ota
  const entries = fs.readdirSync(destDir);
  for (const entry of entries) {
    if (entry === 'ota') continue;
    const fullPath = path.join(destDir, entry);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      zip.addLocalFolder(fullPath, entry);
    } else {
      zip.addLocalFile(fullPath);
    }
  }

  const zipDest = path.join(otaDir, 'bundle.zip');
  zip.writeZip(zipDest);

  const versionJson = {
    version: otaVersion,
    url: '/ota/bundle.zip',
    updated_at: new Date().toISOString(),
    bundle_size: fs.statSync(zipDest).size,
  };
  fs.writeFileSync(path.join(otaDir, 'version.json'), JSON.stringify(versionJson, null, 2));

  // Salin juga ke srcDir jika masih ada
  if (fs.existsSync(srcDir)) {
    const srcOtaDir = path.join(srcDir, 'ota');
    if (!fs.existsSync(srcOtaDir)) fs.mkdirSync(srcOtaDir, { recursive: true });
    fs.writeFileSync(path.join(srcOtaDir, 'version.json'), JSON.stringify(versionJson, null, 2));
  }

  console.log(`[Build] Paket OTA siap: versi ${otaVersion} (${(versionJson.bundle_size / 1024).toFixed(1)} KB)`);
} catch (otaErr) {
  console.warn('[Build] Gagal membuat bundle OTA:', otaErr.message);
}

console.log('[Build] Build completed successfully.');


