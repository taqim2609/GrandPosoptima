import { useEffect, useState } from "react";
import api, { apiError } from "@/lib/api";
import { toast } from "sonner";
import { MessageCircle, Save, Loader2, ShieldAlert, ShoppingCart, TrendingUp, ListChecks, Clock } from "lucide-react";

export default function SettingsReport() {
  const [form, setForm] = useState({ whatsapp_enabled: false, whatsapp_time: "22:00", recipients: "", include_ai: true, send_sales: true, send_purchases: false, send_shift_auto: true });
  const [shop, setShop] = useState({ recipients: "", request_on_close: false });
  const [configured, setConfigured] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([api.get("/settings/report"), api.get("/settings/shopping")])
      .then(([a, b]) => {
        setForm({
          whatsapp_enabled: a.data.whatsapp_enabled,
          whatsapp_time: a.data.whatsapp_time || "22:00",
          recipients: (a.data.recipients || []).join("\n"),
          include_ai: a.data.include_ai,
          send_sales: a.data.send_sales !== false,
          send_purchases: !!a.data.send_purchases,
          send_shift_auto: a.data.send_shift_auto !== false,
        });
        setConfigured(!!a.data.whatsapp_configured);
        setShop({ recipients: (b.data.recipients || []).join("\n"), request_on_close: !!b.data.request_on_close });
      })
      .catch((e) => toast.error(apiError(e.response?.data?.detail)))
      .finally(() => setLoading(false));
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      const recipients = form.recipients.split(/[\n,]/).map((s) => s.trim()).filter(Boolean);
      await api.put("/settings/report", { ...form, recipients });
      await api.put("/settings/shopping", {
        recipients: shop.recipients.split(/[\n,]/).map((s) => s.trim()).filter(Boolean),
        request_on_close: shop.request_on_close,
      });
      toast.success("Pengaturan laporan & WhatsApp tersimpan");
    } catch (e) { toast.error(apiError(e.response?.data?.detail)); } finally { setSaving(false); }
  };

  if (loading) return <div className="h-full grid place-items-center"><Loader2 className="animate-spin text-[#E63946]" /></div>;

  return (
    <div className="h-full overflow-y-auto p-8">
      <h1 className="text-2xl font-extrabold flex items-center gap-2 mb-1"><MessageCircle /> Laporan &amp; WhatsApp</h1>
      <p className="text-sm text-[#52525B] mb-5">Kirim laporan harian otomatis ke WhatsApp lewat wacloud.id, atau kirim manual dari Dashboard.</p>

      {!configured && (
        <div data-testid="wa-not-configured" className="flex items-start gap-3 bg-[#FEF3C7] border border-[#F59E0B] text-[#92400E] rounded-2xl px-4 py-3 mb-5 max-w-2xl">
          <ShieldAlert size={20} className="shrink-0 mt-0.5" />
          <div className="text-sm">
            <div className="font-extrabold">WhatsApp Gateway belum siap</div>
            Buka menu <b>WhatsApp</b> di sidebar, isi API Key wacloud.id lalu pilih device, agar pengiriman laporan berfungsi.
          </div>
        </div>
      )}

      <div className="bg-white rounded-2xl border p-6 max-w-2xl space-y-4">
        <label className="flex items-center justify-between">
          <span className="font-bold">Aktifkan laporan harian otomatis</span>
          <input data-testid="wa-enabled" type="checkbox" checked={form.whatsapp_enabled}
            onChange={(e) => setForm({ ...form, whatsapp_enabled: e.target.checked })} className="h-5 w-5" />
        </label>

        <div className="rounded-xl border border-[#E4E4E7] p-3 space-y-3">
          <div className="text-xs uppercase tracking-wider font-bold text-[#52525B]">Isi Laporan yang Dikirim</div>
          <label className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-sm font-bold"><TrendingUp size={16} className="text-[#10B981]" /> Laporan Penjualan harian</span>
            <input data-testid="report-send-sales" type="checkbox" checked={form.send_sales}
              onChange={(e) => setForm({ ...form, send_sales: e.target.checked })} className="h-5 w-5" />
          </label>
          <label className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-sm font-bold"><ShoppingCart size={16} className="text-[#E63946]" /> Laporan Belanja harian</span>
            <input data-testid="report-send-purchases" type="checkbox" checked={form.send_purchases}
              onChange={(e) => setForm({ ...form, send_purchases: e.target.checked })} className="h-5 w-5" />
          </label>
        </div>

        <div className="rounded-xl border border-[#BFDBFE] bg-[#EFF6FF] p-3 space-y-2">
          <label className="flex items-start justify-between gap-3">
            <span className="flex items-start gap-2 text-sm font-bold text-[#1E40AF]">
              <Clock size={16} className="mt-0.5 shrink-0" />
              <span>Kirim laporan tutup shift otomatis ke WhatsApp
                <span className="block text-[11px] font-normal text-[#374151]">
                  Setiap kali shift ditutup, laporan shift (template <b>Laporan Shift</b>) langsung dikirim
                  ke nomor WhatsApp di bawah — tanpa perlu menekan tombol kirim. Matikan bila tidak diinginkan.
                  Format pesannya diatur di bagian <b>Template WhatsApp</b>.
                </span>
              </span>
            </span>
            <input data-testid="report-shift-auto" type="checkbox" checked={!!form.send_shift_auto}
              onChange={(e) => setForm({ ...form, send_shift_auto: e.target.checked })} className="h-5 w-5 mt-0.5" />
          </label>
          {!form.send_shift_auto && (
            <div className="text-[11px] text-[#92400E]" data-testid="report-shift-auto-off">
              Auto-kirim mati — laporan shift hanya terkirim bila ditekan manual di halaman Shift.
            </div>
          )}
        </div>

        <div>
          <label className="text-xs uppercase tracking-wider font-bold text-[#52525B]">Jam Kirim (WIB)</label>
          <input data-testid="wa-time" type="time" value={form.whatsapp_time}
            onChange={(e) => setForm({ ...form, whatsapp_time: e.target.value })}
            className="w-full h-11 rounded-xl border px-3 mt-1.5 font-num" />
          <span className="text-[11px] text-[#a1a1aa]">Laporan dikirim otomatis di awal jam yang dipilih (mis. 22:00 = sekitar pukul 22.00 WIB).</span>
        </div>
        <div>
          <label className="text-xs uppercase tracking-wider font-bold text-[#52525B]">Nomor WhatsApp Tujuan</label>
          <textarea data-testid="wa-recipients" value={form.recipients}
            onChange={(e) => setForm({ ...form, recipients: e.target.value })} rows={3}
            placeholder="628123456789&#10;628560000000" className="w-full rounded-xl border px-3 py-2 mt-1.5 font-num" />
          <span className="text-[11px] text-[#a1a1aa]">Format 62... Satu nomor per baris atau pisahkan dengan koma.</span>
        </div>
        <label className="flex items-center justify-between">
          <span className="font-bold">Sertakan analisis AI dalam laporan penjualan</span>
          <input data-testid="wa-include-ai" type="checkbox" checked={form.include_ai}
            onChange={(e) => setForm({ ...form, include_ai: e.target.checked })} className="h-5 w-5" />
        </label>
      </div>

      {/* ---- Daftar belanja bahan: nomor WA khusus + minta saat tutup shift ---- */}
      <div className="bg-white rounded-2xl border p-6 max-w-2xl space-y-4 mt-5">
        <h2 className="font-extrabold flex items-center gap-2"><ListChecks size={18} className="text-[#7C3AED]" /> Daftar Belanja Bahan</h2>
        <p className="text-xs text-[#52525B] -mt-2">
          Nomor tujuan khusus untuk kirim daftar belanja (bisa beda dari nomor laporan — mis. nomor supplier). Daftar belanja dibuat di menu <b>Bahan &amp; Belanja</b>.
        </p>
        <div>
          <label className="text-xs uppercase tracking-wider font-bold text-[#52525B]">Nomor WhatsApp Tujuan Belanja</label>
          <textarea data-testid="shop-recipients" value={shop.recipients}
            onChange={(e) => setShop({ ...shop, recipients: e.target.value })} rows={2}
            placeholder="628123456789&#10;628560000000" className="w-full rounded-xl border px-3 py-2 mt-1.5 font-num" />
          <span className="text-[11px] text-[#a1a1aa]">Format 62... Kosongkan untuk memakai nomor laporan biasa.</span>
        </div>
        <label className="flex items-center justify-between">
          <span className="font-bold">Tampilkan pengingat “buat daftar belanja” saat shift ditutup</span>
          <input data-testid="shop-on-close" type="checkbox" checked={shop.request_on_close}
            onChange={(e) => setShop({ ...shop, request_on_close: e.target.checked })} className="h-5 w-5" />
        </label>
      </div>

      <div className="mt-5 max-w-2xl">
        <button data-testid="save-report-settings-btn" onClick={save} disabled={saving}
          className="tap w-full h-12 rounded-xl bg-[#E63946] hover:bg-[#BE123C] text-white font-bold flex items-center justify-center gap-2 disabled:opacity-50">
          {saving ? <Loader2 size={17} className="animate-spin" /> : <Save size={17} />} Simpan Semua Pengaturan
        </button>
      </div>
    </div>
  );
}
