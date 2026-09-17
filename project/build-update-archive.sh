#!/usr/bin/env bash
# Bangun artefak Update Center (vibecoder.co.id) dari isi git.
#
# Menghasilkan, di folder Update Center (bawaan ../pos-grand-update):
#   project/         -> SALINAN FOLDER PROYEK apa adanya (TANPA kompresi / tanpa tar):
#                       inilah yang ditampilkan & bisa diunduh satu per satu di
#                       files.php / file.php.
#   pos-grand.tar.gz -> arsip berkompresi, HANYA untuk update otomatis di server Pi
#                       (satu berkas yang diunduh update-vibecoder-pi.sh).
#   version.json     -> versi (hash commit) + waktu + jumlah berkas
#
# Berkas .env, backend/.env.docker, backups/ dan .git TIDAK ikut karena semuanya
# dibangun dari `git ls-files` (hanya berkas yang di-track).
#
# Pakai:  ./build-update-archive.sh [folder-tujuan]
set -euo pipefail
cd "$(dirname "$0")"

OUT="${1:-../pos-grand-update}"
mkdir -p "$OUT"
OUT="$(cd "$OUT" && pwd)"

VER="$(git rev-parse --short HEAD)"
if [ -n "$(git status --porcelain)" ]; then
  echo "PERINGATAN: masih ada perubahan yang belum di-commit."
  echo "Artefak diambil dari BERKAS DI DISK — commit dulu bila ingin artefak = commit ini:"
  git status --short | sed 's/^/  /'
  echo
fi

N="$(git ls-files | wc -l | tr -d ' ')"

# 1. Salinan folder proyek (tanpa kompresi apa pun) — dibersihkan dulu supaya berkas
#    yang sudah dihapus dari repo tidak tertinggal di Update Center.
rm -rf "$OUT/project"
mkdir -p "$OUT/project"
git ls-files -z | tar --null --format=ustar -cf - -T - | tar -xf - -C "$OUT/project"

# 2. Arsip kompresi untuk update otomatis server Pi.
git ls-files -z | tar --null --format=ustar -cf - -T - | gzip -9 -c > "$OUT/pos-grand.tar.gz"

# 3. Bersihkan sisa arsip lama TANPA kompresi (tidak dipakai lagi).
rm -f "$OUT/pos-grand.tar"

cat > "$OUT/version.json" <<EOF
{
  "version": "$VER",
  "url": "pos-grand.tar.gz",
  "dir": "project",
  "files": $N,
  "updated": "$(date -u '+%Y-%m-%d %H:%M:%S') UTC"
}
EOF

echo "Versi        : $VER ($N berkas)"
echo "Folder proyek: project/ ($(du -sh "$OUT/project" | cut -f1), tanpa kompresi)"
echo "Tar.gz       : $(du -h "$OUT/pos-grand.tar.gz" | cut -f1) (khusus update otomatis server)"
echo "version.json:"
cat "$OUT/version.json"
echo
echo "Langkah berikutnya: terbitkan app 'pos-grand-update' (PublishApp) bila isi landing berubah."
