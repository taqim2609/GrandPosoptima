# Disk & backup alert

`ops/disk-alert.sh` + `grandpos-alert.{service,timer}` (setiap 15 menit).

## Apa yang diperiksa

| Kondisi | Ambang |
| :--- | :--- |
| Disk terpakai | ≥ 85% (default `THRESHOLD`) |
| Sisa disk | < 512 MB (`MIN_FREE_MB`) |
| Dump backup terbaru | lebih tua dari 36 jam (`BACKUP_MAX_AGE_H`) |

Backup dimasukkan ke alarm yang sama karena kegagalannya senyap: `pg_dump` bisa berhenti
bekerja berhari-hari tanpa ada yang tahu sampai restore dibutuhkan.

## Ke mana alarmnya pergi

Tidak ada kanal push di host ini — `hermes send -l` melaporkan tidak ada platform messaging
terkonfigurasi. Jadi alarm = entri di `/var/log/grandpos-alert.log` + exit code non-zero.
Cek dengan:

```sh
cat /var/log/grandpos-alert.log
systemctl --failed | grep grandpos
```

Kalau nanti ada bot Telegram/Slack, sambungkan di satu tempat: tambahkan
`hermes send -t <target>` di cabang `problems` skrip itu. Tidak ada yang lain perlu diubah.

## Dedupe

Alarm hanya ditulis saat status **berubah**, bukan setiap 15 menit. Status terakhir disimpan di
`/var/lib/grandpos-alert.state`. Pemulihan juga dicatat satu baris (`OK: pulih dari: ...`), jadi
riwayat log terbaca sebagai garis waktu, bukan kebisingan.

## Pasang

```sh
cp ops/grandpos-alert.{service,timer} /etc/systemd/system/
systemctl daemon-reload && systemctl enable --now grandpos-alert.timer
```

## Uji tanpa menunggu

```sh
THRESHOLD=1 LOG_FILE=/tmp/a.log STATE_FILE=/tmp/a.state ops/disk-alert.sh; echo $?   # 1 = alarm
BACKUP_DIR=/tmp/empty LOG_FILE=/tmp/a.log STATE_FILE=/tmp/a.state ops/disk-alert.sh  # backup=none
```

## Hasil teramati (2026-11-13)

- Hijau tanpa alarm pada kondisi normal.
- `THRESHOLD=1` → exit 1, satu baris `ALERT: disk_used=84%`.
- Dijalankan dua kali dengan kondisi sama → **tidak** duplikat.
- `BACKUP_DIR` kosong → `ALERT: backup=none`.
- Kembali sehat → `OK: pulih dari: backup=none`, lalu senyap.
- Lewat systemd: `Result=success`, timer `LAST` terisi, siklus 15 menit berjalan.
