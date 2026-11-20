# Dokumen workspace GrandPOS

Folder ini menyimpan dokumen perencanaan dan arsitektur yang sebelumnya hanya
ada di workspace host, di luar repo `pos-engine`. Isinya **snapshot historis**:
angka, status, dan rencana di sini bisa sudah berubah.

Status terkini selalu ada di:

- `migration-meta/PLAN-UJI-END-TO-END-DAN-AUDIT-AKUNTANSI.md` — tabel status,
  verifikasi, dan log kerja.
- `migration-meta/RANCANGAN-HPP-OTOMATIS.md` — HPP dari nota belanja.
- `migration-meta/PANDUAN-COMPOSE-HOST.md` — adopsi Compose host.
- `HANDOVER.md` — ringkasan status terbaru.

## Isi

| Berkas | Isi | Tanggal snapshot |
| :--- | :--- | :--- |
| `GRANDPOS-TEMUAN-AUDIT.md` | Temuan audit lengkap dan serah-terima sistem | 2026-11-11 |
| `ARSITEKTUR-GRANDPOS.md` | Arsitektur 3 node (Pi kasir, VPS/gudang, Tailscale), dependency, dan alur data | 2026-10-30 |
| `RENCANA-LANDING-SEP-2026.md` | Rencana gabungan Review 05–11 + Landing L-01–L-07 | 2026-10-30 |
| `TASK-BREAKDOWN-EVEN.md` | Pecahan 24 task (R-01 … R-24) dari rencana di atas | 2026-10-30 |
| `task-review/task-review05-body.md` … `task-review11-body.md` | Badan issue/task review 05–11 | 2026-10-30 |

## Kode layanan

| Folder | Isi |
| :--- | :--- |
| `pos-engine/` | POS engine Node/Express + frontend React (dipakai kasir) |
| `landing-page/` | Backend FastAPI: API POS, aturan transaksi, gateway WhatsApp, MCP laporan |

`landing-page/` semula ada di luar repo. Isinya diimpor apa adanya pada
2026-11-20, dengan pengecualian: `graphify-out/` (artefak generate), `.omh/`
(catatan kerja agen), `docker-compose.yml.before-cutover-*` (backup lama), dan
`probe_edge.py` (skrip sekali pakai). `docker-compose.override.yml` sengaja
tetap lokal karena berisi port/IP host dan sudah masuk `.gitignore`.
`landing-page/.env.example` ditambahkan karena README-nya sudah merujuk berkas
itu tetapi berkasnya belum ada.

## Catatan publikasi

- PIN akun uji, nomor telepon outlet, nomor penerima WhatsApp, dan nilai secret
  tidak ditulis di repo publik; nilainya diganti `[REDACTED]` / `[disamarkan]`.
- Dokumen di folder ini tidak memuat kredensial. Alamat IP/host tailnet yang
  muncul di sini sudah lebih dulu ada di berkas lain dalam repo ini.
- Berkas `EVIDENCE.md` dan `README.md` di `landing-page/` masih menyebut path
  host lama (`/root/grandpos/...`). Itu catatan historis, bukan konfigurasi
  yang dipakai sekarang.
