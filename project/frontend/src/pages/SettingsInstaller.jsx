import { useRef, useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Download, Monitor, Cpu, CheckCircle2, RefreshCw, DatabaseBackup, Globe, CloudUpload, Bug, Loader2, ShieldCheck, Cloud } from "lucide-react";
import { toast } from "sonner";
import api from "@/lib/api";
import { BOOTSTRAP_PI_SH, BOOTSTRAP_WINDOWS_BAT, START_PC_SERVER_BAT, SETUP_RASPBERRYPI_SH, downloadText, AISTUDIO_DEFAULT_URL } from "@/lib/installers";
import GDriveBackupManager from "@/components/GDriveBackupManager";

const AISTUDIO_URL = AISTUDIO_DEFAULT_URL;
const APP_DIR = "~/grand-aceh-pos";

const Section = ({ n, title, icon: Icon, desc, children }) => (
  <div className="space-y-3">
    <div>
      <h2 className="text-xl font-extrabold flex items-center gap-2">
        {Icon ? <Icon size={18} className="text-[#E63946]" /> : null}{n ? `${n}. ` : ""}{title}
      </h2>
      {desc ? <p className="text-[#52525B] text-sm mt-1">{desc}</p> : null}
    </div>
    {children}
  </div>
);

const Code = ({ children }) => (
  <pre className="bg-[#0A0A0A] text-[#E4E4E7] text-xs rounded-lg p-3 overflow-x-auto font-mono whitespace-pre-wrap select-all">{children}</pre>
);

export default function SettingsInstaller() {
  const nav = useNavigate();
  const fileRef = useRef(null);
  const [updating, setUpdating] = useState(false);
  const [updateEnabled, setUpdateEnabled] = useState(null);
  const [phase, setPhase] = useState("");
  const [log, setLog] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const pollRef = useRef(null);
  const tickRef = useRef(null);

  useEffect(() => {
    api.get("/admin/update/status")
      .then((r) => setUpdateEnabled(!!r.data?.enabled))
      .catch(() => setUpdateEnabled(false));
    return () => { clearInterval(pollRef.current); clearInterval(tickRef.current); };
  }, []);

  const finishUpdate = (ok) => {
    clearInterval(pollRef.current); clearInterval(tickRef.current);
    if (ok) {
      setPhase("Selesai! Memuat ulang halaman...");
      setTimeout(() => window.location.reload(), 2500);
    } else {
      setUpdating(false); setPhase("");
    }
  };

  const startPolling = () => {
    let sawRunning = false, sawDown = false;
    const started = Date.now();
    setElapsed(0);
    tickRef.current = setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000);
    pollRef.current = setInterval(async () => {
      if (Date.now() - started > 15 * 60 * 1000) { finishUpdate(true); return; }
      try {
        const r = await api.get("/admin/update/status");
        if (r.data?.log) setLog(r.data.log);
        if (r.data?.running) {
          sawRunning = true;
          setPhase("Membangun ulang aplikasi di server...");
        } else if (sawRunning || sawDown) {
          finishUpdate(true);
        } else {
          setPhase("Menyiapkan update...");
        }
      } catch (e) {
        sawDown = true;
        setPhase("Server sedang restart (membangun ulang)...");
      }
    }, 4000);
  };

  const updateNow = async () => {
    if (!window.confirm("Unduh versi terbaru dari Google AI Studio & bangun ulang sekarang? Aplikasi akan restart beberapa menit.")) return;
    setUpdating(true); setLog(""); setPhase("Memulai update...");
    const t = toast.loading("Memulai update...");
    try {
      const r = await api.post("/admin/update");
      toast.success(r.data?.message || "Update dimulai.", { id: t, duration: 8000 });
      startPolling();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Gagal memulai update", { id: t, duration: 10000 });
      setUpdating(false); setPhase("");
    }
  };

  const backupNow = async () => {
    const t = toast.loading("Membuat backup...");
    try {
      const res = await api.get("/backup/export", {
        responseType: "blob",
        onDownloadProgress: (e) => {
          const mb = (e.loaded / 1048576).toFixed(1);
          toast.loading(`Mengunduh backup... ${mb} MB`, { id: t });
        },
      });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement("a");
      a.href = url; a.download = `gak-backup-${new Date().toISOString().slice(0, 10)}.zip`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      toast.success("Backup terunduh", { id: t });
    } catch (e) { toast.error("Gagal membuat backup", { id: t }); }
  };

  const backupToCloud = async () => {
    if (!window.confirm("Buat backup database di server lalu kirim salinannya ke Google AI Studio? Backup lokal tetap dibuat di folder backups/.")) return;
    const t = toast.loading("Membuat & mengirim backup ke Google AI Studio...");
    try {
      const r = await api.post("/backup/send-to-cloud");
      toast.success(r.data?.message || "Backup sedang dibuat & dikirim di server", { id: t, duration: 9000 });
    } catch (e) {
      toast.error(e.response?.data?.detail || "Gagal memulai backup (periksa internet server)", { id: t, duration: 10000 });
    }
  };

  const restoreFile = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!window.confirm("Restore akan MENIMPA SEMUA data saat ini dengan isi file. Lanjutkan?")) { e.target.value = ""; return; }
    const t = toast.loading("Memulihkan data...");
    try {
      const fd = new FormData(); fd.append("file", f);
      await api.post("/backup/import", fd);
      toast.success("Data dipulihkan. Memuat ulang...", { id: t });
      setTimeout(() => window.location.reload(), 1000);
    } catch (err) {
      const errMsg = err.response?.data?.detail || err.response?.data?.message || err.message || "Gagal memulihkan data";
      toast.error(`Gagal: ${errMsg}`, { id: t, duration: 8000 });
    } finally { e.target.value = ""; }
  };

  return (
    <div className="h-full overflow-y-auto p-6 lg:p-8" data-testid="settings-installer">
      <div className="max-w-3xl space-y-8">
        {/* HEADER AISTUDIO */}
        <div className="rounded-2xl border-2 border-[#E63946] bg-[#FEF2F2] p-5" data-testid="aistudio-repo-box">
          <div className="flex items-center gap-2 font-extrabold text-[#0A0A0A]"><Globe size={20} className="text-[#E63946]" /> Pusat Update Google AI Studio</div>
          <p className="text-sm text-[#52525B] mt-1">Seluruh kode &amp; update server diunduh langsung dari Google AI Studio ini. Versi dicek otomatis dari <code className="font-mono text-xs">version.json</code>.</p>
          <div className="mt-2 text-xs font-bold text-[#52525B]">Alamat pusat update:</div>
          <Code>{AISTUDIO_URL}</Code>
        </div>

        {/* INSTALL */}
        <Section n="1" title="Instal Server (pertama kali)" icon={Globe} desc="Unduh kode langsung dari Google AI Studio, lalu jalankan. Sekali perintah untuk Raspberry Pi.">
          {/* SCRIPT PRODUKSI PC & RASP PI */}
          <div className="rounded-xl border-2 border-[#10B981] bg-[#F0FDF4] p-5 space-y-4 shadow-sm" data-testid="unified-installers-box">
            <div className="flex items-center gap-2 font-extrabold text-[#111827]">
              <ShieldCheck size={20} className="text-[#10B981]" />
              Unified POS Node Scripts (PC &amp; Raspberry Pi)
            </div>
            <p className="text-xs text-[#4B5563]">
              Gunakan script di bawah ini untuk menginstal dan menjalankan model <b>Hybrid Lokal + Cloud</b> dengan PC Utama bertindak sebagai Node Evolution API (WhatsApp Gateway) dan Raspberry Pi sebagai Client Ringan terdedikasi.
            </p>
            
            <div className="grid md:grid-cols-2 gap-4">
              <div className="border border-[#BBF7D0] bg-white rounded-xl p-4 space-y-2">
                <div className="font-extrabold text-sm flex items-center gap-1.5 text-[#065F46]">
                  <Monitor size={16} /> PC Server Utama (Windows)
                </div>
                <p className="text-[11px] text-[#4B5563]">
                  Mengaktifkan Evolution API (port 8080) di Docker, mendeteksi IP Tailscale secara otomatis, dan menjalankan server POS lokal (port 3000).
                </p>
                <button
                  onClick={() => {
                    downloadText("start-pc-server.bat", START_PC_SERVER_BAT);
                    toast.success("start-pc-server.bat berhasil diunduh");
                  }}
                  className="tap w-full h-9 px-3 rounded-lg bg-[#10B981] hover:bg-[#059669] text-white font-bold text-xs inline-flex items-center justify-center gap-1.5 shadow-sm"
                >
                  <Download size={13} /> Unduh start-pc-server.bat
                </button>
              </div>

              <div className="border border-[#BBF7D0] bg-white rounded-xl p-4 space-y-2">
                <div className="font-extrabold text-sm flex items-center gap-1.5 text-[#065F46]">
                  <Cpu size={16} /> Raspberry Pi (Client Ringan)
                </div>
                <p className="text-[11px] text-[#4B5563]">
                  Menginstal Node.js 20, Tailscale VPN, mengunduh dependencies POS, dan mendaftarkan systemd service agar POS nyala otomatis tanpa Evolution API yang berat.
                </p>
                <button
                  onClick={() => {
                    downloadText("setup-raspberrypi.sh", SETUP_RASPBERRYPI_SH);
                    toast.success("setup-raspberrypi.sh berhasil diunduh");
                  }}
                  className="tap w-full h-9 px-3 rounded-lg bg-[#4F46E5] hover:bg-[#4338CA] text-white font-bold text-xs inline-flex items-center justify-center gap-1.5 shadow-sm"
                >
                  <Download size={13} /> Unduh setup-raspberrypi.sh
                </button>
              </div>
            </div>
          </div>

          <div className="rounded-xl border-2 border-[#E63946] bg-[#FEF2F2] p-4 space-y-2">
            <div className="flex items-center gap-2 font-extrabold"><Cpu size={18} className="text-[#E63946]" /> Raspberry Pi (headless) — 1 perintah via SSH</div>
            <p className="text-xs text-[#52525B]">Memasang <b>Docker</b>, meng-<b>unduh kode</b> dari Google AI Studio ke <code>{APP_DIR}</code>, lalu menjalankan installer (editor konfigurasi terbuka otomatis).</p>
            <Code>{`bash <(curl -fsSL ${AISTUDIO_URL}/bootstrap-pi.sh)`}</Code>
            <button data-testid="download-bootstrap-pi" onClick={() => { downloadText("bootstrap-pi.sh", BOOTSTRAP_PI_SH); toast.success("bootstrap-pi.sh diunduh"); }}
              className="tap mt-1 h-9 px-3 rounded-lg bg-white border border-[#E63946] text-[#E63946] font-bold text-xs inline-flex items-center gap-1.5">
              <Download size={13} /> Unduh bootstrap-pi.sh (cadangan)
            </button>
          </div>
          <div className="rounded-xl border border-[#E4E4E7] bg-white p-4 space-y-2 text-sm text-[#3f3f46]">
            <div className="font-bold flex items-center gap-1.5"><Monitor size={14} /> Komputer Windows (Instalasi Standalone)</div>
            <p className="text-xs text-[#52525B]">Pastikan <b>Docker Desktop</b> terpasang. Cara termudah: unduh skrip bootstrap lalu <b>dobel-klik</b> — otomatis unduh dari Google AI Studio + install.</p>
            <button data-testid="download-bootstrap-windows" onClick={() => { downloadText("bootstrap-windows.bat", BOOTSTRAP_WINDOWS_BAT); toast.success("bootstrap-windows.bat diunduh"); }}
              className="tap h-9 px-3 rounded-lg bg-white border border-[#0A0A0A] text-[#0A0A0A] font-bold text-xs inline-flex items-center gap-1.5">
              <Download size={13} /> Unduh bootstrap-windows.bat
            </button>
            <div className="text-[11px] text-[#52525B] mt-1">Atau manual di PowerShell:</div>
            <Code>{`mkdir grand-aceh-pos && cd grand-aceh-pos
curl -fsSL ${AISTUDIO_URL}/pos-grand.tar.gz -o pos-grand.tar.gz
tar xzf pos-grand.tar.gz
install-windows.bat`}</Code>
          </div>
        </Section>

        {/* GUIDES FOR INSTALLATION AND UPDATES */}
        <Section title="Panduan Instalasi &amp; Pembaruan Server" icon={CheckCircle2} desc="Panduan operasional harian untuk memelihara server kasir Anda di PC Utama dan Raspberry Pi.">
          <div className="bg-white rounded-xl border p-5 space-y-4 text-sm text-[#374151]">
            <div className="space-y-2">
              <h3 className="font-extrabold text-[#111827] flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-[#10B981]"></span>
                A. Manajemen Server di PC Utama (Windows)
              </h3>
              <ol className="list-decimal pl-5 space-y-1 text-xs text-[#4B5563]">
                <li><b>Cara Instal:</b> Unduh file <code className="font-mono text-xs text-[#10B981]">start-pc-server.bat</code> di atas, pindahkan ke folder proyek utama di PC Anda. Pastikan <b>Docker Desktop</b> sudah aktif, lalu klik dua kali file <code className="font-mono text-xs">start-pc-server.bat</code>.</li>
                <li><b>Cara Kerja:</b> Script akan otomatis mendeteksi alamat IP Tailscale PC Anda, menyalakannya di container Docker (Evolution API port 8080), dan menjalankan backend POS (port 3000). Alamat IP Tailscale ini langsung diinjeksi ke program secara otomatis!</li>
                <li><b>Cara Update:</b> Cukup tutup konsol server (Command Prompt) yang sedang berjalan, lakukan <code className="font-mono text-xs">git pull</code> (atau unduh paket terbaru), lalu jalankan kembali file <code className="font-mono text-xs">start-pc-server.bat</code> tersebut.</li>
              </ol>
            </div>

            <div className="space-y-2 pt-2 border-t border-[#F3F4F6]">
              <h3 className="font-extrabold text-[#111827] flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-[#4F46E5]"></span>
                B. Manajemen Server di Raspberry Pi (Client Ringan)
              </h3>
              <ol className="list-decimal pl-5 space-y-1 text-xs text-[#4B5563]">
                <li><b>Cara Instal:</b> Kirim file <code className="font-mono text-xs text-[#4F46E5]">setup-raspberrypi.sh</code> ke Raspberry Pi Anda (misal via SFTP atau wget). Masuk ke terminal Pi via SSH, lalu jalankan perintah: <code className="font-mono text-xs text-[#111827] bg-[#F3F4F6] px-1 py-0.5 rounded">chmod +x setup-raspberrypi.sh &amp;&amp; ./setup-raspberrypi.sh</code>.</li>
                <li><b>Cara Kerja:</b> Script akan menginstal Node.js, mengaktifkan Tailscale VPN, mendownload dependencies, dan mendaftarkan service background <code className="font-mono text-xs">grandpos.service</code> yang otomatis berjalan di port 3000 saat Pi dinyalakan.</li>
                <li><b>Cara Update:</b> Anda bisa memperbarui sistem di Raspberry Pi dengan mengklik tombol merah <b>"Update Sekarang" (Update 1-Klik)</b> di atas secara langsung dari browser kasir mana saja, atau via SSH manual dengan menjalankan: <code className="font-mono text-xs">cd ~/grand-aceh-pos &amp;&amp; bash update-pi.sh</code>.</li>
              </ol>
            </div>
          </div>
        </Section>

        {/* UPDATE */}
        <Section n="2" title="Perbarui Server" icon={RefreshCw} desc="Ambil versi terbaru dari Google AI Studio. Data Anda tetap aman.">
          <div className="rounded-xl border-2 border-[#E63946] bg-[#FEF2F2] p-4 space-y-2" data-testid="update-oneclick-box">
            <div className="flex items-center gap-2 font-extrabold"><RefreshCw size={18} className="text-[#E63946]" /> Update 1-Klik</div>
            <p className="text-xs text-[#52525B]">Unduh versi terbaru dari Google AI Studio &amp; bangun ulang otomatis di server — tanpa SSH. Tunggu 2–10 menit lalu muat ulang halaman.</p>
            <button data-testid="inapp-update-btn" disabled={updating} onClick={updateNow}
              className="tap h-11 px-5 rounded-xl bg-[#E63946] text-white font-bold inline-flex items-center gap-2 disabled:opacity-60">
              <RefreshCw size={16} className={updating ? "animate-spin" : ""} /> {updating ? "Sedang update..." : "Update Sekarang"}
            </button>
            {updating && (
              <div className="mt-2 rounded-lg border border-[#E4E4E7] bg-white p-3 space-y-2" data-testid="update-progress">
                <div className="flex items-center gap-2 text-sm font-bold text-[#0A0A0A]">
                  <RefreshCw size={14} className="animate-spin text-[#E63946]" />
                  <span data-testid="update-phase">{phase || "Memproses..."}</span>
                  <span className="ml-auto text-xs text-[#52525B] font-mono">{Math.floor(elapsed / 60)}m {elapsed % 60}s</span>
                </div>
                {log ? <pre className="bg-[#0A0A0A] text-[#E4E4E7] text-[10px] rounded p-2 max-h-32 overflow-auto font-mono whitespace-pre-wrap" data-testid="update-log">{log}</pre> : null}
                <p className="text-[11px] text-[#52525B]">Jangan tutup halaman ini. Akan dimuat ulang otomatis saat selesai.</p>
              </div>
            )}
            {!updating && updateEnabled === false && (
              <p className="text-[11px] text-[#B91C1C]" data-testid="update-inactive-note">Fitur 1-klik belum aktif. Jalankan update manual <b>sekali</b> (perintah di bawah) untuk mengaktifkannya.</p>
            )}
          </div>
          <div className="rounded-xl border border-[#E4E4E7] bg-white p-4 space-y-3 text-sm text-[#3f3f46]">
            <div className="font-bold text-xs text-[#52525B]">Alternatif via SSH (dipakai untuk update langsung di terminal Raspberry Pi):</div>
            <div>
              <div className="font-bold flex items-center gap-1.5 mb-1"><Cpu size={14} /> Update Manual Sekali Jalankan</div>
              <Code>{`cd ${APP_DIR} && bash update-pi.sh`}</Code>
              <div className="text-[11px] text-[#52525B] mt-1">Menarik pembaruan terbaru dari Git, lalu build &amp; restart otomatis.</div>
            </div>
            <div className="pt-2 border-t border-[#E4E4E7]">
              <div className="font-bold flex items-center gap-1.5 mb-1 text-[#059669]"><RefreshCw size={14} /> Pasang Auto-Update Otomatis (Setiap 03:30 Dini Hari)</div>
              <Code>{`cd ${APP_DIR} && bash setup-autoupdate-pi.sh`}</Code>
              <div className="text-[11px] text-[#52525B] mt-1">Sistem di Raspberry Pi akan otomatis mengecek &amp; menerapkan versi terbaru setiap hari pukul 03:30 subuh tanpa perlu buka terminal lagi.</div>
            </div>
            <div className="pt-2 border-t border-[#E4E4E7] bg-[#F8FAFC] -mx-4 -mb-4 p-4 rounded-b-xl">
              <div className="font-bold flex items-center gap-1.5 mb-1 text-[#475569]">💡 Update 1-Klik Meminta Sudo / Permission Denied?</div>
              <Code>{`cd ${APP_DIR} && bash fix-permission-pi.sh`}</Code>
              <div className="text-[11px] text-[#64748B] mt-1">Jalankan sekali di terminal Pi. Perintah ini memberikan hak akses Docker &amp; merapikan kepemilikan folder agar update 1-klik di browser bisa langsung jalan tanpa sudo.</div>
            </div>
          </div>
        </Section>

        {/* BACKUP */}
        <Section n="3" title="Cloud Backup & Restore Data" icon={DatabaseBackup} desc="Simpan salinan seluruh data secara berkala ke Google Drive dan file lokal.">
          {/* Integrasi Google Drive Backup */}
          <GDriveBackupManager />

          <div className="rounded-xl border border-[#E4E4E7] bg-white p-4 space-y-2 mt-4">
            <div className="font-bold text-sm text-[#18181B] flex items-center gap-2">
              <DatabaseBackup size={16} className="text-[#10B981]" />
              Opsi Cadangan Lokal & Manual (.zip)
            </div>
            <div className="flex flex-wrap gap-2 pt-1">
              <button data-testid="inapp-backup" onClick={backupNow} className="tap h-10 px-4 rounded-lg bg-[#10B981] hover:bg-[#059669] text-white font-bold text-sm inline-flex items-center gap-2 shadow-xs"><DatabaseBackup size={15} /> Unduh Backup (.zip)</button>
              <button data-testid="inapp-backup-cloud" onClick={backupToCloud} className="tap h-10 px-4 rounded-lg bg-[#4F46E5] hover:bg-[#4338CA] text-white font-bold text-sm inline-flex items-center gap-2 shadow-xs"><CloudUpload size={15} /> Kirim Backup ke Google AI Studio</button>
              <button data-testid="inapp-restore" onClick={() => fileRef.current?.click()} className="tap h-10 px-4 rounded-lg bg-white border border-[#CBD5E1] hover:bg-[#F8FAFC] font-bold text-sm text-[#334155] shadow-xs">Restore dari File Lokal (.zip)...</button>
              <input ref={fileRef} type="file" accept=".zip" className="hidden" onChange={restoreFile} data-testid="inapp-restore-input" />
            </div>
            <p className="text-[11px] text-[#52525B]"><b>Unduh Backup</b> membuat dan mengunduh berkas arsip database ke perangkat. <b>Restore</b> memulihkan database dari arsip .zip lokal.</p>
          </div>
          <div className="rounded-xl border border-[#E4E4E7] bg-white p-4 text-sm text-[#3f3f46] space-y-2">
            <div className="font-bold">Atau lewat skrip di dalam folder server Raspberry Pi:</div>
            <Code>{`cd ${APP_DIR}
./backup-pi.sh                       # backup lokal -> backups/
./backup-to-cloud.sh                # backup lokal + kirim salinan ke cloud
./restore-pi.sh backups/namafile.gz  # pulihkan (ketik YA saat konfirmasi)`}</Code>
            <div className="text-[#B91C1C]"><b>Perhatian:</b> restore MENIMPA seluruh data. Pastikan ada salinan cadangan yang aman di Google Drive.</div>
          </div>
        </Section>

        {/* INTEGRITAS */}
        <Section n="4" title="Cek Integritas Server & Data" icon={ShieldCheck} desc="Pastikan data masih konsisten (bukan cuma 'server hidup').">
          <div className="rounded-xl border-2 border-[#4F46E5] bg-[#EEF2FF] p-4 space-y-2">
            <div className="flex flex-wrap gap-2">
              <button data-testid="goto-integritas" onClick={() => nav("/settings?tab=integritas")}
                className="tap h-10 px-4 rounded-lg bg-[#4F46E5] text-white font-bold text-sm inline-flex items-center gap-2">
                <ShieldCheck size={15} /> Buka Cek Integritas
              </button>
              <button data-testid="goto-integritas-diag" onClick={() => nav("/settings?tab=diagnostik")}
                className="tap h-10 px-4 rounded-lg bg-white border font-bold text-sm inline-flex items-center gap-2">
                <Bug size={15} /> Diagnostik
              </button>
            </div>
            <p className="text-[11px] text-[#52525B]">
              Memeriksa relasi data (produk/kategori/vendor, transaksi/meja/shift), kewajaran angka
              (total transaksi, nomor ganda), stok &amp; HPP, akun, indeks database, dan kesegaran backup.
              Temuan yang jelas aman bisa diperbaiki langsung dari halaman itu (ada tombol Perbaiki per temuan).
              Bisa dijadwalkan otomatis tiap minggu di halaman yang sama.
            </p>
          </div>
          <div className="rounded-xl border border-[#E4E4E7] bg-white p-4 text-sm text-[#3f3f46] space-y-2">
            <div className="font-bold">Atau lewat skrip di dalam folder proyek:</div>
            <Code>{`cd ${APP_DIR}
./check-integrity-pi.sh                  # periksa sekarang (ringkasan berwarna; 0=sehat, 2=peringatan, 1=berat)
./check-integrity-pi.sh --read-only      # tampilkan hasil terakhir saja
./check-integrity-pi.sh --notify 62812xx # sekaligus kirim ringkasan ke WhatsApp`}</Code>
            <p className="text-[11px] text-[#52525B]">Dokumentasi lengkap daftar pemeriksaan: <b>docs/PANDUAN-INTEGRITAS.md</b> di folder proyek.</p>
          </div>
        </Section>

        {/* DIAGNOSTIK */}
        <Section n="5" title="Diagnostik & Lapor Bug" icon={Bug} desc="Kirim info teknis ke Google AI Studio untuk analisis.">
          <div className="rounded-xl border border-[#E4E4E7] bg-white p-4 text-sm text-[#3f3f46]">
            <p className="text-[#52525B] text-xs mb-2">Laporan dikirim langsung ke Google AI Studio (internet), tanpa lewat server Pi — bisa dilakukan meski koneksi server bermasalah.</p>
            <button data-testid="goto-diagnostik" onClick={() => nav("/settings?tab=diagnostik")}
              className="tap h-10 px-4 rounded-lg bg-[#4F46E5] text-white font-bold text-sm inline-flex items-center gap-2">
              <Bug size={15} /> Buka Diagnostik
            </button>
          </div>
        </Section>

        {/* STEPS */}
        <div className="rounded-2xl border border-[#E4E4E7] bg-white p-5">
          <div className="font-extrabold mb-2 flex items-center gap-2"><CheckCircle2 size={16} className="text-[#10B981]" /> Ringkasan alur</div>
          <ol className="space-y-2 text-sm text-[#3f3f46]">
            {[
              "Di Raspberry Pi via SSH, jalankan 1 perintah bootstrap (pasang Docker, unduh kode dari Google AI Studio, install).",
              "Isi backend/.env.docker saat editor terbuka (JWT_SECRET, email/password admin), simpan.",
              "Akses http://IP-server di POS komputer / atur di APK Android.",
              "Update: cd ~/grand-aceh-pos && bash update-pi.sh (otomatis menarik pembaruan terbaru dari Git).",
              "Backup rutin: tombol di atas atau backup-pi.sh. Lapor bug: Diagnostik.",
            ].map((s, i) => (
              <li key={s} className="flex gap-2"><span className="font-bold text-[#E63946]">{i + 1}.</span><span>{s}</span></li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  );
}
