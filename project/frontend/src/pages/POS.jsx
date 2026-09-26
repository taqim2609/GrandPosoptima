import { useEffect, useMemo, useState, useCallback, memo } from "react";
import { useNavigate } from "react-router-dom";
import api, { apiError } from "@/lib/api";
import { rupiah } from "@/lib/format";
import { printReceipt } from "@/lib/receipt";
import { getDeviceConfig, setDeviceConfig, getPrinterStatus } from "@/lib/device";
import { bizCache, loadBusiness } from "@/lib/business";
import { useUI, posLabel } from "@/lib/ui";
import { useOffline } from "@/context/OfflineContext";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { syncOrderToFirestore } from "@/lib/firebase";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import VoidDialog from "@/components/VoidDialog";
import LazyProductImage from "@/components/LazyProductImage";
import ReceiptModal from "@/components/ReceiptModal";
import PosAiChatWidget from "@/components/PosAiChatWidget";
import {
  Utensils, ShoppingBag, Store, Plus, Minus, Trash2, Armchair,
  Search, Receipt, X, CheckCircle2, Layers, Database, ScanLine, Clock, Play, Printer, Wifi, WifiOff, RefreshCw, CloudOff,
  ShoppingCart, ChevronUp, ChevronDown, Lock, ArrowRight, Wallet, LayoutDashboard, Zap,
  ArrowRightLeft, RotateCcw, AlertTriangle, MessageCircle, Copy, Check, Send, Sparkles, Share2,
  Coins, Banknote, ArrowDownRight,
} from "lucide-react";

const ORDER_TYPES = [
  { key: "dine_in", label: "Dine-In", icon: Utensils, cls: "ot-dine_in" },
  { key: "take_away", label: "Take Away", icon: ShoppingBag, cls: "ot-take_away" },
  { key: "retail", label: "Retail", icon: Store, cls: "ot-retail" },
];

/* ==========================================================================
   Memoized Sub-Components for High Performance POS on Android / Sunmi T2
   ========================================================================== */

const ProductCard = memo(function ProductCard({ product, onAdd, priority = false }) {
  const out = product.sold_out || (product.track_stock && product.stock <= 0);
  const handleClick = useCallback(() => {
    if (!out) onAdd(product);
  }, [out, onAdd, product]);

  return (
    <button
      data-testid={`product-card-${product.id}`}
      onClick={handleClick}
      disabled={out}
      className={`tap relative text-left rounded-xl border bg-white overflow-hidden hover:border-[#E63946] ${
        out ? "opacity-50 cursor-not-allowed" : ""
      }`}
    >
      <div className="h-24 bg-[#F4F5F7] overflow-hidden">
        <LazyProductImage
          src={product.image}
          alt={product.name}
          className="h-full w-full object-cover"
          placeholderIcon={Store}
          iconSize={28}
          priority={priority}
        />
      </div>
      {out && (
        <span className="absolute top-2 left-2 bg-[#EF4444] text-white text-[10px] font-bold px-2 py-0.5 rounded">
          SOLD OUT
        </span>
      )}
      <div className="p-3">
        <div className="font-bold text-sm leading-tight line-clamp-2 min-h-[2.3em]">{product.name}</div>
        <div className="font-num text-[#E63946] font-bold mt-1">
          {rupiah(product.price)}
          {product.weight_sale ? (
            <span className="text-[10px] text-[#52525B] font-bold ml-1">/{product.weight_unit || "satuan"}</span>
          ) : null}
        </div>
        {product.track_stock && <div className="text-[11px] text-[#52525B]">Stok: {product.stock}</div>}
      </div>
    </button>
  );
});

const ProductGrid = memo(function ProductGrid({ products = [], onAdd }) {
  const safeProducts = Array.isArray(products) ? products : [];
  if (safeProducts.length === 0) {
    return <div className="text-center text-[#a1a1aa] mt-20">Tidak ada produk</div>;
  }
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-3">
      {safeProducts.map((p, idx) => (
        <ProductCard key={p.id} product={p} onAdd={onAdd} priority={idx < 8} />
      ))}
    </div>
  );
});

const CartItemRow = memo(function CartItemRow({ item, onMinus, onPlus, onRemove }) {
  return (
    <div data-testid={`cart-item-${item.product_id}`} className="rounded-xl border p-2.5 bg-white shadow-xs">
      <div className="flex justify-between gap-2">
        <div className="font-bold text-sm leading-tight">
          {item.name}
          {item.weight ? (
            <span className="block text-[11px] text-[#52525B] font-normal">
              {Number(item.weight).toFixed(2)} {item.weight_unit} × {rupiah(item.base_price || item.price)}
            </span>
          ) : null}
        </div>
        <button onClick={() => onRemove(item.product_id)} className="text-[#a1a1aa] hover:text-[#EF4444] p-1">
          <X size={16} />
        </button>
      </div>
      <div className="flex items-center justify-between mt-2">
        <div className="flex items-center gap-2">
          <button
            data-testid={`qty-minus-${item.product_id}`}
            onClick={() => onMinus(item.product_id)}
            className="tap h-8 w-8 rounded-lg bg-[#F4F5F7] hover:bg-[#e4e4e7] grid place-items-center"
          >
            <Minus size={15} />
          </button>
          <span className="font-num font-bold min-w-6 text-center">{item.qty}</span>
          <button
            data-testid={`qty-plus-${item.product_id}`}
            onClick={() => onPlus(item.product_id)}
            className="tap h-8 w-8 rounded-lg bg-[#F4F5F7] hover:bg-[#e4e4e7] grid place-items-center"
          >
            <Plus size={15} />
          </button>
        </div>
        <div className="font-num font-bold">{rupiah(item.price * item.qty)}</div>
      </div>
    </div>
  );
});

const CategorySidebar = memo(function CategorySidebar({ categories = [], activeCat, onSelectCat }) {
  const safeCats = Array.isArray(categories) ? categories : [];
  return (
    <>
      {/* Desktop / Landscape: Sidebar Vertikal Kiri */}
      <div className="hidden lg:block w-[190px] shrink-0 bg-white border-r overflow-y-auto no-scrollbar p-3 space-y-1.5">
        <button
          onClick={() => onSelectCat("all")}
          className={`tap w-full h-12 rounded-xl px-3 text-left font-bold text-sm flex items-center gap-2 transition-colors ${
            activeCat === "all" ? "bg-[#E63946] text-white" : "bg-[#F4F5F7] hover:bg-[#e9eaee] text-[#18181B]"
          }`}
        >
          <Layers size={16} /> Semua
        </button>
        {safeCats.map((c) => (
          <button
            key={c.id}
            data-testid={`cat-${c.id}`}
            onClick={() => onSelectCat(c.id)}
            className={`tap w-full min-h-12 rounded-xl px-3 py-2 text-left font-bold text-sm transition-colors ${
              activeCat === c.id ? "bg-[#E63946] text-white" : "bg-[#F4F5F7] hover:bg-[#e9eaee] text-[#18181B]"
            }`}
          >
            {c.name}
          </button>
        ))}
      </div>

      {/* Mobile / Android Portrait: Horizontal Category Scroll Bar */}
      <div className="lg:hidden flex items-center gap-2 overflow-x-auto no-scrollbar px-3 py-2 bg-white border-b shrink-0">
        <button
          onClick={() => onSelectCat("all")}
          className={`tap shrink-0 h-9 px-4 rounded-full font-bold text-xs flex items-center gap-1.5 border transition-all ${
            activeCat === "all"
              ? "bg-[#E63946] text-white border-[#E63946] shadow-xs"
              : "bg-[#F4F5F7] text-[#52525B] border-transparent hover:bg-[#e9eaee]"
          }`}
        >
          <Layers size={14} /> Semua
        </button>
        {safeCats.map((c) => (
          <button
            key={c.id}
            data-testid={`cat-chip-${c.id}`}
            onClick={() => onSelectCat(c.id)}
            className={`tap shrink-0 h-9 px-4 rounded-full font-bold text-xs border whitespace-nowrap transition-all ${
              activeCat === c.id
                ? "bg-[#E63946] text-white border-[#E63946] shadow-xs"
                : "bg-[#F4F5F7] text-[#52525B] border-transparent hover:bg-[#e9eaee]"
            }`}
          >
            {c.name}
          </button>
        ))}
      </div>
    </>
  );
});

export default function POS() {
  const { user } = useAuth();
  const nav = useNavigate();
  const { online, addPending, pendingCount, syncing, syncNow } = useOffline();
  const printerStatus = getPrinterStatus();
  // Mode offline (offline-first) per perangkat — default MATI. Saat mati & server tidak
  // terjangkau, POS diblokir total sampai koneksi normal (lihat gate render di bawah).
  const offlineEnabled = !!getDeviceConfig().offlineMode;
  const [serverDown, setServerDown] = useState(false);
  const [biz, setBiz] = useState(bizCache());
  const [orderType, setOrderType] = useState("take_away");
  const ui = useUI();

  // Instant SWR First-Paint Initializer: Baca cache secara sinkron supaya render frame 1 (0ms) langsung tampil lengkap
  const initialCache = useMemo(() => {
    try {
      const raw = localStorage.getItem("gak_pos_cache");
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }, []);

  const [products, setProducts] = useState(() => initialCache?.products || []);
  const [categories, setCategories] = useState(() => initialCache?.categories || []);
  const [tables, setTables] = useState(() => initialCache?.tables || []);
  const [pms, setPms] = useState(() => initialCache?.pms || []);
  const [activeCat, setActiveCat] = useState("all");
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState([]);
  const [table, setTable] = useState(null);
  const [currentOrderId, setCurrentOrderId] = useState(null);
  const [discType, setDiscType] = useState("none");
  const [discVal, setDiscVal] = useState(0);
  const [payOpen, setPayOpen] = useState(false);
  const [tableOpen, setTableOpen] = useState(false);
  const [moveTableOpen, setMoveTableOpen] = useState(false);
  const [moveSourceTable, setMoveSourceTable] = useState(null);
  const [receipt, setReceipt] = useState(null);
  const [cacheAt, setCacheAt] = useState(() => localStorage.getItem("gak_pos_cache_at"));
  const [shift, setShift] = useState(undefined);
  const [openingCash, setOpeningCash] = useState("");
  const [openingCashRetail, setOpeningCashRetail] = useState("");
  const [openingShiftLoading, setOpeningShiftLoading] = useState(false);
  // Bill terbuka (dine-in) yang sedang dibatalkan lewat VoidDialog
  const [voidBill, setVoidBill] = useState(null);
  const [mobileCartOpen, setMobileCartOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const [p, c, t, m] = await Promise.all([
        api.get("/products", { params: { active_only: true } }),
        api.get("/categories", { params: { include_inactive: false } }),
        api.get("/tables"),
        api.get("/payment-methods"),
      ]);
      const cached = { products: p.data, categories: c.data, tables: t.data, pms: m.data.filter((x) => x.active) };
      localStorage.setItem("gak_pos_cache", JSON.stringify(cached));
      const at = new Date().toISOString();
      localStorage.setItem("gak_pos_cache_at", at);
      setCacheAt(at);
      setProducts(cached.products);
      setCategories(cached.categories);
      setTables(cached.tables);
      setPms(cached.pms);
    } catch (e) {
      const cache = JSON.parse(localStorage.getItem("gak_pos_cache") || "null");
      if (getDeviceConfig().offlineMode && cache) {
        setProducts(cache.products);
        setCategories(cache.categories);
        setTables(cache.tables);
        setPms(cache.pms);
        toast.info("Mode offline: memakai data produk tersimpan");
      } else {
        // Mode offline mati — POS tidak boleh dipakai tanpa server
        setServerDown(true);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only stable refs (api/setters/toast) used
  }, []);

  useEffect(() => { load(); }, [load]);

  // Pengaturan aplikasi (service tax, nilai tukar poin, ambang alasan diskon)
  useEffect(() => { loadBusiness().then(setBiz); }, []);

  // Auto-refresh cached master data (stock/prices) after offline orders finish uploading
  useEffect(() => {
    const onSynced = () => load();
    window.addEventListener("gak-synced", onSynced);
    return () => window.removeEventListener("gak-synced", onSynced);
  }, [load]);

  // Shift gate: POS is only usable after opening a shift (offline is allowed).
  useEffect(() => {
    api.get("/shifts/current")
      .then((r) => {
        if (r.data && r.data.id && r.data.status !== "closed") {
          setShift(r.data);
        } else {
          setShift(null);
        }
      })
      .catch(() => {
        if (getDeviceConfig().offlineMode) {
          setShift({ offline: true });
        } else {
          setServerDown(true); // mode offline mati -> blokir sampai server normal
        }
      });
  }, []);

  const relevantTypes = useMemo(() => {
    return orderType === "retail" ? ["retail"] : ["makanan", "minuman", "vendor"];
  }, [orderType]);
  const cats = useMemo(() => {
    return (categories || []).filter((c) => relevantTypes.includes(c.type));
  }, [categories, relevantTypes]);

  const quickKeyProducts = useMemo(() => {
    if (!products || products.length === 0) return [];
    const popularKeywords = ["mie aceh", "teh tarik", "kopi", "canai", "ayam tangkap", "timun"];
    const matches = [];
    popularKeywords.forEach(keyword => {
      const found = products.find(p => p && p.active && p.name?.toLowerCase().includes(keyword) && relevantTypes.includes(p.type));
      if (found && !matches.some(m => m.id === found.id)) matches.push(found);
    });
    let idx = 0;
    while (matches.length < 6 && idx < products.length) {
      const p = products[idx];
      if (p && p.active && relevantTypes.includes(p.type) && !matches.some(m => m.id === p.id)) {
        matches.push(p);
      }
      idx++;
    }
    return matches.slice(0, 6);
  }, [products, relevantTypes]);

  const visibleProducts = useMemo(() => {
    const q = (search || "").trim().toLowerCase();
    return (products || []).filter((p) => {
      if (!p) return false;
      if (!relevantTypes.includes(p.type)) return false;
      if (activeCat !== "all" && p.category_id !== activeCat) return false;
      if (!q) return true;
      const matchName = p.name?.toLowerCase().includes(q);
      const matchSku = (p.sku || "").toLowerCase().includes(q);
      const matchBarcode = (p.barcode || "").toLowerCase().includes(q);
      return matchName || matchSku || matchBarcode;
    });
  }, [products, relevantTypes, activeCat, search]);

  const subtotal = useMemo(() => {
    return (cart || []).reduce((s, i) => s + (i.price || 0) * (i.qty || 0), 0);
  }, [cart]);
  const discount =
    discType === "percent" ? Math.round((subtotal * discVal) / 100)
    : discType === "amount" ? Math.min(discVal, subtotal) : 0;
  // Pajak layanan opsional (pengaturan aplikasi) — dibebankan di atas total bersih.
  const svcRate = Math.max(0, Number(biz?.service_tax_percent || 0));
  const baseTotal = Math.max(0, subtotal - discount);
  const service = svcRate > 0 ? Math.round(baseTotal * svcRate) / 100 : 0;
  const total = Math.round((baseTotal + service) * 100) / 100;

  const resetSale = useCallback(() => {
    setCart([]); setTable(null); setCurrentOrderId(null);
    setDiscType("none"); setDiscVal(0);
  }, []);

  // Cetak BILL SEMENTARA (struk pratinjau tanpa pembayaran) — untuk dine-in/open bill.
  const printInterimBill = () => {
    if (!cart.length) return toast.error("Keranjang kosong");
    setDeviceConfig(getDeviceConfig());
    let cashier = "-";
    try { cashier = JSON.parse(localStorage.getItem("gak_user") || "{}").name || "-"; } catch (e) {}
    printReceipt({
      order_number: currentOrderId ? `BILL-${currentOrderId.slice(-6)}` : `BILL-${Date.now().toString().slice(-8)}`,
      order_type: orderType,
      items: cart,
      subtotal,
      discount,
      total,
      cashier_name: cashier,
      note: "BILL SEMENTARA",
      created_at: new Date().toISOString(),
    });
    toast.success("Bill sementara dicetak");
  };

  const switchType = useCallback((key) => {
    if (cart.length && !window.confirm("Ganti jenis transaksi akan mengosongkan keranjang. Lanjut?")) return;
    resetSale();
    setActiveCat("all");
    setOrderType(key);
  }, [cart.length, resetSale]);

  const addItem = useCallback((p) => {
    if (p.sold_out) return;
    if (p.type === "retail" && p.track_stock && p.stock <= 0) {
      toast.error("Stok retail habis");
      return;
    }
    // Produk jual per berat -> minta input berat dulu
    if (p.weight_sale) {
      setWeightProduct(p); setWeightVal(""); setWeightOpen(true);
      return;
    }
    setCart((prev) => {
      const ex = prev.find((i) => i.product_id === p.id);
      if (ex) return prev.map((i) => (i.product_id === p.id ? { ...i, qty: i.qty + 1 } : i));
      return [...prev, { product_id: p.id, name: p.name, price: p.price, qty: 1, type: p.type }];
    });
  }, []);
  const [weightOpen, setWeightOpen] = useState(false);
  const [weightProduct, setWeightProduct] = useState(null);
  const [weightVal, setWeightVal] = useState("");
  const confirmWeight = () => {
    const w = Number(weightVal);
    if (!weightProduct) return;
    if (!w || w <= 0) return toast.error("Masukkan berat yang benar");
    setCart((prev) => [...prev, {
      product_id: weightProduct.id, name: weightProduct.name,
      price: Math.round(weightProduct.price * w * 100) / 100,
      qty: 1, type: weightProduct.type,
      weight: w, weight_unit: weightProduct.weight_unit || "ons",
      base_price: weightProduct.price, weight_sale: true,
    }]);
    setWeightOpen(false); setWeightProduct(null); setWeightVal("");
  };
  const changeQty = useCallback((id, d) => {
    setCart((prev) =>
      prev.map((i) => (i.product_id === id ? { ...i, qty: i.qty + d } : i)).filter((i) => i.qty > 0)
    );
  }, []);
  const removeItem = useCallback((id) => {
    setCart((prev) => prev.filter((i) => i.product_id !== id));
  }, []);
  const onMinus = useCallback((id) => changeQty(id, -1), [changeQty]);
  const onPlus = useCallback((id) => changeQty(id, 1), [changeQty]);
  const handleSelectCat = useCallback((catId) => setActiveCat(catId), []);

  const openShiftInline = async () => {
    setOpeningShiftLoading(true);
    try {
      // Shift harian bersama: satu tombol membuka F&B & Retail (kas awal terpisah).
      const { data } = await api.post("/shifts/open", {
        opening_cash_fnb: Number(openingCash || 0),
        opening_cash_retail: Number(openingCashRetail || 0),
        user_name: user?.name || "Kasir",
      });
      setShift(data);
      toast.success("Shift hari ini dibuka. POS siap digunakan.");
    } catch (e) {
      toast.error(apiError(e.response?.data?.detail), { duration: 9000 });
    } finally {
      setOpeningShiftLoading(false);
    }
  };
  const handleSearchKeyDown = (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const term = (search || "").trim();
    if (!term) return;

    const termLower = term.toLowerCase();
    // 1. Cek exact match SKU atau barcode
    let matched = (products || []).find(
      (p) =>
        relevantTypes.includes(p.type) &&
        ((p.sku || "").toLowerCase() === termLower || (p.barcode || "").toLowerCase() === termLower)
    );
    // 2. Cek exact match nama
    if (!matched) {
      matched = (products || []).find(
        (p) => relevantTypes.includes(p.type) && p.name?.toLowerCase() === termLower
      );
    }
    // 3. Bila hanya 1 produk yang cocok di daftar hasil pencarian
    if (!matched && visibleProducts.length === 1) {
      matched = visibleProducts[0];
    }

    if (matched) {
      const out = matched.sold_out || (matched.track_stock && matched.stock <= 0);
      if (out) {
        toast.error(`Produk "${matched.name}" habis / sold out`);
      } else {
        addItem(matched);
        setSearch("");
        toast.success(`Ditambahkan: ${matched.name}`);
      }
    } else {
      toast.error(`Produk atau SKU "${term}" tidak ditemukan`);
    }
  };

  const openTablePicker = () => setTableOpen(true);
  const selectTable = async (t) => {
    setTableOpen(false);
    setTable(t);
    if (t.open_order_id) {
      const { data } = await api.get(`/orders/${t.open_order_id}`);
      setCart(data.items);
      setCurrentOrderId(data.id);
      setDiscType(data.discount_type);
      setDiscVal(data.discount_value);
      toast.info(`Open bill ${data.order_number} dimuat`);
    } else {
      setCurrentOrderId(null); // keep items the cashier already added; assign them to this table
    }
  };

  const handleOpenMoveTable = (sourceTbl) => {
    const src = sourceTbl || table;
    if (!src) {
      toast.error("Pilih meja asal terlebih dahulu");
      return;
    }
    setMoveSourceTable(src);
    setMoveTableOpen(true);
  };

  const doMoveTable = async (targetTbl) => {
    if (!targetTbl) return toast.error("Pilih meja tujuan");
    const src = moveSourceTable || table;
    if (!src) return toast.error("Meja asal tidak valid");
    if (src.id === targetTbl.id) return toast.error("Meja tujuan tidak boleh sama dengan meja asal");

    try {
      const res = await api.post("/tables/move", {
        from_table_id: src.id,
        to_table_id: targetTbl.id,
        order_id: currentOrderId || src.open_order_id || null,
      });
      toast.success(res.data?.detail || `Meja berhasil dipindahkan dari ${src.name} ke ${targetTbl.name}`);
      if (table?.id === src.id) {
        setTable(targetTbl);
      }
      setMoveTableOpen(false);
      setMoveSourceTable(null);
      load();
    } catch (e) {
      toast.error(apiError(e.response?.data?.detail));
    }
  };

  const removeTableFromCart = () => {
    if (!table) return;
    if (currentOrderId) {
      if (!window.confirm(`Lepas pilihan meja "${table.name}" dari pesanan aktif ini?`)) return;
    }
    setTable(null);
    toast.info("Pilihan meja dilepas dari transaksi");
  };

  const clearTable = async (t) => {
    if (!t) return;
    if (!window.confirm(`Kosongkan status meja ${t.name}?`)) return;
    try {
      const { data } = await api.post(`/tables/${t.id}/clear`);
      toast.success(data.detail || `Meja ${t.name} berhasil dikosongkan`);
      if (table?.id === t.id) {
        setTable(null);
        setCurrentOrderId(null);
      }
      load();
    } catch (e) {
      toast.error(apiError(e.response?.data?.detail));
    }
  };

  const deleteTable = async (t) => {
    if (!t) return;
    if (!window.confirm(`Hapus permanen meja ${t.name}?`)) return;
    try {
      const { data } = await api.delete(`/tables/${t.id}`);
      toast.success(data.detail || `Meja ${t.name} berhasil dihapus`);
      if (table?.id === t.id) {
        setTable(null);
        setCurrentOrderId(null);
      }
      load();
    } catch (e) {
      toast.error(apiError(e.response?.data?.detail));
    }
  };

  const ensureOrder = async () => {
    if (currentOrderId) {
      await api.patch(`/orders/${currentOrderId}/items`, { items: cart });
      return currentOrderId;
    }
    const { data } = await api.post("/orders", {
      order_type: orderType, table_id: orderType === "dine_in" ? table?.id : null,
      items: cart.map((i) => ({ product_id: i.product_id, qty: i.qty, weight: i.weight || null })),
      discount_type: discType, discount_value: Number(discVal),
    });
    setCurrentOrderId(data.id);
    return data.id;
  };

  const saveOpenBill = async () => {
    if (!cart.length) return toast.error("Keranjang kosong");
    if (!table) return toast.error("Pilih meja dulu");
    try {
      await ensureOrder();
      toast.success(`Open bill tersimpan untuk ${table.name}`);
      resetSale();
      load();
    } catch (e) {
      const msg = apiError(e.response?.data?.detail);
      if (msg.toLowerCase().includes("shift")) setShift(null);
      toast.error(msg);
    }
  };

  const doPay = async (pm, amountPaid, opts = {}) => {
    if (opts.splits && !online) {
      return toast.error("Pembayaran 2 metode hanya bisa dilakukan saat online (struk offline tetap 1 metode).");
    }
    if (!online) {
      if (!getDeviceConfig().offlineMode) {
        return toast.error("Koneksi ke server terputus. Aktifkan Mode Offline di Pengaturan > Perangkat untuk tetap berjualan tanpa koneksi, atau tunggu koneksi normal.");
      }
      if (orderType === "dine_in" || currentOrderId) {
        return toast.error("Mode offline hanya untuk take away & retail (bukan open bill dine-in)");
      }
      const payload = {
        order_type: orderType, table_id: null,
        items: cart.map((i) => ({ product_id: i.product_id, qty: i.qty, weight: i.weight || null })),
        discount_type: discType, discount_value: Number(discVal),
        member_id: opts.member_id || null, redeem_points: Number(opts.redeem_points || 0),
        discount_reason: opts.discount_reason || null, coupon_code: opts.coupon_code || null,
        pay_now: true, payment_method: pm.id,
      };
      addPending(payload, { order_type: orderType, total, item_count: cart.length, preview: cart.map((i) => `${i.qty}x ${i.name}${i.weight ? " (" + Number(i.weight).toFixed(2) + " " + (i.weight_unit||"") + ")" : ""}`).join(", ") });
      const offlineReceipt = {
        order_number: `OFFLINE-${Date.now().toString().slice(-8)}`, order_type: orderType, items: cart,
        subtotal, discount, service_tax: service, total, cashier_name: "(offline)",
        payment_method_name: pm.name, amount_paid: amountPaid || total,
        change: (amountPaid || total) - total, created_at: new Date().toISOString(), offline: true,
      };
      setPayOpen(false);
      setReceipt(offlineReceipt);
      // Auto-print struk (buka laci juga) bila diaktifkan
      if (getDeviceConfig().autoPrint) {
        try { printReceipt(offlineReceipt); } catch (e) {}
      }
      resetSale();
      toast.success("Disimpan offline. Otomatis disinkron saat online kembali.");
      return;
    }
    try {
      let data;
      const payloadItems = cart.map((i) => ({
        product_id: i.product_id || i.id,
        name: i.name,
        price: Number(i.price || 0),
        cost: Number(i.cost || 0),
        qty: Number(i.qty || 1),
        type: i.type || "fnb",
        weight: i.weight || null,
        weight_unit: i.weight_unit || null,
        notes: i.notes || null,
      }));

      if (currentOrderId) {
        // open bill: perbarui item lalu bayar (2 request)
        await ensureOrder();
        const r = await api.post(`/orders/${currentOrderId}/pay`, {
          payment_method: pm.id, discount_type: discType, discount_value: Number(discVal),
          amount_paid: opts.splits ? null : amountPaid,
          member_id: opts.member_id || null, redeem_points: Number(opts.redeem_points || 0),
          discount_reason: opts.discount_reason || null, coupon_code: opts.coupon_code || null,
          splits: opts.splits || null,
        });
        data = r.data;
      } else {
        // transaksi langsung (take-away/retail tanpa open bill): SATU request create+pay
        const r = await api.post("/orders", {
          order_type: orderType, table_id: null,
          items: payloadItems,
          subtotal,
          discount,
          service_tax: service,
          total,
          cashier_name: user?.name || user?.username || "Kasir",
          cashier_id: user?.id,
          payment_method_name: pm.name,
          payment_method_type: pm.type,
          discount_type: discType, discount_value: Number(discVal),
          member_id: opts.member_id || null, redeem_points: Number(opts.redeem_points || 0),
          discount_reason: opts.discount_reason || null, coupon_code: opts.coupon_code || null,
          pay_now: true, payment_method: pm.id,
          amount_paid: opts.splits ? null : amountPaid,
          change: (amountPaid || total) - total,
          splits: opts.splits || null,
        });
        data = r.data;
      }

      const fullReceipt = {
        ...data,
        items: (data?.items && data.items.length && data.items[0]?.name) ? data.items : cart,
        cashier_name: data?.cashier_name || user?.name || user?.username || "Kasir",
        payment_method_name: data?.payment_method_name || pm.name,
        subtotal: data?.subtotal || subtotal,
        discount: data?.discount !== undefined ? data.discount : discount,
        total: data?.total || total,
        amount_paid: data?.amount_paid || amountPaid || total,
        change: data?.change !== undefined ? data.change : Math.max(0, (amountPaid || total) - total),
      };

      setPayOpen(false);
      setReceipt(fullReceipt);
      // Synchronize to Firebase Firestore
      if (fullReceipt) {
        try {
          await syncOrderToFirestore(fullReceipt);
        } catch (fireErr) {
          console.error("[Firestore] Gagal sinkronisasi transaksi ke Firebase:", fireErr);
        }
      }
      // Auto-print struk (buka laci juga) bila diaktifkan
      if (getDeviceConfig().autoPrint) {
        try { printReceipt(fullReceipt); } catch (e) {}
      }
      resetSale();
      load();
      toast.success("Pembayaran berhasil");
    } catch (e) {
      const msg = apiError(e.response?.data?.detail);
      if (msg.toLowerCase().includes("shift")) setShift(null);
      toast.error(msg);
    }
  };

  if (shift === undefined) {
    return <div className="h-screen grid place-items-center"><div className="animate-pulse text-[#E63946] font-bold">Memuat status shift…</div></div>;
  }
  // Mode offline MATI (default): bila server tidak terjangkau / koneksi putus, POS diblokir total.
  if (!offlineEnabled && (serverDown || !online)) {
    return (
      <div className="h-screen grid place-items-center bg-[#F4F5F7] p-6" data-testid="pos-blocked-screen">
        <div className="w-full max-w-md bg-white rounded-2xl border p-7 text-center">
          <div className="h-14 w-14 rounded-2xl bg-[#FEE2E2] grid place-items-center mx-auto mb-4"><WifiOff className="text-[#B91C1C]" /></div>
          <h2 className="text-2xl font-extrabold">Tidak Ada Koneksi ke Server</h2>
          <p className="text-sm text-[#52525B] mt-1 mb-5">
            Mode offline sedang <b>mati</b> — transaksi diblokir sampai koneksi ke server normal kembali.
            <br />Periksa jaringan & pastikan server menyala, lalu coba lagi.
          </p>
          <button data-testid="pos-retry-btn" onClick={() => window.location.reload()}
            className="tap w-full h-12 rounded-xl bg-[#E63946] hover:bg-[#BE123C] text-white font-bold">
            Coba Lagi
          </button>
          <p className="text-[11px] text-[#a1a1aa] mt-4 leading-relaxed">
            Butuh tetap berjualan tanpa koneksi? Aktifkan <b>Mode Offline</b> di Pengaturan → Perangkat, lalu buka kembali halaman ini.
          </p>
        </div>
      </div>
    );
  }
  if (shift === null || !shift.id || shift.status === "closed") {
    return (
      <div className="h-screen grid place-items-center bg-[#F4F5F7] p-4 sm:p-6 overflow-y-auto" data-testid="shift-gate">
        <div className="w-full max-w-lg bg-white rounded-2xl border border-[#E4E4E7] shadow-xl p-6 sm:p-8 text-center my-auto">
          <div className="h-16 w-16 rounded-2xl bg-amber-50 border border-amber-200 grid place-items-center mx-auto mb-4 text-amber-600 shadow-sm">
            <Lock size={30} />
          </div>

          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-100 text-amber-800 text-xs font-bold mb-2">
            <Clock size={13} />
            <span>POS Terkunci — Shift Kasir Belum Dibuka</span>
          </div>

          <h2 className="text-2xl sm:text-3xl font-heading font-extrabold text-[#0A0A0A]">
            Buka Shift Terlebih Dahulu
          </h2>

          <p className="text-sm text-[#52525B] mt-2 mb-5 leading-relaxed">
            Sistem POS kasir tidak dapat digunakan tanpa membuka shift harian.
            Isi kas awal tiap toko di bawah untuk mulai melayani transaksi.
          </p>

          <div className="bg-[#F8F9FA] rounded-xl p-3 border border-[#E4E4E7] text-left mb-5 flex items-center justify-between">
            <div className="text-xs text-[#52525B]">
              <div>Petugas Kasir:</div>
              <div className="font-bold text-sm text-[#0A0A0A]">{user?.name || "Kasir"}</div>
            </div>
            <div className="text-right text-xs text-[#52525B]">
              <div>Tanggal &amp; Waktu:</div>
              <div className="font-mono font-semibold text-xs text-[#0A0A0A]">{new Date().toLocaleDateString("id-ID", { weekday: "short", day: "numeric", month: "short" })}</div>
            </div>
          </div>

          <div className="space-y-4 text-left">
            <div>
              <div className="flex items-center justify-between">
                <label className="text-xs uppercase tracking-wider font-extrabold text-[#52525B] flex items-center gap-1.5">
                  <Utensils size={14} className="text-[#E63946]" />
                  <span>Kas Awal F&amp;B</span>
                </label>
                <span className="text-xs font-mono font-bold text-[#E63946]">
                  {rupiah(Number(openingCash) || 0)}
                </span>
              </div>
              <input
                data-testid="gate-opening-cash"
                type="number"
                value={openingCash}
                onChange={(e) => setOpeningCash(e.target.value)}
                placeholder="0"
                className="w-full h-12 rounded-xl border border-[#E4E4E7] px-3.5 mt-1.5 font-num text-lg focus:ring-2 focus:ring-[#E63946] focus:border-transparent outline-none"
                autoFocus
              />
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                {[0, 50000, 100000, 200000].map((amt) => (
                  <button
                    key={amt}
                    type="button"
                    onClick={() => setOpeningCash(String(amt))}
                    className="tap px-2 py-0.5 rounded-md bg-[#F4F5F7] hover:bg-[#E4E4E7] text-[11px] font-bold text-[#52525B]"
                  >
                    {amt === 0 ? "Rp 0" : rupiah(amt)}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between">
                <label className="text-xs uppercase tracking-wider font-extrabold text-[#52525B] flex items-center gap-1.5">
                  <Store size={14} className="text-[#E63946]" />
                  <span>Kas Awal Retail</span>
                </label>
                <span className="text-xs font-mono font-bold text-[#E63946]">
                  {rupiah(Number(openingCashRetail) || 0)}
                </span>
              </div>
              <input
                data-testid="gate-opening-cash-retail"
                type="number"
                value={openingCashRetail}
                onChange={(e) => setOpeningCashRetail(e.target.value)}
                placeholder="0"
                className="w-full h-12 rounded-xl border border-[#E4E4E7] px-3.5 mt-1.5 font-num text-lg focus:ring-2 focus:ring-[#E63946] focus:border-transparent outline-none"
              />
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                {[0, 50000, 100000, 200000].map((amt) => (
                  <button
                    key={amt}
                    type="button"
                    onClick={() => setOpeningCashRetail(String(amt))}
                    className="tap px-2 py-0.5 rounded-md bg-[#F4F5F7] hover:bg-[#E4E4E7] text-[11px] font-bold text-[#52525B]"
                  >
                    {amt === 0 ? "Rp 0" : rupiah(amt)}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-6 space-y-2.5">
            <button
              data-testid="gate-open-shift-btn"
              onClick={openShiftInline}
              disabled={openingShiftLoading}
              className="tap w-full py-3.5 rounded-xl bg-[#E63946] hover:bg-[#BE123C] text-white font-bold flex items-center justify-center gap-2 shadow-md hover:shadow-lg transition-all disabled:opacity-50 text-base"
            >
              {openingShiftLoading ? (
                <RefreshCw size={18} className="animate-spin" />
              ) : (
                <Play size={18} />
              )}
              <span>Buka Shift &amp; Masuk POS Kasir</span>
            </button>

            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                type="button"
                onClick={() => nav("/shift")}
                className="tap py-2.5 px-3 rounded-xl border border-[#E4E4E7] bg-white hover:bg-[#F4F5F7] text-xs font-bold text-[#0A0A0A] flex items-center justify-center gap-1.5"
              >
                <Clock size={14} className="text-[#E63946]" />
                <span>Menu Shift</span>
              </button>
              <button
                type="button"
                onClick={() => nav("/dashboard")}
                className="tap py-2.5 px-3 rounded-xl border border-[#E4E4E7] bg-white hover:bg-[#F4F5F7] text-xs font-bold text-[#52525B] flex items-center justify-center gap-1.5"
              >
                <LayoutDashboard size={14} />
                <span>Dashboard</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col overflow-hidden relative">
      {/* top bar: order type & status (responsive scroll on portrait/mobile) */}
      <div className="h-14 sm:h-16 shrink-0 bg-white border-b flex items-center px-3 sm:px-4 gap-2 overflow-x-auto no-scrollbar">
        <div className="flex items-center gap-1.5 shrink-0">
          {ORDER_TYPES.map((t) => (
            <button
              key={t.key}
              data-testid={`ordertype-${t.key}`}
              onClick={() => switchType(t.key)}
              className={`tap h-10 sm:h-11 px-3 sm:px-5 rounded-xl font-bold text-xs sm:text-sm flex items-center gap-1.5 sm:gap-2 border-2 whitespace-nowrap transition-all ${
                orderType === t.key ? `${t.cls}` : "bg-white text-[#52525B] border-transparent hover:bg-[#F4F5F7]"
              }`}
            >
              <t.icon size={16} /> {t.label}
            </button>
          ))}
        </div>
        <div className="hidden sm:flex flex-1" />
        {/* Indikator Status Koneksi & Sinkronisasi */}
        <div
          data-testid="pos-connection-status"
          className={`h-9 sm:h-10 px-2.5 sm:px-3.5 rounded-xl flex items-center gap-1.5 sm:gap-2 text-xs font-bold border-2 shrink-0 transition-all ${
            !online
              ? "bg-[#FEF2F2] text-[#991B1B] border-[#EF4444] shadow-xs"
              : pendingCount > 0
              ? "bg-[#FFFBEB] text-[#92400E] border-[#F59E0B] shadow-xs"
              : "bg-[#F0FDF4] text-[#166534] border-[#22C55E]/50"
          }`}
        >
          {online ? (
            <Wifi size={15} className={pendingCount > 0 ? "text-[#D97706]" : "text-[#16A34A]"} />
          ) : (
            <WifiOff size={15} className="text-[#DC2626] animate-pulse" />
          )}
          <span className="font-extrabold">{online ? "Online" : "Offline"}</span>
          {pendingCount > 0 && (
            <button
              onClick={() => { if (online) syncNow(); }}
              disabled={syncing || !online}
              title={online ? "Klik untuk sinkronkan data transaksi lokal ke server" : "Menunggu koneksi internet untuk sinkron"}
              className="tap ml-1 px-2 py-0.5 rounded-lg bg-[#D97706] hover:bg-[#B45309] text-white text-[10px] font-black flex items-center gap-1 shadow-xs disabled:opacity-80"
            >
              <RefreshCw size={10} className={syncing ? "animate-spin" : ""} />
              <span>{pendingCount}</span>
            </button>
          )}
        </div>
        {shift?.opened_by && (
          <div data-testid="pos-shift-chip" title="Shift hari ini dipakai bersama semua akun — tidak perlu buka shift baru"
            className="hidden md:flex h-9 px-3 rounded-lg items-center gap-1.5 text-xs font-bold bg-[#EEF2FF] text-[#3730A3] shrink-0 whitespace-nowrap">
            <Clock size={13} /> {shift.opened_by}
          </div>
        )}
        {cacheAt && (
          <div data-testid="cache-indicator" title="Waktu data produk/harga terakhir diperbarui dari server"
            className={`hidden xl:flex h-9 px-3 rounded-lg items-center gap-1.5 text-xs font-bold shrink-0 whitespace-nowrap ${online ? "bg-[#F4F5F7] text-[#52525B]" : "bg-[#FEF3C7] text-[#B45309]"}`}>
            <Database size={13} /> {new Date(cacheAt).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}
          </div>
        )}
        {orderType === "dine_in" && (
          <button
            data-testid="pick-table-btn"
            onClick={openTablePicker}
            className="tap h-10 sm:h-11 px-3 sm:px-5 rounded-xl font-bold text-xs sm:text-sm flex items-center gap-1.5 sm:gap-2 bg-[#0A0A0A] text-white shrink-0 whitespace-nowrap"
          >
            <Armchair size={16} /> {table ? table.name : "Pilih Meja"}
          </button>
        )}
      </div>

      {/* Main Layout Area: Category + Products + Cart */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden pb-16 lg:pb-0">
        {/* categories */}
        <CategorySidebar categories={cats} activeCat={activeCat} onSelectCat={handleSelectCat} />

        {/* product grid */}
        <div className="flex-1 flex flex-col overflow-hidden min-w-0">
          <div className="p-2.5 sm:p-3 border-b bg-white shrink-0">
            <div className="relative flex items-center">
              <div className="absolute left-3.5 flex items-center gap-1.5 pointer-events-none text-[#E63946]">
                <Search size={18} />
                <span className="w-px h-3.5 bg-zinc-200" />
                <ScanLine size={17} className="text-zinc-400" />
              </div>
              <input
                id="pos-search-barcode-input"
                data-testid="product-search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={handleSearchKeyDown}
                placeholder="Cari nama produk atau scan / ketik SKU (lalu Enter)..."
                className="w-full h-11 sm:h-12 pl-16 pr-24 rounded-xl border-2 border-zinc-200 focus:border-[#E63946] focus:ring-2 focus:ring-[#E63946]/10 outline-none text-sm transition-all shadow-xs"
                autoFocus
              />
              <div className="absolute right-2.5 flex items-center gap-1.5">
                {search && (
                  <button
                    type="button"
                    onClick={() => setSearch("")}
                    className="p-1 rounded-lg text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 transition-colors"
                    title="Hapus pencarian"
                  >
                    <X size={16} />
                  </button>
                )}
                <div className="hidden sm:flex items-center gap-1 px-2 py-1 rounded-md bg-zinc-100 border border-zinc-200 text-[11px] font-mono font-semibold text-zinc-500">
                  <span>Enter ↵</span>
                </div>
              </div>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto no-scrollbar p-2.5 sm:p-3">
            {quickKeyProducts.length > 0 && (
              <div className="mb-4 bg-zinc-50/50 rounded-2xl p-3 border border-zinc-200/60">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] uppercase tracking-wider font-extrabold text-[#E63946] flex items-center gap-1">
                    <Zap size={12} className="fill-[#E63946]" /> Quick Keys — Paling Sering Dipesan
                  </span>
                  <span className="text-[10px] text-zinc-400 font-bold hidden sm:inline">Sentuh cepat untuk menambah ke keranjang</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-6 gap-2">
                  {quickKeyProducts.map((p) => {
                    const cartItem = cart.find(item => item.product_id === p.id);
                    const qty = cartItem ? cartItem.qty : 0;
                    const out = p.sold_out || (p.track_stock && p.stock <= 0);
                    return (
                      <button
                        key={`quick-${p.id}`}
                        data-testid={`quick-key-${p.id}`}
                        onClick={() => {
                          if (!out) addItem(p);
                        }}
                        disabled={out}
                        className={`tap relative h-12 rounded-xl px-2.5 text-left border flex items-center justify-between transition-all duration-150 ${
                          qty > 0 
                            ? "bg-rose-50 border-[#E63946] text-[#E63946] font-bold shadow-xs" 
                            : "bg-white border-zinc-200 hover:border-[#E63946] text-zinc-800"
                        } ${out ? "opacity-50 cursor-not-allowed" : ""}`}
                      >
                        <div className="min-w-0 flex-1 pr-1.5">
                          <div className="font-extrabold text-[11px] truncate leading-tight">{p.name}</div>
                          <div className="text-[10px] text-zinc-500 font-semibold mt-0.5">{rupiah(p.price)}</div>
                        </div>
                        
                        {qty > 0 ? (
                          <span className="h-5 min-w-5 px-1 rounded-lg bg-[#E63946] text-white text-[10px] font-black flex items-center justify-center scale-up">
                            {qty}
                          </span>
                        ) : (
                          <span className="text-zinc-400 shrink-0 text-xs font-bold bg-zinc-50 border border-zinc-200 rounded-lg h-4.5 w-4.5 flex items-center justify-center">+</span>
                        )}
                        
                        {out && (
                          <span className="absolute inset-0 bg-white/80 flex items-center justify-center text-[10px] font-extrabold text-rose-600 rounded-xl">Habis</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            <ProductGrid products={visibleProducts} onAdd={addItem} />
          </div>
        </div>

        {/* Backdrop for portrait mobile cart drawer */}
        {mobileCartOpen && (
          <div
            onClick={() => setMobileCartOpen(false)}
            className="lg:hidden fixed inset-0 bg-black/50 z-40 backdrop-blur-xs transition-opacity"
          />
        )}

        {/* cart (Responsive sidebar on landscape / Bottom sheet drawer on portrait) */}
        <div
          className={`
            fixed lg:static inset-x-0 bottom-0 z-50 lg:z-auto
            w-full lg:w-[320px] xl:w-[350px] shrink-0 bg-white
            border-t-2 lg:border-t-0 lg:border-l-2 border-[#E63946]
            flex flex-col shadow-2xl lg:shadow-none
            transition-transform duration-300 ease-in-out
            ${mobileCartOpen ? "translate-y-0 max-h-[85vh] h-[85vh]" : "translate-y-full lg:translate-y-0"}
            lg:max-h-full lg:h-full
          `}
        >
          <div className="p-3 sm:p-4 border-b flex items-center justify-between bg-white shrink-0">
            <div className="font-extrabold flex items-center gap-2 text-sm sm:text-base">
              <Receipt size={18} className="text-[#E63946]" /> Keranjang ({cart.reduce((s, i) => s + i.qty, 0)})
            </div>
            <div className="flex items-center gap-2">
              {cart.length > 0 && (
                <button data-testid="clear-cart" onClick={resetSale} className="text-xs text-[#EF4444] font-bold flex items-center gap-1 hover:underline">
                  <Trash2 size={13} /> Kosongkan
                </button>
              )}
              <button
                onClick={() => setMobileCartOpen(false)}
                className="lg:hidden p-1.5 rounded-lg text-[#71717A] hover:bg-[#F4F5F7]"
              >
                <ChevronDown size={20} />
              </button>
            </div>
          </div>
          {orderType === "dine_in" && table && (
            <div className="px-3 py-2 text-xs sm:text-sm font-bold ot-dine_in border-y shrink-0 flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 truncate">
                <Armchair size={15} className="shrink-0" />
                <span className="truncate">Meja: {table.name} {currentOrderId ? "· Open Bill" : ""}</span>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  data-testid="pos-move-table-btn"
                  onClick={() => handleOpenMoveTable(table)}
                  title="Pindah Meja ini ke meja lain"
                  className="px-2 py-1 rounded-lg bg-white text-[#0A0A0A] hover:bg-[#F4F5F7] text-[11px] font-bold flex items-center gap-1 shadow-xs border"
                >
                  <ArrowRightLeft size={11} /> Pindah
                </button>
                <button
                  data-testid="pos-remove-table-btn"
                  onClick={removeTableFromCart}
                  title="Hapus / lepas pilihan meja dari transaksi ini"
                  className="p-1 rounded-lg bg-[#FEE2E2] text-[#EF4444] hover:bg-[#FCA5A5] text-[11px] font-bold flex items-center gap-1"
                >
                  <X size={13} />
                </button>
              </div>
            </div>
          )}
          <div className="flex-1 overflow-y-auto no-scrollbar p-3 space-y-2 min-h-0 bg-[#FAFAFA]">
            {cart.length === 0 && (
              <div className="text-center text-[#a1a1aa] py-12 text-sm">Belum ada item di keranjang</div>
            )}
            {cart.map((i) => (
              <CartItemRow
                key={i.product_id}
                item={i}
                onMinus={onMinus}
                onPlus={onPlus}
                onRemove={removeItem}
              />
            ))}
          </div>

          <div className="border-t p-3 sm:p-4 space-y-2.5 sm:space-y-3 bg-white shrink-0">
            <div className="flex gap-2">
              <select
                data-testid="discount-type" value={discType}
                onChange={(e) => { setDiscType(e.target.value); setDiscVal(0); }}
                className="h-10 rounded-lg border px-2 text-xs sm:text-sm bg-white"
              >
                <option value="none">Tanpa Diskon</option>
                <option value="percent">Diskon %</option>
                <option value="amount">Diskon Rp</option>
              </select>
              {discType !== "none" && (
                <input
                  data-testid="discount-value" type="number" min="0" max={discType === "percent" ? 100 : undefined} value={discVal}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    // Diskon % boleh sampai 100% (gratis); diskon Rp maks = subtotal (dipotong di perhitungan).
                    setDiscVal(discType === "percent" ? Math.min(100, Math.max(0, v)) : Math.max(0, v));
                  }}
                  className="h-10 rounded-lg border px-2 text-xs sm:text-sm flex-1 font-num"
                />
              )}
            </div>
            {discType === "percent" && discVal >= 100 && (
              <div className="text-[10px] sm:text-[11px] font-bold text-[#E63946] -mt-1">Diskon 100% = gratis. HPP &amp; bagian vendor tetap dihitung penuh.</div>
            )}
            <div className="space-y-1 text-xs sm:text-sm">
              <div className="flex justify-between text-[#52525B]"><span>Subtotal</span><span className="font-num">{rupiah(subtotal)}</span></div>
              {discount > 0 && <div className="flex justify-between text-[#EF4444]"><span>Diskon</span><span className="font-num">-{rupiah(discount)}</span></div>}
              {service > 0 && <div className="flex justify-between text-[#52525B]"><span>Pajak Layanan {svcRate}%</span><span className="font-num">+{rupiah(service)}</span></div>}
              <div className="flex justify-between font-extrabold text-base sm:text-lg"><span>Total</span><span className="font-num" data-testid="cart-total">{rupiah(total)}</span></div>
            </div>
            <div className="flex gap-2">
              {orderType === "dine_in" && (
                <>
                  <button
                    data-testid="save-openbill-btn" onClick={saveOpenBill} disabled={!cart.length || !table}
                    className="tap flex-1 h-12 py-2.5 rounded-xl bg-[#0A0A0A] text-white font-bold text-xs sm:text-sm disabled:opacity-40"
                  >
                    {posLabel(ui, "open_bill", "Simpan Bill")}
                  </button>
                  <button
                    data-testid="interim-bill-btn" onClick={printInterimBill} disabled={!cart.length}
                    className="tap h-12 px-3 rounded-xl bg-white border-2 border-[#0A0A0A] text-[#0A0A0A] font-bold text-xs disabled:opacity-40"
                  >
                    <Receipt size={14} /> {posLabel(ui, "bill", "Bill")}
                  </button>
                </>
              )}
              <button
                data-testid="pay-btn"
                onClick={() => {
                  if (!cart.length) return toast.error("Keranjang kosong");
                  if (orderType === "dine_in" && !table) return toast.error("Pilih meja dulu");
                  setPayOpen(true);
                }}
                disabled={!cart.length}
                className="tap flex-1 h-12 py-2.5 rounded-xl bg-[#E63946] hover:bg-[#BE123C] text-white font-bold text-sm sm:text-base disabled:opacity-40"
              >
                {posLabel(ui, "pay", "Bayar")}
              </button>
            </div>
            <div data-testid="pos-printer-status" className={`mt-1 text-[10px] sm:text-[11px] font-bold flex items-center gap-1 ${printerStatus.level === "error" ? "text-[#B91C1C]" : printerStatus.level === "warn" ? "text-[#B45309]" : "text-[#047857]"}`}>
              <Printer size={12} /> Printer: {printerStatus.label}
            </div>
          </div>
        </div>
      </div>

      {/* Floating Bottom Quick-Action Bar for Android Portrait */}
      <div className="lg:hidden fixed inset-x-0 bottom-0 z-30 bg-white border-t px-3 py-2.5 flex items-center justify-between gap-3 shadow-lg">
        <button
          onClick={() => setMobileCartOpen(true)}
          className="flex-1 flex items-center gap-2.5 text-left tap"
        >
          <div className="relative bg-[#F4F5F7] p-2 rounded-xl text-[#E63946]">
            <ShoppingCart size={20} />
            {cart.length > 0 && (
              <span className="absolute -top-1 -right-1 bg-[#E63946] text-white text-[10px] font-extrabold h-4.5 min-w-4.5 px-1 rounded-full flex items-center justify-center">
                {cart.reduce((s, i) => s + i.qty, 0)}
              </span>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[11px] text-[#71717A] font-bold flex items-center gap-1">
              <span>Keranjang</span>
              <ChevronUp size={13} />
            </div>
            <div className="font-num font-extrabold text-sm text-[#0A0A0A] truncate">
              {rupiah(total)}
            </div>
          </div>
        </button>

        <button
          onClick={() => {
            if (!cart.length) return toast.error("Keranjang kosong");
            if (orderType === "dine_in" && !table) return toast.error("Pilih meja dulu");
            setPayOpen(true);
          }}
          disabled={!cart.length}
          className="tap h-11 px-5 rounded-xl bg-[#E63946] hover:bg-[#BE123C] text-white font-bold text-sm shadow-sm disabled:opacity-40 flex items-center gap-1.5"
        >
          <span>{posLabel(ui, "pay", "Bayar")}</span>
        </button>
      </div>

      <TableDialog
        open={tableOpen}
        onClose={() => setTableOpen(false)}
        tables={tables}
        onSelect={selectTable}
        onMoveTable={(t) => { setTableOpen(false); handleOpenMoveTable(t); }}
        onClearTable={clearTable}
        onDeleteTable={deleteTable}
        onCancelBill={(t) => { setTableOpen(false); setVoidBill({ id: t.open_order_id, order_number: t.name, status: "open", order_type: "dine_in", items: [], total: 0 }); }}
      />
      <MoveTableDialog
        open={moveTableOpen}
        onClose={() => { setMoveTableOpen(false); setMoveSourceTable(null); }}
        sourceTable={moveSourceTable}
        tables={tables}
        onConfirm={doMoveTable}
      />
      {/* Dialog input berat utk produk jual per berat */}
      <Dialog open={weightOpen} onOpenChange={(v) => { if (!v) setWeightOpen(false); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Masukkan Berat</DialogTitle></DialogHeader>
          {weightProduct && (
            <div className="space-y-3">
              <div className="text-center">
                <div className="font-bold">{weightProduct.name}</div>
                <div className="text-sm text-[#52525B]">Harga: <b className="font-num">{rupiah(weightProduct.price)}</b> / {weightProduct.weight_unit || "satuan"}</div>
              </div>
              <div className="flex items-center gap-2">
                <input data-testid="weight-input" type="number" min="0" step="0.01" value={weightVal} onChange={(e) => setWeightVal(e.target.value)} autoFocus
                  placeholder={`Berat (${weightProduct.weight_unit || "ons"})`} className="w-full h-12 rounded-xl border px-3 font-num text-lg" />
                <span className="font-bold text-[#52525B]">{weightProduct.weight_unit || "ons"}</span>
              </div>
              {Number(weightVal) > 0 && (
                <div className="text-center text-sm">
                  Total: <b className="font-num text-[#E63946]">{rupiah(Math.round(weightProduct.price * Number(weightVal) * 100) / 100)}</b>
                </div>
              )}
              <DialogFooter>
                <button onClick={() => setWeightOpen(false)} className="tap h-11 px-4 rounded-xl bg-[#F4F5F7] font-bold">Batal</button>
                <button data-testid="confirm-weight-btn" onClick={confirmWeight} disabled={!Number(weightVal) || Number(weightVal) <= 0}
                  className="tap h-11 px-6 rounded-xl bg-[#E63946] text-white font-bold disabled:opacity-40">Tambah</button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
      <PayDialog open={payOpen} onClose={() => setPayOpen(false)} pms={pms} total={total}
        discountType={discType} discountValue={Number(discVal)} subtotal={subtotal} onPay={doPay} />
      <ReceiptDialog order={receipt} onClose={() => setReceipt(null)} />
      {/* Batalkan bill terbuka langsung dari POS. Kasir hanya boleh untuk shift berjalan;
          koreksi lintas shift tetap hanya admin (lihat docs/RANCANGAN-VOID-PESANAN.md). */}
      <VoidDialog
        order={voidBill}
        open={!!voidBill}
        onOpenChange={(o) => { if (!o) setVoidBill(null); }}
        onDone={() => { load(); setCart([]); setTable(null); }}
      />
      {/* Kolom Chat Gemini AI & Kirim Tugas AI Studio (Khusus Superadmin, Dapat Diaktifkan/Dinonaktifkan di Fitur) */}
      <PosAiChatWidget />
    </div>
  );
}

function TableDialog({
  open,
  onClose,
  tables = [],
  onSelect,
  onCancelBill,
  onMoveTable,
  onClearTable,
  onDeleteTable,
}) {
  const safeTables = Array.isArray(tables) ? tables : [];
  const areas = [...new Set(safeTables.filter((t) => t?.active).map((t) => t.area).filter(Boolean))];

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Armchair size={20} />
            Pilih &amp; Kelola Meja (Dine-In)
          </DialogTitle>
        </DialogHeader>
        <div className="max-h-[65vh] overflow-y-auto space-y-5 pr-1">
          {safeTables.filter((t) => t?.active).length === 0 && (
            <p className="text-sm text-[#52525B]">Belum ada meja aktif. Tambahkan di menu Meja.</p>
          )}
          {areas.map((area) => (
            <div key={area} className="space-y-2">
              <div className="text-xs uppercase tracking-wider font-bold text-[#52525B] flex items-center justify-between">
                <span>{area}</span>
                <span className="text-[11px] font-normal text-[#71717A]">
                  {safeTables.filter((t) => t?.active && t?.area === area && t.status !== "open_bill").length} kosong
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 gap-2.5">
                {safeTables.filter((t) => t?.active && t?.area === area).map((t) => (
                  <div key={t.id} className="flex flex-col gap-1.5 p-2 rounded-xl border bg-white shadow-2xs">
                    <button
                      data-testid={`table-opt-${t.id}`}
                      onClick={() => onSelect(t)}
                      className={`tap w-full h-14 rounded-lg border-2 font-bold flex flex-col items-center justify-center transition ${
                        t.status === "open_bill"
                          ? "tbl-open_bill border-[#F59E0B]"
                          : "tbl-empty hover:border-[#E63946]"
                      }`}
                    >
                      <span className="text-sm font-black">{t.name}</span>
                      <span className="text-[10px] mt-0.5 opacity-90">
                        {t.status === "open_bill" ? "OPEN BILL" : `${t.capacity || 4} kursi`}
                      </span>
                    </button>

                    {/* Table Actions Toolbar */}
                    <div className="flex items-center gap-1 justify-between pt-1 border-t border-zinc-100">
                      {t.status === "open_bill" ? (
                        <>
                          <button
                            data-testid={`move-table-${t.id}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (onMoveTable) onMoveTable(t);
                            }}
                            title="Pindah Meja (Transfer Open Bill)"
                            className="tap flex-1 h-7 rounded-md bg-[#EFF6FF] text-[#1D4ED8] hover:bg-[#DBEAFE] text-[10px] font-extrabold flex items-center justify-center gap-1"
                          >
                            <ArrowRightLeft size={11} /> Pindah
                          </button>
                          <button
                            data-testid={`clear-table-${t.id}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (onClearTable) onClearTable(t);
                            }}
                            title="Kosongkan Meja"
                            className="tap h-7 w-7 rounded-md bg-[#F4F5F7] text-[#52525B] hover:bg-zinc-200 flex items-center justify-center"
                          >
                            <RotateCcw size={11} />
                          </button>
                          {t.open_order_id && onCancelBill && (
                            <button
                              data-testid={`cancel-bill-${t.id}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                onCancelBill(t);
                              }}
                              title="Batalkan Bill Terbuka"
                              className="tap h-7 px-1.5 rounded-md bg-[#FEE2E2] text-[#B91C1C] hover:bg-[#FCA5A5] text-[10px] font-bold"
                            >
                              Batal
                            </button>
                          )}
                        </>
                      ) : (
                        <>
                          <span className="text-[10px] text-[#047857] font-bold px-1">Tersedia</span>
                          {onDeleteTable && (
                            <button
                              data-testid={`delete-table-${t.id}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                onDeleteTable(t);
                              }}
                              title="Hapus Meja"
                              className="tap h-6 w-6 rounded-md text-[#A1A1AA] hover:text-[#EF4444] hover:bg-[#FEE2E2] flex items-center justify-center ml-auto"
                            >
                              <Trash2 size={11} />
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function MoveTableDialog({ open, onClose, sourceTable, tables = [], onConfirm }) {
  const [targetTable, setTargetTable] = useState(null);
  const safeTables = Array.isArray(tables) ? tables : [];
  const availableTables = safeTables.filter(
    (t) => t.active && t.id !== sourceTable?.id && t.status !== "open_bill"
  );
  const areas = [...new Set(availableTables.map((t) => t.area).filter(Boolean))];

  useEffect(() => {
    if (open) setTargetTable(null);
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowRightLeft size={18} className="text-[#1D4ED8]" />
            Pindah Meja (Dine-In)
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="p-3 rounded-xl bg-[#EFF6FF] border border-[#BFDBFE] flex items-center justify-between text-xs">
            <div>
              <span className="font-bold text-[#1E40AF] block">Meja Asal:</span>
              <span className="text-sm font-black text-[#1D4ED8]">{sourceTable?.name || "Meja Tidak Diketahui"}</span>
            </div>
            <span className="px-2 py-1 bg-white text-[#1E40AF] font-bold rounded-lg border border-[#BFDBFE] text-[11px]">
              {sourceTable?.area} · {sourceTable?.capacity || 4} kursi
            </span>
          </div>

          <div>
            <label className="text-xs font-bold text-[#52525B] uppercase tracking-wider block mb-2">
              Pilih Meja Tujuan yang Kosong:
            </label>
            {availableTables.length === 0 ? (
              <div className="p-4 rounded-xl bg-[#FFFBEB] border border-[#FDE68A] text-[#92400E] text-xs font-bold text-center">
                Tidak ada meja lain yang kosong saat ini. Silakan kosongkan meja terlebih dahulu atau tambahkan meja baru.
              </div>
            ) : (
              <div className="max-h-[45vh] overflow-y-auto space-y-3 pr-1">
                {areas.map((area) => (
                  <div key={area} className="space-y-1.5">
                    <div className="text-[11px] font-bold text-[#71717A] uppercase">{area}</div>
                    <div className="grid grid-cols-4 gap-2">
                      {availableTables.filter((t) => t.area === area).map((t) => {
                        const isSelected = targetTable?.id === t.id;
                        return (
                          <button
                            key={t.id}
                            data-testid={`target-table-${t.id}`}
                            onClick={() => setTargetTable(t)}
                            className={`tap h-13 rounded-xl border-2 flex flex-col items-center justify-center font-bold transition ${
                              isSelected
                                ? "border-[#1D4ED8] bg-[#EFF6FF] text-[#1D4ED8] ring-2 ring-[#93C5FD]"
                                : "border-zinc-200 bg-white hover:border-zinc-400 text-zinc-900"
                            }`}
                          >
                            <span className="text-sm">{t.name}</span>
                            <span className="text-[9px] text-[#71717A]">{t.capacity || 4} kursi</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <DialogFooter className="gap-2 sm:gap-0 pt-2 border-t">
            <button
              onClick={onClose}
              className="tap h-11 px-4 rounded-xl bg-[#F4F5F7] font-bold text-sm text-[#52525B]"
            >
              Batal
            </button>
            <button
              data-testid="confirm-move-table-btn"
              onClick={() => {
                if (targetTable) onConfirm(targetTable);
              }}
              disabled={!targetTable}
              className="tap h-11 px-6 rounded-xl bg-[#1D4ED8] hover:bg-[#1E40AF] text-white font-bold text-sm disabled:opacity-40 flex items-center gap-2"
            >
              <ArrowRightLeft size={14} /> Pindahkan Meja
            </button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function PayDialog({ open, onClose, pms = [], total, discountType, discountValue, subtotal, onPay }) {
  const [biz, setBiz] = useState(bizCache());
  useEffect(() => { if (open) loadBusiness().then(setBiz); }, [open]);
  // selected = hingga 2 metode pembayaran utk SATU transaksi (mis. Tunai + QRIS)
  const [selected, setSelected] = useState([]);
  const [paid1, setPaid1] = useState("");
  const [paid2, setPaid2] = useState("");
  const [member, setMember] = useState(null);
  const [phone, setPhone] = useState("");
  const [redeemPts, setRedeemPts] = useState("");
  const [discReason, setDiscReason] = useState("");
  const [couponCode, setCouponCode] = useState("");
  const [searching, setSearching] = useState(false);
  useEffect(() => {
    if (open) {
      setPaid1("");
      setPaid2("");
      setMember(null);
      setPhone("");
      setRedeemPts("");
      setDiscReason("");
      setCouponCode("");
      // Auto-select Cash (Tunai) if available to save 1 tap
      const cashPm = pms.find((pm) => {
        const t = String(pm?.type || "").toLowerCase();
        const n = String(pm?.name || "").toLowerCase();
        return t === "cash" || t === "tunai" || n.includes("tunai") || n.includes("cash") || n.includes("kas");
      });
      if (cashPm) {
        setSelected([cashPm]);
      } else if (pms.length > 0) {
        setSelected([pms[0]]);
      } else {
        setSelected([]);
      }
    }
  }, [open, pms]);
  const isCashMethod = (pm) => {
    if (!pm) return false;
    const t = String(pm?.type || "").toLowerCase();
    const n = String(pm?.name || "").toLowerCase();
    return t === "cash" || t === "tunai" || n.includes("tunai") || n.includes("cash") || n.includes("kas");
  };
  const method = selected[0] || null;
  const second = selected[1] || null;
  const isSplit = selected.length === 2;
  const isCash1 = isCashMethod(method);
  const amt1 = Number(paid1 || 0) || 0;
  const amt2 = Number(paid2 || 0) || 0;
  const splitTotal = amt1 + amt2;
  const change = (singlePaid() - total); // hanya utk 1 metode tunai
  function singlePaid() {
    if (isSplit) return 0;
    return isCash1 ? amt1 : total;
  }
  const pointRate = Math.max(1, Number(biz?.member_redeem_per_point || 100));
  const redeemVal = Math.min(Number(redeemPts || 0) || 0, member?.points || 0) * pointRate;
  const payable = Math.max(0, total - redeemVal);

  // Dynamic touch-friendly quick cash keys & denominations
  const quick = useMemo(() => {
    const list = [payable];
    const round5 = Math.ceil(payable / 5000) * 5000;
    if (round5 > payable && !list.includes(round5)) list.push(round5);
    const round10 = Math.ceil(payable / 10000) * 10000;
    if (round10 > payable && !list.includes(round10)) list.push(round10);
    const round50 = Math.ceil(payable / 50000) * 50000;
    if (round50 > payable && !list.includes(round50)) list.push(round50);
    [10000, 20000, 50000, 100000, 200000, 500000].forEach((val) => {
      if (val > payable && !list.includes(val)) list.push(val);
    });
    return list.sort((a, b) => a - b).slice(0, 6);
  }, [payable]);

  const addCashAmount = (addVal) => {
    const cur = Number(paid1 || 0);
    setPaid1(String(cur + addVal));
  };

  const needReason =
    (discountType === "percent" && discountValue > Number(biz?.discount_reason_percent ?? 15)) ||
    (discountType === "amount" && discountValue > Number(biz?.discount_reason_amount ?? 50000));

  const toggleMethod = (pm) => {
    setSelected((sel) => {
      if (sel.some((m) => m.id === pm.id)) return sel.filter((m) => m.id !== pm.id);
      if (sel.length < 2) return [...sel, pm];
      return [sel[0], pm]; // sudah 2 -> ganti metode kedua
    });
  };
  const isSelected = (id) => selected.some((m) => m.id === id);
  const splitOk = isSplit && Math.abs(splitTotal - payable) < 0.5;
  const fillRest = (idx) => {
    if (idx === 0) setPaid1(String(Math.max(0, payable - amt2)));
    else setPaid2(String(Math.max(0, payable - amt1)));
  };
  const canPay =
    selected.length > 0 &&
    !(isSplit && !splitOk) &&
    !(selected.length === 1 && isCash1 && amt1 < payable) &&
    !(needReason && !discReason.trim());

  const findMember = async () => {
    if (!phone.trim()) return toast.error("Masukkan nomor WA member dulu");
    setSearching(true);
    try {
      const { data } = await api.get("/members/search", { params: { phone: phone.trim() } });
      if (data.member) { setMember(data.member); toast.success(`${data.member.name} — poin ${(data.member.points || 0).toLocaleString("id-ID")}`); }
      else { setMember(null); toast.error("Member tidak ditemukan. Daftarkan di menu Member."); }
    } catch (e) { toast.error(apiError(e.response?.data?.detail)); } finally { setSearching(false); }
  };

  const submit = () => {
    const opts = {
      member_id: member?.id || null,
      redeem_points: Number(redeemPts || 0) || 0,
      discount_reason: needReason ? discReason.trim() : null,
      coupon_code: couponCode.trim() || null,
    };
    if (isSplit) {
      opts.splits = selected.map((pm, i) => ({
        payment_method: pm.id,
        amount: i === 0 ? Math.round(amt1) : Math.round(amt2),
      }));
      onPay(selected[0], payable, opts);
    } else {
      onPay(method, isCash1 ? amt1 : payable, opts);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-h-[88vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Pembayaran</DialogTitle></DialogHeader>
        <div className="text-center py-2">
          <div className="text-xs uppercase tracking-wider text-[#52525B] font-bold">Total Tagihan</div>
          <div className="font-num text-4xl font-extrabold text-[#E63946]">{rupiah(total)}</div>
        </div>

        {/* Member & poin */}
        <div className="rounded-xl border border-[#E4E4E7] p-3 space-y-2">
          <div className="text-xs font-bold text-[#52525B] uppercase tracking-wider">Member (poin loyalitas)</div>
          <div className="flex gap-2">
            <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="No. WA member"
              className="flex-1 h-10 rounded-lg border px-3 text-sm" />
            <button onClick={findMember} disabled={searching} className="tap h-10 px-3 rounded-lg bg-[#0A0A0A] text-white text-sm font-bold disabled:opacity-50">
              {searching ? "..." : "Cari"}
            </button>
          </div>
          {member && (
            <div className="text-sm bg-[#F4F5F7] rounded-lg p-2 flex flex-wrap items-center gap-2">
              <span className="font-bold">{member.name}</span>
              <span className="text-[#047857] font-bold">Poin {(member.points || 0).toLocaleString("id-ID")}</span>
              <input type="number" min="0" max={member.points} value={redeemPts} onChange={(e) => setRedeemPts(e.target.value)}
                placeholder={`Tukar poin (1pt=Rp${pointRate.toLocaleString("id-ID")})`} className="ml-auto w-40 h-9 rounded-lg border px-2 font-num text-sm" />
            </div>
          )}
          {redeemVal > 0 && (
            <div className="flex justify-between text-sm font-bold"><span>Potongan poin</span><span className="text-[#E63946] font-num">-{rupiah(redeemVal)}</span></div>
          )}
        </div>

        {/* Alasan diskon besar */}
        {needReason && (
          <div>
            <label className="text-xs uppercase tracking-wider font-bold text-[#52525B]">Alasan diskon (wajib)</label>
            <textarea value={discReason} onChange={(e) => setDiscReason(e.target.value)} rows={2}
              placeholder="Contoh: diskon member, promo perayaan, komplain pelanggan…"
              className="mt-1 w-full rounded-xl border px-3 py-2 text-sm outline-none focus:border-[#E63946]" />
          </div>
        )}

        {/* Kupon diskon */}
        <div className="rounded-xl border border-[#E4E4E7] p-3 space-y-2">
          <div className="text-xs font-bold text-[#52525B] uppercase tracking-wider">Kupon Diskon</div>
          <div className="flex gap-2">
            <input data-testid="coupon-input" value={couponCode} onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
              placeholder="Kode kupon (mis. HEMAT10)" className="flex-1 h-10 rounded-lg border px-3 text-sm font-mono uppercase" />
            <button data-testid="coupon-clear" onClick={() => setCouponCode("")} disabled={!couponCode}
              className="tap h-10 px-3 rounded-lg bg-[#F4F5F7] text-xs font-bold disabled:opacity-40">Batal</button>
          </div>
        </div>

        {/* Metode pembayaran — bisa 1 atau 2 sekaligus */}
        <div>
          <div className="text-xs uppercase tracking-wider font-bold text-[#52525B] mb-2">
            Metode Pembayaran {isSplit && <span className="text-[#7C3AED]">· 2 metode dipilih</span>}
          </div>
          <div className="grid grid-cols-3 gap-2">
            {pms.map((pm) => (
              <button
                key={pm.id} data-testid={`pm-${pm.type}`} onClick={() => toggleMethod(pm)}
                className={`tap h-14 rounded-xl border-2 font-bold text-sm ${
                  isSelected(pm.id) ? "bg-[#E63946] text-white border-[#E63946]" : "bg-white border-[#E4E4E7]"
                }`}
              >
                {pm.name}
              </button>
            ))}
          </div>
        </div>

        {/* Isian jumlah uang tunai yang dibayarkan & kembalian */}
        {selected.length === 1 && isCash1 && (
          <div className="rounded-2xl border-2 border-emerald-500/30 bg-emerald-50/40 p-4 space-y-3.5" data-testid="cash-payment-section">
            <div className="flex items-center justify-between">
              <label className="text-xs font-black text-emerald-950 uppercase tracking-wider flex items-center gap-1.5">
                <Banknote size={16} className="text-emerald-600" />
                Uang Tunai Diterima (Rp)
              </label>
              {amt1 > 0 && (
                <button
                  type="button"
                  onClick={() => setPaid1("")}
                  className="text-[11px] font-bold text-zinc-500 hover:text-rose-600 transition"
                >
                  Bersihkan (C)
                </button>
              )}
            </div>

            {/* Main Cash Input Field */}
            <div className="relative">
              <div className="absolute left-3.5 top-1/2 -translate-y-1/2 font-extrabold text-zinc-400 text-lg">
                Rp
              </div>
              <input
                data-testid="cash-amount"
                type="number"
                inputMode="numeric"
                autoFocus
                value={paid1}
                onChange={(e) => setPaid1(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && canPay) {
                    e.preventDefault();
                    submit();
                  }
                }}
                placeholder={`Minimal ${rupiah(payable)}`}
                className="w-full h-14 pl-12 pr-28 rounded-xl border-2 border-emerald-600/40 bg-white px-3 font-num text-2xl font-black text-zinc-900 outline-none focus:border-emerald-600 focus:ring-4 focus:ring-emerald-600/10 shadow-xs"
              />
              <button
                type="button"
                data-testid="cash-exact-btn"
                onClick={() => setPaid1(String(payable))}
                className="absolute right-2 top-1/2 -translate-y-1/2 h-10 px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold text-xs flex items-center gap-1 transition shadow-xs"
              >
                <Check size={14} /> Uang Pas
              </button>
            </div>

            {/* Quick Denomination Preset Chips */}
            <div className="space-y-1.5">
              <div className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider">
                Pilihan Cepat Nominal Uang:
              </div>
              <div className="flex flex-wrap gap-1.5">
                {quick.map((q) => {
                  const isCurExact = amt1 === q;
                  const isExactTag = q === payable;

                  return (
                    <button
                      key={q}
                      type="button"
                      onClick={() => setPaid1(String(q))}
                      className={`tap px-3 py-2 rounded-xl text-xs font-num font-bold transition flex items-center gap-1 border ${
                        isCurExact
                          ? "bg-emerald-600 text-white border-emerald-600 shadow-xs"
                          : "bg-white text-zinc-800 border-zinc-200 hover:border-emerald-400 hover:bg-emerald-50/50"
                      }`}
                    >
                      {isExactTag && <span className="text-[10px] uppercase font-black opacity-80">[Pas]</span>}
                      {rupiah(q)}
                    </button>
                  );
                })}
              </div>

              {/* Fast Addition Increments (+5k, +10k, +20k, +50k, +100k) */}
              <div className="flex items-center gap-1.5 pt-1 overflow-x-auto text-[11px]">
                <span className="text-zinc-400 font-bold uppercase shrink-0 text-[10px]">Tambah:</span>
                {[5000, 10000, 20000, 50000, 100000].map((addVal) => (
                  <button
                    key={addVal}
                    type="button"
                    onClick={() => addCashAmount(addVal)}
                    className="px-2 py-1 bg-white border border-emerald-200/80 hover:bg-emerald-100/50 text-emerald-800 rounded-lg font-bold font-num shrink-0 transition"
                  >
                    +{rupiah(addVal).replace("Rp", "")}
                  </button>
                ))}
              </div>
            </div>

            {/* Real-Time Live Kembalian Card */}
            <div className="pt-1">
              {amt1 > payable ? (
                <div className="rounded-xl bg-emerald-600 text-white p-4 shadow-sm space-y-1" data-testid="change-amount-banner">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black uppercase tracking-wider text-emerald-100 flex items-center gap-1.5">
                      <Coins size={16} className="text-amber-300" />
                      KEMBALIAN UANG TUNAI
                    </span>
                    <span className="text-[11px] font-bold bg-white/20 px-2 py-0.5 rounded-full text-white">
                      Wajib Diserahkan
                    </span>
                  </div>
                  <div className="text-3xl font-black font-num tracking-tight" data-testid="change-value">
                    {rupiah(amt1 - payable)}
                  </div>
                  <div className="text-[11px] text-emerald-100 font-medium pt-0.5 border-t border-emerald-500/60">
                    Diterima: <strong>{rupiah(amt1)}</strong> − Total Tagihan: <strong>{rupiah(payable)}</strong>
                  </div>
                </div>
              ) : amt1 === payable && amt1 > 0 ? (
                <div className="rounded-xl bg-emerald-100 border border-emerald-300 p-3 text-emerald-950 flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs font-extrabold">
                    <CheckCircle2 size={18} className="text-emerald-600" />
                    <span>✓ Uang Pas Diterima</span>
                  </div>
                  <span className="text-xs font-black text-emerald-800 font-num">Kembalian: Rp 0</span>
                </div>
              ) : amt1 > 0 && amt1 < payable ? (
                <div className="rounded-xl bg-rose-50 border border-rose-200 p-3 text-rose-950 flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs font-extrabold">
                    <AlertTriangle size={18} className="text-rose-600" />
                    <span>⚠️ Uang Masih Kurang</span>
                  </div>
                  <span className="text-xs font-black text-rose-600 font-num">
                    Kurang {rupiah(payable - amt1)}
                  </span>
                </div>
              ) : (
                <div className="rounded-xl bg-zinc-100/80 border border-zinc-200 p-3 text-zinc-500 text-xs text-center font-medium">
                  Ketik nominal uang tunai yang diserahkan pembeli atau klik tombol <b>Uang Pas</b>.
                </div>
              )}
            </div>
          </div>
        )}

        {isSplit && (
          <div className="rounded-xl border-2 border-[#7C3AED]/40 bg-[#FAF5FF] p-3 space-y-3">
            <div className="text-xs font-bold text-[#7C3AED] uppercase tracking-wider">Bayar 2 Metode — total harus pas {rupiah(payable)}</div>
            {[method, second].map((pm, idx) => (
              <div key={pm.id} className="flex items-center gap-2">
                <span className="w-28 shrink-0 text-sm font-bold">{pm.name}</span>
                <input data-testid={`split-amount-${idx + 1}`} type="number" value={idx === 0 ? paid1 : paid2}
                  onChange={(e) => (idx === 0 ? setPaid1(e.target.value) : setPaid2(e.target.value))}
                  placeholder="Jumlah" className="flex-1 h-11 rounded-xl border px-3 font-num" />
                {isCashMethod(pm) && (
                  <div className="flex gap-1 flex-wrap max-w-[180px]">
                    {[50000, 100000, 200000].map((q) => (
                      <button key={q} onClick={() => (idx === 0 ? setPaid1(String(q)) : setPaid2(String(q)))} className="tap px-2 h-8 rounded-lg bg-white border text-xs font-num font-bold">{rupiah(q)}</button>
                    ))}
                  </div>
                )}
                {idx === 1 && (
                  <button onClick={() => fillRest(1)} className="tap h-9 px-2.5 rounded-lg bg-[#0A0A0A] text-white text-xs font-bold">Isi sisa</button>
                )}
              </div>
            ))}
            <div className={`text-xs font-bold flex items-center justify-between ${splitOk ? "text-[#047857]" : "text-[#EF4444]"}`}>
              <span>Total bagian: {rupiah(splitTotal)} / {rupiah(payable)}</span>
              <span>{splitOk ? "✓ Pas — lanjutkan" : "Belum pas (jumlah harus sama dengan tagihan)"}</span>
            </div>
          </div>
        )}

        <DialogFooter>
          <button
            data-testid="confirm-pay-btn"
            disabled={!canPay}
            onClick={submit}
            className="tap w-full h-13 py-3 rounded-xl bg-[#E63946] hover:bg-[#BE123C] text-white font-bold disabled:opacity-40 flex items-center justify-center gap-2"
          >
            <CheckCircle2 size={18} /> Konfirmasi Bayar {payable !== total ? `· ${rupiah(payable)}` : ""} {isSplit ? `(${selected.map((m) => m.name).join(" + ")})` : ""}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReceiptDialog({ order, onClose }) {
  return <ReceiptModal order={order} open={!!order} onClose={onClose} />;
}

