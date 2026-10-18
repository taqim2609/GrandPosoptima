import React, { useState, useEffect, useCallback } from "react";
import { Server, Wifi, Globe, AlertCircle, RefreshCw, CheckCircle2, ChevronDown, ChevronUp, Radio } from "lucide-react";
import { getServerUrl, setServerUrl, probeServer } from "@/lib/api";
import { toast } from "sonner";

export default function LoginServerSelector({ loginFailedServer, onServerChanged }) {
  const [selectedServer, setSelectedServer] = useState("");
  const [customInput, setCustomInput] = useState("");
  const [showCustom, setShowCustom] = useState(false);
  const [probeStatus, setProbeStatus] = useState({ state: "idle", latency: null, text: "" });
  const [probing, setProbing] = useState(false);

  // Daftar Node Standar Dual-Node (Pi LAN & VPS Tailscale)
  const NODE_OPTIONS = [
    {
      id: "pi_lan",
      url: "http://pos.local:3000",
      altUrl: "http://192.168.1.100:3000",
      title: "Kasir Toko (Pi LAN)",
      subtitle: "Offline-First di Outlet",
      badge: "Lokal Toko",
      badgeColor: "bg-purple-50 text-purple-700 border-purple-200",
      icon: Wifi,
    },
    {
      id: "vps_tailscale",
      url: "http://100.117.186.13:8000",
      title: "VPS Go-Live (Tailscale)",
      subtitle: "FastAPI + PostgreSQL 16",
      badge: "VPS Online",
      badgeColor: "bg-emerald-50 text-emerald-700 border-emerald-200",
      icon: Server,
    },
    {
      id: "cloud_primary",
      url: "",
      title: "Cloud Pusat (Standby)",
      subtitle: "Google Cloud / AI Studio",
      badge: "Cloud 24/7",
      badgeColor: "bg-blue-50 text-blue-700 border-blue-200",
      icon: Globe,
    },
  ];

  // Test koneksi server yang dipilih
  const testNodeConnection = useCallback(async (url) => {
    setProbing(true);
    setProbeStatus({ state: "checking", latency: null, text: "Menguji koneksi..." });
    try {
      const res = await probeServer(url, 2500);
      if (res.ok) {
        setProbeStatus({
          state: "online",
          latency: res.latency,
          text: `Online (${res.latency} ms)`,
        });
      } else {
        setProbeStatus({
          state: "offline",
          latency: null,
          text: res.error || "Tidak terjangkau",
        });
      }
    } catch (e) {
      setProbeStatus({ state: "offline", latency: null, text: "Koneksi terputus" });
    } finally {
      setProbing(false);
    }
  }, []);

  useEffect(() => {
    const cur = getServerUrl() || "";
    setSelectedServer(cur);
    testNodeConnection(cur);
  }, [testNodeConnection]);

  const handleSelect = (url) => {
    setSelectedServer(url);
    setServerUrl(url);
    if (onServerChanged) onServerChanged(url);
    testNodeConnection(url);
  };

  const handleSaveCustom = (e) => {
    e.preventDefault();
    const clean = (customInput || "").trim().replace(/\/+$/, "");
    if (!clean) {
      handleSelect("");
      setShowCustom(false);
      return;
    }
    if (!clean.startsWith("http://") && !clean.startsWith("https://")) {
      toast.error("Alamat server harus diawali http:// atau https://");
      return;
    }
    handleSelect(clean);
    setShowCustom(false);
    toast.success(`Server diarahkan ke: ${clean}`);
  };

  const isMatchedPreset = NODE_OPTIONS.some((n) => n.url === selectedServer || (n.altUrl && n.altUrl === selectedServer));

  return (
    <div className="mb-5 space-y-2.5" data-testid="login-server-selector">
      {/* Header & Status Indicator */}
      <div className="flex items-center justify-between">
        <label className="text-xs uppercase tracking-wider font-black text-[#52525B] flex items-center gap-1.5">
          <Server size={13} className="text-[#E63946]" /> Node Server &amp; Failover (Dual-Node)
        </label>

        <div className="flex items-center gap-1.5">
          {probing ? (
            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
              <RefreshCw size={10} className="animate-spin" /> Menguji Node...
            </span>
          ) : probeStatus.state === "online" ? (
            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              {probeStatus.text}
            </span>
          ) : probeStatus.state === "offline" ? (
            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded-full border border-rose-200">
              <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
              {probeStatus.text}
            </span>
          ) : (
            <span className="text-[10px] text-slate-500 font-bold bg-slate-50 px-2 py-0.5 rounded-full border border-slate-200">
              Dual-Node Siaga
            </span>
          )}
        </div>
      </div>

      {/* Grid 3 Pilihan Node Utama */}
      <div className="grid grid-cols-3 gap-2">
        {NODE_OPTIONS.map((node) => {
          const Icon = node.icon;
          const isSelected = selectedServer === node.url || (node.altUrl && selectedServer === node.altUrl);

          return (
            <button
              key={node.id}
              type="button"
              onClick={() => handleSelect(node.url)}
              className={`flex flex-col items-start p-2.5 rounded-xl border-2 text-left transition-all relative overflow-hidden ${
                isSelected
                  ? "border-[#E63946] bg-rose-50/30 shadow-xs"
                  : "border-[#E4E4E7] hover:border-slate-300 hover:bg-slate-50"
              }`}
            >
              <div className="flex items-center gap-1.5 w-full">
                <Icon size={14} className={isSelected ? "text-[#E63946]" : "text-slate-400"} />
                <span className="font-extrabold text-[11px] truncate">{node.title}</span>
              </div>
              <span className="text-[9px] text-[#71717A] mt-1 leading-tight line-clamp-1 w-full">
                {node.subtitle}
              </span>
              <span className={`mt-1.5 text-[8.5px] font-black uppercase px-1.5 py-0.2 rounded border ${node.badgeColor}`}>
                {node.badge}
              </span>

              {isSelected && (
                <div className="absolute right-0 bottom-0 w-3 h-3 bg-[#E63946] rounded-tl-lg flex items-center justify-center">
                  <span className="text-[7px] text-white font-bold">✓</span>
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Toggle Input Alamat Server Kustom */}
      <div className="flex items-center justify-between text-[11px] pt-1">
        <button
          type="button"
          onClick={() => setShowCustom((prev) => !prev)}
          className="text-slate-500 hover:text-slate-800 font-bold inline-flex items-center gap-1 cursor-pointer"
        >
          {showCustom ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          <span>Gunakan Alamat IP Server Lain</span>
          {!isMatchedPreset && selectedServer && (
            <span className="text-[#E63946] font-mono text-[10px] ml-1">({selectedServer})</span>
          )}
        </button>

        <button
          type="button"
          onClick={() => testNodeConnection(selectedServer)}
          disabled={probing}
          className="text-[#E63946] hover:underline font-bold inline-flex items-center gap-1 cursor-pointer disabled:opacity-50"
        >
          <RefreshCw size={11} className={probing ? "animate-spin" : ""} />
          <span>Uji Ping</span>
        </button>
      </div>

      {showCustom && (
        <form onSubmit={handleSaveCustom} className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2 animate-in fade-in duration-150">
          <label className="text-[10px] font-extrabold uppercase text-slate-500">
            Alamat URL Server Kustom (Contoh: http://192.168.1.50:3000 atau http://localhost:8000)
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={customInput}
              onChange={(e) => setCustomInput(e.target.value)}
              placeholder={selectedServer || "http://192.168.1.100:3000"}
              className="flex-1 h-9 px-3 rounded-lg border border-slate-300 bg-white text-xs font-mono outline-none focus:border-[#E63946]"
            />
            <button
              type="submit"
              className="h-9 px-3.5 bg-neutral-900 hover:bg-neutral-800 text-white text-xs font-bold rounded-lg cursor-pointer transition-colors"
            >
              Terapkan
            </button>
          </div>
        </form>
      )}

      {/* Peringatan jika koneksi ke server terpilih gagal */}
      {loginFailedServer && (
        <div className="rounded-xl border border-rose-200 bg-rose-50/70 p-3 text-xs text-rose-900 flex items-start gap-2.5 animate-pulse">
          <AlertCircle size={16} className="text-rose-600 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-extrabold">Gagal menghubungi Node terpilih!</p>
            <p className="text-rose-800 text-[11px] leading-relaxed">
              Jika kasir berada di toko, pastikan terhubung ke Wi-Fi toko untuk akses <strong>Kasir Toko (Pi LAN)</strong>, atau beralih ke <strong>VPS Go-Live (Tailscale)</strong> atau <strong>Cloud Pusat</strong> untuk melanjutkan transaksi.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
