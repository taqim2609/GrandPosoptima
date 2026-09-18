import { useEffect, useState } from "react";
import api, { apiError } from "@/lib/api";
import { rupiah } from "@/lib/format";
import { toast } from "sonner";
import { Ticket, Plus, Pencil, Trash2, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

const empty = { code: "", type: "percent", value: 0, max_uses: 0, expires_at: "", active: true };

export default function Coupons() {
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);
  const [editId, setEditId] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = () => api.get("/coupons").then((r) => setItems(r.data || [])).catch(() => {});
  useEffect(() => { load(); }, []);

  const save = async () => {
    if (!form.code.trim()) return toast.error("Kode kupon wajib");
    setSaving(true);
    try {
      const payload = { ...form, code: form.code.trim().toUpperCase(), value: Number(form.value || 0), max_uses: Number(form.max_uses || 0) };
      if (editId) await api.put(`/coupons/${editId}`, payload);
      else await api.post("/coupons", payload);
      toast.success("Kupon tersimpan");
      setOpen(false); setForm(empty); setEditId(null); load();
    } catch (e) { toast.error(apiError(e.response?.data?.detail)); } finally { setSaving(false); }
  };
  const del = async (c) => {
    if (!window.confirm(`Hapus kupon "${c.code}"?`)) return;
    try { await api.delete(`/coupons/${c.id}`); toast.success("Kupon dihapus"); load(); }
    catch (e) { toast.error(apiError(e.response?.data?.detail)); }
  };
  const toggle = async (c) => {
    try { await api.put(`/coupons/${c.id}`, { ...c, active: !c.active }); load(); }
    catch (e) { toast.error(apiError(e.response?.data?.detail)); }
  };

  return (
    <div className="h-full overflow-y-auto p-6 lg:p-8">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <h1 className="text-3xl font-extrabold flex items-center gap-2"><Ticket /> Kupon Diskon</h1>
        <button data-testid="add-coupon-btn" onClick={() => { setForm(empty); setEditId(null); setOpen(true); }}
          className="tap h-11 px-5 rounded-xl bg-[#E63946] hover:bg-[#BE123C] text-white font-bold flex items-center gap-2"><Plus size={18} /> Tambah Kupon</button>
      </div>
      <p className="text-sm text-[#52525B] mb-5">Kasir memasukkan kode kupon saat pembayaran; diskon diterapkan otomatis (validasi aktif/masa berlaku/kuota).</p>

      <div className="bg-white rounded-2xl border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-[#F4F5F7] text-[#52525B] text-xs uppercase tracking-wider">
            <tr><th className="text-left p-3">Kode</th><th className="text-left p-3">Diskon</th><th className="text-center p-3">Kuota</th><th className="text-left p-3">Berlaku s.d.</th><th className="text-center p-3">Aktif</th><th className="p-3"></th></tr>
          </thead>
          <tbody>
            {(items || []).length === 0 && <tr><td colSpan={6} className="p-10 text-center text-[#a1a1aa]">Belum ada kupon.</td></tr>}
            {(items || []).map((c) => (
              <tr key={c.id} className="border-t" data-testid={`coupon-${c.id}`}>
                <td className="p-3 font-extrabold">{c.code}</td>
                <td className="p-3 font-bold text-[#E63946]">{c.type === "percent" ? `${c.value}%` : rupiah(c.value)}</td>
                <td className="p-3 text-center font-num">{c.max_uses > 0 ? `${c.used_count || 0}/${c.max_uses}` : "∞"}</td>
                <td className="p-3 font-num">{c.expires_at || "-"}</td>
                <td className="p-3 text-center">
                  <button onClick={() => toggle(c)} className={`text-xs font-bold px-2.5 py-1 rounded-full ${c.active ? "bg-[#D1FAE5] text-[#047857]" : "bg-[#FEE2E2] text-[#EF4444]"}`}>
                    {c.active ? "AKTIF" : "MATI"}
                  </button>
                </td>
                <td className="p-3">
                  <div className="flex gap-1 justify-end">
                    <button data-testid={`edit-coupon-${c.id}`} onClick={() => { setForm({ code: c.code, type: c.type, value: c.value, max_uses: c.max_uses || 0, expires_at: c.expires_at || "", active: c.active }); setEditId(c.id); setOpen(true); }}
                      className="tap h-8 w-8 rounded-lg bg-[#F4F5F7] grid place-items-center"><Pencil size={14} /></button>
                    <button data-testid={`delete-coupon-${c.id}`} onClick={() => del(c)} className="tap h-8 w-8 rounded-lg bg-[#FEE2E2] text-[#EF4444] grid place-items-center"><Trash2 size={14} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent data-testid="coupon-dialog">
          <DialogHeader><DialogTitle>{editId ? "Edit Kupon" : "Tambah Kupon"}</DialogTitle></DialogHeader>
          <div className="space-y-3 text-sm">
            <div>
              <label className="text-xs uppercase tracking-wider font-bold text-[#52525B]">Kode (huruf besar otomatis)</label>
              <input data-testid="coupon-code" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} placeholder="HEMAT10" className="mt-1 w-full h-11 rounded-xl border px-3 font-mono" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs uppercase tracking-wider font-bold text-[#52525B]">Jenis</label>
                <select data-testid="coupon-type" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className="mt-1 w-full h-11 rounded-xl border px-3 bg-white">
                  <option value="percent">Persen (%)</option><option value="amount">Nominal (Rp)</option>
                </select>
              </div>
              <div>
                <label className="text-xs uppercase tracking-wider font-bold text-[#52525B]">Nilai</label>
                <input data-testid="coupon-value" type="number" min="0" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} className="mt-1 w-full h-11 rounded-xl border px-3 font-num" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs uppercase tracking-wider font-bold text-[#52525B]">Maks. Pemakaian (0 = tak terbatas)</label>
                <input data-testid="coupon-max-uses" type="number" min="0" value={form.max_uses} onChange={(e) => setForm({ ...form, max_uses: e.target.value })} className="mt-1 w-full h-11 rounded-xl border px-3 font-num" />
              </div>
              <div>
                <label className="text-xs uppercase tracking-wider font-bold text-[#52525B]">Berlaku s.d.</label>
                <input data-testid="coupon-expiry" type="date" value={form.expires_at} onChange={(e) => setForm({ ...form, expires_at: e.target.value })} className="mt-1 w-full h-11 rounded-xl border px-3 font-num" />
              </div>
            </div>
            <label className="flex items-center gap-2 font-bold"><input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} className="h-4 w-4 accent-[#E63946]" /> Aktif</label>
          </div>
          <DialogFooter>
            <button data-testid="save-coupon" onClick={save} disabled={saving} className="tap h-11 px-6 rounded-xl bg-[#E63946] text-white font-bold disabled:opacity-50">
              {saving ? <Loader2 size={16} className="animate-spin" /> : "Simpan"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
