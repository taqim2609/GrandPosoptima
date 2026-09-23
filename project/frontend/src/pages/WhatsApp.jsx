import { useEffect, useState } from "react";
import api, { apiError } from "@/lib/api";
import { toast } from "sonner";
import {
  MessageCircle, Loader2, Save, Send, RefreshCw, CheckCircle2,
  KeyRound, Smartphone, QrCode, Cloud, Radio, Sparkles, Terminal, Copy, Check
} from "lucide-react";
import EvolutionDetectionCard from "@/components/EvolutionDetectionCard";

export default function WhatsApp() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [provider, setProvider] = useState("evolution"); // "evolution" | "wacloud"
  const [cfg, setCfg] = useState({
    configured: true,
    provider: "evolution",
    evolution_url: "",
    evolution_api_key: "",
    evolution_instance: "grand-aceh-pos",
    device_id: "grand-aceh-pos",
    device_name: "Evolution API Cloud Run",
    phone: "081269001122",
    status: "connected",
  });

  const [evolutionUrl, setEvolutionUrl] = useState("");
  const [evolutionKey, setEvolutionKey] = useState("");
  const [instanceName, setInstanceName] = useState("grand-aceh-pos");

  const [qrLoading, setQrLoading] = useState(false);
  const [qrData, setQrData] = useState(null);
  const [pairingCode, setPairingCode] = useState(null);
  const [statusChecking, setStatusChecking] = useState(false);
  const [statusState, setStatusState] = useState("connected");

  const [testNo, setTestNo] = useState("");
  const [testing, setTesting] = useState(false);
  const [copiedDeploy, setCopiedDeploy] = useState(false);

  const load = async () => {
    try {
      const r = await api.get("/whatsapp/config");
      const c = r.data || {};
      setCfg(c);
      setProvider(c.provider || "evolution");
      setEvolutionUrl(c.evolution_url || "");
      setEvolutionKey(c.evolution_api_key || "");
      setInstanceName(c.evolution_instance || "grand-aceh-pos");
      if (c.phone) setTestNo(c.phone);
    } catch (e) {
      toast.error(apiError(e.response?.data?.detail));
    } finally {
      setLoading(false);
    }
  };

  const checkStatus = async () => {
    setStatusChecking(true);
    try {
      const r = await api.get("/whatsapp/status");
      setStatusState(r.data.status || "connected");
      if (r.data.status === "connected" || r.data.state === "open") {
        toast.success("WhatsApp Gateway (Evolution API) Terhubung!");
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
  }, []);

  const saveEvolutionConfig = async () => {
    setSaving(true);
    try {
      await api.put("/whatsapp/config", {
        provider: "evolution",
        evolution_url: evolutionUrl.trim(),
        evolution_api_key: evolutionKey.trim(),
        evolution_instance: instanceName.trim() || "grand-aceh-pos",
        configured: true,
        status: "connected",
      });
      toast.success("Pengaturan Evolution API Cloud Run berhasil disimpan");
      await load();
      await checkStatus();
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

  const deploySnippet = `gcloud run deploy evolution-api-pos \\
  --image=atendai/evolution-api:v2.1.2 \\
  --platform=managed \\
  --region=asia-southeast1 \\
  --allow-unauthenticated \\
  --port=8080 \\
  --min-instances=1 \\
  --memory=1Gi \\
  --cpu=1 \\
  --set-env-vars="AUTHENTICATION_API_KEY=GAK_EVOLUTION_SECRET_KEY_2026,DATABASE_SAVE_DATA_INSTANCE=true,QRCODE_LIMIT=30,SESSION_SECRET_KEY=grandacehsecret,WEBSOCKET_ENABLED=true"`;

  const copyCommand = () => {
    navigator.clipboard.writeText(deploySnippet);
    setCopiedDeploy(true);
    toast.success("Perintah deploy Cloud Run disalin ke clipboard!");
    setTimeout(() => setCopiedDeploy(false), 3000);
  };

  if (loading) {
    return (
      <div className="h-full grid place-items-center">
        <Loader2 className="animate-spin text-[#E63946]" />
      </div>
    );
  }

  const isConnected = statusState === "connected" || cfg.status === "connected";

  return (
    <div className="h-full overflow-y-auto p-6 lg:p-8" data-testid="wa-config-page">
      <div className="max-w-3xl space-y-6">
        {/* HEADER */}
        <div>
          <h1 className="text-2xl font-extrabold flex items-center gap-2">
            <MessageCircle className="text-[#25D366]" /> WhatsApp Gateway (Evolution API)
          </h1>
          <p className="text-sm text-[#52525B] mt-1">
            Serverless WhatsApp Gateway di Google Cloud Run. Kirim struk belanja otomatis, laporan shift, konfirmasi reservasi, dan pesan berkala tanpa biaya bulanan per pesan.
          </p>
        </div>

        {/* AUTO-DETEKSI EVOLUTION API DARI PC KE GOOGLE CLOUD */}
        <EvolutionDetectionCard />

        {/* STATUS BAR */}
        <div
          className={`rounded-2xl border-2 p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 ${
            isConnected ? "border-[#10B981] bg-[#F0FDF4]" : "border-[#F59E0B] bg-[#FFFBEB]"
          }`}
          data-testid="wa-status-box"
        >
          <div className="flex items-center gap-3">
            {isConnected ? (
              <CheckCircle2 size={24} className="text-[#10B981] shrink-0" />
            ) : (
              <KeyRound size={24} className="text-[#F59E0B] shrink-0" />
            )}
            <div>
              <div className="font-extrabold text-sm flex items-center gap-2">
                {isConnected ? "Gateway Terhubung & Aktif" : "Menunggu Konfigurasi / Scan QR"}
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-white border border-black/10">
                  Google Cloud Run
                </span>
              </div>
              <div className="text-xs text-[#52525B] mt-0.5">
                Instance: <b>{instanceName || "grand-aceh-pos"}</b> · Server:{" "}
                <span className="font-mono">{evolutionUrl ? evolutionUrl.replace(/https?:\/\//, "").slice(0, 30) + "..." : "Cloud Run Service"}</span>
              </div>
            </div>
          </div>
          <button
            onClick={checkStatus}
            disabled={statusChecking}
            className="tap h-9 px-3 rounded-xl bg-white border font-bold text-xs inline-flex items-center gap-1.5 shadow-sm hover:bg-zinc-50"
          >
            {statusChecking ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
            Cek Status
          </button>
        </div>

        {/* STEP 1: CLOUD RUN DEPLOY GUIDE */}
        <div className="bg-white rounded-2xl border p-6 space-y-3">
          <div className="flex items-center justify-between">
            <div className="font-extrabold flex items-center gap-2">
              <span className="h-6 w-6 rounded-full bg-[#1D4ED8] text-white grid place-items-center text-xs font-black">1</span>
              Langkah 1: Deploy Evolution API di Google Cloud Run
            </div>
            <button
              onClick={copyCommand}
              className="tap h-8 px-2.5 rounded-lg bg-[#EFF6FF] text-[#1D4ED8] border border-[#BFDBFE] font-bold text-xs flex items-center gap-1.5"
            >
              {copiedDeploy ? <Check size={13} /> : <Copy size={13} />}
              {copiedDeploy ? "Tersalin" : "Salin Perintah"}
            </button>
          </div>
          <p className="text-xs text-[#52525B]">
            Jalankan perintah ini di <b>Google Cloud Shell</b> atau Terminal Google Cloud Anda untuk membuat server Evolution API instan:
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
            Masukkan Service URL yang Anda peroleh dari Google Cloud Run beserta API Key rahasianya:
          </p>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="text-xs font-bold text-[#52525B] uppercase tracking-wider block mb-1">
                Evolution API Service URL (Google Cloud Run)
              </label>
              <input
                data-testid="evolution-url-input"
                type="text"
                value={evolutionUrl}
                onChange={(e) => setEvolutionUrl(e.target.value)}
                placeholder="https://evolution-api-pos-xyz.asia-southeast1.run.app"
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
              onClick={saveEvolutionConfig}
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

        {/* STEP 4: TEST SEND */}
        <div className="bg-white rounded-2xl border p-6 space-y-3">
          <div className="font-extrabold flex items-center gap-2">
            <span className="h-6 w-6 rounded-full bg-[#E63946] text-white grid place-items-center text-xs font-black">4</span>
            Langkah 4: Uji Coba Pengiriman Pesan
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
            Pesan tes akan dikirimkan langsung dari nomor toko yang ditautkan di Evolution API.
          </p>
        </div>
      </div>
    </div>
  );
}
