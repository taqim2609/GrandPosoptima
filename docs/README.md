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
| `ARSITEKTUR-GRANDPOS.md` | Arsitektur 3 node (Pi kasir, VPS/gudang, Tailscale), dependency, dan alur data | 2026-10-30 |
| `RENCANA-LANDING-SEP-2026.md` | Rencana gabungan Review 05–11 + Landing L-01–L-07 | 2026-10-30 |
| `TASK-BREAKDOWN-EVEN.md` | Pecahan 24 task (R-01 … R-24) dari rencana di atas | 2026-10-30 |
| `task-review/task-review05-body.md` … `task-review11-body.md` | Badan issue/task review 05–11 | 2026-10-30 |

## Catatan publikasi

- PIN akun uji, nomor telepon outlet, nomor penerima WhatsApp, dan nilai secret
  tidak ditulis di repo publik; nilainya diganti `[REDACTED]` / `[disamarkan]`.
- Dokumen di folder ini tidak memuat kredensial. Alamat IP/host tailnet yang
  muncul di sini sudah lebih dulu ada di berkas lain dalam repo ini.
- `backend-landing-page` (layanan FastAPI) belum dimasukkan ke repo mana pun.
