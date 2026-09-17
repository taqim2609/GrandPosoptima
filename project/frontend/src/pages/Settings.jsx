import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import UsersPage from "@/pages/Users";
import Tables from "@/pages/Tables";
import SettingsAI from "@/pages/SettingsAI";
import SettingsData from "@/pages/SettingsData";
import SettingsBusiness from "@/pages/SettingsBusiness";
import SettingsReport from "@/pages/SettingsReport";
import SettingsInstaller from "@/pages/SettingsInstaller";
import SettingsIntegrations from "@/pages/SettingsIntegrations";
import SettingsCustomWidgets from "@/pages/SettingsCustomWidgets";
import SettingsPlatform from "@/pages/SettingsPlatform";
import SettingsUI from "@/pages/SettingsUI";
import SettingsRoles from "@/pages/SettingsRoles";
import WhatsAppReport from "@/pages/WhatsAppReport";
import DeviceSettings from "@/pages/DeviceSettings";
import Diagnostik from "@/pages/Diagnostik";
import Integritas from "@/pages/Integritas";
import AppVersi from "@/pages/AppVersi";
import SystemHealth from "@/pages/SystemHealth";
import SubTabs from "@/components/SubTabs";
import ErrorBoundary from "@/components/ErrorBoundary";
import {
  Users, Armchair, Sparkles, Trash2, MessageCircle, Download, Printer, Bug, Box,
  Settings2, SlidersHorizontal, LayoutGrid, Palette, ShieldCheck, LayoutTemplate,
  Activity, Store, DatabaseBackup,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { can } from "@/lib/rbac";

/* ---------------- Pengguna (Akun Pengguna | Roles & Izin) ---------------- */
function UsersTab() {
  const { user } = useAuth();
  const items = [];
  if (can(user, "pengguna")) items.push({ key: "accounts", label: "Akun Pengguna", icon: Users, comp: UsersPage });
  if (can(user, "role_izin") || user?.is_superadmin || user?.bootstrap_owner)
    items.push({ key: "roles", label: "Peran & Hak Akses", icon: ShieldCheck, comp: SettingsRoles });
  if (!items.length)
    return (
      <div className="p-6 text-sm text-[#52525B]" data-testid="users-no-perm">
        Role akun ini tidak punya izin <b>Akun Pengguna</b> maupun <b>Peran &amp; Hak Akses</b>.
      </div>
    );
  return <SubTabs items={items} testid="users-subtab" />;
}

/* ------------- Tampilan & Tema (Branding & Warna | Tata Letak Menu UI) ------------- */
function PlatformTab() {
  return (
    <SubTabs
      items={[
        { key: "identity", label: "Branding & Tema Warna", icon: Palette, comp: SettingsPlatform },
        { key: "menu", label: "Tata Letak & Menu UI", icon: LayoutTemplate, comp: SettingsUI },
      ]}
      testid="platform-subtab"
    />
  );
}

/* ------------- Diagnostik, Kesehatan Sistem & Cloud Backup ------------- */
const DIAG_SUB = {
  health: "health",
  kesehatan: "health",
  "system-health": "health",
  system_health: "health",
  integritas: "integritas",
  backup: "backup",
  installer: "backup",
  restore: "backup",
  diagnostik: "logs",
  logs: "logs",
  fitur: "fitur",
};

function DiagnosticsTab() {
  let initial = "health";
  try {
    const t = new URLSearchParams(window.location.search).get("tab");
    if (DIAG_SUB[t]) initial = DIAG_SUB[t];
  } catch (e) {}
  return (
    <SubTabs
      initial={initial}
      items={[
        { key: "health", label: "Kesehatan Sistem & Uji Respon", icon: Activity, comp: SystemHealth },
        { key: "integritas", label: "🛡️ Integritas Data Lokal", icon: ShieldCheck, comp: Integritas },
        { key: "backup", label: "Cloud Backup & Pembaruan", icon: DatabaseBackup, comp: SettingsInstaller },
        { key: "logs", label: "Log & Diagnostik Sistem", icon: Bug, comp: Diagnostik },
        { key: "fitur", label: "Modul Fitur & Addon", icon: SlidersHorizontal, comp: SettingsIntegrations },
      ]}
      testid="diagnostik-subtab"
    />
  );
}

/* Daftar tab pengaturan dengan nama yang rapi, spesifik, dan mudah dipahami */
const TABS = [
  { key: "app", label: "Bisnis & Operasional", icon: Store, comp: SettingsBusiness, mods: ["pengaturan"] },
  { key: "users", label: "Pengguna & Akses", icon: Users, comp: UsersTab, mods: ["pengguna", "role_izin"] },
  { key: "tables", label: "Manajemen Meja", icon: Armchair, comp: Tables, mods: ["meja"] },
  { key: "device", label: "Printer & Perangkat", icon: Printer, comp: DeviceSettings },
  { key: "platform", label: "Tampilan & Tema", icon: Palette, comp: PlatformTab, mods: ["pengaturan"] },
  { key: "widget", label: "Widget Dashboard", icon: LayoutGrid, comp: SettingsCustomWidgets, mods: ["pengaturan"] },
  { key: "ai", label: "Asisten AI", icon: Sparkles, comp: SettingsAI, mods: ["pengaturan"] },
  { key: "wa", label: "Laporan WhatsApp", icon: MessageCircle, comp: WhatsAppReport, mods: ["pengaturan"] },
  { key: "diagnostik", label: "Diagnostik & Pemeliharaan", icon: Activity, comp: DiagnosticsTab, mods: ["pengaturan"] },
  { key: "data", label: "Reset Data", icon: Trash2, comp: SettingsData, mods: ["pengaturan"] },
  { key: "versi", label: "Tentang & Versi", icon: Box, comp: AppVersi },
];

// tab lama yang kini jadi SUB-TAB / sinonim (agar tautan/bookmark lama tetap bekerja)
const LEGACY_TAB_MAP = {
  roles: "users",
  accounts: "users",
  ui: "platform",
  theme: "platform",
  business: "app",
  bisnis: "app",
  operasional: "app",
  health: "diagnostik",
  "system-health": "diagnostik",
  system_health: "diagnostik",
  kesehatan: "diagnostik",
  integritas: "diagnostik",
  backup: "diagnostik",
  installer: "diagnostik",
  restore: "diagnostik",
  update: "diagnostik",
  logs: "diagnostik",
  fitur: "diagnostik",
  printer: "device",
  meja: "tables",
};

function tabFromSearch(search) {
  try {
    const t = new URLSearchParams(search || "").get("tab");
    const mapped = LEGACY_TAB_MAP[t] || t;
    if (TABS.some((x) => x.key === mapped)) return mapped;
  } catch (e) {}
  return "app";
}

export default function Settings() {
  const { user } = useAuth();
  // Hanya tampilkan tab yang izinnya benar-benar dimiliki user (admin yang belum
  // dibatasi / Super Admin otomatis melihat semua).
  const visibleTabs = TABS.filter((t) => !t.mods || t.mods.some((m) => can(user, m)));
  const [tab, setTab] = useState(() => tabFromSearch(typeof window !== "undefined" ? window.location.search : ""));
  // Ikuti perubahan ?tab= saat halaman ini SUDAH terbuka (mis. tombol pintasan dari
  // dalam Pengaturan sendiri: Installer → Integritas) — tanpa ini perpindahan tidak terjadi
  // karena React Router hanya mengganti query, komponen tidak dipasang ulang.
  const locSearch = useLocation().search;
  useEffect(() => {
    setTab(tabFromSearch(locSearch));
  }, [locSearch]);
  // Jangan biarkan tab aktif menunjuk tab yang tidak boleh dibuka (mis. bookmark lama)
  const shown = visibleTabs.some((t) => t.key === tab) ? tab : visibleTabs[0]?.key;
  const active = visibleTabs.find((t) => t.key === shown) || visibleTabs[0];
  if (!active) return null;
  const Active = active.comp;

  return (
    <div className="h-full flex flex-col">
      <div className="px-6 md:px-8 pt-5 pb-0 bg-white border-b border-[#E4E4E7]">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 mb-3">
          <div>
            <h1 className="text-2xl font-black text-[#0A0A0A]">Pengaturan Sistem</h1>
            <p className="text-xs text-[#71717A] mt-0.5">
              Konfigurasi operasional toko, pengguna, perangkat keras kasir, dan pemeliharaan sistem.
            </p>
          </div>
        </div>
        <div className="flex gap-1 overflow-x-auto no-scrollbar -mb-px">
          {visibleTabs.map((t) => (
            <button
              key={t.key}
              data-testid={`settings-tab-${t.key}`}
              onClick={() => setTab(t.key)}
              className={`tap px-3.5 h-10 rounded-t-lg font-bold text-xs sm:text-sm flex items-center gap-2 border-b-2 whitespace-nowrap transition-all shrink-0 ${
                shown === t.key
                  ? "border-[#E63946] text-[#E63946] bg-[#FFF5F5]"
                  : "border-transparent text-[#52525B] hover:text-[#0A0A0A] hover:bg-[#F4F4F5]"
              }`}
            >
              <t.icon size={15} /> {t.label}
            </button>
          ))}
        </div>
      </div>
      <div className="flex-1 overflow-hidden">
        <ErrorBoundary key={shown}>
          <Active />
        </ErrorBoundary>
      </div>
    </div>
  );
}
