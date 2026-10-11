# Panduan WhatsApp Grand POS — Hermes Gateway

WhatsApp Grand POS berjalan **hanya di server gudang-644**, memakai gateway
Hermes + Baileys dengan **nomor bot terpisah**. Pi tidak mengirim/menerima WA.

> Evolution API dan wacloud.id tidak dipakai lagi. Nilai `provider` lama yang
> masih tersimpan di database otomatis dipetakan ke `hermes`, sehingga upgrade
> tidak mematikan notifikasi secara senyap.

Acuan implementasi (docs Hermes):

* `user-guide/messaging/whatsapp.md` — setup Baileys, allowlist, sesi;
* `user-guide/messaging/webhooks.md` — webhook HMAC + `deliver_only`;
* `user-guide/features/hooks.md` — hook `pre_gateway_dispatch`.

## 1. Arsitektur yang benar

Hermes **tidak menyediakan REST API outbound WA** untuk aplikasi. Jadi:

```
Arah keluar: POS -> WhatsApp

backend Grand POS
  -> POST HMAC-SHA256 V2 ke 127.0.0.1:8644/webhooks/grandpos-outbox
  -> webhook adapter Hermes (deliver_only: true, deliver: whatsapp)
  -> adapter WhatsApp Hermes -> Baileys -> nomor bot

Arah masuk: WhatsApp -> POS

Baileys -> adapter WhatsApp Hermes -> MessageEvent
  -> plugin grandpos-wa-inbound (pre_gateway_dispatch)
  -> POST 127.0.0.1:8001/api/webhook/whatsapp + X-Hermes-Secret
  -> backend POS memproses /stok, /laporan-shift, /dashboard, reservasi
  -> hook mengembalikan skip (agent Hermes tidak dipanggil, nol token LLM)
```

Grand POS tidak membuat/menjalankan bridge Baileys sendiri. Sesi dan proses
WhatsApp sepenuhnya milik gateway Hermes di host 644.

## 2. Konfigurasi Grand POS di 644

```bash
cd /path/ke/grand-aceh-pos/project
cp .env.gudang.example .env
openssl rand -hex 32                 # pakai hasil sama di 3 tempat
# edit .env, lalu:
docker compose -f docker-compose.yml -f docker-compose.gudang.yml up -d --build
```

| Variabel | Nilai |
| :--- | :--- |
| `NODE_ID` | `644` |
| `NODE_ROLE` | `primary` (bawaan `backup` = tidak mengirim WA) |
| `HERMES_WA_WEBHOOK_URL` | `http://127.0.0.1:8644/webhooks/grandpos-outbox` |
| `HERMES_WA_WEBHOOK_SECRET` | secret HMAC acak |
| `WA_WEBHOOK_SECRET` | **sama** dengan secret HMAC |
| `HERMES_CMD_ALLOWLIST` | opsional, lihat bagian 6 |

Compose override 644 membuka backend hanya sebagai `127.0.0.1:8001:8001`, agar
plugin Hermes (proses host) bisa meneruskan pesan masuk. Tidak ada port bridge
tambahan dan tidak ada akses dari LAN/Tailnet.

## 3. Konfigurasi Hermes di 644

### 3.1 Pasangkan nomor bot terpisah

```bash
hermes whatsapp
```

Pindai QR dengan **nomor bot terpisah**, bukan nomor pribadi pemilik. Sesi
tersimpan di `~/.hermes/platforms/whatsapp/session`:

```bash
chmod 700 ~/.hermes/platforms/whatsapp/session
```

Backup sesi harus terenkripsi. Jangan commit/salin mentah — isinya akses penuh
akun WhatsApp.

### 3.2 Konfigurasi WhatsApp Hermes

```bash
WHATSAPP_MODE=bot
WHATSAPP_ALLOWED_USERS=628111222333,628444555666
WHATSAPP_REPLY_PREFIX=
```

```yaml
platforms:
  whatsapp:
    enabled: true
    reply_prefix: ""
    unauthorized_dm_behavior: ignore
```

* `WHATSAPP_ALLOWED_USERS` = allowlist nomor yang boleh masuk. Jangan `*`.
* `unauthorized_dm_behavior: ignore` — bot diam ke orang asing.
* `reply_prefix: ""` — header bot tidak bocor ke pelanggan.

### 3.3 Pasang plugin pesan masuk

```bash
mkdir -p ~/.hermes/plugins/grandpos-wa-inbound
cp -a project/hermes-integration/grandpos-wa-inbound/. \
      ~/.hermes/plugins/grandpos-wa-inbound/
```

Aktifkan `grandpos-wa-inbound` di `plugins.enabled`, lalu set:

```bash
WA_WEBHOOK_SECRET=<secret-yang-sama>
GRANDPOS_WEBHOOK_URL=http://127.0.0.1:8001/api/webhook/whatsapp
GRANDPOS_FORWARD_TIMEOUT=8
```

Restart gateway Hermes. Plugin hanya menangani platform `whatsapp`. Bila POS
mati, hook tetap `skip`: bot diam, bukan dibalas agent.

### 3.4 Route outbound `deliver_only`

```yaml
platforms:
  webhook:
    enabled: true
    extra:
      host: "127.0.0.1"
      port: 8644
      secret: "<secret-yang-sama>"
      routes:
        grandpos-outbox:
          secret: "<secret-yang-sama>"
          prompt: "{message}"
          deliver: whatsapp
          deliver_only: true
          deliver_extra:
            chat_id: "{to}"
```

Signature yang dipakai backend (Generic V2 Hermes):

```
X-Webhook-Timestamp: <unix-seconds>
X-Webhook-Signature-V2: hex(HMAC-SHA256(secret, "<timestamp>.<raw-body>"))
```

Timestamp ±300 detik melindungi dari replay. Payload:

```json
{"to":"628123456789@s.whatsapp.net","message":"isi pesan"}
```

## 4. Raspberry Pi (backup)

`project/.env` di Pi cukup:

```
NODE_ID=pi
NODE_ROLE=backup
```

Tanpa `HERMES_WA_*`, dan jalankan hanya:

```bash
docker compose up -d --build
```

Saat Pi mengambil alih POS, notifikasi masuk `wa_outbox` dengan kunci idempoten.
Setelah 644 online dan tersinkron, **644** mengirim sekali.

## 5. Outbox

```bash
curl -s localhost/api/whatsapp/outbox -H "Authorization: Bearer ***"
curl -s -X POST localhost/api/whatsapp/outbox/dispatch -H "Authorization: Bearer ***"
```

Di Pi hasilnya `{"skipped": true, "sent": 0}` — perilaku benar. Scheduler 644
mencoba outbox tiap 10 menit.

## 6. Perintah dua arah

| Perintah | Role bawaan |
| :--- | :--- |
| `/stok` | kasir, admin, superadmin |
| `/laporan-shift` | admin, superadmin |
| `/dashboard` | admin, superadmin |

Pengirim dicocokkan dengan `phone` akun POS. Nomor tak terdaftar, akun nonaktif,
atau role tanpa izin ditolak. Semua perintah read-only.

```
HERMES_CMD_ALLOWLIST=/stok:kasir,admin,superadmin;/dashboard:superadmin
```

Dua lapis allowlist: `WHATSAPP_ALLOWED_USERS` (siapa boleh masuk gateway) dan
akun POS + `HERMES_CMD_ALLOWLIST` (perintah apa yang boleh jalan).

## 7. Gate keamanan

* Webhook/gateway bind `127.0.0.1`, bukan IP Tailnet.
* Outbound HMAC V2; inbound `X-Hermes-Secret` fail-closed.
* `unauthorized_dm_behavior: ignore`, `reply_prefix: ""`.
* Sesi `chmod 700`, backup terenkripsi, tidak pernah di-commit.
* Log tanpa secret/nomor/isi pesan.
* Baileys tidak resmi: risiko ban/pairing putus; pakai nomor bot terpisah.

## 8. Migrasi legacy

* `wacloud`, `evolution`, dan provider kosong dipetakan ke `hermes` saat dibaca
  maupun ditulis; klien lama tidak crash/ditolak.
* Selama Hermes belum siap, pesan gagal masuk outbox, bukan hilang.
* Service lama `whatsapp-service/` sudah dihapus dari repo.

## 9. Verifikasi

```bash
curl -s http://127.0.0.1:8644/health      # {"status":"ok","platform":"webhook"}
curl -s http://127.0.0.1:8001/api/health | python3 -m json.tool

python3 project/tests/test_hermes_bridge.py
python3 project/tests/test_wa_provider_migration.py
python3 project/tests/test_hermes_plugin_inbound.py
python3 project/tests/test_hermes_wa_e2e.py   # butuh httpx (dependency backend)
```
