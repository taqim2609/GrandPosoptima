# RENCANA TERPADU — Review 05–11 + Landing Page L-01–L-07
Status: **PAPARAN SAJA — BELUM DIBUAT DI KANBAN, BELUM DIJALANKAN**
Tanggal: 2026-10-30

## KEPUTUSAN YANG SUDAH DISEPAKATI Qim
1. Gudang 644: P1A di-slim → hanya Landing Page static + Landing API. POS engine dihapus dari P1A.
2. P1B FastAPI (port 8000) = tempat API config landing (CRUD `/api/landing/*`).
3. PostgreSQL `grandpos-db-1` (100.117.186.13:5432) = tabel `landing_config` (single source of truth, sesuai I1).
4. Subdomain Tailscale: `landing.gudang-644.tailf3a839.ts.net` (nanti ganti custom domain).
5. Pi: hanya POS kiosk frontend. Landing page dihilangkan dari Pi; config diatur via API Gudang (P1B).
6. Review 05–11 + Landing L-01–L-07 **digabung dalam satu rantai berurutan** (menyentuh file yang sama).
7. Semua task **BLOCKED** sampai Qim setuju.

---

## PENEMPATAN FILE (terverifikasi read-only 2026-10-30)

### A. Landing page — POHON AKTIF `pos-engine/src/`
| File | Ukuran | Peran |
|------|--------|-------|
| `/root/grandpos/pos-engine/src/pages/LandingPage.jsx` | 62.857 B | Halaman landing publik |
| `/root/grandpos/pos-engine/src/pages/SettingsLandingPage.jsx` | 32.477 B | UI Settings → tab Landing Page |
| `/root/grandpos/pos-engine/src/config/landing-page.config.js` | 4.111 B | Konfigurasi konten landing |
| `/root/grandpos/pos-engine/src/services/landingService.js` | 7.672 B | Service CRUD config |
| `/root/grandpos/pos-engine/src/lib/landing.js` | 781 B | Helper |

### B. Landing page — POHON DUPLIKAT Pi `pos-engine/project/frontend/src/`
| File | Ukuran | Catatan |
|------|--------|---------|
| `project/frontend/src/pages/LandingPage.jsx` | 48.673 B | **duplikat, versi berbeda** |
| `project/frontend/src/pages/SettingsLandingPage.jsx` | **TIDAK ADA** | belum ada |
| `project/frontend/src/config/landing-page.config.js` | **TIDAK ADA** | belum ada |
| `project/frontend/src/services/landingService.js` | **TIDAK ADA** | belum ada |
| `project/frontend/src/lib/landing.js` | **TIDAK ADA** | belum ada |

⚠️ Dua pohon tidak sinkron — harus diputuskan mana yang jadi acuan.

### C. Backend target — `backend-landing-page/`
| File | Ukuran | Peran |
|------|--------|-------|
| `app/api.py` | 26.975 B | **target endpoint `/api/landing/*`** |
| `app/constants.py` | 792 B | konstanta |
| `app/db.py` | 4.187 B | koneksi DB |
| `app/services.py` | 36.468 B | logika bisnis |
| `db/schema.sql` | 32.608 B | **target tabel `landing_config`** |
| `db/seed.sql` | 12.989 B | seed data |
| `db/roles.sql` | 2.852 B | role |
| `db/migrations/` | — | migrasi |
| `app/mcp_server.py` | 19.508 B | MCP 17 tool |
| `app/mcp_db.py` | 6.639 B | DSN MCP |
| `app/mcp_reports.py` | 34.418 B | laporan MCP |
| `app/guard.py` | 8.002 B | otorisasi |
| `app/rules.py` | 6.502 B | validasi |
| `app/signing.py` | 4.409 B | signing |
| `app/outbox.py` | 6.291 B | antrian pesan |
| `app/outbox_delivery.py` | 11.167 B | pengiriman pesan |
| `app/parsers.py` | 6.895 B | parsing input |
| `app/edge_sync.py` | 19.568 B | sinkronisasi P1A↔P1B |
| `tests/` (14 file .py) | ~180 KB | pytest |

### D. P1A Express — `pos-engine/`
| File | Ukuran | Peran |
|------|--------|-------|
| `api-server.js` | 6.280 baris | Express port 3000 |
| `routes/allMissingRoutes.js` | 105.499 B | rute lengkap |
| `routes/mcpServer.js` | 70.981 B | 11 tool MCP pos_* |

### E. Infrastruktur
| Item | Lokasi / Nilai |
|------|----------------|
| Nginx Gudang | `/etc/nginx/sites-available/grandpos` |
| PostgreSQL | `grandpos-db-1` @ `100.117.186.13:5432`, db `grandpos`, role `grandpos_app` |
| Port 3000 | P1A Express (POS engine + landing page) |
| Port 8000 | P1B FastAPI |
| Port 8001 | MCP read-only |
| Port 8644 | Hermes WA Gateway (jangan disentuh) |
| Pi | `100.109.98.56`, nginx port 80 |

⚠️ **TEMUAN**: Nginx Gudang saat ini `location /api/` → `127.0.0.1:3000` (P1A), **BUKAN** `127.0.0.1:8000` (P1B). Jadi P1B FastAPI belum diekspos lewat `/api/`.

---

## RANTAI TERPADU (14 task, berurutan, tidak paralel)

### Fase 1 — Audit backend-landing-page (Review 05–08)
| # | Task | Cakupan |
|---|------|---------|
| **05** | Audit API layer | `app/api.py`, `app/constants.py` — endpoint, validasi, error handling, status order, auth/RBAC, kontrak lintas repo |
| **06** | Audit Services & DB | `app/services.py`, `app/db.py`, `db/schema.sql`, `db/seed.sql` — perhitungan uang, atomisitas, drift skema |
| **07** | Audit MCP layer | `app/mcp_server.py`, `app/mcp_db.py`, `app/mcp_reports.py` — DSN benar/salah, probe read-only |
| **08** | Audit Security & Sync | `guard.py`, `rules.py`, `signing.py`, `outbox*.py`, `parsers.py`, `edge_sync.py` |

### Fase 2 — Audit sisa pos-engine (Review 09–10)
| # | Task | Cakupan |
|---|------|---------|
| **09** | Frontend sisa | 47 halaman + 26 komponen + 23 lib — ketaatan AGENTS.md, format rupiah, WIB |
| **10** | Rute + sisa api-server | `allMissingRoutes.js`, `mcpServer.js`, sisa `api-server.js` |

### Fase 3 — Verifikasi lintasan (Review 11)
| # | Task | Cakupan |
|---|------|---------|
| **11** | MCP tools + infra + coverage | Probe MCP 3000 & 8001, nginx/docker/systemd/.env, coverage uji, daftar restart |

### Fase 4 — Implementasi Landing Page (L-01–L-07)
| # | Task | Cakupan |
|---|------|---------|
| **L-01** | Inventarisasi landing | Tentukan pohon acuan (`src/` vs `project/frontend/src/`), daftar file dipindah, dapatkan persetujuan Qim |
| **L-02** | Tabel + API config | Tabel `landing_config` di `db/schema.sql` + migrasi; endpoint `/api/landing/*` di `app/api.py`; auth pakai JWT yang sudah ada |
| **L-03** | Nginx Gudang | Server block subdomain `landing.gudang-644...` → static build; `/api/landing/*` → P1B:8000 |
| **L-04** | Slim P1A Gudang | Hapus POS engine/cashier dari P1A; landing page jadi static build served Nginx |
| **L-05** | Nginx Pi | Hapus redirect landing; tambah proxy `/api/landing/*` → Gudang:8000 |
| **L-06** | Frontend Pi | Hapus route landing; `SettingsLandingPage` panggil API Gudang |
| **L-07** | Verifikasi end-to-end | Edit landing dari POS Pi → tersimpan di PG → landing Gudang tampil baru |

---

## DEPENDENCY (mengapa urutan ini)
- **L-02** bergantung **Review-05 + Review-06** → menyentuh `app/api.py` & `db/schema.sql`
- **L-03** bergantung **Review-11** → menyentuh Nginx/infra
- **L-04** bergantung **Review-10** → menyentuh `api-server.js` & rute P1A
- **L-06** bergantung **Review-09** → menyentuh frontend pages

## CONSTRAINTS WAJIB (berlaku semua task)
- Tidak refactor berisiko `OfflineContext.jsx`
- Tidak mengaktifkan `sw.js`
- Tidak menghapus `polyfills.js`
- Tidak menambah dynamic import / chunk splitting
- Tidak mengubah perilaku bisnis ambigu tanpa keputusan Qim
- Setiap perubahan wajib bukti path + baris
- Tidak deploy ke produksi tanpa otorisasi Qim eksplisit
- Probe MCP hanya read-only
- Tidak restart service (dokumentasikan kebutuhan restart saja)

---

## STATUS TASK DI KANBAN
| Item | Status |
|------|--------|
| Fix-01 `t_67c6021e` | ✅ done |
| Fix-02 `t_6d1b726f` | ✅ done |
| Verify-01 `t_d95b7a99` | ✅ done |
| Fix-03 `t_929dc85a` | ● running |
| Review 05–11 | ❌ **belum dibuat** |
| L-01–L-07 | ❌ **belum dibuat** |
