import { useState, useEffect, useMemo } from "react";
import {
  AlertTriangle,
  Bug,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Cloud,
  Copy,
  ExternalLink,
  Flame,
  Globe,
  HardDrive,
  Info,
  Layers,
  Network,
  Play,
  Radio,
  RefreshCw,
  Search,
  Send,
  Server,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Terminal,
  Trash2,
  Wifi,
  WifiOff,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import {
  errorLog,
  subscribeErrorLog,
  clearErrorLog,
  logAppError,
  categorizeError,
  analyzePersistentFailures,
  buildDiagReport,
} from "@/lib/diag";
import { copyText } from "@/lib/utils";
import { getBundleVersion } from "@/lib/versions";
import { getServerUrl } from "@/lib/api";
import { testFirestoreConnection, logRuntimeErrorToFirestore } from "@/lib/firebase";

export default function GlobalErrorDiagnosticPanel({ embedded = false }) {
  const [logs, setLogs] = useState([]);
  const [expandedLogId, setExpandedLogId] = useState(null);
  const [filterCategory, setFilterCategory] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [isSimulating, setIsSimulating] = useState(false);
  const [isTestingServices, setIsTestingServices] = useState(false);
  const [isCopying, setIsCopying] = useState(false);
  const [isSyncingFirestore, setIsSyncingFirestore] = useState(false);

  // Live Service Health Status
  const [healthStatus, setHealthStatus] = useState({
    api: { status: "unknown", latency: null, message: "Belum diuji" },
    firestore: { status: "unknown", latency: null, message: "Belum diuji" },
    internet: { status: "unknown", latency: null, message: "Belum diuji" },
    publishing: { status: "unknown", version: getBundleVersion(), latest: null, message: "Memeriksa versi..." },
  });

  // Subscribe to real-time error log stream
  useEffect(() => {
    const unsubscribe = subscribeErrorLog((newLogs) => {
      setLogs(newLogs);
    });
    // Initial quick test
    runQuickServiceCheck();
    return () => unsubscribe();
  }, []);

  // Analyze persistent failure patterns
  const persistentAnalysis = useMemo(() => {
    return analyzePersistentFailures(logs);
  }, [logs]);

  // Run quick connectivity and publishing health check
  const runQuickServiceCheck = async () => {
    setIsTestingServices(true);

    const newHealth = { ...healthStatus };

    // 1. API Server Check
    try {
      const t0 = performance.now();
      const base = getServerUrl();
      const url = base ? `${base}/api/health` : "/api/health";
      const res = await fetch(url, { cache: "no-store" });
      const latency = Math.round(performance.now() - t0);
      if (res.ok) {
        newHealth.api = { status: "healthy", latency, message: `Terhubung (${latency} ms)` };
      } else {
        newHealth.api = { status: "error", latency, message: `HTTP ${res.status}` };
      }
    } catch (e) {
      newHealth.api = { status: "error", latency: null, message: e.message || "Gagal terhubung" };
    }

    // 2. Internet / Cloud Ping Check
    try {
      const t0 = performance.now();
      const pingRes = await fetch("/api/system/health/ping-google", { method: "POST" })
        .then((r) => r.json())
        .catch(() => null);
      const latency = pingRes?.latency_ms || Math.round(performance.now() - t0);

      if (pingRes && pingRes.ok) {
        newHealth.internet = { status: "healthy", latency, message: `Online (${latency} ms)` };
      } else if (navigator.onLine) {
        newHealth.internet = { status: "warning", latency: null, message: "Online (Jalur lokal)" };
      } else {
        newHealth.internet = { status: "error", latency: null, message: "Terputus (Offline)" };
      }
    } catch (_) {
      newHealth.internet = {
        status: navigator.onLine ? "healthy" : "error",
        latency: null,
        message: navigator.onLine ? "Online (Browser)" : "Offline",
      };
    }

    // 3. Firestore Telemetry Check
    try {
      const fsRes = await testFirestoreConnection();
      if (fsRes.ok) {
        newHealth.firestore = {
          status: "healthy",
          latency: fsRes.latency_ms,
          message: `Terhubung (${fsRes.latency_ms} ms)`,
        };
      } else {
        newHealth.firestore = { status: "warning", latency: null, message: fsRes.message || "Gagal" };
      }
    } catch (e) {
      newHealth.firestore = { status: "warning", latency: null, message: e.message || "Offline" };
    }

    // 4. Publishing & Bundle Version Check
    try {
      const otaRes = await fetch("/api/ota/version", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null);

      const clientVersion = getBundleVersion();
      const serverVersion = otaRes?.version || null;

      if (serverVersion && clientVersion && serverVersion !== clientVersion) {
        newHealth.publishing = {
          status: "warning",
          version: clientVersion,
          latest: serverVersion,
          message: `Update tersedia (Server: ${serverVersion} vs Klien: ${clientVersion})`,
        };
      } else {
        newHealth.publishing = {
          status: "healthy",
          version: clientVersion,
          latest: serverVersion || clientVersion,
          message: `Bundle sinkron (${clientVersion})`,
        };
      }
    } catch (_) {
      newHealth.publishing = {
        status: "healthy",
        version: getBundleVersion(),
        latest: null,
        message: `Bundle aktif: ${getBundleVersion()}`,
      };
    }

    setHealthStatus(newHealth);
    setIsTestingServices(false);
  };

  // Filter and search logic
  const filteredLogs = useMemo(() => {
    return [...logs].reverse().filter((item) => {
      const cat = item.category || categorizeError(item);
      if (filterCategory !== "all" && cat !== filterCategory) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const msg = String(item.msg || item.message || "").toLowerCase();
        const stack = String(item.stack || "").toLowerCase();
        const compStack = String(item.componentStack || "").toLowerCase();
        const url = String(item.url || "").toLowerCase();
        return msg.includes(q) || stack.includes(q) || compStack.includes(q) || url.includes(q);
      }
      return true;
    });
  }, [logs, filterCategory, searchQuery]);

  // Counts by category
  const stats = useMemo(() => {
    let connection = 0;
    let publishing = 0;
    let render = 0;
    let runtime = 0;

    logs.forEach((l) => {
      const cat = l.category || categorizeError(l);
      if (cat === "connection_failure") connection++;
      else if (cat === "publishing_failure") publishing++;
      else if (cat === "react_render_error") render++;
      else runtime++;
    });

    return { total: logs.length, connection, publishing, render, runtime };
  }, [logs]);

  // Actions
  const handleCopyLogs = async () => {
    setIsCopying(true);
    try {
      const report = await buildDiagReport();
      const ok = await copyText(report);
      if (ok) {
        toast.success("Laporan diagnostik & log error berhasil disalin ke clipboard!");
      } else {
        toast.error("Gagal menyalin otomatis. Silakan salin manual.");
      }
    } catch (e) {
      toast.error("Gagal menyusun laporan: " + e.message);
    } finally {
      setIsCopying(false);
    }
  };

  const handleSyncAllToFirestore = async () => {
    if (logs.length === 0) {
      toast.info("Tidak ada log error untuk dikirim.");
      return;
    }
    setIsSyncingFirestore(true);
    const t = toast.loading(`Mengunggah ${logs.length} catatan log ke Firestore...`);
    try {
      for (const item of logs.slice(-10)) {
        await logRuntimeErrorToFirestore({
          type: item.category || item.type,
          message: item.msg || item.message,
          stack: item.stack || "",
          componentStack: item.componentStack || "",
          url: item.url || window.location.href,
          status: item.status,
          method: item.method,
        });
      }
      toast.success("Log error berhasil disinkronkan ke Firestore Remote Debugging!", { id: t });
    } catch (e) {
      toast.error("Gagal mengirim ke Firestore: " + e.message, { id: t });
    } finally {
      setIsSyncingFirestore(false);
    }
  };

  const handleClearLogs = () => {
    if (window.confirm("Bersihkan seluruh log error yang tercatat di memori sesi saat ini?")) {
      clearErrorLog();
      toast.success("Log error lokal berhasil dibersihkan.");
    }
  };

  const handleHardReload = () => {
    try {
      window.sessionStorage.clear();
      if ("caches" in window) {
        caches.keys().then((names) => {
          names.forEach((name) => caches.delete(name));
        });
      }
    } catch (_) {}
    window.location.reload(true);
  };

  // Simulate tests for Staff Verification
  const handleSimulateRenderError = () => {
    setIsSimulating(true);
    logAppError(
      "react_render_error",
      "Simulasi: TypeError: Cannot read properties of undefined (reading 'price_cents')",
      {
        stack:
          "TypeError: Cannot read properties of undefined (reading 'price_cents')\n    at POSOrderCart (POS.jsx:248:19)\n    at renderWithHooks (react-dom.production.min.js)\n    at updateFunctionComponent (react-dom.production.min.js)",
        componentStack:
          "\n    in POSOrderCart (at POS.jsx:248)\n    in div (at POS.jsx:110)\n    in POS (at App.js:75)\n    in ErrorBoundary (at App.js:74)",
        url: window.location.href,
        simulated: true,
      }
    );
    toast.success("Simulasi ErrorBoundary berhasil dicatat ke panel diagnostik!");
    setIsSimulating(false);
  };

  const handleSimulateConnectionFailure = () => {
    setIsSimulating(true);
    logAppError("api_network_error", "Simulasi: AxiosError: Network Error / Connection Refused (ECONNREFUSED)", {
      status: 0,
      method: "POST",
      url: "/api/orders/checkout",
      stack: "AxiosError: Network Error\n    at XMLHttpRequest.handleError (axios.js:124)",
      simulated: true,
    });
    toast.success("Simulasi Connection Failure berhasil dicatat ke panel diagnostik!");
    setIsSimulating(false);
  };

  const handleSimulatePublishingFailure = () => {
    setIsSimulating(true);
    logAppError(
      "publishing_failure",
      "Simulasi: ChunkLoadError: Loading chunk 842 failed (missing /assets/POS-B89xf1.js after new deployment)",
      {
        stack: "ChunkLoadError: Loading chunk 842 failed.\n    at window.webpackJsonpCallback (main.js:42)",
        url: "/assets/POS-B89xf1.js",
        simulated: true,
      }
    );
    toast.success("Simulasi Publishing/Chunk Failure berhasil dicatat!");
    setIsSimulating(false);
  };

  // Format timestamp helper
  const formatTime = (isoString) => {
    if (!isoString) return "-";
    try {
      const d = new Date(isoString);
      const diffMs = Date.now() - d.getTime();
      const diffSec = Math.floor(diffMs / 1000);
      const diffMin = Math.floor(diffSec / 60);

      let rel = "";
      if (diffSec < 10) rel = "Baru saja";
      else if (diffSec < 60) rel = `${diffSec} detik lalu`;
      else if (diffMin < 60) rel = `${diffMin} menit lalu`;
      else rel = `${Math.floor(diffMin / 60)} jam lalu`;

      const exact = d.toLocaleTimeString("id-ID", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });

      return { rel, exact };
    } catch (_) {
      return { rel: "-", exact: isoString };
    }
  };

  return (
    <div
      className={`space-y-6 ${embedded ? "" : "p-6 lg:p-8 max-w-5xl mx-auto"}`}
      data-testid="global-error-diagnostic-panel"
    >
      {/* Panel Header */}
      <div className="bg-white border border-zinc-200/90 rounded-2xl p-5 md:p-6 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="p-2.5 rounded-xl bg-zinc-900 text-white shadow-sm">
                <ShieldAlert size={22} className="text-amber-400" />
              </div>
              <div>
                <h2 className="text-lg md:text-xl font-black text-zinc-900 tracking-tight flex items-center gap-2">
                  Diagnostik Log Error Global &amp; Error Boundary
                </h2>
                <p className="text-xs md:text-sm text-zinc-500 mt-0.5">
                  Memantau kegagalan koneksi jaringan, unhandled crash React, dan status publishing secara real-time.
                </p>
              </div>
            </div>
          </div>

          {/* Quick Action Buttons */}
          <div className="flex items-center gap-2 flex-wrap shrink-0">
            <button
              onClick={runQuickServiceCheck}
              disabled={isTestingServices}
              className="px-3.5 h-9 bg-zinc-100 hover:bg-zinc-200 text-zinc-800 font-bold text-xs rounded-xl flex items-center gap-1.5 transition disabled:opacity-50"
              title="Uji ulang latensi koneksi & versi publishing"
            >
              <RefreshCw size={13} className={isTestingServices ? "animate-spin" : ""} />
              {isTestingServices ? "Menguji..." : "Uji Jaringan & Versi"}
            </button>

            <button
              onClick={handleCopyLogs}
              disabled={isCopying}
              className="px-3.5 h-9 bg-zinc-900 hover:bg-zinc-800 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 transition shadow-sm disabled:opacity-50"
              title="Salin seluruh laporan teknis untuk tim developer / AI Studio"
            >
              <Copy size={13} />
              {isCopying ? "Menyalin..." : "Salin Laporan Log"}
            </button>

            {logs.length > 0 && (
              <button
                onClick={handleClearLogs}
                className="p-2 h-9 w-9 rounded-xl border border-zinc-200 text-zinc-500 hover:text-rose-600 hover:bg-rose-50 transition flex items-center justify-center"
                title="Bersihkan log lokal"
              >
                <Trash2 size={15} />
              </button>
            )}
          </div>
        </div>

        {/* Live Service Health Bar */}
        <div className="mt-5 pt-4 border-t border-zinc-100 grid grid-cols-2 md:grid-cols-4 gap-3">
          {/* 1. API Server */}
          <div className="bg-zinc-50/80 border border-zinc-200/60 rounded-xl p-3 flex items-center gap-2.5">
            <div
              className={`p-2 rounded-lg shrink-0 ${
                healthStatus.api.status === "healthy"
                  ? "bg-emerald-100 text-emerald-700"
                  : healthStatus.api.status === "error"
                  ? "bg-rose-100 text-rose-700"
                  : "bg-zinc-200 text-zinc-600"
              }`}
            >
              <Server size={15} />
            </div>
            <div className="min-w-0">
              <div className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">API Backend</div>
              <div className="text-xs font-black text-zinc-800 truncate">{healthStatus.api.message}</div>
            </div>
          </div>

          {/* 2. Internet / Gateway */}
          <div className="bg-zinc-50/80 border border-zinc-200/60 rounded-xl p-3 flex items-center gap-2.5">
            <div
              className={`p-2 rounded-lg shrink-0 ${
                healthStatus.internet.status === "healthy"
                  ? "bg-emerald-100 text-emerald-700"
                  : healthStatus.internet.status === "error"
                  ? "bg-rose-100 text-rose-700"
                  : "bg-amber-100 text-amber-700"
              }`}
            >
              <Wifi size={15} />
            </div>
            <div className="min-w-0">
              <div className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">Jalur Internet</div>
              <div className="text-xs font-black text-zinc-800 truncate">{healthStatus.internet.message}</div>
            </div>
          </div>

          {/* 3. Firestore Telemetry */}
          <div className="bg-zinc-50/80 border border-zinc-200/60 rounded-xl p-3 flex items-center gap-2.5">
            <div
              className={`p-2 rounded-lg shrink-0 ${
                healthStatus.firestore.status === "healthy"
                  ? "bg-emerald-100 text-emerald-700"
                  : "bg-amber-100 text-amber-700"
              }`}
            >
              <Flame size={15} />
            </div>
            <div className="min-w-0">
              <div className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">Firestore Telemetri</div>
              <div className="text-xs font-black text-zinc-800 truncate">{healthStatus.firestore.message}</div>
            </div>
          </div>

          {/* 4. Publishing & Bundle */}
          <div className="bg-zinc-50/80 border border-zinc-200/60 rounded-xl p-3 flex items-center gap-2.5">
            <div
              className={`p-2 rounded-lg shrink-0 ${
                healthStatus.publishing.status === "healthy"
                  ? "bg-emerald-100 text-emerald-700"
                  : "bg-amber-100 text-amber-700"
              }`}
            >
              <Zap size={15} />
            </div>
            <div className="min-w-0">
              <div className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">Status Publish</div>
              <div className="text-xs font-black text-zinc-800 truncate">{healthStatus.publishing.message}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Persistent Anomaly Alert Banner */}
      {persistentAnalysis.hasPersistentFailure && (
        <div className="space-y-3">
          {persistentAnalysis.alerts.map((alert) => (
            <div
              key={alert.id}
              className={`p-4 md:p-5 rounded-2xl border flex flex-col md:flex-row md:items-center justify-between gap-4 ${
                alert.level === "critical"
                  ? "bg-rose-50 border-rose-200 text-rose-950"
                  : "bg-amber-50 border-amber-200 text-amber-950"
              }`}
            >
              <div className="flex items-start gap-3">
                <div
                  className={`p-2.5 rounded-xl shrink-0 ${
                    alert.level === "critical" ? "bg-rose-600 text-white" : "bg-amber-500 text-white"
                  }`}
                >
                  <AlertTriangle size={20} className="animate-bounce" />
                </div>
                <div className="space-y-1">
                  <h3 className="font-black text-sm md:text-base leading-snug">{alert.title}</h3>
                  <p className="text-xs md:text-sm opacity-90 leading-relaxed">{alert.description}</p>
                  <div className="text-xs font-semibold mt-1.5 flex items-center gap-1.5 opacity-95">
                    <Info size={13} className="shrink-0" />
                    <span>Saran: {alert.recommendation}</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0 self-end md:self-center">
                {alert.id === "persistent_publishing" && (
                  <button
                    onClick={handleHardReload}
                    className="px-3.5 h-9 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 shadow-sm transition"
                  >
                    <RefreshCw size={13} /> Muat Ulang Paksa (Hard Reload)
                  </button>
                )}
                {alert.id === "persistent_connection" && (
                  <button
                    onClick={runQuickServiceCheck}
                    className="px-3.5 h-9 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 shadow-sm transition"
                  >
                    <Zap size={13} /> Re-test Koneksi
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Metrics & Categorized Filter Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
        <button
          onClick={() => setFilterCategory("all")}
          className={`p-3 rounded-2xl border text-left transition ${
            filterCategory === "all"
              ? "bg-zinc-900 border-zinc-900 text-white shadow-sm"
              : "bg-white border-zinc-200 text-zinc-800 hover:border-zinc-300"
          }`}
        >
          <div className="text-[11px] font-bold uppercase tracking-wider opacity-70">Semua Log</div>
          <div className="text-xl font-black mt-0.5">{stats.total}</div>
        </button>

        <button
          onClick={() => setFilterCategory("connection_failure")}
          className={`p-3 rounded-2xl border text-left transition ${
            filterCategory === "connection_failure"
              ? "bg-rose-700 border-rose-700 text-white shadow-sm"
              : "bg-white border-zinc-200 text-zinc-800 hover:border-rose-300"
          }`}
        >
          <div className="text-[11px] font-bold uppercase tracking-wider opacity-70 flex items-center gap-1">
            <WifiOff size={12} /> Koneksi / API
          </div>
          <div className="text-xl font-black mt-0.5 text-rose-600">{stats.connection}</div>
        </button>

        <button
          onClick={() => setFilterCategory("publishing_failure")}
          className={`p-3 rounded-2xl border text-left transition ${
            filterCategory === "publishing_failure"
              ? "bg-amber-600 border-amber-600 text-white shadow-sm"
              : "bg-white border-zinc-200 text-zinc-800 hover:border-amber-300"
          }`}
        >
          <div className="text-[11px] font-bold uppercase tracking-wider opacity-70 flex items-center gap-1">
            <Zap size={12} /> Publish / Chunk
          </div>
          <div className="text-xl font-black mt-0.5 text-amber-600">{stats.publishing}</div>
        </button>

        <button
          onClick={() => setFilterCategory("react_render_error")}
          className={`p-3 rounded-2xl border text-left transition ${
            filterCategory === "react_render_error"
              ? "bg-indigo-700 border-indigo-700 text-white shadow-sm"
              : "bg-white border-zinc-200 text-zinc-800 hover:border-indigo-300"
          }`}
        >
          <div className="text-[11px] font-bold uppercase tracking-wider opacity-70 flex items-center gap-1">
            <Layers size={12} /> ErrorBoundary
          </div>
          <div className="text-xl font-black mt-0.5 text-indigo-600">{stats.render}</div>
        </button>

        <button
          onClick={() => setFilterCategory("runtime_error")}
          className={`p-3 rounded-2xl border text-left transition ${
            filterCategory === "runtime_error"
              ? "bg-zinc-800 border-zinc-800 text-white shadow-sm"
              : "bg-white border-zinc-200 text-zinc-800 hover:border-zinc-300"
          }`}
        >
          <div className="text-[11px] font-bold uppercase tracking-wider opacity-70 flex items-center gap-1">
            <Bug size={12} /> Uncaught JS
          </div>
          <div className="text-xl font-black mt-0.5">{stats.runtime}</div>
        </button>
      </div>

      {/* Search & Simulation Tools Bar */}
      <div className="bg-white border border-zinc-200 rounded-2xl p-4 flex flex-col md:flex-row items-center justify-between gap-3 shadow-sm">
        {/* Search Bar */}
        <div className="relative w-full md:w-80">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cari pesan error, URL, komponen..."
            className="w-full h-9 pl-9 pr-3 text-xs bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-zinc-900/10 text-zinc-900 placeholder:text-zinc-400 font-medium"
          />
        </div>

        {/* Staff Simulation & Cloud Push Buttons */}
        <div className="flex items-center gap-2 flex-wrap w-full md:w-auto justify-end">
          <div className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider hidden lg:inline">
            Uji Coba Staf:
          </div>

          <button
            onClick={handleSimulateRenderError}
            disabled={isSimulating}
            className="px-2.5 h-8 bg-indigo-50 hover:bg-indigo-100 text-indigo-800 border border-indigo-200 font-bold text-[11px] rounded-lg flex items-center gap-1 transition disabled:opacity-50"
            title="Simulasikan ErrorBoundary crash untuk menguji panel"
          >
            <Layers size={12} /> Tes Render Error
          </button>

          <button
            onClick={handleSimulateConnectionFailure}
            disabled={isSimulating}
            className="px-2.5 h-8 bg-rose-50 hover:bg-rose-100 text-rose-800 border border-rose-200 font-bold text-[11px] rounded-lg flex items-center gap-1 transition disabled:opacity-50"
            title="Simulasikan kegagalan koneksi API / offline"
          >
            <WifiOff size={12} /> Tes Koneksi Error
          </button>

          <button
            onClick={handleSimulatePublishingFailure}
            disabled={isSimulating}
            className="px-2.5 h-8 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 font-bold text-[11px] rounded-lg flex items-center gap-1 transition disabled:opacity-50"
            title="Simulasikan ChunkLoadError akibat perubahan publish"
          >
            <Zap size={12} /> Tes Chunk Error
          </button>

          <button
            onClick={handleSyncAllToFirestore}
            disabled={isSyncingFirestore || logs.length === 0}
            className="px-3 h-8 bg-amber-500 hover:bg-amber-600 text-white font-bold text-[11px] rounded-lg flex items-center gap-1.5 transition disabled:opacity-50"
            title="Kirim catatan log saat ini ke koleksi error_logs Firestore"
          >
            <Flame size={12} className={isSyncingFirestore ? "animate-spin" : ""} />
            {isSyncingFirestore ? "Sinkron..." : "Kirim Firestore"}
          </button>
        </div>
      </div>

      {/* Error Log Items Feed */}
      <div className="space-y-3">
        {filteredLogs.length === 0 ? (
          <div className="bg-white border border-zinc-200 rounded-2xl p-12 text-center space-y-3 shadow-sm">
            <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto">
              <CheckCircle2 size={28} />
            </div>
            <div className="space-y-1">
              <h3 className="font-bold text-zinc-900 text-base">Tidak Ada Error Yang Terdeteksi</h3>
              <p className="text-xs text-zinc-500 max-w-md mx-auto">
                {searchQuery || filterCategory !== "all"
                  ? "Tidak ada catatan log error yang sesuai dengan filter atau kata kunci pencarian Anda."
                  : "Aplikasi berjalan normal tanpa ada render crash atau kegagalan koneksi aktif dalam sesi ini."}
              </p>
            </div>
          </div>
        ) : (
          filteredLogs.map((item) => {
            const cat = item.category || categorizeError(item);
            const isExpanded = expandedLogId === item.id;
            const time = formatTime(item.t);

            return (
              <div
                key={item.id}
                className={`bg-white border rounded-2xl p-4 md:p-5 transition shadow-sm ${
                  cat === "connection_failure"
                    ? "border-rose-200/90 hover:border-rose-300"
                    : cat === "publishing_failure"
                    ? "border-amber-200/90 hover:border-amber-300"
                    : cat === "react_render_error"
                    ? "border-indigo-200/90 hover:border-indigo-300"
                    : "border-zinc-200/90 hover:border-zinc-300"
                }`}
              >
                {/* Item Header */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    {/* Category Icon */}
                    <div
                      className={`p-2.5 rounded-xl shrink-0 mt-0.5 ${
                        cat === "connection_failure"
                          ? "bg-rose-50 text-rose-600"
                          : cat === "publishing_failure"
                          ? "bg-amber-50 text-amber-600"
                          : cat === "react_render_error"
                          ? "bg-indigo-50 text-indigo-600"
                          : "bg-zinc-100 text-zinc-600"
                      }`}
                    >
                      {cat === "connection_failure" ? (
                        <WifiOff size={18} />
                      ) : cat === "publishing_failure" ? (
                        <Zap size={18} />
                      ) : cat === "react_render_error" ? (
                        <Layers size={18} />
                      ) : (
                        <Bug size={18} />
                      )}
                    </div>

                    {/* Message & Tags */}
                    <div className="min-w-0 space-y-1.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        {/* Category Badge */}
                        <span
                          className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md ${
                            cat === "connection_failure"
                              ? "bg-rose-100 text-rose-800"
                              : cat === "publishing_failure"
                              ? "bg-amber-100 text-amber-800"
                              : cat === "react_render_error"
                              ? "bg-indigo-100 text-indigo-800"
                              : "bg-zinc-100 text-zinc-700"
                          }`}
                        >
                          {cat === "connection_failure"
                            ? "Connection / Network"
                            : cat === "publishing_failure"
                            ? "Publishing / Chunk"
                            : cat === "react_render_error"
                            ? "ErrorBoundary Render"
                            : "Runtime Error"}
                        </span>

                        {item.status !== undefined && (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-zinc-100 text-zinc-700 font-mono">
                            HTTP {item.status || "0"}
                          </span>
                        )}

                        {item.method && (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-zinc-100 text-zinc-700 font-mono">
                            {item.method}
                          </span>
                        )}

                        {item.simulated && (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-purple-100 text-purple-700">
                            Simulasi
                          </span>
                        )}

                        <span className="text-[11px] text-zinc-400 font-medium flex items-center gap-1 ml-auto md:ml-0">
                          <Clock size={11} /> {time.rel} ({time.exact})
                        </span>
                      </div>

                      {/* Error Message */}
                      <h4 className="font-bold text-zinc-900 text-sm leading-snug break-words">
                        {item.msg || item.message || "Unknown error"}
                      </h4>

                      {/* Component Stack or URL Preview */}
                      {item.url && (
                        <div className="text-[11px] text-zinc-500 font-mono truncate">
                          URL: {item.url}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Right Actions */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={async () => {
                        const snippet = `[${item.category || item.type}] ${item.msg || item.message}\nURL: ${
                          item.url || "-"
                        }\nStack:\n${item.stack || "-"}\nComponentStack:\n${item.componentStack || "-"}`;
                        await copyText(snippet);
                        toast.success("Cuplikan error disalin ke clipboard!");
                      }}
                      className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-800 hover:bg-zinc-100 transition"
                      title="Salin cuplikan error ini"
                    >
                      <Copy size={14} />
                    </button>

                    <button
                      onClick={() => setExpandedLogId(isExpanded ? null : item.id)}
                      className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-800 hover:bg-zinc-100 transition flex items-center gap-1 text-xs font-bold"
                    >
                      {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </button>
                  </div>
                </div>

                {/* Expanded Stack Trace & Diagnosis */}
                {isExpanded && (
                  <div className="mt-4 pt-3.5 border-t border-zinc-100 space-y-3">
                    {/* Diagnosis & Suggested Resolution */}
                    <div className="p-3 rounded-xl bg-zinc-50 border border-zinc-200/80 text-xs space-y-1">
                      <div className="font-bold text-zinc-800 flex items-center gap-1.5">
                        <Info size={13} className="text-zinc-600" />
                        Analisis &amp; Saran Tindakan:
                      </div>
                      <p className="text-zinc-600 leading-relaxed">
                        {cat === "connection_failure"
                          ? "Kegagalan komunikasi dengan backend API atau gateway internet. Pastikan server Raspberry Pi aktif, periksa WiFi tablet kasir, atau gunakan Fallback Server URL."
                          : cat === "publishing_failure"
                          ? "Browser mencoba memuat file JS bundle lama yang sudah berganti nama hash setelah publish. Lakukan Hard Reload (Ctrl+Shift+R) atau bersihkan cache browser."
                          : cat === "react_render_error"
                          ? "Global ErrorBoundary berhasil mengisolasi crash komponen agar sisa aplikasi kasir tetap bisa digunakan. Periksa Component Stack di bawah untuk melihat baris kode penyebab kegagalan."
                          : "Uncaught JavaScript exception di runtime browser."}
                      </p>
                    </div>

                    {/* Component Stack */}
                    {item.componentStack && (
                      <div>
                        <div className="text-[10px] font-bold text-indigo-900 uppercase tracking-wider mb-1">
                          Hierarki Komponen React (Component Stack):
                        </div>
                        <pre className="bg-indigo-950 text-indigo-200 text-[11px] font-mono p-3 rounded-xl overflow-x-auto whitespace-pre-wrap max-h-48 leading-relaxed">
                          {item.componentStack}
                        </pre>
                      </div>
                    )}

                    {/* JavaScript Stack Trace */}
                    {item.stack && (
                      <div>
                        <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1">
                          JavaScript Stack Trace:
                        </div>
                        <pre className="bg-zinc-950 text-emerald-400 text-[11px] font-mono p-3 rounded-xl overflow-x-auto whitespace-pre-wrap max-h-56 leading-relaxed">
                          {item.stack}
                        </pre>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
