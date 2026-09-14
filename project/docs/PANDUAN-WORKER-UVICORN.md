# Panduan: Jumlah Worker Backend (uvicorn)

## Kenapa diubah

Dulu backend dijalankan **satu worker**:

```
uvicorn server:app --host 0.0.0.0 --port 8001
```

Satu proses Python melayani SEMUA request. Sebagian pekerjaan di aplikasi ini berat dan
dihitung **di dalam proses**: laporan periode 30 hari terukur ±1 detik CPU di mesin uji —
di Raspberry Pi 4 kira-kira **4–8× lebih lambat per inti** (beberapa detik). Selama laporan
itu dihitung, request lain yang datang (kasir menyimpan pesanan, `/api/health`, dashboard)
**ikut menunggu** di antrean proses yang sama. Inilah kenapa kadang "semua halaman lambat
bersamaan" padahal CPU hanya terpakai 0,4 (bukan CPU penuh — yang penuh adalah antreannya).

Sekarang:

```
uvicorn server:app --host 0.0.0.0 --port 8001 --workers ${UVICORN_WORKERS:-2}
```

Selama satu worker menghitung laporan, worker lain tetap melayani kasir.

## Cara mengatur

`docker-compose.yml` meneruskan env `UVICORN_WORKERS` (default **2**). Di Pi, isi berkas
`.env` (sefolder `docker-compose.yml`):

```bash
echo "UVICORN_WORKERS=2" >> .env      # 2 = bawaan yang disarankan
docker compose up -d --build backend  # terapkan
docker compose logs backend --tail 20 | grep "backend start"
# contoh keluaran: backend start: worker=17 UVICORN_WORKERS=2 mongo_pool=15
```

Baris log itu sekaligus bukti jumlah worker & batas koneksi Mongo yang benar-benar dipakai.

## Berapa worker yang aman?

Tiap worker adalah proses Python terpisah (±60–90 MB RAM pada aplikasi ini). Pi pemilik
memiliki **RAM 906 MB** dengan MongoDB + nginx berjalan; menambah worker berarti mengambil
dari RAM yang sama. Karena itu:

| Kondisi Pi | Saran |
|---|---|
| RAM 1 GB (sekarang), swap di kartu SD | **2 worker** (bawaan). Jangan lebih dulu |
| RAM sudah ditambah (4 GB) atau disk pindah ke SSD/USB3 | 3–4 worker (`UVICORN_WORKERS=4`) |
| RAM sesak, swap terpakai naik terus | kembali ke 1 (`UVICORN_WORKERS=1`) |

Cara memastikan tidak kebablasan:

```bash
free -h                                     # kolom "available" & "Swap used"
docker stats --no-stream                    # RAM tiap container
```

Bila `Swap used` naik terus setelah menambah worker, RAM-lah yang jadi penghambat —
pindah data MongoDB ke SSD/USB3 atau tambah RAM lebih dulu, jangan tambah worker lagi.

Catatan: `MONGO_POOL_SIZE` (default total 30 koneksi) dibagi rata antar worker, jadi
4 worker = 8 koneksi/worker — bukan 120 koneksi. Ubah hanya bila perlu:
`MONGO_MAX_POOL_SIZE=40` di `backend/.env.docker`.

## Yang ikut diamankan agar multi-worker tidak merusak data

1. **Tugas terjadwal hanya jalan sekali.** Laporan WA harian, cek data yatim, dan cek
   integritas mingguan dulu memakai pola *baca `last_sent_date` → kirim → tulis*. Dengan
   N worker yang start bersamaan, semuanya membaca "belum terkirim" di detik yang sama
   lalu **semuanya mengirim**. Sekarang penanda itu diklaim **atomik** di MongoDB
   (`_claim_once`): hanya satu proses mendapat `matched_count = 1`. Klaim yang ditinggal
   proses mati boleh diambil alih setelah 15 menit (laporan) / 1 jam (pekerjaan mingguan),
   dan klaim **dilepas** bila tugasnya gagal supaya tick berikutnya masih bisa mencoba.
2. **Metrik dijumlahkan lintas worker.** Angka metrik hidup di memori tiap proses; tiap
   worker menulis ringkasannya tiap 15 detik (dulu 5 detik — tiap 5 detik x 2 worker berarti
   ribuan tulis kecil per jam ke MongoDB yang ada di kartu SD, menambah keausan kartu dan
   menyaingi I/O database) dan `/admin/metrics` menjumlahkan semua worker yang heartbeat-nya
   < 45 detik. Tanpa ini halaman metrik hanya menampilkan sebagian
   trafik dan seolah "tidak ada error / semua cepat".
3. **Pembuatan indeks tidak balapan.** Bila `create_index` gagal karena worker lain sedang
   membuat indeks yang sama, hasilnya dicek ulang; kalau indeksnya sudah ada dengan opsi
   yang benar, itu **bukan** temuan integritas (tidak lagi muncul sebagai "BERAT" palsu).
4. **Cache laporan tetap per worker** (TTL 20 detik untuk hari ini). Ini disengaja: batas
   basi angka tetap ≤ 20 detik di semua worker tanpa koordinasi tambahan.

## Yang TIDAK berubah

- Alamat akses tetap sama (nginx → `backend:8001`), tidak ada perubahan di APK/web/OTA.
- Cache katalog, indeks MongoDB, dan perbaikan performa sebelumnya tetap berlaku.
- Fitur yang menyentuh uang (bayar, void, settlement) tidak diubah; klaim atomik pembayaran
  yang sudah ada tetap yang menjaga transaksi tidak dobel.

## Cara memeriksa hasilnya

```bash
# 1. laporan berat berjalan lama sementara kasir tetap lancar
time curl -s -o /dev/null -H "Authorization: Bearer <token>" \
  "http://localhost/api/reports/period?preset=30d"
curl -s -o /dev/null -w "health %{time_total}s\n" http://localhost/api/health

# 2. angka metrik dari semua worker
curl -s -H "Authorization: Bearer <token>" http://localhost/api/admin/metrics | head -c 400
#    "workers": 2, "nodes": [ {...}, {...} ]
```

Kalau `health` tetap di bawah ~0,3 detik sementara laporan sedang dihitung, penambahan
worker sudah bekerja seperti yang diharapkan.
