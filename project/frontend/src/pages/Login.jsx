import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import api, { apiError, getServerUrl, setServerUrl, discoverServer } from "@/lib/api";
import { toast } from "sonner";
import { Loader2, Lock, Mail, Server, Radar, Download, Globe, Smartphone, Bug, KeyRound, Shield, Delete, UserCheck, Sparkles } from "lucide-react";
import { collectVersions } from "@/lib/versions";
import { usePlatform, logoUrl, brandTitle } from "@/lib/platform";
import { isSuperAdmin } from "@/lib/rbac";
import LoginServerSelector from "@/components/LoginServerSelector";

const TAILSCALE_FUNNEL_URL = "https://grandpos.tailf3a839.ts.net";

export default function Login() {
  const { login, loginPin, user } = useAuth();
  const { platform } = usePlatform();
  const nav = useNavigate();
  
  // Login Mode: 'pin' (default for fast POS access) | 'password'
  const [loginMode, setLoginMode] = useState("pin");
  
  // Password Mode States
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  
  // PIN Mode States
  const [pin, setPin] = useState("");
  const [pinUsers, setPinUsers] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null); // null = auto detect user by PIN
  const [pinLoading, setPinLoading] = useState(false);
  const [pinErrorShake, setPinErrorShake] = useState(false);
  const pinInputRef = useRef(null);
  
  const [loading, setLoading] = useState(false);
  const [showSrv, setShowSrv] = useState(false);
  const [srv, setSrv] = useState(getServerUrl());
  const [showTs, setShowTs] = useState(false);
  const [tsUrl, setTsUrl] = useState(() => {
    const cur = getServerUrl();
    return cur && cur.includes(".ts.net") ? cur : TAILSCALE_FUNNEL_URL;
  });
  const [scanning, setScanning] = useState(false);
  const [testing, setTesting] = useState(false);
  const [version, setVersion] = useState(null);
  const [loginDiagSending, setLoginDiagSending] = useState(false);
  const [loginFailedServer, setLoginFailedServer] = useState(false);

  // Load list of available users for PIN login
  useEffect(() => {
    let stop = false;
    api.get("/auth/pin-users")
      .then((res) => {
        if (!stop && Array.isArray(res.data?.users)) {
          setPinUsers(res.data.users);
        }
      })
      .catch(() => {
        // Fallback default users if offline/initial
        if (!stop) {
          setPinUsers([
            { id: "usr-kasir", name: "Kasir 1", username: "kasir", role: "kasir", role_name: "Kasir POS" },
            { id: "usr-admin", name: "Administrator", username: "admin", role: "admin", role_name: "Admin" },
            { id: "usr-taqim2609", name: "Owner (Taqim)", username: "taqim2609", role: "superadmin", role_name: "Super Admin" },
          ]);
        }
      });
    return () => { stop = true; };
  }, []);

  useEffect(() => {
    let stop = false;
    collectVersions().then((v) => { if (!stop) setVersion(v); }).catch(() => {});
    return () => { stop = true; };
  }, []);

  // Keyboard listener for 6-digit PIN entry
  useEffect(() => {
    if (loginMode !== "pin" || pinLoading) return;

    const handleKeyDown = (e) => {
      // Don't capture if focus is on another text input (like server config)
      if (e.target.tagName === "INPUT" && e.target !== pinInputRef.current) return;

      if (/^[0-9]$/.test(e.key)) {
        e.preventDefault();
        setPin((prev) => {
          if (prev.length < 6) return prev + e.key;
          return prev;
        });
      } else if (e.key === "Backspace") {
        e.preventDefault();
        setPin((prev) => prev.slice(0, -1));
      } else if (e.key === "Escape" || e.key === "Delete") {
        e.preventDefault();
        setPin("");
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [loginMode, pinLoading]);

  // Handle PIN verification when 6 digits are reached
  const submitPin = useCallback(async (pinCode, userObj = selectedUser) => {
    if (!pinCode || pinCode.length !== 6) return;
    setPinLoading(true);
    try {
      const u = await loginPin(pinCode, userObj?.username || null);
      toast.success(`Selamat datang, ${u.name}!`);
      nav(u.role === "admin" || u.role === "superadmin" || u.is_superadmin || isSuperAdmin(u) ? "/dashboard" : u.role === "input" ? "/products" : "/pos");
    } catch (err) {
      setPinErrorShake(true);
      setTimeout(() => setPinErrorShake(false), 600);
      setPin("");
      if (!err.response) {
        setLoginFailedServer(true);
        toast.error(`Tidak bisa terhubung ke server (${getServerUrl() || "Google Cloud"}). Server sedang offline. Silakan pilih server lain.`, { duration: 8000 });
      } else {
        toast.error(apiError(err.response?.data?.detail) || "PIN 6 digit salah");
      }
    } finally {
      setPinLoading(false);
    }
  }, [loginPin, nav, selectedUser]);

  // Auto trigger submit when 6 digits are entered
  useEffect(() => {
    if (pin.length === 6 && !pinLoading) {
      submitPin(pin);
    }
  }, [pin, pinLoading, submitPin]);

  const handleKeypadPress = (val) => {
    if (pinLoading) return;
    if (val === "clear") {
      setPin("");
    } else if (val === "backspace") {
      setPin((prev) => prev.slice(0, -1));
    } else if (typeof val === "number" || typeof val === "string") {
      setPin((prev) => {
        if (prev.length < 6) return prev + String(val);
        return prev;
      });
    }
  };

  // Kirim laporan diagnostik TANPA login — langsung ke Google AI Studio.
  const sendLoginDiag = async () => {
    setLoginDiagSending(true);
    const t = toast.loading("Mengirim laporan diagnostik...");
    try {
      const v = await collectVersions();
      const parts = [
        "=== LAPORAN DIAGNOSTIK (dari layar login) ===",
        `Waktu: ${new Date().toLocaleString("id-ID")}`,
        `Bundle frontend: ${v.bundle}`,
        `Platform: ${v.native ? `APK (Capacitor) v${v.apk}` : "Web"}`,
        `URL server: ${v.serverUrl}`,
        `OTA server: ${v.otaServer || "-"} | OTA lokal: ${v.otaLocal || "-"} | OTA terpasang: ${v.otaInstalled || "-"}`,
        `User-Agent: ${navigator.userAgent || "-"}`,
        `Layar: ${window.screen?.width || "-"}x${window.screen?.height || "-"} (dpr ${window.devicePixelRatio || 1})`,
        `Online: ${navigator.onLine ? "ya" : "tidak"}`,
      ];
      // Probe koneksi ke server (biar laporan mencerminkan kondisi nyata)
      const base = v.serverUrl;
      if (base && base.startsWith("http")) {
        try {
          const r = await fetch(`${base}/api/health`, { cache: "no-store" });
          const j = await r.json().catch(() => ({}));
          parts.push(`Server /api/health: HTTP ${r.status} -> ${JSON.stringify(j)}`);
        } catch (e) {
          parts.push(`Server /api/health: GAGAL -> ${(e && e.message) || e}`);
        }
      }
      const report = parts.join("\n");
      const endpoint = typeof window !== "undefined" && window.location?.origin
        ? `${window.location.origin}/api/rpt`
        : "/api/rpt";
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Gak-Token": "gak_rpt_7f3c9e1b" },
        body: JSON.stringify({ ts: new Date().toISOString(), report }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      toast.success("Laporan terkirim ke Google AI Studio — sebutkan di chat bahwa Anda mengirimnya", { id: t, duration: 8000 });
    } catch (e) {
      toast.error(`Gagal mengirim: ${(e && e.message) || e}. Butuh internet server untuk mengirim.`, { id: t, duration: 9000 });
    } finally {
      setLoginDiagSending(false);
    }
  };

  const testConn = async () => {
    const base = (srv || getServerUrl()).replace(/\/+$/, "");
    if (!base) { toast.error("Isi alamat server dulu"); return; }
    setTesting(true);
    const t = toast.loading(`Menghubungi ${base} ...`);
    try {
      const res = await fetch(`${base}/api/health`);
      const txt = await res.text();
      if (res.ok && txt.includes("gak-pos")) toast.success("Server terhubung! ✅ Silakan login.", { id: t, duration: 6000 });
      else toast.error(`Server menjawab tapi tidak dikenal (HTTP ${res.status}). Cek alamat server.`, { id: t, duration: 8000 });
    } catch (e) {
      toast.error(`Gagal menghubungi server: ${e.message}. Cek IP & koneksi, pastikan diawali http://`, { id: t, duration: 9000 });
    } finally { setTesting(false); }
  };

  const saveSrv = () => {
    setServerUrl(srv);
    toast.success("Alamat server disimpan. Memuat ulang...");
    setTimeout(() => window.location.reload(), 700);
  };

  const saveTs = () => {
    const url = (tsUrl || "").trim().replace(/\/+$/, "");
    if (!/^https?:\/\/.+/.test(url)) {
      toast.error("Alamat Tailscale harus diawali https:// (mis. https://grandpos.tailf3a839.ts.net)");
      return;
    }
    setServerUrl(url);
    setSrv(url);
    toast.success("Terhubung via Tailscale. Memuat ulang...");
    setTimeout(() => window.location.reload(), 700);
  };

  const testTs = async () => {
    const base = (tsUrl || "").trim().replace(/\/+$/, "");
    if (!/^https?:\/\/.+/.test(base)) { toast.error("Isi alamat Tailscale yang benar dulu (https://...)"); return; }
    setTesting(true);
    const t = toast.loading(`Menghubungi ${base} ...`);
    try {
      const res = await fetch(`${base}/api/health`);
      const txt = await res.text();
      if (res.ok && txt.includes("gak-pos")) toast.success("Server Tailscale terhubung! ✅ Silakan login.", { id: t, duration: 6000 });
      else toast.error(`Server menjawab tapi tidak dikenal (HTTP ${res.status}).`, { id: t, duration: 8000 });
    } catch (e) {
      toast.error(`Gagal menghubungi ${base}: ${e.message}. Pastikan Funnel aktif di Pi & URL benar.`, { id: t, duration: 9000 });
    } finally {
      setTesting(false);
    }
  };

  const scan = async () => {
    setScanning(true);
    const t = toast.loading("Mencari server di jaringan...");
    try {
      const found = await discoverServer((done, total) => {
        toast.loading(`Memindai jaringan... (${done}/${total})`, { id: t });
      });
      if (found) {
        setServerUrl(found);
        toast.success(`Server ditemukan: ${found}. Menghubungkan...`, { id: t });
        setTimeout(() => window.location.reload(), 900);
      } else {
        toast.error("Server tidak ditemukan otomatis. Isi alamat manual di Pengaturan Server.", { id: t });
        setShowSrv(true);
      }
    } finally {
      setScanning(false);
    }
  };

  useEffect(() => {
    if (user) nav(user.role === "admin" || user.role === "superadmin" || isSuperAdmin(user) ? "/dashboard" : user.role === "input" ? "/products" : "/pos");
  }, [user, nav]);

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const u = await login(username.trim(), password);
      toast.success(`Selamat datang, ${u.name}`);
      nav(u.role === "admin" || u.role === "superadmin" || u.is_superadmin || isSuperAdmin(u) ? "/dashboard" : u.role === "input" ? "/products" : "/pos");
    } catch (err) {
      if (!err.response) {
        setLoginFailedServer(true);
        toast.error(`Tidak bisa terhubung ke server (${getServerUrl() || "Google Cloud"}). Server sedang offline. Silakan pilih server lain pada panel di atas.`, { duration: 9000 });
      } else if (err.response.status === 401) {
        toast.error("Username atau password salah.");
      } else {
        toast.error(apiError(err.response?.data?.detail) || "Gagal masuk");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      <div className="hidden lg:flex flex-col justify-between text-white p-12 relative overflow-hidden"
        style={{ backgroundImage: "linear-gradient(135deg, var(--gak-side1), var(--gak-pd) 52%, var(--gak-side3))" }}>
        <div className="absolute -right-20 -top-20 h-80 w-80 rounded-full bg-[#F97316]/40 blur-3xl" />
        <div className="absolute -left-24 -bottom-24 h-96 w-96 rounded-full bg-[#4F46E5]/30 blur-3xl" />
        <div className="flex items-center gap-3 relative">
          {platform?.logo_url ? (
            <img src={logoUrl(platform)} alt="logo" className="h-12 w-12 rounded-xl object-contain bg-white/95 p-1" />
          ) : (
            <div className="h-12 w-12 rounded-xl grid place-items-center font-heading font-extrabold text-xl" style={{ backgroundColor: "var(--gak-p)" }}>
              {(platform?.app_name || "G").trim().charAt(0).toUpperCase()}
            </div>
          )}
          <div className="leading-tight">
            <span className="font-heading font-extrabold text-lg">{platform?.app_name || "Grand Aceh Kuliner"}</span>
            {platform?.tagline && <div className="text-[11px] text-white/50 tracking-wide">{platform.tagline}</div>}
          </div>
        </div>
        <div className="relative">
          <h1 className="text-4xl font-extrabold leading-tight">Sistem Kasir Hybrid<br />F&B + Retail</h1>
          <p className="text-white/60 mt-4 max-w-md">
            Dine-in, take away, dan retail dalam satu sistem. Cepat, stabil, dan tetap jalan
            saat internet bermasalah. Masuk cepat kasir menggunakan <b>PIN 6 digit</b>.
          </p>
          <div className="flex gap-3 mt-8">
            <span className="ot-dine_in border rounded-full px-4 py-1.5 text-sm font-bold">Dine-In</span>
            <span className="ot-take_away border rounded-full px-4 py-1.5 text-sm font-bold">Take Away</span>
            <span className="ot-retail border rounded-full px-4 py-1.5 text-sm font-bold">Retail</span>
          </div>
        </div>
        <div className="text-white/40 text-xs relative">© 2026 {brandTitle(platform)}</div>
      </div>

      <div className="flex items-center justify-center p-6 bg-white overflow-y-auto">
        <div className="w-full max-w-md my-auto py-6">
          <div className="w-full" data-testid="login-container">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-2xl font-extrabold">Masuk ke POS</h2>
              <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                <Sparkles size={12} /> Hybrid POS
              </span>
            </div>
            <p className="text-[#52525B] text-sm mb-4">Pilih metode masuk kasir atau administrator.</p>

            {/* Pemilih Server Login Multi-Node & Failover */}
            <LoginServerSelector
              loginFailedServer={loginFailedServer}
              onServerChanged={(newUrl) => {
                setSrv(newUrl);
                setLoginFailedServer(false);
              }}
            />

            {/* TAB SELECTOR: PIN 6 DIGIT vs USERNAME & PASSWORD */}
            <div className="grid grid-cols-2 gap-1.5 p-1 bg-[#F4F4F5] rounded-xl mb-5" data-testid="login-mode-tabs">
              <button
                type="button"
                data-testid="tab-login-pin"
                onClick={() => { setLoginMode("pin"); setPin(""); }}
                className={`tap h-10 rounded-lg text-xs sm:text-sm font-bold flex items-center justify-center gap-1.5 transition-all ${
                  loginMode === "pin"
                    ? "bg-white text-[#E63946] shadow-sm font-extrabold border border-black/5"
                    : "text-[#71717A] hover:text-[#09090B]"
                }`}
              >
                <KeyRound size={16} /> PIN 6 Digit
              </button>
              <button
                type="button"
                data-testid="tab-login-password"
                onClick={() => setLoginMode("password")}
                className={`tap h-10 rounded-lg text-xs sm:text-sm font-bold flex items-center justify-center gap-1.5 transition-all ${
                  loginMode === "password"
                    ? "bg-white text-[#E63946] shadow-sm font-extrabold border border-black/5"
                    : "text-[#71717A] hover:text-[#09090B]"
                }`}
              >
                <Lock size={16} /> Password Akun
              </button>
            </div>

            {/* ================= MODE 1: PIN 6 DIGIT ================= */}
            {loginMode === "pin" ? (
              <div className="space-y-4" data-testid="pin-login-view">
                {/* Dropdown Pemilihan Akun yang Menggunakan PIN */}
                <div>
                  <label className="text-xs uppercase tracking-wider font-extrabold text-[#52525B] flex items-center justify-between mb-1.5">
                    <span>Pilih Akun Kasir / Staf (PIN)</span>
                    {selectedUser && (
                      <span className="text-[11px] text-emerald-600 font-bold flex items-center gap-1">
                        <UserCheck size={12} /> Akun Terpilih
                      </span>
                    )}
                  </label>
                  
                  <div className="relative">
                    <select
                      data-testid="pin-user-dropdown"
                      value={selectedUser ? (selectedUser.username || selectedUser.id) : (selectedUser === "auto" ? "auto" : "")}
                      onChange={(e) => {
                        const val = e.target.value;
                        setPin("");
                        if (!val) {
                          setSelectedUser(null);
                        } else if (val === "auto") {
                          setSelectedUser("auto");
                        } else {
                          const found = pinUsers.find((u) => (u.username || u.id) === val);
                          setSelectedUser(found || null);
                        }
                      }}
                      className="w-full h-12 rounded-xl border border-[#D4D4D8] px-3.5 bg-white text-sm font-bold text-[#09090B] focus:border-[#E63946] focus:ring-2 focus:ring-[#E63946]/20 outline-none shadow-xs"
                    >
                      <option value="">-- Pilih Akun yang Menggunakan PIN --</option>
                      <option value="auto">⚡ Deteksi Otomatis (Auto PIN Semua Akun)</option>
                      {pinUsers.map((u) => (
                        <option key={u.id} value={u.username || u.id}>
                          {u.name} (@{u.username || u.email}) — {u.role_name || u.role}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Info Card Akun Terpilih */}
                {selectedUser && selectedUser !== "auto" && (
                  <div className="p-3 bg-[#F4F4F5] rounded-xl border border-[#E4E4E7] flex items-center justify-between animate-in fade-in duration-200">
                    <div className="flex items-center gap-2.5">
                      <div className="h-9 w-9 rounded-full bg-[#E63946] text-white font-extrabold text-sm flex items-center justify-center shadow-xs">
                        {selectedUser.name?.charAt(0).toUpperCase() || "U"}
                      </div>
                      <div className="leading-tight">
                        <div className="text-sm font-extrabold text-[#09090B]">{selectedUser.name}</div>
                        <div className="text-[11px] text-[#71717A] flex items-center gap-1.5 mt-0.5">
                          <span>@{selectedUser.username || selectedUser.email}</span>
                          <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-[#E4E4E7] text-[#3F3F46]">
                            {selectedUser.role_name || selectedUser.role}
                          </span>
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => { setSelectedUser(null); setPin(""); }}
                      className="text-xs text-[#E63946] font-bold hover:underline"
                    >
                      Ganti Akun
                    </button>
                  </div>
                )}

                {/* TAMPILKAN NUMPAD & SLOT PIN JIKA AKUN SUDAH DIPILIH */}
                {selectedUser ? (
                  <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-200">
                    {/* 6 Digit PIN Display Boxes */}
                    <div className="text-center py-1">
                      <div className="text-xs font-bold text-[#71717A] mb-2.5">
                        {selectedUser === "auto" ? (
                          <span>Ketik PIN 6 digit akun kasir Anda:</span>
                        ) : (
                          <span>Masukkan 6 digit PIN untuk <b>{selectedUser.name}</b>:</span>
                        )}
                      </div>

                      <div
                        data-testid="pin-slots"
                        className={`flex items-center justify-center gap-2.5 sm:gap-3 transition-transform ${
                          pinErrorShake ? "animate-bounce" : ""
                        }`}
                      >
                        {[0, 1, 2, 3, 4, 5].map((idx) => {
                          const isFilled = pin.length > idx;
                          const isActive = pin.length === idx;
                          return (
                            <div
                              key={idx}
                              data-testid={`pin-slot-${idx}`}
                              className={`w-11 h-13 sm:w-12 sm:h-14 rounded-2xl flex items-center justify-center text-xl font-extrabold transition-all duration-150 border-2 ${
                                isFilled
                                  ? "bg-[#E63946] border-[#E63946] text-white shadow-md scale-105"
                                  : isActive
                                  ? "bg-white border-[#E63946] ring-4 ring-[#E63946]/15 shadow-sm"
                                  : "bg-[#F4F4F5] border-[#E4E4E7] text-transparent"
                              }`}
                            >
                              {isFilled ? "●" : ""}
                            </div>
                          );
                        })}
                      </div>

                      {pinLoading && (
                        <div className="flex items-center justify-center gap-2 mt-3 text-xs font-bold text-[#E63946]">
                          <Loader2 size={15} className="animate-spin" />
                          <span>Memverifikasi PIN...</span>
                        </div>
                      )}
                    </div>

                    {/* Numeric Touch Keypad for Touchscreens & POS Terminals */}
                    <div className="grid grid-cols-3 gap-2 max-w-[320px] mx-auto pt-1" data-testid="touch-keypad">
                      {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
                        <button
                          key={num}
                          type="button"
                          data-testid={`keypad-${num}`}
                          onClick={() => handleKeypadPress(num)}
                          disabled={pinLoading}
                          className="tap h-13 sm:h-14 rounded-2xl bg-[#F8F9FA] hover:bg-[#E4E4E7] active:bg-[#D4D4D8] border border-[#E4E4E7] text-xl font-extrabold text-[#09090B] flex items-center justify-center shadow-xs transition-colors disabled:opacity-50"
                        >
                          {num}
                        </button>
                      ))}
                      
                      {/* Clear Key */}
                      <button
                        type="button"
                        data-testid="keypad-clear"
                        onClick={() => handleKeypadPress("clear")}
                        disabled={pinLoading || pin.length === 0}
                        className="tap h-13 sm:h-14 rounded-2xl bg-[#FEF2F2] hover:bg-[#FEE2E2] active:bg-[#FECACA] border border-[#FCA5A5] text-xs font-extrabold text-[#DC2626] flex items-center justify-center transition-colors disabled:opacity-40"
                      >
                        Hapus
                      </button>

                      {/* Digit 0 */}
                      <button
                        type="button"
                        data-testid="keypad-0"
                        onClick={() => handleKeypadPress(0)}
                        disabled={pinLoading}
                        className="tap h-13 sm:h-14 rounded-2xl bg-[#F8F9FA] hover:bg-[#E4E4E7] active:bg-[#D4D4D8] border border-[#E4E4E7] text-xl font-extrabold text-[#09090B] flex items-center justify-center shadow-xs transition-colors disabled:opacity-50"
                      >
                        0
                      </button>

                      {/* Backspace Key */}
                      <button
                        type="button"
                        data-testid="keypad-backspace"
                        onClick={() => handleKeypadPress("backspace")}
                        disabled={pinLoading || pin.length === 0}
                        className="tap h-13 sm:h-14 rounded-2xl bg-[#F8F9FA] hover:bg-[#E4E4E7] active:bg-[#D4D4D8] border border-[#E4E4E7] text-base font-bold text-[#52525B] flex items-center justify-center transition-colors disabled:opacity-40"
                      >
                        <Delete size={20} />
                      </button>
                    </div>
                  </div>
                ) : (
                  /* Placeholder bila belum memilih akun di dropdown */
                  <div className="p-6 bg-[#FAFAFA] rounded-2xl border-2 border-dashed border-[#E4E4E7] text-center space-y-3" data-testid="pin-unselected-placeholder">
                    <div className="h-12 w-12 rounded-2xl bg-[#F4F4F5] text-[#71717A] mx-auto flex items-center justify-center">
                      <KeyRound size={24} />
                    </div>
                    <div>
                      <h4 className="text-sm font-extrabold text-[#09090B]">Pilih Akun untuk Masuk</h4>
                      <p className="text-xs text-[#71717A] mt-1 max-w-xs mx-auto">
                        Silakan pilih akun kasir atau staf Anda pada dropdown di atas untuk memunculkan numpad PIN 6 digit.
                      </p>
                    </div>
                    {pinUsers.length > 0 && (
                      <div className="pt-2">
                        <div className="text-[11px] font-bold text-[#71717A] mb-2">Atau klik cepat akun Anda:</div>
                        <div className="flex flex-wrap gap-2 justify-center">
                          {pinUsers.slice(0, 4).map((u) => (
                            <button
                              key={u.id}
                              type="button"
                              onClick={() => { setSelectedUser(u); setPin(""); }}
                              className="tap px-3 py-1.5 rounded-xl bg-white hover:bg-[#F4F4F5] border border-[#E4E4E7] text-xs font-bold text-[#09090B] shadow-xs flex items-center gap-1.5"
                            >
                              <span className="w-2 h-2 rounded-full bg-emerald-500" />
                              {u.name}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              /* ================= MODE 2: USERNAME & PASSWORD ================= */
              <form onSubmit={submit} className="w-full" data-testid="login-form">
                <label className="text-xs uppercase tracking-wider font-bold text-[#52525B]">Username</label>
                <div className="relative mt-1.5 mb-4">
                  <Mail size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#a1a1aa]" />
                  <input
                    data-testid="login-username"
                    type="text" required value={username} onChange={(e) => setUsername(e.target.value)}
                    className="w-full h-12 pl-10 pr-3 rounded-xl border border-[#E4E4E7] focus:border-[#E63946] focus:ring-2 focus:ring-[#E63946]/20 outline-none"
                    placeholder="username akun Anda"
                  />
                </div>

                <label className="text-xs uppercase tracking-wider font-bold text-[#52525B]">Password</label>
                <div className="relative mt-1.5 mb-6">
                  <Lock size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#a1a1aa]" />
                  <input
                    data-testid="login-password"
                    type="password" required value={password} onChange={(e) => setPassword(e.target.value)}
                    className="w-full h-12 pl-10 pr-3 rounded-xl border border-[#E4E4E7] focus:border-[#E63946] focus:ring-2 focus:ring-[#E63946]/20 outline-none"
                    placeholder="••••••••"
                  />
                </div>

                <button
                  data-testid="login-submit" type="submit" disabled={loading}
                  className="tap w-full h-13 py-3.5 rounded-xl bg-[#E63946] hover:bg-[#BE123C] text-white font-bold flex items-center justify-center gap-2 disabled:opacity-60"
                >
                  {loading && <Loader2 size={18} className="animate-spin" />} Masuk dengan Password
                </button>
              </form>
            )}

            {/* Baris 1: Cari Server Otomatis | Atur Server Manual */}
            <div className="grid grid-cols-2 gap-3 mt-4">
              <button
                type="button" data-testid="server-scan-btn" onClick={scan} disabled={scanning}
                className="tap h-11 rounded-xl border-2 border-[#E63946] text-[#E63946] font-bold text-xs sm:text-sm flex items-center justify-center gap-1.5 text-center leading-tight disabled:opacity-60"
              >
                {scanning ? <Loader2 size={15} className="animate-spin" /> : <Radar size={15} />} Cari Server Otomatis
              </button>
              <button
                type="button" data-testid="server-config-toggle" onClick={() => setShowSrv((v) => !v)}
                className="tap h-11 rounded-xl border-2 border-[#71717A] text-[#52525B] font-bold text-xs sm:text-sm flex items-center justify-center gap-1.5 text-center leading-tight hover:bg-[#52525B] hover:text-white transition-colors"
              >
                <Server size={15} /> Atur Server Manual
              </button>
            </div>
            {showSrv && (
              <div className="mt-3 rounded-xl border border-[#E4E4E7] bg-[#FAFAFA] p-3" data-testid="server-config-panel">
                <label className="text-xs uppercase tracking-wider font-bold text-[#52525B]">Alamat Server</label>
                <input
                  data-testid="server-url-input" value={srv} onChange={(e) => setSrv(e.target.value)}
                  placeholder="http://192.168.1.100"
                  className="w-full h-11 px-3 mt-1.5 rounded-lg border border-[#E4E4E7] text-sm font-mono outline-none focus:border-[#E63946]"
                />
                <p className="text-[11px] text-[#a1a1aa] mt-1.5 leading-snug">
                  Kosongkan untuk memakai server yang sama dengan aplikasi. Isi IP komputer server saat memakai APK Android di jaringan toko.
                </p>
                <button
                  type="button" data-testid="server-url-save" onClick={saveSrv}
                  className="tap mt-2 w-full h-10 rounded-lg bg-[#0A0A0A] text-white font-bold text-sm"
                >
                  Simpan &amp; Hubungkan
                </button>
                <button
                  type="button" data-testid="server-test-btn" onClick={testConn} disabled={testing}
                  className="tap mt-2 w-full h-10 rounded-lg border-2 border-[#0A0A0A] text-[#0A0A0A] font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-60"
                >
                  {testing ? <Loader2 size={15} className="animate-spin" /> : <Radar size={15} />} Tes Koneksi
                </button>
              </div>
            )}

            {/* Baris 2: Unduh Aplikasi | Koneksi via Tailscale */}
            <div className="grid grid-cols-2 gap-3 mt-3">
              <a
                href="/apk/Grand-Aceh-Kuliner-POS-v2.9.apk"
                download
                target="_blank" rel="noopener noreferrer" data-testid="download-app-btn"
                className="tap h-11 rounded-xl border-2 border-[#0A0A0A] text-[#0A0A0A] font-bold text-xs sm:text-sm flex items-center justify-center gap-1.5 text-center leading-tight hover:bg-[#0A0A0A] hover:text-white transition-colors"
              >
                <Download size={15} /> Unduh APK Android
              </a>
              <button
                type="button" data-testid="tailscale-toggle" onClick={() => setShowTs((v) => !v)}
                className="tap h-11 rounded-xl border-2 border-[#2563EB] text-[#2563EB] font-bold text-xs sm:text-sm flex items-center justify-center gap-1.5 text-center leading-tight hover:bg-[#2563EB] hover:text-white transition-colors"
              >
                <Globe size={15} /> Koneksi via Tailscale
              </button>
            </div>
            {showTs && (
              <div className="mt-3 rounded-xl border border-[#BFDBFE] bg-[#EFF6FF] p-3" data-testid="tailscale-panel">
                <label className="text-xs uppercase tracking-wider font-bold text-[#1D4ED8]">Alamat Server Tailscale (Funnel)</label>
                <input
                  data-testid="tailscale-url-input" value={tsUrl} onChange={(e) => setTsUrl(e.target.value)}
                  placeholder="https://grandpos.tailf3a839.ts.net"
                  className="w-full h-11 px-3 mt-1.5 rounded-lg border border-[#BFDBFE] bg-white text-sm font-mono outline-none focus:border-[#2563EB]"
                />
                <p className="text-[11px] text-[#3B82F6] mt-1.5 leading-snug">
                  Akses server toko dari luar jaringan lewat internet, tanpa memasang aplikasi Tailscale di HP. Jalankan dulu <span className="font-mono">setup-funnel-pi.sh</span> di Raspberry Pi untuk mengaktifkan Funnel.
                </p>
                <button
                  type="button" data-testid="tailscale-save" onClick={saveTs}
                  className="tap mt-2 w-full h-10 rounded-lg bg-[#2563EB] text-white font-bold text-sm"
                >
                  Simpan &amp; Hubungkan
                </button>
                <button
                  type="button" data-testid="tailscale-test" onClick={testTs} disabled={testing}
                  className="tap mt-2 w-full h-10 rounded-lg border-2 border-[#2563EB] text-[#2563EB] font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-60"
                >
                  {testing ? <Loader2 size={15} className="animate-spin" /> : <Radar size={15} />} Tes Koneksi
                </button>
              </div>
            )}
          </div>

          {/* Footer versi + Diagnostik — tampil di layar login (bertumpuk) */}
          <div className="mt-4 text-center text-[11px] text-[#8b87a8] font-mono" data-testid="login-version">
            <div className="flex items-center justify-center gap-1.5">
              <Smartphone size={11} />
              <span>{version?.native ? `APK v${version.apk}` : `Web · bundle ${version?.bundle || "-"}`}</span>
            </div>
            {version?.native && (
              <div className="mt-0.5">OTA {version.otaInstalled || version.otaServer || "-"}</div>
            )}
            {version?.native && version.otaServer && version.otaInstalled && version.otaServer > version.otaInstalled && (
              <div className="mt-1 text-[10px] text-[#B45309]">Update OTA tersedia ({version.otaServer}) — buka aplikasi untuk memasang.</div>
            )}
            {/* Diagnostik tanpa login */}
            <button
              type="button"
              data-testid="login-diag-btn"
              onClick={sendLoginDiag}
              disabled={loginDiagSending}
              className="tap mt-3 inline-flex items-center gap-1.5 rounded-lg border border-[#4F46E5] text-[#4F46E5] font-bold text-xs px-3 py-2 hover:bg-[#EEF2FF] disabled:opacity-50"
            >
              {loginDiagSending ? <Loader2 size={13} className="animate-spin" /> : <Bug size={13} />}
              {loginDiagSending ? "Mengirim..." : "Kirim Laporan Diagnostik"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
