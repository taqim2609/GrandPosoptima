import { useEffect, useMemo, useState, useCallback, memo } from "react";
import api, { apiError } from "@/lib/api";
import { rupiah } from "@/lib/format";
import { printReceipt } from "@/lib/receipt";
import { getDeviceConfig, setDeviceConfig, getPrinterStatus } from "@/lib/device";
import { bizCache, loadBusiness } from "@/lib/business";
import { useUI, posLabel } from "@/lib/ui";
import { useOffline } from "@/context/OfflineContext";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import VoidDialog from "@/components/VoidDialog";
import {
  Utensils, ShoppingBag, Store, Plus, Minus, Trash2, Armchair,
  Search, Receipt, X, CheckCircle2, Layers, Database, ScanLine, Clock, Play, Printer, Wifi, WifiOff, RefreshCw, CloudOff,
  ShoppingCart, ChevronUp, ChevronDown,
} from "lucide-react";

const ORDER_TYPES = [
  { key: "dine_in", label: "Dine-In", icon: Utensils, cls: "ot-dine_in" },
  { key: "take_away", label: "Take Away", icon: ShoppingBag, cls: "ot-take_away" },
  { key: "retail", label: "Retail", icon: Store, cls: "ot-retail" },
];

/* ==========================================================================
   Memoized Sub-Components for High Performance POS on Android / Sunmi T2
   ========================================================================== */

const ProductCard = memo(function ProductCard({ product, onAdd }) {
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
        {product.image ? (
          <img src={product.image} alt={product.name} className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <div className="h-full grid place-items-center text-[#d4d4d8]">
            <Store size={28} />
          </div>
        )}
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
      {safeProducts.map((p) => (
        <ProductCard key={p.id} product={p} onAdd={onAdd} />
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
  const { online, addPending, pendingCount, syncing, syncNow } = useOffline();
  const printerStatus = getPrinterStatus();
  // Mode offline (offline-first) per perangkat — default MATI. Saat mati & server tidak
  // terjangkau, POS diblokir total sampai koneksi normal (lihat gate render di bawah).
  const offlineEnabled = !!getDeviceConfig().offlineMode;
  const [serverDown, setServerDown] = useState(false);
  const [biz, setBiz] = useState(bizCache());
  const [orderType, setOrderType] = useState("take_away");
  const ui = useUI();
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [tables, setTables] = useState([]);
  const [pms, setPms] = useState([]);
  const [activeCat, setActiveCat] = useState("all");
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState([]);
  const [table, setTable] = useState(null);
  const [currentOrderId, setCurrentOrderId] = useState(null);
  const [discType, setDiscType] = useState("none");
  const [discVal, setDiscVal] = useState(0);
  const [payOpen, setPayOpen] = useState(false);
  const [tableOpen, setTableOpen] = useState(false);
  const [receipt, setReceipt] = useState(null);
  const [cacheAt, setCacheAt] = useState(() => localStorage.getItem("gak_pos_cache_at"));
  const [shift, setShift] = useState(undefined);
  const [openingCash, setOpeningCash] = useState("");
  const [openingCashRetail, setOpeningCashRetail] = useState("");
  // Bill terbuka (dine-in) yang sedang dibatalkan lewat VoidDialog
  const [voidBill, setVoidBill] = useState(null);
  const [barcode, setBarcode] = useState("");
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
    api.get("/shifts/current").then((r) => setShift(r.data || null)).catch(() => {
      if (getDeviceConfig().offlineMode) setShift({ offline: true });
      else setServerDown(true); // mode offline mati -> blokir sampai server normal
    });
  }, []);

  const relevantTypes = useMemo(() => {
    return orderType === "retail" ? ["retail"] : ["makanan", "minuman", "vendor"];
  }, [orderType]);
  const cats = useMemo(() => {
    return (categories || []).filter((c) => relevantTypes.includes(c.type));
  }, [categories, relevantTypes]);

  const visibleProducts = useMemo(() => {
    return (products || []).filter((p) => {
      if (!p) return false;
      if (!relevantTypes.includes(p.type)) return false;
      if (activeCat !== "all" && p.category_id !== activeCat) return false;
      if (search && !p.name?.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
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
    try {
      // Shift harian bersama: satu tombol membuka F&B & Retail (kas awal terpisah).
      const { data } = await api.post("/shifts/open", {
        opening_cash_fnb: Number(openingCash || 0),
        opening_cash_retail: Number(openingCashRetail || 0),
      });
      setShift(data);
      toast.success("Shift hari ini dibuka. POS siap digunakan.");
    } catch (e) { toast.error(apiError(e.response?.data?.detail), { duration: 9000 }); }
  };
  const handleBarcode = (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const code = barcode.trim();
    if (!code) return;
    const found = products.find((p) => (p.sku || "").toLowerCase() === code.toLowerCase());
    if (found) { addItem(found); setBarcode(""); }
    else { toast.error(`Produk kode "${code}" tidak ditemukan`); setBarcode(""); }
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
    } catch (e) { toast.error(apiError(e.response?.data?.detail)); }
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
          items: cart.map((i) => ({ product_id: i.product_id, qty: i.qty, weight: i.weight || null })),
          discount_type: discType, discount_value: Number(discVal),
          member_id: opts.member_id || null, redeem_points: Number(opts.redeem_points || 0),
          discount_reason: opts.discount_reason || null, coupon_code: opts.coupon_code || null,
          pay_now: true, payment_method: pm.id,
          amount_paid: opts.splits ? null : amountPaid,
          splits: opts.splits || null,
        });
        data = r.data;
      }
      setPayOpen(false);
      setReceipt(data);
      // Auto-print struk (buka laci juga) bila diaktifkan
      if (getDeviceConfig().autoPrint) {
        try { printReceipt(data); } catch (e) {}
      }
      resetSale();
      load();
      toast.success("Pembayaran berhasil");
    } catch (e) { toast.error(apiError(e.response?.data?.detail)); }
  };

  if (shift === undefined) {
    return <div className="h-screen grid place-items-center"><div className="animate-pulse text-[#E63946] font-bold">Memuat…</div></div>;
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
  if (shift === null) {
    return (
      <div className="h-screen grid place-items-center bg-[#F4F5F7] p-6" data-testid="shift-gate">
        <div className="w-full max-w-md bg-white rounded-2xl border p-7 text-center">
          <div className="h-14 w-14 rounded-2xl bg-[#FEF2F2] grid place-items-center mx-auto mb-4"><Clock className="text-[#E63946]" /></div>
          <h2 className="text-2xl font-extrabold">Buka Shift Dulu</h2>
          <p className="text-sm text-[#52525B] mt-1 mb-5">
            Satu shift per hari untuk F&amp;B &amp; Retail. Isi kas awal tiap toko, lalu semua akun
            bisa langsung memakai shift ini (tidak perlu buka shift baru).
          </p>
          <label className="text-xs uppercase tracking-wider font-bold text-[#52525B] text-left block">Kas Awal F&amp;B</label>
          <input data-testid="gate-opening-cash" type="number" value={openingCash} onChange={(e) => setOpeningCash(e.target.value)}
            placeholder="0" className="w-full h-12 rounded-xl border px-3 mt-1.5 font-num text-lg" autoFocus />
          <label className="text-xs uppercase tracking-wider font-bold text-[#52525B] text-left block mt-3">Kas Awal Retail</label>
          <input data-testid="gate-opening-cash-retail" type="number" value={openingCashRetail} onChange={(e) => setOpeningCashRetail(e.target.value)}
            placeholder="0" className="w-full h-12 rounded-xl border px-3 mt-1.5 font-num text-lg" />
          <button data-testid="gate-open-shift-btn" onClick={openShiftInline}
            className="tap w-full py-3 mt-4 rounded-xl bg-[#E63946] hover:bg-[#BE123C] text-white font-bold flex items-center justify-center gap-2">
            <Play size={16} /> Buka Shift F&amp;B &amp; Retail
          </button>
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
          <div className="p-2.5 sm:p-3 border-b bg-white space-y-2 shrink-0">
            <div className="relative">
              <ScanLine size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#E63946]" />
              <input
                data-testid="barcode-input"
                value={barcode}
                onChange={(e) => setBarcode(e.target.value)}
                onKeyDown={handleBarcode}
                placeholder="Scan / ketik SKU produk lalu Enter"
                className="w-full h-11 sm:h-12 pl-10 pr-3 rounded-xl border-2 border-[#E63946] outline-none font-num text-sm"
                autoFocus
              />
            </div>
            <div className="relative">
              <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#a1a1aa]" />
              <input
                data-testid="product-search"
                value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder="Cari nama produk..."
                className="w-full h-10 sm:h-12 pl-10 pr-3 rounded-xl border border-[#E4E4E7] focus:border-[#E63946] outline-none text-sm"
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto no-scrollbar p-2.5 sm:p-3">
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
            <div className="px-4 py-2 text-xs sm:text-sm font-bold ot-dine_in border-y shrink-0">
              Meja: {table.name} {currentOrderId ? "· Open Bill" : ""}
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

      <TableDialog open={tableOpen} onClose={() => setTableOpen(false)} tables={tables} onSelect={selectTable}
        onCancelBill={(t) => { setTableOpen(false); setVoidBill({ id: t.open_order_id, order_number: t.name, status: "open", order_type: "dine_in", items: [], total: 0 }); }} />
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
    </div>
  );
}

function TableDialog({ open, onClose, tables = [], onSelect, onCancelBill }) {
  const safeTables = Array.isArray(tables) ? tables : [];
  const areas = [...new Set(safeTables.filter((t) => t?.active).map((t) => t.area).filter(Boolean))];
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>Pilih Meja (Dine-In)</DialogTitle></DialogHeader>
        <div className="max-h-[60vh] overflow-y-auto space-y-4">
          {safeTables.filter((t) => t?.active).length === 0 && <p className="text-sm text-[#52525B]">Belum ada meja aktif. Tambahkan di menu Meja.</p>}
          {areas.map((area) => (
            <div key={area}>
              <div className="text-xs uppercase tracking-wider font-bold text-[#52525B] mb-2">{area}</div>
              <div className="grid grid-cols-5 gap-2">
                {safeTables.filter((t) => t?.active && t?.area === area).map((t) => (
                  <div key={t.id} className="flex flex-col gap-1">
                    <button
                      data-testid={`table-opt-${t.id}`} onClick={() => onSelect(t)}
                      className={`tap h-14 rounded-lg border-2 font-bold flex flex-col items-center justify-center ${
                        t.status === "open_bill" ? "tbl-open_bill" : "tbl-empty"
                      }`}
                    >
                      <span className="text-sm">{t.name}</span>
                      <span className="text-[9px] mt-0.5">{t.status === "open_bill" ? "OPEN BILL" : `${t.capacity} kursi`}</span>
                    </button>
                    {t.status === "open_bill" && t.open_order_id && onCancelBill && (
                      <button data-testid={`cancel-bill-${t.id}`} onClick={() => onCancelBill(t)}
                        title="Batalkan bill terbuka (alasan wajib, tercatat)"
                        className="tap h-7 rounded-lg bg-[#FEE2E2] text-[#B91C1C] text-[11px] font-bold">
                        Batalkan
                      </button>
                    )}
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
    if (open) { setSelected([]); setPaid1(""); setPaid2(""); setMember(null); setPhone(""); setRedeemPts(""); setDiscReason(""); setCouponCode(""); }
  }, [open]);
  const method = selected[0] || null;
  const second = selected[1] || null;
  const isSplit = selected.length === 2;
  const isCash1 = method?.type === "cash";
  const amt1 = Number(paid1 || 0) || 0;
  const amt2 = Number(paid2 || 0) || 0;
  const splitTotal = amt1 + amt2;
  const change = (singlePaid() - total); // hanya utk 1 metode tunai
  function singlePaid() {
    if (isSplit) return 0;
    return isCash1 ? amt1 : total;
  }
  const quick = [total, 50000, 100000, 150000, 200000];
  const pointRate = Math.max(1, Number(biz?.member_redeem_per_point || 100));
  const redeemVal = Math.min(Number(redeemPts || 0) || 0, member?.points || 0) * pointRate;
  const payable = Math.max(0, total - redeemVal);
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

        {/* Isian jumlah per metode */}
        {selected.length === 1 && method?.type === "cash" && (
          <div className="space-y-2">
            <input data-testid="cash-amount" type="number" value={paid1} onChange={(e) => setPaid1(e.target.value)}
              placeholder="Jumlah bayar" className="w-full h-12 rounded-xl border px-3 font-num text-lg" />
            <div className="flex flex-wrap gap-2">
              {quick.map((q) => (
                <button key={q} onClick={() => setPaid1(String(q))} className="tap px-3 h-9 rounded-lg bg-[#F4F5F7] text-sm font-num font-bold">
                  {rupiah(q)}
                </button>
              ))}
            </div>
            {amt1 >= total && <div className="flex justify-between font-bold"><span>Kembalian</span><span className="font-num text-[#047857]">{rupiah(amt1 - total)}</span></div>}
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
                {pm.type === "cash" && (
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
  if (!order) return null;
  return (
    <Dialog open={!!order} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader><DialogTitle className="flex items-center gap-2 text-[#047857]"><CheckCircle2 /> Transaksi Selesai</DialogTitle></DialogHeader>
        <div className="text-center">
          {order.offline && <div data-testid="offline-receipt-badge" className="inline-block bg-[#0A0A0A] text-white text-xs font-bold px-3 py-1 rounded-full mb-2">STRUK OFFLINE — BELUM DISINKRON</div>}
          <div className="font-num text-sm text-[#52525B]">{order.order_number}</div>
          <div className="font-num text-3xl font-extrabold mt-1">{rupiah(order.total)}</div>
          {order.change > 0 && <div className="text-sm mt-1">Kembalian: <span className="font-num font-bold">{rupiah(order.change)}</span></div>}
        </div>
        <DialogFooter className="flex-col gap-2 sm:flex-col">
          <button data-testid="print-receipt-btn" onClick={() => printReceipt(order)} className="tap w-full h-12 rounded-xl bg-[#0A0A0A] text-white font-bold flex items-center justify-center gap-2">
            <Receipt size={18} /> Cetak Struk
          </button>
          <button onClick={onClose} className="tap w-full h-12 rounded-xl bg-[#F4F5F7] font-bold">Transaksi Baru</button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
