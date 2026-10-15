# Fitur — Landing Page Publik, Cerita Kuliner Aceh, dan Booking Meja Online

Halaman depan publik sebelum login kasir yang menampilkan etalase menu otentik, artikel dan cerita budaya kuliner Aceh, serta formulir reservasi meja online yang terintegrasi langsung dengan antrean meja POS dan WhatsApp.

## Kebutuhan fungsional
- LND-FR-001: Sistem harus menyediakan landing page publik pada rute utama sebelum login dengan informasi restoran Grand Aceh Kuliner dan akses cepat menuju POS kasir.
- LND-FR-002: Sistem harus menampilkan etalase menu F&B terbitan (published) yang diambil secara dinamis dari katalog produk dengan filter kategori interaktif.
- LND-FR-003: Sistem harus menyediakan rubrik artikel dan cerita filosofi kuliner Aceh yang dapat dikurasi dan dikelola oleh admin/pengurus restoran melalui panel dashboard.
- LND-FR-004: Sistem harus menyediakan formulir booking meja online bagi pelanggan publik yang langsung tersimpan ke data antrean reservasi POS dan terhubung dengan notifikasi WhatsApp.

## Kriteria penerimaan
- LND-AC-001: Halaman utama dapat diakses pengunjung publik tanpa perlu login kasir dan menyediakan tombol "Masuk POS" yang mengarahkan ke autentikasi sistem kasir.
- LND-AC-002: Pelanggan dapat memfilter hidangan berdasarkan kategori (Makanan Aceh, Minuman, Kopi, Camilan) serta melihat harga Rupiah dan ketersediaan menu secara akurat.
- LND-AC-003: Admin dapat membuat, mengubah status draft/publish, mengedit, dan menghapus artikel kuliner melalui dashboard admin terintegrasi.
- LND-AC-004: Formulir reservasi memvalidasi nama, nomor WhatsApp, tanggal, jam, dan jumlah tamu, lalu mencatat pesanan meja ke antrean reservasi POS kasir dan memicu notifikasi WhatsApp.
