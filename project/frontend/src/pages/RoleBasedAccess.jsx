import { useEffect, useState, useMemo } from "react";
import api, { apiError } from "@/lib/api";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import {
  ShieldCheck,
  Lock,
  Search,
  CheckCircle2,
  RefreshCw,
  RotateCcw,
  SlidersHorizontal,
  UserCheck,
  Users,
  Settings,
  CalendarCheck,
  Layers,
  Sparkles,
  AlertCircle,
  Copy,
  Info,
  ChevronRight,
  UserCog,
  Check,
  X,
  Plus,
  Trash2,
  AlertTriangle,
  Loader2,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  RBAC_MODULES,
  BASE_MODULES,
  ROLE_LABELS,
  BUILTIN_ROLE_ORDER,
  isSuperAdmin,
  isAdmin,
} from "@/lib/rbac";

// Categorized permission groups for intuitive navigation
const PERM_GROUPS = [
  {
    id: "settings_system",
    name: "Pengaturan & Sistem (System Administration)",
    description: "Izin konfigurasi aplikasi, integrasi, pengguna dan platform",
    icon: Settings,
    color: "bg-blue-50 text-blue-700 border-blue-200",
    modules: [
      {
        code: "pengaturan",
        title: "Edit Settings (Ubah Pengaturan)",
        subtitle: "Konfigurasi umum, branding, struk & platform",
        highlight: true,
      },
      {
        code: "whatsapp",
        title: "WhatsApp Gateway & Webhook",
        subtitle: "Kelola bot WA, koneksi QR code & webhook reservasi",
      },
      {
        code: "role_izin",
        title: "Role & Hak Akses (Lihat Saja)",
        subtitle: "Melihat konfigurasi role dan hak akses sistem",
      },
      {
        code: "pengguna",
        title: "Kelola Akun Pengguna",
        subtitle: "Membuat akun kasir/staf, reset password & aktivasi",
      },
    ],
  },
  {
    id: "reservations_tables",
    name: "Reservasi Meja & Denah (Reservations)",
    description: "Izin kelola reservasi meja pelanggan dan denah restoran",
    icon: CalendarCheck,
    color: "bg-emerald-50 text-emerald-700 border-emerald-200",
    modules: [
      {
        code: "reservasi",
        title: "Access Reservations (Akses Reservasi Meja)",
        subtitle: "Jadwal booking meja, aturan grup WA & simulasi reservasi",
        highlight: true,
      },
      {
        code: "meja",
        title: "Manajemen Denah Meja",
        subtitle: "Atur tata letak meja makan, kapasitas & status okupansi",
      },
    ],
  },
  {
    id: "pos_cashier",
    name: "Operasional Kasir & Transaksi (POS)",
    description: "Izin transaksi kasir, manajemen uang kas, shift dan void",
    icon: SlidersHorizontal,
    color: "bg-indigo-50 text-indigo-700 border-indigo-200",
    modules: [
      {
        code: "pos",
        title: "POS Kasir (Penjualan)",
        subtitle: "Proses transaksi kasir, split bill & cetak struk",
      },
      {
        code: "shift",
        title: "Manajemen Shift",
        subtitle: "Buka/tutup shift kasir & serah terima uang kas laci",
      },
      {
        code: "void",
        title: "Void & Refund (Pembatalan)",
        subtitle: "Otorisasi pembatalan transaksi atau item pesanan",
      },
      {
        code: "pengeluaran",
        title: "Pengeluaran Kas Laci",
        subtitle: "Mencatat pengeluaran operasional harian kas laci",
      },
      {
        code: "settlement",
        title: "Settlement Vendor (Bagi Hasil)",
        subtitle: "Rekap dan pembayaran bagi hasil vendor konsinyasi",
      },
    ],
  },
  {
    id: "catalog_inventory",
    name: "Katalog Menu, Resep & Stok",
    description: "Izin pengelolaan produk, resep HPP, opname & belanja bahan",
    icon: Layers,
    color: "bg-amber-50 text-amber-700 border-amber-200",
    modules: [
      {
        code: "produk",
        title: "Produk & Stok Retail",
        subtitle: "Katalog menu, harga jual, kategori & stok retail",
      },
      {
        code: "resep",
        title: "Resep & Kalkulasi HPP",
        subtitle: "Komposisi bahan baku menu & kalkulasi modal",
      },
      {
        code: "belanja_bahan",
        title: "Pembelian Bahan Baku",
        subtitle: "Catat nota belanja bahan baku operasional dapur",
      },
      {
        code: "opname_bahan",
        title: "Stok Opname Bahan",
        subtitle: "Hitung fisik persediaan bahan baku dapur & gudang",
      },
      {
        code: "opname_produk",
        title: "Stok Opname Produk Retail",
        subtitle: "Hitung fisik persediaan produk retail siap jual",
      },
      {
        code: "vendor",
        title: "Data Vendor & Pemasok",
        subtitle: "Kelola daftar pemasok bahan dan konsinyasi",
      },
    ],
  },
  {
    id: "reports_analytics",
    name: "Laporan, Promosi & Analitik",
    description: "Izin tinjauan keuangan, statistik penjualan, member & promo",
    icon: Sparkles,
    color: "bg-purple-50 text-purple-700 border-purple-200",
    modules: [
      {
        code: "laporan",
        title: "Laporan Penjualan & Keuangan",
        subtitle: "Grafik omzet, laba rugi, rekap kasir & ekspor data",
      },
      {
        code: "transaksi",
        title: "Riwayat Transaksi",
        subtitle: "Pencarian faktur lama, audit penjualan & cetak ulang",
      },
      {
        code: "dashboard",
        title: "Dashboard Ringkasan",
        subtitle: "Ringkasan statistik metrik bisnis hari ini",
      },
      {
        code: "member",
        title: "Member & Poin Loyalitas",
        subtitle: "Data pelanggan setia, poin dan riwayat kunjungan",
      },
      {
        code: "promo",
        title: "Promo & Diskon",
        subtitle: "Pengaturan potongan harga persentase / nominal",
      },
      {
        code: "kupon",
        title: "Voucher & Kupon Belanja",
        subtitle: "Kelola kode kupon diskon dan masa berlaku",
      },
      {
        code: "ai",
        title: "Asisten AI Cerdas",
        subtitle: "Asisten cerdas analisis menu & rekomendasi penjualan",
      },
    ],
  },
];

const ALL_MODULE_CODES = PERM_GROUPS.flatMap((g) => g.modules.map((m) => m.code));

export default function RoleBasedAccess() {
  const { user: me } = useAuth();
  const [users, setUsers] = useState([]);
  const [rolesMeta, setRolesMeta] = useState({ roles: {}, base_defaults: {} });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState(null);
  const [selectedRoleFilter, setSelectedRoleFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Working state for the currently selected user's permissions
  const [workingPerms, setWorkingPerms] = useState([]);
  const [workingRole, setWorkingRole] = useState("");
  const [hasChanges, setHasChanges] = useState(false);

  // Copy modal
  const [copySourceId, setCopySourceId] = useState("");

  // Delete user state & modal
  const [delTarget, setDelTarget] = useState(null);
  const [delInfo, setDelInfo] = useState(null);
  const [delBusy, setDelBusy] = useState(false);

  const isSuper = isSuperAdmin(me);
  const canAdmin = isSuper || isAdmin(me) || me?.role === "admin";

  const loadData = async () => {
    setLoading(true);
    try {
      const [uRes, rRes] = await Promise.all([
        api.get("/users"),
        api.get("/settings/rbac").catch(() => ({ data: { roles: {}, base_defaults: {} } })),
      ]);
      const userList = Array.isArray(uRes.data) ? uRes.data : [];
      setUsers(userList);
      setRolesMeta(rRes.data || { roles: {}, base_defaults: {} });

      // Automatically select the first non-superadmin user or first user
      if (!selectedUserId && userList.length > 0) {
        const defaultSelect = userList.find((u) => !u.is_superadmin && u.role !== "superadmin") || userList[0];
        if (defaultSelect) {
          selectUser(defaultSelect);
        }
      }
    } catch (e) {
      toast.error(apiError(e.response?.data?.detail));
    } finally {
      setLoading(false);
    }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    loadData();
  }, []);

  const selectedUser = useMemo(() => {
    return users.find((u) => u.id === selectedUserId) || null;
  }, [users, selectedUserId]);

  const selectUser = (u) => {
    setSelectedUserId(u.id);
    setWorkingRole(u.role || "kasir");

    // Compute effective initial permissions
    let initialPerms = [];
    if (u.perms && Array.isArray(u.perms) && u.perms.length > 0) {
      initialPerms = [...u.perms];
    } else {
      const defaultRolePerms = getRoleDefaultPerms(u.role || "kasir");
      initialPerms = [...defaultRolePerms];
    }
    setWorkingPerms(initialPerms);
    setHasChanges(false);
  };

  // Helper to determine the baseline permissions of a role
  const getRoleDefaultPerms = (roleCode) => {
    if (roleCode === "superadmin") return ["*"];
    if (rolesMeta?.roles?.[roleCode]?.perms) {
      return rolesMeta.roles[roleCode].perms;
    }
    if (rolesMeta?.base_defaults?.[roleCode]) {
      return rolesMeta.base_defaults[roleCode];
    }
    if (BASE_MODULES[roleCode]) {
      return BASE_MODULES[roleCode];
    }
    // Fallback based on base role
    const base = rolesMeta?.roles?.[roleCode]?.base || roleCode;
    return BASE_MODULES[base] || ["dashboard", "pos", "shift", "laporan"];
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const roleDefaultPerms = useMemo(() => {
    if (!selectedUser) return [];
    return getRoleDefaultPerms(workingRole || selectedUser.role || "kasir");
  }, [selectedUser, workingRole, rolesMeta]);

  // Filtered users by role and search query
  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      const matchRole =
        selectedRoleFilter === "all" ||
        u.role === selectedRoleFilter ||
        (selectedRoleFilter === "custom" && !BUILTIN_ROLE_ORDER.includes(u.role));

      const query = searchQuery.trim().toLowerCase();
      const matchSearch =
        !query ||
        u.name?.toLowerCase().includes(query) ||
        u.username?.toLowerCase().includes(query) ||
        u.email?.toLowerCase().includes(query);

      return matchRole && matchSearch;
    });
  }, [users, selectedRoleFilter, searchQuery]);

  // Unique defined roles list
  const definedRolesList = useMemo(() => {
    const rolesSet = new Set(users.map((u) => u.role).filter(Boolean));
    BUILTIN_ROLE_ORDER.forEach((r) => rolesSet.add(r));
    return Array.from(rolesSet);
  }, [users]);

  // Toggle permission for working user
  const togglePermission = (modCode) => {
    if (!selectedUser || selectedUser.is_superadmin) return;
    setWorkingPerms((prev) => {
      const exists = prev.includes(modCode);
      const next = exists ? prev.filter((c) => c !== modCode) : [...prev, modCode];
      setHasChanges(true);
      return next;
    });
  };

  // Preset: Reset to Role Default
  const handleResetToRoleDefault = () => {
    if (!selectedUser) return;
    const defaults = getRoleDefaultPerms(workingRole || selectedUser.role);
    setWorkingPerms([...defaults]);
    setHasChanges(true);
    toast.info(`Izin diatur ulang ke standar peran "${ROLE_LABELS[workingRole] || workingRole}"`);
  };

  // Preset: Grant All Permissions
  const handleGrantAll = () => {
    if (!selectedUser || selectedUser.is_superadmin) return;
    setWorkingPerms([...ALL_MODULE_CODES]);
    setHasChanges(true);
    toast.success("Semua 24 izin modul telah dicentang aktif");
  };

  // Preset: Revoke All Permissions
  const handleRevokeAll = () => {
    if (!selectedUser || selectedUser.is_superadmin) return;
    setWorkingPerms([]);
    setHasChanges(true);
    toast.warning("Semua izin modul dicabut");
  };

  // Preset: Copy from another user
  const handleCopyPermissions = () => {
    if (!copySourceId) return;
    const sourceUser = users.find((u) => u.id === copySourceId);
    if (!sourceUser) return;
    const sourcePerms = sourceUser.perms && sourceUser.perms.length > 0
      ? [...sourceUser.perms]
      : getRoleDefaultPerms(sourceUser.role);
    setWorkingPerms(sourcePerms);
    setHasChanges(true);
    setCopySourceId("");
    toast.success(`Izin berhasil disalin dari @${sourceUser.username}`);
  };

  // Open delete user modal
  const openDeleteUser = async (u) => {
    if (!u) return;
    setDelTarget(u);
    setDelInfo(null);
    try {
      const r = await api.get(`/users/${u.id}/delete-check`);
      const info = r.data || {};
      const activeSupers = users.filter((x) => x.active !== false && isSuperAdmin(x));
      const targetIsSuper = isSuperAdmin(u);
      const isLastSuper = targetIsSuper && (activeSupers.length <= 1 || !activeSupers.some((x) => x.id !== u.id));
      if (typeof info.is_superadmin === "undefined") info.is_superadmin = targetIsSuper;
      if (typeof info.is_last_superadmin === "undefined") info.is_last_superadmin = isLastSuper;
      if (u.id === me?.id) info.self = true;
      setDelInfo(info);
    } catch (e) {
      setDelInfo({ error: apiError(e.response?.data?.detail) });
    }
  };

  // Confirm delete user
  const doDeleteUser = async () => {
    if (!delTarget) return;
    setDelBusy(true);
    try {
      const r = await api.delete(`/users/${delTarget.id}`);
      const deletedName = r.data?.username || delTarget.username;
      if (r.data?.action === "deleted") {
        toast.success(`Akun @${deletedName} berhasil dihapus permanen`);
      } else {
        toast.success(`Akun @${deletedName} dinonaktifkan (masih memiliki riwayat transaksi)`);
      }
      const remainingUsers = users.filter((u) => u.id !== delTarget.id);
      setUsers(remainingUsers);
      setDelTarget(null);
      setDelInfo(null);
      if (remainingUsers.length > 0) {
        selectUser(remainingUsers[0]);
      } else {
        setSelectedUserId(null);
      }
    } catch (e) {
      toast.error(apiError(e.response?.data?.detail));
    } finally {
      setDelBusy(false);
    }
  };

  // Save changes
  const handleSave = async () => {
    if (!selectedUser) return;
    if (selectedUser.is_superadmin && workingRole === "superadmin") {
      return toast.info("Izin Super Admin bersifat permanen dan tidak perlu diubah.");
    }
    setSaving(true);
    try {
      if (workingRole !== selectedUser.role) {
        await api.patch(`/users/${selectedUser.id}/role`, { role: workingRole });
      }

      let updatedUser = { ...selectedUser, role: workingRole };

      if (workingRole !== "superadmin") {
        const payload = {
          perms: workingPerms,
          role: workingRole,
        };
        const res = await api.patch(`/users/${selectedUser.id}/permissions`, payload);
        updatedUser = res.data?.user || { ...updatedUser, perms: workingPerms };
      }

      // Update state
      setUsers((prev) =>
        prev.map((u) => (u.id === selectedUser.id ? { ...u, ...updatedUser } : u))
      );
      selectUser(updatedUser);
      setHasChanges(false);
      toast.success(`Hak akses untuk @${selectedUser.username} berhasil disimpan!`);
    } catch (e) {
      toast.error(apiError(e.response?.data?.detail));
    } finally {
      setSaving(false);
    }
  };

  // Revert user to server role defaults
  const handleRevertServerDefault = async () => {
    if (!selectedUser) return;
    if (!window.confirm(`Hapus kustomisasi izin untuk @${selectedUser.username} dan kembalikan murni ke default peran?`)) {
      return;
    }
    setSaving(true);
    try {
      const res = await api.post(`/users/${selectedUser.id}/reset-permissions`);
      const updatedUser = res.data?.user;
      setUsers((prev) =>
        prev.map((u) => (u.id === selectedUser.id ? { ...u, ...updatedUser } : u))
      );
      if (updatedUser) {
        selectUser(updatedUser);
      }
      toast.success(`Kustomisasi izin dihapus. @${selectedUser.username} kini murni memakai default peran.`);
    } catch (e) {
      toast.error(apiError(e.response?.data?.detail));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto min-h-0 p-4 sm:p-6 lg:p-8" data-testid="rbac-container">
      <div className="max-w-7xl mx-auto space-y-6 pb-28">
        {/* Header Banner */}
        <div className="bg-gradient-to-r from-[#0F172A] via-[#1E293B] to-[#334155] rounded-3xl p-6 sm:p-8 text-white shadow-lg border border-slate-700/60">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="space-y-2">
            <div className="flex items-center gap-2.5">
              <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-500 grid place-items-center shadow-md">
                <ShieldCheck size={24} className="text-white" />
              </div>
              <div>
                <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
                  Role-Based Access (RBAC)
                </h1>
                <p className="text-xs sm:text-sm text-slate-300">
                  Kelola izin akses spesifik (seperti <b>'Edit Settings'</b> dan <b>'Access Reservations'</b>) per pengguna individual berdasarkan perannya.
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={loadData}
              disabled={loading}
              className="tap h-9 px-3.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-600 text-xs font-semibold flex items-center gap-1.5 transition-all"
            >
              <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
              Muat Ulang
            </button>
          </div>
        </div>

        {/* Quick RBAC stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6 pt-5 border-t border-slate-700/80">
          <div className="bg-slate-800/60 rounded-2xl p-3 border border-slate-700/50">
            <div className="text-[11px] text-slate-400 font-semibold uppercase">Total Pengguna</div>
            <div className="text-xl font-black text-white mt-0.5">{users.length} Akun</div>
          </div>
          <div className="bg-slate-800/60 rounded-2xl p-3 border border-slate-700/50">
            <div className="text-[11px] text-slate-400 font-semibold uppercase">Izin Kustom Aktif</div>
            <div className="text-xl font-black text-amber-400 mt-0.5">
              {users.filter((u) => u.has_custom_perms).length} Pengguna
            </div>
          </div>
          <div className="bg-slate-800/60 rounded-2xl p-3 border border-slate-700/50">
            <div className="text-[11px] text-slate-400 font-semibold uppercase">Peran Ditetapkan</div>
            <div className="text-xl font-black text-blue-400 mt-0.5">
              {definedRolesList.length} Role
            </div>
          </div>
          <div className="bg-slate-800/60 rounded-2xl p-3 border border-slate-700/50">
            <div className="text-[11px] text-slate-400 font-semibold uppercase">Total Modul Hak Akses</div>
            <div className="text-xl font-black text-emerald-400 mt-0.5">24 Modul</div>
          </div>
        </div>
      </div>

      {/* Role Filter Chips ("Per Defined Role") */}
      <div className="space-y-2">
        <div className="text-xs font-bold text-slate-600 uppercase tracking-wider flex items-center gap-1.5">
          <SlidersHorizontal size={14} /> Filter Berdasarkan Peran yang Ditetapkan:
        </div>
        <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar flex-wrap">
          <button
            onClick={() => setSelectedRoleFilter("all")}
            className={`tap px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 border ${
              selectedRoleFilter === "all"
                ? "bg-slate-900 text-white border-slate-900 shadow-sm"
                : "bg-white text-slate-700 hover:bg-slate-50 border-slate-200"
            }`}
          >
            <span>Semua Peran</span>
            <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${selectedRoleFilter === "all" ? "bg-slate-700 text-slate-100" : "bg-slate-100 text-slate-600"}`}>
              {users.length}
            </span>
          </button>

          {definedRolesList.map((roleKey) => {
            const count = users.filter((u) => u.role === roleKey).length;
            const isSelected = selectedRoleFilter === roleKey;
            return (
              <button
                key={roleKey}
                onClick={() => setSelectedRoleFilter(roleKey)}
                className={`tap px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 border ${
                  isSelected
                    ? "bg-blue-600 text-white border-blue-600 shadow-sm"
                    : "bg-white text-slate-700 hover:bg-slate-50 border-slate-200"
                }`}
              >
                <span>{ROLE_LABELS[roleKey] || roleKey}</span>
                <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${isSelected ? "bg-blue-700 text-blue-100" : "bg-slate-100 text-slate-600"}`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Two-Panel Interface */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: User Directory (4 cols) */}
        <div className="lg:col-span-4 bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
          {/* Search bar */}
          <div className="p-4 border-b border-slate-100 bg-slate-50/50">
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cari nama atau @username..."
                className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none placeholder:text-slate-400"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X size={14} />
                </button>
              )}
            </div>
          </div>

          {/* User List */}
          <div className="divide-y divide-slate-100 max-h-[640px] overflow-y-auto">
            {filteredUsers.length === 0 ? (
              <div className="p-8 text-center text-slate-500">
                <Users size={32} className="mx-auto text-slate-300 mb-2" />
                <p className="text-xs font-semibold">Tidak ada pengguna ditemukan</p>
              </div>
            ) : (
              filteredUsers.map((u) => {
                const isSelected = selectedUserId === u.id;
                const isSuperUser = u.is_superadmin || u.role === "superadmin";
                const hasCustom = u.has_custom_perms;
                const activePermsCount = isSuperUser
                  ? ALL_MODULE_CODES.length
                  : (u.perms && u.perms.length) || getRoleDefaultPerms(u.role).length;

                return (
                  <div
                    key={u.id}
                    onClick={() => selectUser(u)}
                    className={`tap p-3.5 cursor-pointer transition-all flex items-center justify-between gap-3 ${
                      isSelected
                        ? "bg-blue-50/80 border-l-4 border-blue-600"
                        : "hover:bg-slate-50/80 border-l-4 border-transparent"
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={`h-10 w-10 rounded-2xl flex items-center justify-center font-bold text-sm shrink-0 shadow-sm ${
                          isSuperUser
                            ? "bg-amber-100 text-amber-800 border border-amber-300"
                            : u.role === "admin"
                            ? "bg-purple-100 text-purple-800 border border-purple-200"
                            : "bg-blue-100 text-blue-800 border border-blue-200"
                        }`}
                      >
                        {u.name?.charAt(0)?.toUpperCase() || "U"}
                      </div>
                      <div className="min-w-0">
                        <div className="font-bold text-xs text-slate-900 truncate flex items-center gap-1.5">
                          <span>{u.name}</span>
                          {isSuperUser && (
                            <span className="text-[10px] bg-amber-200 text-amber-900 px-1.5 py-0.2 rounded font-black">
                              Owner
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-500 truncate">
                          @{u.username}
                        </div>
                        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                          <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-slate-100 text-slate-700 border border-slate-200">
                            {ROLE_LABELS[u.role] || u.role}
                          </span>
                          {hasCustom ? (
                            <span className="text-[10px] px-1.5 py-0.2 rounded-full font-bold bg-amber-100 text-amber-800 border border-amber-200 flex items-center gap-0.5">
                              ★ Izin Khusus ({activePermsCount})
                            </span>
                          ) : (
                            <span className="text-[10px] px-1.5 py-0.2 rounded-full font-medium bg-slate-100 text-slate-600">
                              {activePermsCount} Izin
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <ChevronRight
                      size={16}
                      className={`shrink-0 transition-transform ${isSelected ? "text-blue-600 translate-x-0.5" : "text-slate-300"}`}
                    />
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Column: Permission Matrix & Toggles (8 cols) */}
        <div className="lg:col-span-8 bg-white rounded-3xl border border-slate-200 shadow-sm p-5 sm:p-7 space-y-6">
          {selectedUser ? (
            <>
              {/* Selected User Action Banner */}
              <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-slate-50 via-blue-50/30 to-slate-50 border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3.5">
                  <div
                    className={`h-12 w-12 rounded-2xl flex items-center justify-center font-black text-base shadow-sm ${
                      selectedUser.is_superadmin
                        ? "bg-amber-500 text-white"
                        : "bg-blue-600 text-white"
                    }`}
                  >
                    {selectedUser.name?.charAt(0)?.toUpperCase() || "U"}
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="text-base sm:text-lg font-black text-slate-900">
                        {selectedUser.name}
                      </h2>
                      <span className="text-xs text-slate-500">(@{selectedUser.username})</span>
                      {selectedUser.is_superadmin ? (
                        <span className="px-2.5 py-0.5 rounded-full text-xs font-extrabold bg-amber-100 text-amber-800 border border-amber-300 flex items-center gap-1">
                          <Lock size={12} /> Super Admin (Akses Penuh Permanen)
                        </span>
                      ) : (
                        <span
                          className={`px-2 py-0.5 rounded-full text-[11px] font-bold border ${
                            selectedUser.has_custom_perms
                              ? "bg-purple-100 text-purple-800 border-purple-200"
                              : "bg-emerald-100 text-emerald-800 border-emerald-200"
                          }`}
                        >
                          {selectedUser.has_custom_perms ? "★ Izin Khusus Pengguna" : "Standar Peran Terapan"}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-1 text-xs text-slate-600">
                      <span>Peran yang Ditentukan:</span>
                      <select
                        disabled={selectedUser.id === me?.id}
                        value={workingRole}
                        onChange={(e) => {
                          setWorkingRole(e.target.value);
                          setHasChanges(true);
                        }}
                        className="bg-white border border-slate-300 rounded-lg px-2 py-0.5 text-xs font-bold text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      >
                        {definedRolesList.map((r) => (
                          <option key={r} value={r}>
                            {ROLE_LABELS[r] || r}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                {/* Quick actions on selected user */}
                <div className="flex items-center gap-2 flex-wrap sm:justify-end">
                  {!selectedUser.is_superadmin && (
                    <>
                      <button
                        onClick={handleResetToRoleDefault}
                        title="Setel ulang ke default modul peran ini"
                        className="tap h-8 px-2.5 rounded-xl bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-semibold flex items-center gap-1 shadow-2xs"
                      >
                        <RotateCcw size={13} /> Reset Default Peran
                      </button>
                      <button
                        onClick={handleGrantAll}
                        title="Beri semua izin modul"
                        className="tap h-8 px-2.5 rounded-xl bg-blue-50 border border-blue-200 hover:bg-blue-100 text-blue-700 text-xs font-semibold flex items-center gap-1"
                      >
                        <CheckCircle2 size={13} /> Beri Semua
                      </button>
                      <button
                        onClick={handleRevokeAll}
                        title="Hapus semua izin modul"
                        className="tap h-8 px-2.5 rounded-xl bg-rose-50 border border-rose-200 hover:bg-rose-100 text-rose-700 text-xs font-semibold flex items-center gap-1"
                      >
                        <X size={13} /> Cabut Semua
                      </button>
                    </>
                  )}
                  {canAdmin && selectedUser.id !== me?.id && (
                    <button
                      onClick={() => openDeleteUser(selectedUser)}
                      title={`Hapus akun @${selectedUser.username}`}
                      className="tap h-8 px-2.5 rounded-xl bg-rose-100 hover:bg-rose-200 border border-rose-300 text-rose-800 text-xs font-bold flex items-center gap-1.5 transition-all shadow-2xs"
                    >
                      <Trash2 size={13} /> Hapus Akun
                    </button>
                  )}
                </div>
              </div>

              {/* Copy permissions helper */}
              {!selectedUser.is_superadmin && users.length > 1 && (
                <div className="flex items-center gap-2 text-xs bg-slate-50 p-2.5 rounded-xl border border-slate-200 flex-wrap">
                  <Copy size={14} className="text-slate-500" />
                  <span className="font-semibold text-slate-700">Salin izin dari pengguna lain:</span>
                  <select
                    value={copySourceId}
                    onChange={(e) => setCopySourceId(e.target.value)}
                    className="bg-white border border-slate-300 rounded-lg px-2 py-1 text-xs text-slate-800"
                  >
                    <option value="">-- Pilih Pengguna Sumber --</option>
                    {users
                      .filter((u) => u.id !== selectedUser.id)
                      .map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name} (@{u.username}) - {ROLE_LABELS[u.role] || u.role}
                        </option>
                      ))}
                  </select>
                  {copySourceId && (
                    <button
                      onClick={handleCopyPermissions}
                      className="tap px-2.5 py-1 rounded-lg bg-blue-600 text-white font-bold text-xs"
                    >
                      Terapkan Izin
                    </button>
                  )}
                </div>
              )}

              {/* Information for Super Admin */}
              {selectedUser.is_superadmin ? (
                <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-start gap-2.5">
                  <Info size={18} className="shrink-0 text-amber-700 mt-0.5" />
                  <div>
                    <b>Akun Super Admin (Owner):</b> Akun ini memiliki hak akses penuh tanpa batas ke semua fungsi POS, transaksi, reservasi, laporan, dan seluruh pengaturan sistem.
                    {selectedUser.id !== me?.id ? (
                      <span className="block mt-1 text-slate-700">
                        Ini adalah akun Super Admin tambahan. Jika akun ini tidak lagi diperlukan, Anda dapat menghapusnya melalui tombol <b>Hapus Akun</b> di atas, atau mengubah perannya pada menu <b>Peran yang Ditentukan</b>.
                      </span>
                    ) : (
                      <span className="block mt-1 text-slate-700">
                        Ini adalah akun Super Admin utama Anda yang sedang aktif digunakan login.
                      </span>
                    )}
                  </div>
                </div>
              ) : null}

              {/* Categorized Permission Groups */}
              <div className="space-y-6">
                {PERM_GROUPS.map((group) => {
                  const Icon = group.icon;
                  return (
                    <div
                      key={group.id}
                      className="rounded-2xl border border-slate-200 bg-slate-50/40 p-4 sm:p-5 space-y-3.5"
                    >
                      <div className="flex items-center gap-2.5 pb-2 border-b border-slate-200/80">
                        <div className={`p-2 rounded-xl ${group.color}`}>
                          <Icon size={18} />
                        </div>
                        <div>
                          <h3 className="font-extrabold text-sm text-slate-900">
                            {group.name}
                          </h3>
                          <p className="text-[11px] text-slate-500">{group.description}</p>
                        </div>
                      </div>

                      {/* Modules Toggles Grid */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                        {group.modules.map((mod) => {
                          const isEnabled = selectedUser.is_superadmin
                            ? true
                            : workingPerms.includes(mod.code);
                          const isDefaultInRole = roleDefaultPerms.includes(mod.code);
                          const isModified = !selectedUser.is_superadmin && (isEnabled !== isDefaultInRole);

                          return (
                            <div
                              key={mod.code}
                              onClick={() => togglePermission(mod.code)}
                              className={`p-3 rounded-xl border transition-all cursor-pointer select-none flex items-start justify-between gap-3 ${
                                selectedUser.is_superadmin
                                  ? "bg-slate-100/80 border-slate-200 opacity-90 cursor-not-allowed"
                                  : isEnabled
                                  ? "bg-white border-blue-300 shadow-2xs hover:border-blue-400"
                                  : "bg-white/60 border-slate-200 hover:bg-white hover:border-slate-300 opacity-80"
                              }`}
                            >
                              <div className="space-y-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span
                                    className={`font-bold text-xs ${
                                      isEnabled ? "text-slate-900" : "text-slate-500"
                                    }`}
                                  >
                                    {mod.title}
                                  </span>
                                  {mod.highlight && (
                                    <span className="px-1.5 py-0.2 rounded text-[10px] font-black bg-blue-100 text-blue-800 border border-blue-200">
                                      Spesifik
                                    </span>
                                  )}
                                </div>
                                <p className="text-[11px] text-slate-500 leading-relaxed line-clamp-2">
                                  {mod.subtitle}
                                </p>

                                {/* Comparison with Role Default */}
                                {!selectedUser.is_superadmin && (
                                  <div className="pt-1">
                                    {isModified ? (
                                      isEnabled ? (
                                        <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200 flex items-center gap-0.5 w-fit">
                                          + Izin ekstra untuk user ini
                                        </span>
                                      ) : (
                                        <span className="text-[10px] font-bold text-rose-700 bg-rose-50 px-1.5 py-0.5 rounded border border-rose-200 flex items-center gap-0.5 w-fit">
                                          - Dicabut dari peran dasar
                                        </span>
                                      )
                                    ) : (
                                      <span className="text-[10px] text-slate-400 font-medium">
                                        Default peran {ROLE_LABELS[workingRole] || workingRole}
                                      </span>
                                    )}
                                  </div>
                                )}
                              </div>

                              {/* Toggle Switch */}
                              <div className="shrink-0 pt-0.5">
                                <button
                                  type="button"
                                  disabled={selectedUser.is_superadmin}
                                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                                    isEnabled ? "bg-blue-600" : "bg-slate-300"
                                  }`}
                                >
                                  <span
                                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                                      isEnabled ? "translate-x-5" : "translate-x-0"
                                    }`}
                                  />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Sticky / Fixed Bottom Action Bar */}
              {(!selectedUser.is_superadmin || workingRole !== "superadmin") && (
                <div className="pt-4 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-slate-700">
                      Total:{" "}
                      <b className="text-blue-600">
                        {workingPerms.length} dari {ALL_MODULE_CODES.length}
                      </b>{" "}
                      modul aktif
                    </span>
                    {hasChanges && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200 animate-pulse">
                        Ada perubahan belum disimpan
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    {selectedUser.has_custom_perms && (
                      <button
                        onClick={handleRevertServerDefault}
                        disabled={saving}
                        className="tap h-10 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-all"
                      >
                        Kembalikan Murni Default Peran
                      </button>
                    )}
                    <button
                      onClick={handleSave}
                      disabled={saving || !hasChanges}
                      className="tap h-10 px-6 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs flex items-center gap-2 shadow-md disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                    >
                      {saving ? (
                        <RefreshCw size={15} className="animate-spin" />
                      ) : (
                        <Check size={15} />
                      )}
                      Simpan Izin @{selectedUser.username}
                    </button>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="p-12 text-center text-slate-500">
              <UserCheck size={48} className="mx-auto text-slate-300 mb-3" />
              <h3 className="text-sm font-bold text-slate-700">Pilih Pengguna</h3>
              <p className="text-xs text-slate-400 mt-1">
                Pilih salah satu pengguna di panel kiri untuk mengatur hak akses spesifik per peran.
              </p>
            </div>
          )}
        </div>
      </div>
      </div>

      {/* Floating Quick Save Indicator */}
      {hasChanges && (
        <div className="fixed bottom-6 right-6 z-40 bg-slate-900 text-white px-5 py-3 rounded-2xl shadow-2xl border border-slate-700 flex items-center gap-4 animate-in fade-in slide-in-from-bottom-3">
          <div>
            <div className="text-xs font-bold text-amber-400 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
              Perubahan belum disimpan
            </div>
            <div className="text-[11px] text-slate-300">
              Hak akses @{selectedUser?.username} telah diubah
            </div>
          </div>
          <button
            onClick={handleSave}
            disabled={saving}
            className="tap h-9 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs flex items-center gap-1.5 shadow-md disabled:opacity-50"
          >
            {saving ? <RefreshCw size={14} className="animate-spin" /> : <Check size={14} />}
            Simpan Sekarang
          </button>
        </div>
      )}

      {/* Delete User Modal */}
      <Dialog open={!!delTarget} onOpenChange={(o) => { if (!o) { setDelTarget(null); setDelInfo(null); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Hapus Akun — {delTarget?.name}</DialogTitle></DialogHeader>
          {!delInfo ? (
            <div className="flex items-center gap-2 text-sm text-[#52525B]"><Loader2 className="animate-spin" size={16} /> Memeriksa status riwayat transaksi...</div>
          ) : delInfo.error ? (
            <div className="text-sm text-[#B91C1C]">{delInfo.error}</div>
          ) : delInfo.self ? (
            <div className="flex items-start gap-2 text-sm"><AlertTriangle className="text-[#B45309] shrink-0" size={18} />
              <span>Ini akun Anda sendiri — akun yang sedang aktif digunakan login tidak bisa dihapus.</span></div>
          ) : delInfo.is_superadmin && delInfo.is_last_superadmin ? (
            <div className="flex items-start gap-2 text-sm"><AlertTriangle className="text-[#B45309] shrink-0" size={18} />
              <span>Akun <b>Super Admin terakhir</b> tidak bisa dihapus untuk mencegah sistem terkunci tanpa pengelola. Buat atau angkat akun Super Admin lain terlebih dahulu jika ingin menghapus akun ini.</span></div>
          ) : delInfo.is_superadmin ? (
            <div className="space-y-3">
              <div className="flex items-start gap-2 text-sm"><AlertTriangle className="text-[#B45309] shrink-0" size={18} />
                <span>Akun <b>@{delInfo.username}</b> adalah akun <b>Super Admin</b>. Karena masih ada akun Super Admin lain yang aktif, Anda dapat menghapus akun ini secara aman.</span></div>
              <p className="text-xs text-rose-600 font-semibold">Tindakan ini akan menghapus akun dan mencabut semua hak akses Super Admin tersebut.</p>
              {delInfo.has_history && (
                <div className="rounded-xl bg-[#FFFBEB] border border-[#FDE68A] p-3 text-xs">
                  <span>Akun memiliki riwayat transaksi, akan dinonaktifkan agar rekap data laporan tetap aman.</span>
                </div>
              )}
            </div>
          ) : delInfo.has_history ? (
            <div className="space-y-3">
              <div className="flex items-start gap-2 text-sm"><AlertTriangle className="text-[#B45309] shrink-0" size={18} />
                <span>Akun <b>@{delInfo.username}</b> sudah punya <b>riwayat transaksi</b>, jadi <b>tidak dihapus permanen</b> — akan
                  dinonaktifkan agar laporan lama tetap utuh. Pengguna tidak bisa login lagi sampai diaktifkan kembali.</span></div>
              <div className="rounded-xl bg-[#FFFBEB] border border-[#FDE68A] p-3 text-xs">
                {Object.entries(delInfo.counts || {}).map(([k, v]) => (
                  <div key={k} className="flex justify-between"><span>{k}</span><b>{v}</b></div>
                ))}
                <div className="flex justify-between border-t mt-1 pt-1"><span>Total</span><b>{delInfo.total}</b></div>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-start gap-2 text-sm"><AlertTriangle className="text-[#B45309] shrink-0" size={18} />
                <span>Akun <b>@{delInfo.username}</b> belum punya riwayat transaksi, jadi akan <b>dihapus permanen</b>. Tindakan ini tidak bisa dibatalkan.</span></div>
            </div>
          )}
          <DialogFooter>
            {delInfo && !delInfo.error && !delInfo.self && (!delInfo.is_superadmin || !delInfo.is_last_superadmin) && (
              <button
                data-testid="rbac-confirm-del-btn" onClick={doDeleteUser} disabled={delBusy}
                className={`tap w-full h-12 rounded-xl text-white font-bold disabled:opacity-60 ${delInfo.has_history ? "bg-[#B45309]" : "bg-[#B91C1C]"}`}
              >
                {delBusy ? "Memproses..." : delInfo.has_history ? "Nonaktifkan Akun" : "Hapus Permanen"}
              </button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
