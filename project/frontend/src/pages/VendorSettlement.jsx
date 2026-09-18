/* ================================================================
   SETTLEMENT VENDOR — pembayaran bagi hasil ke vendor konsinyasi.

   Konsep (sesuai kebutuhan operasional):
   - Periode HARIAN: satu hari = satu rekap per vendor.
   - SATU VENDOR per transaksi pembayaran.
   - Kekurangan bayar otomatis menjadi SALDO (dibawa ke settlement berikutnya).
   - Pembayaran dicatat sebagai KAS KELUAR → mengurangi kas laci & uang bersih,
     dan ikut tampil di laporan shift.
   - Bukti pembayaran bisa dicetak atau dikirim ke WhatsApp vendor.

   Tab: "Rekap & Bayar" (harian) | "Riwayat & Saldo".
   ================================================================ */
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import api, { apiError } from "@/lib/api";
import { rupiah } from "@/lib/format";
import { toast } from "sonner";
import {
  HandCoins, Loader2, Printer, Send, Wallet, Receipt, History, ChevronDown, ChevronRight,
  Ban, RefreshCw, AlertTriangle, Users,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { printText } from "@/lib/print";
import { can } from "@/lib/rbac";
import { useAuth } from "@/context/AuthContext";

const todayStr = () => {
  const d = new Date(Date.now() + 7 * 3600 * 1000); // WIB
  return d.toISOString().slice(0, 10);
};
const shiftDay = (s, n) => {
  const d = new Date(`${s}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const dayLabel = (s) => {
  try {
    return new Date(`${s}T00:00:00Z`).toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  } catch (e) { return s; }
};

/* ------------------------------- TAB 1: Rekap & Bayar ------------------------------- */
function RekapBayar({ initialDate }) {
  const { user } = useAuth();
  const [date, setDate] = useState(initialDate || todayStr());
  const [board, setBoard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [pay, setPay] = useState(null); // {row, paid, payment_method, note, create_cash_out}
  const [saving, setSaving] = useState(false);
  const [openItems, setOpenItems] = useState({});
  const [receipt, setReceipt] = useState(null); // {text, settlement_no, id, vendor_name}
  const [sending, setSending] = useState(false);

  const load = async (d = date) => {
    setLoading(true); setErr("");
    try {
      const { data } = await api.get("/vendor-settlements/board", { params: { date: d } });
      setBoard(data);
    } catch (e) { setErr(apiError(e.response?.data?.detail) || "Gagal memuat rekap vendor"); setBoard(null); }
    finally { setLoading(false); }
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- muat saat tanggal berubah
  useEffect(() => { load(date); }, [date]);

  const openPay = (row) => {
    const suggest = row.remaining > 0.009 ? row.remaining : 0;
    setPay({ row, paid: suggest ? String(suggest) : "", payment_method: "Tunai", note: "", create_cash_out: true });
  };

  const submit = async () => {
    if (!pay) return;
    const nominal = Number(pay.paid || 0);
    if (!(nominal > 0)) return toast.error("Nominal pembayaran harus lebih dari 0");
    setSaving(true);
    try {
      const { data } = await api.post("/vendor-settlements", {
        date, vendor_id: pay.row.vendor_id, paid: nominal,
        payment_method: pay.payment_method, note: pay.note, create_cash_out: pay.create_cash_out,
      });
      toast.success(`Pembayaran ${data.settlement_no} tersimpan${pay.create_cash_out ? " & tercatat sebagai kas keluar" : ""}`);
      setReceipt({ ...data, vendor_name: pay.row.vendor_name });
      setPay(null);
      await load();
    } catch (e) { toast.error(apiError(e.response?.data?.detail), { duration: 9000 }); }
    finally { setSaving(false); }
  };

  const sendWa = async (sid) => {
    setSending(true);
    const t = toast.loading("Mengirim bukti pembayaran ke WhatsApp vendor...");
    try {
      const { data } = await api.post(`/vendor-settlements/${sid}/send-wa`, {});
      toast.success(`Bukti terkirim ke ${(data?.sent || []).length} nomor`, { id: t });
    } catch (e) { toast.error(apiError(e.response?.data?.detail), { id: t, duration: 9000 }); }
    finally { setSending(false); }
  };

  const rows = board?.rows || [];
  const tot = board?.totals || {};

  return (
    <div className="p-6 lg:p-8" data-testid="settle-rekap">
      <div className="flex items-end gap-3 flex-wrap mb-4">
        <div>
          <label className="text-xs font-bold text-[#52525B] uppercase tracking-wider block mb-1">Tanggal rekap (harian)</label>
          <input data-testid="settle-date" type="date" value={date} onChange={(e) => setDate(e.target.value || todayStr())}
            className="h-11 rounded-xl border px-3 bg-white font-num" />
        </div>
        <button onClick={() => load()} className="tap h-11 px-4 rounded-xl bg-white border font-bold flex items-center gap-2">
          <RefreshCw size={16} /> Muat Ulang
        </button>
        <div className="flex gap-2">
          <button onClick={() => setDate(shiftDay(date, -1))} className="tap h-11 px-3 rounded-xl bg-white border font-bold text-sm">−1 hari</button>
          <button onClick={() => setDate(shiftDay(date, 1))} className="tap h-11 px-3 rounded-xl bg-white border font-bold text-sm">+1 hari</button>
          <button onClick={() => setDate(todayStr())} className="tap h-11 px-3 rounded-xl bg-white border font-bold text-sm">Hari ini</button>
        </div>
        {board?.shift && (
          <span className="text-xs text-[#52525B] flex items-center gap-1.5">
            <Wallet size={13} /> Shift kasir berjalan — pembayaran otomatis masuk kas shift ini
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
        <Kpi label="Bagi hasil hari ini" value={rupiah(tot.vendor_share)} accent />
        <Kpi label="Saldo dibawa" value={rupiah(tot.carry_in)} />
        <Kpi label="Sudah dibayar hari ini" value={rupiah(tot.paid_today)} />
        <Kpi label="Sisa harus dibayar" value={rupiah(tot.remaining)} warn={tot.remaining > 0.009} />
      </div>

      {err && (
        <div className="mb-4 rounded-2xl border border-[#FCA5A5] bg-[#FEF2F2] p-4 text-sm text-[#B91C1C] flex items-center gap-2">
          <AlertTriangle size={16} /> {err}
        </div>
      )}

      <div className="bg-white rounded-2xl border overflow-hidden">
        <div className="px-5 py-4 border-b flex items-center justify-between flex-wrap gap-2">
          <h3 className="font-extrabold flex items-center gap-2"><HandCoins size={18} className="text-[#E63946]" /> Rekap {dayLabel(date)}</h3>
          <span className="text-xs text-[#52525B]">{rows.length} vendor</span>
        </div>
        {loading ? (
          <div className="h-40 grid place-items-center"><Loader2 className="animate-spin text-[#E63946]" /></div>
        ) : rows.length === 0 ? (
          <div className="p-8 text-center text-sm text-[#52525B]" data-testid="settle-empty">
            Belum ada penjualan produk vendor pada tanggal ini dan tidak ada saldo tertunggak.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[#F4F5F7] text-[#52525B] text-xs uppercase tracking-wider">
                <tr>
                  <th className="text-left p-3">Vendor</th>
                  <th className="text-right p-3">Omzet</th>
                  <th className="text-right p-3">Bagi hasil</th>
                  <th className="text-right p-3">Saldo</th>
                  <th className="text-right p-3">Harus dibayar</th>
                  <th className="text-right p-3">Dibayar</th>
                  <th className="text-right p-3">Sisa</th>
                  <th className="text-right p-3">Aksi</th>
                </tr>
              </thead>
              <tbody data-testid="settle-rows">
                {rows.map((r) => (
                  <tr key={r.vendor_id} data-testid={`settle-row-${r.vendor_id}`} className="border-b last:border-0">
                    <td className="p-3">
                      <div className="font-bold flex items-center gap-2">
                        {r.vendor_name}
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-[#F4F5F7] text-[#52525B] uppercase">{r.scope}</span>
                      </div>
                      {(r.items || []).length > 0 && (
                        <button onClick={() => setOpenItems((o) => ({ ...o, [r.vendor_id]: !o[r.vendor_id] }))}
                          data-testid={`settle-items-${r.vendor_id}`}
                          className="text-[11px] text-[#E63946] font-bold mt-0.5 flex items-center gap-1">
                          {openItems[r.vendor_id] ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                          {openItems[r.vendor_id] ? "Sembunyikan" : `${(r.items || []).length} produk terjual`}
                        </button>
                      )}
                      {openItems[r.vendor_id] && (
                        <div className="mt-1.5 space-y-1 border-t border-[#F1F1F4] pt-1.5">
                          {r.items.map((im, i) => (
                            <div key={i} className="flex justify-between gap-3 text-[11px] text-[#52525B]">
                              <span className="truncate">{im.name} ×{im.qty}</span>
                              <span className="font-num shrink-0">{rupiah(im.gross)} <span className="text-[#E63946]">(vendor {rupiah(im.vendor_share)})</span></span>
                            </div>
                          ))}
                        </div>
                      )}
                      {(r.settlements || []).length > 0 && (
                        <div className="text-[11px] text-[#15803D] mt-1" data-testid={`settle-paid-list-${r.vendor_id}`}>
                          {r.settlements.map((s) => `${s.settlement_no} ${rupiah(s.paid)}${s.payment_method ? " · " + s.payment_method : ""}${s.source === "shift_close" ? " (tutup shift)" : ""}`).join(" · ")}
                        </div>
                      )}
                    </td>
                    <td className="p-3 text-right font-num">{rupiah(r.gross)}</td>
                    <td className="p-3 text-right font-num">{rupiah(r.vendor_share)}</td>
                    <td className="p-3 text-right font-num text-[#7C3AED]">{r.carry_in ? rupiah(r.carry_in) : "—"}</td>
                    <td className="p-3 text-right font-num font-bold">{rupiah(r.total_due)}</td>
                    <td className="p-3 text-right font-num">{rupiah(r.paid_today)}</td>
                    <td className={`p-3 text-right font-num font-bold ${r.remaining > 0.009 ? "text-[#B45309]" : "text-[#15803D]"}`}>{rupiah(r.remaining)}</td>
                    <td className="p-3 text-right">
                      <button data-testid={`settle-pay-${r.vendor_id}`} onClick={() => openPay(r)}
                        className="tap h-9 px-3 rounded-lg bg-[#E63946] hover:bg-[#BE123C] text-white font-bold text-xs inline-flex items-center gap-1.5">
                        <Wallet size={14} /> Bayar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="text-[11px] text-[#a1a1aa] mt-4 leading-relaxed max-w-3xl">
        <b>Saldo</b> = bagi hasil yang belum diserahkan (termasuk hari-hari sebelumnya yang belum dibayar) dan otomatis
        terbawa ke settlement berikutnya. Nominal omzet &amp; bagi hasil dihitung ulang di server dari transaksi lunas,
        jadi angkanya selalu sama dengan laporan penjualan. Pembayaran tercatat sebagai <b>kas keluar</b> — kas laci
        dan uang bersih di laporan shift ikut berkurang.
      </p>

      {/* ---- dialog bayar ---- */}
      <Dialog open={!!pay} onOpenChange={(o) => !o && setPay(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Wallet size={17} /> Bayar Bagi Hasil</DialogTitle></DialogHeader>
          {pay && (
            <div className="space-y-3">
              <div className="rounded-xl bg-[#FAFAFA] border px-3 py-2 text-sm">
                <div className="font-extrabold">{pay.row.vendor_name}</div>
                <div className="text-[#52525B] text-xs">Periode {date} · {pay.row.scope}</div>
              </div>
              <Row l="Bagi hasil hari ini" v={rupiah(pay.row.vendor_share)} />
              <Row l="Saldo sebelum" v={rupiah(pay.row.carry_in)} />
              <Row l="Total harus dibayar" v={rupiah(pay.row.total_due)} bold />
              {pay.row.paid_today > 0 && <Row l="Sudah dibayar hari ini" v={rupiah(pay.row.paid_today)} />}
              <Row l="Sisa setelah ini" v={rupiah(pay.row.total_due - Number(pay.paid || 0))} warn={pay.row.total_due - Number(pay.paid || 0) > 0.009} />
              <div>
                <label className="text-xs font-bold text-[#52525B] uppercase tracking-wider block mb-1">Nominal dibayarkan</label>
                <div className="flex gap-2">
                  <input data-testid="settle-paid-input" type="number" min="0" step="any" value={pay.paid}
                    onChange={(e) => setPay({ ...pay, paid: e.target.value })}
                    className="h-11 rounded-xl border px-3 font-num flex-1" placeholder="0" />
                  <button onClick={() => setPay({ ...pay, paid: String(Math.max(0, pay.row.remaining)) })}
                    className="tap h-11 px-3 rounded-xl bg-white border font-bold text-xs">Isi sisa</button>
                </div>
              </div>
              <div>
                <label className="text-xs font-bold text-[#52525B] uppercase tracking-wider block mb-1">Metode</label>
                <select data-testid="settle-method" value={pay.payment_method} onChange={(e) => setPay({ ...pay, payment_method: e.target.value })}
                  className="w-full h-11 rounded-xl border px-3 bg-white">
                  <option>Tunai</option><option>Transfer</option><option>QRIS</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-bold text-[#52525B] uppercase tracking-wider block mb-1">Catatan (opsional)</label>
                <input data-testid="settle-note" value={pay.note} onChange={(e) => setPay({ ...pay, note: e.target.value })}
                  className="w-full h-11 rounded-xl border px-3" placeholder="cth: titipan minggu lalu" />
              </div>
              <label className="flex items-start gap-2 text-sm">
                <input data-testid="settle-cashout" type="checkbox" checked={pay.create_cash_out}
                  onChange={(e) => setPay({ ...pay, create_cash_out: e.target.checked })} className="mt-0.5" />
                <span>Catat sebagai <b>kas keluar</b> (mengurangi kas laci &amp; uang bersih + tampil di laporan shift)</span>
              </label>
            </div>
          )}
          <DialogFooter>
            <button data-testid="settle-save" onClick={submit} disabled={saving}
              className="tap w-full h-12 rounded-xl bg-[#E63946] text-white font-bold disabled:opacity-50 flex items-center justify-center gap-2">
              {saving ? <Loader2 size={17} className="animate-spin" /> : <Receipt size={17} />} Simpan &amp; Buat Bukti
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---- bukti pembayaran ---- */}
      <Dialog open={!!receipt} onOpenChange={(o) => !o && setReceipt(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Receipt size={17} /> Bukti Pembayaran</DialogTitle></DialogHeader>
          {receipt && (
            <pre data-testid="settle-receipt-pre" className="text-[11px] leading-5 whitespace-pre-wrap font-mono bg-[#FAFAFA] border rounded-xl p-3 max-h-[45vh] overflow-y-auto">{receipt.text}</pre>
          )}
          <DialogFooter>
            <div className="flex gap-2 w-full">
              <button data-testid="settle-print" onClick={() => printText(receipt?.text || "", `Bukti ${receipt?.settlement_no || ""}`)}
                className="tap flex-1 h-12 rounded-xl bg-[#0A0A0A] text-white font-bold flex items-center justify-center gap-2">
                <Printer size={17} /> Cetak
              </button>
              {can(user, "whatsapp") && (
                <button data-testid="settle-wa" onClick={() => sendWa(receipt.id)} disabled={sending}
                  className="tap flex-1 h-12 rounded-xl bg-[#25D366] text-white font-bold flex items-center justify-center gap-2 disabled:opacity-50">
                  {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />} Kirim WA
                </button>
              )}
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ------------------------------- TAB 2: Riwayat & Saldo ------------------------------- */
function Riwayat() {
  const { user } = useAuth();
  const [start, setStart] = useState(shiftDay(todayStr(), -14));
  const [end, setEnd] = useState(todayStr());
  const [vendorId, setVendorId] = useState("");
  const [includeVoided, setIncludeVoided] = useState(false);
  const [data, setData] = useState(null);
  const [vendors, setVendors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [preview, setPreview] = useState(null);
  const [voidTarget, setVoidTarget] = useState(null);
  const [voidReason, setVoidReason] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const { data: d } = await api.get("/vendor-settlements", {
        params: { start, end, include_voided: includeVoided, ...(vendorId ? { vendor_id: vendorId } : {}) },
      });
      setData(d);
    } catch (e) { toast.error(apiError(e.response?.data?.detail)); setData(null); }
    finally { setLoading(false); }
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- muat ulang saat filter berubah
  useEffect(() => { load(); }, [start, end, vendorId, includeVoided]);
  useEffect(() => { api.get("/vendors").then((r) => setVendors(r.data)).catch(() => {}); }, []);

  const print = async (row) => {
    try {
      const { data: d } = await api.get(`/vendor-settlements/${row.id}/print`);
      setPreview({ ...d, vendor_name: row.vendor_name });
    } catch (e) { toast.error(apiError(e.response?.data?.detail)); }
  };
  const sendWa = async (row) => {
    setBusy(true);
    const t = toast.loading("Mengirim bukti pembayaran...");
    try {
      const { data: d } = await api.post(`/vendor-settlements/${row.id}/send-wa`, {});
      toast.success(`Bukti terkirim ke ${(d?.sent || []).length} nomor`, { id: t });
    } catch (e) { toast.error(apiError(e.response?.data?.detail), { id: t, duration: 9000 }); }
    finally { setBusy(false); }
  };
  const doVoid = async () => {
    if (!voidTarget) return;
    if (!voidReason.trim()) return toast.error("Alasan pembatalan wajib diisi");
    setBusy(true);
    try {
      await api.post(`/vendor-settlements/${voidTarget.id}/void`, { reason: voidReason.trim() });
      toast.success("Settlement dibatalkan — kas keluar terkait dihapus & saldo vendor dihitung ulang");
      setVoidTarget(null); setVoidReason("");
      await load();
    } catch (e) { toast.error(apiError(e.response?.data?.detail)); }
    finally { setBusy(false); }
  };

  const rows = data?.rows || [];
  const tot = data?.totals || {};
  const balances = useMemo(() => data?.balances || [], [data]);

  return (
    <div className="p-6 lg:p-8" data-testid="settle-riwayat">
      <div className="flex items-end gap-3 flex-wrap mb-5">
        <div>
          <label className="text-xs font-bold text-[#52525B] uppercase tracking-wider block mb-1">Dari</label>
          <input data-testid="settle-start" type="date" value={start} onChange={(e) => setStart(e.target.value)} className="h-11 rounded-xl border px-3 bg-white font-num" />
        </div>
        <div>
          <label className="text-xs font-bold text-[#52525B] uppercase tracking-wider block mb-1">Sampai</label>
          <input data-testid="settle-end" type="date" value={end} onChange={(e) => setEnd(e.target.value)} className="h-11 rounded-xl border px-3 bg-white font-num" />
        </div>
        <div>
          <label className="text-xs font-bold text-[#52525B] uppercase tracking-wider block mb-1">Vendor</label>
          <select data-testid="settle-vendor" value={vendorId} onChange={(e) => setVendorId(e.target.value)} className="h-11 rounded-xl border px-3 bg-white min-w-[180px]">
            <option value="">Semua vendor</option>
            {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
        </div>
        <label className="flex items-center gap-2 text-sm h-11">
          <input data-testid="settle-include-voided" type="checkbox" checked={includeVoided} onChange={(e) => setIncludeVoided(e.target.checked)} />
          Tampilkan yang dibatalkan
        </label>
        <button onClick={load} className="tap h-11 px-4 rounded-xl bg-white border font-bold flex items-center gap-2">
          <RefreshCw size={16} /> Muat Ulang
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
        <Kpi label="Total dibayar ke vendor" value={rupiah(tot.paid)} accent />
        <Kpi label="Omzet tercatat" value={rupiah(tot.gross)} />
        <Kpi label="Bagi hasil tercatat" value={rupiah(tot.vendor_share)} />
        <Kpi label="Total saldo (utang) kini" value={rupiah(data?.total_balance || 0)} warn={(data?.total_balance || 0) > 0.009} />
      </div>

      {/* Saldo berjalan per vendor */}
      <div className="bg-white rounded-2xl border p-5 mb-5" data-testid="settle-balances">
        <h3 className="font-extrabold flex items-center gap-2 mb-1"><Users size={17} className="text-[#7C3AED]" /> Saldo per Vendor (setelah {end})</h3>
        <p className="text-xs text-[#52525B] mb-3">Sisa bagi hasil yang belum diserahkan — otomatis terbawa ke settlement berikutnya.</p>
        {balances.length === 0 ? (
          <div className="text-sm text-[#15803D]">Semua vendor lunas — tidak ada saldo tertunggak. 🎉</div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {balances.map((b) => (
              <div key={b.vendor_id} data-testid={`settle-balance-${b.vendor_id}`}
                className="rounded-xl border px-3 py-2 bg-[#FAFAFA] text-sm">
                <div className="font-bold">{b.vendor_name}</div>
                <div className={`font-num font-extrabold ${b.balance > 0 ? "text-[#B45309]" : "text-[#15803D]"}`}>{rupiah(b.balance)}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bg-white rounded-2xl border overflow-hidden">
        <div className="px-5 py-4 border-b flex items-center justify-between flex-wrap gap-2">
          <h3 className="font-extrabold flex items-center gap-2"><History size={18} className="text-[#E63946]" /> Riwayat Penyerahan Uang</h3>
          <span className="text-xs text-[#52525B]">{rows.length} transaksi</span>
        </div>
        {loading ? (
          <div className="h-40 grid place-items-center"><Loader2 className="animate-spin text-[#E63946]" /></div>
        ) : rows.length === 0 ? (
          <div className="p-8 text-center text-sm text-[#52525B]" data-testid="settle-history-empty">Belum ada pembayaran pada rentang ini.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[#F4F5F7] text-[#52525B] text-xs uppercase tracking-wider">
                <tr>
                  <th className="text-left p-3">No. Bukti</th>
                  <th className="text-left p-3">Tanggal</th>
                  <th className="text-left p-3">Vendor</th>
                  <th className="text-right p-3">Omzet</th>
                  <th className="text-right p-3">Bagi hasil</th>
                  <th className="text-right p-3">Saldo sblm</th>
                  <th className="text-right p-3">Dibayar</th>
                  <th className="text-right p-3">Sisa</th>
                  <th className="text-left p-3">Metode</th>
                  <th className="text-right p-3">Aksi</th>
                </tr>
              </thead>
              <tbody data-testid="settle-history-rows">
                {rows.map((r) => (
                  <tr key={r.id} data-testid={`settle-hist-${r.id}`} className={`border-b last:border-0 ${r.voided ? "opacity-60" : ""}`}>
                    <td className="p-3 font-num">
                      {r.settlement_no}
                      {r.voided && <span className="ml-2 text-[10px] font-bold px-1.5 py-0.5 rounded bg-[#FEE2E2] text-[#B91C1C]" data-testid={`settle-voided-${r.id}`}>DIBATALKAN</span>}
                    </td>
                    <td className="p-3 font-num">{r.date}</td>
                    <td className="p-3">
                      <div className="font-bold">{r.vendor_name}</div>
                      {r.source === "shift_close" && (
                        <span className="inline-block text-[10px] font-bold px-1.5 py-0.5 rounded bg-[#EEF2FF] text-[#4338CA]"
                          data-testid={`settle-fromshift-${r.id}`}>Dari tutup shift</span>
                      )}
                      {r.note ? <div className="text-[11px] text-[#52525B]">{r.note}</div> : null}
                      {r.by ? <div className="text-[11px] text-[#a1a1aa]">oleh {r.by}</div> : null}
                    </td>
                    <td className="p-3 text-right font-num">{rupiah(r.gross)}</td>
                    <td className="p-3 text-right font-num">{rupiah(r.vendor_share)}</td>
                    <td className="p-3 text-right font-num">{r.carry_in ? rupiah(r.carry_in) : "—"}</td>
                    <td className="p-3 text-right font-num font-bold">{rupiah(r.paid)}</td>
                    <td className={`p-3 text-right font-num ${r.carry_out > 0.009 ? "text-[#B45309]" : "text-[#15803D]"}`}>{rupiah(r.carry_out)}</td>
                    <td className="p-3">{r.payment_method}{r.cash_movement_id ? <div className="text-[10px] text-[#15803D]">kas keluar</div> : <div className="text-[10px] text-[#a1a1aa]">tanpa kas</div>}</td>
                    <td className="p-3 text-right whitespace-nowrap">
                      <button data-testid={`settle-print-${r.id}`} onClick={() => print(r)} title="Cetak bukti"
                        className="tap h-9 w-9 rounded-lg border bg-white inline-grid place-items-center mr-1"><Printer size={14} /></button>
                      {can(user, "whatsapp") && (
                        <button data-testid={`settle-rowwa-${r.id}`} onClick={() => sendWa(r)} disabled={busy} title="Kirim WA ke vendor"
                          className="tap h-9 w-9 rounded-lg border bg-white inline-grid place-items-center mr-1 disabled:opacity-50"><Send size={14} /></button>
                      )}
                      {can(user, "vendor") && !r.voided && (
                        <button data-testid={`settle-void-${r.id}`} onClick={() => { setVoidTarget(r); setVoidReason(""); }} title="Batalkan"
                          className="tap h-9 w-9 rounded-lg border bg-white inline-grid place-items-center text-[#EF4444]"><Ban size={14} /></button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Dialog open={!!preview} onOpenChange={(o) => !o && setPreview(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Receipt size={17} /> Bukti {preview?.settlement_no}</DialogTitle></DialogHeader>
          <pre data-testid="settle-preview-pre" className="text-[11px] leading-5 whitespace-pre-wrap font-mono bg-[#FAFAFA] border rounded-xl p-3 max-h-[45vh] overflow-y-auto">{preview?.text}</pre>
          <DialogFooter>
            <button data-testid="settle-preview-print" onClick={() => printText(preview?.text || "", `Bukti ${preview?.settlement_no || ""}`)}
              className="tap w-full h-12 rounded-xl bg-[#0A0A0A] text-white font-bold flex items-center justify-center gap-2">
              <Printer size={17} /> Cetak
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!voidTarget} onOpenChange={(o) => !o && setVoidTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle className="flex items-center gap-2 text-[#B91C1C]"><Ban size={17} /> Batalkan Settlement</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-[#52525B]">
              {voidTarget?.settlement_no} — {voidTarget?.vendor_name} {rupiah(voidTarget?.paid || 0)}.
              Kas keluar terkait dihapus sehingga kas laci kembali, dan saldo vendor dihitung ulang otomatis.
            </p>
            <div>
              <label className="text-xs font-bold text-[#52525B] uppercase tracking-wider block mb-1">Alasan (wajib)</label>
              <input data-testid="settle-void-reason" value={voidReason} onChange={(e) => setVoidReason(e.target.value)}
                className="w-full h-11 rounded-xl border px-3" placeholder="cth: salah vendor / nominal salah" />
            </div>
          </div>
          <DialogFooter>
            <button data-testid="settle-void-confirm" onClick={doVoid} disabled={busy}
              className="tap w-full h-12 rounded-xl bg-[#B91C1C] text-white font-bold disabled:opacity-50">Batalkan Settlement</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

const TABS = [
  { key: "rekap", label: "Rekap & Bayar", icon: HandCoins, comp: RekapBayar },
  { key: "riwayat", label: "Riwayat & Saldo", icon: History, comp: Riwayat },
];

export default function VendorSettlement() {
  const [params, setParams] = useSearchParams();
  const keys = TABS.map((t) => t.key);
  const tab = keys.includes(params.get("tab")) ? params.get("tab") : "rekap";
  const Active = (TABS.find((t) => t.key === tab) || TABS[0]).comp;

  return (
    <div className="h-full overflow-y-auto" data-testid="vendor-settlement">
      <div className="px-6 lg:px-8 pt-6 pb-2">
        <h1 className="text-3xl font-extrabold flex items-center gap-2"><HandCoins /> Settlement Vendor</h1>
        <p className="text-[#52525B] mt-1">
          Rekap &amp; pembayaran bagi hasil vendor konsinyasi (harian, satu vendor per transaksi) — lengkap dengan
          riwayat penyerahan uang, saldo berjalan, dan cetak bukti pembayaran.
        </p>
      </div>
      <div className="flex gap-1.5 px-6 lg:px-8 pb-3 overflow-x-auto no-scrollbar">
        {TABS.map((t) => (
          <button key={t.key} data-testid={`settle-tab-${t.key}`} onClick={() => setParams({ tab: t.key })}
            className={`tap flex items-center gap-2 px-4 h-10 rounded-xl font-bold text-sm whitespace-nowrap ${
              tab === t.key ? "bg-[#E63946] text-white" : "bg-white border text-[#52525B] hover:bg-[#F4F5F7]"
            }`}>
            <t.icon size={16} /> {t.label}
          </button>
        ))}
      </div>
      <Active initialDate={params.get("date")} />
    </div>
  );
}

const Kpi = ({ label, value, accent, warn }) => (
  <div className="bg-white rounded-2xl border p-4">
    <div className="text-[11px] font-bold text-[#52525B] uppercase tracking-wider">{label}</div>
    <div className={`font-num font-extrabold text-xl mt-1 ${warn ? "text-[#B45309]" : accent ? "text-[#E63946]" : ""}`}>{value}</div>
  </div>
);
const Row = ({ l, v, bold, warn }) => (
  <div className="flex justify-between py-1 border-b last:border-0 text-sm">
    <span className="text-[#52525B]">{l}</span>
    <span className={`font-num ${bold ? "font-extrabold" : "font-bold"} ${warn ? "text-[#B45309]" : ""}`}>{v}</span>
  </div>
);
