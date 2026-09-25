/* ================================================================
   TEMA / BRANDING PLATFORM — nama aplikasi, logo, warna tema.
   Diubah admin di Pengaturan → Platform & Tampilan (tanpa deploy).
   Sumber: GET /api/app-info (publik, tanpa login) + cache lokal.
   Penerapan: CSS variables + stylesheet override untuk warna brand
   bawaan (#E63946 dll) yang tertanam di kelas Tailwind — jadi semua
   tombol/aksen ikut warna baru tanpa mengubah komponen satu per satu.
   ================================================================ */
import { useEffect, useState } from "react";
import { getServerUrl } from "@/lib/api";

export const PLATFORM_DEFAULTS = {
  app_name: "Grand Aceh Kuliner",
  tagline: "KULINER POS",
  primary: "#E63946",
  accent: "#F97316",
  logo_url: "",
  has_custom: false,
};
const KEY = "gak_platform_v2";

/* ---------- warna: utilitas kecil ---------- */
export function clamp255(n) { return Math.max(0, Math.min(255, Math.round(n))); }

export function hexToRgb(hex) {
  const h = String(hex || "").replace("#", "");
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return { r: 230, g: 57, b: 70 };
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

export function shade(hex, factor) {
  // factor 0..1 → semakin gelap (dicampur hitam)
  const { r, g, b } = hexToRgb(hex);
  const f = clamp255(factor * 100) / 100;
  return rgbHex(clamp255(r * (1 - f)), clamp255(g * (1 - f)), clamp255(b * (1 - f)));
}

export function rgbHex(r, g, b) {
  return "#" + [r, g, b].map((n) => clamp255(n).toString(16).padStart(2, "0")).join("");
}

export function isDarkHex(hex) {
  const { r, g, b } = hexToRgb(hex);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 < 0.62;
}

export function sanitizeThemeColor(hex, fallback) {
  const h = String(hex || "").trim();
  return /^#[0-9a-fA-F]{6}$/.test(h) ? h.toLowerCase() : fallback;
}

/* ---------- turunan warna dari primary + accent ---------- */
export function themePalette(p) {
  const primary = sanitizeThemeColor(p.primary, "#E63946");
  const accent = sanitizeThemeColor(p.accent, "#F97316");
  // pastikan cukup gelap supaya teks putih tetap terbaca
  const effPrimary = isDarkHex(primary) ? primary : shade(primary, 0.35);
  return {
    primary: effPrimary,
    accent,
    primaryDark: shade(effPrimary, 0.26), // hover
    side1: shade(effPrimary, 0.7),   // sidebar atas / login (default ~#450A0A)
    side2: shade(effPrimary, 0.45),  // sidebar tengah (default ~#7F1D1D)
    side3: shade(accent, 0.35),      // dasar sidebar (default ~#B45309)
  };
}

/* ---------- stylesheet override warna brand bawaan ---------- */
export function themeOverrideCss(p) {
  const pal = themePalette(p);
  const esc = (s) => s; // nilai di dalam [class*="..."] tidak perlu di-escape
  const rules = [
    [`[class*="bg-[#E63946]"]`, `background-color:${pal.primary} !important`],
    [`[class*="text-[#E63946]"]`, `color:${pal.primary} !important`],
    [`[class*="border-[#E63946]"]`, `border-color:${pal.primary} !important`],
    [`[class*="ring-[#E63946]"]`, `--tw-ring-color:${pal.primary} !important`],
    [`[class*="from-[#E63946]"]`, `--tw-gradient-from:${pal.primary} !important`],
    [`[class*="via-[#BE123C]"]`, `--tw-gradient-via:${pal.primaryDark} !important`],
    [`[class*="from-[#BE123C]"]`, `--tw-gradient-from:${pal.primaryDark} !important`],
    // kelas hover eksplisit (bukan pseudo) — hindari remap [class*=] utk #BE123C solid
    [`.hover\\:bg-\\[\\#BE123C\\]:hover`, `background-color:${pal.primaryDark} !important`],
    [`.hover\\:border-\\[\\#BE123C\\]:hover`, `border-color:${pal.primaryDark} !important`],
    [`[class*="to-[#F97316]"]`, `--tw-gradient-to:${pal.accent} !important`],
    [`[class*="text-[#B45309]"]`, `color:${pal.side3} !important`],
  ];
  if (!esc) void 0;
  return rules.map(([sel, decl]) => `${sel}{${decl}}`).join("\n");
}

/* ---------- muat & terapkan ---------- */
export function platformCache() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...PLATFORM_DEFAULTS, ...JSON.parse(raw) };
  } catch (e) {}
  return { ...PLATFORM_DEFAULTS };
}

async function fetchPlatform() {
  const res = await fetch(`${getServerUrl()}/api/app-info`, { cache: "no-store" });
  if (!res.ok) throw new Error("app-info " + res.status);
  const j = await res.json();
  const cfg = { ...PLATFORM_DEFAULTS, ...(j || {}) };
  try { localStorage.setItem(KEY, JSON.stringify(cfg)); } catch (e) {}
  return cfg;
}

export async function loadPlatform(force = false) {
  let cfg = force ? null : platformCache();
  if (force || !cfg?.app_name) {
    try {
      cfg = await fetchPlatform();
    } catch (e) {
      cfg = cfg || { ...PLATFORM_DEFAULTS };
    }
  } else {
    // refresh diam-diam supaya perubahan admin langsung terlihat di perangkat lain
    fetchPlatform().then(applyTheme).catch(() => {});
  }
  applyTheme(cfg);
  return cfg;
}

export function applyTheme(p) {
  const cfg = { ...PLATFORM_DEFAULTS, ...(p || {}) };
  const pal = themePalette(cfg);
  const el = document.documentElement;
  el.style.setProperty("--gak-p", pal.primary);
  el.style.setProperty("--gak-pd", pal.primaryDark);
  el.style.setProperty("--gak-a", pal.accent);
  el.style.setProperty("--gak-side1", pal.side1);
  el.style.setProperty("--gak-side2", pal.side2);
  el.style.setProperty("--gak-side3", pal.side3);
  let style = document.getElementById("gak-theme-css");
  if (!style) {
    style = document.createElement("style");
    style.id = "gak-theme-css";
    document.head.appendChild(style);
  }
  style.textContent = themeOverrideCss(cfg);
  document.title = `${cfg.app_name || "Grand Aceh Kuliner"} ${cfg.tagline || "POS"}`.trim();
  window.dispatchEvent(new CustomEvent("gak-platform", { detail: cfg }));
  try { localStorage.setItem(KEY, JSON.stringify(cfg)); } catch (e) {}
}

export function logoUrl(cfg) {
  const u = cfg?.logo_url || "";
  if (!u) return "";
  if (u.startsWith("data:") || u.startsWith("blob:") || /^https?:\/\//i.test(u)) return u;
  const srv = getServerUrl() || "";
  if (u.startsWith("/")) return srv ? `${srv}${u}` : u;
  return srv ? `${srv}/${u}` : `/${u}`;
}

/* ---------- hook ---------- */
export function usePlatform() {
  const [cfg, setCfg] = useState(() => platformCache());
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let dead = false;
    loadPlatform().then((c) => { if (!dead) { setCfg(c); setLoading(false); } });
    const onEv = (e) => { if (!dead) setCfg({ ...PLATFORM_DEFAULTS, ...(e.detail || {}) }); };
    window.addEventListener("gak-platform", onEv);
    return () => { dead = true; window.removeEventListener("gak-platform", onEv); };
  }, []);
  return { platform: cfg, loading, reload: () => loadPlatform(true).then(setCfg) };
}

export const brandTitle = (p) =>
  `${p?.app_name || PLATFORM_DEFAULTS.app_name} ${p?.tagline || PLATFORM_DEFAULTS.tagline}`.trim();
