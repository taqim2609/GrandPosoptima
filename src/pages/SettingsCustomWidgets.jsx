/* ================================================================
   PENGATURAN → WIDGET KUSTOM (admin)
   Membuat/mengubah widget dashboard dari data isian sendiri + rumus,
   mengisi nilai harian per tanggal, melihat riwayat, pratinjau hasil.
   ================================================================ */
import { useEffect, useState, useMemo, useRef, useCallback } from "react";
import api, { apiError } from "@/lib/api";
import { toast } from "sonner";
import { wibToday } from "@/lib/format";
import {
  Plus, Pencil, Trash2, Eye, EyeOff, History, Loader2, X, ClipboardEdit,
  Info, CheckCircle2, AlertTriangle, SlidersHorizontal,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { WidgetKustomCard, FillDataDialog } from "@/components/WidgetKustom";
import {
  CW_FORMATS, CW_COLORS, AUTO_VARS, validateFormula, evalRpn, formatValue,
  slugCode, newWidgetTemplate, AUTO_KEYS, numID,
} from "@/lib/customWidgets";

const nextKey = () => Math.random().toString(36).slice(2, 9);
// auto = kode mengikuti label hanya utk isian BARU (code masih kosong);
// isian lama dari server mempertahankan kodenya walau label diedit.
const withKeys = (draft) => ({
  ...draft,
  fields: (draft.fields || []).map((f) => ({ key: nextKey(), auto: !f.code, ...f })),
});

export default function SettingsCustomWidgets() {
  const [widgets, setWidgets] = useState(null); // null = belum dimuat
  const [date, setDate] = useState(wibToday());
  const [summary, setSummary] = useState(null);
  const [entries, setEntries] = useState({}); // widget_id -> {date, daily}
  const [editor, setEditor] = useState(null); // {mode, draft}
  const [fill, setFill] = useState(null); // {def, daily}
  const [historyOf, setHistoryOf] = useState(null); // def
  const [rowsHist, setRowsHist] = useState(null);

  const loadAll = useCallback(async (d) => {
    try {
      const [wr, er, sr] = await Promise.all([
        api.get("/custom-widgets"),
        api.get("/custom-widgets/entries", { params: { date: d } }),
        api.get("/reports/summary", { params: { date: d } }),
      ]);
      setWidgets(wr.data || []);
      setEntries(er.data || {});
      setSummary(sr.data);
    } catch (e) {
      toast.error(apiError(e.response?.data?.detail));
      setWidgets([]);
    }
  }, []);

  useEffect(() => { loadAll(date); }, [date, loadAll]);

  const refreshWidgets = async () => {
    try { const wr = await api.get("/custom-widgets"); setWidgets(wr.data || []); } catch (e) {}
  };

  const openCreate = () => setEditor({ mode: "create", draft: withKeys(newWidgetTemplate()) });
  const openEdit = (w) => setEditor({ mode: "edit", draft: withKeys({ ...w }) });

  const saveDef = async (draft) => {
    const payload = {
      name: draft.name, desc: draft.desc, format: draft.format, color: draft.color,
      enabled: draft.enabled, formula: draft.formula,
      fields: (draft.fields || []).map((f) => ({
        label: f.label, kind: f.kind, code: f.code,
        value: f.kind === "fixed" ? Number(f.value || 0) : 0,
      })),
    };
    try {
      if (editor.mode === "create") {
        const { data: created } = await api.post("/custom-widgets", payload);
        toast.success("Widget dibuat — aktif di Dashboard (bisa disusun di Atur Widget)");
        // biar langsung muncul: tambahkan ke default role admin & tata letak admin perangkat ini
        try {
          const r = await api.get("/settings/dashboard");
          const adminList = Array.isArray(r.data?.admin) ? r.data.admin : null;
          const item = "custom:" + created.id;
          if (adminList && !adminList.includes(item)) {
            await api.put("/settings/dashboard", { role: "admin", widgets: [...adminList, item] });
          }
          try {
            const key = "gak_dash_widgets_admin";
            const raw = JSON.parse(localStorage.getItem(key) || "null");
            if (Array.isArray(raw) && !raw.includes(item)) localStorage.setItem(key, JSON.stringify([...raw, item]));
          } catch (e2) {}
        } catch (e2) {}
      } else {
        await api.put(`/custom-widgets/${editor.draft.id}`, payload);
        toast.success("Widget diperbarui");
      }
      setEditor(null);
      await refreshWidgets();
      return true;
    } catch (e) {
      toast.error(apiError(e.response?.data?.detail));
      return false;
    }
  };

  const toggleEnabled = async (w) => {
    try {
      await api.put(`/custom-widgets/${w.id}`, {
        name: w.name, desc: w.desc, format: w.format, color: w.color, enabled: !w.enabled, formula: w.formula,
        fields: (w.fields || []).map((f) => ({
          label: f.label, kind: f.kind, code: f.code,
          value: f.kind === "fixed" ? Number(f.value || 0) : 0,
        })),
      });
      setWidgets((ws) => ws.map((x) => (x.id === w.id ? { ...x, enabled: !w.enabled } : x)));
      toast.success(!w.enabled ? "Widget tampil di dashboard" : "Widget disembunyikan dari dashboard");
    } catch (e) { toast.error(apiError(e.response?.data?.detail)); }
  };

  const removeDef = async (w) => {
    if (!window.confirm(`Hapus widget "${w.name}" beserta seluruh riwayat isiannya?`)) return;
    try {
      await api.delete(`/custom-widgets/${w.id}`);
      setWidgets((ws) => ws.filter((x) => x.id !== w.id));
      toast.success("Widget dihapus");
    } catch (e) { toast.error(apiError(e.response?.data?.detail)); }
  };

  const openHistory = async (w) => {
    setHistoryOf(w);
    setRowsHist(null);
    try {
      const r = await api.get(`/custom-widgets/${w.id}/entries`, { params: { limit: 60 } });
      setRowsHist(r.data || []);
    } catch (e) { toast.error(apiError(e.response?.data?.detail)); }
  };

  const onFillSaved = (defId, newDaily) => {
    setEntries((prev) => ({ ...prev, [defId]: { date, daily: newDaily } }));
  };

  const filledCount = (w) => {
    const dly = (w.fields || []).filter((f) => f.kind === "daily");
    const e = entries[w.id]?.daily || {};
    return dly.filter((f) => e[f.code] != null).length;
  };

  return (
    <div className="h-full overflow-y-auto p-6" data-testid="settings-custom-widgets">
      {/* ---- ringkasan + kontrol tanggal ---- */}
      <div className="flex items-start justify-between gap-3 flex-wrap mb-5">
        <div className="max-w-2xl">
          <h2 className="text-2xl font-extrabold flex items-center gap-2"><SlidersHorizontal size={22} /> Widget Kustom Dashboard</h2>
          <p className="text-sm text-[#52525B] mt-1">
            Buat kartu angka di Dashboard dari <b>isian Anda sendiri</b> (nilai tetap / catatan harian) dan
            <b> data otomatis aplikasi</b> (penjualan, laba, kas, order, pengeluaran) lewat <b>rumus</b> yang Anda tulis.
          </p>
        </div>
        <button data-testid="cw-create" onClick={openCreate} className="tap h-11 px-5 rounded-xl bg-[#E63946] hover:bg-[#BE123C] text-white font-bold flex items-center gap-2 shrink-0">
          <Plus size={18} /> Buat Widget
        </button>
      </div>

      <div className="flex items-center gap-3 mb-5 flex-wrap">
        <label className="text-xs font-bold text-[#52525B] uppercase tracking-wider">Lihat data tanggal</label>
        <input data-testid="cw-date" type="date" value={date} onChange={(e) => setDate(e.target.value)}
          className="h-10 rounded-xl border px-3 font-num bg-white" />
        <span className="text-xs text-[#a1a1aa]">
          Nilai otomatis & isian harian mengikuti tanggal ini. Dashboard memakai tanggal yang dipilih di halaman Dashboard.
        </span>
      </div>

      {/* ---- daftar widget ---- */}
      {widgets === null ? (
        <div className="h-40 grid place-items-center"><Loader2 className="animate-spin text-[#E63946]" /></div>
      ) : widgets.length === 0 ? (
        <div className="bg-white rounded-2xl border p-10 text-center">
          <SlidersHorizontal className="mx-auto text-[#d4d4d8]" size={40} />
          <p className="mt-3 text-[#a1a1aa] font-bold">Belum ada widget kustom.</p>
          <p className="text-sm text-[#a1a1aa] mt-1">Klik <b>Buat Widget</b> untuk mulai — mis. kartu “Laba Bersih Harian” dengan rumus <span className="font-mono bg-[#F4F5F7] px-1 rounded">penjualan_total - kas_keluar_fnb - gaji - listrik</span>.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {widgets.map((w) => (
            <div key={w.id}>
              <WidgetKustomCard
                def={w}
                daily={entries[w.id]?.daily || {}}
                summary={summary}
                date={date}
                fillable
                onFill={(d) => setFill({ def: d, daily: entries[d.id]?.daily || {} })}
                actions={
                  <span className="flex items-center gap-1 ml-1 shrink-0">
                    <IconBtn title="Ubah widget" onClick={() => openEdit(w)}><Pencil size={14} /></IconBtn>
                    <IconBtn title="Isi nilai harian" onClick={() => setFill({ def: w, daily: entries[w.id]?.daily || {} })}><ClipboardEdit size={14} /></IconBtn>
                    <IconBtn title="Riwayat isian" onClick={() => openHistory(w)}><History size={14} /></IconBtn>
                    <IconBtn title={w.enabled ? "Sembunyikan dari dashboard" : "Tampilkan di dashboard"} onClick={() => toggleEnabled(w)}>
                      {w.enabled ? <Eye size={14} /> : <EyeOff size={14} />}
                    </IconBtn>
                    <IconBtn title="Hapus widget" danger onClick={() => removeDef(w)}><Trash2 size={14} /></IconBtn>
                  </span>
                }
              />
              <div className="text-[11px] text-[#a1a1aa] mt-1 px-1">
                Isian harian {filledCount(w)}/{((w.fields || []).filter((f) => f.kind === "daily")).length} terisi untuk {date}.
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ---- editor buat/ubah ---- */}
      {editor && (
        <WidgetEditorDialog
          initial={editor.draft}
          mode={editor.mode}
          date={date}
          summary={summary}
          daily={entries[editor.draft?.id]?.daily || {}}
          onSave={saveDef}
          close={() => setEditor(null)}
        />
      )}

      {/* ---- isi data harian ---- */}
      {fill && (
        <FillDataDialog
          open={!!fill}
          onOpenChange={(v) => { if (!v) setFill(null); }}
          def={fill.def}
          date={date}
          daily={fill.daily}
          onSaved={(dly) => onFillSaved(fill.def.id, dly)}
        />
      )}

      {/* ---- riwayat ---- */}
      <Dialog open={!!historyOf} onOpenChange={(v) => { if (!v) setHistoryOf(null); }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><History size={18} /> Riwayat Isian — {historyOf?.name}</DialogTitle>
            <DialogDescription>Isian harian per tanggal (terbaru dulu). Klik “Isi” untuk mengubah tanggal tersebut.</DialogDescription>
          </DialogHeader>
          {rowsHist === null ? (
            <div className="h-24 grid place-items-center"><Loader2 className="animate-spin text-[#E63946]" /></div>
          ) : rowsHist.length === 0 ? (
            <p className="text-sm text-[#a1a1aa] text-center py-6">Belum ada isian harian tersimpan. Isi lewat tombol di kartu widget atau langsung di dashboard.</p>
          ) : (
            <div className="border rounded-xl overflow-auto">
              <table className="w-full text-sm">
                <thead className="bg-[#F4F5F7] text-[#52525B] text-xs uppercase tracking-wider">
                  <tr>
                    <th className="text-left p-2.5">Tanggal</th>
                    {historyOf && (historyOf.fields || []).filter((f) => f.kind === "daily").map((f) => (
                      <th key={f.code} className="text-right p-2.5">{f.label}</th>
                    ))}
                    <th className="text-right p-2.5">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {rowsHist.map((row) => {
                    const dly = row.daily || {};
                    const dFields = (historyOf?.fields || []).filter((f) => f.kind === "daily");
                    return (
                      <tr key={row.date} className="border-t">
                        <td className="p-2.5 font-num font-bold whitespace-nowrap">{row.date}</td>
                        {dFields.map((f) => (
                          <td key={f.code} className={`p-2.5 text-right font-num ${dly[f.code] == null ? "text-[#d4d4d8]" : ""}`}>
                            {dly[f.code] != null ? numID(dly[f.code]) : "—"}
                          </td>
                        ))}
                        <td className="p-2.5 text-right">
                          <button
                            onClick={() => { setDate(row.date); setHistoryOf(null); setFill({ def: historyOf, daily: dly }); }}
                            className="tap h-8 px-3 rounded-lg bg-[#0A0A0A] text-white text-xs font-bold">Isi</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

const IconBtn = ({ children, onClick, title, danger }) => (
  <button title={title} onClick={onClick}
    className={`tap h-8 w-8 rounded-lg grid place-items-center border bg-white ${danger ? "hover:bg-[#FEE2E2] hover:text-[#EF4444] hover:border-[#FECACA]" : "hover:bg-[#F4F5F7]"}`}>
    {children}
  </button>
);

/* ================= Dialog editor widget (buat / ubah) ================= */
function WidgetEditorDialog({ initial, mode, date, summary, daily, onSave, close }) {
  const [draft, setDraft] = useState(() => withKeys({ ...initial }));
  const [saving, setSaving] = useState(false);
  const formulaRef = useRef(null);

  const set = (patch) => setDraft((d) => ({ ...d, ...patch }));

  const addField = (kind) => {
    setDraft((d) => ({
      ...d,
      fields: [...(d.fields || []), { key: nextKey(), label: "", kind, code: "", value: 0, auto: true }],
    }));
  };
  const updField = (key, patch) => {
    setDraft((d) => ({
      ...d,
      fields: (d.fields || []).map((f) => {
        if (f.key !== key) return f;
        const nf = { ...f, ...patch };
        if (nf.auto && patch.label !== undefined) {
          const slug = slugCode(patch.label);
          const taken = (d.fields || []).some((o) => o.key !== key && o.code === slug && slug !== "");
          nf.code = taken ? slug + "_2" : slug;
        }
        return nf;
      }),
    }));
  };
  const delField = (key) => setDraft((d) => ({ ...d, fields: (d.fields || []).filter((f) => f.key !== key) }));

  // ---- validasi ----
  const codes = (draft.fields || []).map((f) => f.code).filter(Boolean);
  const dup = codes.find((c, i) => codes.indexOf(c) !== i);
  const clashAuto = codes.find((c) => AUTO_KEYS.has(c));
  const badCode = (draft.fields || []).find((f) => f.code && !/^[A-Za-z_][A-Za-z0-9_]*$/.test(f.code));
  const emptyField = (draft.fields || []).find((f) => !f.label.trim() || !f.code);
  const formulaV = validateFormula(draft.formula, codes);
  const fieldsOk = !dup && !clashAuto && !badCode && !emptyField;
  const canSave = !!draft.name.trim() && fieldsOk && formulaV.ok;

  // ---- pratinjau hasil dengan data tanggal terpilih ----
  const preview = useMemo(() => {
    if (!formulaV.ok || !fieldsOk) return null;
    const env = {};
    for (const f of draft.fields || []) {
      const v = f.kind === "fixed" ? Number(f.value || 0) : Number(daily?.[f.code] ?? 0);
      env[f.code] = isFinite(v) ? v : 0;
    }
    for (const av of AUTO_VARS) {
      const v = av.pick(summary);
      env[av.code] = isFinite(Number(v)) ? Number(v) : 0;
    }
    try {
      const r = evalRpn(formulaV.rpn, env);
      return isFinite(r) ? r : null;
    } catch {
      return null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.fields, draft.formula, daily, summary, formulaV.ok, formulaV.rpn]);

  const insertAtCursor = (text) => {
    const el = formulaRef.current;
    if (!el) { set({ formula: (draft.formula ? draft.formula + " " : "") + text }); return; }
    const s = el.selectionStart ?? el.value.length;
    const e = el.selectionEnd ?? el.value.length;
    const next = draft.formula.slice(0, s) + text + draft.formula.slice(e);
    set({ formula: next });
    requestAnimationFrame(() => { el.focus(); el.selectionStart = el.selectionEnd = s + text.length; });
  };

  const submit = async () => {
    if (!canSave) return;
    setSaving(true);
    const ok = await onSave(draft);
    setSaving(false);
    if (ok) close();
  };

  return (
    <Dialog open onOpenChange={(v) => { if (!v) close(); }}>
      <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{mode === "create" ? "Buat Widget Kustom" : "Ubah Widget Kustom"}</DialogTitle>
          <DialogDescription>
            Nama kartu, isian-isian yang Anda isi sendiri, lalu rumus yang mencari hasilnya.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* nama + deskripsi */}
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <Lbl>Nama widget *</Lbl>
              <input data-testid="cw-name" value={draft.name} onChange={(e) => set({ name: e.target.value })}
                placeholder="cth: Laba Bersih Harian" className="mt-1 w-full h-11 rounded-xl border px-3" />
            </div>
            <div>
              <Lbl>Deskripsi (opsional)</Lbl>
              <input value={draft.desc} onChange={(e) => set({ desc: e.target.value })}
                placeholder="Keterangan singkat di kartu" className="mt-1 w-full h-11 rounded-xl border px-3" />
            </div>
          </div>

          {/* format & warna */}
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <Lbl>Format angka hasil</Lbl>
              <div className="flex gap-1.5 mt-1 flex-wrap">
                {CW_FORMATS.map((f) => (
                  <button key={f.key} data-testid={`cw-fmt-${f.key}`}
                    onClick={() => set({ format: f.key })}
                    className={`tap h-9 px-3 rounded-xl text-xs font-bold border ${draft.format === f.key ? "bg-[#0A0A0A] text-white border-[#0A0A0A]" : "bg-white"}`}>
                    {f.icon} {f.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <Lbl>Warna kartu</Lbl>
              <div className="flex gap-1.5 mt-1 flex-wrap items-center">
                {CW_COLORS.map((c) => (
                  <button key={c} onClick={() => set({ color: c })}
                    className={`h-8 w-8 rounded-full ${draft.color === c ? "ring-2 ring-offset-2 ring-[#0A0A0A]" : ""}`}
                    style={{ backgroundColor: c }} />
                ))}
              </div>
            </div>
          </div>

          {/* isian */}
          <div className="rounded-xl border p-4 bg-[#FAFAFB]">
            <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
              <Lbl className="mb-0">Isian yang Anda isi sendiri</Lbl>
              <div className="flex gap-1.5">
                <button onClick={() => addField("daily")} className="tap h-8 px-3 rounded-lg bg-[#E63946] text-white text-xs font-bold">+ Isian Harian</button>
                <button onClick={() => addField("fixed")} className="tap h-8 px-3 rounded-lg bg-[#0A0A0A] text-white text-xs font-bold">+ Nilai Tetap</button>
              </div>
            </div>
            <p className="text-[11px] text-[#a1a1aa] mb-3">
              <b>Isian Harian</b> = diisi per tanggal (ada riwayat). <b>Nilai Tetap</b> = satu angka tetap (mis. sewa per hari).
              Kode (boleh diubah) dipakai di rumus.
            </p>
            {(draft.fields || []).length === 0 && (
              <p className="text-xs text-[#B45309] font-bold flex items-center gap-1"><AlertTriangle size={13} /> Belum ada isian — bisa langsung memakai variabel otomatis saja di rumus.</p>
            )}
            <div className="space-y-2">
              {(draft.fields || []).map((f) => (
                <div key={f.key} className="grid gap-2 items-center bg-white rounded-xl border px-3 py-2 grid-cols-[auto_1fr_auto_1fr_auto]">
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${f.kind === "daily" ? "bg-[#FEE2E2] text-[#E63946]" : "bg-[#EDE9FE] text-[#7C3AED]"}`}>
                    {f.kind === "daily" ? "Harian" : "Tetap"}
                  </span>
                  <input value={f.label} onChange={(e) => updField(f.key, { label: e.target.value })}
                    placeholder="Nama isian (cth: Gaji karyawan)" className="h-9 rounded-lg border px-2.5 text-sm min-w-0" />
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] font-bold text-[#a1a1aa] hidden sm:inline">kode</span>
                    <input value={f.code}
                      onChange={(e) => updField(f.key, { code: e.target.value.replace(/[^A-Za-z0-9_]/g, ""), auto: false })}
                      className="h-9 w-24 rounded-lg border px-2 text-xs font-mono" />
                  </div>
                  {f.kind === "fixed" ? (
                    <input type="number" inputMode="decimal" step="any" value={f.value ?? 0}
                      onChange={(e) => updField(f.key, { value: e.target.value })}
                      className="h-9 rounded-lg border px-2.5 text-sm font-num w-full" />
                  ) : (
                    <span className="text-[11px] text-[#a1a1aa] text-right">isi tiap hari</span>
                  )}
                  <button onClick={() => delField(f.key)} className="tap h-8 w-8 rounded-lg grid place-items-center hover:bg-[#FEE2E2] hover:text-[#EF4444]" title="Hapus isian">
                    <X size={15} />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* rumus */}
          <div>
            <Lbl>Rumus hasil *</Lbl>
            <textarea ref={formulaRef} rows={2} data-testid="cw-formula" value={draft.formula}
              onChange={(e) => set({ formula: e.target.value })}
              placeholder="cth: penjualan_total - kas_keluar_fnb - gaji - listrik"
              className="mt-1 w-full rounded-xl border px-3 py-2.5 font-mono text-sm" />
            <div className="mt-2 flex flex-wrap gap-1.5 items-center">
              {(draft.fields || []).filter((f) => f.code).map((f) => (
                <Chip key={f.key} onClick={() => insertAtCursor(f.code)} color="#7C3AED" title={`${f.code} = ${f.label || "…"}`}>
                  {f.code}
                </Chip>
              ))}
              <span className="w-full text-[11px] font-bold text-[#a1a1aa] uppercase tracking-wider mt-1">Data otomatis aplikasi (tanggal yang dipilih) — klik untuk sisip:</span>
              {AUTO_VARS.map((av) => (
                <Chip key={av.code} onClick={() => insertAtCursor(av.code)} color="#E63946" title={`${av.code} = ${av.label}`}>
                  {av.code}
                </Chip>
              ))}
            </div>
            <p className="text-[11px] text-[#a1a1aa] mt-2">
              Operator: <b>+</b> tambah, <b>-</b> kurang, <b>*</b> kali, <b>/</b> bagi, <b>%</b> sisa bagi, dan kurung <b>( )</b>. Contoh: <span className="font-mono bg-[#F4F5F7] px-1 rounded">(laba_total / penjualan_total) * 100</span> = persentase laba.
            </p>
            {/* status validasi */}
            <div className="mt-2 space-y-1 text-xs">
              {!draft.name.trim() && <Err>Nama widget wajib diisi.</Err>}
              {emptyField && <Err>Setiap isian butuh nama dan kode.</Err>}
              {badCode && <Err>Kode “{badCode.code}” hanya boleh huruf/angka/garis bawah tanpa spasi.</Err>}
              {clashAuto && <Err>Kode “{clashAuto}” sama dengan variabel otomatis — ganti kode lain.</Err>}
              {dup && <Err>Kode “{dup}” dipakai dua kali.</Err>}
              {draft.formula && !formulaV.ok && <Err>{formulaV.error}</Err>}
              {!draft.formula && <Err>Rumus wajib diisi.</Err>}
              {canSave && (
                <p className="text-[#047857] font-bold flex items-center gap-1"><CheckCircle2 size={13} /> Rumus valid
                  {preview != null && <span className="font-num ml-1 normal-case">— hasil {date}: {formatValue(draft, preview)}</span>}
                </p>
              )}
              {canSave && !summary && <p className="text-[#B45309]"><Info size={12} className="inline" /> Data laporan belum termuat — variabel otomatis dihitung 0 pada pratinjau.</p>}
            </div>
          </div>
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-col">
          <button data-testid="cw-save" onClick={submit} disabled={!canSave || saving}
            className="tap w-full h-11 rounded-xl bg-[#E63946] hover:bg-[#BE123C] text-white font-bold flex items-center justify-center gap-2 disabled:opacity-50">
            {saving ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
            {mode === "create" ? "Buat Widget" : "Simpan Perubahan"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const Lbl = ({ children, className = "" }) => (
  <label className={`text-xs font-bold text-[#52525B] uppercase tracking-wider block ${className}`}>{children}</label>
);
const Chip = ({ children, onClick, color, title }) => (
  <button onClick={onClick} title={title}
    className="tap rounded-lg px-2 py-1 text-[11px] font-mono font-bold text-white"
    style={{ backgroundColor: color, opacity: 0.9 }}>
    {children}
  </button>
);
const Err = ({ children }) => (
  <p className="font-bold text-[#EF4444] flex items-center gap-1"><AlertTriangle size={12} /> {children}</p>
);
