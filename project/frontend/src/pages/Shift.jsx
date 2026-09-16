import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api, { apiError } from "@/lib/api";
import { rupiah } from "@/lib/format";
import { toast } from "sonner";
import {
  Clock, Play, Square, Loader2, Wallet, Users, MessageCircle, ChevronDown, ChevronRight,
  Printer, Ban, Plus, Trash2, Utensils, Store, UserCheck, Info, AlertTriangle,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { bizCache, loadBusiness, labelsOf } from "@/lib/business";
import { printText as printText_ } from "@/lib/print";

const DEF_CATS = ["Bahan Baku", "Belanja Operasional", "Bayar Supplier", "Kasbon", "Lainnya"];

/**
 * Halaman Shift — model BARU (permintaan pemilik):
 *   1. Shift dibuka SATU kali per hari dengan satu tombol → membuat shift F&B & Retail.
 *   2. Kas awal TERPISAH untuk F&B dan Retail.
 *   3. Akun lain langsung memakai shift hari itu (tidak perlu buka shift baru).
 *   4. Akun yang MEMBUKA dan yang MENUTUP selalu dicantumkan.
 *   5. Pengeluaran boleh diisi kapan saja selama shift buka (halaman Pengeluaran & Kas)
 *      DAN diisi langsung di sini saat tutup shift.
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
  const [sendingWa, setSendingWa] = useState(false);
  const [vendorPreview, setVendorPreview] = useState([]);
  // paid[row.vendor_id] = berapa yang diberikan ke vendor
  const [paid, setPaid] = useState({});
  // openDetail[group] = true -> tampilkan detail per produk (preview / laporan penutupan)
  const [openDetail, setOpenDetail] = useState({});
  // Konfirmasi sadar bila laporan pengeluaran harian memang belum diisi sama sekali
  const [ackNoExp, setAckNoExp] = useState(false);

  const loadHistory = () =>
    api.get("/shifts/history").then((r) => setHistory(r.data.shifts || [])).catch(() => {});

  const sendWa = async () => {
    if (!latestShiftId) return;
    setSendingWa(true);
    const t = toast.loading("Mengirim laporan shift ke WhatsApp...");
    try {
      const { data } = await api.post(`/shifts/${latestShiftId}/send-wa`);
      toast.success(`Laporan terkirim ke ${data.recipients.length} nomor`, { id: t });
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
        expenses, vendor_payments,
      });
      setReport(data.report); setReportsByScope(data.reports || null);
      setLatestShiftId(data.id); setSession(null); setExpRows([]); setCash(null);
      setTransportTouched(false); setAckNoExp(false);
      // Kabar hasil auto-kirim WA laporan shift (setelan di Pengaturan → WhatsApp & Laporan)
      const wa = data.wa_auto || {};
      if (wa.enabled && wa.ok) {
        toast.success(`Laporan shift dikirim otomatis ke WhatsApp (${(wa.recipients || []).length} nomor)`);
      } else if (wa.enabled && !wa.ok) {
        toast("Laporan shift tertutup, tapi WA GAGAL terkirim", {
          description: wa.skipped || wa.error || "Cek Pengaturan WhatsApp / koneksi gateway, lalu kirim manual di bawah.",
          duration: 15000,
        });
      }
      toast.success("Shift F&B & Retail ditutup");
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

          {/* Tutup shift: kas akhir per toko + pengeluaran yang diisi sekarang */}
          <div className="bg-white rounded-2xl border p-6">
            <h3 className="font-extrabold mb-1">Tutup Shift (F&amp;B &amp; Retail sekaligus)</h3>
            <p className="text-[11px] text-[#52525B] mb-4">
              Isi kas akhir tiap toko (hasil hitung fisik). Pengeluaran boleh diisi di sini juga —
              pengeluaran ini langsung masuk kas keluar toko yang dipilih dan ikut hitungan uang bersih.
            </p>

            {/* PERINGATAN pengeluaran harian belum diisi (uang transport tidak dihitung) */}
            {dayExp && (
              <div data-testid="close-expense-warning"
                className={`rounded-xl border px-3 py-2.5 mb-4 text-[11px] ${needExpAck
                  ? "bg-[#FFFBEB] border-[#FDE68A] text-[#92400E]"
                  : "bg-[#F4F5F7] border-[#E4E4E7] text-[#52525B]"}`}>
                {needExpAck ? (
                  <>
                    <div className="font-extrabold flex items-center gap-1.5 text-[12px]">
            <AlertTriangle size={14} /> Laporan pengeluaran harian BELUM DIISI
                    </div>
                    <div className="mt-1">
                      Hari ini belum ada pengeluaran sama sekali: <b>{lb.fnb}</b> {dayExp.fnb?.count || 0} catatan
                      {" · "}<b>{lb.retail}</b> {dayExp.retail?.count || 0} catatan.
                      Isi pengeluaran di atas (atau lewat halaman Pengeluaran &amp; Kas), atau centang konfirmasi di bawah.
                      <div className="mt-1 text-[10px]">Uang transport &amp; bagi hasil vendor tidak dihitung di sini
                        (keduanya dicatat otomatis oleh sistem).</div>
                    </div>
                    <label className="mt-2 flex items-start gap-2 font-bold cursor-pointer">
                      <input data-testid="ack-no-expense" type="checkbox" checked={ackNoExp}
                        onChange={(e) => setAckNoExp(e.target.checked)} className="mt-0.5 h-4 w-4" />
                      <span>Saya sudah cek — memang TIDAK ADA pengeluaran hari ini (lanjutkan tutup shift).</span>
                    </label>
                  </>
                ) : (
                  <div className="flex flex-wrap gap-x-3 gap-y-1">
                    <span className="font-extrabold uppercase tracking-wider">Pengeluaran hari ini</span>
                    <span data-testid="day-exp-fnb">{lb.fnb}: {dayExp.fnb?.count || 0} catatan · {rupiah(dayExp.fnb?.total || 0)}</span>
                    <span data-testid="day-exp-retail" className={(dayExp.retail?.count || 0) === 0 ? "text-[#B45309] font-bold" : ""}>
                      {lb.retail}: {dayExp.retail?.count || 0} catatan · {rupiah(dayExp.retail?.total || 0)}
                      {(dayExp.retail?.count || 0) === 0 ? " (belum ada)" : ""}
                    </span>
                    <span className="text-[10px]">— uang transport &amp; bagi hasil vendor tidak dihitung</span>
                  </div>
                )}
              </div>
            )}
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="text-xs uppercase tracking-wider font-bold text-[#52525B]">Kas Akhir {lb.fnb}</label>
                <input data-testid="closing-cash-fnb" type="number" value={closeFnb} onChange={(e) => setCloseFnb(e.target.value)}
                  className="w-full h-12 rounded-xl border px-3 mt-1.5 font-num" placeholder="0" />
              </div>
              <div>
                <label className="text-xs uppercase tracking-wider font-bold text-[#52525B]">Kas Akhir {lb.retail}</label>
                <input data-testid="closing-cash-retail" type="number" value={closeRetail} onChange={(e) => setCloseRetail(e.target.value)}
                  className="w-full h-12 rounded-xl border px-3 mt-1.5 font-num" placeholder="0" />
              </div>
            </div>

            <div className="mt-5 rounded-xl border border-[#E4E4E7] p-3">
              <div className="text-xs font-extrabold uppercase tracking-wider text-[#52525B] flex items-center gap-1">
                <Wallet size={14} className="text-[#E63946]" /> Uang Transport (Wajib)
              </div>
              <p className="text-[11px] text-[#52525B] mt-1">
                Pengeluaran <b>wajib</b> setiap tutup shift dan <b>tidak boleh 0</b> — dibebankan ke kas <b>{lb.fnb}</b>,
                otomatis tercatat di kas keluar &amp; laporan shift.
              </p>
              <div className="flex flex-wrap items-center gap-2 mt-2">
                <input data-testid="close-transport" type="number" min="1" value={transport}
                  onChange={(e) => { setTransportTouched(true); setTransport(e.target.value); }}
                  placeholder="mis. 20000" className="h-11 w-40 rounded-xl border px-3 font-num" />
                <button data-testid="close-transport-default" type="button"
                  onClick={() => { setTransportTouched(true); setTransport(String(biz?.transport_amount || 0)); }}
                  className="tap h-9 px-3 rounded-lg bg-[#F4F5F7] font-bold text-[11px]">
                  Pakai bawaan {rupiah(biz?.transport_amount || 0)}
                </button>
                {!(Number(transport) > 0) && (
                  <span data-testid="close-transport-warn" className="text-[11px] font-bold text-[#B91C1C]">
                    Uang transport wajib diisi &amp; tidak boleh 0
                  </span>
                )}
              </div>
            </div>

            <div className="mt-5 rounded-xl border border-[#E4E4E7] p-3" data-testid="close-expenses">
              <div className="flex items-center justify-between">
                <span className="text-xs font-extrabold uppercase tracking-wider text-[#52525B] flex items-center gap-1">
                  <Wallet size={14} className="text-[#E63946]" /> Pengeluaran di Tutup Shift
                </span>
                <div className="flex gap-2">
                  <button data-testid="exp-add-fnb" onClick={() => addExp("fnb")}
                    className="tap h-8 px-3 rounded-lg bg-[#F4F5F7] font-bold text-[11px]">+ {lb.fnb}</button>
                  <button data-testid="exp-add-retail" onClick={() => addExp("retail")}
                    className="tap h-8 px-3 rounded-lg bg-[#F4F5F7] font-bold text-[11px]">+ {lb.retail}</button>
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
                      <select data-testid={`exp-scope-${i}`} value={r.scope} onChange={(e) => updExp(i, "scope", e.target.value)}
                        className="h-9 rounded-lg border px-2 text-xs font-bold">
                        <option value="fnb">{lb.fnb}</option>
                        <option value="retail">{lb.retail}</option>
                      </select>
                      <select data-testid={`exp-cat-${i}`} value={r.category} onChange={(e) => updExp(i, "category", e.target.value)}
                        className="h-9 rounded-lg border px-2 text-xs">
                        {cats.map((c) => <option key={c} value={c}>{c}</option>)}
                      </select>
                      <input data-testid={`exp-amount-${i}`} type="number" value={r.amount} onChange={(e) => updExp(i, "amount", e.target.value)}
                        placeholder="Nominal" className="h-9 w-32 rounded-lg border px-2 font-num text-sm" />
                      <input data-testid={`exp-note-${i}`} value={r.note} onChange={(e) => updExp(i, "note", e.target.value)}
                        placeholder="Catatan (opsional)" className="h-9 flex-1 min-w-[120px] rounded-lg border px-2 text-xs" />
                      <button data-testid={`exp-del-${i}`} onClick={() => delExp(i)}
                        className="tap h-9 w-9 grid place-items-center rounded-lg bg-[#FEE2E2] text-[#B91C1C]" title="Hapus baris">
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

            <button data-testid="close-shift-btn" onClick={close}
              className="tap w-full h-13 py-3 mt-4 rounded-xl bg-[#0A0A0A] text-white font-bold flex items-center justify-center gap-2">
              <Square size={16} /> Tutup Shift (F&amp;B &amp; Retail)
            </button>
            <div data-testid="close-wa-auto-hint" className="mt-2 text-[11px] text-[#52525B] flex items-center justify-center gap-1.5">
              <MessageCircle size={12} className={session?.wa_auto_shift ? "text-[#25D366]" : "text-[#a1a1aa]"} />
              {session?.wa_auto_shift
                ? "Laporan shift akan otomatis dikirim ke WhatsApp setelah ditutup."
                : "Auto-kirim WhatsApp mati — kirim manual lewat tombol di bawah (Pengaturan → WhatsApp & Laporan)."}
            </div>
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
        <div className="max-w-xl bg-white rounded-2xl border p-6 mt-6" data-testid="shift-report">
          <h3 className="font-extrabold text-lg mb-3">Laporan Shift</h3>
          <Row l="Dibuka oleh" v={report.dibuka_oleh || "-"} />
          <Row l="Ditutup oleh" v={report.ditutup_oleh || report.closed_by || "-"} />
          <Row l="Total Order" v={report.order_count} />
          <Row l="Total Penjualan" v={rupiah(report.total_sales)} />
          <div className="pt-2"><div className="text-xs font-extrabold text-[#52525B] uppercase tracking-wider mb-1">
            {lb.fnb}</div></div>
          <Row l="Dine-In" v={rupiah(report.by_type?.dine_in || 0)} />
          <Row l="Take Away" v={rupiah(report.by_type?.take_away || 0)} />
          <Row l={`Subtotal ${lb.fnb}`} v={rupiah(report.fnb_total)} accent />
          <Row l={`Kas awal ${lb.fnb}`} v={rupiah(report.opening_cash_fnb ?? report.opening_cash ?? 0)} />
          <Row l={`Kas akhir ${lb.fnb}`} v={rupiah(report.closing_cash_fnb ?? 0)} />
          <div className="pt-2"><div className="text-xs font-extrabold text-[#52525B] uppercase tracking-wider mb-1">
            {lb.retail}</div></div>
          <Row l={lb.retail} v={rupiah(report.retail_total)} accent />
          <Row l={`Kas awal ${lb.retail}`} v={rupiah(report.opening_cash_retail ?? 0)} />
          <Row l={`Kas akhir ${lb.retail}`} v={rupiah(report.closing_cash_retail ?? 0)} />
          <div className="pt-2"><div className="text-xs font-extrabold text-[#52525B] uppercase tracking-wider mb-1">Laba Kotor</div></div>
          <Row l={`Laba ${lb.fnb}`} v={rupiah(report.gross_profit_fnb)} accent />
          <Row l={`Laba ${lb.retail}`} v={rupiah(report.gross_profit_retail)} accent />
          {(report.void_count || 0) > 0 && (
            <>
              <div className="pt-2"><div className="text-xs font-extrabold text-[#52525B] uppercase tracking-wider mb-1">Pembatalan / Refund</div></div>
              <Row l="Jumlah transaksi" v={`${report.void_count}×`} />
              <Row l="Nilai dibatalkan (tidak masuk penjualan)" v={rupiah(report.void_amount || 0)} warn />
            </>
          )}
          <div className="pt-2"><div className="text-xs font-extrabold text-[#52525B] uppercase tracking-wider mb-1">Pengeluaran</div></div>
          <Row l={lb.fnb} v={rupiah(report.cash_out_fnb)} />
          <Row l={lb.retail} v={rupiah(report.cash_out_retail)} />
          {(report.transport || 0) > 0 && (
            <Row l={`Termasuk uang transport (wajib, ${lb.fnb})`} v={rupiah(report.transport)} />
          )}
          {(report.expenses_created || []).length > 0 && (
            <div className="text-[11px] text-[#15803D] font-bold mt-1" data-testid="shift-expenses-created">
              {(report.expenses_created || []).map((x, i) => (
                <div key={x.id || i}>
                  Pengeluaran saat tutup: {x.scope === "retail" ? lb.retail : lb.fnb} · {x.category} {rupiah(x.amount)}
                  {x.note ? ` · ${x.note}` : ""}
                </div>
              ))}
            </div>
          )}
          {report.expenses_empty && (
            <div data-testid="report-expense-warning"
              className="mt-2 rounded-xl bg-[#FFFBEB] border border-[#FDE68A] px-3 py-2 text-[11px] text-[#92400E] font-bold flex gap-2">
              <AlertTriangle size={14} className="shrink-0 mt-0.5" />
              <span>Laporan pengeluaran harian belum diisi (F&amp;B &amp; Retail kosong) — sudah dikonfirmasi
                bahwa memang tidak ada pengeluaran. Catatan ini ikut tercetak &amp; terkirim ke WhatsApp.</span>
            </div>
          )}
          {Object.keys(report.by_payment || {}).length > 0 && (
            <>
              <div className="pt-2"><div className="text-xs font-extrabold text-[#52525B] uppercase tracking-wider mb-1">Metode Pembayaran</div></div>
              {Object.entries(report.by_payment || {}).map(([k, v]) => (
                <Row key={k} l={k} v={rupiah(v)} />
              ))}
            </>
          )}
          <div className="pt-2"><div className="text-xs font-extrabold text-[#52525B] uppercase tracking-wider mb-1">Sisa Kas Tunai (tunai − pengeluaran)</div></div>
          <Row l={`Penjualan tunai ${lb.fnb}`} v={rupiah(report.cash_sales_fnb || 0)} />
          <Row l={`Sisa kas tunai ${lb.fnb}`} v={rupiah(report.sisa_cash_fnb || 0)} warn={(report.sisa_cash_fnb || 0) < 0} />
          <Row l={`Penjualan tunai ${lb.retail}`} v={rupiah(report.cash_sales_retail || 0)} />
          <Row l={`Sisa kas tunai ${lb.retail}`} v={rupiah(report.sisa_cash_retail || 0)} warn={(report.sisa_cash_retail || 0) < 0} />
          <div className="flex justify-between items-center pt-1" data-testid="report-sisa-cash">
            <span className="font-extrabold text-base">Total sisa kas tunai</span>
            <span className={`font-num font-extrabold text-lg ${(report.sisa_cash || 0) < 0 ? "text-[#B45309]" : "text-[#047857]"}`}>
              {rupiah(report.sisa_cash || 0)}
            </span>
          </div>
          <div className="pt-2"><div className="text-xs font-extrabold text-[#52525B] uppercase tracking-wider mb-1">Perkiraan Kas</div></div>
          <Row l={`Perkiraan kas ${lb.fnb} (awal + tunai − keluar)`} v={rupiah(reportsByScope?.fnb?.expected_cash ?? report.expected_cash)} />
          {reportsByScope?.retail && (
            <Row l={`Perkiraan kas ${lb.retail}`} v={rupiah(reportsByScope.retail.expected_cash)} />
          )}
          {(report.vendor_share || []).length > 0 && (
            <>
              <div className="pt-2"><div className="text-xs font-extrabold text-[#52525B] uppercase tracking-wider mb-1">Bagi Hasil Vendor</div></div>
              {(report.vendor_share || []).map((v) => (
                <div key={v.vendor_id} className="rounded-lg bg-[#FAFAFA] border border-[#E4E4E7] px-3 py-2 my-1.5">
                  <div className="font-bold text-sm">{v.vendor_name}</div>
                  <Row l="Omzet vendor" v={rupiah(v.gross)} />
                  <Row l="Bagi hasil (expected)" v={rupiah(v.share)} />
                  <Row l="Bagi hasil (real, diberikan)" v={rupiah(v.paid)} />
                  <Row l="Selisih" v={`${v.difference >= 0 ? "" : "-"}${rupiah(Math.abs(v.difference))}`} warn={v.difference !== 0} />
                  <Row l="Bagian outlet (omzet − bagi hasil)" v={rupiah(v.outlet_share ?? 0)} />
                  {(v.items || []).length > 0 && (
                    <>
                      <button data-testid={`report-toggle-${v.vendor_id}`} onClick={() => setOpenDetail((o) => ({ ...o, [`rp-${v.vendor_id}`]: !o[`rp-${v.vendor_id}`] }))}
                        className="tap mt-1 text-[11px] font-bold text-[#E63946] flex items-center gap-1">
                        {openDetail[`rp-${v.vendor_id}`] ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                        {openDetail[`rp-${v.vendor_id}`] ? "Sembunyikan detail produk" : `${(v.items || []).length} produk — lihat detail penjualan`}
                      </button>
                      {openDetail[`rp-${v.vendor_id}`] && (
                        <div className="mt-1.5 space-y-1 border-t border-[#F1F1F4] pt-1.5" data-testid={`report-items-${v.vendor_id}`}>
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
              <Row l="Total Omzet Vendor" v={rupiah((report.vendor_share || []).reduce((a, v) => a + (v.gross || 0), 0))} />
              <Row l="Total Bagi Hasil (expected)" v={rupiah(report.vendor_total_share)} />
              <Row l="Total Diberikan (real)" v={rupiah(report.vendor_total_paid)} />
              <Row l="Total Selisih" v={`${report.vendor_total_difference >= 0 ? "" : "-"}${rupiah(Math.abs(report.vendor_total_difference))}`} warn={report.vendor_total_difference !== 0} />
              <Row l="Total Bagian Outlet" v={rupiah(report.vendor_total_outlet ?? 0)} />
              {(report.vendor_settled_paid || 0) > 0 && (
                <Row l="Sudah dibayar via Settlement (masuk pengeluaran)" v={rupiah(report.vendor_settled_paid)} />
              )}
              {(report.vendor_settlements_created || []).length > 0 && (
                <div className="text-[11px] text-[#15803D] font-bold mt-1" data-testid="shift-settlements-created">
                  {(report.vendor_settlements_created || []).map((x) => (
                    <div key={x.id || x.settlement_no}>
                      Bukti {x.settlement_no}: {x.vendor_name} {rupiah(x.paid)} (utang setelahnya {rupiah(x.carry_out)})
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
          <div className="pt-3 mt-1 border-t-2 border-dashed">
            <div className="text-xs font-extrabold text-[#52525B] uppercase tracking-wider mb-1">Uang Bersih (setelah bagi hasil vendor)</div>
            <Row l={lb.fnb} v={rupiah(report.net_cash_fnb)} accent />
            <Row l={lb.retail} v={rupiah(report.net_cash_retail)} accent />
            <div className="flex justify-between items-center pt-1">
              <span className="font-extrabold text-base">Total ({lb.fnb} + {lb.retail})</span>
              <span className="font-num font-extrabold text-lg text-[#047857]" data-testid="report-net-total">{rupiah(report.net_cash)}</span>
            </div>
            <button data-testid="shift-print" onClick={() => latestShiftId && loadPrint(latestShiftId)}
              disabled={printLoading || !latestShiftId}
              className="tap mt-3 w-full h-11 rounded-xl bg-[#0A0A0A] hover:bg-[#27272A] text-white font-bold flex items-center justify-center gap-2 disabled:opacity-50">
              {printLoading ? <Loader2 size={16} className="animate-spin" /> : <Printer size={16} />} Cetak Laporan Shift
            </button>
            <button data-testid="shift-send-wa" onClick={sendWa} disabled={sendingWa || !latestShiftId}
              className="tap mt-2 w-full h-11 rounded-xl bg-[#25D366] hover:bg-[#1EBE5B] text-white font-bold flex items-center justify-center gap-2 disabled:opacity-50">
              {sendingWa ? <Loader2 size={16} className="animate-spin" /> : <MessageCircle size={16} />} Kirim Laporan Shift ke WhatsApp
            </button>
          </div>
        </div>
      )}

      {/* Histori shift — dikelompokkan per sesi (F&B + Retail satu baris) */}
      <div className="max-w-xl mt-6">
        <button data-testid="toggle-shift-history" onClick={() => setShowHistory((v) => !v)}
          className="tap w-full h-11 rounded-xl bg-white border font-bold text-sm flex items-center justify-center gap-2">
          {showHistory ? "Sembunyikan" : "Lihat"} Histori Laporan Shift ({history.length})
        </button>
        {showHistory && (
          <div className="mt-3 space-y-3">
            {history.length === 0 && <div className="text-center text-[#a1a1aa] py-6 bg-white rounded-2xl border">Belum ada shift ditutup.</div>}
            {history.map((s) => (
              <div key={s.id} className="bg-white rounded-2xl border p-4 text-sm" data-testid={`shift-history-${s.id}`}>
                <div className="flex justify-between items-center">
                  <span className="font-extrabold">
                    {s.opened_at ? new Date(s.opened_at).toLocaleDateString("id-ID") : "-"}
                  </span>
                  <span className="flex items-center gap-2">
                    <button onClick={() => loadPrint(s.id)} className="tap h-7 px-2.5 rounded-lg bg-[#F4F5F7] font-bold text-xs flex items-center gap-1" title="Cetak laporan shift ini"><Printer size={12} /> Cetak</button>
                    <span className="text-[11px] text-[#52525B]">{new Date(s.opened_at).toLocaleTimeString("id-ID")} – {s.closed_at ? new Date(s.closed_at).toLocaleTimeString("id-ID") : "-"}</span>
                  </span>
                </div>
                <div className="text-[11px] text-[#52525B] mt-1">
                  Dibuka: <b data-testid={`history-opened-by-${s.id}`}>{s.opened_by || s.cashier_name || "-"}</b>
                  {" · "}Ditutup: <b data-testid={`history-closed-by-${s.id}`}>{s.closed_by || "-"}</b>
                </div>
                <div className="mt-1.5 grid grid-cols-2 gap-x-3 text-[13px]">
                  <Row l="Penjualan" v={rupiah(s.total_sales)} />
                  <Row l="Order" v={s.order_count} />
                  <Row l={lb.fnb} v={rupiah(s.fnb_total)} />
                  <Row l={lb.retail} v={rupiah(s.retail_total)} />
                  <Row l={`Kas awal ${lb.fnb}`} v={rupiah(s.opening_cash_fnb || 0)} />
                  <Row l={`Kas awal ${lb.retail}`} v={rupiah(s.opening_cash_retail || 0)} />
                  <Row l={`Uang bersih ${lb.fnb}`} v={rupiah(s.net_cash_fnb || 0)} />
                  <Row l={`Uang bersih ${lb.retail}`} v={rupiah(s.net_cash_retail || 0)} />
                  <Row l="Uang bersih total" v={rupiah(s.net_cash)} accent />
                  <Row l="Pengeluaran" v={rupiah(s.cash_out || 0)} />
                  <Row l="Uang transport" v={rupiah(s.transport || 0)} />
                  <Row l="Sisa kas tunai" v={rupiah(s.sisa_cash || 0)} />
                </div>
                {s.vendor_total_share > 0 && (
                  <div className="text-[11px] text-[#52525B] mt-1">Vendor: share {rupiah(s.vendor_total_share)} · diberikan {rupiah(s.vendor_total_paid)}{s.vendor_settled_paid ? ` · settlement ${rupiah(s.vendor_settled_paid)}` : ""}</div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

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
            <button data-testid="shift-print-do" onClick={doPrintText} disabled={printText == null} className="tap w-full h-12 rounded-xl bg-[#0A0A0A] text-white font-bold flex items-center justify-center gap-2 disabled:opacity-50">
              <Printer size={17} /> Cetak Sekarang
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
