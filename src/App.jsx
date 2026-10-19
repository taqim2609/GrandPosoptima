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
import LandingPage from "@/pages/LandingPage";
import ArticlesAdmin from "@/pages/ArticlesAdmin";

const LoadingFallback = () => (
  <div className="flex h-full w-full items-center justify-center p-8 bg-[#F4F5F7] lg:bg-transparent">
    <div className="animate-spin h-8 w-8 border-4 border-[#E63946] border-t-transparent rounded-full"></div>
  </div>
);

// Penentu halaman muka: Di server Raspberry Pi, server lokal LAN toko, atau aplikasi Android APK Sunmi,
// rute utama (/) langsung membuka POS Kasir (/pos) tanpa landing page.
// Landing page publik hanya tampil saat dibuka di server Cloud online.
function RootRoute() {
  const isCapacitor = typeof window !== "undefined" && Boolean(window.Capacitor?.isNativePlatform?.() || window.isNativeApp);
  const hostname = typeof window !== "undefined" ? window.location.hostname : "";
  const search = typeof window !== "undefined" ? window.location.search : "";
  const isExplicitDisabled = typeof localStorage !== "undefined" && (localStorage.getItem("gak_disable_landing_page") === "true" || localStorage.getItem("gak_pos_mode") === "true");
  const isEnvDisabled = process.env.REACT_APP_DISABLE_LANDING_PAGE === "true";
  const isQueryPos = search.includes("pos=1") || search.includes("direct=1");

  if (isQueryPos && typeof localStorage !== "undefined") {
    localStorage.setItem("gak_disable_landing_page", "true");
  }

  // Deteksi lingkungan Raspberry Pi / Server Lokal Kasir / LAN toko / Tailscale:
  const isLocalOrPi =
    isCapacitor ||
    isExplicitDisabled ||
    isEnvDisabled ||
    isQueryPos ||
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname.includes("raspberrypi") ||
    hostname.endsWith(".local") ||
    /^192\.168\./.test(hostname) ||
    /^10\./.test(hostname) ||
    /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(hostname) ||
    /^100\./.test(hostname);

  if (isLocalOrPi) {
    return <Navigate to="/pos" replace />;
  }

  return <LandingPage />;
}

// roles = role dasar yang boleh; mod = modul izin dinamis (RBAC) bila role dasar belum cukup.
const wrap = (el, roles, mod) => (
  <ProtectedRoute roles={roles} mod={mod}>
    <Layout>
      <ErrorBoundary>
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
              <Route path="/pos" element={wrap(<POS />, ["admin", "kasir"], "pos")} />
              <Route path="/shift" element={wrap(<Shift />, ["admin", "kasir"], "shift")} />
              <Route path="/cash" element={wrap(<Cash />, ["admin", "kasir"], "pengeluaran")} />
              <Route path="/dashboard" element={wrap(<Dashboard />, ["admin", "kasir", "input"], "dashboard")} />
              <Route path="/products" element={wrap(<Products />, ["admin", "input"], "produk")} />
              <Route path="/inventory" element={wrap(<Inventory />, ["admin", "input"], "produk")} />
              <Route path="/categories" element={wrap(<Categories />, ["admin", "input"], "produk")} />
              <Route path="/catalog" element={wrap(<Catalog />, ["admin", "input"], "produk")} />
              <Route path="/ingredients" element={wrap(<Ingredients />, ["admin", "input"], ["produk", "belanja_bahan", "opname_bahan"])} />
              <Route path="/laporan" element={wrap(<Reports />, ["admin", "kasir"], "laporan")} />
              <Route path="/members" element={wrap(<Members />, ["admin"], "member")} />
              <Route path="/promos" element={<Navigate to="/promo-kupon" replace />} />
              <Route path="/promo-kupon" element={wrap(<PromosCoupons />, ["admin"], "promo")} />
              <Route path="/reservations" element={wrap(<Reservations />, ["admin", "kasir"], "reservasi")} />
              <Route path="/settlement" element={wrap(<VendorSettlement />, ["admin", "kasir"], "settlement")} />
              <Route path="/recipes" element={<Navigate to="/catalog?tab=resep" replace />} />
              <Route path="/coupons" element={<Navigate to="/promo-kupon?tab=kupon" replace />} />
              <Route path="/tanya-ai" element={<Navigate to="/asisten-ai" replace />} />
              <Route path="/asisten-ai" element={wrap(<AssistantAI />, ["admin", "kasir"], "ai")} />
              <Route path="/tables" element={wrap(<Tables />, ["admin"], "meja")} />
              <Route path="/orders" element={wrap(<Orders />, ["admin"], "transaksi")} />
              <Route path="/void" element={wrap(<VoidRefund />, ["admin", "kasir"], "void")} />
              <Route path="/users" element={wrap(<UsersPage />, ["admin"], "pengguna")} />
              <Route path="/settings-ai" element={wrap(<SettingsAI />, ["admin"], "pengaturan")} />
              <Route path="/settings-data" element={wrap(<SettingsData />, ["admin"], "pengaturan")} />
              <Route path="/settings" element={wrap(<Settings />, ["admin", "superadmin", "kasir"])} />
              <Route path="/whatsapp" element={wrap(<WhatsApp />, ["admin"], "whatsapp")} />
              <Route path="/device" element={wrap(<DeviceSettings />)} />
              <Route path="/articles" element={wrap(<ArticlesAdmin />, ["admin", "input"], "produk")} />
              <Route path="/menu" element={<LandingPage defaultSection="menu" />} />
              <Route path="/cerita" element={<LandingPage defaultSection="cerita" />} />
              <Route path="/reservasi" element={<LandingPage defaultSection="reservasi" />} />
              <Route path="/landing" element={<LandingPage />} />
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
