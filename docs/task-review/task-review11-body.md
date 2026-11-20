Review-11: Verifikasi lintasan akhir — MCP tools, deploy/infra, dan coverage uji
Ruang lingkup: verifikasi akhir lintasan produksi GrandPOS tanpa deploy (read-only + probe read-only).
Tujuan: memastikan MCP tools, infrastruktur deploy, dan coverage uji siap untuk tahap berikutnya (deploy memutuskan Qim terpisah).
Lihat:
1. MCP tools: verifikasi 11 tool pos_* di port 3000 (Express) dan 17 tool read-only di port 8001 (FastAPI/MCP) dengan probe read-only. Catat output mentah minimal 1 tool dari setiap kelompok.
2. Deploy/infra: cek /etc/nginx/sites-available/grandpos, docker-compose (P1A port 3000, P1B port 8000), systemd service (grandpos-mcp.service, grandpos-web-app), .env (DATABASE_URL, JWT_SECRET, WEBHOOK_PORT). Apakah konfigurasi konsisten dan benar?
3. Coverage uji: cek ada tidaknya test backend (pytest di backend-landing-page/tests) dan frontend (Jest di pos-engine). Apakah ada area tanpa test?
4. Catat kebutuhan restart container setelah patch (grandpos_web_app, grandpos-api-1, grandpos-mcp.service, nginx) — dokumentasi saja, tidak restart.
Acceptance:
- Output mentah probe MCP read-only (minimal 1 dari setiap kelompok).
- Tabel konfigurasi deploy/infra dengan status (OK / perlu perhatian).
- Laporan coverage uji: area dengan dan tanpa test.
- Daftar kebutuhan restart setelah deploy.
- Laporan dalam Bahasa Indonesia, read-only (tidak deploy, tidak restart).
Constraints: tidak deploy ke produksi tanpa otorisasi Qim; tidak restart service; probe MCP hanya read-only; tidak mengubah file konfigurasi produksi.