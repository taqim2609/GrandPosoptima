import { useEffect, useState } from "react";
import api, { apiError } from "@/lib/api";
import { toast } from "sonner";
import {
  MessageCircle, Loader2, Save, Send, RefreshCw, CheckCircle2,
  KeyRound, Sliders, Zap,
} from "lucide-react";

/**
 * Pengaturan WhatsApp Gateway — Hermes Baileys.
 *
 * Rancangan yang dikunci:
 *  - WhatsApp hanya dikirim/diterima di server gudang (644); bridge bind 127.0.0.1.
 *  - Pi tidak pernah memanggil bridge. Pesan yang gagal dikirim masuk `wa_outbox`
 *    dengan idempotency key, lalu dikirim SEKALI oleh server gudang setelah sinkron.
 *  - Halaman ini tidak menyimpan kredensial bridge: konfigurasi bridge ada di env
 *    server gudang. Status dan outbox dibaca langsung dari backend.
 */
export default function WhatsApp() {
  const [loading, setLoading] = useState(true);
  const [savingProvider, setSavingProvider] = useState(false);

  // Status bridge Hermes (nomor bot terpisah, hanya server gudang 644)
  const [hermes, setHermes] = useState({
    configured: false,
    state: "unconfigured",
    api_url: "",
    localhost_only: false,
    secret_masked: "",
    allowlist: {},
    node_id: "",
    node_mode: "primary",
    bot: "",
    error: "",
  });
  const [outbox, setOutbox] = useState({ pending: 0, recent_failures: [], bridge_configured: false });
  const [dispatching, setDispatching] = useState(false);

  const [statusState, setStatusState] = useState("disconnected");
  const [statusChecking, setStatusChecking] = useState(false);
  const [testNo, setTestNo] = useState("");
  const [testing, setTesting] = useState(false);

  // Group reservation rules state
  const [groupOnly, setGroupOnly] = useState(true);
  const [resKeywords, setResKeywords] = useState("#reservasi, #booking, !reservasi, reservasi");
  const [targetGroupId, setTargetGroupId] = useState("");
  const [replyGroup, setReplyGroup] = useState(true);
  const [sendPrivate, setSendPrivate] = useState(true);
  const [rejectPrivate, setRejectPrivate] = useState(true);
  const [savingResRules, setSavingResRules] = useState(false);

  const loadHermes = async () => {
    try {
      const r = await api.get("/whatsapp/hermes/status");
      const d = r.data || {};
      setHermes({
        configured: d.state !== "unconfigured",
        state: d.state || "unconfigured",
        api_url: d.api_url || "",
        localhost_only: !!d.localhost_only,
        secret_masked: d.secret_masked || "",
        allowlist: d.allowlist || {},
        node_id: d.node_id || "",
        node_mode: d.node_mode || "primary",
        bot: d.details?.bot || "",
        error: d.details?.error || "",
      });
      setStatusState(d.status || "disconnected");
    } catch (e) {
      setHermes((h) => ({ ...h, state: "offline" }));
      setStatusState("disconnected");
    }
    try {
      const o = await api.get("/whatsapp/outbox");
      setOutbox(o.data || { pending: 0, recent_failures: [], bridge_configured: false });
    } catch (e) {
      /* ringkasan outbox bersifat opsional */
    }
  };

  const load = async () => {
    try {
      const r = await api.get("/whatsapp/config");
      const c = r.data || {};
      setGroupOnly(c.group_only_reservation !== false);
      setResKeywords(c.reservation_keywords || "#reservasi, #booking, !reservasi, reservasi");
      setTargetGroupId(c.target_group_id || "");
      setReplyGroup(c.reply_to_group !== false);
      setSendPrivate(c.send_private_confirm !== false);
      setRejectPrivate(c.reject_private_booking !== false);
      if (c.phone) setTestNo(c.phone);
      await loadHermes();
    } catch (e) {
      toast.error(apiError(e.response?.data?.detail));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const activateHermes = async () => {
    setSavingProvider(true);
    try {
      await api.put("/whatsapp/config", { provider: "hermes" });
      toast.success("Provider Hermes Baileys diaktifkan");
      await loadHermes();
    } catch (e) {
      toast.error(apiError(e.response?.data?.detail));
    } finally {
      setSavingProvider(false);
    }
  };

  const checkStatus = async () => {
    setStatusChecking(true);
    try {
      const r = await api.get("/whatsapp/status");
      setStatusState(r.data.status || "connected");
      if (r.data.status === "connected" || r.data.state === "open") {
        toast.success("WhatsApp Gateway (Hermes Baileys) Terhubung!");
      } else {
        toast.info(`Status Gateway: ${r.data.state || r.data.status}`);
      }
      await loadHermes();
    } catch (e) {
      toast.error("Gagal memeriksa status koneksi");
    } finally {
      setStatusChecking(false);
    }
  };

  const dispatchOutbox = async () => {
    setDispatching(true);
    try {
      const r = await api.post("/whatsapp/outbox/dispatch");
      const d = r.data || {};
      if (d.skipped) {
        toast.info("Node ini tidak punya bridge — outbox akan dikirim oleh server gudang.");
      } else {
        toast.success(`Outbox dikirim: ${d.sent || 0} berhasil, ${d.failed || 0} gagal`);
      }
      await loadHermes();
    } catch (e) {
      toast.error(apiError(e.response?.data?.detail));
    } finally {
      setDispatching(false);
    }
  };

  const sendTest = async () => {
    if (!testNo.trim()) {
      toast.error("Isi nomor WhatsApp tujuan tes");
      return;
    }
    setTesting(true);
    try {
      const r = await api.post("/whatsapp/test", { to: testNo.trim() });
      toast.success(r.data.message || "Pesan tes berhasil dikirim!");
    } catch (e) {
      toast.error(apiError(e.response?.data?.detail));
    } finally {
      setTesting(false);
    }
  };

  const saveResRules = async () => {
    setSavingResRules(true);
    try {
      await api.post("/whatsapp/reservation-settings", {
        group_only_reservation: groupOnly,
        reservation_keywords: resKeywords,
        target_group_id: targetGroupId.trim(),
        reply_to_group: replyGroup,
        send_private_confirm: sendPrivate,
        reject_private_booking: rejectPrivate,
      });
      toast.success("Aturan reservasi grup & kata kunci berhasil disimpan!");
    } catch (e) {
      toast.error(apiError(e.response?.data?.detail));
    } finally {
      setSavingResRules(false);
    }
  };

  if (loading) {
    return (
      <div className="h-full grid place-items-center">
        <Loader2 className="animate-spin text-[#E63946]" />
      </div>
    );
  }

  const isConnected = hermes.state === "open" || statusState === "connected";

  return (
    <div className="h-full overflow-y-auto p-6 lg:p-8" data-testid="wa-config-page">
      <div className="max-w-3xl space-y-6">
        {/* HEADER */}
        <div>
          <h1 className="text-2xl font-extrabold flex items-center gap-2">
            <MessageCircle className="text-[#25D366]" /> Pengaturan WhatsApp Gateway
          </h1>
          <p className="text-sm text-[#52525B] mt-1">
            Kirim struk otomatis, laporan shift, dan terima perintah WhatsApp melalui Hermes Baileys
            (nomor bot terpisah) di server gudang.
          </p>
        </div>

        {/* PROVIDER */}
        <div className="bg-white rounded-2xl border p-5 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 font-black text-sm text-slate-800">
              <Sliders size={16} className="text-indigo-600" />
              Provider Gateway
            </div>
            <span className="px-2 py-0.5 rounded-md text-[10px] font-extrabold uppercase tracking-wider bg-emerald-50 border border-emerald-200 text-emerald-700">
              aktif
            </span>
          </div>
          <div className="grid grid-cols-1 bg-slate-100 p-1 rounded-xl">
            <button
              type="button"
              onClick={activateHermes}
              disabled={savingProvider}
              className="py-3 text-xs font-black rounded-lg transition duration-150 flex items-center justify-center gap-2 bg-white text-slate-900 shadow-sm border border-slate-200 disabled:opacity-60"
              data-testid="wa-provider-hermes"
            >
              {savingProvider ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
              Hermes Baileys — server gudang-644
            </button>
          </div>
          <p className="text-[11px] text-slate-500 italic leading-relaxed">
            Gateway eksklusif Grand POS: Hermes Baileys dengan nomor bot terpisah. Bridge hanya berjalan
            di server gudang (127.0.0.1); Pi tidak mengirim atau menerima WhatsApp.
          </p>
        </div>

        {/* STATUS */}
        <div
          className={`rounded-2xl border p-5 flex flex-col gap-3 transition-colors ${
            isConnected
              ? "border-[#10B981] bg-[#F0FDF4]/70"
              : "border-[#F59E0B] bg-[#FFFBEB]/70"
          }`}
          data-testid="wa-status-box"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className={`p-2.5 rounded-xl shrink-0 ${isConnected ? "bg-[#10B981]/15 text-[#10B981]" : "bg-[#F59E0B]/15 text-[#D97706]"}`}>
                {isConnected ? <CheckCircle2 size={22} /> : <KeyRound size={22} />}
              </div>
              <div>
                <div className="font-extrabold text-sm flex items-center gap-2 text-slate-900">
                  {isConnected ? "WhatsApp Gateway Aktif & Siap Digunakan" : "Gateway Menunggu Koneksi Bridge"}
                  <span className="px-2 py-0.5 rounded-md text-[10px] font-extrabold uppercase tracking-wider bg-white border border-slate-200 text-slate-700 shadow-xs">
                    Hermes Baileys (localhost / gudang-644)
                  </span>
                </div>
                <div className="text-xs text-slate-500 mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span>Node: <b className="text-slate-700">{hermes.node_id || "-"} ({hermes.node_mode})</b></span>
                  <span>·</span>
                  <span>Nomor bot: <b className="text-slate-700">{hermes.bot || "belum terhubung"}</b></span>
                  <span>·</span>
                  <span>Bridge: <span className="font-mono text-slate-700">{hermes.api_url || "belum diset"}</span></span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 self-end sm:self-center">
              <button
                onClick={checkStatus}
                disabled={statusChecking}
                className="tap h-9 px-3.5 rounded-xl bg-white border border-slate-200 font-bold text-xs inline-flex items-center gap-1.5 shadow-xs hover:bg-slate-50 text-slate-700 disabled:opacity-50"
              >
                {statusChecking ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
                Uji Koneksi &amp; Cek Sesi
              </button>
            </div>
          </div>

          <div className="text-xs pt-1 border-t border-slate-200/60 flex items-center gap-1.5">
            {isConnected ? (
              <span className="text-[#047857] flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-[#10B981] inline-block animate-pulse" />
                Layanan aktif: Struk belanja, notifikasi shift, booking meja, dan laporan otomatis akan terkirim via WhatsApp.
              </span>
            ) : (
              <span className="text-[#B45309]">
                Bridge Hermes belum terhubung. QR pairing hanya bisa diambil di server gudang (bridge = localhost).
              </span>
            )}
          </div>
        </div>

        {/* PANEL BRIDGE */}
        <div className="bg-white rounded-2xl border p-5 space-y-4" data-testid="wa-hermes-panel">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 font-black text-sm text-slate-800">
              <Zap size={16} className="text-indigo-600" />
              Bridge Hermes Baileys
            </div>
            <span className={`px-2 py-0.5 rounded-md text-[10px] font-extrabold uppercase tracking-wider border ${
              hermes.localhost_only
                ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                : "bg-amber-50 border-amber-200 text-amber-700"
            }`}>
              {hermes.localhost_only ? "localhost-only" : "perlu dikonfigurasi"}
            </span>
          </div>

          <div className="grid gap-2 text-xs text-slate-600">
            <div>Endpoint: <span className="font-mono text-slate-800">{hermes.api_url || "(kosong)"}</span></div>
            <div>Secret: <span className="font-mono text-slate-800">{hermes.secret_masked || "(belum diset)"}</span></div>
            <div>
              Perintah (allowlist per-role):{" "}
              {Object.keys(hermes.allowlist || {}).length === 0
                ? "(belum ada)"
                : Object.entries(hermes.allowlist).map(([cmd, roles]) => (
                    <span key={cmd} className="inline-block mr-2 font-mono text-slate-800">
                      {cmd} → {roles.join(",")}
                    </span>
                  ))}
            </div>
            {hermes.error && (
              <div className="text-amber-700">Catatan bridge: {hermes.error}</div>
            )}
          </div>

          <div className="rounded-xl border bg-slate-50 p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="text-xs">
              <div className="font-bold text-slate-800">Outbox WhatsApp</div>
              <div className="text-slate-500">
                {outbox.pending} pesan menunggu
                {outbox.pending > 0 && !outbox.bridge_configured && " — akan dikirim oleh server gudang setelah sinkron"}
              </div>
            </div>
            <button
              onClick={dispatchOutbox}
              disabled={dispatching}
              className="tap h-9 px-3.5 rounded-xl bg-white border border-slate-200 font-bold text-xs inline-flex items-center gap-1.5 shadow-xs hover:bg-slate-50 text-slate-700 disabled:opacity-50"
              data-testid="wa-outbox-dispatch"
            >
              {dispatching ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
              Kirim ulang outbox
            </button>
          </div>

          {!!(outbox.recent_failures || []).length && (
            <div className="text-[11px] text-slate-500">
              Kegagalan terakhir (tanpa nomor/isi pesan):{" "}
              {outbox.recent_failures.map((f, i) => (
                <span key={i} className="inline-block mr-2 font-mono">
                  {f.kind || "wa"}×{f.attempts || 0}
                </span>
              ))}
            </div>
          )}

          <p className="text-[11px] text-slate-500 italic leading-relaxed">
            Bridge Baileys memakai nomor bot terpisah, hanya berjalan di server gudang (127.0.0.1).
            Server Pi tidak mengirim/menerima WhatsApp — pesan yang gagal tersimpan di outbox dan dikirim
            sekali oleh server gudang setelah sinkron. Ganti nomor/QR di server gudang, bukan dari sini.
          </p>
        </div>

        {/* TEST SEND */}
        <div className="bg-white rounded-2xl border p-6 space-y-3">
          <div className="font-extrabold flex items-center gap-2">
            <span className="h-6 w-6 rounded-full bg-[#E63946] text-white grid place-items-center text-xs font-black">3</span>
            Langkah 3: Uji Coba Pengiriman Pesan
          </div>
          <div className="flex gap-2">
            <input
              data-testid="wa-test-input"
              value={testNo}
              onChange={(e) => setTestNo(e.target.value)}
              placeholder="08123456789 atau 628123456789"
              className="flex-1 h-11 rounded-xl border px-3 font-mono text-sm outline-none focus:border-[#E63946]"
            />
            <button
              data-testid="wa-test-send"
              onClick={sendTest}
              disabled={testing}
              className="tap h-11 px-5 rounded-xl bg-[#25D366] hover:bg-[#22C55E] text-white font-bold text-sm inline-flex items-center gap-2 disabled:opacity-50"
            >
              {testing ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
              Kirim Tes
            </button>
          </div>
          <p className="text-[11px] text-[#71717A]">
            Pesan tes dikirim dari nomor bot yang ditautkan ke bridge Hermes di server gudang.
            Bila bridge tidak aktif, pesan masuk ke outbox (tidak hilang).
          </p>
        </div>

        {/* RESERVASI KHUSUS GRUP & KATA KUNCI */}
        <div className="bg-white rounded-2xl border p-6 space-y-4 shadow-sm" data-testid="group-reservation-card">
          <div className="flex items-center justify-between flex-wrap gap-2 border-b pb-3">
            <div className="font-extrabold flex items-center gap-2 text-base text-[#0F172A]">
              <span className="h-6 w-6 rounded-full bg-[#0284C7] text-white grid place-items-center text-xs font-black">
                ★
              </span>
              Aturan Reservasi: Khusus Grup & Kata Kunci WhatsApp
            </div>
            <span
              className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${
                groupOnly
                  ? "bg-[#E0F2FE] text-[#0369A1] border-[#BAE6FD]"
                  : "bg-[#F1F5F9] text-[#64748B] border-[#CBD5E1]"
              }`}
            >
              {groupOnly ? "Hanya Grup Aktif" : "Semua Chat Diizinkan"}
            </span>
          </div>

          <div className="space-y-4 text-xs">
            <div className="flex items-center justify-between p-3.5 rounded-xl border bg-[#F8FAFC]">
              <div>
                <div className="font-bold text-sm text-[#0F172A]">Wajib Reservasi Melalui Grup WhatsApp</div>
                <p className="text-[#64748B] text-xs mt-0.5">
                  Jika aktif, booking yang masuk lewat chat pribadi (japri) akan ditolak dan diarahkan ke grup resmi agar jadwal meja transparan bagi seluruh tim.
                </p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={groupOnly}
                  onChange={(e) => setGroupOnly(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-[#CBD5E1] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#0284C7]"></div>
              </label>
            </div>

            <div className="space-y-1.5">
              <label className="font-bold text-[#0F172A] block">
                Kata Kunci Reservasi (Pisahkan dengan koma):
              </label>
              <input
                value={resKeywords}
                onChange={(e) => setResKeywords(e.target.value)}
                placeholder="#reservasi, #booking, !reservasi, reservasi"
                className="w-full h-11 rounded-xl border px-3 font-mono text-xs outline-none focus:border-[#0284C7]"
              />
              <p className="text-[11px] text-[#64748B]">
                Hanya pesan yang diawali atau mengandung kata kunci di atas yang akan diproses oleh mesin reservasi otomatis.
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="font-bold text-[#0F172A] block">
                Whitelist ID Grup WhatsApp Spesifik (Opsional):
              </label>
              <input
                value={targetGroupId}
                onChange={(e) => setTargetGroupId(e.target.value)}
                placeholder="cth: 120363024823904123@g.us (kosongkan jika berlaku untuk semua grup yang di-join)"
                className="w-full h-11 rounded-xl border px-3 font-mono text-xs outline-none focus:border-[#0284C7]"
              />
              <p className="text-[11px] text-[#64748B]">
                ID grup WhatsApp berakhiran <code className="bg-[#E2E8F0] px-1 rounded">@g.us</code>. Jika diisi, bot mengabaikan grup lain.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
              <label className="flex items-center gap-2 p-2.5 rounded-lg border bg-[#FAFAFA] cursor-pointer">
                <input
                  type="checkbox"
                  checked={replyGroup}
                  onChange={(e) => setReplyGroup(e.target.checked)}
                  className="rounded text-[#0284C7]"
                />
                <span className="text-[11px] font-medium text-[#334155]">Balas Konfirmasi di Grup</span>
              </label>
              <label className="flex items-center gap-2 p-2.5 rounded-lg border bg-[#FAFAFA] cursor-pointer">
                <input
                  type="checkbox"
                  checked={sendPrivate}
                  onChange={(e) => setSendPrivate(e.target.checked)}
                  className="rounded text-[#0284C7]"
                />
                <span className="text-[11px] font-medium text-[#334155]">Kirim Tiket ke Japri Pemesan</span>
              </label>
              <label className="flex items-center gap-2 p-2.5 rounded-lg border bg-[#FAFAFA] cursor-pointer">
                <input
                  type="checkbox"
                  checked={rejectPrivate}
                  onChange={(e) => setRejectPrivate(e.target.checked)}
                  className="rounded text-[#0284C7]"
                />
                <span className="text-[11px] font-medium text-[#334155]">Tolak Ramah Chat Japri</span>
              </label>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={saveResRules}
                disabled={savingResRules}
                className="tap h-11 px-6 rounded-xl bg-[#0284C7] hover:bg-[#0369A1] text-white font-bold text-xs flex items-center gap-2 shadow-sm disabled:opacity-50"
              >
                {savingResRules ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                Simpan Aturan Reservasi Grup
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
