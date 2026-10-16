import { useEffect, useState } from "react";
import api, { apiError } from "@/lib/api";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import { copyText } from "@/lib/utils";
import { ROLE_LABELS, BUILTIN_ROLE_ORDER, can, isSuperAdmin } from "@/lib/rbac";
import {
  Users, Plus, Power, ShieldCheck, KeyRound, UserCog, Trash2, Eye, EyeOff, Copy,
  AlertTriangle, Loader2, CheckCircle2, Tags, Key, Hash,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

const empty = { name: "", username: "", password: "", pin: "", pin_enabled: true, role: "kasir", must_change_password: true };
const BUILTIN = BUILTIN_ROLE_ORDER;
const baseColor = (base) =>
  base === "admin"
    ? { cls: "bg-[#FEF3C7] text-[#B45309]", icon: true }
    : base === "input"
      ? { cls: "bg-[#DCFCE7] text-[#15803D]", icon: false }
      : base === "kasir"
        ? { cls: "bg-[#E0E7FF] text-[#4338CA]", icon: false }
        : { cls: "bg-[#F3E8FF] text-[#7C3AED]", icon: false };
const labelOf = (role, rolesMeta) => {
  if (ROLE_LABELS[role]) return ROLE_LABELS[role];
  const info = (rolesMeta?.roles || {})[role];
  if (!info) return role;
  return info.base === "input" ? `Staf Input · ${role}` : `Kasir · ${role}`;
};

export default function UsersPage() {
  const { user: me } = useAuth();
  const [items, setItems] = useState([]);
  const [rolesMeta, setRolesMeta] = useState({ roles: {} });
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);
  const [resetTarget, setResetTarget] = useState(null);
  const [newPw, setNewPw] = useState("");
  const [resetMust, setResetMust] = useState(true);
  const [pwDone, setPwDone] = useState(null); // {name, username, password} hasil reset
  
  // PIN 6 Digit States
  const [pinTarget, setPinTarget] = useState(null);
  const [newPin, setNewPin] = useState("");
  const [savingPin, setSavingPin] = useState(false);
  const [showPin, setShowPin] = useState({}); // {userId: bool}
  
  const [roleTarget, setRoleTarget] = useState(null);
  const [roleVal, setRoleVal] = useState("kasir");
  const [savingRole, setSavingRole] = useState(false);
  const [showPw, setShowPw] = useState({}); // {userId: bool} tampilkan password di kartu
  const [delTarget, setDelTarget] = useState(null);
  const [delInfo, setDelInfo] = useState(null);
  const [delBusy, setDelBusy] = useState(false);
  // Kategori BAHAN per akun (izin isi stok opname bahan)
  const [cats, setCats] = useState([]);
  const [catTarget, setCatTarget] = useState(null);
  const [catVal, setCatVal] = useState([]);
  const [savingCats, setSavingCats] = useState(false);

  const isSuper = isSuperAdmin(me);

  const load = () => api.get("/users").then((r) => setItems(Array.isArray(r.data) ? r.data : [])).catch(() => setItems([]));
  // Daftar role & izin bisa dibaca Super Admin DAN role yang punya izin "Roles & Izin
  // (lihat saja)" (modul role_izin) — di luar itu memakai daftar role yang diizinkan
  // (assignable) dari /rbac/my.
  const loadRoles = async () => {
    if (isSuper || me?.is_superadmin || can(me, "role_izin")) {
      try { const r = await api.get("/settings/rbac"); setRolesMeta(r.data); return; } catch (e) {}
    }
    try {
      const r = await api.get("/rbac/my");
      setRolesMeta({ roles: r.data.roles || {}, assignable: r.data.assignable || ["kasir", "input"] });
    } catch (e) {}
  };
  // Daftar kategori bahan (untuk mengatur izin per akun). Gagal = fitur kategori
  // bahan belum ada di server / akun tidak punya modulnya → tombol disembunyikan.
  const loadCats = () => api.get("/ingredient-categories")
    .then((r) => setCats(r.data?.items || []))
    .catch(() => setCats([]));
  const catNamesOf = (u) => (u.ingredient_categories || []).map((id) => cats.find((c) => c.id === id)?.name).filter(Boolean);
  const openCats = (u) => { setCatTarget(u); setCatVal([...(u.ingredient_categories || [])]); };
  const saveCats = async () => {
    setSavingCats(true);
    try {
      await api.patch(`/users/${catTarget.id}/ingredient-categories`, { categories: catVal });
      toast.success(catVal.length
        ? `@${catTarget.username}: ${catVal.length} kategori bahan diizinkan`
        : `@${catTarget.username}: kategori bahan dikosongkan (tidak bisa isi opname bahan)`);
      setCatTarget(null); load();
    } catch (e) { toast.error(apiError(e.response?.data?.detail)); } finally { setSavingCats(false); }
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- fetch once on mount
  useEffect(() => { load(); loadRoles(); loadCats(); }, []);
  const roleOptions = () => {
    const order = ["kasir", "input", "input_pembayaran", "stok_opname", "admin"];
    if (isSuper) order.unshift("superadmin");
    const builtin = order.map((r) => ({ value: r, label: labelOf(r, rolesMeta) }));
    const customs = Object.keys(rolesMeta?.roles || {})
      .filter((r) => !BUILTIN.includes(r))
      .map((r) => ({ value: r, label: `${r} (dasar ${rolesMeta.roles[r]?.base || "kasir"})` }));
    let all = [...builtin, ...customs];
    if (!isSuper) {
      const allowed = rolesMeta?.assignable || ["kasir", "input"];
      all = all.filter((o) => allowed.includes(o.value) && o.value !== "superadmin");
    }
    return all;
  };

  const save = async () => {
    if (!form.name || !form.username || !form.password) return toast.error("Lengkapi data pengguna");
    if (!/^[a-z0-9._-]{3,32}$/.test(form.username.trim().toLowerCase()))
      return toast.error("Username 3-32 karakter: huruf kecil/angka/titik/garis bawah/minus (tanpa spasi)");
    if (form.pin && !/^\d{6}$/.test(String(form.pin).trim()))
      return toast.error("PIN harus tepat 6 digit angka");
    try {
      await api.post("/users", form);
      toast.success("Pengguna dibuat");
      setOpen(false);
      setForm(empty);
      load();
    } catch (e) { toast.error(apiError(e.response?.data?.detail)); }
  };

  const toggle = async (u) => { try { await api.patch(`/users/${u.id}/toggle`); load(); } catch (e) { toast.error(apiError(e.response?.data?.detail)); } };
  
  const resetPw = async () => {
    if (newPw.length < 6) return toast.error("Password minimal 6 karakter");
    try {
      const r = await api.post(`/users/${resetTarget.id}/reset-password`,
        { new_password: newPw, must_change_password: resetMust });
      setPwDone({ name: resetTarget.name, username: resetTarget.username || resetTarget.email,
                  password: r.data?.password || newPw });
      setNewPw("");
      load();
    } catch (e) { toast.error(apiError(e.response?.data?.detail)); }
  };

  const openPinModal = (u) => {
    setPinTarget(u);
    setNewPin(u.pin || "");
  };

  const togglePinEnabled = async (u) => {
    const nextVal = !(u.pin_enabled ?? true);
    try {
      await api.patch(`/users/${u.id}/pin-enabled`, { enabled: nextVal });
      toast.success(nextVal ? `Login PIN diaktifkan untuk @${u.username}` : `Login PIN dinonaktifkan untuk @${u.username}`);
      load();
    } catch (e) {
      toast.error(apiError(e.response?.data?.detail) || "Gagal mengubah status PIN");
    }
  };

  const saveUserPin = async () => {
    const clean = String(newPin || "").trim();
    if (!/^\d{6}$/.test(clean)) {
      return toast.error("PIN harus tepat 6 digit angka (mis. 123456)");
    }
    setSavingPin(true);
    try {
      await api.patch(`/users/${pinTarget.id}/pin`, { pin: clean });
      toast.success(`PIN 6 digit untuk @${pinTarget.username} berhasil disimpan: ${clean}`);
      setPinTarget(null);
      setNewPin("");
      load();
    } catch (e) {
      toast.error(apiError(e.response?.data?.detail) || "Gagal menyimpan PIN");
    } finally {
      setSavingPin(false);
    }
  };

  const openRole = (u) => { setRoleTarget(u); setRoleVal(u.role); };
  const saveRole = async () => {
    setSavingRole(true);
    try {
      await api.patch(`/users/${roleTarget.id}/role`, { role: roleVal });
      toast.success(`Role ${roleTarget.name} → ${labelOf(roleVal, rolesMeta)}`);
      setRoleTarget(null); load();
    } catch (e) { toast.error(apiError(e.response?.data?.detail)); } finally { setSavingRole(false); }
  };
  // Wajib ganti password saat login berikutnya (per akun) — ON/OFF langsung.
  const toggleMust = async (u) => {
    try {
      const r = await api.patch(`/users/${u.id}/must-change-password`, { value: !u.must_change_password });
      toast.success(r.data?.must_change_password ? `@${u.username} wajib ganti password saat login` : `@${u.username} bebas ganti password`);
      load();
    } catch (e) { toast.error(apiError(e.response?.data?.detail)); }
  };
  const copyPw = async (pw) => { (await copyText(pw)) ? toast.success("Password disalin") : toast.error("Gagal menyalin"); };
  const copyPinVal = async (p) => { (await copyText(p)) ? toast.success("PIN disalin") : toast.error("Gagal menyalin"); };

  // Hapus akun: cek dulu jejak transaksinya (akun berjejak hanya dinonaktifkan).
  const openDelete = async (u) => {
    setDelTarget(u); setDelInfo(null);
    try {
      const r = await api.get(`/users/${u.id}/delete-check`);
      const info = r.data || {};
      const activeSupers = items.filter((x) => x.active !== false && isSuperAdmin(x));
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
  const doDelete = async () => {
    setDelBusy(true);
    try {
      const r = await api.delete(`/users/${delTarget.id}`);
      if (r.data?.action === "deleted") toast.success(`Akun @${r.data.username} dihapus permanen`);
      else toast.success(`Akun @${r.data.username} dinonaktifkan (masih punya riwayat transaksi)`);
      setDelTarget(null); setDelInfo(null); load();
    } catch (e) { toast.error(apiError(e.response?.data?.detail)); } finally { setDelBusy(false); }
  };

  return (
    <div className="h-full overflow-y-auto p-8">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <h1 className="text-3xl font-extrabold flex items-center gap-2"><Users /> Pengguna &amp; Akses Kasir</h1>
        <div className="flex gap-2">
          <button data-testid="add-user-btn" onClick={() => { setForm(empty); setOpen(true); }} className="tap h-12 px-5 rounded-xl bg-[#E63946] hover:bg-[#BE123C] text-white font-bold flex items-center gap-2"><Plus size={18} /> Tambah Pengguna</button>
        </div>
      </div>
      <p className="text-xs text-[#a1a1aa] -mt-3 mb-5">
        Login kasir dapat menggunakan <b>Username/Password</b> atau <b>PIN 6 Digit Cepat</b>. {isSuper
          ? <>Anda <b>Super Admin</b> — dapat melihat dan mengatur password &amp; PIN 6 digit setiap akun.</>
          : <>Role akun yang boleh Anda buat ditentukan <b>Super Admin</b>.</>}
      </p>
      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
        {items.map((u) => {
          const base = u.role === "superadmin" ? "admin" : (BUILTIN.includes(u.role) ? u.role : (rolesMeta?.roles?.[u.role]?.base) || "kasir");
          const bc = baseColor(base);
          const userPin = u.pin || (u.role === "superadmin" ? "260900" : "-");
          
          return (
            <div key={u.id} data-testid={`user-${u.id}`} className={`bg-white rounded-xl border p-4 ${!u.active && "opacity-60"}`}>
              <div className="flex items-center gap-3">
                <div className="h-11 w-11 rounded-full bg-[#0A0A0A] text-white grid place-items-center font-bold">{u.name[0]?.toUpperCase()}</div>
                <div className="flex-1 overflow-hidden">
                  <div className="font-bold truncate">{u.name}</div>
                  <div className="text-xs text-[#52525B] truncate">@{u.username || u.email || "-"}</div>
                  <div className="flex items-center gap-1 flex-wrap mt-1">
                    <span className={`text-[11px] font-bold px-2 py-0.5 rounded inline-flex items-center gap-1 ${bc.cls}`}>
                      {bc.icon && <ShieldCheck size={11} />}{labelOf(u.role, rolesMeta)}
                    </span>
                    {!u.active && <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-[#FEE2E2] text-[#B91C1C]">Nonaktif</span>}
                    {u.has_custom_perms && <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-[#F3E8FF] text-[#7E22CE]">★ Izin Khusus (RBAC)</span>}
                    {u.must_change_password && <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-[#FEF3C7] text-[#B45309]">Wajib ganti password</span>}
                  </div>
                </div>
              </div>

              {/* Baris PIN 6 Digit Kasir & Toggle */}
              <div className="mt-3 pt-3 border-t border-[#F1F1F4] space-y-2 text-[11px]">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-1.5">
                    <span className="uppercase tracking-wider font-bold text-[#52525B] flex items-center gap-1">
                      <Hash size={12} className="text-[#E63946]" /> PIN 6 Digit:
                    </span>
                    <span data-testid={`pin-val-${u.id}`} className="font-mono font-bold bg-[#EFF6FF] text-[#1D4ED8] rounded px-2 py-0.5 border border-[#BFDBFE]">
                      {showPin[u.id] ? userPin : "••••••"}
                    </span>
                    <button data-testid={`pin-eye-${u.id}`} onClick={() => setShowPin((s) => ({ ...s, [u.id]: !s[u.id] }))} title="Tampilkan / sembunyikan PIN" className="tap h-6 w-6 rounded bg-[#F4F5F7] grid place-items-center">
                      {showPin[u.id] ? <EyeOff size={11} /> : <Eye size={11} />}
                    </button>
                    <button data-testid={`pin-copy-${u.id}`} onClick={() => copyPinVal(userPin)} title="Salin PIN" className="tap h-6 w-6 rounded bg-[#F4F5F7] grid place-items-center">
                      <Copy size={11} />
                    </button>
                  </div>
                  <button
                    data-testid={`edit-pin-btn-${u.id}`}
                    onClick={() => openPinModal(u)}
                    className="tap text-[11px] font-bold text-[#E63946] hover:underline flex items-center gap-1"
                  >
                    <Key size={11} /> Ubah PIN
                  </button>
                </div>
                
                {/* Toggle Login PIN Aktif / Nonaktif */}
                <div className="flex items-center justify-between pt-1 border-t border-dashed border-[#E4E4E7]">
                  <span className="text-[11px] font-semibold text-[#52525B]">Izinkan Login dengan PIN:</span>
                  <button
                    type="button"
                    data-testid={`toggle-pin-${u.id}`}
                    onClick={() => togglePinEnabled(u)}
                    className={`tap px-2.5 py-0.5 rounded-full text-[11px] font-extrabold flex items-center gap-1.5 transition-all border ${
                      (u.pin_enabled ?? true)
                        ? "bg-emerald-50 text-emerald-700 border-emerald-300 hover:bg-emerald-100"
                        : "bg-zinc-100 text-zinc-500 border-zinc-300 hover:bg-zinc-200"
                    }`}
                  >
                    <span className={`w-2 h-2 rounded-full ${(u.pin_enabled ?? true) ? "bg-emerald-500" : "bg-zinc-400"}`} />
                    {(u.pin_enabled ?? true) ? "PIN Aktif" : "PIN Nonaktif"}
                  </button>
                </div>
              </div>

              {isSuper && (
                <div className="mt-2 pt-2 border-t border-[#F1F1F4] flex items-center gap-2 flex-wrap text-[11px]">
                  <span className="uppercase tracking-wider font-bold text-[#52525B]">Password</span>
                  {u.password ? (
                    <>
                      <span data-testid={`pw-${u.id}`} className="font-mono font-bold bg-[#F4F5F7] rounded px-2 py-0.5">
                        {showPw[u.id] ? u.password : "••••••••"}
                      </span>
                      <button data-testid={`pw-eye-${u.id}`} onClick={() => setShowPw((s) => ({ ...s, [u.id]: !s[u.id] }))} title="Tampilkan / sembunyikan" className="tap h-6 w-6 rounded bg-[#F4F5F7] grid place-items-center">
                        {showPw[u.id] ? <EyeOff size={11} /> : <Eye size={11} />}
                      </button>
                      <button data-testid={`pw-copy-${u.id}`} onClick={() => copyPw(u.password)} title="Salin password" className="tap h-6 w-6 rounded bg-[#F4F5F7] grid place-items-center"><Copy size={11} /></button>
                    </>
                  ) : (
                    <span className="text-[#a1a1aa] italic">belum terekam (akun lama) — tekan Reset</span>
                  )}
                </div>
              )}

              {cats.length > 0 && (
                <div className="mt-2 pt-2 border-t border-[#F1F1F4]">
                  <div className="flex items-center gap-2 flex-wrap">
                    <button data-testid={`user-cats-${u.id}`} onClick={() => openCats(u)} title="Atur kategori bahan yang boleh diisi akun ini"
                      className="tap h-7 px-2 rounded-lg bg-[#EEF2FF] text-[#4338CA] text-[11px] font-bold flex items-center gap-1">
                      <Tags size={12} /> Kategori Bahan{catNamesOf(u).length ? `: ${catNamesOf(u).length}` : ""}
                    </button>
                    {catNamesOf(u).length
                      ? catNamesOf(u).map((n) => <span key={n} className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-[#F4F5F7] text-[#52525B]">{n}</span>)
                      : <span className="text-[10px] text-[#B45309] font-bold">belum diatur</span>}
                  </div>
                </div>
              )}

              <div className="mt-3 flex items-center gap-2 flex-wrap">
                <a
                  href="/pengaturan?tab=users&sub=rbac"
                  data-testid={`rbac-btn-${u.id}`}
                  title="Atur Hak Akses / Role-Based Access Pengguna Ini"
                  className="tap h-9 px-2.5 rounded-lg bg-[#EFF6FF] text-[#1D4ED8] hover:bg-[#DBEAFE] text-[11px] font-bold flex items-center gap-1 border border-[#BFDBFE]"
                >
                  <ShieldCheck size={14} /> Izin RBAC
                </a>
                <button data-testid={`role-btn-${u.id}`} onClick={() => openRole(u)} title="Ganti role" className="tap h-9 w-9 rounded-lg bg-[#F4F5F7] grid place-items-center"><UserCog size={15} /></button>
                <button data-testid={`reset-pw-${u.id}`} onClick={() => { setResetTarget(u); setNewPw(""); setResetMust(true); setPwDone(null); }} title="Reset password" className="tap h-9 w-9 rounded-lg bg-[#F4F5F7] grid place-items-center"><KeyRound size={15} /></button>
                <button data-testid={`toggle-${u.id}`} onClick={() => toggle(u)} title="Aktif/Nonaktif" className="tap h-9 w-9 rounded-lg bg-[#F4F5F7] grid place-items-center"><Power size={15} /></button>
                {isSuper && (
                  <button
                    data-testid={`del-${u.id}`} onClick={() => openDelete(u)} title="Hapus / nonaktifkan akun"
                    disabled={u.id === me?.id}
                    className="tap h-9 w-9 rounded-lg bg-[#FEE2E2] text-[#B91C1C] grid place-items-center disabled:opacity-40"
                  ><Trash2 size={15} /></button>
                )}
                <button
                  data-testid={`must-${u.id}`} onClick={() => toggleMust(u)}
                  className={`tap h-9 px-2.5 rounded-lg text-[11px] font-bold ${u.must_change_password ? "bg-[#FEF3C7] text-[#B45309]" : "bg-[#F4F5F7] text-[#52525B]"}`}
                >{u.must_change_password ? "Wajib ganti pw: ON" : "Wajib ganti pw: OFF"}</button>
              </div>
            </div>
          );
        })}
      </div>

      {/* MODAL TAMBAH PENGGUNA */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Tambah Pengguna</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Field label="Nama"><input data-testid="user-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Nama lengkap kasir / admin" className="w-full h-11 rounded-xl border px-3" /></Field>
            <Field label="Username (untuk login)"><input data-testid="user-username" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, "") })} placeholder="mis. kasir1" className="w-full h-11 rounded-xl border px-3 font-mono" /></Field>
            <Field label="Password"><input data-testid="user-password" type="text" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="min. 6 karakter" className="w-full h-11 rounded-xl border px-3 font-mono" /></Field>
            
            <div className="p-3 bg-[#F8FAFC] rounded-xl border border-[#E2E8F0] space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-[#0F172A] block">Izinkan Login Menggunakan PIN</span>
                  <span className="text-[11px] text-[#64748B]">Kasir dapat masuk cepat dengan keypad 6 digit</span>
                </div>
                <input
                  data-testid="user-pin-enabled"
                  type="checkbox"
                  checked={!!form.pin_enabled}
                  onChange={(e) => setForm({ ...form, pin_enabled: e.target.checked })}
                  className="w-4 h-4 accent-[#E63946]"
                />
              </div>
              {form.pin_enabled && (
                <Field label="PIN 6 Digit (Login Cepat POS)">
                  <input
                    data-testid="user-pin"
                    type="text"
                    maxLength={6}
                    value={form.pin}
                    onChange={(e) => setForm({ ...form, pin: e.target.value.replace(/\D/g, "") })}
                    placeholder="mis. 123456"
                    className="w-full h-11 rounded-xl border px-3 font-mono text-center tracking-widest text-lg font-bold bg-white"
                  />
                  <span className="text-[11px] text-[#71717A] mt-1 block">PIN angka 6 digit untuk login kasir di layar sentuh POS.</span>
                </Field>
              )}
            </div>

            <Field label="Role">
              <select data-testid="user-role" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} className="w-full h-11 rounded-xl border px-3 bg-white">
                {roleOptions().map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </Field>
            <label className="flex items-center gap-2 text-sm font-bold">
              <input data-testid="user-must-change" type="checkbox" checked={!!form.must_change_password}
                onChange={(e) => setForm({ ...form, must_change_password: e.target.checked })} />
              Wajib ganti password saat login pertama
            </label>
          </div>
          <DialogFooter><button data-testid="save-user-btn" onClick={save} className="tap w-full h-12 rounded-xl bg-[#E63946] text-white font-bold">Simpan Pengguna</button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODAL UBAH PIN 6 DIGIT */}
      <Dialog open={!!pinTarget} onOpenChange={(o) => { if (!o) setPinTarget(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Hash size={18} className="text-[#E63946]" /> Atur PIN 6 Digit — {pinTarget?.name}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-[#52525B]">
              Tetapkan PIN 6 digit angka untuk akun <b>@{pinTarget?.username || pinTarget?.email}</b> agar kasir dapat login dengan cepat di terminal POS.
            </p>
            <div className="space-y-1">
              <label className="text-xs uppercase tracking-wider font-bold text-[#52525B]">PIN Baru (6 Digit Angka)</label>
              <input
                data-testid="user-edit-pin-input"
                type="text"
                maxLength={6}
                value={newPin}
                onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ""))}
                placeholder="mis. 111222"
                className="w-full h-12 rounded-xl border px-4 font-mono text-center tracking-widest text-2xl font-extrabold focus:border-[#E63946] focus:ring-2 focus:ring-[#E63946]/20 outline-none"
              />
            </div>
            <div className="flex gap-2 justify-center pt-1">
              {["111222", "123456", "654321", "888888"].map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setNewPin(preset)}
                  className="tap px-2 py-1 rounded bg-[#F4F5F7] hover:bg-[#E4E4E7] text-xs font-mono font-bold text-[#52525B]"
                >
                  {preset}
                </button>
              ))}
            </div>
          </div>
          <DialogFooter>
            <button
              data-testid="save-user-pin-btn"
              onClick={saveUserPin}
              disabled={savingPin || newPin.length !== 6}
              className="tap w-full h-12 rounded-xl bg-[#E63946] text-white font-bold disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {savingPin && <Loader2 size={16} className="animate-spin" />} Simpan PIN 6 Digit
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!roleTarget} onOpenChange={(o) => { if (!o) setRoleTarget(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Ganti Role — {roleTarget?.name}</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <p className="text-sm text-[#52525B]">Pilih role untuk <b>@{roleTarget?.username || roleTarget?.email}</b>. Role kustom memakai izin yang diatur di Pengaturan → Roles &amp; Izin.</p>
            <select data-testid="role-edit-select" value={roleVal} onChange={(e) => setRoleVal(e.target.value)} className="w-full h-11 rounded-xl border px-3 bg-white">
              {roleOptions().map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <DialogFooter>
            <button data-testid="save-role-btn" onClick={saveRole} disabled={savingRole} className="tap w-full h-12 rounded-xl bg-[#E63946] text-white font-bold disabled:opacity-60">
              {savingRole ? "Menyimpan..." : "Simpan Role"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!resetTarget} onOpenChange={(o) => { if (!o) { setResetTarget(null); setPwDone(null); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Reset Password — {resetTarget?.name}</DialogTitle></DialogHeader>
          {pwDone ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-[#15803D] font-bold"><CheckCircle2 size={18} /> Password berhasil diset</div>
              <div className="rounded-xl border bg-[#F9FAFB] p-3">
                <div className="text-xs text-[#52525B]">Username</div>
                <div className="font-mono font-bold">@{pwDone.username}</div>
                <div className="text-xs text-[#52525B] mt-2">Password baru</div>
                <div className="font-mono font-bold text-lg" data-testid="reset-result-pw">{pwDone.password}</div>
              </div>
              <p className="text-xs text-[#52525B]">Berikan password ini ke pengguna. Password juga tampil di daftar akun (Super Admin).</p>
              <button onClick={() => copyPw(pwDone.password)} className="tap w-full h-11 rounded-xl bg-[#F4F5F7] font-bold flex items-center justify-center gap-2"><Copy size={15} /> Salin Password</button>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-sm text-[#52525B]">Tetapkan password baru untuk <b>@{resetTarget?.username || resetTarget?.email}</b>. Pengguna akan memakai password ini saat login berikutnya.</p>
              <input data-testid="reset-pw-input" type="text" placeholder="Password baru (min. 6 karakter)" value={newPw} onChange={(e) => setNewPw(e.target.value)} className="w-full h-11 rounded-xl border px-3 font-mono" />
              <label className="flex items-center gap-2 text-sm font-bold">
                <input data-testid="reset-must-change" type="checkbox" checked={resetMust} onChange={(e) => setResetMust(e.target.checked)} />
                Wajib ganti saat login berikutnya
              </label>
            </div>
          )}
          <DialogFooter>
            {pwDone
              ? <button data-testid="reset-done-btn" onClick={() => { setResetTarget(null); setPwDone(null); }} className="tap w-full h-12 rounded-xl bg-[#E63946] text-white font-bold">Selesai</button>
              : <button data-testid="save-reset-pw-btn" onClick={resetPw} className="tap w-full h-12 rounded-xl bg-[#E63946] text-white font-bold">Simpan Password</button>}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!catTarget} onOpenChange={(o) => { if (!o) setCatTarget(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Tags size={17} /> Kategori Bahan — {catTarget?.name}</DialogTitle></DialogHeader>
          <p className="text-sm text-[#52525B]">
            Pilih kategori bahan yang boleh <b>diisi</b> oleh <b>@{catTarget?.username || catTarget?.email}</b> saat
            stok opname bahan. Berlaku <b>per bahan</b>: bahan di luar pilihan ini tidak akan muncul dan tidak bisa disimpan akun tersebut.
          </p>
          <div className="space-y-1.5 max-h-[50vh] overflow-y-auto mt-1">
            {cats.map((c) => (
              <label key={c.id} data-testid={`ucat-row-${c.id}`} className="flex items-center gap-3 rounded-xl border px-3 py-2 cursor-pointer">
                <input type="checkbox" data-testid={`ucat-${c.id}`} checked={catVal.includes(c.id)}
                  onChange={(e) => setCatVal((v) => (e.target.checked ? [...v, c.id] : v.filter((x) => x !== c.id)))} />
                <span className="font-bold text-sm flex-1">{c.name}</span>
                <span className="text-[11px] text-[#a1a1aa]">{c.ingredient_count || 0} bahan</span>
              </label>
            ))}
          </div>
          {catVal.length === 0 && (
            <p className="text-xs text-[#B45309] bg-[#FFFBEB] border border-[#FDE68A] rounded-xl px-3 py-2">
              Tidak ada kategori dipilih → akun ini <b>tidak bisa mengisi stok opname bahan apa pun</b>.
            </p>
          )}
          <DialogFooter>
            <button data-testid="save-user-cats-btn" onClick={saveCats} disabled={savingCats}
              className="tap w-full h-12 rounded-xl bg-[#4338CA] text-white font-bold disabled:opacity-60">
              {savingCats ? "Menyimpan..." : `Simpan (${catVal.length} kategori)`}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!delTarget} onOpenChange={(o) => { if (!o) { setDelTarget(null); setDelInfo(null); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Hapus Akun — {delTarget?.name}</DialogTitle></DialogHeader>
          {!delInfo ? (
            <div className="flex items-center gap-2 text-sm text-[#52525B]"><Loader2 className="animate-spin" size={16} /> Memeriksa riwayat transaksi...</div>
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
                <span>Akun <b>@{delInfo.username}</b> adalah akun <b>Super Admin</b>. Karena masih ada akun Super Admin lain yang aktif, Anda dapat menghapus akun ini.</span></div>
              <p className="text-xs text-rose-600 font-semibold">Tindakan ini akan menghapus akun dan mencabut semua hak akses Super Admin tersebut.</p>
              {delInfo.has_history && (
                <div className="rounded-xl bg-[#FFFBEB] border border-[#FDE68A] p-3 text-xs">
                  <span>Akun memiliki riwayat transaksi, akan dinonaktifkan agar rekap laporan lama tetap aman.</span>
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
                data-testid="confirm-del-btn" onClick={doDelete} disabled={delBusy}
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
const Field = ({ label, children }) => (
  <div><label className="text-xs uppercase tracking-wider font-bold text-[#52525B]">{label}</label><div className="mt-1.5">{children}</div></div>
);
