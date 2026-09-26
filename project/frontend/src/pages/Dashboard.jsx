import { useEffect, useState, useCallback, useMemo, memo, lazy, Suspense } from "react";
import { useNavigate } from "react-router-dom";
import api, { apiError } from "@/lib/api";
import { rupiah, ORDER_TYPE_LABEL, wibToday } from "@/lib/format";
import { copyText } from "@/lib/utils";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import { isSuperAdmin, roleBaseOf, isAdmin } from "@/lib/rbac";
import {
  LayoutDashboard, TrendingUp, Utensils, ShoppingBag, Store, Coffee,
  Sparkles, Loader2, Receipt, Percent, AlertTriangle, PackageX, Coins, Wallet, MessageCircle, RefreshCw,
  Settings2, Eye, EyeOff, ChevronUp, ChevronDown, Save, LayoutGrid, AlertCircle,
} from "lucide-react";
import { bizCache, loadBusiness, labelsOf } from "@/lib/business";
import { useFeatures } from "@/lib/features";
import { useUI, orderWidgets } from "@/lib/ui";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

// Lazy-loaded heavy components for optimal Time to Interactive (TTI)
const VisualSyncStatusCard = lazy(() => import("@/components/VisualSyncStatus"));
const LazyWidgetTrend = lazy(() =>
  import("@/components/dashboard/DashboardCharts").then((m) => ({ default: m.WidgetTrend }))
);
const LazyWidgetTerlaris = lazy(() =>
  import("@/components/dashboard/DashboardCharts").then((m) => ({ default: m.WidgetTerlaris }))
);
const LazyWidgetKustomCard = lazy(() =>
  import("@/components/WidgetKustom").then((m) => ({ default: m.WidgetKustomCard }))
);
const LazyFillDataDialog = lazy(() =>
  import("@/components/WidgetKustom").then((m) => ({ default: m.FillDataDialog }))
);

// Lightweight skeleton fallbacks during lazy load
const SyncStatusSkeleton = () => (
  <div className="rounded-2xl border border-neutral-200/80 bg-white p-5 animate-pulse shadow-xs">
    <div className="flex items-center justify-between gap-3 mb-4">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-neutral-100" />
        <div className="space-y-1.5">
          <div className="h-4 w-44 bg-neutral-200 rounded" />
          <div className="h-3 w-64 bg-neutral-100 rounded" />
        </div>
      </div>
      <div className="h-9 w-32 bg-neutral-100 rounded-xl" />
    </div>
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="h-16 bg-neutral-50 rounded-xl border border-neutral-100" />
      ))}
    </div>
  </div>
);

const ChartSkeleton = ({ height = 240, title = "Memuat Grafik..." }) => (
  <div className="bg-white rounded-2xl border border-neutral-200/80 p-5 animate-pulse shadow-xs">
    <div className="flex items-center justify-between mb-4">
      <div className="h-4 w-36 bg-neutral-200 rounded" />
      <div className="h-7 w-28 bg-neutral-100 rounded-lg" />
    </div>
    <div style={{ height: `${height}px` }} className="w-full bg-neutral-50/70 rounded-xl flex flex-col items-center justify-center gap-2 border border-neutral-100/80">
      <Loader2 size={20} className="animate-spin text-neutral-400" />
      <span className="text-xs text-neutral-400 font-medium">{title}</span>
    </div>
  </div>
);

const CustomWidgetSkeleton = () => (
  <div className="bg-white rounded-2xl border border-neutral-200/80 p-5 animate-pulse shadow-xs">
    <div className="h-4 w-40 bg-neutral-200 rounded mb-3" />
    <div className="h-16 bg-neutral-50 rounded-xl border border-neutral-100" />
  </div>
);

/* ================================================================
   DASHBOARD WIDGET — bisa ditambah/dihapus/disusun ulang.
   - Tiap user menyimpan tata letaknya sendiri di perangkat (localStorage).
   - Admin bisa menyimpan "default per role" ke server (Pengaturan dashboard).
   - Widget bertanda roles admin/kasir butuh data ringkasan (laporan).
   ================================================================ */

const DASH_LOCAL_KEY = "gak_dash_widgets_";

export const DASH_WIDGETS = [
  { id: "firestore", label: "Status Koneksi & Persistensi Cloud Firestore", roles: ["superadmin", "admin", "kasir", "input"] },
  { id: "kpi", label: "Ringkasan KPI (Total, Order, Rata-rata, Laba)", roles: ["superadmin", "admin", "kasir"] },
  { id: "jenis", label: "Penjualan per Jenis Order", roles: ["superadmin", "admin", "kasir"] },
  { id: "finansial", label: "Kartu Laba · Rata-rata · Kas Bersih · Bagi Hasil", roles: ["superadmin", "admin", "kasir"] },
  { id: "trend", label: "Grafik Tren Penjualan (minggu/bulan)", roles: ["superadmin", "admin", "kasir"] },
  { id: "kategori", label: "Penjualan per Kategori", roles: ["superadmin", "admin", "kasir"] },
  { id: "terlaris", label: "Produk Terlaris & Margin", roles: ["superadmin", "admin", "kasir"] },
  { id: "metode", label: "Penjualan per Metode Bayar", roles: ["superadmin", "admin", "kasir"] },
  { id: "ai", label: "Ringkasan AI", roles: ["superadmin", "admin", "kasir"] },
  { id: "lowstock", label: "Stok Retail Menipis", roles: ["superadmin", "admin", "kasir", "input"] },
];

export const DASH_ROLE_DEFAULT = {
  superadmin: ["firestore", "kpi", "jenis", "finansial", "trend", "kategori", "terlaris", "metode", "ai", "lowstock"],
  admin: ["firestore", "kpi", "jenis", "finansial", "trend", "kategori", "terlaris", "metode", "ai", "lowstock"],
  kasir: ["firestore", "kpi", "jenis", "finansial", "trend", "terlaris", "metode"],
  input: ["firestore", "lowstock"],
};

const WStat = memo(({ icon: Icon, label, value, accent }) => (
  <div className={`rounded-2xl border p-5 ${accent ? "bg-[#E63946] text-white border-[#E63946]" : "bg-white"}`}>
    <Icon size={20} className={accent ? "text-white/80" : "text-[#E63946]"} />
    <div className={`text-xs font-bold uppercase tracking-wider mt-3 ${accent ? "text-white/70" : "text-[#52525B]"}`}>{label}</div>
    <div className="font-num font-extrabold mt-1 text-2xl">{value}</div>
  </div>
));

const WidgetKpi = memo(function WidgetKpi({ data, view, lb }) {
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
});

const WidgetJenis = memo(function WidgetJenis({ data, view }) {
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
});

const WidgetFinansial = memo(function WidgetFinansial({ data, view, lb }) {
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
});

const WidgetKategori = memo(function WidgetKategori({ data }) {
  const cr = data?.category_report || {};
  const groups = [
    { key: "makanan", label: "Makanan", icon: Utensils, color: "#E63946" },
    { key: "minuman", label: "Minuman", icon: Coffee, color: "#0EA5E9" },
    { key: "retail", label: "Retail", icon: Store, color: "#047857" },
  ];
  return (
    <div className="bg-white rounded-2xl border p-5" data-testid="category-report">
      <div className="grid md:grid-cols-3 gap-4">
        {groups.map((g) => {
          const groupData = cr[g.key] || {};
          const catList = Array.isArray(groupData.categories) ? groupData.categories : [];
          return (
            <div key={g.key} className="rounded-xl border border-[#E4E4E7] p-3">
              <div className="flex items-center justify-between">
                <span className="font-bold text-sm flex items-center gap-2" style={{ color: g.color }}>
                  <g.icon size={16} /> {g.label}
                </span>
                <span className="font-num font-extrabold">{rupiah(groupData.total || 0)}</span>
              </div>
              <div className="mt-3 space-y-1">
                {catList.length === 0 && <div className="text-xs text-[#a1a1aa]">Belum ada penjualan.</div>}
                {catList.map((c) => (
                  <div key={c.category_id || c.name} className="flex justify-between text-xs py-0.5">
                    <span className="text-[#52525B]">
                      {c.name} <span className="text-[#a1a1aa]">×{c.qty}</span>
                    </span>
                    <span className="font-num font-bold">{rupiah(c.total)}</span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
});

const WidgetMetode = memo(function WidgetMetode({ data }) {
  const byPayment = data?.by_payment || {};
  return (
    <div className="bg-white rounded-2xl border p-5">
      <h3 className="font-extrabold mb-3">Penjualan per Metode Bayar</h3>
      <div className="flex gap-4 flex-wrap">
        {Object.entries(byPayment).length === 0 ? <span className="text-sm text-[#a1a1aa]">Belum ada data</span> :
          Object.entries(byPayment).map(([k, v]) => (
            <div key={k} className="px-4 py-3 rounded-xl bg-[#F4F5F7]">
              <div className="text-xs text-[#52525B] font-bold uppercase">{k}</div>
              <div className="font-num font-extrabold text-lg">{rupiah(v)}</div>
            </div>
          ))}
      </div>
    </div>
  );
});

const WidgetAi = memo(function WidgetAi({ onGen, ai, aiLoading, aiError, date }) {
  return (
    <div id="widget-ai-summary" className="bg-[#0A0A0A] text-white rounded-2xl p-5 flex flex-col justify-between shadow-sm">
      <div>
        <div className="flex items-center justify-between gap-2 mb-1">
          <h3 className="font-extrabold flex items-center gap-2">
            <Sparkles size={18} className="text-[#E63946]" /> Ringkasan AI
          </h3>
          {date && (
            <span className="text-[11px] font-mono px-2 py-0.5 rounded-md bg-white/10 text-white/70">
              {date}
            </span>
          )}
        </div>
        <p className="text-xs text-white/50 mb-3">Laporan analisis performa penjualan & rekomendasi taktis</p>

        {aiError && !aiLoading && (
          <div className="mb-3 p-3 rounded-xl bg-red-500/15 border border-red-500/30 text-red-200 text-xs flex items-start gap-2.5 animate-fadeIn">
            <AlertCircle size={16} className="text-red-400 shrink-0 mt-0.5" />
            <div className="flex-1">
              <div className="font-bold text-red-100 mb-0.5">Pemrosesan AI Mengalami Kendala</div>
              <div className="leading-relaxed text-red-200/90">{aiError}</div>
            </div>
          </div>
        )}

        <div className="text-sm whitespace-pre-wrap overflow-y-auto no-scrollbar max-h-[320px] min-h-[130px] rounded-xl bg-white/[0.04] p-3.5 border border-white/5 font-sans leading-relaxed text-white/90 selection:bg-[#E63946] selection:text-white">
          {aiLoading ? (
            <div className="flex flex-col items-center justify-center py-8 text-white/60 gap-3">
              <Loader2 size={24} className="animate-spin text-[#E63946]" />
              <div className="text-xs font-medium text-center text-white/70">
                Menganalisis transaksi, perputaran menu & menyusun strategi...
              </div>
            </div>
          ) : ai ? (
            ai.replace(/\*\*(.*?)\*\*/g, "$1").replace(/^#{1,6}\s*/gm, "").replace(/^\s*---\s*$/gm, "")
          ) : (
            <span className="text-white/40 italic flex items-center gap-2 pt-2">
              Klik tombol di bawah untuk membuat laporan analitik penjualan hari ini.
            </span>
          )}
        </div>
      </div>

      <div className="flex gap-2 mt-4 pt-1">
        <button
          id="btn-ai-generate-report"
          data-testid="ai-generate-btn"
          onClick={onGen}
          disabled={aiLoading}
          aria-busy={aiLoading}
          className="tap flex-1 h-11 rounded-xl bg-[#E63946] hover:bg-[#BE123C] active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed font-bold flex items-center justify-center gap-2 transition-all shadow-sm"
        >
          {aiLoading ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              <span>Menganalisis...</span>
            </>
          ) : (
            <>
              <Sparkles size={16} />
              <span>{ai ? "Buat Ulang" : aiError ? "Coba Lagi" : "Buat Laporan"}</span>
            </>
          )}
        </button>
        {ai && !aiLoading && (
          <button
            id="btn-ai-copy-report"
            data-testid="ai-copy-btn"
            onClick={async () => {
              const ok = await copyText(ai);
              if (ok) toast.success("Laporan AI berhasil disalin");
              else toast.error("Tidak bisa menyalin otomatis — salin manual");
            }}
            className="tap h-11 px-4 rounded-xl bg-white/10 hover:bg-white/20 active:scale-[0.98] font-bold flex items-center gap-1.5 transition-colors"
          >
            Salin
          </button>
        )}
      </div>
    </div>
  );
});

const WidgetLowstock = memo(function WidgetLowstock({ lowStock, lowStockThr, isInput, products }) {
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
});

// ---------- Halaman Dashboard ----------
export default function Dashboard() {
  const { user } = useAuth();
  const isSuper = isSuperAdmin(user);
  const rawRole = user?.role || "kasir";
  const baseRole = isSuper ? "admin" : (roleBaseOf(user) === "superadmin" ? "admin" : roleBaseOf(user));
  const role = isSuper || rawRole === "superadmin" ? "superadmin" : rawRole;
  const effectiveRole = isSuper || role === "superadmin" ? "admin" : baseRole;
  const canManage = isSuper || role === "superadmin" || effectiveRole === "admin" || isAdmin(user);
  const hasSummary = canManage || role === "kasir" || effectiveRole === "kasir";
  const { feat } = useFeatures();
  const ui = useUI();
  // Gating feature flag (Pengaturan → Fitur & Integrasi).
  const aiWidgetOk = feat("ai.enabled") && feat("ai.summary");
  const bannerOk = feat("update.banner");
  const [date, setDate] = useState(wibToday());
  const [data, setData] = useState(null);
  const [ai, setAi] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState("");
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
  const roleDefault = DASH_ROLE_DEFAULT[role] || DASH_ROLE_DEFAULT[effectiveRole] || DASH_ROLE_DEFAULT.admin;
  const [serverDefaults, setServerDefaults] = useState(null);
  const [widgets, setWidgets] = useState(() => {
    try {
      const raw = JSON.parse(localStorage.getItem(DASH_LOCAL_KEY + role) || localStorage.getItem(DASH_LOCAL_KEY + effectiveRole) || "null");
      if (Array.isArray(raw) && raw.length) return raw;
    } catch (e) {}
    return null; // null -> pakai default (server/fallback)
  });

  useEffect(() => { loadBusiness().then(setBiz); }, []);
  useEffect(() => {
    api.get("/settings/dashboard").then((r) => {
      const rd = r.data || {};
      setServerDefaults(rd);
      const srvList = rd[role] || rd[effectiveRole] || [];
      try { localStorage.setItem(DASH_LOCAL_KEY + role + "_srv", JSON.stringify(srvList)); } catch (e) {}
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role, effectiveRole]);

  const serverDef = ((serverDefaults && (serverDefaults[role] || serverDefaults[effectiveRole])) || []);
  const effective = (Array.isArray(widgets) && widgets.length)
    ? widgets
    : (serverDef.length ? serverDef : roleDefault);
  const lowStockThr = Number(biz?.low_stock_threshold ?? 10);

  // id valid: widget bawaan sesuai role ATAU widget kustom yang masih ada & aktif.
  const idOk = (id) => {
    if (isCwId(id)) { const d = cwById[cwIdOf(id)]; return !!d && !!d.enabled; }
    return DASH_WIDGETS.some((w) => w.id === id && (w.roles.includes(role) || w.roles.includes(effectiveRole) || canManage)) && !(id === "ai" && !aiWidgetOk);
  };
  // urutan tampil: susunan user > bawaan. Widget kustom baru otomatis tampil di akhir
  // HANYA bila user belum pernah menyusun sendiri (widgets === null) — setelah itu,
  // daftar persis seperti yang disimpan user (bisa disembunyikan/disusun lewat Atur Widget).
  const hasPersonalLayout = Array.isArray(widgets) && widgets.length > 0;
  const validEffective = effective.filter(idOk);
  const baseLayout = validEffective.length ? validEffective : roleDefault;
  // urutan dari Pengaturan → Menu & Tampilan UI (dashboard.order[role]) menimpa urutan default
  const computedLayout = orderWidgets([
    ...baseLayout,
    ...(!hasPersonalLayout ? cwOn.filter((d) => !baseLayout.includes("custom:" + d.id)).map((d) => "custom:" + d.id) : []),
  ], effectiveRole, ui);
  const layoutIds = computedLayout.length ? computedLayout : roleDefault;

  const loadSummary = useCallback(() => {
    if (!hasSummary) return Promise.resolve();
    return api.get("/reports/summary", { params: { date } }).then((r) => setData(r.data)).catch((e) => toast.error(apiError(e.response?.data?.detail)));
  }, [date, hasSummary]);
  useEffect(() => {
    if (hasSummary) { loadSummary(); setAi(""); setAiError(""); }
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
    // Validasi payload: pastikan tanggal valid format YYYY-MM-DD
    const targetDate = (typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date.trim()))
      ? date.trim()
      : wibToday();

    setAiLoading(true);
    setAiError("");
    try {
      const { data: d } = await api.post(
        "/reports/ai-summary",
        { date: targetDate },
        { timeout: 35000 }
      );
      if (d && d.summary) {
        setAi(d.summary);
        toast.success("Ringkasan AI berhasil dibuat");
      } else {
        const msg = "Respon server tidak memuat teks laporan analitik.";
        setAiError(msg);
        toast.error(msg);
      }
    } catch (e) {
      let errMsg = apiError(e.response?.data?.detail);
      if (!errMsg || errMsg === "Terjadi kesalahan. Coba lagi.") {
        if (e.code === "ECONNABORTED" || e.message?.toLowerCase().includes("timeout")) {
          errMsg = "Koneksi waktu habis saat menunggu respon analitik AI. Silakan coba lagi.";
        } else if (e.response?.status === 503) {
          errMsg = "Layanan pemrosesan AI sedang padat. Silakan coba sesaat lagi.";
        } else if (e.message) {
          errMsg = e.message;
        }
      }
      setAiError(errMsg);
      toast.error(errMsg);
    } finally {
      setAiLoading(false);
    }
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
    setDraft(current.length ? current : DASH_ROLE_DEFAULT[role] || DASH_ROLE_DEFAULT[effectiveRole] || []);
    setLayoutOpen(true);
  };
  const saveLocal = (list) => {
    setWidgets(list);
    try { localStorage.setItem(DASH_LOCAL_KEY + role, JSON.stringify(list)); } catch (e) {}
    setLayoutOpen(false);
    toast.success("Tata letak dashboard disimpan di perangkat ini");
  };
  const saveRoleDefault = async (list) => {
    const targetRole = role === "superadmin" ? "admin" : role;
    try {
      await api.put("/settings/dashboard", { role: targetRole, widgets: list });
      try { localStorage.setItem(DASH_LOCAL_KEY + role, JSON.stringify(list)); } catch (e) {}
      setWidgets(list);
      setServerDefaults((sd) => ({ ...(sd || {}), [role]: list, [targetRole]: list }));
      toast.success(`Tersimpan sebagai default untuk role ${role}`);
      setLayoutOpen(false);
    } catch (e) { toast.error(apiError(e.response?.data?.detail)); }
  };

  const renderWidget = (id) => {
    switch (id) {
      case "firestore":
        return (
          <Suspense fallback={<SyncStatusSkeleton />}>
            <VisualSyncStatusCard />
          </Suspense>
        );
      case "kpi":
        return data && <WidgetKpi data={data} view={view} lb={lb} />;
      case "jenis":
        return data && <WidgetJenis data={data} view={view} />;
      case "finansial":
        return data && <WidgetFinansial data={data} view={view} lb={lb} />;
      case "trend":
        return hasSummary ? (
          <Suspense fallback={<ChartSkeleton height={240} title="Memuat Tren Penjualan..." />}>
            <LazyWidgetTrend view={view} />
          </Suspense>
        ) : null;
      case "kategori":
        return data && <WidgetKategori data={data} />;
      case "terlaris":
        return data ? (
          <Suspense fallback={<ChartSkeleton height={200} title="Memuat Produk Terlaris..." />}>
            <LazyWidgetTerlaris data={data} view={view} lb={lb} />
          </Suspense>
        ) : null;
      case "metode":
        return data && <WidgetMetode data={data} />;
      case "ai":
        return hasSummary && aiWidgetOk && <WidgetAi onGen={genAi} ai={ai} aiLoading={aiLoading} aiError={aiError} date={date} />;
      case "lowstock":
        return <WidgetLowstock lowStock={data?.low_stock || []} lowStockThr={lowStockThr} isInput={!hasSummary} products={prods} />;
      default:
        return null;
    }
  };

  const renderById = (id, i) => {
    const cwid = cwIdOf(id);
    if (cwid) {
      const d = cwById[cwid];
      if (!d || !d.enabled) return null;
      return (
        <Suspense key={id} fallback={<CustomWidgetSkeleton />}>
          <LazyWidgetKustomCard def={d} daily={cwDailyOf(cwid)} summary={data} date={date}
            fillable onFill={(def) => setCwFill({ def })} />
        </Suspense>
      );
    }
    return (
      <div key={`${id}-${i}`} data-testid={`dash-widget-${id}`} className={id === "kpi" || id === "jenis" || id === "finansial" ? "" : "widget-block"}>
        {renderWidget(id)}
      </div>
    );
  };

  const available = DASH_WIDGETS.filter((w) => (w.roles.includes(role) || w.roles.includes(effectiveRole) || canManage) && !(w.id === "ai" && !aiWidgetOk));
  // daftar baris dialog Atur Widget: bawaan + widget kustom (urutan defaultnya di bawah)
  const dialogItems = [
    ...available.map((w) => ({ id: w.id, label: w.label })),
    ...cwOn.map((d) => ({ id: "custom:" + d.id, label: d.name, color: d.color })),
  ];
  const waiting = hasSummary && !data;

  return (
    <div className="h-full overflow-y-auto p-8" data-testid="dashboard-page">
      {upd?.updateAvailable && canManage && bannerOk && (
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
          {canManage && (
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
          {canManage ? <> — atau buat kartu sendiri lewat <b>Kelola Widget Kustom</b>.</> : "."}
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
            {canManage && " Anda juga bisa menjadikannya default untuk role ini."}
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
          {canManage && (
            <button onClick={() => { setLayoutOpen(false); nav("/settings?tab=widget"); }}
              className="tap w-full h-10 rounded-xl border-2 border-dashed border-[#E4E4E7] text-xs font-bold text-[#52525B] flex items-center justify-center gap-1.5 hover:border-[#E63946] hover:text-[#E63946]">
              <LayoutGrid size={14} /> Buat / kelola widget kustom (rumus & data sendiri)
            </button>
          )}
          <DialogFooter className="flex-col gap-2 sm:flex-col">
            <button data-testid="w-apply" onClick={() => saveLocal(draft || [])} className="tap w-full h-11 rounded-xl bg-[#0A0A0A] text-white font-bold flex items-center justify-center gap-2">
              <Save size={16} /> Terapkan di Perangkat Ini
            </button>
            {canManage && (
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
        <Suspense fallback={null}>
          <LazyFillDataDialog
            open={!!cwFill}
            onOpenChange={(v) => { if (!v) setCwFill(null); }}
            def={cwFill.def}
            date={date}
            daily={cwDailyOf(cwFill.def.id)}
            onSaved={(dly) => setCwEntries((prev) => ({ ...prev, [cwFill.def.id]: { date, daily: dly } }))}
          />
        </Suspense>
      )}
    </div>
  );
}
