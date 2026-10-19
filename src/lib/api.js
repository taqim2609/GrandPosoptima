import axios from "axios";

// Standard preset servers for hybrid architecture
export const SERVER_PRESETS = [
  {
    id: "frontend_app_server",
    name: "Server Frontend & POS App (UI Web Kasir)",
    subname: "Port 3000 (Vite / React SPA / Local Engine)",
    defaultUrl: "http://pos.local:3000",
    badge: "Frontend & UI App",
    badgeColor: "bg-purple-50 text-purple-700 border-purple-200",
    description: "Server khusus menyajikan Antarmuka Web Kasir (Frontend SPA), PWA, dan Offline-First Queue (Tanpa DB Utama).",
    iconType: "server",
  },
  {
    id: "vps_database_server",
    name: "Server VPS Database Khusus (Remote DB Only)",
    subname: "Port 8000 / Dedicated DB Endpoint (FastAPI + MongoDB/PostgreSQL)",
    defaultUrl: "http://100.117.186.13:8000",
    badge: "Database Murni (No Frontend)",
    badgeColor: "bg-emerald-50 text-emerald-700 border-emerald-200",
    description: "Server VPS backend khusus database 24/7. Murni melayani query data, transaksi, dan REST API tanpa menyajikan file frontend.",
    iconType: "database",
  },
  {
    id: "cloud",
    name: "Server Standby Hybrid",
    subname: "Server Mandiri (Port 3000)",
    defaultUrl: "", // relative / current origin
    badge: "Hybrid Standby",
    badgeColor: "bg-blue-50 text-blue-700 border-blue-200",
    description: "Node terpadu siaga otomatis saat koneksi langsung ke VPS DB mengalami gangguan.",
    iconType: "cloud",
  },
];

// Runtime-configurable backend root so the SAME web build / Android APK can point to
// ANY local server IP (LAN) without rebuilding.
// Priority: saved server URL (localStorage) > build-time env > relative "" (same-origin via nginx).
export function getServerUrl() {
  try {
    const s = localStorage.getItem("gak_server_url");
    if (s !== null && s !== undefined) return s.replace(/\/+$/, "");
  } catch (e) {}
  return (process.env.REACT_APP_BACKEND_URL || "").replace(/\/+$/, "");
}

export function setServerUrl(url) {
  const clean = (url || "").trim().replace(/\/+$/, "");
  try {
    if (clean) localStorage.setItem("gak_server_url", clean);
    else localStorage.removeItem("gak_server_url");
  } catch (e) {}
  // Update current axios instance immediately
  if (api && api.defaults) {
    api.defaults.baseURL = `${clean}/api`;
  }
}

// Check which preset corresponds to the current server URL
export function getActiveServerPreset(currentUrl = getServerUrl()) {
  const clean = (currentUrl || "").replace(/\/+$/, "");
  if (!clean) return "cloud";
  if (clean.includes("100.117.186.13") || clean.includes("gudang-644")) return "hermes_tailscale";
  if (clean.includes("localhost") || clean.includes("127.0.0.1") || clean.includes(":8000")) return "hermes_local";
  if (clean.includes(".ts.net") || clean.includes("tailscale")) return "tailscale_funnel";
  return "custom";
}

// Probe one server base URL for health and latency
export async function probeServer(base, timeoutMs = 2500) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  const start = performance.now();
  try {
    const cleanBase = (base || "").trim().replace(/\/+$/, "");
    let healthUrl = "";
    if (!cleanBase) {
      healthUrl = typeof window !== "undefined" && window.location?.origin
        ? `${window.location.origin}/api/health`
        : "/api/health";
    } else {
      healthUrl = `${cleanBase}/api/health`;
    }

    let res = await fetch(healthUrl, { signal: ctrl.signal, cache: "no-store" }).catch(() => null);
    if (!res || !res.ok) {
      if (cleanBase) {
        res = await fetch(`${cleanBase}/health`, { signal: ctrl.signal, cache: "no-store" }).catch(() => null);
      }
    }

    const latency = Math.round(performance.now() - start);
    if (!res || !res.ok) {
      return { ok: false, latency, error: res ? `HTTP ${res.status}` : "Tidak terjangkau" };
    }
    const j = await res.json().catch(() => null);
    const valid = j && (j.app === "gak-pos" || j.ok || j.status === "ok" || j.healthy === true || j.status === "healthy" || j.service || j.db === true);
    return {
      ok: !!valid,
      latency,
      data: j,
      error: valid ? null : "Bukan server Grand Aceh POS",
    };
  } catch (e) {
    const latency = Math.round(performance.now() - start);
    return {
      ok: false,
      latency,
      error: e.name === "AbortError" ? "Waktu tunggu habis (Timeout)" : (e.message || "Tidak terjangkau"),
    };
  } finally {
    clearTimeout(t);
  }
}

// Legacy probe compatibility
async function probe(base, timeoutMs = 1500) {
  const res = await probeServer(base, timeoutMs);
  return res.ok;
}

// Auto-discover the POS server on the local network.
// Tries mDNS hostnames + common gateway IPs. Returns the base URL or null.
export async function discoverServer(onProgress) {
  const hosts = [
    "grandpos.local", "pos.local", "grandaceh.local", "raspberrypi.local",
  ];
  const subnets = ["192.168.1", "192.168.0", "192.168.100", "10.0.0"];
  const lastOctets = ["1", "2", "10", "11", "100", "200", "50"];
  const candidates = [];
  // current origin first (app served from server)
  if (typeof window !== "undefined" && window.location?.origin?.startsWith("http")) {
    candidates.push(window.location.origin);
  }
  hosts.forEach((h) => candidates.push(`http://${h}`));
  subnets.forEach((s) => lastOctets.forEach((o) => candidates.push(`http://${s}.${o}`)));

  let done = 0;
  const total = candidates.length;
  // Probe all candidates in parallel; first valid POS server wins (much faster than sequential).
  return await new Promise((resolve) => {
    let remaining = total;
    let settled = false;
    candidates.forEach((base) => {
      probe(base).then((ok) => {
        done += 1;
        if (onProgress) onProgress(done, total, base);
        if (ok && !settled) { settled = true; resolve(base); }
        remaining -= 1;
        if (remaining === 0 && !settled) resolve(null);
      });
    });
  });
}

const api = axios.create({
  baseURL: `${getServerUrl()}/api`,
});

api.interceptors.request.use((cfg) => {
  const t = localStorage.getItem("gak_token");
  if (t) cfg.headers.Authorization = `Bearer ${t}`;
  cfg.headers["X-API-Key"] = process.env.REACT_APP_GRANDPOS_API_KEY || "65325897d59d3d5d5e0b86a69e818dffc9d051aee365193b8c1dda174ada551b";
  return cfg;
});

api.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err.response?.status === 401 && !window.location.pathname.includes("login")) {
      localStorage.removeItem("gak_token");
      window.location.href = "/login";
    }
    return Promise.reject(err);
  }
);

export function apiError(detail) {
  if (detail == null) return "Terjadi kesalahan. Coba lagi.";
  if (typeof detail === "string") {
    const s = detail.trim();
    // Ignore non-JSON gateway/HTML error pages (e.g. Cloudflare 5xx)
    if (/<\/?html|<!doctype|cloudflare|origin web server/i.test(s)) {
      return "Terjadi kesalahan pada server. Coba lagi.";
    }
    return s;
  }
  if (Array.isArray(detail)) return detail.map((e) => e?.msg || JSON.stringify(e)).join(" ");
  return detail?.msg || String(detail);
}

export default api;
