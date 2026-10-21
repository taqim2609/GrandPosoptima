# 🔍 Indeks Navigasi Cepat Kode Sumber
## Grand Aceh Kuliner POS & Ekosistem Hermes Agent

Indeks ini memetakan pertanyaan pengembangan, pencarian fitur bisnis, dan penanganan bug secara langsung ke berkas kode dan fungsi terkait untuk mempercepat pekerjaan developer dan agen AI.

---

## 🧭 Tabel Navigasi Fitur ke Berkas Kode

| Fitur / Logika Bisnis | Lokasi Berkas Utama | Lokasi Berkas Terkait | Deskripsi & Fungsi Kunci |
|---|---|---|---|
| **Pusat MCP Server (11 Tools & SSE)** | `routes/mcpServer.js` | `server.ts` | Endpoint SSE `GET /api/mcp/sse`, handler `tools/call`, tool definitions (`pos_manage_whatsapp_config`, `pos_manage_server_cluster`, `pos_manage_promos_and_coupons`, `pos_audit_agent_actions`). |
| **Audit Mutasi Agen AI (Before / After)** | `routes/agentRoutes.js` | `src/pages/SettingsMCP.jsx` | Fungsi `recordAuditLog()`, endpoint `GET /api/agent/audit-logs`, dan rendering visual UI diff before/after pada tab audit. |
| **Integrasi WhatsApp Baileys (Port 8644)** | `routes/agentRoutes.js` | `server.ts`, `public/.env` | Endpoint `GET/POST /api/agent/whatsapp/config`, outbox webhook forwarder ke port `8644`. |
| **Cluster Server (Gudang 644 vs Pi)** | `routes/agentRoutes.js` | `bootstrap-vps.sh`, `setup-tailscale.sh` | Metadata cluster node, status health check, IP Tailscale, dan perutean beban kerja. |
| **Voucher Promo & Banner Landing Page** | `routes/agentRoutes.js` | `src/pages/LandingPage.jsx` | Endpoint `POST /api/agent/promos/landing-banner` untuk mengubah banner hero landing page secara real-time. |
| **Antrean Offline-First (IndexedDB)** | `src/contexts/OfflineContext.jsx` | `src/pages/POS.jsx` | *Golden Rule*: Dilarang mengubah alur ini. Menyimpan mutasi transaksi ke IndexedDB dan auto-sync saat online. |
| **Keranjang Kasir & Mode F&B / Retail** | `src/contexts/CartContext.jsx` | `src/pages/POS.jsx` | Pemisahan item F&B vs Retail, subtotal, kalkulasi diskon, pajak PB1, dan validasi keranjang. |
| **Perhitungan Penjualan per Berat (Ons/Kg)** | `src/pages/POS.jsx` | `src/contexts/CartContext.jsx` | `item.price * weight`, penskalaan bobot dan kalkulasi HPP proporsional. |
| **Titipan Vendor & Bagi Hasil Satu Pintu** | `src/pages/ShiftManagement.jsx` | `src/pages/VendorManagement.jsx` | Pemotongan hak vendor saat tutup shift kasir ke `vendor_settlements` dan mutasi kas keluar tanpa *double deduction*. |
| **Aturan Diskon Outlet (Anti-Potong Vendor)**| `src/pages/POS.jsx` | `src/contexts/CartContext.jsx` | Memastikan diskon ditanggung 100% oleh outlet dan tidak pernah memotong HPP maupun hak vendor. |
| **Hitung Uang Bersih Shift Kasir** | `src/pages/ShiftManagement.jsx` | `src/pages/POS.jsx` | `net_cash_fnb = fnb_total - out_fnb`, `net_cash_retail = retail_total - out_retail`, rekonsiliasi kas fisik vs sistem. |
| **Cetak Struk ESC/POS & Buka Laci Kasir** | `src/components/ReceiptPrinter.jsx` | `src/utils/SunmiBridge.js` | Format struk kertas 58mm/80mm, perintah escape raw printer, dan trigger pembuka laci (*cash drawer*). |
| **Denah Meja F&B & Status Billing** | `src/components/TableLayout.jsx` | `src/pages/POS.jsx` | Visualisasi denah meja, indikator status meja (kosong, aktif, billing), dan ganti meja. |
| **Buku Reservasi & Uang Muka (DP)** | `src/pages/Reservations.jsx` | `src/pages/ShiftManagement.jsx` | Jadwal tamu, input DP kas masuk, konfirmasi WhatsApp, dan pencairan saat kedatangan. |
| **Katalog Menu Publik (Landing Page)** | `src/pages/LandingPage.jsx` | `index.html` | Etalase publik menu restoran, hero slider promo, jam buka outlet, dan tombol WhatsApp CS. |
| **Otentikasi & Hak Akses Kasir (RBAC)** | `src/contexts/AuthContext.jsx` | `src/pages/Login.jsx` | Sesi login kasir, token JWT, verifikasi peran (Kasir, Supervisor, Manager, Owner). |
| **Skrip Pembaruan Indeks Berkas Resmi** | `project/scripts/update_file_index.py` | `INDEX-BERKAS.md` | Skrip Python pemindai seluruh berkas repositori sesuai aturan AGENTS.md Aturan 8. |

---

## ⚡ Kata Kunci Pencarian Cepat (*Code Cheat Sheet*)

Jika Anda mencari potongan kode tertentu di repositori:

1. **Mencari Logika Diskon & Pajak**: Cari fungsi `calculateTotals` atau `applyDiscount` di `src/contexts/CartContext.jsx`.
2. **Mencari Integrasi Hardware Thermal**: Cari fungsi `printReceipt` atau `openCashDrawer` di `src/components/ReceiptPrinter.jsx`.
3. **Mencari Antrean Sync Offline**: Cari `pendingSyncQueue` atau `saveOrderOffline` di `src/contexts/OfflineContext.jsx`.
4. **Mencari Definisi Tool MCP**: Cari objek `tools` array di `routes/mcpServer.js`.
5. **Mencari Audit Mutasi Agen AI**: Cari `recordAuditLog` di `routes/agentRoutes.js`.
6. **Mencari Port & Proxy Server**: Buka `server.ts` dan cari `PORT` atau `app.listen(3000)`.
