import { useEffect, useState, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import ErrorBoundary from "@/components/ErrorBoundary";
import {
  Users, Armchair, Sparkles, Trash2, MessageCircle, Printer, Bug, Box,
  SlidersHorizontal, LayoutGrid, Palette, ShieldCheck, LayoutTemplate,
  Activity, Store, DatabaseBackup, KeyRound, Cpu, Radio, ChevronRight,
  Search, AlertCircle, ArrowLeft, X, Globe
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { can } from "@/lib/rbac";

// Import statis (JANGAN gunakan dynamic lazy/import() agar single-bundle kompatibel dgn Android WebView/Sunmi)
import UsersPage from "@/pages/Users";
import RoleBasedAccess from "@/pages/RoleBasedAccess";
import Tables from "@/pages/Tables";
import SettingsAI from "@/pages/SettingsAI";
import SettingsData from "@/pages/SettingsData";
import SettingsBusiness from "@/pages/SettingsBusiness";
import SettingsInstaller from "@/pages/SettingsInstaller";
import SettingsIntegrations from "@/pages/SettingsIntegrations";
import SettingsCustomWidgets from "@/pages/SettingsCustomWidgets";
import SettingsPlatform from "@/pages/SettingsPlatform";
import SettingsUI from "@/pages/SettingsUI";
import SettingsLandingPage from "@/pages/SettingsLandingPage";
import SettingsRoles from "@/pages/SettingsRoles";
import WhatsAppReport from "@/pages/WhatsAppReport";
import DeviceSettings from "@/pages/DeviceSettings";
import Diagnostik from "@/pages/Diagnostik";
import Integritas from "@/pages/Integritas";
import AppVersi from "@/pages/AppVersi";
import SystemHealth from "@/pages/SystemHealth";

const SETTINGS_GROUPS = [
  {
    id: "business",
    label: "Bisnis & Toko",
    icon: Store,
    items: [
      { id: "business", label: "Bisnis & Pajak", icon: Store, comp: SettingsBusiness, mod: "pengaturan", desc: "Konfigurasi identitas toko, pajak service, batas diskon & void" },
      { id: "tables", label: "Manajemen Meja", icon: Armchair, comp: Tables, mod: "meja", desc: "Layout denah meja F&B, area ruangan & kapasitas kursi" },
      { id: "widgets", label: "Widget Dashboard", icon: LayoutGrid, comp: SettingsCustomWidgets, mod: "pengaturan", desc: "Kustomisasi kartu ringkasan penjualan & statistik cepat" },
    ],
  },
  {
    id: "device",
    label: "Perangkat & Kasir",
    icon: Printer,
    items: [
      { id: "device", label: "Printer & Laci Kas", icon: Printer, comp: DeviceSettings, desc: "Printer thermal Sunmi/Bluetooth, laci kas uang & struk belanja" },
    ],
  },
  {
    id: "users",
    label: "Pengguna & Akses",
    icon: ShieldCheck,
    items: [
      { id: "accounts", label: "Akun Pengguna", icon: Users, comp: UsersPage, mod: "pengguna", desc: "Daftar staf, kasir, admin, reset PIN & status aktif" },
      { id: "rbac", label: "Hak Akses (RBAC)", icon: ShieldCheck, comp: RoleBasedAccess, mod: "role_izin", desc: "Matriks perizinan modul kasir, admin, dan operator" },
      { id: "roles", label: "Template Peran", icon: KeyRound, comp: SettingsRoles, mod: "role_izin", desc: "Preset wewenang standar peran staf operasional" },
    ],
  },
  {
    id: "platform",
    label: "Tampilan & Tema",
    icon: Palette,
    items: [
      { id: "identity", label: "Branding & Warna", icon: Palette, comp: SettingsPlatform, mod: "pengaturan", desc: "Nama outlet, logo struk, tagline & palet warna tema POS" },
      { id: "landing-page", label: "Landing Page", icon: Globe, comp: SettingsLandingPage, mod: "pengaturan", desc: "Kelola konten hero banner, statistik, promo & kontak landing page" },
      { id: "menu", label: "Tata Letak Menu UI", icon: LayoutTemplate, comp: SettingsUI, mod: "pengaturan", desc: "Urutan navigasi menu samping & penyesuaian label" },
    ],
  },
  {
    id: "integrations",
    label: "Integrasi & Saluran",
    icon: Radio,
    items: [
      { id: "wa", label: "WhatsApp Gateway", icon: MessageCircle, comp: WhatsAppReport, mod: "pengaturan", desc: "Gateway notifikasi WhatsApp laporan harian & broadcast" },
      { id: "ai", label: "Asisten AI (Gemini)", icon: Sparkles, comp: SettingsAI, mod: "pengaturan", desc: "Konfigurasi model kecerdasan buatan Gemini & prompt POS" },
      { id: "addons", label: "Modul & Add-on", icon: SlidersHorizontal, comp: SettingsIntegrations, mod: "pengaturan", desc: "Pengaktifan fitur tambahan & integrasi layanan eksternal" },
    ],
  },
  {
    id: "maintenance",
    label: "Pemeliharaan & Server",
    icon: Cpu,
    items: [
      { id: "health", label: "Kesehatan Server", icon: Activity, comp: SystemHealth, mod: "pengaturan", desc: "Metrik CPU, RAM server lokal, database & konektivitas" },
      { id: "integritas", label: "Integritas Data", icon: ShieldCheck, comp: Integritas, mod: "pengaturan", desc: "Verifikasi konsistensi stok, saldo kas & rekonsiliasi data" },
      { id: "backup", label: "Cloud Backup & Update", icon: DatabaseBackup, comp: SettingsInstaller, mod: "pengaturan", desc: "Pencadangan cloud, pembaruan Capgo OTA & installer" },
      { id: "logs", label: "Log Diagnostik", icon: Bug, comp: Diagnostik, mod: "pengaturan", desc: "Log aktivitas error sistem & riwayat sinkronisasi hybrid" },
      { id: "reset", label: "Reset Data Toko", icon: Trash2, comp: SettingsData, mod: "pengaturan", danger: true, desc: "Pembersihan transaksi dummy / reset database ke setelan awal" },
      { id: "versi", label: "Tentang Versi", icon: Box, comp: AppVersi, desc: "Informasi rilis aplikasi POS, backend engine & APK Android" },
    ],
  },
];

const ITEM_ALIASES = {
  app: "business",
  bisnis: "business",
  business: "business",
  operasional: "business",
  tables: "tables",
  meja: "tables",
  widget: "widgets",
  widgets: "widgets",
  printer: "device",
  device: "device",
  hardware: "device",
  accounts: "accounts",
  users: "accounts",
  pengguna: "accounts",
  rbac: "rbac",
  "role-based-access": "rbac",
  access: "rbac",
  permissions: "rbac",
  roles: "roles",
  identity: "identity",
  branding: "identity",
  theme: "identity",
  platform: "identity",
  "landing-page": "landing-page",
  landing: "landing-page",
  landingpage: "landing-page",
  ui: "menu",
  menu: "menu",
  wa: "wa",
  whatsapp: "wa",
  ai: "ai",
  gemini: "ai",
  addons: "addons",
  fitur: "addons",
  integrations: "wa",
  health: "health",
  kesehatan: "health",
  "system-health": "health",
  integritas: "integritas",
  backup: "backup",
  installer: "backup",
  restore: "backup",
  update: "backup",
  logs: "logs",
  diagnostik: "logs",
  reset: "reset",
  data: "reset",
  versi: "versi",
  about: "versi",
  maintenance: "health",
};

function resolveItemKey(search) {
  try {
    const sp = new URLSearchParams(search || "");
    const sub = sp.get("sub");
    if (sub && ITEM_ALIASES[sub]) return ITEM_ALIASES[sub];
    const tab = sp.get("tab");
    if (tab && ITEM_ALIASES[tab]) return ITEM_ALIASES[tab];
  } catch (e) {}
  return "business";
}

export default function Settings() {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const [searchQuery, setSearchQuery] = useState("");

  // Filter groups & items according to user RBAC
  const filteredGroups = useMemo(() => {
    return SETTINGS_GROUPS.map((group) => {
      const items = group.items.filter((item) => {
        if (!item.mod) return true;
        if (item.mod === "role_izin" && (user?.is_superadmin || user?.bootstrap_owner)) return true;
        return can(user, item.mod);
      });
      return { ...group, items };
    }).filter((group) => group.items.length > 0);
  }, [user]);

  // Flatten available items for quick lookup
  const allAvailableItems = useMemo(() => {
    const list = [];
    filteredGroups.forEach((g) => {
      g.items.forEach((item) => list.push({ ...item, groupLabel: g.label, groupId: g.id }));
    });
    return list;
  }, [filteredGroups]);

  // Check if URL has direct query parameter (?tab=... / ?sub=...)
  const hasDirectParam = useMemo(() => {
    const sp = new URLSearchParams(location.search || "");
    return Boolean(sp.get("tab") || sp.get("sub"));
  }, [location.search]);

  // On mobile (Android screens < md), control Master-Detail state:
  // false = display category/item selection menu
  // true = display active setting detail content
  const [mobileDetailOpen, setMobileDetailOpen] = useState(hasDirectParam);

  const [activeItemId, setActiveItemId] = useState(() => {
    const target = resolveItemKey(typeof window !== "undefined" ? window.location.search : "");
    const exists = allAvailableItems.some((i) => i.id === target);
    return exists ? target : (allAvailableItems[0]?.id || "device");
  });

  // Keep in sync with URL search params changes
  useEffect(() => {
    const sp = new URLSearchParams(location.search || "");
    const hasParam = Boolean(sp.get("tab") || sp.get("sub"));
    const target = resolveItemKey(location.search);
    if (allAvailableItems.some((i) => i.id === target)) {
      setActiveItemId(target);
      if (hasParam) {
        setMobileDetailOpen(true);
      }
    }
  }, [location.search, allAvailableItems]);

  const activeItem = useMemo(() => {
    return allAvailableItems.find((i) => i.id === activeItemId) || allAvailableItems[0];
  }, [allAvailableItems, activeItemId]);

  const handleSelectItem = (id) => {
    setActiveItemId(id);
    setMobileDetailOpen(true);
    navigate(`/settings?tab=${id}`, { replace: true });
  };

  const handleBackToMobileMenu = () => {
    setMobileDetailOpen(false);
    navigate("/settings", { replace: true });
  };

  // Filter groups according to search input
  const searchedGroups = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return filteredGroups;
    return filteredGroups
      .map((group) => {
        const matchingItems = group.items.filter(
          (item) =>
            item.label.toLowerCase().includes(q) ||
            group.label.toLowerCase().includes(q) ||
            (item.desc && item.desc.toLowerCase().includes(q))
        );
        return { ...group, items: matchingItems };
      })
      .filter((group) => group.items.length > 0);
  }, [filteredGroups, searchQuery]);

  if (!activeItem && allAvailableItems.length === 0) {
    return (
      <div className="h-full flex items-center justify-center p-6 text-zinc-500 font-medium">
        <div className="text-center space-y-2">
          <AlertCircle size={32} className="mx-auto text-amber-500" />
          <h2 className="text-base font-bold text-zinc-800">Akses Terbatas</h2>
          <p className="text-xs text-zinc-500">Anda tidak memiliki modul pengaturan yang dapat diakses.</p>
        </div>
      </div>
    );
  }

  const ActiveComponent = activeItem?.comp;

  return (
    <div className="h-full w-full flex flex-col md:flex-row bg-[#F4F5F7] overflow-hidden">
      {/* =========================================================================
          KOLOM 1: Menu & Kategori Pengaturan
          - Desktop (>= md): Sidebar statis di kiri (w-64 / w-72)
          - Android / Mobile (< md): Tampil penuh ketika mobileDetailOpen === false,
            sembunyi ketika mobileDetailOpen === true
          ========================================================================= */}
      <aside
        className={`w-full md:w-64 lg:w-72 shrink-0 bg-white border-b md:border-b-0 md:border-r border-[#E4E4E7] flex-col h-full z-10 shadow-xs ${
          mobileDetailOpen ? "hidden md:flex" : "flex"
        }`}
      >
        {/* Header Kategori */}
        <div className="p-4 md:p-5 border-b border-[#E4E4E7]/80 bg-zinc-50/60 shrink-0">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h1 className="text-lg font-black text-zinc-900 tracking-tight">Pengaturan</h1>
              <p className="text-[11px] text-zinc-500 font-medium">Grand Aceh Kuliner POS</p>
            </div>
          </div>

          {/* Kolom Pencarian Cepat Pengaturan */}
          <div className="mt-3 relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
            <input
              type="text"
              placeholder="Cari pengaturan..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full h-8 pl-8 pr-7 rounded-lg bg-white border border-[#E4E4E7] text-xs text-zinc-800 placeholder:text-zinc-400 focus:outline-none focus:border-[#E63946] focus:ring-1 focus:ring-[#E63946]/30 transition-all"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600"
              >
                <X size={13} />
              </button>
            )}
          </div>
        </div>

        {/* Daftar Navigasi Kategori (Scrollable) */}
        <div className="flex-1 overflow-y-auto p-3 space-y-4">
          {searchedGroups.length === 0 ? (
            <div className="p-4 text-center text-xs text-zinc-400">
              Tidak ada pengaturan yang cocok dengan "{searchQuery}"
            </div>
          ) : (
            searchedGroups.map((group) => (
              <div key={group.id} className="space-y-1">
                <div className="px-3 py-1 text-[10px] font-extrabold uppercase tracking-wider text-zinc-500 flex items-center gap-1.5">
                  <group.icon size={13} className="text-zinc-400" />
                  <span>{group.label}</span>
                </div>
                <div className="space-y-1">
                  {group.items.map((item) => {
                    const isActive = item.id === activeItem?.id;
                    const Icon = item.icon;
                    return (
                      <button
                        key={item.id}
                        data-testid={`settings-subtab-${item.id}`}
                        onClick={() => handleSelectItem(item.id)}
                        className={`tap w-full p-2.5 md:py-2.5 rounded-xl text-left font-semibold flex items-center justify-between gap-2 transition-all ${
                          isActive
                            ? item.danger
                              ? "bg-rose-50 text-rose-700 font-bold shadow-2xs border border-rose-200"
                              : "bg-[#FFF5F5] text-[#E63946] font-bold shadow-2xs border border-rose-100"
                            : "text-zinc-700 hover:text-zinc-900 hover:bg-zinc-100/80 active:bg-zinc-200 border border-transparent"
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div
                            className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 ${
                              isActive
                                ? item.danger ? "bg-rose-100 text-rose-700" : "bg-rose-50 text-[#E63946]"
                                : item.danger ? "bg-rose-50 text-rose-600" : "bg-zinc-100 text-zinc-600"
                            }`}
                          >
                            <Icon size={16} />
                          </div>
                          <div className="min-w-0">
                            <div className="text-xs sm:text-sm truncate leading-tight">{item.label}</div>
                            {/* Keterangan singkat khusus tampilan Android/Mobile untuk navigasi intuitif */}
                            {item.desc && (
                              <div className="text-[10px] text-zinc-400 truncate md:hidden mt-0.5 font-normal">
                                {item.desc}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Indikator Panah (Mobile) & Titik Aktif (Desktop) */}
                        <div className="shrink-0 flex items-center gap-1">
                          <ChevronRight
                            size={16}
                            className={`md:hidden ${isActive ? "text-[#E63946]" : "text-zinc-400"}`}
                          />
                          {isActive && (
                            <div
                              className={`hidden md:block h-1.5 w-1.5 rounded-full ${
                                item.danger ? "bg-rose-600" : "bg-[#E63946]"
                              }`}
                            />
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>
      </aside>

      {/* =========================================================================
          KOLOM 2: Panel Konten Pengaturan Aktif
          - Desktop (>= md): Tampil selalu di sebelah kanan sidebar
          - Android / Mobile (< md): Tampil penuh ketika mobileDetailOpen === true,
            dengan tombol "← Kembali ke Menu" di header
          ========================================================================= */}
      <main
        className={`flex-1 min-w-0 flex-col h-full overflow-hidden bg-[#F4F5F7] ${
          !mobileDetailOpen ? "hidden md:flex" : "flex"
        }`}
      >
        {/* Contextual Header Bar */}
        <div className="h-13 shrink-0 px-4 md:px-6 bg-white border-b border-[#E4E4E7] flex items-center justify-between gap-3 shadow-xs">
          {/* Tombol Kembali khusus Android / Layar Mobile */}
          <div className="flex items-center gap-2 min-w-0">
            <button
              type="button"
              onClick={handleBackToMobileMenu}
              className="md:hidden tap px-2.5 py-1.5 rounded-xl bg-zinc-100 hover:bg-zinc-200 active:scale-95 text-zinc-800 text-xs font-bold flex items-center gap-1.5 border border-zinc-200/90 shrink-0"
              title="Kembali ke menu kategori pengaturan"
            >
              <ArrowLeft size={16} className="text-zinc-700" />
              <span>Menu</span>
            </button>

            {/* Breadcrumb Desktop */}
            <div className="hidden md:flex items-center gap-2 text-xs text-zinc-500 font-medium">
              <span>Pengaturan</span>
              <ChevronRight size={13} className="text-zinc-400" />
              <span className="text-zinc-600">{activeItem?.groupLabel}</span>
              <ChevronRight size={13} className="text-zinc-400" />
              <span className="font-bold text-zinc-900 flex items-center gap-1.5">
                {activeItem?.icon && (
                  <activeItem.icon
                    size={14}
                    className={activeItem.danger ? "text-rose-600" : "text-[#E63946]"}
                  />
                )}
                {activeItem?.label}
              </span>
            </div>

            {/* Judul Mobile */}
            <div className="md:hidden flex items-center gap-2 min-w-0">
              {activeItem?.icon && (
                <activeItem.icon
                  size={16}
                  className={activeItem.danger ? "text-rose-600 shrink-0" : "text-[#E63946] shrink-0"}
                />
              )}
              <span className="font-extrabold text-sm text-zinc-900 truncate">
                {activeItem?.label}
              </span>
            </div>
          </div>

          {/* Badge Kategori Group di Mobile */}
          <div className="shrink-0 flex items-center gap-2">
            <span className="text-[11px] font-bold text-zinc-500 bg-zinc-100 px-2 py-0.5 rounded-md md:hidden">
              {activeItem?.groupLabel}
            </span>
          </div>
        </div>

        {/* Viewport Konten Pengaturan */}
        <div className="flex-1 min-h-0 overflow-y-auto relative bg-[#F4F5F7]">
          <ErrorBoundary key={activeItem?.id}>
            {ActiveComponent ? (
              <ActiveComponent />
            ) : (
              <div className="flex h-full items-center justify-center p-8 text-zinc-400 text-sm">
                Pilih pengaturan dari menu.
              </div>
            )}
          </ErrorBoundary>
        </div>
      </main>
    </div>
  );
}
