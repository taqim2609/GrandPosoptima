Review-07: backend-landing-page — Audit lapisan MCP (app/mcp_server.py, app/mcp_db.py, app/mcp_reports.py)
Ruang lingkup: read-only audit MCP GrandPOS di /root/grandpos/backend-landing-page/app.
Tujuan: memverifikasi MCP berbicara ke database GrandPOS yang benar, tidak ke paperclip-db, dan output konsisten tanpa mengubah kode.
Lihat:
1. app/mcp_server.py (~19 KB): daftar tool MCP, routing, read-only enforcement, limit 500 baris per panggilan.
2. app/mcp_db.py (~6.6 KB): DSN/koneksi database — apakah benar-benar menunjuk ke 100.117.186.13:5432/grandpos (role grandpos_app), atau fallback ke 127.0.0.1:5432 (paperclip-db)?
3. app/mcp_reports.py (~34 KB): laporan sales_today, report_query, inventory, vendor_settlement — output konsisten dengan data POS?
4. Verifikasi koneksi MCP: jalankan read-only probe (mis. sales_today, report_query report=sales) dan catat output mentah.
5. Dokumentasikan inkonsistensi data antara MCP/PostgreSQL dan in-memory pos-engine.
Acceptance:
- Daftar tool MCP dengan path/baris definisi.
- Bukti DSN yang benar (atau temuan jika salah) dengan path/baris.
- Output mentah dari probe MCP read-only (minimal 1 laporan).
- Temuan P0-P3 dengan bukti path + baris.
- Laporan dalam Bahasa Indonesia, read-only.
Constraints: tidak mengubah file apa pun; probe hanya read-only; tidak mengaktifkan sw.js; tidak menghapus polyfills.js.