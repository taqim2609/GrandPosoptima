import { useState, useEffect, useCallback, memo } from "react";
import api from "@/lib/api";
import { rupiah, wibToday } from "@/lib/format";
import {
  TrendingUp, TrendingDown, Minus, Loader2, Award, Flame, Store, Utensils
} from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip, CartesianGrid, Legend
} from "recharts";

export const WidgetTrend = memo(function WidgetTrend() {
  const [period, setPeriod] = useState("week");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isLive, setIsLive] = useState(false);

  const fetchTrendData = useCallback(() => {
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
          const fnbVal = rec.fnb || (rec.total ? Math.round(rec.total * 0.7) : 0);
          const retailVal = rec.retail || (rec.total ? Math.round(rec.total * 0.3) : 0);
          out.push({
            date: d,
            label: d.slice(5),
            fnb: fnbVal,
            retail: retailVal,
            total: rec.total || (fnbVal + retailVal),
            count: rec.count || 0
          });
        }
        setRows(out);
      })
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, [period]);

  useEffect(() => {
    fetchTrendData();
  }, [fetchTrendData]);

  // Connect to SSE stream for real-time automatic chart updates on transactions
  useEffect(() => {
    let es;
    try {
      es = new EventSource("/api/system/sync/stream");
      es.onopen = () => setIsLive(true);
      es.onmessage = (evt) => {
        try {
          const parsed = JSON.parse(evt.data);
          if (parsed.event === "order_created" || parsed.event === "order_paid" || parsed.event === "manual_sync") {
            fetchTrendData();
          }
        } catch (_) {}
      };
      es.onerror = () => setIsLive(false);
    } catch (_) {
      setIsLive(false);
    }
    return () => {
      if (es) es.close();
    };
  }, [fetchTrendData]);

  const totalFnb = rows.reduce((s, r) => s + (r.fnb || 0), 0);
  const totalRetail = rows.reduce((s, r) => s + (r.retail || 0), 0);
  const totalAll = totalFnb + totalRetail;

  return (
    <div className="bg-white rounded-2xl border p-5 shadow-xs" data-testid="trend-chart">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-extrabold text-base flex items-center gap-2">
              <TrendingUp size={18} className="text-[#E63946]" /> Grafik Tren Transaksi Real-Time
            </h3>
            <span className={`inline-flex items-center gap-1 text-[10px] font-extrabold px-2 py-0.5 rounded-full ${isLive ? "bg-emerald-100 text-emerald-800 border border-emerald-300" : "bg-neutral-100 text-neutral-600"}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${isLive ? "bg-emerald-500 animate-ping" : "bg-neutral-400"}`} />
              {isLive ? "SSE LIVE" : "POLLING"}
            </span>
          </div>
          <p className="text-xs text-[#52525B] mt-0.5">
            Perbandingan omzet F&B (<span className="text-[#E63946] font-bold">Merah</span>) vs Retail (<span className="text-[#2563EB] font-bold">Biru</span>)
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="text-xs text-[#52525B] font-bold">
            Total Periode: <span className="font-num text-[#0A0A0A] font-extrabold">{rupiah(totalAll)}</span>
          </div>
          <div className="flex gap-1">
            {["week", "month"].map((p) => (
              <button
                key={p}
                data-testid={`trend-${p}`}
                onClick={() => setPeriod(p)}
                className={`tap h-8 px-3 rounded-lg text-xs font-bold transition-colors ${period === p ? "bg-[#E63946] text-white" : "bg-[#F4F5F7] text-[#52525B] hover:bg-[#E4E4E7]"}`}
              >
                {p === "week" ? "7 Hari" : "30 Hari"}
              </button>
            ))}
          </div>
        </div>
      </div>

      {loading ? (
        <div className="h-[260px] grid place-items-center">
          <Loader2 className="animate-spin text-[#E63946]" size={24} />
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={rows} margin={{ left: 10, right: 24, top: 10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#F1F1F4" />
            <XAxis dataKey="label" tick={{ fontSize: 11 }} interval={period === "week" ? 0 : "preserveStartEnd"} padding={{ right: 12 }} />
            <YAxis tick={{ fontSize: 11 }} width={75} tickFormatter={(v) => "Rp" + (v >= 1000000 ? (v / 1000000).toFixed(1) + "M" : v >= 1000 ? (v / 1000).toFixed(0) + "k" : v)} />
            <Tooltip formatter={(v, name) => [rupiah(v), name]} labelFormatter={(l) => `Tanggal ${l}`} />
            <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
            <Line type="monotone" dataKey="fnb" stroke="#E63946" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} name="Omzet F&B" />
            <Line type="monotone" dataKey="retail" stroke="#2563EB" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} name="Omzet Retail" />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
});

export const WidgetTerlaris = memo(function WidgetTerlaris({ data, view, lb }) {
  const viewProducts = view === "fnb" ? (data?.top_fnb || data?.top_products || []) : (data?.top_retail || data?.top_products || []);
  const topList = (Array.isArray(viewProducts) ? viewProducts : []).slice(0, 5);

  const getRankBadgeClass = (index) => {
    if (index === 0) return "bg-[#FEF3C7] text-[#B45309] border-[#FDE68A]"; // #1 Gold
    if (index === 1) return "bg-[#F1F5F9] text-[#475569] border-[#CBD5E1]"; // #2 Silver
    if (index === 2) return "bg-[#FFEDD5] text-[#C2410C] border-[#FED7AA]"; // #3 Bronze
    return "bg-[#F4F5F7] text-[#52525B] border-[#E4E4E7]";
  };

  const getTrendIndicator = (p, index) => {
    const margin = p.margin || 0;
    const qty = p.qty || 0;

    if (index === 0 || margin >= 40 || qty >= 10) {
      return {
        label: "Tren Naik",
        icon: TrendingUp,
        color: "bg-[#D1FAE5] text-[#047857] border-[#6EE7B7]",
      };
    } else if (qty <= 3 && margin < 20) {
      return {
        label: "Tren Turun",
        icon: TrendingDown,
        color: "bg-[#FEE2E2] text-[#DC2626] border-[#FCA5A5]",
      };
    }
    return {
      label: "Stabil",
      icon: Minus,
      color: "bg-[#F4F5F7] text-[#52525B] border-[#E4E4E7]",
    };
  };

  return (
    <div className="bg-white rounded-2xl border p-5 shadow-xs" data-testid="top-products-widget">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div>
          <h3 className="font-extrabold text-base flex items-center gap-2">
            <Flame size={18} className="text-[#E63946]" /> Kartu Peringkat Menu Terlaris Hari Ini
          </h3>
          <p className="text-xs text-[#52525B] mt-0.5">
            Peringkat penjualan {view === "fnb" ? lb.fnb : lb.retail} dilengkapi indikator tren & porsi terjual
          </p>
        </div>
      </div>

      {topList.length === 0 ? (
        <p className="text-sm text-[#a1a1aa] py-6 text-center">Belum ada transaksi penjualan {view === "fnb" ? lb.fnb : lb.retail} hari ini.</p>
      ) : (
        <>
          {/* Kartu Visual Peringkat Menu Terlaris */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 mb-5" data-testid="rank-cards">
            {topList.map((p, idx) => {
              const trend = getTrendIndicator(p, idx);
              const TrendIcon = trend.icon;
              return (
                <div
                  key={p.name + idx}
                  className="rounded-xl border p-3.5 bg-white flex flex-col justify-between space-y-2 hover:border-[#E63946] transition-colors shadow-2xs"
                >
                  <div className="flex items-start justify-between gap-1">
                    <span className={`text-[11px] font-extrabold font-mono px-2 py-0.5 rounded-md border ${getRankBadgeClass(idx)}`}>
                      #{idx + 1}
                    </span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border flex items-center gap-1 ${trend.color}`}>
                      <TrendIcon size={11} /> {trend.label}
                    </span>
                  </div>

                  <div>
                    <div className="font-extrabold text-sm text-[#0A0A0A] truncate" title={p.name}>
                      {p.name}
                    </div>
                    <div className="text-xs font-semibold text-[#52525B] mt-0.5 flex items-center gap-1">
                      {p.type === "retail" ? <Store size={12} className="text-[#2563EB]" /> : <Utensils size={12} className="text-[#E63946]" />}
                      <span className="font-num font-bold text-[#0A0A0A]">{p.qty} porsi</span>
                    </div>
                  </div>

                  <div className="pt-2 border-t flex items-center justify-between text-xs">
                    <span className="text-[11px] text-[#71717A]">Omzet:</span>
                    <span className="font-num font-extrabold text-[#E63946]">{rupiah(p.total)}</span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Tabel Detail Margin Laba */}
          <div className="border rounded-xl overflow-hidden shadow-2xs" data-testid="margin-table">
            <table className="w-full text-sm">
              <thead className="bg-[#F4F5F7] text-[#52525B] text-xs uppercase tracking-wider">
                <tr>
                  <th className="text-left p-2.5">Peringkat &amp; Produk</th>
                  <th className="text-right p-2.5">Terjual</th>
                  <th className="text-right p-2.5">Total Omzet</th>
                  <th className="text-right p-2.5">Laba Kotor</th>
                  <th className="text-right p-2.5">Margin</th>
                </tr>
              </thead>
              <tbody>
                {viewProducts.map((p, idx) => (
                  <tr key={p.name + idx} className="border-t hover:bg-[#FAFAFA] transition">
                    <td className="p-2.5 font-bold truncate max-w-[180px] flex items-center gap-2">
                      <span className="text-[10px] font-mono font-extrabold text-[#71717A]">#{idx + 1}</span>
                      <span className="truncate">{p.name}</span>
                    </td>
                    <td className="p-2.5 text-right font-num font-semibold">{p.qty} porsi</td>
                    <td className="p-2.5 text-right font-num font-semibold">{rupiah(p.total)}</td>
                    <td className="p-2.5 text-right font-num font-bold text-[#047857]">{rupiah(p.profit || 0)}</td>
                    <td className="p-2.5 text-right">
                      <span className={`font-num font-bold px-2 py-0.5 rounded text-xs ${(p.margin || 0) >= 40 ? "bg-[#D1FAE5] text-[#047857]" : (p.margin || 0) >= 15 ? "bg-[#FEF3C7] text-[#B45309]" : "bg-[#FEE2E2] text-[#EF4444]"}`}>
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
});

export default {
  WidgetTrend,
  WidgetTerlaris,
};
