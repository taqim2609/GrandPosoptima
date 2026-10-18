/* Membuat paket OTA (bundle.zip + version.json) untuk Capgo Capacitor Updater
   Mendukung arsitektur dual-node (Raspberry Pi LAN & VPS Tailscale)
   Kompatibel dengan Android 7 Sunmi T2 (Chrome <63) */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

// Cari folder build yang valid (dist atau build)
function findBuildDir() {
  const candidates = [
    path.join(__dirname, "..", "dist"),
    path.join(__dirname, "..", "build"),
    path.join(__dirname, "..", "project", "frontend", "build"),
    path.join(process.cwd(), "dist"),
    path.join(process.cwd(), "build"),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c) && fs.existsSync(path.join(c, "index.html"))) {
      return c;
    }
  }
  return path.join(__dirname, "..", "dist");
}

function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function calculateSha256(filePath) {
  try {
    const fileBuffer = fs.readFileSync(filePath);
    return crypto.createHash("sha256").update(fileBuffer).digest("hex");
  } catch (_) {
    return "";
  }
}

// Sanitasi import() native agar WebView Android 7 Sunmi T2 tidak crash
function sanitizeOldWebview(dir) {
  const jsDir = path.join(dir, "static", "js");
  if (!fs.existsSync(jsDir)) return 0;
  const RE_IMPORT = /import\(([a-zA-Z_$][\w$]*\.module)\)/g;
  let patched = 0;
  for (const f of fs.readdirSync(jsDir)) {
    if (!f.endsWith(".js") || f.endsWith(".LICENSE.txt")) continue;
    const p = path.join(jsDir, f);
    try {
      let src = fs.readFileSync(p, "utf8");
      if (RE_IMPORT.test(src)) {
        src = src.replace(RE_IMPORT, "Promise.resolve($1)");
        fs.writeFileSync(p, src);
        patched += 1;
      }
    } catch (_) {}
  }
  return patched;
}

async function createZipBundle(sourceDir, zipPath) {
  try {
    const AdmZip = require("adm-zip");
    const zip = new AdmZip();
    const entries = fs.readdirSync(sourceDir);
    for (const entry of entries) {
      if (entry === "ota" || entry.endsWith(".map")) continue;
      const full = path.join(sourceDir, entry);
      const stat = fs.statSync(full);
      if (stat.isDirectory()) {
        zip.addLocalFolder(full, entry);
      } else {
        zip.addLocalFile(full);
      }
    }
    zip.writeZip(zipPath);
    return true;
  } catch (errAdm) {
    try {
      const archiver = require("archiver");
      await new Promise((resolve, reject) => {
        const output = fs.createWriteStream(zipPath);
        const archive = archiver("zip", { zlib: { level: 9 } });
        output.on("close", resolve);
        archive.on("error", reject);
        archive.pipe(output);
        archive.glob("**/*", { cwd: sourceDir, ignore: ["ota/**", "**/*.map"], dot: true });
        archive.finalize();
      });
      return true;
    } catch (errArchiver) {
      throw new Error(`Gagal membuat ZIP bundle: ${errAdm.message} / ${errArchiver.message}`);
    }
  }
}

async function main() {
  const buildDir = findBuildDir();
  console.log(`[make-ota] Memeriksa direktori build: ${buildDir}`);

  if (!fs.existsSync(buildDir)) {
    console.error(`[make-ota] Folder build tidak ditemukan di ${buildDir}.`);
    process.exit(1);
  }

  // 1. Sanitasi kompatibilitas WebView Android 7
  const patchedCount = sanitizeOldWebview(buildDir);
  if (patchedCount > 0) {
    console.log(`[make-ota] Sanitasi import() WebView Android 7: ${patchedCount} berkas dipatch.`);
  }

  // 2. Siapkan folder output OTA
  const otaDir = path.join(buildDir, "ota");
  fs.mkdirSync(otaDir, { recursive: true });

  const version = process.env.OTA_VERSION || `2.10.${stamp()}`;
  const zipPath = path.join(otaDir, "bundle.zip");

  // 3. Buat ZIP bundle
  console.log(`[make-ota] Mengompresi bundle aplikasi ke ${zipPath}...`);
  await createZipBundle(buildDir, zipPath);

  const stat = fs.statSync(zipPath);
  const checksum = calculateSha256(zipPath);

  // 4. Struktur version.json dengan konfigurasi Dual-Node (Pi LAN & VPS Tailscale)
  const versionInfo = {
    version,
    url: "/ota/bundle.zip",
    apiUrl: "/api/ota/bundle.zip",
    bundle_size: stat.size,
    bundle_size_kb: Math.round(stat.size / 1024),
    checksum: `sha256:${checksum}`,
    built_at: new Date().toISOString(),
    nodes: {
      primary_pi: {
        name: "Raspberry Pi Kasir (LAN Toko)",
        version_url: "http://pos.local:3000/api/ota/version",
        bundle_url: "http://pos.local:3000/ota/bundle.zip",
        role: "local_master",
      },
      fallback_vps: {
        name: "Server VPS Go-Live (Tailscale Mesh)",
        version_url: "http://100.117.186.13:8000/api/ota/version",
        bundle_url: "http://100.117.186.13:8000/ota/bundle.zip",
        role: "remote_fallback",
      },
    },
  };

  const versionJsonPath = path.join(otaDir, "version.json");
  fs.writeFileSync(versionJsonPath, JSON.stringify(versionInfo, null, 2), "utf8");

  // 5. Salin ke folder dist, public, dan project jika ada
  const syncTargets = [
    path.join(__dirname, "..", "dist", "ota"),
    path.join(__dirname, "..", "public", "ota"),
    path.join(__dirname, "..", "project", "frontend", "build", "ota"),
    path.join(__dirname, "..", "project", "frontend", "public", "ota"),
  ];

  for (const t of syncTargets) {
    try {
      const parent = path.dirname(t);
      if (fs.existsSync(parent)) {
        fs.mkdirSync(t, { recursive: true });
        fs.copyFileSync(zipPath, path.join(t, "bundle.zip"));
        fs.copyFileSync(versionJsonPath, path.join(t, "version.json"));
      }
    } catch (_) {}
  }

  console.log(`=======================================================`);
  console.log(`  ✓ PAKET CAPGO OTA DUAL-NODE BERHASIL DIBUAT!         `);
  console.log(`=======================================================`);
  console.log(`  Versi OTA   : ${version}`);
  console.log(`  Ukuran Zip  : ${(stat.size / 1024).toFixed(1)} KB`);
  console.log(`  Checksum    : ${checksum.slice(0, 16)}...`);
  console.log(`  Node Pi LAN : http://pos.local:3000/ota/bundle.zip`);
  console.log(`  Node VPS    : http://100.117.186.13:8000/ota/bundle.zip`);
  console.log(`=======================================================`);
}

main().catch((err) => {
  console.error("[make-ota ERROR]:", err);
  process.exit(1);
});
