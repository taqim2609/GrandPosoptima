import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api, { apiError } from "@/lib/api";
import { rupiah } from "@/lib/format";
import { toast } from "sonner";
import {
  Clock, Play, Square, Loader2, Wallet, Users, MessageCircle, ChevronDown, ChevronRight,
  Printer, Ban, Plus, Trash2, Utensils, Store, UserCheck, Info, AlertTriangle,
  Coins, Calculator, CheckCircle2, ArrowRight, ArrowLeft, RotateCcw, AlertCircle,
  Scale, ShieldAlert, Sparkles, Check,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { bizCache, loadBusiness, labelsOf } from "@/lib/business";
import { printText as printText_, printShiftClosingReport } from "@/lib/print";
import ShiftClosingReportView from "@/components/ShiftClosingReportView";

const DEF_CATS = ["Bahan Baku", "Belanja Operasional", "Bayar Supplier", "Kasbon", "Lainnya"];

// Pecahan uang Rupiah untuk hitung fisik kas
export const INDO_DENOMINATIONS = [
  { value: 100000, label: "Rp 100.000", type: "bill", badge: "bg-red-50 text-red-700 border-red-200", color: "#DC2626" },
  { value: 50000, label: "Rp 50.000", type: "bill", badge: "bg-blue-50 text-blue-700 border-blue-200", color: "#2563EB" },
  { value: 20000, label: "Rp 20.000", type: "bill", badge: "bg-emerald-50 text-emerald-700 border-emerald-200", color: "#059669" },
  { value: 10000, label: "Rp 10.000", type: "bill", badge: "bg-purple-50 text-purple-700 border-purple-200", color: "#7C3AED" },
  { value: 5000, label: "Rp 5.000", type: "bill", badge: "bg-amber-50 text-amber-700 border-amber-200", color: "#D97706" },
  { value: 2000, label: "Rp 2.000", type: "bill", badge: "bg-zinc-100 text-zinc-700 border-zinc-300", color: "#71717A" },
  { value: 1000, label: "Rp 1.000", type: "bill", badge: "bg-teal-50 text-teal-700 border-teal-200", color: "#0D9488" },
  { value: 500, label: "Rp 500 (Koin)", type: "coin", badge: "bg-orange-50 text-orange-700 border-orange-200", color: "#EA580C" },
  { value: 200, label: "Rp 200 (Koin)", type: "coin", badge: "bg-yellow-50 text-yellow-700 border-yellow-200", color: "#CA8A04" },
  { value: 100, label: "Rp 100 (Koin)", type: "coin", badge: "bg-stone-100 text-stone-700 border-stone-300", color: "#78716C" },
];

const QUICK_VARIANCE_REASONS = [
  "Selisih pembulatan uang receh/koin transaksi tunai",
  "Salah hitung kembalian ke pelanggan",
  "Nota belanja fisik operasional belum sempat dicatat",
  "Tip pelanggan sukarela tercampur dalam laci kasir",
  "Kelebihan pembayaran tunai tanpa kembalian",
  "Ada kasbon mendadak karyawan belum terinput",
];

/**
 * Halaman Shift — model BARU (permintaan pemilik):
 *   1. Shift dibuka SATU kali per hari dengan satu tombol → membuat shift F&B & Retail.
 *   2. Kas awal TERPISAH untuk F&B dan Retail.
 *   3. Akun lain langsung memakai shift hari itu (tidak perlu buka shift baru).
 *   4. Akun yang MEMBUKA dan yang MENUTUP selalu dicantumkan.
 *   5. Pengeluaran boleh diisi kapan saja selama shift buka (halaman Pengeluaran & Kas)
 *      DAN diisi langsung di sini saat tutup shift.
 *   6. Mode Terpandu Tutup Shift: Hitung Fisik Uang Kas, Rekonsiliasi Otomatis, & Laporan Selisih.
 */
export default function Shift() {
  const nav = useNavigate();
  const [biz, setBiz] = useState(bizCache());
  useEffect(() => { loadBusiness().then(setBiz); }, []);
  const lb = labelsOf(biz);
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [openFnb, setOpenFnb] = useState("");
  const [openRetail, setOpenRetail] = useState("");
  const [closeFnb, setCloseFnb] = useState("");
  const [closeRetail, setCloseRetail] = useState("");

  // State Hitung Fisik Kas & Laporan Selisih
  const [denomCounts, setDenomCounts] = useState({});
  const [varianceReason, setVarianceReason] = useState("");
  const [guidedStep, setGuidedStep] = useState(1); // 1: Hitung Fisik, 2: Rekonsiliasi, 3: Pengeluaran & Tutup
  const [closingMode, setClosingMode] = useState("guided"); // "guided" or "manual"
  const [allocationMode, setAllocationMode] = useState("split_equal"); // "split_equal", "fnb_only", "retail_only", "proportional"
  const [showDenomBreakdown, setShowDenomBreakdown] = useState(true);

  // Uang transport: pengeluaran WAJIB saat tutup shift (tidak boleh 0), dibebankan ke F&B.
  // Nilai bawaan diambil dari Pengaturan → Aplikasi; kasir boleh mengubahnya.
  const [transport, setTransport] = useState(() => String(bizCache().transport_amount ?? ""));
  const [transportTouched, setTransportTouched] = useState(false);
  useEffect(() => {
    if (!transportTouched && biz && Number(biz.transport_amount) > 0) setTransport(String(biz.transport_amount));
  }, [biz, transportTouched]);
  const [expRows, setExpRows] = useState([]);
  const [cats, setCats] = useState(DEF_CATS);
  const [cash, setCash] = useState(null);
  const [summary, setSummary] = useState(null);
  const [report, setReport] = useState(null);
  const [reportsByScope, setReportsByScope] = useState(null);
  const [latestShiftId, setLatestShiftId] = useState("");
  const [history, setHistory] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  const [selectedHistoryReport, setSelectedHistoryReport] = useState(null);
  const [sendingWa, setSendingWa] = useState(false);
  const [vendorPreview, setVendorPreview] = useState([]);
  // paid[row.vendor_id] = berapa yang diberikan ke vendor
  const [paid, setPaid] = useState({});
  // openDetail[group] = true -> tampilkan detail per produk (preview / laporan penutupan)
  const [openDetail, setOpenDetail] = useState({});
  // Konfirmasi sadar bila laporan pengeluaran harian memang belum diisi sama sekali
  const [ackNoExp, setAckNoExp] = useState(false);

  const loadHistory = () =>
    api.get("/shifts/history").then((r) => {
      const list = Array.isArray(r.data) ? r.data : (r.data?.shifts || []);
      setHistory(list);
    }).catch(() => {});

  const sendWa = async () => {
    if (!latestShiftId) return;
    setSendingWa(true);
    const t = toast.loading("Mengirim laporan shift ke WhatsApp...");
    try {
      const { data } = await api.post(`/shifts/${latestShiftId}/send-wa`);
      toast.success(`Laporan terkirim ke ${(data?.recipients || []).length} nomor`, { id: t });
    } catch (e) { toast.error(apiError(e.response?.data?.detail), { id: t, duration: 9000 }); }
    finally { setSendingWa(false); }
  };

  const load = async () => {
    try {
      const r = await api.get("/shifts/current");
      setSession(r.data);
      if (r.data) {
        // preview bagian vendor + kas hari ini + ringkasan penjualan (hanya untuk tampilan
        // sebelum tutup; angka final dihitung server saat tutup shift)
        try {
          const v = await api.get("/shifts/current/vendor");
          const rows = v.data.vendors || [];
          setVendorPreview(rows);
          // Isi otomatis "Diberikan" dengan SISA bagian hari ini (pembayaran lewat Settlement
          // sudah dikurangkan server) — nominal tetap bebas diubah.
          const pre = {};
          rows.forEach((row) => {
            const sisa = Number(row.remaining || 0);
            if (sisa > 0.009) pre[row.vendor_id] = String(sisa);
          });
          setPaid(pre);
        } catch (_) { setVendorPreview([]); }
        try { const c = await api.get("/cash"); setCash(c.data); } catch (_) {}
        try { const s = await api.get("/reports/summary"); setSummary(s.data); } catch (_) {}
      } else {
        setVendorPreview([]); setCash(null); setSummary(null);
      }
    } catch (e) { toast.error(apiError(e.response?.data?.detail)); }
    finally { setLoading(false); }
  };
  const loadCats = () => api.get("/cash/categories").then((r) => setCats(r.data.categories || DEF_CATS)).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps -- fetch on mount
  useEffect(() => { load(); loadHistory(); loadCats(); }, []);

  const open = async () => {
    try {
      const { data } = await api.post("/shifts/open", {
        opening_cash_fnb: Number(openFnb || 0),
        opening_cash_retail: Number(openRetail || 0),
      });
      setSession(data); setReport(null); setReportsByScope(null); setPaid({});
      openFnb && setOpenFnb(""); openRetail && setOpenRetail("");
      toast.success("Shift hari ini dibuka — akun lain tinggal memakainya.");
      load();
    } catch (e) { toast.error(apiError(e.response?.data?.detail), { duration: 9000 }); }
  };

  const addExp = (scope) => setExpRows((rows) => [...rows, { scope, category: cats[0] || "Lainnya", amount: "", note: "" }]);
  const updExp = (i, k, v) => setExpRows((rows) => rows.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  const delExp = (i) => setExpRows((rows) => rows.filter((_, j) => j !== i));
  const expTotal = expRows.reduce((s, r) => s + (Number(r.amount) || 0), 0);

  // Perhitungan Fisik dari Pecahan Uang
  const totalPhysicalCash = INDO_DENOMINATIONS.reduce((sum, d) => {
    const qty = Number(denomCounts[d.value] || 0);
    return sum + (qty * d.value);
  }, 0);

  // Perhitungan Nilai Ekspektasi Kas Sistem
  const expOpeningFnb = Number(session?.fnb?.opening_cash ?? (session?.start_cash ? session.start_cash / 2 : 100000));
  const expOpeningRetail = Number(session?.retail?.opening_cash ?? (session?.start_cash ? session.start_cash / 2 : 100000));
  const expOpeningTotal = expOpeningFnb + expOpeningRetail;

  const expSalesCashFnb = Number(summary?.cash_sales_fnb ?? (summary?.by_payment?.cash ? summary.by_payment.cash * 0.7 : 0));
  const expSalesCashRetail = Number(summary?.cash_sales_retail ?? (summary?.by_payment?.cash ? summary.by_payment.cash * 0.3 : 0));
  const expSalesCashTotal = expSalesCashFnb + expSalesCashRetail;

  const expRecordedOutFnb = Number(cash?.out_fnb ?? 0);
  const expRecordedOutRetail = Number(cash?.out_retail ?? 0);
  const closingNewExpFnb = expRows.filter((r) => r.scope === "fnb").reduce((s, r) => s + (Number(r.amount) || 0), 0);
  const closingNewExpRetail = expRows.filter((r) => r.scope === "retail").reduce((s, r) => s + (Number(r.amount) || 0), 0);
  const trAmount = Number(transport || 0);

  const totalCashOutFnb = expRecordedOutFnb + closingNewExpFnb + trAmount;
  const totalCashOutRetail = expRecordedOutRetail + closingNewExpRetail;
  const totalCashOutCombined = totalCashOutFnb + totalCashOutRetail;

  const expectedCashFnb = Math.max(0, expOpeningFnb + expSalesCashFnb - totalCashOutFnb);
  const expectedCashRetail = Math.max(0, expOpeningRetail + expSalesCashRetail - totalCashOutRetail);
  const expectedCashTotal = expectedCashFnb + expectedCashRetail;

  const actualCashFnb = Number(closeFnb || 0);
  const actualCashRetail = Number(closeRetail || 0);
  const actualCashTotal = actualCashFnb + actualCashRetail;

  const varianceFnb = actualCashFnb - expectedCashFnb;
  const varianceRetail = actualCashRetail - expectedCashRetail;
  const varianceTotal = actualCashTotal - expectedCashTotal;
  const isBalanced = varianceTotal === 0;
  const isSurplus = varianceTotal > 0;
  const isShortage = varianceTotal < 0;
  const progressPercent = expectedCashTotal > 0 ? Math.min(200, Math.round((actualCashTotal / expectedCashTotal) * 100)) : (actualCashTotal > 0 ? 100 : 0);

  const updateDenom = (val, deltaOrVal) => {
    setDenomCounts((prev) => {
      const cur = Number(prev[val] || 0);
      const next = typeof deltaOrVal === "function" ? deltaOrVal(cur) : deltaOrVal;
      const safe = Math.max(0, Math.floor(Number(next) || 0));
      const nextObj = { ...prev, [val]: safe };
      const newTotal = INDO_DENOMINATIONS.reduce((sum, d) => {
        const q = Number(nextObj[d.value] || 0);
        return sum + (q * d.value);
      }, 0);

      // Auto-sinkron ke input kas akhir sesuai mode alokasi
      if (allocationMode === "split_equal") {
        const half = Math.floor(newTotal / 2);
        setCloseFnb(String(half));
        setCloseRetail(String(newTotal - half));
      } else if (allocationMode === "retail_only") {
        setCloseFnb("0");
        setCloseRetail(String(newTotal));
      } else if (allocationMode === "proportional") {
        const base = expectedCashTotal > 0 ? expectedCashTotal : 1;
        const ratio = Math.max(0, expectedCashFnb) / base;
        const fnbPart = Math.round(newTotal * ratio);
        setCloseFnb(String(fnbPart));
        setCloseRetail(String(newTotal - fnbPart));
      } else {
        setCloseFnb(String(newTotal));
        if (!closeRetail) setCloseRetail("0");
      }
      return nextObj;
    });
  };

  const applyAllocation = (mode) => {
    setAllocationMode(mode);
    if (totalPhysicalCash <= 0) return;
    if (mode === "split_equal") {
      const half = Math.floor(totalPhysicalCash / 2);
      setCloseFnb(String(half));
      setCloseRetail(String(totalPhysicalCash - half));
      toast.success(`Uang fisik ${rupiah(totalPhysicalCash)} dibagi 50:50 (${rupiah(half)} & ${rupiah(totalPhysicalCash - half)})`);
    } else if (mode === "retail_only") {
      setCloseFnb("0");
      setCloseRetail(String(totalPhysicalCash));
      toast.success(`Seluruh uang fisik ${rupiah(totalPhysicalCash)} dialokasikan ke ${lb.retail}`);
    } else if (mode === "proportional") {
      const base = expectedCashTotal > 0 ? expectedCashTotal : 1;
      const ratio = Math.max(0, expectedCashFnb) / base;
      const fnbPart = Math.round(totalPhysicalCash * ratio);
      setCloseFnb(String(fnbPart));
      setCloseRetail(String(totalPhysicalCash - fnbPart));
      toast.success(`Uang fisik dialokasikan proporsional: ${lb.fnb} ${rupiah(fnbPart)} & ${lb.retail} ${rupiah(totalPhysicalCash - fnbPart)}`);
    } else {
      setCloseFnb(String(totalPhysicalCash));
      setCloseRetail("0");
      toast.success(`Seluruh uang fisik ${rupiah(totalPhysicalCash)} dialokasikan ke ${lb.fnb}`);
    }
  };

  const resetPhysicalCount = () => {
    setDenomCounts({});
    setCloseFnb("");
    setCloseRetail("");
    toast.info("Hitungan fisik kas telah di-reset");
  };

  const close = async () => {
    const tr = Number(transport || 0);
    if (!(tr > 0)) {
      toast.error("Uang transport wajib diisi dan tidak boleh 0", { duration: 9000 });
      return;
    }
    // PERINGATAN: pengeluaran harian belum diisi sama sekali & form ini juga tidak mengisi apa pun
    const needAck = needExpAck;
    if (needAck && !ackNoExp) {
      toast.error("Laporan pengeluaran harian belum diisi (F&B & Retail kosong). "
        + "Isi pengeluaran hari ini, atau centang konfirmasi bahwa memang tidak ada pengeluaran.",
        { duration: 12000 });
      return;
    }

    // VALIDASI SELISIH KAS FISIK DENGAN SISTEM
    if (Math.abs(varianceTotal) > 0 && !varianceReason.trim()) {
      toast.error(
        `Terdapat selisih kas ${varianceTotal > 0 ? "LEBIH" : "KURANG"} (${rupiah(Math.abs(varianceTotal))}). Kasir wajib mengisi catatan / alasan selisih sebelum shift dapat ditutup.`,
        { duration: 12000 }
      );
      setGuidedStep(2); // Alihkan ke step rekonsiliasi selisih
      return;
    }

    try {
      const expenses = expRows
        .filter((r) => Number(r.amount) > 0)
        .map((r) => ({ scope: r.scope, category: r.category, amount: Number(r.amount), note: r.note }));
      const vendor_payments = vendorPreview.map((v) => ({ vendor_id: v.vendor_id, paid: Number(paid[v.vendor_id] || 0) }));
      const { data } = await api.post("/shifts/close", {
        closing_cash_fnb: Number(closeFnb || 0),
        closing_cash_retail: Number(closeRetail || 0),
        transport: tr,
        ack_no_expense: needAck && ackNoExp,
        expenses,
        vendor_payments,
        denominations: denomCounts,
        variance_reason: varianceReason,
      });
      setReport(data.report);
      setReportsByScope(data.reports || null);
      setLatestShiftId(data.id);
      setSession(null);
      setExpRows([]);
      setCash(null);
      setTransportTouched(false);
      setAckNoExp(false);
      setDenomCounts({});
      setVarianceReason("");
      setGuidedStep(1);

      // Kabar hasil auto-kirim WA laporan shift (setelan di Pengaturan → WhatsApp & Laporan)
      const wa = data.wa_auto || {};
      if (wa.enabled && wa.ok) {
        toast.success(`Laporan shift & rekonsiliasi kas dikirim otomatis ke WhatsApp (${(wa.recipients || []).length} nomor)`);
      } else if (wa.enabled && !wa.ok) {
        toast("Laporan shift tertutup, tapi WA GAGAL terkirim", {
          description: wa.skipped || wa.error || "Cek Pengaturan WhatsApp / koneksi gateway, lalu kirim manual di bawah.",
          duration: 15000,
        });
      }
      toast.success("Shift F&B & Retail ditutup dengan Laporan Selisih Kas");
      loadHistory();
      // Pengingat daftar belanja (bila diaktifkan di Pengaturan → WhatsApp & Laporan)
      try {
        const s = await api.get("/settings/shopping");
        if (s.data?.request_on_close) {
          toast("Buat daftar belanja bahan untuk besok?", {
            action: { label: "Buat Sekarang", onClick: () => nav("/ingredients?tab=belanja") },
            duration: 15000,
          });
        }
      } catch (_) {}
    } catch (e) { toast.error(apiError(e.response?.data?.detail), { duration: 9000 }); }
  };

  const [printText, setPrintText] = useState(null);
  const [printLoading, setPrintLoading] = useState(false);

  // Pratinjau cetak laporan shift — format mengikuti TEMPLATE laporan shift
  const loadPrint = async (sid) => {
    setPrintLoading(true);
    try {
      const { data } = await api.get(`/shifts/${sid}/print`);
      setPrintText(data.text);
    } catch (e) { toast.error(apiError(e.response?.data?.detail)); setPrintText(null); }
    finally { setPrintLoading(false); }
  };
  const doPrintText = () => {
    if (printText == null) return;
    printText_(printText, "Laporan Shift");
  };

  const movementsOf = (scope) => ((cash && cash.movements) || []).filter((m) => m.type === "out" && (m.scope || "fnb") === scope);

  // Status pengeluaran HARIAN per toko (dari /shifts/current) — dipakai untuk memperingatkan
  // bila laporan pengeluaran harian belum diisi sama sekali. Uang transport tidak dihitung.
  const dayExp = session?.expenses || null;
  const dayExpensesEmpty = !!dayExp?.empty;
  const hasNewExpRows = expRows.some((r) => Number(r.amount) > 0);
  const needExpAck = dayExpensesEmpty && !hasNewExpRows;

  if (loading) return <div className="h-full grid place-items-center"><Loader2 className="animate-spin text-[#E63946]" /></div>;

  const scopeCard = (scope, Icon) => {
    const sh = (session && session[scope]) || null;
    const rows = movementsOf(scope);
    const out = scope === "retail" ? (cash?.out_retail || 0) : (cash?.out_fnb || 0);
    const sales = scope === "retail" ? (summary?.retail_total || 0) : (summary?.fnb_total || 0);
    return (
      <div className="bg-white rounded-2xl border p-5" data-testid={`shift-scope-card-${scope}`}>
        <div className="flex items-center gap-2 font-extrabold">
          <Icon size={16} className="text-[#E63946]" /> {scope === "retail" ? lb.retail : lb.fnb}
          {sh?.auto_created && (
            <span className="text-[10px] font-bold bg-[#FEF3C7] text-[#B45309] px-2 py-0.5 rounded-full">dibuat otomatis</span>
          )}
        </div>
        <Row l="Kas awal" v={rupiah(sh?.opening_cash || 0)} />
        <Row l="Penjualan hari ini" v={rupiah(sales)} />
        <Row l="Pengeluaran" v={rupiah(out)} />
        <Row l="Uang bersih (perkiraan)" v={rupiah(sales - out)} warn={(sales - out) < 0} />
        <div className="mt-2 border-t pt-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-[#52525B]">
              Pengeluaran ({rows.length})
            </span>
            <button data-testid={`scope-add-exp-${scope}`} onClick={() => nav("/cash")}
              className="tap text-[11px] font-bold text-[#E63946] flex items-center gap-1">
              <Plus size={12} /> Isi di Pengeluaran &amp; Kas
            </button>
          </div>
          {rows.length === 0 ? (
            <div className="text-[11px] text-[#a1a1aa] mt-1">Belum ada pengeluaran — bisa diisi kapan saja, atau saat tutup shift di bawah.</div>
          ) : rows.slice(0, 4).map((m) => (
            <div key={m.id} className="flex justify-between text-[11px] py-0.5 gap-2">
              <span className="truncate">{m.category}{m.note ? ` · ${m.note}` : ""}</span>
              <span className="font-num shrink-0">{rupiah(m.amount)}</span>
            </div>
          ))}
          {rows.length > 4 && <div className="text-[11px] text-[#a1a1aa]">+{rows.length - 4} pengeluaran lain</div>}
        </div>
      </div>
    );
  };

  return (
    <div className="h-full overflow-y-auto p-6 lg:p-8">
      <h1 className="text-3xl font-extrabold flex items-center gap-2"><Clock /> Manajemen Shift</h1>
      <p className="text-[#52525B] mt-1 mb-6">
        Satu shift per hari untuk {lb.fnb} &amp; {lb.retail} — dibuka sekali, dipakai bersama semua akun.
        Tutup shift sekaligus menampilkan kas, uang bersih, dan bagi hasil vendor.
      </p>

      {session ? (
        <div className="space-y-5 max-w-3xl">
          <div className="bg-white rounded-2xl border p-6" data-testid="shift-active-card">
            <div className="inline-flex items-center gap-2 bg-[#D1FAE5] text-[#047857] font-bold px-3 py-1 rounded-full text-sm">
              <span className="h-2 w-2 rounded-full bg-[#047857] animate-pulse" /> Shift Hari Ini Aktif
            </div>
            <div className="text-sm text-[#52525B] mt-3">
              Dibuka oleh <b data-testid="shift-opened-by">{session.opened_by || "-"}</b>
              <br />Waktu buka: <b>{session.opened_at ? new Date(session.opened_at).toLocaleString("id-ID") : "-"}</b>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px]" data-testid="shift-accounts">
              <span className="font-extrabold uppercase tracking-wider text-[#52525B] flex items-center gap-1">
                <UserCheck size={13} /> Dipakai oleh
              </span>
              {(session.accounts || []).map((a) => (
                <span key={a.name} className={`px-2 py-0.5 rounded-full font-bold border ${a.opened ? "bg-[#EEF2FF] border-[#C7D2FE] text-[#3730A3]" : "bg-[#F4F5F7] border-[#E4E4E7] text-[#52525B]"}`}>
                  {a.name}{a.orders ? ` · ${a.orders} order` : ""}{a.opened ? " · pembuka" : ""}
                </span>
              ))}
            </div>
            <div className="mt-3 flex items-start gap-2 rounded-xl bg-[#EFF6FF] border border-[#BFDBFE] px-3 py-2 text-[11px] text-[#1E40AF]">
              <Info size={14} className="shrink-0 mt-0.5" />
              <span>Akun lain <b>tidak perlu membuka shift baru</b> — tinggal memakai shift ini.
                Yang tercatat hanya kasir yang membuka &amp; yang menutup.</span>
            </div>
          </div>

          <div className="grid gap-5 md:grid-cols-2" data-testid="shift-scope-cards">
            {scopeCard("fnb", Utensils)}
            {scopeCard("retail", Store)}
          </div>

          {/* Bagi hasil vendor (preview) */}
          {vendorPreview.length > 0 && (
            <div className="bg-white rounded-2xl border p-6">
              <div className="flex items-center gap-2 font-extrabold text-sm mb-1"><Users size={15} className="text-[#E63946]" /> Bagi Hasil Vendor</div>
              <div className="text-[11px] text-[#52525B] mb-2">
                Nominal yang diisi otomatis dicatat sebagai <b>pembayaran/settlement vendor</b> (bukti + kas keluar),
                jadi saldo utang vendor langsung berkurang dan tidak bisa terhitung dua kali.
              </div>
              {vendorPreview.map((v) => (
                <div key={v.vendor_id} className="py-1.5 border-b last:border-0 text-sm">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="font-bold truncate">{v.vendor_name}</div>
                      <div className="text-[11px] text-[#52525B]">Bagian vendor: <b className="font-num">{rupiah(v.share)}</b> · Omzet {rupiah(v.gross)}</div>
                      {v.paid_settled > 0 && (
                        <div className="text-[11px] text-[#15803D] font-bold" data-testid={`vendor-settled-${v.vendor_id}`}>
                          Sudah dibayar via Settlement (hari ini): {rupiah(v.paid_settled)} · sisa {rupiah(v.remaining)}
                        </div>
                      )}
                      {(v.carry_in || 0) > 0.009 && (
                        <div className="text-[11px] text-[#B45309] font-bold" data-testid={`vendor-debt-${v.vendor_id}`}>
                          Utang hari sebelumnya: {rupiah(v.carry_in)} (boleh ikut dibayar sekarang)
                        </div>
                      )}
                      {(() => {
                        const val = Number(paid[v.vendor_id] || 0);
                        const sisa = Number(v.remaining || 0);
                        const selisih = Math.round((val - sisa) * 100) / 100;
                        if (Math.abs(selisih) < 0.01) return null;
                        return (
                          <div data-testid={`vendor-diff-${v.vendor_id}`}
                            className={`text-[11px] font-bold ${selisih > 0 ? "text-[#B45309]" : "text-[#52525B]"}`}>
                            {selisih > 0
                              ? `Lebih ${rupiah(selisih)} dari sisa — kelebihannya mengurangi utang/saldo vendor`
                              : `Kurang ${rupiah(Math.abs(selisih))} — sisanya jadi utang vendor berikutnya`}
                          </div>
                        );
                      })()}
                    </div>
                    <div className="text-right">
                      <div className="text-[10px] text-[#52525B] font-bold uppercase">Diberikan</div>
                      <input data-testid={`vendor-paid-${v.vendor_id}`} type="number" min="0" value={paid[v.vendor_id] ?? 0}
                        onChange={(e) => setPaid((p) => ({ ...p, [v.vendor_id]: e.target.value }))}
                        className="w-28 h-9 rounded-lg border px-2 font-num text-sm" />
                      <button data-testid={`vendor-fill-${v.vendor_id}`}
                        onClick={() => setPaid((p) => ({ ...p, [v.vendor_id]: String(Math.max(0, Number(v.remaining || 0))) }))}
                        className="tap mt-1 text-[10px] font-bold text-[#E63946]">Isi sisa</button>
                    </div>
                  </div>
                  {(v.items || []).length > 0 && (
                    <>
                      <button data-testid={`preview-toggle-${v.vendor_id}`} onClick={() => setOpenDetail((o) => ({ ...o, [`pv-${v.vendor_id}`]: !o[`pv-${v.vendor_id}`] }))}
                        className="tap mt-1.5 text-[11px] font-bold text-[#E63946] flex items-center gap-1">
                        {openDetail[`pv-${v.vendor_id}`] ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                        {openDetail[`pv-${v.vendor_id}`] ? "Sembunyikan detail produk" : `${(v.items || []).length} produk — lihat detail`}
                      </button>
                      {openDetail[`pv-${v.vendor_id}`] && (
                        <div className="mt-1.5 rounded-lg bg-[#FAFAFA] border border-[#F1F1F4] px-3 py-1.5 space-y-1">
                          {v.items.map((im) => (
                            <div key={im.product_id || im.name} className="flex justify-between text-[11px] gap-2">
                              <span className="font-bold truncate">{im.name} <span className="text-[#a1a1aa] font-normal">×{im.qty}</span></span>
                              <span className="font-num shrink-0">{rupiah(im.gross)} <span className="text-[#E63946]">(vendor {rupiah(im.vendor_share)})</span></span>
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Tutup shift: Mode Terpandu (Hitung Fisik & Rekonsiliasi) atau Input Manual */}
          <div className="bg-white rounded-2xl border p-6" data-testid="guided-shift-closing-container">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <div>
                <h3 className="font-extrabold text-base flex items-center gap-2">
                  <Calculator size={18} className="text-[#E63946]" />
                  Tutup Shift &amp; Rekonsiliasi Kas Fisik
                </h3>
                <p className="text-[11px] text-[#52525B] mt-0.5">
                  Hitung fisik uang tunai, bandingkan otomatis dengan sistem, dan hasilkan laporan selisih kas.
                </p>
              </div>
              <div className="flex items-center gap-1 bg-[#F4F5F7] p-1 rounded-xl">
                <button
                  type="button"
                  data-testid="mode-guided-btn"
                  onClick={() => setClosingMode("guided")}
                  className={`tap px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all ${
                    closingMode === "guided" ? "bg-white text-[#0A0A0A] shadow-sm" : "text-[#71717A] hover:text-[#0A0A0A]"
                  }`}
                >
                  <Coins size={13} /> Mode Terpandu
                </button>
                <button
                  type="button"
                  data-testid="mode-manual-btn"
                  onClick={() => setClosingMode("manual")}
                  className={`tap px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all ${
                    closingMode === "manual" ? "bg-white text-[#0A0A0A] shadow-sm" : "text-[#71717A] hover:text-[#0A0A0A]"
                  }`}
                >
                  Input Langsung
                </button>
              </div>
            </div>

            {/* Stepper indikator jika mode terpandu */}
            {closingMode === "guided" && (
              <div className="grid grid-cols-3 gap-2 p-1.5 bg-[#FAFAFB] border rounded-xl mb-5 text-xs font-bold" data-testid="guided-stepper">
                <button
                  type="button"
                  onClick={() => setGuidedStep(1)}
                  data-testid="step-btn-1"
                  className={`tap py-2 rounded-lg text-center flex items-center justify-center gap-1.5 transition-all ${
                    guidedStep === 1 ? "bg-white border shadow-sm text-[#0A0A0A]" : "text-[#71717A]"
                  }`}
                >
                  <span className="w-5 h-5 rounded-full bg-[#E4E4E7] text-[10px] grid place-items-center">1</span>
                  <span>1. Hitung Fisik</span>
                </button>
                <button
                  type="button"
                  onClick={() => setGuidedStep(2)}
                  data-testid="step-btn-2"
                  className={`tap py-2 rounded-lg text-center flex items-center justify-center gap-1.5 transition-all ${
                    guidedStep === 2 ? "bg-white border shadow-sm text-[#0A0A0A]" : "text-[#71717A]"
                  }`}
                >
                  <span className="w-5 h-5 rounded-full bg-[#E4E4E7] text-[10px] grid place-items-center">2</span>
                  <span>2. Rekonsiliasi &amp; Selisih</span>
                </button>
                <button
                  type="button"
                  onClick={() => setGuidedStep(3)}
                  data-testid="step-btn-3"
                  className={`tap py-2 rounded-lg text-center flex items-center justify-center gap-1.5 transition-all ${
                    guidedStep === 3 ? "bg-white border shadow-sm text-[#0A0A0A]" : "text-[#71717A]"
                  }`}
                >
                  <span className="w-5 h-5 rounded-full bg-[#E4E4E7] text-[10px] grid place-items-center">3</span>
                  <span>3. Pengeluaran &amp; Tutup</span>
                </button>
              </div>
            )}

            {/* KONTEN STEP 1 ATAU MODE MANUAL: HITUNG FISIK KAS & KOMPONEN VISUAL REKONSILIASI */}
            {(closingMode === "manual" || guidedStep === 1) && (
              <div className="space-y-4" data-testid="step-physical-count">
                {/* Visual Summary Component: Real-time progress hitung fisik kas vs target sistem */}
                <div className="border rounded-2xl p-4 bg-gradient-to-br from-white to-[#FAFAFB] shadow-xs space-y-3" data-testid="cash-count-progress-summary">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="text-xs font-extrabold uppercase tracking-wider text-[#52525B] flex items-center gap-1.5">
                        <Calculator size={15} className="text-[#E63946]" /> Real-time Progress Hitung Fisik Kas
                      </div>
                      <p className="text-[11px] text-[#71717A] mt-0.5">
                        Target Kas Diharapkan Sistem: <b className="text-[#0A0A0A] font-num">{rupiah(expectedCashTotal)}</b>
                      </p>
                    </div>

                    {/* Status Indicator Badge */}
                    <div
                      data-testid="progress-status-badge"
                      className={`px-3 py-1 rounded-full text-xs font-extrabold flex items-center gap-1.5 border shadow-2xs ${
                        isBalanced
                          ? "bg-[#F0FDF4] border-[#86EFAC] text-[#15803D]"
                          : isSurplus
                          ? "bg-[#EFF6FF] border-[#BFDBFE] text-[#1D4ED8]"
                          : actualCashTotal === 0
                          ? "bg-[#F4F5F7] border-[#E4E4E7] text-[#71717A]"
                          : "bg-[#FEF2F2] border-[#FECACA] text-[#DC2626]"
                      }`}
                    >
                      {isBalanced ? (
                        <>
                          <CheckCircle2 size={14} className="text-[#16A34A]" />
                          <span>✓ 100% Sesuai Target (Kas Klop)</span>
                        </>
                      ) : isSurplus ? (
                        <>
                          <Sparkles size={14} className="text-[#2563EB]" />
                          <span>{progressPercent}% Target (Surplus +{rupiah(actualCashTotal - expectedCashTotal)})</span>
                        </>
                      ) : actualCashTotal === 0 ? (
                        <>
                          <Info size={14} className="text-[#71717A]" />
                          <span>Belum Diisi (Target {rupiah(expectedCashTotal)})</span>
                        </>
                      ) : (
                        <>
                          <AlertTriangle size={14} className="text-[#DC2626]" />
                          <span>{progressPercent}% Target (Kurang -{rupiah(expectedCashTotal - actualCashTotal)})</span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Visual Progress Bar */}
                  <div className="space-y-1">
                    <div className="flex justify-between items-center text-[11px] font-bold">
                      <span className="text-[#52525B]">
                        Fisik Terhitung: <b className="text-[#0A0A0A] font-num">{rupiah(actualCashTotal)}</b>
                      </span>
                      <span className="text-[#71717A] font-num">{progressPercent}%</span>
                    </div>
                    <div className="relative w-full h-3.5 bg-[#E4E4E7] rounded-full overflow-hidden p-0.5 border">
                      <div
                        data-testid="cash-progress-bar"
                        className={`h-full rounded-full transition-all duration-500 ease-out ${
                          isBalanced
                            ? "bg-gradient-to-r from-[#22C55E] to-[#15803D]"
                            : isSurplus
                            ? "bg-gradient-to-r from-[#3B82F6] to-[#1D4ED8]"
                            : actualCashTotal === 0
                            ? "bg-[#A1A1AA]"
                            : "bg-gradient-to-r from-[#F59E0B] to-[#EF4444]"
                        }`}
                        style={{ width: `${Math.min(100, progressPercent)}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-[10px] text-[#71717A] pt-0.5">
                      <span>Rp 0</span>
                      <span>Target Sistem: {rupiah(expectedCashTotal)}</span>
                    </div>
                  </div>

                  {/* Quick Actions for Cash Inputs */}
                  <div className="pt-2 border-t border-[#E4E4E7] flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span className="text-[11px] font-bold text-[#52525B]">Pilihan Pengisian Cepat:</span>
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        data-testid="fill-expected-btn"
                        onClick={() => {
                          setCloseFnb(String(expectedCashFnb));
                          setCloseRetail(String(expectedCashRetail));
                          toast.success("Nominal kas diisi otomatis sesuai target sistem");
                        }}
                        className="tap px-2.5 py-1 rounded-lg bg-white border text-[11px] font-bold hover:bg-[#F4F5F7] text-[#0A0A0A]"
                      >
                        Isi Sesuai Target Sistem ({rupiah(expectedCashTotal)})
                      </button>
                      <button
                        type="button"
                        data-testid="reset-cash-btn"
                        onClick={() => {
                          setCloseFnb("");
                          setCloseRetail("");
                          toast.info("Input kas dibersihkan");
                        }}
                        className="tap px-2.5 py-1 rounded-lg bg-white border text-[11px] font-bold hover:bg-[#F4F5F7] text-[#DC2626]"
                      >
                        Reset Input
                      </button>
                    </div>
                  </div>
                </div>

                {/* Input kas akhir per toko (otomatis sinkron, tetap bisa diedit manual) */}
                <div className="grid gap-4 md:grid-cols-2 pt-1">
                  <div>
                    <label className="text-xs uppercase tracking-wider font-bold text-[#52525B] flex items-center justify-between">
                      <span>Kas Akhir {lb.fnb}</span>
                      <span className="text-[10px] text-[#71717A] font-normal">Sistem ekspektasi: {rupiah(expectedCashFnb)}</span>
                    </label>
                    <input
                      data-testid="closing-cash-fnb"
                      type="number"
                      value={closeFnb}
                      onChange={(e) => setCloseFnb(e.target.value)}
                      className="w-full h-12 rounded-xl border px-3 mt-1.5 font-num"
                      placeholder="0"
                    />
                  </div>
                  <div>
                    <label className="text-xs uppercase tracking-wider font-bold text-[#52525B] flex items-center justify-between">
                      <span>Kas Akhir {lb.retail}</span>
                      <span className="text-[10px] text-[#71717A] font-normal">Sistem ekspektasi: {rupiah(expectedCashRetail)}</span>
                    </label>
                    <input
                      data-testid="closing-cash-retail"
                      type="number"
                      value={closeRetail}
                      onChange={(e) => setCloseRetail(e.target.value)}
                      className="w-full h-12 rounded-xl border px-3 mt-1.5 font-num"
                      placeholder="0"
                    />
                  </div>
                </div>

                {closingMode === "guided" && (
                  <button
                    type="button"
                    data-testid="step-1-next-btn"
                    onClick={() => setGuidedStep(2)}
                    className="tap w-full h-12 mt-2 rounded-xl bg-[#0A0A0A] text-white font-bold flex items-center justify-center gap-2"
                  >
                    <span>Lanjut ke Rekonsiliasi &amp; Analisis Selisih</span>
                    <ArrowRight size={16} />
                  </button>
                )}
              </div>
            )}

            {/* KONTEN STEP 2 ATAU MODE MANUAL: REKONSILIASI OTOMATIS & ANALISIS SELISIH */}
            {(closingMode === "manual" || guidedStep === 2) && (
              <div className="space-y-4 pt-2" data-testid="step-reconciliation">
                <div className="border rounded-2xl p-4 bg-white shadow-xs" data-testid="reconciliation-card">
                  <div className="flex justify-between items-center border-b pb-2 mb-3">
                    <span className="text-xs font-extrabold uppercase tracking-wider text-[#52525B] flex items-center gap-1.5">
                      <Scale size={15} className="text-[#E63946]" /> Perbandingan Kas Fisik vs Sistem POS
                    </span>
                    <span className="text-[11px] font-bold text-[#71717A]">Otomatis Terhitung</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Kolom Ekspektasi Sistem */}
                    <div className="p-3 rounded-xl bg-[#FAFAFA] border border-[#E4E4E7]">
                      <span className="text-[11px] font-bold text-[#52525B] uppercase tracking-wider block mb-1">
                        Kas Diharapkan Sistem
                      </span>
                      <div className="space-y-1 text-xs">
                        <div className="flex justify-between text-[#71717A]">
                          <span>Kas Awal:</span>
                          <span className="font-num">{rupiah(expOpeningTotal)}</span>
                        </div>
                        <div className="flex justify-between text-[#71717A]">
                          <span>Penjualan Tunai:</span>
                          <span className="font-num">+{rupiah(expSalesCashTotal)}</span>
                        </div>
                        <div className="flex justify-between text-[#71717A]">
                          <span>Kas Keluar (Operasional + Transport):</span>
                          <span className="font-num">-{rupiah(totalCashOutCombined)}</span>
                        </div>
                        <div className="flex justify-between pt-1 border-t font-bold text-sm">
                          <span>Total Sistem:</span>
                          <span className="font-num font-extrabold text-[#0A0A0A]" data-testid="expected-cash-total">
                            {rupiah(expectedCashTotal)}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Kolom Fisik Terhitung */}
                    <div className="p-3 rounded-xl bg-[#F0FDF4] border border-[#BBF7D0]">
                      <span className="text-[11px] font-bold text-[#166534] uppercase tracking-wider block mb-1">
                        Kas Fisik Kasir
                      </span>
                      <div className="space-y-1 text-xs">
                        <div className="flex justify-between text-[#166534]">
                          <span>Kas Fisik {lb.fnb}:</span>
                          <span className="font-num">{rupiah(actualCashFnb)}</span>
                        </div>
                        <div className="flex justify-between text-[#166534]">
                          <span>Kas Fisik {lb.retail}:</span>
                          <span className="font-num">{rupiah(actualCashRetail)}</span>
                        </div>
                        <div className="flex justify-between pt-1 border-t border-[#86EFAC] font-bold text-sm">
                          <span className="text-[#166534]">Total Fisik:</span>
                          <span className="font-num font-extrabold text-[#15803D]" data-testid="actual-cash-total">
                            {rupiah(actualCashTotal)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Banner Status Selisih Kas (Variance Banner) */}
                  <div
                    className={`mt-4 p-3.5 rounded-xl border flex items-center justify-between gap-3 ${
                      isBalanced
                        ? "bg-[#F0FDF4] border-[#86EFAC] text-[#166534]"
                        : isSurplus
                        ? "bg-[#EFF6FF] border-[#BFDBFE] text-[#1D4ED8]"
                        : "bg-[#FEF2F2] border-[#FECACA] text-[#B91C1C]"
                    }`}
                    data-testid="variance-status-banner"
                  >
                    <div className="flex items-center gap-2.5">
                      {isBalanced ? (
                        <CheckCircle2 size={20} className="text-[#16A34A] shrink-0" />
                      ) : isSurplus ? (
                        <AlertCircle size={20} className="text-[#2563EB] shrink-0" />
                      ) : (
                        <AlertTriangle size={20} className="text-[#DC2626] shrink-0" />
                      )}
                      <div>
                        <div className="font-extrabold text-sm" data-testid="variance-status-text">
                          {isBalanced
                            ? "✓ Kas Seimbang (Match)"
                            : isSurplus
                            ? `+ Lebih Kas (Surplus): +${rupiah(varianceTotal)}`
                            : `- Kurang Kas (Shortage): -${rupiah(Math.abs(varianceTotal))}`}
                        </div>
                        <div className="text-[11px] opacity-90">
                          {isBalanced
                            ? "Uang fisik di kasir tepat sesuai dengan perhitungan sistem."
                            : isSurplus
                            ? `Fisik ${rupiah(actualCashTotal)} lebih besar dari sistem ${rupiah(expectedCashTotal)}.`
                            : `Fisik ${rupiah(actualCashTotal)} lebih kecil dari sistem ${rupiah(expectedCashTotal)}.`}
                        </div>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="text-xs uppercase font-bold tracking-wider block opacity-75">Selisih Kas</span>
                      <span className="font-num font-extrabold text-base" data-testid="variance-amount-val">
                        {varianceTotal >= 0 ? "+" : "-"}{rupiah(Math.abs(varianceTotal))}
                      </span>
                    </div>
                  </div>

                  {/* Input Alasan Selisih Kas (Wajib bila ada selisih) */}
                  <div className="mt-4 pt-3 border-t" data-testid="variance-reason-section">
                    <label className="text-xs font-bold text-[#52525B] flex items-center justify-between mb-1">
                      <span className="flex items-center gap-1">
                        <ShieldAlert size={14} className={Math.abs(varianceTotal) > 0 ? "text-[#DC2626]" : "text-[#71717A]"} />
                        Catatan / Alasan Selisih Kas
                        {Math.abs(varianceTotal) > 0 && <span className="text-[#DC2626] font-extrabold ml-1">*Wajib Diisi</span>}
                      </span>
                      <span className="text-[11px] text-[#71717A] font-normal">Akan tercetak di struk &amp; laporan</span>
                    </label>
                    <textarea
                      data-testid="variance-reason-input"
                      value={varianceReason}
                      onChange={(e) => setVarianceReason(e.target.value)}
                      placeholder={
                        Math.abs(varianceTotal) > 0
                          ? "Wajib: Jelaskan penyebab selisih kas fisik vs sistem (mis. selisih pembulatan receh, salah kembalian, dll)..."
                          : "Catatan tambahan terkait penutupan kas (opsional)..."
                      }
                      rows={2}
                      className={`w-full p-2.5 rounded-xl border text-xs leading-relaxed ${
                        Math.abs(varianceTotal) > 0 && !varianceReason.trim()
                          ? "border-[#F87171] bg-[#FFF5F5]"
                          : "border-[#E4E4E7]"
                      }`}
                    />

                    {/* Rekomendasi Alasan Cepat */}
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <span className="text-[10px] font-bold text-[#71717A]">Pilih cepat:</span>
                      {QUICK_VARIANCE_REASONS.map((r) => (
                        <button
                          key={r}
                          type="button"
                          data-testid={`quick-reason-${r.slice(0, 8)}`}
                          onClick={() => setVarianceReason(r)}
                          className="tap text-[10px] font-medium bg-[#F4F5F7] hover:bg-[#E4E4E7] text-[#52525B] px-2 py-1 rounded-md"
                        >
                          {r}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {closingMode === "guided" && (
                  <div className="flex gap-2 pt-1">
                    <button
                      type="button"
                      data-testid="step-2-back-btn"
                      onClick={() => setGuidedStep(1)}
                      className="tap flex-1 h-12 rounded-xl bg-white border font-bold text-xs flex items-center justify-center gap-1.5"
                    >
                      <ArrowLeft size={16} /> Kembali ke Hitung Fisik
                    </button>
                    <button
                      type="button"
                      data-testid="step-2-next-btn"
                      onClick={() => setGuidedStep(3)}
                      className="tap flex-2 h-12 rounded-xl bg-[#0A0A0A] text-white font-bold text-xs flex items-center justify-center gap-1.5"
                    >
                      Lanjut ke Pengeluaran &amp; Tutup <ArrowRight size={16} />
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* KONTEN STEP 3 ATAU MODE MANUAL: PENGELUARAN & KONFIRMASI TUTUP */}
            {(closingMode === "manual" || guidedStep === 3) && (
              <div className="space-y-4 pt-2" data-testid="step-final-close">
                {/* PERINGATAN pengeluaran harian belum diisi (uang transport tidak dihitung) */}
                {dayExp && (
                  <div
                    data-testid="close-expense-warning"
                    className={`rounded-xl border px-3 py-2.5 text-[11px] ${
                      needExpAck
                        ? "bg-[#FFFBEB] border-[#FDE68A] text-[#92400E]"
                        : "bg-[#F4F5F7] border-[#E4E4E7] text-[#52525B]"
                    }`}
                  >
                    {needExpAck ? (
                      <>
                        <div className="font-extrabold flex items-center gap-1.5 text-[12px]">
                          <AlertTriangle size={14} /> Laporan pengeluaran harian BELUM DIISI
                        </div>
                        <div className="mt-1">
                          Hari ini belum ada pengeluaran sama sekali: <b>{lb.fnb}</b> {dayExp.fnb?.count || 0} catatan
                          {" · "}
                          <b>{lb.retail}</b> {dayExp.retail?.count || 0} catatan.
                          Isi pengeluaran di bawah (atau lewat halaman Pengeluaran &amp; Kas), atau centang konfirmasi di bawah.
                          <div className="mt-1 text-[10px]">
                            Uang transport &amp; bagi hasil vendor tidak dihitung di sini (keduanya dicatat otomatis oleh sistem).
                          </div>
                        </div>
                        <label className="mt-2 flex items-start gap-2 font-bold cursor-pointer">
                          <input
                            data-testid="ack-no-expense"
                            type="checkbox"
                            checked={ackNoExp}
                            onChange={(e) => setAckNoExp(e.target.checked)}
                            className="mt-0.5 h-4 w-4"
                          />
                          <span>Saya sudah cek — memang TIDAK ADA pengeluaran hari ini (lanjutkan tutup shift).</span>
                        </label>
                      </>
                    ) : (
                      <div className="flex flex-wrap gap-x-3 gap-y-1">
                        <span className="font-extrabold uppercase tracking-wider">Pengeluaran hari ini</span>
                        <span data-testid="day-exp-fnb">
                          {lb.fnb}: {dayExp.fnb?.count || 0} catatan · {rupiah(dayExp.fnb?.total || 0)}
                        </span>
                        <span
                          data-testid="day-exp-retail"
                          className={(dayExp.retail?.count || 0) === 0 ? "text-[#B45309] font-bold" : ""}
                        >
                          {lb.retail}: {dayExp.retail?.count || 0} catatan · {rupiah(dayExp.retail?.total || 0)}
                          {(dayExp.retail?.count || 0) === 0 ? " (belum ada)" : ""}
                        </span>
                        <span className="text-[10px]">— uang transport &amp; bagi hasil vendor tidak dihitung</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Uang Transport */}
                <div className="rounded-xl border border-[#E4E4E7] p-3">
                  <div className="text-xs font-extrabold uppercase tracking-wider text-[#52525B] flex items-center gap-1">
                    <Wallet size={14} className="text-[#E63946]" /> Uang Transport (Wajib)
                  </div>
                  <p className="text-[11px] text-[#52525B] mt-1">
                    Pengeluaran <b>wajib</b> setiap tutup shift dan <b>tidak boleh 0</b> — dibebankan ke kas <b>{lb.fnb}</b>,
                    otomatis tercatat di kas keluar &amp; laporan shift.
                  </p>
                  <div className="flex flex-wrap items-center gap-2 mt-2">
                    <input
                      data-testid="close-transport"
                      type="number"
                      min="1"
                      value={transport}
                      onChange={(e) => {
                        setTransportTouched(true);
                        setTransport(e.target.value);
                      }}
                      placeholder="mis. 20000"
                      className="h-11 w-40 rounded-xl border px-3 font-num"
                    />
                    <button
                      data-testid="close-transport-default"
                      type="button"
                      onClick={() => {
                        setTransportTouched(true);
                        setTransport(String(biz?.transport_amount || 0));
                      }}
                      className="tap h-9 px-3 rounded-lg bg-[#F4F5F7] font-bold text-[11px]"
                    >
                      Pakai bawaan {rupiah(biz?.transport_amount || 0)}
                    </button>
                    {!(Number(transport) > 0) && (
                      <span data-testid="close-transport-warn" className="text-[11px] font-bold text-[#B91C1C]">
                        Uang transport wajib diisi &amp; tidak boleh 0
                      </span>
                    )}
                  </div>
                </div>

                {/* Pengeluaran di Tutup Shift */}
                <div className="rounded-xl border border-[#E4E4E7] p-3" data-testid="close-expenses">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-extrabold uppercase tracking-wider text-[#52525B] flex items-center gap-1">
                      <Wallet size={14} className="text-[#E63946]" /> Pengeluaran di Tutup Shift
                    </span>
                    <div className="flex gap-2">
                      <button
                        data-testid="exp-add-fnb"
                        onClick={() => addExp("fnb")}
                        className="tap h-8 px-3 rounded-lg bg-[#F4F5F7] font-bold text-[11px]"
                      >
                        + {lb.fnb}
                      </button>
                      <button
                        data-testid="exp-add-retail"
                        onClick={() => addExp("retail")}
                        className="tap h-8 px-3 rounded-lg bg-[#F4F5F7] font-bold text-[11px]"
                      >
                        + {lb.retail}
                      </button>
                    </div>
                  </div>
                  {expRows.length === 0 ? (
                    <div className="text-[11px] text-[#a1a1aa] mt-2">
                      Tidak ada pengeluaran baru. (Pengeluaran yang sudah dicatat selama shift tetap ikut dihitung.)
                    </div>
                  ) : (
                    <div className="mt-2 space-y-2">
                      {expRows.map((r, i) => (
                        <div key={i} className="flex flex-wrap items-center gap-2" data-testid={`exp-row-${i}`}>
                          <select
                            data-testid={`exp-scope-${i}`}
                            value={r.scope}
                            onChange={(e) => updExp(i, "scope", e.target.value)}
                            className="h-9 rounded-lg border px-2 text-xs font-bold"
                          >
                            <option value="fnb">{lb.fnb}</option>
                            <option value="retail">{lb.retail}</option>
                          </select>
                          <select
                            data-testid={`exp-cat-${i}`}
                            value={r.category}
                            onChange={(e) => updExp(i, "category", e.target.value)}
                            className="h-9 rounded-lg border px-2 text-xs"
                          >
                            {cats.map((c) => (
                              <option key={c} value={c}>
                                {c}
                              </option>
                            ))}
                          </select>
                          <input
                            data-testid={`exp-amount-${i}`}
                            type="number"
                            value={r.amount}
                            onChange={(e) => updExp(i, "amount", e.target.value)}
                            placeholder="Nominal"
                            className="h-9 w-32 rounded-lg border px-2 font-num text-sm"
                          />
                          <input
                            data-testid={`exp-note-${i}`}
                            value={r.note}
                            onChange={(e) => updExp(i, "note", e.target.value)}
                            placeholder="Catatan (opsional)"
                            className="h-9 flex-1 min-w-[120px] rounded-lg border px-2 text-xs"
                          />
                          <button
                            data-testid={`exp-del-${i}`}
                            onClick={() => delExp(i)}
                            className="tap h-9 w-9 grid place-items-center rounded-lg bg-[#FEE2E2] text-[#B91C1C]"
                            title="Hapus baris"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      ))}
                      <div className="text-[11px] font-bold text-[#52525B]" data-testid="exp-total">
                        Total pengeluaran yang akan disimpan: {rupiah(expTotal)}
                      </div>
                    </div>
                  )}
                </div>

                {/* Tombol Eksekusi Tutup Shift */}
                <div className="pt-2">
                  <button
                    data-testid="close-shift-btn"
                    onClick={close}
                    className="tap w-full h-13 py-3 rounded-xl bg-[#0A0A0A] hover:bg-[#27272A] text-white font-bold flex items-center justify-center gap-2 shadow-sm"
                  >
                    <Square size={16} /> Tutup Shift &amp; Simpan Rekonsiliasi (F&amp;B &amp; Retail)
                  </button>
                  <div
                    data-testid="close-wa-auto-hint"
                    className="mt-2 text-[11px] text-[#52525B] flex items-center justify-center gap-1.5"
                  >
                    <MessageCircle size={12} className={session?.wa_auto_shift ? "text-[#25D366]" : "text-[#a1a1aa]"} />
                    {session?.wa_auto_shift
                      ? "Laporan shift & hasil rekonsiliasi kas akan otomatis dikirim ke WhatsApp setelah ditutup."
                      : "Auto-kirim WhatsApp mati — kirim manual lewat tombol di bawah (Pengaturan → WhatsApp & Laporan)."}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="max-w-xl bg-white rounded-2xl border p-6" data-testid="shift-open-card">
          <h3 className="font-extrabold">Buka Shift Hari Ini</h3>
          <p className="text-[11px] text-[#52525B] mt-1 mb-4">
            Satu tombol membuka <b>{lb.fnb} &amp; {lb.retail}</b> sekaligus dengan kas awal masing-masing.
            Setelah ini akun lain tinggal memakainya — tidak perlu membuka shift baru.
          </p>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="text-xs uppercase tracking-wider font-bold text-[#52525B]">Kas Awal {lb.fnb}</label>
              <input data-testid="opening-cash-fnb" type="number" value={openFnb} onChange={(e) => setOpenFnb(e.target.value)}
                className="w-full h-12 rounded-xl border px-3 mt-1.5 font-num" placeholder="0" />
            </div>
            <div>
              <label className="text-xs uppercase tracking-wider font-bold text-[#52525B]">Kas Awal {lb.retail}</label>
              <input data-testid="opening-cash-retail" type="number" value={openRetail} onChange={(e) => setOpenRetail(e.target.value)}
                className="w-full h-12 rounded-xl border px-3 mt-1.5 font-num" placeholder="0" />
            </div>
          </div>
          <button data-testid="open-shift-btn" onClick={open}
            className="tap w-full h-13 py-3 mt-4 rounded-xl bg-[#E63946] hover:bg-[#BE123C] text-white font-bold flex items-center justify-center gap-2">
            <Play size={16} /> Buka Shift {lb.fnb} &amp; {lb.retail}
          </button>
        </div>
      )}

      {report && (
        <div className="mt-6 max-w-4xl">
          <ShiftClosingReportView
            report={report}
            reportsByScope={reportsByScope}
            shiftId={latestShiftId}
            biz={biz}
            onSendWa={sendWa}
            sendingWa={sendingWa}
            onPrintPreview={() => latestShiftId && loadPrint(latestShiftId)}
            printLoading={printLoading}
          />
        </div>
      )}

      {/* Histori shift — dikelompokkan per sesi (F&B + Retail satu baris) */}
      <div className="max-w-4xl mt-8">
        <button
          data-testid="toggle-shift-history"
          onClick={() => setShowHistory((v) => !v)}
          className="tap w-full h-12 rounded-2xl bg-white border border-zinc-200/90 font-bold text-sm text-zinc-800 hover:bg-zinc-50 flex items-center justify-center gap-2 shadow-xs transition"
        >
          <Clock size={16} className="text-zinc-500" />
          {showHistory ? "Sembunyikan" : "Buka"} Riwayat Penutupan Shift Sebelumnya ({history.length})
        </button>

        {showHistory && (
          <div className="mt-4 space-y-4">
            {history.length === 0 && (
              <div className="text-center text-zinc-400 py-10 bg-white rounded-2xl border border-zinc-200">
                Belum ada shift yang ditutup dalam riwayat.
              </div>
            )}
            {history.map((s) => (
              <div
                key={s.id}
                className="bg-white rounded-2xl border border-zinc-200/90 p-5 shadow-xs hover:border-zinc-300 transition space-y-3"
                data-testid={`shift-history-${s.id}`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-zinc-100 pb-3">
                  <div>
                    <span className="font-extrabold text-base text-zinc-900">
                      {s.opened_at ? new Date(s.opened_at).toLocaleDateString("id-ID", { dateStyle: "full" }) : "-"}
                    </span>
                    <div className="text-xs text-zinc-500 mt-0.5">
                      Dibuka: <b className="text-zinc-700" data-testid={`history-opened-by-${s.id}`}>{s.opened_by || s.cashier_name || "-"}</b>
                      {" · "}
                      Ditutup: <b className="text-zinc-700" data-testid={`history-closed-by-${s.id}`}>{s.closed_by || "-"}</b>
                      {" · "}
                      <span className="font-mono text-[11px]">
                        {new Date(s.opened_at).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })} – {s.closed_at ? new Date(s.closed_at).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }) : "-"}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setSelectedHistoryReport(s)}
                      className="tap h-8 px-3 rounded-lg bg-zinc-900 text-white font-bold text-xs flex items-center gap-1.5 shadow-xs hover:bg-zinc-800 transition"
                    >
                      <FileText size={13} /> Laporan Lengkap
                    </button>
                    <button
                      type="button"
                      onClick={() => loadPrint(s.id)}
                      className="tap h-8 px-2.5 rounded-lg bg-zinc-100 hover:bg-zinc-200 text-zinc-700 font-bold text-xs flex items-center gap-1 transition"
                      title="Cetak struk laporan shift ini"
                    >
                      <Printer size={13} /> Cetak
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <div className="bg-zinc-50 p-2.5 rounded-xl border border-zinc-100">
                    <span className="text-[10px] text-zinc-400 font-bold uppercase block">Omzet Penjualan</span>
                    <span className="text-sm font-black text-zinc-900 font-mono mt-0.5 block">{rupiah(s.total_sales)}</span>
                    <span className="text-[10px] text-zinc-500">{s.order_count || 0} Order</span>
                  </div>

                  <div className="bg-emerald-50/70 p-2.5 rounded-xl border border-emerald-100">
                    <span className="text-[10px] text-emerald-700 font-bold uppercase block">Uang Bersih (Net)</span>
                    <span className="text-sm font-black text-emerald-700 font-mono mt-0.5 block">{rupiah(s.net_cash)}</span>
                    <span className="text-[10px] text-emerald-600/80">{lb.fnb}: {rupiah(s.net_cash_fnb || 0)}</span>
                  </div>

                  <div className="bg-zinc-50 p-2.5 rounded-xl border border-zinc-100">
                    <span className="text-[10px] text-zinc-400 font-bold uppercase block">Sisa Kas Tunai</span>
                    <span className="text-sm font-black text-zinc-900 font-mono mt-0.5 block">{rupiah(s.sisa_cash || 0)}</span>
                    <span className="text-[10px] text-zinc-500">Keluar: {rupiah(s.cash_out || 0)}</span>
                  </div>

                  <div className="bg-zinc-50 p-2.5 rounded-xl border border-zinc-100">
                    <span className="text-[10px] text-zinc-400 font-bold uppercase block">Rekonsiliasi Kas</span>
                    <span
                      className={`text-xs font-black mt-1 inline-block px-1.5 py-0.5 rounded ${
                        s.variance_report?.total?.status === "match" || (s.variance_report?.total?.variance ?? 0) === 0
                          ? "bg-emerald-100 text-emerald-800"
                          : (s.variance_report?.total?.variance ?? 0) > 0
                          ? "bg-blue-100 text-blue-800"
                          : "bg-rose-100 text-rose-800"
                      }`}
                    >
                      {s.variance_report?.total?.status === "match" || (s.variance_report?.total?.variance ?? 0) === 0
                        ? "✓ Match (Seimbang)"
                        : `${(s.variance_report?.total?.variance ?? 0) >= 0 ? "+" : ""}${rupiah(s.variance_report?.total?.variance ?? 0)}`}
                    </span>
                  </div>
                </div>

                {s.variance_report?.variance_reason && (
                  <div className="text-[11px] text-zinc-600 italic bg-amber-50/60 border border-amber-200/60 p-2 rounded-lg">
                    Alasan selisih kasir: "{s.variance_report.variance_reason}"
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal Laporan Lengkap untuk item histori yang dipilih */}
      <Dialog
        open={selectedHistoryReport !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedHistoryReport(null);
        }}
      >
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto p-2 sm:p-4 bg-transparent border-0 shadow-none">
          <DialogHeader className="sr-only">
            <DialogTitle>Detail Laporan Tutup Shift Lengkap</DialogTitle>
          </DialogHeader>
          {selectedHistoryReport && (
            <ShiftClosingReportView
              report={selectedHistoryReport}
              shiftId={selectedHistoryReport.id}
              biz={biz}
              onSendWa={() => {
                setLatestShiftId(selectedHistoryReport.id);
                sendWa();
              }}
              sendingWa={sendingWa}
              onPrintPreview={() => loadPrint(selectedHistoryReport.id)}
              printLoading={printLoading}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Dialog pratinjau cetak laporan shift */}
      <Dialog open={printText != null || printLoading} onOpenChange={(o) => { if (!o) setPrintText(null); }}>
        <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Printer size={17} /> Cetak Laporan Shift</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-[#52525B] -mt-1">
            Format ini mengikuti <b>Template Laporan Shift</b> — ubah susunan/teksnya di Pengaturan → WhatsApp &amp; Laporan → Template WhatsApp, lalu cetak lagi.
          </p>
          {printLoading ? (
            <div className="h-32 grid place-items-center"><Loader2 className="animate-spin text-[#E63946]" /></div>
          ) : (
            <pre className="rounded-xl bg-[#FAFAFB] border p-4 text-xs leading-relaxed whitespace-pre-wrap font-mono max-h-[50vh] overflow-y-auto">{printText}</pre>
          )}
          <DialogFooter className="flex-col gap-2 sm:flex-col">
            <button data-testid="shift-print-sunmi-modal" onClick={() => {
              if (report) {
                printShiftClosingReport(report, {
                  outletName: biz?.name || "KASIR AKUNTANSI",
                  openedBy: report.dibuka_oleh,
                  closedBy: report.ditutup_oleh,
                });
              } else {
                doPrintText();
              }
            }} disabled={printText == null && !report} className="tap w-full h-11 rounded-xl bg-[#E63946] hover:bg-[#D62839] text-white font-bold flex items-center justify-center gap-2 disabled:opacity-50">
              <Printer size={16} /> Cetak ke Printer Sunmi Thermal (80mm AAR)
            </button>
            <button data-testid="shift-print-do" onClick={doPrintText} disabled={printText == null} className="tap w-full h-11 rounded-xl bg-[#0A0A0A] hover:bg-[#27272A] text-white font-bold flex items-center justify-center gap-2 disabled:opacity-50">
              <Printer size={16} /> Cetak Format Browser / Struk Standard
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
const Row = ({ l, v, warn, accent }) => (
  <div className="flex justify-between py-1 border-b last:border-0 text-sm">
    <span className="text-[#52525B]">{l}</span>
    <span className={`font-num font-bold ${warn ? "text-[#B45309]" : accent ? "text-[#E63946]" : ""}`}>{v}</span>
  </div>
);
