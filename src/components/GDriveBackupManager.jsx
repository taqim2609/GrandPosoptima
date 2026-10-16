import { useState, useEffect, useRef, useCallback } from "react";
import api, { apiError } from "@/lib/api";
import { toast } from "sonner";
import {
  initAuth,
  googleSignIn,
  googleLogout,
  getAccessToken,
  listDriveBackups,
  uploadBackupToDrive,
  downloadBackupFromDrive,
  deleteBackupFromDrive,
  getDriveSchedule,
  saveDriveSchedule,
} from "@/lib/gdrive";
import {
  Cloud,
  CloudUpload,
  RefreshCw,
  Clock,
  HardDrive,
  CheckCircle2,
  AlertTriangle,
  Trash2,
  Download,
  RotateCcw,
  ShieldCheck,
  Calendar,
  LogOut,
  FolderLock,
  Loader2,
  FolderCheck,
} from "lucide-react";

export default function GDriveBackupManager() {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [files, setFiles] = useState([]);
  const [backupInProgress, setBackupInProgress] = useState(false);
  const [schedule, setSchedule] = useState(getDriveSchedule());
  const [savingSchedule, setSavingSchedule] = useState(false);
  const [serverConfig, setServerConfig] = useState(null);

  // Modal dialog states for Restore and Delete confirmations
  const [restoreTarget, setRestoreTarget] = useState(null);
  const [restoreConfirmText, setRestoreConfirmText] = useState("");
  const [restoring, setRestoring] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  // Load server config and schedule
  const loadServerConfig = useCallback(async () => {
    try {
      const { data } = await api.get("/backup/gdrive/config");
      setServerConfig(data);
      if (data) {
        setSchedule((prev) => ({
          ...prev,
          enabled: data.enabled ?? prev.enabled,
          frequency: data.frequency || prev.frequency,
          dailyTime: data.daily_time || prev.dailyTime,
          maxRetention: data.max_retention || prev.maxRetention,
        }));
      }
    } catch (e) {
      console.warn("Failed to load server gdrive config:", e);
    }
  }, []);

  // Fetch list of backup files from Google Drive
  const loadDriveFiles = useCallback(async (activeToken) => {
    const t = activeToken || token || getAccessToken();
    if (!t) return;
    setLoadingFiles(true);
    try {
      const driveFiles = await listDriveBackups(t);
      setFiles(driveFiles);
    } catch (err) {
      console.error("Error loading drive files:", err);
      toast.error(err.message || "Gagal memuat daftar backup dari Google Drive");
    } finally {
      setLoadingFiles(false);
    }
  }, [token]);

  // Initialize Firebase Auth listener
  useEffect(() => {
    loadServerConfig();
    const unsubscribe = initAuth(
      (authUser, authToken) => {
        setUser(authUser);
        setToken(authToken);
        loadDriveFiles(authToken);
      },
      () => {
        setUser(null);
        setToken(null);
        setFiles([]);
      }
    );
    return () => {
      if (typeof unsubscribe === "function") unsubscribe();
    };
  }, [loadServerConfig, loadDriveFiles]);

  // Handle Google Sign-in with scopes
  const handleGoogleLogin = async () => {
    setIsLoggingIn(true);
    const t = toast.loading("Menghubungkan ke akun Google Drive...");
    try {
      const result = await googleSignIn();
      if (result) {
        setUser(result.user);
        setToken(result.accessToken);
        toast.success(`Terhubung sebagai ${result.user.displayName || result.user.email}`, { id: t });
        await loadDriveFiles(result.accessToken);
      }
    } catch (err) {
      console.error("Login failed:", err);
      toast.error(err.message || "Gagal menghubungkan Google Drive. Pastikan popup tidak diblokir.", { id: t });
    } finally {
      setIsLoggingIn(false);
    }
  };

  // Handle Google Logout
  const handleGoogleLogout = async () => {
    try {
      await googleLogout();
      setUser(null);
      setToken(null);
      setFiles([]);
      toast.success("Akun Google Drive berhasil diputuskan");
    } catch (err) {
      toast.error("Gagal keluar dari akun Google");
    }
  };

  // Perform immediate backup to Google Drive
  const handleBackupNow = async () => {
    const activeToken = token || getAccessToken();
    if (!activeToken) {
      toast.error("Silakan hubungkan akun Google Drive terlebih dahulu.");
      return;
    }

    setBackupInProgress(true);
    const toastId = toast.loading("1/3: Mengekspor snapshot database server...");
    try {
      // 1. Dapatkan file zip dari server POS
      const res = await api.get("/backup/export", { responseType: "blob" });
      const blob = res.data;
      const dateStr = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
      const filename = `gak-backup-${dateStr}.zip`;
      const sizeMb = (blob.size / (1024 * 1024)).toFixed(2);

      toast.loading(`2/3: Mengunggah ${filename} (${sizeMb} MB) ke Google Drive...`, { id: toastId });

      // 2. Unggah file zip langsung ke Google Drive
      const uploadRes = await uploadBackupToDrive(
        blob,
        filename,
        `Backup manual Grand Aceh POS via Web (${new Date().toLocaleString("id-ID")})`,
        activeToken
      );

      toast.loading("3/3: Mencatat riwayat sinkronisasi server...", { id: toastId });

      // 3. Catat di database server
      await api.post("/backup/gdrive/record-sync", {
        file_name: filename,
        file_id: uploadRes.id,
        file_size: `${sizeMb} MB`,
        user_email: user?.email || "Google User",
        status: "success",
        notes: "Backup manual dari web browser",
      });

      // Update schedule state
      const now = new Date().toISOString();
      const newSchedule = {
        ...schedule,
        lastBackupAt: now,
        lastBackupFile: filename,
        lastStatus: "success",
      };
      setSchedule(newSchedule);
      saveDriveSchedule(newSchedule);

      toast.success(`Backup selesai! Tersimpan di folder "Grand Aceh POS Backups" Google Drive (${sizeMb} MB)`, {
        id: toastId,
        duration: 5000,
      });

      // Refresh file list
      await loadDriveFiles(activeToken);
      await loadServerConfig();
    } catch (err) {
      console.error("Backup failed:", err);
      toast.error(`Gagal backup ke Google Drive: ${err.message || "Kesalahan jaringan"}`, { id: toastId });
    } finally {
      setBackupInProgress(false);
    }
  };

  // Save Schedule settings
  const handleSaveSchedule = async () => {
    setSavingSchedule(true);
    const t = toast.loading("Menyimpan jadwal backup...");
    try {
      saveDriveSchedule(schedule);
      await api.put("/backup/gdrive/config", {
        enabled: schedule.enabled,
        frequency: schedule.frequency,
        daily_time: schedule.dailyTime,
        max_retention: schedule.maxRetention,
      });
      toast.success("Jadwal backup Google Drive berhasil disimpan", { id: t });
      await loadServerConfig();
    } catch (e) {
      toast.error(apiError(e.response?.data?.detail) || "Gagal menyimpan jadwal", { id: t });
    } finally {
      setSavingSchedule(false);
    }
  };

  // Download backup directly from Google Drive
  const handleDownloadFile = async (file) => {
    const toastId = toast.loading(`Mengunduh ${file.name} dari Google Drive...`);
    try {
      const blob = await downloadBackupFromDrive(file.id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = file.name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      toast.success(`File ${file.name} berhasil diunduh`, { id: toastId });
    } catch (e) {
      toast.error(`Gagal mengunduh: ${e.message}`, { id: toastId });
    }
  };

  // Confirm and execute Restore from Google Drive backup
  const executeRestore = async () => {
    if (restoreConfirmText.trim().toUpperCase() !== "PULIHKAN") {
      toast.error('Ketik "PULIHKAN" untuk konfirmasi');
      return;
    }
    if (!restoreTarget) return;

    setRestoring(true);
    const toastId = toast.loading(`1/2: Mengunduh ${restoreTarget.name} dari Google Drive...`);
    try {
      const blob = await downloadBackupFromDrive(restoreTarget.id);
      toast.loading("2/2: Memulihkan database di server POS...", { id: toastId });

      const fd = new FormData();
      fd.append("file", blob, restoreTarget.name);

      await api.post("/backup/import", fd);

      toast.success("Database berhasil dipulihkan dari Google Drive! Memuat ulang sistem...", {
        id: toastId,
        duration: 6000,
      });

      setRestoreTarget(null);
      setRestoreConfirmText("");

      setTimeout(() => {
        window.location.reload();
      }, 1500);
    } catch (err) {
      console.error("Restore failed:", err);
      toast.error(`Gagal memulihkan database: ${err.response?.data?.detail || err.message}`, {
        id: toastId,
        duration: 8000,
      });
    } finally {
      setRestoring(false);
    }
  };

  // Confirm and execute Delete from Google Drive
  const executeDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    const toastId = toast.loading(`Menghapus ${deleteTarget.name} dari Google Drive...`);
    try {
      await deleteBackupFromDrive(deleteTarget.id);
      toast.success("File backup berhasil dihapus dari Google Drive", { id: toastId });
      setDeleteTarget(null);
      await loadDriveFiles();
    } catch (err) {
      toast.error(`Gagal menghapus: ${err.message}`, { id: toastId });
    } finally {
      setDeleting(false);
    }
  };

  // Helper format file size
  const formatBytes = (bytes) => {
    if (!bytes || isNaN(bytes)) return "—";
    const b = Number(bytes);
    if (b < 1024) return `${b} B`;
    if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
    return `${(b / (1024 * 1024)).toFixed(2)} MB`;
  };

  // Helper format date
  const formatDate = (isoStr) => {
    if (!isoStr) return "—";
    try {
      const d = new Date(isoStr);
      return d.toLocaleDateString("id-ID", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch (e) {
      return isoStr;
    }
  };

  return (
    <div className="space-y-5" data-testid="gdrive-backup-manager">
      {/* KARTU UTAMA: STATUS KONEKSI GOOGLE DRIVE */}
      <div className="rounded-2xl border-2 border-[#2563EB] bg-[#EFF6FF] p-5 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="h-12 w-12 rounded-xl bg-[#2563EB] text-white flex items-center justify-center shrink-0 shadow-sm">
              <Cloud size={24} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-extrabold text-[#1E3A8A]">
                  Google Drive Cloud Backup Server
                </h3>
                {user ? (
                  <span className="px-2.5 py-0.5 rounded-full bg-[#DCFCE7] text-[#166534] text-[11px] font-black border border-[#86EFAC] flex items-center gap-1">
                    <CheckCircle2 size={12} /> Terhubung
                  </span>
                ) : (
                  <span className="px-2.5 py-0.5 rounded-full bg-[#FEE2E2] text-[#991B1B] text-[11px] font-black border border-[#FCA5A5] flex items-center gap-1">
                    <AlertTriangle size={12} /> Belum Terhubung
                  </span>
                )}
              </div>
              <p className="text-xs text-[#475569] mt-0.5 leading-relaxed">
                Amankan database POS secara berkala langsung ke akun Google Drive Anda. Folder penyimpanan otomatis:{" "}
                <b className="font-mono text-[#1E3A8A]">Grand Aceh POS Backups</b>.
              </p>
            </div>
          </div>

          {/* AKSI KONEKSI / LOGIN GOOGLE */}
          <div className="shrink-0 flex items-center gap-2">
            {!user ? (
              <button
                data-testid="gdrive-signin-btn"
                onClick={handleGoogleLogin}
                disabled={isLoggingIn}
                className="tap h-11 px-4 rounded-xl bg-white hover:bg-[#F8FAFC] text-[#1F2937] font-bold text-xs border border-[#CBD5E1] shadow-sm flex items-center gap-2.5 transition-all disabled:opacity-50"
              >
                {isLoggingIn ? (
                  <Loader2 size={16} className="animate-spin text-[#2563EB]" />
                ) : (
                  <svg className="w-4 h-4 shrink-0" viewBox="0 0 48 48">
                    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"></path>
                    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"></path>
                    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"></path>
                    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"></path>
                  </svg>
                )}
                <span>Masuk dengan Google</span>
              </button>
            ) : (
              <div className="flex items-center gap-2 bg-white/90 border border-[#BFDBFE] px-3 py-1.5 rounded-xl shadow-xs">
                {user.photoURL ? (
                  <img src={user.photoURL} alt={user.displayName} className="w-7 h-7 rounded-full border border-[#93C5FD]" />
                ) : (
                  <div className="w-7 h-7 rounded-full bg-[#2563EB] text-white text-xs font-bold grid place-items-center">
                    {(user.displayName || user.email || "G")[0].toUpperCase()}
                  </div>
                )}
                <div className="text-left leading-tight pr-1">
                  <div className="text-xs font-bold text-[#1E293B] truncate max-w-[140px]">{user.displayName || "Google User"}</div>
                  <div className="text-[10px] text-[#64748B] truncate max-w-[140px]">{user.email}</div>
                </div>
                <button
                  data-testid="gdrive-logout-btn"
                  onClick={handleGoogleLogout}
                  title="Putuskan Akun"
                  className="tap text-[#94A3B8] hover:text-[#EF4444] p-1 rounded-md transition-colors"
                >
                  <LogOut size={14} />
                </button>
              </div>
            )}
          </div>
        </div>

        {/* TOMBOL AKSI CEPAT BACKUP SEKARANG */}
        <div className="mt-4 pt-4 border-t border-[#DBEAFE] flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs text-[#334155] flex items-center gap-1.5">
            <FolderCheck size={15} className="text-[#2563EB]" />
            <span>Folder Drive: <b>Grand Aceh POS Backups</b> ({files.length} file tersimpan)</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              data-testid="gdrive-refresh-btn"
              onClick={() => loadDriveFiles()}
              disabled={loadingFiles || !user}
              className="tap h-9 px-3 rounded-lg bg-white border border-[#CBD5E1] text-[#334155] text-xs font-bold flex items-center gap-1.5 shadow-xs disabled:opacity-50"
            >
              <RefreshCw size={13} className={loadingFiles ? "animate-spin" : ""} />
              <span>Segarkan</span>
            </button>

            <button
              data-testid="gdrive-backup-now-btn"
              onClick={handleBackupNow}
              disabled={backupInProgress || !user}
              className="tap h-10 px-4 rounded-xl bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-extrabold text-xs shadow-sm flex items-center gap-2 disabled:opacity-50"
            >
              {backupInProgress ? (
                <Loader2 size={15} className="animate-spin" />
              ) : (
                <CloudUpload size={15} />
              )}
              <span>{backupInProgress ? "Memproses Backup..." : "Backup ke Google Drive Sekarang"}</span>
            </button>
          </div>
        </div>
      </div>

      {/* PENGATURAN JADWAL BERKALA (AUTO-BACKUP CONFIGURATION) */}
      <div className="rounded-2xl border border-[#E4E4E7] bg-white p-5 space-y-4 shadow-xs">
        <div className="flex items-center justify-between gap-2 border-b border-[#F4F5F7] pb-3">
          <div>
            <h4 className="text-sm font-extrabold text-[#0A0A0A] flex items-center gap-2">
              <Clock size={16} className="text-[#D97706]" />
              Pengaturan Jadwal Backup Berkala (Auto-Backup)
            </h4>
            <p className="text-xs text-[#71717A] mt-0.5">
              Tentukan interval waktu server untuk melakukan snapshot cadangan otomatis ke Google Drive.
            </p>
          </div>
          <button
            data-testid="gdrive-save-schedule-btn"
            onClick={handleSaveSchedule}
            disabled={savingSchedule}
            className="tap h-9 px-3.5 rounded-lg bg-[#0A0A0A] hover:bg-[#27272A] text-white text-xs font-bold flex items-center gap-1.5 shadow-xs disabled:opacity-50"
          >
            {savingSchedule ? <Loader2 size={13} className="animate-spin" /> : <ShieldCheck size={13} />}
            <span>Simpan Jadwal</span>
          </button>
        </div>

        <div className="grid md:grid-cols-3 gap-4">
          {/* Toggle Switch */}
          <div className="p-3.5 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] space-y-2">
            <div className="text-xs font-bold text-[#475569]">Status Auto-Backup</div>
            <label className="flex items-center gap-2.5 cursor-pointer">
              <input
                data-testid="gdrive-auto-toggle"
                type="checkbox"
                checked={schedule.enabled}
                onChange={(e) => setSchedule({ ...schedule, enabled: e.target.checked })}
                className="h-4 w-4 rounded text-[#2563EB] focus:ring-[#2563EB]"
              />
              <span className="text-xs font-extrabold text-[#1E293B]">
                {schedule.enabled ? "Cadangan Otomatis Aktif" : "Non-Aktif"}
              </span>
            </label>
            <div className="text-[11px] text-[#64748B]">
              Otomatis membuat cadangan data saat jadwal tiba tanpa intervensi kasir.
            </div>
          </div>

          {/* Pilihan Frekuensi */}
          <div className="p-3.5 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] space-y-2">
            <div className="text-xs font-bold text-[#475569]">Frekuensi Backup</div>
            <select
              data-testid="gdrive-frequency-select"
              value={schedule.frequency}
              onChange={(e) => setSchedule({ ...schedule, frequency: e.target.value })}
              className="w-full h-9 rounded-lg border border-[#CBD5E1] bg-white px-2.5 text-xs font-bold text-[#1E293B]"
            >
              <option value="shift_close">Setiap Tutup Shift Kasir (Rekomendasi)</option>
              <option value="daily">Setiap Hari (Pukul 23:00 WIB)</option>
              <option value="hourly_6">Setiap 6 Jam</option>
              <option value="weekly">Setiap Minggu (Minggu 03:00 WIB)</option>
            </select>
            <div className="text-[11px] text-[#64748B]">
              Frekuensi terbaik untuk F&B adalah setiap kasir menutup shift harian.
            </div>
          </div>

          {/* Retensi Backup */}
          <div className="p-3.5 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] space-y-2">
            <div className="text-xs font-bold text-[#475569]">Batas Penyimpanan di GDrive</div>
            <select
              data-testid="gdrive-retention-select"
              value={schedule.maxRetention}
              onChange={(e) => setSchedule({ ...schedule, maxRetention: Number(e.target.value) })}
              className="w-full h-9 rounded-lg border border-[#CBD5E1] bg-white px-2.5 text-xs font-bold text-[#1E293B]"
            >
              <option value={10}>Simpan 10 File Terakhir</option>
              <option value={15}>Simpan 15 File Terakhir (Default)</option>
              <option value={30}>Simpan 30 File Terakhir (1 Bulan)</option>
              <option value={60}>Simpan 60 File Terakhir (2 Bulan)</option>
            </select>
            <div className="text-[11px] text-[#64748B]">
              File backup terlama akan dibersihkan agar kuota Google Drive tidak penuh.
            </div>
          </div>
        </div>

        {/* Info Backup Terakhir */}
        <div className="flex flex-wrap items-center justify-between text-xs text-[#52525B] bg-[#FAFAFA] p-3 rounded-xl border border-[#F4F4F5]">
          <div className="flex items-center gap-2">
            <Calendar size={14} className="text-[#71717A]" />
            <span>
              Backup Terakhir:{" "}
              <b>
                {serverConfig?.last_backup_at
                  ? formatDate(serverConfig.last_backup_at)
                  : schedule.lastBackupAt
                  ? formatDate(schedule.lastBackupAt)
                  : "Belum pernah dijalankan"}
              </b>
            </span>
          </div>
          {serverConfig?.last_backup_file && (
            <div className="font-mono text-[11px] text-[#3F3F46]">
              File: {serverConfig.last_backup_file}
            </div>
          )}
        </div>
      </div>

      {/* DAFTAR FILE BACKUP DI GOOGLE DRIVE */}
      <div className="rounded-2xl border border-[#E4E4E7] bg-white p-5 space-y-3 shadow-xs">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-sm font-extrabold text-[#0A0A0A] flex items-center gap-2">
              <HardDrive size={16} className="text-[#059669]" />
              Daftar Arsip Backup di Google Drive
            </h4>
            <p className="text-xs text-[#71717A] mt-0.5">
              File backup .zip yang tersimpan di Google Drive dapat dipulihkan kapan saja ke server POS.
            </p>
          </div>
          <div className="text-xs font-bold text-[#71717A]">
            {files.length} File Tersimpan
          </div>
        </div>

        {!user ? (
          <div className="text-center py-8 bg-[#F8FAFC] rounded-xl border border-dashed border-[#CBD5E1] space-y-3">
            <FolderLock size={36} className="mx-auto text-[#94A3B8]" />
            <div className="text-sm font-bold text-[#475569]">
              Hubungkan akun Google Drive untuk melihat dan memulihkan arsip backup.
            </div>
            <button
              onClick={handleGoogleLogin}
              disabled={isLoggingIn}
              className="tap h-9 px-4 rounded-lg bg-[#2563EB] text-white text-xs font-bold inline-flex items-center gap-1.5 shadow-xs"
            >
              <Cloud size={14} /> Masuk dengan Google
            </button>
          </div>
        ) : loadingFiles ? (
          <div className="text-center py-8 space-y-2">
            <Loader2 size={24} className="animate-spin mx-auto text-[#2563EB]" />
            <div className="text-xs text-[#64748B]">Memuat daftar backup dari Google Drive...</div>
          </div>
        ) : files.length === 0 ? (
          <div className="text-center py-8 bg-[#FAFAFA] rounded-xl border border-dashed border-[#E4E4E7] space-y-2">
            <CloudUpload size={32} className="mx-auto text-[#A1A1AA]" />
            <div className="text-xs font-bold text-[#52525B]">Belum ada file backup di Google Drive.</div>
            <p className="text-[11px] text-[#A1A1AA]">Klik tombol "Backup ke Google Drive Sekarang" untuk membuat backup pertama.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-[#E4E4E7] bg-[#F8FAFC] text-[#52525B] font-bold">
                  <th className="py-2.5 px-3">Nama File Backup</th>
                  <th className="py-2.5 px-3">Waktu Pembuatan</th>
                  <th className="py-2.5 px-3">Ukuran</th>
                  <th className="py-2.5 px-3 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F4F4F5]">
                {files.map((f) => (
                  <tr key={f.id} className="hover:bg-[#F8FAFC] transition-colors">
                    <td className="py-3 px-3 font-mono font-bold text-[#18181B]">
                      <div className="flex items-center gap-2">
                        <HardDrive size={14} className="text-[#2563EB] shrink-0" />
                        <span className="truncate max-w-[220px] md:max-w-xs" title={f.name}>{f.name}</span>
                      </div>
                    </td>
                    <td className="py-3 px-3 text-[#52525B]">{formatDate(f.createdTime)}</td>
                    <td className="py-3 px-3 text-[#52525B] font-mono">{formatBytes(f.size)}</td>
                    <td className="py-3 px-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          data-testid={`restore-gdrive-${f.id}`}
                          onClick={() => {
                            setRestoreTarget(f);
                            setRestoreConfirmText("");
                          }}
                          className="tap h-8 px-2.5 rounded-lg bg-[#EEF2FF] hover:bg-[#E0E7FF] text-[#4F46E5] font-bold text-[11px] flex items-center gap-1 transition-colors"
                          title="Pulihkan database dari file ini"
                        >
                          <RotateCcw size={12} />
                          <span>Pulihkan</span>
                        </button>
                        <button
                          data-testid={`download-gdrive-${f.id}`}
                          onClick={() => handleDownloadFile(f)}
                          className="tap h-8 px-2 rounded-lg bg-[#F4F4F5] hover:bg-[#E4E4E7] text-[#3F3F46] text-[11px] font-bold flex items-center gap-1 transition-colors"
                          title="Unduh file ke komputer"
                        >
                          <Download size={12} />
                        </button>
                        <button
                          data-testid={`delete-gdrive-${f.id}`}
                          onClick={() => setDeleteTarget(f)}
                          className="tap h-8 px-2 rounded-lg text-[#EF4444] hover:bg-[#FEE2E2] text-[11px] font-bold transition-colors"
                          title="Hapus dari Google Drive"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* DIALOG KONFIRMASI RESTORE (DESTRUCTIVE OPERATION) */}
      {restoreTarget && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white rounded-2xl p-6 shadow-2xl space-y-4 border border-[#EF4444]">
            <div className="flex items-start gap-3 text-[#DC2626]">
              <div className="h-10 w-10 rounded-xl bg-[#FEE2E2] grid place-items-center shrink-0">
                <AlertTriangle size={22} />
              </div>
              <div>
                <h3 className="text-base font-extrabold text-[#18181B]">Konfirmasi Pemulihan Database</h3>
                <p className="text-xs text-[#71717A] mt-0.5">Tindakan ini akan menimpa seluruh data sistem.</p>
              </div>
            </div>

            <div className="bg-[#FEF2F2] border border-[#FECACA] rounded-xl p-3.5 text-xs text-[#991B1B] space-y-1">
              <div className="font-bold">File yang akan dipulihkan:</div>
              <div className="font-mono text-[11px] font-bold text-[#18181B] bg-white/70 p-1.5 rounded border border-[#FECACA] truncate">
                {restoreTarget.name}
              </div>
              <div className="mt-1">
                Semua data transaksi, produk, dan pengaturan saat ini akan <b>ditimpa total</b> dengan data dari arsip backup ini.
              </div>
            </div>

            <div>
              <label className="text-xs font-bold text-[#374151]">
                Ketik <span className="font-mono text-[#DC2626] font-extrabold">PULIHKAN</span> untuk melanjutkan:
              </label>
              <input
                data-testid="restore-confirm-input"
                type="text"
                value={restoreConfirmText}
                onChange={(e) => setRestoreConfirmText(e.target.value)}
                placeholder="PULIHKAN"
                className="w-full h-10 mt-1.5 px-3 rounded-lg border border-[#D1D5DB] font-mono text-sm tracking-wider uppercase"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#F4F4F5]">
              <button
                onClick={() => {
                  setRestoreTarget(null);
                  setRestoreConfirmText("");
                }}
                disabled={restoring}
                className="tap h-10 px-4 rounded-xl border border-[#D1D5DB] text-xs font-bold text-[#4B5563]"
              >
                Batal
              </button>
              <button
                data-testid="confirm-restore-btn"
                onClick={executeRestore}
                disabled={restoring || restoreConfirmText.trim().toUpperCase() !== "PULIHKAN"}
                className="tap h-10 px-4 rounded-xl bg-[#DC2626] hover:bg-[#B91C1C] text-white text-xs font-extrabold flex items-center gap-1.5 shadow-sm disabled:opacity-40"
              >
                {restoring ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />}
                <span>{restoring ? "Memulihkan Data..." : "Ya, Pulihkan Database"}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DIALOG KONFIRMASI HAPUS FILE GOOGLE DRIVE */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-white rounded-2xl p-5 shadow-2xl space-y-4 border border-[#E4E4E7]">
            <div className="flex items-start gap-3">
              <div className="h-10 w-10 rounded-xl bg-[#FEE2E2] text-[#DC2626] grid place-items-center shrink-0">
                <Trash2 size={20} />
              </div>
              <div>
                <h3 className="text-sm font-extrabold text-[#18181B]">Hapus Backup dari Google Drive?</h3>
                <p className="text-xs text-[#71717A] mt-0.5">File cadangan ini akan dihapus secara permanen dari drive Anda.</p>
              </div>
            </div>

            <div className="bg-[#F8FAFC] border border-[#E2E8F0] p-2.5 rounded-lg text-xs font-mono truncate text-[#334155]">
              {deleteTarget.name}
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#F4F4F5]">
              <button
                onClick={() => setDeleteTarget(null)}
                disabled={deleting}
                className="tap h-9 px-3.5 rounded-lg border border-[#D1D5DB] text-xs font-bold text-[#4B5563]"
              >
                Batal
              </button>
              <button
                data-testid="confirm-delete-btn"
                onClick={executeDelete}
                disabled={deleting}
                className="tap h-9 px-3.5 rounded-lg bg-[#DC2626] hover:bg-[#B91C1C] text-white text-xs font-bold flex items-center gap-1.5 disabled:opacity-50"
              >
                {deleting ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                <span>{deleting ? "Menghapus..." : "Hapus File"}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
