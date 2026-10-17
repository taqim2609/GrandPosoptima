# Peluncur Desktop Standalone, PWA & Printer - Grand Aceh Kuliner POS

Rencana implementasi untuk menjalankan aplikasi Grand Aceh Kuliner POS di komputer PC / Windows / Linux secara langsung tanpa antarmuka browser biasa (tanpa address bar dan tab browser), menggunakan kombinasi **Progressive Web App (PWA) Standalone** yang paling responsif, **Script Launcher Otomatis**, serta **Dukungan Printer Thermal PC**.

## User Review & Critical Decisions

> [!IMPORTANT]
> Berdasarkan jawaban konfirmasi dan pertanyaan Anda mengenai printer:
> 1. **Solusi Desktop**: Menggunakan PWA App Mode Standalone (jendela khusus tanpa tab & address bar) untuk performa paling cepat dan responsif.
> 2. **Script Otomatis**: Menyediakan script launcher otomatis (`.bat` untuk Windows & `.desktop` untuk Linux/Raspberry Pi) dan pembuat shortcut Desktop.
> 3. **Dukungan Printer di Desktop/PC**:
>    - **Windows / Linux System Driver**: Mendukung semua printer thermal USB/LPT/Driver Windows (Epson, Xprinter, POS-80, POS-58) dengan format cetak otomatis 80mm/58mm.
>    - **Mode Cetak Otomatis (Silent Kiosk Printing)**: Di dalam script `.bat`, disediakan opsi `--kiosk-printing` agar struk langsung tercetak tanpa perlu mengklik "Print" di dialog browser tiap kali transaksi lunas.
>    - **Printer LAN/Network & Bluetooth**: Mendukung printer jaringan Epson (ePOS SDK) dan Bluetooth ESC/POS.

---

## 1. Overview & Core Concept

- **Tujuan**: Memungkinkan kasir dan admin membuka aplikasi POS di PC/Komputer seperti aplikasi desktop native (tanpa elemen browser seperti URL bar, tab, bookmark bar) dan melakukan cetak struk kasir secara cepat dan otomatis.
- **Target Pengguna**: Kasir F&B/Retail dan Manager Toko di komputer PC Master/Kasir.
- **Nilai Utama**: Peluncuran 1-klik dari Desktop Windows, tampilan full-screen/standalone bersih, instalasi PWA mudah, serta cetak struk thermal otomatis ke printer USB/LAN/Bluetooth.

---

## 2. User Experience & Visual Design

- **Instalasi In-App PWA**:
  - Tombol "Install App Desktop" yang bersih di header/top-bar aplikasi.
  - Memicu dialog instalasi PWA native dari browser (Chrome/Edge/Brave).
  - Jika aplikasi sudah berjalan dalam mode PWA Standalone, tombol install otomatis tersembunyi.
- **Panduan Peluncur & Printer Desktop di Pengaturan**:
  - Menu khusus di **Pengaturan > Platform & Hardware** yang memberikan tautan download script launcher desktop (`Buka-POS-Desktop.bat`, `Buat-Shortcut-Desktop.bat`, `Buka-POS-KioskPrint.bat`).
  - Penjelasan pemilihan mode printer di **Pengaturan > Perangkat** (Mode System Print, Epson LAN, atau Bluetooth).
- **Tampilan App Mode**:
  - Jendela frameless standalone bersih dengan tema Grand Aceh Kuliner POS (Emerald / Slate).

---

## 3. Key Product Decisions & Trade-Offs

- **Keputusan 1: PWA Standalone + Silent Kiosk Printing**:
  - *Pendekatan*: PWA Standalone dengan peluncur Chrome/Edge App Mode + parameter `--kiosk-printing`.
  - *Alasan*: Menghasilkan respon sangat cepat, tidak perlu install driver pihak ketiga yang berat, dan struk dapat langsung terpotong/tercetak tanpa popup konfirmasi.
- **Keputusan 2: Kompatibilitas Printer Thermal Multiversi**:
  - *Pendekatan*: Menggunakan CSS Thermal Native `@page { size: 80mm auto; margin: 0; }` untuk Windows System Driver + raw ESC/POS via Epson LAN/Bluetooth + Sunmi InnerPrinter untuk Android.

---

## 4. Technical Architecture & Component Structure

```
┌──────────────────────────────────────────────────────────────────┐
│                   Aplikasi POS (React 19 / Vite)                 │
├──────────────────────────────────────────────────────────────────┤
│  ┌───────────────────────┐        ┌───────────────────────────┐  │
│  │ Hook usePWAInstall.js │ ─────► │ Component PWAInstallButton│  │
│  └───────────────────────┘        └───────────────────────────┘  │
│              │                                 │                 │
│              ▼                                 ▼                 │
│  ┌───────────────────────┐        ┌───────────────────────────┐  │
│  │ Manifest & SW (PWA)   │        │ SettingsPlatform & Header │  │
│  └───────────────────────┘        └───────────────────────────┘  │
│              │                                 │                 │
│              └─────────────────┬───────────────┘                 │
│                                │                                 │
│                                ▼                                 │
│                     Modul Printer (print.js / receipt.js)        │
│                     ├── System Driver (Windows 80mm/58mm)        │
│                     ├── Silent Kiosk Printing                    │
│                     ├── Epson LAN Network Printer                │
│                     └── Sunmi SDK (khusus Android APK)           │
└──────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌──────────────────────────────────────────────────────────────────┐
│              Script Launcher & Desktop Shortcut Generator        │
├──────────────────────────────────────────────────────────────────┤
│  • Buka-POS-Desktop.bat     (Peluncur Windows App Mode biasa)    │
│  • Buka-POS-KioskPrint.bat  (Peluncur Windows Cetak Otomatis)    │
│  • Buat-Shortcut-Desktop.bat (Pembuat Ikon Desktop Windows)      │
│  • Buka-POS-Linux.desktop   (Peluncur Linux / Raspberry Pi)      │
└──────────────────────────────────────────────────────────────────┘
```

---

## 5. Steps for Implementation

1. **Konfigurasi Web App Manifest & Service Worker**:
   - Perbarui `manifest.json` agar mendukung `'display': 'standalone'`, ikon lengkap (192x192, 512x512, maskable), dan `theme_color`.

2. **Membuat Custom Hook & Tombol In-App PWA Installer**:
   - Buat hook `src/hooks/usePWAInstall.js` untuk mendeteksi event `beforeinstallprompt` dan mode standalone.
   - Buat komponen `src/components/PWAInstallButton.jsx` dan pasang di header aplikasi POS serta modal panduan.

3. **Membuat Script Launcher & Shortcut Generator (Dengan Dukungan Printer)**:
   - `Buka-POS-Desktop.bat`: Membuka URL POS dalam App Mode biasa.
   - `Buka-POS-KioskPrint.bat`: Membuka POS dalam App Mode dengan `--kiosk-printing` untuk cetak struk langsung tanpa dialog.
   - `Buat-Shortcut-Desktop.bat`: Script pembuat file `.lnk` di Desktop Windows secara otomatis.
   - `Buka-POS-Linux.desktop`: Peluncur Linux/Raspberry Pi.

4. **Menambahkan Halaman / Modal Panduan Desktop & Printer**:
   - Tambahkan kartu panduan "Mode Desktop & Printer Thermal" di halaman `SettingsPlatform.jsx` dengan instruksi setting printer USB/LAN dan tombol download script launcher.

5. **Uji Coba & Verifikasi**:
   - Jalankan `compile_applet` untuk memastikan build frontend dan backend tidak ada error.
