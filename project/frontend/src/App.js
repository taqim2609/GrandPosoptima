import "@/App.css";
import { useEffect, Suspense, lazy } from "react";
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

const Login = lazy(() => import("@/pages/Login"));
const POS = lazy(() => import("@/pages/POS"));
const Shift = lazy(() => import("@/pages/Shift"));
const Dashboard = lazy(() => import("@/pages/Dashboard"));
const Products = lazy(() => import("@/pages/Products"));
const Categories = lazy(() => import("@/pages/Categories"));
const Tables = lazy(() => import("@/pages/Tables"));
const Orders = lazy(() => import("@/pages/Orders"));
const VoidRefund = lazy(() => import("@/pages/VoidRefund"));
const UsersPage = lazy(() => import("@/pages/Users"));
const Inventory = lazy(() => import("@/pages/Inventory"));
const Cash = lazy(() => import("@/pages/Cash"));
const SettingsAI = lazy(() => import("@/pages/SettingsAI"));
const SettingsData = lazy(() => import("@/pages/SettingsData"));
const Settings = lazy(() => import("@/pages/Settings"));
const WhatsApp = lazy(() => import("@/pages/WhatsApp"));
const DeviceSettings = lazy(() => import("@/pages/DeviceSettings"));
const Catalog = lazy(() => import("@/pages/Catalog"));
const Ingredients = lazy(() => import("@/pages/Ingredients"));
const AssistantAI = lazy(() => import("@/pages/AssistantAI"));
const Reports = lazy(() => import("@/pages/Reports"));
const Members = lazy(() => import("@/pages/Members"));
const Reservations = lazy(() => import("@/pages/Reservations"));
const VendorSettlement = lazy(() => import("@/pages/VendorSettlement"));
const PromosCoupons = lazy(() => import("@/pages/PromosCoupons"));

const LoadingFallback = () => (
  <div className="flex h-full w-full items-center justify-center p-8 bg-[#F4F5F7] lg:bg-transparent">
    <div className="animate-spin h-8 w-8 border-4 border-[#E63946] border-t-transparent rounded-full"></div>
  </div>
);

// roles = role dasar yang boleh; mod = modul izin dinamis (RBAC) bila role dasar belum cukup.
const wrap = (el, roles, mod) => (
  <ProtectedRoute roles={roles} mod={mod}>
    <Layout>
      <Suspense fallback={<LoadingFallback />}>
        {el}
      </Suspense>
    </Layout>
  </ProtectedRoute>
);

function App() {
  useEffect(() => {
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
              <Route path="/login" element={<Suspense fallback={<LoadingFallback />}><Login /></Suspense>} />
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
              <Route path="/settings" element={wrap(<Settings />, ["admin"], ["pengaturan", "pengguna", "role_izin"])} />
              <Route path="/whatsapp" element={wrap(<WhatsApp />, ["admin"], "whatsapp")} />
              <Route path="/device" element={wrap(<DeviceSettings />)} />
              <Route path="/" element={<Navigate to="/pos" replace />} />
              <Route path="*" element={<Navigate to="/pos" replace />} />
            </Routes>
          </BrowserRouter>
        </OfflineProvider>
      </AuthProvider>
    </div>
  );
}

export default App;
