// Pengaturan Aplikasi (business) — nilai yang bisa diubah admin tanpa kode.
// Disimpan di server (settings _id:"business") dan di-cache per perangkat agar
// tetap tersedia saat offline (nilai terakhir yang diketahui).
import api from "./api";

export const BIZ_DEFAULTS = {
  order_prefix: "GAK-",
  labels: { fnb: "F&B", retail: "Retail" },
  discount_reason_percent: 15,
  discount_reason_amount: 50000,
  member_earn_per_rupiah: 10000,
  member_redeem_per_point: 100,
  low_stock_threshold: 10,
  service_tax_percent: 0,
  transport_amount: 20000,
};

const KEY = "gak_biz_cache";

export function bizCache() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || "{}");
    const labels = { ...BIZ_DEFAULTS.labels, ...((raw && raw.labels) || {}) };
    return { ...BIZ_DEFAULTS, ...(raw || {}), labels };
  } catch (e) {
    return { ...BIZ_DEFAULTS, labels: { ...BIZ_DEFAULTS.labels } };
  }
}

export async function loadBusiness() {
  try {
    const { data } = await api.get("/settings/business");
    const merged = { ...BIZ_DEFAULTS, ...(data || {}), labels: { ...BIZ_DEFAULTS.labels, ...((data && data.labels) || {}) } };
    try { localStorage.setItem(KEY, JSON.stringify(merged)); } catch (e) {}
    return merged;
  } catch (e) {
    return bizCache();
  }
}

export function labelsOf(biz) {
  const l = (biz && biz.labels) || {};
  return { fnb: l.fnb || "F&B", retail: l.retail || "Retail" };
}
