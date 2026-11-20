Review-08: backend-landing-page — Audit keamanan, validasi, sinkronisasi & outbox (app/guard.py, app/rules.py, app/signing.py, app/outbox.py, app/outbox_delivery.py, app/parsers.py, app/edge_sync.py)
Ruang lingkup: read-only audit keamanan dan integritas data di /root/grandpos/backend-landing-page/app.
Tujuan: menemukan celah validasi, otorisasi, signing, dan risiko sinkronisasi tanpa mengubah kode.
Lihat:
1. app/guard.py (~8 KB): otorisasi/guard — endpoint apa saja yang dilindungi, ada yang bocor?
2. app/rules.py (~6.5 KB): aturan bisnis validasi — input yang lolos validasi tidak ditangani?
3. app/signing.py (~4.4 KB): penandatanganan permintaan/respons — algoritma, kunci, rotasi?
4. app/outbox.py (~6.3 KB) + app/outbox_delivery.py (~11 KB): antrian pesan, apakah pesan hilang saat gagal terkirim? Idempotensi?
5. app/parsers.py (~6.9 KB): parsing input — apakah input malformed menyebabkan crash atau data rusak?
6. app/edge_sync.py (~19.5 KB): sinkronisasi antara P1A (in-memory) dan P1B (PostgreSQL) — mekanisme, frekuensi, konflik data, apakah sinkronisasi benar-benar terjadi atau hanya satu arah?
Acceptance:
- Inventaris fungsi keamanan/integritas dengan path/baris.
- Temuan P0-P3 dengan bukti path + baris + reproduksi/alasan teknis.
- Penilaian risiko sinkronisasi P1A ↔ P1B (data berbeda atau tidak).
- Laporan dalam Bahasa Indonesia, read-only.
Constraints: tidak mengubah file apa pun; tidak mengaktifkan sw.js; tidak menghapus polyfills.js; tidak dynamic import.