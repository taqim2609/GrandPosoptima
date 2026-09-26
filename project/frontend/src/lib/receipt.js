import { rupiah, ORDER_TYPE_LABEL } from "@/lib/format";
import { getDeviceConfig, printViaEpson } from "@/lib/device";
import { printViaBluetooth } from "@/lib/bluetooth";
import { getServerUrl } from "@/lib/api";
import { toast } from "sonner";

// ============================================================
// Logo outlet untuk struk — diambil dari server (settings/outlet),
// di-cache sebagai dataURL di localStorage supaya cetak tetap cepat.
// ============================================================
async function getOutletLogoB64() {
  try {
    const cached = localStorage.getItem("gak_logo_b64");
    if (cached) return cached;
    const base = getServerUrl() || "";
    const token = localStorage.getItem("gak_token") || "";
    const r = await fetch(`${base}/api/settings/outlet`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
    if (!r.ok) return "";
    const j = await r.json();
    const logoUrl = j.logo_url;
    if (!logoUrl) return "";
    if (logoUrl.startsWith("data:")) {
      try { localStorage.setItem("gak_logo_b64", logoUrl); } catch (_) {}
      return logoUrl;
    }
    const fullUrl = (/^https?:\/\//i.test(logoUrl) || logoUrl.startsWith("blob:"))
      ? logoUrl
      : `${base}${logoUrl.startsWith("/") ? "" : "/"}${logoUrl}`;
    const img = await fetch(fullUrl, { cache: "no-store" });
    if (!img.ok) return "";
    const blob = await img.blob();
    const b64 = await new Promise((resolve) => {
      const fr = new FileReader();
      fr.onload = () => resolve(String(fr.result || ""));
      fr.onerror = () => resolve("");
      fr.readAsDataURL(blob);
    });
    if (b64) {
      try { localStorage.setItem("gak_logo_b64", b64); } catch (_) {}
    }
    return b64;
  } catch (e) {
    return "";
  }
}

// HTML-escape any user-controlled value before it enters printable markup (prevents XSS)
export const esc = (v) =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// Generate lightweight, crisp Code 39 Barcode SVG (100% offline, zero network request)
export function generateBarcodeSvg(rawText, height = 30) {
  const CODE39 = {
    '0': '000110100', '1': '100100001', '2': '001100001', '3': '101100000',
    '4': '000110001', '5': '100110000', '6': '001110000', '7': '000100101',
    '8': '100100100', '9': '001100100', 'A': '100001001', 'B': '001001001',
    'C': '101001000', 'D': '000011001', 'E': '100011000', 'F': '001011000',
    'G': '000001101', 'H': '100001100', 'I': '001001100', 'J': '000011100',
    'K': '100000011', 'L': '001000011', 'M': '101000010', 'N': '000010011',
    'O': '100010010', 'P': '001010010', 'Q': '000000111', 'R': '100000110',
    'S': '001000110', 'T': '000010110', 'U': '110000001', 'V': '011000001',
    'W': '111000000', 'X': '010010001', 'Y': '110010000', 'Z': '011010000',
    '-': '010000101', '.': '110000100', ' ': '011000100', '$': '010101000',
    '/': '010100010', '+': '010001010', '%': '000101010', '*': '010010100'
  };

  const text = `*${String(rawText || "").toUpperCase().replace(/[^0-9A-Z\-.$/+% ]/g, "-")}*`;
  let currentX = 0;
  const rects = [];
  const narrowW = 1.1;
  const wideW = 2.4;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const pattern = CODE39[ch] || CODE39['-'];
    for (let p = 0; p < 9; p++) {
      const isBar = p % 2 === 0;
      const isWide = pattern[p] === '1';
      const w = isWide ? wideW : narrowW;
      if (isBar) {
        rects.push(`<rect x="${currentX.toFixed(1)}" y="0" width="${w.toFixed(1)}" height="${height}" fill="#000"/>`);
      }
      currentX += w;
    }
    // Inter-character narrow space
    currentX += narrowW;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${Math.ceil(currentX)} ${height}" width="${Math.min(220, Math.ceil(currentX * 1.1))}" height="${height}" style="display:block;margin:0 auto;">${rects.join("")}</svg>`;
}

// Map alignment label -> kode setAlignment Sunmi (0=kiri,1=tengah,2=kanan)
function alignCode(a) { return a === "left" ? 0 : a === "right" ? 2 : 1; }
// Map alignment label -> CSS text-align
function alignCss(a) { return a === "left" ? "left" : a === "right" ? "right" : "center"; }

// Format satu baris item di struk thermal monospace: NAMA (kiri) .... QTY x HARGA + TOTAL (kanan)
export function itemLine(name, qty, price, width = 42) {
  const rp = (n) => "Rp" + Math.round(Number(n || 0)).toLocaleString("id-ID");
  const qp = `${qty}x${rp(price)}`;
  const tot = rp(price * qty);
  const right = `${qp} ${tot}`;
  const nameW = width - right.length - 1;
  let n = String(name || "");
  if (n.length > nameW) n = n.slice(0, Math.max(0, nameW - 1)) + "~";
  const pad = Math.max(1, width - n.length - right.length);
  return n + " ".repeat(pad) + right;
}

function trySunmiPrinter(order, cfg, logoB64) {
  try {
    const sp = window.SunmiInnerPrinter || window.sunmiInnerPrinter || window.sunmi || window.SunmiPrinterBridge;
    if (!sp || typeof sp.printText !== "function") return false;
    if (typeof sp.isConnected === "function" && !sp.isConnected()) return false;
    if (sp.printerInit) sp.printerInit();

    // Penanda status khusus / pembatalan
    if (order.void_note) {
      if (sp.setAlignment) sp.setAlignment(1);
      sp.printText("================================\n");
      sp.printText("*** TRANSAKSI DIBATALKAN ***\n");
      if (sp.setTextSize) { try { sp.setTextSize(1.4); } catch (e) {} }
      sp.printText(`Alasan: ${order.void_note}\n`);
      if (sp.setTextSize) { try { sp.setTextSize(1); } catch (e) {} }
      sp.printText("================================\n");
      if (sp.setAlignment) sp.setAlignment(0);
      if (sp.lineWrap) sp.lineWrap(1);
    }

    if (order.offline) {
      if (sp.setAlignment) sp.setAlignment(1);
      sp.printText("--- STRUK OFFLINE (PENDING SYNC) ---\n");
      if (sp.setAlignment) sp.setAlignment(0);
    }

    // Logo outlet (kalau ada)
    if (logoB64 && sp.printBitmap) {
      try { sp.printBitmap(logoB64); } catch (e) {}
      if (sp.lineWrap) sp.lineWrap(1);
    }

    // Header toko
    if (sp.setAlignment) sp.setAlignment(alignCode(cfg.headerAlign));
    if (sp.setTextSize) { try { sp.setTextSize(1.2); } catch (e) {} }
    sp.printText(`${cfg.outletName || "GRANDPOS OPTIMA"}\n`);
    if (sp.setTextSize) { try { sp.setTextSize(1); } catch (e) {} }
    if (cfg.outletAddress) sp.printText(`${cfg.outletAddress}\n`);
    sp.printText("--------------------------------\n");

    // Metadata Transaksi
    if (sp.setAlignment) sp.setAlignment(0);
    sp.printText(`No. Order : ${order.order_number}\n`);
    sp.printText(`Tanggal   : ${new Date(order.paid_at || order.created_at).toLocaleString("id-ID")}\n`);
    sp.printText(`Kasir     : ${order.cashier_name || "-"}\n`);
    const typeLabel = ORDER_TYPE_LABEL[order.order_type] || order.order_type || "Umum";
    const tableInfo = order.table_name ? ` (${order.table_name})` : "";
    sp.printText(`Layanan   : ${typeLabel}${tableInfo}\n`);
    if (order.customer_name) {
      sp.printText(`Pelanggan : ${order.customer_name}${order.customer_phone ? ` (${order.customer_phone})` : ""}\n`);
    }
    sp.printText("--------------------------------\n");

    // Daftar Item
    (order.items || []).forEach((i) => {
      sp.printText(`${itemLine(i.name, i.qty, i.price)}\n`);
      if (i.notes) sp.printText(`  * Note: ${i.notes}\n`);
      if (i.weight) sp.printText(`  * Timbangan: ${Number(i.weight).toFixed(2)} ${i.weight_unit || "kg"}\n`);
    });
    sp.printText("--------------------------------\n");

    // Rincian Biaya
    sp.printText(`Subtotal      : ${rupiah(order.subtotal)}\n`);
    if (order.discount) sp.printText(`Diskon        : -${rupiah(order.discount)}\n`);
    (order.promos_applied || []).forEach((p) => {
      sp.printText(`Promo (${p}): -${rupiah(order.promo_discount || 0)}\n`);
    });
    if (order.redeem_discount) sp.printText(`Tukar Poin    : -${rupiah(order.redeem_discount)}\n`);
    if (order.service_tax) sp.printText(`Pajak Layanan : +${rupiah(order.service_tax)}\n`);
    sp.printText("================================\n");

    // Total Grand
    if (sp.setTextSize) { try { sp.setTextSize(1.3); } catch (e) {} }
    sp.printText(`TOTAL : ${rupiah(order.total)}\n`);
    if (sp.setTextSize) { try { sp.setTextSize(1); } catch (e) {} }
    sp.printText("--------------------------------\n");

    // Pembayaran
    const payParts = (order.payment_splits && order.payment_splits.length)
      ? order.payment_splits
      : (order.payment_method_name ? [{ payment_method_name: order.payment_method_name, amount: order.amount_paid || order.total }] : []);
    payParts.forEach((pp) => {
      if (sp.printText) sp.printText(`Bayar (${pp.payment_method_name}): ${rupiah(pp.amount)}\n`);
    });
    if (!(order.payment_splits && order.payment_splits.length) && order.change) {
      sp.printText(`Kembalian     : ${rupiah(order.change)}\n`);
    }
    if (order.points_earned) {
      sp.printText(`Poin Didapat  : +${order.points_earned} Poin\n`);
    }

    // Barcode / QR (kalau ada)
    if (order.qr_content && sp.printQRCode) {
      if (sp.lineWrap) sp.lineWrap(1);
      try { sp.printQRCode(order.qr_content, 8, 2); } catch (e) {}
    } else if (order.order_number && sp.printBarCode) {
      try { sp.printBarCode(order.order_number, 8, 50, 2, 2); } catch (e) {}
    }

    if (sp.lineWrap) sp.lineWrap(1);
    if (sp.setAlignment) sp.setAlignment(alignCode(cfg.footerAlign));
    sp.printText(`${cfg.footerText || "Terima kasih atas kunjungan Anda!"}\n`);
    sp.printText("Simpan struk ini sebagai bukti transaksi\n");

    // Buka laci kasir SEBELUM potong kertas
    if (cfg.cashDrawer && sp.openDrawer) { try { sp.openDrawer(); } catch (e) {} }
    if (sp.lineWrap) sp.lineWrap(3);
    if (sp.cutPaper) sp.cutPaper();
    return true;
  } catch (e) {
    return false;
  }
}

export function generateReceiptHtml(order, cfg, logoB64) {
  const dt = new Date(order.paid_at || order.created_at).toLocaleDateString("id-ID", {
    day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit"
  });

  const barcodeSvg = generateBarcodeSvg(order.order_number || "ORDER", 32);

  const rows = (order.items || [])
    .map(
      (i) => `
        <div class="item-block">
          <div class="item-header">
            <span class="item-name">${esc(i.name)}</span>
            <span class="item-tot">${rupiah(i.price * i.qty)}</span>
          </div>
          <div class="item-sub">
            <span>${i.qty} x ${rupiah(i.price)}</span>
            ${i.weight ? `<span class="item-note">(${Number(i.weight).toFixed(2)} ${esc(i.weight_unit || "kg")})</span>` : ""}
            ${i.notes ? `<span class="item-note">Catatan: ${esc(i.notes)}</span>` : ""}
          </div>
        </div>
      `
    )
    .join("");

  const paySplits = (order.payment_splits && order.payment_splits.length)
    ? order.payment_splits.map(pp => `
        <div class="fee-row">
          <span>Bayar (${esc(pp.payment_method_name)})</span>
          <span class="mono">${rupiah(pp.amount)}</span>
        </div>
      `).join("")
    : (order.payment_method_name ? `
        <div class="fee-row">
          <span>Metode Pembayaran</span>
          <span class="mono font-bold">${esc(order.payment_method_name)}</span>
        </div>
        <div class="fee-row">
          <span>Bayar / Diterima</span>
          <span class="mono">${rupiah(order.amount_paid || order.total)}</span>
        </div>
      ` : "");

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>Struk ${esc(order.order_number)}</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;700;800&family=Plus+Jakarta+Sans:wght@500;700;800&display=swap" rel="stylesheet">
  <style>
    @page {
      size: 80mm auto;
      margin: 0;
    }
    @media print {
      body {
        width: 78mm;
        margin: 0 auto;
        padding: 4mm 2mm;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      .no-print { display: none !important; }
      .receipt-card { box-shadow: none !important; border: none !important; }
    }
    * { box-sizing: border-box; }
    body {
      font-family: 'JetBrains Mono', 'Courier Prime', Menlo, Consolas, monospace;
      background: #FFFFFF;
      color: #111827;
      margin: 0 auto;
      padding: 12px 14px;
      width: 100%;
      max-width: 340px;
      font-size: 11px;
      line-height: 1.45;
      -webkit-font-smoothing: antialiased;
    }
    .receipt-card {
      background: #FFFFFF;
      position: relative;
    }
    .c { text-align: center; }
    .r { text-align: right; }
    .l { text-align: left; }
    .mono { font-family: 'JetBrains Mono', monospace; }
    .font-bold { font-weight: 700; }
    .font-heavy { font-weight: 800; }
    
    /* Header Outlet */
    .logo-wrap { margin-bottom: 8px; }
    .logo-img { max-width: 140px; max-height: 58px; object-fit: contain; filter: contrast(130%); }
    .outlet-name {
      font-family: 'Plus Jakarta Sans', 'JetBrains Mono', sans-serif;
      font-size: 15px;
      font-weight: 800;
      letter-spacing: 0.5px;
      text-transform: uppercase;
      margin: 0 0 3px 0;
      color: #000;
    }
    .outlet-address {
      font-size: 10px;
      color: #374151;
      margin-bottom: 6px;
      line-height: 1.35;
    }

    /* Dividers */
    .divider-dash {
      border: 0;
      border-top: 1px dashed #000;
      margin: 8px 0;
    }
    .divider-double {
      border: 0;
      border-top: 2px double #000;
      margin: 8px 0;
    }
    .divider-solid {
      border: 0;
      border-top: 1px solid #000;
      margin: 8px 0;
    }

    /* Meta Info */
    .meta-grid {
      display: flex;
      flex-direction: column;
      gap: 2.5px;
      font-size: 10.5px;
    }
    .meta-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .meta-label { color: #4B5563; }
    .meta-val { font-weight: 600; color: #000; }
    .badge-service {
      display: inline-block;
      border: 1px solid #000;
      padding: 1px 6px;
      font-size: 9.5px;
      font-weight: 700;
      border-radius: 3px;
      text-transform: uppercase;
      margin-top: 2px;
    }
    
    /* Special Alerts */
    .banner-offline {
      background: #000;
      color: #fff;
      font-weight: 700;
      font-size: 9.5px;
      padding: 3px 6px;
      text-align: center;
      border-radius: 3px;
      margin-bottom: 6px;
      letter-spacing: 0.5px;
    }
    .banner-void {
      border: 2px solid #000;
      padding: 5px;
      text-align: center;
      margin-bottom: 8px;
    }
    .banner-void-title { font-size: 13px; font-weight: 800; letter-spacing: 1px; }
    .banner-void-desc { font-size: 10px; margin-top: 2px; }

    /* Items List */
    .items-container {
      margin: 4px 0;
    }
    .item-block {
      margin-bottom: 6px;
    }
    .item-header {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      font-size: 11px;
    }
    .item-name {
      font-weight: 700;
      color: #000;
      flex: 1;
      padding-right: 8px;
    }
    .item-tot {
      font-weight: 700;
      white-space: nowrap;
    }
    .item-sub {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      font-size: 9.5px;
      color: #4B5563;
      margin-top: 1px;
    }
    .item-note {
      font-style: italic;
      color: #374151;
    }

    /* Financial Summary */
    .fee-list {
      display: flex;
      flex-direction: column;
      gap: 3px;
    }
    .fee-row {
      display: flex;
      justify-content: space-between;
      font-size: 10.5px;
    }
    .fee-row.highlight-disc {
      font-weight: 600;
    }
    .grand-total-box {
      border-top: 1.5px solid #000;
      border-bottom: 1.5px solid #000;
      padding: 6px 0;
      margin: 6px 0;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .grand-total-label {
      font-size: 13px;
      font-weight: 800;
      letter-spacing: 0.5px;
    }
    .grand-total-val {
      font-size: 15px;
      font-weight: 800;
    }

    /* Member Points */
    .loyalty-box {
      border: 1px dashed #666;
      border-radius: 4px;
      padding: 4px 8px;
      margin: 6px 0;
      text-align: center;
      font-size: 10px;
      font-weight: 600;
    }

    /* Barcode & Footer */
    .barcode-section {
      text-align: center;
      margin: 10px 0 6px 0;
    }
    .barcode-text {
      font-size: 9px;
      letter-spacing: 2px;
      margin-top: 3px;
      font-weight: 700;
    }
    .footer-section {
      margin-top: 10px;
      text-align: center;
      font-size: 9.5px;
      color: #374151;
      line-height: 1.4;
    }
    .tear-cut {
      margin-top: 12px;
      text-align: center;
      font-size: 8.5px;
      color: #9CA3AF;
      letter-spacing: 1px;
    }
  </style>
</head>
<body>
  <div class="receipt-card">
    ${logoB64 ? `<div class="logo-wrap" style="text-align:${alignCss(cfg.headerAlign)}"><img class="logo-img" src="${logoB64}" alt="Logo Outlet" /></div>` : ""}

    <div style="text-align:${alignCss(cfg.headerAlign)}">
      <div class="outlet-name">${esc(cfg.outletName || "GRANDPOS OPTIMA")}</div>
      ${cfg.outletAddress ? `<div class="outlet-address">${esc(cfg.outletAddress)}</div>` : ""}
    </div>

    ${order.offline ? `<div class="banner-offline">*** STRUK OFFLINE — TERSINKRON OTOMATIS ***</div>` : ""}
    ${order.void_note ? `
      <div class="banner-void">
        <div class="banner-void-title">TRANSAKSI DIBATALKAN</div>
        <div class="banner-void-desc">Alasan: ${esc(order.void_note)}</div>
      </div>
    ` : ""}

    <div class="divider-dash"></div>

    <div class="meta-grid">
      <div class="meta-row">
        <span class="meta-label">No. Order</span>
        <span class="meta-val">${esc(order.order_number)}</span>
      </div>
      <div class="meta-row">
        <span class="meta-label">Waktu</span>
        <span class="meta-val">${esc(dt)}</span>
      </div>
      <div class="meta-row">
        <span class="meta-label">Kasir</span>
        <span class="meta-val">${esc(order.cashier_name || "-")}</span>
      </div>
      <div class="meta-row">
        <span class="meta-label">Layanan</span>
        <span class="badge-service">${esc(ORDER_TYPE_LABEL[order.order_type] || order.order_type || "Umum")}${order.table_name ? ` • Meja ${esc(order.table_name)}` : ""}</span>
      </div>
      ${order.customer_name ? `
        <div class="meta-row">
          <span class="meta-label">Pelanggan</span>
          <span class="meta-val">${esc(order.customer_name)}${order.customer_phone ? ` (${esc(order.customer_phone)})` : ""}</span>
        </div>
      ` : ""}
    </div>

    <div class="divider-dash"></div>

    <div class="items-container">
      ${rows}
    </div>

    <div class="divider-dash"></div>

    <div class="fee-list">
      <div class="fee-row">
        <span>Subtotal</span>
        <span class="mono">${rupiah(order.subtotal)}</span>
      </div>
      ${order.discount ? `
        <div class="fee-row highlight-disc">
          <span>Diskon ${order.discount_reason ? `(${esc(order.discount_reason)})` : ""}</span>
          <span class="mono">-${rupiah(order.discount)}</span>
        </div>
      ` : ""}
      ${(order.promos_applied || []).length ? `
        <div class="fee-row highlight-disc">
          <span>Promo (${esc(order.promos_applied.join(", "))})</span>
          <span class="mono">-${rupiah(order.promo_discount || 0)}</span>
        </div>
      ` : ""}
      ${order.coupon_code ? `
        <div class="fee-row highlight-disc">
          <span>Kupon (${esc(order.coupon_code)})</span>
          <span class="mono">Terpasang</span>
        </div>
      ` : ""}
      ${order.redeem_discount ? `
        <div class="fee-row highlight-disc">
          <span>Tukar Poin Member</span>
          <span class="mono">-${rupiah(order.redeem_discount)}</span>
        </div>
      ` : ""}
      ${order.service_tax ? `
        <div class="fee-row">
          <span>Pajak Layanan</span>
          <span class="mono">+${rupiah(order.service_tax)}</span>
        </div>
      ` : ""}
    </div>

    <div class="grand-total-box">
      <span class="grand-total-label">TOTAL</span>
      <span class="grand-total-val mono">${rupiah(order.total)}</span>
    </div>

    <div class="fee-list">
      ${paySplits}
      ${!(order.payment_splits && order.payment_splits.length) && order.change ? `
        <div class="fee-row font-bold">
          <span>Kembalian</span>
          <span class="mono">${rupiah(order.change)}</span>
        </div>
      ` : ""}
    </div>

    ${order.points_earned ? `
      <div class="loyalty-box">
        🎉 Selamat! Anda mendapat +${order.points_earned} Poin Member
      </div>
    ` : ""}

    <div class="barcode-section">
      ${barcodeSvg}
      <div class="barcode-text">${esc(order.order_number)}</div>
    </div>

    <div class="divider-dash"></div>

    <div class="footer-section" style="text-align:${alignCss(cfg.footerAlign)}">
      <div class="font-bold">${esc(cfg.footerText || "Terima Kasih Atas Kunjungan Anda")}</div>
      <div>Barang yang sudah dibeli tidak dapat ditukar/dikembalikan</div>
      <div style="font-size:8.5px;margin-top:4px;color:#6B7280">Powered by GrandPOS Optima</div>
    </div>

    <div class="tear-cut">
      - - - - - - - - - ✂ POTONG DI SINI ✂ - - - - - - - - -
    </div>
  </div>
  <script>
    window.onload = function() {
      window.print();
      setTimeout(function() { window.close(); }, 500);
    };
  </script>
</body>
</html>`;
}

function browserPrint(order, cfg, logoB64) {
  const html = generateReceiptHtml(order, cfg, logoB64);
  
  // Try printing via hidden iframe first (avoids popup blocker in iframes/embedded webview)
  try {
    const existing = document.getElementById("gak-receipt-print-frame");
    if (existing) existing.remove();

    const iframe = document.createElement("iframe");
    iframe.id = "gak-receipt-print-frame";
    iframe.style.position = "fixed";
    iframe.style.top = "-9999px";
    iframe.style.left = "-9999px";
    iframe.style.width = "1px";
    iframe.style.height = "1px";
    iframe.style.opacity = "0";
    iframe.style.pointerEvents = "none";
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow?.document || iframe.contentDocument;
    if (doc) {
      doc.open();
      doc.write(html);
      doc.close();
      setTimeout(() => {
        try {
          iframe.contentWindow?.focus();
          iframe.contentWindow?.print();
        } catch (_) {
          // Fallback to window.open if iframe print fails
          fallbackWindowOpen(html);
        }
        setTimeout(() => {
          try { iframe.remove(); } catch (_) {}
        }, 5000);
      }, 400);
      return;
    }
  } catch (e) {
    // Fallback to window.open
  }

  fallbackWindowOpen(html);
}

function fallbackWindowOpen(html) {
  try {
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const w = window.open(url, "_blank", "width=380,height=680,menubar=no,toolbar=no,location=no,status=no");
    if (w) {
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } else {
      toast.error("Pop-up diblokir browser. Izinkan pop-up atau gunakan pratinjau struk di layar.");
    }
  } catch (e) {
    toast.error("Gagal membuka dialog cetak.");
  }
}

export async function printReceipt(order) {
  const cfg = getDeviceConfig();
  const logoB64 = await getOutletLogoB64();
  if (cfg.printerMode === "epson") {
    try {
      await printViaEpson(order, cfg);
    } catch (e) {
      toast.error(e.message || "Gagal mencetak ke printer Epson");
      browserPrint(order, cfg, logoB64); // fallback so struk tetap keluar
    }
    return;
  }
  if (cfg.printerMode === "browser") return browserPrint(order, cfg, logoB64);
  if (cfg.printerMode === "bluetooth") {
    try {
      await printViaBluetooth(order);
    } catch (e) {
      toast.error(e.message || "Gagal mencetak ke printer Bluetooth");
      browserPrint(order, cfg, logoB64);
    }
    return;
  }
  // "auto" or "sunmi": coba printer Sunmi bawaan, jatuh ke browser bila tak ada
  if (trySunmiPrinter(order, cfg, logoB64)) return;
  browserPrint(order, cfg, logoB64);
}
