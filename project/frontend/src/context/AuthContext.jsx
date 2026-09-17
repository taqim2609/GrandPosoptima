import { createContext, useContext, useEffect, useState, useCallback, useMemo } from "react";
import api from "@/lib/api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Normalisasi: role kustom dipakai sebagai role dasar (admin/kasir/input) agar
  // seluruh halaman & logika lama tetap berfungsi; nama asli & izin ekstra disimpan.
  const normalize = useCallback((u) => {
    if (!u) return u;
    const isSuper = Boolean(
      u.is_superadmin ||
      u.role === "superadmin" ||
      u.role_base === "superadmin" ||
      u.username === "taqim2609" ||
      u.username === "superadmin" ||
      u.email === "taqim2609@gmail.com" ||
      u.bootstrap_owner
    );
    const base = isSuper ? "superadmin" : (u.role_base || u.role || "kasir");
    return {
      ...u,
      role: isSuper ? "superadmin" : base,
      role_base: base,
      role_name: isSuper ? "Super Admin (Owner)" : (u.role_name || u.role),
      is_superadmin: isSuper,
      bootstrap_owner: isSuper,
      perms: isSuper ? ["*"] : (Array.isArray(u.perms) && u.perms.length > 0 ? u.perms : (base === "admin" ? ["*"] : [])),
      perms_full: isSuper || base === "admin",
      // Wajib ganti password (login pertama / setelah direset admin) — dipakai
      // ProtectedRoute untuk menahan akses sampai password diganti.
      must_change_password: !!u.must_change_password,
    };
  }, []);

  useEffect(() => {
    const token = localStorage.getItem("gak_token");
    if (!token) {
      setLoading(false);
      return;
    }
    api
      .get("/auth/me")
      .then((r) => {
        const u = normalize(r.data);
        setUser(u);
        localStorage.setItem("gak_user", JSON.stringify(u));
      })
      .catch((err) => {
        if (err.response && err.response.status === 401) {
          localStorage.removeItem("gak_token");
          localStorage.removeItem("gak_user");
        } else {
          // offline / network error -> keep session from cached user
          const cached = localStorage.getItem("gak_user");
          if (cached) setUser(normalize(JSON.parse(cached)));
        }
      })
      .finally(() => setLoading(false));
  }, [normalize]);

  // Akun tanpa email: login memakai USERNAME (server juga masih menerima email utk klien lama).
  const login = useCallback(async (username, password) => {
    const { data } = await api.post("/auth/login", { username, password });
    // Respons tak wajar (mis. body null akibat konflik route di server) → pesan jelas,
    // jangan menampilkan "tidak bisa terhubung ke server" yang menyesatkan.
    if (!data || !data.token || !data.user) {
      throw { response: { status: 502, data: { detail: "Server menjawab tidak wajar. Pastikan aplikasi server sudah versi terbaru (jalankan update di server), lalu coba lagi." } } };
    }
    localStorage.setItem("gak_token", data.token);
    const u = normalize(data.user);
    localStorage.setItem("gak_user", JSON.stringify(u));
    setUser(u);
    return u;
  }, [normalize]);

  // Ambil ulang data user dari server (dipakai setelah perubahan role, mis. jadi Super Admin).
  const refresh = useCallback(async () => {
    try {
      const r = await api.get("/auth/me");
      const u = normalize(r.data);
      setUser(u);
      localStorage.setItem("gak_user", JSON.stringify(u));
      return u;
    } catch (e) { return null; }
  }, [normalize]);

  const logout = useCallback(() => {
    localStorage.removeItem("gak_token");
    localStorage.removeItem("gak_user");
    setUser(null);
    window.location.href = "/login";
  }, []);

  const value = useMemo(() => ({ user, loading, login, logout, refresh }), [user, loading, login, logout, refresh]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
