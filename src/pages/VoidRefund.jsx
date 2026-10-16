/* ================================================================
   VOID & REFUND — riwayat pembatalan transaksi (pengawasan).
   Keputusan pemilik (docs/RANCANGAN-VOID-PESANAN.md):
     - kasir boleh void sendiri, HANYA order pada shift yang sedang terbuka;
     - order pada shift yang sudah ditutup dibatalkan hanya oleh admin (lepas blokir sadar);
     - pengawasan: halaman ini berisi riwayat + filter kasir/tanggal/jenis/lintas shift.
   Modul izin (RBAC): "void" — kasir & admin memilikinya.
   ================================================================ */
import { useEffect, useState, useCallback } from "react";
import api, { apiError } from "@/lib/api";
import { toast } from "sonner";
import { wibToday } from "@/lib/format";
import { useAuth } from "@/context/AuthContext";
import { isAdmin } from "@/lib/rbac";
import {
  Ban, RotateCcw, Loader2, RefreshCw, Search, ShieldAlert, AlertTriangle, Receipt, X,
} from "lucide-react";

const nf = (n) => (n == null ? "0" : Number(n).toLocaleString("id-ID", { maximumFractionDigits: 2 }));
const fmtRp = (n) => "Rp" + Math.round(Number(n || 0)).toLocaleString("id-ID");
const dt = (s) => (s ? new Date(s).toLocaleString("id-ID", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—");

export default function VoidRefund() {
  const { user } = useAuth();
  const admin = isAdmin(user) || user?.is_superadmin;
  const [start, setStart] = useState(wibToday());
  const [end, setEnd] = useState(wibToday());
  const [cashierId, setCashierId] = useState("");
  const [kind, setKind] = useState("");
  const [crossOnly, setCrossOnly] = useState(false);
  const [q, setQ] = useState("");
  const [data, setData] = useState({ rows: [], summary: { by_cashier: [] }, cashiers: [] });
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    api.get("/voids", {
      params: {
        start, end,
        ...(cashierId ? { cashier_id: cashierId } : {}),
        ...(kind ? { kind } : {}),
        ...(crossOnly ? { cross_shift: true } : {}),
        ...(q.trim() ? { q: q.trim() } : {}),
      },
    })
      .then((r) => setData(r.data || { rows: [], summary: {}, cashiers: [] }))
      .catch((e) => toast.error(apiError(e.response?.data?.detail)))
      .finally(() => setLoading(false));
  }, [start, end, cashierId, kind, crossOnly, q]);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- refetch saat filter berubah
  useEffect(() => { load(); }, [start, end, cashierId, kind, crossOnly]);

  const s = data.summary || {};
  const rows = data.rows || [];
  const totalPeriod = Number(s.amount || 0);

  return (
    <div className="h-full overflow-y-auto p-6 lg:p-8" data-testid="void-page">
      <div className="flex items-center justify-between flex-wrap gap-3 mb-5">
        <h1 className="text-3xl font-extrabold flex items-center gap-2"><Ban /> Void &amp; Refund</h1>
        <button data-testid="void-reload" onClick={load} disabled={loading}
          className="tap h-11 px-4 rounded-xl bg-white border font-bold text-sm flex items-center gap-2 disabled:opacity-60">
          {loading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />} Muat Ulang
        </button>
      </div>

      <p className="text-xs text-[#52525B] -mt-3 mb-5 max-w-3xl">
        Halaman pengawasan pembatalan. Transaksi yang dibatalkan/refund <b>otomatis keluar dari penjualan, laba, kas, dan bagi hasil</b> —
        daftar ini yang menjadikannya terlihat: siapa, kapan, di shift mana, dan alasannya.
        {!admin && " Sebagai kasir Anda hanya bisa membatalkan transaksi pada shift yang sedang terbuka; transaksi shift lama dibatalkan admin."}
      </p>

      {/* ringkasan */}
      <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-5">
        <Kpi label="Jumlah pembatalan" value={nf(s.count)} tone="#0A0A0A" icon={<Ban size={16} />} />
        <Kpi label="Void / Refund" value={`${nf(s.void_count)} / ${nf(s.refund_count)}`} tone="#4338CA"
          icon={<RotateCcw size={16} />} />
        <Kpi label="Nilai dibatalkan" value={fmtRp(totalPeriod)} tone="#B45309" icon={<AlertTriangle size={16} />} />
        <Kpi label="Koreksi lintas shift" value={nf(s.cross_shift_count)} tone="#B91C1C" icon={<ShieldAlert size={16} />} />
      </div>

      {/* filter */}
      <div className="bg-white rounded-2xl border p-4 mb-4 flex flex-wrap items-end gap-3">
        <div><label className="text-[11px] font-bold text-[#52525B] uppercase block mb-1">Dari tanggal</label>
          <input data-testid="void-start" type="date" value={start} onChange={(e) => setStart(e.target.value)} className="h-10 rounded-xl border px-3 font-num" /></div>
        <div><label className="text-[11px] font-bold text-[#52525B] uppercase block mb-1">Sampai</label>
          <input data-testid="void-end" type="date" value={end} onChange={(e) => setEnd(e.target.value)} className="h-10 rounded-xl border px-3 font-num" /></div>
        <div><label className="text-[11px] font-bold text-[#52525B] uppercase block mb-1">Kasir</label>
          <select data-testid="void-cashier" value={cashierId} onChange={(e) => setCashierId(e.target.value)} className="h-10 rounded-xl border px-3 bg-white text-sm min-w-[10rem]">
            <option value="">Semua kasir</option>
            {(data.cashiers || []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select></div>
        <div><label className="text-[11px] font-bold text-[#52525B] uppercase block mb-1">Jenis</label>
          <select data-testid="void-kind" value={kind} onChange={(e) => setKind(e.target.value)} className="h-10 rounded-xl border px-3 bg-white text-sm">
            <option value="">Semua</option><option value="void">Void</option><option value="refund">Refund</option>
          </select></div>
        <label className="flex items-center gap-2 h-10 text-sm font-bold">
          <input data-testid="void-cross" type="checkbox" checked={crossOnly} onChange={(e) => setCrossOnly(e.target.checked)} />
          Hanya lintas shift
        </label>
        <div className="flex-1 min-w-[12rem]"><label className="text-[11px] font-bold text-[#52525B] uppercase block mb-1">Cari nomor order</label>
          <div className="flex gap-2">
            <input data-testid="void-search" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") load(); }}
              placeholder="GAK-…" className="h-10 rounded-xl border px-3 font-num text-sm flex-1" />
            <button data-testid="void-search-btn" onClick={load} className="tap h-10 px-4 rounded-xl bg-[#0A0A0A] text-white font-bold text-sm flex items-center gap-1"><Search size={14} /> Cari</button>
          </div>
        </div>
      </div>

      {/* ringkasan per kasir */}
      {(s.by_cashier || []).length > 1 && (
        <div className="bg-white rounded-2xl border p-4 mb-4">
          <div className="font-extrabold text-sm mb-2">Per kasir</div>
          <div className="flex flex-wrap gap-2">
            {(s.by_cashier || []).map((c) => (
              <button key={c.cashier_name} onClick={() => setCashierId(c.cashier_id || "")}
                className={`tap rounded-xl border px-3 py-2 text-left ${cashierId === c.cashier_id ? "bg-[#EEF2FF] border-[#4338CA]" : "bg-white"}`}>
                <div className="text-xs font-bold">{c.cashier_name}</div>
                <div className="text-[11px] text-[#52525B] font-num">{nf(c.count)}× · {fmtRp(c.amount)}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* tabel */}
      {loading ? <div className="h-32 grid place-items-center"><Loader2 className="animate-spin text-[#E63946]" /></div> : rows.length === 0 ? (
        <div data-testid="void-empty" className="bg-white rounded-2xl border p-12 text-center">
          <Ban className="mx-auto text-[#d4d4d8]" size={38} />
          <p className="mt-3 font-bold text-[#a1a1aa]">Tidak ada pembatalan pada periode ini.</p>
          <p className="text-sm text-[#a1a1aa] mt-1">Pembatalan baru akan muncul di sini beserta alasan dan pelakunya.</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-[#F4F5F7] text-[#52525B] text-xs uppercase tracking-wider">
              <tr><th className="text-left p-3">Waktu batal</th><th className="text-left p-3">No Order</th><th className="text-left p-3">Kasir</th>
                <th className="text-left p-3">Jenis</th><th className="text-right p-3">Nominal</th><th className="text-left p-3">Alasan</th>
                <th className="text-left p-3">Oleh</th><th className="p-3"></th></tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} data-testid={`void-row-${r.id}`} className="border-t hover:bg-[#FAFAFB]">
                  <td className="p-3 text-[#52525B] whitespace-nowrap">{dt(r.voided_at)}</td>
                  <td className="p-3 font-num font-bold">{r.order_number}
                    {r.cross_shift && <span data-testid={`void-cross-${r.id}`} className="ml-2 text-[10px] font-bold px-1.5 py-0.5 rounded bg-[#FEE2E2] text-[#B91C1C]" title={`Shift asal ${r.shift_id || "-"} → dibatalkan di ${r.voided_in_shift_id || "-"}`}>LINTAS SHIFT</span>}</td>
                  <td className="p-3">{r.cashier_name || "—"}</td>
                  <td className="p-3"><span className={`text-[11px] font-bold px-2 py-0.5 rounded ${r.kind === "refund" ? "bg-[#FEE2E2] text-[#B91C1C]" : "bg-[#F4F4F5] text-[#52525B]"}`}>{r.kind === "refund" ? "REFUND" : "VOID"}</span></td>
                  <td className="p-3 text-right font-num font-bold">{fmtRp(r.amount)}</td>
                  <td className="p-3 max-w-[16rem] truncate" title={r.reason}>{r.reason || <span className="text-[#a1a1aa] italic">—</span>}</td>
                  <td className="p-3">{r.by || "—"}</td>
                  <td className="p-3 text-right">
                    <button data-testid={`void-detail-${r.id}`} onClick={() => setDetail(r)} title="Lihat detail"
                      className="tap h-8 px-3 rounded-lg bg-[#F4F5F7] text-xs font-bold flex items-center gap-1"><Receipt size={13} /> Detail</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* dialog detail */}
      {detail && (
        <div className="fixed inset-0 z-50 bg-black/40 grid place-items-center p-4" onClick={() => setDetail(null)}>
          <div className="bg-white rounded-2xl border w-full max-w-lg max-h-[88vh] overflow-y-auto p-5" onClick={(e) => e.stopPropagation()} data-testid="void-detail-dialog">
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-xl font-extrabold">Detail Pembatalan</h2>
              <button onClick={() => setDetail(null)} className="tap h-8 w-8 rounded-lg bg-[#F4F5F7] grid place-items-center"><X size={15} /></button>
            </div>
            <div className="mt-3 space-y-1.5 text-sm">
              <Row k="Nomor order" v={detail.order_number} />
              <Row k="Jenis" v={detail.kind === "refund" ? "Refund" : "Void"} />
              <Row k="Status sebelum" v={detail.prev_status || "—"} />
              <Row k="Nominal" v={fmtRp(detail.amount)} />
              <Row k="Jumlah item" v={`${detail.items_count || 0} item`} />
              <Row k="Kasir transaksi" v={detail.cashier_name || "—"} />
              <Row k="Dibatalkan oleh" v={detail.by || "—"} />
              <Row k="Waktu transaksi" v={dt(detail.created_at)} />
              <Row k="Waktu dibatalkan" v={dt(detail.voided_at)} />
              <Row k="Metode bayar" v={detail.payment_method || "—"} />
              {detail.member_name ? <Row k="Member" v={detail.member_name} /> : null}
              <Row k="Shift transaksi" v={detail.shift_id || "tanpa shift"} />
              <Row k="Dibatalkan di shift" v={detail.voided_in_shift_id || "—"} />
            </div>
            <div className="mt-3 rounded-xl bg-[#F9FAFB] border p-3">
              <div className="text-[11px] font-bold text-[#52525B] uppercase mb-1">Alasan</div>
              <div className="text-sm" data-testid="void-detail-reason">{detail.reason || "—"}</div>
            </div>
            {detail.cross_shift && (
              <div className="mt-3 rounded-xl bg-[#FFFBEB] border border-[#FDE68A] p-3 text-xs text-[#92400E]">
                <b>Koreksi lintas shift</b> — transaksi ini terjadi di shift yang sudah ditutup.
                {detail.force_note ? <> Catatan pelepasan blokir: <b>{detail.force_note}</b></> : null}
              </div>
            )}
            {detail.audit_effects && (detail.audit_effects.restock || detail.audit_effects.coupon_reverted || detail.audit_effects.points_reverted) ? (
              <div className="mt-3 text-xs text-[#52525B]">
                Efek: {detail.audit_effects.restock ? `stok dikembalikan ${nf(detail.audit_effects.restock_qty)} (${detail.audit_effects.restock} produk) · ` : ""}
                {detail.audit_effects.coupon_reverted ? "pemakaian kupon dikembalikan · " : ""}
                {detail.audit_effects.points_reverted ? `poin member disesuaikan ${nf(detail.audit_effects.points_reverted)}` : ""}
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}

const Kpi = ({ label, value, tone, icon }) => (
  <div className="bg-white rounded-2xl border p-4">
    <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider" style={{ color: tone }}>
      {icon} {label}
    </div>
    <div className="text-2xl font-extrabold font-num mt-1">{value}</div>
  </div>
);
const Row = ({ k, v }) => (
  <div className="flex justify-between gap-3 border-b border-[#F4F5F7] py-1">
    <span className="text-[#52525B]">{k}</span><span className="font-bold text-right">{v}</span>
  </div>
);
