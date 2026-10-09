# Rancangan: Windows sebagai Server Utama + Raspberry Pi sebagai Cadangan (failover satu database)

Tanggal: 2026-09-11. Status: **rancangan — belum ada perubahan kode.** Lanjutan dari
`docs/ANALISA-DB-WINDOWS-PI.md` (yang menolak dua database terpisah).

Usulan yang dinilai: *PC Windows = server utama; Pi = cadangan yang menggantikan saat PC mati;
begitu PC menyala lagi, database diperbarui (termasuk perubahan dari Pi) ke PC.*

---

## 1. Jawaban: **ya, ini arah yang benar** — dengan satu syarat penting

Syaratnya: **jangan dua database yang saling menyalin, tapi SATU database yang direplikasi**
(MongoDB *replica set*). Perbedaan kalimat ini menentukan seluruh risiko:

| | Dua database + sinkronisasi dua arah | Satu database direplikasi (replica set) |
|---|---|---|
| Penulis data | Dua-duanya boleh menulis → timbul perbedaan | **Selalu tepat satu node** (primary), dijamin pemungutan suara |
| Nomor order bentrok | Ya (indeks unik menolak insert) | Tidak mungkin — nomor dibuat di satu tempat |
| Stok / poin / kas / bagi hasil | Bisa berbeda antar layar tanpa error | Selalu satu angka |
| "Update database saat PC nyala" | Harus ditulis sendiri + risiko salah | **Otomatis** (node yang ketinggalan mengejar lewat oplog) |
| Kalau angka salah | Baru ketahuan belakangan | Tidak terjadi |

Dengan replica set, gambaran sistemnya persis seperti yang Anda inginkan:

```
NORMAL:        Klien ──► Pintu masuk (Pi: nginx + Tailscale) ──► PC  [MONGO PRIMARY]
                                                                    │ replikasi oplog (detik)
                                                                    ▼
                                                          Pi  [MONGO SECONDARY]  ← punya salinan LENGKAP & hidup

PC MATI:       Klien ──► Pintu masuk (Pi) ──► backend di Pi ──► Pi jadi PRIMARY (pemilihan otomatis)
PC NYALA LAGI: Pi PRIMARY ──► PC mengejar ketinggalan (oplog) ──► PC siap jadi primary lagi
               (tidak ada merge, tidak ada rekonsiliasi manual — inilah "update database ke komputer")
```

Klien (browser kasir, APK, thin client opname) **tidak pernah mengganti alamat** karena pintu
masuknya tetap Pi — dan Pi ada di jaringan yang sudah Anda pakai untuk Tailscale/Funnel.

---

## 2. Tujuh hal yang wajib disiapkan (ini isi pekerjaannya)

### 2.1 Versi MongoDB harus SAMA di kedua node
Pi 3/4 (ARMv8.0-A) hanya bisa `mongo:4.4.18` (versi 4.4.19+/5+/6+/7+ crash "Illegal Instruction");
karena itu PC **juga** harus `MONGO_IMAGE=mongo:4.4.18` (image amd64 tersedia). Replica set
campur 4.4 + 7.0 **tidak didukung** MongoDB — harus seragam.
⚠️ Konsekuensi: MongoDB 4.4 sudah **EOL** (patch keamanan berhenti Feb-2024). Untuk LAN
tertutup risikonya moderat. Kalau nanti memakai **Pi 5** (ARMv8.2), kedua node bisa MongoDB 7.x
dan catatan EOL ini hilang.

### 2.2 Wajib ada anggota ke-3 (arbiter) — kesalahan paling sering
Replica set 2 anggota: mayoritas = 2 → bila **salah satu** mati, **tidak ada primary** → POS mati
total (lebih buruk daripada sekarang). Jadi perlu anggota ke-3 berupa **arbiter** (mongod ringan
tanpa data, ±30–50 MB RAM).

Penempatan yang saya usulkan: **arbiter sebagai container di mesin Pi** (port 27018, volume kecil).
- Skenario utama Anda — *PC mati, Pi hidup* → Pi + arbiter = 2 dari 3 → mayoritas ✓ → Pi naik jadi primary.
- Kekurangan yang harus jujur disampaikan: skenario *mesin Pi mati & PC hidup* → hanya 1 dari 3 →
  **tidak ada primary** → POS berhenti walau PC sehat. Perlu **prosedur darurat** (1 menit):
  jalankan di PC `rs.reconfig({_id:"rs0", members:[{_id:0, host:"<IP-PC>:27017"}]}, {force:true})`
  lalu kembalikan ke konfigurasi 3 anggota setelah Pi hidup. Harus ada di runbook.
- Kalau tersedia **perangkat ke-3 yang selalu nyala** (mini PC/laptop lama/NAS yang bisa Docker),
  taruh arbiter di sana → prosedur darurat tidak diperlukan sama sekali.

### 2.3 Ukuran oplog & "ketinggalan terlalu lama"
Node yang mati lama harus mengejar dari oplog. Set `--oplogSize 1024` (MB) pada kedua nodes.
Volume Anda (ratusan order) sangat kecil, jadi jendela catch-up praktis tak terbatas — tetapi bila
oplog terlewat, node itu **tidak bisa mengejar otomatis** dan perlu **resync penuh**
(`rs.remove` → kosongkan datanya → `rs.add` → initial sync dari node sehat). Prosedur ini juga
harus ada di runbook (dan aman, karena sumbernya node yang sehat).

### 2.4 Pintu masuk & pengalihan otomatis
`frontend/nginx.conf` sekarang memakai `proxy_pass http://backend:8001` (nama service Docker).
Rencana: di Pi, `proxy_pass` diarahkan ke sebuah `upstream` yang ditulis oleh **watchdog**
(cek `/api/health` PC tiap 10–20 detik):
- PC sehat → `upstream gak_core { server <IP-PC>:8001; }` (nginx reload) → beban berat di PC.
- PC mati → `upstream gak_core { server backend:8001; }` (backend lokal Pi) + `docker compose up -d backend`
  di Pi bila belum jalan → Pi melayani sendiri, dan replica set sudah memilih Pi sebagai primary.
- Perkiraan jeda alih fungsi: **10–60 detik** (timeout deteksi + pemilihan primary + start backend).
  Selama jendela ini, kasir **tetap bisa jualan** karena **mode offline perangkat** (sudah ada,
  sekarang default MATI → harus dinyalakan di kasir).
- Konsekuensi: **Pi harus selalu hidup** → jadwal mati otomatis pukul 01:00
  (`setup-power-schedule-pi.sh`) harus dimatikan. Bila Pi yang mati: alamat darurat = alamat PC
  langsung (buat 2 shortcut di PC kasir).

### 2.5 Keamanan koneksi antar node (jangan dilewatkan)
Sekarang Mongo **tanpa autentikasi** dan port-nya tidak diekspos (aman karena satu mesin).
Begitu dua node harus saling terhubung, port 27017 terbuka di jaringan → **wajib**:
- **keyfile** untuk autentikasi internal replica set + `--auth`, dan user aplikasi di `MONGO_URL`.
- Sebaiknya **lewat Tailscale** (mongod bind ke IP tailnet saja) supaya WiFi toko — termasuk HP
  tamu/pelanggan — tidak bisa menyentuh database. Jangan hanya mengandalkan "LAN tertutup".

### 2.6 Hanya satu backend sebaiknya yang hidup (scheduler)
Backend menjalankan tugas berkala tiap 10 menit: **laporan WA harian**, cek data yatim, cek
integritas otomatis, cek update (`_report_scheduler` di `server.py`).
Kabar baik: ketiganya **sudah punya penanda di database** (`last_sent_date`, `auto_date`, penanda
orphan) sehingga laporan WA **tidak akan terkirim dua kali** walau dua backend hidup.
Tetap saya sarankan: saat normal, **Pi hanya menjalankan mongo + arbiter + pintu masuk** (backend
Pi tidak jalan) supaya RAM Pi tidak terpakai dan tak ada dua tugas berat bersamaan. Watak tambahan
yang murah dan aman: penjaga kecil di backend agar tugas berkala hanya jalan bila **mongod lokal
adalah primary** (cek `isWritablePrimary` ke `127.0.0.1` dengan `directConnection`).

### 2.7 Write concern: pilih sadar antara cepat dan jaminan
Ini bagian paling penting secara operasional, dan harus Anda putuskan:
- **`w:1` (default, tercepat)**: PC menjawab "lunas" ke kasir sebelum Pi menerima datanya. Bila PC
  mati tepat setelah itu, Pi naik jadi primary **tanpa** transaksi tersebut; saat PC kembali,
  MongoDB **membatalkan (rollback)** tulisan yang belum tereplikasi → **struk sudah tercetak tapi
  barisnya tidak ada di laporan**. Jendelanya milidetik–detik (replikasi LAN), jadi jarang tetapi
  nyata. Hasil rollback disimpan di file rollback BSON, jadi masih bisa diaudit.
- **`w:"majority"`**: transaksi dianggap lunas hanya setelah **Pi ikut menyimpan** → tidak ada
  rollback, tetapi bila salah satu node mati/berat, transaksi bisa gagal/tertunda → POS tersendat.
  Cocok **hanya** jika Anda menjamin Pi hidup 24/7.
- Jalan tengah yang saya usulkan: `w:1` untuk operasi ringan, `w:"majority"` untuk **pembayaran &
  void** (uang), dengan `wtimeout` + pesan error yang jelas ke kasir bila Pi tidak mengakui.
  Perlu diuji, bukan sekadar diatur.

---

## 3. Yang berubah di aplikasi (perubahannya kecil — ini untung besar replica set)

| Perubahan | Sifat | Catatan |
|---|---|---|
| `MONGO_URL` → `mongodb://<IP-PC>:27017,<IP-PI>:27017/grandpos?replicaSet=rs0&readPreference=primaryPreferred&retryWrites=true` (+ user/password) | **konfigurasi saja** | Driver Motor/Mongo otomatis mengarahkan tulisan ke primary |
| Compose node Pi & node PC (mongo `--replSet` + `--oplogSize` + bind IP + arbiter; backend opsional; nginx) | konfigurasi | Tidak mengubah kode aplikasi |
| Skrip inisialisasi replica set + keyfile + user | skrip baru | 1× saja |
| Watchdog alih fungsi di Pi (health check + tulis upstream + reload nginx + start/stop backend) | skrip baru | inti failover |
| Halaman/endpoint **status**: node mana yang primary, lag replikasi, node terakhir terlihat | fitur kecil (backend+UI) | Sangat membantu saat kejadian "kenapa lambat?" |
| Penjaga scheduler: tugas berkala hanya bila mongod **lokal** primary | fitur kecil | Mencegah dua tugas berat bersamaan |
| Penyesuaian skrip operasional (backup, cek integritas, update 1-klik) supaya dijalankan terhadap node yang jadi primary; padanan `.ps1`/WSL di Windows | skrip | Skrip bash saat ini tidak jalan native di Windows |
| **Backup tetap wajib** (mongodump + kirim ke aistudio) | tidak berubah | **Replica/secondary BUKAN backup**: penghapusan data ikut tereplikasi seketika. Ingat laporan terakhir: folder `backups/` Anda masih kosong padahal sudah ratusan transaksi. |

Yang **tidak** perlu diubah (karena satu database): nomor order & `counters`, indeks unik
(`order_number`, `client_ref`, `payment_ref`), `$inc` stok, poin/kupon, klaim atomik
`_finalize_payment`/`void_order`, laporan shift, settlement vendor, integritas, RBAC.
**Semua pemicu risiko di §4 dokumen analisa sebelumnya hilang begitu memakai satu database replikasi.**

---

## 4. Perkiraan usaha & uji wajib

**Usaha: ±1–2 minggu kerja** (bukan konfigurasi 1 jam), sebagian besar habis di pengujian kegagalan.
Uji yang wajib dilakukan di perangkat nyata (tidak bisa saya lakukan dari sandbox — perlu temani
sesi Anda, dan dilakukan **di luar jam operasional dulu**):

1. **PC dimatikan sungguhan** saat kasir bertransaksi → Pi naik jadi primary, kasir tetap bisa bayar
   (berkat mode offline), cek laporan tidak ada transaksi hilang.
2. **PC dinyalakan kembali** → PC mengejar ketinggalan otomatis, cek jumlah order/omzet/poin/stok
   kedua node sama, dan tak ada rollback tak terduga.
3. **Pi dimatikan** (uji prosedur darurat) → PC tetap bisa melayani lewat alamat langsung.
4. **Kabel/WiFi dicabut** pada kedua node (uji split-brain) → pastikan **hanya satu** primary muncul,
   dan yang kalah tidak menerima tulisan (justru inilah jaminan yang membuat arsitektur ini aman).
5. Uji beban: laporan 30 hari dari PC (harus jauh lebih cepat dari Pi) + 3–4 kasir bersamaan.

Keberhasilan = **angka di kedua node identik** setelah serangkaian kegagalan, bukan "aplikasi bisa dibuka".

---

## 5. Rencana mundur (kalau ada masalah)

Semua langkah bisa dibalik: matikan mongo+arbiter Pi, kembalikan `MONGO_URL` ke satu node
(`mongodb://mongo:27017`), dan aplikasi kembali seperti sekarang (data tetap utuh di node yang
terakhir jadi primary; simpan backup sebelum mulai). Karena itu **langkah pertama tetap: backup.**

---

## 6. Alternatif yang lebih murah (jujur perlu dibandingkan)

1. **Pindah SELURUH server ke PC + Pi penerima backup (tanpa failover otomatis)** — selesai dalam
   hitungan jam, 0 kode baru. "PC mati" tidak kehilangan penjualan **asalkan mode offline perangkat
   dinyalakan**: kasir tetap jualan, transaksinya menunggu di perangkat dan **otomatis terkirim ke
   database yang sama** saat PC hidup lagi (tidak ada merge, karena hanya ada satu database).
   Kekurangan: selama PC mati, layar lain (meja/open bill, laporan) tidak melihat transaksi baru, dan
   penutupan shift/kas laci baru bisa dilakukan setelah PC hidup.
2. **Tetap satu server di Pi, sembuhkan akarnya** — SSD USB3 + RAM 4 GB + snapshot laporan harian +
   mode offline. Termurah, nol risiko data.
3. Kombinasi yang paling masuk akal secara biaya-manfaat: **lakukan (1) sekarang** (PC jadi server
   utama hari ini), lalu pertimbangkan failover replica set (§2) hanya bila hasil (1) menunjukkan
   downtime PC benar-benar sering.

---

## 7. Pertanyaan yang menentukan sebelum saya kerjakan

1. PC Windows: **menyala 24 jam** atau hanya jam buka? (menentukan siapa yang layak jadi primary)
2. Ada **perangkat ke-3 yang selalu nyala** (mini PC/laptop/NAS) untuk arbiter? Bila tidak, apakah
   skenario "Pi mati saat PC hidup" harus tetap jalan tanpa prosedur manual?
3. **Model Raspberry Pi** (3/4/5)? → menentukan MongoDB 4.4 (EOL) atau 7.x.
4. Kasir memakai **berapa perangkat** dan apakah boleh menyalakan **mode offline** (wajib untuk
   mulus saat alih fungsi)?
