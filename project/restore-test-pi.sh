#!/usr/bin/env bash
# ============================================================
# Uji restore arsip backup POS ke database TERISOLASI.
# ============================================================
# Tujuan: membuktikan arsip backup benar-benar bisa dipulihkan, TANPA
# menyentuh database produksi.
#
# Jaminan keamanan:
#   - Nametarget WAJIB berbeda dari database produksi (hard refusal).
#   - mongorestore memakai --nsFrom/--nsTo sehingga hanya menulis ke target uji.
#   - Database uji SELALU di-drop di akhir (trap EXIT), termasuk saat gagal.
#
# Pemakaian:
#   ./restore-test-pi.sh                    # uji arsip terbaru di Pi
#   ./restore-test-pi.sh /path/arsip.gz     # uji arsip tertentu
#
# Konfigurasi (env):
#   GAK_BACKUP_SSH_TARGET  default: taqim258@grandpos
#   GAK_BACKUP_PI_DIR      default: /home/taqim258/backups
#   GAK_BACKUP_MONGO_CTR   default: grand-aceh-pos-mongo-1
#   GAK_BACKUP_DB          default: grand_aceh_pos   (SUMBER, dibaca saja)
#   GAK_RESTORE_TEST_DB    default: restore_test      (TARGET uji, akan di-drop)
# ============================================================
set -euo pipefail

SSH_TARGET="${GAK_BACKUP_SSH_TARGET:-taqim258@grandpos}"
PI_DIR="${GAK_BACKUP_PI_DIR:-/home/taqim258/backups}"
MONGO_CTR="${GAK_BACKUP_MONGO_CTR:-grand-aceh-pos-mongo-1}"
SRC_DB="${GAK_BACKUP_DB:-grand_aceh_pos}"
TEST_DB="${GAK_RESTORE_TEST_DB:-restore_test}"
ARCHIVE="${1:-}"
SSH_OPTS=(-o BatchMode=yes -o ConnectTimeout=15 -o StrictHostKeyChecking=accept-new)

log() { echo "[$(date -u +%H:%M:%S)] $*"; }
die() { echo "[GAGAL] $*" >&2; exit 1; }

# ---------- penjaga keras: jangan pernah menyentuh produksi ----------
case "$TEST_DB" in
  "$SRC_DB"|grand_aceh_pos|grandpos|admin|config|local)
    die "target uji '$TEST_DB' adalah database produksi/sistem. Ditolak." ;;
esac
case "$TEST_DB" in
  *_test|*_audit|test*|*restore*) : ;;
  *) die "nama database uji '$TEST_DB' tidak menandakan lingkungan uji (harus memuat 'test'/'audit'/'restore')." ;;
esac

command -v ssh >/dev/null 2>&1 || die "ssh tidak ditemukan."

if [ -z "$ARCHIVE" ]; then
  ARCHIVE="$(ssh "${SSH_OPTS[@]}" "$SSH_TARGET" "ls -1t '$PI_DIR'/*.gz 2>/dev/null | head -1")"
  [ -n "$ARCHIVE" ] || die "tidak ada arsip .gz di $PI_DIR pada $SSH_TARGET."
fi
log "arsip  : $ARCHIVE"
log "sumber : $SRC_DB (read-only)  target uji: $TEST_DB (akan di-drop)"

# ---------- cleanup yang selalu berjalan ----------
cleanup() {
  log "cleanup: drop database uji '$TEST_DB' ..."
  ssh "${SSH_OPTS[@]}" "$SSH_TARGET" "docker exec '$MONGO_CTR' mongo --quiet --eval 'db.getSiblingDB(\"$TEST_DB\").dropDatabase()' >/dev/null 2>&1" || true
  ssh "${SSH_OPTS[@]}" "$SSH_TARGET" "docker exec '$MONGO_CTR' rm -f /tmp/gak-restore-test.gz" >/dev/null 2>&1 || true
}
trap cleanup EXIT

# ---------- restore ke DB terisolasi ----------
log "menyalin arsip ke dalam container ..."
ssh "${SSH_OPTS[@]}" "$SSH_TARGET" "set -euo pipefail
  docker cp '$ARCHIVE' '$MONGO_CTR:/tmp/gak-restore-test.gz'
  docker exec '$MONGO_CTR' mongorestore --archive=/tmp/gak-restore-test.gz --gzip \
    --nsFrom '$SRC_DB.*' --nsTo '$TEST_DB.*' --drop --quiet
"
log "restore selesai; menghitung dokumen & indeks (produksi tidak disentuh) ..."

read -r -d '' JS <<'EOF' || true
function ids(coll){ return new Set(coll.find({},{_id:1}).toArray().map(function(d){return d._id.toString()})); }
var prod = db.getSiblingDB("PROD_DB");
var test = db.getSiblingDB("TEST_DB");
var fail = 0;
["categories","orders","products","tables","users"].forEach(function(c){
  var p = ids(prod[c]), t = ids(test[c]);
  var onlyTest = [...t].filter(function(x){return !p.has(x)});
  var onlyProd = [...p].filter(function(x){return !t.has(x)});
  print("[" + c + "] prod=" + p.size + " archive=" + t.size
        + " archive-prod=" + onlyTest.length + " prod-archive=" + onlyProd.length);
  if (t.size === 0 && p.size > 0) { print("  !! koleksi kosong setelah restore"); fail = 1; }
});
var idx = test.orders.getIndexes().length;
print("indexes(orders)=" + idx);
if (idx < 2) { print("!! indeks orders tidak ikut terpasang"); fail = 1; }
print(fail ? "RESULT=FAIL" : "RESULT=OK");
EOF
JS="${JS//PROD_DB/$SRC_DB}"
JS="${JS//TEST_DB/$TEST_DB}"

OUT="$(ssh "${SSH_OPTS[@]}" "$SSH_TARGET" "docker exec -i '$MONGO_CTR' mongo --quiet" <<<"$JS")"
echo "$OUT"

case "$OUT" in
  *RESULT=OK*) log "VERDICT: restore terverifikasi pada MongoDB 4.4.18 terisolasi." ;;
  *) die "verifikasi restore gagal (lihat keluaran di atas)." ;;
esac
log "database uji '$TEST_DB' akan otomatis di-drop saat skrip berakhir."
