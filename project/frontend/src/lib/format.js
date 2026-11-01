export const rupiah = (n) =>
  "Rp " + Math.round(Number(n || 0)).toLocaleString("id-ID");

export const ORDER_TYPE_LABEL = {
  dine_in: "Dine-In",
  take_away: "Take Away",
  retail: "Retail",
};

export const TYPE_LABEL = {
  makanan: "Makanan",
  minuman: "Minuman",
  retail: "Retail",
  vendor: "Vendor",
};

export const wibToday = () => new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);

// Zona waktu WIB (Asia/Jakarta) — format konsisten di semua perangkat tanpa
// bergantung pada zona waktu browser/sistem.
export const WIB_TZ = "Asia/Jakarta";
const WIB_OFFSET_MS = 7 * 3600 * 1000;

// Default setara dengan Date.prototype.toLocaleString("id-ID") (tanggal + jam,
// 2-digit) agar format tampilan tidak berubah, hanya zona waktunya.
const WIB_DEFAULT_OPTS = {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
};

/**
 * Format tanggal/waktu ke zona WIB (Asia/Jakarta).
 * @param {Date|string|number|null} input — input tanggal (Date/ISO string/timestamp). Null/undefined = now.
 * @param {Intl.DateTimeFormatOptions} [options] — opsi Intl.DateTimeFormat (dateStyle, timeStyle, day, month, year, hour, minute, second, dll).
 * @returns {string} — string terformat id-ID di zona WIB. "-" jika input tidak valid.
 */
export function formatWib(input, options) {
  const src = input == null || input === "" ? new Date() : new Date(input);
  const t = src.getTime();
  if (!Number.isFinite(t)) return "-";
  const opts = options || WIB_DEFAULT_OPTS;
  try {
    return new Intl.DateTimeFormat("id-ID", { timeZone: WIB_TZ, ...opts }).format(src);
  } catch (e) {
    // Fallback: perangkat tanpa data zona ICU — geser epoch ke UTC+7 lalu format sebagai UTC.
    try {
      return new Date(t + WIB_OFFSET_MS).toLocaleString("id-ID", { timeZone: "UTC", ...opts });
    } catch (e2) {
      return "-";
    }
  }
}
