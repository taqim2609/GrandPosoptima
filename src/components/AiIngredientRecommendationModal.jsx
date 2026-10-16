import { useState, useEffect, useCallback } from "react";
import api, { apiError } from "@/lib/api";
import { rupiah } from "@/lib/format";
import { toast } from "sonner";
import {
  Sparkles,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Flame,
  ShoppingCart,
  Plus,
  Printer,
  MessageCircle,
  Clock,
  TrendingUp,
  Boxes,
  ChefHat,
  ChevronDown,
  ChevronUp,
  Info,
  Calendar,
  CheckSquare,
  Square,
  PackagePlus,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { printText } from "@/lib/print";

const nf = (n) =>
  n == null ? "0" : Number(n).toLocaleString("id-ID", { maximumFractionDigits: 2 });

const DEFAULT_MODELS = [
  {
    id: "gemini-3.8-flash",
    name: "Gemini 3.8 Flash",
    label: "Gemini 3.8 Flash (Default — Cepat & Cerdas)",
    speed: "Sangat Cepat",
    badge: "Default",
  },
  {
    id: "gemini-3.1-flash-lite",
    name: "Gemini 3.1 Flash Lite",
    label: "Gemini 3.1 Flash Lite (Ultra Ringan & Efisien)",
    speed: "Ultra Cepat",
    badge: "Hemat Kuota",
  },
  {
    id: "gemini-flash-latest",
    name: "Gemini Flash Latest",
    label: "Gemini Flash Latest (Versi Terkini)",
    speed: "Cepat",
    badge: "Stabil",
  },
  {
    id: "gemini-2.5-flash",
    name: "Gemini 2.5 Flash",
    label: "Gemini 2.5 Flash (Generasi 2.5)",
    speed: "Cepat",
    badge: "Gen 2.5",
  },
  {
    id: "gemini-2.5-pro",
    name: "Gemini 2.5 Pro",
    label: "Gemini 2.5 Pro (Penalaran Lanjutan)",
    speed: "Sedang",
    badge: "Pro Reasoning",
  },
  {
    id: "gemini-3.1-pro-preview",
    name: "Gemini 3.1 Pro (Preview)",
    label: "Gemini 3.1 Pro (Deep Complex Reasoning)",
    speed: "Kuat",
    badge: "Advanced",
  },
];

export default function AiIngredientRecommendationModal({
  open,
  onOpenChange,
  onApplyToShoppingList,
  onApplyToBulkPurchase,
  currentShoppingDate,
}) {
  const [days, setDays] = useState(7);
  const [selectedModel, setSelectedModel] = useState("gemini-3.8-flash");
  const [modelsList, setModelsList] = useState(DEFAULT_MODELS);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);
  const [selectedItems, setSelectedItems] = useState({});
  const [editedQuantities, setEditedQuantities] = useState({});
  const [expandedRow, setExpandedRow] = useState(null);
  const [applying, setApplying] = useState(false);

  // Load models from API if available
  useEffect(() => {
    api.get("/ai/models")
      .then((res) => {
        if (res.data?.models && Array.isArray(res.data.models)) {
          setModelsList(res.data.models);
        }
      })
      .catch(() => {});
  }, []);

  const fetchRecommendations = useCallback(async (selectedDays = days, modelChoice = selectedModel) => {
    setLoading(true);
    try {
      const res = await api.get("/ai/ingredient-purchase-recommendations", {
        params: {
          days: selectedDays,
          model: modelChoice,
        },
      });
      const resData = res.data;
      setData(resData);

      // Auto-select critical & warning items by default
      const initialSelected = {};
      const initialQuantities = {};
      (resData?.recommendations || []).forEach((item) => {
        const isUrgent = item.urgency === "critical" || item.urgency === "warning";
        initialSelected[item.ingredient_id] = isUrgent;
        initialQuantities[item.ingredient_id] = item.recommended_qty || 1;
      });
      setSelectedItems(initialSelected);
      setEditedQuantities(initialQuantities);
    } catch (err) {
      toast.error("Gagal memuat rekomendasi AI: " + apiError(err.response?.data?.detail));
    } finally {
      setLoading(false);
    }
  }, [days, selectedModel]);

  useEffect(() => {
    if (open) {
      fetchRecommendations(days, selectedModel);
    }
  }, [open, days, selectedModel, fetchRecommendations]);

  const toggleSelectAll = () => {
    const allSelected = (data?.recommendations || []).every(
      (r) => selectedItems[r.ingredient_id]
    );
    const newSelected = {};
    (data?.recommendations || []).forEach((r) => {
      newSelected[r.ingredient_id] = !allSelected;
    });
    setSelectedItems(newSelected);
  };

  const handleQtyChange = (id, val) => {
    const num = Math.max(0, parseFloat(val) || 0);
    setEditedQuantities((prev) => ({ ...prev, [id]: num }));
  };

  const selectedCount = Object.values(selectedItems).filter(Boolean).length;

  // Calculate selected estimated cost
  const selectedCost = (data?.recommendations || []).reduce((sum, item) => {
    if (selectedItems[item.ingredient_id]) {
      const qty = editedQuantities[item.ingredient_id] ?? item.recommended_qty;
      return sum + qty * Number(item.unit_cost || 0);
    }
    return sum;
  }, 0);

  // Apply to Shopping List
  const handleApplyShoppingList = async () => {
    const itemsToApply = (data?.recommendations || [])
      .filter((r) => selectedItems[r.ingredient_id] && (editedQuantities[r.ingredient_id] ?? r.recommended_qty) > 0)
      .map((r) => ({
        ingredient_id: r.ingredient_id,
        name: r.ingredient_name,
        unit: r.unit,
        qty: editedQuantities[r.ingredient_id] ?? r.recommended_qty,
        cost: r.unit_cost,
        stock: r.current_stock,
        min_stock: r.min_stock,
        auto: true,
        note: `Saran AI (${days}hr sales): ${r.reason}`,
      }));

    if (!itemsToApply.length) {
      return toast.error("Pilih minimal 1 bahan untuk dimasukkan");
    }

    if (onApplyToShoppingList) {
      onApplyToShoppingList(itemsToApply);
      onOpenChange(false);
      return;
    }

    // Direct fallback call to API
    setApplying(true);
    try {
      const targetDate = currentShoppingDate || new Date().toISOString().slice(0, 10);
      await api.post("/shopping-list", {
        date: targetDate,
        items: itemsToApply,
      });
      toast.success(`${itemsToApply.length} bahan berhasil ditambahkan ke Daftar Belanja`);
      onOpenChange(false);
    } catch (err) {
      toast.error(apiError(err.response?.data?.detail));
    } finally {
      setApplying(false);
    }
  };

  // Apply to Bulk Purchase
  const handleApplyBulkPurchase = () => {
    const itemsToBuy = (data?.recommendations || [])
      .filter((r) => selectedItems[r.ingredient_id] && (editedQuantities[r.ingredient_id] ?? r.recommended_qty) > 0)
      .map((r) => ({
        ingredient_id: r.ingredient_id,
        name: r.ingredient_name,
        qty: editedQuantities[r.ingredient_id] ?? r.recommended_qty,
        cost: r.unit_cost,
        unit: r.unit,
      }));

    if (!itemsToBuy.length) {
      return toast.error("Pilih minimal 1 bahan untuk dibeli");
    }

    if (onApplyToBulkPurchase) {
      onApplyToBulkPurchase(itemsToBuy);
      onOpenChange(false);
    }
  };

  // Format WhatsApp share text
  const handleShareWhatsApp = () => {
    const chosen = (data?.recommendations || []).filter(
      (r) => selectedItems[r.ingredient_id] && (editedQuantities[r.ingredient_id] ?? r.recommended_qty) > 0
    );

    if (!chosen.length) {
      return toast.error("Pilih minimal 1 bahan untuk dibagikan");
    }

    let text = `*REKOMENDASI BELANJA BAHAN BAKU (AI)*\n`;
    text += `*Grand Aceh Kuliner*\n`;
    text += `Periode Analisis: Penjualan ${days} Hari Terakhir\n`;
    text += `Tanggal: ${new Date().toLocaleDateString("id-ID")}\n\n`;
    text += `*Ringkasan Kebutuhan Dapur:*\n`;
    chosen.forEach((item, i) => {
      const qty = editedQuantities[item.ingredient_id] ?? item.recommended_qty;
      const subtotal = qty * item.unit_cost;
      const urg = item.urgency === "critical" ? "🔴 KRITIS" : item.urgency === "warning" ? "🟡 PERLU" : "🟢 BUFFER";
      text += `${i + 1}. *${item.ingredient_name}* [${urg}]\n`;
      text += `   - Jumlah: ${qty} ${item.unit}\n`;
      text += `   - Est. Harga: ${rupiah(subtotal)} (${rupiah(item.unit_cost)}/${item.unit})\n`;
      text += `   - Stok Saat Ini: ${item.current_stock} ${item.unit} (Sisa ~${item.days_remaining} hari)\n\n`;
    });
    text += `*Total Estimasi Biaya: ${rupiah(selectedCost)}*\n\n`;
    text += `_Dibuat otomatis oleh AI Assistant POS & Inventory Grand Aceh Kuliner_`;

    const encoded = encodeURIComponent(text);
    window.open(`https://wa.me/?text=${encoded}`, "_blank");
  };

  // Print recommendation checklist
  const handlePrint = () => {
    const chosen = (data?.recommendations || []).filter(
      (r) => selectedItems[r.ingredient_id] && (editedQuantities[r.ingredient_id] ?? r.recommended_qty) > 0
    );

    if (!chosen.length) {
      return toast.error("Pilih minimal 1 bahan untuk dicetak");
    }

    let pText = `================================\n`;
    pText += `   GRAND ACEH KULINER\n`;
    pText += ` REKOMENDASI BELANJA BAHAN (AI)\n`;
    pText += ` Periode: Penjualan ${days} Hari\n`;
    pText += ` Tgl: ${new Date().toLocaleDateString("id-ID")} ${new Date().toLocaleTimeString("id-ID")}\n`;
    pText += `================================\n\n`;

    chosen.forEach((item, i) => {
      const qty = editedQuantities[item.ingredient_id] ?? item.recommended_qty;
      const subtotal = qty * item.unit_cost;
      pText += `[ ] ${i + 1}. ${item.ingredient_name}\n`;
      pText += `    Beli: ${qty} ${item.unit} @ ${rupiah(item.unit_cost)}\n`;
      pText += `    Subtotal: ${rupiah(subtotal)}\n`;
      pText += `    Stok: ${item.current_stock} ${item.unit} | Sisa: ~${item.days_remaining} hr\n\n`;
    });

    pText += `--------------------------------\n`;
    pText += `Total Item: ${chosen.length}\n`;
    pText += `Total Estimasi Biaya: ${rupiah(selectedCost)}\n`;
    pText += `================================\n`;
    pText += `Catatan Chef / Pembeli:\n\n\n\n`;
    pText += `Ttd Pengadaan: _______________\n`;

    printText(pText, `Rekomendasi_Belanja_AI_${days}_Hari`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[92vh] flex flex-col p-0 overflow-hidden rounded-2xl bg-[#F8FAFC]">
        {/* Header */}
        <div className="bg-gradient-to-r from-[#0F172A] via-[#1E1B4B] to-[#312E81] text-white p-6 border-b border-indigo-900/40">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/30 shrink-0">
                <Sparkles className="h-6 w-6 text-white" />
              </div>
              <div>
                <DialogTitle className="text-xl font-black tracking-tight text-white flex items-center gap-2 flex-wrap">
                  Rekomendasi Pembelian Bahan AI
                  <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-purple-500/30 text-purple-200 border border-purple-400/30">
                    {modelsList.find((m) => m.id === (data?.model_used || selectedModel))?.name || selectedModel}
                  </span>
                </DialogTitle>
                <p className="text-xs text-indigo-200/80 mt-1">
                  Menganalisis penjualan produk {days} hari terakhir, keterkaitan formula resep, &amp; laju konsumsi stok bahan dapur.
                </p>
              </div>
            </div>

            {/* Controls: Model AI + Timeframe selector */}
            <div className="flex items-center gap-2 flex-wrap">
              {/* AI Model Dropdown */}
              <div className="flex items-center gap-1.5 bg-slate-900/70 p-1 rounded-xl border border-indigo-500/30">
                <Sparkles className="h-3.5 w-3.5 text-amber-300 ml-2 shrink-0" />
                <label className="text-[10px] font-bold text-indigo-200 uppercase pr-1">Model:</label>
                <select
                  data-testid="ai-model-selector"
                  value={selectedModel}
                  onChange={(e) => {
                    const newModel = e.target.value;
                    setSelectedModel(newModel);
                    fetchRecommendations(days, newModel);
                  }}
                  disabled={loading}
                  className="bg-transparent text-xs font-bold text-white border-0 focus:ring-0 cursor-pointer pr-3 py-1 font-mono"
                >
                  {modelsList.map((m) => (
                    <option key={m.id} value={m.id} className="bg-slate-900 text-white py-1">
                      {m.name || m.label} ({m.speed || "AI"})
                    </option>
                  ))}
                </select>
              </div>

              {/* Timeframe selector */}
              <div className="flex items-center gap-1.5 bg-slate-900/70 p-1 rounded-xl border border-indigo-500/30">
                <Calendar className="h-3.5 w-3.5 text-indigo-300 ml-2 shrink-0" />
                <select
                  data-testid="ai-days-selector"
                  value={days}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    setDays(val);
                    fetchRecommendations(val, selectedModel);
                  }}
                  disabled={loading}
                  className="bg-transparent text-xs font-bold text-white border-0 focus:ring-0 cursor-pointer pr-3 py-1"
                >
                  <option value={3} className="bg-slate-900 text-white">3 Hari Terakhir</option>
                  <option value={7} className="bg-slate-900 text-white">1 Minggu (7 Hari)</option>
                  <option value={14} className="bg-slate-900 text-white">2 Minggu (14 Hari)</option>
                  <option value={30} className="bg-slate-900 text-white">1 Bulan (30 Hari)</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {loading ? (
            <div className="py-16 flex flex-col items-center justify-center text-center space-y-3">
              <Loader2 className="h-10 w-10 animate-spin text-indigo-600" />
              <div className="font-bold text-slate-800">Sedang menganalisis penjualan dan kalkulasi resep...</div>
              <p className="text-xs text-slate-500 max-w-sm">
                AI sedang mencocokkan riwayat transaksi POS dengan formula bahan baku untuk memproyeksikan kebutuhan belanja.
              </p>
            </div>
          ) : data ? (
            <>
              {/* Top Overview Metric Cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-sm">
                  <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                    <TrendingUp className="h-3.5 w-3.5 text-blue-500" /> Penjualan {days} Hari
                  </div>
                  <div className="text-lg font-black text-slate-900 mt-1">
                    {rupiah(data.total_sales_revenue)}
                  </div>
                  <div className="text-[11px] text-slate-500">
                    {nf(data.total_items_sold)} porsi/item terjual
                  </div>
                </div>

                <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-sm">
                  <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                    <ChefHat className="h-3.5 w-3.5 text-purple-500" /> Resep Teranalisis
                  </div>
                  <div className="text-lg font-black text-slate-900 mt-1">
                    {data.recipes_analyzed} Resep
                  </div>
                  <div className="text-[11px] text-slate-500">
                    {data.top_selling_products?.length || 0} menu aktif terlaris
                  </div>
                </div>

                <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-sm">
                  <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                    <Flame className="h-3.5 w-3.5 text-rose-500" /> Stok Kritis
                  </div>
                  <div className="text-lg font-black text-rose-600 mt-1">
                    {data.recommendations?.filter((r) => r.urgency === "critical").length || 0} Bahan
                  </div>
                  <div className="text-[11px] text-rose-700/80">
                    Diproyeksikan habis &le; 2.5 hari
                  </div>
                </div>

                <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-sm">
                  <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                    <ShoppingCart className="h-3.5 w-3.5 text-emerald-500" /> Est. Biaya Belanja
                  </div>
                  <div className="text-lg font-black text-emerald-700 mt-1">
                    {rupiah(selectedCost || data.estimated_total_cost)}
                  </div>
                  <div className="text-[11px] text-slate-500">
                    {selectedCount} item terpilih
                  </div>
                </div>
              </div>

              {/* AI Narrative Insight Box */}
              <div className="bg-gradient-to-br from-indigo-50/80 via-white to-purple-50/60 p-4 rounded-2xl border border-indigo-100 shadow-sm space-y-3">
                <div className="flex items-center gap-2">
                  <span className="flex h-2 w-2 rounded-full bg-indigo-600 animate-ping" />
                  <span className="text-xs font-black uppercase tracking-wider text-indigo-950 flex items-center gap-1.5">
                    <Sparkles className="h-3.5 w-3.5 text-indigo-600" /> Analisis Operasional &amp; Kebutuhan Dapur
                  </span>
                </div>
                <p className="text-sm text-slate-700 leading-relaxed">
                  {data.summary_narrative}
                </p>

                {data.key_insights && data.key_insights.length > 0 && (
                  <div className="grid sm:grid-cols-2 gap-2 pt-2 border-t border-indigo-100/60">
                    {data.key_insights.map((insight, idx) => (
                      <div key={idx} className="flex items-start gap-2 text-xs text-slate-600">
                        <CheckCircle2 className="h-3.5 w-3.5 text-indigo-600 shrink-0 mt-0.5" />
                        <span>{insight}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Recommendations Table */}
              <div className="space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={toggleSelectAll}
                      className="text-xs font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1.5 px-2 py-1 rounded-lg hover:bg-indigo-50 transition-colors"
                    >
                      {selectedCount === (data.recommendations?.length || 0) ? (
                        <>
                          <CheckSquare className="h-4 w-4" /> Batal Pilih Semua
                        </>
                      ) : (
                        <>
                          <Square className="h-4 w-4" /> Pilih Semua
                        </>
                      )}
                    </button>
                    <span className="text-xs text-slate-400">|</span>
                    <span className="text-xs text-slate-500 font-medium">
                      {selectedCount} dari {data.recommendations?.length || 0} bahan dipilih
                    </span>
                  </div>

                  <div className="text-xs text-slate-500">
                    Perkiraan Total: <span className="font-bold text-slate-900">{rupiah(selectedCost)}</span>
                  </div>
                </div>

                <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider font-bold border-b border-slate-200">
                        <tr>
                          <th className="p-3 w-10 text-center">Pilih</th>
                          <th className="p-3">Bahan Baku &amp; Menu Terkait</th>
                          <th className="p-3 text-center">Stok / Min</th>
                          <th className="p-3 text-center">Konsumsi 7hr</th>
                          <th className="p-3 text-center">Sisa Hari</th>
                          <th className="p-3 text-center">Status Urgensi</th>
                          <th className="p-3 text-right">Saran Beli</th>
                          <th className="p-3 text-right">Est. Biaya</th>
                          <th className="p-3 w-10"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {(data.recommendations || []).map((item) => {
                          const isSelected = !!selectedItems[item.ingredient_id];
                          const qty = editedQuantities[item.ingredient_id] ?? item.recommended_qty;
                          const subtotal = qty * Number(item.unit_cost || 0);
                          const isExpanded = expandedRow === item.ingredient_id;

                          return (
                            <tr
                              key={item.ingredient_id}
                              className={`transition-colors ${
                                isSelected ? "bg-indigo-50/30 hover:bg-indigo-50/50" : "hover:bg-slate-50"
                              }`}
                            >
                              <td className="p-3 text-center">
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={(e) =>
                                    setSelectedItems((prev) => ({
                                      ...prev,
                                      [item.ingredient_id]: e.target.checked,
                                    }))
                                  }
                                  className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                                />
                              </td>
                              <td className="p-3">
                                <div className="font-black text-slate-900 text-sm">
                                  {item.ingredient_name}
                                </div>
                                {item.used_in_products && item.used_in_products.length > 0 && (
                                  <div className="flex flex-wrap gap-1 mt-1">
                                    {item.used_in_products.slice(0, 3).map((pName, pIdx) => (
                                      <span
                                        key={pIdx}
                                        className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600"
                                      >
                                        {pName}
                                      </span>
                                    ))}
                                    {item.used_in_products.length > 3 && (
                                      <span className="text-[10px] font-semibold text-slate-400">
                                        +{item.used_in_products.length - 3} lainnya
                                      </span>
                                    )}
                                  </div>
                                )}
                              </td>
                              <td className="p-3 text-center font-mono">
                                <span className={item.current_stock <= item.min_stock ? "text-rose-600 font-bold" : "text-slate-700"}>
                                  {nf(item.current_stock)}
                                </span>
                                <span className="text-slate-400"> / {nf(item.min_stock)} {item.unit}</span>
                              </td>
                              <td className="p-3 text-center font-mono text-slate-700">
                                {nf(item.weekly_usage)} {item.unit}
                              </td>
                              <td className="p-3 text-center">
                                <span
                                  className={`inline-flex items-center gap-1 font-bold px-2 py-0.5 rounded-full text-[11px] ${
                                    item.days_remaining <= 2.5
                                      ? "bg-rose-100 text-rose-700"
                                      : item.days_remaining <= 5
                                      ? "bg-amber-100 text-amber-700"
                                      : "bg-emerald-100 text-emerald-700"
                                  }`}
                                >
                                  <Clock className="h-3 w-3" />
                                  ~{item.days_remaining} hr
                                </span>
                              </td>
                              <td className="p-3 text-center">
                                {item.urgency === "critical" ? (
                                  <span className="inline-flex items-center gap-1 font-bold px-2.5 py-1 rounded-full text-[10px] bg-rose-600 text-white shadow-sm shadow-rose-200">
                                    <Flame className="h-3 w-3" /> Stok Kritis
                                  </span>
                                ) : item.urgency === "warning" ? (
                                  <span className="inline-flex items-center gap-1 font-bold px-2.5 py-1 rounded-full text-[10px] bg-amber-500 text-white">
                                    <AlertTriangle className="h-3 w-3" /> Perlu Beli
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 font-semibold px-2.5 py-1 rounded-full text-[10px] bg-slate-100 text-slate-600">
                                    Buffer Aman
                                  </span>
                                )}
                              </td>
                              <td className="p-3 text-right">
                                <div className="flex items-center justify-end gap-1.5">
                                  <input
                                    type="number"
                                    min="0"
                                    step="any"
                                    value={qty}
                                    onChange={(e) => handleQtyChange(item.ingredient_id, e.target.value)}
                                    className="w-20 h-8 rounded-lg border border-slate-300 px-2 text-right font-mono font-bold text-slate-900 focus:ring-1 focus:ring-indigo-500 bg-white"
                                  />
                                  <span className="text-[11px] text-slate-500 font-medium w-12 text-left truncate">
                                    {item.unit}
                                  </span>
                                </div>
                              </td>
                              <td className="p-3 text-right font-mono font-bold text-slate-900">
                                {rupiah(subtotal)}
                              </td>
                              <td className="p-3 text-center">
                                <button
                                  type="button"
                                  onClick={() =>
                                    setExpandedRow(isExpanded ? null : item.ingredient_id)
                                  }
                                  className="h-6 w-6 rounded hover:bg-slate-200 flex items-center justify-center text-slate-400"
                                >
                                  {isExpanded ? (
                                    <ChevronUp className="h-3.5 w-3.5" />
                                  ) : (
                                    <ChevronDown className="h-3.5 w-3.5" />
                                  )}
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Expanded Detail Panel */}
                  {expandedRow && (() => {
                    const row = (data.recommendations || []).find(
                      (r) => r.ingredient_id === expandedRow
                    );
                    if (!row) return null;
                    return (
                      <div className="bg-slate-50 p-4 border-t border-slate-200 text-xs text-slate-700 space-y-2">
                        <div className="font-bold text-slate-900 flex items-center gap-2">
                          <Info className="h-4 w-4 text-indigo-600" />
                          Alasan Kebutuhan AI untuk {row.ingredient_name}:
                        </div>
                        <p className="text-slate-600 leading-relaxed bg-white p-3 rounded-xl border border-slate-200">
                          {row.reason}
                        </p>
                      </div>
                    );
                  })()}
                </div>
              </div>
            </>
          ) : null}
        </div>

        {/* Footer Actions */}
        <DialogFooter className="bg-white p-4 border-t border-slate-200 flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrint}
              disabled={loading || !selectedCount}
              className="h-10 px-3.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold flex items-center gap-1.5 disabled:opacity-50"
            >
              <Printer className="h-4 w-4" /> Cetak
            </button>
            <button
              type="button"
              onClick={handleShareWhatsApp}
              disabled={loading || !selectedCount}
              className="h-10 px-3.5 rounded-xl bg-[#25D366] hover:bg-[#1EBE5B] text-white text-xs font-bold flex items-center gap-1.5 disabled:opacity-50"
            >
              <MessageCircle className="h-4 w-4" /> Bagikan WA
            </button>
          </div>

          <div className="flex items-center gap-2">
            {onApplyToBulkPurchase && (
              <button
                type="button"
                onClick={handleApplyBulkPurchase}
                disabled={loading || !selectedCount}
                className="h-10 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold flex items-center gap-1.5 disabled:opacity-50"
              >
                <PackagePlus className="h-4 w-4 text-amber-400" /> Input ke Pembelian Massal
              </button>
            )}
            <button
              type="button"
              onClick={handleApplyShoppingList}
              disabled={loading || !selectedCount || applying}
              className="h-10 px-5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white text-xs font-black flex items-center gap-2 shadow-md shadow-indigo-200 disabled:opacity-50"
            >
              {applying ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ShoppingCart className="h-4 w-4" />
              )}
              Terapkan ke Daftar Belanja ({selectedCount})
            </button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
