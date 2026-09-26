# Panduan Panduan Migrasi Grand Aceh Kuliner POS ke Server VPS + n8n 1.110.1

Dokumen ini berisi panduan langkah demi langkah untuk memindahkan (deploy) aplikasi **Grand Aceh Kuliner POS** beserta **Evolution API (WhatsApp Gateway)** dan **n8n Automation Engine (v1.110.1)** ke Server VPS (Cloud) dengan HTTPS/SSL otomatis.

---

## 🏗️ Arsitektur Sistem di VPS

```
                          ┌──────────────────────────┐
                          │   INTERNET / PELANGGAN   │
                          └────────────┬─────────────┘
                                       │ HTTPS (Port 80/443)
                                       ▼
                          ┌──────────────────────────┐
                          │    CADDY REVERSE PROXY   │
                          │ (Auto SSL Let's Encrypt) │
                          └─────┬──────────┬───────┬─┘
                                │          │       │
      ┌─────────────────────────┘          │       └─────────────────────────┐
      ▼                                    ▼                                 ▼
┌───────────────────────┐      ┌───────────────────────┐      ┌───────────────────────┐
│     POS FRONTEND      │      │     n8n AUTOMATION    │      │    EVOLUTION API      │
│     (React + Nginx)   │      │    (v1.110.1 Engine)  │      │  (WhatsApp Gateway)   │
│ pos.domainanda.com    │      │  n8n.domainanda.com   │      │   wa.domainanda.com   │
└──────────┬────────────┘      └──────────┬────────────┘      └───────────────────────┘
           │                              │
           ▼                              ▼
┌───────────────────────┐      ┌───────────────────────┐
│     POS BACKEND       │      │  n8n POSTGRES DB      │
│   (FastAPI Engine)    │      │   (Workflow & Logs)   │
└──────────┬────────────┘      └───────────────────────┘
           │
           ▼
┌───────────────────────┐
│    MONGODB 7.0 DB     │
│  (Database Utama POS) │
└───────────────────────┘
```

---

## 📋 1. Spesifikasi Minimum VPS

| Komponen | Minimum Mutlak | Rekomendasi Nyaman (vpsmurah.co.id) |
| :--- | :--- | :--- |
| **OS** | Ubuntu 22.04 / 24.04 LTS | Ubuntu 24.04 LTS |
| **vCPU** | 2 Core | **2 - 3 Core** |
| **RAM** | 3 GB | **4 GB** (Wajib 4GB agar Evolution API + n8n + Mongo tidak crash) |
| **NVMe Disk** | 30 GB | **35 - 40 GB** |

> **⚠️ PERHATIAN PENTING UNTUK EVOLUTION API & N8N:**
> - Evolution API v2 (WhatsApp Engine) butuh memori RAM ~400-600 MB.
> - n8n v1.110.1 + PostgreSQL butuh RAM ~500-800 MB.
> - MongoDB 7 + Backend POS + OS Ubuntu butuh RAM ~1.5 GB.
> - **Total RAM yang dibutuhkan:** ~3.2 GB - 3.8 GB.
> - **RAM 1 GB di screenshot PASTI CRASH (Out of Memory / OOM Kill) jika menjalankan Evolution API + n8n + POS.**

---

## 🌐 2. Persiapan Subdomain & DNS Record

Sebelum memulai di VPS, arahkan **A Record** domain Anda di Cloudflare / Registrar ke **IP Publik VPS**:

- `pos.domainanda.com` ➔ `123.45.67.89` (IP VPS)
- `n8n.domainanda.com` ➔ `123.45.67.89` (IP VPS)
- `wa.domainanda.com`  ➔ `123.45.67.89` (IP VPS)

*(Catatan: Anda bisa menggunakan 1 domain utama atau IP VPS jika belum memakai domain).*

---

## 🚀 3. Langkah Deploy di VPS (Menggunakan Auto-Script)

Kami telah menyediakannya dalam script otomatis. Masuk ke VPS Anda via SSH:

```bash
# 1. Clone atau Upload folder proyek ini ke VPS Anda
git clone <URL_REPOSITORY_ANDA> /opt/grand-aceh-pos
cd /opt/grand-aceh-pos

# 2. Beri izin eksekusi script installer
chmod +x scripts/setup-vps-n8n.sh

# 3. Jalankan script setup otomatis
./scripts/setup-vps-n8n.sh
```

---

## ⚙️ 4. Langkah Manual (Tandai jika tidak menggunakan Script Otomatis)

Jika Anda ingin melakukan instalasi secara manual step-by-step:

### A. Install Docker & Docker Compose di VPS
```bash
sudo apt-get update
sudo apt-get install -y curl git ufw ca-certificates gnupg

# Install Docker Engine
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
```

### B. Siapkan File Konfigurasi `.env.vps`
```bash
cp .env.vps.example .env.vps
nano .env.vps
```

Isi dan amankan variabel penting berikut di `.env.vps`:
- `DOMAIN_POS`: `pos.domainanda.com`
- `DOMAIN_N8N`: `n8n.domainanda.com`
- `DOMAIN_WA`: `wa.domainanda.com`
- `JWT_SECRET`: Buat kunci rahasia acak panjang
- `N8N_ENCRYPTION_KEY`: Buat kunci rahasia n8n (min. 16 karakter)
- `POSTGRES_PASSWORD`: Password database PostgreSQL n8n

### C. Jalankan Seluruh Container Docker (POS + n8n 1.110.1 + WA + Caddy)
```bash
docker compose -f docker-compose.vps.yml --env-file .env.vps up -d --build
```

Cek status seluruh container:
```bash
docker compose -f docker-compose.vps.yml ps
```

---

## 🔗 5. Konfigurasi n8n v1.110.1 & Hubungkan dengan POS

1. **Akses Dashboard n8n:**
   Buka browser dan navigasi ke `https://n8n.domainanda.com` (atau `http://IP_VPS:5678` jika tanpa domain).
2. **Buat Akun Admin Owner n8n:**
   Isi Nama, Email, dan Password Administrator n8n Anda.
3. **Impor Template Workflow POS:**
   - Di n8n, klik **Workflows** ➔ **Add Workflow** ➔ **Import from File**.
   - Impor workflow yang sudah kami sertakan di folder `n8n-workflows/`:
     - `1-notifikasi-pesanan-whatsapp.json`
     - `2-peringatan-stok-menipis.json`
     - `3-rekap-omset-harian.json`
4. **Aktifkan Webhook POS:**
   - Di n8n, salin URL **Webhook Test / Production** dari node Webhook (misal: `https://n8n.domainanda.com/webhook/pos-order-paid`).
   - Masuk ke aplikasi **Grand Aceh POS** ➔ Buka menu **Pengaturan** ➔ **Fitur & Integrasi**.
   - Aktifkan **Webhook Integrasi**, masukkan URL Webhook n8n Anda, lalu klik **Simpan & Uji Webhook**.

---

## 💾 6. Backup Data Otomatis di VPS

Data penting Anda tersimpan aman di Docker Volume VPS:
- Database POS: Volume `mongo_data`
- Workflow & Eksekusi n8n: Volume `n8n_postgres_data`
- Sesi WhatsApp: Volume `evolution_instances`

### Cara Backup Manual MongoDB POS:
```bash
docker exec -it pos_mongo mongodump --archive=/data/db/backup-pos.gz --gzip
docker cp pos_mongo:/data/db/backup-pos.gz ./backup-pos-$(date +%F).gz
```

---

## 🛠️ 7. Troubleshooting & Perawatan

- **Cek Log n8n 1.110.1:**
  `docker compose -f docker-compose.vps.yml logs -f n8n`
- **Cek Log POS Backend:**
  `docker compose -f docker-compose.vps.yml logs -f backend`
- **Restart N8N:**
  `docker compose -f docker-compose.vps.yml restart n8n`
- **Pembaruan SSL Caddy:**
  Caddy memperbarui sertifikat SSL Let's Encrypt secara otomatis tanpa menghentikan service.
