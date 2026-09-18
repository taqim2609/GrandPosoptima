import { useEffect, useState } from "react";
import api, { apiError } from "@/lib/api";
import { rupiah, wibToday } from "@/lib/format";
import { toast } from "sonner";
import { CalendarCheck, Plus, Users, Phone, Trash2, Clock, Bot, Info, Copy, Check } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

const STATUS_LABEL = { pending: "Menunggu", confirmed: "Dikonfirmasi", arrived: "Datang", cancelled: "Batal", done: "Selesai" };
const STATUS_COLOR = { pending: "bg-[#FEF3C7] text-[#B45309]", confirmed: "bg-[#E0E7FF] text-[#4338CA]", arrived: "bg-[#D1FAE5] text-[#047857]", cancelled: "bg-[#FEE2E2] text-[#EF4444]", done: "bg-[#F4F5F7] text-[#52525B]" };

export default function Reservations() {
  const [date, setDate] = useState(wibToday());
  const [rows, setRows] = useState([]);
  const [tables, setTables] = useState([]);
  const [open, setOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [form, setForm] = useState({ table_id: "", customer_name: "", phone: "", pax: 2, time: "12:00", note: "" });

  const webhookUrl = `${window.location.origin}/api/webhook/whatsapp`;

  const copyUrl = () => {
    navigator.clipboard.writeText(webhookUrl);
    setCopied(true);
    toast.success("URL Webhook berhasil disalin!");
    setTimeout(() => setCopied(false), 2000);
  };

  const load = () => {
    api.get("/reservations", { params: { date } }).then((r) => setRows(r.data.reservations || [])).catch(() => {});
    api.get("/tables").then((r) => setTables(r.data || [])).catch(() => {});
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- refetch on date change
  useEffect(() => { load(); }, [date]);

  const save = async () => {
    if (!form.customer_name.trim()) return toast.error("Nama pemesan wajib");
    if (!form.table_id) return toast.error("Pilih meja");
    try {
      await api.post("/reservations", { ...form, date });
      toast.success("Reservasi dibuat (Dikonfirmasi)");
      setOpen(false); setForm({ table_id: "", customer_name: "", phone: "", pax: 2, time: "12:00", note: "" });
      load();
    } catch (e) { toast.error(apiError(e.response?.data?.detail)); }
  };

  const setStatus = async (id, status) => {
    try {
      await api.post(`/reservations/${id}/status`, { status });
      load();
    } catch (e) { toast.error(apiError(e.response?.data?.detail)); }
  };
  const del = async (id) => {
    if (!window.confirm("Hapus reservasi ini?")) return;
    try { await api.delete(`/reservations/${id}`); load(); } catch (e) { toast.error(apiError(e.response?.data?.detail)); }
  };

  return (
    <div className="h-full overflow-y-auto p-6 lg:p-8">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-extrabold flex items-center gap-2"><CalendarCheck /> Reservasi Meja</h1>
          <p className="text-xs text-[#52525B] mt-1">Kelola daftar reservasi pelanggan dan booking otomatis WhatsApp AI</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={() => setInfoOpen(true)} className="tap h-11 px-4 rounded-xl bg-[#EEF2FF] hover:bg-[#E0E7FF] text-[#4338CA] font-bold text-xs flex items-center gap-2 border border-[#C7D2FE]">
            <Bot size={16} /> Status Webhook WA AI
          </button>
          <input data-testid="res-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-11 rounded-xl border px-3 font-num bg-white" />
          <button data-testid="add-reservation-btn" onClick={() => setOpen(true)} className="tap h-11 px-5 rounded-xl bg-[#E63946] hover:bg-[#BE123C] text-white font-bold flex items-center gap-2"><Plus size={18} /> Reservasi</button>
        </div>
      </div>

      {/* Banner AI Webhook */}
      <div className="mb-6 p-4 rounded-2xl bg-gradient-to-r from-[#F0FDF4] to-[#ECFDF5] border border-[#A7F3D0] flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-[#10B981] text-white grid place-items-center shadow-sm">
            <Bot size={20} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm text-[#065F46]">Booking Otomatis WhatsApp AI (WACloud)</span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-[#D1FAE5] text-[#047857] border border-[#6EE7B7]">Aktif</span>
            </div>
            <p className="text-xs text-[#047857] mt-0.5">Pesan WhatsApp dari pelanggan akan diproses otomatis oleh Gemini AI dan langsung masuk ke tabel ini.</p>
          </div>
        </div>
        <button onClick={() => setInfoOpen(true)} className="text-xs font-bold text-[#047857] underline hover:text-[#065F46] flex items-center gap-1">
          <Info size={14} /> Panduan URL Webhook
        </button>
      </div>

      <div className="bg-white rounded-2xl border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-[#F4F5F7] text-[#52525B] text-xs uppercase tracking-wider">
            <tr><th className="text-left p-3">Jam</th><th className="text-left p-3">Pelanggan</th><th className="text-left p-3">Meja</th><th className="text-center p-3">Pax</th><th className="text-left p-3">Status</th><th className="p-3"></th></tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={6} className="p-10 text-center text-[#a1a1aa]">Belum ada reservasi untuk tanggal ini.</td></tr>}
            {rows.map((r) => {
              const isAuto = (r.note && r.note.includes("WhatsApp")) || r.created_by === "WACloud AI";
              return (
                <tr key={r.id} className="border-t" data-testid={`reservation-${r.id}`}>
                  <td className="p-3"><span className="font-bold flex items-center gap-1"><Clock size={13} /> {r.time}</span></td>
                  <td className="p-3">
                    <div className="font-bold flex items-center gap-1.5">
                      {r.customer_name}
                      {isAuto && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-[#DCFCE7] text-[#15803D] border border-[#86EFAC]">
                          Auto WA
                        </span>
                      )}
                    </div>
                    {r.phone && <div className="text-[11px] text-[#52525B] flex items-center gap-1"><Phone size={10} /> {r.phone}</div>}
                    {r.note && <div className="text-[11px] text-[#a1a1aa]">{r.note}</div>}
                  </td>
                  <td className="p-3 font-semibold">{r.table_name}</td>
                  <td className="p-3 text-center"><span className="inline-flex items-center gap-1 font-bold"><Users size={13} /> {r.pax}</span></td>
                  <td className="p-3">
                    <select value={r.status} onChange={(e) => setStatus(r.id, e.target.value)}
                      className={`text-xs font-bold px-2 py-1 rounded-full border-0 ${STATUS_COLOR[r.status] || STATUS_COLOR.pending}`}>
                      {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                  </td>
                  <td className="p-3 text-right">
                    <button onClick={() => del(r.id)} className="tap h-8 w-8 rounded-lg bg-[#FEE2E2] text-[#EF4444] grid place-items-center"><Trash2 size={14} /></button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Modal Dialog Info Webhook */}
      <Dialog open={infoOpen} onOpenChange={setInfoOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg font-bold">
              <Bot className="text-[#10B981]" /> Konfigurasi Webhook WACloud.id
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 text-xs text-[#3F3F46]">
            <p>
              Sistem booking & reservasi otomatis telah aktif secara bawaan. Salin URL Webhook di bawah ini dan tempelkan ke pengaturan Webhook di akun <b>WACloud.id</b> Anda:
            </p>
            <div>
              <label className="text-[11px] font-bold uppercase text-[#71717A] tracking-wider block mb-1">URL Webhook Receiver</label>
              <div className="flex items-center gap-2">
                <input readOnly value={webhookUrl} className="flex-1 h-10 rounded-xl border bg-[#F4F5F7] px-3 font-mono text-xs text-[#18181B]" />
                <button onClick={copyUrl} className="tap h-10 px-3 rounded-xl bg-[#18181B] text-white font-bold flex items-center gap-1.5">
                  {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? "Tersalin" : "Salin"}
                </button>
              </div>
            </div>
            <div className="p-3 rounded-xl bg-[#F4F5F7] border space-y-1.5">
              <div className="font-bold text-[#18181B]">Panduan Singkat WACloud:</div>
              <ol className="list-decimal list-inside space-y-1">
                <li>Buka dashboard <b>WACloud.id</b> dan pilih sesi/device WhatsApp Anda.</li>
                <li>Masuk ke menu <b>Webhook Settings</b>.</li>
                <li>Tempel URL Webhook di atas pada kolom <i>Webhook URL</i>.</li>
                <li>Pilih event <b>Message Received / Inbound</b> lalu klik Simpan.</li>
              </ol>
            </div>
          </div>
          <DialogFooter>
            <button onClick={() => setInfoOpen(false)} className="tap h-10 px-5 rounded-xl bg-[#18181B] text-white font-bold text-xs">Tutup</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent data-testid="reservation-dialog">
          <DialogHeader><DialogTitle>Buat Reservasi</DialogTitle></DialogHeader>
          <div className="space-y-3 text-sm">
            <div>
              <label className="text-xs uppercase tracking-wider font-bold text-[#52525B]">Nama Pemesan</label>
              <input data-testid="res-name" value={form.customer_name} onChange={(e) => setForm({ ...form, customer_name: e.target.value })} className="mt-1 w-full h-11 rounded-xl border px-3" />
            </div>
            <div>
              <label className="text-xs uppercase tracking-wider font-bold text-[#52525B]">No. HP</label>
              <input data-testid="res-phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="628xxx" className="mt-1 w-full h-11 rounded-xl border px-3 font-num" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs uppercase tracking-wider font-bold text-[#52525B]">Meja</label>
                <select data-testid="res-table" value={form.table_id} onChange={(e) => setForm({ ...form, table_id: e.target.value })} className="mt-1 w-full h-11 rounded-xl border px-3 bg-white">
                  <option value="">— pilih —</option>
                  {tables.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs uppercase tracking-wider font-bold text-[#52525B]">Jam</label>
                <input data-testid="res-time" type="time" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} className="mt-1 w-full h-11 rounded-xl border px-3 font-num" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs uppercase tracking-wider font-bold text-[#52525B]">Jumlah Orang</label>
                <input data-testid="res-pax" type="number" min="1" value={form.pax} onChange={(e) => setForm({ ...form, pax: e.target.value })} className="mt-1 w-full h-11 rounded-xl border px-3 font-num" />
              </div>
              <div>
                <label className="text-xs uppercase tracking-wider font-bold text-[#52525B]">Tanggal</label>
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="mt-1 w-full h-11 rounded-xl border px-3 font-num" />
              </div>
            </div>
            <div>
              <label className="text-xs uppercase tracking-wider font-bold text-[#52525B]">Catatan</label>
              <input data-testid="res-note" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="opsional" className="mt-1 w-full h-11 rounded-xl border px-3" />
            </div>
          </div>
          <DialogFooter>
            <button data-testid="save-reservation" onClick={save} className="tap h-11 px-6 rounded-xl bg-[#E63946] text-white font-bold">Simpan</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
