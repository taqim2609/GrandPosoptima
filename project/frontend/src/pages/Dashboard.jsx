import { useEffect, useState, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import api, { apiError } from "@/lib/api";
import { rupiah, ORDER_TYPE_LABEL, wibToday } from "@/lib/format";
import { copyText } from "@/lib/utils";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import {
  LayoutDashboard, TrendingUp, Utensils, ShoppingBag, Store, Coffee,
  Sparkles, Loader2, Receipt, Percent, AlertTriangle, PackageX, Coins, Wallet, MessageCircle, RefreshCw,
  Settings2, Eye, EyeOff, ChevronUp, ChevronDown, X, Save, LayoutGrid,
} from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, Cell, LineChart, Line, CartesianGrid } from "recharts";
import { bizCache, loadBusiness, labelsOf } from "@/lib/business";
import { useFeatures } from "@/lib/features";
import { useUI, orderWidgets } from "@/lib/ui";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { WidgetKustomCard, FillDataDialog } from "@/components/WidgetKustom";

/* ================================================================
   DASHBOARD WIDGET — bisa ditambah/dihapus/disusun ulang.
   - Tiap user menyimpan tata letaknya sendiri di perangkat (localStorage).
   - Admin bisa menyimpan "default per role" ke server (Pengaturan dashboard).
   - Widget bertanda roles admin/kasir butuh data ringkasan (laporan).
   ================================================================ */

const DASH_LOCAL_KEY = "gak_dash_widgets_";

export const DASH_WIDGETS = [
  { id: "kpi", label: "Ringkasan KPI (Total, Order, Rata-rata, Laba)", roles: ["admin", "kasir"] },
  { id: "jenis", label: "Penjualan per Jenis Order", roles: ["admin", "kasir"] },
  { id: "finansial", label: "Kartu Laba · Rata-rata · Kas Bersih · Bagi Hasil", roles: ["admin", "kasir"] },
  { id: "trend", label: "Grafik Tren Penjualan (minggu/bulan)", roles: ["admin", "kasir"] },
  { id: "kategori", label: "Penjualan per Kategori", roles: ["admin", "kasir"] },
  { id: "terlaris", label: "Produk Terlaris & Margin", roles: ["admin", "kasir"] },
  { id: "metode", label: "Penjualan per Metode Bayar", roles: ["admin", "kasir"] },
  { id: "ai", label: "Ringkasan AI", roles: ["admin", "kasir"] },
  { id: "lowstock", label: "Stok Retail Menipis", roles: ["admin", "kasir", "input"] },
];

export const DASH_ROLE_DEFAULT = {
  admin: ["kpi", "jenis", "finansial", "trend", "kategori", "terlaris", "metode", "ai", "lowstock"],
  kasir: ["kpi", "jenis", "finansial", "trend", "terlaris", "metode"],
  input: ["lowstock"],
};

// ---------- Widget kecil ----------
const WStat = ({ icon: Icon, label, value, accent }) => (
  <div className={`rounded-2xl border p-5 ${accent ? "bg-[#E63946] text-white border-[#E63946]" : "bg-white"}`}>
    <Icon size={20} className={accent ? "text-white/80" : "text-[#E63946]"} />
    <div className={`text-xs font-bold uppercase tracking-wider mt-3 ${accent ? "text-white/70" : "text-[#52525B]"}`}>{label}</div>
    <div className="font-num font-extrabold mt-1 text-2xl">{value}</div>
  </div>
);

function WidgetKpi({ data, view, lb }) {
  const byType = data?.by_type || { dine_in: { count: 0, total: 0 }, take_away: { count: 0, total: 0 }, retail: { count: 0, total: 0 } };
  const viewTotal = view === "fnb" ? (data?.fnb_total || 0) : (data?.retail_total || 0);
  const viewOrder = view === "fnb"
    ? ((byType.dine_in?.count || 0) + (byType.take_away?.count || 0))
    : (byType.retail?.count || 0);
  return (
    <div className="grid md:grid-cols-4 gap-4">
      <WStat icon={TrendingUp} label={`Total Penjualan ${view === "fnb" ? lb.fnb : lb.retail}`} value={rupiah(viewTotal)} accent />
      <WStat icon={Receipt} label={`Order ${view === "fnb" ? lb.fnb : lb.retail}`} value={viewOrder} />
      <WStat icon={Percent} label={`Rata-rata / Order ${view === "fnb" ? lb.fnb : lb.retail}`} value={rupiah(viewOrder ? viewTotal / viewOrder : 0)} />
      <WStat icon={Coins} label={`Laba ${view === "fnb" ? lb.fnb : lb.retail}`} value={rupiah(view === "fnb" ? (data?.gross_profit_fnb || 0) : (data?.gross_profit_retail || 0))} />
    </div>
  );
}

function WidgetJenis({ data, view }) {
  const byType = data?.by_type || { dine_in: { count: 0, total: 0 }, take_away: { count: 0, total: 0 }, retail: { count: 0, total: 0 } };
  const cards = view === "fnb"
    ? [{ key: "dine_in", icon: Utensils, cls: "ot-dine_in" }, { key: "take_away", icon: ShoppingBag, cls: "ot-take_away" }]
    : [{ key: "retail", icon: Store, cls: "ot-retail" }];
  return (
    <div className="grid md:grid-cols-3 gap-4">
      {cards.map((t) => (
        <div key={t.key} className={`rounded-2xl border-2 p-5 ${t.cls}`}>
          <div className="flex items-center justify-between">
            <t.icon size={22} />
            <span className="text-xs font-bold uppercase tracking-wider">{ORDER_TYPE_LABEL[t.key]}</span>
          </div>
          <div className="font-num text-2xl font-extrabold mt-3">{rupiah(byType[t.key]?.total || 0)}</div>
          <div className="text-xs font-bold mt-1">{byType[t.key]?.count || 0} order</div>
        </div>
      ))}
    </div>
  );
}

function WidgetFinansial({ data, view, lb }) {
  const byType = data?.by_type || { dine_in: { count: 0, total: 0 }, take_away: { count: 0, total: 0 }, retail: { count: 0, total: 0 } };
  const viewTotal = view === "fnb" ? (data?.fnb_total || 0) : (data?.retail_total || 0);
  const viewOrder = view === "fnb"
    ? ((byType.dine_in?.count || 0) + (byType.take_away?.count || 0))
    : (byType.retail?.count || 0);
  return (
    <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-4">
      <div className="rounded-2xl border-2 border-[#10B981] bg-[#ECFDF5] p-5" data-testid="stat-gross-profit">
        <Coins size={20} className="text-[#047857]" />
        <div className="text-xs font-bold uppercase tracking-wider mt-3 text-[#047857]">Laba Kotor ({lb.fnb} / {lb.retail})</div>
        <div className="font-num text-2xl font-extrabold mt-1">{rupiah(data.gross_profit || 0)}</div>
        <div className="text-[11px] text-[#047857] mt-1">{lb.fnb} {rupiah(data.gross_profit_fnb || 0)} · {lb.retail} {rupiah(data.gross_profit_retail || 0)}</div>
        <div className="text-[11px] text-[#52525B]">HPP terjual: {rupiah(data.total_cost || 0)}</div>
      </div>
      <div className="rounded-2xl border-2 border-[#E63946] bg-[#FEF2F2] p-5" data-testid="stat-avg-order">
        <TrendingUp size={20} className="text-[#E63946]" />
        <div className="text-xs font-bold uppercase tracking-wider mt-3 text-[#B91C1C]">Rata-rata / Order ({view === "fnb" ? lb.fnb : lb.retail})</div>
        <div className="font-num text-2xl font-extrabold mt-1">{rupiah(viewOrder ? viewTotal / viewOrder : 0)}</div>
        <div className="text-[11px] text-[#52525B] mt-1">{viewOrder} order · omzet {rupiah(viewTotal)}</div>
      </div>
      <div className="rounded-2xl border-2 border-[#0A0A0A] bg-[#0A0A0A] text-white p-5" data-testid="stat-cash-net">
        <Wallet size={20} className="text-white/80" />
        <div className="text-xs font-bold uppercase tracking-wider mt-3 text-white/70">Kas Bersih Harian ({view === "fnb" ? lb.fnb : lb.retail})</div>
        <div className="font-num text-2xl font-extrabold mt-1">{rupiah(view === "fnb" ? (data.cash_net_fnb || 0) : (data.cash_net_retail || 0))}</div>
        <div className="text-[11px] text-white/50 mt-1">Tunai {rupiah(view === "fnb" ? (data.cash_sales_fnb || 0) : (data.cash_sales_retail || 0))} − Keluar {rupiah(view === "fnb" ? (data.cash_out_fnb || 0) : (data.cash_out_retail || 0))}</div>
      </div>
      <div className="rounded-2xl border-2 border-[#0D9488] bg-[#F0FDFA] p-5" data-testid="stat-vendor-share">
        <Store size={20} className="text-[#0F766E]" />
        <div className="text-xs font-bold uppercase tracking-wider mt-3 text-[#0F766E]">Bagi Hasil Vendor ({view === "fnb" ? lb.fnb : lb.retail})</div>
        <div className="font-num text-2xl font-extrabold mt-1">{rupiah(view === "fnb" ? (data.vendor_summary?.fnb_vendor_share || 0) : (data.vendor_summary?.retail_vendor_share || 0))}</div>
        <div className="text-[11px] text-[#52525B] mt-1">Omzet vendor {rupiah(view === "fnb" ? (data.vendor_summary?.fnb_gross || 0) : (data.vendor_summary?.retail_gross || 0))}</div>
      </div>
    </div>
  );
}

function WidgetTrend({ view }) {
  const [period, setPeriod] = useState("week");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const days = period === "week" ? 7 : 30;
    const end = wibToday();
    const start = new Date(Date.now() + 7 * 3600 * 1000 - (days - 1) * 86400000).toISOString().slice(0, 10);
    setLoading(true);
    api.get("/reports/range", { params: { start, end } })
      .then((r) => {
        const map = {};
        (Array.isArray(r.data?.daily) ? r.data.daily : []).forEach((d) => { map[d.date] = d; });
        const out = [];
        for (let i = days - 1; i >= 0; i--) {
          const d = new Date(Date.now() + 7 * 3600 * 1000 - i * 86400000).toISOString().slice(0, 10);
          const rec = map[d] || { total: 0, count: 0, fnb: 0, retail: 0 };
          out.push({ date: d, label: d.slice(5), total: view === "retail" ? (rec.retail || 0) : (rec.fnb || rec.total || 0), count: rec.count });
        }
        setRows(out);
      })
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, [period, view]);
  const totalPeriod = rows.reduce((s, r) => s + r.total, 0);
  return (
    <div className="bg-white rounded-2xl border p-5" data-testid="trend-chart">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h3 className="font-extrabold flex items-center gap-2"><TrendingUp size={18} className="text-[#E63946]" /> Tren Penjualan</h3>
        <div className="flex items-center gap-3">
          <div className="text-xs text-[#52525B] font-bold">Total periode: <span className="font-num text-[#0A0A0A]">{rupiah(totalPeriod)}</span></div>
          <div className="flex gap-1">
            {["week", "month"].map((p) => (
              <button key={p} data-testid={`trend-${p}`} onClick={() => setPeriod(p)}
                className={`tap h-8 px-3 rounded-lg text-xs font-bold ${period === p ? "bg-[#E63946] text-white" : "bg-[#F4F5F7]"}`}>
                {p === "week" ? "7 Hari" : "30 Hari"}
              </button>
            ))}
          </div>
        </div>
      </div>
      {loading ? <div className="h-[240px] grid place-items-center"><Loader2 className="animate-spin text-[#E63946]" /></div> : (
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={rows} margin={{ left: 10, right: 24 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#F1F1F4" />
            <XAxis dataKey="label" tick={{ fontSize: 11 }} interval={period === "week" ? 0 : "preserveStartEnd"} padding={{ right: 12 }} />
            <YAxis tick={{ fontSize: 11 }} width={70} tickFormatter={(v) => "Rp" + (v >= 1000 ? v / 1000 + "k" : v)} />
            <Tooltip formatter={(v) => rupiah(v)} labelFormatter={(l) => `Tanggal ${l}`} />
            <Line type="monotone" dataKey="total" stroke="#E63946" strokeWidth={2.5} dot={{ r: 3 }} activeDot={{ r: 5 }} name="Penjualan" />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

function WidgetKategori({ data }) {
  const cr = data.category_report;
  const groups = [
    { key: "makanan", label: "Makanan", icon: Utensils, color: "#E63946" },
    { key: "minuman", label: "Minuman", icon: Coffee, color: "#0EA5E9" },
    { key: "retail", label: "Retail", icon: Store, color: "#047857" },
  ];
  return (
    <div className="bg-white rounded-2xl border p-5" data-testid="category-report">
      <div className="grid md:grid-cols-3 gap-4">
        {groups.map((g) => (
          <div key={g.key} className="rounded-xl border border-[#E4E4E7] p-3">
            <div className="flex items-center justify-between">
              <span className="font-bold text-sm flex items-center gap-2" style={{ color: g.color }}><g.icon size={16} /> {g.label}</span>
              <span className="font-num font-extrabold">{rupiah((cr[g.key] || {}).total || 0)}</span>
            </div>
            <div className="mt-3 space-y-1">
              {!((cr[g.key] || {}).categories || []).length && <div className="text-xs text-[#a1a1aa]">Belum ada penjualan.</div>}
              {((cr[g.key] || {}).categories || []).map((c) => (
                <div key={c.category_id} className="flex justify-between text-xs py-0.5">
                  <span className="text-[#52525B]">{c.name} <span className="text-[#a1a1aa]">×{c.qty}</span></span>
                  <span className="font-num font-bold">{rupiah(c.total)}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function WidgetTerlaris({ data, view, lb }) {
  const viewProducts = view === "fnb" ? (data.top_fnb || data.top_products) : (data.top_retail || data.top_products);
  const chartData = viewProducts.map((p) => ({ name: p.name.length > 12 ? p.name.slice(0, 12) + "…" : p.name, total: p.total }));
  return (
    <div className="bg-white rounded-2xl border p-5">
      <h3 className="font-extrabold mb-4">Produk Terlaris & Margin</h3>
      {viewProducts.length === 0 ? <p className="text-sm text-[#a1a1aa]">Belum ada penjualan {view === "fnb" ? lb.fnb : lb.retail} hari ini.</p> : (
        <>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={chartData} layout="vertical" margin={{ left: 10 }}>
              <XAxis type="number" hide />
              <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 12 }} />
              <Tooltip formatter={(v) => rupiah(v)} />
              <Bar dataKey="total" radius={[0, 6, 6, 0]}>
                {chartData.map((entry) => <Cell key={entry.name} fill="#E63946" />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <div className="mt-3 border rounded-xl overflow-hidden" data-testid="margin-table">
            <table className="w-full text-sm">
              <thead className="bg-[#F4F5F7] text-[#52525B] text-xs uppercase tracking-wider">
                <tr><th className="text-left p-2.5">Produk</th><th className="text-right p-2.5">Qty</th><th className="text-right p-2.5">Omzet</th><th className="text-right p-2.5">Laba</th><th className="text-right p-2.5">Margin</th></tr>
              </thead>
              <tbody>
                {viewProducts.map((p) => (
                  <tr key={p.name} className="border-t">
                    <td className="p-2.5 font-bold truncate max-w-[160px]">{p.name}</td>
                    <td className="p-2.5 text-right font-num">{p.qty}</td>
                    <td className="p-2.5 text-right font-num">{rupiah(p.total)}</td>
                    <td className="p-2.5 text-right font-num font-bold text-[#047857]">{rupiah(p.profit || 0)}</td>
                    <td className="p-2.5 text-right">
                      <span className={`font-num font-bold px-2 py-0.5 rounded ${(p.margin || 0) >= 40 ? "bg-[#D1FAE5] text-[#047857]" : (p.margin || 0) >= 15 ? "bg-[#FEF3C7] text-[#B45309]" : "bg-[#FEE2E2] text-[#EF4444]"}`}>
                        {(p.margin || 0).toFixed(1)}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function WidgetMetode({ data }) {
  return (
    <div className="bg-white rounded-2xl border p-5">
      <h3 className="font-extrabold mb-3">Penjualan per Metode Bayar</h3>
      <div className="flex gap-4 flex-wrap">
        {Object.entries(data.by_payment).length === 0 ? <span className="text-sm text-[#a1a1aa]">Belum ada data</span> :
          Object.entries(data.by_payment).map(([k, v]) => (
            <div key={k} className="px-4 py-3 rounded-xl bg-[#F4F5F7]">
              <div className="text-xs text-[#52525B] font-bold uppercase">{k}</div>
              <div className="font-num font-extrabold text-lg">{rupiah(v)}</div>
            </div>
          ))}
      </div>
    </div>
  );
}

function WidgetAi({ onGen, ai, aiLoading }) {
  return (
    <div className="bg-[#0A0A0A] text-white rounded-2xl p-5 flex flex-col">
      <h3 className="font-extrabold flex items-center gap-2 mb-2"><Sparkles size={18} className="text-[#E63946]" /> Ringkasan AI</h3>
      <p className="text-xs text-white/50 mb-4">Laporan penjualan harian dibuat oleh AI</p>
      <div className="flex-1 text-sm whitespace-pre-wrap overflow-y-auto no-scrollbar min-h-[120px]">
        {ai ? ai.replace(/\*\*(.*?)\*\*/g, "$1").replace(/^#{1,6}\s*/gm, "").replace(/^\s*---\s*$/gm, "") : <span className="text-white/40">Klik tombol untuk membuat laporan analitik.</span>}
      </div>
      <div className="flex gap-2 mt-4">
        <button onClick={onGen} disabled={aiLoading} className="tap flex-1 h-11 rounded-xl bg-[#E63946] hover:bg-[#BE123C] font-bold flex items-center justify-center gap-2">
          {aiLoading ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />} {ai ? "Buat Ulang" : "Buat Laporan"}
        </button>
        {ai && (
          <button onClick={async () => { const ok = await copyText(ai); if (ok) toast.success("Laporan disalin"); else toast.error("Tidak bisa menyalin otomatis — salin manual"); }}
            className="tap h-11 px-4 rounded-xl bg-white/10 hover:bg-white/20 font-bold">Salin</button>
        )}
      </div>
    </div>
  );
}

function WidgetLowstock({ lowStock, lowStockThr, isInput, products }) {
  // Untuk role input: daftar produk dari /products (tanpa laporan).
  let rows = lowStock || [];
  if (isInput) {
    const thr = lowStockThr || 10;
    rows = (products || []).filter((p) => p.track_stock && (p.stock || 0) <= (p.min_stock != null ? p.min_stock : thr));
  }
  return (
    <div className="bg-white rounded-2xl border p-5" data-testid="low-stock-panel">
      <h3 className="font-extrabold mb-3 flex items-center gap-2">
        <AlertTriangle size={18} className="text-[#B45309]" /> Stok Retail Menipis
        <span className="text-xs font-bold text-[#52525B]">(ambang per-produk)</span>
      </h3>
      {rows.length === 0 ? (
        <p className="text-sm text-[#047857] font-bold">Semua stok retail aman.</p>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {rows.map((p) => (
            <div key={p.sku || p.id} className={`flex items-center justify-between rounded-xl border px-3 py-2 ${p.stock <= 0 ? "bg-[#FEE2E2] border-[#EF4444]" : "bg-[#FEF9C3] border-[#F59E0B]"}`}>
              <div className="overflow-hidden">
                <div className="font-bold text-sm truncate">{p.name}</div>
                <div className="font-num text-xs text-[#52525B]">{p.sku || "-"} · ambang {p.min_stock != null ? p.min_stock : lowStockThr}</div>
              </div>
              <div className={`font-num font-extrabold flex items-center gap-1 ${p.stock <= 0 ? "text-[#EF4444]" : "text-[#B45309]"}`}>
                {p.stock <= 0 && <PackageX size={15} />}{p.stock}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------- Halaman Dashboard ----------
export default function Dashboard() {
  const { user } = useAuth();
  const role = user?.role || "kasir";
  const hasSummary = role === "admin" || role === "kasir";
  const { feat } = useFeatures();
  const ui = useUI();
  // Gating feature flag (Pengaturan → Fitur & Integrasi).
  const aiWidgetOk = feat("ai.enabled") && feat("ai.summary");
  const bannerOk = feat("update.banner");
  const [date, setDate] = useState(wibToday());
  const [data, setData] = useState(null);
  const [ai, setAi] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [waLoading, setWaLoading] = useState(false);
  const [upd, setUpd] = useState(null);
  const [updState, setUpdState] = useState("idle");
  const [view, setView] = useState("fnb");
  const [biz, setBiz] = useState(bizCache());
  const lb = labelsOf(biz);
  const [prods, setProds] = useState([]); // utk role input (lowstock)
  const [layoutOpen, setLayoutOpen] = useState(false);
  const [draft, setDraft] = useState(null);
  const nav = useNavigate();
  // ---- widget kustom (dari Pengaturan → Widget Kustom) ----
  const [cwDefs, setCwDefs] = useState([]);
  const [cwEntries, setCwEntries] = useState({}); // widget_id -> {date, daily}
  const [cwFill, setCwFill] = useState(null); // {def}
  const cwDailyOf = (wid) => (cwEntries[wid]?.daily) || {};
  const cwById = useMemo(() => {
    const m = {};
    (Array.isArray(cwDefs) ? cwDefs : []).forEach((d) => { if (d && d.id) m[d.id] = d; });
    return m;
  }, [cwDefs]);
  // widget kustom yang AKTIF (enabled) & boleh tampil (butuh data laporan)
  const cwOn = useMemo(() => (hasSummary && Array.isArray(cwDefs) ? cwDefs.filter((d) => d && d.enabled) : []), [cwDefs, hasSummary]);
  const isCwId = (id) => typeof id === "string" && id.startsWith("custom:");
  const cwIdOf = (id) => (isCwId(id) ? id.slice("custom:".length) : null);

  // widget terpasang: localStorage per user/role > default server per role
  const roleDefault = DASH_ROLE_DEFAULT[role] || [];
  const [serverDefaults, setServerDefaults] = useState(null);
  const [widgets, setWidgets] = useState(() => {
    try {
      const raw = JSON.parse(localStorage.getItem(DASH_LOCAL_KEY + role) || "null");
      if (Array.isArray(raw) && raw.length) return raw;
    } catch (e) {}
    return null; // null -> pakai default (server/fallback)
  });

  useEffect(() => { loadBusiness().then(setBiz); }, []);
  useEffect(() => {
    api.get("/settings/dashboard").then((r) => {
      const rd = r.data || {};
      setServerDefaults(rd);
      try { localStorage.setItem(DASH_LOCAL_KEY + role + "_srv", JSON.stringify(rd[role] || [])); } catch (e) {}
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role]);

  const serverDef = ((serverDefaults && serverDefaults[role]) || []);
  const effective = widgets || (serverDef.length ? serverDef : roleDefault);
  const lowStockThr = Number(biz?.low_stock_threshold ?? 10);

  // id valid: widget bawaan sesuai role ATAU widget kustom yang masih ada & aktif.
  const idOk = (id) => {
    if (isCwId(id)) { const d = cwById[cwIdOf(id)]; return !!d && !!d.enabled; }
    return DASH_WIDGETS.some((w) => w.id === id && w.roles.includes(role)) && !(id === "ai" && !aiWidgetOk);
  };
  // urutan tampil: susunan user > bawaan. Widget kustom baru otomatis tampil di akhir
  // HANYA bila user belum pernah menyusun sendiri (widgets === null) — setelah itu,
  // daftar persis seperti yang disimpan user (bisa disembunyikan/disusun lewat Atur Widget).
  const hasPersonalLayout = Array.isArray(widgets);
  // urutan dari Pengaturan → Menu & Tampilan UI (dashboard.order[role]) menimpa urutan default
  const layoutIds = orderWidgets([
    ...effective.filter(idOk),
    ...(!hasPersonalLayout ? cwOn.filter((d) => !effective.includes("custom:" + d.id)).map((d) => "custom:" + d.id) : []),
  ], role, ui);

  const loadSummary = useCallback(() => {
    if (!hasSummary) return Promise.resolve();
    return api.get("/reports/summary", { params: { date } }).then((r) => setData(r.data)).catch((e) => toast.error(apiError(e.response?.data?.detail)));
  }, [date, hasSummary]);
  useEffect(() => {
    if (hasSummary) { loadSummary(); setAi(""); }
    else { api.get("/products", { params: { active_only: true } }).then((r) => setProds(r.data || [])).catch(() => {}); }
  }, [loadSummary, hasSummary]);

  // Muat definisi widget kustom (sekali) + isian harian per tanggal yang dipilih.
  useEffect(() => {
    if (!hasSummary) { setCwDefs([]); return; }
    let dead = false;
    api.get("/custom-widgets").then((r) => { if (!dead) setCwDefs(Array.isArray(r.data) ? r.data : []); }).catch(() => {});
    return () => { dead = true; };
  }, [hasSummary]);
  useEffect(() => {
    if (!hasSummary) return;
    api.get("/custom-widgets/entries", { params: { date } })
      .then((r) => setCwEntries(r.data || {}))
      .catch(() => {});
  }, [date, hasSummary]);

  // Banner update — admin saja
  useEffect(() => {
    if (role !== "admin" || !bannerOk) return;
    let stop = false;
    api.get("/update/check", { timeout: 12000 }).then((r) => { if (!stop) setUpd(r.data); }).catch(() => {});
    return () => { stop = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role]);

  const startUpdate = async () => {
    if (!window.confirm("Unduh versi terbaru dari Google AI Studio & bangun ulang sekarang? Aplikasi akan restart beberapa menit.")) return;
    setUpdState("starting");
    const t = toast.loading("Memulai update...");
    try {
      await api.post("/admin/update");
      toast.success("Update dimulai — memuat ulang otomatis saat selesai.", { id: t, duration: 8000 });
      setUpdState("building");
      const started = Date.now();
      let sawRunning = false;
      const iv = setInterval(async () => {
        if (Date.now() - started > 12 * 60 * 1000) { clearInterval(iv); window.location.reload(); return; }
        try {
          const r = await api.get("/admin/update/status");
          if (r.data?.running) { sawRunning = true; setUpdState("building"); }
          else if (sawRunning) { clearInterval(iv); setUpdState("done"); setTimeout(() => window.location.reload(), 1500); }
        } catch (_) {}
      }, 5000);
    } catch (e) { toast.error(apiError(e.response?.data?.detail), { id: t, duration: 10000 }); setUpdState("idle"); }
  };

  const genAi = async () => {
    setAiLoading(true);
    try { const { data: d } = await api.post("/reports/ai-summary", { date }); setAi(d.summary); }
    catch (e) { toast.error(apiError(e.response?.data?.detail)); } finally { setAiLoading(false); }
  };
  const download = async (fmt) => {
    try {
      const res = await api.get(`/reports/export/${fmt}`, { params: { date }, responseType: "blob" });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement("a");
      a.href = url; a.download = `laporan-${date}.${fmt === "excel" ? "xlsx" : "pdf"}`;
      a.click(); URL.revokeObjectURL(url);
    } catch (e) { toast.error("Gagal mengunduh laporan"); }
  };
  const sendWa = async () => {
    setWaLoading(true);
    try {
      const { data: d } = await api.post("/reports/send-whatsapp", { date });
      toast.success(`Laporan terkirim ke WhatsApp (${d.sent.filter((x) => x.ok).length} nomor)`);
    } catch (e) { toast.error(apiError(e.response?.data?.detail)); } finally { setWaLoading(false); }
  };

  const openLayout = () => {
    const current = layoutIds;
    setDraft(current.length ? current : DASH_ROLE_DEFAULT[role] || []);
    setLayoutOpen(true);
  };
  const saveLocal = (list) => {
    setWidgets(list);
    try { localStorage.setItem(DASH_LOCAL_KEY + role, JSON.stringify(list)); } catch (e) {}
    setLayoutOpen(false);
    toast.success("Tata letak dashboard disimpan di perangkat ini");
  };
  const saveRoleDefault = async (list) => {
    try {
      await api.put("/settings/dashboard", { role, widgets: list });
      try { localStorage.setItem(DASH_LOCAL_KEY + role, JSON.stringify(list)); } catch (e) {}
      setWidgets(list);
      setServerDefaults((sd) => ({ ...(sd || {}), [role]: list }));
      toast.success(`Tersimpan sebagai default untuk role ${role}`);
      setLayoutOpen(false);
    } catch (e) { toast.error(apiError(e.response?.data?.detail)); }
  };

  const renderWidget = (id) => {
        switch (id) {
      case "kpi": return data && <WidgetKpi data={data} view={view} lb={lb} />;
      case "jenis": return data && <WidgetJenis data={data} view={view} />;
      case "finansial": return data && <WidgetFinansial data={data} view={view} lb={lb} />;
      case "trend": return hasSummary ? <WidgetTrend view={view} /> : null;
      case "kategori": return data && <WidgetKategori data={data} />;
      case "terlaris": return data && <WidgetTerlaris data={data} view={view} lb={lb} />;
      case "metode": return data && <WidgetMetode data={data} />;
      case "ai": return hasSummary && aiWidgetOk && <WidgetAi onGen={genAi} ai={ai} aiLoading={aiLoading} />;
      case "lowstock": return <WidgetLowstock lowStock={data?.low_stock || []} lowStockThr={lowStockThr} isInput={!hasSummary} products={prods} />;
      default: return null;
    }
  };

  const renderById = (id, i) => {
    const cwid = cwIdOf(id);
    if (cwid) {
      const d = cwById[cwid];
      if (!d || !d.enabled) return null;
      return (
        <WidgetKustomCard key={id} def={d} daily={cwDailyOf(cwid)} summary={data} date={date}
          fillable onFill={(def) => setCwFill({ def })} />
      );
    }
    return (
      <div key={`${id}-${i}`} data-testid={`dash-widget-${id}`} className={id === "kpi" || id === "jenis" || id === "finansial" ? "" : "widget-block"}>
        {renderWidget(id)}
      </div>
    );
  };

  const available = DASH_WIDGETS.filter((w) => w.roles.includes(role) && !(w.id === "ai" && !aiWidgetOk));
  // daftar baris dialog Atur Widget: bawaan + widget kustom (urutan defaultnya di bawah)
  const dialogItems = [
    ...available.map((w) => ({ id: w.id, label: w.label })),
    ...cwOn.map((d) => ({ id: "custom:" + d.id, label: d.name, color: d.color })),
  ];
  const waiting = hasSummary && !data;

  return (
    <div className="h-full overflow-y-auto p-8" data-testid="dashboard-page">
      {upd?.updateAvailable && role === "admin" && bannerOk && (
        <div className="mb-5 rounded-2xl border-2 border-[#E63946] bg-[#FEF2F2] px-5 py-4 flex flex-wrap items-center gap-3" data-testid="update-banner">
          <AlertTriangle size={20} className="text-[#E63946]" />
          <div className="flex-1 min-w-[200px]">
            <div className="font-extrabold text-[#0A0A0A] text-sm">Versi baru tersedia: {upd.latest}</div>
            <div className="text-xs text-[#52525B]">Server Anda masih di versi {upd.current}. Update membawa fitur & perbaikan terbaru.</div>
          </div>
          <button onClick={startUpdate} disabled={updState !== "idle"} className="tap h-10 px-5 rounded-xl bg-[#E63946] text-white font-bold text-sm inline-flex items-center gap-2 disabled:opacity-60">
            <RefreshCw size={15} className={updState !== "idle" ? "animate-spin" : ""} />
            {updState === "idle" ? "Update Sekarang" : updState === "building" ? "Membangun ulang..." : "Selesai..."}
          </button>
        </div>
      )}

      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <h1 className="text-3xl font-extrabold flex items-center gap-2"><LayoutDashboard /> Dashboard</h1>
        <div className="flex items-center gap-2 flex-wrap">
          {hasSummary && (
            <>
              <input data-testid="report-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-11 rounded-xl border px-3 font-num bg-white" />
              <button onClick={() => download("excel")} className="tap h-11 px-4 rounded-xl bg-white border font-bold text-sm">Excel</button>
              <button onClick={() => download("pdf")} className="tap h-11 px-4 rounded-xl bg-white border font-bold text-sm">PDF</button>
              <button onClick={sendWa} disabled={waLoading} className="tap h-11 px-4 rounded-xl bg-[#25D366] hover:bg-[#1EBE5B] text-white font-bold text-sm flex items-center gap-2 disabled:opacity-60">
                {waLoading ? <Loader2 size={15} className="animate-spin" /> : <MessageCircle size={15} />} WhatsApp
              </button>
            </>
          )}
          <button data-testid="dash-layout-btn" onClick={openLayout} className="tap h-11 px-4 rounded-xl bg-[#0A0A0A] text-white font-bold text-sm flex items-center gap-2">
            <Settings2 size={16} /> Atur Widget
          </button>
          {role === "admin" && (
            <button data-testid="dash-custom-manage" onClick={() => nav("/settings?tab=widget")} className="tap h-11 px-4 rounded-xl bg-white border font-bold text-sm flex items-center gap-2">
              <LayoutGrid size={16} /> Kelola Widget Kustom
            </button>
          )}
        </div>
      </div>

      {hasSummary && (
        <div className="flex gap-2 mb-5">
          <button data-testid="view-fnb" onClick={() => setView("fnb")} className={`tap h-10 px-5 rounded-xl font-bold text-sm ${view === "fnb" ? "bg-[#E63946] text-white" : "bg-white border"}`}>🍽️ {lb.fnb}</button>
          <button data-testid="view-retail" onClick={() => setView("retail")} className={`tap h-10 px-5 rounded-xl font-bold text-sm ${view === "retail" ? "bg-[#E63946] text-white" : "bg-white border"}`}>🛒 {lb.retail}</button>
          <div className="ml-auto flex items-center text-xs text-[#52525B] font-bold">
            {data && <>Total {view === "fnb" ? lb.fnb : lb.retail}: <span className="font-num text-lg text-[#E63946] ml-1">{rupiah(view === "fnb" ? (data.fnb_total || 0) : (data.retail_total || 0))}</span></>}
          </div>
        </div>
      )}

      {waiting ? (
        <div className="h-40 grid place-items-center"><Loader2 className="animate-spin text-[#E63946]" /></div>
      ) : layoutIds.length === 0 ? (
        <div className="bg-white rounded-2xl border p-10 text-center text-[#a1a1aa]">
          Belum ada widget tampil. Klik <b>Atur Widget</b> untuk menambahkan
          {role === "admin" ? <> — atau buat kartu sendiri lewat <b>Kelola Widget Kustom</b>.</> : "."}
        </div>
      ) : (
        <div className="space-y-4" data-testid="dash-widgets">
          {layoutIds.map((id, i) => renderById(id, i))}
        </div>
      )}

      {/* Dialog atur widget */}
      <Dialog open={layoutOpen} onOpenChange={setLayoutOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Atur Widget Dashboard</DialogTitle></DialogHeader>
          <p className="text-xs text-[#52525B] -mt-1 mb-3">
            Centang untuk tampil; susun urutan dengan panah. Perubahan tersimpan di perangkat ini.
            {role === "admin" && " Anda juga bisa menjadikannya default untuk role ini."}
          </p>
          <div className="space-y-1.5">
            {dialogItems.map((w) => {
              const on = draft?.includes(w.id) || false;
              const idx = draft?.indexOf(w.id) ?? -1;
              return (
                <div key={w.id} className={`flex items-center gap-2 rounded-xl border px-3 py-2 ${on ? "bg-white border-[#E4E4E7]" : "bg-[#F4F5F7] opacity-70"}`}>
                  <button data-testid={`w-toggle-${w.id}`} onClick={() => {
                    setDraft((d) => (on ? d.filter((x) => x !== w.id) : [...(d || []), w.id]));
                  }} className="tap h-8 w-8 rounded-lg grid place-items-center bg-[#F4F5F7]">
                    {on ? <Eye size={15} className="text-[#047857]" /> : <EyeOff size={15} className="text-[#a1a1aa]" />}
                  </button>
                  <div className="flex-1 min-w-0 flex items-center gap-2">
                    {w.color && <span className="h-2.5 w-2.5 rounded-full shrink-0 inline-block" style={{ backgroundColor: w.color }} />}
                    <span className="text-sm font-bold truncate">{w.label}</span>
                    {w.color && <span className="text-[10px] font-bold uppercase text-[#a1a1aa] shrink-0">widget kustom</span>}
                  </div>
                  {on && (
                    <div className="flex items-center gap-0.5">
                      <button data-testid={`w-up-${w.id}`} disabled={idx <= 0} onClick={() => {
                        setDraft((d) => { const a = [...d]; const j = a.indexOf(w.id); if (j > 0) { [a[j - 1], a[j]] = [a[j], a[j - 1]]; } return a; });
                      }} className="tap h-7 w-7 rounded-lg bg-[#F4F5F7] grid place-items-center disabled:opacity-30"><ChevronUp size={14} /></button>
                      <button data-testid={`w-down-${w.id}`} disabled={idx === (draft?.length || 0) - 1} onClick={() => {
                        setDraft((d) => { const a = [...d]; const j = a.indexOf(w.id); if (j < a.length - 1) { [a[j + 1], a[j]] = [a[j], a[j + 1]]; } return a; });
                      }} className="tap h-7 w-7 rounded-lg bg-[#F4F5F7] grid place-items-center disabled:opacity-30"><ChevronDown size={14} /></button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {role === "admin" && (
            <button onClick={() => { setLayoutOpen(false); nav("/settings?tab=widget"); }}
              className="tap w-full h-10 rounded-xl border-2 border-dashed border-[#E4E4E7] text-xs font-bold text-[#52525B] flex items-center justify-center gap-1.5 hover:border-[#E63946] hover:text-[#E63946]">
              <LayoutGrid size={14} /> Buat / kelola widget kustom (rumus & data sendiri)
            </button>
          )}
          <DialogFooter className="flex-col gap-2 sm:flex-col">
            <button data-testid="w-apply" onClick={() => saveLocal(draft || [])} className="tap w-full h-11 rounded-xl bg-[#0A0A0A] text-white font-bold flex items-center justify-center gap-2">
              <Save size={16} /> Terapkan di Perangkat Ini
            </button>
            {role === "admin" && (
              <button data-testid="w-save-role" onClick={() => saveRoleDefault(draft || [])}
                className="tap w-full h-11 rounded-xl bg-[#E63946] text-white font-bold text-sm">
                Jadikan Default untuk Role “{role}”
              </button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog isi data harian widget kustom */}
      {cwFill && (
        <FillDataDialog
          open={!!cwFill}
          onOpenChange={(v) => { if (!v) setCwFill(null); }}
          def={cwFill.def}
          date={date}
          daily={cwDailyOf(cwFill.def.id)}
          onSaved={(dly) => setCwEntries((prev) => ({ ...prev, [cwFill.def.id]: { date, daily: dly } }))}
        />
      )}
    </div>
  );
}
