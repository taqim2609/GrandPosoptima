# Analytics API sebagai service systemd

Status: **aktif 2026-11-19**
Service: `grandpos-analytics.service`
Port: `8000` (host)

## Sebelumnya

FastAPI analytics berjalan sebagai proses lepas di dalam sesi user
(`/user.slice/user-1000.slice/session-19.scope`). Proses itu tidak punya
restart policy, tidak ikut boot, dan bisa mati saat sesi tempat ia dijalankan
berakhir. Port 8000 juga tidak otomatis hidup lagi setelah reboot.

## Sekarang

Unit systemd:

```ini
[Unit]
Description=GrandPOS Analytics API (FastAPI)
After=network-online.target docker.service
Wants=network-online.target

[Service]
Type=simple
User=root
WorkingDirectory=/root/grandpos/backend-landing-page
EnvironmentFile=/root/grandpos/backend-landing-page/.env
ExecStart=/root/grandpos/backend-landing-page/venv_mcp/bin/uvicorn app.api:app --host 0.0.0.0 --port 8000
Restart=always
RestartSec=5
TimeoutStopSec=20

[Install]
WantedBy=multi-user.target
```

Berkas: `/etc/systemd/system/grandpos-analytics.service` (enabled).

## Perintah operasional

```bash
sudo systemctl status grandpos-analytics
sudo systemctl restart grandpos-analytics
sudo journalctl -u grandpos-analytics -n 100 --no-pager
curl -sS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8000/health
```

## Catatan

- Kode yang berjalan masih dari `/root/grandpos/backend-landing-page`
  (bukan salinan `/root/grandpos-project/backend-landing-page`). Isi `app/api.py`
  identik saat diperiksa 2026-11-19; kalau salah satu diubah, samakan dulu
  sebelum restart.
- `.env` analytics berisi kredensial database dan tidak masuk git.
- Service ini bergantung pada `pg-grandpos` (container). Kalau Docker mati,
  proses tetap hidup tetapi query gagal sampai database kembali.
- `grandpos-mcp.service` adalah layanan lain (MCP business analyst) dari
  direktori yang sama; jangan tertukar.
