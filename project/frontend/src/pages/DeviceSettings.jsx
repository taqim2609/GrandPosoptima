import { useEffect, useState, useMemo } from "react";
import { toast } from "sonner";
import { Printer, Server, Store, Save, ReceiptText, Upload, Loader2, Bluetooth, Wifi, Wallet, Cpu, CheckCircle2, Eye, RefreshCw } from "lucide-react";
import api, { apiError } from "@/lib/api";
import { getDeviceConfig, setDeviceConfig, getServerUrl, setServerUrl, sampleOrder, getPrinterStatus, openCashDrawer, getSunmiHardwareProfile } from "@/lib/device";
import { printReceipt } from "@/lib/receipt";
import { requestBluetoothPrinter, clearBluetoothPrinter } from "@/lib/bluetooth";
import ReceiptPaper from "@/components/ReceiptPaper";
import ReceiptModal from "@/components/ReceiptModal";

export default function DeviceSettings() {
  const [cfg, setCfg] = useState(getDeviceConfig());
  const [srv, setSrv] = useState(getServerUrl());
  const [outlet, setOutlet] = useState(null); // data global server (outlet & logo)
  const [upLogo, setUpLogo] = useState(false);
  const [hwProfile, setHwProfile] = useState(null);
  const [previewModalOpen, setPreviewModalOpen] = useState(false);
  const upd = (patch) => setCfg((c) => ({ ...c, ...patch }));

  const previewOrder = useMemo(() => sampleOrder(), []);

  useEffect(() => {
    // Deteksi profil hardware native jika berjalan di APK
    const profile = getSunmiHardwareProfile();
    if (profile) {
      setHwProfile(profile);
    }
  }, []);

  useEffect(() => {
    api.get("/settings/outlet")
      .then((r) => {
        setOutlet(r.data);
        // Sinkronkan nama/alamat server ke config lokal bila lokal masih default kosong
        setCfg((c) => ({
          ...c,
          outletName: r.data?.name || c.outletName,
          outletAddress: r.data?.address || c.outletAddress,
        }));
      })
      .catch(() => {});
  }, []);

  const save = () => {
    setDeviceConfig(cfg);
    toast.success("Pengaturan perangkat disimpan di perangkat ini");
  };
  const saveServer = () => {
    setServerUrl(srv);
    toast.success("Alamat server disimpan. Memuat ulang...");
    setTimeout(() => window.location.reload(), 700);
  };
  const testPrint = () => {
    setDeviceConfig(cfg);
    printReceipt(sampleOrder());
    toast.message("Mengirim struk uji ke printer...");
  };
  const [btBusy, setBtBusy] = useState(false);
  const [selftestBusy, setSelftestBusy] = useState(false);
  // Tes buka laci kasir — verifikasi tanpa harus transaksi (butuh APK v2.10+).
  const doOpenDrawer = () => {
    const r = openCashDrawer();
    if (r.ok) toast.success("Perintah buka laci dikirim — pastikan laci terbuka");
    else toast.error("Gagal buka laci: " + (r.reason || "tidak diketahui"), { duration: 9000 });
  };
  const doSelfTest = () => {
    try {
      const sp = window.SunmiInnerPrinter || window.sunmiInnerPrinter || window.sunmi || window.SunmiPrinterBridge;
      if (!sp || typeof sp.selfTest !== "function") {
        toast.error("Tes mandiri hanya tersedia di APK dengan printer Sunmi");
        return;
      }
      if (typeof sp.isConnected === "function" && !sp.isConnected()) {
        toast.error("Printer Sunmi belum terhubung — cek status");
        return;
      }
      setSelftestBusy(true);
      const ok = sp.selfTest();
      toast[ok ? "success" : "error"](ok ? "Tes mandiri dikirim — printer akan mencetak halaman uji" : "Gagal mengirim tes mandiri (cek status printer)");
      setTimeout(() => setSelftestBusy(false), 1500);
    } catch (e) {
      toast.error("Gagal tes mandiri: " + (e.message || e));
      setSelftestBusy(false);
    }
  };
  const pairBt = async () => {
    setBtBusy(true);
    const t = toast.loading("Memilih printer Bluetooth...");
    try {
      const r = await requestBluetoothPrinter();
      const name = r.name || "Printer Bluetooth";
      setDeviceConfig({ ...getDeviceConfig(), printerMode: "bluetooth", bluetoothDevice: name });
      setCfg((c) => ({ ...c, printerMode: "bluetooth", bluetoothDevice: name }));
      toast.success(`Printer "${name}" terpasang`, { id: t });
    } catch (e) {
      toast.error(e.message || "Gagal memasang printer Bluetooth", { id: t, duration: 9000 });
    } finally { setBtBusy(false); }
  };
  const saveOutlet = async () => {
    if (!outlet) return;
    try {
      await api.put("/settings/outlet", { name: outlet.name, address: outlet.address, phone: outlet.phone });
      // ikutkan ke header struk lokal
      setCfg((c) => ({ ...c, outletName: outlet.name || c.outletName, outletAddress: outlet.address || c.outletAddress }));
      toast.success("Identitas outlet disimpan (server)");
    } catch (e) { toast.error(apiError(e.response?.data?.detail)); }
  };
  const uploadLogo = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setUpLogo(true);
    try {
      const fd = new FormData(); fd.append("file", f);
      const { data } = await api.post("/settings/outlet/logo", fd);
      setOutlet((o) => ({ ...o, logo_url: data.url }));
      try { localStorage.setItem("gak_logo_b64", data.url); } catch (_) {}
      toast.success("Logo outlet berhasil diunggah");
    } catch (err) { toast.error(apiError(err.response?.data?.detail)); }
    finally { setUpLogo(false); e.target.value = ""; }
  };
  const removeLogo = async () => {
    try {
      await api.put("/settings/outlet", { logo_url: "" });
      setOutlet((o) => ({ ...o, logo_url: "" }));
      try { localStorage.removeItem("gak_logo_b64"); } catch (_) {}
      toast.success("Logo outlet dihapus");
    } catch (err) { toast.error(apiError(err.response?.data?.detail)); }
  };

  return (
    <div className="h-full overflow-y-auto p-6 lg:p-8" data-testid="device-settings-page">
      <div className="max-w-6xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-extrabold flex items-center gap-2"><Printer className="text-[#E63946]" /> Pengaturan Perangkat &amp; Struk</h1>
          <p className="text-[#52525B] text-sm mt-1">Identitas outlet &amp; logo disimpan di server (dipakai semua perangkat); format struk &amp; setelan printer tersimpan per perangkat ini.</p>
        </div>

        <div className="grid lg:grid-cols-[1fr_360px] gap-6 items-start">
          {/* Kolom Kiri: Formulir Pengaturan */}
          <div className="space-y-6">
            {/* OUTLET & LOGO (global server) */}
            <Card icon={Store} title="Outlet & Logo (Identitas Outlet)">
              <div className="flex items-center gap-4 flex-wrap">
                {outlet?.logo_url ? (
                  <div className="relative group">
                    <img src={outlet.logo_url} alt="logo" className="h-16 w-16 rounded-xl border object-contain bg-white p-1" data-testid="outlet-logo" />
                    <button
                      type="button"
                      onClick={removeLogo}
                      title="Hapus Logo"
                      className="tap absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-[#EF4444] text-white text-xs font-bold grid place-items-center shadow hover:bg-[#DC2626]"
                    >
                      ×
                    </button>
                  </div>
                ) : (
                  <div className="h-16 w-16 rounded-xl border bg-[#F4F5F7] grid place-items-center text-[#a1a1aa]"><Store size={24} /></div>
                )}
                <div className="flex flex-col gap-1.5">
                  <label className="tap h-10 px-4 rounded-lg bg-[#0A0A0A] hover:bg-[#262626] text-white font-bold text-sm inline-flex items-center gap-2 cursor-pointer">
                    <Upload size={15} /> {upLogo ? "Mengunggah..." : (outlet?.logo_url ? "Ganti Logo" : "Unggah Logo")}
                    <input type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml" className="hidden" onChange={uploadLogo} data-testid="outlet-logo-input" />
                  </label>
                  {outlet?.logo_url && (
                    <button type="button" onClick={removeLogo} className="tap text-xs text-[#EF4444] hover:underline font-bold text-left">
                      Hapus Logo
                    </button>
                  )}
                </div>
              </div>
              <Field label="Nama Outlet">
                <input data-testid="outlet-name" value={outlet?.name || ""} onChange={(e) => setOutlet({ ...outlet, name: e.target.value })} className={inp} />
              </Field>
              <Field label="Alamat">
                <input data-testid="outlet-address" value={outlet?.address || ""} onChange={(e) => setOutlet({ ...outlet, address: e.target.value })} className={inp} />
              </Field>
              <Field label="Telepon">
                <input data-testid="outlet-phone" value={outlet?.phone || ""} onChange={(e) => setOutlet({ ...outlet, phone: e.target.value })} className={inp} />
              </Field>
              <button data-testid="outlet-save" onClick={saveOutlet} className="tap h-11 px-5 rounded-xl bg-[#E63946] text-white font-bold flex items-center gap-2"><Save size={16} /> Simpan Outlet</button>
            </Card>

            {/* IDENTITAS STRUK LOKAL (header per perangkat) */}
            <Card icon={ReceiptText} title="Header Struk (per perangkat)">
              <Field label="Nama Header Struk">
                <input data-testid="dev-outlet-name" value={cfg.outletName} onChange={(e) => upd({ outletName: e.target.value })} className={inp} />
              </Field>
              <Field label="Alamat Header">
                <input data-testid="dev-outlet-address" value={cfg.outletAddress} onChange={(e) => upd({ outletAddress: e.target.value })} className={inp} />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Posisi Header (nama/alamat)">
                  <select data-testid="dev-header-align" value={cfg.headerAlign} onChange={(e) => upd({ headerAlign: e.target.value })} className={`${inp} bg-white`}>
                    <option value="left">Kiri</option><option value="center">Tengah</option><option value="right">Kanan</option>
                  </select>
                </Field>
                <Field label="Posisi Footer">
                  <select data-testid="dev-footer-align" value={cfg.footerAlign} onChange={(e) => upd({ footerAlign: e.target.value })} className={`${inp} bg-white`}>
                    <option value="left">Kiri</option><option value="center">Tengah</option><option value="right">Kanan</option>
                  </select>
                </Field>
              </div>
              <Field label="Teks Penutup Struk">
                <input data-testid="dev-footer" value={cfg.footerText} onChange={(e) => upd({ footerText: e.target.value })} className={inp} />
              </Field>
            </Card>

            {/* PRINTER */}
            <Card icon={ReceiptText} title="Printer Struk">
              <div data-testid="printer-status" className={`rounded-xl px-3 py-2 text-sm font-bold ${cfg.printerMode === "bluetooth" && !cfg.bluetoothDevice ? "bg-[#FEF3C7] text-[#B45309]" : cfg.printerMode === "bluetooth" && typeof navigator !== "undefined" && !navigator.bluetooth ? "bg-[#FEE2E2] text-[#B91C1C]" : cfg.printerMode === "epson" && !cfg.epsonIp ? "bg-[#FEF3C7] text-[#B45309]" : (cfg.printerMode === "sunmi" || cfg.printerMode === "auto") && getPrinterStatus().sunmiConnected === false ? "bg-[#FEE2E2] text-[#B91C1C]" : "bg-[#ECFDF5] text-[#047857]"}`}>
                Status: {getPrinterStatus().label}
                {getPrinterStatus().debug && <span className="block text-[10px] font-mono mt-1 opacity-80">{getPrinterStatus().debug}</span>}
              </div>
              <Field label="Mode Printer">
                <select data-testid="dev-printer-mode" value={cfg.printerMode} onChange={(e) => upd({ printerMode: e.target.value })} className={`${inp} bg-white`}>
                  <option value="auto">Otomatis (Sunmi bawaan → browser)</option>
                  <option value="sunmi">Sunmi bawaan (T2/T2+)</option>
                  <option value="bluetooth">Bluetooth (ESC/POS)</option>
                  <option value="epson">Epson jaringan (POS Komputer)</option>
                  <option value="browser">Cetak lewat browser</option>
                </select>
              </Field>
              {cfg.printerMode === "bluetooth" && (
                <div className="space-y-2">
                  <p className="text-[11px] text-[#a1a1aa] -mt-1">Butuh Chrome/WebView modern (Web Bluetooth). Di APK otomatis tersedia (http://localhost = secure).</p>
                  <button data-testid="dev-bt-pair" onClick={pairBt} disabled={btBusy}
                    className="tap h-11 px-4 rounded-lg bg-[#0A0A0A] text-white font-bold text-xs inline-flex items-center gap-2 disabled:opacity-50">
                    {btBusy ? <Loader2 size={14} className="animate-spin" /> : <Bluetooth size={14} />} Pasang Printer Bluetooth…
                  </button>
                  {cfg.bluetoothDevice && (
                    <div className="flex items-center gap-2 text-sm bg-[#ECFDF5] border border-[#A7F3D0] rounded-lg px-3 py-2">
                      <Bluetooth size={14} className="text-[#047857]" />
                      <span className="font-bold">{cfg.bluetoothDevice}</span>
                      <button data-testid="dev-bt-remove" onClick={() => { clearBluetoothPrinter(); setDeviceConfig({ ...getDeviceConfig(), bluetoothDevice: "" }); setCfg((c) => ({ ...c, bluetoothDevice: "" })); toast.success("Printer Bluetooth dilepas"); }}
                        className="ml-auto text-[#DC2626] font-bold text-xs">Lepas</button>
                    </div>
                  )}
                </div>
              )}
              {cfg.printerMode === "epson" && (
                <div className="grid grid-cols-3 gap-3">
                  <div className="col-span-2">
                    <Field label="IP Printer Epson">
                      <input data-testid="dev-epson-ip" value={cfg.epsonIp} onChange={(e) => upd({ epsonIp: e.target.value })} placeholder="192.168.1.50" className={`${inp} font-mono`} />
                    </Field>
                  </div>
                  <Field label="Port">
                    <input data-testid="dev-epson-port" value={cfg.epsonPort} onChange={(e) => upd({ epsonPort: e.target.value })} placeholder="80" className={`${inp} font-mono`} />
                  </Field>
                  <p className="col-span-3 text-[11px] text-[#a1a1aa] -mt-1">Aktifkan fitur <b>ePOS-Print</b> di printer Epson (mis. TM-T82X/TM-m30) lewat panel web printer.</p>
                </div>
              )}
              <label className="flex items-center gap-2.5 mt-1 cursor-pointer" data-testid="dev-cashdrawer">
                <input type="checkbox" checked={cfg.cashDrawer} onChange={(e) => upd({ cashDrawer: e.target.checked })} className="h-4 w-4 accent-[#E63946]" />
                <span className="text-sm font-bold">Buka laci kasir otomatis setiap cetak struk</span>
              </label>
              {getPrinterStatus().sunmiDrawer === false && (
                <p data-testid="dev-drawer-hint" className="text-[11px] text-[#B45309] -mt-1">
                  APK yang terpasang belum mendukung buka laci — pasang <b>APK v2.10</b> atau lebih baru.
                </p>
              )}
              <label className="flex items-center gap-2.5 cursor-pointer" data-testid="dev-autoprint">
                <input type="checkbox" checked={cfg.autoPrint} onChange={(e) => upd({ autoPrint: e.target.checked })} className="h-4 w-4 accent-[#E63946]" />
                <span className="text-sm font-bold">Cetak struk otomatis saat pembayaran selesai</span>
              </label>
              <div className="flex gap-2 pt-1 flex-wrap">
                <button data-testid="dev-save" onClick={save} className="tap h-11 px-5 rounded-xl bg-[#0A0A0A] text-white font-bold flex items-center gap-2"><Save size={16} /> Simpan Setelan</button>
                <button data-testid="dev-testprint" onClick={testPrint} className="tap h-11 px-4 rounded-xl bg-[#F4F5F7] border font-bold flex items-center gap-2"><Printer size={16} /> Cetak Struk Uji</button>
                <button data-testid="dev-opendrawer" onClick={doOpenDrawer} className="tap h-11 px-4 rounded-xl bg-[#F4F5F7] border font-bold flex items-center gap-2"><Wallet size={16} /> Tes Buka Laci</button>
                <button data-testid="dev-selftest" onClick={doSelfTest} disabled={selftestBusy} className="tap h-11 px-4 rounded-xl bg-[#F4F5F7] border font-bold flex items-center gap-2 disabled:opacity-50"><Loader2 size={16} className={selftestBusy ? "animate-spin" : ""} /> Tes Mandiri</button>
              </div>
            </Card>

            {/* MODE OFFLINE (OFFLINE-FIRST) */}
            <Card icon={Wifi} title="Mode Offline (Offline-First)">
              <label className="flex items-center gap-2.5 cursor-pointer" data-testid="dev-offline-mode">
                <input type="checkbox" checked={cfg.offlineMode}
                  onChange={(e) => {
                    const v = e.target.checked;
                    upd({ offlineMode: v });
                    setDeviceConfig({ ...getDeviceConfig(), offlineMode: v }); // langsung aktif, tanpa perlu klik Simpan
                    toast.success(v ? "Mode offline diaktifkan — POS bisa dipakai tanpa koneksi" : "Mode offline dimatikan — POS terkunci bila server tidak terjangkau");
                  }}
                  className="h-4 w-4 accent-[#E63946]" />
                <span className="text-sm font-bold">Aktifkan mode offline (default: mati)</span>
              </label>
              <p className="text-[11px] text-[#a1a1aa]">
                {cfg.offlineMode
                  ? "POS tetap bisa bertransaksi tanpa koneksi server: data produk memakai cache, order disimpan lalu disinkron otomatis saat online kembali."
                  : "Saat MATI: bila server tidak bisa dihubungi, POS terkunci dan transaksi baru bisa dilakukan setelah koneksi normal kembali. Nyalakan hanya bila benar-benar butuh berjualan saat server bermasalah."}
              </p>
            </Card>

            {/* SERVER */}
            <Card icon={Server} title="Alamat Server (LAN)">
              <p className="text-[11px] text-[#a1a1aa] -mt-1">Isi IP komputer server saat memakai APK Android di jaringan toko. Kosongkan untuk memakai server yang sama dengan aplikasi.</p>
              <Field label="URL Server">
                <input data-testid="dev-server-url" value={srv} onChange={(e) => setSrv(e.target.value)} placeholder="http://192.168.1.100" className={`${inp} font-mono`} />
              </Field>
              <button data-testid="dev-server-save" onClick={saveServer} className="tap h-11 px-5 rounded-xl bg-[#0A0A0A] text-white font-bold flex items-center gap-2 w-fit"><Save size={16} /> Simpan &amp; Hubungkan</button>
            </Card>

            {/* PROFIL HARDWARE & DEVICE ID NATIVE (Sunmi T2 / Android) */}
            <Card icon={Cpu} title="Hardware &amp; Device ID Kasir Native">
              {hwProfile ? (
                <div className="space-y-3">
                  <div className="p-3.5 rounded-xl bg-[#F0FDF4] border border-[#BBF7D0] flex items-center justify-between">
                    <div>
                      <div className="text-xs font-bold text-[#166534] flex items-center gap-1.5">
                        <CheckCircle2 size={15} /> Perangkat Native Terdeteksi
                      </div>
                      <div className="text-sm font-extrabold text-[#14532D] mt-0.5">{hwProfile.model || "Sunmi Device"}</div>
                    </div>
                    {hwProfile.is_sunmi_t2 && (
                      <span className="px-2.5 py-1 rounded-full bg-[#DCFCE7] text-[#15803D] text-[11px] font-black border border-[#86EFAC]">
                        Sunmi T2 Native
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div className="bg-[#F8FAFC] p-2.5 rounded-lg border border-[#E2E8F0]">
                      <div className="text-[#64748B] font-bold text-[10px]">DEVICE ID / SERIAL:</div>
                      <div className="font-mono font-bold text-[#0F172A] mt-0.5 truncate" title={hwProfile.device_id}>
                        {hwProfile.device_id || "N/A"}
                      </div>
                    </div>
                    <div className="bg-[#F8FAFC] p-2.5 rounded-lg border border-[#E2E8F0]">
                      <div className="text-[#64748B] font-bold text-[10px]">TARGET BUILD:</div>
                      <div className="font-mono font-bold text-[#0F172A] mt-0.5">
                        {hwProfile.target_hardware || "SUNMI_T2"}
                      </div>
                    </div>
                  </div>
                  <p className="text-[11px] text-[#71717A]">
                    Device ID otomatis digunakan sebagai pengenal unik kasir dan stempel transaksi struk POS.
                  </p>
                </div>
              ) : (
                <div className="text-xs text-[#71717A] bg-[#FAFAFA] p-3.5 rounded-xl border border-[#F4F4F5]">
                  <div className="font-bold text-[#3F3F46]">Mode Web Browser / PWA</div>
                  <p className="mt-1">
                    Aplikasi saat ini berjalan di browser web. Ketika dipasang melalui <b>APK Native Sunmi T2</b> (v2.11+), ID unik perangkat, status sensor pemotong otomatis Seiko 80mm, dan layar pelanggan sekunder akan langsung terdeteksi otomatis.
                  </p>
                </div>
              )}
            </Card>
          </div>

          {/* Kolom Kanan: Pratinjau Struk Kasir (Live Preview) */}
          <div className="space-y-4 lg:sticky lg:top-6">
            <div className="bg-white rounded-2xl border border-[#E4E4E7] p-4 shadow-sm space-y-3.5">
              <div className="flex items-center justify-between border-b pb-2.5">
                <span className="text-xs uppercase tracking-wider font-extrabold text-[#111827] flex items-center gap-1.5">
                  <ReceiptText size={16} className="text-[#E63946]" /> Pratinjau Struk (Live)
                </span>
                <button
                  type="button"
                  onClick={() => setPreviewModalOpen(true)}
                  className="tap text-xs font-bold text-[#E63946] hover:underline flex items-center gap-1"
                >
                  <Eye size={13} /> Dialog Penuh
                </button>
              </div>

              {/* Scrollable Receipt Paper Preview Container */}
              <div className="flex justify-center bg-[#F4F5F7] p-3 rounded-xl border border-[#E4E4E7] overflow-y-auto max-h-[600px]">
                <ReceiptPaper
                  order={previewOrder}
                  outlet={outlet}
                  cfg={cfg}
                  logoUrl={outlet?.logo_url}
                />
              </div>

              <div className="grid grid-cols-2 gap-2 pt-1">
                <button
                  data-testid="dev-testprint-preview"
                  onClick={testPrint}
                  className="tap h-11 px-3 rounded-xl bg-[#0A0A0A] hover:bg-[#262626] text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-sm"
                >
                  <Printer size={15} /> Cetak Uji
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewModalOpen(true)}
                  className="tap h-11 px-3 rounded-xl bg-[#F4F5F7] hover:bg-[#E5E7EB] border font-bold text-xs flex items-center justify-center gap-1.5"
                >
                  <Eye size={15} /> Modal Struk
                </button>
              </div>

              <p className="text-[10.5px] text-[#71717A] text-center leading-relaxed">
                Pratinjau otomatis sinkron saat logo, nama outlet, posisi header/footer, atau teks penutup diubah.
              </p>
            </div>
          </div>
        </div>
      </div>

      <ReceiptModal
        order={previewOrder}
        open={previewModalOpen}
        onClose={() => setPreviewModalOpen(false)}
        title="Pratinjau Struk Kasir"
        subtitle="Simulasi tampilan cetak struk thermal 80mm/58mm"
        showNewTransactionBtn={false}
        outlet={outlet}
        cfg={cfg}
      />
    </div>
  );
}

const inp = "w-full h-11 px-3 rounded-xl border border-[#E4E4E7] outline-none focus:border-[#E63946] focus:ring-2 focus:ring-[#E63946]/20 text-sm";

const Card = ({ icon: Icon, title, children }) => (
  <div className="rounded-2xl border border-[#E4E4E7] bg-white p-5 space-y-3">
    <div className="flex items-center gap-2 font-extrabold"><Icon size={18} className="text-[#E63946]" /> {title}</div>
    {children}
  </div>
);

const Field = ({ label, children }) => (
  <div>
    <label className="text-xs uppercase tracking-wider font-bold text-[#52525B]">{label}</label>
    <div className="mt-1.5">{children}</div>
  </div>
);
