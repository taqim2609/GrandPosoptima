# Panduan Ergonomi API Backend Rust (Axum)

Standar desain API dan ergonomi layanan backend Rust untuk Grand Aceh Kuliner POS [RUST-FR-001, RUST-FR-002, RUST-FR-003, RUST-FR-008].

## Konvensi Arsitektur & Routing
- Semua rute API berada di bawah prefix `/api`.
- Handler didefinisikan menggunakan fungsi asinkron Axum dengan ekstraktor bertipe kuat:
  ```rust
  pub async fn create_order(
      State(app_state): State<Arc<AppState>>,
      claims: Claims,
      Json(payload): Json<CreateOrderDto>,
  ) -> Result<(StatusCode, Json<OrderResponseDto>), AppError>
  ```
- Ekstraktor autentikasi `Claims` secara otomatis memvalidasi header `Authorization: Bearer <token>` dan memeriksa hak akses (RBAC).

## Tipe Presisi Keuangan
- Nilai Rupiah, diskon, dan timbangan berat TIDAK BOLEH menggunakan tipe primitif `f32` atau `f64`.
- Gunakan `rust_decimal::Decimal` dengan serialisasi kustom:
  ```rust
  #[derive(Debug, Serialize, Deserialize)]
  pub struct OrderItemDto {
      pub product_id: String,
      pub price: Decimal,
      pub quantity: Decimal, // ons atau pcs
      pub discount_amount: Decimal,
  }
  ```

## Pemisahan Server & Reverse Proxy
- Port default backend Rust: `8000` (atau via environment `PORT`).
- Port default frontend Web: `3000`.
- CORS dikonfigurasi melalui layer `tower_http::cors::CorsLayer` dengan whitelist origin fleksibel untuk Android Capacitor (`http://localhost`, `capacitor://localhost`, dan subnet Tailscale/LAN).

## Format Respons Standar & Error RFC 7807
Respons kesalahan mengembalikan struktur terstandarisasi:
```json
{
  "type": "https://grandpos.local/errors/validation-failed",
  "title": "Unprocessable Entity",
  "status": 422,
  "detail": "Transaksi F&B dan Retail tidak boleh dicampur dalam satu order",
  "instance": "/api/orders"
}
```
