import React, { useState, useEffect } from "react";
import { Server, Wifi, Globe, AlertCircle, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { getServerUrl } from "@/lib/api";

export default function LoginServerSelector({ loginFailedServer, onServerChanged }) {
  const [selectedServer, setSelectedServer] = useState("");
  const [customUrl, setCustomUrl] = useState("");

  const cloudUrl = typeof window !== "undefined" ? window.location.origin : "";
  const localUrl = "http://192.168.1.100:3000";

  useEffect(() => {
    const cur = getServerUrl() || "";
    setSelectedServer(cur);
  }, []);

  const handleSelect = (url) => {
    setSelectedServer(url);
    onServerChanged(url);
  };

  return (
    <div className="mb-5 space-y-2.5" data-testid="login-server-selector">
      <div className="flex items-center justify-between">
        <label className="text-xs uppercase tracking-wider font-black text-[#52525B] flex items-center gap-1.5">
          <Server size={13} className="text-[#E63946]" /> Node Server &amp; Failover
        </label>
        <span className="text-[10px] text-slate-400 font-bold bg-slate-50 px-2 py-0.5 rounded-full border border-slate-100">
          Hybrid Active
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => handleSelect("")}
          className={`flex flex-col items-start p-3 rounded-xl border-2 text-left transition-all relative overflow-hidden ${
            selectedServer === "" 
              ? "border-[#E63946] bg-rose-50/20" 
              : "border-[#E4E4E7] hover:border-slate-300 hover:bg-slate-50"
          }`}
        >
          <div className="flex items-center gap-1.5">
            <Globe size={14} className={selectedServer === "" ? "text-[#E63946]" : "text-slate-400"} />
            <span className="font-extrabold text-xs">Cloud Server</span>
          </div>
          <span className="text-[10px] text-[#71717A] mt-1 leading-normal truncate max-w-full">
            Server Pusat (Internet)
          </span>
          {selectedServer === "" && (
            <div className="absolute right-0 bottom-0 w-3 h-3 bg-[#E63946] rounded-tl-lg flex items-center justify-center">
              <span className="text-[7px] text-white font-bold">✓</span>
            </div>
          )}
        </button>

        <button
          type="button"
          onClick={() => handleSelect(localUrl)}
          className={`flex flex-col items-start p-3 rounded-xl border-2 text-left transition-all relative overflow-hidden ${
            selectedServer === localUrl 
              ? "border-[#E63946] bg-rose-50/20" 
              : "border-[#E4E4E7] hover:border-slate-300 hover:bg-slate-50"
          }`}
        >
          <div className="flex items-center gap-1.5">
            <Wifi size={14} className={selectedServer === localUrl ? "text-[#E63946]" : "text-slate-400"} />
            <span className="font-extrabold text-xs">Offline Store Node</span>
          </div>
          <span className="text-[10px] text-[#71717A] mt-1 leading-normal truncate max-w-full">
            Lokal Raspberry Pi / LAN
          </span>
          {selectedServer === localUrl && (
            <div className="absolute right-0 bottom-0 w-3 h-3 bg-[#E63946] rounded-tl-lg flex items-center justify-center">
              <span className="text-[7px] text-white font-bold">✓</span>
            </div>
          )}
        </button>
      </div>

      {loginFailedServer && (
        <div className="rounded-xl border border-rose-200 bg-rose-50/60 p-3 text-xs text-rose-900 flex items-start gap-2.5 animate-pulse">
          <AlertCircle size={16} className="text-rose-600 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-extrabold">Gagal menghubungi Node terpilih!</p>
            <p className="text-rose-800 text-[11px] leading-relaxed">
              Pastikan perangkat Anda terhubung ke Wi-Fi kasir atau switch ke <strong className="cursor-pointer underline text-[#E63946]" onClick={() => handleSelect("")}>Cloud Server (Pusat)</strong> untuk masuk secara online.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
