/* ================================================================
   PENGATURAN → PLATFORM & TAMPILAN (admin)
   Nama aplikasi, logo, dan warna tema — langsung berlaku di seluruh
   aplikasi (login, sidebar, tombol, aksen) TANPA deploy ulang.
   ================================================================ */
import { useEffect, useState } from "react";
import api, { apiError } from "@/lib/api";
import { toast } from "sonner";
import { Palette, Save, RotateCcw, Loader2, Upload, CheckCircle2, ImageIcon } from "lucide-react";
import { PLATFORM_DEFAULTS, usePlatform, applyTheme, logoUrl, sanitizeThemeColor } from "@/lib/platform";

const PRESETS = ["#E63946", "#0EA5E9", "#047857", "#7C3AED", "#DB2777", "#B45309", "#4F46E5", "#0F766E", "#C026D3", "#2563EB"];

export default function SettingsPlatform() {
  const { platform, reload } = usePlatform();
  const [form, setForm] = useState({ ...PLATFORM_DEFAULTS });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    api.get("/settings/platform").then((r) => {
      setForm({ ...PLATFORM_DEFAULTS, ...(r.data || {}) });
    }).catch(() => {});
  }, []);

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  const save = async () => {
    setSaving(true);
    try {
      const body = {
        app_name: form.app_name, tagline: form.tagline, logo_url: form.logo_url || "",
        primary: sanitizeThemeColor(form.primary, PLATFORM_DEFAULTS.primary),
        accent: sanitizeThemeColor(form.accent, PLATFORM_DEFAULTS.accent),
      };
      const { data } = await api.put("/settings/platform", body);
      setForm({ ...PLATFORM_DEFAULTS, ...data });
      applyTheme(data);
      toast.success("Tampilan platform disimpan — berlaku sekarang juga");
      await reload();
    } catch (e) {
      toast.error(apiError(e.response?.data?.detail));
    } finally {
      setSaving(false);
    }
  };

  const resetDefault = async () => {
    if (!window.confirm("Kembalikan nama & warna ke bawaan? Logo akan dihapus.")) return;
    setSaving(true);
    try {
      const { data } = await api.put("/settings/platform", {
        app_name: PLATFORM_DEFAULTS.app_name, tagline: PLATFORM_DEFAULTS.tagline, logo_url: "",
        primary: PLATFORM_DEFAULTS.primary, accent: PLATFORM_DEFAULTS.accent,
      });
      setForm({ ...PLATFORM_DEFAULTS, ...data });
      applyTheme(data);
      toast.success("Dikembalikan ke bawaan");
      await reload();
    } catch (e) { toast.error(apiError(e.response?.data?.detail)); } finally { setSaving(false); }
  };

  const uploadLogo = async (file) => {
    if (!file) return;
    setUploading(true);
    const fd = new FormData();
    fd.append("file", file);
    try {
      const { data } = await api.post("/settings/platform/logo", fd);
      setForm((f) => ({ ...f, logo_url: data.url }));
      toast.success("Logo diunggah — klik Simpan untuk memberlakukan");
    } catch (e) {
      toast.error(apiError(e.response?.data?.detail));
    } finally { setUploading(false); }
  };

  // pratinjau pakai warna yang sedang diedit
  const preview = {
    ...form,
    primary: sanitizeThemeColor(form.primary, "#E63946"),
    accent: sanitizeThemeColor(form.accent, "#F97316"),
  };

  return (
    <div className="h-full overflow-y-auto p-6" data-testid="settings-platform">
      <h2 className="text-2xl font-extrabold flex items-center gap-2"><Palette size={22} /> Platform & Tampilan</h2>
      <p className="text-sm text-[#52525B] mt-1 max-w-2xl">
        Nama aplikasi, logo, dan warna tema bisa diubah di sini dan <b>langsung berlaku tanpa deploy ulang</b> —
        dipakai di layar login, menu samping, tombol utama, dan aksen aplikasi.
      </p>

      <div className="grid lg:grid-cols-[1fr_320px] gap-5 mt-6">
        {/* ---- form kiri ---- */}
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border p-5">
            <h3 className="font-extrabold mb-3">Identitas Aplikasi</h3>
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <Lbl>Nama aplikasi</Lbl>
                <input data-testid="pf-name" value={form.app_name} onChange={(e) => set({ app_name: e.target.value })}
                  placeholder="cth: Grand Aceh Kuliner" className="mt-1 w-full h-11 rounded-xl border px-3" />
              </div>
              <div>
                <Lbl>Subjudul / tagline</Lbl>
                <input data-testid="pf-tagline" value={form.tagline} onChange={(e) => set({ tagline: e.target.value })}
                  placeholder="cth: KULINER POS" className="mt-1 w-full h-11 rounded-xl border px-3 uppercase" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl border p-5">
            <h3 className="font-extrabold mb-3">Logo</h3>
            <div className="flex items-center gap-4 flex-wrap">
              {preview.logo_url ? (
                <img src={logoUrl(preview)} alt="logo pratinjau" className="h-16 w-16 rounded-xl border object-contain bg-white" />
              ) : (
                <div className="h-16 w-16 rounded-xl grid place-items-center text-white font-heading font-extrabold text-2xl"
                  style={{ backgroundColor: preview.primary }}>
                  {(preview.app_name || "G").trim().charAt(0).toUpperCase()}
                </div>
              )}
              <div className="space-y-2">
                <label className="tap inline-flex h-10 items-center gap-2 rounded-xl bg-[#0A0A0A] text-white font-bold text-sm px-4 cursor-pointer">
                  {uploading ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}
                  {preview.logo_url ? "Ganti Logo" : "Upload Logo"}
                  <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden"
                    onChange={(e) => uploadLogo(e.target.files?.[0])} />
                </label>
                {preview.logo_url && (
                  <button onClick={() => set({ logo_url: "" })} className="tap block text-xs font-bold text-[#EF4444] hover:underline">
                    Hapus logo (pakai inisial)
                  </button>
                )}
                <p className="text-[11px] text-[#a1a1aa] max-w-xs flex items-center gap-1">
                  <ImageIcon size={12} /> PNG/JPG/WEBP/GIF maks 2MB. Logo tampil di layar login & menu samping.
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl border p-5">
            <h3 className="font-extrabold mb-1">Warna Tema</h3>
            <p className="text-xs text-[#a1a1aa] mb-4">Warna utama = tombol/aksen. Warna aksen = gradasi menu aktif & dasar gradasi.</p>
            <div className="grid sm:grid-cols-2 gap-4">
              <ColorField label="Warna utama" value={preview.primary} onChange={(v) => set({ primary: v })} presets={PRESETS} />
              <ColorField label="Warna aksen" value={preview.accent} onChange={(v) => set({ accent: v })} presets={["#F97316", "#F59E0B", "#22C55E", "#06B6D4", "#8B5CF6", "#EC4899", "#64748B", "#EAB308", "#14B8A6", "#F43F5E"]} />
            </div>
          </div>

          <div className="flex gap-3 flex-wrap">
            <button data-testid="pf-save" onClick={save} disabled={saving}
              className="tap h-12 px-6 rounded-xl text-white font-bold flex items-center gap-2 disabled:opacity-60"
              style={{ backgroundColor: sanitizeThemeColor(form.primary, "#E63946") }}>
              {saving ? <Loader2 size={17} className="animate-spin" /> : <Save size={17} />} Simpan Tampilan
            </button>
            <button onClick={resetDefault} disabled={saving}
              className="tap h-12 px-5 rounded-xl bg-white border font-bold flex items-center gap-2 text-[#52525B] disabled:opacity-60">
              <RotateCcw size={16} /> Kembalikan Bawaan
            </button>
            <span className="self-center text-xs text-[#047857] font-bold flex items-center gap-1"><CheckCircle2 size={14} /> Berlaku langsung, tanpa deploy</span>
          </div>
        </div>

        {/* ---- pratinjau kanan ---- */}
        <div className="space-y-4">
          <div className="text-xs font-bold text-[#52525B] uppercase tracking-wider">Pratinjau (menu samping)</div>
          <div className="rounded-2xl overflow-hidden text-white shadow-lg"
            style={{ backgroundImage: "linear-gradient(180deg, " + previewSide(preview)[0] + ", " + previewSide(preview)[1] + " 55%, " + previewSide(preview)[2] + ")" }}>
            <div className="px-4 py-4 border-b border-white/10 flex items-center gap-2">
              {preview.logo_url ? (
                <img src={logoUrl(preview)} alt="logo" className="h-8 w-8 rounded-lg object-contain bg-white/95 p-0.5" />
              ) : (
                <div className="h-8 w-8 rounded-lg grid place-items-center font-heading font-extrabold" style={{ backgroundColor: preview.primary }}>
                  {(preview.app_name || "G").charAt(0).toUpperCase()}
                </div>
              )}
              <div className="leading-tight overflow-hidden">
                <div className="font-heading font-extrabold text-sm truncate">{preview.app_name}</div>
                <div className="text-[10px] text-white/50">{preview.tagline}</div>
              </div>
            </div>
            <div className="px-4 py-3 space-y-1.5">
              <div className="h-9 rounded-lg flex items-center px-3 text-sm font-semibold" style={{ backgroundImage: "linear-gradient(90deg, " + preview.primary + ", " + preview.accent + ")" }}>
                POS Kasir
              </div>
              <div className="h-9 rounded-lg flex items-center px-3 text-sm text-white/70">Shift</div>
              <div className="h-9 rounded-lg flex items-center px-3 text-sm text-white/70">Laporan</div>
            </div>
          </div>
          <div className="text-xs text-[#a1a1aa]">
            Warna otomatis disesuaikan agar teks tetap terbaca (bila warna utama terlalu terang akan digelapkan).
          </div>
        </div>
      </div>
    </div>
  );
}

function previewSide(f) {
  // cerminan dari themePalette di lib/platform (di sini hanya utk pratinjau)
  const p = sanitizeThemeColor(f.primary, "#E63946");
  const a = sanitizeThemeColor(f.accent, "#F97316");
  const sh = (hex, x) => {
    const h = hex.replace("#", ""); const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
    return "#" + [r, g, b].map((n) => Math.round(n * (1 - x)).toString(16).padStart(2, "0")).join("");
  };
  return [sh(p, 0.7), sh(p, 0.45), sh(a, 0.35)];
}

const ColorField = ({ label, value, onChange, presets }) => (
  <div>
    <Lbl>{label}</Lbl>
    <div className="flex items-center gap-2 mt-1.5">
      <input type="color" value={value} onChange={(e) => onChange(e.target.value)}
        className="h-11 w-14 rounded-lg border cursor-pointer" />
      <input value={value.toUpperCase()} onChange={(e) => onChange(e.target.value)}
        className="h-11 w-28 rounded-xl border px-3 font-mono text-sm" />
    </div>
    <div className="flex gap-1.5 mt-2 flex-wrap">
      {presets.map((c) => (
        <button key={c} onClick={() => onChange(c)} title={c}
          className={`h-7 w-7 rounded-full border ${value === c ? "ring-2 ring-offset-1 ring-[#0A0A0A]" : ""}`}
          style={{ backgroundColor: c }} />
      ))}
    </div>
  </div>
);

const Lbl = ({ children }) => (
  <label className="text-xs font-bold text-[#52525B] uppercase tracking-wider block">{children}</label>
);
