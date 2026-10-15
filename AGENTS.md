# Agent Rules — Grand Aceh Kuliner POS & Planora Framework

These instructions define the operational rules and architecture for the Grand Aceh Kuliner POS repository, managed under the Planora specification framework.

---

## 1. Think and Classify Before Acting

Before starting any work, use the strongest reasoning capabilities available and think carefully about the request. Identify and communicate a concise, natural-language classification of the user's intent. Determine:
- Whether the request is an explanation, review, diagnosis, implementation, or operational task.
- Whether the user wants maintenance, a refactor, a new feature, or a bug fix.
- Which areas may be affected, such as frontend, UI/UX, backend, data, infrastructure, tooling, tests, or documentation.
- Whether the request requires a third-party service, external API, dependency, account, credential, deployment, or other side effect.
- Which explicitly requested or installed skills and workflows apply.

Use this classification to select the workflow and validation strategy before taking action. Keep private chain-of-thought private; communicate only the classification, assumptions, plan, evidence, and conclusions the user needs.
Work as a careful, autonomous coding agent. Infer intent from the request and repository context, make reasonable and reversible assumptions, and carry authorized work through validation. Ask a question only when a missing decision would materially change the result, requires new authority, or creates significant risk.

---

## 2. Skills First & Planora Workflow

This repository bundles Planora and execution skills under `.agents/skills/` and `.claude/skills/`. Verify availability before invoking a skill:
- **`planora-product-kit`**: Create or maintain product planning packages (`.planora/` with PRD, UI, DX, and EXECUTION).
- **`planora-status`**: Inspect the product package and report execution progress, blockers, and next dependency-ready tasks.
- **`planora-next`**: Execute exactly one dependency-ready item from `.planora/EXECUTION/TODO.md`.
- **`planora-change`**: Add or revise intentional product behavior in an existing Planora package.
- **`feature`**: Plan and implement a new product feature in an existing application.
- **`bug`**: Diagnose, reproduce, and repair incorrect behavior.
- **`chore`**: Maintain, refactor, configure, or edit without intentionally adding product behavior.
- **`ui-design`**: Apply UI contracts, responsive layout, and visual design using shadcn and Tailwind.
- **`ui-review`**: Review frontend changes against UI contracts, accessibility, and responsive viewports.
- **`e2e-tester`**: Execute browser-based user journeys.

---

## 3. Sistem & Arsitektur: Grand Aceh Kuliner POS

Grand Aceh Kuliner POS adalah sistem Point of Sale hybrid untuk F&B (Restoran/Rumah Makan Aceh) dan Retail (Kelontong), serta produk Titipan Vendor bagi hasil.

### Arsitektur Inti:
```
Browser / APK Android (React 19) ──► Nginx ──► FastAPI (Python/Motor) ──► MongoDB (4.4+)
      (Capacitor + Capgo OTA)                     │
                                                  └── Static Web Build
```
- **Backend**: FastAPI + Motor (Async MongoDB), JWT auth, bcrypt. Route prefix selalu `/api`.
- **Frontend**: React 19, CRACO, Tailwind CSS, shadcn/Radix UI, Lucide icons.
- **Mobile/Hardware**: Android Capacitor 6 dengan Sunmi T2 SDK bridge (Thermal printer & cash drawer `openDrawer`), Bluetooth ESC/POS, Capgo OTA Updater.
- **Deploy**: Docker Compose di Raspberry Pi 3/4 & Windows PC master, sinkronisasi backup VPS & Cloud.

---

## 4. Konvensi & Aturan Emas (Golden Rules — JANGAN DILANGGAR)

1. **JANGAN refactor `OfflineContext.jsx`** — merusak antrean sinkronisasi offline IndexedDB yang sudah idempoten.
2. **JANGAN aktifkan service worker `sw.js`** — menimbulkan konflik cache fatal dengan Capgo OTA.
3. **JANGAN hapus polyfill `<script src="%PUBLIC_URL%/polyfills.js">`** dari `public/index.html` — diperlukan untuk webview Android 7 lama.
4. **JANGAN tambah `import()` dinamis atau chunk splitting async** di frontend — CRACO dikonfigurasi single-bundle agar kompatibel dengan Sunmi Android 7.
5. **JANGAN bocorkan kode teknis** (`SCR-*`, `*-FR-*`, `*-AC-*`, `TASK-*`, `Fase *`, internal doc path `.md`) ke teks antarmuka pengguna (UI label, tombol, badge, notifikasi). Kode teknis hanya milik file spesifikasi dan pengujian.
6. **Selalu gunakan icon Lucide (bukan emoji)** di elemen desain UI aplikasi.
7. **Semua endpoint backend prefix `/api`** dengan Pydantic body model dan RBAC via `Depends(get_current_user)`.
8. **Nilai mata uang (Rupiah)** disimpan dalam format float/bulat dengan pembulatan `round(..., 2)`.

---

## 5. Aturan Bisnis Utama (Kunci Logika Transaksi & Kasir)

- **F&B vs Retail**: Transaksi F&B (dine-in dengan meja / take-away) dan Retail tidak dicampur dalam satu order.
- **Jual Per Berat**: Satuan berat (ons/kg); `harga = base_price × berat`, HPP & bagian vendor ikut skala berat secara proporsional.
- **Diskon**: Diskon diskalakan maksimal 100%; diskon TIDAK memotong HPP dan TIDAK memotong bagian vendor (diskon ditanggung penuh oleh outlet). Alasan diskon wajib jika melebihi ambang batas pengaturan bisnis.
- **Titipan Vendor (Satu Pintu)**: Nominal bagian vendor yang dibayarkan saat tutup shift otomatis mencatat dokumen `vendor_settlements` (`source="shift_close"`) dan `cash_movements` (kategori "Bagi Hasil Vendor"), sehingga memotong kas shift tanpa double-deduction.
- **Poin & Kupon**: Kupon dan poin member dipotong dan di-award HANYA saat status order lunas (`_finalize_payment`), dan dibalikkan (*revert*) secara atomik saat void/refund.
- **Uang Bersih Shift**: `net_cash_fnb = fnb_total - out_fnb`, `net_cash_retail = retail_total - out_retail`, dihitung ulang saat penutupan shift kasir.

---

## 6. Testing & Validasi

Setiap penambahan atau perubahan fitur/perbaikan bug wajib diverifikasi:
- **Unit & Logika**: Pastikan fungsi perhitungan harga, bobot, diskon, dan sanitasi input lolos uji batas.
- **Build Verification**: Pastikan backend syntax valid dan frontend dapat di-build tanpa error (`npm run build`).
- **Planora Traceability**: Pastikan setiap task di `.planora/EXECUTION/TODO.md` memiliki bukti (*evidence*) dan kriteria penerimaan yang jelas.

---

## 7. Planora Documentation Structure

Dokumentasi dan perencanaan proyek berada di `.planora/`:
- `.planora/PRD/`: Spesifikasi kebutuhan produk dan modul fitur terstandarisasi.
- `.planora/UI/`: Panduan desain antarmuka kasir, POS layar sentuh, dan komponen.
- `.planora/DX/`: Panduan setup Docker, deployment Pi/Windows, dan bridging hardware.
- `.planora/EXECUTION/TODO.md`: Buku besar pelacakan tugas hidup (*live TODO ledger*).

---

## 8. Pemeliharaan Indeks Berkas (INDEX-BERKAS.md)

- Setiap kali ada penambahan berkas baru (file baru di backend, frontend, dokumen, skrip, atau pengujian), agen **wajib** memperbarui katalog berkas `INDEX-BERKAS.md`.
- Pembaruan dapat dijalankan secara instan dengan mengeksekusi:
  ```bash
  python3 project/scripts/update_file_index.py
  ```
- Menjamin seluruh inventaris berkas sistem Grand Aceh Kuliner POS selalu sinkron dan transparan.

