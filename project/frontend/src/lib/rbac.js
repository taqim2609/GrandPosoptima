/* ================================================================
   RBAC FRONTEND — daftar modul/izin selaras dgn backend (server.py)
   Data pengguna (dari /auth/me & /auth/login) sudah memuat:
     role       = role dasar (admin/kasir/input) — utk kompatibilitas lama
     role_name  = nama role asli (bisa role kustom, mis. "Supervisor")
     role_base  = role dasar (admin/kasir/input)
     perms      = izin modul EKSTRA yang diberikan admin
   Backend server.py: BUILTIN_ROLES, RBAC_BASE_MODULES, RBAC_MODULE_LABELS,
   RBAC_PATH_MODULE — JAGA TETAP SINKRON bila mengubah di salah satu sisi.
   ================================================================ */

export const RBAC_MODULES = [
  { code: "dashboard", label: "Dashboard", base: ["admin", "kasir", "input"] },
  { code: "pos", label: "POS Kasir", base: ["admin", "kasir"] },
  { code: "pengeluaran", label: "Pengeluaran & Kas", base: ["admin", "kasir"] },
  { code: "shift", label: "Shift", base: ["admin", "kasir"] },
  { code: "laporan", label: "Laporan", base: ["admin", "kasir"] },
  { code: "ai", label: "AI / Asisten", base: ["admin", "kasir"] },
  { code: "reservasi", label: "Reservasi Meja", base: ["admin", "kasir"] },
  { code: "produk", label: "Produk, Kategori & Stok", base: ["admin", "input"] },
  { code: "member", label: "Member & Poin", base: ["admin"] },
  { code: "promo", label: "Promo", base: ["admin"] },
  { code: "resep", label: "Resep & HPP", base: ["admin"] },
  // Pembayaran bagi hasil ke vendor (rekap harian + bukti pembayaran) — kasir boleh (kas laci)
  { code: "settlement", label: "Settlement Vendor (bagi hasil)", base: ["admin", "kasir"] },
  { code: "kupon", label: "Kupon", base: ["admin"] },
  { code: "meja", label: "Manajemen Meja", base: ["admin"] },
  { code: "transaksi", label: "Riwayat Transaksi", base: ["admin"] },
  // Pembatalan/refund transaksi: kasir boleh (hanya pada shift berjalan — koreksi lintas
  // shift tetap hanya admin). Sinkron dgn RBAC_MODULE_LABELS backend.
  { code: "void", label: "Void & Refund (pembatalan transaksi)", base: ["admin", "kasir"] },
  { code: "vendor", label: "Vendor", base: ["admin"] },
  // "pengguna" = kelola AKUN (buat akun, reset password, aktif/nonaktif)
  { code: "pengguna", label: "Akun Pengguna", base: ["admin"] },
  // "role_izin" = LIHAT daftar Role & Izin (read-only); menyimpan tetap hanya Super Admin
  { code: "role_izin", label: "Roles & Izin (lihat saja)", base: [] },
  { code: "whatsapp", label: "WhatsApp", base: ["admin"] },
  { code: "pengaturan", label: "Pengaturan Aplikasi/Platform", base: ["admin"] },
  { code: "belanja_bahan", label: "Pembelian Bahan & Daftar Belanja", base: [] },
  { code: "opname_bahan", label: "Stok Opname Bahan", base: [] },
  { code: "belanja_produk", label: "Belanja / Pembelian Produk Retail", base: [] },
  { code: "opname_produk", label: "Stok Opname Produk Retail", base: [] },
];

export const BASE_MODULES = {
  superadmin: null, // semua (owner)
  admin: null, // semua
  kasir: ["dashboard", "pos", "pengeluaran", "shift", "laporan", "ai", "reservasi", "settlement", "void"],
  input: ["dashboard", "produk"],
  // Input Pembayaran: mencatat pembayaran/pengeluaran kas
  input_pembayaran: ["dashboard", "pengeluaran"],
  // Stok Opname: hitung stok bahan & produk retail
  stok_opname: ["dashboard", "produk", "opname_bahan", "opname_produk"],
};

export const ROLE_LABELS = {
  superadmin: "Super Admin (owner)",
  admin: "Admin",
  kasir: "Kasir",
  input: "Staf Input",
  input_pembayaran: "Input Pembayaran",
  stok_opname: "Stok Opname",
};

/** Urutan tampilan role bawaan (dipakai di daftar peran & pengguna). */
export const BUILTIN_ROLE_ORDER = ["superadmin", "admin", "kasir", "input", "input_pembayaran", "stok_opname"];

export const moduleLabel = (code) => RBAC_MODULES.find((m) => m.code === code)?.label || code;

export const isSuperAdmin = (u) => {
  if (!u) return false;
  const cleanUser = (u.username || "").replace(/[\s_-]+/g, "").toLowerCase();
  const cleanEmail = (u.email || "").toLowerCase();
  const cleanName = (u.name || "").replace(/[\s_-]+/g, "").toLowerCase();
  const rawRole = (u.role || "").trim().toLowerCase();
  const rawBase = (u.role_base || "").trim().toLowerCase();

  return Boolean(
    u.is_superadmin ||
    rawRole === "superadmin" ||
    rawBase === "superadmin" ||
    cleanUser === "taqim2609" ||
    cleanUser === "taqim" ||
    cleanUser.includes("taqim") ||
    cleanEmail === "taqim2609@gmail.com" ||
    cleanEmail.includes("taqim") ||
    cleanName.includes("taqim")
  );
};

/** Nama role yang ditampilkan (role kustom ditampilkan sebagai nama aslinya). */
export function roleNameOf(u) {
  if (isSuperAdmin(u)) return "Super Admin (owner)";
  const orig = u?.role_name || u?.role || "-";
  const base = u?.role_base || u?.role;
  if (orig && orig !== base && !["admin", "kasir", "input"].includes(orig)) return orig;
  return ROLE_LABELS[base] || base || orig;
}

/** Role dasar sebuah user (dipakai utk logika lama yang cek "admin"/"kasir"). */
export function roleBaseOf(u) {
  if (isSuperAdmin(u)) return "superadmin";
  return u?.role_base || u?.role || "kasir";
}

/** Apakah role dasar memegang modul tanpa izin ekstra? (dipakai template/reset saja) */
export function baseHas(u, mod) {
  if (isSuperAdmin(u)) return true;
  const b = roleBaseOf(u);
  if (b === "admin" || b === "superadmin") return true;
  return (BASE_MODULES[b] || []).includes(mod);
}

/** Izin total (FULL CUSTOM): perms dari /auth/me sudah = daftar PENUH modul yang
 * boleh diakses role — TERMASUK role `admin` (yang sekarang boleh dibatasi Super
 * Admin di Pengaturan → Roles & Izin). Super Admin (owner) selalu semua.
 *
 * Catatan penting:
 * - admin yang BELUM dibatasi juga mengirim daftar penuh (semua modul) → tidak perlu
 *   pengecualian khusus, cukup pakai daftarnya.
 * - Daftar KOSONG diperlakukan sebagai data basi (server SELALU mengirim daftar penuh &
 *   backend menolak menyimpan admin tanpa modul) supaya akun admin tidak terkunci total
 *   hanya karena sesi lama di localStorage. Server tetap penentu akhir. */
export function can(u, mod) {
  if (!u) return false;
  if (isSuperAdmin(u)) return true;
  const p = Array.isArray(u.perms) ? u.perms : [];
  if (p.includes("*")) return true;
  if (u.perms_full === true && p.length > 0) return p.includes(mod);
  // Sesi lama / server lama (tanpa daftar izin): perilaku lama dipertahankan.
  if (roleBaseOf(u) === "admin") return true;
  if (p.includes(mod)) return true;
  return baseHas(u, mod);
}

/** Izin menulis admin (mis. tombol hapus/ubah) — hanya utk role dasar admin atau superadmin. */
export const isAdmin = (u) => isSuperAdmin(u) || roleBaseOf(u) === "admin";

/** Izin: user punya salah satu modul dari daftar (untuk menu multi-izin). */
export const canAny = (u, mods) => (mods || []).some((m) => can(u, m));
