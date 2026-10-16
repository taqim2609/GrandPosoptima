/* Cetak TEKS polos (laporan shift, bukti settlement vendor, daftar belanja) dari APK & browser.

   PENTING — kenapa laporan TIDAK lagi langsung dibuka di jendela browser:
   Di WebView Android (APK Sunmi / HP kasir) `window.print()` tidak didukung, dan
   `window.open(url,"_blank")` tidak membuat jendela baru — Capacitor memuat URL-nya DI DALAM
   WebView yang sama, sehingga layar aplikasi tertimpa halaman cetak yang tombol "Cetak"-nya
   tidak menghasilkan apa pun ("tidak bisa print" di Sunmi).
   Urutan cetak sekarang:
     1. Bridge printer Sunmi (APK) → cetak LANGSUNG ke printer thermal 80mm. Jalur ini sama
        dengan struk (receipt.js) dan sudah terbukti bekerja di Sunmi T2.
     2. Printer Bluetooth ESC/POS (bila mode printer = bluetooth di Pengaturan → Perangkat).
     3. Jendela cetak browser (blob + iframe) — untuk web/desktop/Chrome.
   Di APK tanpa printer yang terhubung, pengguna diberi pesan jelas alih-alih gagal diam-diam. */
import { toast } from "sonner";
import { getDeviceConfig } from "@/lib/device";
import { printPlainViaBluetooth } from "@/lib/bluetooth";
import { isNativeApp } from "@/lib/versions";

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// Lebar baris printer thermal (font bawaan 12x24): 80mm ≈ 42–44 karakter, 58mm ≈ 32.
// Nilai ini harus sinkron dengan lebar baris item struk (receipt.js `itemLine`).
export const THERMAL_WIDTH = { sunmi: 42, bluetooth: 40 };

/** Jendela cetak browser (monospace, kertas A5). Dipakai hanya di web/desktop. */
function printInBrowser(text, title = "Cetak") {
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>
      @page { size: A5; margin: 10mm } body{font-family:'Courier New',monospace;font-size:12px;white-space:pre-wrap;color:#000;margin:0}
      .bar{position:sticky;top:0;background:#fff;padding:8px 0;border-bottom:1px solid #ddd;margin-bottom:10px;font-family:system-ui,sans-serif}
      button{padding:8px 18px;border:0;border-radius:8px;background:#111;color:#fff;font-weight:700;font-family:system-ui,sans-serif}
      @media print{.bar{display:none}}</style></head><body>
      <div class="bar"><button onclick="window.print()">Cetak</button></div>
      <div>${esc(text)}</div>
    </body></html>`;
  const blob = new Blob([html], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  const w = window.open(url, "_blank", "width=560,height=760");
  if (!w) {
    const fr = document.createElement("iframe");
    fr.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
    fr.src = url;
    document.body.appendChild(fr);
    fr.onload = () => { try { fr.contentWindow.focus(); fr.contentWindow.print(); } catch (e) {} };
  }
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

/** Bridge printer Sunmi (APK) — sama seperti yang dipakai struk. null bila tak tersedia/terputus. */
function sunmiBridge() {
  try {
    const sp = window.SunmiInnerPrinter || window.sunmiInnerPrinter || window.sunmi || window.SunmiPrinterBridge;
    if (!sp || typeof sp.printText !== "function") return null;
    // Bridge APK selalu ada walau layanan printer belum ter-bind → pastikan benar-benar tersambung.
    if (typeof sp.isConnected === "function" && !sp.isConnected()) return null;
    return sp;
  } catch (e) { return null; }
}

/** Cetak baris-baris laporan ke printer thermal Sunmi. return false bila gagal. */
function printViaSunmi(sp, lines) {
  try {
    if (sp.printerInit) sp.printerInit();
    if (sp.setAlignment) sp.setAlignment(0); // laporan selalu rata kiri
    lines.forEach((l) => sp.printText(`${l}\n`));
    if (sp.lineWrap) sp.lineWrap(3);
    if (sp.cutPaper) sp.cutPaper(); // auto-cut
    return true;
  } catch (e) {
    return false;
  }
}

/** Bungkus teks laporan agar muat kertas thermal (kata tidak dipotong di tengah).
    Penanda *bold* WhatsApp dibuang karena printer thermal tidak merendernya. */
export function wrapReportText(text, width = THERMAL_WIDTH.sunmi) {
  const out = [];
  String(text ?? "").replace(/\r/g, "").split("\n").forEach((raw) => {
    const line = raw.replace(/\*/g, "").replace(/\s+$/, "");
    if (!line.trim()) { out.push(""); return; }
    // Indentasi awal dipertahankan supaya rincian tetap menjorok.
    const indent = (line.match(/^[ \t]*/) || [""])[0];
    let rest = line.trim();
    let prefix = indent;
    while (rest.length > 0) {
      const avail = Math.max(8, width - prefix.length);
      if (rest.length <= avail) { out.push(prefix + rest); break; }
      let cut = rest.lastIndexOf(" ", avail);
      if (cut <= 0) cut = avail; // satu kata lebih panjang dari lebar → potong paksa
      out.push(prefix + rest.slice(0, cut));
      rest = rest.slice(cut).replace(/^ +/, "");
      prefix = indent + "  "; // baris lanjutan diberi tambahan menjorok
    }
  });
  return out;
}

/**
 * Cetak teks laporan (laporan shift / bukti settlement / daftar belanja).
 * @returns {boolean} true bila perintah cetak sudah dikirim (atau jendela browser dibuka).
 */
export function printText(text, title = "Cetak") {
  const cfg = getDeviceConfig();
  const mode = cfg.printerMode || "auto";

  // 1. Printer thermal Sunmi (mode auto/sunmi) — jalur utama di APK.
  if (mode === "auto" || mode === "sunmi") {
    const sp = sunmiBridge();
    if (sp) {
      if (printViaSunmi(sp, wrapReportText(text, THERMAL_WIDTH.sunmi))) {
        toast.success("Dikirim ke printer Sunmi");
        return true;
      }
      toast.error("Printer Sunmi gagal mencetak — coba Tes Mandiri di Pengaturan → Perangkat", { duration: 9000 });
      return false;
    }
  }

  // 2. Printer Bluetooth ESC/POS.
  if (mode === "bluetooth") {
    printPlainViaBluetooth(wrapReportText(text, THERMAL_WIDTH.bluetooth))
      .then(() => toast.success("Dikirim ke printer Bluetooth"))
      .catch((e) => toast.error(e.message || "Gagal mencetak ke printer Bluetooth", { duration: 9000 }));
    return true;
  }

  // 3. Di APK, jendela cetak browser tidak berguna (window.print tidak didukung WebView) —
  //    beri tahu penyebabnya, jangan gagal diam-diam.
  if (isNativeApp()) {
    toast.error(mode === "browser"
      ? "Cetak lewat browser tidak tersedia di APK — pakai printer Sunmi/Bluetooth (Pengaturan → Perangkat)"
      : "Printer belum terhubung — cek mode printer di Pengaturan → Perangkat lalu Tes Mandiri", { duration: 9000 });
    return false;
  }

  // 4. Web/desktop: jendela cetak browser seperti sebelumnya.
  printInBrowser(text, title);
  return true;
}

/**
 * Cetak Laporan Penutupan Shift ke printer thermal / browser.
 * @param {object} report Objek data laporan dari backend
 * @param {object} options Opsi tambahan seperti nama outlet dan operator
 */
export function printShiftClosingReport(report, options = {}) {
  const rp = (val) => {
    if (val === undefined || val === null) return "Rp 0";
    return "Rp " + Number(val).toLocaleString("id-ID");
  };

  const outlet = options.outletName || "KASIR AKUNTANSI";
  const dateStr = (report.opened_at || "").substring(0, 10) || new Date().toISOString().substring(0, 10);
  
  let lines = [];
  lines.push("==========================================");
  lines.push(outlet.toUpperCase());
  lines.push("LAPORAN PENUTUPAN SHIFT");
  lines.push(`Tanggal: ${dateStr}`);
  lines.push("==========================================");
  lines.push(`Dibuka Oleh : ${options.openedBy || report.dibuka_oleh || "-"}`);
  lines.push(`Ditutup Oleh: ${options.closedBy || report.ditutup_oleh || "-"}`);
  lines.push(`Total Order : ${report.order_count || 0}`);
  lines.push(`Total Omzet : ${rp(report.total_sales || 0)}`);
  lines.push("------------------------------------------");
  
  // F&B Breakdown
  lines.push("RINCIAN F&B:");
  lines.push(`  Subtotal  : ${rp(report.fnb_total || 0)}`);
  lines.push(`    Dine-In : ${rp(report.by_type?.dine_in || 0)}`);
  lines.push(`    TakeAway: ${rp(report.by_type?.take_away || 0)}`);
  lines.push(`  Kas Awal  : ${rp(report.opening_cash_fnb ?? report.opening_cash ?? 0)}`);
  lines.push(`  Kas Akhir : ${rp(report.closing_cash_fnb ?? 0)}`);
  lines.push(`  Laba Kotor: ${rp(report.gross_profit_fnb || 0)}`);
  lines.push(`  Pengeluar : ${rp(report.cash_out_fnb || 0)}`);
  if (report.transport > 0) {
    lines.push(`    Transport : ${rp(report.transport)}`);
  }
  lines.push("------------------------------------------");

  // Retail Breakdown
  lines.push("RINCIAN RETAIL:");
  lines.push(`  Subtotal  : ${rp(report.retail_total || 0)}`);
  lines.push(`  Kas Awal  : ${rp(report.opening_cash_retail ?? 0)}`);
  lines.push(`  Kas Akhir : ${rp(report.closing_cash_retail ?? 0)}`);
  lines.push(`  Laba Kotor: ${rp(report.gross_profit_retail || 0)}`);
  lines.push(`  Pengeluar : ${rp(report.cash_out_retail || 0)}`);
  lines.push("------------------------------------------");

  // Void Info
  if ((report.void_count || 0) > 0) {
    lines.push(`VOID & REFUND:`);
    lines.push(`  Transaksi : ${report.void_count}x`);
    lines.push(`  Nilai     : ${rp(report.void_amount || 0)}`);
    lines.push("------------------------------------------");
  }

  // Payments Breakdown
  if (report.by_payment && Object.keys(report.by_payment).length > 0) {
    lines.push("METODE PEMBAYARAN:");
    Object.entries(report.by_payment).forEach(([k, v]) => {
      lines.push(`  - ${k}: ${rp(v)}`);
    });
    lines.push("------------------------------------------");
  }

  // Cash Laci / Sisa Tunai
  lines.push("KAS TUNAI (LACI):");
  lines.push(`  Penjualan Tunai F&B    : ${rp(report.cash_sales_fnb || 0)}`);
  lines.push(`  Sisa Kas Tunai F&B     : ${rp(report.sisa_cash_fnb || 0)}`);
  lines.push(`  Penjualan Tunai Retail : ${rp(report.cash_sales_retail || 0)}`);
  lines.push(`  Sisa Kas Tunai Retail  : ${rp(report.sisa_cash_retail || 0)}`);
  lines.push(`  Total Sisa Kas Tunai   : ${rp(report.sisa_cash || 0)}`);
  lines.push("------------------------------------------");

  // Audit Rekonsiliasi Kas
  if (report.variance_report) {
    const vr = report.variance_report;
    const totalVr = vr.total || {};
    const v_act = totalVr.actual || 0;
    const v_exp = totalVr.expected || 0;
    const v_diff = totalVr.variance || 0;
    const v_stat = totalVr.status || "match";
    const v_label = v_stat === "match" ? "SEIMBANG / KLOP" : (v_stat === "surplus" ? "LEBIH / SURPLUS" : "KURANG / SHORTAGE");

    lines.push("REKONSILIASI KAS FISIK (AUDIT AKUNTANSI)");
    lines.push(`  Kas Fisik Kasir : ${rp(v_act)}`);
    lines.push(`  Kas Sistem POS  : ${rp(v_exp)}`);
    lines.push(`  Status Selisih  : ${v_label}`);
    lines.push(`  Selisih Kas     : ${v_diff >= 0 ? "+" : ""}${rp(v_diff)}`);
    if (vr.variance_reason) {
      lines.push(`  Catatan Kasir   : ${vr.variance_reason}`);
    }
    
    if (vr.fnb && vr.retail) {
      lines.push("Rincian Selisih per Sektor:");
      lines.push(`  F&B (Sist/Fis/Sel)   : ${rp(vr.fnb.expected)} / ${rp(vr.fnb.actual)} / ${vr.fnb.variance >= 0 ? "+" : ""}${rp(vr.fnb.variance)}`);
      lines.push(`  Retail (Sist/Fis/Sel): ${rp(vr.retail.expected)} / ${rp(vr.retail.actual)} / ${vr.retail.variance >= 0 ? "+" : ""}${rp(vr.retail.variance)}`);
    }
    lines.push("------------------------------------------");
  }

  // Vendor Share
  if (report.vendor_share && report.vendor_share.length > 0) {
    lines.push("RINCIAN BAGI HASIL VENDOR:");
    report.vendor_share.forEach((v) => {
      lines.push(`  - ${v.vendor_name || "?"}:`);
      lines.push(`    Gross: ${rp(v.gross || 0)} | Share: ${rp(v.share || 0)}`);
      lines.push(`    Paid: ${rp(v.paid || 0)} | Selisih: ${rp(v.difference || 0)}`);
    });
    lines.push(`  Total Expected Share   : ${rp(report.vendor_total_share || 0)}`);
    lines.push(`  Total Real Paid        : ${rp(report.vendor_total_paid || 0)}`);
    lines.push(`  Total Selisih Vendor   : ${rp(report.vendor_total_difference || 0)}`);
    lines.push(`  Total Bagian Outlet    : ${rp(report.vendor_total_outlet || 0)}`);
    lines.push("------------------------------------------");
  }

  // Expenses Created
  if (report.expenses_created && report.expenses_created.length > 0) {
    lines.push("PENGELUARAN YANG TERCATAT:");
    report.expenses_created.forEach((x, i) => {
      lines.push(`  ${i + 1}. [${x.scope?.toUpperCase() || "FNB"}] ${x.category}: ${rp(x.amount)}`);
      if (x.note) lines.push(`     Catatan: ${x.note}`);
    });
    lines.push("------------------------------------------");
  }

  lines.push("LEMBAR VERIFIKASI AKUNTANSI FISIK");
  lines.push("");
  lines.push("Kasir Menyerahkan,   Spv/Akunting Menerima,");
  lines.push("");
  lines.push("");
  lines.push("(................)   (................)");
  lines.push("==========================================");

  const text = lines.join("\n");
  return printText(text, "Laporan Shift Closed");
}
