# Hermes webhook adapter — GrandPOS outbox (POS -> WhatsApp, jalur 1 arah keluar)

Struk pembayaran digital dan rekap tutup shift dikirim POS ke Hermes lewat
adapter **webhook** (port contoh 8644). Rute bersifat `deliver_only`: Hermes
hanya meneruskan ke WhatsApp tanpa memicu agen.

## 1. Konfigurasi adapter (di mesin Hermes, bukan di repo ini)

Tambahkan ke `~/.hermes/config.yaml` mesin Hermes:

```yaml
platforms:
  webhook:
    enabled: true
    extra:
      port: 8644
      rate_limit: 30  # max request per menit per rute
      routes:
        grandpos-outbox:
          # HARUS sama persis dengan GRANDPOS_OUTBOX_SECRET di sisi POS.
          secret: "${GRANDPOS_OUTBOX_SECRET}"
          events:
            - receipt
            - shift_recap
            - reservation_confirm
          deliver_only: true
```

Secret disimpan di `~/.hermes/.env`, bukan di YAML:

```env
GRANDPOS_OUTBOX_SECRET=<openssl rand -hex 32>
```

## 2. Penandatanganan (signing)

POS menandatangani body dengan HMAC-SHA256 memakai `app/signing.py`:

- canonical body: JSON sort-keys, separator kompak, UTF-8.
- string to sign: `"<unix-timestamp>.<canonical-json>"`.
- header: `X-Hub-Signature-256: sha256=<hex>` (gaya GitHub/Hermes),
  plus `X-GrandPOS-Timestamp`, `X-GrandPOS-Event`, `X-GrandPOS-Delivery`.
- Contoh pengirim (lihat `app/signing.py::headers_for`): terima kasih —
  fungsi itu yang dipakai, bukan snippet di dokumen ini.

## 3. Proteksi replay dan idempotensi

- Hermes menolak timestamp di luar jendela toleransi
  (`tolerance_seconds`, default 300; clock skew masa depan max 60 detik).
- `dedupe_key` (`X-GrandPOS-Delivery`) unik per event:
  pengiriman ulang dengan key sama tidak mengirim WhatsApp dua kali
  (`ReplayGuard` + unique constraint `outbox_messages.dedupe_key`).
- Contoh yang diharapkan:

```bash
SIG=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$SECRET" -hex | awk '{print "sha256="$2}')
curl -s -X POST http://localhost:8644/webhooks/grandpos-outbox \
  -H "Content-Type: application/json" \
  -H "X-Hub-Signature-256: $SIG" \
  -H "X-GrandPOS-Timestamp: $(date +%s)" \
  -d "$BODY"
# {"status":"accepted","route":"grandpos-outbox","event":"receipt","delivery_id":"..."}
```

## 4. Multiplexer

Pada host multiplexer, rute default di `POST http://host:8644/webhooks/<route>`
dan profil sekunder di `POST http://host:8644/p/<profile>/webhooks/<route>`.
`api_server` dan `webhook` di-mirror, tidak diduplikasi — profil sekunder
tidak mengaktifkan webhook sendiri.

## 5. Yang TIDAK ada: `pre_gateway_dispatch`

Hermes saat ini **tidak mendokumentasikan** hook bernama
`pre_gateway_dispatch`. Permintaan awal ("plugin inbound hook:
pre_gateway_dispatch") tidak dapat dipenuhi apa adanya. Penggantinya ada di
`gateway/` dan didokumentasikan di `gateway/README.md`: perintah cepat
(`/stok`, `/laporan-shift`, `/dashboard`, `#reservasi`) ditangani
deterministik di lapisan layanan Baileys — nomor allowlisted, parse pasti,
lalu memanggil endpoint API yang allowlisted — dengan nol token LLM.
Pesan percakapan umum pelanggan yang diteruskan ke profil Hermes bernama
adalah satu-satunya trafik yang menyentuh model.
