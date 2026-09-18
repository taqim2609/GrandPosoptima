<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Update Center — Grand Aceh Kuliner POS</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, "Segoe UI", Roboto, system-ui, sans-serif;
    min-height: 100vh;
    background: linear-gradient(135deg, #EEF2FF 0%, #F5F3FF 45%, #FDF2F8 100%);
    display: flex; align-items: center; justify-content: center; padding: 24px;
  }
  .card {
    max-width: 560px; width: 100%;
    background: rgba(255,255,255,0.72);
    backdrop-filter: blur(18px) saturate(160%);
    -webkit-backdrop-filter: blur(18px) saturate(160%);
    border: 1px solid rgba(255,255,255,0.8);
    border-radius: 20px;
    box-shadow: 0 18px 45px rgba(79,70,229,0.14);
    padding: 36px 32px;
  }
  h1 { font-size: 22px; color: #1F1B3A; margin-bottom: 6px; }
  .sub { color: #635F82; font-size: 14px; margin-bottom: 22px; }
  .ver {
    display: inline-block; background: #4F46E5; color: #fff;
    border-radius: 999px; padding: 4px 14px; font-size: 13px;
    font-weight: 700; letter-spacing: .3px; margin-bottom: 18px;
  }
  ul { list-style: none; margin: 14px 0 24px; }
  li { color: #3D3A5C; font-size: 14px; padding: 7px 0 7px 28px; position: relative; }
  li::before {
    content: "✓"; position: absolute; left: 4px; top: 6px;
    color: #4F46E5; font-weight: 800;
  }
  a.btn {
    display: block; text-align: center; text-decoration: none;
    background: linear-gradient(90deg, #4F46E5, #8B5CF6);
    color: #fff; font-weight: 700; font-size: 15px;
    border-radius: 12px; padding: 13px 18px; margin-bottom: 10px;
  }
  a.btn.ghost {
    background: rgba(79,70,229,0.08); color: #4F46E5;
  }
  code {
    display: block; background: #1F1B3A; color: #C7D2FE;
    border-radius: 10px; padding: 12px 14px; font-size: 12.5px;
    line-height: 1.7; margin: 12px 0 20px; overflow-x: auto; white-space: pre;
  }
  .foot { color: #8b87a8; font-size: 12px; margin-top: 16px; text-align: center; }
</style>
</head>
<body>
  <div class="card">
    <h1>Grand Aceh Kuliner POS</h1>
    <div class="sub">Update Center — untuk server lokal (Raspberry Pi / Linux)</div>
    <span class="ver" id="ver">versi: memuat…</span>
    <p style="color:#3D3A5C;font-size:14px;line-height:1.6">
      Arsip kode terbaru (termasuk build frontend &amp; bundle OTA untuk APK)
      tersedia di halaman ini. Server Pi cukup mengunduh dari sini — tanpa git pull.
    </p>
    <ul>
      <li>File <b>.env</b>, <b>backend/.env.docker</b>, dan <b>backups/</b> tidak ikut ditimpa</li>
      <li>Versi dicek otomatis — bila sama, tidak ada unduhan/rebuild</li>
      <li>Auto-update harian (cron) tetap berfungsi</li>
      <li><b>Widget Kustom Dashboard</b> — kartu angka sendiri dari isian + rumus + data otomatis; bisa ditambah/disusun/disembunyikan (Atur Widget)</li>
      <li><b>Platform & Tampilan</b> — nama aplikasi, logo, warna tema bisa diganti tanpa deploy (Pengaturan)</li>
      <li><b>Roles & Izin</b> — role kustom & izin per modul bisa diatur admin tanpa ubah kode (Pengaturan)</li>
      <li><b>Bahan Baku &amp; Daftar Belanja</b> — master bahan (stok, stok minimum, harga beli), beli &amp; opname, dipakai resep/HPP; daftar belanja otomatis + manual bisa dicetak &amp; dikirim WA ke nomor tujuan khusus</li>
      <li><b>Template WhatsApp bisa diedit</b> — laporan harian, shift, bagi hasil vendor, daftar belanja (variabel {tanggal}, {total}, …)</li>
      <li><b>Role bawaan baru</b>: Super Admin (owner), Admin, Kasir, Staf Input, <b>Input Pembayaran</b>, <b>Stok Opname</b></li>
      <li><b>Pengaturan lebih rapi</b>: Roles &amp; Izin di dalam tab Pengguna · Platform + Menu &amp; Tampilan UI · Diagnostik di Fitur &amp; Integrasi</li>
      <li><b>Promo &amp; Kupon digabung</b> · <b>Resep &amp; HPP</b> di dalam Produk &amp; Stok · laporan tutup shift bisa dicetak</li>
      <li><b>Cek Integritas Data</b> — periksa relasi data, angka transaksi, stok, akun, indeks database &amp; backup; temuan yang aman bisa diperbaiki langsung dari halaman (Pengaturan → Fitur &amp; Integrasi → Integritas), bisa dijadwalkan mingguan, plus skrip <code style="display:inline;padding:1px 6px">./check-integrity-pi.sh</code> di server</li>
      <li><b>Berkas proyek tanpa kompresi</b> — halaman <b>Berkas proyek</b> menampilkan seluruh berkas proyek apa adanya (bisa dicari, dibaca langsung, dan diunduh satu per satu); arsip <b>.tar.gz</b> hanya untuk update otomatis di server</li>
      <li><b>APK Android v2.10</b> (minSdk 23 = Android 6.0+, termasuk Android 7) — lihat bagian bawah</li>
    </ul>
    <a class="btn" href="files.php">📂 Berkas proyek (tanpa kompresi) — lihat &amp; unduh satu per satu</a>
    <a class="btn ghost" href="archive.php?f=pos-grand.tar.gz" download>⬇ pos-grand.tar.gz (khusus update otomatis server)</a>
    <a class="btn ghost" href="dl.php?f=update-pos-pi.sh" download>⬇ Unduh update-pos-pi.sh</a>
    <a class="btn ghost" href="dl.php?f=check-integrity-pi.sh" download>🛡 Unduh check-integrity-pi.sh</a>
    <a class="btn ghost" href="apk/Grand-Aceh-Kuliner-POS-v2.10.apk" download>📱 Unduh APK Android v2.10 (buka laci otomatis)</a>
    <p style="color:#635F82;font-size:13px;margin-bottom:6px">Di server Pi (sekali saja untuk beralih):</p>
    <code>cd ~/grand-aceh-pos
curl -fsSL "https://taqim258.vibecoder.co.id/pos-grand-update/dl.php?f=update-pos-pi.sh" -o update-pos-pi.sh
chmod +x update-pos-pi.sh
./update-pos-pi.sh</code>
    <div class="foot">Update berikutnya cukup: <code style="display:inline;white-space:nowrap;padding:2px 8px">./update-pos-pi.sh</code></div>
    <div class="foot" style="margin-top:8px">Cek kesehatan &amp; integritas data server: <code style="display:inline;white-space:nowrap;padding:2px 8px">./check-integrity-pi.sh</code></div>
  </div>
  <script>
    fetch("version.json").then(function(r){return r.json();}).then(function(v){
      document.getElementById("ver").textContent = "versi: " + v.version + " — " + (v.updated || "");
    }).catch(function(){ document.getElementById("ver").textContent = "versi: (gagal memuat)"; });
  </script>
</body>
</html>
