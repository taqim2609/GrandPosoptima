import { useEffect, useState } from "react";
import api, { apiError } from "@/lib/api";
import { rupiah } from "@/lib/format";
import { toast } from "sonner";
import { FlaskConical, Plus, Trash2, Loader2, Wand2, Boxes } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

// Bahan resep bisa dari MASTER BAHAN (disarankan — dipakai daftar belanja) atau produk lama.
export default function Recipes() {
  const [recipes, setRecipes] = useState([]);
  const [ingredients, setIngredients] = useState([]);
  const [products, setProducts] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ product_id: "", yield_units: 1, ingredients: [] });
  const [saving, setSaving] = useState(false);

  const load = () => {
    api.get("/recipes").then((r) => setRecipes(r.data?.recipes || (Array.isArray(r.data) ? r.data : []))).catch(() => setRecipes([]));
    api.get("/ingredients", { params: { active_only: true } }).then((r) => setIngredients(Array.isArray(r.data) ? r.data : (r.data?.items || []))).catch(() => setIngredients([]));
    api.get("/products").then((r) => setProducts((Array.isArray(r.data) ? r.data : []).filter((p) => p.type !== "retail"))).catch(() => setProducts([]));
  };
  useEffect(() => { load(); }, []);

  const prodName = (id) => (products || []).find((p) => p.id === id)?.name;
  const ingName = (id) => (ingredients || []).find((b) => b.id === id)?.name;
  const nameOfRow = (row) => {
    // baris resep dari server: ingredient_id / product_id
    if (row.ingredient_id) return ingName(row.ingredient_id) || "?";
    return prodName(row.product_id) || "?";
  };
  const isIngredientOpt = (val) => String(val).startsWith("ing:");
  const isProductOpt = (val) => String(val).startsWith("p:");

  const addIng = () => setForm((f) => ({ ...f, ingredients: [...(f.ingredients || []), { sel: "", qty: 1, unit: "" }] }));
  const setIng = (i, patch) => setForm((f) => ({ ...f, ingredients: (f.ingredients || []).map((x, idx) => idx === i ? { ...x, ...patch } : x) }));
  const rmIng = (i) => setForm((f) => ({ ...f, ingredients: (f.ingredients || []).filter((_, idx) => idx !== i) }));

  // konversi baris UI → payload backend
  const rowToPayload = (row) => {
    const base = { qty: Number(row.qty || 0), unit: (row.unit || "").trim() };
    if (isIngredientOpt(row.sel)) return { ...base, ingredient_id: row.sel.slice(4) };
    if (isProductOpt(row.sel)) return { ...base, product_id: row.sel.slice(2) };
    return null;
  };
  // baris payload backend (server) → nilai select UI
  const payloadToSel = (row) => (row.ingredient_id ? "ing:" + row.ingredient_id : row.product_id ? "p:" + row.product_id : "");

  const save = async () => {
    if (!form.product_id) return toast.error("Pilih produk");
    if (!(form.ingredients || []).length) return toast.error("Tambahkan minimal 1 bahan");
    const rows = (form.ingredients || []).map(rowToPayload);
    if (rows.some((r) => !r)) return toast.error("Pilih bahan untuk setiap baris");
    if (rows.some((r) => !(r.qty > 0))) return toast.error("Jumlah bahan harus > 0");
    setSaving(true);
    try {
      await api.post("/recipes", { product_id: form.product_id, ingredients: rows, yield_units: Number(form.yield_units || 1) });
      toast.success("Resep disimpan — HPP otomatis dihitung");
      setOpen(false); setForm({ product_id: "", yield_units: 1, ingredients: [] });
      load();
    } catch (e) { toast.error(apiError(e.response?.data?.detail)); } finally { setSaving(false); }
  };

  const applyHpp = async (pid) => {
    try {
      const { data } = await api.post(`/recipes/${pid}/apply-hpp`);
      toast.success(`HPP produk diterapkan: ${rupiah(data.cost)}`);
      load();
    } catch (e) { toast.error(apiError(e.response?.data?.detail)); }
  };
  const del = async (pid) => {
    if (!window.confirm("Hapus resep ini?")) return;
    try { await api.delete(`/recipes/${pid}`); load(); } catch (e) { toast.error(apiError(e.response?.data?.detail)); }
  };
  const openEdit = (r) => {
    setForm({
      product_id: r.product_id,
      yield_units: r.yield_units,
      ingredients: (r.ingredients || []).map((x) => ({ sel: payloadToSel(x), qty: x.qty, unit: x.unit || "" })),
    });
    setOpen(true);
  };

  return (
    <div className="h-full overflow-y-auto p-6 lg:p-8">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-extrabold flex items-center gap-2"><FlaskConical /> Resep &amp; HPP Otomatis</h1>
          <p className="text-sm text-[#52525B] mt-1">Susun bahan per produk; sistem menghitung HPP otomatis. Bahan diambil dari <b>Bahan Baku</b> (menu <b>Bahan &amp; Belanja</b>) agar ikut daftar belanja.</p>
        </div>
        <button data-testid="add-recipe-btn" onClick={() => setOpen(true)} className="tap h-11 px-5 rounded-xl bg-[#E63946] hover:bg-[#BE123C] text-white font-bold flex items-center gap-2"><Plus size={18} /> Buat Resep</button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {(recipes || []).length === 0 && <div className="md:col-span-2 xl:col-span-3 bg-white rounded-2xl border p-10 text-center text-[#a1a1aa]">Belum ada resep. Buat resep pertama untuk menghitung HPP otomatis.</div>}
        {(recipes || []).map((r) => (
          <div key={r.id} className="bg-white rounded-2xl border p-5" data-testid={`recipe-${r.id}`}>
            <div className="flex items-start justify-between gap-2">
              <div className="font-extrabold">{prodName(r.product_id) || "?"}</div>
              <button onClick={() => del(r.product_id)} className="tap h-8 w-8 rounded-lg bg-[#FEE2E2] text-[#EF4444] grid place-items-center"><Trash2 size={14} /></button>
            </div>
            <div className="text-[11px] text-[#52525B] mb-2">Hasil: {r.yield_units} unit</div>
            <div className="rounded-lg bg-[#FAFAFA] border divide-y text-xs max-h-36 overflow-y-auto">
              {(r.hpp?.ingredients || []).map((b, i) => (
                <div key={i} className="flex justify-between gap-2 px-2 py-1.5">
                  <span className="flex items-center gap-1.5 min-w-0">
                    {b.kind === "ingredient" && <Boxes size={11} className="text-[#7C3AED] shrink-0" />}
                    <span className="truncate">{b.name}</span> <span className="text-[#a1a1aa] shrink-0">×{b.qty}{b.unit ? ` ${b.unit}` : ""}</span>
                  </span>
                  <span className="font-num font-bold shrink-0">{rupiah(b.cost)}</span>
                </div>
              ))}
            </div>
            <div className="flex justify-between mt-3 text-sm font-extrabold">
              <span>HPP / unit</span><span className="font-num text-[#E63946]">{rupiah(r.hpp?.hpp_per_unit || 0)}</span>
            </div>
            <div className="flex gap-2 mt-3">
              <button data-testid={`apply-hpp-${r.product_id}`} onClick={() => applyHpp(r.product_id)}
                className="tap flex-1 h-10 rounded-lg bg-[#4F46E5] text-white font-bold text-xs flex items-center justify-center gap-1.5"><Wand2 size={13} /> Terapkan ke HPP Produk</button>
              <button data-testid={`edit-recipe-${r.product_id}`} onClick={() => openEdit(r)}
                className="tap h-10 px-3 rounded-lg bg-[#F4F5F7] font-bold text-xs">Edit</button>
            </div>
          </div>
        ))}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent data-testid="recipe-dialog" className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Buat / Edit Resep</DialogTitle></DialogHeader>
          <div className="space-y-3 text-sm">
            <div>
              <label className="text-xs uppercase tracking-wider font-bold text-[#52525B]">Produk (hasil jadi)</label>
              <select data-testid="recipe-product" value={form.product_id} onChange={(e) => setForm({ ...form, product_id: e.target.value })} className="mt-1 w-full h-11 rounded-xl border px-3 bg-white">
                <option value="">— pilih produk —</option>
                {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs uppercase tracking-wider font-bold text-[#52525B]">Hasil Produksi (unit)</label>
              <input data-testid="recipe-yield" type="number" min="0.1" step="0.1" value={form.yield_units} onChange={(e) => setForm({ ...form, yield_units: e.target.value })} className="mt-1 w-full h-11 rounded-xl border px-3 font-num" />
            </div>
            <div>
              <div className="flex items-center justify-between">
                <label className="text-xs uppercase tracking-wider font-bold text-[#52525B]">Bahan-Bahan (pilih dari Bahan Baku)</label>
                <button onClick={addIng} className="tap text-xs font-bold text-[#E63946] flex items-center gap-1"><Plus size={13} /> Tambah</button>
              </div>
              {(ingredients || []).length === 0 && (
                <p className="text-[11px] text-[#B45309] bg-[#FEF3C7] border border-[#FCD34D] rounded-lg px-3 py-2 mt-2">
                  Belum ada bahan di master <b>Bahan Baku</b> — buat dulu di menu <b>Bahan &amp; Belanja</b> supaya bisa dipakai resep & daftar belanja.
                </p>
              )}
              <div className="space-y-2 mt-1.5">
                {(form.ingredients || []).map((ing, i) => (
                  <div key={i} className="flex gap-2 items-center">
                    <select value={ing.sel} onChange={(e) => setIng(i, { sel: e.target.value })} className="flex-1 h-10 rounded-lg border px-2 bg-white text-xs">
                      <option value="">— pilih bahan —</option>
                      <optgroup label={`Bahan Baku (${(ingredients || []).length})`}>
                        {(ingredients || []).map((b) => (
                          <option key={b.id} value={"ing:" + b.id}>{b.name}{b.unit ? ` (${b.unit})` : ""} — stok {b.stock}</option>
                        ))}
                      </optgroup>
                      <optgroup label="Produk (opsional, tidak ikut daftar belanja)">
                        {(products || []).map((p) => <option key={p.id} value={"p:" + p.id}>{p.name}</option>)}
                      </optgroup>
                    </select>
                    <input type="number" min="0" step="0.01" value={ing.qty} onChange={(e) => setIng(i, { qty: e.target.value })} placeholder="jml" className="w-20 h-10 rounded-lg border px-2 font-num text-xs" />
                    <input value={ing.unit || ""} onChange={(e) => setIng(i, { unit: e.target.value })} placeholder="unit" className="w-14 h-10 rounded-lg border px-2 text-xs" />
                    <button onClick={() => rmIng(i)} className="tap h-8 w-8 rounded-lg bg-[#FEE2E2] text-[#EF4444] grid place-items-center shrink-0"><Trash2 size={13} /></button>
                  </div>
                ))}
                {(form.ingredients || []).length === 0 && <div className="text-[#a1a1aa] text-xs">Belum ada bahan.</div>}
              </div>
            </div>
          </div>
          <DialogFooter>
            <button data-testid="save-recipe" onClick={save} disabled={saving} className="tap h-11 px-6 rounded-xl bg-[#E63946] text-white font-bold disabled:opacity-50">
              {saving ? <Loader2 size={16} className="animate-spin" /> : "Simpan Resep"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
