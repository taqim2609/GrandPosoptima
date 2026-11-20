# GrandPOS WhatsApp gateway (Baileys service)

Lapisan layanan Node/Baileys yang menjadi **satu-satunya** tempat perintah
cepat nol-token diproses.

## Mengapa tidak ada `pre_gateway_dispatch`

Permintaan awal meminta "plugin inbound (hook: `pre_gateway_dispatch`)".
Hermes **tidak mendokumentasikan** hook dengan nama itu: pencarian dokumentasi
resmi (API Server, webhook adapter, multi-profile gateways, integrations)
tidak menemukan hook tersebut, dan adapter platform yang didukung untuk arah
masuk adalah adapter platform sendiri (webhook/SMS/Twilio/LINE) dengan
penandatanganan HMAC — bukan hook pra-dispatch yang bisa dipasang skrip.

**Substitusi:** perintah `/stok`, `/laporan-shift`, `/dashboard`, dan
`#reservasi Nama/Tgl/Jam/JumlahOrang` diparse dan dieksekusi secara
deterministik di lapisan ini (`gateway/commands.js` + `gateway/index.js`),
memanggil endpoint API GrandPOS yang allowlisted. Konsekuensinya:

| Aspek | Hook hipotetis `pre_gateway_dispatch` | Implementasi lapisan layanan ini |
|---|---|---|
| Biaya token | 0 jika hook berjalan sebelum model | 0 (parse murni, tanpa model) |
| Titik pemasangan | di dalam Hermes | sebelum pesan menyentuh Hermes sama sekali |
| Kontrol allowlist | tidak jelas | eksplisit, di `app/guard.py` / `gateway/commands.js` |
| Perilaku pesan umum | perlu teruskan manual | diteruskan ke profil Hermes bernama |

Pesan dari nomor non-allowlist tidak pernah menyentuh perintah cepat; pesan
percakapan umum bisa diteruskan ke profil Hermes (`HERMES_FORWARD_URL`) —
itulah satu-satunya jalur yang memakai LLM.

## Modul

| File | Tanggung jawab |
|---|---|
| `gateway/commands.js` | parser deterministik dari `app/parsers.py` (ATURAN: satu sumber kebenaran; jangan duplikasi logika di JS) |
| `gateway/index.js` | allowlist, normalisasi JID, rate limit, timeout, outbound receipt & rekap shift, verifikasi HMAC webhook |
| `gateway/package.json` | dependensi layanan |

## Kontrak keamanan

- **Allowlist:** hanya nomor di `WA_ALLOWED_NUMBERS` (+ `WA_OWNER_NUMBER`).
  JID dinormalisasi (`62811…@s.whatsapp.net:12` -> `62811…`), jadi suffix
  device tidak bisa menyusup.
- **Rate limit:** `WA_RATE_LIMIT_PER_MINUTE` per pengirim (jendela tetap).
- **Timeout:** setiap panggilan API `WA_REQUEST_TIMEOUT_MS`, dibatalkan
  dengan `AbortController`.
- **Log aman:** `SafeLogger` hanya mencatat event, nomor ter-mask
  (`62811***01`), nama command, durasi, hasil. Body pesan, nomor penuh, dan
  secret tidak pernah masuk log.
- **Webhook masuk:** `X-Hub-Signature-256` + `X-GrandPOS-Timestamp`
  diverifikasi dengan HMAC-SHA256 dan jendela replay 300 detik; `dedupe_key`
  idempoten sehingga pengiriman ulang tidak menggandakan pesan.

## Menjalankan

```bash
cd gateway
npm ci            # atau: npm install
WA_ALLOWED_NUMBERS=628110000001,628110000002 \
WA_OWNER_NUMBER=628110000001 \
GRANDPOS_API_BASE=http://127.0.0.1:8000 \
GRANDPOS_OUTBOX_SECRET=<secret> \
node index.js
```

Layanan menolak start bila `WA_ALLOWED_NUMBERS` kosong atau secret kosong.
