# Model Data Utama

Entitas domain inti yang dikelola oleh sistem Grand Aceh Kuliner POS.

## Entitas Inti
1. **Order (`orders`)**:
   - `order_number`: String (format `GAK-YYYYMMDD-XXXX`).
   - `order_type`: Enum (`dine_in`, `take_away`, `retail`).
   - `items`: Array item pesanan (nama, harga, bobot/qty, hpp, vendor_share, catatan).
   - `subtotal`, `discount_percent`, `discount_amount`, `discount_reason`.
   - `service_tax_rate`, `service_tax`.
   - `total`, `payment_method`, `payment_status`, `client_ref`.
2. **Product (`products`)**:
   - `name`: Nama produk.
   - `type`: Enum (`makanan`, `minuman`, `retail`, `vendor`).
   - `price`: Harga satuan atau harga dasar per ons.
   - `cost`: HPP produk.
   - `vendor_id`: ID vendor jika produk berjenis titipan konsinyasi.
   - `vendor_share_percent`: Persentase hak vendor.
3. **Shift (`shifts`)**:
   - `user_id`, `cashier_name`.
   - `opening_cash`, `closing_cash`, `expected_cash`.
   - `net_cash_fnb`, `net_cash_retail`.
   - `status`: Enum (`open`, `closed`).
4. **Vendor Settlement (`vendor_settlements`)**:
   - `vendor_id`, `shift_id`, `amount_paid`, `source`.
5. **Cash Movement (`cash_movements`)**:
   - `type`: Enum (`in`, `out`).
   - `category`: String (contoh: "Bagi Hasil Vendor", "Belanja Bahan").
   - `scope`: Enum (`fnb`, `retail`).
   - `amount`, `notes`.
