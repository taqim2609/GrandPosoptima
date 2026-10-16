import { useEffect, useState } from "react";
import api, { apiError } from "@/lib/api";
import { toast } from "sonner";
import { loadFeatures, FEAT_DEFAULTS } from "@/lib/features";
import {
  Sparkles, BellRing, Gauge, ShieldCheck, Save, Loader2, RefreshCw,
  Webhook, Database, Activity, CheckCircle2, XCircle, KeyRound, Send,
} from "lucide-react";

// Kelompok flag + label + keterangan (label server: FEATURE_LABELS di backend).
const GROUPS = [
  {
    key: "ai", title: "Kecerdasan Buatan (AI)", icon: Sparkles, accent: "text-[#7C3AED]",
    rows: [
      { p: "ai.enabled", label: "Master AI", desc: "Hentikan SEMUA panggilan AI sekaligus: deskripsi, gambar, analisis laporan, scan faktur, asisten. Konfigurasi API key tetap tersimpan." },
      { p: "ai.summary", label: "Analisis Laporan", desc: "Ringkasan & analisis penjualan (Dashboard/Laporan/WA harian)." },
      { p: "ai.vision", label: "Baca Faktur (Vision)", desc: "Scan foto faktur & struk pembelian (parse invoice / pengeluaran)." },
      { p: "ai.description", label: "Deskripsi Produk", desc: "Menulis deskripsi produk otomatis." },
      { p: "ai.image", label: "Gambar Produk", desc: "Generator gambar produk." },
      { p: "ai.assistant", label: "Asisten AI", desc: "Halaman AI: tanya data, cara pakai, usulan aksi." },
      { p: "ai.pos_chat", label: "Kolom Chat Gemini & AI Studio di Layar POS", desc: "Tampilkan widget chat Gemini AI & panel tiket perintah AI Studio langsung di layar kasir POS khusus Superadmin." },
    ],
  },
  {
    key: "notif", title: "Notifikasi & Pembaruan", icon: BellRing, accent: "text-[#2563EB]",
    rows: [
      { p: "wa.enabled", label: "WhatsApp", desc: "Kirim laporan & struk ke WhatsApp (manual & laporan harian otomatis)." },
      { p: "ota.autocheck", label: "Periksa update OTA otomatis (APK)", desc: "Cek versi baru saat app dibuka / kembali aktif. Matikan utk hemat bandwidth perangkat." },
      { p: "update.banner", label: "Banner 'Versi baru tersedia'", desc: "Pemberitahuan update 1-klik di Dashboard." },
    ],
  },
  {
    key: "perf", title: "Performa (cache server)", icon: Gauge, accent: "text-[#059669]",
    rows: [
      { p: "perf.cache_master", label: "Cache data master", desc: "Produk/kategori/metode bayar/pengaturan dilayani dari memori (TTL singkat). Mengurangi beban MongoDB ±30-50%." },
      { p: "perf.cache_reports", label: "Cache laporan", desc: "Ringkasan & laporan periode lampau dihitung sekali lalu disajikan dari memori. Dashboard laporan jauh lebih cepat." },
    ],
  },
  {
    key: "ops", title: "Operasional & Keamanan", icon: ShieldCheck, accent: "text-[#B45309]",
    rows: [
      { p: "maint.orphan_auto", label: "Cek data yatim otomatis", desc: "1× seminggu (Minggu 04:00) memindai referensi putus antar data. Hasil tersimpan; aman di jam sepi." },
      { p: "maint.integrity_auto", label: "Cek integritas otomatis mingguan", desc: "1× seminggu (Minggu 03:00) memeriksa relasi, angka transaksi, stok, akun, indeks & backup. Bila ada temuan, ringkasannya dikirim ke WhatsApp laporan. Tombol perbaikan ada di sub-tab Integritas." },
      { p: "dbg.slowlog", label: "Log query/endpoint lambat", desc: "Catat endpoint > ambang (ms) ke log & ring buffer (terlihat di Statistik). Beban sangat kecil; matikan bila tak perlu." },
      { p: "dbg.metrics", label: "Statistik performa endpoint", desc: "Hitung jumlah request, waktu rata-rata, error per endpoint (halaman Statistik & Diagnostik)." },
      { p: "guard.breaker", label: "Circuit breaker layanan luar", desc: "Otomatis berhenti memanggil WA/AI/update-center setelah beberapa kegagalan beruntun, lalu pulih sendiri. Cegah request menggantung." },
    ],
  },
];

function Toggle({ on, onToggle, disabled }) {
  return (
    <button type="button" onClick={() => onToggle(!on)} disabled={disabled}
      className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${on ? "bg-[#16A34A]" : "bg-[#D4D4D8]"} disabled:opacity-40`}>
      <span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all ${on ? "left-[22px]" : "left-0.5"}`} />
    </button>
  );
}

function FlagRow({ label, desc, on, onToggle }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3 border-b border-[#F4F5F7] last:border-0">
      <div className="min-w-0">
        <div className="font-bold text-sm">{label}</div>
        {desc && <div className="text-[12px] text-[#71717A] mt-0.5 leading-snug">{desc}</div>}
      </div>
      <Toggle on={on} onToggle={onToggle} />
    </div>
  );
}

function getPath(obj, p) {
  return p.split(".").reduce((o, k) => (o == null ? o : o[k]), obj);
}
function setPath(obj, p, v) {
  const keys = p.split(".");
  const out = { ...obj };
  let cur = out;
  for (let i = 0; i < keys.length - 1; i++) {
    cur[keys[i]] = { ...(cur[keys[i]] || {}) };
    cur = cur[keys[i]];
  }
  cur[keys[keys.length - 1]] = v;
  return out;
}

const WEBHOOK_EVENTS = [
  { v: "order.paid", label: "Order Lunas (order.paid)", desc: "Dikirim setiap transaksi selesai dibayar." },
  { v: "shift.closed", label: "Shift Ditutup (shift.closed)", desc: "Dikirim saat kasir menutup shift (memuat ringkasan penjualan)." },
];

export default function SettingsIntegrations() {
  const [flags, setFlags] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [wh, setWh] = useState({ enabled: false, url: "", secret: "", events: [], secret_set: false, last: null });
  const [waInfo, setWaInfo] = useState(null);
  const [orphan, setOrphan] = useState(null);
  const [runningOrphan, setRunningOrphan] = useState(false);
  const [metrics, setMetrics] = useState(null);
  const [metricsLoading, setMetricsLoading] = useState(false);
  const [dirty, setDirty] = useState(false);

  const loadAll = () => {
    setLoading(true);
    Promise.all([
      api.get("/settings/features"),
      api.get("/settings/webhook"),
      api.get("/admin/orphan-check"),
      api.get("/whatsapp/config").catch(() => null),
    ]).then(([f, w, o, wa]) => {
      setFlags(f.data || FEAT_DEFAULTS);
      setWh({ enabled: !!w.data.enabled, url: w.data.url || "", secret: "",
              events: Array.isArray(w.data.events) ? w.data.events : [], secret_set: !!w.data.secret_set, last: w.data.last || null });
      setOrphan(o.data || {});
      setWaInfo(wa && wa.data);
    }).catch((e) => toast.error(apiError(e.response?.data?.detail)))
      .finally(() => setLoading(false));
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadAll(); }, []);

  const toggleFlag = (p) => { setFlags((f) => { const n = setPath(f, p, !getPath(f, p)); return n; }); setDirty(true); };

  const saveFlags = async () => {
    setSaving(true);
    try {
      await api.put("/settings/features", flags);
      await loadFeatures(); // refresh cache global (menu AI dll ikut berubah)
      toast.success("Feature flag tersimpan — berlaku tanpa deploy/restart");
      setDirty(false);
    } catch (e) { toast.error(apiError(e.response?.data?.detail)); }
    finally { setSaving(false); }
  };

  const saveWebhook = async () => {
    if (wh.enabled && !/^https?:\/\//.test((wh.url || "").trim())) return toast.error("URL webhook tidak valid (http/https)");
    setSaving(true);
    try {
      await api.put("/settings/webhook", { enabled: wh.enabled, url: (wh.url || "").trim(), secret: wh.secret, events: wh.events });
      toast.success("Webhook disimpan");
      api.get("/settings/webhook").then((r) => setWh((s) => ({ ...s, secret_set: r.data.secret_set, last: r.data.last, secret: "" }))).catch(() => {});
    } catch (e) { toast.error(apiError(e.response?.data?.detail)); }
    finally { setSaving(false); }
  };

  const testWebhook = async () => {
    setSaving(true);
    try {
      await api.post("/settings/webhook/test");
      toast.success("Uji webhook terkirim — cek penerima & status di bawah");
      api.get("/settings/webhook").then((r) => setWh((s) => ({ ...s, last: r.data.last }))).catch(() => {});
    } catch (e) { toast.error(apiError(e.response?.data?.detail)); }
    finally { setSaving(false); }
  };

  const runOrphan = async () => {
    setRunningOrphan(true);
    try {
      const r = await api.post("/admin/orphan-check");
      setOrphan((o) => ({ ...o, last: r.data }));
      const total = (r.data.results || []).reduce((s, x) => s + x.count, 0);
      toast.success(total === 0 ? "Pemeriksaan selesai — tidak ada data yatim 🎉" : `Pemeriksaan selesai — ${total} data yatim ditemukan`);
    } catch (e) { toast.error(apiError(e.response?.data?.detail)); }
    finally { setRunningOrphan(false); }
  };

  const loadMetrics = async () => {
    setMetricsLoading(true);
    try { const r = await api.get("/admin/metrics"); setMetrics(r.data); }
    catch (e) { toast.error(apiError(e.response?.data?.detail)); }
    finally { setMetricsLoading(false); }
  };

  if (loading || !flags) {
    return <div className="h-full grid place-items-center"><Loader2 className="animate-spin text-[#E63946]" /></div>;
  }

  const aiOn = getPath(flags, "ai.enabled");

  return (
    <div className="h-full overflow-y-auto p-8">
      <h1 className="text-3xl font-extrabold flex items-center gap-2 mb-1"><ShieldCheck className="text-[#E63946]" /> Fitur & Integrasi</h1>
      <p className="text-sm text-[#52525B] mb-6 max-w-3xl">
        Nyalakan/matikan fitur tanpa deploy, kelola integrasi pihak ketiga (webhook), dan pantau kesehatan server.
        Default = fitur aktif seperti biasa; matikan yang tidak dipakai untuk meringankan kerja server.
      </p>

      {/* Ringkasan integrasi terpasang */}
      <div className="grid gap-4 mb-6 max-w-3xl md:grid-cols-3">
        <div className="bg-white rounded-2xl border p-4 flex items-center gap-3">
          <div className={`h-11 w-11 rounded-xl grid place-items-center shrink-0 ${aiOn ? "bg-[#F3E8FF] text-[#7C3AED]" : "bg-[#F4F4F5] text-[#A1A1AA]"}`}><Sparkles size={20} /></div>
          <div className="min-w-0">
            <div className="text-[11px] font-bold text-[#71717A] uppercase tracking-wide">AI</div>
            <div className="font-extrabold text-sm truncate">{aiOn ? "Aktif" : "Dimatikan"}</div>
            <div className="text-[11px] text-[#71717A]">Kelola key di tab Pengaturan AI</div>
          </div>
        </div>
        <div className="bg-white rounded-2xl border p-4 flex items-center gap-3">
          <div className={`h-11 w-11 rounded-xl grid place-items-center shrink-0 ${waInfo?.configured ? "bg-[#DCFCE7] text-[#16A34A]" : "bg-[#F4F4F5] text-[#A1A1AA]"}`}><KeyRound size={20} /></div>
          <div className="min-w-0">
            <div className="text-[11px] font-bold text-[#71717A] uppercase tracking-wide">WhatsApp</div>
            <div className="font-extrabold text-sm truncate">{waInfo?.configured ? "Terpasang" : "Belum dikonfigurasi"}</div>
            <div className="text-[11px] text-[#71717A] truncate">{waInfo?.api_key_masked || ""}</div>
          </div>
        </div>
        <div className="bg-white rounded-2xl border p-4 flex items-center gap-3">
          <div className={`h-11 w-11 rounded-xl grid place-items-center shrink-0 ${wh.enabled ? "bg-[#DBEAFE] text-[#2563EB]" : "bg-[#F4F4F5] text-[#A1A1AA]"}`}><Webhook size={20} /></div>
          <div className="min-w-0">
            <div className="text-[11px] font-bold text-[#71717A] uppercase tracking-wide">Webhook keluar</div>
            <div className="font-extrabold text-sm truncate">{wh.enabled ? "Aktif" : "Nonaktif"}</div>
            <div className="text-[11px] text-[#71717A] truncate">{(wh.events || []).length ? wh.events.join(", ") : "-"}</div>
          </div>
        </div>
      </div>

      <div className="grid gap-6 max-w-3xl">
        {GROUPS.map((g) => {
          const Icon = g.icon;
          return (
            <div key={g.key} className="bg-white rounded-2xl border p-6" data-testid={`flag-group-${g.key}`}>
              <div className="flex items-center gap-2 mb-2">
                <Icon size={18} className={g.accent} />
                <h3 className="font-extrabold text-lg">{g.title}</h3>
                <span className={`ml-auto text-[11px] font-bold px-2.5 py-1 rounded-full ${g.rows.every((r) => getPath(flags, r.p)) ? "bg-[#DCFCE7] text-[#166534]" : "bg-[#FEF3C7] text-[#92400E]"}`}>
                  {g.rows.every((r) => getPath(flags, r.p)) ? "semua aktif" : `${g.rows.filter((r) => getPath(flags, r.p)).length}/${g.rows.length} aktif`}
                </span>
              </div>
              <div>
                {g.rows.map((r) => (
                  <FlagRow key={r.p} label={r.label} desc={r.desc} on={!!getPath(flags, r.p)} onToggle={() => toggleFlag(r.p)} />
                ))}
              </div>
            </div>
          );
        })}

        {/* Webhook keluar */}
        <div className="bg-white rounded-2xl border p-6" data-testid="webhook-card">
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <div>
              <h3 className="font-extrabold text-lg flex items-center gap-2"><Webhook size={18} className="text-[#2563EB]" /> Webhook Keluar (Integrasi Pihak Ketiga)</h3>
              <p className="text-xs text-[#71717A] mt-1">POS mengirim event JSON ke URL Anda (Apps Script, bot, dashboard). Aman: tanda tangan HMAC-SHA256 di header <code className="bg-[#F4F4F5] px-1 rounded">X-Gak-Webhook-Signature</code>.</p>
            </div>
            <Toggle on={wh.enabled} onToggle={() => setWh((s) => ({ ...s, enabled: !s.enabled }))} />
          </div>
          <div className="grid gap-3">
            <div>
              <label className="text-xs font-bold text-[#52525B]">URL tujuan</label>
              <input value={wh.url} onChange={(e) => setWh((s) => ({ ...s, url: e.target.value }))} placeholder="https://script.google.com/macros/s/.../exec" className="mt-1 w-full h-11 rounded-xl border px-3 text-sm" />
            </div>
            <div>
              <label className="text-xs font-bold text-[#52525B]">Secret (tanda tangan) {wh.secret_set ? <span className="text-[#16A34A] font-bold">— terpasang</span> : null}</label>
              <input value={wh.secret} onChange={(e) => setWh((s) => ({ ...s, secret: e.target.value }))} placeholder={wh.secret_set ? "•••••• (kosongkan bila tidak diganti)" : "Isi secret acak panjang"} className="mt-1 w-full h-11 rounded-xl border px-3 text-sm font-num" />
            </div>
            <div>
              <div className="text-xs font-bold text-[#52525B] mb-1.5">Event yang dikirim</div>
              <div className="space-y-1.5">
                {WEBHOOK_EVENTS.map((ev) => (
                  <label key={ev.v} className="flex items-start gap-2.5 rounded-xl border px-3 py-2.5 cursor-pointer hover:bg-[#FAFAFA]">
                    <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[#2563EB]" checked={wh.events.includes(ev.v)}
                      onChange={() => setWh((s) => ({ ...s, events: s.events.includes(ev.v) ? s.events.filter((x) => x !== ev.v) : [...s.events, ev.v] }))} />
                    <div>
                      <div className="text-sm font-bold">{ev.label}</div>
                      <div className="text-[11px] text-[#71717A]">{ev.desc}</div>
                    </div>
                  </label>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <button onClick={saveWebhook} disabled={saving} className="tap h-10 px-5 rounded-xl bg-[#0A0A0A] hover:bg-[#27272A] text-white font-bold text-sm inline-flex items-center gap-2 disabled:opacity-50">
                {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} Simpan Webhook
              </button>
              <button onClick={testWebhook} disabled={saving || !(wh.url || "").trim()} className="tap h-10 px-5 rounded-xl border font-bold text-sm inline-flex items-center gap-2 disabled:opacity-50">
                <Send size={15} /> Uji Kirim
              </button>
              {wh.last && (
                <span className={`text-xs font-bold inline-flex items-center gap-1 ${wh.last.ok ? "text-[#16A34A]" : "text-[#EF4444]"}`}>
                  {wh.last.ok ? <CheckCircle2 size={13} /> : <XCircle size={13} />}
                  Terakhir {wh.last.event} {wh.last.at ? new Date(wh.last.at).toLocaleString("id-ID") : ""} — {wh.last.ok ? `HTTP ${wh.last.status}` : (wh.last.error || "gagal")}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Pemeriksaan data yatim */}
        <div className="bg-white rounded-2xl border p-6" data-testid="orphan-card">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div>
              <h3 className="font-extrabold text-lg flex items-center gap-2"><Database size={18} className="text-[#B45309]" /> Validasi Data Yatim (Orphan Records)</h3>
              <p className="text-xs text-[#71717A] mt-1">Memindai referensi putus: produk → kategori/vendor hilang, item order → produk hilang, order/kas → shift hilang, resep → bahan hilang, dll. Read-only & aman.</p>
            </div>
            <button onClick={runOrphan} disabled={runningOrphan} className="tap h-10 px-4 rounded-xl bg-[#B45309] text-white font-bold text-sm inline-flex items-center gap-2 disabled:opacity-60 shrink-0">
              {runningOrphan ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />} Jalankan Sekarang
            </button>
          </div>
          <div className="text-xs text-[#71717A] mb-3">Jadwal otomatis: <b>{orphan?.auto ? "AKTIF — " : "nonaktif — "}{orphan?.schedule || "Minggu 04:00 WIB"}</b> (atur di grup Operasional & Keamanan)</div>
          {orphan?.last && (
            <div className="rounded-xl bg-[#FAFAFA] border p-3">
              <div className="text-[11px] font-bold text-[#71717A] mb-2">Terakhir: {new Date(orphan.last.at).toLocaleString("id-ID")}</div>
              {(orphan.last.results || []).length === 0 ? (
                <div className="text-sm font-bold text-[#16A34A]">Tidak ada data yatim.</div>
              ) : (
                <div className="space-y-1.5">
                  {(orphan.last.results || []).filter((r) => r.count > 0).map((r) => (
                    <div key={r.name} className="flex items-start gap-2 text-sm">
                      <span className="font-num font-extrabold text-[#EF4444] shrink-0">{r.count}×</span>
                      <div>
                        <div className="font-bold">{r.name}</div>
                        {r.samples?.length > 0 && <div className="text-[11px] text-[#71717A] truncate">{r.samples.join("; ")}</div>}
                        {r.note && <div className="text-[11px] text-[#A16207]">{r.note}</div>}
                      </div>
                    </div>
                  ))}
                  {orphan.last.results.every((r) => r.count === 0) && <div className="text-sm font-bold text-[#16A34A]">Tidak ada data yatim. ✓</div>}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Statistik performa */}
        <div className="bg-white rounded-2xl border p-6" data-testid="metrics-card">
          <div className="flex items-center justify-between gap-3 mb-3">
            <div>
              <h3 className="font-extrabold text-lg flex items-center gap-2"><Activity size={18} className="text-[#059669]" /> Statistik Performa & Kesehatan</h3>
              <p className="text-xs text-[#71717A] mt-1">Response time, error rate, endpoint lambat, & status circuit breaker layanan luar. Ring buffer dalam memori (direset saat server restart).</p>
            </div>
            <button onClick={loadMetrics} disabled={metricsLoading} className="tap h-10 px-4 rounded-xl border font-bold text-sm inline-flex items-center gap-2 disabled:opacity-60">
              {metricsLoading ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />} Muat
            </button>
          </div>
          {!getPath(flags, "dbg.metrics") && (
            <div className="rounded-xl bg-[#FEF3C7] border border-[#F59E0B] px-4 py-3 text-sm text-[#92400E] mb-3">Statistik dimatikan (flag <b>dbg.metrics</b>). Data lama tetap terbaca di sini.</div>
          )}
          {metrics && (
            <div className="grid gap-3 md:grid-cols-4 mb-3">
              <div className="rounded-xl border p-3"><div className="text-[11px] font-bold text-[#71717A]">Request (sejak start)</div><div className="font-num font-extrabold text-lg">{metrics.total}</div></div>
              <div className="rounded-xl border p-3"><div className="text-[11px] font-bold text-[#71717A]">Rata-rata</div><div className="font-num font-extrabold text-lg">{metrics.avg_ms} ms</div></div>
              <div className="rounded-xl border p-3"><div className="text-[11px] font-bold text-[#71717A]">Error rate</div><div className={`font-num font-extrabold text-lg ${metrics.error_rate > 5 ? "text-[#EF4444]" : "text-[#16A34A]"}`}>{metrics.error_rate}%</div></div>
              <div className="rounded-xl border p-3"><div className="text-[11px] font-bold text-[#71717A]">Endpoint lambat</div><div className="font-num font-extrabold text-lg">{metrics.slow?.length || 0}</div></div>
            </div>
          )}
          {metrics?.by_path?.length > 0 && (
            <div className="rounded-xl bg-[#FAFAFA] border overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="text-left text-[11px] font-bold text-[#71717A] border-b">
                  <th className="px-3 py-2">Endpoint</th><th className="px-3 py-2 text-right">Jumlah</th><th className="px-3 py-2 text-right">Rata-rata</th><th className="px-3 py-2 text-right">Error</th>
                </tr></thead>
                <tbody>
                  {metrics.by_path.slice(0, 12).map((p) => (
                    <tr key={p.path} className="border-b last:border-0">
                      <td className="px-3 py-1.5 font-num">{p.path}</td>
                      <td className="px-3 py-1.5 text-right font-num">{p.count}</td>
                      <td className="px-3 py-1.5 text-right font-num">{p.avg_ms} ms</td>
                      <td className={`px-3 py-1.5 text-right font-num ${p.errors ? "text-[#EF4444]" : "text-[#16A34A]"}`}>{p.errors || "✓"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {metrics?.slow?.length > 0 && (
            <div className="mt-2 rounded-xl bg-[#FEF2F2] border border-[#FECACA] p-3">
              <div className="text-[11px] font-bold text-[#B91C1C] mb-1">Endpoint lambat terakhir (ambang {getPath(flags, "dbg.slowlog_ms") || 1500} ms):</div>
              {metrics.slow.slice(-5).reverse().map((s, i) => (
                <div key={i} className="text-xs font-num text-[#7F1D1D]">{s.at} {s.method} {s.path} — {s.ms} ms</div>
              ))}
            </div>
          )}
          {metrics?.breakers && Object.keys(metrics.breakers).length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {Object.entries(metrics.breakers).map(([k, v]) => (
                <span key={k} className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${v.open ? "bg-[#FEE2E2] text-[#B91C1C]" : "bg-[#DCFCE7] text-[#166534]"}`}>
                  breaker {k}: {v.open ? "terbuka (gangguan)" : "normal"} · {v.fails} gagal beruntun
                </span>
              ))}
            </div>
          )}
          {!metrics && !metricsLoading && (
            <button onClick={loadMetrics} className="text-xs font-bold text-[#059669] hover:underline">Muat statistik…</button>
          )}
        </div>
      </div>

      {/* Sticky simpan */}
      {dirty && (
        <div className="fixed bottom-6 right-6 z-40 shadow-2xl rounded-2xl bg-[#E63946] text-white px-5 py-4 flex items-center gap-4 max-w-sm">
          <div className="text-sm font-bold">Ada perubahan flag — simpan agar berlaku (tanpa deploy).</div>
          <button onClick={saveFlags} disabled={saving} className="tap shrink-0 h-10 px-4 rounded-xl bg-white text-[#E63946] font-extrabold text-sm inline-flex items-center gap-2 disabled:opacity-60">
            {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} Simpan
          </button>
        </div>
      )}
    </div>
  );
}
