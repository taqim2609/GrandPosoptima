import { NavLink, useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { useOffline } from "@/context/OfflineContext";
import { rupiah, ORDER_TYPE_LABEL } from "@/lib/format";
import api, { apiError } from "@/lib/api";
import { loadFeatures, useFeatures } from "@/lib/features";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { usePlatform, logoUrl } from "@/lib/platform";
import { canAny, roleNameOf, isSuperAdmin } from "@/lib/rbac";
import { useUI, orderNav, navLabel } from "@/lib/ui";
import { NAV_ITEMS } from "@/lib/navItems";
import { VisualSyncBadge } from "@/components/VisualSyncStatus";
import VisualSyncStatusCard from "@/components/VisualSyncStatus";
import ThreeServerMatrix from "@/components/ThreeServerMatrix";
import PWAInstallButton from "@/components/PWAInstallButton";
import PostgresStatusIndicator from "@/components/PostgresStatusIndicator";
import {
  Clock, LogOut, ShieldCheck, Menu, X,
  Wifi, WifiOff, RefreshCw, CloudOff, Database, KeyRound,
  Trash2, ChevronDown, ChevronUp, Info, MessageCircle,
  PanelLeftClose, PanelLeftOpen,
} from "lucide-react";

function ChangePasswordDialog({ open, onClose }) {
  const [cur, setCur] = useState("");
  const [nw, setNw] = useState("");
  const [nw2, setNw2] = useState("");
  const [saving, setSaving] = useState(false);
  const submit = async () => {
    if (!cur) return toast.error("Masukkan password lama");
    if (nw.length < 6) return toast.error("Password baru minimal 6 karakter");
    if (nw !== nw2) return toast.error("Konfirmasi password tidak cocok");
    setSaving(true);
    try {
      await api.post("/auth/change-password", { current_password: cur, new_password: nw });
      toast.success("Password berhasil diganti");
      setCur(""); setNw(""); setNw2(""); onClose();
    } catch (e) { toast.error(apiError(e.response?.data?.detail)); } finally { setSaving(false); }
  };
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader><DialogTitle>Ganti Password</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <input data-testid="cur-password" type="password" placeholder="Password lama" value={cur} onChange={(e) => setCur(e.target.value)} className="w-full h-11 rounded-xl border px-3" />
          <input data-testid="new-password" type="password" placeholder="Password baru (min. 6 karakter)" value={nw} onChange={(e) => setNw(e.target.value)} className="w-full h-11 rounded-xl border px-3" />
          <input data-testid="confirm-password" type="password" placeholder="Ulangi password baru" value={nw2} onChange={(e) => setNw2(e.target.value)} className="w-full h-11 rounded-xl border px-3" />
        </div>
        <DialogFooter>
          <button data-testid="save-password-btn" onClick={submit} disabled={saving} className="tap w-full h-12 rounded-xl bg-[#E63946] text-white font-bold disabled:opacity-50">
            {saving ? "Menyimpan..." : "Simpan"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function HeaderConnectionBanner({ onOpenQueue }) {
  const { online, pendingCount, syncing, syncNow } = useOffline();
  if (online && pendingCount === 0) return null;

  return (
    <div
      data-testid="header-offline-banner"
      className={`w-full shrink-0 px-4 py-2.5 text-xs font-bold flex flex-wrap items-center justify-between gap-2 transition-all shadow-sm ${
        !online
          ? "bg-[#FEF2F2] text-[#991B1B] border-b-2 border-[#EF4444]"
          : "bg-[#FFFBEB] text-[#92400E] border-b-2 border-[#F59E0B]"
      }`}
    >
      <div className="flex items-center gap-2">
        {!online ? (
          <div className="flex items-center gap-2 font-extrabold">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-red-600"></span>
            </span>
            <WifiOff size={16} className="text-[#DC2626]" />
            <span>MODE OFFLINE: Terputus dari server. Transaksi baru otomatis disimpan di memori lokal.</span>
          </div>
        ) : (
          <div className="flex items-center gap-2 font-extrabold">
            <CloudOff size={16} className="text-[#D97706]" />
            <span>Terhubung kembali: Ada {pendingCount} transaksi lokal menunggu disinkronkan ke server.</span>
          </div>
        )}
      </div>
      <div className="flex items-center gap-2 ml-auto">
        {pendingCount > 0 && (
          <button
            data-testid="banner-queue-btn"
            onClick={onOpenQueue}
            className="tap px-3 py-1 rounded-lg bg-white border border-current text-xs font-bold hover:bg-black/5 shadow-xs"
          >
            Lihat Antrean ({pendingCount})
          </button>
        )}
        {online && pendingCount > 0 && (
          <button
            data-testid="banner-sync-btn"
            onClick={syncNow}
            disabled={syncing}
            className="tap px-3.5 py-1.5 rounded-lg bg-[#E63946] hover:bg-[#BE123C] text-white text-xs font-extrabold flex items-center gap-1.5 shadow-sm disabled:opacity-50"
          >
            <RefreshCw size={13} className={syncing ? "animate-spin" : ""} />
            {syncing ? "Menyinkronkan..." : "Sinkronkan Sekarang"}
          </button>
        )}
      </div>
    </div>
  );
}

function HeaderConnectionBadge({ onOpenQueue, onOpenSyncModal }) {
  const { online, pendingCount } = useOffline();
  const [shift, setShift] = useState(undefined);
  const [waStatus, setWaStatus] = useState({ status: "checking", state: "checking", message: "" });

  useEffect(() => {
    if (!online) return;
    api.get("/shifts/current")
      .then((r) => setShift(r.data && r.data.id && r.data.status !== "closed" ? r.data : null))
      .catch(() => setShift(null));
  }, [online]);

  useEffect(() => {
    let timer = null;
    const fetchWaStatus = async () => {
      try {
        const res = await api.get("/whatsapp/status");
        setWaStatus(res.data || { status: "connected", state: "open" });
      } catch (e) {
        setWaStatus({ status: "disconnected", state: "close", message: "Gateway Offline" });
      }
    };

    if (online) {
      fetchWaStatus();
      timer = setInterval(fetchWaStatus, 15000);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [online]);

  const isWaActive = waStatus.status === "connected" || waStatus.state === "open";

  return (
    <div className="flex items-center gap-2">
      <PWAInstallButton />
      <PostgresStatusIndicator />
      <VisualSyncBadge onClick={onOpenSyncModal} />

      <NavLink
        to="/whatsapp"
        data-testid="header-wa-indicator"
        title={
          isWaActive
            ? `WhatsApp Gateway Aktif (${waStatus.instance || "Hermes / wacloud.id"}) - Klik untuk kelola`
            : "WhatsApp Gateway Terputus / Perlu Scan QR - Klik untuk menghubungkan"
        }
        className={`tap h-9 px-2.5 rounded-lg flex items-center gap-1.5 text-xs font-bold border transition-colors ${
          isWaActive
            ? "bg-[#F0FDF4] text-[#15803D] border-[#BBF7D0] hover:bg-[#DCFCE7]"
            : "bg-[#FFF1F2] text-[#BE123C] border-[#FECDD3] hover:bg-[#FFE4E6] animate-pulse"
        }`}
      >
        <MessageCircle size={14} className={isWaActive ? "text-[#16A34A]" : "text-[#E11D48]"} />
        <span className="hidden md:inline">{isWaActive ? "WA Gateway Aktif" : "WA Gateway Offline"}</span>
        <span className="md:hidden">WA</span>
      </NavLink>

      {shift !== undefined && (
        <NavLink
          to="/shift"
          data-testid="header-shift-badge"
          title={shift ? `Shift aktif sejak ${new Date(shift.opened_at).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}` : "Shift belum dibuka - klik untuk buka shift"}
          className={`tap h-9 px-2.5 rounded-lg flex items-center gap-1.5 text-xs font-bold border transition-colors ${
            shift
              ? "bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100"
              : "bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100"
          }`}
        >
          {shift ? (
            <>
              <span className="h-2 w-2 rounded-full bg-emerald-500"></span>
              <span className="hidden sm:inline">Shift Aktif</span>
              <span className="sm:hidden">Shift</span>
            </>
          ) : (
            <>
              <Clock size={13} className="text-amber-600" />
              <span className="hidden sm:inline">Shift Belum Buka</span>
              <span className="sm:hidden">Buka Shift</span>
            </>
          )}
        </NavLink>
      )}
      {pendingCount > 0 && (
        <button
          data-testid="header-pending-btn"
          onClick={onOpenQueue}
          title={`${pendingCount} transaksi belum disinkron`}
          className="tap h-9 px-2.5 rounded-lg bg-[#FEF3C7] text-[#92400E] border border-[#FDE68A] text-xs font-black flex items-center gap-1 hover:bg-[#FDE68A] shadow-xs"
        >
          <CloudOff size={13} className="text-[#D97706]" />
          <span>{pendingCount} Lokal</span>
        </button>
      )}
    </div>
  );
}

function OfflineStatus({ onOpenQueue, isCollapsed }) {
  const { online, pendingCount, syncing, syncNow, syncLog } = useOffline();
  const cacheAt = localStorage.getItem("gak_pos_cache_at");

  if (isCollapsed) {
    return (
      <div data-testid="offline-status-collapsed" className="py-2.5 px-2 border-b border-white/10 flex flex-col items-center gap-1.5" title={online ? "Status: Online" : "Status: Offline"}>
        <div className={`p-1.5 rounded-lg ${online ? "bg-emerald-500/20 text-[#22C55E]" : "bg-red-500/20 text-[#EF4444]"}`}>
          {online ? <Wifi size={15} /> : <WifiOff size={15} />}
        </div>
        {pendingCount > 0 && (
          <button onClick={onOpenQueue} className="h-6 w-6 rounded-full bg-amber-500 text-slate-900 font-extrabold text-[10px] grid place-items-center" title={`${pendingCount} transaksi belum sinkron`}>
            {pendingCount}
          </button>
        )}
      </div>
    );
  }

  return (
    <div data-testid="offline-status" className={`px-3 py-2.5 border-b border-white/10 ${online ? "" : "bg-[#EF4444]/20"}`}>
      <div className="flex items-center gap-2 text-sm font-bold">
        {online ? <Wifi size={16} className="text-[#22C55E]" /> : <WifiOff size={16} className="text-[#EF4444]" />}
        <span className={online ? "text-[#22C55E]" : "text-[#EF4444]"}>{online ? "Online" : "Offline"}</span>
      </div>
      {cacheAt && (
        <div className="mt-1 text-[10px] text-white/40 flex items-center gap-1" data-testid="cache-time">
          <Database size={10} /> Data ter-cache {new Date(cacheAt).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}
        </div>
      )}
      {pendingCount > 0 && (
        <div className="mt-2 flex items-center justify-between gap-2 bg-[#F59E0B]/20 rounded-lg px-2 py-1.5" data-testid="pending-sync">
          <button onClick={onOpenQueue} data-testid="open-queue-btn" className="text-[11px] font-bold text-[#FBBF24] flex items-center gap-1 hover:underline">
            <CloudOff size={13} /> {pendingCount} belum sinkron
          </button>
          {online && (
            <button data-testid="sync-now-btn" onClick={syncNow} disabled={syncing} className="tap text-[11px] font-bold bg-white/15 hover:bg-white/25 rounded px-2 py-1 flex items-center gap-1">
              <RefreshCw size={11} className={syncing ? "animate-spin" : ""} /> Sinkron
            </button>
          )}
        </div>
      )}
      {pendingCount === 0 && syncLog.length > 0 && (
        <button data-testid="open-history-btn" onClick={onOpenQueue} className="mt-2 text-[10px] font-bold text-white/45 hover:text-white/80 flex items-center gap-1">
          <RefreshCw size={10} /> Riwayat sinkron ({syncLog.length})
        </button>
      )}
    </div>
  );
}

function SyncQueueDialog({ open, onClose }) {
  const { pending, online, syncNow, retryOne, removePending, syncing, syncLog, clearSyncLog } = useOffline();
  const [expandedId, setExpandedId] = useState(null);

  const handleDelete = (temp_id) => {
    if (window.confirm("Apakah Anda yakin ingin menghapus transaksi lokal ini secara permanen dari antrean?")) {
      removePending(temp_id);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RefreshCw size={20} className={syncing ? "animate-spin text-[#E63946]" : "text-[#E63946]"} />
            Sync Manager (Antrean Offline)
          </DialogTitle>
        </DialogHeader>
        {pending.length === 0 ? (
          <p className="text-sm text-[#52525B] py-6 text-center">Tidak ada transaksi menunggu sinkron.</p>
        ) : (
          <>
            <div className="max-h-[50vh] overflow-y-auto space-y-2.5">
              {pending.map((p) => {
                const isExpanded = expandedId === p.temp_id;
                return (
                  <div key={p.temp_id} data-testid={`queue-item-${p.temp_id}`} className="rounded-xl border border-neutral-200 bg-white p-3.5 transition-all shadow-xs">
                    <div className="flex justify-between items-start gap-3">
                      <div className="overflow-hidden flex-1">
                        <div className="font-extrabold text-sm text-neutral-800 flex items-center gap-1.5 flex-wrap">
                          <span>{ORDER_TYPE_LABEL[p.meta?.order_type] || p.meta?.order_type}</span>
                          <span className="text-neutral-300 font-normal">·</span>
                          <span className="text-[#047857] font-num">{rupiah(p.meta?.total || p.payload?.total || 0)}</span>
                        </div>
                        <div className="text-xs text-[#52525B] truncate mt-1">{p.meta?.preview || "Tidak ada pratampil"}</div>
                        <div className="text-[10px] text-[#a1a1aa] font-num mt-0.5">{new Date(p.created_at).toLocaleString("id-ID")}</div>
                        {p.error && <div className="text-[11px] text-[#EF4444] font-bold mt-1 bg-red-50 p-1 rounded">Gagal: {p.error}</div>}
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          data-testid={`expand-${p.temp_id}`}
                          onClick={() => setExpandedId(isExpanded ? null : p.temp_id)}
                          className="tap h-8 px-2 rounded-lg bg-[#F4F5F7] hover:bg-[#E4E4E7] text-neutral-600 flex items-center justify-center"
                          title="Lihat Detail"
                        >
                          {isExpanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                        </button>
                        {online && (
                          <button
                            data-testid={`retry-${p.temp_id}`}
                            onClick={() => retryOne(p.temp_id)}
                            disabled={syncing}
                            className="tap h-8 px-2.5 text-xs font-bold bg-[#E6F4EA] hover:bg-[#CEEAD6] text-[#137333] rounded-lg flex items-center gap-1"
                            title="Coba sinkronisasi transaksi ini"
                          >
                            <RefreshCw size={12} className={syncing ? "animate-spin" : ""} />
                            <span>Retry</span>
                          </button>
                        )}
                        <button
                          data-testid={`clear-${p.temp_id}`}
                          onClick={() => handleDelete(p.temp_id)}
                          className="tap h-8 w-8 text-xs font-bold bg-[#FCE8E6] hover:bg-[#FAD2CF] text-[#C5221F] rounded-lg flex items-center justify-center"
                          title="Hapus transaksi dari antrean"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="mt-3 p-3 bg-neutral-50 rounded-lg border border-neutral-200 text-xs space-y-2 animate-fadeIn">
                        <div className="font-bold text-neutral-700 flex items-center gap-1">
                          <Info size={13} className="text-neutral-500" />
                          <span>Rincian Transaksi:</span>
                        </div>
                        <div className="divide-y divide-neutral-100">
                          {(p.payload?.items || []).map((it, idx) => (
                            <div key={idx} className="py-1 flex justify-between">
                              <span>{it.name} <span className="text-neutral-500">x{it.qty}</span></span>
                              <span className="font-num font-medium">{rupiah(it.price * it.qty)}</span>
                            </div>
                          ))}
                        </div>
                        <div className="pt-2 border-t flex justify-between font-bold text-neutral-800">
                          <span>Total Tagihan</span>
                          <span>{rupiah(p.meta?.total || p.payload?.total || 0)}</span>
                        </div>
                        {p.payload?.customer_name && (
                          <div className="text-[11px] text-neutral-500">Pelanggan: <span className="font-semibold text-neutral-700">{p.payload.customer_name}</span></div>
                        )}
                        {p.payload?.notes && (
                          <div className="text-[11px] text-neutral-500">Catatan: <span className="font-medium italic text-neutral-600">"{p.payload.notes}"</span></div>
                        )}
                        <div className="text-[10px] text-neutral-400 font-mono">ID Temp: {p.temp_id}</div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            {online ? (
              <button data-testid="sync-all-btn" onClick={syncNow} disabled={syncing} className="tap w-full h-11 rounded-xl bg-[#E63946] hover:bg-[#BE123C] text-white font-bold mt-3 shadow-xs flex items-center justify-center gap-2">
                <RefreshCw size={15} className={syncing ? "animate-spin" : ""} />
                <span>Sinkron Semua Antrean</span>
              </button>
            ) : (
              <p className="text-xs text-[#B45309] font-bold text-center mt-3 bg-amber-50 p-2 rounded-lg border border-amber-200">Perangkat sedang offline — transaksi akan otomatis disinkron saat terhubung kembali.</p>
            )}
          </>
        )}
        <div className="mt-4 border-t pt-3" data-testid="sync-history">
          <div className="flex items-center justify-between mb-2">
            <h4 className="font-extrabold text-sm">Riwayat Sinkron</h4>
            {syncLog.length > 0 && (
              <button data-testid="clear-history-btn" onClick={clearSyncLog} className="text-[11px] font-bold text-[#EF4444] hover:underline">Bersihkan</button>
            )}
          </div>
          {syncLog.length === 0 ? (
            <p className="text-xs text-[#a1a1aa]">Belum ada riwayat sinkron.</p>
          ) : (
            <div className="max-h-40 overflow-y-auto space-y-2">
              {syncLog.map((e) => (
                <div key={e.at} data-testid="history-item" className="rounded-lg bg-[#F4F5F7] p-2.5">
                  <div className="text-xs font-bold text-[#047857]">
                    {e.ok} transaksi disinkron <span className="text-[#52525B] font-normal font-num">· {new Date(e.at).toLocaleString("id-ID")}</span>
                  </div>
                  {e.items.map((it) => (
                    <div key={it.client_ref} className="text-[11px] text-[#52525B] font-num mt-0.5 truncate">
                      {it.client_ref} → <span className="font-bold text-[#0A0A0A]">{it.order_number || "-"}</span> · {rupiah(it.total || 0)}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const { platform } = usePlatform();
  const nav = useNavigate();
  const [queueOpen, setQueueOpen] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);
  const [syncModalOpen, setSyncModalOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(() => {
    try {
      return localStorage.getItem("gak_sidebar_collapsed") === "true";
    } catch (_) {
      return false;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem("gak_sidebar_collapsed", String(isCollapsed));
    } catch (_) {}
  }, [isCollapsed]);

  const { feat } = useFeatures();
  const ui = useUI();
  useEffect(() => { loadFeatures(); }, []);
  const aiVisible = feat("ai.enabled") && feat("ai.assistant");
  const canNav = (n) => {
    if (isSuperAdmin(user)) return true;
    const mods = n.mods || (n.mod ? [n.mod] : []);
    if (mods.length) return canAny(user, mods);
    return (n.roles || []).includes(user?.role) || user?.role === "superadmin";
  };

  return (
    <div className="flex h-screen overflow-hidden bg-[#F4F5F7]">
      {/* Top Header */}
      <header className={`fixed top-0 left-0 ${isCollapsed ? "lg:left-[72px]" : "lg:left-[240px]"} right-0 h-14 bg-white border-b border-[#E4E4E7] z-30 flex items-center justify-between px-3 lg:px-6 shadow-xs transition-all duration-200`}>
        <div className="flex items-center gap-2.5 min-w-0">
          <button
            data-testid="sidebar-toggle"
            onClick={() => setSidebarOpen(true)}
            className="lg:hidden tap h-10 w-10 rounded-xl bg-[#0A0A0A] text-white grid place-items-center shrink-0 shadow-sm"
          >
            <Menu size={18} />
          </button>
          <div className="font-heading font-extrabold text-sm text-[#0A0A0A] truncate">
            {platform?.app_name || "Grand Aceh Kuliner"}
          </div>
        </div>
        <HeaderConnectionBadge onOpenQueue={() => setQueueOpen(true)} onOpenSyncModal={() => setSyncModalOpen(true)} />
      </header>

      {sidebarOpen && <div data-testid="sidebar-backdrop" onClick={() => setSidebarOpen(false)} className="lg:hidden fixed inset-0 bg-black/50 z-40" />}

      {/* SIDEBAR NAVIGATION (EXPANDABLE & COLLAPSIBLE) */}
      <aside className={`fixed lg:static z-50 h-full ${isCollapsed ? "lg:w-[72px]" : "lg:w-[240px]"} w-[240px] shrink-0 text-white flex flex-col transition-all duration-200 ${sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}`}
        style={{ backgroundImage: "linear-gradient(180deg, var(--gak-side1), var(--gak-side2) 55%, var(--gak-side3))" }}>
        
        {/* BRAND & COLLAPSE TOGGLE HEADER */}
        <div className={`px-4 py-4 border-b border-white/10 flex items-center ${isCollapsed ? "justify-center" : "justify-between"}`}>
          {!isCollapsed && (
            <div className="flex items-center gap-2.5 min-w-0">
              {platform?.logo_url ? (
                <img src={logoUrl(platform)} alt="logo" className="h-9 w-9 rounded-lg object-contain bg-white/95 p-0.5 shrink-0" />
              ) : (
                <div className="h-9 w-9 rounded-lg grid place-items-center font-heading font-extrabold shrink-0" style={{ backgroundColor: "var(--gak-p)" }}>
                  {(platform?.app_name || "G").trim().charAt(0).toUpperCase()}
                </div>
              )}
              <div className="leading-tight overflow-hidden">
                <div className="font-heading font-extrabold text-[15px] truncate">{platform?.app_name || "Grand Aceh Kuliner"}</div>
                <div className="text-[11px] text-white/50 tracking-wide">{platform?.tagline || "KULINER POS"}</div>
              </div>
            </div>
          )}

          {isCollapsed && (
            <button
              data-testid="sidebar-logo-collapsed"
              onClick={() => setIsCollapsed(false)}
              title="Buka Menu"
              className="h-9 w-9 rounded-lg grid place-items-center font-heading font-extrabold shrink-0 hover:bg-white/10 transition-colors"
              style={{ backgroundColor: "var(--gak-p)" }}
            >
              {(platform?.app_name || "G").trim().charAt(0).toUpperCase()}
            </button>
          )}

          {/* DESKTOP COLLAPSE BUTTON */}
          <button
            data-testid="collapse-toggle"
            onClick={() => setIsCollapsed(!isCollapsed)}
            title={isCollapsed ? "Buka Menu (Expand)" : "Sembunyikan Menu (Collapse)"}
            className="hidden lg:grid h-8 w-8 rounded-lg bg-white/10 hover:bg-white/20 place-items-center text-white/80 hover:text-white transition-colors"
          >
            {isCollapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
          </button>

          {/* MOBILE CLOSE BUTTON */}
          <button
            data-testid="sidebar-close"
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden h-9 w-9 rounded-lg bg-white/10 grid place-items-center"
          >
            <X size={18} />
          </button>
        </div>

        <OfflineStatus onOpenQueue={() => setQueueOpen(true)} isCollapsed={isCollapsed} />

        <nav className="flex-1 overflow-y-auto no-scrollbar py-2.5 px-2 space-y-3">
          {(() => {
            const filteredNav = orderNav(
              NAV_ITEMS.filter((n) => canNav(n) && !(n.to === "/asisten-ai" && !aiVisible)),
              ui
            );
            const sections = [];
            filteredNav.forEach((item) => {
              const secName = item.section || "Menu Utama";
              let group = sections.find((s) => s.title === secName);
              if (!group) {
                group = { title: secName, items: [] };
                sections.push(group);
              }
              group.items.push(item);
            });

            return sections.map((sec, sIdx) => (
              <div key={sec.title || sIdx} className="space-y-1">
                {!isCollapsed ? (
                  <div className="px-3 py-1 text-[10px] font-extrabold uppercase tracking-widest text-white/40">
                    {sec.title}
                  </div>
                ) : (
                  <div className="my-2 border-t border-white/10" />
                )}
                {sec.items.map((n) => (
                  <NavLink
                    key={n.to}
                    to={n.to}
                    data-testid={`nav-${n.to.slice(1)}`}
                    onClick={() => setSidebarOpen(false)}
                    title={navLabel(n, ui)}
                    className={({ isActive }) =>
                      `tap flex items-center ${isCollapsed ? "justify-center h-10 w-10 mx-auto" : "gap-2.5 px-3 h-10"} rounded-xl font-medium text-xs sm:text-sm transition-all ${
                        isActive
                          ? "text-white font-bold shadow-md shadow-black/25 ring-1 ring-white/20"
                          : "text-white/75 hover:bg-white/10 hover:text-white"
                      }`
                    }
                    style={({ isActive }) =>
                      isActive
                        ? { backgroundImage: "linear-gradient(90deg, var(--gak-p), var(--gak-a))" }
                        : undefined
                    }
                  >
                    <n.icon size={18} className="shrink-0" />
                    {!isCollapsed && <span className="truncate">{navLabel(n, ui)}</span>}
                  </NavLink>
                ))}
              </div>
            ));
          })()}
        </nav>

        {/* USER PROFILE & FOOTER */}
        <div className="p-3 border-t border-white/10">
          {!isCollapsed ? (
            <>
              <div className="flex items-center gap-2 px-2 py-2 mb-2">
                <div className="h-8 w-8 rounded-full bg-white/10 grid place-items-center text-xs font-bold shrink-0">
                  {user?.name?.[0]?.toUpperCase()}
                </div>
                <div className="leading-tight overflow-hidden">
                  <div className="text-sm font-semibold truncate">{user?.name}</div>
                  <div className="text-[11px] text-white/50 flex items-center gap-1">
                    {user?.role_base === "admin" && <ShieldCheck size={11} />}
                    {roleNameOf(user)}
                  </div>
                </div>
              </div>
              <button
                data-testid="change-password-btn"
                onClick={() => setPwOpen(true)}
                className="tap w-full flex items-center justify-center gap-2 h-10 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-semibold mb-2 transition-colors"
              >
                <KeyRound size={15} /> Ganti Password
              </button>
              <button
                data-testid="logout-btn"
                onClick={logout}
                className="tap w-full flex items-center justify-center gap-2 h-10 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-semibold transition-colors"
              >
                <LogOut size={15} /> Keluar
              </button>
            </>
          ) : (
            <div className="flex flex-col items-center gap-2 py-1">
              <div
                className="h-9 w-9 rounded-full bg-white/10 grid place-items-center text-xs font-bold shrink-0"
                title={`${user?.name} (${roleNameOf(user)})`}
              >
                {user?.name?.[0]?.toUpperCase()}
              </div>
              <button
                data-testid="change-password-btn-collapsed"
                onClick={() => setPwOpen(true)}
                title="Ganti Password"
                className="tap h-9 w-9 rounded-lg bg-white/10 hover:bg-white/20 grid place-items-center text-white/80 hover:text-white transition-colors"
              >
                <KeyRound size={15} />
              </button>
              <button
                data-testid="logout-btn-collapsed"
                onClick={logout}
                title="Keluar / Logout"
                className="tap h-9 w-9 rounded-lg bg-white/10 hover:bg-white/20 grid place-items-center text-white/80 hover:text-white transition-colors"
              >
                <LogOut size={15} />
              </button>
            </div>
          )}
        </div>
      </aside>

      <main className="flex-1 overflow-hidden flex flex-col pt-14">
        <HeaderConnectionBanner onOpenQueue={() => setQueueOpen(true)} />
        <div className="flex-1 overflow-hidden">{children}</div>
      </main>

      <ChangePasswordDialog open={pwOpen} onClose={() => setPwOpen(false)} />
      <SyncQueueDialog open={queueOpen} onClose={() => setQueueOpen(false)} />
      <Dialog open={syncModalOpen} onOpenChange={setSyncModalOpen}>
        <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto p-4 sm:p-6 bg-neutral-50/95 border border-neutral-200">
          <DialogHeader className="sr-only">
            <DialogTitle>Status Sinkronisasi &amp; Pusat 3 Server</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <ThreeServerMatrix showHeader={true} className="border border-neutral-200 shadow-sm" />
            <VisualSyncStatusCard className="border border-neutral-200 shadow-sm" />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
