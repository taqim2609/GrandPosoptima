# Panduan Multi-Node POS: PC Master + Raspberry Pi Kasir + Evolution API + AI Studio (Tailscale)

Panduan ini mengatur sistem POS restoran Grand Aceh Kuliner dengan arsitektur **Hybrid Multi-Node**:
- **Komputer PC**: Server Utama (Master), Database (MongoDB), dan Evolution API WhatsApp Gateway.
- **Raspberry Pi**: Terminal Kasir POS (Layar Sentuh & Printer Kasir) — terhubung ke PC.
- **AI Studio / Google Cloud**: Server Backup & Dashboard Cloud — terhubung ke PC.
- **Jaringan Penghubung**: **Tailscale** (Mesh VPN terenkripsi, 100% gratis, aman tanpa port forwarding router).

---

## 1. Skema Topologi Jaringan

```
                     ┌────────────────────────────────────────┐
                     │          AI STUDIO / CLOUD             │
                     │  (Cloud Dashboard & AI Analytics)      │
                     │  Tailscale IP: 100.x.y.3               │
                     └──────────────────┬─────────────────────┘
                                        │ (Tailscale Encrypted Mesh)
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                       KOMPUTER PC (SERVER UTAMA)                            │
│  - Database MongoDB (Pusat Data)                                            │
│  - Backend POS API Server (:80 / :3000)                                     │
│  - Evolution API WhatsApp Hub (:8080)                                       │
│  - Tailscale IP: 100.80.10.1 (Hostname: grandpos-pc-master)                 │
└───────────────────────────────────────▲─────────────────────────────────────┘
                                        │ (Jaringan Tailscale / LAN)
                                        ▼
                     ┌────────────────────────────────────────┐
                     │          RASPBERRY PI KASIR            │
                     │  - Antarmuka Layar Sentuh Kasir POS    │
                     │  - Printer Thermal Kasir Lokal         │
                     │  - Tailscale IP: 100.80.10.2           │
                     └────────────────────────────────────────┘
```

---

## 2. Langkah 1: Setup Komputer PC (Server Utama & Evolution API)

### A. Windows:
1. Pasang **Tailscale untuk Windows** dari [tailscale.com/download](https://tailscale.com/download) dan login dengan akun Google/email Anda.
2. Pasang & buka **Docker Desktop**.
3. Buka folder project di PC, lalu klik dua kali file:
   ```cmd
   setup-pc-master.bat
   ```
4. Catat **IP Tailscale PC** yang muncul di layar (misal: `100.80.10.1`).

### B. Linux (Ubuntu / Debian):
1. Buka terminal di folder project dan jalankan:
   ```bash
   chmod +x setup-pc-master.sh
   ./setup-pc-master.sh
   ```
2. Catat **IP Tailscale PC** yang dihasilkan.

---

## 3. Langkah 2: Setup Raspberry Pi (Terminal Kasir)

Raspberry Pi hanya bertindak sebagai terminal kasir yang ringan dan cepat:

1. Pastikan Raspberry Pi terhubung ke internet (WiFi atau kabel LAN).
2. Jalankan skrip setup di terminal Raspberry Pi:
   ```bash
   chmod +x setup-pi-client.sh
   ./setup-pi-client.sh
   ```
3. Saat diminta, masukkan **IP Tailscale PC Master** yang didapatkan pada Langkah 1 (contoh: `100.80.10.1`).
4. Selesai! Raspberry Pi akan secara otomatis membuka tampilan Kasir POS dalam mode Kiosk layar penuh mengarah ke PC Master.

---

## 4. Langkah 3: Menghubungkan Evolution API WhatsApp

WhatsApp Gateway berjalan langsung di dalam PC Master pada port `8080`:

1. Buka aplikasi POS (dari browser PC atau Raspberry Pi).
2. Masuk ke menu **Pengaturan → WhatsApp**.
3. Konfigurasikan URL Gateway:
   - **URL Server:** `http://100.80.10.1:8080` (Ganti dengan IP Tailscale PC Anda)
   - **API Key:** `grandpos_evolution_secret_2026` (atau sesuai konfigurasi di `.env`)
4. Klik **Test Koneksi** & klik **Generate QR Code** untuk menghubungkan nomor WhatsApp kasir toko.
5. Indikator di Header POS akan langsung menyala hijau: **`WA Gateway Aktif`**.

---

## 5. Langkah 4: Menghubungkan AI Studio / Cloud ke PC Master

Jika ingin AI Studio di cloud mengakses database & API PC Master:

1. Di Komputer PC, aktifkan **Tailscale Funnel / Serve**:
   ```bash
   tailscale funnel 80 on
   # atau jika menggunakan port 3000:
   tailscale funnel 3000 on
   ```
2. Tailscale akan memberikan alamat publik HTTPS gratis, contoh:
   `https://grandpos-pc-master.tail12345.ts.net`
3. Masukkan alamat URL ini pada pengaturan sinkronisasi AI Studio.

---

## 6. Ringkasan File & Perintah

| File | Lokasi Eksekusi | Deskripsi |
| :--- | :--- | :--- |
| `docker-compose.pc-master.yml` | PC Master | Konfigurasi Docker: MongoDB + Backend + Frontend + Evolution API |
| `setup-pc-master.bat` | PC (Windows) | Skrip otomatisasi setup PC Master Windows |
| `setup-pc-master.sh` | PC (Linux) | Skrip otomatisasi setup PC Master Linux |
| `setup-pi-client.sh` | Raspberry Pi | Skrip otomatisasi terminal kasir & kiosk browser |

Semua transaksi kasir dari Raspberry Pi akan tersimpan terpusat di PC Master, dan struk WhatsApp otomatis terkirim dari Evolution API yang berjalan di PC Master.
