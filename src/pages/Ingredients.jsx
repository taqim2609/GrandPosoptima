/* ================================================================
   BAHAN & BELANJA — master bahan, daftar belanja, PEMBELIAN & STOK OPNAME.
   Izin (Roles & Izin): master = Produk; belanja/daftar & pembelian =
   "Pembelian Bahan & Daftar Belanja" (belanja_bahan); opname = "Stok
   Opname Bahan" (opname_bahan). Input pembelian & opname bisa massal,
   dan pembelian bisa lewat SCAN FAKTUR (AI Vision).
   ================================================================ */
import { useEffect, useState, useCallback, useRef } from "react";
import api, { apiError } from "@/lib/api";
import { toast } from "sonner";
import { wibToday } from "@/lib/format";
import { useAuth } from "@/context/AuthContext";
import { can, canAny } from "@/lib/rbac";
import {
  Boxes, Plus, Trash2, Loader2, ShoppingCart, Pencil, ClipboardList,
  Printer, MessageCircle, RefreshCw, Save, X, AlertTriangle, ScanLine, Wallet, History,
  Tags, ShieldAlert, Sparkles,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { printText } from "@/lib/print";
import AiIngredientRecommendationModal from "@/components/AiIngredientRecommendationModal";

const nf = (n) => (n == null ? "0" : Number(n).toLocaleString("id-ID", { maximumFractionDigits: 2 }));
const fmtRp = (n) => "Rp" + Math.round(Number(n || 0)).toLocaleString("id-ID");

export default function IngredientsPage() {
  const { user } = useAuth();
  const me = user?.role_base === "admin" ? { ...user, perms: [...(user.perms || []), "produk", "belanja_bahan", "opname_bahan"] } : user;
  const produk = can(me, "produk");
  const belanja = canAny(me, ["produk", "belanja_bahan"]);
  const opname = canAny(me, ["produk", "opname_bahan"]);

  const initialTab = () => { try { return new URLSearchParams(window.location.search).get("tab") || "bahan"; } catch (e) { return "bahan"; } };
  const [tab, setTab] = useState(initialTab);
  const [loading, setLoading] = useState(true);
  const [ings, setIngs] = useState([]);
  const [list, setList] = useState(null);
  const [listDirty, setListDirty] = useState(false);
  const [date, setDate] = useState(wibToday());
  const [shopSet, setShopSet] = useState({ recipients: [], request_on_close: false });
  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: "", unit: "", stock: 0, min_stock: 0, cost: 0, note: "" });
  // kategori bahan: master (cats) + izin kategori milik akun ini (catMeta)
  const [cats, setCats] = useState([]);
  // `loaded` = daftar kategori berhasil dibaca server. Kalau endpoint belum ada di server
  // (mis. Pi belum di-update), layar TIDAK dikunci — pembatasan tetap ditegakkan server.
  const [catMeta, setCatMeta] = useState({ mine: [], allow_all: false, can_manage: false, loaded: false });
  const [formCats, setFormCats] = useState([]);
  const [catOpen, setCatOpen] = useState(false);
  const [newCat, setNewCat] = useState("");
  const [catEdit, setCatEdit] = useState(null);   // {id, name} sedang diubah namanya
  const [opCat, setOpCat] = useState("");         // filter kategori di tab Stok Opname
  const [buyTarget, setBuyTarget] = useState(null);
  const [buyForm, setBuyForm] = useState({ qty: "", unit_cost: "", note: "" });
  const [opTarget, setOpTarget] = useState(null);
  const [opForm, setOpForm] = useState({ counted: "", note: "" });
  const [saving, setSaving] = useState(false);
  // tab Pembelian
  const [purDate, setPurDate] = useState(wibToday());
  const [purchases, setPurchases] = useState([]);
  const [bulkRows, setBulkRows] = useState([]); // [{ingredient_id, qty, cost}]
  // tab Opname
  const [opDate, setOpDate] = useState(wibToday());
  const [opRows, setOpRows] = useState({});   // ingredient_id -> nilai hitung
  const [opHist, setOpHist] = useState([]);
  // Vision scan
  const fileRef = useRef(null);
  const [scanBusy, setScanBusy] = useState(false);
  const [scanRows, setScanRows] = useState(null); // hasil edit {name,qty,unit,amount}
  // AI Recipe & Ingredient Recommendation
  const [aiModalOpen, setAiModalOpen] = useState(false);

  const handleApplyAiToShoppingList = (aiItems) => {
    setList((curr) => {
      const existing = [...(curr?.items || [])];
      aiItems.forEach((aiItem) => {
        const existIdx = existing.findIndex((x) => x.ingredient_id === aiItem.ingredient_id);
        if (existIdx >= 0) {
          existing[existIdx] = {
            ...existing[existIdx],
            qty: Number(aiItem.qty || 1),
            cost: aiItem.cost || existing[existIdx].cost,
            auto: true,
            note: aiItem.note || existing[existIdx].note,
          };
        } else {
          existing.push(aiItem);
        }
      });
      return { ...(curr || { date }), items: existing };
    });
    setListDirty(true);
    setTab("belanja");
    toast.success(`${aiItems.length} bahan dimasukkan ke Daftar Belanja`);
  };

  const handleApplyAiToBulkPurchase = (aiItems) => {
    setTab("pembelian");
    const newRows = aiItems.map((aiItem) => ({
      ingredient_id: aiItem.ingredient_id,
      qty: aiItem.qty || 1,
      cost: aiItem.cost || "",
    }));
    setBulkRows(newRows);
    toast.success(`${aiItems.length} bahan siap disimpan di Pembelian Massal`);
  };

  const loadIngs = useCallback(() => api.get("/ingredients").then((r) => setIngs(r.data || [])).catch(() => {}), []);
  const loadCats = useCallback(() => api.get("/ingredient-categories")
    .then((r) => {
      setCats(r.data?.items || []);
      setCatMeta({ mine: r.data?.mine || [], allow_all: !!r.data?.allow_all, can_manage: !!r.data?.can_manage, loaded: true });
    })
    .catch(() => setCatMeta((m) => ({ ...m, loaded: false }))), []);
  const loadList = useCallback((d) => {
    setLoading(true);
    api.get("/shopping-list", { params: { date: d } })
      .then((r) => { setList(r.data || { date: d, items: [] }); setListDirty(false); })
      .catch((e) => toast.error(apiError(e.response?.data?.detail)))
      .finally(() => setLoading(false));
  }, []);
  const loadShopSet = useCallback(() => api.get("/settings/shopping").then((r) => setShopSet(r.data || {})).catch(() => {}), []);
  const loadPur = useCallback((d) => {
    api.get("/ingredient-purchases", { params: { date: d } })
      .then((r) => setPurchases(r.data || []))
      .catch(() => {});
  }, []);
  const loadOpHist = useCallback((d) => {
    api.get("/ingredient-opname", { params: { date: d } })
      .then((r) => setOpHist(r.data || []))
      .catch(() => {});
  }, []);

  useEffect(() => { loadIngs(); loadCats(); loadList(date); loadShopSet(); }, [loadIngs, loadCats, loadList, loadShopSet, date]);
  useEffect(() => { if (tab === "pembelian") loadPur(purDate); if (tab === "opname") loadOpHist(opDate); }, [tab, purDate, opDate, loadPur, loadOpHist]);

  // hanya tab yang boleh sesuai role
  const allowedTabs = [];
  if (produk) allowedTabs.push("bahan");
  if (belanja) allowedTabs.push("belanja", "pembelian");
  if (opname) allowedTabs.push("opname");
  const allowedTabsKey = allowedTabs.join(",");
  useEffect(() => {
    if (!allowedTabs.includes(tab)) setTab(allowedTabs[0] || "bahan");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, allowedTabsKey]);

  // ---------- master bahan ----------
  const openNew = () => { setEditing(null); setForm({ name: "", unit: "", stock: 0, min_stock: 0, cost: 0, note: "" }); setFormCats([]); setEditOpen(true); };
  const openEdit = (b) => {
    setEditing(b); setForm({ name: b.name, unit: b.unit || "", stock: b.stock, min_stock: b.min_stock, cost: b.cost, note: b.note || "" });
    setFormCats(b.categories || []); setEditOpen(true);
  };
  const saveBahan = async () => {
    if (!form.name.trim()) return toast.error("Nama bahan wajib diisi");
    setSaving(true);
    try {
      const body = { name: form.name, unit: form.unit, min_stock: Number(form.min_stock || 0), cost: Number(form.cost || 0), note: form.note, active: true, categories: formCats };
      if (editing) {
        await api.put(`/ingredients/${editing.id}`, { ...body, stock: Number(form.stock || 0) });
        toast.success("Bahan diperbarui");
      } else {
        await api.post("/ingredients", { ...body, stock: Number(form.stock || 0) });
        toast.success("Bahan ditambahkan");
      }
      setEditOpen(false); await loadIngs(); await loadCats();
    } catch (e) { toast.error(apiError(e.response?.data?.detail)); } finally { setSaving(false); }
  };
  // ---------- kategori bahan ----------
  const addCat = async () => {
    const name = newCat.trim();
    if (!name) return;
    try {
      await api.post("/ingredient-categories", { name });
      setNewCat(""); toast.success(`Kategori "${name}" dibuat`); await loadCats();
    } catch (e) { toast.error(apiError(e.response?.data?.detail)); }
  };
  const renameCat = async () => {
    if (!catEdit || !catEdit.name.trim()) return;
    try {
      await api.put(`/ingredient-categories/${catEdit.id}`, { name: catEdit.name });
      setCatEdit(null); toast.success("Nama kategori diperbarui"); await loadCats(); await loadIngs();
    } catch (e) { toast.error(apiError(e.response?.data?.detail)); }
  };
  const delCat = async (c) => {
    if (!window.confirm(`Hapus kategori "${c.name}"? Kategori ini akan dilepas dari ${c.ingredient_count || 0} bahan dan dari akun yang memakainya.`)) return;
    try {
      const { data } = await api.delete(`/ingredient-categories/${c.id}`);
      toast.success(`Kategori "${c.name}" dihapus (dilepas dari ${data.removed_from_ingredients} bahan)`);
      await loadCats(); await loadIngs();
    } catch (e) { toast.error(apiError(e.response?.data?.detail)); }
  };
  const toggleFormCat = (id) => setFormCats((cs) => (cs.includes(id) ? cs.filter((x) => x !== id) : [...cs, id]));
  const delBahan = async (b) => {
    if (!window.confirm(`Hapus bahan "${b.name}" beserta riwayatnya?`)) return;
    try { await api.delete(`/ingredients/${b.id}`); toast.success("Bahan dihapus"); await loadIngs(); } catch (e) { toast.error(apiError(e.response?.data?.detail)); }
  };
  const openBuy = (b) => { setBuyTarget(b); setBuyForm({ qty: "", unit_cost: b.cost || "", note: "" }); };
  const saveBuy = async () => {
    const qty = Number(buyForm.qty);
    if (!(qty > 0)) return toast.error("Jumlah beli harus > 0");
    setSaving(true);
    try {
      const { data } = await api.post(`/ingredients/${buyTarget.id}/purchase`, { qty, unit_cost: Number(buyForm.unit_cost || 0), note: buyForm.note });
      toast.success(`${buyTarget.name} +${data.qty}${data.unit ? " " + data.unit : ""} — stok ${data.new_stock}`);
      setBuyTarget(null); await loadIngs(); await loadPur(purDate);
    } catch (e) { toast.error(apiError(e.response?.data?.detail)); } finally { setSaving(false); }
  };
  const openOp = (b) => { setOpTarget(b); setOpForm({ counted: b.stock, note: "" }); };
  const saveOp = async () => {
    const counted = Number(opForm.counted);
    if (counted < 0) return toast.error("Stok hasil hitung tidak valid");
    setSaving(true);
    try {
      const { data } = await api.post(`/ingredients/${opTarget.id}/opname`, { counted_stock: counted, note: opForm.note });
      toast.success(`Opname ${opTarget.name}: selisih ${data.difference > 0 ? "+" : ""}${data.difference}`);
      setOpTarget(null); await loadIngs(); await loadOpHist(opDate);
    } catch (e) { toast.error(apiError(e.response?.data?.detail)); } finally { setSaving(false); }
  };

  // ---------- daftar belanja ----------
  const autoSuggest = async () => {
    try {
      const { data } = await api.get("/shopping-list/suggest");
      setList((cur) => {
        const curItems = cur?.items || [];
        const names = new Set(curItems.map((i) => i.name.toLowerCase()));
        const merged = curItems.map((i) => ({ ...i }));
        for (const a of data.items || []) if (!names.has(a.name.toLowerCase())) merged.push({ ...a, auto: true });
        return { date, items: merged, note: cur?.note || "" };
      });
      setListDirty(true);
      toast.success(`${(data.items || []).length} bahan otomatis (stok ≤ minimum)`);
    } catch (e) { toast.error(apiError(e.response?.data?.detail)); }
  };
  const addManualRow = (ingId) => {
    setList((cur) => {
      const items = cur?.items ? [...cur.items] : [];
      if (ingId) {
        const b = ings.find((x) => x.id === ingId);
        if (!b || items.some((i) => i.ingredient_id === ingId)) return cur;
        items.push({ ingredient_id: b.id, name: b.name, unit: b.unit || "", qty: 0, stock: b.stock, min_stock: b.min_stock, cost: b.cost, auto: false });
      } else items.push({ ingredient_id: null, name: "", unit: "", qty: 0, stock: 0, min_stock: 0, cost: 0, auto: false });
      return { ...(cur || { date, items: [] }), items };
    });
    setListDirty(true);
  };
  const updRow = (idx, patch) => {
    setList((cur) => ({ ...(cur || { date, items: [] }), items: (cur?.items || []).map((x, i) => (i === idx ? { ...x, ...patch } : x)) }));
    setListDirty(true);
  };
  const delRow = (idx) => { setList((cur) => ({ ...cur, items: (cur?.items || []).filter((_, i) => i !== idx) })); setListDirty(true); };
  const saveList = async () => {
    setSaving(true);
    try {
      const items = (list?.items || []).filter((i) => (i.name || "").trim() && Number(i.qty) > 0);
      await api.put("/shopping-list", { date, items: items.map((i) => ({ ingredient_id: i.ingredient_id, name: i.name, unit: i.unit, qty: i.qty, stock: i.stock, min_stock: i.min_stock, cost: i.cost, note: i.note })), note: "" });
      setListDirty(false);
      toast.success(`Daftar belanja ${date} tersimpan (${items.length} item)`);
    } catch (e) { toast.error(apiError(e.response?.data?.detail)); } finally { setSaving(false); }
  };
  /* Cetak daftar belanja — jalur printer thermal (Sunmi/Bluetooth) lewat printText(),
     jadi bisa dicetak dari APK; di web tetap membuka jendela cetak browser.
     Format teks monospace (bukan tabel HTML) supaya muat kertas 80mm. */
  const buildListText = (items) => {
    const total = items.reduce((s2, i) => s2 + Number(i.cost || 0) * Number(i.qty || 0), 0);
    const W = 42;
    const line = (l, r) => {
      const left = String(l);
      const right = String(r == null ? "" : r);
      const pad = Math.max(1, W - left.length - right.length);
      return left + " ".repeat(pad) + right;
    };
    const out = [];
    out.push("DAFTAR BELANJA BAHAN");
    out.push(`Tanggal: ${date}`);
    out.push(`${items.length} item`);
    out.push("--------------------------------");
    out.push(line("#  BAHAN", "JUMLAH"));
    out.push("--------------------------------");
    items.forEach((i, n) => {
      const qty = `${nf(i.qty)} ${i.unit || ""}`.trim();
      out.push(line(`${n + 1}. ${i.name}`, qty));
      if (i.cost) out.push(line("   perkiraan", fmtRp(Number(i.cost) * Number(i.qty))));
      if (i.note) out.push(`   catatan: ${i.note}`);
    });
    out.push("--------------------------------");
    if (total) out.push(line("ESTIMASI TOTAL", fmtRp(total)));
    out.push("");
    return out.join("\n");
  };
  const doPrint = () => {
    const items = (list?.items || []).filter((i) => (i.name || "").trim() && Number(i.qty) > 0);
    if (!items.length) return toast.error("Belum ada item");
    printText(buildListText(items), `Daftar Belanja ${date}`);
  };
  const sendWa = async () => {
    const items = (list?.items || []).filter((i) => (i.name || "").trim() && Number(i.qty) > 0);
    if (!items.length) return toast.error("Belum ada item");
    if (!(shopSet.recipients || []).length) return toast.error("Atur nomor WhatsApp tujuan belanja di Pengaturan → WhatsApp & Laporan dulu");
    setSaving(true);
    try {
      const { data } = await api.post("/shopping-list/send-wa", {
        date,
        items: items.map((i) => ({ ingredient_id: i.ingredient_id, name: i.name, unit: i.unit, qty: i.qty, cost: i.cost, note: i.note })),
      });
      toast.success(`Daftar belanja terkirim ke WhatsApp (${(data?.sent || []).filter((s) => s.ok).length} nomor)`);
    } catch (e) { toast.error(apiError(e.response?.data?.detail)); } finally { setSaving(false); }
  };
  const estTotal = (list?.items || []).filter((i) => i.name?.trim() && Number(i.qty) > 0).reduce((s, i) => s + Number(i.cost || 0) * Number(i.qty || 0), 0);
  const itemCount = (list?.items || []).filter((i) => i.name?.trim() && Number(i.qty) > 0).length;

  // ---------- tab PEMBELIAN: baris massal + scan vision ----------
  const addBulkRow = () => {
    if (!ings.length) return toast.error("Belum ada bahan di master");
    const b = ings.find((x) => !bulkRows.some((r) => r.ingredient_id === x.id)) || ings[0];
    if (bulkRows.some((r) => r.ingredient_id === b.id)) return toast.error("Semua bahan sudah masuk baris");
    setBulkRows((rs) => [...rs, { ingredient_id: b.id, qty: "", cost: b.cost || "" }]);
  };
  const updBulk = (i, patch) => setBulkRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const saveBulk = async () => {
    const items = bulkRows.map((r) => ({ ingredient_id: r.ingredient_id, qty: Number(r.qty), unit_cost: Number(r.cost || 0) }))
      .filter((r) => r.qty > 0);
    if (!items.length) return toast.error("Isi jumlah beli minimal 1 baris");
    setSaving(true);
    try {
      const { data } = await api.post("/ingredients/purchase-bulk", { items });
      toast.success(`Pembelian tersimpan: ${data.count} bahan`);
      setBulkRows([]); await loadIngs(); await loadPur(purDate);
    } catch (e) { toast.error(apiError(e.response?.data?.detail)); } finally { setSaving(false); }
  };
  // scan faktur (vision)
  const onPickFile = async (file) => {
    if (!file) return;
    if (!/^image\//.test(file.type)) return toast.error("Pilih file gambar struk/faktur");
    setScanBusy(true);
    const t = toast.loading("Membaca struk dengan AI…");
    try {
      const b64 = await new Promise((res, rej) => {
        const rd = new FileReader();
        rd.onload = () => res(String(rd.result).split(",")[1]);
        rd.onerror = rej;
        rd.readAsDataURL(file);
      });
      const { data } = await api.post("/ai/ingredient-vision", { image: b64 });
      toast.success(`AI membaca ${(data?.items || []).length} item — periksa lalu simpan`, { id: t, duration: 6000 });
      setScanRows((data?.items || []).map((x) => ({ ...x })));
    } catch (e) { toast.error(apiError(e.response?.data?.detail), { id: t, duration: 9000 }); }
    finally { setScanBusy(false); }
  };
  const commitScan = async () => {
    const items = (scanRows || []).filter((r) => (r.name || "").trim() && Number(r.qty) > 0);
    if (!items.length) return toast.error("Tidak ada baris valid");
    setSaving(true);
    try {
      const { data } = await api.post("/ingredients/vision-commit", { items });
      const created = data?.created || [], updated = data?.updated || [];
      toast.success(`Tersimpan: ${created.length} bahan baru, ${updated.length} stok bertambah`);
      setScanRows(null); await loadIngs(); await loadPur(purDate);
    } catch (e) { toast.error(apiError(e.response?.data?.detail)); } finally { setSaving(false); }
  };

  // ---------- tab OPNAME: massal ----------
  const setOpVal = (id, v) => setOpRows((o) => ({ ...o, [id]: v }));
  const saveOpBulk = async () => {
    const items = opIngs
      .filter((b) => opRows[b.id] !== undefined && opRows[b.id] !== "" && opRows[b.id] !== null)
      .map((b) => ({ ingredient_id: b.id, counted_stock: Number(opRows[b.id]) }))
      .filter((x) => isFinite(x.counted_stock) && x.counted_stock >= 0);
    if (!items.length) return toast.error("Isi stok fisik minimal 1 bahan");
    if (!window.confirm(`Simpan opname ${items.length} bahan? Stok akan disesuaikan dengan hasil hitung.`)) return;
    setSaving(true);
    try {
      const { data } = await api.post("/ingredients/opname-bulk", { items });
      toast.success(`Opname tersimpan: ${data.count} bahan`);
      setOpRows({}); await loadIngs(); await loadOpHist(opDate);
    } catch (e) { toast.error(apiError(e.response?.data?.detail)); } finally { setSaving(false); }
  };

  const lowCount = ings.filter((i) => i.low).length;
  const sumPur = purchases.reduce((s, p) => s + Number(p.total_cost || 0), 0);
  // ---- Izin kategori bahan untuk STOK OPNAME (per akun) ----
  // allowed_opname dikirim server per bahan. Backend lama belum punya field itu →
  // dianggap boleh (jangan sampai layar kosong hanya karena server belum di-update).
  const opAllowed = (b) => b.allowed_opname !== false;
  const myCatOpts = catMeta.allow_all ? cats : cats.filter((c) => (catMeta.mine || []).includes(c.id));
  const noCatPerm = catMeta.loaded && !catMeta.allow_all && (catMeta.mine || []).length === 0;
  const opIngs = ings.filter((b) => opAllowed(b) && (!opCat || (b.categories || []).includes(opCat)));
  const opBlockedCount = ings.filter((b) => !opAllowed(b)).length;
  const opCatName = (b) => (b.category_names || []).join(", ");
  const changedOp = opIngs.filter((b) => opRows[b.id] !== undefined && opRows[b.id] !== "" && Number(opRows[b.id]) >= 0);

  // ---------- import excel master bahan ----------
  const fileXlsxRef = useRef(null);
  const [impBusy, setImpBusy] = useState(false);
  const doImport = async (file) => {
    if (!file) return;
    if (!/\.(xlsx|xlsm)$/i.test(file.name)) return toast.error("File harus .xlsx");
    setImpBusy(true);
    const fd = new FormData();
    fd.append("file", file);
    try {
      const { data } = await api.post("/ingredients/import", fd);
      toast.success(`Import selesai: ${(data?.created || []).length} bahan baru, ${(data?.updated || []).length} diperbarui`);
      await loadIngs();
    } catch (e) { toast.error(apiError(e.response?.data?.detail)); }
    finally { setImpBusy(false); }
  };

  return (
    <div className="h-full overflow-y-auto p-6 lg:p-8" data-testid="ingredients-page">
      <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
        <h1 className="text-3xl font-extrabold flex items-center gap-2"><Boxes /> Bahan &amp; Belanja</h1>
        {tab === "bahan" && produk && (
          <div className="flex gap-2 flex-wrap">
            <button data-testid="manage-cats-btn" onClick={() => { setCatOpen(true); setCatEdit(null); }} disabled={!catMeta.can_manage}
              title={catMeta.can_manage ? "Buat/ubah nama kategori bahan" : "Butuh izin Produk & Stok"}
              className="tap h-11 px-4 rounded-xl bg-white border font-bold text-sm flex items-center gap-2 disabled:opacity-50">
              <Tags size={16} /> Kategori Bahan{cats.length ? ` (${cats.length})` : ""}
            </button>
            <button data-testid="import-bahan-btn" onClick={() => fileXlsxRef.current?.click()} disabled={impBusy}
              className="tap h-11 px-4 rounded-xl bg-white border font-bold text-sm flex items-center gap-2 disabled:opacity-60">
              {impBusy ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} className="rotate-90" />} Import Excel
            </button>
            <input ref={fileXlsxRef} type="file" accept=".xlsx,.xlsm" className="hidden" onChange={(e) => { doImport(e.target.files?.[0]); e.target.value = ""; }} />
            <button data-testid="add-bahan-btn" onClick={openNew} className="tap h-11 px-5 rounded-xl bg-[#E63946] hover:bg-[#BE123C] text-white font-bold flex items-center gap-2"><Plus size={18} /> Bahan Baru</button>
          </div>
        )}
      </div>
      {tab === "bahan" && produk && (
        <p className="text-[11px] text-[#a1a1aa] -mt-2 mb-4">
          Import Excel: kolom pertama = judul — <span className="font-mono bg-[#F4F5F7] px-1 rounded">Nama | Satuan | Stok | Stok Minimum | Harga Beli | Catatan | Kategori</span>.
          Bahan dengan nama sama akan diperbarui (satuan/min/harga/kategori bila diisi; stok tidak ditimpa).
          Kolom <b>Kategori</b> boleh berisi beberapa kategori dipisah koma — kategori baru dibuat otomatis.
        </p>
      )}
      {tab === "bahan" && produk && (
        <div className="bg-[#FFFBEB] border border-[#FDE68A] rounded-2xl px-4 py-3 mb-4 text-xs text-[#92400E] flex items-start gap-2">
          <Tags size={15} className="shrink-0 mt-0.5" />
          <span>
            <b>Kategori bahan</b> menentukan siapa yang boleh mengisi <b>stok opname</b> bahan tersebut.
            Setiap bahan boleh punya beberapa kategori; kategori yang boleh diisi tiap akun diatur di
            <b> Pengaturan → Pengguna → Kategori Bahan</b> pada akun yang bersangkutan
            {noCatPerm ? " (akun Anda sendiri belum diberi kategori apa pun — sebagai admin Anda bisa mengaturnya di sana)" : ""}.
          </span>
        </div>
      )}

      <div className="flex gap-1.5 mb-5 flex-wrap">
        {allowedTabs.includes("bahan") && <TabBtn k="bahan" on={tab} set={setTab} icon={Boxes} lbl={produk ? `Master Bahan${lowCount ? ` (${lowCount} rendah)` : ""}` : "Bahan"} />}
        {allowedTabs.includes("belanja") && <TabBtn k="belanja" on={tab} set={setTab} icon={ShoppingCart} lbl="Daftar Belanja" />}
        {allowedTabs.includes("pembelian") && <TabBtn k="pembelian" on={tab} set={setTab} icon={Wallet} lbl="Pembelian Bahan" />}
        {allowedTabs.includes("opname") && <TabBtn k="opname" on={tab} set={setTab} icon={ClipboardList} lbl="Stok Opname" />}
      </div>

      {/* ============ MASTER BAHAN ============ */}
      {tab === "bahan" && (
        loading ? <Loader /> : ings.length === 0 ? (
          <div className="bg-white rounded-2xl border p-12 text-center">
            <Boxes className="mx-auto text-[#d4d4d8]" size={40} />
            <p className="mt-3 font-bold text-[#a1a1aa]">Belum ada bahan baku.</p>
            <p className="text-sm text-[#a1a1aa] mt-1">Tambahkan bahan untuk dipakai di Resep &amp; HPP, Daftar Belanja, dan Stok Opname.</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[#F4F5F7] text-[#52525B] text-xs uppercase tracking-wider">
                <tr><th className="text-left p-3">Bahan</th><th className="text-left p-3">Kategori</th><th className="text-right p-3">Stok</th><th className="text-right p-3">Min.</th>
                  <th className="text-right p-3">Harga Beli</th><th className="text-right p-3">Status</th><th className="text-right p-3">Aksi</th></tr>
              </thead>
              <tbody>
                {ings.map((b) => (
                  <tr key={b.id} className="border-t hover:bg-[#FAFAFB]" data-testid={`ing-row-${b.id}`}>
                    <td className="p-3"><div className="font-bold">{b.name}</div>
                      <div className="text-[11px] text-[#a1a1aa]">{b.unit ? `Satuan ${b.unit}` : "tanpa satuan"}{b.note ? ` · ${b.note}` : ""}</div></td>
                    <td className="p-3" data-testid={`ing-cats-${b.id}`}>
                      {(b.category_names || []).length === 0
                        ? <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded bg-[#FEF3C7] text-[#B45309]"
                            title="Tanpa kategori → hanya Super Admin yang bisa mengisi stok opname bahan ini">
                            <ShieldAlert size={11} /> belum ada kategori</span>
                        : <span className="flex flex-wrap gap-1">{(b.category_names || []).map((n) => (
                            <span key={n} className="text-[11px] font-bold px-2 py-0.5 rounded bg-[#EEF2FF] text-[#4338CA]">{n}</span>
                          ))}</span>}
                    </td>
                    <td className="p-3 text-right font-num font-extrabold">{nf(b.stock)}</td>
                    <td className="p-3 text-right font-num text-[#52525B]">{nf(b.min_stock)}</td>
                    <td className="p-3 text-right font-num">{fmtRp(b.cost)}</td>
                    <td className="p-3 text-right">{b.low
                      ? <Badge cls="bg-[#FEE2E2] text-[#EF4444]" icon={<AlertTriangle size={11} />}>Stok rendah</Badge>
                      : <Badge cls="bg-[#D1FAE5] text-[#047857]">Aman</Badge>}</td>
                    <td className="p-3">
                      <div className="flex justify-end gap-1">
                        {belanja && <Tiny title="Beli / stok masuk" color="#047857" onClick={() => openBuy(b)}><ShoppingCart size={14} /></Tiny>}
                        {opname && (opAllowed(b)
                          ? <Tiny title="Stok opname" color="#B45309" onClick={() => openOp(b)}><ClipboardList size={14} /></Tiny>
                          : <span title={"Tidak boleh diopname: kategori bahan ini (" + (opCatName(b) || "tanpa kategori") + ") tidak ada di izin akun Anda"}
                              className="h-8 w-8 rounded-lg grid place-items-center border bg-[#F4F5F7] text-[#d4d4d8] cursor-not-allowed">
                              <ShieldAlert size={14} /></span>)}
                        {produk && <Tiny title="Edit" onClick={() => openEdit(b)}><Pencil size={14} /></Tiny>}
                        {produk && <Tiny title="Hapus" danger onClick={() => delBahan(b)}><Trash2 size={14} /></Tiny>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {/* ============ DAFTAR BELANJA ============ */}
      {tab === "belanja" && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border p-4 flex items-center gap-3 flex-wrap">
            <label className="text-xs font-bold text-[#52525B] uppercase">Tanggal</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-10 rounded-xl border px-3 font-num" />
            <button
              data-testid="ai-rekomendasi-belanja-btn"
              onClick={() => setAiModalOpen(true)}
              className="tap h-10 px-4 rounded-xl bg-gradient-to-r from-[#6366F1] to-[#8B5CF6] hover:from-[#4F46E5] hover:to-[#7C3AED] text-white font-bold text-sm flex items-center gap-2 shadow-sm"
            >
              <Sparkles size={15} /> Rekomendasi Belanja AI
            </button>
            <button data-testid="belanja-auto" onClick={autoSuggest} className="tap h-10 px-4 rounded-xl bg-[#4F46E5] text-white font-bold text-sm flex items-center gap-2"><RefreshCw size={14} /> Muat Otomatis</button>
            <button onClick={() => addManualRow(null)} className="tap h-10 px-4 rounded-xl bg-[#0A0A0A] text-white font-bold text-sm flex items-center gap-2"><Plus size={14} /> Baris Manual</button>
            <select value="" onChange={(e) => { if (e.target.value) { addManualRow(e.target.value); e.target.value = ""; } }} className="h-10 rounded-xl border px-3 bg-white text-sm">
              <option value="">+ Tambah dari master…</option>
              {ings.filter((i) => !i.low).map((i) => <option key={i.id} value={i.id}>{i.name} (stok {nf(i.stock)})</option>)}
            </select>
            <div className="ml-auto text-xs font-bold text-[#52525B]">{itemCount} item · estimasi <span className="font-num">{fmtRp(estTotal)}</span></div>
          </div>
          {loading ? <Loader /> : (
            <div className="bg-white rounded-2xl border overflow-x-auto">
              {!(list?.items || []).length ? (
                <div className="p-12 text-center text-[#a1a1aa] text-sm">Belum ada item. Klik <b>Muat Otomatis</b> (stok ≤ min) atau tambah baris manual.</div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-[#F4F5F7] text-[#52525B] text-xs uppercase tracking-wider">
                    <tr><th className="p-3 w-8"></th><th className="p-3 text-left">Bahan</th><th className="p-3 text-right w-36">Jumlah beli</th>
                      <th className="p-3 text-right w-20">Stok</th><th className="p-3 text-right w-20">Min</th><th className="p-3 text-right w-32">Perkiraan</th><th className="p-3 w-10"></th></tr>
                  </thead>
                  <tbody>
                    {(list?.items || []).map((row, idx) => (
                      <tr key={idx} className="border-t">
                        <td className="p-3 pl-4">{row.auto && <span title="Otomatis (stok rendah)" className="inline-block h-2 w-2 rounded-full bg-[#EF4444]" />}</td>
                        <td className="p-3">
                          {row.ingredient_id ? <div className="font-bold">{row.name}</div> : (
                            <input value={row.name || ""} onChange={(e) => updRow(idx, { name: e.target.value })} placeholder="Nama bahan (baru)" className="w-full h-9 rounded-lg border px-2 text-sm" />)}
                          {row.auto && <div className="text-[10px] text-[#EF4444] font-bold">otomatis — stok ≤ min</div>}
                        </td>
                        <td className="p-3"><div className="flex items-center gap-1 justify-end">
                          <input type="number" min="0" step="0.01" value={row.qty} onChange={(e) => updRow(idx, { qty: e.target.value })} className="w-24 h-9 rounded-lg border px-2 text-right font-num text-sm" />
                          <span className="text-[11px] text-[#a1a1aa]">{row.unit}</span></div></td>
                        <td className="p-3 text-right font-num text-[#52525B]">{row.ingredient_id ? nf(row.stock) : "—"}</td>
                        <td className="p-3 text-right font-num text-[#52525B]">{row.ingredient_id ? nf(row.min_stock) : "—"}</td>
                        <td className="p-3 text-right font-num">{Number(row.qty) > 0 && row.cost ? fmtRp(Number(row.qty) * Number(row.cost)) : "—"}</td>
                        <td className="p-3"><button onClick={() => delRow(idx)} className="tap h-8 w-8 rounded-lg grid place-items-center hover:bg-[#FEE2E2] hover:text-[#EF4444]"><X size={15} /></button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <button data-testid="belanja-save" onClick={saveList} disabled={saving} className="tap h-12 px-5 rounded-xl bg-[#E63946] text-white font-bold flex items-center gap-2 disabled:opacity-60">
              {saving ? <Loader2 size={17} className="animate-spin" /> : <Save size={17} />} Simpan
            </button>
            <button onClick={doPrint} disabled={!itemCount} className="tap h-12 px-5 rounded-xl bg-white border font-bold flex items-center gap-2 disabled:opacity-50"><Printer size={17} /> Cetak</button>
            <button data-testid="belanja-wa" onClick={sendWa} disabled={saving || !itemCount} className="tap h-12 px-5 rounded-xl bg-[#25D366] hover:bg-[#1EBE5B] text-white font-bold flex items-center gap-2 disabled:opacity-50"><MessageCircle size={17} /> Kirim WA</button>
            <div className="self-center text-xs text-[#a1a1aa] max-w-sm">
              Tujuan WA: {(shopSet?.recipients || []).length ? <b>{shopSet.recipients.join(", ")}</b> : "belum diatur"}
              {listDirty && <span className="text-[#B45309] font-bold block">Perubahan belum disimpan.</span>}
            </div>
          </div>
        </div>
      )}

      {/* ============ PEMBELIAN BAHAN ============ */}
      {tab === "pembelian" && (
        <div className="space-y-4">
          <div className="flex items-center gap-3 flex-wrap">
            <label className="text-xs font-bold text-[#52525B] uppercase">Tanggal riwayat</label>
            <input type="date" value={purDate} onChange={(e) => setPurDate(e.target.value)} className="h-10 rounded-xl border px-3 font-num" />
            <div className="ml-auto flex gap-2">
              <button
                data-testid="ai-purchase-recommendation-btn"
                onClick={() => setAiModalOpen(true)}
                className="tap h-11 px-4 rounded-xl bg-gradient-to-r from-[#6366F1] to-[#8B5CF6] hover:from-[#4F46E5] hover:to-[#7C3AED] text-white font-bold text-sm flex items-center gap-2 shadow-sm"
              >
                <Sparkles size={15} /> Rekomendasi AI (Resep 7 Hari)
              </button>
              <button data-testid="scan-btn" onClick={() => fileRef.current?.click()} disabled={scanBusy}
                className="tap h-11 px-4 rounded-xl bg-[#7C3AED] hover:bg-[#6D28D9] text-white font-bold text-sm flex items-center gap-2 disabled:opacity-60">
                {scanBusy ? <Loader2 size={15} className="animate-spin" /> : <ScanLine size={15} />} Scan Faktur (AI)
              </button>
              <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { onPickFile(e.target.files?.[0]); e.target.value = ""; }} />
              <button data-testid="bulk-add" onClick={addBulkRow} className="tap h-11 px-4 rounded-xl bg-[#0A0A0A] text-white font-bold text-sm flex items-center gap-2"><Plus size={15} /> Tambah Baris</button>
            </div>
          </div>

          {bulkRows.length > 0 && (
            <div className="bg-white rounded-2xl border p-4">
              <div className="font-extrabold mb-2">Input Pembelian (massal)</div>
              <div className="space-y-2">
                {bulkRows.map((r, i) => {
                  const b = ings.find((x) => x.id === r.ingredient_id);
                  return (
                    <div key={i} className="flex gap-2 items-center">
                      <select value={r.ingredient_id} onChange={(e) => updBulk(i, { ingredient_id: e.target.value, cost: ings.find((x) => x.id === e.target.value)?.cost || "" })}
                        className="flex-1 h-10 rounded-lg border px-2 bg-white text-sm">
                        {ings.map((x) => <option key={x.id} value={x.id}>{x.name} (stok {nf(x.stock)})</option>)}
                      </select>
                      <input type="number" min="0" step="any" placeholder="Jumlah" value={r.qty} onChange={(e) => updBulk(i, { qty: e.target.value })} className="w-28 h-10 rounded-lg border px-2 font-num text-sm" />
                      <span className="text-[11px] text-[#a1a1aa] w-10">{b?.unit}</span>
                      <input type="number" min="0" step="any" placeholder="Harga/satuan" value={r.cost} onChange={(e) => updBulk(i, { cost: e.target.value })} className="w-32 h-10 rounded-lg border px-2 font-num text-sm" />
                      <button onClick={() => setBulkRows((rs) => rs.filter((_, idx) => idx !== i))} className="tap h-8 w-8 rounded-lg grid place-items-center hover:bg-[#FEE2E2] hover:text-[#EF4444]"><X size={15} /></button>
                    </div>
                  );
                })}
              </div>
              <div className="flex justify-end mt-3">
                <button data-testid="bulk-save" onClick={saveBulk} disabled={saving} className="tap h-11 px-6 rounded-xl bg-[#047857] text-white font-bold flex items-center gap-2 disabled:opacity-60">
                  {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Simpan {bulkRows.length} Baris
                </button>
              </div>
            </div>
          )}

          <div className="bg-white rounded-2xl border">
            <h3 className="font-extrabold px-5 pt-4 pb-1 flex items-center justify-between">
              <span className="flex items-center gap-2"><History size={16} className="text-[#047857]" /> Riwayat Pembelian Bahan</span>
              <span className="text-xs font-bold text-[#52525B]">Total: <span className="font-num text-[#E63946] text-base">{fmtRp(sumPur)}</span></span>
            </h3>
            {purchases.length === 0 ? <p className="text-[#a1a1aa] text-sm p-5">Tidak ada pembelian bahan tanggal ini.</p> : (
              <div className="p-3 space-y-1.5 max-h-[420px] overflow-y-auto">
                {purchases.map((p) => (
                  <div key={p.id} className="rounded-xl border px-3 py-2 flex justify-between items-center gap-2">
                    <div><div className="font-bold text-sm">{p.ingredient_name} <span className="text-[#a1a1aa] font-normal">+{nf(p.qty)}{p.unit ? " " + p.unit : ""}</span></div>
                      <div className="text-[11px] text-[#a1a1aa]">{new Date(p.created_at).toLocaleString("id-ID")} · {p.by}{p.note ? ` · ${p.note}` : ""}</div></div>
                    <div className="font-num font-bold">{fmtRp(p.total_cost)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ============ STOK OPNAME ============ */}
      {tab === "opname" && (
        <div className="space-y-4">
          <div className="flex items-center gap-3 flex-wrap">
            <label className="text-xs font-bold text-[#52525B] uppercase">Riwayat tanggal</label>
            <input type="date" value={opDate} onChange={(e) => setOpDate(e.target.value)} className="h-10 rounded-xl border px-3 font-num" />
            {myCatOpts.length > 0 && (
              <div className="flex items-center gap-2">
                <label className="text-xs font-bold text-[#52525B] uppercase">Kategori</label>
                <select data-testid="opname-cat-filter" value={opCat} onChange={(e) => setOpCat(e.target.value)} className="h-10 rounded-xl border px-3 bg-white text-sm">
                  <option value="">Semua ({opIngs.length})</option>
                  {myCatOpts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            )}
            <div className="ml-auto text-xs font-bold text-[#52525B]">{changedOp.length} bahan akan disesuaikan</div>
          </div>

          {noCatPerm ? (
            <div data-testid="opname-no-perm" className="bg-[#FFFBEB] border border-[#FDE68A] rounded-2xl p-8 text-center">
              <ShieldAlert className="mx-auto text-[#B45309]" size={36} />
              <p className="mt-3 font-extrabold text-[#92400E]">Akun Anda belum diberi kategori bahan</p>
              <p className="text-sm text-[#92400E] mt-1 max-w-lg mx-auto">
                Stok opname bahan hanya bisa diisi untuk kategori yang diizinkan. Minta admin mengaturnya di
                <b> Pengaturan → Pengguna → Kategori Bahan</b> untuk akun Anda.
              </p>
            </div>
          ) : (
            <>
              <p className="text-[11px] text-[#a1a1aa] -mt-1">
                {!catMeta.loaded
                  ? `Menampilkan ${opIngs.length} bahan.`
                  : catMeta.allow_all
                    ? `Super Admin — boleh mengisi semua kategori (${ings.length} bahan).`
                    : `Menampilkan ${opIngs.length} dari ${ings.length} bahan sesuai kategori yang diizinkan untuk akun Anda${opBlockedCount ? ` (${opBlockedCount} bahan di luar izin disembunyikan)` : ""}.`}
              </p>
              <div className="bg-white rounded-2xl border overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-[#F4F5F7] text-[#52525B] text-xs uppercase tracking-wider">
                    <tr><th className="p-3 text-left">Bahan</th><th className="p-3 text-left">Kategori</th><th className="p-3 text-right">Stok sistem</th><th className="p-3 text-right">Stok fisik (isi)</th>
                      <th className="p-3 text-right">Selisih</th><th className="p-3 text-right">Status</th></tr>
                  </thead>
                  <tbody>
                    {opIngs.map((b) => {
                      const sys = Number(b.stock || 0);
                      const val = opRows[b.id];
                      const counted = val === undefined || val === "" ? null : Number(val);
                      const diff = counted == null || !isFinite(counted) ? null : Math.round((counted - sys) * 100) / 100;
                      return (
                        <tr key={b.id} className="border-t hover:bg-[#FAFAFB]">
                          <td className="p-3"><div className="font-bold">{b.name}</div><div className="text-[11px] text-[#a1a1aa]">{b.unit || "—"}</div></td>
                          <td className="p-3"><div className="flex flex-wrap gap-1">{(b.category_names || []).length
                            ? (b.category_names || []).map((n) => <span key={n} className="text-[11px] font-bold px-2 py-0.5 rounded bg-[#EEF2FF] text-[#4338CA]">{n}</span>)
                            : <span className="text-[11px] text-[#a1a1aa]">—</span>}</div></td>
                          <td className="p-3 text-right font-num font-extrabold">{nf(sys)}</td>
                          <td className="p-3"><div className="flex items-center gap-1 justify-end">
                            <input data-testid={`op-in-${b.id}`} type="number" min="0" step="any" value={val ?? ""} placeholder={String(sys)}
                              onChange={(e) => setOpVal(b.id, e.target.value)} className="w-28 h-9 rounded-lg border px-2 text-right font-num text-sm" /></div></td>
                          <td className={`p-3 text-right font-num font-bold ${diff == null ? "text-[#d4d4d8]" : diff >= 0 ? "text-[#047857]" : "text-[#EF4444]"}`}>
                            {diff == null ? "—" : (diff > 0 ? "+" : "") + nf(diff)}</td>
                          <td className="p-3 text-right">
                            {diff == null ? <span className="text-[#d4d4d8] text-xs">belum</span>
                              : diff === 0 ? <Badge cls="bg-[#F4F5F7] text-[#52525B]">sesuai</Badge>
                                : <Badge cls={diff > 0 ? "bg-[#D1FAE5] text-[#047857]" : "bg-[#FEE2E2] text-[#EF4444]"}>{diff > 0 ? "lebih" : "kurang"}</Badge>}
                          </td>
                        </tr>
                      );
                    })}
                    {opIngs.length === 0 && (
                      <tr><td colSpan={6} className="p-8 text-center text-[#a1a1aa] text-sm">
                        {opCat ? "Tidak ada bahan di kategori ini." : "Belum ada bahan yang boleh Anda opname."}
                      </td></tr>
                    )}
                  </tbody>
                </table>
              </div>
              <div className="flex items-center gap-3 flex-wrap">
                <button data-testid="opname-save" onClick={saveOpBulk} disabled={saving || changedOp.length === 0}
                  className="tap h-12 px-6 rounded-xl bg-[#B45309] hover:bg-[#92400E] text-white font-bold flex items-center gap-2 disabled:opacity-50">
                  {saving ? <Loader2 size={17} className="animate-spin" /> : <Save size={17} />} Simpan Opname ({changedOp.length} bahan)
                </button>
                <span className="text-xs text-[#a1a1aa]">Kosongkan = tidak diubah. Bahan disesuaikan ke stok fisik yang Anda isi.</span>
              </div>
            </>
          )}

          <div className="bg-white rounded-2xl border">
            <h3 className="font-extrabold px-5 pt-4 pb-1 flex items-center gap-2"><ClipboardList size={16} className="text-[#B45309]" /> Riwayat Opname {opDate}</h3>
            {opHist.length === 0 ? <p className="text-[#a1a1aa] text-sm p-5">Tidak ada opname bahan tanggal ini.</p> : (
              <div className="p-3 space-y-1.5 max-h-80 overflow-y-auto">
                {opHist.map((p) => (
                  <div key={p.id} className="rounded-xl border px-3 py-2 flex justify-between items-center gap-2">
                    <div><div className="font-bold text-sm">{p.ingredient_name}</div>
                      <div className="text-[11px] text-[#a1a1aa]">sistem {nf(p.system_stock)} → hitung {nf(p.counted_stock)} · {p.by}</div></div>
                    <span className={`font-num font-bold px-2 py-0.5 rounded text-xs ${p.difference >= 0 ? "bg-[#D1FAE5] text-[#047857]" : "bg-[#FEE2E2] text-[#EF4444]"}`}>
                      {p.difference > 0 ? "+" : ""}{nf(p.difference)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ---- dialog hasil scan vision ---- */}
      <Dialog open={!!scanRows} onOpenChange={(o) => { if (!o) setScanRows(null); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><ScanLine size={17} /> Hasil Scan Faktur — periksa lalu simpan</DialogTitle></DialogHeader>
          <p className="text-xs text-[#52525B] -mt-1">Bahan baru akan otomatis dibuat; stok &amp; harga beli bahan yang sudah ada diperbarui.</p>
          <div className="space-y-2 mt-2 max-h-[55vh] overflow-y-auto">
            {(scanRows || []).map((r, i) => (
              <div key={i} className="grid grid-cols-[1fr_70px_60px_100px_auto] gap-2 items-center">
                <input value={r.name || ""} onChange={(e) => setScanRows((rs) => rs.map((x, idx) => idx === i ? { ...x, name: e.target.value } : x))} className="h-9 rounded-lg border px-2 text-sm" />
                <input type="number" min="0" step="any" value={r.qty ?? ""} onChange={(e) => setScanRows((rs) => rs.map((x, idx) => idx === i ? { ...x, qty: e.target.value } : x))} className="h-9 rounded-lg border px-2 font-num text-sm" title="Jumlah" />
                <input value={r.unit || ""} onChange={(e) => setScanRows((rs) => rs.map((x, idx) => idx === i ? { ...x, unit: e.target.value } : x))} className="h-9 rounded-lg border px-2 text-xs" title="Satuan" />
                <input type="number" min="0" step="any" value={r.amount ?? ""} onChange={(e) => setScanRows((rs) => rs.map((x, idx) => idx === i ? { ...x, amount: e.target.value } : x))} className="h-9 rounded-lg border px-2 font-num text-sm" title="Total Rp" />
                <button onClick={() => setScanRows((rs) => rs.filter((_, idx) => idx !== i))} className="tap h-8 w-8 rounded-lg grid place-items-center hover:bg-[#FEE2E2] hover:text-[#EF4444]"><X size={14} /></button>
              </div>
            ))}
            {!(scanRows || []).length && <p className="text-sm text-[#a1a1aa] py-4 text-center">Tidak ada baris — ulangi scan dengan foto lebih jelas.</p>}
          </div>
          <DialogFooter className="flex-col gap-2 sm:flex-col">
            <button data-testid="commit-scan" onClick={commitScan} disabled={saving || !(scanRows || []).filter((r) => r.name?.trim() && Number(r.qty) > 0).length}
              className="tap w-full h-12 rounded-xl bg-[#047857] text-white font-bold flex items-center justify-center gap-2 disabled:opacity-50">
              {saving ? <Loader2 size={17} className="animate-spin" /> : <Save size={17} />} Simpan Jadi Pembelian Bahan
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* dialog tambah/edit bahan */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editing ? "Edit Bahan" : "Bahan Baru"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Lbl>Nama bahan *</Lbl>
              <input data-testid="bahan-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="cth: Tepung Terigu" className="mt-1 w-full h-11 rounded-xl border px-3" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Lbl>Satuan</Lbl><input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} placeholder="kg / liter / pcs" className="mt-1 w-full h-11 rounded-xl border px-3" /></div>
              <div><Lbl>Harga beli / satuan</Lbl><input data-testid="bahan-cost" type="number" min="0" step="any" value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })} className="mt-1 w-full h-11 rounded-xl border px-3 font-num" /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Lbl>Stok sekarang</Lbl><input data-testid="bahan-stock" type="number" min="0" step="any" value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value })} className="mt-1 w-full h-11 rounded-xl border px-3 font-num" /></div>
              <div><Lbl>Stok minimum</Lbl><input data-testid="bahan-min" type="number" min="0" step="any" value={form.min_stock} onChange={(e) => setForm({ ...form, min_stock: e.target.value })} className="mt-1 w-full h-11 rounded-xl border px-3 font-num" /></div>
            </div>
            <div><Lbl>Catatan</Lbl><input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} className="mt-1 w-full h-11 rounded-xl border px-3" /></div>
            <div>
              <Lbl>Kategori bahan</Lbl>
              <p className="text-[11px] text-[#a1a1aa] mt-1 mb-2">Menentukan siapa yang boleh mengisi <b>stok opname</b> bahan ini (diatur per akun di Pengaturan → Pengguna). Boleh lebih dari satu.</p>
              {cats.length === 0 ? (
                <div className="text-xs text-[#B45309] bg-[#FFFBEB] border border-[#FDE68A] rounded-xl px-3 py-2">
                  Belum ada kategori bahan. {catMeta.can_manage ? "Buat dulu lewat tombol “Kategori Bahan” di halaman ini." : "Minta admin membuatnya di halaman Bahan."}
                </div>
              ) : (
                <div className="flex flex-wrap gap-1.5" data-testid="bahan-cat-picker">
                  {cats.map((c) => (
                    <button key={c.id} type="button" data-testid={`cat-pick-${c.id}`} onClick={() => toggleFormCat(c.id)}
                      className={`tap h-8 px-3 rounded-lg text-xs font-bold border ${formCats.includes(c.id) ? "bg-[#4338CA] text-white border-[#4338CA]" : "bg-white text-[#52525B]"}`}>
                      {formCats.includes(c.id) ? "✓ " : ""}{c.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <button data-testid="save-bahan-btn" onClick={saveBahan} disabled={saving} className="tap w-full h-12 rounded-xl bg-[#E63946] text-white font-bold disabled:opacity-50">
              {saving ? <Loader2 size={17} className="animate-spin" /> : "Simpan"}</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* dialog kelola kategori bahan */}
      <Dialog open={catOpen} onOpenChange={setCatOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Tags size={17} /> Kategori Bahan</DialogTitle></DialogHeader>
          <p className="text-xs text-[#52525B] -mt-1">
            Kategori menentukan bahan mana yang boleh diisi tiap akun saat <b>stok opname</b>.
            Ubah nama dengan ikon pensil — bahan & akun yang memakai kategori ini otomatis ikut (kategori disimpan per id).
          </p>
          <div className="flex gap-2 mt-2">
            <input data-testid="new-cat-input" value={newCat} onChange={(e) => setNewCat(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") addCat(); }}
              placeholder="Nama kategori baru (mis. Bumbu Dapur)" className="flex-1 h-11 rounded-xl border px-3" />
            <button data-testid="add-cat-btn" onClick={addCat} className="tap h-11 px-4 rounded-xl bg-[#4338CA] text-white font-bold flex items-center gap-2"><Plus size={16} /> Tambah</button>
          </div>
          <div className="space-y-1.5 mt-3 max-h-[45vh] overflow-y-auto">
            {cats.length === 0 && <p className="text-sm text-[#a1a1aa] py-4 text-center">Belum ada kategori. Tambahkan di atas.</p>}
            {cats.map((c) => (
              <div key={c.id} data-testid={`cat-row-${c.id}`} className="rounded-xl border px-3 py-2 flex items-center gap-2">
                {catEdit && catEdit.id === c.id ? (
                  <>
                    <input value={catEdit.name} onChange={(e) => setCatEdit({ ...catEdit, name: e.target.value })}
                      onKeyDown={(e) => { if (e.key === "Enter") renameCat(); }} className="flex-1 h-9 rounded-lg border px-2 text-sm" />
                    <button data-testid={`cat-save-${c.id}`} onClick={renameCat} className="tap h-8 px-3 rounded-lg bg-[#047857] text-white text-xs font-bold">Simpan</button>
                    <button onClick={() => setCatEdit(null)} className="tap h-8 w-8 rounded-lg bg-[#F4F5F7] grid place-items-center"><X size={14} /></button>
                  </>
                ) : (
                  <>
                    <div className="flex-1">
                      <div className="font-bold text-sm">{c.name}</div>
                      <div className="text-[11px] text-[#a1a1aa]">{c.ingredient_count || 0} bahan</div>
                    </div>
                    <button data-testid={`cat-edit-${c.id}`} onClick={() => setCatEdit({ id: c.id, name: c.name })} title="Ubah nama" className="tap h-8 w-8 rounded-lg bg-[#F4F5F7] grid place-items-center"><Pencil size={14} /></button>
                    <button data-testid={`cat-del-${c.id}`} onClick={() => delCat(c)} title="Hapus kategori" className="tap h-8 w-8 rounded-lg bg-[#FEE2E2] text-[#B91C1C] grid place-items-center"><Trash2 size={14} /></button>
                  </>
                )}
              </div>
            ))}
          </div>
          <DialogFooter>
            <button onClick={() => { setCatOpen(false); setCatEdit(null); }} className="tap w-full h-12 rounded-xl bg-[#0A0A0A] text-white font-bold">Selesai</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* dialog beli */}
      <Dialog open={!!buyTarget} onOpenChange={(o) => { if (!o) setBuyTarget(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><ShoppingCart size={17} /> Beli Bahan — {buyTarget?.name}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-[#52525B] bg-[#F4F5F7] rounded-lg px-3 py-2">Stok sekarang: <b className="font-num">{nf(buyTarget?.stock)} {buyTarget?.unit}</b> · Harga beli terakhir <b className="font-num">{fmtRp(buyTarget?.cost)}</b></p>
            <div><Lbl>Jumlah beli *</Lbl><input data-testid="buy-qty" type="number" min="0" step="any" value={buyForm.qty} onChange={(e) => setBuyForm({ ...buyForm, qty: e.target.value })} placeholder={buyTarget?.unit || "jumlah"} className="mt-1 w-full h-11 rounded-xl border px-3 font-num" /></div>
            <div><Lbl>Harga beli / satuan</Lbl><input data-testid="buy-cost" type="number" min="0" step="any" value={buyForm.unit_cost} onChange={(e) => setBuyForm({ ...buyForm, unit_cost: e.target.value })} className="mt-1 w-full h-11 rounded-xl border px-3 font-num" /></div>
            <div><Lbl>Catatan</Lbl><input value={buyForm.note} onChange={(e) => setBuyForm({ ...buyForm, note: e.target.value })} className="mt-1 w-full h-11 rounded-xl border px-3" /></div>
          </div>
          <DialogFooter>
            <button data-testid="save-buy-btn" onClick={saveBuy} disabled={saving} className="tap w-full h-12 rounded-xl bg-[#047857] text-white font-bold disabled:opacity-50">
              {saving ? <Loader2 size={17} className="animate-spin" /> : "Simpan Pembelian"}</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* dialog opname */}
      <Dialog open={!!opTarget} onOpenChange={(o) => { if (!o) setOpTarget(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><ClipboardList size={17} /> Stok Opname — {opTarget?.name}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-[#52525B] bg-[#F4F5F7] rounded-lg px-3 py-2">Stok sistem: <b className="font-num">{nf(opTarget?.stock)} {opTarget?.unit}</b>. Masukkan hasil hitungan fisik.</p>
            <div><Lbl>Hasil hitung fisik *</Lbl><input data-testid="op-qty" type="number" min="0" step="any" value={opForm.counted} onChange={(e) => setOpForm({ ...opForm, counted: e.target.value })} className="mt-1 w-full h-11 rounded-xl border px-3 font-num" /></div>
            <div><Lbl>Catatan</Lbl><input value={opForm.note} onChange={(e) => setOpForm({ ...opForm, note: e.target.value })} placeholder="mis. susut, salah catat" className="mt-1 w-full h-11 rounded-xl border px-3" /></div>
          </div>
          <DialogFooter>
            <button data-testid="save-op-btn" onClick={saveOp} disabled={saving} className="tap w-full h-12 rounded-xl bg-[#B45309] text-white font-bold disabled:opacity-50">
              {saving ? <Loader2 size={17} className="animate-spin" /> : "Simpan Opname"}</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* AI Recommendation Modal */}
      <AiIngredientRecommendationModal
        open={aiModalOpen}
        onOpenChange={setAiModalOpen}
        onApplyToShoppingList={handleApplyAiToShoppingList}
        onApplyToBulkPurchase={handleApplyAiToBulkPurchase}
        currentShoppingDate={date}
      />
    </div>
  );
}

const TabBtn = ({ k, on, set, icon: Icon, lbl }) => (
  <button data-testid={`tab-${k}`} onClick={() => set(k)}
    className={`tap h-10 px-4 rounded-xl font-bold text-sm flex items-center gap-2 ${on === k ? "bg-[#E63946] text-white" : "bg-white border"}`}>
    <Icon size={15} /> {lbl}
  </button>
);
const Badge = ({ children, cls, icon }) => (
  <span className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded ${cls}`}>{icon}{children}</span>
);
const Tiny = ({ children, onClick, title, danger, color }) => (
  <button title={title} onClick={onClick} style={color ? { color } : undefined}
    className={`tap h-8 w-8 rounded-lg grid place-items-center border bg-white ${danger ? "hover:bg-[#FEE2E2] hover:text-[#EF4444] hover:border-[#FECACA]" : "hover:bg-[#F4F5F7]"}`}>
    {children}
  </button>
);
const Loader = () => <div className="h-32 grid place-items-center"><Loader2 className="animate-spin text-[#E63946]" /></div>;
const Lbl = ({ children }) => <label className="text-xs font-bold text-[#52525B] uppercase tracking-wider block">{children}</label>;
