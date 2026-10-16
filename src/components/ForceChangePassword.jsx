import { useState } from "react";
import api, { apiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { KeyRound, Loader2, LogOut, ShieldAlert } from "lucide-react";

/**
 * Layar WAJIB GANTI PASSWORD (mis. akun baru & role Stok Opname).
 *
 * Ditampilkan ProtectedRoute ketika `user.must_change_password` menyala — seluruh
 * halaman aplikasi ditahan sampai password diganti, jadi password awal yang diberikan
 * admin/super admin tidak bisa dipakai terus-menerus.
 */
export default function ForceChangePassword() {
  const { user, refresh, logout } = useAuth();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (next.length < 6) return toast.error("Password baru minimal 6 karakter");
    if (next !== confirm) return toast.error("Ulangi password baru dengan benar");
    if (next === current) return toast.error("Password baru harus berbeda dari password saat ini");
    setBusy(true);
    try {
      await api.post("/auth/change-password", { current_password: current, new_password: next });
      toast.success("Password berhasil diganti. Selamat bekerja!");
      const u = await refresh();
      if (u?.must_change_password) toast.error("Server belum mencatat perubahan — coba muat ulang halaman.");
    } catch (err) {
      toast.error(apiError(err.response?.data?.detail) || "Gagal mengganti password");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen grid place-items-center p-6" style={{ backgroundColor: "#F7F7F9" }}>
      <form onSubmit={submit} data-testid="force-change-pw" className="w-full max-w-sm bg-white rounded-2xl border p-6 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="h-11 w-11 rounded-xl grid place-items-center text-white" style={{ backgroundColor: "#E63946" }}>
            <ShieldAlert size={20} />
          </div>
          <div>
            <h1 className="text-xl font-extrabold leading-tight">Ganti Password Dulu</h1>
            <p className="text-xs text-[#52525B]">Wajib saat login pertama</p>
          </div>
        </div>

        <div className="mt-4 rounded-xl bg-[#FFFBEB] border border-[#FDE68A] p-3 text-xs text-[#92400E]">
          Hai <b>{user?.name || user?.username}</b> — demi keamanan, ganti password bawaan akun Anda sebelum memakai aplikasi.
          Seluruh menu ditahan sampai password diganti.
        </div>

        <div className="mt-5 space-y-3">
          <div>
            <label className="text-xs uppercase tracking-wider font-bold text-[#52525B]">Password Saat Ini</label>
            <input
              data-testid="fcp-current" type="password" value={current} autoFocus
              onChange={(e) => setCurrent(e.target.value)}
              className="mt-1.5 w-full h-11 rounded-xl border px-3" placeholder="password yang diberikan admin"
            />
          </div>
          <div>
            <label className="text-xs uppercase tracking-wider font-bold text-[#52525B]">Password Baru</label>
            <input
              data-testid="fcp-new" type="password" value={next}
              onChange={(e) => setNext(e.target.value)}
              className="mt-1.5 w-full h-11 rounded-xl border px-3" placeholder="min. 6 karakter"
            />
          </div>
          <div>
            <label className="text-xs uppercase tracking-wider font-bold text-[#52525B]">Ulangi Password Baru</label>
            <input
              data-testid="fcp-confirm" type="password" value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="mt-1.5 w-full h-11 rounded-xl border px-3"
            />
          </div>
        </div>

        <button
          data-testid="fcp-submit" type="submit" disabled={busy}
          className="tap mt-5 w-full h-12 rounded-xl text-white font-bold flex items-center justify-center gap-2 disabled:opacity-60"
          style={{ backgroundColor: "#E63946" }}
        >
          {busy ? <Loader2 className="animate-spin" size={18} /> : <KeyRound size={18} />}
          {busy ? "Menyimpan..." : "Simpan Password Baru"}
        </button>

        <button
          type="button" onClick={logout}
          className="mt-3 w-full h-11 rounded-xl bg-[#F4F5F7] font-bold text-sm flex items-center justify-center gap-2"
        >
          <LogOut size={15} /> Keluar
        </button>
      </form>
    </div>
  );
}
