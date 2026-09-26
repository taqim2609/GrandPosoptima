import axios from "axios";
import { getServerUrl } from "./api";
import { getBundleVersion } from "./versions";
import { logRuntimeErrorToFirestore, testFirestoreConnection } from "./firebase";

// ============================================================
// Diagnostik & Lapor Bug — menangkap error global + Firestore
// Error Monitoring & Telemetry untuk Remote Debugging.
// ============================================================

const MAX = 60;
export const errorLog = [];

// Event listeners for real-time diagnostic panel updates
const errorListeners = new Set();

export function subscribeErrorLog(listener) {
  if (typeof listener === "function") {
    errorListeners.add(listener);
    // Immediately call with current state
    try {
      listener([...errorLog]);
    } catch (_) {}
  }
  return () => errorListeners.delete(listener);
}

export function getRecentErrors() {
  return [...errorLog];
}

export function clearErrorLog() {
  errorLog.length = 0;
  notifyListeners();
}

function notifyListeners() {
  const snapshot = [...errorLog];
  errorListeners.forEach((fn) => {
    try {
      fn(snapshot);
    } catch (_) {}
  });
}

/**
 * Categorize error type accurately for staff diagnostics
 */
export function categorizeError(entry = {}) {
  const msg = String(entry.msg || entry.message || "").toLowerCase();
  const stack = String(entry.stack || "").toLowerCase();
  const type = String(entry.type || "").toLowerCase();
  const url = String(entry.url || "").toLowerCase();
  const status = Number(entry.status || 0);

  // 1. Publishing / Build / Chunk Asset Failures
  if (
    msg.includes("chunkloaderror") ||
    msg.includes("loading chunk") ||
    msg.includes("dynamically imported module") ||
    msg.includes("failed to fetch dynamically imported module") ||
    stack.includes("chunkloaderror") ||
    (url.includes("/assets/") && (status === 404 || status === 410)) ||
    type === "publishing_failure" ||
    type === "chunk_load_error"
  ) {
    return "publishing_failure";
  }

  // 2. Connection / Network Failures
  if (
    status === 0 ||
    status >= 500 ||
    msg.includes("network error") ||
    msg.includes("failed to fetch") ||
    msg.includes("err_connection_refused") ||
    msg.includes("networkrequestfailed") ||
    msg.includes("timeout") ||
    type === "api_network_error" ||
    type === "connection_failure"
  ) {
    return "connection_failure";
  }

  // 3. React Render Crashes (Error Boundary)
  if (type === "react_render_error" || entry.componentStack) {
    return "react_render_error";
  }

  // 4. Unhandled Promise Rejection
  if (type === "unhandled_rejection") {
    return "unhandled_rejection";
  }

  return "runtime_error";
}

/**
 * Detect persistent failure patterns to alert staff
 */
export function analyzePersistentFailures(logs = errorLog) {
  const now = Date.now();
  const fifteenMinsAgo = now - 15 * 60 * 1000;
  const recent = logs.filter((l) => {
    const t = l.t ? new Date(l.t).getTime() : 0;
    return t >= fifteenMinsAgo;
  });

  const connectionErrors = recent.filter((l) => categorizeError(l) === "connection_failure");
  const publishingErrors = recent.filter((l) => categorizeError(l) === "publishing_failure");
  const renderErrors = recent.filter((l) => categorizeError(l) === "react_render_error");

  const results = {
    hasPersistentFailure: false,
    alerts: [],
    stats: {
      totalRecent: recent.length,
      connectionFailures: connectionErrors.length,
      publishingFailures: publishingErrors.length,
      renderFailures: renderErrors.length,
    },
  };

  if (connectionErrors.length >= 3) {
    results.hasPersistentFailure = true;
    results.alerts.push({
      id: "persistent_connection",
      level: "critical",
      title: "Kegagalan Koneksi Terus Menerus",
      description: `Terdeteksi ${connectionErrors.length} kali kegagalan jaringan/API dalam 15 menit terakhir. Endpoint server atau gateway mungkin terputus.`,
      recommendation: "Periksa sambungan WiFi, pastikan server lokal / cloud aktif, atau gunakan Fallback Server di Pengaturan.",
    });
  }

  if (publishingErrors.length >= 1) {
    results.hasPersistentFailure = true;
    results.alerts.push({
      id: "persistent_publishing",
      level: "critical",
      title: "Ketidakcocokan Versi / Gagal Memuat Bundle (Publishing)",
      description: `Terdeteksi ${publishingErrors.length} kegagalan memuat chunk JavaScript baru (ChunkLoadError). Versi bundle di browser belum tersinkron dengan hasil publish terbaru.`,
      recommendation: "Klik 'Muat Ulang Paksa (Hard Reload)' untuk membersihkan cache browser dan memuat aset bundle produksi terbaru.",
    });
  }

  if (renderErrors.length >= 3) {
    results.hasPersistentFailure = true;
    results.alerts.push({
      id: "persistent_render",
      level: "warning",
      title: "Error Rendering Komponen Berulang",
      description: `Global Error Boundary telah menangkap ${renderErrors.length} crash komponen UI dalam 15 menit terakhir.`,
      recommendation: "Periksa detail Stack Trace komponen di bawah untuk melihat komponen mana yang memicu unhandled render exception.",
    });
  }

  return results;
}

// Throttler to prevent flooding Firestore on infinite loop errors
const recentErrorHashes = new Set();

function push(entry) {
  const msgLower = String(entry.msg || entry.message || "").toLowerCase();
  // Filter out normal expected Firestore offline transitions / retry notices
  if (
    msgLower.includes("@firebase/firestore") &&
    (msgLower.includes("could not reach cloud firestore backend") || msgLower.includes("code=unavailable"))
  ) {
    return;
  }

  const category = categorizeError(entry);
  const enriched = {
    id: `err_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    category,
    ...entry,
  };

  errorLog.push(enriched);
  if (errorLog.length > MAX) errorLog.shift();
  notifyListeners();

  // Send to Firestore remote debugging collection asynchronously
  const hash = `${enriched.category}_${enriched.msg}_${enriched.file || ""}_${enriched.line || ""}`;
  if (!recentErrorHashes.has(hash)) {
    recentErrorHashes.add(hash);
    setTimeout(() => recentErrorHashes.delete(hash), 15000); // 15s throttle per unique error

    logRuntimeErrorToFirestore({
      type: enriched.category || enriched.type,
      message: enriched.msg,
      stack: enriched.stack || "",
      componentStack: enriched.componentStack || "",
      file: enriched.file || "",
      line: enriched.line || 0,
      col: enriched.col || 0,
      url: enriched.url || (typeof window !== "undefined" ? window.location.href : ""),
      status: enriched.status,
      method: enriched.method,
    }).catch(() => {});
  }
}

export function logAppError(type, message, extra = {}) {
  const entry = {
    t: new Date().toISOString(),
    type: type || "custom_error",
    msg: String(message || ""),
    stack: extra.stack || "",
    componentStack: extra.componentStack || extra.component_stack || "",
    file: extra.file || "",
    line: extra.line || 0,
    col: extra.col || 0,
    url: extra.url || (typeof window !== "undefined" ? window.location.href : ""),
    ...extra,
  };
  push(entry);
}

let installed = false;
export function installDiag() {
  if (installed || typeof window === "undefined") return;
  installed = true;

  // Test Firestore connection on app startup
  testFirestoreConnection().then((res) => {
    if (!res.ok) {
      console.warn("[Firestore Monitor] Initial Firestore test connection note:", res.error);
    } else {
      console.info("[Firestore Monitor] Connected to Firestore error telemetry collection.");
    }
  });

  window.addEventListener("error", (e) => {
    const errorObj = e.error || {};
    push({
      t: new Date().toISOString(),
      type: "runtime_error",
      msg: e.message || String(e.error || "Unknown uncaught error"),
      stack: errorObj.stack || "",
      file: e.filename || "",
      line: e.lineno || 0,
      col: e.colno || 0,
    });
  });

  window.addEventListener("unhandledrejection", (e) => {
    const r = e && e.reason;
    let msg = "";
    let stack = "";
    try {
      msg = r && r.message ? r.message : String(r);
      stack = r && r.stack ? r.stack : "";
    } catch (_) {
      msg = "unknown unhandled rejection";
    }
    push({
      t: new Date().toISOString(),
      type: "unhandled_rejection",
      msg,
      stack,
    });
  });

  try {
    axios.interceptors.response.use(
      (res) => res,
      (err) => {
        const cfg = err.config || {};
        const status = err.response ? err.response.status : 0;
        let detail = err.message || "";
        try {
          const d = err.response && err.response.data && err.response.data.detail;
          if (d) detail = typeof d === "string" ? d : JSON.stringify(d);
        } catch (_) {}

        // Only log 5xx server failures or network disconnects to Firestore
        if (status >= 500 || status === 0 || !err.response) {
          push({
            t: new Date().toISOString(),
            type: "api_network_error",
            method: (cfg.method || "GET").toUpperCase(),
            url: cfg.url || "",
            status,
            msg: detail,
            stack: err.stack || "",
          });
        }
        return Promise.reject(err);
      }
    );
  } catch (_) {}
}

export async function buildDiagReport() {
  const out = [];
  const ts = new Date();
  out.push("=== LAPORAN DIAGNOSTIK Grand Aceh Kuliner POS ===");
  out.push(`Waktu: ${ts.toLocaleString("id-ID")} (${ts.toISOString()})`);
  out.push(`Bundle frontend: ${getBundleVersion()}`);
  try {
    const base = getServerUrl();
    // Via API dulu (jalur CORS pasti bekerja), fallback ke /ota/version.json
    let j = null;
    try {
      const u = base ? `${base}/api/ota/version` : "/api/ota/version";
      const r = await fetch(u, { cache: "no-store" });
      if (r.ok) j = await r.json();
    } catch (_) {}
    if (!j) {
      const url = base ? `${base}/ota/version.json` : "ota/version.json";
      j = await (await fetch(url, { cache: "no-store" })).json();
    }
    out.push(`OTA version (server): ${j?.version || "-"}`);
  } catch (_) { out.push("OTA version (server): (tidak terbaca)"); }
  try {
    const j = await (await fetch("ota/version.json", { cache: "no-store" })).json();
    out.push(`OTA bawaan APK (lokal): ${j.version || "-"}`);
  } catch (_) { out.push("OTA bawaan APK (lokal): (tidak terbaca)"); }
  try { out.push(`OTA terpasang (APK): ${localStorage.getItem("gak_ota_version") || "-"}`); } catch (_) {}
  out.push(`URL server: ${getServerUrl() || "(kosong - pakai origin web)"}`);

  let isNative = false;
  try { isNative = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()); } catch (_) {}
  out.push(`Platform: ${isNative ? "APK (Capacitor)" : "Web"}`);
  out.push(`User-Agent: ${navigator.userAgent || "-"}`);
  out.push(`Layar: ${(window.screen && window.screen.width) || "-"}x${(window.screen && window.screen.height) || "-"} (dpr ${window.devicePixelRatio || 1})`);
  out.push(`Bahasa: ${navigator.language || "-"} | Online: ${navigator.onLine ? "ya" : "tidak"}`);

  // Kesehatan server
  try {
    const base = getServerUrl();
    const url = base ? `${base}/api/health` : "/api/health";
    const t0 = performance.now();
    const r = await fetch(url, { cache: "no-store" });
    const ms = Math.round(performance.now() - t0);
    const j = await r.json().catch(() => ({}));
    out.push(`Server /api/health: HTTP ${r.status} (${ms}ms) -> ${JSON.stringify(j)}`);
  } catch (e) {
    out.push(`Server /api/health: GAGAL -> ${(e && e.message) || e}`);
  }

  // Versi server / update center
  try {
    const r = await axios.get("/api/update/check", { timeout: 12000 });
    const d = r.data || {};
    out.push(`Server mode: ${d.enabled ? "Google AI Studio" : "Lokal / Git"}`);
    out.push(`Versi server: ${d.current || "-"} | terbaru: ${d.latest || "-"}${d.updateAvailable ? " (UPDATE TERSEDIA)" : ""} | update center: ${d.updateCenterReachable ? "dijangkau" : "tidak dijangkau"}`);
  } catch (e) {
    const status = e.response && e.response.status;
    out.push(`Cek versi server: ${status === 401 ? "sesi login tidak aktif (401) — login ulang untuk melihat versi" : `gagal (${status || e.message})`}`);
  }

  out.push("");
  out.push("=== Error terakhir yang tertangkap ===");
  if (!errorLog.length) out.push("(tidak ada error tercatat)");
  errorLog.slice(-10).forEach((e) => {
    const where = e.line ? ` @${e.file}:${e.line}:${e.col}` : "";
    out.push(`[${e.t}] ${e.type.toUpperCase()} ${e.method || ""} ${e.url || ""} ${e.status || ""} -> ${e.msg}${where}`);
  });
  return out.join("\n");
}
