# Panduan Koding & Pemeliharaan Kode untuk Hermes Agent AI

Dokumen panduan resmi ini dirancang khusus agar **Hermes Agent AI** (Nous Research) memahami arsitektur, konvensi koding, aturan bisnis, dan tata cara memodifikasi kode repositori **Grand Aceh Kuliner POS** tanpa merusak integritas sistem kasir dan perangkat keras.

---

## 1. Identitas & Arsitektur Sistem

Grand Aceh Kuliner POS adalah sistem kasir Point of Sale hybrid untuk restoran khas Aceh (F&B), toko oleh-oleh/kelontong (Retail), serta konsinyasi titipan vendor bagi hasil.

### Topologi Server Terpisah:
```
┌──────────────────────────────────────┐     ┌──────────────────────────────────────┐
│        LAYANAN FRONTEND              │     │         LAYANAN BACKEND              │
│   • Host: Port 3000 (Vite / Express) │     │   • Host: Port 8000                  │
│   • Framework: React 19 + Tailwind   │     │   • Framework: Rust Axum 0.8         │
│   • Client: Web POS + Android APK    │◄───►│     (atau FastAPI / Node bridge)     │
│   • Sunmi T2 SDK bridge              │REST │   • Database: MongoDB & SQLite Edge  │
│   • IndexedDB Offline Queue          │API  │   • fixed-point decimal Rupiah math  │
└──────────────────────────────────────┘     └──────────────────────────────────────┘
                                                ▲
                                                │ Webhook HMAC SHA256
                                                ▼
                                     ┌──────────────────────────────────────┐
                                     │         HERMES AGENT AI              │
                                     │   • VPS Port 8000: /v1/chat          │
                                     │   • WhatsApp Bot Gateway (Baileys)   │
                                     │   • Analisis Omzet & Alarm Stok      │
                                     └──────────────────────────────────────┘
```

---

## 2. Aturan Emas (Golden Rules — MUTLAK JANGAN DILANGGAR)

1. **JANGAN PERNAH refactor `OfflineContext.jsx` atau `src/lib/offlineQueue.js`**: Antrean offline IndexedDB sudah diuji idempoten menggunakan `client_ref`. Refactor sembarangan akan menyebabkan duplikasi transaksi saat jaringan pulih.
2. **JANGAN aktifkan service worker `sw.js`**: Service worker menyebabkan caching agresif yang merusak sistem pembaruan otomatis Capgo OTA pada perangkat Sunmi Android.
3. **JANGAN hapus polyfill `<script src="%PUBLIC_URL%/polyfills.js">` dari `public/index.html`**: Diperlukan untuk kompatibilitas WebView Android 7 lama pada perangkat Sunmi T2.
4. **JANGAN gunakan dynamic `import()` atau asynchronous code-splitting** di frontend: Konfigurasi CRACO/Vite dipasang single-bundle agar kompatibel dengan runtime Android lama.
5. **JANGAN bocorkan kode teknis ke antarmuka pengguna**: Kode seperti `[SCR-*]`, `*-FR-*`, `*-AC-*`, `TASK-*`, `Fase *`, atau path file `.md` dilarang keras tampil di teks label UI, tombol, modal, atau struk kasir.
6. **Selalu gunakan icon dari `lucide-react`**: Jangan gunakan emoji langsung pada elemen tombol atau navigasi antarmuka.
7. **Pemisahan Mutlak F&B vs Retail**: Transaksi meja/dine-in/take-away F&B dan produk Retail TIDAK BOLEH digabung dalam satu lembar struk/order.
8. **Nilai Rupiah & Perhitungan Berat**:
   - Selalu hitung `harga = base_price * berat`.
   - HPP dan bagian vendor ikut skala berat secara proporsional.
   - Diskon ditanggung penuh oleh outlet (TIDAK memotong HPP dan TIDAK memotong bagian vendor).

---

## 3. Alur Kerja Modifikasi Kode oleh Agen Hermes

Ketika agen AI menerima instruksi modifikasi atau penambahan fitur:

### Langkah 1: Smart Read-Before-Write
- Selalu periksa dan baca berkas target menggunakan tool pembaca file sebelum melakukan perubahan (`replace_file_content` atau `write_to_file`).
- Jangan menebak isi file jika file tersebut sudah ada di repositori.

### Langkah 2: Pertahankan Pemisahan Server
- Frontend hanya berkomunikasi dengan backend via rute `/api/*`.
- Jangan pernah menyematkan database internal atau credential rahasia di dalam kode komponen React (`src/`).
- Jika menambahkan rute backend baru, daftarkan di controller backend dan perbarui antarmuka DTO.

### Langkah 3: Verifikasi Kompilasi & Build
- Setelah melakukan perubahan pada file frontend/backend, selalu jalankan verifikasi build:
  ```bash
  npm run build
  ```
- Pastikan tidak ada syntax error, unresolved imports, atau TypeScript error.

### Langkah 4: Pembaruan Otomatis Indeks Berkas (Wajib)
Setiap kali ada penambahan berkas baru (file skrip, endpoint, halaman baru, atau dokumentasi), agen Hermes **wajib** memperbarui katalog berkas repositori dengan mengeksekusi:
```bash
python3 project/scripts/update_file_index.py
```
Perintah ini akan menyinkronkan seluruh daftar berkas di `INDEX-BERKAS.md` secara transparan.

---

## 4. Panduan Menangani Perubahan Khusus

### A. Menambahkan Endpoint API Baru
1. Definisikan route dengan prefix `/api/<modul>` pada backend.
2. Gunakan middleware autentikasi JWT token guard (`Depends(get_current_user)` di Python atau `Claims` extractor di Rust).
3. Buat fungsi helper pemanggil di frontend pada `src/lib/api.js`.
4. Jika endpoint berkaitan dengan pembayaran, sertakan verifikasi idempotency key.

### B. Integrasi Webhook WhatsApp 2-Arah Hermes
- Webhook dari gateway WhatsApp mengirim payload terenkripsi/ditandatangani dengan header:
  `X-Hub-Signature-256: sha256=<hmac_hash>`
- Rumus verifikasi signature:
  `HMAC_SHA256(raw_body, WHATSAPP_WEBHOOK_SECRET)`
- Perintah pesan masuk:
  - `/stok` -> Mengembalikan daftar bahan yang berada di bawah `min_stock`.
  - `/omzet` -> Mengembalikan ringkasan omzet F&B dan Retail hari ini.
  - `/laporan-shift` -> Mengembalikan rincian shift kasir yang sedang aktif.

---

## 5. Template Prompt Instruksi untuk Agen Hermes (System Context)

Salin konfigurasi berikut sebagai referensi sistem saat menginstruksikan Hermes Agent:

```yaml
role: "Senior Full-Stack Engineer & Core Maintainer"
project: "Grand Aceh Kuliner POS"
current_version: "3.0.0"
runtime:
  frontend: "React 19, Tailwind CSS, Lucide Icons, Single-Bundle CRACO/Vite (Port 3000)"
  backend: "Rust Axum / Python FastAPI (Port 8000)"
  hardware: "Sunmi T2 ESC/POS Thermal 80mm/58mm, Auto Cash Drawer"
golden_rules:
  - "No refactoring OfflineContext.jsx"
  - "No enabling sw.js"
  - "Keep polyfills.js in public/index.html"
  - "No technical requirement codes in user UI"
  - "Strict separation between FnB and Retail orders"
  - "Always run python3 project/scripts/update_file_index.py after creating files"
```
