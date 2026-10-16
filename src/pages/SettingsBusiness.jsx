import { useEffect, useState } from "react";
import { toast } from "sonner";
import { SlidersHorizontal, Save, Loader2, Store, Receipt, Users, BadgePercent, AlertTriangle, Percent, Tag, Ban, ShieldAlert, Wallet } from "lucide-react";
import api, { apiError } from "@/lib/api";
import { BIZ_DEFAULTS, loadBusiness } from "@/lib/business";

// Pengaturan Aplikasi — nilai usaha yang bisa diubah admin TANPA mengubah kode.
// Disimpan di server (settings _id:"business"); dibaca backend & perangkat.

// Pengaturan Void & Refund (settings._id="void") — endpoint sendiri: /settings/void.
export const VOID_DEFAULTS = {
  kasir_boleh_void: true, wajib_alasan: true, alasan_min: 5, kasir_max_amount: 0,
  kasir_hanya_shift_berjalan: true, admin_boleh_lepas_blokir: true, restock_retail: true,
};

export default function SettingsBusiness() {
  const [f, setF] = useState(null);
  const [v, setV] = useState(null);
  const [saving, setSaving] = useState(false);
  const set = (k, val) => setF((x) => ({ ...x, [k]: val }));
  const setVoid = (k, val) => setV((x) => ({ ...x, [k]: val }));

  useEffect(() => {
    loadBusiness().then((b) => setF({ ...BIZ_DEFAULTS, ...b, labels: { ...BIZ_DEFAULTS.labels, ...((b && b.labels) || {}) } }));
    api.get("/settings/void").then((r) => setV({ ...VOID_DEFAULTS, ...(r.data || {}) })).catch(() => setV({ ...VOID_DEFAULTS }));
  }, []);

  const save = async () => {
    if (!f) return;
    if (!(Number(f.transport_amount) > 0)) {
      toast.error("Uang transport tidak boleh 0 — isi nominal lebih dari 0");
      return;
    }
    setSaving(true);
    try {
      const { data } = await api.put("/settings/business", {
        labels: { fnb: (f.labels?.fnb || "").trim() || "F&B", retail: (f.labels?.retail || "").trim() || "Retail" },
        order_prefix: (f.order_prefix || "").trim() || "GAK-",
        discount_reason_percent: Number(f.discount_reason_percent || 0),
        discount_reason_amount: Number(f.discount_reason_amount || 0),
        member_earn_per_rupiah: Math.max(1, Number(f.member_earn_per_rupiah || 10000)),
        member_redeem_per_point: Math.max(1, Number(f.member_redeem_per_point || 100)),
        low_stock_threshold: Math.max(1, Number(f.low_stock_threshold || 10)),
        service_tax_percent: Math.max(0, Math.min(100, Number(f.service_tax_percent || 0))),
        transport_amount: Number(f.transport_amount || 0),
      });
      setF({ ...BIZ_DEFAULTS, ...data, labels: { ...BIZ_DEFAULTS.labels, ...(data?.labels || {}) } });
      try { localStorage.setItem("gak_biz_cache", JSON.stringify({ ...BIZ_DEFAULTS, ...data, labels: { ...BIZ_DEFAULTS.labels, ...(data?.labels || {}) } })); } catch (e) {}
      if (v) {
        const { data: vd } = await api.put("/settings/void", {
          kasir_boleh_void: !!v.kasir_boleh_void, wajib_alasan: !!v.wajib_alasan,
          alasan_min: Math.max(1, Math.min(50, Number(v.alasan_min || 5))),
          kasir_max_amount: Math.max(0, Number(v.kasir_max_amount || 0)),
          kasir_hanya_shift_berjalan: !!v.kasir_hanya_shift_berjalan,
          admin_boleh_lepas_blokir: !!v.admin_boleh_lepas_blokir,
          restock_retail: !!v.restock_retail,
        });
        setV({ ...VOID_DEFAULTS, ...(vd || {}) });
      }
      toast.success("Pengaturan aplikasi disimpan — berlaku langsung di semua perangkat");
    } catch (e) { toast.error(apiError(e.response?.data?.detail)); } finally { setSaving(false); }
  };

  if (!f) return <div className="h-full grid place-items-center"><Loader2 className="animate-spin text-[#E63946]" /></div>;

  const inp = "w-full h-11 px-3 rounded-xl border border-[#E4E4E7] outline-none focus:border-[#E63946] text-sm font-num";
  const Field = ({ label, hint, children }) => (
    <div>
      <label className="text-xs uppercase tracking-wider font-bold text-[#52525B]">{label}</label>
      <div className="mt-1.5">{children}</div>
      {hint && <p className="text-[11px] text-[#a1a1aa] mt-1">{hint}</p>}
    </div>
  );
  const Card = ({ icon: Icon, title, children }) => (
    <div className="rounded-2xl border border-[#E4E4E7] bg-white p-5 space-y-3">
      <div className="flex items-center gap-2 font-extrabold"><Icon size={18} className="text-[#E63946]" /> {title}</div>
      {children}
    </div>
  );

  return (
    <div className="h-full overflow-y-auto p-6 lg:p-8" data-testid="settings-business-page">
      <div className="max-w-2xl mx-auto space-y-5">
        <div>
          <h1 className="text-2xl font-extrabold flex items-center gap-2"><SlidersHorizontal className="text-[#E63946]" /> Pengaturan Aplikasi</h1>
          <p className="text-[#52525B] text-sm mt-1">Ubah perilaku usaha tanpa mengubah kode. Perubahan berlaku langsung di server & semua perangkat.</p>
        </div>

        <Card icon={Store} title="Label & Identitas">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Nama Toko F&B" hint="Label untuk alur makan di tempat / bawa pulang">
              <input data-testid="biz-label-fnb" value={f.labels?.fnb || ""} onChange={(e) => setF({ ...f, labels: { ...f.labels, fnb: e.target.value } })} className={inp} />
            </Field>
            <Field label="Nama Toko Retail" hint="Label untuk alur produk retail">
              <input data-testid="biz-label-retail" value={f.labels?.retail || ""} onChange={(e) => setF({ ...f, labels: { ...f.labels, retail: e.target.value } })} className={inp} />
            </Field>
          </div>
          <Field label="Prefiks Nomor Order" hint="Dipakai untuk nomor struk, contoh: GAK-20260908-0001">
            <input data-testid="biz-order-prefix" value={f.order_prefix || ""} onChange={(e) => set("order_prefix", e.target.value)} className={`${inp} max-w-[180px]`} />
          </Field>
        </Card>

        <Card icon={BadgePercent} title="Diskon">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Alasan wajib jika diskon % di atas" hint="0 = tidak pernah wajib">
              <input data-testid="biz-disc-pct" type="number" min="0" max="100" value={f.discount_reason_percent} onChange={(e) => set("discount_reason_percent", e.target.value)} className={inp} />
            </Field>
            <Field label="Alasan wajib jika diskon Rp di atas">
              <input data-testid="biz-disc-amt" type="number" min="0" value={f.discount_reason_amount} onChange={(e) => set("discount_reason_amount", e.target.value)} className={inp} />
            </Field>
          </div>
          <p className="text-[11px] text-[#a1a1aa]">Diskon % bisa hingga 100% (gratis). HPP &amp; bagi hasil vendor tetap dihitung penuh — diskon ditanggung outlet.</p>
        </Card>

        <Card icon={Users} title="Member & Poin">
          <div className="grid grid-cols-2 gap-3">
            <Field label="1 poin per belanja Rp">
              <input data-testid="biz-point-earn" type="number" min="1" value={f.member_earn_per_rupiah} onChange={(e) => set("member_earn_per_rupiah", e.target.value)} className={inp} />
            </Field>
            <Field label="Nilai tukar 1 poin (Rp)">
              <input data-testid="biz-point-redeem" type="number" min="1" value={f.member_redeem_per_point} onChange={(e) => set("member_redeem_per_point", e.target.value)} className={inp} />
            </Field>
          </div>
        </Card>

        <Card icon={Percent} title="Pajak Layanan (Opsional)">
          <Field label="Tarif pajak layanan (%)" hint="0 = nonaktif. Dikenakan di atas total bersih (setelah semua diskon) dan ditambahkan ke total struk.">
            <input data-testid="biz-service-tax" type="number" min="0" max="100" step="0.5" value={f.service_tax_percent} onChange={(e) => set("service_tax_percent", e.target.value)} className={`${inp} max-w-[180px]`} />
          </Field>
        </Card>

        <Card icon={Wallet} title="Shift & Kas">
          <Field label="Uang transport saat tutup shift (Rp)"
            hint="Pengeluaran WAJIB setiap tutup shift dan TIDAK BOLEH 0. Dibebankan ke kas F&B, otomatis tercatat di kas keluar & laporan shift. Nominal ini jadi isian bawaan di form tutup shift (kasir boleh mengubahnya).">
            <input data-testid="biz-transport" type="number" min="1" value={f.transport_amount}
              onChange={(e) => set("transport_amount", e.target.value)} className={`${inp} max-w-[180px]`} />
          </Field>
          {!(Number(f.transport_amount) > 0) && (
            <div className="rounded-xl bg-[#FEF2F2] border border-[#FECACA] px-3 py-2 text-[11px] text-[#B91C1C] font-bold"
              data-testid="biz-transport-warn">
              Nominal uang transport tidak boleh 0 — tutup shift akan ditolak bila nilainya 0.
            </div>
          )}
        </Card>

        <Card icon={AlertTriangle} title="Stok & Peringatan">
          <Field label="Ambang stok menipis (default jika produk tanpa min_stock)">
            <input data-testid="biz-lowstock" type="number" min="1" value={f.low_stock_threshold} onChange={(e) => set("low_stock_threshold", e.target.value)} className={`${inp} max-w-[180px]`} />
          </Field>
        </Card>

        <Card icon={Ban} title="Void & Refund (Pembatalan Transaksi)">
          {!v ? <div className="text-sm text-[#52525B] flex items-center gap-2"><Loader2 size={15} className="animate-spin" /> Memuat…</div> : (
            <div className="space-y-3">
              <label className="flex items-start gap-2 text-sm font-bold">
                <input data-testid="void-cfg-kasir" type="checkbox" checked={!!v.kasir_boleh_void} onChange={(e) => setVoid("kasir_boleh_void", e.target.checked)} className="mt-0.5" />
                <span>Kasir boleh membatalkan transaksi sendiri
                  <span className="block text-[11px] font-normal text-[#52525B]">Hanya untuk transaksi pada shift yang sedang terbuka, alasan wajib, dan selalu tercatat di halaman Void &amp; Refund.</span>
                </span>
              </label>
              <label className="flex items-start gap-2 text-sm font-bold">
                <input data-testid="void-cfg-shift" type="checkbox" checked={!!v.kasir_hanya_shift_berjalan} onChange={(e) => setVoid("kasir_hanya_shift_berjalan", e.target.checked)} className="mt-0.5" />
                <span>Batasi kasir hanya pada shift berjalan
                  <span className="block text-[11px] font-normal text-[#52525B]">Transaksi pada shift yang sudah ditutup diblokir — hanya admin yang bisa melepas blokirnya (koreksi lintas shift, tercatat).</span>
                </span>
              </label>
              <div className="grid md:grid-cols-2 gap-4">
                <Field label="Batas nominal pembatalan kasir (Rp)" hint="0 = tanpa batas. Di atas nilai ini hanya admin yang bisa membatalkan.">
                  <input data-testid="void-cfg-max" type="number" min="0" value={v.kasir_max_amount} onChange={(e) => setVoid("kasir_max_amount", e.target.value)} className={inp} />
                </Field>
                <Field label="Panjang minimal alasan (huruf)" hint="Berlaku untuk semua peran saat alasan wajib.">
                  <input data-testid="void-cfg-min" type="number" min="1" max="50" value={v.alasan_min} onChange={(e) => setVoid("alasan_min", e.target.value)} className={inp} />
                </Field>
              </div>
              <label className="flex items-center gap-2 text-sm font-bold">
                <input data-testid="void-cfg-alasan" type="checkbox" checked={!!v.wajib_alasan} onChange={(e) => setVoid("wajib_alasan", e.target.checked)} />
                Alasan wajib diisi
              </label>
              <label className="flex items-center gap-2 text-sm font-bold">
                <input data-testid="void-cfg-restock" type="checkbox" checked={!!v.restock_retail} onChange={(e) => setVoid("restock_retail", e.target.checked)} />
                Kembalikan stok produk retail saat pembatalan
              </label>
              <label className="flex items-start gap-2 text-sm font-bold">
                <input data-testid="void-cfg-force" type="checkbox" checked={!!v.admin_boleh_lepas_blokir} onChange={(e) => setVoid("admin_boleh_lepas_blokir", e.target.checked)} className="mt-0.5" />
                <span>Admin boleh melepas blokir koreksi lintas shift
                  <span className="block text-[11px] font-normal text-[#52525B]">Bila dimatikan, transaksi pada shift yang sudah ditutup TIDAK bisa dibatalkan siapa pun.</span>
                </span>
              </label>
              <div className="rounded-xl bg-[#FFFBEB] border border-[#FDE68A] p-3 text-[11px] text-[#92400E] flex gap-2">
                <ShieldAlert size={14} className="shrink-0 mt-0.5" />
                <span>Pembatalan TIDAK membuat catatan kas keluar: laporan hanya menghitung transaksi lunas, jadi kas laci otomatis turun dan angkanya terlihat di laporan shift (baris Pembatalan/Refund).</span>
              </div>
            </div>
          )}
        </Card>

        <button data-testid="biz-save" onClick={save} disabled={saving}
          className="tap w-full h-12 rounded-xl bg-[#E63946] hover:bg-[#BE123C] text-white font-bold flex items-center justify-center gap-2 disabled:opacity-60">
          {saving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />} Simpan Pengaturan Aplikasi
        </button>
      </div>
    </div>
  );
}
