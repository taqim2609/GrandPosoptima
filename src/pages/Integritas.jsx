import { useEffect, useState } from "react";
import api, { apiError } from "@/lib/api";
import { toast } from "sonner";
import {
  ShieldCheck, RefreshCw, Wrench, Loader2, CalendarClock, Database, Info,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

/* Halaman Cek Integritas Data (Pengaturan → Fitur & Integrasi → Integritas).
   Backend: GET /admin/integrity (hasil terakhir + jadwal + daftar perbaikan),
            POST /admin/integrity/check (jalankan sekarang, read-only),
            POST /admin/integrity/fix (terapkan satu perbaikan aman).
   Semua temuan yang punya tombol "Perbaiki" sudah dirancang aman oleh backend;
   yang butuh keputusan manusia (mis. transaksi lunas tanpa item) tidak punya tombol. */

const LEVELS = {
  error: { label: "Berat", badge: "bg-[#FEE2E2] text-[#B91C1C] border-[#FECACA]", dot: "bg-[#DC2626]" },
  warn: { label: "Perhatian", badge: "bg-[#FEF3C7] text-[#B45309] border-[#FDE68A]", dot: "bg-[#F59E0B]" },
  ok: { label: "Normal", badge: "bg-[#DCFCE7] text-[#15803D] border-[#BBF7D0]", dot: "bg-[#16A34A]" },
};

function timeID(iso) {
  if (!iso) return "-";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" });
}

function StatCard({ label, value, tone = "neutral", testid }) {
  const tones = {
    neutral: "border-[#E4E4E7] bg-white",
    error: "border-[#FECACA] bg-[#FEF2F2]",
    warn: "border-[#FDE68A] bg-[#FFFBEB]",
    ok: "border-[#BBF7D0] bg-[#F0FDF4]",
  };
  const text = { neutral: "text-[#0A0A0A]", error: "text-[#B91C1C]", warn: "text-[#B45309]", ok: "text-[#15803D]" };
  return (
    <div className={`rounded-2xl border p-4 ${tones[tone]}`} data-testid={testid}>
      <div className="text-[12px] font-bold text-[#52525B] uppercase tracking-wide">{label}</div>
      <div className={`text-3xl font-extrabold mt-1 ${text[tone]}`}>{value}</div>
    </div>
  );
}

export default function Integritas() {
  const [report, setReport] = useState(null);
  const [meta, setMeta] = useState({ auto: false, schedule: "", fixes: [] });
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [fixing, setFixing] = useState("");
  const [fixingAll, setFixingAll] = useState(false);
  const [confirm, setConfirm] = useState(null);   // {key,label} | {all:true}
  const [cats, setCats] = useState([]);
  const [catTarget, setCatTarget] = useState("");
  const [featDoc, setFeatDoc] = useState(null);

  const load = async () => {
    try {
      const r = await api.get("/admin/integrity");
      setMeta({ auto: !!r.data.auto, schedule: r.data.schedule || "", fixes: r.data.fixes || [] });
      setReport(r.data.last || null);
    } catch (e) {
      toast.error("Gagal memuat hasil integritas: " + apiError(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    api.get("/settings/features").then((r) => setFeatDoc(r.data || {})).catch(() => {});
    api.get("/categories").then((r) => setCats(Array.isArray(r.data) ? r.data : [])).catch(() => {});
  }, []);

  const run = async (silent) => {
    setRunning(true);
    if (!silent) toast.loading("Memeriksa integritas data...", { id: "intg" });
    try {
      const r = await api.post("/admin/integrity/check");
      setReport(r.data);
      const s = r.data.summary || {};
      if (!silent) {
        toast.success(`Selesai dalam ${Math.round((r.data.duration_ms || 0) / 100) / 10} dtk — ${s.error || 0} masalah berat, ${s.warn || 0} peringatan.`,
          { id: "intg", duration: 6000 });
      }
      return r.data;
    } catch (e) {
      toast.error("Pemeriksaan gagal: " + apiError(e), { id: "intg" });
      return null;
    } finally {
      setRunning(false);
    }
  };

  const doFix = async (key, target) => {
    setFixing(key);
    const t = toast.loading("Memperbaiki...", { id: "intgfix" });
    try {
      const r = await api.post("/admin/integrity/fix", { key, target: target || "" });
      toast.success(r.data.detail || "Perbaikan dijalankan.", { id: t, duration: 9000 });
      await run(true);
      return true;
    } catch (e) {
      toast.error("Gagal memperbaiki: " + apiError(e), { id: t, duration: 9000 });
      return false;
    } finally {
      setFixing("");
      setConfirm(null);
      setCatTarget("");
    }
  };

  const fixAll = async () => {
    const list = fixableChecks;
    setFixingAll(true);
    let ok = 0;
    for (const c of list) {
      try {
        await api.post("/admin/integrity/fix", { key: c.fix, target: "" });
        ok += 1;
      } catch (e) {
        toast.error(`Gagal: ${c.name} — ${apiError(e)}`, { duration: 9000 });
      }
    }
    setFixingAll(false);
    setConfirm(null);
    await run(true);
    toast.success(`${ok} dari ${list.length} jenis perbaikan dijalankan — lihat hasil pemeriksaan terbaru.`, { duration: 9000 });
  };

  const toggleAuto = async () => {
    if (!featDoc) return;
    const next = { ...featDoc, maint: { ...(featDoc.maint || {}), integrity_auto: !meta.auto } };
    try {
      await api.put("/settings/features", next);
      setFeatDoc(next);
      setMeta((m) => ({ ...m, auto: !m.auto }));
      toast.success(!meta.auto ? `Cek integritas otomatis AKTIF (${meta.schedule}).` : "Cek integritas otomatis dimatikan.");
    } catch (e) {
      toast.error("Gagal menyimpan pengaturan: " + apiError(e));
    }
  };

  const checks = (report && Array.isArray(report.groups) ? report.groups.flatMap((g) => g.checks || []) : []);
  const fixableChecks = checks.filter((c) => c.count > 0 && c.fix);
  const s = (report && report.summary) || { error: 0, warn: 0, ok: 0, fixable: 0, total: 0 };
  const info = (report && report.info) || {};

  return (
    <div className="h-full overflow-y-auto p-6 lg:p-8" data-testid="settings-integritas">
      <div className="max-w-4xl space-y-5">
        <div className="rounded-2xl border-2 border-[#4F46E5] bg-[#EEF2FF] p-5">
          <div className="flex items-center gap-2 font-extrabold text-[#0A0A0A]">
            <ShieldCheck size={18} className="text-[#4F46E5]" /> Cek Integritas Data
          </div>
          <p className="text-sm text-[#52525B] mt-1">
            Memeriksa hubungan antar data (produk/kategori/vendor, transaksi/meja/shift), kewajaran angka
            (total transaksi, nomor ganda), stok &amp; HPP, akun, indeks database, dan kesegaran backup.
            Pemeriksaan bersifat baca-saja; perbaikan hanya dijalankan bila Anda menekan tombolnya.
          </p>
          <div className="flex flex-wrap items-center gap-2 mt-3">
            <button data-testid="integritas-run" onClick={() => run(false)} disabled={running}
              className="tap h-10 px-4 rounded-lg bg-[#E63946] text-white font-bold text-sm inline-flex items-center gap-2 disabled:opacity-50">
              {running ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
              {running ? "Memeriksa..." : "Cek Sekarang"}
            </button>
            {fixableChecks.length > 0 && (
              <button data-testid="integritas-fix-all" onClick={() => setConfirm({ all: true })}
                disabled={!!fixing || fixingAll}
                className="tap h-10 px-4 rounded-lg bg-[#4F46E5] text-white font-bold text-sm inline-flex items-center gap-2 disabled:opacity-50">
                {fixingAll ? <Loader2 size={15} className="animate-spin" /> : <Wrench size={15} />}
                Perbaiki Semua yang Aman ({fixableChecks.length})
              </button>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-3 mt-3 text-xs text-[#52525B]">
            <span className="inline-flex items-center gap-1" data-testid="integritas-last">
              <CalendarClock size={13} /> Pemeriksaan terakhir: {report && report.at ? timeID(report.at) : "belum pernah"}
              {report && report.at ? ` · ${Math.round((report.duration_ms || 0) / 100) / 10} dtk · ${report.orders_scanned || 0} transaksi diperiksa` : ""}
            </span>
            <label className="inline-flex items-center gap-2 font-bold text-[#0A0A0A]">
              <input type="checkbox" data-testid="integritas-auto-toggle" checked={!!meta.auto} onChange={toggleAuto} />
              Otomatis mingguan ({meta.schedule || "-"})
            </label>
          </div>
        </div>

        {loading ? (
          <div className="text-sm text-[#52525B] inline-flex items-center gap-2"><Loader2 size={16} className="animate-spin" /> Memuat hasil terakhir...</div>
        ) : !report || !Array.isArray(report.groups) || report.groups.length === 0 ? (
          <div className="rounded-2xl border bg-white p-5 text-sm text-[#52525B]" data-testid="integritas-empty">
            Belum ada hasil pemeriksaan. Tekan <b>Cek Sekarang</b> untuk memeriksa integritas data server.
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4" data-testid="integritas-summary">
              <StatCard label="Masalah Berat" value={s.error || 0} tone={(s.error || 0) > 0 ? "error" : "ok"} testid="integritas-stat-error" />
              <StatCard label="Perlu Perhatian" value={s.warn || 0} tone={(s.warn || 0) > 0 ? "warn" : "ok"} testid="integritas-stat-warn" />
              <StatCard label="Normal" value={s.ok || 0} tone="ok" testid="integritas-stat-ok" />
              <StatCard label="Bisa Diperbaiki" value={s.fixable || 0} tone="neutral" testid="integritas-stat-fixable" />
            </div>

            {(report.groups || []).map((g) => {
              const bad = (g.checks || []).filter((c) => c.count > 0);
              return (
                <div key={g.key || Math.random()} className="rounded-2xl border bg-white p-5" data-testid={`integritas-group-${g.key}`}>
                  <div className="flex items-center justify-between gap-3">
                    <div className="font-extrabold text-[#0A0A0A]">{g.label}</div>
                    <div className={`text-xs font-bold px-2 py-1 rounded-lg border ${bad.length ? "bg-[#FFF7ED] text-[#B45309] border-[#FED7AA]" : "bg-[#F0FDF4] text-[#15803D] border-[#BBF7D0]"}`}>
                      {bad.length ? `${bad.length} perlu perhatian` : "Semua normal"}
                    </div>
                  </div>
                  <div className="mt-3 space-y-2.5">
                    {(g.checks || []).map((c) => {
                      // Badge mengikuti JUMLAH temuan: count 0 selalu "Normal" (walau level warn/error).
                      const lv = c.count > 0 ? (LEVELS[c.level] || LEVELS.warn) : LEVELS.ok;
                      return (
                        <div key={c.key} className="rounded-xl border border-[#F4F5F7] p-3" data-testid={`integritas-check-${c.key}`}>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className={`h-2.5 w-2.5 rounded-full ${lv.dot}`} />
                            <span className="font-bold text-sm">{c.name}</span>
                            <span className={`text-[11px] font-bold px-2 py-0.5 rounded-md border ${lv.badge}`}>
                              {c.count > 0 ? `${c.count} temuan · ${lv.label}` : lv.label}
                            </span>
                            {c.count > 0 && c.fix && (
                              <button data-testid={`integritas-fix-${c.key}`}
                                onClick={() => { setCatTarget(""); setConfirm({ key: c.fix, label: c.fix_label || c.name, checkName: c.name }); }}
                                disabled={!!fixing || fixingAll}
                                className="tap ml-auto h-8 px-3 rounded-lg bg-[#4F46E5] text-white font-bold text-xs inline-flex items-center gap-1.5 disabled:opacity-50">
                                {fixing === c.fix ? <Loader2 size={13} className="animate-spin" /> : <Wrench size={13} />}
                                {c.fix_label || "Perbaiki"}
                              </button>
                            )}
                          </div>
                          {c.count > 0 && c.note && <div className="text-[12px] text-[#52525B] mt-1.5">{c.note}</div>}
                          {c.samples && c.samples.length > 0 && (
                            <ul className="mt-1.5 text-[11px] font-mono text-[#71717A] space-y-0.5">
                              {c.samples.map((x, i) => <li key={i}>• {x}</li>)}
                            </ul>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}

            <div className="rounded-2xl border bg-white p-5 text-xs text-[#52525B]">
              <div className="font-bold text-[#0A0A0A] text-sm mb-1 inline-flex items-center gap-2">
                <Database size={14} /> Info Database
              </div>
              <div>Versi server terpasang: <b>{info.versi_terpasang || "-"}</b> · batas pemeriksaan per koleksi: {report.cap} dokumen</div>
              <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
                {Object.entries(info.jumlah_dokumen || {}).map(([k, v]) => (
                  <span key={k}>{k}: <b>{v == null ? "-" : v}</b></span>
                ))}
              </div>
              <div className="mt-2 inline-flex items-center gap-1 text-[11px]">
                <Info size={12} /> Perbaikan tidak menghapus transaksi penjualan; hanya merapikan data yang
                hubungannya sudah rusak (dan void bill terbuka yang menggantung).
              </div>
            </div>
          </>
        )}

        <Dialog open={!!confirm} onOpenChange={(v) => { if (!v) { setConfirm(null); setCatTarget(""); } }}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>{confirm && confirm.all ? "Perbaiki semua temuan yang aman?" : "Jalankan perbaikan?"}</DialogTitle>
            </DialogHeader>
            {confirm && confirm.all ? (
              <div className="text-sm text-[#52525B] space-y-2">
                <p>Akan dijalankan {fixableChecks.length} jenis perbaikan berikut, berurutan:</p>
                <ul className="list-disc pl-5 space-y-0.5">
                  {fixableChecks.map((c) => <li key={c.key}>{c.fix_label || c.fix} <span className="text-[#71717A]">({c.count} temuan)</span></li>)}
                </ul>
                <p>Jenis perbaikan yang butuh keputusan manusia tidak ikut dijalankan.</p>
              </div>
            ) : (
              <div className="text-sm text-[#52525B] space-y-2">
                <p><b>{confirm && confirm.label}</b> — temuan: {confirm && confirm.checkName}</p>
                {confirm && confirm.key === "fix_product_category" && (
                  <div data-testid="integritas-cat-target">
                    <div className="font-bold text-[#0A0A0A] mb-1">Pindahkan ke kategori (opsional)</div>
                    <select value={catTarget} onChange={(e) => setCatTarget(e.target.value)}
                      className="w-full h-10 rounded-lg border px-3 text-sm">
                      <option value="">— Kosongkan saja (tanpa kategori) —</option>
                      {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                )}
                {confirm && confirm.key === "fix_stale_bills" && (
                  <p className="text-[#B45309] font-bold">Bill tanpa pembayaran yang menggantung &gt; 24 jam akan di-void (stok tidak berubah, meja jadi kosong).</p>
                )}
              </div>
            )}
            <DialogFooter>
              <button onClick={() => { setConfirm(null); setCatTarget(""); }}
                className="tap h-10 px-4 rounded-lg border font-bold text-sm bg-white">Batal</button>
              <button data-testid="integritas-confirm"
                onClick={() => (confirm && confirm.all ? fixAll() : doFix(confirm.key, catTarget))}
                disabled={!!fixing || fixingAll}
                className="tap h-10 px-4 rounded-lg bg-[#4F46E5] text-white font-bold text-sm inline-flex items-center gap-2 disabled:opacity-50">
                {(fixing || fixingAll) ? <Loader2 size={15} className="animate-spin" /> : <Wrench size={15} />} Jalankan Perbaikan
              </button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
