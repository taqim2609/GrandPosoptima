import axios from "axios";
import { getServerUrl } from "./api";
import { getBundleVersion } from "./versions";
import { logRuntimeErrorToFirestore, testFirestoreConnection } from "./firebase";

// ============================================================
// Diagnostik & Lapor Bug — menangkap error global + Firestore
// Error Monitoring & Telemetry untuk Remote Debugging.
// ============================================================

const MAX = 50;
export const errorLog = [];

// Throttler to prevent flooding Firestore on infinite loop errors
const recentErrorHashes = new Set();

function push(entry) {
  errorLog.push(entry);
  if (errorLog.length > MAX) errorLog.shift();

  // Send to Firestore remote debugging collection asynchronously
  const hash = `${entry.type}_${entry.msg}_${entry.file || ""}_${entry.line || ""}`;
  if (!recentErrorHashes.has(hash)) {
    recentErrorHashes.add(hash);
    setTimeout(() => recentErrorHashes.delete(hash), 15000); // 15s throttle per unique error

    logRuntimeErrorToFirestore({
      type: entry.type,
      message: entry.msg,
      stack: entry.stack || "",
      file: entry.file || "",
      line: entry.line || 0,
      col: entry.col || 0,
      url: entry.url || (typeof window !== "undefined" ? window.location.href : ""),
      status: entry.status,
      method: entry.method,
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
