# Fase 03 — Migrasi Backend Rust & Isolasi Server Terpisah

Transisi core API backend ke binary native Rust (Axum + Tokio) dengan pemisahan runtime server fisik dan rilis v3.0.0 [RUST-FR-001, RUST-FR-002, RUST-FR-003, RUST-FR-004, RUST-FR-005, RUST-FR-006, RUST-FR-007, RUST-FR-008].

## Dependensi
- Fase 01: Fondasi POS & Hardware Kasir stabil.
- Fase 02: Backlog & Optimasi terselesaikan.

## Workflow eksekusi
- chore: Scaffolding Cargo workspace untuk modul backend Rust (Axum, Tokio, Tower, Serde, rust_decimal).
- feature: Implementasi model pesanan type-safe dengan pemisahan mutlak F&B vs Retail [RUST-FR-004].
- feature: Mesin kalkulasi Rupiah presisi tetap dan timbangan berat berbasis `rust_decimal` [RUST-FR-003].
- feature: Modul settlement vendor satu pintu dan rekonsiliasi kas tutup shift [RUST-FR-005].
- feature: Antrean sinkronisasi offline ber-ID klien unik `client_ref` [RUST-FR-006].
- feature: Generator ESC/POS monospace dan pemicu laci kasir otomatis Sunmi T2 [RUST-FR-007].
- feature: Webhook adapter WhatsApp Hermes Agent AI dengan verifikasi signature HMAC SHA256 [RUST-FR-008].
- chore: Pemisahan konfigurasi proxy server (Frontend port 3000, Backend port 8000) dan rilis APK v3.0.0.

## Kriteria keluar
- Layanan backend Rust dapat di-build dengan `cargo build --release` dan berjalan mandiri di port 8000.
- Frontend web dan APK v3.0.0 berhasil berinteraksi dengan backend tanpa error CORS atau deserialisasi.
- Seluruh acceptance criteria `[RUST-AC-001]` sampai `[RUST-AC-008]` terpenuhi.
