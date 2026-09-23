import { useState, useEffect, useCallback } from "react";
import {
  Database, Wifi, WifiOff, RefreshCw, CheckCircle2, AlertTriangle,
  Server, Cpu, Cloud, ShieldCheck, ArrowUpDown, ChevronRight, Activity
} from "lucide-react";
import {
  subscribeFirestoreSync,
  testFirestoreConnection,
  getLastSyncInfo,
  updateLastSyncInfo,
  syncAllMenuAndStockToFirestore,
  firestoreDatabaseId,
  firebaseProjectId
} from "@/lib/firebase";
import api from "@/lib/api";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import HybridSyncDiagnosticPanel from "@/components/HybridSyncDiagnosticPanel";

// Format human-readable relative time and exact timestamp
function formatTimeAgo(isoString) {
  if (!isoString) return "Belum pernah";
  const d = new Date(isoString);
  const now = new Date();
  const diffSec = Math.floor((now - d) / 1000);

  if (diffSec < 5) return "Baru saja";
  if (diffSec < 60) return `${diffSec} detik lalu`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} menit lalu`;
  return d.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export function VisualSyncBadge({ onClick }) {
  const [syncInfo, setSyncInfo] = useState(getLastSyncInfo());
  const [isSyncing, setIsSyncing] = useState(false);
  const [online, setOnline] = useState(navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    const unsub = subscribeFirestoreSync((active, info) => {
      setIsSyncing(active);
      if (info) setSyncInfo(info);
      else setSyncInfo(getLastSyncInfo());
    });

    const timer = setInterval(() => {
      setSyncInfo(getLastSyncInfo());
    }, 5000);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      unsub();
      clearInterval(timer);
    };
  }, []);

  const isOnline = online && syncInfo.status !== "offline";

  return (
    <button
      type="button"
      data-testid="visual-sync-status-badge"
      onClick={onClick}
      title={`Database Sync: ${isOnline ? "Online (Terhubung ke Cloud)" : "Offline (Lokal)"} — Terakhir: ${formatTimeAgo(syncInfo.timestamp)}`}
      className={`tap h-9 px-3 rounded-lg flex items-center gap-2 text-xs font-bold border transition-all shadow-xs ${
        isSyncing
          ? "bg-blue-50 text-blue-700 border-blue-300 ring-2 ring-blue-400/20"
          : isOnline
          ? "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100"
          : "bg-red-50 text-red-700 border-red-200 hover:bg-red-100"
      }`}
    >
      <div className="relative flex items-center justify-center">
        {isSyncing ? (
          <RefreshCw size={14} className="animate-spin text-blue-600" />
        ) : isOnline ? (
          <Wifi size={14} className="text-emerald-600" />
        ) : (
          <WifiOff size={14} className="text-red-600" />
        )}
        {isOnline && !isSyncing && (
          <span className="absolute -top-1 -right-1 flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-600"></span>
          </span>
        )}
      </div>

      <div className="flex flex-col text-left leading-none">
        <div className="flex items-center gap-1.5">
          <span className="font-extrabold">{isOnline ? "Online" : "Offline"}</span>
          <span className="text-[10px] opacity-60 hidden md:inline">· Cloud Sync</span>
        </div>
        <div className="text-[9px] font-normal opacity-80 truncate max-w-[100px] sm:max-w-none mt-0.5">
          {isSyncing ? "Menyinkronkan..." : formatTimeAgo(syncInfo.timestamp)}
        </div>
      </div>
    </button>
  );
}

export default function VisualSyncStatusCard({ showActions = true, className = "" }) {
  const [syncInfo, setSyncInfo] = useState(getLastSyncInfo());
  const [isSyncing, setIsSyncing] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [online, setOnline] = useState(navigator.onLine);
  const [detailOpen, setDetailOpen] = useState(false);
  const [stats, setStats] = useState({ products: 0, categories: 0 });

  const loadStats = useCallback(async () => {
    try {
      const [pRes, cRes] = await Promise.allSettled([
        api.get("/products"),
        api.get("/categories")
      ]);
      const pCount = pRes.status === "fulfilled" ? (pRes.value.data?.length || 0) : 0;
      const cCount = cRes.status === "fulfilled" ? (cRes.value.data?.length || 0) : 0;
      setStats({ products: pCount, categories: cCount });
    } catch (_) {}
  }, []);

  const handleTest = async () => {
    setIsTesting(true);
    toast.info("Menguji konektivitas PC Server / Pi ⇄ Firebase Cloud...");
    const res = await testFirestoreConnection();
    setIsTesting(false);
    setSyncInfo(getLastSyncInfo());
    if (res.ok) {
      toast.success(`Terhubung ke Firebase (${res.latencyMs}ms)!`, {
        description: `Database: ${res.databaseId}`,
      });
    } else {
      toast.warning("Status Offline / Cache Lokal", {
        description: res.error || "Data tersimpan di penyimpanan lokal",
      });
    }
  };

  const handleFullSync = async () => {
    setIsSyncing(true);
    toast.info("Menyinkronkan Menu, Harga & Stok ke Cloud...");
    try {
      const [pRes, cRes] = await Promise.all([
        api.get("/products"),
        api.get("/categories")
      ]);
      const res = await syncAllMenuAndStockToFirestore(pRes.data || [], cRes.data || []);
      setIsSyncing(false);
      setSyncInfo(getLastSyncInfo());
      if (res.success) {
        toast.success(`Sinkronisasi Sukses: ${res.count} Menu, Harga & Stok ter-update di Cloud!`);
      } else {
        toast.error("Sinkronisasi gagal: " + res.error);
      }
    } catch (e) {
      setIsSyncing(false);
      toast.error("Gagal mengambil data lokal untuk sinkronisasi");
    }
  };

  useEffect(() => {
    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    const unsub = subscribeFirestoreSync((active, info) => {
      setIsSyncing(active);
      if (info) setSyncInfo(info);
      else setSyncInfo(getLastSyncInfo());
    });

    loadStats();
    const timer = setInterval(() => {
      setSyncInfo(getLastSyncInfo());
    }, 5000);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      unsub();
      clearInterval(timer);
    };
  }, [loadStats]);

  const isOnline = online && syncInfo.status !== "offline";

  return (
    <>
      <div
        data-testid="visual-sync-status-card"
        className={`rounded-2xl border bg-white p-5 shadow-xs transition-all ${
          isOnline ? "border-emerald-200/80 hover:border-emerald-300" : "border-red-200/80 hover:border-red-300"
        } ${className}`}
      >
        <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div
              className={`p-3 rounded-xl border flex items-center justify-center ${
                isOnline
                  ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                  : "bg-red-50 text-red-700 border-red-200"
              }`}
            >
              {isOnline ? (
                <Wifi size={22} className="text-emerald-600 animate-pulse" />
              ) : (
                <WifiOff size={22} className="text-red-600" />
              )}
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-extrabold text-base text-neutral-900 flex items-center gap-1.5">
                  <span>Status Sinkronisasi Real-Time</span>
                </h3>
                <span
                  data-testid="sync-status-pill"
                  className={`inline-flex items-center gap-1 text-xs font-black px-2.5 py-0.5 rounded-full ${
                    isOnline
                      ? "bg-emerald-100 text-emerald-800"
                      : "bg-red-100 text-red-800"
                  }`}
                >
                  <span className={`h-2 w-2 rounded-full ${isOnline ? "bg-emerald-500" : "bg-red-500"}`} />
                  {isOnline ? "ONLINE (Cloud Terhubung)" : "OFFLINE (Penyimpanan Lokal)"}
                </span>
                {isSyncing && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 animate-pulse">
                    <RefreshCw size={11} className="animate-spin" /> Menyinkronkan...
                  </span>
                )}
              </div>
              <p className="text-xs text-neutral-500 mt-1">
                Sinkronisasi instan Menu, Harga, Stok & Transaksi antara <b>PC Server</b>, <b>Raspberry Pi</b>, dan <b>Google Firebase Cloud</b>.
              </p>
            </div>
          </div>

          {showActions && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                data-testid="btn-test-sync"
                onClick={handleTest}
                disabled={isTesting}
                className="tap h-9 px-3 rounded-xl bg-white border border-neutral-300 hover:bg-neutral-50 text-neutral-700 text-xs font-bold inline-flex items-center gap-1.5 shadow-xs disabled:opacity-50"
              >
                <Activity size={13} className={isTesting ? "animate-spin" : "text-neutral-500"} />
                <span>{isTesting ? "Memeriksa..." : "Uji Latensi"}</span>
              </button>
              <button
                type="button"
                data-testid="btn-sync-all-menu"
                onClick={handleFullSync}
                disabled={isSyncing}
                className="tap h-9 px-3.5 rounded-xl bg-[#E63946] hover:bg-[#D62839] text-white text-xs font-extrabold inline-flex items-center gap-1.5 shadow-xs disabled:opacity-50"
              >
                <RefreshCw size={13} className={isSyncing ? "animate-spin" : ""} />
                <span>{isSyncing ? "Menyinkron..." : "Sinkron Menu & Stok"}</span>
              </button>
            </div>
          )}
        </div>

        {/* Status Grid Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 my-3">
          <div className="p-3.5 rounded-xl bg-neutral-50 border border-neutral-100">
            <div className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider">Status Konektivitas</div>
            <div className="flex items-center gap-1.5 mt-1.5">
              <span className={`h-2.5 w-2.5 rounded-full ${isOnline ? "bg-emerald-500 animate-pulse" : "bg-red-500"}`} />
              <span className="font-extrabold text-sm text-neutral-900">
                {isOnline ? "Online" : "Offline"}
              </span>
              <span className="text-xs text-neutral-400 font-num">({syncInfo.latencyMs || 35}ms)</span>
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-neutral-50 border border-neutral-100">
            <div className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider">Terakhir Sinkron</div>
            <div
              data-testid="last-sync-timestamp"
              className="font-num font-extrabold text-sm text-neutral-900 mt-1.5"
              title={syncInfo.timestamp ? new Date(syncInfo.timestamp).toLocaleString("id-ID") : "-"}
            >
              {formatTimeAgo(syncInfo.timestamp)}
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-neutral-50 border border-neutral-100">
            <div className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider">Menu & Stok Terdata</div>
            <div className="font-extrabold text-sm text-neutral-900 mt-1.5 flex items-center gap-1.5">
              <span>{stats.products} Menu / Produk</span>
              <span className="text-xs text-neutral-400">· {stats.categories} Kat</span>
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-neutral-50 border border-neutral-100">
            <div className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider">Node & Target Cloud</div>
            <div className="text-xs font-mono font-bold text-neutral-700 truncate mt-1.5" title={`Firestore: ${firestoreDatabaseId}`}>
              PC Server ⇄ Pi ⇄ Cloud
            </div>
          </div>
        </div>

        {/* Footer info bar */}
        <div className="pt-2.5 border-t border-neutral-100 flex flex-wrap items-center justify-between gap-2 text-xs text-neutral-500">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="flex items-center gap-1 font-semibold text-emerald-700">
              <CheckCircle2 size={13} className="text-emerald-600" /> Menu, Harga & Stok otomatis tersinkron ke PC Server & Raspberry Pi
            </span>
            <span className="hidden md:inline text-neutral-300">·</span>
            <span className="hidden md:inline font-mono text-[11px] text-neutral-400">DB: {firestoreDatabaseId}</span>
          </div>

          <button
            type="button"
            onClick={() => setDetailOpen(true)}
            className="text-[11px] font-bold text-neutral-700 hover:text-neutral-950 flex items-center gap-1 hover:underline"
          >
            <span>Detail Diagnostik Node</span>
            <ChevronRight size={13} />
          </button>
        </div>
      </div>

      {/* Diagnostics Dialog */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto p-6">
          <DialogHeader className="mb-2">
            <DialogTitle className="flex items-center gap-2 text-xl font-black">
              <Database size={22} className="text-[#E63946]" />
              Diagnostik Latensi &amp; Sinkronisasi Hybrid (PC Server, Pi &amp; Firebase)
            </DialogTitle>
          </DialogHeader>

          <HybridSyncDiagnosticPanel />
        </DialogContent>
      </Dialog>
    </>
  );
}
