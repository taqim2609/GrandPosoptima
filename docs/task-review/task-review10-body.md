Review-10: Frontend & backend — Audit rute dan sisa api-server.js (routes/allMissingRoutes.js, routes/mcpServer.js, api-server.js sisa)
Ruang lingkup: audit rute dan sisa coverage api-server.js di /root/grandpos/pos-engine yang belum diverifikasi penuh setelah Fix-01/Fix-02/Fix-03.
Tujuan: memastikan semua rute punya auth guard yang tepat, tidak ada duplicate route tersembunyi, dan konsisten antara Express (port 3000) dan FastAPI (port 8000).
Lihat:
1. routes/allMissingRoutes.js (~105 KB): audit sisa rute yang belum diperiksa Fix-01 (Fix-01 hanya hapus 3 duplicate). Cek rute tanpa auth, rute sintetis 200, rute yang bocor path internal.
2. routes/mcpServer.js (~70 KB): audit 11 tool MCP pos_* — read-only enforcement, validasi input, output konsisten.
3. api-server.js sisa (6280 baris): section yang belum disentuh Review-04/Fix-01/Fix-02 — cek apakah ada patch yang terlewat, sensitive data logging, input sanitization, dependency.
4. Tabel konsistensi rute Express vs FastAPI endpoint yang sama.
Acceptance:
- Inventaris rute Express dan MCP tool dengan path/baris.
- Temuan P0-P3 dengan bukti path + baris + reproduksi/alasan teknis.
- Tabel konsistensi rute lintas backend (Express ↔ FastAPI).
- Laporan dalam Bahasa Indonesia, read-only.
Constraints: tidak refactor OfflineContext.jsx; tidak mengaktifkan sw.js; tidak menghapus polyfills.js; tidak dynamic import; tidak ubah perilaku bisnis ambigu tanpa keputusan.