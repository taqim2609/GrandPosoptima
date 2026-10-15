# Fitur — Keamanan Login Kasir dan Anti Brute-Force

Modul perlindungan autentikasi kasir dari upaya tebak kata sandi berulang (brute-force).

## Kebutuhan fungsional
- SEC-FR-001: Sistem harus membatasi percobaan login kasir yang gagal maksimal 5 kali berturut-turut dalam rentang 15 menit.
- SEC-FR-002: Sistem harus mengunci sementara akun kasir selama 10 menit jika ambang batas kegagalan terlampaui.
- SEC-FR-003: Sistem harus mencatat log audit keamanan untuk setiap upaya login gagal yang mencurigakan.

## Kriteria penerimaan
- SEC-AC-001: Percobaan login ke-6 dengan kredensial salah menghasilkan respon HTTP 429 (Too Many Requests) atau pesan akun terkunci sementara.
- SEC-AC-002: Admin outlet dapat membuka kunci akun kasir secara manual melalui menu Pengguna jika diperlukan mendesak.
- SEC-AC-003: Login berhasil sebelum batas tercapai me-reset hitungan kegagalan login kembali ke nol.
