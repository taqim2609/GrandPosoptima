# Hermes AI Provider - API Key Setup

## 🔐 Cara Memasukkan API Key

### Opsi 1: Edit .env File (Rekomendasi)

1. **Buka file .env:**
   ```bash
   nano /root/grandpos/backend-landing-page/.env
   ```

2. **Cari baris:**
   ```
   LOCAL_AI_API_KEY=your-api-key-here
   ```

3. **Ganti dengan API key Anda:**
   ```
   LOCAL_AI_API_KEY=ghp_xxxxxxxxxxxxxxxxxxxx
   ```

4. **Save dan exit:**
   - `Ctrl + O` (save)
   - `Enter` (confirm)
   - `Ctrl + X` (exit)

### Opsi 2: Export Langsung di Terminal

```bash
export LOCAL_AI_API_KEY="ghp_xxxxxxxxxxxxxxxxxxxx"
```

⚠️ **Catatan:** Cara ini hanya berlaku untuk session terminal saat ini. Akan hilang setelah restart.

### Opsi 3: Export Permanen di ~/.bashrc

```bash
echo 'export LOCAL_AI_API_KEY="ghp_xxxxxxxxxxxxxxxxxxxx"' >> ~/.bashrc
source ~/.bashrc
```

---

## 🔍 Dapatkan API Key dari Mana?

### Jika menggunakan GitHub Copilot:
1. Buka GitHub Settings → Developer settings → Personal access tokens
2. Generate token dengan scope `copilot`
3. Copy token dan paste ke `.env`

### Jika menggunakan OpenAI:
1. Kunjungi https://platform.openai.com/api-keys
2. Create new secret key
3. Copy key dan paste ke `.env`

### Jika menggunakan provider lain:
Sesuaikan dengan dokumentasi provider masing-masing.

---

## ✅ Verifikasi API Key

Setelah mengisi API key, test dengan:

```bash
cd /root/grandpos/backend-landing-page
python -m hermes health
```

Jika berhasil, output akan seperti:
```json
{
  "status": "healthy",
  "provider": "local-ai",
  "models": [...]
}
```

---

## 📝 Contoh Lengkap .env

```bash
# Database
DATABASE_URL=postgresql://user:pass@db:5432/grandpos

# AI Provider (Hermes)
LOCAL_AI_API_KEY=ghp_xxxxxxxxxxxxxxxxxxxx

# Optional: Override model default
# HERMES_DEFAULT_MODEL=gh/gpt-4o
```

---

## 🚨 Troubleshooting

### Error: "Missing API key"
```
HTTP 401: {"error":{"message":"Missing API key"}}
```
**Solusi:** API key belum di-set. Pastikan `LOCAL_AI_API_KEY` ada di `.env` dan aplikasi di-restart.

### Error: "Invalid API key"
```
HTTP 401: {"error":{"message":"Invalid API key"}}
```
**Solusi:** API key salah atau expired. Generate key baru.

### Error: "Provider not found"
```
ValueError: Provider 'local-ai' not found
```
**Solusi:** Config file tidak terbaca. Pastikan `hermes/providers.json` ada.

---

## 🔗 Integrasi dengan Docker

Jika menggunakan Docker Compose, tambahkan ke `docker-compose.yml`:

```yaml
services:
  api:
    env_file:
      - .env
    environment:
      - LOCAL_AI_API_KEY=${LOCAL_AI_API_KEY}
```

Lalu restart container:
```bash
docker-compose down && docker-compose up -d
```