import { useEffect, useState } from "react";
import api, { apiError } from "@/lib/api";
import { toast } from "sonner";
import { Armchair, Plus, Pencil, Trash2, Power, ArrowRightLeft, RotateCcw } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

const empty = { name: "", area: "Umum", capacity: 4, active: true };

export default function Tables() {
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);
  const [editId, setEditId] = useState(null);
  const [moveOpen, setMoveOpen] = useState(false);
  const [moveSource, setMoveSource] = useState(null);
  const [moveTarget, setMoveTarget] = useState(null);

  const load = () =>
    api
      .get("/tables")
      .then((r) => setItems(Array.isArray(r.data) ? r.data : []))
      .catch(() => setItems([]));

  // eslint-disable-next-line react-hooks/exhaustive-deps -- fetch once on mount
  useEffect(() => {
    load();
  }, []);

  const save = async () => {
    if (!form.name.trim()) return toast.error("Nama/kode meja wajib");
    try {
      if (editId) await api.put(`/tables/${editId}`, form);
      else await api.post("/tables", form);
      toast.success("Meja tersimpan");
      setOpen(false);
      load();
    } catch (e) {
      toast.error(apiError(e.response?.data?.detail));
    }
  };

  const del = async (t) => {
    if (!window.confirm(`Hapus permanen meja ${t.name}?`)) return;
    try {
      const { data } = await api.delete(`/tables/${t.id}`);
      toast.success(data.reason || "Meja berhasil terhapus");
      load();
    } catch (e) {
      toast.error(apiError(e.response?.data?.detail));
    }
  };

  const toggle = async (t) => {
    try {
      await api.put(`/tables/${t.id}`, { ...t, active: !t.active });
      load();
    } catch (e) {
      toast.error(apiError(e.response?.data?.detail));
    }
  };

  const clearTable = async (t) => {
    if (!window.confirm(`Kosongkan status meja ${t.name}?`)) return;
    try {
      const { data } = await api.post(`/tables/${t.id}/clear`);
      toast.success(data.detail || `Meja ${t.name} dikosongkan`);
      load();
    } catch (e) {
      toast.error(apiError(e.response?.data?.detail));
    }
  };

  const handleOpenMove = (source) => {
    setMoveSource(source);
    setMoveTarget(null);
    setMoveOpen(true);
  };

  const doMove = async () => {
    if (!moveSource || !moveTarget) return toast.error("Pilih meja tujuan");
    try {
      const res = await api.post("/tables/move", {
        from_table_id: moveSource.id,
        to_table_id: moveTarget.id,
        order_id: moveSource.open_order_id,
      });
      toast.success(res.data?.detail || `Meja dipindahkan ke ${moveTarget.name}`);
      setMoveOpen(false);
      setMoveSource(null);
      setMoveTarget(null);
      load();
    } catch (e) {
      toast.error(apiError(e.response?.data?.detail));
    }
  };

  const areas = [...new Set((items || []).map((t) => t.area))];
  const emptyTablesForMove = items.filter(
    (t) => t.active && t.id !== moveSource?.id && t.status !== "open_bill"
  );

  return (
    <div className="h-full overflow-y-auto p-4 sm:p-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold flex items-center gap-2">
            <Armchair /> Manajemen Meja
          </h1>
          <p className="text-xs text-[#71717A] mt-1">
            Total {items.length} meja · {items.filter((t) => t.status === "open_bill").length} terisi (Open Bill) ·{" "}
            {items.filter((t) => t.active && t.status !== "open_bill").length} kosong
          </p>
        </div>
        <button
          data-testid="add-table-btn"
          onClick={() => {
            setForm(empty);
            setEditId(null);
            setOpen(true);
          }}
          className="tap h-11 px-5 rounded-xl bg-[#E63946] hover:bg-[#BE123C] text-white font-bold flex items-center gap-2 shrink-0 self-start sm:self-auto"
        >
          <Plus size={18} /> Tambah Meja
        </button>
      </div>

      {areas.map((area) => (
        <div key={area} className="mb-6">
          <div className="text-xs uppercase tracking-wider font-bold text-[#52525B] mb-2 flex items-center justify-between">
            <span>{area}</span>
            <span className="text-[11px] font-normal text-[#71717A]">
              {items.filter((t) => t.area === area).length} meja
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3">
            {items
              .filter((t) => t.area === area)
              .map((t) => (
                <div
                  key={t.id}
                  data-testid={`table-${t.id}`}
                  className={`rounded-xl border-2 p-3.5 flex flex-col justify-between transition ${
                    !t.active
                      ? "opacity-50 bg-white border-[#E4E4E7]"
                      : t.status === "open_bill"
                      ? "tbl-open_bill border-[#F59E0B]"
                      : "tbl-empty"
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between">
                      <div className="font-extrabold text-lg">{t.name}</div>
                      <span
                        className={`text-[9px] font-extrabold px-1.5 py-0.5 rounded uppercase tracking-wider ${
                          t.status === "open_bill"
                            ? "bg-[#FEF3C7] text-[#92400E]"
                            : t.active
                            ? "bg-[#D1FAE5] text-[#065F46]"
                            : "bg-zinc-200 text-zinc-600"
                        }`}
                      >
                        {t.status === "open_bill" ? "Open Bill" : t.active ? "Kosong" : "Off"}
                      </span>
                    </div>
                    <div className="text-[11px] text-[#52525B] mt-0.5">{t.capacity} kursi</div>

                    {t.reservation && (
                      <div
                        className="mt-2 text-[10px] font-bold text-[#4338CA] bg-[#E0E7FF] rounded px-1.5 py-0.5 truncate"
                        data-testid={`table-res-${t.id}`}
                      >
                        📅 {t.reservation.time} · {t.reservation.customer_name} ({t.reservation.pax} pax)
                      </div>
                    )}
                  </div>

                  <div className="space-y-1.5 mt-3 pt-2 border-t border-black/5">
                    {t.status === "open_bill" && (
                      <div className="flex items-center gap-1">
                        <button
                          data-testid={`move-table-admin-${t.id}`}
                          onClick={() => handleOpenMove(t)}
                          title="Pindah Meja / Transfer Open Bill"
                          className="tap flex-1 h-7 rounded-lg bg-[#EFF6FF] text-[#1D4ED8] hover:bg-[#DBEAFE] text-[11px] font-bold flex items-center justify-center gap-1"
                        >
                          <ArrowRightLeft size={12} /> Pindah
                        </button>
                        <button
                          data-testid={`clear-table-admin-${t.id}`}
                          onClick={() => clearTable(t)}
                          title="Kosongkan Meja"
                          className="tap h-7 px-2 rounded-lg bg-[#F4F5F7] text-[#52525B] hover:bg-zinc-200 text-[11px] font-bold flex items-center gap-1"
                        >
                          <RotateCcw size={12} />
                        </button>
                      </div>
                    )}

                    <div className="flex items-center gap-1">
                      <button
                        data-testid={`edit-table-${t.id}`}
                        onClick={() => {
                          setForm(t);
                          setEditId(t.id);
                          setOpen(true);
                        }}
                        title="Edit Data Meja"
                        className="tap flex-1 h-8 rounded-lg bg-white/80 hover:bg-white border text-[#0A0A0A] text-xs font-bold flex items-center justify-center gap-1"
                      >
                        <Pencil size={12} /> Edit
                      </button>
                      <button
                        onClick={() => toggle(t)}
                        title={t.active ? "Nonaktifkan Meja" : "Aktifkan Meja"}
                        className={`tap h-8 w-8 rounded-lg border grid place-items-center ${
                          t.active ? "bg-white/80 text-zinc-700" : "bg-zinc-200 text-zinc-500"
                        }`}
                      >
                        <Power size={13} />
                      </button>
                      <button
                        data-testid={`delete-table-${t.id}`}
                        onClick={() => del(t)}
                        title="Hapus Meja Permanen"
                        className="tap h-8 w-8 rounded-lg bg-[#FEE2E2] hover:bg-[#FCA5A5] text-[#EF4444] grid place-items-center"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
          </div>
        </div>
      ))}

      {/* Dialog Tambah / Edit Meja */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editId ? "Edit" : "Tambah"} Meja</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Field label="Nama / Kode Meja">
              <input
                data-testid="table-name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full h-11 rounded-xl border px-3"
                placeholder="Meja 1 / A1"
              />
            </Field>
            <Field label="Area">
              <input
                data-testid="table-area"
                value={form.area}
                onChange={(e) => setForm({ ...form, area: e.target.value })}
                className="w-full h-11 rounded-xl border px-3"
                placeholder="Indoor / Outdoor"
              />
            </Field>
            <Field label="Kapasitas (Kursi)">
              <input
                type="number"
                value={form.capacity}
                onChange={(e) => setForm({ ...form, capacity: Number(e.target.value) })}
                className="w-full h-11 rounded-xl border px-3 font-num"
              />
            </Field>
          </div>
          <DialogFooter>
            <button
              data-testid="save-table-btn"
              onClick={save}
              className="tap w-full h-12 rounded-xl bg-[#E63946] text-white font-bold"
            >
              Simpan
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog Pindah Meja (Admin/Manager) */}
      <Dialog open={moveOpen} onOpenChange={setMoveOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ArrowRightLeft size={18} className="text-[#1D4ED8]" />
              Pindah Meja (Dine-In)
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="p-3 rounded-xl bg-[#EFF6FF] border border-[#BFDBFE] text-xs">
              <span className="font-bold text-[#1E40AF] block">Meja Asal:</span>
              <span className="text-base font-black text-[#1D4ED8]">{moveSource?.name}</span>
              <span className="text-[#52525B] ml-2 font-semibold">({moveSource?.area} · {moveSource?.capacity} kursi)</span>
            </div>

            <div>
              <label className="text-xs font-bold text-[#52525B] uppercase tracking-wider block mb-2">
                Pilih Meja Tujuan (Kosong):
              </label>
              {emptyTablesForMove.length === 0 ? (
                <div className="p-3 bg-amber-50 border border-amber-200 text-amber-800 text-xs rounded-xl text-center font-medium">
                  Tidak ada meja kosong tersedia saat ini.
                </div>
              ) : (
                <div className="max-h-48 overflow-y-auto grid grid-cols-3 gap-2 pr-1">
                  {emptyTablesForMove.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => setMoveTarget(t)}
                      className={`tap p-2 rounded-xl border-2 font-bold text-center transition ${
                        moveTarget?.id === t.id
                          ? "border-[#1D4ED8] bg-[#EFF6FF] text-[#1D4ED8]"
                          : "border-zinc-200 bg-white hover:border-zinc-400"
                      }`}
                    >
                      <div className="text-sm">{t.name}</div>
                      <div className="text-[10px] text-zinc-500">{t.area}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <DialogFooter className="gap-2 sm:gap-0 pt-2 border-t">
              <button
                onClick={() => setMoveOpen(false)}
                className="tap h-11 px-4 rounded-xl bg-[#F4F5F7] font-bold text-sm text-[#52525B]"
              >
                Batal
              </button>
              <button
                data-testid="confirm-move-table-admin-btn"
                onClick={doMove}
                disabled={!moveTarget}
                className="tap h-11 px-5 rounded-xl bg-[#1D4ED8] hover:bg-[#1E40AF] text-white font-bold text-sm disabled:opacity-40 flex items-center gap-1.5"
              >
                <ArrowRightLeft size={14} /> Pindahkan
              </button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

const Field = ({ label, children }) => (
  <div>
    <label className="text-xs uppercase tracking-wider font-bold text-[#52525B]">{label}</label>
    <div className="mt-1.5">{children}</div>
  </div>
);
