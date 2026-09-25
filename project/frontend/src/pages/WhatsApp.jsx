import { useEffect, useState } from "react";
import api, { apiError } from "@/lib/api";
import { toast } from "sonner";
import {
  MessageCircle, Loader2, Save, Send, RefreshCw, CheckCircle2,
  KeyRound, Smartphone, QrCode, Cloud, Radio, Sparkles, Terminal, Copy, Check, Server, Sliders,
  ShieldCheck, ShieldAlert, Zap, AlertTriangle, ArrowRightLeft
} from "lucide-react";
import { Button } from "@/components/ui/button";

export default function WhatsApp() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [provider, setProvider] = useState("evolution"); // "evolution" | "wacloud"
  const [autoFailover, setAutoFailover] = useState(true);
  const [cfg, setCfg] = useState({
    configured: false,
    provider: "evolution",
    auto_failover: true,
    wacloud_configured: false,
    evolution_url: "",
    evolution_api_key: "",
    evolution_instance: "grand-aceh-pos",
    api_key: "",
    base_url: "https://app.wacloud.id/api/v1",
    device_id: "",
    device_name: "",
    phone: "",
    status: "disconnected",
  });

  // State inputs for Evolution API
  const [evolutionUrl, setEvolutionUrl] = useState("");
  const [evolutionKey, setEvolutionKey] = useState("");
  const [instanceName, setInstanceName] = useState("grand-aceh-pos");

  // State inputs for WACloud
  const [waCloudKey, setWaCloudKey] = useState("");
  const [waCloudBase, setWaCloudBase] = useState("https://app.wacloud.id/api/v1");
  const [waCloudDeviceId, setWaCloudDeviceId] = useState("");
  const [waCloudDeviceName, setWaCloudDeviceName] = useState("");
  const [devicesList, setDevicesList] = useState([]);
  const [loadingDevices, setLoadingDevices] = useState(false);
  const [showFailoverConfig, setShowFailoverConfig] = useState(false);

  // QR & Pairing for Evolution API
  const [qrLoading, setQrLoading] = useState(false);
  const [qrData, setQrData] = useState(null);
  const [pairingCode, setPairingCode] = useState(null);
  const [statusChecking, setStatusChecking] = useState(false);
  const [statusState, setStatusState] = useState("disconnected");

  // General testing
  const [testNo, setTestNo] = useState("");
  const [testing, setTesting] = useState(false);
  const [copiedDeploy, setCopiedDeploy] = useState(false);

  // Group reservation rules state
  const [groupOnly, setGroupOnly] = useState(true);
  const [resKeywords, setResKeywords] = useState("#reservasi, #booking, !reservasi, reservasi");
  const [targetGroupId, setTargetGroupId] = useState("");
  const [replyGroup, setReplyGroup] = useState(true);
  const [sendPrivate, setSendPrivate] = useState(true);
  const [rejectPrivate, setRejectPrivate] = useState(true);
  const [savingResRules, setSavingResRules] = useState(false);

  const load = async () => {
    try {
      const r = await api.get("/whatsapp/config");
      const c = r.data || {};
      setCfg(c);
      const prov = c.provider || "evolution";
      setProvider(prov);
      setAutoFailover(c.auto_failover !== false);

      setGroupOnly(c.group_only_reservation !== false);
      setResKeywords(c.reservation_keywords || "#reservasi, #booking, !reservasi, reservasi");
      setTargetGroupId(c.target_group_id || "");
      setReplyGroup(c.reply_to_group !== false);
      setSendPrivate(c.send_private_confirm !== false);
      setRejectPrivate(c.reject_private_booking !== false);
      
      // Load Evolution inputs
      setEvolutionUrl(c.evolution_url || "");
      setEvolutionKey(c.evolution_api_key || "");
      setInstanceName(c.evolution_instance || "grand-aceh-pos");
      
      // Load WACloud inputs
      setWaCloudKey(c.api_key || "");
      setWaCloudBase(c.base_url || "https://app.wacloud.id/api/v1");
      setWaCloudDeviceId(c.device_id || "");
      setWaCloudDeviceName(c.device_name || "");
      
      if (c.phone) {
        setTestNo(c.phone);
      }
      setStatusState(c.status || "disconnected");
      
      // If api_key exists, fetch devices list to make failover dropdown ready
      if (c.api_key) {
        fetchDevices(c.api_key, c.base_url);
      }
    } catch (e) {
      toast.error(apiError(e.response?.data?.detail));
    } finally {
      setLoading(false);
    }
  };

  const fetchDevices = async (apiKey = waCloudKey, baseUrl = waCloudBase) => {
    if (!apiKey) return;
    setLoadingDevices(true);
    try {
      await api.put("/whatsapp/config", {
        api_key: apiKey.trim(),
        base_url: baseUrl.trim()
      });
      const r = await api.get("/whatsapp/devices");
      setDevicesList(r.data.devices || []);
    } catch (e) {
      console.error("Gagal memuat daftar device WACloud", e);
    } finally {
      setLoadingDevices(false);
    }
  };

  const checkStatus = async () => {
    setStatusChecking(true);
    try {
      const r = await api.get("/whatsapp/status");
      setStatusState(r.data.status || "connected");
      if (r.data.status === "connected" || r.data.state === "open") {
        toast.success(`WhatsApp Gateway (${provider === "evolution" ? "Evolution" : "WACloud"}) Terhubung!`);
      } else {
        toast.info(`Status Gateway: ${r.data.state || r.data.status}`);
      }
    } catch (e) {
      toast.error("Gagal memeriksa status koneksi");
    } finally {
      setStatusChecking(false);
    }
  };

  const fetchQrCode = async () => {
    setQrLoading(true);
    try {
      const r = await api.post("/whatsapp/instance/create", {
        evolution_url: evolutionUrl,
        evolution_api_key: evolutionKey,
        instance_name: instanceName,
      });
      if (r.data.qrcode) {
        setQrData(r.data.qrcode);
        setPairingCode(r.data.pairingCode);
        toast.success("QR Code siap di-scan dengan nomor WhatsApp Toko");
      } else {
        toast.info("Instance siap atau sudah terhubung");
      }
    } catch (e) {
      toast.error("Gagal memuat QR Code dari Evolution API");
    } finally {
      setQrLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const saveConfig = async (overrideFailover = autoFailover) => {
    setSaving(true);
    try {
      const selectedDev = devicesList.find(d => String(d.id) === String(waCloudDeviceId));
      const devName = selectedDev ? selectedDev.name : waCloudDeviceName;

      await api.put("/whatsapp/config", {
        provider,
        auto_failover: overrideFailover,
        evolution_url: evolutionUrl.trim(),
        evolution_api_key: evolutionKey.trim(),
        evolution_instance: instanceName.trim() || "grand-aceh-pos",
        api_key: waCloudKey.trim(),
        base_url: waCloudBase.trim(),
        device_id: waCloudDeviceId.trim(),
        device_name: devName || "Device WACloud",
        status: "connected",
      });
      toast.success(
        provider === "evolution"
          ? "Pengaturan Evolution API & Failover WACloud berhasil disimpan"
          : "Pengaturan WACloud.id berhasil disimpan"
      );
      await load();
    } catch (e) {
      toast.error(apiError(e.response?.data?.detail));
    } finally {
      setSaving(false);
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

  const deploySnippet = `version: "3.8"
services:
  evolution-api:
    image: atendai/evolution-api:v2.1.2
    container_name: evolution-api
    ports:
      - "8080:8080"
    environment:
      - AUTHENTICATION_API_KEY=GAK_EVOLUTION_SECRET_KEY_2026
      - DATABASE_SAVE_DATA_INSTANCE=true
      - QRCODE_LIMIT=30
      - SESSION_SECRET_KEY=grandacehsecret
      - WEBSOCKET_ENABLED=true
    restart: always`;

  const copyCommand = () => {
    navigator.clipboard.writeText(deploySnippet);
    setCopiedDeploy(true);
    toast.success("Konfigurasi Docker Compose disalin ke clipboard!");
    setTimeout(() => setCopiedDeploy(false), 3000);
  };

  if (loading) {
    return (
      <div className="h-full grid place-items-center">
        <Loader2 className="animate-spin text-[#E63946]" />
      </div>
    );
  }

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

  const isConnected = statusState === "connected" || cfg.status === "connected";

  return (
    <div className="h-full overflow-y-auto p-6 lg:p-8" data-testid="wa-config-page">
      <div className="max-w-3xl space-y-6">
        {/* HEADER */}
        <div>
          <h1 className="text-2xl font-extrabold flex items-center gap-2">
            <MessageCircle className="text-[#25D366]" /> Pengaturan WhatsApp Gateway
          </h1>
          <p className="text-sm text-[#52525B] mt-1">
            Kirim struk otomatis, laporan shift kasir, and notifikasi berkala harian menggunakan pilihan penyedia gateway lokal atau cloud.
          </p>
        </div>

        {/* PROVIDER SWITCH */}
        <div className="bg-white rounded-2xl border p-5 space-y-4">
          <div className="flex items-center gap-2 font-black text-sm text-slate-800">
            <Sliders size={16} className="text-indigo-600" />
            Pilih Provider WhatsApp Gateway
          </div>
          <div className="grid grid-cols-2 gap-2 bg-slate-100 p-1 rounded-xl">
            <button
              onClick={() => setProvider("evolution")}
              className={`py-3 text-xs font-black rounded-lg transition duration-150 flex items-center justify-center gap-2 ${
                provider === "evolution"
                  ? "bg-white text-slate-900 shadow-sm border border-slate-200"
                  : "text-slate-500 hover:text-slate-800"
              }`}
            >
              <Server size={14} />
              Evolution API (PC Server Lokal)
            </button>
            <button
              onClick={() => setProvider("wacloud")}
              className={`py-3 text-xs font-black rounded-lg transition duration-150 flex items-center justify-center gap-2 ${
                provider === "wacloud"
                  ? "bg-white text-slate-900 shadow-sm border border-slate-200"
                  : "text-slate-500 hover:text-slate-800"
              }`}
            >
              <Cloud size={14} />
              WACloud.id (SaaS Cloud API)
            </button>
          </div>
          <p className="text-[11px] text-slate-500 italic leading-relaxed">
            {provider === "evolution"
              ? "Sangat direkomendasikan untuk menekan biaya operasional. Menggunakan nomor WhatsApp pribadi Anda lewat server lokal yang terpasang di toko."
              : "Solusi enterprise berbasis Cloud. Menggunakan layanan wacloud.id tanpa perlu menyalakan komputer server lokal secara terus menerus."}
          </p>
        </div>

        {/* UNIFIED STATUS CARD */}
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
                  {isConnected ? "WhatsApp Gateway Aktif & Siap Digunakan" : "Gateway Menunggu Konfigurasi"}
                  <span className="px-2 py-0.5 rounded-md text-[10px] font-extrabold uppercase tracking-wider bg-white border border-slate-200 text-slate-700 shadow-xs">
                    {provider === "evolution" ? "Evolution API (Lokal)" : "WACloud (Cloud)"}
                  </span>
                </div>
                <div className="text-xs text-slate-500 mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                  {provider === "evolution" ? (
                    <>
                      <span>Instance: <b className="text-slate-700">{instanceName || "grand-aceh-pos"}</b></span>
                      <span>·</span>
                      <span>URL: <span className="font-mono text-slate-700">{evolutionUrl || "http://localhost:8080"}</span></span>
                    </>
                  ) : (
                    <>
                      <span>Device: <b className="text-slate-700">{waCloudDeviceName || waCloudDeviceId || "Belum dipilih"}</b></span>
                      <span>·</span>
                      <span>Endpoint: <span className="font-mono text-slate-700">{waCloudBase}</span></span>
                    </>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 self-end sm:self-center">
              <button
                onClick={checkStatus}
                disabled={statusChecking}
                className="tap h-9 px-3.5 rounded-xl bg-white border border-slate-200 font-bold text-xs inline-flex items-center gap-1.5 shadow-xs hover:bg-slate-50 text-slate-700"
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
                {provider === "evolution"
                  ? "Pastikan container Docker Evolution API di PC Server lokal Anda sudah dijalankan dan scan QR Code di bawah."
                  : "Masukkan API Key WACloud Anda dan pilih device aktif untuk menghubungkan gateway."}
              </span>
            )}
          </div>
        </div>

        {/* SMART AUTO-FAILOVER TO WACLOUD CARD */}
        <div className="bg-gradient-to-br from-amber-50/70 via-white to-orange-50/60 rounded-2xl border border-amber-200/90 p-5 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="p-2.5 rounded-xl bg-amber-500/15 text-amber-700 shrink-0 mt-0.5">
                <ArrowRightLeft size={22} />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-sm font-black text-slate-900">
                    Auto-Failover ke WACloud (Jika Server PC Kasir Mati)
                  </h3>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-extrabold uppercase tracking-wide border ${
                    autoFailover && waCloudKey && waCloudDeviceId
                      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                      : autoFailover
                      ? "bg-amber-50 text-amber-700 border-amber-200"
                      : "bg-slate-100 text-slate-600 border-slate-200"
                  }`}>
                    {autoFailover && waCloudKey && waCloudDeviceId
                      ? "✅ Siaga Aktif (Failover Ready)"
                      : autoFailover
                      ? "⚠️ Perlu Kredensial WACloud"
                      : "Nonaktif"}
                  </span>
                </div>
                <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                  Jika PC Master kasir di restoran mati, listrik padam, atau port 8080 Evolution API terputus, sistem <b>secara otomatis</b> mengalihkan pengiriman konfirmasi <b>Reservasi Meja &amp; Struk Digital</b> ke WACloud.id. Tidak ada pesan ke pelanggan yang gagal terkirim.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 self-start sm:self-center shrink-0">
              <label className="flex items-center gap-2 cursor-pointer bg-white px-3 py-1.5 rounded-xl border border-amber-200 shadow-2xs">
                <input
                  type="checkbox"
                  checked={autoFailover}
                  onChange={(e) => {
                    const val = e.target.checked;
                    setAutoFailover(val);
                    saveConfig(val);
                  }}
                  className="rounded text-amber-600 focus:ring-amber-500 h-4 w-4"
                />
                <span className="text-xs font-bold text-slate-800">
                  {autoFailover ? "Auto-Failover Aktif" : "Auto-Failover Mati"}
                </span>
              </label>
            </div>
          </div>

          {/* Failover Status Info & Quick Settings */}
          <div className="bg-white/90 rounded-xl border border-amber-200/80 p-3.5 text-xs space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2 text-slate-700">
                <ShieldCheck size={16} className={waCloudKey && waCloudDeviceId ? "text-emerald-600" : "text-amber-500"} />
                <span className="font-bold">
                  {waCloudKey && waCloudDeviceId
                    ? `Device Cadangan Siaga: ${waCloudDeviceName || waCloudDeviceId} (wacloud.id)`
                    : "Kredensial akun cadangan WACloud belum disimpan lengkap"}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setShowFailoverConfig(!showFailoverConfig)}
                className="text-xs font-extrabold text-amber-700 hover:text-amber-800 underline flex items-center gap-1 cursor-pointer"
              >
                {showFailoverConfig ? "Tutup Form Kredensial Cadangan" : "Atur / Ubah Kredensial WACloud Cadangan"}
              </button>
            </div>

            {/* Collapsible/Expandable Credential Inputs for Failover */}
            {(showFailoverConfig || !waCloudKey || !waCloudDeviceId) && (
              <div className="pt-3 border-t border-slate-100 grid gap-3 sm:grid-cols-2 bg-amber-50/40 p-3 rounded-lg">
                <div className="sm:col-span-2">
                  <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block mb-1">
                    API Key WACloud Cadangan
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="password"
                      value={waCloudKey}
                      onChange={(e) => setWaCloudKey(e.target.value)}
                      placeholder="Masukkan API Key wacloud.id untuk cadangan failover"
                      className="flex-1 h-9 rounded-lg border px-3 font-mono text-xs bg-white outline-none focus:border-amber-500"
                    />
                    <Button
                      variant="outline"
                      className="h-9 rounded-lg border font-bold text-xs px-3 bg-white"
                      onClick={() => fetchDevices(waCloudKey, waCloudBase)}
                      disabled={loadingDevices || !waCloudKey}
                    >
                      {loadingDevices ? <Loader2 className="animate-spin h-3 w-3" /> : "Muat Device"}
                    </Button>
                  </div>
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block mb-1">
                    Pilih Device WACloud Cadangan
                  </label>
                  {devicesList.length > 0 ? (
                    <select
                      value={waCloudDeviceId}
                      onChange={(e) => {
                        setWaCloudDeviceId(e.target.value);
                        const matched = devicesList.find(d => String(d.id) === String(e.target.value));
                        if (matched) setWaCloudDeviceName(matched.name);
                      }}
                      className="w-full h-9 rounded-lg border px-3 font-bold text-xs bg-white outline-none focus:border-amber-500"
                    >
                      <option value="">-- Pilih Device Cadangan --</option>
                      {devicesList.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name} ({d.sender_number || "No. WA"}) - {d.status || "online"}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      value={waCloudDeviceId}
                      onChange={(e) => setWaCloudDeviceId(e.target.value)}
                      placeholder="ID Device WACloud (Contoh: 12345)"
                      className="w-full h-9 rounded-lg border px-3 font-mono text-xs bg-white outline-none focus:border-amber-500"
                    />
                  )}
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block mb-1">
                    Base URL WACloud
                  </label>
                  <input
                    type="text"
                    value={waCloudBase}
                    onChange={(e) => setWaCloudBase(e.target.value)}
                    placeholder="https://app.wacloud.id/api/v1"
                    className="w-full h-9 rounded-lg border px-3 font-mono text-xs bg-white outline-none focus:border-amber-500"
                  />
                </div>

                <div className="sm:col-span-2 flex items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => saveConfig(autoFailover)}
                    disabled={saving}
                    className="tap h-9 px-4 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs inline-flex items-center gap-1.5 shadow-2xs disabled:opacity-50"
                  >
                    {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
                    Simpan Cadangan Failover
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* EVOLUTION CONFIGURATION PANELS */}
        {provider === "evolution" && (
          <>
            {/* STEP 1: DOCKER COMPOSE LOCAL PC GUIDE */}
            <div className="bg-white rounded-2xl border p-6 space-y-3">
              <div className="flex items-center justify-between">
                <div className="font-extrabold flex items-center gap-2">
                  <span className="h-6 w-6 rounded-full bg-[#1D4ED8] text-white grid place-items-center text-xs font-black">1</span>
                  Langkah 1: Jalankan Evolution API di PC Server Lokal (Docker Compose)
                </div>
                <button
                  onClick={copyCommand}
                  className="tap h-8 px-2.5 rounded-lg bg-[#EFF6FF] text-[#1D4ED8] border border-[#BFDBFE] font-bold text-xs flex items-center gap-1.5"
                >
                  {copiedDeploy ? <Check size={13} /> : <Copy size={13} />}
                  {copiedDeploy ? "Tersalin" : "Salin Konfigurasi"}
                </button>
              </div>
              <p className="text-xs text-[#52525B]">
                Salin konfigurasi di bawah ini ke berkas <b>docker-compose.yml</b> di PC Server Anda, lalu jalankan perintah <code>docker compose up -d</code>:
              </p>
              <div className="bg-[#0F172A] text-[#F8FAFC] p-3.5 rounded-xl font-mono text-[11px] overflow-x-auto border border-zinc-800 relative">
                <pre className="whitespace-pre">{deploySnippet}</pre>
              </div>
            </div>

            {/* STEP 2: EVOLUTION CONFIGURATION */}
            <div className="bg-white rounded-2xl border p-6 space-y-4">
              <div className="font-extrabold flex items-center gap-2">
                <span className="h-6 w-6 rounded-full bg-[#E63946] text-white grid place-items-center text-xs font-black">2</span>
                Langkah 2: Hubungkan URL &amp; API Key ke POS
              </div>
              <p className="text-xs text-[#52525B]">
                Masukkan Service URL yang berjalan di PC Server / Raspberry Pi lokal beserta API Key rahasianya:
              </p>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className="text-xs font-bold text-[#52525B] uppercase tracking-wider block mb-1">
                    Evolution API Service URL (PC Server / Local IP)
                  </label>
                  <input
                    data-testid="evolution-url-input"
                    type="text"
                    value={evolutionUrl}
                    onChange={(e) => setEvolutionUrl(e.target.value)}
                    placeholder="http://localhost:8080"
                    className="w-full h-11 rounded-xl border px-3 font-mono text-xs outline-none focus:border-[#E63946]"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-[#52525B] uppercase tracking-wider block mb-1">
                    Global API Key
                  </label>
                  <input
                    data-testid="evolution-key-input"
                    type="password"
                    value={evolutionKey}
                    onChange={(e) => setEvolutionKey(e.target.value)}
                    placeholder="GAK_EVOLUTION_SECRET_KEY_2026"
                    className="w-full h-11 rounded-xl border px-3 font-mono text-xs outline-none focus:border-[#E63946]"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-[#52525B] uppercase tracking-wider block mb-1">
                    Nama Instance WhatsApp
                  </label>
                  <input
                    data-testid="evolution-instance-input"
                    type="text"
                    value={instanceName}
                    onChange={(e) => setInstanceName(e.target.value)}
                    placeholder="grand-aceh-pos"
                    className="w-full h-11 rounded-xl border px-3 font-mono text-xs outline-none focus:border-[#E63946]"
                  />
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  data-testid="save-evolution-btn"
                  onClick={saveConfig}
                  disabled={saving}
                  className="tap h-11 px-5 rounded-xl bg-[#0A0A0A] text-white font-bold text-sm inline-flex items-center gap-2 disabled:opacity-50"
                >
                  {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                  Simpan Konfigurasi
                </button>
              </div>
            </div>

            {/* STEP 3: SCAN QR CODE */}
            <div className="bg-white rounded-2xl border p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div className="font-extrabold flex items-center gap-2">
                  <span className="h-6 w-6 rounded-full bg-[#16A34A] text-white grid place-items-center text-xs font-black">3</span>
                  Langkah 3: Scan QR Code WhatsApp Toko
                </div>
                <button
                  onClick={fetchQrCode}
                  disabled={qrLoading}
                  className="tap h-9 px-3 rounded-xl bg-[#F0FDF4] text-[#16A34A] border border-[#BBF7D0] font-bold text-xs inline-flex items-center gap-1.5"
                >
                  {qrLoading ? <Loader2 size={13} className="animate-spin" /> : <QrCode size={13} />}
                  Generate / Muat QR Code
                </button>
              </div>

              <p className="text-xs text-[#52525B]">
                Buka aplikasi WhatsApp di HP kasir/toko &rarr; Menu Titik Tiga / Pengaturan &rarr; <b>Perangkat Tertaut (Linked Devices)</b> &rarr; <b>Tautkan Perangkat</b> lalu scan QR di bawah ini:
              </p>

              <div className="flex flex-col sm:flex-row items-center gap-6 p-4 rounded-xl bg-zinc-50 border">
                <div className="h-44 w-44 bg-white rounded-xl border-2 border-dashed border-zinc-300 flex flex-col items-center justify-center p-2 shrink-0">
                  {qrData ? (
                    <img
                      src={qrData.startsWith("data:") ? qrData : `data:image/png;base64,${qrData}`}
                      alt="WhatsApp QR Code"
                      className="h-full w-full object-contain"
                    />
                  ) : (
                    <div className="text-center p-3">
                      <QrCode size={36} className="text-zinc-300 mx-auto mb-2" />
                      <span className="text-[11px] text-[#71717A] font-semibold block leading-tight">
                        Klik tombol "Generate QR" untuk memindai
                      </span>
                    </div>
                  )}
                </div>

                <div className="space-y-2 text-xs text-[#52525B]">
                  <div className="font-bold text-zinc-900 flex items-center gap-1.5">
                    <Smartphone size={16} className="text-[#16A34A]" />
                    Koneksi Multi-Device Berkelanjutan
                  </div>
                  <p>
                    Setelah di-scan, nomor WhatsApp kasir akan otomatis terhubung ke sistem Cloud Run. Server Evolution API akan mempertahankan sesi tanpa perlu scan ulang.
                  </p>
                  {pairingCode && (
                    <div className="p-2 bg-white rounded-lg border font-mono text-[11px]">
                      Kode Pairing Manual: <span className="font-bold text-[#1D4ED8]">{pairingCode}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </>
        )}

        {/* WACLOUD CONFIGURATION PANELS */}
        {provider === "wacloud" && (
          <div className="bg-white rounded-2xl border p-6 space-y-4">
            <div className="font-extrabold flex items-center gap-2">
              <Cloud className="text-[#3B82F6]" />
              Pengaturan Gateway WACloud.id
            </div>
            <p className="text-xs text-[#52525B]">
              Masukkan detail kredensial akun wacloud.id Anda untuk mengaktifkan pengiriman cloud:
            </p>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="text-xs font-bold text-[#52525B] uppercase tracking-wider block mb-1">
                  API Key WACloud
                </label>
                <div className="flex gap-2">
                  <input
                    type="password"
                    value={waCloudKey}
                    onChange={(e) => setWaCloudKey(e.target.value)}
                    placeholder="Masukkan API Key wacloud.id Anda"
                    className="flex-1 h-11 rounded-xl border px-3 font-mono text-xs outline-none focus:border-[#E63946]"
                  />
                  <Button
                    variant="outline"
                    className="h-11 rounded-xl border font-bold text-xs px-4"
                    onClick={() => fetchDevices(waCloudKey, waCloudBase)}
                    disabled={loadingDevices || !waCloudKey}
                  >
                    {loadingDevices ? <Loader2 className="animate-spin h-3 w-3" /> : "Muat Device"}
                  </Button>
                </div>
              </div>

              <div className="sm:col-span-2">
                <label className="text-xs font-bold text-[#52525B] uppercase tracking-wider block mb-1">
                  Base URL API
                </label>
                <input
                  type="text"
                  value={waCloudBase}
                  onChange={(e) => setWaCloudBase(e.target.value)}
                  placeholder="https://app.wacloud.id/api/v1"
                  className="w-full h-11 rounded-xl border px-3 font-mono text-xs outline-none focus:border-[#E63946]"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="text-xs font-bold text-[#52525B] uppercase tracking-wider block mb-1">
                  Pilih Device Terhubung
                </label>
                {devicesList.length > 0 ? (
                  <select
                    value={waCloudDeviceId}
                    onChange={(e) => {
                      setWaCloudDeviceId(e.target.value);
                      const matched = devicesList.find(d => String(d.id) === String(e.target.value));
                      if (matched) setWaCloudDeviceName(matched.name);
                    }}
                    className="w-full h-11 rounded-xl border px-3 font-bold text-xs bg-white outline-none focus:border-[#E63946]"
                  >
                    <option value="">-- Pilih Device Anda --</option>
                    {devicesList.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name} ({d.sender_number || "Tidak Ada Nomor"}) - {d.status || "offline"}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="p-3 border border-dashed rounded-xl bg-slate-50 text-center text-xs text-slate-400">
                    Belum ada device dimuat. Pastikan API Key di atas benar dan klik "Muat Device".
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={saveConfig}
                disabled={saving}
                className="tap h-11 px-5 rounded-xl bg-[#0A0A0A] text-white font-bold text-sm inline-flex items-center gap-2 disabled:opacity-50"
              >
                {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                Simpan Konfigurasi WACloud
              </button>
            </div>
          </div>
        )}

        {/* STEP 4: TEST SEND */}
        <div className="bg-white rounded-2xl border p-6 space-y-3">
          <div className="font-extrabold flex items-center gap-2">
            <span className="h-6 w-6 rounded-full bg-[#E63946] text-white grid place-items-center text-xs font-black">
              {provider === "evolution" ? "4" : "3"}
            </span>
            Langkah {provider === "evolution" ? "4" : "3"}: Uji Coba Pengiriman Pesan
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
            Pesan tes akan dikirimkan langsung dari nomor toko yang ditautkan di {provider === "evolution" ? "Evolution API" : "WACloud.id"}.
          </p>
        </div>

        {/* STEP 5: RESERVASI KHUSUS GRUP & KATA KUNCI */}
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
