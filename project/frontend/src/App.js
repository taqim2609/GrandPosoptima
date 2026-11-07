import "@/App.css";
import { useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "sonner";
import { checkOtaUpdate } from "@/lib/ota";
import { installDiag } from "@/lib/diag";
import { feat } from "@/lib/features";
import { loadPlatform } from "@/lib/platform";
import { AuthProvider } from "@/context/AuthContext";
import { OfflineProvider } from "@/context/OfflineContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import Layout from "@/components/Layout";
import OtaIndicator from "@/components/OtaIndicator";
import ErrorBoundary from "@/components/ErrorBoundary";

import Login from "@/pages/Login";
import POS from "@/pages/POS";
import Shift from "@/pages/Shift";
import Dashboard from "@/pages/Dashboard";
import Products from "@/pages/Products";
import Categories from "@/pages/Categories";
import Tables from "@/pages/Tables";
import Orders from "@/pages/Orders";
import VoidRefund from "@/pages/VoidRefund";
import UsersPage from "@/pages/Users";
import Inventory from "@/pages/Inventory";
import Cash from "@/pages/Cash";
import SettingsAI from "@/pages/SettingsAI";
import SettingsData from "@/pages/SettingsData";
import Settings from "@/pages/Settings";
import WhatsApp from "@/pages/WhatsApp";
import DeviceSettings from "@/pages/DeviceSettings";
import Catalog from "@/pages/Catalog";
import Ingredients from "@/pages/Ingredients";
import AssistantAI from "@/pages/AssistantAI";
import Reports from "@/pages/Reports";
import Members from "@/pages/Members";
import Reservations from "@/pages/Reservations";
import VendorSettlement from "@/pages/VendorSettlement";
import PromosCoupons from "@/pages/PromosCoupons";
import ArticlesAdmin from "@/pages/ArticlesAdmin";
import LandingPage from "@/pages/LandingPage";

const LoadingFallback = () => (
  <div className="flex h-full w-full items-center justify-center p-8 bg-[#F4F5F7] lg:bg-transparent">
    <div className="animate-spin h-8 w-8 border-4 border-[#E63946] border-t-transparent rounded-full"></div>
  </div>
);

// Penentu halaman muka: Di server Raspberry Pi, server lokal LAN toko, atau aplikasi Android APK Sunmi,
// rute utama (/) langsung membuka POS Kasir (/pos) tanpa landing page.
// Landing page publik hanya tampil saat dibuka di server Cloud online.
//
// Aturan pemisahan (disengaja): gudang-644 (IP Tailscale 100.x / domain *.ts.net) adalah host
// PUBLIK — di sana hanya landing page yang boleh tampil dan POS ditutup. POS hanya dibuka di
// node kasir (Pi/LAN/localhost) atau aplikasi APK. Kalau POS tetap bisa dibuka di host publik,
// siapa pun yang tahu URL-nya akan melihat layar login kasir.
function isPosAllowedHost(hostname) {
  if (typeof window !== "undefined" && (window.Capacitor?.isNativePlatform?.() || window.isNativeApp)) return true;
  if (typeof localStorage !== "undefined" && localStorage.getItem("gak_disable_landing_page") === "true") return true;
  if (process.env.REACT_APP_DISABLE_LANDING_PAGE === "true") return true;
  if (hostname === "localhost" || hostname === "127.0.0.1") return true;
  if (hostname.includes("raspberrypi") || hostname.includes("kasir-pi")) return true;
  if (hostname.endsWith(".local")) return true;
  if (/^192\.168\./.test(hostname)) return true;
  if (/^10\./.test(hostname)) return true;
  if (/^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(hostname)) return true;
  // Alamat tailnet khusus node kasir. Host publik (gudang-644) sengaja TIDAK masuk daftar.
  if (hostname === "100.109.98.56") return true;
  if (hostname === "kasir-pi.tailf3a839.ts.net") return true;
  return false;
}

function RootRoute() {
  const hostname = typeof window !== "undefined" ? window.location.hostname : "";

  if (isPosAllowedHost(hostname)) {
    return <Navigate to="/pos" replace />;
  }

  return <LandingPage />;
}

// Gerbang rute POS: menolak akses POS dari host publik, termasuk bila URL /pos diketik langsung
// atau dibuka dari bookmark lama. Tanpa ini, RootRoute saja tidak cukup karena /pos adalah rute
// terpisah yang tidak melewati RootRoute.
function PosGate({ children }) {
  const hostname = typeof window !== "undefined" ? window.location.hostname : "";
  if (!isPosAllowedHost(hostname)) {
    return <Navigate to="/" replace />;
  }
  return children;
}

// roles = role dasar yang boleh; mod = modul izin dinamis (RBAC) bila role dasar belum cukup.
// `key` statis per rute: crash pada satu layar tidak "menular" ke layar lain setelah navigasi.
const wrap = (el, roles, mod, key) => (
  <ProtectedRoute roles={roles} mod={mod}>
    <Layout>
      <ErrorBoundary key={key}>
        {el}
      </ErrorBoundary>
    </Layout>
  </ProtectedRoute>
);

function App() {
  useEffect(() => {
    // Dismiss gak-init-loader overlay once root component hydrates/mounts
    const loader = document.getElementById("gak-init-loader");
    if (loader) {
      loader.style.transition = "opacity 0.25s ease-out, visibility 0.25s ease-out";
      loader.style.opacity = "0";
      loader.style.pointerEvents = "none";
      setTimeout(() => {
        try {
          if (loader.parentNode) loader.parentNode.removeChild(loader);
        } catch (_) {}
      }, 300);
    }

    // Branding platform (nama/logo/warna tema) tanpa perlu deploy.
    loadPlatform().catch(() => {});
    // ota.autocheck bisa dimatikan dari Pengaturan → Fitur & Integrasi.
    if (feat("ota.autocheck")) checkOtaUpdate();
    installDiag();
    // Cek ulang OTA setiap kali app kembali aktif (Android: kembali dari background),
    // supaya update terpasang tanpa perlu restart penuh.
    const onVis = () => { if (document.visibilityState === "visible" && feat("ota.autocheck")) checkOtaUpdate(); };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);
  return (
    <div className="App">
      <AuthProvider>
        <OfflineProvider>
          <Toaster position="top-center" richColors />
          <OtaIndicator />
          <BrowserRouter>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/pos" element={<PosGate>{wrap(<POS />, ["admin", "kasir"], "pos", "pos")}</PosGate>} />
              <Route path="/shift" element={wrap(<Shift />, ["admin", "kasir"], "shift", "shift")} />
              <Route path="/cash" element={wrap(<Cash />, ["admin", "kasir"], "pengeluaran", "cash")} />
              <Route path="/dashboard" element={wrap(<Dashboard />, ["admin", "kasir", "input"], "dashboard", "dashboard")} />
              <Route path="/products" element={wrap(<Products />, ["admin", "input"], "produk", "products")} />
              <Route path="/inventory" element={wrap(<Inventory />, ["admin", "input"], "produk", "inventory")} />
              <Route path="/categories" element={wrap(<Categories />, ["admin", "input"], "produk", "categories")} />
              <Route path="/catalog" element={wrap(<Catalog />, ["admin", "input"], "produk", "catalog")} />
              <Route path="/ingredients" element={wrap(<Ingredients />, ["admin", "input"], ["produk", "belanja_bahan", "opname_bahan"], "ingredients")} />
              <Route path="/laporan" element={wrap(<Reports />, ["admin", "kasir"], "laporan", "laporan")} />
              <Route path="/members" element={wrap(<Members />, ["admin"], "member", "members")} />
              <Route path="/promos" element={<Navigate to="/promo-kupon" replace />} />
              <Route path="/promo-kupon" element={wrap(<PromosCoupons />, ["admin"], "promo", "promo-kupon")} />
              <Route path="/reservations" element={wrap(<Reservations />, ["admin", "kasir"], "reservasi", "reservations")} />
              <Route path="/settlement" element={wrap(<VendorSettlement />, ["admin", "kasir"], "settlement", "settlement")} />
              <Route path="/recipes" element={<Navigate to="/catalog?tab=resep" replace />} />
              <Route path="/coupons" element={<Navigate to="/promo-kupon?tab=kupon" replace />} />
              <Route path="/tanya-ai" element={<Navigate to="/asisten-ai" replace />} />
              <Route path="/asisten-ai" element={wrap(<AssistantAI />, ["admin", "kasir"], "ai", "asisten-ai")} />
              <Route path="/tables" element={wrap(<Tables />, ["admin"], "meja", "tables")} />
              <Route path="/orders" element={wrap(<Orders />, ["admin"], "transaksi", "orders")} />
              <Route path="/void" element={wrap(<VoidRefund />, ["admin", "kasir"], "void", "void")} />
              <Route path="/users" element={wrap(<UsersPage />, ["admin"], "pengguna", "users")} />
              <Route path="/settings-ai" element={wrap(<SettingsAI />, ["admin"], "pengaturan", "settings-ai")} />
              <Route path="/settings-data" element={wrap(<SettingsData />, ["admin"], "pengaturan", "settings-data")} />
              <Route path="/settings" element={wrap(<Settings />, ["admin", "superadmin", "kasir"], undefined, "settings")} />
              <Route path="/whatsapp" element={wrap(<WhatsApp />, ["admin"], "whatsapp", "whatsapp")} />
              <Route path="/device" element={wrap(<DeviceSettings />, undefined, undefined, "device")} />
              <Route path="/articles" element={wrap(<ArticlesAdmin />, ["admin", "input"], "produk", "articles")} />
              <Route path="/" element={<RootRoute />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </BrowserRouter>
        </OfflineProvider>
      </AuthProvider>
    </div>
  );
}

export default App;
