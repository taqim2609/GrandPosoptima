import { useState, useEffect, memo } from "react";
import api from "@/lib/api";
import { rupiah, wibToday } from "@/lib/format";
import { TrendingUp, Loader2 } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, Cell,
  LineChart, Line, CartesianGrid,
} from "recharts";

export const WidgetTrend = memo(function WidgetTrend({ view }) {
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
        <h3 className="font-extrabold flex items-center gap-2">
          <TrendingUp size={18} className="text-[#E63946]" /> Tren Penjualan
        </h3>
        <div className="flex items-center gap-3">
          <div className="text-xs text-[#52525B] font-bold">
            Total periode: <span className="font-num text-[#0A0A0A]">{rupiah(totalPeriod)}</span>
          </div>
          <div className="flex gap-1">
            {["week", "month"].map((p) => (
              <button
                key={p}
                data-testid={`trend-${p}`}
                onClick={() => setPeriod(p)}
                className={`tap h-8 px-3 rounded-lg text-xs font-bold ${period === p ? "bg-[#E63946] text-white" : "bg-[#F4F5F7]"}`}
              >
                {p === "week" ? "7 Hari" : "30 Hari"}
              </button>
            ))}
          </div>
        </div>
      </div>
      {loading ? (
        <div className="h-[240px] grid place-items-center">
          <Loader2 className="animate-spin text-[#E63946]" />
        </div>
      ) : (
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
});

export const WidgetTerlaris = memo(function WidgetTerlaris({ data, view, lb }) {
  const viewProducts = view === "fnb" ? (data?.top_fnb || data?.top_products || []) : (data?.top_retail || data?.top_products || []);
  const chartData = (Array.isArray(viewProducts) ? viewProducts : []).map((p) => ({
    name: (p.name || "").length > 12 ? (p.name || "").slice(0, 12) + "…" : (p.name || ""),
    total: p.total || 0,
  }));

  return (
    <div className="bg-white rounded-2xl border p-5">
      <h3 className="font-extrabold mb-4">Produk Terlaris & Margin</h3>
      {chartData.length === 0 ? (
        <p className="text-sm text-[#a1a1aa]">Belum ada penjualan {view === "fnb" ? lb.fnb : lb.retail} hari ini.</p>
      ) : (
        <>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={chartData} layout="vertical" margin={{ left: 10 }}>
              <XAxis type="number" hide />
              <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 12 }} />
              <Tooltip formatter={(v) => rupiah(v)} />
              <Bar dataKey="total" radius={[0, 6, 6, 0]}>
                {chartData.map((entry) => (
                  <Cell key={entry.name} fill="#E63946" />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <div className="mt-3 border rounded-xl overflow-hidden" data-testid="margin-table">
            <table className="w-full text-sm">
              <thead className="bg-[#F4F5F7] text-[#52525B] text-xs uppercase tracking-wider">
                <tr>
                  <th className="text-left p-2.5">Produk</th>
                  <th className="text-right p-2.5">Qty</th>
                  <th className="text-right p-2.5">Omzet</th>
                  <th className="text-right p-2.5">Laba</th>
                  <th className="text-right p-2.5">Margin</th>
                </tr>
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
});

export default {
  WidgetTrend,
  WidgetTerlaris,
};
