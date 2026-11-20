# Prompt handover — GrandPOS (per 2026-11-15 01:10 WIB)

Salin blok di bawah ini apa adanya ke sesi baru.

---

Kamu melanjutkan pekerjaan **GrandPOS** di host Linux ini. Bahasa kerja: Indonesia. Gaya: lazy senior developer — stdlib/native dulu, diff terpendek, tanpa abstraksi tak diminta, satu self-check runnable. Jangan menyimpulkan sesuatu tanpa bukti dari tool.

## Posisi sekarang (sudah diverifikasi)

| Hal | Nilai |
| :--- | :--- |
| `pos-engine` | `HEAD = origin/main = 856c36b`, working tree bersih |
| `backend-landing-page` | `HEAD = origin/main = a83640b`, bersih |
| Container | `grandpos_web_app` (:3000), `grandpos-api-1` (:8000, healthy), `grandpos-db-1` (healthy), `gak_watchtower_updater` |
| Kesehatan | web 200 · API `/health` → `db: true` · Pi 200 |
| Data POS | `orders=59 products=407 users=3 settings=17 keys`, outbox 30 entri / **0** belum terkirim |
| Postgres | `orders=131`, total Rp 18.828.900 |
| Suite uji | `npm test` → **24 lulus / 0 gagal / 0 dilewati** |
| Disk `/` | 77% (6.7 GB bebas) |

Order terakhir **2026-11-14 16:30Z**. Toko tutup → jendela restart aman.

## Yang baru selesai

- Compose produksi host akhirnya masuk repo: `pos-engine/deploy/docker-compose.host.yml` + `.env.example`. Sebelumnya hanya ada di `/root/grandpos/deploy/` yang **bukan repo git**.
- Container di-recreate dari compose itu; `DATABASE_URL` palsu (`...@127.0.0.1/paperclip`, tidak dibaca kode mana pun) dibuang.
- `run-tests.js` + `npm test` — 24 uji bisa dijalankan satu perintah. Empat uji yang dulu merah ternyata cacat harness, bukan bug produk.
- Audit `docs/GRANDPOS-TEMUAN-AUDIT.md` (1910 baris, append-only) mencatat semuanya, termasuk kesalahan saya sendiri.
- Graph di-refresh: 4076 node / 8626 edge.

Commit terakhir: `856c36b dc6bc96 5a589d7 8eca14e 9eb3b8f 95d643a`.

## Jebakan yang sudah memakan korban

1. **Bind-mount + `npx tsx` tanpa watch.** File di disk ≠ kode di memori. Setiap perubahan server-side wajib `docker restart grandpos_web_app`.
2. **Jangan menembak uji tulis ke :3000 hidup.** Pakai `GRANDPOS_DATA_DIR` ke direktori temp. Pernah memotong outbox 15 → 1 entri.
3. **Uji tulis di produksi hanya dengan kunci yang terbukti dibaca kode** (`grep` dulu). Saya pernah menulis `low_stock_threshold` ke `settings.features` — kunci itu tidak dibaca di mana pun; sudah dihapus, data identik dengan backup.
4. **Repo publik** (`taqim2609/GrandPosoptima`) → sanitasi `<PI_HOST>`, `<VPS_HOST>`, `<PI_USER>`, `<GUDANG_HOST>`, `<TAILNET>` sebelum commit.
5. **Jangan sentuh** volume `grandpos_pgdata`, `/root/backups`, volume proyek lain. Jangan pop `stash@{0}` (`review03-ota-rebuild-artifacts`).
6. **Restart saat toko buka lebih buruk daripada image basi.** Deploy malam, setelah order terakhir.
7. `grandpos-db-1` user-nya `grandpos_app`, bukan `grandpos`.

## Yang masih terbuka (urut kepentingan)

1. **Nilai Pengaturan sejak 7 Nov** — sistem sekarang bisa menyimpan (17 kunci ada di disk), tapi isinya perlu pemilik toko cocokkan: nomor WA, template pesan, RBAC, tampilan. Jangan menebak nilai.
2. **Tidak ada CI.** `.github/workflows/` kosong padahal suite 24 uji sudah ada. Satu workflow yang menjalankan `npm test` menutup celah ini.
3. **Dua sumber compose bisa menyimpang.** `/root/grandpos/deploy/docker-compose.yml` (hidup, bukan git) **berbeda** dari `pos-engine/deploy/docker-compose.host.yml` (yang di-commit dan dipakai deploy). Pilih satu: hapus yang lama atau jadikan symlink.
4. **`xlsx@0.18.5`** high, `fixAvailable: false`. Mitigasi sekarang: 4 endpoint import wajib `requireAdmin`, dikunci `tests/import-rbac.js`.
5. **Review independen belum ada.** Profil `code-reviewer` tidak ada di fleet ini; review harus lewat subagent `delegate_task`.
6. **Dua sumber angka.** `data/pos-db.json` (59 order) vs Postgres (131). POS menulis JSON, analytics sync ke Postgres — bukan bug, tapi jangan tertukar saat investigasi.

## Perintah yang sering dipakai

```bash
cd /root/grandpos/pos-engine && npm test            # 24 uji
docker compose -p deploy -f deploy/docker-compose.host.yml \
  --env-file /root/grandpos/deploy/.env config      # validasi compose (menolak tanpa .env)
docker restart grandpos_web_app && sleep 12 && curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3000/
curl -s http://127.0.0.1:8000/health                # {"status":"ok","db":true}
cd /root/grandpos && graphify update .              # setelah source berubah
```

## Aturan kerja

- Audit append-only: tambah di bawah, jangan ubah prefix.
- Jangan baca/catat password atau secret. Nilai sensitif = `[REDACTED]`.
- Jangan commit/push/deploy tanpa izin eksplisit; jangan menyentuh produksi tanpa jendela aman.
- Laporan akhir wajib: apa yang berubah, apa yang diverifikasi (dengan output nyata), apa yang dilewati dan alasannya, apa yang masih terbuka.

---

## Update 2026-11-19/20 — status terbaru (jangan pakai angka di atas)

Snapshot di atas berasal dari 2026-11-15 dan sudah kedaluwarsa untuk beberapa angka
(contoh: jumlah order dan suite uji). Status terkini ada di:

- `migration-meta/PLAN-UJI-END-TO-END-DAN-AUDIT-AKUNTANSI.md` — tabel status,
  verifikasi, dan log kerja 2026-11-19.
- `migration-meta/RANCANGAN-HPP-OTOMATIS.md` — HPP dari nota belanja (prediksi
  tanpa qty pemakaian).
- `migration-meta/PANDUAN-COMPOSE-HOST.md` — adopsi Compose host.

Ringkas per 2026-11-19:

- Commit terakhir POS: **`2a72351`** di `taqim2609/GrandPosoptima` `main`
  (HPP nota, view vision nyata, COGS snapshot, Compose host).
- Suite: `node run-tests.js --fast` → **30 passed, 0 failed, 2 skipped**.
- Live: `/api/health` 200, bundle `main.49e6eb94.js`, OTA
  `2.10.20261119160316`.
- Data POS: 43 order, 407 produk, 0 nota, 0 pembelian; HPP baru terisi setelah
  nota pertama diinput pemilik.
- Dokumen `migration-meta/` dan `HANDOVER.md` sudah masuk repo di commit
  `b8a3304`; PIN, telepon outlet, dan nomor penerima WA disamarkan sebelum
  push. `backend-landing-page` masih di luar repo.
