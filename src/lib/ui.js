/* ================================================================
   KUSTOMISASI UI (tanpa ubah kode) — konfigurasi dari server:
     menu      : urutan, sembunyikan, ganti nama menu
     dashboard : urutan kartu dashboard per role
     pos       : label tombol POS
   Sumber: GET /api/settings/ui (di-cache lokal). Semua komponen memakai
   helper di file ini supaya perubahan admin langsung berlaku.
   ================================================================ */
import { useEffect, useState } from "react";
import api from "@/lib/api";

export const UI_DEFAULT = { menu: { order: [], hidden: [], labels: {} }, pos: { labels: {} }, dashboard: { order: {} } };
const KEY = "gak_ui_config";

export function uiCache() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const j = JSON.parse(raw);
      return { ...UI_DEFAULT, ...j, menu: { ...UI_DEFAULT.menu, ...(j.menu || {}) }, pos: { ...UI_DEFAULT.pos, ...(j.pos || {}) }, dashboard: { ...UI_DEFAULT.dashboard, ...(j.dashboard || {}) } };
    }
  } catch (e) {}
  return { ...UI_DEFAULT };
}

let _cfg = uiCache();
const subs = new Set();
function emit() { subs.forEach((f) => f(_cfg)); }

export function getUI() { return _cfg; }

export function setUI(cfg) {
  _cfg = { ...UI_DEFAULT, ...(cfg || {}) };
  try { localStorage.setItem(KEY, JSON.stringify(_cfg)); } catch (e) {}
  emit();
}

export async function loadUI(force = false) {
  if (!force) {
    try {
      const r = await api.get("/settings/ui");
      setUI(r.data || {});
      return _cfg;
    } catch (e) { return _cfg; }
  }
  try {
    const r = await api.get("/settings/ui");
    setUI(r.data || {});
  } catch (e) {}
  return _cfg;
}

export function useUI() {
  const [cfg, setCfg] = useState(getUI());
  useEffect(() => {
    subs.add(setCfg);
    loadUI().catch(() => {});
    return () => subs.delete(setCfg);
  }, []);
  return cfg;
}

/* ---------- menu ---------- */
export function orderNav(items, cfg) {
  const menu = cfg?.menu || {};
  const rank = (to) => {
    const i = (menu.order || []).indexOf(to);
    return i === -1 ? 999 : i;
  };
  return [...items]
    .filter((n) => !(menu.hidden || []).includes(n.to))
    .map((n, i) => ({ n, i }))
    .sort((a, b) => (rank(a.n.to) - rank(b.n.to)) || (a.i - b.i))
    .map((x) => x.n);
}

export const navLabel = (item, cfg) => (cfg?.menu?.labels || {})[item.to] || item.label;

/* ---------- label POS ---------- */
export const POS_LABELS = [
  { key: "pay", label: "Tombol Bayar", def: "Bayar" },
  { key: "open_bill", label: "Tombol Simpan (open bill)", def: "Simpan" },
  { key: "bill", label: "Tombol Cetak Bill", def: "Bill" },
  { key: "clear", label: "Tombol Kosongkan", def: "Kosongkan" },
  { key: "total", label: "Label Total", def: "Total" },
];

export function posLabel(cfg, key, fallback) {
  const v = (cfg?.pos?.labels || {})[key];
  return (v && String(v).trim()) || fallback;
}

/* ---------- urutan kartu dashboard ---------- */
export function orderWidgets(ids, role, cfg) {
  const order = (cfg?.dashboard?.order || {})[role] || [];
  if (!order.length) return ids;
  const rank = (id) => { const i = order.indexOf(id); return i === -1 ? 999 : i; };
  return [...ids].map((id, i) => ({ id, i })).sort((a, b) => (rank(a.id) - rank(b.id)) || (a.i - b.i)).map((x) => x.id);
}
