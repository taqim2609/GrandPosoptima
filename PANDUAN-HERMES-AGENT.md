# Panduan Integrasi Hermes Agent (Nous Research) dengan Grand Aceh Kuliner POS

Dokumen ini berisi panduan resmi terpadu untuk mengintegrasikan **Hermes Agent** (Nous Research) ke dalam sistem **Grand Aceh Kuliner POS**.

Integrasi ini mencakup dua jalur operasional:
1. **Jalur 1: AI Brain / Asisten POS (OpenAI-Compatible REST API)** — Menghubungkan kasir dan owner ke kecerdasan buatan Hermes untuk analisis penjualan, ringkasan shift, rekomendasi resep & stok, serta percakapan multi-turn.
2. **Jalur 2: WhatsApp Gateway & Perintah 2-Arah (Baileys + Webhook HMAC V2)** — Mengirimkan struk/laporan otomatis ke WhatsApp pelanggan/owner dan menerima perintah interaktif (`/stok`, `/laporan-shift`, `/dashboard`).

---

## 1. Arsitektur & Jalur Komunikasi

```
┌────────────────────────────────────────────────────────┐
│             Kasir / Tablet / Terminal POS              │
│                 (Web Browser / APK Android)            │
└──────────────┬──────────────────────────┬──────────────┘
               │                          │
               ▼                          ▼
   [Jalur 1: Asisten AI]       [Jalur 2: Notifikasi & Struk WA]
               │                          │
               ▼                          ▼
┌────────────────────────────────────────────────────────┐
│            Backend POS (Node.js Express / FastAPI)     │
│   - Mengelola konteks transaksi, shift & stok real-time│
│   - Mengantre pesan outbox idempoten (anti duplikasi)  │
└──────────────┬──────────────────────────┬──────────────┘
               │                          │
      (HTTP POST /v1/chat)       (HTTP POST HMAC V2)
               │                          │
               ▼                          ▼
┌────────────────────────────────────────────────────────┐
│              Server VPS Hermes Agent                   │
│                                                        │
│  ▶ Port 8000: API Server Gateway (OpenAI-Compatible)   │
│    Endpoint: /v1/chat/completions                      │
│                                                        │
│  ▶ Port 8644: Webhook Outbox Delivery Adapter          │
│    Route: /webhooks/grandpos-outbox                    │
│                                                        │
│  ▶ Plugin: grandpos-wa-inbound                         │
│    Hook: pre_gateway_dispatch (zero LLM token)         │
└────────────────────────────────────────────────────────┘
```

---

## 2. Persiapan di Server VPS (Hermes Agent)

### A. Aktifkan API Server Gateway (Mode AI Brain)
Edit file environment Hermes di VPS Anda (`~/.hermes/.env`):

```ini
API_SERVER_ENABLED=true
API_SERVER_PORT=8000
API_SERVER_KEY=hermes_gak_pos_secret_key_2026
```

Jalankan gateway:
```bash
hermes gateway
```

> **Verifikasi Jalur 1**: Uji dari terminal VPS untuk memastikan Hermes Agent merespons:
```bash
curl http://localhost:8000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer hermes_gak_pos_secret_key_2026" \
  -d '{
    "model": "hermes-agent",
    "messages": [{"role": "user", "content": "Halo Hermes, tes integrasi POS Grand Aceh"}]
  }'
```

---

## 3. Konfigurasi di Aplikasi POS (Asisten AI)

1. Buka aplikasi POS, masuk sebagai **Super Admin / Owner**.
2. Buka menu **Pengaturan** → **Pengaturan AI** (`/settings-ai`).
3. Pada kartu fitur (misalnya **Asisten Admin AI**, **Deskripsi Produk**, atau **Analisis Laporan**):
   - **Penyedia (Provider)**: Klik tombol **OpenAI / Hermes (VPS)**.
   - **Base URL**: Masukkan URL Hermes Gateway Anda, atau klik preset **+ Pakai Hermes Gateway**:
     - Via Tailscale Mesh (Rekomendasi Aman): `http://100.x.y.z:8000/v1`
     - Via Public Domain / Reverse Proxy: `https://hermes.tokoanda.com/v1`
   - **Model Name**: Isi `hermes-agent` (atau profil khusus restoran seperti `pos-analyst`).
   - **API Key**: Masukkan `hermes_gak_pos_secret_key_2026` (sesuai `API_SERVER_KEY` di VPS).
4. Klik **Simpan**.
5. Buka menu **Asisten AI** (`/assistant-ai`) dan ajukan pertanyaan seperti:
   - *"Berapa total omzet penjualan hari ini?"*
   - *"Ada stok bahan baku yang menipis?"*
   - Asisten akan merespons langsung menggunakan penalaran model Hermes dengan data kontekstual POS real-time.

---

## 4. Pembuatan Bot Profile Khusus POS di Hermes (*Bot Mode*)

Dalam Hermes Agent, Anda dapat membuat profil bot khusus restoran untuk kepribadian analisis bisnis:

```bash
# Buat profil bot baru khusus POS
hermes profile create pos-analyst
```

Atur System Prompt profil `pos-analyst` di `~/.hermes/profiles/pos-analyst/prompt.txt`:
> *"Kamu adalah Asisten Eksekutif Restoran Grand Aceh Kuliner di Banda Aceh. Kamu menguasai analisis penjualan makanan F&B dan produk retail, margin laba kotor, pengelolaan stok bahan dapur (beras, bumbu kari, kopi, daging ayam), serta efisiensi shift kasir."*

Di **Pengaturan AI** pada POS, isi **Model Name**: `pos-analyst`.

---

## 5. Integrasi WhatsApp 2-Arah via Hermes Gateway (*WhatsApp Mode*)

Untuk menjadikan Hermes Gateway sebagai pengirim struk WhatsApp dan penerima perintah:

### 5.1 Pasang WhatsApp di Hermes VPS
```bash
hermes whatsapp
```
Pindai QR dengan nomor bot WhatsApp khusus restoran (bukan nomor pribadi).

### 5.2 Pasang Plugin Pesan Masuk (`grandpos-wa-inbound`)
Salin plugin dari repositori POS ke direktori plugin Hermes:
```bash
mkdir -p ~/.hermes/plugins/grandpos-wa-inbound
cp -a project/hermes-integration/grandpos-wa-inbound/. ~/.hermes/plugins/grandpos-wa-inbound/
```
Konfigurasi environment plugin:
```bash
export WA_WEBHOOK_SECRET=rahasia_hmac_pos_2026
export GRANDPOS_WEBHOOK_URL=http://127.0.0.1:8001/api/webhook/whatsapp
```

### 5.3 Konfigurasi Outbound Route di `~/.hermes/config.yaml`
```yaml
platforms:
  webhook:
    enabled: true
    extra:
      host: "127.0.0.1"
      port: 8644
      secret: "rahasia_hmac_pos_2026"
      routes:
        grandpos-outbox:
          secret: "rahasia_hmac_pos_2026"
          prompt: "{message}"
          deliver: whatsapp
          deliver_only: true
          deliver_extra:
            chat_id: "{to}"
```

### 5.4 Perintah Interaktif yang Didukung
Pengguna kasir/admin yang nomor teleponnya terdaftar di database POS dapat mengirim perintah WhatsApp langsung ke bot:
- `/stok` — Menampilkan daftar produk & bahan baku di bawah batas minimum.
- `/laporan-shift` — Ringkasan total transaksi dan omzet shift hari ini.
- `/dashboard` — Statistik omzet, rata-rata belanja, dan bill terbuka.

---

## 6. Verifikasi & Diagnostik Sistem

Untuk memverifikasi bahwa integrasi berjalan sempurna:
1. Buka menu **Pengaturan** → **WhatsApp Gateway** (`/whatsapp`):
   - Status kartu menampilkan **Hermes Gateway (Baileys)**.
   - Indikator bridge & antrean outbox terpantau aktif tanpa error.
2. Jalankan uji otomatis di terminal repo:
   ```bash
   python3 project/tests/test_hermes_bridge.py           # 22/22 lulus
   python3 project/tests/test_wa_provider_migration.py   # 3/3 lulus
   python3 project/tests/test_hermes_plugin_inbound.py   # 8/8 lulus
   python3 project/tests/test_hermes_wa_e2e.py           # 5/5 lulus
   ```
   *Total 38/38 pengujian otomatis terverifikasi lulus 100%.*
