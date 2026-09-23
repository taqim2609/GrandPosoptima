/* ================================================================
   PENGATURAN → ROLES & IZIN (admin) — FULL CUSTOM
   Setiap role (Kasir, Staf Input, maupun role kustom) bisa dicentang/
   di-centang-off modul SATU PER SATU — bukan hanya menambah izin ekstra.
   - Admin (super) selalu punya semua izin & tidak bisa diubah.
   - Simpan → server memakai daftar ini PERSIS (permintaan yang modulnya
     tidak dicentang akan ditolak di level API, menu ikut disembunyikan).
   ================================================================ */
import { useEffect, useState, useMemo } from "react";
import api, { apiError } from "@/lib/api";
import { toast } from "sonner";
import { ShieldCheck, Save, Plus, Trash2, Loader2, Lock, KeyRound, Users, AlertTriangle, RotateCcw, Eye } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { RBAC_MODULES, BASE_MODULES, ROLE_LABELS, BUILTIN_ROLE_ORDER, isSuperAdmin } from "@/lib/rbac";
import { useAuth } from "@/context/AuthContext";

const BUILTIN = BUILTIN_ROLE_ORDER;
// Role yang SELALU punya semua modul & tidak bisa diubah (backend menolak perubahannya):
// hanya SUPER ADMIN (owner). Role `admin` BOLEH dibatasi modulnya oleh Super Admin.
const LOCKED_ROLES = ["superadmin"];
const sortRoles = (roles) =>
  [...BUILTIN.filter((r) => r in roles), ...Object.keys(roles).filter((r) => !BUILTIN.includes(r))];
// Modul "Super Admin (Kelola Role & Izin)" tidak bisa diberikan lewat centang (endpoint
// role & izin memang hanya untuk Super Admin) → jangan ditampilkan agar tidak menyesatkan.
const isGrantable = (code) => code !== "superadmin";

export default function SettingsRoles() {
  const [meta, setMeta] = useState(null);
  const [roles, setRoles] = useState(null); // {name: {base, perms:[...FULL], full:bool, pristine:bool}}
  const [saving, setSaving] = useState(false);
  const [assignable, setAssignable] = useState([]);
  const { user: me, refresh } = useAuth();
  const [claiming, setClaiming] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [newRole, setNewRole] = useState({ name: "", base: "kasir" });

  const load = () => api.get("/settings/rbac").then((r) => {
    setMeta(r.data);
    const init = {};
    const srv = r.data.roles || {};
    const defaults = r.data.base_defaults || {};
    // role bawaan: kalau belum pernah dikustomisasi (full) tampilkan default;
    // sudah dikustomisasi → tampilkan daftar persisnya.
    for (const b of BUILTIN) {
      if (LOCKED_ROLES.includes(b)) continue; // superadmin (owner) tampil sebagai kartu terkunci
      const st = srv[b];
      init[b] = st?.full
        ? { base: b, perms: [...(st.perms || [])].filter(isGrantable), full: true }
        : { base: b, perms: [...(defaults[b] || [])].filter(isGrantable), full: false, pristine: true };
    }
    for (const name of Object.keys(srv)) {
      if (BUILTIN.includes(name)) continue;
      const st = srv[name];
      init[name] = { base: st?.base || "kasir", perms: [...(st?.perms || [])].filter(isGrantable), full: !!st?.full, pristine: !st?.full };
    }
    setRoles(init);
    setAssignable(Array.isArray(r.data.assignable) ? r.data.assignable : []);
  });

  useEffect(() => { load().catch((e) => toast.error(apiError(e.response?.data?.detail))); }, []);

  // IZIN TERPISAH: role yang diberi modul `role_izin` hanya boleh MELIHAT daftar role
  // & izin (read-only). Menyimpan tetap hanya Super Admin (owner)/mode bootstrap —
  // server juga menolak PUT /settings/rbac untuk yang lain.
  const canManage = !!(meta?.can_manage ?? (me?.is_superadmin || me?.bootstrap_owner));

  const togglePerm = (role, mod) => {
    if (!canManage) return;
    setRoles((rs) => {
      const cur = rs[role];
      const on = cur.perms.includes(mod);
      const perms = on ? cur.perms.filter((x) => x !== mod) : [...cur.perms, mod];
      return { ...rs, [role]: { ...cur, perms, full: true, pristine: false } };
    });
  };
  const resetDefault = (role) => {
    if (!canManage) return;
    if (!window.confirm(`Setel ulang role "${role}" ke izin dasar bawaan?`)) return;
    const dflt = (meta?.base_defaults || {})[role];
    setRoles((rs) => ({ ...rs, [role]: { ...rs[role], perms: [...(dflt || [])].filter(isGrantable), full: false, pristine: true } }));
  };

  const addCustom = () => {
    if (!canManage) return;
    const name = newRole.name.trim();
    if (!name) return toast.error("Nama role wajib diisi");
    if (BUILTIN.includes(name) || (roles && name in roles)) return toast.error(`Role "${name}" sudah ada`);
    if (!/^[a-zA-Z0-9 _\-]{2,24}$/.test(name)) return toast.error("Nama hanya huruf/angka/spasi/minus, 2–24 karakter");
    // role baru dimulai dari template role dasar yang dipilih, lalu bisa diubah bebas
    const template = [...((meta?.base_defaults || {})[newRole.base] || [])].filter(isGrantable);
    setRoles((rs) => ({ ...rs, [name]: { base: newRole.base, perms: template, full: true, pristine: false } }));
    setAddOpen(false);
    setNewRole({ name: "", base: "kasir" });
    toast.success(`Role "${name}" dibuat — centang modul lalu Simpan`);
  };

  const removeRole = (name) => {
    if (!canManage) return;
    const base = roles[name]?.base || "kasir";
    if (!window.confirm(`Hapus role "${name}"? Pengguna dengan role ini dikembalikan ke "${ROLE_LABELS[base] || base}".`)) return;
    setRoles((rs) => { const next = { ...rs }; delete next[name]; return next; });
    toast.success("Role dihapus — klik Simpan untuk memberlakukan");
  };

  const save = async () => {
    if (!roles || !canManage) return;
    // validasi: tiap role yang bisa diubah minimal 1 modul (hindari kunci total)
    for (const [name, r] of Object.entries(roles)) {
      if (LOCKED_ROLES.includes(name)) continue;
      if (!(r.perms || []).length) {
        toast.error(`Role "${name}" tidak punya modul sama sekali — centang minimal 1.`);
        return;
      }
    }
    setSaving(true);
    try {
      const payload = {};
      for (const [name, r] of Object.entries(roles)) {
        if (LOCKED_ROLES.includes(name)) continue;
        payload[name] = { base: r.base || "kasir", perms: [...(r.perms || [])], full: r.full === true };
      }
      await api.put("/settings/rbac", { roles: payload, assignable });
      toast.success("Roles & izin disimpan — berlaku sekarang (menu & server)");
      await load();
    } catch (e) { toast.error(apiError(e.response?.data?.detail)); } finally { setSaving(false); }
  };

  const moduleList = useMemo(
    () => (meta?.modules || RBAC_MODULES).filter((m) => isGrantable(m.code)),
    [meta?.modules]
  );
  const countRole = (r) => (r.perms || []).length;

  if (!roles || !meta) return <div className="h-full grid place-items-center"><Loader2 className="animate-spin text-[#E63946]" /></div>;
  const rowNames = sortRoles(roles);

  return (
    <div className="h-full overflow-y-auto p-6" data-testid="settings-roles">
      <div className="flex items-start justify-between gap-3 flex-wrap mb-2">
        <div className="max-w-3xl">
          <h2 className="text-2xl font-extrabold flex items-center gap-2"><ShieldCheck size={22} /> Roles &amp; Izin — Full Custom</h2>
          <p className="text-sm text-[#52525B] mt-1">
            Centang / kosongkan modul <b>satu per satu</b> untuk tiap role (bawaan maupun kustom) — apa yang
            dicentang itulah akses persisnya, termasuk <b>menghapus</b> modul bawaan. Berlaku langsung di menu &amp; server.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap shrink-0">
          {canManage ? (
            <>
              <button onClick={() => setAddOpen(true)} className="tap h-11 px-4 rounded-xl bg-[#0A0A0A] text-white font-bold flex items-center gap-2"><Plus size={17} /> Role Baru</button>
              <button data-testid="rbac-save" onClick={save} disabled={saving}
                className="tap h-11 px-5 rounded-xl bg-[#E63946] hover:bg-[#BE123C] text-white font-bold flex items-center gap-2 disabled:opacity-60">
                {saving ? <Loader2 size={17} className="animate-spin" /> : <Save size={17} />} Simpan Semua
              </button>
            </>
          ) : (
            <span data-testid="rbac-readonly" className="h-11 px-4 rounded-xl bg-[#F4F5F7] border text-[#52525B] font-bold flex items-center gap-2">
              <Eye size={17} /> Hanya lihat (read-only)
            </span>
          )}
        </div>
      </div>

      {/* ---- Izin "Roles & Izin (lihat saja)" → tanpa tombol simpan ---- */}
      {!canManage && (
        <div className="mb-4 rounded-2xl border border-[#7C3AED]/40 bg-[#F5F3FF] p-4 text-sm text-[#5B21B6]" data-testid="rbac-readonly-banner">
          Anda punya izin <b>Roles &amp; Izin (lihat saja)</b> — daftar role dan izinnya bisa dilihat, tetapi
          <b> mengubah/menyimpan hanya bisa dilakukan Super Admin (owner)</b>.
        </div>
      )}

      <p className="text-[11px] text-[#a1a1aa] mb-4 flex items-start gap-1.5">
        <AlertTriangle size={12} className="shrink-0 mt-0.5" />
        <span>
          <b>Super Admin (owner)</b> selalu punya SEMUA modul dan <b>tidak bisa diubah</b> — tampil sebagai kartu
          terkunci. Role lain (<b>termasuk admin</b>) bisa dicentang/dikosongkan bebas, minimal 1 modul.
          <b> Akun Pengguna</b> dan <b>Roles &amp; Izin (lihat saja)</b> adalah dua izin TERPISAH: memberi
          "Roles &amp; Izin (lihat saja)" hanya mengizinkan <b>melihat</b> halaman ini — menyimpan/mengubah role
          tetap hanya Super Admin.
        </span>
      </p>

      {/* ---- Mode bootstrap: belum ada Super Admin → angkat akun sendiri ---- */}
      {!isSuperAdmin(me) && me?.bootstrap_owner && (
        <div className="mb-4 rounded-2xl border-2 border-[#F59E0B] bg-[#FFFBEB] p-4 flex items-start gap-3 flex-wrap" data-testid="bootstrap-banner">
          <AlertTriangle size={20} className="text-[#B45309] shrink-0 mt-0.5" />
          <div className="flex-1 min-w-[240px]">
            <div className="font-extrabold text-[#92400E]">Belum ada Super Admin</div>
            <div className="text-sm text-[#92400E]">
              Sistem belum punya akun Super Admin (owner). Jadikan akun Anda ({me.username || me.name}) Super Admin
              sekarang — setelah itu hanya Super Admin yang bisa membuka halaman ini.
            </div>
          </div>
          <button data-testid="claim-super" disabled={claiming}
            onClick={async () => {
              if (!window.confirm(`Jadikan akun ${me.username || me.name} sebagai Super Admin?`)) return;
              setClaiming(true);
              try {
                await api.post("/settings/rbac/claim-superadmin");
                toast.success("Akun Anda sekarang Super Admin — memuat ulang…");
                await refresh?.();
                setTimeout(() => window.location.reload(), 900);
              } catch (e) { toast.error(apiError(e.response?.data?.detail)); } finally { setClaiming(false); }
            }}
            className="tap h-11 px-5 rounded-xl bg-[#B45309] hover:bg-[#92400E] text-white font-bold flex items-center gap-2 disabled:opacity-60">
            {claiming ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />} Jadikan Saya Super Admin
          </button>
        </div>
      )}

      <div className="space-y-4">
        {LOCKED_ROLES.map((name) => (
          <div key={name} data-testid={`role-locked-${name}`}
            className="bg-white rounded-2xl border border-[#E63946]/40 p-5 flex items-center gap-4 flex-wrap">
            <div className="h-11 w-11 rounded-xl grid place-items-center font-extrabold bg-[#FEF3C7] text-[#B45309]">
              {(name[0] || "?").toUpperCase()}
            </div>
            <div className="flex-1 min-w-[180px]">
              <div className="font-extrabold flex items-center gap-2 flex-wrap">
                Super Admin (owner)
                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-[#FEF3C7] text-[#B45309] uppercase">
                  Owner — semua izin
                </span>
                <code className="text-[10px] px-1.5 py-0.5 rounded bg-[#F4F5F7] text-[#52525B]">{name}</code>
              </div>
              <div className="text-xs text-[#52525B] mt-1">
                Pemilik aplikasi. Satu-satunya role yang boleh <b>mengubah</b> halaman ini (hak
                <b>melihat</b> bisa diberikan lewat modul "Roles &amp; Izin (lihat saja)"). Selalu punya semua
                modul ({moduleList.length}) dan <b>tidak bisa dikurangi</b>.
              </div>
            </div>
            <Lock size={16} className="text-[#d4d4d8]" />
          </div>
        ))}
        {rowNames.map((name) => {
          const row = roles[name];
          const isBuiltin = BUILTIN.includes(name);
          return (
            <div key={name} data-testid={`role-row-${name}`} className="bg-white rounded-2xl border p-5">
              <div className="flex items-center gap-3 flex-wrap mb-3">
                <div className="h-10 w-10 rounded-xl grid place-items-center font-extrabold"
                  style={{ backgroundColor: name === "kasir" ? "#E0E7FF" : name === "input" ? "#DCFCE7" : name === "admin" ? "#FEF3C7" : "#F3E8FF", color: name === "kasir" ? "#4338CA" : name === "input" ? "#15803D" : name === "admin" ? "#B45309" : "#7C3AED" }}>
                  {(name[0] || "?").toUpperCase()}
                </div>
                <div className="flex-1 min-w-[140px]">
                  <div className="font-extrabold flex items-center gap-2 flex-wrap">
                    {name}
                    {name === "admin" && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-[#FEF3C7] text-[#B45309] uppercase">bisa diatur</span>
                    )}
                  </div>
                  <div className="text-xs text-[#52525B]">
                    {isBuiltin
                      ? `${ROLE_LABELS[name] || name}${row.full ? " · dikustomisasi" : " · izin dasar bawaan"}` + ` — ${countRole(row)} modul`
                      : <>Role kustom · template {ROLE_LABELS[row.base] || row.base} · {countRole(row)} modul</>}
                  </div>
                </div>
                {canManage && !isBuiltin && (
                  <button onClick={() => removeRole(name)} className="tap h-9 w-9 rounded-lg border grid place-items-center text-[#EF4444] hover:bg-[#FEE2E2]" title="Hapus role">
                    <Trash2 size={15} />
                  </button>
                )}
                <button onClick={() => resetDefault(name)} disabled={!canManage || (!row.full && row.pristine)}
                  className="tap h-9 px-3 rounded-lg border text-xs font-bold text-[#52525B] hover:bg-[#F4F5F7] disabled:opacity-40 flex items-center gap-1.5">
                  <RotateCcw size={13} /> Reset ke bawaan
                </button>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {moduleList.map((m) => {
                  const on = row.perms.includes(m.code);
                  return (
                    <button key={m.code} data-testid={`perm-${name}-${m.code}`}
                      onClick={() => togglePerm(name, m.code)} disabled={!canManage}
                      title={`${m.label}${on ? " — diizinkan" : " — TIDAK diizinkan"}`}
                      className={`tap h-8 rounded-lg px-3 text-xs font-bold inline-flex items-center gap-1.5 border transition-colors ${on
                        ? "border-[#E63946] bg-[#E63946] text-white"
                        : "border-[#E4E4E7] bg-white text-[#a1a1aa] hover:bg-[#F4F5F7] line-through decoration-[#E4E4E7]"}`}>
                      <CheckDot on={on} /> {m.label}
                    </button>
                  );
                })}
              </div>
              {name === "admin" && (
                <p className="text-[11px] text-[#B45309] mt-3 flex items-start gap-1.5">
                  <AlertTriangle size={12} className="shrink-0 mt-0.5" />
                  <span>
                    Admin bawaan punya semua modul. Menghilangkan centang (mis. Laporan/Pengaturan/Akun Pengguna) membuat
                    <b> semua akun ber-role admin</b> kehilangan menu itu — berlaku juga di server (API ikut ditolak).
                    Akun <b>Super Admin (owner)</b> tidak terpengaruh.
                  </span>
                </p>
              )}
            </div>
          );
        })}
      </div>

      {/* ---- Role yang boleh dibuat/ditugaskan ADMIN BIASA (ditentukan Super Admin) ---- */}
      <div className="bg-white rounded-2xl border p-5 mt-5" data-testid="assignable-card">
        <h3 className="font-extrabold flex items-center gap-2 mb-1"><KeyRound size={17} className="text-[#7C3AED]" /> Role yang boleh dibuat oleh Admin</h3>
        <p className="text-xs text-[#52525B] mb-3">
          Centang role yang boleh dipakai <b>admin biasa</b> saat membuat akun. Role yang tidak dicentang
          (mis. Admin, Super Admin) hanya bisa diberikan oleh Super Admin.
        </p>
        <div className="flex flex-wrap gap-1.5">
          {rowNames.filter((r) => r !== "superadmin" && r !== "admin").map((r) => {
            const on = assignable.includes(r);
            return (
              <button key={r} data-testid={`assign-${r}`} disabled={!canManage} onClick={() => setAssignable((a) => (on ? a.filter((x) => x !== r) : [...a, r]))}
                className={`tap h-9 rounded-lg px-3 text-xs font-bold inline-flex items-center gap-1.5 border ${on ? "border-[#7C3AED] bg-[#7C3AED] text-white" : "border-[#E4E4E7] bg-white text-[#52525B]"}`}>
                <CheckDot on={on} /> {r}
              </button>
            );
          })}
        </div>
      </div>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><KeyRound size={17} /> Role Baru</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Lbl>Nama role</Lbl>
              <input data-testid="rbac-new-name" value={newRole.name} onChange={(e) => setNewRole({ ...newRole, name: e.target.value })}
                placeholder="cth: Supervisor, Kasir Senior" className="mt-1 w-full h-11 rounded-xl border px-3" />
            </div>
            <div>
              <Lbl>Template awal (bisa diubah bebas)</Lbl>
              <select value={newRole.base} onChange={(e) => setNewRole({ ...newRole, base: e.target.value })}
                className="w-full h-11 rounded-xl border px-3 bg-white mt-1">
                <option value="kasir">Kasir</option>
                <option value="input">Staf Input</option>
              </select>
              <p className="text-[11px] text-[#a1a1aa] mt-1.5">Role baru otomatis diberi modul template — tinggal sesuaikan centangannya. Role dasar tidak mengunci apa pun.</p>
            </div>
          </div>
          <DialogFooter>
            <button data-testid="rbac-add-save" onClick={addCustom} className="tap w-full h-12 rounded-xl bg-[#E63946] text-white font-bold">Buat Role</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="mt-6 text-[11px] text-[#a1a1aa] flex items-start gap-1.5">
        <Users size={13} className="shrink-0 mt-0.5" />
        <span>Role <b>admin</b> &amp; role bawaan lain bisa dicentang bebas; begitu pertama kali disimpan, seluruh daftar modulnya menjadi kustom — gunakan <b>Reset ke bawaan</b> untuk mengembalikan. Tugaskan role ke akun di sub-tab <b>Akun Pengguna</b>. Role yang diberi <b>Roles &amp; Izin (lihat saja)</b> hanya bisa melihat halaman ini, bukan menyimpan.</span>
      </div>
    </div>
  );
}

const CheckDot = ({ on }) => (
  <span className={`h-3 w-3 rounded-sm border grid place-items-center ${on ? "border-[#E63946] bg-[#E63946]" : "border-[#D4D4D8]"}`}>
    {on && <svg width="8" height="8" viewBox="0 0 10 10"><path d="M1 5l3 3 5-6" stroke="#fff" strokeWidth="2" fill="none" strokeLinecap="round" /></svg>}
  </span>
);
const Lbl = ({ children }) => <label className="text-xs font-bold text-[#52525B] uppercase tracking-wider block">{children}</label>;
