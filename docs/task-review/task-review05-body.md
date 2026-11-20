Review-05: backend-landing-page — Audit lapisan API (app/api.py, app/constants.py)
Ruang lingkup: read-only audit FastAPI di /root/grandpos/backend-landing-page/app/api.py (~26 KB) dan app/constants.py (~0.8 KB).
Tujuan: menemukan bug, ketidakselarasan, dan risiko di lapisan API tanpa mengubah kode.
Lihat:
1. Semua endpoint FastAPI: daftar path, method, query/body parameter, status code kembali.
2. Validasi request: apakah semua input divalidasi sebelum diproses? Ada hole validation?
3. Penanganan error: apakah error dikembalikan dengan status HTTP yang tepat dan pesan bermanfaat, atau stack trace meluput?
4. Konsistensi status order: 'completed' (POS engine) vs 'paid' (PostgreSQL v_daily_turnover) — dampak ke laporan omzet.
5. Autentikasi/otorisasi di endpoint: ada RBAC? Endpoint sensitif tanpa pelindung?
6. Ketidakselarasan kontrak antara app/api.py dan pos-engine api-server.js (dokumentasikan dalam tabel sebelum/sesudah).
Bukan tugas deploy atau perbaikan — laporan temuan saja dengan path + baris.
Acceptance:
- Daftar lengkap endpoint dengan path/baris.
- Temuan P0-P3 masing-masing dengan bukti path + baris + reproduksi/alasan teknis.
- Tabel ketidakselarasan kontrak lintas repo.
- Laporan dalam Bahasa Indonesia, tidak ada perubahan kode (read-only).
Constraints: tidak mengubah file apa pun; tidak mengaktifkan sw.js; tidak menghapus polyfills.js; tidak dynamic import.