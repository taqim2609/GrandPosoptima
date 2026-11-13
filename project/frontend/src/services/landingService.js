/* ================================================================
   LANDING PAGE SERVICE LAYER — Pi Frontend
   Grand Aceh Kuliner POS & Culinary Experience
   ================================================================
   Layanan terpusat untuk memuat, memperbarui, memvalidasi, dan
   menyingkronkan konfigurasi Landing Page publik dari API Gudang
   endpoint `/api/landing/*` (proxy via Nginx Pi ke Gudang:8000),
   serta cache penyimpanan lokal (LocalStorage).
   ================================================================ */

import { DEFAULT_LANDING_CONFIG } from "@/config/landing-page.config";
import { getServerUrl } from "@/lib/api";
import { useEffect, useState } from "react";

const STORAGE_KEY = "gak_landing_config_v2";
const UPDATE_EVENT_NAME = "gak_landing_config_updated";

// In-memory cache
let inMemoryConfig = null;
const listeners = new Set();

/**
 * Gabungkan data konfigurasi kustom dengan nilai default awal.
 */
export function mergeLandingDefaults(custom) {
  if (!custom || typeof custom !== "object") return DEFAULT_LANDING_CONFIG;
  return {
    ...DEFAULT_LANDING_CONFIG,
    ...custom,
    hero: { ...DEFAULT_LANDING_CONFIG.hero, ...(custom.hero || {}) },
    stats: { ...DEFAULT_LANDING_CONFIG.stats, ...(custom.stats || {}) },
    promo_banner: { ...DEFAULT_LANDING_CONFIG.promo_banner, ...(custom.promo_banner || {}) },
    contact_info: { ...DEFAULT_LANDING_CONFIG.contact_info, ...(custom.contact_info || {}) },
    reservation: { ...DEFAULT_LANDING_CONFIG.reservation, ...(custom.reservation || {}) },
    articles_header: { ...DEFAULT_LANDING_CONFIG.articles_header, ...(custom.articles_header || {}) },
    seo: { ...DEFAULT_LANDING_CONFIG.seo, ...(custom.seo || {}) },
  };
}

/**
 * Dapatkan cache lokal terbaru secara synchronous.
 */
export function getCachedLandingConfig() {
  if (inMemoryConfig) return inMemoryConfig;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      inMemoryConfig = mergeLandingDefaults(parsed);
      return inMemoryConfig;
    }
  } catch (e) {
    // abaikan error storage
  }
  return DEFAULT_LANDING_CONFIG;
}

/**
 * Simpan ke storage lokal dan beri tahu subscriber.
 */
function saveToLocalAndNotify(config) {
  const merged = mergeLandingDefaults(config);
  inMemoryConfig = merged;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
  } catch (e) {}

  // Pemicu event kustom untuk pembaruan waktu-nyata
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(UPDATE_EVENT_NAME, { detail: merged }));
  }

  listeners.forEach((cb) => {
    try {
      cb(merged);
    } catch (e) {}
  });

  return merged;
}

/**
 * Service Layer: Memuat konfigurasi landing page dari store node.
 * Endpoint: GET /api/public/landing-config
 */
export async function fetchLandingConfig(forceServer = false) {
  if (!forceServer && inMemoryConfig) {
    // Tetap ambil versi terbaru secara diam-diam di latar belakang
    fetchLandingConfigFromServer().catch(() => {});
    return inMemoryConfig;
  }

  const serverResult = await fetchLandingConfigFromServer();
  if (serverResult) return serverResult;

  return getCachedLandingConfig();
}

/**
 * Pengambil data internal dari store landing page milik node app.
 * GET /api/public/landing-config — publik, tanpa kredensial backend.
 * (Backend FastAPI /api/landing/config menuntut header X-API-Key yang tidak pernah
 * dikirim klien, sehingga jalur itu selalu 401. Store node sudah jadi sumbernya.)
 */
async function fetchLandingConfigFromServer() {
  try {
    const srv = getServerUrl();
    const res = await fetch(`${srv}/api/public/landing-config`, {
      method: "GET",
      headers: {
        "Cache-Control": "no-cache",
        "Content-Type": "application/json",
      },
    });

    if (res.ok) {
      const data = await res.json();
      if (data && typeof data === "object" && Object.keys(data).length > 0) {
        return saveToLocalAndNotify(data);
      }
    }
  } catch (err) {
    console.warn("[LandingService] Menggunakan cache lokal saat server tidak merespons:", err.message);
  }
  return null;
}

/**
 * Service Layer: Memperbarui konfigurasi landing page ke store node.
 * POST /api/settings/landing-page — butuh token admin (requireAdmin).
 */
export async function updateLandingConfig(updatedConfig) {
  const merged = mergeLandingDefaults(updatedConfig);
  saveToLocalAndNotify(merged);

  let successServer = false;
  try {
    const srv = getServerUrl();
    // Auth token from localStorage for authenticated requests
    const token = getAuthToken();
    const headers = {
      "Content-Type": "application/json",
    };
    if (token) headers["Authorization"] = `Bearer ${token}`;

    const res = await fetch(`${srv}/api/settings/landing-page`, {
      method: "POST",
      headers,
      body: JSON.stringify(merged),
    });

    if (res.ok) {
      const json = await res.json();
      if (json && json.data) {
        saveToLocalAndNotify(json.data);
      }
      successServer = true;
    }
  } catch (err) {
    console.warn("[LandingService] Gagal menyimpan ke server, disimpan di cache lokal:", err.message);
  }

  return { config: inMemoryConfig, successServer };
}

/**
 * Ambil token auth dari localStorage
 */
function getAuthToken() {
  try {
    if (typeof localStorage !== "undefined") {
      return localStorage.getItem("gak_token") || localStorage.getItem("token") || "";
    }
  } catch (_) {}
  return "";
}

/**
 * Service Layer: Mengembalikan konfigurasi landing page ke setelan default awal.
 * POST /api/settings/landing-page dengan DEFAULT_LANDING_CONFIG
 */
export async function resetLandingConfigService() {
  saveToLocalAndNotify(DEFAULT_LANDING_CONFIG);
  try {
    const srv = getServerUrl();
    const token = getAuthToken();
    const headers = {
      "Content-Type": "application/json",
    };
    if (token) headers["Authorization"] = `Bearer ${token}`;

    await fetch(`${srv}/api/settings/landing-page`, {
      method: "POST",
      headers,
      body: JSON.stringify(DEFAULT_LANDING_CONFIG),
    });
  } catch (e) {}

  return DEFAULT_LANDING_CONFIG;
}

/**
 * Langganan perubahan konfigurasi (Pub/Sub).
 */
export function subscribeLandingConfig(callback) {
  listeners.add(callback);
  return () => {
    listeners.delete(callback);
  };
}

/**
 * React Hook: `useLandingConfig()`
 * Digunakan oleh komponen untuk mengonsumsi dan menyinkronkan state landing page secara otomatis.
 */
export function useLandingConfig() {
  const [config, setConfig] = useState(() => getCachedLandingConfig());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    // Load awal dari server / cache
    fetchLandingConfig().then((cfg) => {
      if (active) {
        setConfig(cfg);
        setLoading(false);
      }
    });

    // Langganan pembaruan realtime dari event lokal / inter-tab
    const unsubscribe = subscribeLandingConfig((newCfg) => {
      if (active) setConfig(newCfg);
    });

    const handleCustomEvent = (e) => {
      if (active && e.detail) {
        setConfig(e.detail);
      }
    };

    window.addEventListener(UPDATE_EVENT_NAME, handleCustomEvent);

    return () => {
      active = false;
      unsubscribe();
      window.removeEventListener(UPDATE_EVENT_NAME, handleCustomEvent);
    };
  }, []);

  return {
    config,
    loading,
    refresh: () => fetchLandingConfig(true).then(setConfig),
    save: (data) => updateLandingConfig(data),
    reset: () => resetLandingConfigService().then(setConfig),
  };
}