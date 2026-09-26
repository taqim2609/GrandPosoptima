import { useEffect, useState } from "react";
import api from "@/lib/api";

// Salinan default flag = sama dgn FEATURE_DEFAULTS di backend/server.py.
// FEAT_DEFAULTS dipakai bila cache lokal belum ada (render pertama sebelum fetch).
export const FEAT_KEY = "gak_feat_v2";
export const FEAT_DEFAULTS = {
  ai: { enabled: true, summary: true, vision: true, description: true, image: true, assistant: true, pos_chat: true },
  wa: { enabled: true },
  ota: { autocheck: true },
  update: { banner: true },
  perf: { cache_master: true, cache_reports: true },
  maint: { orphan_auto: false, integrity_auto: false },
  webhook: { enabled: false },
  dbg: { slowlog: false, metrics: true },
  guard: { breaker: true },
};

function walkDefault(path) {
  let cur = FEAT_DEFAULTS;
  for (const p of path.split(".")) {
    if (cur && typeof cur === "object" && p in cur) cur = cur[p];
    else return undefined;
  }
  return cur;
}

/** Baca satu flag bertitik secara sinkron (dari cache localStorage). */
export function feat(path) {
  try {
    const raw = localStorage.getItem(FEAT_KEY);
    const doc = raw ? JSON.parse(raw) : null;
    let cur = doc || FEAT_DEFAULTS;
    for (const p of path.split(".")) {
      if (cur && typeof cur === "object" && p in cur) cur = cur[p];
      else return walkDefault(path);
    }
    return cur;
  } catch (e) {
    return walkDefault(path);
  }
}

export function featBool(path) {
  return !!feat(path);
}

/** Ambil flag terbaru dari server & simpan; panggil setelah login / saat Layout mount. */
export async function loadFeatures() {
  try {
    const r = await api.get("/settings/features", { timeout: 8000 });
    const doc = r.data || {};
    localStorage.setItem(FEAT_KEY, JSON.stringify(doc));
    window.dispatchEvent(new Event("gak-feat"));
    return doc;
  } catch (e) {
    return null;
  }
}

/** Hook: me-render ulang komponen bila flag berubah (event gak-feat / storage antar-tab). */
export function useFeatures() {
  const [, setV] = useState(0);
  useEffect(() => {
    const h = () => setV((x) => x + 1);
    window.addEventListener("gak-feat", h);
    window.addEventListener("storage", h);
    return () => {
      window.removeEventListener("gak-feat", h);
      window.removeEventListener("storage", h);
    };
  }, []);
  return { feat, featBool };
}
