/* ================================================================
   TEMPLATE WHATSAPP — edit teks semua pesan WA (tanpa ubah kode).
   Jenis: laporan harian, laporan shift, bagi hasil vendor, bukti pembayaran vendor
   (settlement), daftar belanja bahan, belanja retail. Variabel {nama} diisi otomatis.
   ================================================================ */
import { useEffect, useState } from "react";
import api, { apiError } from "@/lib/api";
import { toast } from "sonner";
import { FileText, Save, RotateCcw, Loader2, MessageSquareText } from "lucide-react";

const TEMPLATE_META = [
  { key: "daily", label: "Laporan Harian (penjualan otomatis/manual)", icon: "📊",
    vars: [
      ["nama_aplikasi", "Nama aplikasi"], ["tanggal", "Tanggal laporan"],
      ["total_penjualan", "Total penjualan"], ["order_count", "Jumlah order"],
      ["laba_kotor", "Laba kotor"], ["total_diskon", "Total diskon"],
      ["kategori_makanan", "Penjualan kategori Makanan"], ["kategori_minuman", "Penjualan kategori Minuman"],
      ["kategori_retail", "Penjualan kategori Retail"],
      ["rincian_metode", "Blok metode bayar (otomatis)"], ["rincian_terlaris", "Blok produk terlaris (otomatis)"],
      ["rincian_ai", "Blok analisis AI (bila aktif)"],
    ] },
  { key: "shift", label: "Laporan Shift (penutupan shift)", icon: "🕐",
    vars: [
      ["nama_aplikasi", "Nama aplikasi"], ["kasir", "Nama kasir"], ["tanggal_shift", "Tanggal buka shift"],
      ["total_penjualan", "Total penjualan"], ["order_count", "Jumlah order"],
      ["fnb_total", "Total F&B"], ["dine_in", "Dine-in"], ["take_away", "Take-away"],
      ["retail_total", "Total Retail"], ["out_fnb", "Pengeluaran F&B"], ["out_retail", "Pengeluaran Retail"],
      ["expected_cash", "Perkiraan kas"], ["net_cash_fnb", "Uang bersih F&B"],
      ["net_cash_retail", "Uang bersih Retail"], ["net_cash", "Uang bersih total"],
      ["rincian_vendor", "Blok rincian bagi hasil vendor (otomatis)"],
      ["bayar_vendor", "Bagi hasil vendor yang sudah dibayar (settlement)"],
      ["void_count", "Jumlah pembatalan/refund pada shift ini"],
      ["void_amount", "Nilai transaksi yang dibatalkan pada shift ini"],
      ["dibuka_oleh", "Akun yang membuka shift"],
      ["ditutup_oleh", "Akun yang menutup shift"],
      ["kas_awal_fnb", "Kas awal F&B"], ["kas_awal_retail", "Kas awal Retail"],
      ["kas_akhir_fnb", "Kas akhir F&B"], ["kas_akhir_retail", "Kas akhir Retail"],
      ["rincian_metode", "Blok metode pembayaran (otomatis)"],
      ["penjualan_tunai", "Penjualan tunai total"], ["penjualan_tunai_fnb", "Penjualan tunai F&B"],
      ["penjualan_tunai_retail", "Penjualan tunai Retail"],
      ["sisa_cash_fnb", "Sisa kas tunai F&B (tunai − pengeluaran)"],
      ["sisa_cash_retail", "Sisa kas tunai Retail"], ["sisa_cash", "Sisa kas tunai total"],
      ["transport", "Uang transport wajib (F&B)"],
      ["pengeluaran_fnb", "Total pengeluaran harian F&B"], ["pengeluaran_retail", "Total pengeluaran harian Retail"],
      ["catatan_pengeluaran", "Catatan bila pengeluaran harian belum diisi (otomatis)"],
    ] },
  { key: "settlement", label: "Bukti Pembayaran Vendor (settlement)", icon: "🧾",
    vars: [
      ["nama_aplikasi", "Nama aplikasi"], ["nomor", "Nomor bukti (STL-...)"], ["vendor", "Nama vendor"],
      ["tanggal", "Tanggal periode"], ["omzet_vendor", "Omzet penjualan vendor hari itu"],
      ["bagi_hasil", "Bagi hasil hari ini"], ["bagian_outlet", "Bagian outlet"],
      ["saldo_sebelum", "Saldo sebelum (dibawa dari sebelumnya)"],
      ["total_harus_dibayar", "Total harus dibayar"], ["dibayar", "Nominal dibayarkan"],
      ["sisa_saldo", "Sisa saldo (dibawa ke berikutnya)"], ["metode", "Metode pembayaran"],
      ["catatan", "Catatan pembayaran"], ["rincian_produk", "Blok rincian produk terjual (otomatis)"],
    ] },
  { key: "vendor", label: "Bagi Hasil Vendor", icon: "🤝",
    vars: [
      ["nama_aplikasi", "Nama aplikasi"], ["periode", "Periode laporan"],
      ["total_omzet", "Total omzet vendor"], ["total_bagi_hasil", "Total bagi hasil vendor"],
      ["bagian_outlet", "Bagian outlet"], ["rincian_vendor", "Blok rincian per vendor (otomatis)"],
    ] },
  { key: "shopping", label: "Daftar Belanja Bahan", icon: "🛒",
    vars: [
      ["tanggal", "Tanggal daftar belanja"], ["items", "Daftar item (otomatis, satu per baris)"],
      ["jumlah_item", "Banyaknya item"], ["total_estimasi", "Estimasi total biaya"],
    ] },
  { key: "purchase", label: "Laporan Belanja Retail (otomatis)", icon: "📦",
    vars: [
      ["nama_aplikasi", "Nama aplikasi"], ["tanggal", "Tanggal"],
      ["total_belanja", "Total belanja"], ["jumlah_item", "Jumlah item"], ["items", "Rincian item (otomatis)"],
    ] },
];

export default function SettingsWATemplates() {
  const [templates, setTemplates] = useState(null);
  const [active, setActive] = useState("daily");
  const [drafts, setDrafts] = useState({});
  const [defaults, setDefaults] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get("/settings/wa-templates").then((r) => {
      setTemplates(r.data.templates || {});
      setDefaults(r.data.defaults || {});
      setDrafts({ ...(r.data.templates || {}) });
    }).catch((e) => toast.error(apiError(e.response?.data?.detail)));
  }, []);

  if (!templates) return <div className="h-40 grid place-items-center"><Loader2 className="animate-spin text-[#E63946]" /></div>;

  const meta = TEMPLATE_META.find((m) => m.key === active) || TEMPLATE_META[0];
  const text = drafts[active] ?? "";
  const insert = (v) => {
    const el = document.getElementById("wa-tpl-" + active);
    const s = el?.selectionStart ?? text.length;
    const e = el?.selectionEnd ?? text.length;
    const next = text.slice(0, s) + "{" + v + "}" + text.slice(e);
    setDrafts((d) => ({ ...d, [active]: next }));
    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(s + v.length + 2, s + v.length + 2); });
  };
  const resetOne = () => { if (!window.confirm("Kembalikan template ini ke bawaan?")) return; setDrafts((d) => ({ ...d, [active]: defaults[active] || "" })); };
  const save = async () => {
    setSaving(true);
    try {
      await api.put("/settings/wa-templates", { templates: drafts });
      setTemplates({ ...drafts });
      toast.success("Template WhatsApp disimpan — berlaku untuk kiriman berikutnya");
    } catch (e) { toast.error(apiError(e.response?.data?.detail)); } finally { setSaving(false); }
  };

  return (
    <div className="p-8" data-testid="settings-wa-templates">
      <h1 className="text-2xl font-extrabold flex items-center gap-2 mb-1"><MessageSquareText /> Template WhatsApp</h1>
      <p className="text-sm text-[#52525B] max-w-2xl mb-5">
        Semua pesan WhatsApp aplikasi (laporan harian, laporan shift, bagi hasil vendor, daftar belanja bahan, belanja retail)
        dirender dari template ini. Tulis <b>{"{variabel}"}</b> dari daftar — isinya diambil otomatis saat kirim. Bagian daftar panjang
        (produk terlaris, rincian vendor, item belanja) disediakan sebagai variabel blok.
      </p>

      <div className="flex flex-wrap gap-1.5 mb-4">
        {TEMPLATE_META.map((m) => (
          <button key={m.key} data-testid={`tpl-tab-${m.key}`} onClick={() => setActive(m.key)}
            className={`tap h-9 px-3 rounded-xl text-xs font-bold border ${active === m.key ? "bg-[#E63946] text-white border-[#E63946]" : "bg-white text-[#52525B]"}`}>
            {m.icon} {m.label}
          </button>
        ))}
      </div>

      <div className="grid lg:grid-cols-[1fr_240px] gap-4 items-start">
        <div className="bg-white rounded-2xl border p-5">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-extrabold text-sm">{meta.label}</h3>
            <button onClick={resetOne} className="tap text-xs font-bold text-[#EF4444] hover:underline flex items-center gap-1"><RotateCcw size={12} /> Reset ke bawaan</button>
          </div>
          <textarea id={"wa-tpl-" + active} rows={14} data-testid={`tpl-text-${active}`}
            value={text} onChange={(e) => setDrafts((d) => ({ ...d, [active]: e.target.value }))}
            className="w-full rounded-xl border px-3 py-2.5 font-mono text-[12.5px] leading-relaxed" />
          <div className="flex justify-end mt-3">
            <button data-testid="tpl-save" onClick={save} disabled={saving}
              className="tap h-11 px-6 rounded-xl bg-[#E63946] hover:bg-[#BE123C] text-white font-bold flex items-center gap-2 disabled:opacity-60">
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Simpan Semua Template
            </button>
          </div>
        </div>

        <div className="bg-white rounded-2xl border p-4 sticky top-4">
          <div className="text-xs font-extrabold uppercase tracking-wider text-[#52525B] mb-2 flex items-center gap-1.5"><FileText size={13} /> Variabel tersedia</div>
          <p className="text-[11px] text-[#a1a1aa] mb-2">Klik untuk menyisipkan ke posisi kursor.</p>
          <div className="flex flex-wrap gap-1.5">
            {meta.vars.map(([v, lbl]) => (
              <button key={v} title={lbl} onClick={() => insert(v)}
                className="tap rounded-lg border px-2 py-1 text-[11px] font-mono font-bold text-[#7C3AED] hover:bg-[#F3E8FF]">
                {"{" + v + "}"}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
