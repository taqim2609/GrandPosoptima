# Laporan Hasil Audit dan Perbaikan GrandPOS POS Engine (Node.js/Express & React)

**Tanggal:** 1 November 2026 (WIB)  
**Host:** gudang-644 (Tailscale IP: 100.117.186.13) & Pi Kasir (100.109.98.56)  
**Komponen:** P1A (`grandpos_web_app`:3000), Frontend React (CRA + Craco), Landing Page (`/var/www/landing`)

---

## 1. Ringkasan Eksekutif

Audit menyeluruh atas `pos-engine` mencakup backend Express (`api-server.js`), frontend React, skrip keamanan, dan installer. Seluruh perbaikan telah diuji dengan suite regresi negatif (*negative control*) yang membuktikan setiap test benar-benar menggigit (*discriminating*), serta diverifikasi langsung pada container produksi.

---

## 2. Rincian Masalah yang Ditemukan dan Solusinya

### A. P0-B & P2: Otoritas Harga di Sisi Server (Server-Authoritative Pricing)
- **Masalah:** Endpoint `POST /api/orders` dan `PATCH /api/orders/:id/items` sebelumnya menerima `subtotal`, `total`, dan `discount` kiriman dari klien. Klien (browser) dapat memanipulasi harga jual atau total tagihan.
- **Perbaikan:**
  - Harga satuan (`price`) dan HPP (`cost`) diambil ulang secara paksa dari katalog `db.products`.
  - Diskon dihitung server dari `discount_type` dan `discount_value` (persen dibatasi ketat 0–100, nominal dibatasi maksimal subtotal).
  - Nilai `subtotal` dan `total` kiriman klien diabaikan sepenuhnya.
  - Endpoint `PATCH /api/orders/:id/items` menghitung ulang rantai `subtotal → discount → service → total` dan menolak (HTTP 400) jika shift kasir belum dibuka.
  - Regression guard ditambahkan di `tests/fix05-server-authority.js` (13 assertion).

### B. Kebocoran Token API di Bundle Frontend
- **Masalah:** Terdapat token literal `X-Gak-Token: gak_rpt_...` yang tertanam langsung di source frontend (`Login.jsx`, `Diagnostik.jsx`, `HybridSyncDiagnosticPanel.jsx`), sehingga ikut ter-bundle ke browser publik.
- **Perbaikan:**
  - Seluruh token literal dihapus dan diganti dengan helper `authHeaders()` di `lib/api.js` yang membaca token dari `localStorage` (`gak_token`).
  - Verifikasi: `grep -rn "gak_rpt" project/frontend/src api-server.js routes/` mengembalikan hasil kosong.

### C. P1-D: Rotasi `JWT_SECRET` Per-Deployment
- **Masalah:** Skrip installer (`scripts/install-vps-one-click.sh` dan `project/scripts/install-vps-one-click.sh`) menulis `JWT_SECRET` literal yang sama untuk setiap instalasi.
- **Perbaikan:**
  - Installer sekarang men-generate secret acak 64-hex menggunakan `openssl rand -hex 32` (fallback `/dev/urandom`).
  - Hanya menulis ulang `.env` jika masih berisi secret publik lama, sekaligus merotasi nilai lama tersebut.
  - Runtime `api-server.js` bersifat *fail-closed* (`process.exit(1)` jika `JWT_SECRET` kosong).

### D. P2: Probe Sinkronisasi Palsu (False-Green Sync)
- **Masalah:** `testSyncConnection()` di `lib/sync.js` selalu mengembalikan `{ ok: true }` tanpa melakukan pemeriksaan nyata. Komponen `VisualSyncStatus.jsx` juga menampilkan latensi palsu.
- **Perbaikan:**
  - `testSyncConnection()` sekarang melakukan probe HTTP nyata, memeriksa flag kesehatan payload, dan mengembalikan pesan `error` yang informatif.
  - Toast status hanya menampilkan latensi jika nilainya benar-benar ada (`res.latencyMs`).

### E. P2: Penghapusan Data Fiktif pada Laporan (Fabricated Data)
- **Masalah:** Beberapa laporan mengembalikan angka hardcoded yang tidak berasal dari ledger:
  - `top_products` fallback (12 unit, margin 45%).
  - `category_report` menggunakan rasio tetap `fnb × 0.6` dan `retail × 0.4`.
  - `chart_data` menggunakan minggu tetap `2026-09-1x`.
  - `/api/reports/profit` mengembalikan `{ revenue: 131000, cogs: 72000, margin: 45 }`.
  - Bagi hasil kas 70/30 (fnb/retail) pada `shifts/close`.
- **Perbaikan:**
  - `top_products` dihitung dari `product_sales` nyata.
  - `category_report` diagregasi per kategori dari data penjualan aktual.
  - `chart_data` menggunakan fungsi baru `buildDailySeries(targetDate, 7)`.
  - `/api/reports/range` dan `/api/reports/profit` diturunkan dari ledger sebenarnya.
  - Pembagian kas 70/30 dihapus, diganti perhitungan kas aktual per channel (`cash_sales_fnb` dan `cash_sales_retail`).

### F. P2: Endpoint WhatsApp yang Tidak Ada (404)
- **Masalah:** Halaman UI `WhatsApp.jsx` memanggil endpoint inbox yang belum diimplementasikan di backend, menghasilkan error 404.
- **Perbaikan:**
  - Ditambahkan store in-memory `waChatStore()` (batas 500 pesan) dan 4 endpoint: `GET /api/whatsapp/chats`, `GET /api/whatsapp/hermes/status`, `GET /api/whatsapp/chats/:phone/messages`, `POST /api/whatsapp/chats/:phone/send`.
  - Webhook inbound merekam pesan masuk via `waRecordMessage({ direction: 'in' })` sebelum filter kata kunci reservasi.

### G. Perbaikan Suite Regresi yang Berhenti Menggigit (Regression Suite Rot)
- **Masalah:** Tiga suite regresi hijau tetapi tidak lagi membuktikan apa pun:
  - `fix01-negative-control.js` menggunakan `HEAD` sebagai baseline, sehingga setelah fix di-commit, HEAD == working tree dan test tidak bisa gagal.
  - `fix02-negative-control.js` menguji literal `"Rp "` yang sudah dikonsolidasi.
  - `security-regression-test.js` menguji route landing-page yang sudah dipindahkan ke FastAPI.
- **Perbaikan:**
  - `fix01-negative-control.js` di-pin ke SHA pra-fix eksplisit (`8de8958`) via env `FIX01_BASELINE` → **9/9**.
  - `fix02-negative-control.js` diperbarui ke kontrak `rupiah()` → **17/17**.
  - `security-regression-test.js` diperbarui menghapus route yang sudah pindah → **78/78**.

---

## 3. Hasil Verifikasi Pengujian

| Pengujian | Status | Rincian |
|---|---|---|
| **Node Syntax Check** | **PASS** | `node --check api-server.js` bersih |
| **fix01-regression.js** | **PASS** | 19/19 assertion |
| **fix01-negative-control.js** | **PASS** | 9/9 discriminating (baseline `8de8958`) |
| **fix02-contract.js** | **PASS** | 29/29 assertion |
| **fix02-negative-control.js** | **PASS** | 17/17 discriminating |
| **fix05-server-authority.js** | **PASS** | 13/13 assertion |
| **security-regression-test.js** | **PASS** | 78/78 assertion |
| **security-verify-routes.js** | **PASS** | 15/15 route terverifikasi |
| **Jest (Frontend)** | **PASS** | 2 suites, 3 tests |
| **ESLint (`check:undef` + JSX)** | **PASS** | 0 error, tidak ada identifier JSX tak terdefinisi |
| **Craco Build** | **PASS** | Exit 0, bundle `main.240c5d6d.js` (2.25 MB) |
| **P1A Health Endpoint** | **PASS** | HTTP 200 pada `:3000/api/health` |
| **Landing Page Live** | **PASS** | HTTP 200, menyajikan bundle terbaru |

---

## 4. Catatan Deployment

- **Nginx Landing:** Build frontend disalin ke `/var/www/landing/` (mempertahankan direktori `assets/` milik landing page terpisah). Nginx di-reload (`systemctl reload nginx`, bukan restart) untuk menghindari downtime.
- **Backup:** Backup landing page lama tersimpan di `/root/backup-landing-20261101-005135.tar.gz`.
- **Watchtower:** Service `grandpos-app` di `deploy/docker-compose-p1a.yml` diberi label `com.centurylinklabs.watchtower.enable=false` agar tidak di-recreate otomatis oleh watchtower di tengah jam operasional kasir.
