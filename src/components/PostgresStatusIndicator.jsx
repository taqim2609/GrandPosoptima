import { useState, useEffect, useCallback } from "react";
import { Database, RefreshCw } from "lucide-react";
import { getServerUrl, probeServer } from "@/lib/api";
import { toast } from "sonner";

export default function PostgresStatusIndicator({ className = "", compact = false, showLabel = true }) {
  const [status, setStatus] = useState("checking"); // "connected" | "disconnected" | "checking"
  const [latency, setLatency] = useState(null);
  const [lastCheck, setLastCheck] = useState(null);
  const [checking, setChecking] = useState(false);
  const [backendUrl, setBackendUrl] = useState("");

  const checkConnection = useCallback(async (manual = false) => {
    setChecking(true);
    const targetUrl = getServerUrl();
    setBackendUrl(targetUrl || "Lokal (Origin)");

    try {
      const res = await probeServer(targetUrl, 3000);
      setLastCheck(new Date());
      if (res.ok) {
        setStatus("connected");
        setLatency(res.latency);
        if (manual) {
          toast.success(`PostgreSQL Backend Terhubung (${res.latency}ms)`);
        }
      } else {
        setStatus("disconnected");
        setLatency(null);
        if (manual) {
          toast.error(`PostgreSQL Backend Terputus: ${res.error || "Tidak terjangkau"}`);
        }
      }
    } catch (e) {
      setStatus("disconnected");
      setLatency(null);
      if (manual) {
        toast.error("Gagal menghubungi server PostgreSQL");
      }
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    checkConnection();
    const interval = setInterval(() => {
      checkConnection();
    }, 12000);

    const handleOnline = () => checkConnection();
    const handleOffline = () => setStatus("disconnected");

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      clearInterval(interval);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [checkConnection]);

  const isConnected = status === "connected";
  const isChecking = checking || status === "checking";

  return (
    <button
      type="button"
      data-testid="postgres-status-indicator"
      onClick={() => checkConnection(true)}
      title={
        isConnected
          ? `PostgreSQL 16: Terhubung (${latency ? `${latency}ms` : "OK"}) ke ${backendUrl}. Klik untuk cek ulang.`
          : `PostgreSQL 16: Terputus / Offline dari ${backendUrl}. Klik untuk mencoba kembali.`
      }
      className={`tap inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold border transition-all select-none shadow-2xs ${
        isConnected
          ? "bg-emerald-50/90 text-emerald-800 border-emerald-300/80 hover:bg-emerald-100/90"
          : isChecking
          ? "bg-zinc-50 text-zinc-700 border-zinc-200"
          : "bg-rose-50 text-rose-800 border-rose-300/80 hover:bg-rose-100 animate-pulse"
      } ${className}`}
    >
      <div className="relative flex items-center justify-center">
        {isChecking ? (
          <RefreshCw size={12} className="animate-spin text-zinc-500" />
        ) : (
          <Database size={13} className={isConnected ? "text-emerald-600" : "text-rose-600"} />
        )}
        {isConnected && !isChecking && (
          <span className="absolute -top-1 -right-1 flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-600"></span>
          </span>
        )}
        {!isConnected && !isChecking && (
          <span className="absolute -top-1 -right-1 flex h-2 w-2">
            <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-600"></span>
          </span>
        )}
      </div>

      {showLabel && (
        <span className="font-heading font-extrabold text-[11px] tracking-tight">
          {isConnected ? (
            <>
              <span>Postgres</span>
              {latency !== null && (
                <span className="hidden sm:inline font-mono font-medium text-[10px] text-emerald-700/80 ml-1">
                  {latency}ms
                </span>
              )}
            </>
          ) : isChecking ? (
            <span>Cek DB...</span>
          ) : (
            <span>Postgres Putus</span>
          )}
        </span>
      )}
    </button>
  );
}
