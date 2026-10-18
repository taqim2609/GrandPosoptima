import { useEffect, useState, useMemo } from "react";
import api, { apiError } from "@/lib/api";
import { toast } from "sonner";
import {
  ClipboardCheck,
  Utensils,
  Search,
  AlertTriangle,
  RotateCcw,
  Save,
  Plus,
  Minus,
  Boxes,
  Store,
  Check,
  Loader2,
  Clock,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

const REASONS = [
  { id: "masak", label: "Masak Dapur (Produksi)" },
  { id: "waste", label: "Rusak / Basi (Waste)" },
  { id: "sample", label: "Uji Resep / Menu" },
];

export default function QuickStockManager({ onUpdated }) {
  const [mode, setMode] = useState("opname"); // 'opname' | 'usage'
  const [loading, setLoading] = useState(true);
  const [ingredients, setIngredients] = useState([]);
  const [vendorProducts, setVendorProducts] = useState([]);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all"); // 'all' | 'ingredient' | 'vendor'
  const [onlyLowStock, setOnlyLowStock] = useState(false);

  // Draft state for Opname: { [itemId]: { counted_stock, note } }
  const [opnameDraft, setOpnameDraft] = useState({});

  // Draft state for Usage: { [ingredientId]: { qty, reason, note } }
  const [usageDraft, setUsageDraft] = useState({});

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [usageHistory, setUsageHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const [resIng, resProd] = await Promise.all([
        api.get("/ingredients"),
        api.get("/products", { params: { type: "vendor" } }),
      ]);
      setIngredients(Array.isArray(resIng.data) ? resIng.data : []);
      setVendorProducts(Array.isArray(resProd.data) ? resProd.data : []);
    } catch (e) {
      toast.error(apiError(e.response?.data?.detail || "Gagal memuat daftar stok"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Flattened items for Opname
  const unifiedItems = useMemo(() => {
    const list = [];
    ingredients.forEach((ing) => {
      list.push({
        id: ing.id,
        type: "ingredient",
        name: ing.name,
        unit: ing.unit || "unit",
        category_label: ing.category_names?.join(", ") || "Bahan Dapur",
        current_stock: Number(ing.stock || 0),
        min_stock: Number(ing.min_stock || 0),
        is_low: Number(ing.stock || 0) <= Number(ing.min_stock || 0),
      });
    });
    vendorProducts.forEach((prod) => {
      list.push({
        id: prod.id,
        type: "vendor",
        name: prod.name,
        unit: prod.weight_unit || "pcs",
        category_label: prod.vendor_name ? `Titipan: ${prod.vendor_name}` : "Titipan Vendor",
        current_stock: Number(prod.stock || 0),
        min_stock: Number(prod.min_stock || 0),
        is_low: Number(prod.stock || 0) <= Number(prod.min_stock || 0),
      });
    });
    return list;
  }, [ingredients, vendorProducts]);

  // Filtered items based on Mode, Search, TypeFilter, OnlyLowStock
  const displayedItems = useMemo(() => {
    const q = search.trim().toLowerCase();

    if (mode === "usage") {
      // Only ingredients in usage mode
      return ingredients
        .filter((ing) => {
          if (q) {
            const matchName = (ing.name || "").toLowerCase().includes(q);
            const matchCat = (ing.category_names || []).some((c) => c.toLowerCase().includes(q));
            if (!matchName && !matchCat) return false;
          }
          if (onlyLowStock) {
            return Number(ing.stock || 0) <= Number(ing.min_stock || 0);
          }
          return true;
        })
        .map((ing) => ({
          id: ing.id,
          type: "ingredient",
          name: ing.name,
          unit: ing.unit || "unit",
          category_label: ing.category_names?.join(", ") || "Bahan Dapur",
          current_stock: Number(ing.stock || 0),
          min_stock: Number(ing.min_stock || 0),
          is_low: Number(ing.stock || 0) <= Number(ing.min_stock || 0),
        }));
    }

    return unifiedItems.filter((item) => {
      if (typeFilter !== "all" && item.type !== typeFilter) return false;
      if (onlyLowStock && !item.is_low) return false;
      if (q) {
        const matchName = item.name.toLowerCase().includes(q);
        const matchCat = item.category_label.toLowerCase().includes(q);
        if (!matchName && !matchCat) return false;
      }
      return true;
    });
  }, [mode, unifiedItems, ingredients, search, typeFilter, onlyLowStock]);

  // Handle Opname Inputs
  const handleOpnameChange = (id, countedVal) => {
    setOpnameDraft((prev) => {
      if (countedVal === "" || countedVal === null) {
        const copy = { ...prev };
        delete copy[id];
        return copy;
      }
      const num = Number(countedVal);
      if (isNaN(num) || num < 0) return prev;
      return {
        ...prev,
        [id]: {
          counted_stock: num,
          note: prev[id]?.note || "",
        },
      };
    });
  };

  const stepOpname = (item, delta) => {
    const current = opnameDraft[item.id]?.counted_stock ?? item.current_stock;
    const nextVal = Math.max(0, Math.round((current + delta) * 100) / 100);
    handleOpnameChange(item.id, nextVal);
  };

  // Handle Usage Inputs
  const handleUsageQtyChange = (id, qtyVal) => {
    setUsageDraft((prev) => {
      if (qtyVal === "" || qtyVal === null || Number(qtyVal) === 0) {
        const copy = { ...prev };
        delete copy[id];
        return copy;
      }
      const num = Number(qtyVal);
      if (isNaN(num) || num <= 0) return prev;
      return {
        ...prev,
        [id]: {
          qty: num,
          reason: prev[id]?.reason || "masak",
          note: prev[id]?.note || "",
        },
      };
    });
  };

  const handleUsageReasonChange = (id, reason) => {
    setUsageDraft((prev) => ({
      ...prev,
      [id]: {
        qty: prev[id]?.qty || 1,
        reason,
        note: prev[id]?.note || "",
      },
    }));
  };

  const stepUsage = (item, delta) => {
    const current = usageDraft[item.id]?.qty || 0;
    const nextVal = Math.max(0, Math.round((current + delta) * 100) / 100);
    handleUsageQtyChange(item.id, nextVal === 0 ? "" : nextVal);
  };

  // Counting changed items
  const opnameChangedCount = Object.keys(opnameDraft).length;
  const usageChangedCount = Object.keys(usageDraft).length;
  const activeChangedCount = mode === "opname" ? opnameChangedCount : usageChangedCount;

  const handleResetDraft = () => {
    if (mode === "opname") {
      setOpnameDraft({});
      toast.info("Perubahan draft cek fisik dibatalkan");
    } else {
      setUsageDraft({});
      toast.info("Perubahan draft pemakaian dibatalkan");
    }
  };

  const handleOpenConfirm = () => {
    if (activeChangedCount === 0) {
      return toast.error("Belum ada angka yang diubah");
    }
    setConfirmOpen(true);
  };

  const handleSaveBulk = async () => {
    setSaving(true);
    try {
      if (mode === "opname") {
        const items = Object.entries(opnameDraft).map(([id, data]) => {
          const itemMeta = unifiedItems.find((it) => it.id === id);
          return {
            id,
            type: itemMeta?.type || "ingredient",
            counted_stock: data.counted_stock,
            note: data.note || "Update cepat stok fisik",
          };
        });

        const res = await api.post("/inventory/bulk-update-stock", { items });
        toast.success(res.data.message || `Berhasil memperbarui stok ${items.length} item`);
        setOpnameDraft({});
      } else {
        const items = Object.entries(usageDraft).map(([id, data]) => {
          return {
            ingredient_id: id,
            qty: data.qty,
            reason: data.reason || "masak",
            note: data.note || "",
          };
        });

        const res = await api.post("/ingredients/usage-bulk", { items });
        toast.success(res.data.message || `Berhasil mencatat penggunaan ${items.length} bahan baku`);
        setUsageDraft({});
      }

      setConfirmOpen(false);
      await loadData();
      if (onUpdated) onUpdated();
    } catch (e) {
      toast.error(apiError(e.response?.data?.detail || "Gagal menyimpan perubahan"));
    } finally {
      setSaving(false);
    }
  };

  const loadHistory = async () => {
    setLoadingHistory(true);
    setHistoryOpen(true);
    try {
      const res = await api.get("/ingredients/usage");
      setUsageHistory(Array.isArray(res.data) ? res.data : []);
    } catch (e) {
      toast.error("Gagal memuat riwayat pemakaian");
    } finally {
      setLoadingHistory(false);
    }
  };

  return (
    <div className="space-y-6" data-testid="quick-stock-manager">
      {/* Top Header / Mode Switcher */}
      <div className="bg-white rounded-2xl border p-5 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-extrabold text-slate-900 flex items-center gap-2">
              <Boxes className="text-rose-600" size={22} />
              Update Cepat Stok &amp; Pemakaian Bahan
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              Perbarui stok fisik aktual atau catat pemakaian dapur secara massal tanpa keluar masuk formulir.
            </p>
          </div>

          {/* Mode Switcher Segmented Control */}
          <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-xl self-start md:self-auto">
            <button
              type="button"
              onClick={() => setMode("opname")}
              className={`h-10 px-4 rounded-lg font-bold text-xs flex items-center gap-2 transition-all ${
                mode === "opname"
                  ? "bg-white text-slate-900 shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <ClipboardCheck size={16} className={mode === "opname" ? "text-rose-600" : ""} />
              Cek Fisik (Opname)
              {opnameChangedCount > 0 && (
                <span className="w-5 h-5 rounded-full bg-rose-600 text-white text-[10px] flex items-center justify-center font-extrabold">
                  {opnameChangedCount}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setMode("usage")}
              className={`h-10 px-4 rounded-lg font-bold text-xs flex items-center gap-2 transition-all ${
                mode === "usage"
                  ? "bg-white text-slate-900 shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <Utensils size={16} className={mode === "usage" ? "text-rose-600" : ""} />
              Catat Pemakaian Dapur
              {usageChangedCount > 0 && (
                <span className="w-5 h-5 rounded-full bg-rose-600 text-white text-[10px] flex items-center justify-center font-extrabold">
                  {usageChangedCount}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Filter Bar */}
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3 mt-5 pt-4 border-t">
          <div className="flex items-center gap-2 flex-1 max-w-md relative">
            <Search size={16} className="absolute left-3.5 text-slate-400 pointer-events-none" />
            <input
              type="text"
              placeholder={
                mode === "opname"
                  ? "Cari nama bahan dapur atau titipan vendor..."
                  : "Cari nama bahan dapur..."
              }
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full h-11 pl-9 pr-3 rounded-xl border bg-slate-50 text-xs font-medium focus:bg-white focus:border-rose-500 outline-none transition-colors"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="absolute right-3 text-xs text-slate-400 hover:text-slate-600 font-bold"
              >
                Reset
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {mode === "opname" && (
              <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl">
                <button
                  type="button"
                  onClick={() => setTypeFilter("all")}
                  className={`h-9 px-3 rounded-lg text-xs font-bold transition-colors ${
                    typeFilter === "all" ? "bg-white text-slate-900 shadow-xs" : "text-slate-600"
                  }`}
                >
                  Semua ({unifiedItems.length})
                </button>
                <button
                  type="button"
                  onClick={() => setTypeFilter("ingredient")}
                  className={`h-9 px-3 rounded-lg text-xs font-bold transition-colors ${
                    typeFilter === "ingredient" ? "bg-white text-slate-900 shadow-xs" : "text-slate-600"
                  }`}
                >
                  Bahan Dapur ({ingredients.length})
                </button>
                <button
                  type="button"
                  onClick={() => setTypeFilter("vendor")}
                  className={`h-9 px-3 rounded-lg text-xs font-bold transition-colors ${
                    typeFilter === "vendor" ? "bg-white text-slate-900 shadow-xs" : "text-slate-600"
                  }`}
                >
                  Titipan Vendor ({vendorProducts.length})
                </button>
              </div>
            )}

            <button
              type="button"
              onClick={() => setOnlyLowStock(!onlyLowStock)}
              className={`h-11 px-3.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition-colors ${
                onlyLowStock
                  ? "bg-rose-50 border-rose-300 text-rose-700"
                  : "bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              <AlertTriangle size={15} className={onlyLowStock ? "text-rose-600" : "text-amber-500"} />
              Hanya Stok Menipis
            </button>

            {mode === "usage" && (
              <button
                type="button"
                onClick={loadHistory}
                className="h-11 px-3.5 rounded-xl border bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold flex items-center gap-1.5"
              >
                <Clock size={15} className="text-slate-500" />
                Riwayat Pemakaian
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Main Table Card */}
      <div className="bg-white rounded-2xl border shadow-xs overflow-hidden">
        {loading ? (
          <div className="p-16 text-center text-slate-400">
            <Loader2 className="mx-auto animate-spin mb-3 text-rose-600" size={32} />
            <p className="text-xs font-bold">Memuat daftar bahan dan produk titipan...</p>
          </div>
        ) : displayedItems.length === 0 ? (
          <div className="p-16 text-center text-slate-400">
            <Boxes className="mx-auto mb-3 text-slate-300" size={40} />
            <p className="text-sm font-bold text-slate-700">Tidak ada item yang sesuai filter</p>
            <p className="text-xs text-slate-400 mt-1">Coba periksa kata kunci pencarian atau ubah filter di atas.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider font-extrabold border-b">
                <tr>
                  <th className="py-3.5 px-4">Nama Item</th>
                  <th className="py-3.5 px-3">Tipe / Kategori</th>
                  <th className="py-3.5 px-3 text-right">Stok Sistem</th>
                  {mode === "opname" ? (
                    <>
                      <th className="py-3.5 px-4 text-center w-56">Stok Fisik Dihitung</th>
                      <th className="py-3.5 px-4 text-right">Selisih</th>
                    </>
                  ) : (
                    <>
                      <th className="py-3.5 px-4 text-center w-48">Jumlah Dipakai</th>
                      <th className="py-3.5 px-3 w-52">Alasan Pemakaian</th>
                      <th className="py-3.5 px-4 text-right">Sisa Stok</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {displayedItems.map((item) => {
                  const isOpnameDrafted = opnameDraft[item.id] !== undefined;
                  const isUsageDrafted = usageDraft[item.id] !== undefined;
                  const isHighlighted = mode === "opname" ? isOpnameDrafted : isUsageDrafted;

                  return (
                    <tr
                      key={item.id}
                      className={`transition-colors ${
                        isHighlighted ? "bg-amber-50/50" : "hover:bg-slate-50/80"
                      }`}
                    >
                      {/* Name & Unit */}
                      <td className="py-3.5 px-4">
                        <div className="font-extrabold text-slate-900 text-sm flex items-center gap-2">
                          {item.type === "vendor" ? (
                            <Store size={15} className="text-sky-600 shrink-0" />
                          ) : (
                            <Boxes size={15} className="text-rose-600 shrink-0" />
                          )}
                          <span>{item.name}</span>
                        </div>
                        <div className="text-[11px] text-slate-400 mt-0.5">
                          Satuan {item.unit}
                          {item.min_stock > 0 && ` · Min. ${item.min_stock} ${item.unit}`}
                        </div>
                      </td>

                      {/* Category / Vendor */}
                      <td className="py-3.5 px-3 text-slate-600">
                        <span className="font-medium">{item.category_label}</span>
                      </td>

                      {/* Current Stock */}
                      <td className="py-3.5 px-3 text-right">
                        <span
                          className={`font-mono text-sm font-extrabold ${
                            item.is_low ? "text-rose-600" : "text-slate-800"
                          }`}
                        >
                          {item.current_stock}
                        </span>{" "}
                        <span className="text-[11px] text-slate-400">{item.unit}</span>
                      </td>

                      {/* Mode A: Opname Inputs */}
                      {mode === "opname" && (
                        <>
                          <td className="py-3.5 px-4">
                            <div className="flex items-center justify-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => stepOpname(item, -1)}
                                className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center font-bold transition-colors"
                                title="Kurangi 1"
                              >
                                <Minus size={13} />
                              </button>

                              <input
                                type="number"
                                min="0"
                                step="any"
                                value={opnameDraft[item.id]?.counted_stock ?? ""}
                                placeholder={String(item.current_stock)}
                                onChange={(e) => handleOpnameChange(item.id, e.target.value)}
                                className="w-24 h-9 rounded-lg border text-center font-mono font-extrabold text-sm bg-white focus:border-rose-500 focus:ring-1 focus:ring-rose-500 outline-none"
                              />

                              <button
                                type="button"
                                onClick={() => stepOpname(item, 1)}
                                className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center font-bold transition-colors"
                                title="Tambah 1"
                              >
                                <Plus size={13} />
                              </button>

                              <button
                                type="button"
                                onClick={() => stepOpname(item, 5)}
                                className="h-8 px-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-bold transition-colors"
                                title="Tambah 5"
                              >
                                +5
                              </button>
                            </div>
                          </td>

                          {/* Difference Indicator */}
                          <td className="py-3.5 px-4 text-right">
                            {isOpnameDrafted ? (
                              (() => {
                                const diff =
                                  Math.round(
                                    (opnameDraft[item.id].counted_stock - item.current_stock) * 100
                                  ) / 100;
                                if (diff > 0) {
                                  return (
                                    <span className="font-mono font-extrabold text-emerald-600 text-sm">
                                      +{diff} {item.unit}
                                    </span>
                                  );
                                }
                                if (diff < 0) {
                                  return (
                                    <span className="font-mono font-extrabold text-rose-600 text-sm">
                                      {diff} {item.unit}
                                    </span>
                                  );
                                }
                                return (
                                  <span className="font-mono font-bold text-slate-400 text-xs">
                                    0 (Sama)
                                  </span>
                                );
                              })()
                            ) : (
                              <span className="text-slate-300 font-mono text-xs">-</span>
                            )}
                          </td>
                        </>
                      )}

                      {/* Mode B: Usage Inputs */}
                      {mode === "usage" && (
                        <>
                          <td className="py-3.5 px-4">
                            <div className="flex items-center justify-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => stepUsage(item, -1)}
                                className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center font-bold transition-colors"
                                title="Kurangi 1"
                              >
                                <Minus size={13} />
                              </button>

                              <input
                                type="number"
                                min="0"
                                step="any"
                                value={usageDraft[item.id]?.qty ?? ""}
                                placeholder="0"
                                onChange={(e) => handleUsageQtyChange(item.id, e.target.value)}
                                className="w-20 h-9 rounded-lg border text-center font-mono font-extrabold text-sm bg-white focus:border-rose-500 focus:ring-1 focus:ring-rose-500 outline-none"
                              />

                              <button
                                type="button"
                                onClick={() => stepUsage(item, 1)}
                                className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center font-bold transition-colors"
                                title="Tambah 1"
                              >
                                <Plus size={13} />
                              </button>

                              <button
                                type="button"
                                onClick={() => stepUsage(item, 5)}
                                className="h-8 px-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-bold transition-colors"
                                title="Tambah 5"
                              >
                                +5
                              </button>
                            </div>
                          </td>

                          {/* Reason Selector */}
                          <td className="py-3.5 px-3">
                            <select
                              value={usageDraft[item.id]?.reason || "masak"}
                              onChange={(e) => handleUsageReasonChange(item.id, e.target.value)}
                              disabled={!isUsageDrafted}
                              className={`w-full h-9 rounded-lg border px-2.5 text-xs font-semibold outline-none transition-colors ${
                                isUsageDrafted
                                  ? "bg-white text-slate-900 border-slate-300 focus:border-rose-500"
                                  : "bg-slate-50 text-slate-400 border-slate-200"
                              }`}
                            >
                              {REASONS.map((r) => (
                                <option key={r.id} value={r.id}>
                                  {r.label}
                                </option>
                              ))}
                            </select>
                          </td>

                          {/* Remaining Stock Calculation */}
                          <td className="py-3.5 px-4 text-right">
                            {isUsageDrafted ? (
                              (() => {
                                const used = usageDraft[item.id].qty || 0;
                                const rem =
                                  Math.max(
                                    0,
                                    Math.round((item.current_stock - used) * 100) / 100
                                  );
                                return (
                                  <div className="font-mono">
                                    <span
                                      className={`text-sm font-extrabold ${
                                        rem <= item.min_stock
                                          ? "text-rose-600"
                                          : "text-slate-800"
                                      }`}
                                    >
                                      {rem}
                                    </span>{" "}
                                    <span className="text-[10px] text-slate-400">
                                      (-{used})
                                    </span>
                                  </div>
                                );
                              })()
                            ) : (
                              <span className="text-slate-300 font-mono text-xs">-</span>
                            )}
                          </td>
                        </>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Sticky Bottom Actions Bar when Changes Exist */}
      {activeChangedCount > 0 && (
        <div className="sticky bottom-4 z-20 bg-slate-900 text-white p-4 rounded-2xl shadow-xl flex items-center justify-between gap-4 border border-slate-800">
          <div className="flex items-center gap-3">
            <span className="w-8 h-8 rounded-xl bg-rose-500/20 text-rose-400 border border-rose-500/30 flex items-center justify-center font-extrabold text-xs">
              {activeChangedCount}
            </span>
            <div>
              <div className="text-xs font-extrabold">
                {activeChangedCount} item siap disimpan ke database
              </div>
              <div className="text-[11px] text-slate-400">
                {mode === "opname"
                  ? "Pembaruan angka stok fisik opname"
                  : "Pencatatan pemakaian bahan dapur"}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleResetDraft}
              className="h-10 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs flex items-center gap-1.5 transition-colors"
            >
              <RotateCcw size={14} />
              Batal
            </button>

            <button
              type="button"
              onClick={handleOpenConfirm}
              className="h-10 px-5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-extrabold text-xs flex items-center gap-2 shadow-xs transition-colors"
            >
              <Save size={15} />
              Simpan Semua Perubahan ({activeChangedCount})
            </button>
          </div>
        </div>
      )}

      {/* Confirmation Dialog */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-base font-extrabold flex items-center gap-2">
              <ClipboardCheck className="text-rose-600" size={18} />
              Konfirmasi Simpan {mode === "opname" ? "Stok Fisik" : "Pemakaian Bahan"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3 py-2 text-xs">
            <p className="text-slate-600">
              Apakah Anda yakin ingin menyimpan perubahan berikut ke sistem POS?
            </p>

            <div className="max-h-56 overflow-y-auto border rounded-xl divide-y bg-slate-50">
              {mode === "opname"
                ? Object.entries(opnameDraft).map(([id, d]) => {
                    const it = unifiedItems.find((x) => x.id === id);
                    const diff = Math.round((d.counted_stock - (it?.current_stock || 0)) * 100) / 100;
                    return (
                      <div key={id} className="p-2.5 flex items-center justify-between">
                        <div>
                          <div className="font-bold text-slate-900">{it?.name || id}</div>
                          <div className="text-[11px] text-slate-500">
                            Stok lama: {it?.current_stock} {it?.unit}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-mono font-extrabold text-slate-900">
                            {d.counted_stock} {it?.unit}
                          </div>
                          <div
                            className={`text-[10px] font-bold ${
                              diff > 0
                                ? "text-emerald-600"
                                : diff < 0
                                ? "text-rose-600"
                                : "text-slate-400"
                            }`}
                          >
                            {diff > 0 ? `+${diff}` : diff}
                          </div>
                        </div>
                      </div>
                    );
                  })
                : Object.entries(usageDraft).map(([id, d]) => {
                    const it = ingredients.find((x) => x.id === id);
                    const reasonObj = REASONS.find((r) => r.id === d.reason);
                    return (
                      <div key={id} className="p-2.5 flex items-center justify-between">
                        <div>
                          <div className="font-bold text-slate-900">{it?.name || id}</div>
                          <div className="text-[11px] text-slate-500">
                            Alasan: {reasonObj?.label || d.reason}
                          </div>
                        </div>
                        <div className="text-right font-mono font-extrabold text-rose-600">
                          -{d.qty} {it?.unit || "unit"}
                        </div>
                      </div>
                    );
                  })}
            </div>
          </div>

          <DialogFooter className="flex gap-2">
            <button
              type="button"
              disabled={saving}
              onClick={() => setConfirmOpen(false)}
              className="h-10 px-4 rounded-xl border bg-white font-bold text-xs text-slate-700 hover:bg-slate-50"
            >
              Batal
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={handleSaveBulk}
              className="h-10 px-5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-extrabold text-xs flex items-center gap-2 shadow-xs disabled:opacity-50"
            >
              {saving ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
              Ya, Simpan ke Sistem
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Usage History Dialog */}
      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="text-base font-extrabold flex items-center gap-2">
              <Clock className="text-slate-700" size={18} />
              Riwayat Penggunaan Bahan Baku Dapur
            </DialogTitle>
          </DialogHeader>

          <div className="py-2">
            {loadingHistory ? (
              <div className="p-8 text-center text-slate-400">
                <Loader2 className="mx-auto animate-spin mb-2" size={24} />
                <span className="text-xs">Memuat riwayat pemakaian...</span>
              </div>
            ) : usageHistory.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-xs">
                Belum ada riwayat pemakaian bahan yang dicatat.
              </div>
            ) : (
              <div className="max-h-80 overflow-y-auto divide-y border rounded-xl text-xs">
                {usageHistory.map((h) => {
                  const reasonObj = REASONS.find((r) => r.id === h.reason);
                  const dt = h.created_at ? new Date(h.created_at).toLocaleString("id-ID") : "-";
                  return (
                    <div key={h.id} className="p-3 flex items-center justify-between">
                      <div>
                        <div className="font-bold text-slate-900">{h.ingredient_name}</div>
                        <div className="text-[11px] text-slate-500 mt-0.5">
                          {reasonObj?.label || h.reason} {h.note ? `· ${h.note}` : ""}
                        </div>
                        <div className="text-[10px] text-slate-400 mt-0.5">{dt}</div>
                      </div>
                      <div className="text-right">
                        <div className="font-mono font-extrabold text-rose-600 text-sm">
                          -{h.qty} {h.unit}
                        </div>
                        <div className="text-[10px] text-slate-400">
                          Sisa: {h.new_stock} {h.unit}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
