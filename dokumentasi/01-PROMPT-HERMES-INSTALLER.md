# PROMPT INSTRUKSI AGUNAN UNTUK AGEN AI HERMES
## Panduan Eksekusi Instalasi Otomatis: Server Gudang 644 & GrandPOS (Raspberry Pi)

> **PETUNJUK BAGI PENGGUNA**:  
> Salin (*copy*) seluruh teks di bawah tanda garis pembatas berikut dan kirimkan langsung sebagai prompt ke **Agen AI Hermes**. Agen Hermes akan mengeksekusi instruksi ini secara mandiri melalui terminal SSH atau agen eksekusi jarak jauh.

---

```markdown
Hai Hermes Agent, kamu ditugaskan sebagai Senior DevOps & Systems Engineer untuk menginstal dan mengonfigurasi ekosistem "Grand Aceh Kuliner POS" secara menyeluruh pada 2 (dua) node terpisah:

1. NODE 1: SERVER GUDANG 644 (Cloud VPS)
   - Peran: Master Database, WhatsApp Gateway API (Baileys Port 8644), Engine REST API & MCP Server (Port 3000), serta Public Landing Page.
   - Karakteristik: Single Source of Truth (database utama). Tidak menjalankan UI kasir.

2. NODE 2: GRANDPOS (Raspberry Pi di Toko)
   - Peran: Frontend Kasir Layar Sentuh (Kiosk Mode), Printer Thermal ESC/POS, Cash Drawer, dan Antrean Sinkronisasi Offline (IndexedDB).
   - Karakteristik: Zero Local Database conflict. Terhubung ke Gudang 644 melalui jaringan privat Tailscale VPN.

Berikut adalah instruksi teknis langkah demi langkah yang WAJIB kamu jalankan:

================================================================================
BAGIAN 1: INSTALASI SERVER GUDANG 644 (CLOUD VPS)
================================================================================

Langkah 1.1 — Akses & Persiapan Lingkungan Server
Jalankan di terminal server Gudang 644:
```bash
sudo apt-get update -y && sudo apt-get upgrade -y
sudo apt-get install -y curl git ufw nginx build-essential
```

Langkah 1.2 — Clone Repositori Proyek
```bash
cd /opt
if [ -d "grand-aceh-pos" ]; then
  cd grand-aceh-pos && git pull origin main
else
  git clone https://github.com/taqim2609/grand-aceh-kuliner-pos.git grand-aceh-pos
  cd grand-aceh-pos
fi
```

Langkah 1.3 — Konfigurasi Lingkungan (.env)
Pastikan berkas `.env` di `/opt/grand-aceh-pos/.env` berisi:
```ini
NODE_ENV=production
PORT=3000
HERMES_WA_WEBHOOK_URL=http://127.0.0.1:8644/webhooks/grandpos-outbox
HERMES_WA_PORT=8644
JWT_SECRET=super_secret_grand_aceh_pos_production_key_2026
ALLOW_DEV_PROXIES=false
```

Langkah 1.4 — Menjalankan POS Engine & MCP Server (Port 3000)
Jalankan skrip bootstrap otomatis VPS atau Docker Compose:
```bash
cd /opt/grand-aceh-pos
chmod +x bootstrap-vps.sh scripts/*.sh
./bootstrap-vps.sh
```
Atau jika menggunakan PM2 / Node secara langsung:
```bash
npm install --omit=dev
npm run build
npm start &
```
Verifikasi bahwa endpoint MCP SSE & REST API aktif:
```bash
curl -I http://127.0.0.1:3000/api/mcp/sse
curl http://127.0.0.1:3000/api/agent/whatsapp/status
```

Langkah 1.5 — Menjalankan Baileys WhatsApp Gateway (Port 8644)
Pastikan service WhatsApp Gateway aktif di port 8644:
- Folder session: `/opt/grand-aceh-pos/whatsapp_sessions/`
- Webhook outbox: `http://127.0.0.1:8644/webhooks/grandpos-outbox`
- Jika service menggunakan Docker/PM2:
```bash
# Cek kesehatan WhatsApp API
curl http://127.0.0.1:8644/health || echo "Silakan mulai Baileys Gateway di port 8644"
```

Langkah 1.6 — Konfigurasi Nginx Reverse Proxy & SSL (Landing Page & API)
Pasang konfigurasi Nginx untuk domain publik toko (misal: `pos.grandaceh.com` atau IP server):
```nginx
server {
    listen 80;
    server_name _;

    # Landing Page & Static POS Web Assets
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    # WhatsApp API Webhook Route
    location /wa-api/ {
        proxy_pass http://127.0.0.1:8644/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```
Aktifkan dan restart Nginx:
```bash
sudo nginx -t && sudo systemctl reload nginx
```

Langkah 1.7 — Pasang Tailscale di Server Gudang 644
```bash
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up --authkey=<TAILSCALE_AUTH_KEY_OPSIONAL> --accept-routes
tailscale ip -4
# Simpan IP Tailscale Gudang 644 (Contoh: 100.x.y.z) untuk dihubungkan oleh Raspberry Pi
```

================================================================================
BAGIAN 2: INSTALASI GRANDPOS (RASPBERRY PI OUTLET)
================================================================================

Langkah 2.1 — Masuk ke Raspberry Pi via SSH / Terminal Lokal
```bash
ssh pi@<IP_RASPBERRY_PI_LOKAL>
```

Langkah 2.2 — Jalankan Skrip Bootstrap Pi
```bash
cd ~
if [ ! -d "grand-pos" ]; then
  git clone https://github.com/taqim2609/grand-aceh-kuliner-pos.git grand-pos
fi
cd grand-pos
chmod +x bootstrap-pi.sh install-pi.sh setup-tailscale.sh
sudo bash setup-tailscale.sh
```
Hubungkan Tailscale Pi ke akun yang sama dengan Gudang 644:
```bash
sudo tailscale up
tailscale ping <IP_TAILSCALE_GUDANG_644>
```

Langkah 2.3 — Konfigurasi Klien POS Toko
Arahkan backend API frontend Pi ke IP Tailscale Gudang 644:
Buat atau ubah file `~/.env.pi` atau file konfigurasi frontend:
```ini
VITE_API_URL=http://<IP_TAILSCALE_GUDANG_644>:3000/api
VITE_STORE_MODE=fnb_retail
```
Jalankan installer Pi:
```bash
./install-pi.sh
```

Langkah 2.4 — Konfigurasi Printer Thermal ESC/POS & Cash Drawer
Pastikan user `pi` memiliki hak akses ke port USB printer:
```bash
sudo usermod -a -G lp,dialout $USER
ls -l /dev/usb/lp* /dev/ttyUSB* 2>/dev/null || echo "Hubungkan kabel USB printer thermal"
```

Langkah 2.5 — Konfigurasi Autostart Kiosk Layar Sentuh
Aktifkan autostart Chromium Kiosk saat Raspberry Pi booting:
```bash
mkdir -p ~/.config/autostart
cat << 'EOF' > ~/.config/autostart/grandpos-kiosk.desktop
[Desktop Entry]
Type=Application
Name=Grand Aceh Kuliner POS
Exec=chromium-browser --kiosk --noerrdialogs --disable-infobars --check-for-update-interval=31536000 --disable-pinch --overscroll-history-navigation=0 http://localhost:3000
X-GNOME-Autostart-enabled=true
EOF
```

================================================================================
BAGIAN 3: KONFIGURASI HERMES MCP CLIENT (MENGHUBUNGKAN HERMES KE SISTEM)
================================================================================

Hermes Agent dapat mengendalikan seluruh sistem POS melalui protokol Model Context Protocol (MCP) Server yang sudah tertanam di `/api/mcp/sse`.

Tambahkan konfigurasi MCP client pada Hermes (misal `hermes_config.json` atau pengaturan server MCP):
```json
{
  "mcpServers": {
    "grand_aceh_pos": {
      "type": "sse",
      "url": "http://<IP_TAILSCALE_GUDANG_644>:3000/api/mcp/sse",
      "headers": {
        "Accept": "text/event-stream"
      }
    }
  }
}
```

Hermes Agent memiliki 11 Tools MCP siap panggil:
1. `pos_manage_whatsapp_config`: Mengatur provider Baileys, port, auto-send struk, dan status koneksi WA.
2. `pos_manage_server_cluster`: Memantau & mengubah konfigurasi multi-node (Gudang 644 vs Raspberry Pi), healthcheck, dan Tailscale IP.
3. `pos_manage_promos_and_coupons`: Membuat/mengedit voucher diskon kasir dan mengaktifkan banner promo hero di Landing Page publik.
4. `pos_audit_agent_actions`: Melihat rekam jejak audit mutasi sebelum dan sesudah yang dilakukan oleh AI Agent.
5. `pos_get_summary`: Ringkasan omset penjualan hari ini, total transaksi, dan status kasir.
6. `pos_list_orders`: Membaca daftar transaksi F&B dan Retail.
7. `pos_list_products`: Mengambil katalog menu, stok retail, dan produk titipan vendor.
8. `pos_update_product`: Mengubah harga, nama, kategori, dan stok barang.
9. `pos_manage_inventory`: Melakukan penyesuaian stok (*stock adjustment*).
10. `pos_check_tables`: Melihat status meja F&B (kosong, terisi, billing).
11. `pos_trigger_offline_sync`: Memicu sinkronisasi antrean offline dari kasir ke server pusat.

================================================================================
BAGIAN 4: PROTOKOL PENGUJIAN AKHIR (HEALTH CHECK)
================================================================================

Jalankan perintah berikut untuk memastikan kedua node beroperasi sempurna:
1. Tes konektivitas Tailscale dari Pi ke Gudang 644:
   `tailscale ping <IP_TAILSCALE_GUDANG_644>`
2. Tes respon REST API dari Pi:
   `curl http://<IP_TAILSCALE_GUDANG_644>:3000/api/pos/summary`
3. Tes endpoint MCP SSE:
   `curl -N http://127.0.0.1:3000/api/mcp/sse`
4. Tes status WhatsApp Gateway:
   `curl http://127.0.0.1:3000/api/agent/whatsapp/status`
5. Verifikasi tampilan Landing Page:
   Buka peramban di `http://<IP_GUDANG_644>:3000` dan pastikan banner promo serta katalog menu tampil utuh.

Setelah semua langkah di atas sukses, laporkan status:
- Gudang 644: [OK - Database, WA Port 8644, MCP SSE, Landing Page Aktif]
- GrandPOS Pi: [OK - Tailscale Terhubung, Kiosk UI Siap, Hardware Printer Siap]
- Audit Hermes: [Tercatat otomatis di /api/agent/audit-logs]
```
