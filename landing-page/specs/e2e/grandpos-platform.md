# E2E spec — GrandPOS platform

- **Target:** kanban task `t_f7ef834a` — GrandPOS self-hosted platform (DB+API, AI endpoint, WhatsApp gateway)
- **Recommendation:** `Not needed` (browser E2E)
- **Status:** `Pending` — menunggu lingkungan dengan Docker/PostgreSQL
- **Created by:** software-engineer

## Alasan

Tidak ada UI browser dalam lingkup tugas ini. Permukaan yang terlihat pengguna
adalah (a) REST API dan (b) pesan WhatsApp. Tidak ada aplikasi web sehingga
skenario browser tidak bermakna. Validasi yang relevan adalah **smoke flow
runtime transaksional**, bukan browser E2E.

Direkomendasikan alih-alih browser E2E: alur runtime PostgreSQL yang
didokumentasikan di bawah, dijalankan di host dengan Docker.

## Prasyarat

- Docker daemon + `docker compose` tersedia (tidak tersedia di lingkungan
  pekerjaan ini; lihat `EVIDENCE.md`).
- `.env` diisi dari `.env.example` (password kuat, secret HMAC).
- Superadmin di-bootstrap via `db/bootstrap_superadmin.sql`.

## Skenario runtime (berurutan)

1. `docker compose up -d --build`; tunggu `db` dan `api` sehat.
2. Buka shift: `POST /shifts/open` dengan `opening_float`.
3. Order berbobot: `POST /orders` dengan `weight_kg` pada produk
   `sold_by_weight = TRUE`; pastikan `line_total = weight × base_price`.
4. Order normal: `POST /orders` dengan produk non-berat.
5. Bayar kedua order: `POST /orders/{id}/pay` (tunai + non-tunai).
6. Verifikasi poin member bertambah dan stok bahan berkurang
   (`inventory_movements` bertambah, `ingredients.stock_qty` turun).
7. Void salah satu order: `POST /orders/{id}/void`.
8. Verifikasi reversal: baris `cash_movements` tipe `void_reversal`, baris
   `inventory_movements` tipe `reversal`, poin member berkurang, `
   order_voids` terisi.
9. Tutup shift: `POST /shifts/{id}/close` dengan `counted_cash`; catat
   `expected_cash` dan `variance`.
10. Verifikasi settlement vendor: satu baris `vendor_settlements` per vendor
    dan tepat satu `cash_movements` tipe `vendor_settlement` per vendor.

## Bukti yang diminta

- Output `docker compose ps` (keduanya sehat).
- Cuplikan JSON respons tiap langkah.
- Query verifikasi untuk `cash_movements`, `inventory_movements`,
  `member_point_ledger`, `vendor_settlements`.
- Total expected vs counted cash beserta selisihnya.

## Cara menjalankan alur

`README.md` → bagian "Deployment" dan "Smoke test".

## Jalankan berikutnya

Tidak ada tugas `/e2e-tester` browser yang perlu dijalankan. Yang dibutuhkan
adalah smoke runtime di host ber-Docker; jalankan `python3 scripts/check_static.py`
lebih dulu sebagai prasyarat hijau.
