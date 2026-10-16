import { useState, useMemo } from "react";
import {
  AlertCircle,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Banknote,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Coins,
  Copy,
  CreditCard,
  ExternalLink,
  FileSpreadsheet,
  FileText,
  Handshake,
  Layers,
  Loader2,
  MessageCircle,
  Percent,
  Printer,
  Receipt,
  Scale,
  Send,
  ShieldAlert,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Store,
  Tag,
  TrendingDown,
  TrendingUp,
  UserCheck,
  Utensils,
  Wallet,
  Zap,
} from "lucide-react";
import { rupiah } from "@/lib/format";
import { toast } from "sonner";
import { copyText } from "@/lib/utils";
import { printText as printText_, printShiftClosingReport } from "@/lib/print";

export default function ShiftClosingReportView({
  report,
  reportsByScope = null,
  shiftId = "",
  biz = null,
  onSendWa = null,
  sendingWa = false,
  onPrintPreview = null,
  printLoading = false,
  className = "",
}) {
  const [viewMode, setViewMode] = useState("dashboard"); // "dashboard" | "thermal" | "audit"
  const [paperWidth, setPaperWidth] = useState(80); // 80 or 58 mm
  const [openVendorDetails, setOpenVendorDetails] = useState({});
  const [isPrintingSunmi, setIsPrintingSunmi] = useState(false);
  const [copied, setCopied] = useState(false);

  if (!report) return null;

  const lbFnb = biz?.fnb_label || "F&B";
  const lbRetail = biz?.retail_label || "Retail";
  const outletName = biz?.name || "GRAND ACEH KULINER POS";

  // Calculate Variance Status
  const varianceReport = report.variance_report?.total || null;
  const varianceVal = varianceReport?.variance ?? 0;
  const isMatch = varianceReport?.status === "match" || varianceVal === 0;
  const isSurplus = varianceReport?.status === "surplus" || varianceVal > 0;
  const isShortage = varianceReport?.status === "shortage" || varianceVal < 0;

  // Payments total
  const paymentMethods = report.by_payment || {};
  const totalSales = Number(report.total_sales || 0);

  // Vendor Totals
  const vendorShares = report.vendor_share || [];
  const vendorTotalGross = vendorShares.reduce((acc, v) => acc + (v.gross || 0), 0);
  const vendorTotalShare = Number(report.vendor_total_share || 0);
  const vendorTotalPaid = Number(report.vendor_total_paid || 0);
  const vendorTotalOutlet = Number(report.vendor_total_outlet || (vendorTotalGross - vendorTotalShare));

  // Quick Sunmi Print Action
  const handlePrintSunmi = () => {
    setIsPrintingSunmi(true);
    try {
      printShiftClosingReport(report, {
        outletName,
        openedBy: report.dibuka_oleh || report.cashier_name || "-",
        closedBy: report.ditutup_oleh || report.closed_by || "-",
      });
      toast.success("Perintah cetak laporan shift dikirim ke Printer Thermal Sunmi!");
    } catch (e) {
      toast.error("Gagal mencetak ke Sunmi: " + e.message);
    } finally {
      setIsPrintingSunmi(false);
    }
  };

  // Generate clean WhatsApp / Text formatted copy
  const handleCopyReportText = async () => {
    try {
      const lines = [];
      lines.push(`📊 *LAPORAN PENUTUPAN SHIFT*`);
      lines.push(`🏪 *${outletName}*`);
      lines.push(`🕒 Tanggal: ${report.closed_at ? new Date(report.closed_at).toLocaleDateString("id-ID") : new Date().toLocaleDateString("id-ID")}`);
      lines.push(`👤 Pembuka: ${report.dibuka_oleh || "-"}`);
      lines.push(`👤 Penutup: ${report.ditutup_oleh || report.closed_by || "-"}`);
      lines.push(`----------------------------------------`);
      lines.push(`📦 *TOTAL PENJUALAN*: ${rupiah(report.total_sales)} (${report.order_count || 0} Order)`);
      lines.push(`  • ${lbFnb}: ${rupiah(report.fnb_total || 0)} (Dine-in: ${rupiah(report.by_type?.dine_in || 0)}, Takeaway: ${rupiah(report.by_type?.take_away || 0)})`);
      lines.push(`  • ${lbRetail}: ${rupiah(report.retail_total || 0)}`);
      lines.push(`----------------------------------------`);
      lines.push(`💳 *METODE PEMBAYARAN*:`);
      Object.entries(paymentMethods).forEach(([k, v]) => {
        lines.push(`  • ${k}: ${rupiah(v)}`);
      });
      lines.push(`----------------------------------------`);
      lines.push(`💸 *PENGELUARAN KAS*:`);
      lines.push(`  • ${lbFnb}: ${rupiah(report.cash_out_fnb || 0)}`);
      lines.push(`  • ${lbRetail}: ${rupiah(report.cash_out_retail || 0)}`);
      if (report.transport > 0) lines.push(`  • Uang Transport (Wajib): ${rupiah(report.transport)}`);
      lines.push(`----------------------------------------`);
      lines.push(`⚖️ *REKONSILIASI KAS FISIK*:`);
      lines.push(`  • Kas Sistem (Expected): ${rupiah(varianceReport?.expected ?? report.expected_cash ?? 0)}`);
      lines.push(`  • Kas Fisik (Actual): ${rupiah(varianceReport?.actual ?? (Number(report.closing_cash_fnb || 0) + Number(report.closing_cash_retail || 0)))}`);
      lines.push(`  • Status: ${isMatch ? "✓ MATCH (Seimbang)" : isSurplus ? `+ SURPLUS (+${rupiah(varianceVal)})` : `- SHORTAGE (-${rupiah(Math.abs(varianceVal))})`}`);
      if (report.variance_report?.variance_reason) {
        lines.push(`  • Catatan Selisih: "${report.variance_report.variance_reason}"`);
      }
      if (vendorShares.length > 0) {
        lines.push(`----------------------------------------`);
        lines.push(`👥 *BAGI HASIL VENDOR*:`);
        lines.push(`  • Omzet Vendor: ${rupiah(vendorTotalGross)}`);
        lines.push(`  • Hak Vendor: ${rupiah(vendorTotalShare)} (Diserahkan: ${rupiah(vendorTotalPaid)})`);
        lines.push(`  • Bagian Outlet: ${rupiah(vendorTotalOutlet)}`);
      }
      lines.push(`----------------------------------------`);
      lines.push(`💰 *UANG BERSIH OUTLET*: ${rupiah(report.net_cash || 0)}`);
      lines.push(`💵 *SISA KAS FISIK*: ${rupiah(report.sisa_cash || 0)}`);

      const text = lines.join("\n");
      const ok = await copyText(text);
      if (ok) {
        setCopied(true);
        toast.success("Laporan shift disalin dalam format WhatsApp!");
        setTimeout(() => setCopied(false), 3000);
      }
    } catch (e) {
      toast.error("Gagal menyalin: " + e.message);
    }
  };

  return (
    <div
      className={`bg-white rounded-3xl border border-zinc-200/90 shadow-xl overflow-hidden transition-all duration-300 ${className}`}
      data-testid="shift-closing-report-redesigned"
    >
      {/* =========================================================================
          1. HEADER BANNER & SHIFT META
         ========================================================================= */}
      <div className="bg-gradient-to-br from-zinc-950 via-zinc-900 to-zinc-950 text-white p-6 md:p-8 relative overflow-hidden">
        {/* Background ambient decoration */}
        <div className="absolute -right-16 -top-16 w-64 h-64 bg-rose-600/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -left-16 -bottom-16 w-64 h-64 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2.5 flex-wrap">
              <span className="px-3 py-1 rounded-full text-xs font-black bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1.5 uppercase tracking-wider">
                <CheckCircle2 size={13} className="text-emerald-400" />
                Shift Resmi Ditutup
              </span>
              {shiftId && (
                <span className="px-2.5 py-1 rounded-full text-xs font-mono text-zinc-400 bg-zinc-800/80 border border-zinc-700">
                  ID: #{String(shiftId).slice(-8)}
                </span>
              )}
            </div>

            <h2 className="text-2xl md:text-3xl font-black tracking-tight text-white flex items-center gap-2.5">
              <FileText className="text-rose-500" size={28} />
              Laporan Rekonsiliasi &amp; Tutup Shift
            </h2>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-zinc-300">
              <div className="flex items-center gap-1.5">
                <Store size={14} className="text-zinc-400" />
                <span className="font-semibold text-white">{outletName}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Clock size={14} className="text-zinc-400" />
                <span>
                  {report.closed_at
                    ? new Date(report.closed_at).toLocaleString("id-ID", {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })
                    : new Date().toLocaleString("id-ID")}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <UserCheck size={14} className="text-zinc-400" />
                <span>
                  Buka: <strong className="text-white">{report.dibuka_oleh || "-"}</strong>
                  {" · "}
                  Tutup: <strong className="text-white">{report.ditutup_oleh || report.closed_by || "-"}</strong>
                </span>
              </div>
            </div>
          </div>

          {/* Quick Action Buttons */}
          <div className="flex flex-wrap items-center gap-2.5 self-start md:self-center">
            {/* View Switcher */}
            <div className="bg-zinc-800/90 border border-zinc-700/80 p-1 rounded-xl flex items-center gap-1">
              <button
                type="button"
                onClick={() => setViewMode("dashboard")}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                  viewMode === "dashboard"
                    ? "bg-white text-zinc-950 shadow-sm"
                    : "text-zinc-400 hover:text-white"
                }`}
              >
                <Layers size={13} /> Dashboard
              </button>
              <button
                type="button"
                onClick={() => setViewMode("thermal")}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                  viewMode === "thermal"
                    ? "bg-white text-zinc-950 shadow-sm"
                    : "text-zinc-400 hover:text-white"
                }`}
              >
                <Receipt size={13} /> Kertas Struk
              </button>
            </div>

            {/* Print Sunmi */}
            <button
              type="button"
              data-testid="shift-print-sunmi-btn"
              onClick={handlePrintSunmi}
              disabled={isPrintingSunmi}
              className="px-4 h-10 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs flex items-center gap-2 transition shadow-lg shadow-rose-600/30 disabled:opacity-50"
            >
              <Printer size={15} className={isPrintingSunmi ? "animate-spin" : ""} />
              Cetak Thermal Sunmi
            </button>

            {/* Send WhatsApp */}
            {onSendWa && (
              <button
                type="button"
                data-testid="shift-send-wa-btn"
                onClick={onSendWa}
                disabled={sendingWa || !shiftId}
                className="px-3.5 h-10 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-2 transition shadow-lg shadow-emerald-600/20 disabled:opacity-50"
                title="Kirim laporan lengkap ke nomor WhatsApp Pemilik & Kasir"
              >
                {sendingWa ? <Loader2 size={15} className="animate-spin" /> : <MessageCircle size={15} />}
                Kirim WA
              </button>
            )}

            {/* Copy WhatsApp text */}
            <button
              type="button"
              onClick={handleCopyReportText}
              className="p-2.5 h-10 w-10 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white transition flex items-center justify-center border border-zinc-700"
              title="Salin teks laporan format WhatsApp"
            >
              <Copy size={16} className={copied ? "text-emerald-400" : ""} />
            </button>
          </div>
        </div>
      </div>

      {/* =========================================================================
          2. SUMMARY KPI STATS CARDS (OMZET, UANG BERSIH, SISA KAS, SELISIH)
         ========================================================================= */}
      <div className="p-6 md:p-8 bg-zinc-50/70 border-b border-zinc-200 space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          
          {/* Card 1: Total Omzet Penjualan */}
          <div className="bg-white border border-zinc-200/90 rounded-2xl p-5 shadow-sm space-y-3 relative overflow-hidden">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
                <ShoppingBag size={14} className="text-zinc-500" />
                Total Penjualan
              </span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-zinc-100 text-zinc-700">
                {report.order_count || 0} Order
              </span>
            </div>
            <div>
              <div className="text-2xl lg:text-3xl font-black text-zinc-900 tracking-tight" data-testid="kpi-total-sales">
                {rupiah(report.total_sales || 0)}
              </div>
              <div className="text-[11px] text-zinc-500 mt-1 flex items-center gap-1.5 font-medium">
                <span>{lbFnb}: <strong>{rupiah(report.fnb_total || 0)}</strong></span>
                <span>•</span>
                <span>{lbRetail}: <strong>{rupiah(report.retail_total || 0)}</strong></span>
              </div>
            </div>
            <div className="h-1.5 w-full bg-zinc-100 rounded-full overflow-hidden flex">
              <div
                className="bg-rose-500 h-full transition-all duration-500"
                style={{
                  width: `${totalSales > 0 ? ((report.fnb_total || 0) / totalSales) * 100 : 50}%`,
                }}
                title={`${lbFnb}: ${rupiah(report.fnb_total || 0)}`}
              />
              <div
                className="bg-amber-500 h-full transition-all duration-500"
                style={{
                  width: `${totalSales > 0 ? ((report.retail_total || 0) / totalSales) * 100 : 50}%`,
                }}
                title={`${lbRetail}: ${rupiah(report.retail_total || 0)}`}
              />
            </div>
          </div>

          {/* Card 2: Uang Bersih Outlet (Setelah Bagi Hasil & Pengeluaran) */}
          <div className="bg-white border border-emerald-200/80 rounded-2xl p-5 shadow-sm space-y-3 relative overflow-hidden">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-emerald-700 flex items-center gap-1.5">
                <Wallet size={14} className="text-emerald-600" />
                Uang Bersih Outlet
              </span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-50 text-emerald-800 border border-emerald-200">
                Net Profit
              </span>
            </div>
            <div>
              <div className="text-2xl lg:text-3xl font-black text-emerald-600 tracking-tight" data-testid="kpi-net-cash">
                {rupiah(report.net_cash || 0)}
              </div>
              <div className="text-[11px] text-emerald-700/80 mt-1 font-medium">
                {lbFnb}: {rupiah(report.net_cash_fnb || 0)} · {lbRetail}: {rupiah(report.net_cash_retail || 0)}
              </div>
            </div>
            <div className="text-[10px] font-semibold text-emerald-600/90 flex items-center gap-1">
              <Sparkles size={11} /> Setelah biaya operasional &amp; bagi hasil
            </div>
          </div>

          {/* Card 3: Sisa Kas Fisik Kasir */}
          <div className="bg-white border border-zinc-200/90 rounded-2xl p-5 shadow-sm space-y-3 relative overflow-hidden">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
                <Banknote size={14} className="text-zinc-500" />
                Sisa Kas Tunai Kasir
              </span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-zinc-100 text-zinc-700">
                Laci Kasir
              </span>
            </div>
            <div>
              <div
                className={`text-2xl lg:text-3xl font-black tracking-tight ${
                  (report.sisa_cash || 0) < 0 ? "text-amber-600" : "text-zinc-900"
                }`}
                data-testid="kpi-sisa-cash"
              >
                {rupiah(report.sisa_cash || 0)}
              </div>
              <div className="text-[11px] text-zinc-500 mt-1 font-medium">
                Kas masuk tunai dikurangi belanja operasional
              </div>
            </div>
            <div className="text-[10px] text-zinc-400 font-medium truncate">
              {lbFnb}: {rupiah(report.sisa_cash_fnb || 0)} | {lbRetail}: {rupiah(report.sisa_cash_retail || 0)}
            </div>
          </div>

          {/* Card 4: Status Rekonsiliasi & Selisih Kas */}
          <div
            className={`border rounded-2xl p-5 shadow-sm space-y-3 relative overflow-hidden ${
              isMatch
                ? "bg-white border-emerald-200"
                : isSurplus
                ? "bg-blue-50/50 border-blue-200"
                : "bg-rose-50/60 border-rose-200"
            }`}
          >
            <div className="flex items-center justify-between">
              <span
                className={`text-[11px] font-extrabold uppercase tracking-wider flex items-center gap-1.5 ${
                  isMatch ? "text-emerald-700" : isSurplus ? "text-blue-700" : "text-rose-700"
                }`}
              >
                <Scale size={14} />
                Rekonsiliasi Kas
              </span>
              <span
                className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${
                  isMatch
                    ? "bg-emerald-100 text-emerald-800"
                    : isSurplus
                    ? "bg-blue-100 text-blue-800"
                    : "bg-rose-100 text-rose-800"
                }`}
              >
                {isMatch ? "Match" : isSurplus ? "+ Surplus" : "- Shortage"}
              </span>
            </div>
            <div>
              <div
                className={`text-2xl lg:text-3xl font-black tracking-tight ${
                  isMatch ? "text-emerald-600" : isSurplus ? "text-blue-600" : "text-rose-600"
                }`}
                data-testid="kpi-variance-amount"
              >
                {isMatch ? "Rp 0" : `${varianceVal >= 0 ? "+" : ""}${rupiah(varianceVal)}`}
              </div>
              <div
                className={`text-[11px] mt-1 font-medium ${
                  isMatch ? "text-emerald-700" : isSurplus ? "text-blue-700" : "text-rose-700"
                }`}
              >
                {isMatch
                  ? "✓ Fisik laci tepat sesuai sistem"
                  : isSurplus
                  ? `Kelebihan uang fisik di kasir`
                  : `Kekurangan uang fisik di kasir`}
              </div>
            </div>
            {report.variance_report?.variance_reason && (
              <div className="text-[10px] italic text-zinc-600 truncate">
                "{report.variance_report.variance_reason}"
              </div>
            )}
          </div>

        </div>

        {/* Banner Catatan Selisih Kas jika tidak seimbang */}
        {!isMatch && (
          <div
            className={`p-4 rounded-2xl border flex items-start gap-3.5 ${
              isSurplus ? "bg-blue-50 border-blue-200 text-blue-950" : "bg-rose-50 border-rose-200 text-rose-950"
            }`}
          >
            <div
              className={`p-2 rounded-xl shrink-0 ${
                isSurplus ? "bg-blue-600 text-white" : "bg-rose-600 text-white"
              }`}
            >
              <ShieldAlert size={18} />
            </div>
            <div className="space-y-1 text-xs">
              <div className="font-extrabold text-sm flex items-center gap-2">
                <span>Catatan Audit Selisih Fisik vs Sistem</span>
                <span className="font-mono px-2 py-0.5 rounded bg-white/70 font-black">
                  {varianceVal >= 0 ? "+" : ""}{rupiah(varianceVal)}
                </span>
              </div>
              <p className="opacity-90 leading-relaxed">
                {report.variance_report?.variance_reason ? (
                  <>
                    Alasan dari kasir: <strong className="italic font-bold">"{report.variance_report.variance_reason}"</strong>
                  </>
                ) : (
                  "Tidak ada catatan tertulis dari kasir saat penutupan shift."
                )}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* =========================================================================
          3. VIEW MODE: DASHBOARD VS THERMAL PAPER SIMULATOR
         ========================================================================= */}
      {viewMode === "dashboard" ? (
        <div className="p-6 md:p-8 space-y-8">
          
          {/* SEKSI 1: RINCIAN PENJUALAN PER DIVISI & METODE PEMBAYARAN */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            
            {/* Kolom Kiri: Rincian Omzet Divisi & Kas Awal/Akhir */}
            <div className="bg-white border border-zinc-200 rounded-2xl p-5 space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-zinc-100">
                <h3 className="font-extrabold text-sm text-zinc-900 flex items-center gap-2">
                  <Store size={16} className="text-zinc-700" />
                  Rincian Penjualan &amp; Kas Divisi
                </h3>
                <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">
                  Breakdown
                </span>
              </div>

              {/* F&B Section */}
              <div className="bg-zinc-50/80 rounded-xl p-3.5 border border-zinc-200/70 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-extrabold text-xs text-zinc-900 flex items-center gap-1.5">
                    <Utensils size={14} className="text-rose-600" />
                    Divisi {lbFnb}
                  </span>
                  <span className="font-black text-sm text-zinc-900">{rupiah(report.fnb_total || 0)}</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs pt-1 border-t border-zinc-200/50 text-zinc-600">
                  <div className="flex justify-between">
                    <span>Dine-In:</span>
                    <span className="font-mono font-bold">{rupiah(report.by_type?.dine_in || 0)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Take Away:</span>
                    <span className="font-mono font-bold">{rupiah(report.by_type?.take_away || 0)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Kas Awal:</span>
                    <span className="font-mono">{rupiah(report.opening_cash_fnb ?? report.opening_cash ?? 0)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Kas Fisik Akhir:</span>
                    <span className="font-mono font-bold">{rupiah(report.closing_cash_fnb ?? 0)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Laba Kotor:</span>
                    <span className="font-mono text-emerald-600 font-bold">{rupiah(report.gross_profit_fnb || 0)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Pengeluaran:</span>
                    <span className="font-mono text-rose-600">{rupiah(report.cash_out_fnb || 0)}</span>
                  </div>
                </div>
              </div>

              {/* Retail Section */}
              <div className="bg-zinc-50/80 rounded-xl p-3.5 border border-zinc-200/70 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-extrabold text-xs text-zinc-900 flex items-center gap-1.5">
                    <ShoppingBag size={14} className="text-amber-600" />
                    Divisi {lbRetail}
                  </span>
                  <span className="font-black text-sm text-zinc-900">{rupiah(report.retail_total || 0)}</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs pt-1 border-t border-zinc-200/50 text-zinc-600">
                  <div className="flex justify-between">
                    <span>Kas Awal:</span>
                    <span className="font-mono">{rupiah(report.opening_cash_retail ?? 0)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Kas Fisik Akhir:</span>
                    <span className="font-mono font-bold">{rupiah(report.closing_cash_retail ?? 0)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Laba Kotor:</span>
                    <span className="font-mono text-emerald-600 font-bold">{rupiah(report.gross_profit_retail || 0)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Pengeluaran:</span>
                    <span className="font-mono text-rose-600">{rupiah(report.cash_out_retail || 0)}</span>
                  </div>
                </div>
              </div>

              {/* Void / Refund Warning if any */}
              {(report.void_count || 0) > 0 && (
                <div className="rounded-xl bg-rose-50 border border-rose-200 p-3 text-xs text-rose-900 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <AlertTriangle size={15} className="text-rose-600 shrink-0" />
                    <span>Pembatalan / Void Transaksi:</span>
                  </div>
                  <span className="font-bold">
                    {report.void_count}x Transaksi ({rupiah(report.void_amount || 0)})
                  </span>
                </div>
              )}
            </div>

            {/* Kolom Kanan: Metode Pembayaran (Payment Channels) */}
            <div className="bg-white border border-zinc-200 rounded-2xl p-5 space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-zinc-100">
                <h3 className="font-extrabold text-sm text-zinc-900 flex items-center gap-2">
                  <CreditCard size={16} className="text-zinc-700" />
                  Metode Pembayaran ({Object.keys(paymentMethods).length})
                </h3>
                <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">
                  Total {rupiah(totalSales)}
                </span>
              </div>

              {Object.keys(paymentMethods).length === 0 ? (
                <div className="text-center py-8 text-zinc-400 text-xs">
                  Tidak ada data metode pembayaran tercatat.
                </div>
              ) : (
                <div className="space-y-3">
                  {Object.entries(paymentMethods).map(([method, amount]) => {
                    const pct = totalSales > 0 ? Math.round((amount / totalSales) * 100) : 0;
                    const isCash = method.toLowerCase().includes("cash") || method.toLowerCase().includes("tunai");

                    return (
                      <div key={method} className="space-y-1.5">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-bold text-zinc-800 flex items-center gap-1.5">
                            {isCash ? <Coins size={14} className="text-emerald-600" /> : <CreditCard size={14} className="text-blue-600" />}
                            {method}
                          </span>
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-black text-zinc-900">{rupiah(amount)}</span>
                            <span className="text-[10px] font-bold text-zinc-400 font-mono w-9 text-right">
                              {pct}%
                            </span>
                          </div>
                        </div>
                        <div className="w-full bg-zinc-100 h-2 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${
                              isCash ? "bg-emerald-500" : "bg-blue-500"
                            }`}
                            style={{ width: `${Math.min(pct, 100)}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

          </div>

          {/* SEKSI 2: PENGELUARAN OPERASIONAL & UANG TRANSPORT */}
          <div className="bg-white border border-zinc-200 rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-100">
              <h3 className="font-extrabold text-sm text-zinc-900 flex items-center gap-2">
                <TrendingDown size={16} className="text-rose-600" />
                Pengeluaran Operasional Selama Shift
              </h3>
              <span className="text-xs font-black text-rose-600 font-mono">
                Total: {rupiah((report.cash_out_fnb || 0) + (report.cash_out_retail || 0))}
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Transport fee */}
              <div className="p-3.5 rounded-xl bg-zinc-50 border border-zinc-200/80 flex items-center justify-between text-xs">
                <div>
                  <div className="font-bold text-zinc-800">Uang Transport (Wajib)</div>
                  <div className="text-[11px] text-zinc-500 mt-0.5">Dibebankan ke {lbFnb}</div>
                </div>
                <span className="font-mono font-black text-sm text-zinc-900">
                  {rupiah(report.transport || 0)}
                </span>
              </div>

              {/* Created expenses */}
              {(report.expenses_created || []).map((x, i) => (
                <div key={x.id || i} className="p-3.5 rounded-xl bg-zinc-50 border border-zinc-200/80 flex items-center justify-between text-xs">
                  <div>
                    <div className="font-bold text-zinc-800">
                      {x.category} ({x.scope === "retail" ? lbRetail : lbFnb})
                    </div>
                    {x.note && <div className="text-[11px] text-zinc-500 mt-0.5">{x.note}</div>}
                  </div>
                  <span className="font-mono font-black text-sm text-zinc-900">{rupiah(x.amount)}</span>
                </div>
              ))}
            </div>

            {report.expenses_empty && (
              <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-center gap-2">
                <AlertTriangle size={15} className="text-amber-600 shrink-0" />
                <span>Kasir telah mengonfirmasi bahwa tidak ada pengeluaran operasional di shift ini.</span>
              </div>
            )}
          </div>

          {/* SEKSI 3: BAGI HASIL VENDOR KONSINYASI */}
          {vendorShares.length > 0 && (
            <div className="bg-white border border-zinc-200 rounded-2xl p-5 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-zinc-100">
                <h3 className="font-extrabold text-sm text-zinc-900 flex items-center gap-2">
                  <Handshake size={16} className="text-indigo-600" />
                  Bagi Hasil Vendor Konsinyasi ({vendorShares.length} Mitra)
                </h3>
                <div className="text-xs font-medium text-zinc-500 flex items-center gap-3">
                  <span>Omzet: <strong>{rupiah(vendorTotalGross)}</strong></span>
                  <span>Hak Vendor: <strong className="text-indigo-600">{rupiah(vendorTotalShare)}</strong></span>
                  <span>Outlet: <strong className="text-emerald-600">{rupiah(vendorTotalOutlet)}</strong></span>
                </div>
              </div>

              <div className="divide-y divide-zinc-100">
                {vendorShares.map((v) => {
                  const isDetailOpen = openVendorDetails[v.vendor_id];

                  return (
                    <div key={v.vendor_id} className="py-3 first:pt-0 last:pb-0 space-y-2">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div>
                          <div className="font-bold text-sm text-zinc-900">{v.vendor_name}</div>
                          <div className="text-xs text-zinc-500 mt-0.5">
                            Omzet: <strong>{rupiah(v.gross)}</strong> · Hak Vendor: <strong>{rupiah(v.share)}</strong> · Diserahkan: <strong className="text-emerald-600">{rupiah(v.paid)}</strong>
                          </div>
                        </div>

                        <div className="flex items-center gap-3">
                          {v.difference !== 0 && (
                            <span
                              className={`text-xs font-bold font-mono px-2 py-0.5 rounded ${
                                v.difference > 0 ? "bg-amber-100 text-amber-800" : "bg-rose-100 text-rose-800"
                              }`}
                            >
                              Selisih: {v.difference > 0 ? "+" : ""}{rupiah(v.difference)}
                            </span>
                          )}

                          {(v.items || []).length > 0 && (
                            <button
                              type="button"
                              onClick={() =>
                                setOpenVendorDetails((prev) => ({
                                  ...prev,
                                  [v.vendor_id]: !prev[v.vendor_id],
                                }))
                              }
                              className="text-xs font-bold text-rose-600 hover:text-rose-700 flex items-center gap-1"
                            >
                              {isDetailOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                              {v.items.length} Item
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Itemized product details */}
                      {isDetailOpen && (
                        <div className="bg-zinc-50 rounded-xl p-3 border border-zinc-200/60 space-y-1.5 text-xs">
                          {v.items.map((it, idx) => (
                            <div key={it.product_id || idx} className="flex justify-between text-zinc-700">
                              <span>
                                {it.name} <strong className="text-zinc-400">×{it.qty}</strong>
                              </span>
                              <span className="font-mono">
                                {rupiah(it.gross)}{" "}
                                <span className="text-zinc-400">(Vendor: {rupiah(it.vendor_share)})</span>
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

        </div>
      ) : (
        /* =========================================================================
            VIEW MODE: THERMAL RECEIPT SIMULATOR (80MM / 58MM)
           ========================================================================= */
        <div className="p-6 md:p-8 bg-zinc-100 flex flex-col items-center justify-center space-y-6">
          <div className="flex items-center gap-3 bg-white p-2 rounded-2xl border border-zinc-200 shadow-sm">
            <span className="text-xs font-bold text-zinc-500 uppercase tracking-wider pl-2">
              Ukuran Kertas:
            </span>
            <button
              onClick={() => setPaperWidth(80)}
              className={`px-3 py-1 rounded-xl text-xs font-bold transition ${
                paperWidth === 80 ? "bg-zinc-900 text-white" : "text-zinc-600 hover:bg-zinc-100"
              }`}
            >
              80mm (Sunmi / Standar)
            </button>
            <button
              onClick={() => setPaperWidth(58)}
              className={`px-3 py-1 rounded-xl text-xs font-bold transition ${
                paperWidth === 58 ? "bg-zinc-900 text-white" : "text-zinc-600 hover:bg-zinc-100"
              }`}
            >
              58mm (Mobile POS)
            </button>
          </div>

          {/* Thermal Paper Component Canvas */}
          <div
            className="bg-white border border-zinc-300 shadow-2xl p-6 sm:p-8 text-zinc-900 font-mono text-xs leading-relaxed relative rounded-sm"
            style={{ width: paperWidth === 80 ? "380px" : "300px" }}
          >
            {/* Paper tear top effect */}
            <div className="text-center pb-4 border-b border-dashed border-zinc-400 space-y-1">
              <div className="font-black text-base uppercase tracking-wider">{outletName}</div>
              <div className="text-[11px] text-zinc-600 font-bold">LAPORAN TUTUP SHIFT</div>
              <div className="text-[10px] text-zinc-500">
                {report.closed_at
                  ? new Date(report.closed_at).toLocaleString("id-ID")
                  : new Date().toLocaleString("id-ID")}
              </div>
              <div className="text-[10px] text-zinc-500">
                Buka: {report.dibuka_oleh || "-"} | Tutup: {report.ditutup_oleh || report.closed_by || "-"}
              </div>
            </div>

            {/* Sales body */}
            <div className="py-3 border-b border-dashed border-zinc-400 space-y-1 text-[11px]">
              <div className="flex justify-between font-bold">
                <span>TOTAL OMZET ({report.order_count || 0} ORDER)</span>
                <span>{rupiah(report.total_sales)}</span>
              </div>
              <div className="flex justify-between text-zinc-600">
                <span>- {lbFnb} (Dine:{rupiah(report.by_type?.dine_in || 0)})</span>
                <span>{rupiah(report.fnb_total)}</span>
              </div>
              <div className="flex justify-between text-zinc-600">
                <span>- {lbRetail}</span>
                <span>{rupiah(report.retail_total)}</span>
              </div>
            </div>

            {/* Payment methods */}
            <div className="py-3 border-b border-dashed border-zinc-400 space-y-1 text-[11px]">
              <div className="font-bold text-[10px] uppercase tracking-wider text-zinc-500 mb-1">
                METODE PEMBAYARAN:
              </div>
              {Object.entries(paymentMethods).map(([m, val]) => (
                <div key={m} className="flex justify-between">
                  <span>{m}</span>
                  <span>{rupiah(val)}</span>
                </div>
              ))}
            </div>

            {/* Cash reconciliation */}
            <div className="py-3 border-b border-dashed border-zinc-400 space-y-1 text-[11px]">
              <div className="font-bold text-[10px] uppercase tracking-wider text-zinc-500 mb-1">
                REKONSILIASI KAS:
              </div>
              <div className="flex justify-between">
                <span>Kas Sistem (Expected)</span>
                <span>{rupiah(varianceReport?.expected ?? report.expected_cash ?? 0)}</span>
              </div>
              <div className="flex justify-between">
                <span>Kas Fisik (Actual)</span>
                <span>{rupiah(varianceReport?.actual ?? (Number(report.closing_cash_fnb || 0) + Number(report.closing_cash_retail || 0)))}</span>
              </div>
              <div className="flex justify-between font-bold pt-1 border-t border-zinc-200">
                <span>SELISIH KAS</span>
                <span>{varianceVal >= 0 ? "+" : ""}{rupiah(varianceVal)}</span>
              </div>
              {report.variance_report?.variance_reason && (
                <div className="text-[10px] italic text-zinc-600 pt-1">
                  Catatan: "{report.variance_report.variance_reason}"
                </div>
              )}
            </div>

            {/* Net cash final */}
            <div className="pt-3 space-y-1.5 text-[12px] font-bold">
              <div className="flex justify-between text-emerald-800">
                <span>UANG BERSIH OUTLET</span>
                <span>{rupiah(report.net_cash || 0)}</span>
              </div>
              <div className="flex justify-between text-zinc-900">
                <span>SISA KAS TUNAI</span>
                <span>{rupiah(report.sisa_cash || 0)}</span>
              </div>
            </div>

            <div className="text-center pt-6 text-[10px] text-zinc-400 border-t border-dashed border-zinc-300 mt-4">
              *** GRAND ACEH KULINER POS SYSTEM ***
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          4. FOOTER CONTROLS
         ========================================================================= */}
      <div className="p-4 md:p-6 bg-zinc-50 border-t border-zinc-200 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="text-zinc-500 font-medium">
          Laporan ini tersimpan otomatis di riwayat shift dan database cloud.
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleCopyReportText}
            className="px-3.5 h-9 bg-white border border-zinc-200 hover:bg-zinc-100 text-zinc-700 font-bold rounded-xl flex items-center gap-1.5 transition"
          >
            <Copy size={13} /> {copied ? "Tersalin!" : "Salin Format WA"}
          </button>
          
          <button
            type="button"
            onClick={handlePrintSunmi}
            className="px-4 h-9 bg-zinc-900 hover:bg-zinc-800 text-white font-bold rounded-xl flex items-center gap-1.5 transition shadow-sm"
          >
            <Printer size={13} /> Cetak Struk
          </button>
        </div>
      </div>
    </div>
  );
}
