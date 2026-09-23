import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { Loader2, ShieldOff, LogOut } from "lucide-react";
import { can, canAny, roleBaseOf, isSuperAdmin } from "@/lib/rbac";
import { NAV_ITEMS } from "@/lib/navItems";
import ForceChangePassword from "@/components/ForceChangePassword";

export const homeFor = (role) =>
  role === "admin" || role === "superadmin" ? "/dashboard" : role === "input" ? "/products" : "/pos";

// Modul untuk halaman "rumah" tiap role dasar (dipakai memilih halaman tujuan
// bila halaman rumah itu sendiri tidak diizinkan).
const HOME_MOD = { "/dashboard": "dashboard", "/products": "produk", "/pos": "pos" };

/** Halaman pertama yang BOLEH dibuka user (dipakai saat mengalihkan akses ditolak).
 * Penting agar tidak terjadi lingkaran pengalihan ketika modul "dashboard" dicabut. */
export function landingFor(user) {
  if (isSuperAdmin(user)) return "/dashboard";
  const home = homeFor(roleBaseOf(user));
  const hm = HOME_MOD[home];
  if (hm && can(user, hm)) return home;
  const item = NAV_ITEMS.find((n) => canAny(user, n.mods || (n.mod ? [n.mod] : [])));
  return item ? item.to : null;
}

function NoAccess() {
  const { logout } = useAuth();
  return (
    <div className="h-screen grid place-items-center p-6 bg-[#F4F5F7]" data-testid="no-access">
      <div className="bg-white rounded-2xl border border-[#E4E4E7] p-8 max-w-md text-center">
        <ShieldOff size={36} className="mx-auto text-[#E63946]" />
        <h1 className="text-xl font-extrabold mt-3">Belum ada menu yang boleh diakses</h1>
        <p className="text-sm text-[#52525B] mt-2">
          Role akun ini belum diberi satu pun modul/menu. Minta <b>Super Admin</b> membuka
          Pengaturan → Pengguna → Roles &amp; Izin dan mencentang minimal satu menu.
        </p>
        <button onClick={logout} className="tap mt-5 h-11 px-4 rounded-xl bg-[#0A0A0A] text-white font-bold inline-flex items-center gap-2">
          <LogOut size={16} /> Keluar
        </button>
      </div>
    </div>
  );
}

export default function ProtectedRoute({ children, roles, mod }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading)
    return (
      <div className="h-screen flex items-center justify-center">
        <Loader2 className="animate-spin text-[#E63946]" size={40} />
      </div>
    );
  if (!user) return <Navigate to="/login" replace />;
  // Wajib ganti password (akun baru / role Stok Opname, atau setelah direset admin):
  // semua halaman ditahan sampai password diganti.
  if (user.must_change_password) return <ForceChangePassword />;
  // Bila halaman ini punya modul RBAC: daftar izin dari server yang menentukan
  // (termasuk role `admin` yang boleh dibatasi Super Admin). Tanpa modul → cek role lama.
  const allowed = mod
    ? (Array.isArray(mod) ? canAny(user, mod) : can(user, mod))
    : !roles || roles.includes(user.role);
  if (allowed) return children;
  const land = landingFor(user);
  if (land && land !== location.pathname) return <Navigate to={land} replace />;
  return <NoAccess />;
}
