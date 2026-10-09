# Analisa: Arsitektur Dua Database (Windows sebagai DB utama + Raspberry Pi sebagai DB sementara)

Tanggal: 2026-09-11. Status: **analisa saja — belum ada perubahan kode.** Basis analisa:
`backend/server.py` (FastAPI + Motor/MongoDB single node), `docker-compose.yml`,
`frontend/src/context/OfflineContext.jsx` (antrean offline), `frontend/src/lib/device.js`,
serta hasil pengukuran Pi pemilik (`collect-metrics-pi.sh`, 2026-09-11).

Usulan yang dinilai: *Pi menyimpan database sementara (bot/otomatisasi malam), Windows menyimpan
database utama yang cepat; saat Windows menyala terjadi sinkronisasi dua arah; selama jam operasional
aplikasi POS membaca/menulis ke database lokal di Windows.*

---

## 1. Jawaban singkat

**Bisa** — secara teknis tidak ada yang mustahil. Tetapi untuk aplikasi ini jawabannya
**"bisa, tapi jangan dua arah"**. Menyalin-menyinkronkan dua database Mongo yang keduanya
menerima tulisan **data bisnis** (transaksi, stok, poin, kas, bagi hasil vendor) akan
menghasilkan dua "kebenaran" yang berbeda tentang uang, dan aplikasi ini menghitung banyak
angka kritis (saldo vendor, kas laci, laba, poin member) **dari agregat seluruh transaksi** —
jadi begitu ada satu node yang belum tersinkron, angkanya langsung salah tanpa peringatan.

Yang perlu dikejar dari usulan Anda sebenarnya hanya dua hal:

| Yang Anda inginkan | Solusi yang benar untuk aplikasi ini |
|---|---|
| Kasir merasakan respons cepat | **Pindahkan seluruh server (backend+Mongo+nginx) ke PC Windows** — 1 database, 0 sinkronisasi. Alternatif: tetap di Pi, tapi hilangkan akar lambatnya (§3). |
| Tetap bisa jualan saat server tak terjangkau | **Sudah ada** di aplikasi: mode offline perangkat (antrean + `client_ref` idempoten + `/api/sync/push`). Sekarang default **MATI** — cukup dinyalakan. |

Sinkronisasi dua arah baru masuk akal bila **benar-benar ada penulis data bisnis di Pi saat
Windows mati** (mis. bot yang menerima pesanan/input otomatis). Kalau tidak ada, arsitektur itu
hanya menambah kompleksitas + risiko angka tidak cocok. Lihat §5 untuk versi yang aman bila memang
dibutuhkan.

---

## 2. Kondisi nyata sistem Anda sekarang (fakta)

- **Satu origin, satu database.** `docker-compose.yml`: `mongo` + `backend` (uvicorn, port 8001,
  `CMD ["uvicorn","server:app",...]` **tanpa `--workers` → 1 worker**) + `frontend/nginx` (port 80).
  Klien (browser POS Windows, APK Android, thin client) membuka `http://<IP-server>` dan semua
  request masuk ke nginx → `/api` ke FastAPI → Mongo **di mesin yang sama**. Tidak ada hop jaringan
  antar komponen.
- **Backend bisa jalan di Windows maupun Pi.** `install-windows.bat`, `backup-windows.bat`,
  `restore-windows.bat`, `update-windows.bat` sudah ada di repo, dan `docker-compose.yml` sudah
  memilih image Mongo otomatis (`${MONGO_IMAGE:-mongo:7}`; Pi dipaksa `mongo:4.4.18` karena CPU
  ARMv8.0-A). Jadi "menjadikan PC Windows sebagai server" **bukan fitur baru** — hanya perpindahan.
- **Sudah ada kanal sinkronisasi klien↔server**: `GET /api/sync/master` (tarik katalog) dan
  `POST /api/sync/push` (kirim batch order; idempoten lewat `client_ref`), dipakai oleh antrean
  offline di `OfflineContext.jsx` (`localStorage gak_pending_orders`, dikirim ulang saat online).
- **Beban Pi yang terukur** (laporan pemilik, 2026-09-11): RAM **906 MB** total, swap **511 MB**
  (217 MB terpakai) dan swap berada di **kartu SD** (`/dev/mmcblk0p2`) — database juga di SD card.
  **Load CPU hanya 0,43 dari 4 core.** Suhu 56,9 °C (bukan throttling).
- **CPU murni untuk laporan** (ukur di sandbox, motor palsu): `report_summary` 1 hari ≈ 44 ms;
  `/reports/range` 30 hari ≈ 554 ms; `/reports/period` 30 hari ≈ 959 ms. Pi 4 kira-kira 4–8×
  lebih lambat per inti → laporan bulanan bisa 4–8 detik CPU. Karena backend **satu worker** dan
  perhitungan laporan **sinkron**, selama laporan dihitung semua request lain (termasuk tombol Bayar)
  ikut menunggu. **Ini penjelasan paling masuk akal untuk "kadang semua lambat bersamaan".**

**Kesimpulan diagnosa:** masalah Anda bukan "volume request terlalu besar untuk Pi" (CPU nganggur),
melainkan **(a) RAM kecil + swap di SD card + database di SD card**, dan **(b) laporan berat yang
dihitung sinkron di worker tunggal**. Menaruh database di Windows tidak menyembuhkan (a) atau (b)
kecuali **seluruh** aplikasi ikut pindah ke Windows.

---

## 3. Kalau server tetap di Pi: yang benar-benar menyembuhkan

Urut dari yang paling berdampak per usaha:

1. **Pindahkan data Mongo + sistem ke SSD (USB 3.0) dan naikkan RAM.** Ini menyerang akar: swap di
   SD card adalah penyebab klasik "kadang semua lemot". Pi 4 1 GB → 4 GB.
2. **Snapshot laporan harian** (denormalisasi terkontrol) — sudah masuk Tier A di
   `docs/ANALISIS-FITUR-PRIORITAS.md` (#2). Hari yang sudah lewat tidak berubah lagi, jadi ringkasan
   harian bisa dihitung sekali (malam) lalu dibaca instan. Efek: baca `orders` untuk laporan turun >90%.
3. **Nyalakan mode offline perangkat** (Pengaturan → Perangkat → "Mode Offline"). Saat server
   tersendat/mati, kasir tetap bertransaksi; antrean dikirim otomatis saat server kembali; idempoten
   via `client_ref`. (Catatan desain sekarang: dengan mode ini MATI, POS **terkunci** bila server tak
   terjangkau — jadi ini pilihan sadar pemilik.)
4. **Perbaiki laporan yang benar-benar berat** (contoh nyata yang sudah dikerjakan: `report_summary`
   101 → 28 ms) dan/atau hitung laporan di luar jalur request.

---

## 4. Mengapa sinkronisasi dua arah berbahaya di aplikasi INI (bukti dari kode)

Bukan teori umum — ini jebakan konkret yang ada di kode Anda:

1. **Nomor order bentrok (blocker keras).** `gen_order_number()` mengambil nomor dari koleksi
   `counters` per tanggal (`GAK-YYYYMMDD-0001`, ...) dan **`orders.order_number` punya indeks unik**
   (`_ensure_indexes`: `await _mk("orders","order_number", unique=True)`). Dua database yang
   menjual bersamaan akan menghasilkan nomor yang **sama** (mis. keduanya `GAK-20260911-0007`).
   Saat disinkronkan, salah satu insert **ditolak** indeks unik → transaksi hilang dari laporan.
2. **Stok retail di-`$inc` di dua tempat.** Pembayaran menjalankan
   `update_one({"id":..., "track_stock": True}, {"$inc": {"stock": -qty}})` di DB tempat transaksi
   terjadi. Bila dua DB menjual SKU yang sama, stok tidak bisa "digabung" dengan benar — hasilnya
   stok negatif/drift. Aplikasi Anda punya deteksi stok negatif di Integritas, artinya masalah ini
   akan muncul sebagai temuan rutin, bukan tersembunyi.
3. **Angka uang dihitung dari SELURUH transaksi.** Saldo vendor & settlement
   (`_vendor_balance`, `_vendor_settled_map`, `/vendor-settlements/board`), kas laci & uang bersih
   (`_shift_report`), laba kotor, dan poin/kupon semuanya agregat dari order **paid**. Kalau node
   malam punya order yang belum tersinkron, pemilik bisa **membayar bagi hasil vendor dengan angka
   yang salah** — dan selisihnya baru ketahuan setelah faktanya.
4. **Klaim atomik mengandaikan satu penulis.** `_finalize_payment` dan `void_order` memakai
   `update_one({id, status: lama}, ...)` sebagai klaim (anti dobel bayar / anti stok kembali dua kali).
   Pola ini bekerja karena hanya ada **satu** DB yang menjadi pemutus; dua DB menciptakan dua pemutus.
5. **Shift & kas laci rusak lintas node.** Order menyimpan `shift_id`; shift dibuka/ditutup di satu
   node. Order yang dibuat di node lain (atau tanpa shift) tidak ikut terhitung di laporan shift →
   penutupan shift dan setoran kas jadi tidak cocok.
6. **Data master tidak bisa disinkronkan "siapa menang" dengan aman.** Sebagian besar dokumen
   **tidak punya `updated_at`** (hanya ±9 tempat di 8.471 baris `server.py`). Sinkronisasi berbasis
   waktu jadi hanya mampu menangkap **tambahan**, bukan **perubahan** → harga produk, kategori, HPP,
   resep, pengaturan, izin akun berpotensi tertimpa arah yang salah tanpa jejak.
7. **Mongo single-node = tidak ada change stream.** Mengikuti perubahan otomatis butuh replica set
   (oplog) — menambah RAM/proses di mesin yang RAM-nya justru masalah. Tanpa itu, penyalinan harus
   ditulis sendiri (kursor `created_at` + jurnal keluar + masukan ulang idempoten + laporan rekonsiliasi).
8. **Kunci idempotensi harus unik global.** `client_ref`, `payment_ref`, `settlement_no` dibuat unik
   di satu DB; di dua DB keduanya bisa memakai nilai sama untuk transaksi berbeda, dan penolakan
   indeks unik saat penggabungan mematikan justru mekanisme anti-dobel.

**Kesimpulan §4:** risiko utamanya bukan "sinkronisasinya sulit", tapi **angka uang bisa berbeda
antara dua layar tanpa error apa pun**. Untuk 1 outlet restoran, itu kerumitan yang tidak sebanding.

---

## 5. Tiga pilihan yang benar (pilih satu, jangan campur)

### Pilihan A — Satu database: pindahkan seluruh server ke PC Windows (paling langsung menjawab usulan Anda)
- Windows = Mongo + backend + nginx (bukan hanya DB). Pi = penerima backup + unit siaga, **tidak**
  melayani klien pada saat bersamaan.
- **Perubahan kode: 0.** Sudah didukung repo (`install-windows.bat`; `MONGO_IMAGE` default `mongo:7`).
- Langkah: backup di Pi (`./backup-pi.sh`) → salin `backups/*.gz` ke PC → `restore-windows.bat`
  → set IP/URL server di semua klien (browser POS & APK "Pengaturan Server") → uji banding laporan.
  Downtime realistis 15–30 menit, kerjakan di luar jam operasional.
- Konsekuensi jujur: **POS mati saat PC mati/mati lampu** (mitigasi: mode offline perangkat +
  timer/UPS; laptop lebih tahan). Remote/Tailscale pindah ke Windows bila akses dari luar LAN masih
  dibutuhkan.
- Yang perlu disiapkan bila pindah ke Windows: skrip operasional saat ini berbasis bash
  (`update-pi.sh`, `check-integrity-pi.sh`, `backup-to-cloud.sh`, `setup-autobackup-pi.sh`)
  → perlu WSL/Git-Bash atau saya buatkan padanan `.ps1/.bat`. Tombol "Update Sekarang" (1-klik) juga
  perlu diuji di Docker Desktop (bind mount Windows + ekstraksi tar).

### Pilihan B — Tetap satu database di Pi: perbaiki akarnya (§3), nol risiko data
- Hardware (SSD/RAM) + snapshot laporan harian + nyalakan mode offline perangkat.
- Konsekuensi: PC Windows tetap hanya menjadi **klien** (kasir), bukan server — sesuai desain sekarang.

### Pilihan C — Dua node, tapi **bukan** sinkronisasi dokumen dua arah (hanya bila §5.1 benar-benar perlu)
Syarat mutlaknya: **ada penulis data bisnis nyata di Pi saat Windows mati.** Bila motifnya hanya
"bot/otomatisasi malam perlu input", §6 adalah jawabannya (jauh lebih murah).
Desain minimum yang aman:
1. **Satu pemimpin untuk uang.** Yang menulis order/keuangan hanya satu node pada satu waktu;
   node kedua bersifat "penerima" (read-only untuk laporan) atau hanya koleksi yang benar-benar
   terpisah (mis. hasil otomatisasi malam yang bukan transaksi).
2. **Identitas bercabang per node**: nomor order & settlement diberi awalan node (`GAK-W-...`,
   `GAK-P-...`) supaya tidak pernah bertabrakan; `id` uuid4 sudah aman.
3. **Jurnal keluar (outbox) append-only** + masukan ulang idempoten (kunci = `id` dokumen,
   bukan `client_ref` acak), bukan penyalinan dokumen "siapa yang terbaru menang".
4. **Semua angka turunan dihitung ulang dari data gabungan** (stok, poin, `counters`, saldo vendor,
   kas laci) — jangan `$inc` di node pinggir.
5. **Laporan rekonsiliasi wajib**: halaman yang membandingkan total (per hari: jumlah order, omzet,
   tunai, poin) di kedua node, dan memberi peringatan bila selisih > 0. Ini yang mencegah pemilik
   terlanjur membayar vendor dengan angka salah.
6. Perkiraan usaha: **mingguan (2–6 minggu) + uji besar**, dan tetap ada risiko residu. Untuk
   skala 1 outlet, jelas bukan pilihan paling rasional.

> **TAMBAHAN (2026-09-11):** pemilik lalu mengusulkan PC sebagai server **utama** dan Pi sebagai
> **cadangan** yang menggantikan saat PC mati, lalu database diperbarui ke PC saat PC menyala.
> Rancangan lengkapnya sudah dibuat terpisah: **`docs/RANCANGAN-WINDOWS-UTAMA-PI-CADANGAN.md`**
> (memakai SATU database direplikasi / MongoDB *replica set*, bukan dua database) — termasuk
> arbiter/mayoritas, write concern & risiko rollback, pintu masuk & pengalihan otomatis, dan uji wajib.

### 5.1 Pertanyaan yang menentukan (belum bisa saya putuskan tanpa ini)
1. **Siapa yang menulis data bisnis ke Pi saat Windows mati?** Bot apa persisnya (WA pesanan masuk?
   input otomatis? POS cadangan dipakai orang)?
2. **PC Windows menyala kapan?** 24/7, atau hanya jam buka (dan Pi yang jaga malam)?
3. Apakah akses dari luar LAN (Tailscale/Funnel untuk APK & pemilik) tetap wajib setelah pindah?
4. Kapan kasir merasa lambat: saat **bayar**, saat **buka laporan/dashboard**, atau kapan saja?

---

## 6. Kalau motif sebenarnya adalah "bot / otomatisasi malam"

Jangan bikin database kedua. Bot adalah **klien**, bukan database:
- Bot memakai **API yang sama** (`/api/...`) dengan akun sendiri (role kustom + izin modul ala
  Pengaturan → Roles & Izin). Semua validasi, idempotensi, dan laporan tetap satu sumber.
- Bila bot harus memproses transaksi hasil kiriman malam, jadwalkan saat server hidup. Perlu
  diketahui: Pi Anda punya jadwal **mati otomatis 01:00** (`setup-power-schedule-pi.sh`, dan nyala
  butuh smart plug karena Pi tidak punya wake-timer) — jadi "pekerjaan malam" di Pi justru bertabrakan
  dengan kebiasaan mematikan Pi. Kalau memang butuh malam, matikan auto-shutdown dan biarkan Pi
  menyala (beban nganggur Pi sangat kecil: load 0,43).

---

## 7. Rekomendasi

1. **Jangan terapkan sinkronisasi dua arah** untuk kebutuhan saat ini. Tidak ada penulis bisnis di
   Pi saat Windows mati (dari analisa kode & skrip: pekerjaan malam di Pi hanya *membaca* untuk
   laporan WA/backup/integritas/update), sehingga dua DB hanya menambah risiko angka tidak cocok.
2. **Ukur dulu, baru pindah.** Baca `/api/admin/metrics` (halaman Pengaturan → Fitur & Integrasi →
   Integritas/Diagnostik) dan `collect-metrics-pi.sh --with-timing` untuk melihat endpoint mana yang
   benar-benar lambat. Kalau yang lambat adalah **laporan**, solusinya snapshot (§3.2) — bukan pindah DB.
3. **Kalau memang Windows lebih kuat & menyala sepanjang jam operasional**, ambil **Pilihan A**
   (1 server di Windows, Pi cadangan). Itu menjawab keluhan responsivitas kasir dengan 0 kode baru.
4. **Apa pun pilihannya: buat backup dulu.** Laporan integritas terakhir menunjukkan folder
   `backups/` **kosong** padahal sudah ada ratusan transaksi — jalankan `./backup-pi.sh` dan
   `./setup-autobackup-pi.sh` sebelum melakukan perubahan arsitektur apa pun.

---

## 8. Lampiran — Checklist bila mengambil Pilihan A (pindah server ke Windows)

1. Pi: `./backup-pi.sh` → pastikan `backups/gak-backup-*.gz` tercipta dan berukuran wajar; salin ke
   flashdisk/PC (jangan lewat WiFi bila ukurannya besar).
2. PC Windows: pasang Docker Desktop (WSL2), salin folder proyek **terbaru** (versi terpasang di Pi
   harus sama — cek `.aistudio-version`), buat `backend/.env.docker` (samakan `JWT_SECRET`,
   `ADMIN_EMAIL`, `ADMIN_PASSWORD`; jangan biarkan nilai contoh).
3. PC: `docker compose up -d --build` → `restore-windows.bat backups\gak-backup-XXXX.gz`
   (**ini menimpa data di PC** — hanya saat pertama).
4. Uji banding di luar jam operasional: jumlah order hari terakhir, omzet harian, kas laci shift
   terakhir, saldo vendor, stok retail beberapa SKU → harus sama dengan angka di Pi.
5. Ganti alamat server di klien: browser POS (`http://IP-PC`), APK Android (Pengaturan Server),
   thin client opname (alamatnya dikunci ke funnel Tailscale — perlu diperbarui bila dipakai).
6. Baru setelah semua klien pindah, hentikan stack di Pi (`docker compose down`, **tanpa `-v`** agar
   data lama tetap utuh) dan ubah Pi menjadi penerima backup.
7. Operasional di Windows: butuh padanan WSL/Git-Bash untuk skrip bash (update, integritas, kirim backup).
