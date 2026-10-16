/* ================================================================
   Komponen bersama Widget Kustom — dipakai Dashboard & Pengaturan.
   Kartu menampilkan: nama widget, hasil rumus (angka besar), tabel
   isian (harian/tetap) + data otomatis yang dipakai rumus, dan rumus.
   ================================================================ */
import { useEffect, useState } from "react";
import api, { apiError } from "@/lib/api";
import { toast } from "sonner";
import { ClipboardEdit, CalendarDays, Loader2, Info, TrendingUp, SlidersHorizontal, CheckCircle2, AlertTriangle } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  validateFormula, buildEnv, evalRpn, formatValue, numID, codeLabel,
  formulaLabeled, AUTO_KEYS, CW_FIELD_KIND_LABEL,
} from "@/lib/customWidgets";

/* ---------------- Dialog isi data harian satu widget ---------------- */
export function FillDataDialog({ open, onOpenChange, def, date, daily, onSaved }) {
  const dailyFields = (def?.fields || []).filter((f) => f.kind === "daily");
  const [vals, setVals] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    const init = {};
    for (const f of dailyFields) {
      const cur = daily?.[f.code];
      init[f.code] = cur != null ? String(cur) : "";
    }
    setVals(init);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, def?.id, date]);

  if (!def) return null;

  const save = async () => {
    const payload = {};
    for (const f of dailyFields) {
      const raw = String(vals[f.code] ?? "").trim().replace(",", ".");
      if (raw === "") payload[f.code] = 0;
      else {
        const n = Number(raw);
        if (!isFinite(n)) { toast.error(`"${f.label}": nilai harus angka`); return; }
        payload[f.code] = n;
      }
    }
    setSaving(true);
    try {
      const r = await api.put("/custom-widgets/entry", { widget_id: def.id, date, daily: payload });
      toast.success(`Isian "${def.name}" untuk ${date} tersimpan`);
      onSaved?.(r.data.daily || payload);
      onOpenChange(false);
    } catch (e) {
      toast.error(apiError(e.response?.data?.detail));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><ClipboardEdit size={18} /> Isi Data Harian</DialogTitle>
        </DialogHeader>
        <div className="rounded-xl border p-3 bg-[#F4F5F7]">
          <div className="font-extrabold" style={{ color: def.color }}>{def.name}</div>
          <div className="text-xs text-[#52525B] flex items-center gap-1 mt-0.5"><CalendarDays size={12} /> Tanggal {date} — data ini dipakai hasil widget pada tanggal tersebut.</div>
        </div>
        {dailyFields.length === 0 ? (
          <p className="text-sm text-[#a1a1aa]">Widget ini tidak punya isian harian (hanya nilai tetap / data otomatis).</p>
        ) : (
          <div className="space-y-3">
            {dailyFields.map((f) => (
              <div key={f.code}>
                <label className="text-xs font-bold text-[#52525B] uppercase tracking-wider">{f.label}</label>
                <input
                  type="number" inputMode="decimal" step="any"
                  value={vals[f.code] ?? ""}
                  onChange={(e) => setVals((v) => ({ ...v, [f.code]: e.target.value }))}
                  placeholder="0"
                  className="mt-1 w-full h-11 rounded-xl border px-3 font-num"
                />
              </div>
            ))}
            <p className="text-[11px] text-[#a1a1aa]">Kosongkan / 0 bila hari ini tidak ada nilai. Rumus memakai nilai ini sebagai {dailyFields.length > 1 ? "angka-angka" : "angka"} ({dailyFields.map((f) => f.code).join(", ")}).</p>
          </div>
        )}
        <DialogFooter className="flex-col sm:flex-col gap-2">
          <button onClick={save} disabled={saving} className="tap w-full h-11 rounded-xl font-bold text-white disabled:opacity-60 flex items-center justify-center gap-2" style={{ backgroundColor: def.color || "#E63946" }}>
            {saving ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />} Simpan Isian {date}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ---------------- Kartu widget kustom di dashboard ---------------- */
export function WidgetKustomCard({ def, daily, summary, date, fillable, onFill, actions, noCard }) {
  const codes = (def?.fields || []).map((f) => f.code);
  const parsed = validateFormula(def?.formula || "", codes);
  const env = buildEnv(def?.fields, daily, summary);
  let result = null;
  let resultErr = "";
  if (parsed.ok) {
    try {
      result = evalRpn(parsed.rpn, env);
      if (!isFinite(result)) { result = null; resultErr = "Hasil tidak terdefinisi (bagi nol?)"; }
    } catch (e) {
      resultErr = e.message;
    }
  } else {
    resultErr = parsed.error;
  }
  const dailyFields = (def?.fields || []).filter((f) => f.kind === "daily");
  const fixedFields = (def?.fields || []).filter((f) => f.kind === "fixed");
  const missing = dailyFields.filter((f) => daily?.[f.code] == null).length;
  const autoRefs = (parsed.ok ? parsed.refs : []).filter((c) => AUTO_KEYS.has(c));
  const color = def?.color || "#E63946";
  const hasAuto = autoRefs.length > 0 && !summary;

  const row = (label, chip, value, sub) => (
    <div className="flex items-center justify-between gap-3 py-1.5 border-b border-dashed border-[#F1F1F4] last:border-0">
      <div className="min-w-0">
        <div className="text-[13px] font-bold text-[#27272A] truncate">{label}</div>
        {chip && <span className="text-[10px] font-bold uppercase tracking-wide text-[#a1a1aa]">{chip}</span>}
        {sub && <div className="text-[11px] text-[#a1a1aa]">{sub}</div>}
      </div>
      <div className="font-num font-extrabold text-[#0A0A0A] whitespace-nowrap">{value}</div>
    </div>
  );

  return (
    <div data-testid={`dash-widget-custom-${def?.id}`} className={noCard ? "" : "widget-block"}>
      <div className="rounded-2xl border-2 bg-white p-5" style={{ borderColor: color }}>
        {/* header */}
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2 min-w-0">
            <span className="h-3.5 w-3.5 rounded-full shrink-0 inline-block" style={{ backgroundColor: color }} />
            <h3 className="font-extrabold truncate">{def?.name || "Widget"}</h3>
            {!def?.enabled && <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-[#F4F5F7] text-[#a1a1aa] uppercase">Disembunyikan</span>}
            {actions}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {dailyFields.length > 0 && !missing && (
              <span className="text-[11px] font-bold px-2 py-1 rounded-lg bg-[#D1FAE5] text-[#047857] inline-flex items-center gap-1"><CheckCircle2 size={12} /> Lengkap</span>
            )}
            {dailyFields.length > 0 && missing > 0 && (
              <span className="text-[11px] font-bold px-2 py-1 rounded-lg bg-[#FEF3C7] text-[#B45309] inline-flex items-center gap-1">
                <AlertTriangle size={12} /> {missing} isian belum diisi
              </span>
            )}
            {fillable && dailyFields.length > 0 && (
              <button onClick={() => onFill?.(def)} className="tap h-9 px-3 rounded-xl font-bold text-sm inline-flex items-center gap-1.5" style={{ backgroundColor: color, color: "#fff" }}>
                <ClipboardEdit size={14} /> {missing > 0 ? "Isi" : "Ubah"}
              </button>
            )}
          </div>
        </div>
        {def?.desc && <p className="text-xs text-[#52525B] mt-1">{def.desc}</p>}

        {/* hasil */}
        <div className="mt-4">
          <div className="flex items-end gap-2 flex-wrap">
            <div className="font-num font-extrabold text-[34px] leading-none" style={{ color }} data-testid="custom-value">
              {resultErr ? "—" : formatValue(def, result)}
            </div>
            <div className="text-[11px] text-[#a1a1aa] font-bold pb-1">
              {dailyFields.length ? `Isian ${date}` : date ? "Per tanggal " + date : ""}
            </div>
          </div>
          {resultErr && <p className="text-xs font-bold text-[#EF4444] mt-1">{resultErr}</p>}
          {hasAuto && <p className="text-xs text-[#B45309] mt-1 font-bold"><Info size={12} className="inline" /> Data laporan belum dimuat — variabel otomatis dihitung 0.</p>}
        </div>

        {/* tabel isian */}
        {(fixedFields.length > 0 || dailyFields.length > 0 || autoRefs.length > 0) && (
          <div className="mt-4 rounded-xl border border-[#F1F1F4] bg-[#FAFAFB] px-3 py-1">
            {dailyFields.map((f) => row(f.label, CW_FIELD_KIND_LABEL.daily,
              daily?.[f.code] != null ? numID(daily[f.code]) : <span className="text-[#a1a1aa]">—</span>,
              daily?.[f.code] == null ? "belum diisi hari ini (dihitung 0)" : null))}
            {fixedFields.map((f) => row(f.label, CW_FIELD_KIND_LABEL.fixed, numID(f.value), "nilai tetap — ubah di Pengaturan"))}
            {autoRefs.length > 0 && (
              <>
                <div className="flex items-center gap-1.5 pt-1.5 pb-1 text-[10px] font-extrabold uppercase tracking-wider text-[#a1a1aa]">
                  <TrendingUp size={12} /> Data otomatis {date ? `· ${date}` : ""}
                </div>
                {autoRefs.map((c) => row(codeLabel(def, c), "otomatis",
                  formatValue(def, env[c]), "dari laporan aplikasi"))}
              </>
            )}
          </div>
        )}

        {/* rumus */}
        <div className="mt-3 flex items-start gap-1.5 text-[11px] text-[#52525B]">
          <SlidersHorizontal size={13} className="shrink-0 mt-0.5 text-[#a1a1aa]" />
          <div className="break-words leading-relaxed">
            <span className="font-bold text-[#a1a1aa]">Rumus: </span>
            {parsed.ok ? formulaLabeled(def?.formula, (c) => codeLabel(def, c)) : def?.formula || "—"}
          </div>
        </div>
      </div>
    </div>
  );
}
