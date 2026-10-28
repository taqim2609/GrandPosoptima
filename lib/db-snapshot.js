/**
 * Persistent snapshot store untuk database in-memory P1A.
 *
 * Latar belakang: `api-server.js` menyimpan seluruh data POS di objek `db` di
 * memori. Tanpa snapshot, setiap restart container memuat ulang data seed
 * sehingga perubahan (termasuk reset penjualan) hilang dan katalog menu
 * kembali ke kondisi lama. Modul ini menyimpan satu berkas JSON atomik di
 * disk dan memuatnya kembali saat startup.
 *
 * Katalog menu (products, categories, tables) sengaja TIDAK pernah dihapus
 * oleh reset transaksi; modul ini hanya bertanggung jawab soal persistensi,
 * bukan aturan bisnis reset.
 */
const fs = require('fs');
const path = require('path');

const DEFAULT_DIR = process.env.GRANDPOS_DATA_DIR || path.join(__dirname, '..', 'data');
const DEFAULT_FILE = 'pos-db.json';
const SNAPSHOT_VERSION = 1;

// Koleksi yang tidak perlu (dan tidak boleh) ikut tersimpan ke disk.
const TRANSIENT_KEYS = new Set([
  'aiSessions',
  'wa_outbox',
  'gdrive_backup_history',
]);

function resolveSnapshotPath(options = {}) {
  if (options.filePath) return options.filePath;
  const dir = options.dir || DEFAULT_DIR;
  return path.join(dir, options.fileName || DEFAULT_FILE);
}

function serializableSnapshot(db) {
  const snapshot = {};
  for (const [key, value] of Object.entries(db || {})) {
    if (TRANSIENT_KEYS.has(key)) continue;
    snapshot[key] = value;
  }
  return {
    version: SNAPSHOT_VERSION,
    saved_at: new Date().toISOString(),
    collections: Object.keys(snapshot).length,
    data: snapshot,
  };
}

/**
 * Tulis snapshot secara atomik (tmp + rename) agar proses yang mati di tengah
 * penulisan tidak meninggalkan berkas JSON rusak.
 */
function saveSnapshot(db, options = {}) {
  const filePath = resolveSnapshotPath(options);
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });

  const payload = JSON.stringify(serializableSnapshot(db), null, 2);
  const tmpPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tmpPath, payload, 'utf-8');
  fs.renameSync(tmpPath, filePath);
  return { filePath, bytes: Buffer.byteLength(payload), saved_at: new Date().toISOString() };
}

/**
 * Muat snapshot ke objek db yang sudah ada. Kunci yang tidak ada di snapshot
 * dibiarkan memakai nilai seed agar field baru tetap tersedia setelah upgrade.
 * Mengembalikan null bila berkas belum ada (instalasi baru).
 */
function loadSnapshot(db, options = {}) {
  const filePath = resolveSnapshotPath(options);
  if (!fs.existsSync(filePath)) return null;

  const raw = fs.readFileSync(filePath, 'utf-8');
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    const corruptPath = `${filePath}.corrupt-${Date.now()}`;
    fs.renameSync(filePath, corruptPath);
    console.error(`[Snapshot] Berkas snapshot rusak, dipindahkan ke ${corruptPath}:`, err.message);
    return null;
  }

  const data = parsed && typeof parsed === 'object' && parsed.data ? parsed.data : parsed;
  if (!data || typeof data !== 'object') return null;

  let applied = 0;
  for (const [key, value] of Object.entries(data)) {
    if (TRANSIENT_KEYS.has(key)) continue;
    db[key] = value;
    applied += 1;
  }

  return {
    filePath,
    saved_at: parsed.saved_at || null,
    collections: applied,
  };
}

/**
 * Buat writer yang men-debounce penyimpanan agar request berturut-turut
 * (misal input transaksi cepat) tidak menulis disk berulang kali.
 */
function createDebouncedSaver(db, options = {}) {
  const delayMs = options.delayMs ?? 250;
  const logger = options.logger || console;
  let timer = null;
  let pending = false;

  const flush = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    if (!pending) return null;
    pending = false;
    try {
      return saveSnapshot(db, options);
    } catch (err) {
      logger.error('[Snapshot] Gagal menyimpan snapshot:', err.message);
      return null;
    }
  };

  const schedule = () => {
    pending = true;
    if (timer) return;
    timer = setTimeout(() => {
      timer = null;
      flush();
    }, delayMs);
    if (typeof timer.unref === 'function') timer.unref();
  };

  return { schedule, flush, get pending() { return pending; } };
}

module.exports = {
  DEFAULT_DIR,
  DEFAULT_FILE,
  SNAPSHOT_VERSION,
  TRANSIENT_KEYS,
  resolveSnapshotPath,
  serializableSnapshot,
  saveSnapshot,
  loadSnapshot,
  createDebouncedSaver,
};
