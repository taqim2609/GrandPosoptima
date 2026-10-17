import React, { useState } from "react";
import { usePWAInstall } from "@/hooks/usePWAInstall";
import { Monitor, Download, CheckCircle2, Info, Laptop, Printer, Sparkles } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

export function PWAInstallButton({ className = "" }) {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [guideOpen, setGuideOpen] = useState(false);

  const downloadScript = (filename, content) => {
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const generateBatLauncher = (kiosk = false) => {
    const appUrl = window.location.origin;
    const kioskFlag = kiosk ? " --kiosk-printing" : "";
    return `@echo off
title Grand Aceh Kuliner POS Desktop Launcher
color 0A
echo ===================================================
echo   MEMBUKA GRAND ACEH KULINER POS (DESKTOP MODE)
echo ===================================================
echo URL: ${appUrl}
echo.

set "CHROME_PATH=%ProgramFiles%\\Google\\Chrome\\Application\\chrome.exe"
if not exist "%CHROME_PATH%" set "CHROME_PATH=%ProgramFiles(x86)%\\Google\\Chrome\\Application\\chrome.exe"
if not exist "%CHROME_PATH%" set "CHROME_PATH=%LocalAppData%\\Google\\Chrome\\Application\\chrome.exe"

set "EDGE_PATH=%ProgramFiles(x86)%\\Microsoft\\Edge\\Application\\msedge.exe"
if not exist "%EDGE_PATH%" set "EDGE_PATH=%ProgramFiles%\\Microsoft\\Edge\\Application\\msedge.exe"

if exist "%CHROME_PATH%" (
    echo Menggunakan Google Chrome App Mode...
    start "" "%CHROME_PATH%" --app="${appUrl}" --start-maximized${kioskFlag}
    exit /b
)

if exist "%EDGE_PATH%" (
    echo Menggunakan Microsoft Edge App Mode...
    start "" "%EDGE_PATH%" --app="${appUrl}" --start-maximized${kioskFlag}
    exit /b
)

echo Buka browser default...
start "" "${appUrl}"
exit /b
`;
  };

  const generateShortcutMaker = () => {
    const appUrl = window.location.origin;
    return `@echo off
title Buat Shortcut Desktop Grand POS Optima
color 0B
echo Membuat Shortcut di Desktop Windows...

set "VBS_SCRIPT=%TEMP%\\create_pos_shortcut.vbs"
set "DESKTOP_DIR=%USERPROFILE%\\Desktop"

echo Set oWS = WScript.CreateObject("WScript.Shell") > "%VBS_SCRIPT%"
echo sLinkFile = "%DESKTOP_DIR%\\Grand POS Optima.lnk" >> "%VBS_SCRIPT%"
echo Set oLink = oWS.CreateShortcut(sLinkFile) >> "%VBS_SCRIPT%"

set "CHROME_PATH=%ProgramFiles%\\Google\\Chrome\\Application\\chrome.exe"
if not exist "%CHROME_PATH%" set "CHROME_PATH=%ProgramFiles(x86)%\\Google\\Chrome\\Application\\chrome.exe"

if exist "%CHROME_PATH%" (
    echo oLink.TargetPath = "%CHROME_PATH%" >> "%VBS_SCRIPT%"
    echo oLink.Arguments = "--app=${appUrl} --start-maximized" >> "%VBS_SCRIPT%"
) else (
    set "EDGE_PATH=%ProgramFiles(x86)%\\Microsoft\\Edge\\Application\\msedge.exe"
    echo oLink.TargetPath = "%EDGE_PATH%" >> "%VBS_SCRIPT%"
    echo oLink.Arguments = "--app=${appUrl} --start-maximized" >> "%VBS_SCRIPT%"
)

echo oLink.Description = "Grand Aceh Kuliner POS App" >> "%VBS_SCRIPT%"
echo oLink.WorkingDirectory = "%USERPROFILE%" >> "%VBS_SCRIPT%"
echo oLink.Save >> "%VBS_SCRIPT%"

cscript //nologo "%VBS_SCRIPT%"
del "%VBS_SCRIPT%"

echo.
echo Selesai! Shortcut 'Grand POS Optima' telah dibuat di Desktop Windows Anda.
pause
`;
  };

  return (
    <>
      <div className={`flex items-center gap-1.5 ${className}`}>
        {isInstallable && !isInstalled && (
          <button
            onClick={install}
            data-testid="pwa-install-header-btn"
            title="Install POS sebagai aplikasi desktop standalone"
            className="tap h-9 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold flex items-center gap-1.5 shadow-sm transition-all"
          >
            <Download size={14} className="animate-bounce" />
            <span className="hidden sm:inline">Install App Desktop</span>
            <span className="sm:hidden">Install</span>
          </button>
        )}

        <button
          onClick={() => setGuideOpen(true)}
          data-testid="pwa-desktop-guide-btn"
          title="Panduan Peluncur Desktop & Printer PC"
          className="tap h-9 px-2.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold border border-slate-300 flex items-center gap-1.5 transition-colors"
        >
          <Laptop size={14} className="text-slate-700" />
          <span className="hidden md:inline">Mode Desktop</span>
        </button>
      </div>

      <Dialog open={guideOpen} onOpenChange={setGuideOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-extrabold">
              <Laptop size={20} className="text-emerald-600" />
              Panduan Aplikasi Desktop Standalone & Printer PC
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 text-xs text-slate-700">
            {/* Status PWA */}
            <div className={`p-3.5 rounded-xl border flex items-center justify-between ${
              isInstalled 
                ? "bg-emerald-50 border-emerald-200 text-emerald-900" 
                : "bg-amber-50 border-amber-200 text-amber-900"
            }`}>
              <div className="flex items-center gap-2.5">
                {isInstalled ? (
                  <CheckCircle2 size={20} className="text-emerald-600 shrink-0" />
                ) : (
                  <Info size={20} className="text-amber-600 shrink-0" />
                )}
                <div>
                  <div className="font-extrabold text-sm">
                    {isInstalled ? "Aplikasi Berjalan dalam Mode Desktop Standalone" : "Browser Biasa (Belum Terinstall PWA)"}
                  </div>
                  <div className="text-[11px] opacity-90 mt-0.5">
                    {isInstalled 
                      ? "Aplikasi berjalan optimal di jendela frameless tanpa address bar & tab browser." 
                      : "Anda dapat menginstall aplikasi ini langsung ke desktop atau menggunakan launcher script."}
                  </div>
                </div>
              </div>

              {isInstallable && !isInstalled && (
                <button
                  onClick={() => { install(); setGuideOpen(false); }}
                  className="tap shrink-0 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-sm"
                >
                  Install 1-Klik
                </button>
              )}
            </div>

            {/* Opsi 1: PWA Install Browser */}
            <div className="p-3.5 rounded-xl border border-slate-200 bg-white space-y-2">
              <div className="font-extrabold text-sm text-slate-900 flex items-center gap-2">
                <Sparkles size={16} className="text-emerald-600" />
                Metode 1: Install Langsung dari Browser (PWA)
              </div>
              <p className="text-slate-600 leading-relaxed">
                Di Google Chrome, Microsoft Edge, atau Brave di PC Windows/Mac:
              </p>
              <ol className="list-decimal list-inside space-y-1 text-slate-700 font-medium pl-1">
                <li>Klik tombol <strong>Install App Desktop</strong> di bagian atas layar ini.</li>
                <li>Atau klik ikon <strong>Install / PWA</strong> (gambar komputer dengan panah bawah) di address bar browser sebelah kanan.</li>
                <li>Aplikasi akan otomatis membuat ikon di Desktop &amp; Start Menu dan terbuka di jendela tersendiri.</li>
              </ol>
            </div>

            {/* Opsi 2: Script Launcher & Shortcut Generator */}
            <div className="p-3.5 rounded-xl border border-slate-200 bg-white space-y-3">
              <div className="font-extrabold text-sm text-slate-900 flex items-center gap-2">
                <Monitor size={16} className="text-blue-600" />
                Metode 2: Download Script Launcher &amp; Pembuat Shortcut Windows
              </div>
              <p className="text-slate-600 leading-relaxed">
                Gunakan file script otomatis untuk membuka POS dalam mode App Window frameless secara langsung dari Desktop Windows:
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                <button
                  onClick={() => downloadScript("Buka-POS-Desktop.bat", generateBatLauncher(false))}
                  className="tap p-3 rounded-xl border border-slate-200 hover:border-emerald-500 bg-slate-50 hover:bg-emerald-50 text-left transition-all group"
                >
                  <div className="font-bold text-slate-900 group-hover:text-emerald-700 flex items-center justify-between">
                    <span>1. Buka-POS-Desktop.bat</span>
                    <Download size={14} />
                  </div>
                  <div className="text-[11px] text-slate-500 mt-1">Membuka POS di Chrome/Edge App Mode tanpa address bar.</div>
                </button>

                <button
                  onClick={() => downloadScript("Buka-POS-KioskPrint.bat", generateBatLauncher(true))}
                  className="tap p-3 rounded-xl border border-slate-200 hover:border-emerald-500 bg-slate-50 hover:bg-emerald-50 text-left transition-all group"
                >
                  <div className="font-bold text-slate-900 group-hover:text-emerald-700 flex items-center justify-between">
                    <span>2. Buka-POS-KioskPrint.bat</span>
                    <Download size={14} />
                  </div>
                  <div className="text-[11px] text-slate-500 mt-1">Sama seperti di atas + fitur Kiosk Direct Printing tanpa dialog.</div>
                </button>

                <button
                  onClick={() => downloadScript("Buat-Shortcut-Desktop.bat", generateShortcutMaker())}
                  className="tap p-3 rounded-xl border border-slate-200 hover:border-emerald-500 bg-slate-50 hover:bg-emerald-50 text-left transition-all sm:col-span-2 group"
                >
                  <div className="font-bold text-slate-900 group-hover:text-emerald-700 flex items-center justify-between">
                    <span>3. Buat-Shortcut-Desktop.bat (Otomatis Buat Ikon di Desktop)</span>
                    <Download size={14} />
                  </div>
                  <div className="text-[11px] text-slate-500 mt-1">Jalankan sekali di Windows untuk membuat shortcut 'Grand POS Optima' di Desktop.</div>
                </button>
              </div>
            </div>

            {/* Opsi 3: Pengaturan Printer PC */}
            <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50 space-y-2">
              <div className="font-extrabold text-sm text-slate-900 flex items-center gap-2">
                <Printer size={16} className="text-slate-700" />
                Integrasi Printer Thermal PC
              </div>
              <ul className="list-disc list-inside space-y-1 text-slate-600">
                <li><strong>System Printer USB/Windows</strong>: Buka <em>Pengaturan &gt; Perangkat</em>, pilih mode <strong>Browser System Print</strong>. Ukuran struk otomatis disesuaikan untuk kertas thermal 80mm / 58mm.</li>
                <li><strong>Printer Network / Epson LAN</strong>: Pilih mode <strong>Epson LAN</strong> dan masukkan IP Address printer kasir.</li>
                <li><strong>Cetak Otomatis (Kiosk Mode)</strong>: Gunakan script <code>Buka-POS-KioskPrint.bat</code> agar struk langsung keluar tanpa perlu menekan tombol Print pada dialog Windows.</li>
              </ul>
            </div>
          </div>

          <DialogFooter>
            <button
              onClick={() => setGuideOpen(false)}
              className="tap px-4 py-2 rounded-xl bg-slate-900 text-white font-bold text-xs"
            >
              Tutup Panduan
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default PWAInstallButton;
