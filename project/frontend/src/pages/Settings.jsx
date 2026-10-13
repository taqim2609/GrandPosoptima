import { useEffect, useState, Suspense, lazy } from "react";
import { useLocation } from "react-router-dom";
import SubTabs from "@/components/SubTabs";
import ErrorBoundary from "@/components/ErrorBoundary";
import {
  Users, Armchair, Sparkles, Trash2, MessageCircle, Download, Printer, Bug, Box,
  Settings2, SlidersHorizontal, LayoutGrid, Palette, ShieldCheck, LayoutTemplate,
  Activity, Store, DatabaseBackup, KeyRound, Cpu, Layers, Radio,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { can } from "@/lib/rbac";

const UsersPage = lazy(() => import("@/pages/Users"));
const RoleBasedAccess = lazy(() => import("@/pages/RoleBasedAccess"));
const Tables = lazy(() => import("@/pages/Tables"));
const SettingsAI = lazy(() => import("@/pages/SettingsAI"));
const SettingsData = lazy(() => import("@/pages/SettingsData"));
const SettingsBusiness = lazy(() => import("@/pages/SettingsBusiness"));
const SettingsReport = lazy(() => import("@/pages/SettingsReport"));
const SettingsInstaller = lazy(() => import("@/pages/SettingsInstaller"));
const SettingsIntegrations = lazy(() => import("@/pages/SettingsIntegrations"));
const SettingsCustomWidgets = lazy(() => import("@/pages/SettingsCustomWidgets"));
const SettingsPlatform = lazy(() => import("@/pages/SettingsPlatform"));
const SettingsUI = lazy(() => import("@/pages/SettingsUI"));
const SettingsRoles = lazy(() => import("@/pages/SettingsRoles"));
const WhatsAppReport = lazy(() => import("@/pages/WhatsAppReport"));
const DeviceSettings = lazy(() => import("@/pages/DeviceSettings"));
const Diagnostik = lazy(() => import("@/pages/Diagnostik"));
const Integritas = lazy(() => import("@/pages/Integritas"));
const AppVersi = lazy(() => import("@/pages/AppVersi"));
const SystemHealth = lazy(() => import("@/pages/SystemHealth"));

/* ---------------- 1. Bisnis & Operasional (Nilai Usaha, Meja, Widget) ---------------- */
function BusinessTab() {
  const { user } = useAuth();
  let initial = "business";
  try {
    const sp = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
    const raw = sp.get("sub") || sp.get("tab");
    if (raw === "tables" || raw === "meja") initial = "tables";
    else if (raw === "widgets" || raw === "widget") initial = "widgets";
  } catch (e) {}

  const items = [
    { key: "business", label: "Bisnis & Pajak", icon: Store, comp: SettingsBusiness },
  ];
  if (can(user, "meja")) {
    items.push({ key: "tables", label: "Manajemen Meja", icon: Armchair, comp: Tables });
  }
  items.push({ key: "widgets", label: "Widget Dashboard", icon: LayoutGrid, comp: SettingsCustomWidgets });

  return <SubTabs items={items} initial={initial} testid="business-subtab" />;
}

/* ---------------- 2. Pengguna & Akses (Akun, RBAC, Template) ---------------- */
function UsersTab() {
  const { user } = useAuth();
  let initial = "rbac";
  try {
    const sp = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
    const raw = sp.get("sub") || sp.get("tab");
    if (raw === "rbac" || raw === "role-based-access" || raw === "access" || raw === "permissions") initial = "rbac";
    else if (raw === "roles" || raw === "role") initial = "roles";
    else if (raw === "accounts" || raw === "users") initial = "accounts";
  } catch (e) {}
  const items = [];
  if (can(user, "pengguna")) items.push({ key: "accounts", label: "Akun Pengguna", icon: Users, comp: UsersPage });
  if (can(user, "role_izin") || user?.is_superadmin || user?.bootstrap_owner) {
    items.push({ key: "rbac", label: "Role-Based Access", icon: ShieldCheck, comp: RoleBasedAccess });
    items.push({ key: "roles", label: "Template Peran", icon: KeyRound, comp: SettingsRoles });
  }
  if (!items.length)
    return (
      <div className="p-6 text-sm text-[#52525B]" data-testid="users-no-perm">
        Role akun ini tidak punya izin <b>Akun Pengguna</b> maupun <b>Role-Based Access</b>.
      </div>
    );
  return <SubTabs items={items} initial={initial} testid="users-subtab" />;
}

/* ---------------- 3. Tampilan & Tema (Branding & Warna | Tata Letak Menu UI) ---------------- */
function PlatformTab() {
  let initial = "identity";
  try {
    const sp = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
    const raw = sp.get("sub") || sp.get("tab");
    if (raw === "menu" || raw === "ui") initial = "menu";
  } catch (e) {}

  return (
    <SubTabs
      initial={initial}
      items={[
        { key: "identity", label: "Branding & Tema Warna", icon: Palette, comp: SettingsPlatform },
        { key: "menu", label: "Tata Letak & Menu UI", icon: LayoutTemplate, comp: SettingsUI },
      ]}
      testid="platform-subtab"
    />
  );
}

/* ---------------- 4. Integrasi & Saluran (WhatsApp, Asisten AI, Addon) ---------------- */
function IntegrationsTab() {
  let initial = "wa";
  try {
    const sp = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
    const raw = sp.get("sub") || sp.get("tab");
    if (raw === "ai") initial = "ai";
    else if (raw === "addons" || raw === "fitur") initial = "addons";
  } catch (e) {}

  return (
    <SubTabs
      initial={initial}
      items={[
        { key: "wa", label: "WhatsApp Gateway", icon: MessageCircle, comp: WhatsAppReport },
        { key: "ai", label: "Asisten AI (Gemini)", icon: Sparkles, comp: SettingsAI },
        { key: "addons", label: "Modul Fitur & Addon", icon: SlidersHorizontal, comp: SettingsIntegrations },
      ]}
      testid="integrations-subtab"
    />
  );
}

/* ---------------- 5. Pemeliharaan & Sistem (Kesehatan, Backup, Integritas, Reset, Versi) ---------------- */
function DiagnosticsTab() {
  let initial = "health";
  try {
    const t = new URLSearchParams(window.location.search).get("tab") || new URLSearchParams(window.location.search).get("sub");
    if (t === "integritas") initial = "integritas";
    else if (t === "backup" || t === "installer" || t === "restore") initial = "backup";
    else if (t === "logs" || t === "diagnostik") initial = "logs";
    else if (t === "data" || t === "reset") initial = "reset";
    else if (t === "versi" || t === "about") initial = "versi";
  } catch (e) {}

  return (
    <SubTabs
      initial={initial}
      items={[
        { key: "health", label: "Kesehatan Sistem", icon: Activity, comp: SystemHealth },
        { key: "integritas", label: "Integritas Data", icon: ShieldCheck, comp: Integritas },
        { key: "backup", label: "Cloud Backup & Update", icon: DatabaseBackup, comp: SettingsInstaller },
        { key: "logs", label: "Log Diagnostik", icon: Bug, comp: Diagnostik },
        { key: "reset", label: "Reset Data", icon: Trash2, comp: SettingsData },
        { key: "versi", label: "Tentang Versi", icon: Box, comp: AppVersi },
      ]}
      testid="diagnostik-subtab"
    />
  );
}

/* Daftar 6 Tab Utama Pengaturan yang Ramping & Terorganisir */
const TABS = [
  { key: "app", label: "Bisnis & Toko", icon: Store, comp: BusinessTab, mods: ["pengaturan"] },
  { key: "device", label: "Perangkat & Printer", icon: Printer, comp: DeviceSettings },
  { key: "users", label: "Pengguna & Akses", icon: Users, comp: UsersTab, mods: ["pengguna", "role_izin"] },
  { key: "platform", label: "Tampilan & Tema", icon: Palette, comp: PlatformTab, mods: ["pengaturan"] },
  { key: "integrations", label: "Integrasi & Saluran", icon: Radio, comp: IntegrationsTab, mods: ["pengaturan"] },
  { key: "diagnostik", label: "Pemeliharaan & Sistem", icon: Activity, comp: DiagnosticsTab, mods: ["pengaturan"] },
];

// tab lama yang kini jadi SUB-TAB / sinonim (agar bookmark & link lama tetap bekerja sempurna)
const LEGACY_TAB_MAP = {
  business: "app",
  bisnis: "app",
  operasional: "app",
  tables: "app",
  meja: "app",
  widget: "app",
  widgets: "app",
  printer: "device",
  device: "device",
  rbac: "users",
  "role-based-access": "users",
  access: "users",
  permissions: "users",
  roles: "users",
  accounts: "users",
  users: "users",
  ui: "platform",
  theme: "platform",
  platform: "platform",
  ai: "integrations",
  wa: "integrations",
  whatsapp: "integrations",
  fitur: "integrations",
  addons: "integrations",
  integrations: "integrations",
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
  diagnostik: "diagnostik",
  data: "diagnostik",
  reset: "diagnostik",
  versi: "diagnostik",
  about: "diagnostik",
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
  const visibleTabs = TABS.filter((t) => !t.mods || t.mods.some((m) => can(user, m)));
  const [tab, setTab] = useState(() => tabFromSearch(typeof window !== "undefined" ? window.location.search : ""));
  const locSearch = useLocation().search;

  useEffect(() => {
    setTab(tabFromSearch(locSearch));
  }, [locSearch]);

  const shown = visibleTabs.some((t) => t.key === tab) ? tab : visibleTabs[0]?.key;
  const active = visibleTabs.find((t) => t.key === shown) || visibleTabs[0];
  if (!active) return null;
  const Active = active.comp;

  return (
    <div className="h-full flex flex-col bg-[#F4F5F7]">
      <div className="px-6 md:px-8 pt-5 pb-0 bg-white border-b border-[#E4E4E7]">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 mb-3">
          <div>
            <h1 className="text-2xl font-black text-[#0A0A0A]">Pengaturan Sistem</h1>
            <p className="text-xs text-[#71717A] mt-0.5">
              Kelola konfigurasi toko, printer kasir, tim staf, tampilan tema, dan pemeliharaan server.
            </p>
          </div>
        </div>
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar -mb-px">
          {visibleTabs.map((t) => (
            <button
              key={t.key}
              data-testid={`settings-tab-${t.key}`}
              onClick={() => setTab(t.key)}
              className={`tap px-4 h-11 rounded-t-xl font-bold text-xs sm:text-sm flex items-center gap-2 border-b-2 whitespace-nowrap transition-all shrink-0 ${
                shown === t.key
                  ? "border-[#E63946] text-[#E63946] bg-[#FFF5F5]"
                  : "border-transparent text-[#52525B] hover:text-[#0A0A0A] hover:bg-[#F4F4F5]"
              }`}
            >
              <t.icon size={16} /> {t.label}
            </button>
          ))}
        </div>
      </div>
      <div className="flex-1 min-h-0 overflow-hidden">
        <ErrorBoundary key={shown}>
          <Suspense fallback={<div className="flex h-full items-center justify-center p-8"><div className="animate-spin h-8 w-8 border-4 border-[#E63946] border-t-transparent rounded-full"></div></div>}>
            <Active />
          </Suspense>
        </ErrorBoundary>
      </div>
    </div>
  );
}
