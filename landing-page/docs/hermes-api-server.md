# Hermes API Server integration — `pos-analyst` (AI brain, jalur 1)

GrandPOS menu "Asisten AI" berbicara ke Hermes lewat adapter **API Server**
yang OpenAI-compatible. Jangan gunakan `hermes proxy` (itu OAuth proxy untuk
kasus lain, bukan endpoint chat OpenAI-compatible).

## 1. Aktifkan adapter (di mesin yang menjalankan Hermes, bukan di repo ini)

Tambahkan ke `~/.hermes/.env` mesin Hermes:

```env
API_SERVER_ENABLED=true
API_SERVER_KEY=<isi-dari-environment-atau-secret-manager>
# Opsional: hanya jika browser harus memanggil Hermes langsung
# API_SERVER_CORS_ORIGINS=http://localhost:3000
```

Jalankan gateway dan verifikasi:

```bash
hermes gateway
# [API Server] API server listening on http://127.0.0.1:8642

curl http://127.0.0.1:8642/health
# {"status": "ok", ...}

curl -s -H "Authorization: Bearer $API_SERVER_KEY" \
  http://127.0.0.1:8642/v1/models
# {"object":"list","data":[{"id":"hermes-agent", ...}]}
```

Referensi: <https://hermes-agent.nousresearch.com/docs/user-guide/features/api-server>

## 2. Panggil dari POS

Contoh standalone (mesin Hermes tanpa multiplexer, port contoh 8000):

```bash
curl http://127.0.0.1:8000/v1/chat/completions \
  -H "Authorization: Bearer $API_SERVER_KEY" \
  -H "Content-Type: application/json" \
  -H "X-Hermes-Session-Key: grandpos-pos-analyst" \
  -d '{
    "model": "hermes-agent",
    "messages": [
      {"role": "system", "content": "<isi pos-analyst/SOUL.md>"},
      {"role": "user", "content": "Berapa omzet dan kas shift hari ini?"}
    ]
  }'
```

`X-Hermes-Session-Key` bersifat opsional tetapi disarankan: ia menjaga
percakapan dalam satu sesi gateway yang tahan lama (lihat dokumentasi
"Conversation and terminal-result semantics").

## 3. Multiplexer: host live mungkin berbeda

Jika host live memakai multiplexer profil-default, API Server **di-mirror,
tidak diduplikasi**: profil sekunder tidak boleh mengaktifkan `api_server`
sendiri, dan endpoint-nya memakai prefix profil:

```text
# default profile
POST http://host:8644/v1/chat/completions

# profil "pos-analyst" pada listener yang sama
POST http://host:8644/p/pos-analyst/v1/chat/completions
```

Template ini memakai port contoh 8000 dan path tanpa prefix. Sebelum
menyambungkan menu Pengaturan AI POS, cek `hermes gateway status` di host
live untuk path dan port aktual.

## 4. Akses data read-only (tanpa SQL tulis dari model)

Model TIDAK PERNAH menerima kredensial tulis dan TIDAK PERNAH mengirim SQL
bebas. Akses data hanya lewat salah satu dari:

1. **Role DB `grandpos_ai`** (lihat `db/roles.sql`): `NOLOGIN` kecuali
   operator mengaktifkan, `SELECT` hanya pada 4 view analitik
   (`v_daily_turnover`, `v_shift_cash`, `v_low_stock`,
   `v_weekly_best_sellers`), default transaksi read-only, statement timeout
   15 detik.
2. **Helper allowlisted** di `app/rules.py` + endpoint laporan API: helper
   hanya menerima parameter terstruktur (tanggal, shift_id) dan query
   berparameter; tidak ada string SQL dari model.

Tidak ada secret nyata di file ini. Semua key berasal dari environment.
