# Deployment — GrandPOS P1A

Salinan dari source-of-truth di host `gudang-644`. Di repo ini konfigurasi POS
ada di `pos-engine/deploy/`, sedangkan folder ini milik layanan FastAPI
(`landing-page/`).

File di direktori ini ada agar konfigurasi deploy ikut ter-version-control. Salinan
di server tetap yang dipakai saat menjalankan `docker compose`.

## Isi

| File | Keterangan |
|---|---|
| `docker-compose-p1a.yml` | Compose utama P1A: service `grandpos-app` (POS Node/Express + React) di port 3000, dan `watchtower` untuk auto-update image. |
| `docker-compose.yml` | Compose varian sederhana yang hanya menjalankan POS dengan data ter-mount lokal (`./data`). Tidak menyertakan JWT/DB, jadi hanya untuk mode ringan. |
| `.env.example` | Contoh variabel lingkungan yang wajib diisi. |

## Secrets

`docker-compose-p1a.yml` **tidak** menyimpan nilai credential. Semua nilai
berasal dari environment:

```bash
cp deploy/.env.example deploy/.env   # lalu isi dengan nilai sebenarnya
chmod 600 deploy/.env
```

`deploy/.env` di-ignore oleh git. Jangan pernah meng-commit nilai aslinya.

> Catatan keamanan: nilai `JWT_SECRET` dan `NODE_SYNC_KEY` pernah ada secara
> plaintext di file compose server. Bila file itu pernah dibagikan atau masuk
> riwayat git, **rotasi kedua nilai tersebut**.

## Label watchtower

Kedua service diberi label:

```yaml
- "com.centurylinklabs.watchtower.enable=false"
```

Alasannya:

- `grandpos-app` ter-bind-mount dari host (`pos-engine:/app:rw`, path host diatur lewat `POS_ENGINE_DIR`)
  dan tidak dipublikasikan ke registry mana pun. Watchtower akan mencoba
  menarik image tiap 24 jam, gagal, dan menghasilkan log noise.
- Yang lebih penting, bila suatu saat ada image publik dengan nama yang sama,
  watchtower bisa **mengganti container POS yang sedang berjalan** di tengah
  jam operasional kasir.
- Watchtower juga tidak boleh memperbarui dirinya sendiri — cleanup bisa
  tidak berjalan dengan benar.

## Perintah

```bash
# Jalankan (dari folder deploy layanan)
docker compose -f docker-compose-p1a.yml up -d

# Restart P1A setelah deploy kode
docker compose -f docker-compose-p1a.yml restart grandpos-app
```
