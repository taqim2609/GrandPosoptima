Review-06: backend-landing-page — Audit layanan bisnis & database (app/services.py, app/db.py, db/schema.sql, db/seed.sql)
Ruang lingkup: read-only audit logika bisnis dan lapisan data di landing-page/.
Tujuan: menemukan bug perhitungan, drift skema, dan ketidakkonsistenan data tanpa mengubah kode.
Lihat:
1. app/services.py (~36 KB): perhitungan diskon, HPP (cost of goods sold), margin, vendor settlement, pembulatan mata uang (NUMERIC/BIGINT PostgreSQL vs float JS di pos-engine).
2. app/db.py (~4 KB): koneksi database, session management, query helper.
3. db/schema.sql (~32 KB): skema tabel, tipe data, constraint, indeks.
4. db/seed.sql (~13 KB): data seed, apakah cocok dengan in-memory `db` di pos-engine api-server.js.
5. Drift skema antara PostgreSQL (backend-landing-page) dan in-memory store (pos-engine) — dokumentasikan dalam tabel.
6. Apakah ada transaksi/atomisitas yang hilang (mis. pembayaran tidak dicatat secara atomik)?
Acceptance:
- Inventaris fungsi layanan utama dengan path/baris.
- Temuan P0-P3 dengan bukti path + baris + reproduksi/alasan teknis.
- Tabel drift skema PostgreSQL vs in-memory pos-engine.
- Laporan dalam Bahasa Indonesia, read-only, tidak ada perubahan kode.
Constraints: tidak mengubah file apa pun; tidak mengaktifkan sw.js; tidak menghapus polyfills.js; tidak dynamic import.