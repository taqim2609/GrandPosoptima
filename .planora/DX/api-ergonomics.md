# Ergonomi API

Desain endpoint REST API sistem kasir [POS-FR-001, VND-FR-001, SEC-FR-001].

## Konvensi
- Semua endpoint menggunakan prefix `/api`.
- Respons JSON standar dengan kode status HTTP semantik (200, 201, 400, 401, 403, 404, 429).
- Operasi mutasi kasir dilindungi dengan idempotency key `client_ref`.
