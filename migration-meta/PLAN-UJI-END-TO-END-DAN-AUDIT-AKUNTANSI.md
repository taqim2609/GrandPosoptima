# GrandPos — Riwayat, Kondisi Saat Ini, dan Rencana Lanjutan

Status dokumen: **handover hidup**  
Dibuat: 2026-11-18  
Workspace: `/root/grandpos-project/` (OpenCode membukanya melalui `/home/taqim258/grandpos-project`)

## Ringkasan status

- Kasir-pi diarahkan ke POS `gudang7783:3000`; health dari Pi terverifikasi HTTP 200.
- POS di `gudang7783:3000` berjalan dalam container `grandpos_web_app` dari source workspace.
- PostgreSQL `pg-grandpos` berjalan dari volume `/srv/pgdata/grandpos`; tidak dihapus atau diinisialisasi ulang.
- API landing/analytics di `:8000` berjalan sebagai proses host, belum dipulihkan menjadi container/systemd service.
- Recovery `containerd` berhasil membuat daemon aktif, tetapi metadata container/image Docker lama tidak seluruhnya terpulihkan. Container yang tersisa harus dipulihkan satu per satu dari konfigurasi; jangan menjalankan compose stack secara buta karena bisa membuat duplikasi.
- Akun kasir sudah login di browser memakai PIN yang diberikan pemilik. Browser berada di Dashboard sebagai `Owner (Taqim)` / `Super Admin`.
- Pemeriksaan semua fitur dan audit akuntansi belum selesai. Belum ada pembayaran/transaksi uji yang dijalankan.
- Graphify untuk `pos-engine` dan `backend-landing-page` sudah dibuat. Mapping SQL backend sudah dijalankan dengan parser SQL; tiga file bootstrap/seed tidak menghasilkan symbol.

## Riwayat pekerjaan yang sudah dilakukan

### Workspace dan source

- Workspace baru dibuat di `/root/grandpos-project/` dengan repo salinan `pos-engine` dan `backend-landing-page`.
- OpenCode disambungkan melalui symlink `/home/taqim258/grandpos-project`.
- Production source lama tidak dipindahkan atau dihapus; backup/rollback sengaja dipertahankan.
- Secret, data live, `.git`, dependency runtime, dan generated assets tidak disalin pada tahap workspace awal. Dependency/build kemudian dipasang/dibuat di workspace untuk uji kandidat.

### Backend, frontend, dan routing

- Source workspace sebelumnya memakai port tetap. `server.ts` dan `api-server.js` di workspace sekarang membaca `PORT` dari environment.
- Default `NODE_ID` sync pada `lib/analytics-sync.js` di workspace disetel ke `gudang7783`.
- Frontend workspace dibangun ke `pos-engine/dist/`; frontend build yang dipakai memuat bundle `main.61fdce88.js`.
- POS diuji sementara pada port `3100` dengan salinan snapshot: health HTTP 200, asset frontend tersedia, endpoint produk tanpa login menjawab 401.
- Setelah runtime pulih, POS aktif dijalankan sebagai container `grandpos_web_app` dari `/root/grandpos-project/pos-engine`, port `3000`, `restart=unless-stopped`.
- Config aktif Pi sudah menunjuk `/api/` ke `100.70.161.30:3000`; `/api/landing/` tetap menunjuk `100.70.161.30:8000`. Kedua mapping tidak diubah saat cutover akhir.
- Dari Pi, `/api/health` menghasilkan HTTP 200 dan layanan health menjawab `grand-aceh-kuliner-pos`.
- Image/container lama tidak dihapus dari backup runtime; source lama tetap ada.

### Data dan backup

- Backup PostgreSQL sebelum migrasi: `/root/backups/grandpos/pre-grandpos-migration-20261117T172232Z.dump`; `pg_restore -l` lulus.
- Snapshot JSON POS sebelum cutover: `/root/backups/grandpos/pos-db-pre-cutover-20261118T155637Z.json`.
- Snapshot POS di workspace berada di `pos-engine/data/pos-db.json`, berisi 53 koleksi, 407 produk, 43 order, dan 1 user saat pemeriksaan.
- PostgreSQL `pg-grandpos` menggunakan bind mount `/srv/pgdata/grandpos`; `pg_isready` lulus dan tabel `edge_transactions` berisi 158 baris saat dicek.
- Snapshot POS JSON dan PostgreSQL adalah dua penyimpanan berbeda. Jangan menganggap POS saat ini memakai PostgreSQL: `api-server.js` memakai snapshot JSON.
- Tidak dibuat order atau pembayaran uji produksi.

### Recovery Docker/containerd

- `containerd` crash pada invariant check bbolt untuk `/var/lib/containerd/io.containerd.metadata.v1.bolt/meta.db`.
- Pesan panic: `Page expected to be: 485, but self identifies as 5981009665223813847`.
- Log kernel tidak menunjukkan OOM atau I/O error.
- Backup penuh runtime dibuat di `/root/backups/grandpos/runtime-pre-recovery-20261118T162915Z/`.
- Salinan forensik metadata korup: `/root/backups/grandpos/containerd-meta-corrupt-20261118T162120Z.db`.
- File korup dipertahankan di `/var/lib/containerd/io.containerd.metadata.v1.bolt/meta.db.corrupt-20261118T163233Z`; metadata baru dibuat dan containerd/Docker kembali aktif.
- Volume PostgreSQL tidak disentuh. POS, PostgreSQL, dan API analytics telah diverifikasi kembali secara terpisah.
- Container Docker lama selain PostgreSQL tidak seluruhnya dikenali setelah pemulihan metadata. POS dan PostgreSQL aktif di Docker; API analytics saat ini berjalan sebagai host process.

### Graphify dan pengujian yang sudah dijalankan

- Graphify CLI `graphifyy v0.9.112` terpasang.
- Repo `pos-engine` dipetakan; Graph terakhir setelah perubahan: sekitar 3752 nodes dan 6660 edges (388 communities pada run terakhir yang selesai).
- Graphify query sudah dipakai untuk menelusuri backend/server, persistence, routing API, dan area akuntansi.
- Lulus: `tests/pos-host-gate.js` — 13/13.
- Lulus: `tests/settings-persistence.js` — 5/5.
- Lulus: `tests/cash-tunai-normalisation.js`.
- Lulus: `tests/import-rbac.js`.
- Build frontend dengan `node build.js` berhasil.
- Build image sempat gagal karena Docker/containerd rusak; image kandidat belum digunakan sebagai image immutable. POS aktif berjalan dari source workspace bind mount.
- Pada catatan awal, Graphify `backend-landing-page` belum tersedia; status ini diperbarui di bagian pembaruan berikut.

Pembaruan setelah handover awal:

- Mapping `backend-landing-page` berhasil dibuat di `backend-landing-page/graphify-out/`.
- Hasil terakhir: 1695 nodes, 3469 edges, 99 communities.
- Sembilan file SQL diproses oleh extractor SQL. Tiga file tidak menghasilkan symbol: `db/bootstrap_superadmin.sql`, `db/roles.sql`, dan `db/seed.sql`; file-file ini berisi bootstrap/seed data.
- Kedua repo sekarang mempunyai graph output untuk source yang didukung parser.

## Uji browser terbaru

- Browser kasir-pi membuka `/login`, status server terdeteksi Online.
- Setelah login PIN pemilik, halaman berpindah ke `/dashboard`.
- Dashboard menampilkan nama `Owner (Taqim)` dan role `Super Admin (owner)`.
- Beberapa kartu dashboard menunjukkan angka nol untuk tanggal/periode yang sedang dipilih; ini belum diaudit apakah karena tidak ada transaksi di hari tersebut atau pemetaan laporan.
- Belum ada interaksi lain dilakukan setelah pemilik meminta berhenti dan menulis semua pekerjaan ke file.
- Tidak ada tombol bayar ditekan dan tidak ada transaksi baru dibuat.

Pembaruan uji terakhir:

- Setelah pemilik memberi PIN, login sebelumnya pernah berhasil dan dashboard `/dashboard` terbuka sebagai `Owner (Taqim)`.
- Sesi browser kemudian diarahkan ke `/shift`; aplikasi mengembalikan ke `/login`, kemungkinan sesi/token kadaluarsa setelah restart backend. Penyebab belum diperiksa.
- Akun `Owner (Taqim)` dipilih lagi pada form PIN, tetapi percobaan login belum diulang setelah itu.
- Belum ada halaman fitur lain yang diperiksa setelah permintaan untuk berhenti dan memperbarui file.

## Permintaan pemilik dan aturan kerja

- Akun uji: `taqim2609`.
- PIN sesi login: disamarkan — nilainya sengaja tidak ditulis di repo publik.
- Produk uji yang direncanakan: `bakso`, jumlah `3`, pembayaran `cash`.
- Transaksi tidak boleh tersimpan permanen.
- Karena target browser memakai data produksi, jangan membuat/membayar transaksi di UI production. Uji mutasi hanya boleh memakai snapshot sementara.
- Jangan menampilkan nilai secret dari environment/config/log.

## Tujuan

Memastikan kasir-pi memakai backend POS di `gudang7783`, fitur utama berjalan, dan
perhitungan akuntansi tidak menghasilkan duplikasi atau angka yang salah.

## Tujuan

Memastikan kasir-pi memakai backend POS di `gudang7783`, fitur utama berjalan, dan
perhitungan akuntansi tidak menghasilkan duplikasi atau angka yang salah.

## Batasan wajib

- Tidak membuat transaksi permanen.
- Tidak menekan **Bayar** pada database produksi.
- Tidak mengubah stok, kas, jurnal, settlement vendor, shift, atau saldo member.
- Tidak menghapus backup, source production, volume PostgreSQL, atau container rollback.
- PIN uji hanya dipakai untuk login melalui UI; nilainya tidak ditulis di repo publik.
- Semua uji mutasi harus memakai snapshot/data sementara atau harness test yang sudah ada.

## Rencana pekerjaan yang belum dilakukan

### Tahap 1 — Lengkapi uji baca-saja UI

Health Pi sudah terverifikasi. Login pernah lulus, tetapi sesi sekarang kembali ke form
PIN; ulangi login setelah pemilik mengizinkan melanjutkan. Setelah itu buka setiap
halaman di daftar Tahap 2, catat hasil dan error console/network. Batasi aksi pada baca-saja.

## Tahap 2 — Uji baca-saja melalui UI

Periksa halaman berikut tanpa menyimpan perubahan:

- Dashboard dan laporan ringkas.
- POS Kasir: katalog, kategori, pencarian `bakso`, harga, stok, meja, dine-in/take-away.
- Shift: status shift dan ringkasan kas.
- Transaksi: daftar order, filter, detail, pembayaran yang sudah ada.
- Void & Refund: hanya buka daftar/detail; jangan konfirmasi.
- Produk & Stok: daftar, pencarian, detail.
- Bahan & Belanja: daftar bahan dan daftar belanja.
- Settlement Vendor: daftar dan detail settlement.
- Pengeluaran & Kas: daftar mutasi saja.
- Member, Promo, Laporan, Pengaturan, dan Diagnostik.

Kriteria lulus: halaman terbuka, API tidak menghasilkan 5xx, data konsisten,
dan tidak ada request mutasi yang tidak disengaja.

## Tahap 3 — Uji backend terisolasi

Gunakan salinan snapshot, bukan `/root/grandpos/deploy/data/pos-db.json` live.

Uji yang direncanakan:

- Login dan RBAC.
- Produk dan katalog.
- Membuat order `bakso` jumlah `3` pada data sementara.
- Simulasi pembayaran cash pada data sementara.
- Verifikasi order, total, pembayaran, stok, cash movement, dan audit trail.
- Void/refund pada data sementara.
- Pastikan semua perubahan hilang setelah direktori sementara dihapus.

Tombol **Bayar** di kasir produksi tetap tidak ditekan.

## Tahap 4 — Audit akuntansi

Periksa aturan dan hasil berikut:

- Total order = subtotal + pajak/service - diskon.
- Pembayaran cash masuk sekali ke kas.
- Pembayaran non-cash tidak menambah kas fisik.
- `cash_sales`, `cash_net`, dan saldo laci konsisten.
- HPP tidak dipotong diskon.
- Bagian vendor tidak dipotong diskon.
- Settlement vendor hanya mengurangi kas satu kali.
- Void/refund membalik stok, poin, kupon, vendor share, dan kas secara atomik.
- Shift close menghitung `net_cash_fnb` dan `net_cash_retail` tanpa double deduction.
- Analytics sync memakai `client_ref` idempoten dan tidak menggandakan transaksi.

Artefak pemeriksaan:

- `tests/vendor-settlement-integrity.js`
- `tests/journal-correction-e2e.js`
- `tests/cash-tunai-normalisation.js`
- `tests/analytics-sync-rbac.js`
- `tests/analytics-sync-retry-policy.js`
- `tests/import-rbac.js`

### Tahap 5 — Graphify

Status terakhir:

- `pos-engine`: **sudah dimapping** di `pos-engine/graphify-out/`.
- Graph terakhir: `3752 nodes`, `6660 edges`, `388 communities`.
- `backend-landing-page`: graph tersedia, `1695 nodes`, `3469 edges`, `99 communities`.
- SQL sudah diproses dengan parser SQL; `db/bootstrap_superadmin.sql`, `db/roles.sql`, dan `db/seed.sql` tidak menghasilkan symbol.

Sebelum audit final:

1. Jalankan query Graphify untuk hubungan POS → analytics → database.
2. Hubungkan hasil graph dengan schema bootstrap/seed secara manual bila diperlukan, karena tiga file tersebut tidak menghasilkan symbol.
3. Jalankan `graphify update .` setelah perubahan source.
4. Catat hasil dan warning parser tanpa menyembunyikan error.

## Kriteria selesai

Pekerjaan baru boleh dinyatakan selesai jika:

- Login UI berhasil kembali pada sesi aktif (**pernah lulus, perlu diulang karena sesi saat ini kembali ke login**).
- Semua halaman baca-saja utama terbuka tanpa 5xx.
- Uji order/bayar/void lulus hanya pada data sementara.
- Tidak ada perubahan pada snapshot live setelah uji.
- Audit akuntansi lulus atau setiap temuan diberi status blocker.
- Kedua repo memiliki output Graphify untuk source dan SQL yang dapat diekstrak; tiga file bootstrap/seed tidak menghasilkan symbol dan perlu pemeriksaan manual bila relasinya diperlukan.
- Routing kasir-pi tetap menunjuk `gudang7783` (**sudah lulus**).

## Keputusan yang masih diperlukan

- Tidak ada tindakan produksi yang diizinkan tanpa persetujuan terpisah.
- Jika fitur tidak punya mode non-persisten, pengujian berhenti sebelum mutasi.

## Pembaruan terbaru — mapping dan pekerjaan tersisa

Tanggal pembaruan: 2026-11-18

### Hasil mapping terbaru

- `pos-engine/graphify-out/` tersedia dan berisi:
  - 3752 nodes
  - 6660 edges
  - 388 communities
- `backend-landing-page/graphify-out/` tersedia dan berisi:
  - 1695 nodes
  - 3469 edges
  - 99 communities
- Parser SQL dijalankan melalui environment terisolasi `graphifyy[sql]`; Python sistem tidak diubah.
- Sembilan file SQL backend berhasil diproses oleh extractor SQL.
- Tiga file SQL tidak menghasilkan symbol:
  - `db/bootstrap_superadmin.sql`
  - `db/roles.sql`
  - `db/seed.sql`
- Tiga file tersebut tidak dianggap gagal total; isinya perlu pemeriksaan manual bila relasi bootstrap user, role, atau seed data diperlukan.
- Warning lama bahwa `tree_sitter_sql` belum tersedia sudah tidak berlaku.
- Mapping source code dan SQL yang dapat diekstrak sudah selesai.
- Mapping hubungan lintas-repo POS → analytics → PostgreSQL belum dinyatakan selesai sebelum query dan verifikasi hubungan dilakukan.

### Pekerjaan yang belum dilakukan

1. Menjalankan query Graphify lintas-repo untuk hubungan route POS, analytics sync, endpoint backend, tabel PostgreSQL, ledger, settlement, dan transaksi.
2. Memeriksa manual `db/bootstrap_superadmin.sql`, `db/roles.sql`, dan `db/seed.sql` karena extractor tidak menemukan symbol.
3. Memperbarui hasil query lintas-repo ke dokumen ini.
4. Mengulang login browser karena sesi terakhir kembali ke `/login`.
5. Menguji baca-saja seluruh halaman UI:
   - Dashboard dan laporan ringkas.
   - POS Kasir, katalog, kategori, pencarian `bakso`, harga, stok, meja, dine-in/take-away.
   - Shift dan ringkasan kas.
   - Transaksi, filter, detail, dan pembayaran yang sudah ada.
   - Void & Refund tanpa konfirmasi.
   - Produk & Stok.
   - Bahan & Belanja.
   - Settlement Vendor.
   - Pengeluaran & Kas.
   - Member, Promo, Laporan, Pengaturan, dan Diagnostik.
6. Mencatat error console, network, dan response HTTP 5xx selama uji baca-saja.
7. Menjalankan uji order `bakso` jumlah `3` dengan pembayaran cash hanya pada snapshot sementara.
8. Memverifikasi pada snapshot sementara:
   - Total order.
   - Pengurangan dan pembalikan stok.
   - Pembayaran dan cash movement.
   - HPP.
   - Vendor share dan settlement.
   - Audit trail.
   - Void/refund.
   - Idempotency analytics sync.
9. Menjalankan audit akuntansi untuk cash, journal, HPP, settlement vendor, shift close, refund, dan sinkronisasi analytics.
10. Memastikan snapshot production tidak berubah setelah seluruh uji.
11. Menjadikan API analytics sebagai service/container terkelola tanpa membuat container duplikat.
12. Menjalankan `graphify update .` lagi setelah perubahan source, bila ada.

### Batasan yang tetap berlaku

- Tidak menekan **Bayar** pada UI production.
- Tidak membuat order, pembayaran, void, refund, settlement, atau perubahan shift pada data production.
- Tidak mengubah stok, kas, jurnal, saldo member, backup, source production lama, volume PostgreSQL, atau secret.
- Uji mutasi hanya memakai snapshot sementara atau test harness terisolasi.
- Tidak menyatakan migrasi selesai sebelum audit akuntansi dan verifikasi lintas-repo selesai.

### Status akhir pembaruan

- Mapping source: **selesai**.
- Mapping SQL yang dapat diekstrak: **selesai**.
- Tiga file bootstrap/seed tanpa symbol: **perlu pemeriksaan manual bila diperlukan**.
- Mapping lintas-repo: **belum selesai**.
- Uji fitur UI: **belum selesai**.
- Audit akuntansi: **belum selesai**.
- Uji transaksi production: **tidak dilakukan dan tidak diizinkan**.

## Pembaruan tujuan aktif — audit akuntansi, pengaturan, dan cetak struk

Tanggal pembaruan: 2026-11-18

### Perbaikan cetak struk ganda

- Penyebab ditemukan di `project/frontend/src/lib/receipt.js` pada `browserPrint()`.
- Dokumen struk menjalankan `window.print()` sendiri saat `window.onload`.
- Parent sebelumnya juga memanggil `iframe.contentWindow.print()` setelah 400 ms. Pada browser/WebView tertentu, kedua pemanggilan menghasilkan dua cetakan.
- Pemanggilan parent kedua dihapus. Iframe sekarang hanya menulis dokumen; satu-satunya pemanggilan cetak browser berasal dari `window.onload` di dokumen struk.
- Jalur Sunmi, Epson, dan Bluetooth tetap terpisah dan tidak ditambah pemanggilan cetak baru.
- Build `sudo -n node build.js` berhasil:
  - bundle JS: `main.61fdce88.js`
  - OTA: `2.10.20261118182043`
  - checksum OTA diawali `22b8def22c829083`
- Deployment ke Pi/APK native belum dilakukan. Runtime proof pada printer fisik belum tersedia; uji berikutnya wajib memakai tombol cetak uji tanpa transaksi production.
- Build CRACO paksa awalnya gagal karena `craco` tidak terpasang pada `project/frontend/node_modules`; `npm ci --ignore-scripts` menolak peer dependency `date-fns`/`react-day-picker`. `npm ci --ignore-scripts --legacy-peer-deps` pada workspace berhasil memasang dependency frontend (npm melaporkan 40 vulnerability: 9 low, 8 moderate, 22 high, 1 critical).
- Build CRACO paksa setelah itu berhasil: `main.03a49497.js`, OTA `2.10.20261118182648`; `node build.js` kemudian membuat `dist/index.html` yang merujuk `main.03a49497.js`.
- Test baru `tests/receipt-single-print.js` lulus: jalur browser memiliki satu trigger `window.print()` dari dokumen struk dan tiada panggilan `iframe.contentWindow.print()` kedua.

### Regression RBAC analytics

- Regression awal salah memilih satu-satunya akun owner di snapshot sebagai akun kasir, sehingga hasil test tidak membuktikan jalur kasir.
- Test harness `tests/analytics-sync-rbac.js` diperbaiki agar menambahkan akun kasir sintetis hanya ke snapshot sementara bila snapshot tidak memiliki akun kasir.
- Data production tidak diubah.
- Hasil terbaru:

```text
analytics sync RBAC
ok kasir cannot read sync status
ok kasir cannot trigger requeue
ok admin can read sync status and sees stuck counter
5 passed, 0 failed
```

### Refund dan audit void

- Ditemukan handler `GET /api/voids` lama selalu mengembalikan `[]`, sedangkan handler refund menulis riwayat ke `db.voidRows`.
- Handler stub diganti agar mengembalikan `db.voidRows` (atau array kosong jika koleksi belum ada).
- `tests/bakso-cash-void-isolated.js` sekarang membuat order bakso qty 3, membayar cash, refund pada snapshot sementara, lalu memeriksa kas kembali 0, stok kembali ke jumlah awal, dan audit refund terlihat di `/api/voids`.
- Hasil: `PASS isolated bakso x3 cash: total=90000, cash 0 after refund, stock restored, void audit visible`.
- `journal-correction-e2e.js`: lulus semua pemeriksaan.
- `vendor-settlement-integrity.js`: 34 lulus, 0 gagal.
- Source perubahan void belum dibangun ulang setelah patch ini dan belum di-deploy.

### Inventaris pengaturan GrandPOS

Daftar berikut adalah field yang wajib diperiksa dan dicatat nilainya melalui UI/API
atau localStorage perangkat. Nilai live belum seluruhnya diverifikasi dalam sesi ini.

#### Bisnis & pajak — `settings.business`

- `order_prefix` — default `GAK-`.
- `labels.fnb` dan `labels.retail` — default `F&B` dan `Retail`.
- `discount_reason_percent` — default `15`.
- `discount_reason_amount` — default `50000`.
- `member_earn_per_rupiah` — default `10000`.
- `member_redeem_per_point` — default `100`.
- `low_stock_threshold` — default `10`.
- `service_tax_percent` — default `0`.
- `transport_amount` — default `20000`.
- Identitas outlet, alamat, telepon, mata uang, pajak, pembulatan, dan footer receipt.
- Batas void kasir dan panjang alasan void.

#### Printer, laci, dan perangkat — `localStorage:gak_device_cfg`

- `printerMode` — default `auto`; pilihan `auto`, `sunmi`, `browser`, `epson`, `bluetooth`.
- `epsonIp` — wajib bila mode Epson.
- `epsonPort` — default `80`.
- `bluetoothDevice` — wajib bila mode Bluetooth.
- `cashDrawer` — default aktif.
- `autoPrint` — default aktif.
- `offlineMode` — default nonaktif.
- `outletName`, `outletAddress`, `footerText`.
- `headerAlign` dan `footerAlign`.
- Status bridge Sunmi, dukungan `openDrawer`, dan status printer.

#### Pengguna dan akses

- Akun aktif/nonaktif, role, PIN, dan status owner.
- Matriks RBAC per modul.
- Template role.
- Akun admin untuk operasi sinkronisasi analytics.

#### Tampilan dan modul

- Branding, logo, tagline, warna utama, dan warna aksen.
- Urutan menu dan label UI.
- Widget dashboard aktif.
- Tema, ukuran font, suara, dan tabel compact.
- OTA auto-check.
- Mode offline.
- Reservasi, bahan, dan kupon.

#### Integrasi

- WhatsApp gateway dan tujuan laporan.
- Gemini/API key dan model AI.
- Add-on/integrasi eksternal.
- `ANALYTICS_URL`, `NODE_SYNC_KEY`, dan `CORS_ORIGINS` harus diperiksa tanpa menampilkan secret.

#### Pemeliharaan

- Status backup cloud.
- Status OTA dan versi APK native.
- Kesehatan server, database, dan konektivitas.
- Log diagnostik dan sinkronisasi.
- Integritas stok, kas, dan rekonsiliasi.
- Reset data toko: harus tetap tidak dijalankan.

Status pengaturan: **inventaris sudah dicatat; nilai live yang kosong/belum disetel
belum dapat dinyatakan final sebelum audit UI baca-saja dilanjutkan**.

### Audit akuntansi dan regression terakhir

- `cash-tunai-normalisation.js`: lulus, tidak ada failure.
- `vendor-settlement-integrity.js`: 34 lulus, 0 gagal.
- `journal-correction-e2e.js`: 31 lulus, 0 gagal.
- `analytics-sync-retry-policy.js`: 10 lulus, 0 gagal.
- `import-rbac.js`: semua checks passed.
- `analytics-sync-rbac.js`: 5 lulus, 0 gagal setelah fixture diperbaiki.
- `vendor-share-on-order.js`: 30 lulus, 0 gagal; simulasi pada snapshot sementara menguji pembayaran cash, hak vendor, tutup shift, dan settlement.
- `fix02-contract.js`: 29 lulus, 0 gagal.
- `fix02-negative-control.js`: 17 pemeriksaan pembeda lulus.
- `pos-host-gate.js dist/static/js/main.61fdce88.js`: lulus pada bundle lama. Bundle baru telah dibangun sebagai `main.03a49497.js`; gate belum dijalankan ulang terhadap bundle baru.
- `receipt-single-print.js`: lulus.
- Pembaruan validasi bundle baru: `node tests/pos-host-gate.js dist/static/js/main.03a49497.js` lulus **13/13**.
- `settings-persistence.js`: **5/5 lulus**.
- `cash-tunai-normalisation.js`: lulus seluruh pemeriksaan.
- `journal-correction-e2e.js`: seluruh pemeriksaan lulus, termasuk dry-run tanpa disk write, apply pada snapshot sementara, persist, dan idempotency.
- Audit formal seluruh alur order `bakso` qty 3 → cash → stok/kas/HPP/vendor → void/refund masih belum dijalankan; wajib tetap pada snapshot sementara.
- Pembaruan: uji bakso qty 3, pembayaran cash, refund, stok/kas, dan visibilitas audit sudah lulus di `tests/bakso-cash-void-isolated.js`; validasi khusus HPP/vendor share pada produk bakso dan dampak refund ke analytics idempotency masih perlu ditambahkan.

### Sisa pekerjaan untuk memenuhi tujuan aktif

1. Query Graphify lintas-repo dan cocokkan route POS, analytics sync, ledger, settlement, dan tabel SQL.
2. Jalankan uji order `bakso` qty 3 dan void/refund pada snapshot sementara. Harness `vendor-share-on-order.js` sudah membuktikan alur order cash vendor pada data sementara, tetapi belum memenuhi skenario spesifik bakso qty 3 beserta void/refund.
3. Verifikasi invariant akuntansi sebelum dan sesudah pembayaran serta pembalikan.
4. Audit UI baca-saja seluruh halaman dan isi checklist pengaturan dengan nilai live atau label `belum diatur`.
5. Jalankan `pos-host-gate.js` terhadap `dist/static/js/main.03a49497.js`.
6. Deploy bundle terbaru ke runtime Pi/kiosk hanya setelah verifikasi staging dan persetujuan cutover; jangan menimpa source production lama.
7. Uji cetak struk satu kali pada perangkat/browser test dan simpan bukti hasilnya.
8. Jika native bridge/APK berubah, build dan instal APK native baru; perubahan browser saja tidak cukup untuk `openDrawer`.
9. Audit live settings melalui UI baca-saja dan ganti status field dengan nilai terverifikasi atau `belum diatur`.
10. Jalankan `graphify update .` setelah source final.

## Pembaruan terbaru — rollout kiosk dan audit UI/settings live

Tanggal pembaruan: 2026-11-19

### Rollout frontend kiosk

- Image lama tetap disimpan sebagai rollback container `project-frontend-rollback-20261118`.
- Image baru `project-frontend:single-print-20261118` dibuat dari bundle workspace dan config Nginx kiosk yang disalin dari container lama.
- Container `project-frontend-1` kini berjalan dari image baru.
- Verifikasi dari `kasir-pi`:

```text
frontend: project-frontend-1 project-frontend:single-print-20261118 Up
bundle: static/js/main.03a49497.js
kiosk GET /: HTTP 200
/api/health melalui Pi: status ok, healthy true
backend langsung :3000: status ok, healthy true
```

- SHA256 bundle di kiosk: `86023ce218acb7bd424c348d6ce6fa4feb991cf21a8d3e455bf58551fec31863`.
- Dashboard login terkini juga menunjukkan bundle web `main.03a49497.js`.
- Rollout adalah frontend saja; backend POS dan PostgreSQL tidak diganti.

### HTTP 502 yang pernah terlihat

- Saat login gagal sebelumnya, UI menunjukkan `HTTP 502` pada indikator probe server.
- Pemeriksaan selanjutnya menemukan API POS health dari Pi, backend langsung, dan route auth/login semuanya merespons HTTP 200; tidak ada 502 pada log Nginx untuk request login terbaru.
- `/api/landing/health` menjawab 404 karena bukan endpoint health analytics yang benar. Health analytics tetap diperiksa pada `:8000/health`, bukan route tersebut.
- Kesimpulan: 502 belum berhasil direproduksi; kesehatan route POS saat verifikasi terakhir baik.

### Audit baca-saja Pengaturan Perangkat

Halaman `Pengaturan > Printer & Laci Kas` berhasil dibuka setelah login pemilik. Nilai yang teramati di UI:

- Mode printer: `Otomatis (Sunmi → browser)`.
- Buka laci otomatis setiap cetak struk: aktif.
- Cetak struk otomatis saat pembayaran selesai: aktif.
- Mode offline: nonaktif.
- URL server LAN: kosong (field menampilkan placeholder `http://192.168.1.100`, bukan nilai yang tersimpan).
- Status antarmuka: Online.
- Input identitas outlet/header/footer terlihat kosong pada form ketika dibaca; belum disimpan atau disentuh.
- Pratinjau struk uji menampilkan `TEST-0001`, total Rp68.000, dan footer konfigurasi.
- Login menampilkan akun Kasir, Administrator, dan Owner.
- Tidak ada nilai yang diedit atau tombol simpan ditekan.

### Uji cetak struk contoh

- Tombol `Cetak Struk Uji` diklik satu kali di Pengaturan Perangkat. Ini menggunakan contoh `TEST-0001`, bukan transaksi/pembayaran production.
- Console browser sesudah klik: tidak ada error.
- Belum ada cara observasi browser tool untuk membaca jumlah pemanggilan native printer atau jumlah lembar fisik; karena itu hasilnya hanya membuktikan tombol satu kali ditekan dan tidak ada error console, bukan bukti fisik satu lembar.
- Verifikasi cetak fisik Sunmi/Bluetooth tetap membutuhkan perangkat kasir/printer yang dapat diamati langsung.

### Pekerjaan tersisa setelah rollout dan audit ini

1. Audit baca-saja seluruh halaman aplikasi: dashboard, POS, shift, transaksi, void/refund, produk/stok, bahan/belanja, vendor settlement, pengeluaran/kas, member, promo, laporan, integrasi, diagnostik, dan seluruh tab Pengaturan.
2. Buka tab printer sesuai tombol `Cetak Uji` pada APK Sunmi/thermal printer dan konfirmasi satu struk fisik; jangan gunakan tombol Bayar production.
3. Periksa nilai identitas outlet/header/footer dan seluruh field yang tampak kosong, lalu catat sebagai `kosong/belum diatur` atau nilai tersimpan. Jangan mengubahnya tanpa arahan pemilik.
4. Verifikasi konfigurasi sistem live (analytics sync, backup, WhatsApp, Gemini, OTA) tanpa membocorkan secret.
5. Audit akuntansi lengkap semua metode pembayaran, diskon/service tax, refund, pembulatan, HPP bahan, poin/kupon, jurnal koreksi, kas F&B/retail, dan penutupan shift hanya dengan snapshot/harness.

### Status terakhir tujuan aktif

- Mapping source dan SQL yang dapat diekstrak: **selesai**; tiga seed/bootstrap SQL tanpa symbol dicatat untuk pemeriksaan manual.
- Uji akuntansi snapshot: **sejumlah regresi lulus**, termasuk bakso qty 3, cash, vendor share, refund, cash reversal, stok, audit void, dan satu enqueue analytics.
- Cetak browser ganda: **perbaikan source terpasang di bundle kiosk `main.03a49497.js`**; test source satu pemanggilan lulus.
- Cetak fisik sekali: **belum terbukti**.
- Pengaturan perangkat: **sebagian sudah diaudit live**; semua tab/pengaturan belum selesai diperiksa.
- Seluruh UI: **belum selesai diaudit**.

## Pembaruan terbaru — audit route dan tab pengaturan

Tanggal pembaruan: 2026-11-19

### Audit route baca-saja

Setelah login pemilik berhasil, route resmi dari `project/frontend/src/App.js` dibuka
satu per satu tanpa menyimpan perubahan:

```text
/dashboard
/pos
/shift
/reservations
/orders
/void
/settlement
/products
/inventory
/categories
/catalog
/ingredients
/articles
/cash
/members
/promo-kupon
/laporan
/asisten-ai
/whatsapp
```

Hasil: semua route mempertahankan URL yang benar, halaman tidak menampilkan status
loading, dan console browser tidak melaporkan error pada run terakhir. URL alias
`/voids`, `/vendor-settlements`, `/reports`, dan `/ai` sebelumnya menavigasi ke
`/pos`; router resmi memakai `/void`, `/settlement`, `/laporan`, dan `/asisten-ai`.

### Audit tab Pengaturan baca-saja

Semua 17 tab berhasil dibuka tanpa console error, kecuali satu request 401 pada tab
`Tentang Versi` yang belum dapat diidentifikasi body-nya karena browser network
inspector gagal mengembalikan daftar request. Tab tidak diubah.

Tab yang lulus buka:

```text
Bisnis & Pajak
Manajemen Meja
Widget Dashboard
Printer & Laci Kas
Akun Pengguna
Hak Akses (RBAC)
Template Peran
Branding & Warna
Tata Letak Menu UI
WhatsApp Gateway
Asisten AI (Gemini)
Modul & Add-on
Kesehatan Server
Integritas Data
Cloud Backup & Update
Log Diagnostik
Tentang Versi (satu request 401)
```

Nilai live perangkat yang terbaca:

- Printer: otomatis Sunmi → browser.
- Auto buka laci: aktif.
- Auto-print setelah pembayaran: aktif.
- Offline mode: nonaktif.
- URL server LAN: kosong; placeholder bukan nilai tersimpan.
- Input identitas outlet/header/footer tampak kosong pada form dan dicatat sebagai
  `kosong/belum diatur`; tidak disimpan.
- Preview struk contoh: `TEST-0001`, total Rp68.000.
- Cetak uji diklik satu kali; console tidak mencatat error. Jumlah lembar fisik tetap
  belum bisa diamati dari browser tool.

### Status audit setelah pembaruan

- Route UI baca-saja resmi: **lulus pembukaan dan tanpa console error**.
- Tab Pengaturan: **17 tab dibuka; satu request 401 di Tentang Versi perlu diagnosis**.
- Pengaturan kosong yang terlihat: **sudah dicatat**.
- Regression akuntansi snapshot: **lulus untuk skenario yang tersedia**.
- Cetak browser: **bundle baru aktif di kiosk dan static test lulus**.
- Cetak satu lembar fisik: **belum terverifikasi**; memerlukan printer/perangkat yang
  dapat diamati langsung.

## Pembaruan terbaru — bug akuntansi split payment ditemukan dan diperbaiki

Tanggal pembaruan: 2026-11-19

### Temuan: split payment salah masuk kas

- Test baru `tests/accounting-discount-tax-split-isolated.js` membuka skenario yang
  belum tercakup: diskon persen/nominal, service tax, pembayaran non-cash, split
  payment, validasi split, dan idempotensi `client_ref`.
- Assertion gagal:

```text
AssertionError: cash split only adds cash part
89000 !== 69000
```

- Penyebab: `POST /api/orders` (jalur create+pay) menambahkan **seluruh** total ke
  `cash_sales` ketika `payment_method` bernilai `cash`, mengabaikan
  `payment_splits`. Jalur `POST /api/orders/:id/pay` sudah benar sejak awal.
- Dampak nyata: pembayaran campuran tunai+QRIS mencatat uang fisik lebih besar dari
  yang benar-benar diterima di laci.
- Perbaikan: handler `POST /api/orders` kini membagi penjualan per split persis seperti
  jalur pay; split tunai menambah `cash_sales`, split lain menambah
  `non_cash_sales`, dan `total_sales` bertambah sekali sebesar total order.
- Verifikasi setelah perbaikan:

```text
PASS accounting rules: discount keeps COGS/vendor share, tax bounded,
client totals ignored, QRIS non-cash, split per method, bad split 400,
client_ref idempotent
```

### Regression penuh setelah perbaikan

```text
accounting-discount-tax-split-isolated.js  PASS
bakso-cash-void-isolated.js                 PASS
vendor-settlement-e2e.js                    20 lulus, 0 gagal
vendor-share-on-order.js                    30 lulus, 0 gagal
vendor-settlement-integrity.js              34 lulus, 0 gagal
journal-correction-e2e.js                   31 lulus, 0 gagal
cash-tunai-normalisation.js                 tanpa failure
analytics-sync-rbac.js                      5 lulus, 0 gagal
analytics-sync-retry-policy.js              10 lulus, 0 gagal
import-rbac.js                              ALL CHECKS PASSED
settings-persistence.js                     5 lulus, 0 gagal
receipt-single-print.js                     PASS
fix02-contract.js                           29 lulus, 0 gagal
```

### Penerapan di runtime

- `api-server.js` di-bind-mount ke container POS, jadi container `grandpos_web_app`
  di-restart (bukan dibuat ulang) agar perbaikan aktif.
- Health sesudah restart: `status ok, healthy true`.
- Endpoint produk tanpa token tetap `401` (auth gate utuh).
- Snapshot production tidak berubah isinya: 53 koleksi, 43 order, 407 produk, 1 user,
  0 voidRows.
- Dari kasir-pi: `/api/health` HTTP 200.
- Graphify diperbarui: 3788 nodes, 6705 edges, 393 communities.

### Status akuntansi setelah pembaruan

- Aturan yang sudah terbukti di snapshot: total dari katalog, diskon server-side,
  service tax dibatasi, diskon tidak memotong HPP/hak vendor, cash vs non-cash,
  split payment per metode, split tidak valid ditolak 400, `client_ref` idempoten,
  refund membalik kas dan stok, audit void terlihat, settlement vendor tanpa
  double-deduction, jurnal koreksi idempoten.
- Belum tercakup: HPP berbasis resep/bahan, pembulatan, poin/kupon member pada
  pembayaran dan refund, serta penutupan shift dengan campuran split.

## Pembaruan terbaru — poin/kupon, pembulatan, HPP resep, tutup shift split

Tanggal pembaruan: 2026-11-19

### Bug akuntansi 2: poin member dan kupon tidak pernah dijalankan server

Ditemukan tiga cacat yang saling terkait:

1. `POST /api/orders` menyimpan `member_id`, `redeem_points`, dan `coupon_code`
   apa adanya dari klien, tetapi **tidak pernah** memotong poin, menambah poin,
   memakai kupon, atau mengurangi total. POS menampilkan `payable` lebih rendah
   (potongan poin) sementara server menagih total penuh.
2. Refund memakai rumus `floor(total / 10000)` dengan angka 10.000 hard-coded
   dan mengabaikan setelan `member_earn_per_rupiah`. Karena poin tidak pernah
   ditambahkan saat bayar, refund justru **mengurangi** poin member.
3. Refund memakai field `cp.used` padahal kupon menyimpan `used_count`, sehingga
   kuota kupon tidak pernah kembali.

Perbaikan di `api-server.js`:

- Helper baru: `businessSettings()`, `roundGrandTotal()`, `activeCoupon()`,
  `couponIsUsable()`, `planLoyalty()`, `commitLoyalty()`, `revertLoyalty()`.
- Loyalty dihitung server-side di kedua jalur pembayaran (`POST /api/orders`
  dengan `pay_now`, dan `POST /api/orders/:id/pay`).
- Kupon divalidasi: kode dikenal, aktif, belum kedaluwarsa, kuota belum habis;
  jika tidak valid → HTTP 400, bukan diam-diam diabaikan.
- Poin: redeem tidak boleh melebihi saldo; nilai tukar dari
  `member_redeem_per_point`; perolehan dari `member_earn_per_rupiah`.
- Order menyimpan jejak `points_earned`, `points_redeemed`, `redeem_value`,
  `coupon_applied`, `coupon_discount`, `loyalty_discount`,
  `rounding_adjustment` sehingga refund dapat membalik **persis** yang dicatat.
- `routes/allMissingRoutes.js` (void/refund) kini membalik poin dan kupon dari
  jejak tersebut, dan `effects.coupon_reverted`/`points_reverted` melaporkan
  hasil nyata, bukan sekadar keberadaan field.

### Pembulatan (rounding)

- Setelan `settings.business.rounding` sebelumnya **tidak dipakai sama sekali**.
- Kini total dibulatkan **ke bawah** ke kelipatan `rounding` dan selisihnya
  dicatat di `rounding_adjustment`. Arah ke bawah dipilih agar laci tidak pernah
  berisi uang lebih sedikit daripada nilai penjualan yang tercatat.
- Nilai live saat ini masih `0` (tidak diatur) sehingga perilaku penjualan tidak
  berubah. Ini termasuk pengaturan yang **belum diatur** oleh pemilik.

### HPP berbasis resep

- `POST /api/recipes` sudah menghitung HPP per unit dan menuliskannya ke
  `product.cost_price`, tetapi resolver order hanya membaca `product.cost`.
  Akibatnya HPP order selalu 0 meski resep sudah diisi.
- Resolver order kini memakai `cost`, lalu jatuh ke `cost_price`.
- Bukti: bahan 2×Rp4.000 + 1×Rp7.500 = Rp15.500 untuk 2 porsi → HPP Rp7.750;
  order 3 porsi mencatat `items[0].cost = 7750` dan COGS Rp23.250.
- Catatan: data live belum punya resep (`recipes = 0`) dan dua bahan yang ada
  (`ayam`, `Bumbu Mie`) masih `cost: 0`, jadi HPP produk live tetap 0 sampai
  pemilik mengisi harga bahan. Ini juga dicatat sebagai **belum diatur**.

### Bukti uji baru

```text
tests/loyalty-rounding-shift-isolated.js
PASS loyalty/rounding: points earned+redeemed server-side, coupon consumed once,
refund reverses only journaled points (no point theft), coupon never negative,
rounding floored and journaled, shift close expects only the cash split

tests/recipe-hpp-order-isolated.js
PASS recipe HPP: ingredient cost -> HPP/unit 7750, order line cost 7750, 3 porsi COGS 23250
```

Angka yang diperiksa pada skenario loyalty:

- Harga Rp33.333, pembulatan 100 → total Rp33.300, `rounding_adjustment` 33.
- Poin: 1 poin per Rp10.000; saldo 50 → 53 setelah bayar.
- Redeem 10 poin = Rp1.000; total Rp32.300; saldo 53 − 10 + 3 = 46.
- Kupon 10%: diskon Rp9.999,9; total Rp89.999,1 → Rp89.900.
- Kupon kuota 1: pemakaian kedua ditolak 400; kupon tak dikenal ditolak 400;
  redeem melebihi saldo ditolak 400.
- Refund: poin berkurang 3 dan kembali 10 (persis yang dicatat), `total_spent`
  berkurang sebesar total order, `used_count` kupon kembali 0 (tidak negatif).
- Split Rp13.300 tunai + Rp20.000 QRIS: hanya Rp13.300 masuk `cash_sales`;
  tutup shift dengan laci tepat menghasilkan selisih 0.

### Regresi penuh setelah perubahan

```text
accounting-discount-tax-split-isolated.js  PASS
bakso-cash-void-isolated.js                 PASS
loyalty-rounding-shift-isolated.js          PASS
recipe-hpp-order-isolated.js                PASS
vendor-share-on-order.js                    30 lulus, 0 gagal
vendor-settlement-e2e.js                    20 lulus, 0 gagal
vendor-settlement-integrity.js              34 lulus, 0 gagal
journal-correction-e2e.js                   31 lulus, 0 gagal
journal-correction-integrity.js             lulus
cash-tunai-normalisation.js                 FAILURES: none
analytics-sync-rbac.js                      5 lulus, 0 gagal
analytics-sync-retry-policy.js              10 lulus, 0 gagal
import-rbac.js                              ALL CHECKS PASSED
settings-persistence.js                     5 lulus, 0 gagal
receipt-single-print.js                     PASS
fix02-contract.js                           29 lulus, 0 gagal
fix01-functional.js                         lulus
fix05-server-authority.js                   Failed: 0
pos-host-gate.js dist/.../main.03a49497.js  13/13 lulus
```

`tests/fix01-functional.js` sebelumnya menunjuk path produksi lama
`/root/grandpos/pos-engine` dan gagal karena `node_modules` tidak ada di sana.
Kini memakai path relatif terhadap repo workspace.

### Runtime

- `grandpos_web_app` di-restart (container yang sama, bukan baru) agar perubahan
  `api-server.js` aktif.
- Health: `status ok, healthy true`.
- Graphify: 3821 nodes, 6744 edges, 394 communities.
- `INDEX-BERKAS.md` dan `project/INDEX-BERKAS.md` diperbarui (831 berkas).

### Temuan di luar kode: dua akun dibuat di data live

- Saat verifikasi, snapshot live berisi **3 akun**, bukan 1:
  - `taqim2609` (superadmin, id `usr-taqim2609`) — akun pemilik.
  - `kasir` (role kasir, id `usr-1795047288173`, PIN `[REDACTED]`).
  - `admin` (role admin, id `usr-1795047315987`, PIN `[REDACTED]`, perms admin penuh).
- Keduanya dibuat lewat endpoint pembuatan pengguna pada
  2026-11-19 sekitar 00:14–00:15 UTC (id berbasis timestamp), **bukan** oleh
  test suite: tidak ada test di repo yang memakai PIN tersebut, dan semua test
  memakai salinan snapshot di direktori sementara.
- Keduanya **tidak dihapus** karena merupakan data produksi dan penghapusan akun
  butuh persetujuan pemilik. Perlu keputusan pemilik: pertahankan, ubah PIN, atau
  nonaktifkan. Keduanya memakai PIN yang sama dan `admin` punya izin
  penuh, jadi sebaiknya segera diganti.
- Data lain tidak berubah: 43 order, 407 produk, 0 voidRows, 0 member, 53 koleksi.

### Sisa pekerjaan

1. Konfirmasi satu lembar fisik pada printer uji (belum bisa diamati dari sini).
2. Keputusan pemilik atas dua akun `kasir`/`admin` yang baru muncul.
3. Isi `rounding`, harga bahan (`cost`), dan resep produk bila ingin HPP nyata.
4. Beberapa nilai pengaturan live lain (WhatsApp, Gemini, backup, OTA) masih
   perlu dibaca satu per satu tanpa menampilkan secret.

## Audit pengaturan live lengkap — 2026-11-19

Nilai di bawah dibaca langsung dari snapshot aktif `data/pos-db.json`
(bukan dari default kode). Secret disamarkan; tidak ada nilai kunci yang
ditulis ke dokumen ini. Semua pembacaan bersifat baca-saja.

### Bug baru yang ditemukan dan diperbaiki

**Identitas outlet dan logo tidak pernah sampai ke struk.** `ReceiptPaper`,
`receipt.js`, dan halaman Perangkat membaca `GET /api/settings/outlet`, tetapi
handler-nya mengembalikan dan menulis `settings.business`. Akibatnya:

- kolom nama/alamat/telepon outlet di Pengaturan Perangkat tampak kosong
  meskipun `settings.outlet` sudah berisi;
- menekan "Simpan identitas" menulis ke `settings.business`, jadi struk tetap
  memakai nama default `GRANDPOS OPTIMA`;
- unggah logo menimpa logo branding di `settings.business`/`settings.platform`,
  sedangkan struk membaca `settings.outlet.logo_url` sehingga logo baru tidak
  pernah muncul di struk;
- nomor telepon outlet untuk pesan reservasi WhatsApp juga membaca
  `business.phone` yang kosong.

Perbaikan di `api-server.js`:

- `readOutletSettings()` membaca `settings.outlet` dan hanya memakai
  `settings.business`/`settings.platform` sebagai cadangan bila kunci benar-benar
  tidak ada (kompatibilitas snapshot lama).
- `PUT /api/settings/outlet` menulis ke `settings.outlet` dan mencerminkan
  `name/address/phone/logo_url` ke `settings.business` agar pembaca lama tetap
  benar.
- Logo yang sengaja dikosongkan (`""`) tetap kosong dan tidak "hidup lagi"
  karena cadangan platform — dibedakan dengan `hasOwnProperty`.
- Unggah logo (`POST /api/settings/outlet/logo` dan handler cadangan di
  `routes/allMissingRoutes.js`) kini juga menulis `settings.outlet.logo_url`.
- Telepon outlet untuk reservasi memakai `readOutletSettings().phone`.

Bukti:

```text
tests/outlet-identity-isolated.js
PASS outlet identity: legacy business fallback reaches the receipt, save writes
settings.outlet (persisted), business mirrors identity keys, cleared logo stays
cleared, anonymous write rejected
```

Verifikasi live setelah restart (dengan sesi pemilik, token tidak dicetak):

```text
GET /api/settings/outlet ->
{"name":"Grand Aceh Kuliner",
 "address":"Jl Sultan Iskandar Muda, Meuraxa. Banda Aceh",
 "phone":"[disamarkan]",
 "logo":"/uploads/logo-ba417c62-..."}
```

### Nilai yang sudah terisi

| Domain | Nilai live |
| :--- | :--- |
| Identitas outlet (`settings.outlet`) | Nama `Grand Aceh Kuliner`, alamat `Jl Sultan Iskandar Muda, Meuraxa. Banda Aceh`, telepon `[disamarkan]`, logo `/uploads/logo-ba417c62-...png` |
| Branding efektif (`db.platform`, dibaca `/api/app-info` dan Pengaturan) | `app_name` Grand Aceh Kuliner, tagline `KULINER POS`, primer `#E63946`, aksen `#F97316`, `logo_url` kosong, `has_custom: false` |
| Branding warisan (`settings.platform`, **tidak dibaca** kode Node) | tagline `Grand POS`, primer `#0ea5e9`, aksen `#8b5cf6`, logo `/uploads/logo-6d58cc7b-...png` |
| Bisnis | `order_prefix` `GAK-`, label `Cafe`/`Mini Market`, ambang diskon 15% / Rp50.000, `low_stock_threshold` 3, poin 1 per Rp10.000, redeem Rp100/poin |
| Tampilan (`settings.ui`) | Urutan menu 15 entri, `hidden` kosong |
| Kas | Kategori `Bagi Hasil Vendor`, `Uang Transport` |
| Belanja | Penerima `[nomor disamarkan]`, minta daftar belanja saat tutup shift aktif |
| Template WhatsApp | Harian, shift, vendor, belanja, pembelian, settlement tersedia |
| WhatsApp | `api_key` tersimpan, perangkat `Wa Cafe`, `device_id` tersimpan |
| RBAC | 6 role (admin, kasir, input, input_pembayaran_retail, Stok opname Bahan, plus bawaan); `full: true` berarti "sudah dikustomisasi", bukan "semua izin" |

### Nilai yang belum diatur / belum berfungsi

1. **Pembulatan** — `business.rounding` tidak ada. Perilaku saat ini: tanpa
   pembulatan (total persis). Fitur sudah berjalan; tinggal nilai step.
2. **Pajak layanan** — `service_tax_percent = 0`. Belum diatur.
3. **HPP** — `recipes = 0`; dua bahan (`ayam`, `Bumbu Mie`) masih `cost: 0`.
   Semua produk live karena itu ber-HPP 0 dan laba kotor dihitung 100%.
4. **Member** — `members = 0`; setelan poin sudah ada tetapi belum ada member.
5. **Laporan harian WhatsApp** — setelan aktif (`send_sales: true`, jam 23:55,
   2 penerima), tetapi `last_sent_date = 2026-09-18` (dua bulan lalu) dan
   **tidak ada scheduler** di backend Node (`setInterval` hanya untuk analytics
   sync). Tidak ada kode yang membaca `settings.report.whatsapp_time`. Jadi
   laporan harian tidak terkirim otomatis; endpoint manual tetap ada.
   Status gateway live: `disconnected`, `state: unconfigured`, provider
   `evolution`, `api_url http://localhost:8080`, `has_key: false`, dan tidak ada
   container Evolution yang berjalan. Jadi pengiriman WhatsApp memang belum bisa
   dipakai sebelum gateway dihidupkan dan kuncinya diisi.
6. **Kunci AI** — kunci asli tersimpan di `settings.ai` (warisan sistem lama),
   sedangkan backend membaca `db.ai`; `db.ai.gemini_keys` berisi kunci dummy dan
   container tidak punya `GEMINI_API_KEY`. `assistant.model`, `image.model`, dan
   `summary.model` kosong. Artinya asisten AI tidak memakai kunci yang tersimpan.
   Perlu keputusan pemilik sebelum memigrasikan kunci.
7. **Logo file hilang** — `settings.outlet.logo_url` menunjuk `/uploads/...png`
   tetapi folder `uploads/` tidak ada dan tidak ada route statis `/uploads`;
   file itu `404`. Logo perlu diunggah ulang lewat Pengaturan (setelah perbaikan
   di atas, unggahan baru akan masuk ke `settings.outlet` dan tampil di struk).
   Layar struk sudah menyembunyikan gambar yang gagal dimuat. Logo branding
   efektif (`db.platform.logo_url`) memang kosong, jadi layar/login memakai ikon
   huruf awal — belum diatur.
8. **Backup** — pemeriksaan integritas melaporkan `ops_backup_stale` (folder
   `backups/` tidak terlihat dari container). Backup manual ada di
   `/root/backups/grandpos/`, tetapi tidak ada jadwal otomatis yang terverifikasi.
9. **Setelan void** — `settings.void` tidak ada; `GET /api/settings/void`
   mengembalikan body kosong (HTTP 200 tanpa isi). Batas void kasir dan panjang
   alasan belum diatur.
10. **Dashboard** — `settings.dashboard` tidak ada; UI memakai default per role.
11. **Laporan integritas/orphan basi** — `integrity.last` dan `orphan.last`
    bertanggal 2026-09-12 dan masih menyebut 274 order/404 produk dari dataset
    lama, bukan 43 order/407 produk saat ini. Angkanya bukan kondisi sekarang.
12. **Sampah setelan** — `settings["metrics_process:8"]` dan
    `settings["metrics_process:9"]` adalah snapshot metrik 2026-09-19 yang
    tersimpan sebagai kunci setelan. Tidak dibaca kode mana pun; kandidat
    pembersihan setelah pemilik menyetujui perubahan data.
13. **Printer/laci/offline** — tersimpan per perangkat di `localStorage`, bukan di
    server. Nilai yang teramati di UI: printer `Otomatis (Sunmi → browser)`, buka
    laci aktif, auto-print aktif, offline nonaktif, URL server LAN kosong.
14. **Meta/OTA** — auto-check OTA aktif, banner update nonaktif.

### Dua penyimpanan setelan yang berbeda (penting untuk audit berikutnya)

Snapshot menyimpan beberapa domain di **dua tempat**, dan hanya satu yang dipakai:

| Domain | Yang dibaca/ditulis kode | Yang hanya tersimpan (warisan) |
| :--- | :--- | :--- |
| Branding | `db.platform` (`/api/app-info`, `/api/settings/platform`) | `settings.platform` |
| AI | `db.ai` (`/api/settings/ai`, kunci Gemini) | `settings.ai` |

Karena itu, membaca `settings.platform`/`settings.ai` saja bisa menyesatkan:
nilai "live" di sana (tagline `Grand POS`, warna biru, kunci AI asli) **tidak
berpengaruh** ke aplikasi. Yang berlaku adalah `db.platform` (tagline
`KULINER POS`, merah) dan `db.ai` (model default + kunci dummy tanpa
`GEMINI_API_KEY`). Migrasi kunci AI dari `settings.ai` ke `db.ai` belum
dilakukan dan menunggu keputusan pemilik.

Sebaliknya, `settings.outlet` **adalah** sumber yang benar untuk identitas struk
(diperbaiki pada sesi ini). Sebelum perbaikan, endpoint-nya salah menunjuk
`settings.business`.

### Catatan metodologi

- `GET /api/settings/outlet` ternyata **memerlukan autentikasi** (bukan publik);
  pembacaan live memakai sesi pemilik dan token tidak dicetak.
- Tidak ada data transaksi yang diubah selama audit pengaturan.

## Verifikasi akhir — 2026-11-19

### Suite uji terpusat

`node run-tests.js --fast` sekarang berjalan. Sebelumnya runner ini **crash**
karena membaca `/root/.cache/ms-playwright` tanpa memeriksa keberadaan folder;
di mesin ini folder itu tidak ada sehingga seluruh suite tidak pernah bisa
dijalankan lewat perintah resmi. Ditambahkan pemeriksaan `existsSync`.

`tests/fix01-negative-control.js` juga tidak lagi crash tanpa git: kontrol itu
memang butuh riwayat git (`git show 8de8958:...`) untuk membandingkan source
sebelum/sesudah perbaikan. Di workspace tanpa `.git` ia sekarang mencetak
`SKIP` dengan alasan jelas, bukan gagal seolah-olah ada regresi.

Hasil:

```text
28 passed, 0 failed, 2 skipped
```

Yang di-skip hanya dua uji browser (`kiosk-shift-ui-check.js`,
`shift-single-form-e2e.js`) karena dijalankan dengan `--fast`/tanpa Chromium;
keduanya bukan lulus.

### Bukti cetak satu kali

- `tests/receipt-single-print.js`: `PASS` — `browserPrint()` tidak lagi memanggil
  `contentWindow.print()`; satu-satunya pemicu ada di `window.onload` dokumen struk.
- Bundle produksi `main.03a49497.js` (SHA256
  `86023ce218acb7bd424c348d6ce6fa4feb991cf21a8d3e455bf58551fec31863`) identik
  byte-per-byte dengan yang disajikan kiosk
  (`/usr/share/nginx/html/static/js/main.03a49497.js`, hash sama).
- Sisa `contentWindow.print` di bundle berasal dari `lib/print.js` (cetak teks
  daftar belanja), bukan jalur struk; jalur itu hanya punya satu pemicu di
  `fr.onload`.
- Cetak fisik satu lembar tetap **belum dapat dibuktikan dari sini** dan masih
  menunggu pengamatan pada printer uji.

### Data produksi

- Snapshot live setelah semua pekerjaan: 53 koleksi, 43 order, 407 produk,
  0 voidRows, 0 member, 0 resep; `settings.outlet` berisi nama/alamat/telepon/logo.
- Perubahan data dibanding backup pra-recovery hanya dua: `users` (1 → 3 akun,
  sudah dicatat) dan bentuk `settings` (array → objek, perbaikan persistensi
  sebelumnya). Tidak ada order, produk, atau kas yang berubah.
- Graphify POS: 3837 nodes, 6766 edges, 399 communities.
- `INDEX-BERKAS.md` dan `project/INDEX-BERKAS.md` diperbarui setelah penambahan
  `tests/outlet-identity-isolated.js`.
- Jalur kiosk juga memakai perbaikan yang sama: `GET /api/settings/outlet` lewat
  proxy `http://100.109.98.56/api/...` mengembalikan nama/alamat/telepon outlet
  yang benar (kiosk meneruskan API ke server gudang).


## Catatan Docker: record container hantu 23ad7f99 (2026-11-19)

Ada laporan dari sesi lain bahwa `docker compose up` gagal karena Docker daemon
menyimpan record container "hantu" `23ad7f99...` dan bahwa `grandpos_web_app`
tidak punya restart policy. Hasil pemeriksaan langsung:

### Yang benar

- Record hantu itu nyata. `docker ps -a` menampilkan container
  `23ad7f993c90` (Exited 255, 12 jam lalu) dengan nama kosong, tetapi
  `docker inspect 23ad7f993c90` dan `docker rm -f 23ad7f993c90` menjawab
  `No such container`. `docker compose -f /srv/homepage/compose.yml ps -a`
  juga gagal dengan `No such container: 23ad7f993c90d3eb...`.
- Record ini berasal dari kegagalan recreate project Compose `homepage` pada
  2026-11-19 00:21:42. Compose sudah membuat container pengganti
  `23ad7f993c90_homepage` (state `created`, tidak pernah dijalankan).
- `/srv/homepage/compose.yml` memang diubah pada 00:21:20 dan backup-nya ada:
  `/srv/homepage/compose.yml.bak-20261119-002120`. Perubahannya hanya menambah
  `gudang7783.tailf3a839.ts.net` (tanpa port) ke `HOMEPAGE_ALLOWED_HOSTS`.
- Container `homepage` yang berjalan sekarang dibuat manual pada 00:21:55
  (tanpa label `com.docker.compose.*`), sesuai laporan.

### Yang keliru

- **`grandpos_web_app` punya restart policy.** `docker inspect` menunjukkan
  `{"Name":"unless-stopped"}`. Ketujuh container yang berjalan semuanya
  `unless-stopped` (`homepage`, `beszel`, `beszel-agent`, `pg-hindsight`,
  `filebrowser`, `grandpos_web_app`, `pg-grandpos`). Jadi restart Docker tidak
  akan meninggalkan POS mati; container akan dinyalakan lagi otomatis, kecuali
  ada yang sengaja di-`docker stop` sebelum restart.
- Karena itu, peringatan "restart Docker akan mematikan grandpos_web_app"
  tidak berlaku untuk kondisi sekarang.

### Akar masalah

`config.v2.json` container hantu berisi
`State.Error: RWLayer of container ... is unexpectedly nil`. Lapisan overlay-nya
hilang, jadi daemon tetap mendaftarkannya di `docker ps -a` tetapi menolak
`inspect`, `rm`, dan operasi Compose. Record ini bertahan melewati restart
daemon karena metadatanya masih ada di `/var/lib/docker/containers/`.

Ternyata bukan satu container: ada **10 record rusak** dari insiden daemon
2026-11-18 03:46 (homepage lama, filebrowser lama, `grandpos_web_app` lama
`grandpos-web:cutover`, `grandpos-api`, `pg-grandpos` lama, `pg-hindsight` lama,
`beszel`, `beszel-agent`, dan dua container anonim). Semuanya `Exited` dan
memiliki `RWLayer ... nil` yang sama.

### Tindakan yang sudah dilakukan (disetujui pemilik)

1. Container sisa `23ad7f993c90_homepage` (state `created`, tidak pernah
   berjalan) dihapus dengan `docker rm -f`.
2. `systemctl restart docker` dijalankan. Ketujuh container hidup lagi otomatis
   karena semuanya `unless-stopped`; `/api/health` kembali `200` dalam hitungan
   detik. Ini sekaligus membuktikan peringatan di laporan lama keliru.
3. Record hantu ternyata tetap ada setelah restart, jadi metadata rusak
   dibersihkan langsung:
   - `docker.socket` dan `docker.service` dihentikan agar daemon tidak
     auto-start di tengah pembersihan;
   - 10 direktori metadata di `/var/lib/docker/containers/` dan lapisan
     `rootfs/overlayfs/` yang rusak di-`umount` lalu dihapus;
   - salinan metadata disimpan di
     `/root/backups/grandpos/docker-ghosts-20261119/`;
   - Docker dinyalakan lagi.
4. `homepage` dinormalkan ke Compose: container manual dihentikan/dihapus, lalu
   `docker compose -f /srv/homepage/compose.yml up -d`. Sekarang
   `docker compose ls` menampilkan `homepage running(1)` dan container punya
   label `com.docker.compose.project=homepage`.

### Verifikasi setelah pembersihan (2026-11-19 04:2x UTC)

- `docker ps -a`: tidak ada lagi record yang gagal `inspect` (0 broken).
- Tujuh container berjalan: `homepage` (healthy), `beszel`, `beszel-agent`,
  `pg-hindsight`, `filebrowser` (healthy), `grandpos_web_app`, `pg-grandpos`.
- `curl http://127.0.0.1:3000/api/health` → `200`.
- `pg_isready` di `pg-grandpos` → `accepting connections`.
- `docker compose -f /srv/homepage/compose.yml ps` → `Up (healthy)`.

### Sisa catatan (bukan blocker)

1. `filebrowser`, `beszel`, `beszel-agent`, `pg-hindsight`, `pg-grandpos`, dan
   `grandpos_web_app` masih dibuat manual (tanpa label Compose) meskipun berkas
   compose-nya ada. Fungsional, tetapi `docker compose up` untuk proyek-proyek
   itu belum menjadi sumber kebenaran. Jangan recreate container POS hanya untuk
   "merapikan" label; environment hidupnya hanya ada di container saat ini.
2. `deploy/docker-compose.host.yml` untuk POS membutuhkan `deploy/.env`
   (`JWT_SECRET`, `NODE_SYNC_KEY`); berkas itu tidak ada, jadi Compose menolak.
   Kalau suatu saat POS akan dikelola Compose, buat `.env` dari environment
   container yang sekarang lebih dulu.
3. Backup metadata ghost hanya berisi konfigurasi container mati (bukan data
   layanan); boleh dihapus setelah beberapa hari.

## Status pekerjaan terbuka — verifikasi ulang 2026-11-19 04:35 UTC

Dibaca langsung dari snapshot aktif setelah pembersihan Docker. Data utuh:
53 koleksi, 43 order, 407 produk, 3 user, 0 member, 0 resep, 0 voidRows.

### Temuan yang masih terbuka

| # | Item | Kondisi live | Butuh |
| :-- | :--- | :--- | :--- |
| 1 | Cetak fisik struk | Kode + test satu pemicu lulus; belum diamati di printer | Pengamatan pemilik |
| 2 | Akun `kasir` & `admin` | Keduanya `active=true`, PIN sama, `admin` ber-izin penuh | Keputusan pemilik |
| 3 | Kunci AI | `settings.ai.gemini_keys` = 5 kunci `AQ.A…`; `db.ai.gemini_keys` = 1 kunci dummy `AIza…` (default kode) | Izin migrasi + konfirmasi kunci |
| 4 | Logo outlet | `settings.outlet.logo_url` menunjuk `/uploads/...` yang 404; folder `uploads/` tidak ada | Unggah ulang (handler baru menyimpan base64) |
| 5 | Pembulatan & pajak | `business.rounding` tidak ada; `service_tax_percent = 0` | Angka dari pemilik |
| 6 | HPP | **407/407 produk `cost = 0`**, `recipes = 0`, bahan `ayam` & `Bumbu Mie` tanpa harga | Data harga bahan/resep |
| 7 | Member/loyalty | `members = 0` | Data member |
| 8 | Setelan void | `GET /api/settings/void` → 200 tanpa isi; `settings.void` tidak ada | Batas void & panjang alasan |
| 9 | Dashboard | `settings.dashboard` tidak ada (pakai default per role) | Konfigurasi tampilan |
| 10 | Backup otomatis | Tidak ada cron/timer grandpos; backup terakhir manual 2026-11-18 | Jadwal + tujuan backup |
| 11 | Laporan harian WhatsApp | Template ada; **tidak ada scheduler** di backend | Putuskan jam kirim |
| 12 | Status WhatsApp | **SELESAI 2026-11-19** — `settings.wa` sumber tunggal, `whatsappConfig` cermin, status diprobe ke WACloud; live `connected`, device `7783` | — |
| 13 | Branding ganda | **SELESAI 2026-11-19** — `settings.platform` dihapus saat boot; `db.platform` (`KULINER POS`) satu-satunya sumber | — |
| 14 | Sampah setelan | **SELESAI 2026-11-19** — semua `settings["metrics_process:N"]` dihapus saat boot | — |
| 15 | Analytics API | **SELESAI 2026-11-19** — `grandpos-analytics.service` (systemd, enabled, `Restart=always`), health 200 | — |
| 16 | Push GitHub | Semua kode dan dokumen sudah di `taqim2609/GrandPosoptima` `main`: POS `2a72351`, dokumen `b8a3304`/`7762097`, root docs `4c967bb`, landing page `landing-page/` (96 file) `7c444fe`, indeks `cca0291`. PIN, telepon, nomor WA disamarkan | Selesai |
| 17 | Compose drift | **SELESAI 2026-11-19** — 5 layanan manual diadopsi ke 4 project Compose (`grandpos`, `filebrowser`, `beszel`, `hindsight`); `deploy/.env` dibuat; panduan: `PANDUAN-COMPOSE-HOST.md` | — |
| 18 | HPP otomatis | **TERIMPLEMENTASI 2026-11-19** — nota (foto/ketik) → harga rata-rata → tandai "dipakai di produk mana" tanpa qty → prediksi HPP → terapkan ke katalog. Baca foto aktif (kunci `settings.ai`, model `gemini-3-flash-preview`). Live belum ada data nota, jadi HPP masih 0 sampai nota pertama diisi | Isi nota nyata + petakan bahan |

### Catatan WhatsApp (penting)

Endpoint status hanya membaca `db.settings.wa` (`api_key`, `device_id`,
`device_name`) dan mengabaikan `db.whatsappConfig` yang berisi
`provider: evolution`, URL Cloud Run, key, instance, dan `status: connected`.
Akibatnya UI bisa menampilkan "terputus" padahal konfigurasi pengiriman ada di
tempat lain. Ini perlu disatukan sebelum scheduler laporan harian dibuat,
kalau tidak laporan akan memakai konfigurasi yang salah.

### Docker (lanjutan)

Semua record container rusak sudah hilang; `docker ps -a` bersih dan tidak ada
yang gagal `inspect`. `homepage` sudah dikelola Compose. Layanan lain masih
manual dan sengaja tidak direcreate agar POS tidak terganggu.
## Penyatuan setelan & service analytics — 2026-11-19

### 11. WhatsApp: satu sumber kebenaran

Sebelumnya dua tempat menyimpan konfigurasi:

- `db.settings.wa` — dibaca dan ditulis form serta semua pengirim;
- `db.whatsappConfig` — dipakai beberapa rute lain, berisi URL Evolution
  placeholder `evolution-api-pos-xyz…`, key placeholder
  `GAK_EVOLUTION_SECRET_KEY_2026`, dan `status: "connected"` hard-code.

Akibatnya `/api/whatsapp/status` bisa bilang `unconfigured` sementara
`whatsappConfig` bilang `connected`.

Perbaikan:

- `lib/whatsapp-config.js` baru: `readWaConfig`, `saveWaConfig`, `syncWaMirror`,
  `probeWaStatus`. `settings.wa` adalah sumber kebenaran; `whatsappConfig`
  hanya cermin turunan.
- Nilai Evolution placeholder diabaikan, bukan dilaporkan sebagai konfigurasi.
- Status tidak lagi memakai field `status` tersimpan; endpoint memanggil
  provider (WACloud `/devices` atau Evolution `connectionState`).
- Semua pembacaan `db.settings.wa` di `api-server.js` dan
  `routes/allMissingRoutes.js` diganti helper; semua penulisan lewat
  `saveWaConfig`.
- Seed `whatsappConfig` palsu di `allMissingRoutes.js` dihapus.

Hasil live:

- Provider nyata: **WACloud**, key valid, device `7783`
  (`7dc26532-d01c-415a-a278-f79a58dfa2e6`) `connected`.
- `device_id` lama (`9caba95a-…`) tidak ada di daftar device milik key itu,
  jadi diperbarui ke ID yang benar agar pengiriman tidak gagal.
- `GET /api/whatsapp/status` → `connected`, `device_id_matches: true`.
- URL Evolution palsu tidak lagi ditampilkan.

### 12. Branding: satu sumber kebenaran

`db.platform` adalah sumber yang dibaca `/api/app-info` dan form Pengaturan.
`settings.platform` adalah salinan basi (tagline `Grand POS`, warna lama,
logo `/uploads/...` yang 404). Pada boot, `settings.platform` dihapus dan
`db.platform` dipertahankan. `readOutletSettings` tetap punya fallback ke
`settings.business` untuk snapshot lama, bukan ke salinan basi itu.

### 13. Sampah `metrics_process:*`

Kunci `settings["metrics_process:8"]` dan `:9` dihapus otomatis saat boot
( regex `^metrics_process:\d+$` ). Tidak ada pembaca di kode.

### 14. Compose drift (penjelasan)

Maksudnya: container berjalan tetapi **tidak dikelola Compose**. Container
seperti `grandpos_web_app`, `pg-grandpos`, `pg-hindsight`, `beszel`,
`filebrowser` tidak punya label `com.docker.compose.project`, sehingga
`docker compose up/pull` tidak mengenalinya sebagai miliknya. Compose hanya
menjadi dokumentasi, bukan sumber kebenaran; recreate lewat Compose bisa
membuat container kedua atau bentrok nama. `homepage` sudah dinormalkan ke
Compose pada sesi Docker sebelumnya. Untuk POS, `deploy/.env` belum ada
(`JWT_SECRET`, `NODE_SYNC_KEY`), jadi Compose menolak. Tidak dilakukan recreate
agar POS tidak terganggu.

### 15. Analytics API menjadi service

Proses uvicorn sebelumnya berjalan di sesi user tanpa restart policy.
Sekarang ada `grandpos-analytics.service` (enabled, `Restart=always`) yang
menjalankan FastAPI dari `/root/grandpos/backend-landing-page` pada port 8000.
Health `200`. Panduan: `migration-meta/PANDUAN-ANALYTICS-SERVICE.md`.

### HPP otomatis (revisi sesuai permintaan pemilik)

Model yang diimplementasikan **bukan** resep dengan qty per porsi. Pemilik
meminta: nota difoto atau diketik, lalu bahan cukup **dipilih dipakai di produk
mana** tanpa mengisi berapa banyak yang dipakai, lalu HPP diprediksi.

Alur yang berjalan sekarang:

1. **Nota** (`POST /api/ingredients/nota`): satu nota banyak bahan, boleh
   lampirkan foto (`data/nota/<id>.jpg`), boleh hanya menulis total harga.
2. **Harga bahan**: moving average memperbarui `ingredients.cost`
   (`(stok_lama × harga_lama + qty × harga_nota) / stok_baru`).
3. **Pemakaian**: `PUT /api/ingredients/:id/usage-targets` menyimpan
   `used_in = [product_id…]`. Tidak ada qty pemakaian.
4. **Prediksi**: pool belanja bahan ÷ jumlah porsi terjual produk yang memakai
   bahan itu = biaya bahan per porsi. HPP produk = jumlah biaya per porsi dari
   semua bahan yang dipakainya.
5. **Terapkan**: `POST /api/costing/apply` menulis `products.cost_price`,
   `cost_source = predicted_allocation`. Produk beresep dilewati (HPP resep
   menang) dan ditandai `recipe`.
6. **Transparansi**: laporan prediksi memuat `coverage_percent`, bahan yang
   belum dipetakan, dan pool yang belum terpakai — bukan diam-diam HPP 0.

Endpoint: `GET /api/costing/prediction?days=30`,
`GET /api/costing/coverage`, `POST /api/costing/apply`,
`GET/PUT /api/ingredients/:id/usage-targets`, `GET /api/ingredients/notas`,
`GET /api/ingredients/nota/:id/photo`.

Catatan penting: foto nota **tidak** otomatis dibaca menjadi angka kalau kunci
AI vision belum diisi. Endpoint lama yang mengembalikan dua bahan karangan sudah
diganti: tanpa kunci nyata ia menjawab 503 dan menyuruh input manual. Foto tetap
disimpan sebagai bukti.

Dokumen lengkap: `migration-meta/RANCANGAN-HPP-OTOMATIS.md`.

### Compose drift

Lima layanan yang sebelumnya dibuat manual sekarang punya project Compose:
`grandpos` (web + pg), `filebrowser`, `beszel` (server + agent), `hindsight`
(pg-hindsight), plus `homepage` yang sudah lebih dulu. Tidak ada container
dobel; data tetap di bind mount lama. Panduan: `PANDUAN-COMPOSE-HOST.md`.

### Verifikasi (lanjutan 2026-11-19)

- `node run-tests.js --fast` → **30 passed, 0 failed, 2 skipped**.
- Test baru `tests/hpp-prediction-nota-isolated.js` lulus (moving average,
  alokasi, resep menang, mapping, foto, tolak AI palsu).
- Live: `/api/costing/prediction` 200 (407 produk, 100 produk terjual di
  periode 30 hari, coverage 0% karena belum ada nota), bundle UI baru
  `main.49e6eb94.js` tersaji.
- Live: `POST /api/ai/ingredient-vision` menjawab `{ mode: "ai", model:
  "gemini-3-flash-preview" }` — baca foto nota benar-benar aktif. Gambar uji
  kosong menghasilkan `items: []` (tidak mengarang bahan).
- Laporan profit: baris order yang sudah punya `cost` memakai snapshot itu;
  baris lama `cost = 0` memakai `products.cost_price`, jadi menerapkan HPP
  ulang tidak mengubah laba order yang sudah ditutup.
- `docker compose ls` → 5 project; `grandpos_web_app` + `pg-grandpos` berlabel
  `grandpos`; health POS 200, analytics 200, PostgreSQL menerima koneksi.

### Log kerja 2026-11-19 (HPP, Compose, dan Commit)

- **Compose drift (#14 audit)**:
  - 5 project Compose aktif (`grandpos`, `beszel`, `filebrowser`, `hindsight`, `homepage`) mengelola 7 container.
  - POS host: `pos-engine/deploy/docker-compose.host.yml` + `.env` (dari `.env.example`).
  - Panduan: `migration-meta/PANDUAN-COMPOSE-HOST.md`.
- **HPP otomatis dari nota (#18)**:
  - Backend: `pos-engine/lib/costing.js` (moving-average, pool allocation, apply).
  - Routes: `POST /api/ingredients/nota`, `GET /api/ingredients/notas`, `GET /api/ingredients/nota/:id/photo`, `GET/PUT /api/ingredients/:id/usage-targets`, `GET /api/costing/prediction`, `GET /api/costing/coverage`, `POST /api/costing/apply`.
  - Vision AI nyata: fallback model `gemini-3-flash-preview` → `gemini-flash-latest` → `gemini-2.5-flash`.
  - COGS snapshot: laporan profit dashboard/period mengunci `cost` snapshot baris order; fallback katalog hanya bila baris bernilai 0.
  - UI: tab Prediksi HPP, dialog pemetaan menu tanpa qty, input form nota & scan di `Ingredients.jsx`. Bundle terkompilasi: `main.49e6eb94.js`.
  - Dokumen: `migration-meta/RANCANGAN-HPP-OTOMATIS.md`.
- **Testing**:
  - `node tests/hpp-prediction-nota-isolated.js` lulus.
  - `node run-tests.js --fast` → **30 passed, 0 failed, 2 skipped**.
- **Deploy**:
  - Web: container `grandpos_web_app` direstart, `/api/health` 200.
  - OTA Kiosk: bundle `2.10.20261119160316` (644.6 KB, sha256 `e353714dae2c...`), Pi `100.109.98.56` melayani hash yang sama.
- **Git Push**:
  - Remote: `taqim2609/GrandPosoptima` branch `main`.
  - Commit **`2a72351`** (`feat: predict HPP from purchase notes without usage quantity`).
  - Total 18 file (+1684 / −416).
  - Cara push yang dipakai: klon baru `git clone --depth 1 -b main` ke `/tmp/opencode/gp-remote`, `rsync -a` dari `pos-engine/` dengan pengecualian `.env`, `data/`, `node_modules/`, `dist/`, `project/frontend/build/`, `*.apk`, `*.map`, `package-lock.json`, dan `graphify-out/cache/`; lalu commit dan `git push origin main` memakai deploy key SSH.
  - Dokumen `migration-meta/` + `HANDOVER.md` di-push ke repo pada commit **`b8a3304`** (`docs:`).
  - Dokumen root (arsitektur, rencana landing, breakdown task, task-review) di-push ke folder `docs/` pada commit **`4c967bb`**.
  - `backend-landing-page` diimpor ke folder **`landing-page/`** pada commit **`7c444fe`** (96 file, +18110). Dikecualikan: `graphify-out/` (3,1 MB artefak generate), `.omh/` (catatan kerja agen), `docker-compose.yml.before-cutover-20261117` (backup lama), `probe_edge.py` (skrip sekali pakai). `docker-compose.override.yml` tetap lokal karena berisi port/IP host dan sudah ada di `.gitignore`.
  - `landing-page/.env.example` ditambahkan (37 baris, hanya placeholder) karena `README.md` layanan itu sudah merujuk berkas tersebut tetapi berkasnya belum ada.
  - Indeks `docs/README.md` diperbarui pada commit **`cca0291`** untuk mencatat folder `landing-page/` dan pengecualiannya.
  - Sanitasi sebelum push: PIN akun uji, nomor telepon outlet, nomor penerima WhatsApp, dan nilai secret diganti `[REDACTED]` / `[disamarkan]`.

