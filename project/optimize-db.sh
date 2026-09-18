#!/usr/bin/env bash
# ============================================================================
# OPTIMASI DATABASE MONGODB — Grand Aceh Kuliner POS
#
# Skrip ini melakukan vacuum (compact) dan reindexing pada seluruh koleksi MongoDB
# untuk menjaga performa query, memperbarui indeks, dan mengembalikan ruang disk
# yang tidak terpakai pada server (Raspberry Pi / PC).
#
# PEMAKAIAN (di folder proyek):
#   bash optimize-db.sh
#   ./optimize-db.sh
#
# ============================================================================
set -euo pipefail
cd "$(dirname "$0")"

# Warna keluaran di terminal
if [ -t 1 ]; then
  C_OK=$'\033[32m'; C_WARN=$'\033[33m'; C_ERR=$'\033[31m'; C_INFO=$'\033[36m'; C_B=$'\033[1m'; C_0=$'\033[0m'
else
  C_OK=""; C_WARN=""; C_ERR=""; C_INFO=""; C_B=""; C_0=""
fi

# Deteksi perintah docker
DOCKER="docker"
docker info >/dev/null 2>&1 || DOCKER="sudo docker"

# Nama database dari file env backend (default: grandpos)
DBNAME="$(grep -E '^DB_NAME=' backend/.env backend/.env.docker 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'" | tr -d '\r' | xargs || true)"
DBNAME="${DBNAME:-grandpos}"

echo "${C_B}=== OPTIMASI DATABASE MONGODB (Raspberry Pi / Server) ===${C_0}"
echo "Database : ${C_B}${DBNAME}${C_0}"
echo "Waktu    : $(date '+%Y-%m-%d %H:%M:%S')"
echo ""

# Pastikan container MongoDB hidup
if ! $DOCKER compose ps | grep -qE "mongo.*Up"; then
  echo "${C_ERR}ERROR:${C_0} Container MongoDB ('mongo') tidak aktif."
  echo "Silakan jalankan container terlebih dahulu: docker compose up -d mongo"
  exit 1
fi

# Deteksi shell MongoDB (mongosh vs mongo)
SHELL_CMD=""
for SH in mongosh mongo; do
  if $DOCKER compose exec -T mongo $SH --version >/dev/null 2>&1; then
    SHELL_CMD="$SH"
    break
  fi
done

if [ -z "$SHELL_CMD" ]; then
  echo "${C_ERR}ERROR:${C_0} Tidak dapat menemukan 'mongosh' atau 'mongo' di dalam container."
  exit 1
fi

echo "${C_INFO}Menggunakan shell '${SHELL_CMD}' untuk eksekusi perintah MongoDB...${C_0}"

# Script JavaScript MongoDB
JS_SCRIPT="
var dbName = '$DBNAME';
var targetDb = db.getSiblingDB(dbName);
var statsBefore = targetDb.stats();

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 Bytes';
  var k = 1024;
  var sizes = ['Bytes', 'KB', 'MB', 'GB'];
  var i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

print('\n==================== STATISTIK AWAL ====================');
print('Jumlah Koleksi    : ' + (statsBefore.collections || 0));
print('Jumlah Dokumen    : ' + (statsBefore.objects || 0));
print('Ukuran Data       : ' + formatBytes(statsBefore.dataSize || 0));
print('Ukuran Indeks     : ' + formatBytes(statsBefore.indexSize || 0));
print('Total Ukuran Disk : ' + formatBytes(statsBefore.storageSize || 0));
print('========================================================\n');

var colls = targetDb.getCollectionNames();
print('Memulai optimasi pada ' + colls.length + ' koleksi...\n');

colls.forEach(function(coll) {
  if (coll.indexOf('system.') === 0) return;
  print('-> Koleksi: [' + coll + ']');
  
  // 1. Reindex
  try {
    var resIdx = targetDb.runCommand({ reIndex: coll });
    if (resIdx.ok === 1) {
      print('   [OK] Reindexing berhasil');
    } else {
      print('   [WARN] Reindexing: ' + (resIdx.errmsg || JSON.stringify(resIdx)));
    }
  } catch (e) {
    print('   [WARN] Reindexing error: ' + e);
  }

  // 2. Compact (Vacuum)
  try {
    var resCompact = targetDb.runCommand({ compact: coll });
    if (resCompact.ok === 1) {
      print('   [OK] Vacuum / Compact berhasil');
    } else {
      print('   [WARN] Compact: ' + (resCompact.errmsg || JSON.stringify(resCompact)));
    }
  } catch (e) {
    print('   [WARN] Compact error: ' + e);
  }
});

var statsAfter = targetDb.stats();
print('\n==================== STATISTIK AKHIR ====================');
print('Jumlah Dokumen    : ' + (statsAfter.objects || 0));
print('Ukuran Data       : ' + formatBytes(statsAfter.dataSize || 0));
print('Ukuran Indeks     : ' + formatBytes(statsAfter.indexSize || 0));
print('Total Ukuran Disk : ' + formatBytes(statsAfter.storageSize || 0));

var savedStorage = (statsBefore.storageSize || 0) - (statsAfter.storageSize || 0);
if (savedStorage > 0) {
  print('Ruang Disk Dihemat: ' + formatBytes(savedStorage));
} else {
  print('Status Disk       : Teroptimasi penuh');
}
print('========================================================\n');
"

# Jalankan skrip di container MongoDB
$DOCKER compose exec -T mongo $SHELL_CMD --quiet --eval "$JS_SCRIPT"

echo "${C_OK}${C_B}Selesai! Database '${DBNAME}' berhasil di-vacuum dan di-reindex.${C_0}"
