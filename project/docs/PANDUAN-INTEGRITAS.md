# Panduan Cek Integritas Server & Data

Dokumen ini menjelaskan cara memeriksa kesehatan server Grand Aceh Kuliner POS:
apakah container hidup, apakah backend sehat, dan apakah **data di dalamnya masih
konsisten** (tidak ada referensi putus, angka transaksi ngawur, stok negatif, dsb).

Ada **dua cara** yang saling melengkapi:

| Cara | Untuk siapa | Perintah / lokasi |
|---|---|---|
| Halaman aplikasi | Admin (lewat HP/PC) | Pengaturan → **Fitur & Integrasi → Integritas** → *Cek Sekarang* |
| Skrip di komputer server | Pemilik/teknisi di Pi | `bash check-integrity-pi.sh` |

Keduanya memakai mesin pemeriksaan yang sama di backend (hasilnya juga sama),
jadi silakan pakai yang paling nyaman.

---

## 1. Halaman aplikasi (Pengaturan → Fitur & Integrasi → Integritas)

- Tombol **Cek Sekarang** menjalankan seluruh pemeriksaan (baca-saja, ±1-5 detik).
- Kartu ringkasan: **Masalah Berat**, **Perlu Perhatian**, **Normal**, **Bisa Diperbaiki**.
- Setiap temuan menampilkan jumlah, contoh data, dan saran tindakan.
- Temuan yang **jelas aman** punya tombol **Perbaiki** (satu temuan) atau
  **Perbaiki Semua yang Aman** (semua sekaligus, berurutan).
- Centang **Otomatis mingguan (Minggu 03:00 WIB)** agar server memeriksa sendiri tiap minggu;
  kalau ada temuan, ringkasannya dikirim ke nomor WhatsApp laporan
  (Pengaturan → WhatsApp & Laporan).

Hasil pemeriksaan terakhir selalu tersimpan, jadi halaman ini tidak perlu dijalankan
ulang untuk melihat kondisi terakhir.

## 2. Skrip di komputer server

```bash
cd ~/POS-grand                      # folder tempat docker-compose.yml berada
bash check-integrity-pi.sh                  # periksa sekarang + ringkasan berwarna
bash check-integrity-pi.sh --read-only      # hanya tampilkan hasil terakhir
bash check-integrity-pi.sh --notify 62812xxxx  # sekaligus kirim ringkasan ke WhatsApp
bash check-integrity-pi.sh --json           # keluaran JSON (untuk otomatisasi/monitoring)
```

Kode keluar: `0` = sehat, `2` = ada peringatan, `1` = ada masalah berat / gagal memeriksa.

Skrip memeriksa 4 hal:

1. **Container** aplikasi hidup (docker compose ps).
2. **Backend** menjawab `/api/health` (HTTP 200).
3. **Integritas data** — memanggil pemeriksaan di backend (`POST /api/cron/integrity`
   memakai `WEBHOOK_CRON_SECRET` dari `backend/.env.docker`). Bila API belum bisa
   dihubungi (mis. server belum di-update), skrip membaca hasil terakhir langsung
   dari MongoDB — jadi tetap berguna saat server sedang bermasalah.
4. **Backup lokal** terakhir di folder `backups/` (peringatan bila lebih dari 3 hari).

### Menjadwalkan tiap minggu (opsional)

Server sudah punya penjadwal internal (centang di halaman Integritas), tapi bila ingin
levat cron sistem:

```bash
crontab -e
# tambahkan satu baris (ganti path & nomor WA):
30 3 * * 0 cd /home/pi/POS-grand && ./check-integrity-pi.sh --notify 62812xxxx >> backups/integrity.log 2>&1
```

---

## 3. Apa saja yang diperiksa

**A. Referensi & relasi (data yatim)**

| Temuan | Perbaikan otomatis |
|---|---|
| Produk menunjuk kategori hilang | Kosongkan, atau pindahkan ke kategori pilihan Anda |
| Produk menunjuk vendor hilang | Lepas penunjuk vendor |
| Item transaksi menunjuk produk hilang | Tidak (perlu diperiksa manual di Transaksi) |
| Transaksi dine-in menunjuk meja hilang | Tidak (riwayat tetap benar) |
| Transaksi menunjuk shift hilang | Tidak (tetap masuk laporan harian) |
| Catatan kas menunjuk shift hilang | Lepas penunjuk shift (tetap masuk laporan harian) |
| Reservasi menunjuk meja hilang | Batalkan reservasi yatim |
| Resep menunjuk produk/bahan hilang | Hapus resep/baris bahan yatim |

**B. Angka & transaksi**

| Temuan | Perbaikan otomatis |
|---|---|
| Total transaksi lunas ≠ subtotal − diskon + pajak | Hitung ulang total dari rincian tersimpan |
| Nomor transaksi ganda | Beri akhiran (`-2`, `-3`, …); nomor tertua dipertahankan |
| Bill terbuka menggantung > 24 jam | Void (tanpa pembayaran; stok & uang tidak berubah) |
| Transaksi lunas tanpa item / tanpa metode bayar | Tidak (perlu keputusan manusia) |
| Baris item dengan qty ≤ 0 / harga negatif / berat nol | Tidak |
| Catatan kas nominal ≤ 0 atau tipe tak dikenal | Tidak |

**C. Stok & HPP** — produk/bahan dengan stok negatif (bisa dinolkan; lanjut opname),
resep dengan HPP 0 karena harga bahan belum diisi (informasi).

**D. Akun & akses** — tidak ada Super Admin, akun aktif dengan role tak dikenal,
akun aktif tanpa password valid, tidak ada metode pembayaran aktif.

**E. Database & operasional** — indeks wajib belum terpasang (bisa dipasang ulang
langsung dari halaman), indeks unik gagal dipasang karena data kembar,
backup lokal sudah lebih dari 3 hari.

> Batas aman: pemeriksaan membaca maksimal 20.000 dokumen terbaru per koleksi berat
> (transaksi & catatan kas) demi menjaga beban server. Jumlah yang diperiksa
> ditampilkan di halaman ("… transaksi diperiksa").

---

## 4. Catatan penting soal perbaikan

- Perbaikan **tidak menghapus transaksi penjualan** dan tidak mengubah uang yang
  sudah diterima. Yang dirapikan hanya data yang hubungannya sudah rusak.
- Satu-satunya perbaikan yang mengubah status transaksi adalah **void bill
  menggantung** (bill terbuka tanpa pembayaran lebih dari 24 jam) — itupun butuh
  konfirmasi di dialog.
- Setiap perbaikan mencatat jejaknya (mis. `voided_by: "cek integritas"`,
  `total_fixed_note`, `cancel_note`) sehingga bisa ditelusuri.
- Perbaikan bersifat **idempoten**: menekan tombol yang sama dua kali tidak
  merusak apa pun (temuan kedua kalinya menjadi 0).
- Temuan yang butuh penilaian manusia sengaja **tidak** punya tombol perbaikan;
  selesaikan lewat menu yang bersangkutan (Transaksi, Pengguna, Metode Pembayaran).

## 5. Bila ada masalah berat

1. Jalankan skrip: `bash check-integrity-pi.sh` → baca bagian **[4/4] Kesimpulan**.
2. Bila container mati: `docker compose up -d --build`.
3. Bila backend tidak menjawab: `docker compose logs backend --tail 50`
   (kolom *versi terpasang* di halaman Integritas membantu memastikan server sudah
   di versi terbaru: `bash update-pi.sh`).
4. Bila temuan berupa data: perbaiki dari halaman Integritas, lalu **Cek Sekarang** lagi.
5. Bila butuh bantuan tim pengembang: Pengaturan → Fitur & Integrasi → Diagnostik →
   *Salin Laporan* / *Kirim ke tim pengembang*, sebutkan di chat bahwa laporan sudah dikirim.
