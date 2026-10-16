/* ================================================================
   PENGATURAN → MENU & TAMPILAN UI (tanpa ubah kode)
   Atur: urutan menu, sembunyikan menu, ganti nama menu, urutan kartu
   dashboard per role, dan label tombol POS. Berlaku langsung setelah
   Simpan (semua perangkat ikut saat memuat ulang).
   ================================================================ */
import { useEffect, useState } from "react";
import api, { apiError } from "@/lib/api";
import { toast } from "sonner";
import { LayoutGrid, Save, Loader2, Eye, EyeOff, ChevronUp, ChevronDown, RotateCcw, Smartphone } from "lucide-react";
import { NAV_ITEMS } from "@/lib/navItems";
import { useUI, setUI, POS_LABELS, UI_DEFAULT } from "@/lib/ui";
import { DASH_WIDGETS } from "@/pages/Dashboard";

export default function SettingsUI() {
  const ui = useUI();
  const [draft, setDraft] = useState(() => JSON.parse(JSON.stringify(ui)));
  const [role, setRole] = useState("kasir");
  const [saving, setSaving] = useState(false);
  const [defaults, setDefaults] = useState({ admin: [], kasir: [], input: [] });

  useEffect(() => { setDraft(JSON.parse(JSON.stringify(ui))); }, [ui]);
  useEffect(() => {
    api.get("/settings/dashboard").then((r) => setDefaults(r.data || {})).catch(() => {});
  }, []);

  const menu = draft.menu || { order: [], hidden: [], labels: {} };
  const posLabels = draft.pos?.labels || {};
  const dashOrder = draft.dashboard?.order || {};

  // urutan menu: yang di-konfigurasi lebih dulu, sisanya ikut urutan bawaan
  const orderedMenu = () => {
    const rank = (to) => { const i = (menu.order || []).indexOf(to); return i === -1 ? 999 : i; };
    return [...NAV_ITEMS].map((n, i) => ({ n, i })).sort((a, b) => (rank(a.n.to) - rank(b.n.to)) || (a.i - b.i)).map((x) => x.n);
  };
  const list = orderedMenu();

  const move = (to, dir) => {
    const order = list.map((n) => n.to).filter((t) => !(menu.hidden || []).includes(t));
    const i = order.indexOf(to);
    const j = dir < 0 ? i - 1 : i + 1;
    if (i < 0 || j < 0 || j >= order.length) return;
    [order[i], order[j]] = [order[j], order[i]];
    const hidden = (menu.hidden || []).filter((h) => !order.includes(h));
    setDraft((d) => ({ ...d, menu: { ...d.menu, order: [...order, ...hidden], hidden } }));
  };
  const toggleHidden = (to) => {
    setDraft((d) => {
      const hidden = d.menu?.hidden || [];
      const on = hidden.includes(to);
      return { ...d, menu: { ...d.menu, hidden: on ? hidden.filter((x) => x !== to) : [...hidden, to] } };
    });
  };
  const setLabel = (to, val) => setDraft((d) => ({ ...d, menu: { ...d.menu, labels: { ...(d.menu?.labels || {}), [to]: val } } }));

  const widgetIdsForRole = () => {
    const onServer = defaults[role] && defaults[role].length ? defaults[role] : (DASH_WIDGETS || []).filter((w) => (w.roles || []).includes(role)).map((w) => w.id);
    const conf = dashOrder[role] || [];
    const rank = (id) => { const i = conf.indexOf(id); return i === -1 ? 999 : i; };
    return [...onServer].map((id, i) => ({ id, i })).sort((a, b) => (rank(a.id) - rank(b.id)) || (a.i - b.i)).map((x) => x.id);
  };
  const moveWidget = (id, dir) => {
    const ids = widgetIdsForRole();
    const i = ids.indexOf(id);
    const j = dir < 0 ? i - 1 : i + 1;
    if (i < 0 || j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    setDraft((d) => ({ ...d, dashboard: { ...(d.dashboard || {}), order: { ...(d.dashboard?.order || {}), [role]: ids } } }));
  };
  const widgetLabel = (id) => {
    if (id.startsWith("custom:")) return "Widget kustom";
    return (DASH_WIDGETS || []).find((w) => w.id === id)?.label || id;
  };

  const save = async () => {
    setSaving(true);
    try {
      const payload = {
        menu: { order: menu.order || [], hidden: menu.hidden || [], labels: menu.labels || {} },
        pos: { labels: Object.fromEntries(Object.entries(posLabels).filter(([, v]) => String(v || "").trim())) },
        dashboard: { order: dashOrder },
      };
      const r = await api.put("/settings/ui", payload);
      setUI(r.data?.ui || payload);
      toast.success("Tampilan UI disimpan — berlaku untuk semua perangkat");
    } catch (e) { toast.error(apiError(e.response?.data?.detail)); } finally { setSaving(false); }
  };
  const reset = () => {
    if (!window.confirm("Kembalikan menu, label POS & urutan kartu ke bawaan?")) return;
    setDraft(JSON.parse(JSON.stringify(UI_DEFAULT)));
    toast.message("Direset di layar ini — klik Simpan untuk memberlakukan");
  };

  return (
    <div className="h-full overflow-y-auto p-6" data-testid="settings-ui">
      <div className="flex items-start justify-between gap-3 flex-wrap mb-4">
        <div className="max-w-2xl">
          <h2 className="text-2xl font-extrabold flex items-center gap-2"><LayoutGrid size={22} /> Menu &amp; Tampilan UI</h2>
          <p className="text-sm text-[#52525B] mt-1">
            Ubah <b>urutan menu</b>, <b>sembunyikan menu</b>, <b>ganti nama menu</b>, <b>urutan kartu dashboard</b> per role, dan
            <b> label tombol POS</b> — semuanya tanpa ubah kode, berlaku setelah Simpan.
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <button onClick={reset} className="tap h-11 px-4 rounded-xl bg-white border font-bold flex items-center gap-2 text-[#52525B]"><RotateCcw size={16} /> Reset</button>
          <button data-testid="ui-save" onClick={save} disabled={saving} className="tap h-11 px-5 rounded-xl bg-[#E63946] hover:bg-[#BE123C] text-white font-bold flex items-center gap-2 disabled:opacity-60">
            {saving ? <Loader2 size={17} className="animate-spin" /> : <Save size={17} />} Simpan
          </button>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-4 items-start">
        {/* ---- MENU ---- */}
        <div className="bg-white rounded-2xl border p-5">
          <h3 className="font-extrabold mb-1">Menu Samping</h3>
          <p className="text-xs text-[#a1a1aa] mb-3">Susun dengan panah, sembunyikan dengan ikon mata, dan ubah namanya pada kolom kanan. Menu yang tidak dicentang semua role tidak akan pernah terlihat.</p>
          <div className="space-y-1.5 max-h-[420px] overflow-y-auto pr-1">
            {list.map((n) => {
              const hidden = (menu.hidden || []).includes(n.to);
              const idx = list.filter((x) => !(menu.hidden || []).includes(x.to)).map((x) => x.to).indexOf(n.to);
              return (
                <div key={n.to} className={`flex items-center gap-2 rounded-xl border px-3 py-2 ${hidden ? "bg-[#F4F5F7] opacity-60" : "bg-white"}`}>
                  <button onClick={() => toggleHidden(n.to)} title={hidden ? "Tampilkan" : "Sembunyikan"}
                    className="tap h-8 w-8 rounded-lg bg-[#F4F5F7] grid place-items-center">
                    {hidden ? <EyeOff size={15} className="text-[#a1a1aa]" /> : <Eye size={15} className="text-[#047857]" />}
                  </button>
                  <span className="text-[11px] text-[#a1a1aa] font-mono w-24 shrink-0">{n.to}</span>
                  <input value={menu.labels?.[n.to] ?? ""} onChange={(e) => setLabel(n.to, e.target.value)}
                    placeholder={n.label} className="flex-1 h-9 rounded-lg border px-2 text-sm min-w-0" />
                  <div className="flex items-center gap-0.5">
                    <button disabled={hidden || idx <= 0} onClick={() => move(n.to, -1)} className="tap h-7 w-7 rounded-lg bg-[#F4F5F7] grid place-items-center disabled:opacity-30"><ChevronUp size={14} /></button>
                    <button disabled={hidden} onClick={() => move(n.to, 1)} className="tap h-7 w-7 rounded-lg bg-[#F4F5F7] grid place-items-center disabled:opacity-30"><ChevronDown size={14} /></button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="space-y-4">
          {/* ---- URUTAN KARTU DASHBOARD ---- */}
          <div className="bg-white rounded-2xl border p-5">
            <h3 className="font-extrabold mb-1">Urutan Kartu Dashboard</h3>
            <p className="text-xs text-[#a1a1aa] mb-3">Urutan default tampilan kartu untuk tiap role (user tetap bisa menyusun sendiri lewat "Atur Widget").</p>
            <div className="flex gap-1.5 mb-3">
              {(["admin", "kasir", "input"]).map((r) => (
                <button key={r} onClick={() => setRole(r)}
                  className={`tap h-9 px-3 rounded-lg text-xs font-bold border ${role === r ? "bg-[#0A0A0A] text-white border-[#0A0A0A]" : "bg-white"}`}>{r}</button>
              ))}
            </div>
            <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
              {widgetIdsForRole().map((id, i, arr) => (
                <div key={id} className="flex items-center gap-2 rounded-xl border px-3 py-2">
                  <span className="text-[11px] font-mono text-[#a1a1aa]">{i + 1}</span>
                  <span className="flex-1 text-sm font-bold truncate">{widgetLabel(id)}</span>
                  <div className="flex items-center gap-0.5">
                    <button disabled={i === 0} onClick={() => moveWidget(id, -1)} className="tap h-7 w-7 rounded-lg bg-[#F4F5F7] grid place-items-center disabled:opacity-30"><ChevronUp size={14} /></button>
                    <button disabled={i === arr.length - 1} onClick={() => moveWidget(id, 1)} className="tap h-7 w-7 rounded-lg bg-[#F4F5F7] grid place-items-center disabled:opacity-30"><ChevronDown size={14} /></button>
                  </div>
                </div>
              ))}
              {widgetIdsForRole().length === 0 && <p className="text-xs text-[#a1a1aa]">Belum ada kartu untuk role ini.</p>}
            </div>
          </div>

          {/* ---- LABEL POS ---- */}
          <div className="bg-white rounded-2xl border p-5">
            <h3 className="font-extrabold mb-1 flex items-center gap-2"><Smartphone size={16} /> Label Tombol POS</h3>
            <p className="text-xs text-[#a1a1aa] mb-3">Kosongkan untuk memakai teks bawaan.</p>
            <div className="space-y-2">
              {POS_LABELS.map((p) => (
                <div key={p.key} className="flex items-center gap-2">
                  <span className="w-44 text-xs font-bold text-[#52525B]">{p.label}</span>
                  <input data-testid={`pos-label-${p.key}`} value={posLabels[p.key] ?? ""}
                    onChange={(e) => setDraft((d) => ({ ...d, pos: { ...(d.pos || {}), labels: { ...(d.pos?.labels || {}), [p.key]: e.target.value } } }))}
                    placeholder={p.def} className="flex-1 h-10 rounded-lg border px-2 text-sm" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
