const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, 'project', 'frontend', 'build');
const destDir = path.join(__dirname, 'dist');

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

console.log('[Build] Preparing static distribution directory...');
if (!fs.existsSync(destDir)) {
  fs.mkdirSync(destDir, { recursive: true });
}

if (fs.existsSync(srcDir)) {
  copyRecursiveSync(srcDir, destDir);
  console.log('[Build] Successfully copied assets from project/frontend/build to dist/');
} else {
  console.error('[Build] Warning: Source build directory not found at:', srcDir);
}
