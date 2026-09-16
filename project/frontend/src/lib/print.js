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
