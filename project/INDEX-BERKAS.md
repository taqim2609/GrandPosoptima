# Indeks Katalog Berkas — Grand Aceh Kuliner POS

> **Buku Besar Katalog Berkas Repositori**
> Terakhir diperbarui: `2026-10-15 15:14:45 WIB`
> Total Berkas Terindeks: **471 berkas**

Dokumen ini memuat daftar lengkap seluruh berkas di repositori beserta kategori dan fungsinya.
Setiap kali ada penambahan atau perubahan berkas, jalankan skrip berikut untuk memperbarui indeks:
```bash
python3 project/scripts/update_file_index.py
```

---

## Ringkasan Kategori Berkas

| Kategori | Jumlah Berkas | Keterangan |
| :--- | :---: | :--- |
| **Cloud Run & Server Root** | `6` | Modul cloud run & server root sistem POS |
| **Backend FastAPI & Data** | `8` | Modul backend fastapi & data sistem POS |
| **Frontend — Halaman UI** | `46` | Modul frontend — halaman ui sistem POS |
| **Frontend — Komponen UI** | `71` | Modul frontend — komponen ui sistem POS |
| **Frontend — State & Context** | `2` | Modul frontend — state & context sistem POS |
| **Frontend — Utility & Library** | `22` | Modul frontend — utility & library sistem POS |
| **Mobile Android & Sunmi Hardware** | `52` | Modul mobile android & sunmi hardware sistem POS |
| **Integrasi Hermes Agent** | `2` | Modul integrasi hermes agent sistem POS |
| **Testing & Verifikasi** | `8` | Modul testing & verifikasi sistem POS |
| **Planora Framework** | `48` | Modul planora framework sistem POS |
| **Dokumentasi Teknis** | `13` | Modul dokumentasi teknis sistem POS |
| **Automasi n8n & Workflow** | `3` | Modul automasi n8n & workflow sistem POS |
| **Deployment & DevOps** | `61` | Modul deployment & devops sistem POS |
| **Agent Skill System** | `51` | Modul agent skill system sistem POS |
| **Berkas Pendukung / Konfigurasi** | `78` | Modul berkas pendukung / konfigurasi sistem POS |

---

## Daftar Lengkap Berkas Menurut Modul

### 📁 Cloud Run & Server Root (6 berkas)

| Jalur Berkas (`Path`) | Deskripsi Fungsi |
| :--- | :--- |
| `build.js` | Skrip build dan packaging bundle statis, OTA ZIP, dan sanitasi index.html. |
| `index.html` | Entrypoint HTML utama untuk web build dengan polyfill WebView Android 7 lama. |
| `metadata.json` | Metadata manifes AI Studio (nama aplikasi, deskripsi, capabilities server-side). |
| `package.json` | Konfigurasi dependensi Node.js root server. |
| `routes/allMissingRoutes.js` | Berkas konfigurasi/data: allMissingRoutes.js. |
| `server.js` | Server utama Express.js Node.js (Cloud Run & development) melayani API dan fallback SPA. |

### 📁 Backend FastAPI & Data (8 berkas)

| Jalur Berkas (`Path`) | Deskripsi Fungsi |
| :--- | :--- |
| `project/backend/.dockerignore` | Berkas konfigurasi/data: .dockerignore. |
| `project/backend/.env.docker.example` | Berkas konfigurasi/data: .env.docker.example. |
| `project/backend/Dockerfile` | Definisi kontainer Docker backend Python. |
| `project/backend/create_user.py` | Utilitas CLI pembuatan akun pengguna kasir/admin. |
| `project/backend/hermes_bridge.py` | Jembatan WhatsApp POS <-> Hermes gateway (HMAC Generic V2 & outbox idempoten). |
| `project/backend/pytest.ini` | Berkas konfigurasi/data: pytest.ini. |
| `project/backend/requirements.txt` | Daftar pustaka Python backend (FastAPI, Motor, Uvicorn, bcrypt, jwt). |
| `project/backend/server.py` | Backend FastAPI (Python/Motor) utama melayani semua endpoint POS (/api). |

### 📁 Frontend — Halaman UI (46 berkas)

| Jalur Berkas (`Path`) | Deskripsi Fungsi |
| :--- | :--- |
| `project/frontend/src/pages/AppVersi.jsx` | Halaman antarmuka pengguna untuk modul AppVersi. |
| `project/frontend/src/pages/ArticlesAdmin.jsx` | Halaman antarmuka pengguna untuk modul ArticlesAdmin. |
| `project/frontend/src/pages/AssistantAI.jsx` | Antarmuka obrolan cerdas Asisten AI POS dengan dukungan multi-model. |
| `project/frontend/src/pages/Cash.jsx` | Pencatatan mutasi kas masuk dan kas keluar operasional. |
| `project/frontend/src/pages/Catalog.jsx` | Halaman antarmuka pengguna untuk modul Catalog. |
| `project/frontend/src/pages/Categories.jsx` | Manajemen kategori makanan, minuman, dan snack retail. |
| `project/frontend/src/pages/Coupons.jsx` | Halaman antarmuka pengguna untuk modul Coupons. |
| `project/frontend/src/pages/Dashboard.jsx` | Dashboard ringkasan omzet penjualan, grafik transaksi, dan produk terlaris. |
| `project/frontend/src/pages/DeviceSettings.jsx` | Halaman antarmuka pengguna untuk modul DeviceSettings. |
| `project/frontend/src/pages/Diagnostik.jsx` | Halaman antarmuka pengguna untuk modul Diagnostik. |
| `project/frontend/src/pages/Ingredients.jsx` | Manajemen inventaris bahan baku dapur dan peringatan stok menipis. |
| `project/frontend/src/pages/Integritas.jsx` | Halaman antarmuka pengguna untuk modul Integritas. |
| `project/frontend/src/pages/Inventory.jsx` | Halaman antarmuka pengguna untuk modul Inventory. |
| `project/frontend/src/pages/LandingPage.jsx` | Halaman antarmuka pengguna untuk modul LandingPage. |
| `project/frontend/src/pages/Login.jsx` | Halaman antarmuka pengguna untuk modul Login. |
| `project/frontend/src/pages/Members.jsx` | Manajemen data pelanggan setia, perolehan poin, dan riwayat belanja. |
| `project/frontend/src/pages/Orders.jsx` | Daftar pesanan aktif, riwayat transaksi, dan cetak ulang struk. |
| `project/frontend/src/pages/POS.jsx` | Layar transaksi kasir hybrid F&B (dine-in/meja, take-away) dan Retail. |
| `project/frontend/src/pages/Products.jsx` | Manajemen katalog produk F&B dan retail, stok, dan harga. |
| `project/frontend/src/pages/Promos.jsx` | Halaman antarmuka pengguna untuk modul Promos. |
| `project/frontend/src/pages/PromosCoupons.jsx` | Manajemen kode kupon diskon dan promosi musiman. |
| `project/frontend/src/pages/Recipes.jsx` | Manajemen formula resep F&B dan perhitungan HPP otomatis. |
| `project/frontend/src/pages/Reports.jsx` | Halaman antarmuka pengguna untuk modul Reports. |
| `project/frontend/src/pages/Reservations.jsx` | Manajemen reservasi meja makan dan integrasi reservasi via WhatsApp. |
| `project/frontend/src/pages/RoleBasedAccess.jsx` | Halaman antarmuka pengguna untuk modul RoleBasedAccess. |
| `project/frontend/src/pages/Settings.jsx` | Halaman antarmuka pengguna untuk modul Settings. |
| `project/frontend/src/pages/SettingsAI.jsx` | Pengaturan penyedia AI (Gemini AI & OpenAI/Hermes Gateway VPS). |
| `project/frontend/src/pages/SettingsBusiness.jsx` | Pengaturan identitas outlet, alamat, logo, dan footer struk belanja. |
| `project/frontend/src/pages/SettingsCustomWidgets.jsx` | Halaman antarmuka pengguna untuk modul SettingsCustomWidgets. |
| `project/frontend/src/pages/SettingsData.jsx` | Halaman antarmuka pengguna untuk modul SettingsData. |
| `project/frontend/src/pages/SettingsInstaller.jsx` | Halaman antarmuka pengguna untuk modul SettingsInstaller. |
| `project/frontend/src/pages/SettingsIntegrations.jsx` | Halaman antarmuka pengguna untuk modul SettingsIntegrations. |
| `project/frontend/src/pages/SettingsPlatform.jsx` | Halaman antarmuka pengguna untuk modul SettingsPlatform. |
| `project/frontend/src/pages/SettingsReport.jsx` | Halaman antarmuka pengguna untuk modul SettingsReport. |
| `project/frontend/src/pages/SettingsRoles.jsx` | Halaman antarmuka pengguna untuk modul SettingsRoles. |
| `project/frontend/src/pages/SettingsUI.jsx` | Halaman antarmuka pengguna untuk modul SettingsUI. |
| `project/frontend/src/pages/SettingsWATemplates.jsx` | Halaman antarmuka pengguna untuk modul SettingsWATemplates. |
| `project/frontend/src/pages/Shift.jsx` | Layar buka/tutup shift kasir, rekonsiliasi kas, dan bagi hasil vendor. |
| `project/frontend/src/pages/SystemHealth.jsx` | Panel diagnostik kesehatan sistem, status server, dan sinkronisasi. |
| `project/frontend/src/pages/Tables.jsx` | Manajemen tata letak meja makan, status terisi/kosong, dan pindah meja. |
| `project/frontend/src/pages/Users.jsx` | Manajemen akun pengguna kasir, admin, dan hak akses. |
| `project/frontend/src/pages/VendorSettlement.jsx` | Manajemen konsinyasi titipan vendor dan pembayaran bagi hasil. |
| `project/frontend/src/pages/Vendors.jsx` | Daftar data mitra vendor produk titipan dan persentase bagi hasil. |
| `project/frontend/src/pages/VoidRefund.jsx` | Manajemen pembatalan pesanan (void/refund) dengan otorisasi PIN. |
| `project/frontend/src/pages/WhatsApp.jsx` | Dasbor manajemen WhatsApp Gateway, status instance, dan riwayat pesan. |
| `project/frontend/src/pages/WhatsAppReport.jsx` | Laporan pengiriman pesan otomatis dan log notifikasi WhatsApp. |

### 📁 Frontend — Komponen UI (71 berkas)

| Jalur Berkas (`Path`) | Deskripsi Fungsi |
| :--- | :--- |
| `project/frontend/src/components/AiIngredientRecommendationModal.jsx` | Komponen visual antarmuka pengguna: AiIngredientRecommendationModal. |
| `project/frontend/src/components/ErrorBoundary.jsx` | Komponen visual antarmuka pengguna: ErrorBoundary. |
| `project/frontend/src/components/ForceChangePassword.jsx` | Komponen visual antarmuka pengguna: ForceChangePassword. |
| `project/frontend/src/components/GDriveBackupManager.jsx` | Komponen visual antarmuka pengguna: GDriveBackupManager. |
| `project/frontend/src/components/GlobalErrorDiagnosticPanel.jsx` | Komponen visual antarmuka pengguna: GlobalErrorDiagnosticPanel. |
| `project/frontend/src/components/HybridSyncDiagnosticPanel.jsx` | Komponen visual antarmuka pengguna: HybridSyncDiagnosticPanel. |
| `project/frontend/src/components/Layout.jsx` | Komponen visual antarmuka pengguna: Layout. |
| `project/frontend/src/components/LazyProductImage.jsx` | Komponen visual antarmuka pengguna: LazyProductImage. |
| `project/frontend/src/components/LoginServerSelector.jsx` | Komponen visual antarmuka pengguna: LoginServerSelector. |
| `project/frontend/src/components/OtaIndicator.jsx` | Komponen visual antarmuka pengguna: OtaIndicator. |
| `project/frontend/src/components/PosAiChatWidget.jsx` | Komponen visual antarmuka pengguna: PosAiChatWidget. |
| `project/frontend/src/components/ProtectedRoute.jsx` | Komponen visual antarmuka pengguna: ProtectedRoute. |
| `project/frontend/src/components/ReceiptModal.jsx` | Komponen visual antarmuka pengguna: ReceiptModal. |
| `project/frontend/src/components/ReceiptPaper.jsx` | Komponen visual antarmuka pengguna: ReceiptPaper. |
| `project/frontend/src/components/ShiftClosingReportView.jsx` | Komponen visual antarmuka pengguna: ShiftClosingReportView. |
| `project/frontend/src/components/SubTabs.jsx` | Komponen visual antarmuka pengguna: SubTabs. |
| `project/frontend/src/components/SystemHealthPanel.jsx` | Komponen visual antarmuka pengguna: SystemHealthPanel. |
| `project/frontend/src/components/TailscaleDashboard.jsx` | Komponen visual antarmuka pengguna: TailscaleDashboard. |
| `project/frontend/src/components/ThreeServerMatrix.jsx` | Komponen visual antarmuka pengguna: ThreeServerMatrix. |
| `project/frontend/src/components/VisualSyncStatus.jsx` | Komponen visual antarmuka pengguna: VisualSyncStatus. |
| `project/frontend/src/components/VoidDialog.jsx` | Komponen visual antarmuka pengguna: VoidDialog. |
| `project/frontend/src/components/VpsConnectionAnalyticsCard.jsx` | Komponen visual antarmuka pengguna: VpsConnectionAnalyticsCard. |
| `project/frontend/src/components/WhatsAppGatewayCard.jsx` | Komponen visual antarmuka pengguna: WhatsAppGatewayCard. |
| `project/frontend/src/components/WidgetKustom.jsx` | Komponen visual antarmuka pengguna: WidgetKustom. |
| `project/frontend/src/components/dashboard/DashboardCharts.jsx` | Komponen visual antarmuka pengguna: DashboardCharts. |
| `project/frontend/src/components/ui/accordion.jsx` | Komponen visual antarmuka pengguna: accordion. |
| `project/frontend/src/components/ui/alert-dialog.jsx` | Komponen visual antarmuka pengguna: alert-dialog. |
| `project/frontend/src/components/ui/alert.jsx` | Komponen visual antarmuka pengguna: alert. |
| `project/frontend/src/components/ui/aspect-ratio.jsx` | Komponen visual antarmuka pengguna: aspect-ratio. |
| `project/frontend/src/components/ui/avatar.jsx` | Komponen visual antarmuka pengguna: avatar. |
| `project/frontend/src/components/ui/badge.jsx` | Komponen visual antarmuka pengguna: badge. |
| `project/frontend/src/components/ui/breadcrumb.jsx` | Komponen visual antarmuka pengguna: breadcrumb. |
| `project/frontend/src/components/ui/button.jsx` | Komponen visual antarmuka pengguna: button. |
| `project/frontend/src/components/ui/calendar.jsx` | Komponen visual antarmuka pengguna: calendar. |
| `project/frontend/src/components/ui/card.jsx` | Komponen visual antarmuka pengguna: card. |
| `project/frontend/src/components/ui/carousel.jsx` | Komponen visual antarmuka pengguna: carousel. |
| `project/frontend/src/components/ui/checkbox.jsx` | Komponen visual antarmuka pengguna: checkbox. |
| `project/frontend/src/components/ui/collapsible.jsx` | Komponen visual antarmuka pengguna: collapsible. |
| `project/frontend/src/components/ui/command.jsx` | Komponen visual antarmuka pengguna: command. |
| `project/frontend/src/components/ui/context-menu.jsx` | Komponen visual antarmuka pengguna: context-menu. |
| `project/frontend/src/components/ui/dialog.jsx` | Komponen visual antarmuka pengguna: dialog. |
| `project/frontend/src/components/ui/drawer.jsx` | Komponen visual antarmuka pengguna: drawer. |
| `project/frontend/src/components/ui/dropdown-menu.jsx` | Komponen visual antarmuka pengguna: dropdown-menu. |
| `project/frontend/src/components/ui/form.jsx` | Komponen visual antarmuka pengguna: form. |
| `project/frontend/src/components/ui/hover-card.jsx` | Komponen visual antarmuka pengguna: hover-card. |
| `project/frontend/src/components/ui/input-otp.jsx` | Komponen visual antarmuka pengguna: input-otp. |
| `project/frontend/src/components/ui/input.jsx` | Komponen visual antarmuka pengguna: input. |
| `project/frontend/src/components/ui/label.jsx` | Komponen visual antarmuka pengguna: label. |
| `project/frontend/src/components/ui/menubar.jsx` | Komponen visual antarmuka pengguna: menubar. |
| `project/frontend/src/components/ui/navigation-menu.jsx` | Komponen visual antarmuka pengguna: navigation-menu. |
| `project/frontend/src/components/ui/pagination.jsx` | Komponen visual antarmuka pengguna: pagination. |
| `project/frontend/src/components/ui/popover.jsx` | Komponen visual antarmuka pengguna: popover. |
| `project/frontend/src/components/ui/progress.jsx` | Komponen visual antarmuka pengguna: progress. |
| `project/frontend/src/components/ui/radio-group.jsx` | Komponen visual antarmuka pengguna: radio-group. |
| `project/frontend/src/components/ui/resizable.jsx` | Komponen visual antarmuka pengguna: resizable. |
| `project/frontend/src/components/ui/scroll-area.jsx` | Komponen visual antarmuka pengguna: scroll-area. |
| `project/frontend/src/components/ui/select.jsx` | Komponen visual antarmuka pengguna: select. |
| `project/frontend/src/components/ui/separator.jsx` | Komponen visual antarmuka pengguna: separator. |
| `project/frontend/src/components/ui/sheet.jsx` | Komponen visual antarmuka pengguna: sheet. |
| `project/frontend/src/components/ui/skeleton.jsx` | Komponen visual antarmuka pengguna: skeleton. |
| `project/frontend/src/components/ui/slider.jsx` | Komponen visual antarmuka pengguna: slider. |
| `project/frontend/src/components/ui/sonner.jsx` | Komponen visual antarmuka pengguna: sonner. |
| `project/frontend/src/components/ui/switch.jsx` | Komponen visual antarmuka pengguna: switch. |
| `project/frontend/src/components/ui/table.jsx` | Komponen visual antarmuka pengguna: table. |
| `project/frontend/src/components/ui/tabs.jsx` | Komponen visual antarmuka pengguna: tabs. |
| `project/frontend/src/components/ui/textarea.jsx` | Komponen visual antarmuka pengguna: textarea. |
| `project/frontend/src/components/ui/toast.jsx` | Komponen visual antarmuka pengguna: toast. |
| `project/frontend/src/components/ui/toaster.jsx` | Komponen visual antarmuka pengguna: toaster. |
| `project/frontend/src/components/ui/toggle-group.jsx` | Komponen visual antarmuka pengguna: toggle-group. |
| `project/frontend/src/components/ui/toggle.jsx` | Komponen visual antarmuka pengguna: toggle. |
| `project/frontend/src/components/ui/tooltip.jsx` | Komponen visual antarmuka pengguna: tooltip. |

### 📁 Frontend — State & Context (2 berkas)

| Jalur Berkas (`Path`) | Deskripsi Fungsi |
| :--- | :--- |
| `project/frontend/src/context/AuthContext.jsx` | Konteks autentikasi pengguna, sesi token JWT, dan login PIN. |
| `project/frontend/src/context/OfflineContext.jsx` | Konteks sinkronisasi offline-first IndexedDB idempoten (JANGAN DI-REFACTOR). |

### 📁 Frontend — Utility & Library (22 berkas)

| Jalur Berkas (`Path`) | Deskripsi Fungsi |
| :--- | :--- |
| `project/frontend/src/lib/api.js` | Klien HTTP Axios dengan interceptor token autentikasi otomatis. |
| `project/frontend/src/lib/bluetooth.js` | Berkas konfigurasi/data: bluetooth.js. |
| `project/frontend/src/lib/business.js` | Berkas konfigurasi/data: business.js. |
| `project/frontend/src/lib/customWidgets.js` | Berkas konfigurasi/data: customWidgets.js. |
| `project/frontend/src/lib/device.js` | Berkas konfigurasi/data: device.js. |
| `project/frontend/src/lib/diag.js` | Berkas konfigurasi/data: diag.js. |
| `project/frontend/src/lib/features.js` | Berkas konfigurasi/data: features.js. |
| `project/frontend/src/lib/firebase.js` | Berkas konfigurasi/data: firebase.js. |
| `project/frontend/src/lib/format.js` | Utilitas pemformatan mata uang Rupiah dan tanggal WIB. |
| `project/frontend/src/lib/gdrive.js` | Berkas konfigurasi/data: gdrive.js. |
| `project/frontend/src/lib/installers.js` | Berkas konfigurasi/data: installers.js. |
| `project/frontend/src/lib/navItems.js` | Berkas konfigurasi/data: navItems.js. |
| `project/frontend/src/lib/offlineQueue.js` | Antrean transaksi luring berbasis IndexedDB yang sinkron saat online. |
| `project/frontend/src/lib/offlineQueue.test.js` | Berkas konfigurasi/data: offlineQueue.test.js. |
| `project/frontend/src/lib/ota.js` | Utilitas pengecekan pembaruan Capgo OTA langsung di perangkat kasir. |
| `project/frontend/src/lib/platform.js` | Berkas konfigurasi/data: platform.js. |
| `project/frontend/src/lib/print.js` | Bridge pencetakan printer thermal Bluetooth dan Sunmi native. |
| `project/frontend/src/lib/rbac.js` | Utilitas verifikasi hak akses berbasis peran (RBAC). |
| `project/frontend/src/lib/receipt.js` | Generator layout cetak struk thermal 58mm/80mm dan perintah openDrawer. |
| `project/frontend/src/lib/ui.js` | Berkas konfigurasi/data: ui.js. |
| `project/frontend/src/lib/utils.js` | Berkas konfigurasi/data: utils.js. |
| `project/frontend/src/lib/versions.js` | Berkas konfigurasi/data: versions.js. |

### 📁 Mobile Android & Sunmi Hardware (52 berkas)

| Jalur Berkas (`Path`) | Deskripsi Fungsi |
| :--- | :--- |
| `apk/Grand-Aceh-Kuliner-POS-v2.10.apk` | Paket instalasi Android release untuk perangkat Sunmi T2 / tablet POS. |
| `project/frontend/android/app/build.gradle` | Berkas konfigurasi/data: build.gradle. |
| `project/frontend/android/app/capacitor.build.gradle` | Berkas konfigurasi/data: capacitor.build.gradle. |
| `project/frontend/android/app/proguard-rules.pro` | Berkas konfigurasi/data: proguard-rules.pro. |
| `project/frontend/android/app/src/androidTest/java/com/getcapacitor/myapp/ExampleInstrumentedTest.java` | Berkas konfigurasi/data: ExampleInstrumentedTest.java. |
| `project/frontend/android/app/src/main/AndroidManifest.xml` | Berkas konfigurasi/data: AndroidManifest.xml. |
| `project/frontend/android/app/src/main/java/host/emergent/hybridposaceh/MainActivity.java` | Bridge Android Java untuk Sunmi SDK, printer thermal, dan pemicu laci kasir. |
| `project/frontend/android/app/src/main/res/drawable-land-hdpi/splash.png` | Berkas konfigurasi/data: splash.png. |
| `project/frontend/android/app/src/main/res/drawable-land-mdpi/splash.png` | Berkas konfigurasi/data: splash.png. |
| `project/frontend/android/app/src/main/res/drawable-land-xhdpi/splash.png` | Berkas konfigurasi/data: splash.png. |
| `project/frontend/android/app/src/main/res/drawable-land-xxhdpi/splash.png` | Berkas konfigurasi/data: splash.png. |
| `project/frontend/android/app/src/main/res/drawable-land-xxxhdpi/splash.png` | Berkas konfigurasi/data: splash.png. |
| `project/frontend/android/app/src/main/res/drawable-port-hdpi/splash.png` | Berkas konfigurasi/data: splash.png. |
| `project/frontend/android/app/src/main/res/drawable-port-mdpi/splash.png` | Berkas konfigurasi/data: splash.png. |
| `project/frontend/android/app/src/main/res/drawable-port-xhdpi/splash.png` | Berkas konfigurasi/data: splash.png. |
| `project/frontend/android/app/src/main/res/drawable-port-xxhdpi/splash.png` | Berkas konfigurasi/data: splash.png. |
| `project/frontend/android/app/src/main/res/drawable-port-xxxhdpi/splash.png` | Berkas konfigurasi/data: splash.png. |
| `project/frontend/android/app/src/main/res/drawable-v24/ic_launcher_foreground.xml` | Berkas konfigurasi/data: ic_launcher_foreground.xml. |
| `project/frontend/android/app/src/main/res/drawable/ic_launcher_background.xml` | Berkas konfigurasi/data: ic_launcher_background.xml. |
| `project/frontend/android/app/src/main/res/drawable/splash.png` | Berkas konfigurasi/data: splash.png. |
| `project/frontend/android/app/src/main/res/layout/activity_main.xml` | Berkas konfigurasi/data: activity_main.xml. |
| `project/frontend/android/app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml` | Berkas konfigurasi/data: ic_launcher.xml. |
| `project/frontend/android/app/src/main/res/mipmap-anydpi-v26/ic_launcher_round.xml` | Berkas konfigurasi/data: ic_launcher_round.xml. |
| `project/frontend/android/app/src/main/res/mipmap-hdpi/ic_launcher.png` | Berkas konfigurasi/data: ic_launcher.png. |
| `project/frontend/android/app/src/main/res/mipmap-hdpi/ic_launcher_foreground.png` | Berkas konfigurasi/data: ic_launcher_foreground.png. |
| `project/frontend/android/app/src/main/res/mipmap-hdpi/ic_launcher_round.png` | Berkas konfigurasi/data: ic_launcher_round.png. |
| `project/frontend/android/app/src/main/res/mipmap-mdpi/ic_launcher.png` | Berkas konfigurasi/data: ic_launcher.png. |
| `project/frontend/android/app/src/main/res/mipmap-mdpi/ic_launcher_foreground.png` | Berkas konfigurasi/data: ic_launcher_foreground.png. |
| `project/frontend/android/app/src/main/res/mipmap-mdpi/ic_launcher_round.png` | Berkas konfigurasi/data: ic_launcher_round.png. |
| `project/frontend/android/app/src/main/res/mipmap-xhdpi/ic_launcher.png` | Berkas konfigurasi/data: ic_launcher.png. |
| `project/frontend/android/app/src/main/res/mipmap-xhdpi/ic_launcher_foreground.png` | Berkas konfigurasi/data: ic_launcher_foreground.png. |
| `project/frontend/android/app/src/main/res/mipmap-xhdpi/ic_launcher_round.png` | Berkas konfigurasi/data: ic_launcher_round.png. |
| `project/frontend/android/app/src/main/res/mipmap-xxhdpi/ic_launcher.png` | Berkas konfigurasi/data: ic_launcher.png. |
| `project/frontend/android/app/src/main/res/mipmap-xxhdpi/ic_launcher_foreground.png` | Berkas konfigurasi/data: ic_launcher_foreground.png. |
| `project/frontend/android/app/src/main/res/mipmap-xxhdpi/ic_launcher_round.png` | Berkas konfigurasi/data: ic_launcher_round.png. |
| `project/frontend/android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png` | Berkas konfigurasi/data: ic_launcher.png. |
| `project/frontend/android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_foreground.png` | Berkas konfigurasi/data: ic_launcher_foreground.png. |
| `project/frontend/android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_round.png` | Berkas konfigurasi/data: ic_launcher_round.png. |
| `project/frontend/android/app/src/main/res/values/ic_launcher_background.xml` | Berkas konfigurasi/data: ic_launcher_background.xml. |
| `project/frontend/android/app/src/main/res/values/strings.xml` | Berkas konfigurasi/data: strings.xml. |
| `project/frontend/android/app/src/main/res/values/styles.xml` | Berkas konfigurasi/data: styles.xml. |
| `project/frontend/android/app/src/main/res/xml/file_paths.xml` | Berkas konfigurasi/data: file_paths.xml. |
| `project/frontend/android/app/src/main/res/xml/network_security_config.xml` | Berkas konfigurasi/data: network_security_config.xml. |
| `project/frontend/android/app/src/test/java/com/getcapacitor/myapp/ExampleUnitTest.java` | Berkas konfigurasi/data: ExampleUnitTest.java. |
| `project/frontend/android/build.gradle` | Berkas konfigurasi/data: build.gradle. |
| `project/frontend/android/capacitor.settings.gradle` | Berkas konfigurasi/data: capacitor.settings.gradle. |
| `project/frontend/android/gradle.properties` | Berkas konfigurasi/data: gradle.properties. |
| `project/frontend/android/gradle/wrapper/gradle-wrapper.properties` | Berkas konfigurasi/data: gradle-wrapper.properties. |
| `project/frontend/android/gradlew` | Berkas konfigurasi/data: gradlew. |
| `project/frontend/android/gradlew.bat` | Berkas konfigurasi/data: gradlew.bat. |
| `project/frontend/android/settings.gradle` | Berkas konfigurasi/data: settings.gradle. |
| `project/frontend/android/variables.gradle` | Berkas konfigurasi/data: variables.gradle. |

### 📁 Integrasi Hermes Agent (2 berkas)

| Jalur Berkas (`Path`) | Deskripsi Fungsi |
| :--- | :--- |
| `project/hermes-integration/grandpos-wa-inbound/__init__.py` | Plugin Hermes inbound hook pre_gateway_dispatch untuk meneruskan WA ke POS. |
| `project/hermes-integration/grandpos-wa-inbound/plugin.yaml` | Manifes registrasi plugin Hermes grandpos-wa-inbound. |

### 📁 Testing & Verifikasi (8 berkas)

| Jalur Berkas (`Path`) | Deskripsi Fungsi |
| :--- | :--- |
| `project/tests/__init__.py` | Skrip pengujian otomatis: __init__.py. |
| `project/tests/test_hermes_bridge.py` | Pengujian unit logika jembatan outbox Hermes (22 tes). |
| `project/tests/test_hermes_plugin_inbound.py` | Pengujian unit plugin hook masuk Hermes tanpa dependensi eksternal (8 tes). |
| `project/tests/test_hermes_wa_e2e.py` | Pengujian end-to-end penandatanganan HMAC V2 dan render webhook (5 tes). |
| `project/tests/test_report_calculations.py` | Skrip pengujian otomatis: test_report_calculations.py. |
| `project/tests/test_wa_outbox_sync.py` | Skrip pengujian otomatis: test_wa_outbox_sync.py. |
| `project/tests/test_wa_provider_migration.py` | Pengujian migrasi provider legacy (wacloud/evolution) ke hermes (3 tes). |
| `project/tests/test_wa_status_security.py` | Skrip pengujian otomatis: test_wa_status_security.py. |

### 📁 Planora Framework (48 berkas)

| Jalur Berkas (`Path`) | Deskripsi Fungsi |
| :--- | :--- |
| `.planora/DX/README.md` | Dokumen spesifikasi Planora (README.md). |
| `.planora/DX/api-ergonomics.md` | Dokumen spesifikasi Planora (api-ergonomics.md). |
| `.planora/DX/authentication-experience.md` | Dokumen spesifikasi Planora (authentication-experience.md). |
| `.planora/DX/compatibility-and-versioning.md` | Dokumen spesifikasi Planora (compatibility-and-versioning.md). |
| `.planora/DX/documentation-standards.md` | Dokumen spesifikasi Planora (documentation-standards.md). |
| `.planora/DX/errors-and-recovery.md` | Dokumen spesifikasi Planora (errors-and-recovery.md). |
| `.planora/DX/experience-principles.md` | Dokumen spesifikasi Planora (experience-principles.md). |
| `.planora/DX/observability-and-support.md` | Dokumen spesifikasi Planora (observability-and-support.md). |
| `.planora/DX/quickstart.md` | Panduan setup cepat dan alur pengembang. |
| `.planora/DX/sandbox-and-testing.md` | Dokumen spesifikasi Planora (sandbox-and-testing.md). |
| `.planora/DX/sdk-and-cli-guidelines.md` | Dokumen spesifikasi Planora (sdk-and-cli-guidelines.md). |
| `.planora/EXECUTION/README.md` | Dokumen spesifikasi Planora (README.md). |
| `.planora/EXECUTION/TODO.md` | Buku besar pelacakan tugas hidup (*live TODO ledger*). |
| `.planora/EXECUTION/feature-order.md` | Dokumen spesifikasi Planora (feature-order.md). |
| `.planora/EXECUTION/phases/phase-00-decisions.md` | Dokumen spesifikasi Planora (phase-00-decisions.md). |
| `.planora/EXECUTION/phases/phase-01-core-pos.md` | Dokumen spesifikasi Planora (phase-01-core-pos.md). |
| `.planora/EXECUTION/phases/phase-02-backlog.md` | Dokumen spesifikasi Planora (phase-02-backlog.md). |
| `.planora/EXECUTION/release-readiness.md` | Dokumen spesifikasi Planora (release-readiness.md). |
| `.planora/PRD/PRD.md` | Spesifikasi kebutuhan produk utama Grand Aceh Kuliner POS. |
| `.planora/PRD/README.md` | Dokumen spesifikasi Planora (README.md). |
| `.planora/PRD/asumsi-dan-pertanyaan.md` | Dokumen spesifikasi Planora (asumsi-dan-pertanyaan.md). |
| `.planora/PRD/fitur/hardware-sunmi.md` | Dokumen spesifikasi Planora (hardware-sunmi.md). |
| `.planora/PRD/fitur/keamanan-login.md` | Dokumen spesifikasi Planora (keamanan-login.md). |
| `.planora/PRD/fitur/landing-page-dan-reservasi.md` | Dokumen spesifikasi Planora (landing-page-dan-reservasi.md). |
| `.planora/PRD/fitur/manajemen-meja.md` | Dokumen spesifikasi Planora (manajemen-meja.md). |
| `.planora/PRD/fitur/otomasi-ai-whatsapp.md` | Dokumen spesifikasi Planora (otomasi-ai-whatsapp.md). |
| `.planora/PRD/fitur/pos-kasir.md` | Dokumen spesifikasi Planora (pos-kasir.md). |
| `.planora/PRD/fitur/shift-kasir.md` | Dokumen spesifikasi Planora (shift-kasir.md). |
| `.planora/PRD/fitur/titipan-vendor.md` | Dokumen spesifikasi Planora (titipan-vendor.md). |
| `.planora/PRD/metrik-keberhasilan.md` | Dokumen spesifikasi Planora (metrik-keberhasilan.md). |
| `.planora/PRD/model-data.md` | Dokumen spesifikasi Planora (model-data.md). |
| `.planora/PRD/non-functional-requirements.md` | Dokumen spesifikasi Planora (non-functional-requirements.md). |
| `.planora/PRD/roadmap.md` | Dokumen spesifikasi Planora (roadmap.md). |
| `.planora/README.md` | Dokumen spesifikasi Planora (README.md). |
| `.planora/UI/README.md` | Dokumen spesifikasi Planora (README.md). |
| `.planora/UI/accessibility.md` | Dokumen spesifikasi Planora (accessibility.md). |
| `.planora/UI/components/README.md` | Dokumen spesifikasi Planora (README.md). |
| `.planora/UI/components/tombol-input.md` | Dokumen spesifikasi Planora (tombol-input.md). |
| `.planora/UI/content-guidelines.md` | Dokumen spesifikasi Planora (content-guidelines.md). |
| `.planora/UI/design-direction.md` | Panduan arah desain UI POS layar sentuh dan komponen. |
| `.planora/UI/foundations/README.md` | Dokumen spesifikasi Planora (README.md). |
| `.planora/UI/foundations/warna-tipografi.md` | Dokumen spesifikasi Planora (warna-tipografi.md). |
| `.planora/UI/patterns/README.md` | Dokumen spesifikasi Planora (README.md). |
| `.planora/UI/patterns/dialog-bayar.md` | Dokumen spesifikasi Planora (dialog-bayar.md). |
| `.planora/UI/screens/landing-page.md` | Dokumen spesifikasi Planora (landing-page.md). |
| `.planora/UI/screens/pos-kasir.md` | Dokumen spesifikasi Planora (pos-kasir.md). |
| `.planora/UI/screens/screen-inventory.md` | Dokumen spesifikasi Planora (screen-inventory.md). |
| `.planora/manifest.json` | Manifes status dan daftar berkas paket Planora. |

### 📁 Dokumentasi Teknis (13 berkas)

| Jalur Berkas (`Path`) | Deskripsi Fungsi |
| :--- | :--- |
| `project/docs/ANALISA-DB-WINDOWS-PI.md` | Dokumen acuan teknis operasional: ANALISA-DB-WINDOWS-PI.md. |
| `project/docs/ANALISIS-FITUR-PRIORITAS.md` | Dokumen acuan teknis operasional: ANALISIS-FITUR-PRIORITAS.md. |
| `project/docs/INDEKS-DATABASE.md` | Dokumen acuan teknis operasional: INDEKS-DATABASE.md. |
| `project/docs/INTEGRASI-NETZME.md` | Dokumen acuan teknis operasional: INTEGRASI-NETZME.md. |
| `project/docs/PANDUAN-AKUN-CLI.md` | Dokumen acuan teknis operasional: PANDUAN-AKUN-CLI.md. |
| `project/docs/PANDUAN-BUILD-PI.md` | Dokumen acuan teknis operasional: PANDUAN-BUILD-PI.md. |
| `project/docs/PANDUAN-INTEGRITAS.md` | Dokumen acuan teknis operasional: PANDUAN-INTEGRITAS.md. |
| `project/docs/PANDUAN-KATEGORI-BAHAN.md` | Dokumen acuan teknis operasional: PANDUAN-KATEGORI-BAHAN.md. |
| `project/docs/PANDUAN-SHIFT-HARIAN.md` | Dokumen acuan teknis operasional: PANDUAN-SHIFT-HARIAN.md. |
| `project/docs/PANDUAN-WHATSAPP-HERMES.md` | Dokumen acuan teknis operasional: PANDUAN-WHATSAPP-HERMES.md. |
| `project/docs/PANDUAN-WORKER-UVICORN.md` | Dokumen acuan teknis operasional: PANDUAN-WORKER-UVICORN.md. |
| `project/docs/RANCANGAN-VOID-PESANAN.md` | Dokumen acuan teknis operasional: RANCANGAN-VOID-PESANAN.md. |
| `project/docs/RANCANGAN-WINDOWS-UTAMA-PI-CADANGAN.md` | Dokumen acuan teknis operasional: RANCANGAN-WINDOWS-UTAMA-PI-CADANGAN.md. |

### 📁 Automasi n8n & Workflow (3 berkas)

| Jalur Berkas (`Path`) | Deskripsi Fungsi |
| :--- | :--- |
| `project/n8n-workflows/1-notifikasi-pesanan-whatsapp.json` | Workflow automasi alur kerja n8n: 1-notifikasi-pesanan-whatsapp.json. |
| `project/n8n-workflows/2-peringatan-stok-menipis.json` | Workflow automasi alur kerja n8n: 2-peringatan-stok-menipis.json. |
| `project/n8n-workflows/3-rekap-omset-harian.json` | Workflow automasi alur kerja n8n: 3-rekap-omset-harian.json. |

### 📁 Deployment & DevOps (61 berkas)

| Jalur Berkas (`Path`) | Deskripsi Fungsi |
| :--- | :--- |
| `backup-pi.sh` | Skrip otomatisasi Linux/Raspberry Pi: backup-pi.sh. |
| `backup-to-cloud.sh` | Skrip otomatisasi Linux/Raspberry Pi: backup-to-cloud.sh. |
| `bootstrap-pi.sh` | Skrip otomatisasi Linux/Raspberry Pi: bootstrap-pi.sh. |
| `bootstrap-vps.sh` | Skrip otomatisasi Linux/Raspberry Pi: bootstrap-vps.sh. |
| `check-integrity-pi.sh` | Skrip otomatisasi Linux/Raspberry Pi: check-integrity-pi.sh. |
| `check-workers-pi.sh` | Skrip otomatisasi Linux/Raspberry Pi: check-workers-pi.sh. |
| `collect-metrics-pi.sh` | Skrip otomatisasi Linux/Raspberry Pi: collect-metrics-pi.sh. |
| `fix-permission-pi.sh` | Skrip otomatisasi Linux/Raspberry Pi: fix-permission-pi.sh. |
| `install-pi.sh` | Skrip otomatisasi Linux/Raspberry Pi: install-pi.sh. |
| `project/.emergent/cron/dispatch_webhook.sh` | Skrip otomatisasi Linux/Raspberry Pi: dispatch_webhook.sh. |
| `project/.emergent/cron/watch_crons.sh` | Skrip otomatisasi Linux/Raspberry Pi: watch_crons.sh. |
| `project/.emergent/cron/webhook_crond.sh` | Skrip otomatisasi Linux/Raspberry Pi: webhook_crond.sh. |
| `project/backup-pi-to-vps.sh` | Skrip otomatisasi Linux/Raspberry Pi: backup-pi-to-vps.sh. |
| `project/backup-pi.sh` | Skrip otomatisasi Linux/Raspberry Pi: backup-pi.sh. |
| `project/backup-to-cloud.sh` | Skrip otomatisasi Linux/Raspberry Pi: backup-to-cloud.sh. |
| `project/backup-to-pos.sh` | Skrip otomatisasi Linux/Raspberry Pi: backup-to-pos.sh. |
| `project/backup-windows.bat` | Skrip otomatisasi Windows Server: backup-windows.bat. |
| `project/bootstrap-pi.sh` | Skrip otomatisasi Linux/Raspberry Pi: bootstrap-pi.sh. |
| `project/bootstrap-vps.sh` | Skrip otomatisasi Linux/Raspberry Pi: bootstrap-vps.sh. |
| `project/bootstrap-windows.bat` | Skrip otomatisasi Windows Server: bootstrap-windows.bat. |
| `project/build-update-archive.sh` | Skrip otomatisasi Linux/Raspberry Pi: build-update-archive.sh. |
| `project/check-integrity-pi.sh` | Skrip otomatisasi Linux/Raspberry Pi: check-integrity-pi.sh. |
| `project/check-update-pi.sh` | Skrip otomatisasi Linux/Raspberry Pi: check-update-pi.sh. |
| `project/check-workers-pi.sh` | Skrip otomatisasi Linux/Raspberry Pi: check-workers-pi.sh. |
| `project/docker-compose.gudang.yml` | Konfigurasi Docker container: docker-compose.gudang.yml. |
| `project/docker-compose.pc-master.yml` | Konfigurasi Docker container: docker-compose.pc-master.yml. |
| `project/docker-compose.pos-standalone.yml` | Konfigurasi Docker container: docker-compose.pos-standalone.yml. |
| `project/docker-compose.vps.yml` | Konfigurasi Docker container: docker-compose.vps.yml. |
| `project/docker-compose.yml` | Konfigurasi Docker container: docker-compose.yml. |
| `project/fix-permission-pi.sh` | Skrip otomatisasi Linux/Raspberry Pi: fix-permission-pi.sh. |
| `project/frontend/Dockerfile` | Berkas konfigurasi/data: Dockerfile. |
| `project/frontend/public/bootstrap-pi.sh` | Skrip otomatisasi Linux/Raspberry Pi: bootstrap-pi.sh. |
| `project/frontend/public/bootstrap-vps.sh` | Skrip otomatisasi Linux/Raspberry Pi: bootstrap-vps.sh. |
| `project/install-pi.sh` | Skrip otomatisasi Linux/Raspberry Pi: install-pi.sh. |
| `project/install-windows.bat` | Skrip otomatisasi Windows Server: install-windows.bat. |
| `project/optimize-db.sh` | Skrip otomatisasi Linux/Raspberry Pi: optimize-db.sh. |
| `project/restart-pi.sh` | Skrip otomatisasi Linux/Raspberry Pi: restart-pi.sh. |
| `project/restart-windows.bat` | Skrip otomatisasi Windows Server: restart-windows.bat. |
| `project/restore-pi.sh` | Skrip otomatisasi Linux/Raspberry Pi: restore-pi.sh. |
| `project/restore-test-pi.sh` | Skrip otomatisasi Linux/Raspberry Pi: restore-test-pi.sh. |
| `project/restore-windows.bat` | Skrip otomatisasi Windows Server: restore-windows.bat. |
| `project/scripts/install-vps-one-click.sh` | Skrip otomatisasi Linux/Raspberry Pi: install-vps-one-click.sh. |
| `project/scripts/setup-vps-n8n.sh` | Skrip otomatisasi Linux/Raspberry Pi: setup-vps-n8n.sh. |
| `project/setup-autobackup-pi.sh` | Skrip otomatisasi Linux/Raspberry Pi: setup-autobackup-pi.sh. |
| `project/setup-autobackup-vps.sh` | Skrip otomatisasi Linux/Raspberry Pi: setup-autobackup-vps.sh. |
| `project/setup-autoupdate-pi.sh` | Skrip otomatisasi Linux/Raspberry Pi: setup-autoupdate-pi.sh. |
| `project/setup-funnel-pi.sh` | Skrip otomatisasi Linux/Raspberry Pi: setup-funnel-pi.sh. |
| `project/setup-pc-master.bat` | Skrip otomatisasi Windows Server: setup-pc-master.bat. |
| `project/setup-pc-master.sh` | Skrip otomatisasi Linux/Raspberry Pi: setup-pc-master.sh. |
| `project/setup-pi-client.sh` | Skrip otomatisasi Linux/Raspberry Pi: setup-pi-client.sh. |
| `project/setup-power-schedule-pi.sh` | Skrip otomatisasi Linux/Raspberry Pi: setup-power-schedule-pi.sh. |
| `project/setup-tailscale.sh` | Skrip otomatisasi Linux/Raspberry Pi: setup-tailscale.sh. |
| `project/update-aistudio-pi.sh` | Skrip otomatisasi Linux/Raspberry Pi: update-aistudio-pi.sh. |
| `project/update-pi.sh` | Skrip otomatisasi Linux/Raspberry Pi: update-pi.sh. |
| `project/update-pos-pi.sh` | Skrip otomatisasi Linux/Raspberry Pi: update-pos-pi.sh. |
| `project/update-windows.bat` | Skrip otomatisasi Windows Server: update-windows.bat. |
| `setup-autobackup-pi.sh` | Skrip otomatisasi Linux/Raspberry Pi: setup-autobackup-pi.sh. |
| `setup-autoupdate-pi.sh` | Skrip otomatisasi Linux/Raspberry Pi: setup-autoupdate-pi.sh. |
| `setup-raspberrypi.sh` | Skrip otomatisasi Linux/Raspberry Pi: setup-raspberrypi.sh. |
| `start-pc-server.bat` | Skrip otomatisasi Windows Server: start-pc-server.bat. |
| `update-pi.sh` | Skrip otomatisasi Linux/Raspberry Pi: update-pi.sh. |

### 📁 Agent Skill System (51 berkas)

| Jalur Berkas (`Path`) | Deskripsi Fungsi |
| :--- | :--- |
| `.agents/skills/animate/SKILL.md` | Definisi kemampuan agen: SKILL.md. |
| `.agents/skills/animate/agents/openai.yaml` | Definisi kemampuan agen: openai.yaml. |
| `.agents/skills/ask-sonner/SKILL.md` | Definisi kemampuan agen: SKILL.md. |
| `.agents/skills/ask-sonner/agents/openai.yaml` | Definisi kemampuan agen: openai.yaml. |
| `.agents/skills/bug/SKILL.md` | Definisi kemampuan agen: SKILL.md. |
| `.agents/skills/bug/agents/openai.yaml` | Definisi kemampuan agen: openai.yaml. |
| `.agents/skills/chore/SKILL.md` | Definisi kemampuan agen: SKILL.md. |
| `.agents/skills/chore/agents/openai.yaml` | Definisi kemampuan agen: openai.yaml. |
| `.agents/skills/e2e-tester/SKILL.md` | Definisi kemampuan agen: SKILL.md. |
| `.agents/skills/e2e-tester/agents/openai.yaml` | Definisi kemampuan agen: openai.yaml. |
| `.agents/skills/feature/SKILL.md` | Definisi kemampuan agen: SKILL.md. |
| `.agents/skills/feature/agents/openai.yaml` | Definisi kemampuan agen: openai.yaml. |
| `.agents/skills/pick-ui-library/SKILL.md` | Definisi kemampuan agen: SKILL.md. |
| `.agents/skills/pick-ui-library/agents/openai.yaml` | Definisi kemampuan agen: openai.yaml. |
| `.agents/skills/planora-change/SKILL.md` | Definisi kemampuan agen: SKILL.md. |
| `.agents/skills/planora-change/agents/openai.yaml` | Definisi kemampuan agen: openai.yaml. |
| `.agents/skills/planora-next/SKILL.md` | Definisi kemampuan agen: SKILL.md. |
| `.agents/skills/planora-next/agents/openai.yaml` | Definisi kemampuan agen: openai.yaml. |
| `.agents/skills/planora-product-kit/SKILL.md` | Definisi kemampuan agen: SKILL.md. |
| `.agents/skills/planora-product-kit/agents/openai.yaml` | Definisi kemampuan agen: openai.yaml. |
| `.agents/skills/planora-product-kit/assets/templates/content-guidelines.id-ID.md.tmpl` | Definisi kemampuan agen: content-guidelines.id-ID.md.tmpl. |
| `.agents/skills/planora-product-kit/assets/templates/content-guidelines.md.tmpl` | Definisi kemampuan agen: content-guidelines.md.tmpl. |
| `.agents/skills/planora-product-kit/assets/templates/document.id-ID.md.tmpl` | Definisi kemampuan agen: document.id-ID.md.tmpl. |
| `.agents/skills/planora-product-kit/assets/templates/document.md.tmpl` | Definisi kemampuan agen: document.md.tmpl. |
| `.agents/skills/planora-product-kit/assets/templates/feature.id-ID.md.tmpl` | Definisi kemampuan agen: feature.id-ID.md.tmpl. |
| `.agents/skills/planora-product-kit/assets/templates/feature.md.tmpl` | Definisi kemampuan agen: feature.md.tmpl. |
| `.agents/skills/planora-product-kit/assets/templates/phase.id-ID.md.tmpl` | Definisi kemampuan agen: phase.id-ID.md.tmpl. |
| `.agents/skills/planora-product-kit/assets/templates/phase.md.tmpl` | Definisi kemampuan agen: phase.md.tmpl. |
| `.agents/skills/planora-product-kit/assets/templates/root-readme.id-ID.md.tmpl` | Definisi kemampuan agen: root-readme.id-ID.md.tmpl. |
| `.agents/skills/planora-product-kit/assets/templates/root-readme.md.tmpl` | Definisi kemampuan agen: root-readme.md.tmpl. |
| `.agents/skills/planora-product-kit/assets/templates/todo.en-US.md.tmpl` | Definisi kemampuan agen: todo.en-US.md.tmpl. |
| `.agents/skills/planora-product-kit/assets/templates/todo.id-ID.md.tmpl` | Definisi kemampuan agen: todo.id-ID.md.tmpl. |
| `.agents/skills/planora-product-kit/references/execution-planning.md` | Definisi kemampuan agen: execution-planning.md. |
| `.agents/skills/planora-product-kit/references/experience-guide.md` | Definisi kemampuan agen: experience-guide.md. |
| `.agents/skills/planora-product-kit/references/intake-and-provenance.md` | Definisi kemampuan agen: intake-and-provenance.md. |
| `.agents/skills/planora-product-kit/references/output-contract.md` | Definisi kemampuan agen: output-contract.md. |
| `.agents/skills/planora-product-kit/references/prd-authoring.md` | Definisi kemampuan agen: prd-authoring.md. |
| `.agents/skills/planora-product-kit/references/quality-gates.md` | Definisi kemampuan agen: quality-gates.md. |
| `.agents/skills/planora-product-kit/references/revision-workflow.md` | Definisi kemampuan agen: revision-workflow.md. |
| `.agents/skills/planora-product-kit/scripts/scaffold_product_kit.py` | Definisi kemampuan agen: scaffold_product_kit.py. |
| `.agents/skills/planora-product-kit/scripts/update_revision.py` | Definisi kemampuan agen: update_revision.py. |
| `.agents/skills/planora-product-kit/scripts/validate_product_kit.py` | Definisi kemampuan agen: validate_product_kit.py. |
| `.agents/skills/planora-product-kit/tests/test_product_kit.py` | Definisi kemampuan agen: test_product_kit.py. |
| `.agents/skills/planora-status/SKILL.md` | Definisi kemampuan agen: SKILL.md. |
| `.agents/skills/planora-status/agents/openai.yaml` | Definisi kemampuan agen: openai.yaml. |
| `.agents/skills/planora-status/scripts/inspect_product.py` | Definisi kemampuan agen: inspect_product.py. |
| `.agents/skills/planora-status/tests/test_inspect_product.py` | Definisi kemampuan agen: test_inspect_product.py. |
| `.agents/skills/prototype/SKILL.md` | Definisi kemampuan agen: SKILL.md. |
| `.agents/skills/prototype/agents/openai.yaml` | Definisi kemampuan agen: openai.yaml. |
| `.agents/skills/ui-design/SKILL.md` | Definisi kemampuan agen: SKILL.md. |
| `.agents/skills/ui-design/agents/openai.yaml` | Definisi kemampuan agen: openai.yaml. |

### 📁 Berkas Pendukung / Konfigurasi (78 berkas)

| Jalur Berkas (`Path`) | Deskripsi Fungsi |
| :--- | :--- |
| `.env.example` | Berkas konfigurasi/data: .env.example. |
| `AGENTS.md` | Aturan emas agen, konvensi teknis arsitektur F&B/Retail, dan alur Planora. |
| `CLAUDE.md` | Panduan instruksi agen berbasis Claude untuk repositori. |
| `INDEX-BERKAS.md` | Buku besar indeks katalog seluruh berkas dalam proyek. |
| `PANDUAN-HERMES-AGENT.md` | Panduan resmi integrasi Hermes Agent (Nous Research) untuk AI Brain & WA Gateway. |
| `feature-requests.jsonl` | Berkas konfigurasi/data: feature-requests.jsonl. |
| `firebase-applet-config.json` | Konfigurasi kredensial koneksi Firebase Applet. |
| `firebase-blueprint.json` | Skema cetak biru Firestore dan konfigurasi database cloud. |
| `firestore.rules` | Aturan keamanan Firestore Cloud Database. |
| `project/.emergent/cron/applied.hash` | Berkas konfigurasi/data: applied.hash. |
| `project/.emergent/cron/webhook-crons` | Berkas konfigurasi/data: webhook-crons. |
| `project/.emergent/crons.yml` | Berkas konfigurasi/data: crons.yml. |
| `project/.emergent/emergent.yml` | Berkas konfigurasi/data: emergent.yml. |
| `project/.emergent/markers/.bootstrap-complete` | Berkas konfigurasi/data: .bootstrap-complete. |
| `project/.emergent/markers/.restore-complete` | Berkas konfigurasi/data: .restore-complete. |
| `project/.emergent/system_deps.txt` | Berkas konfigurasi/data: system_deps.txt. |
| `project/.env.gudang.example` | Berkas konfigurasi/data: .env.gudang.example. |
| `project/.env.vps.example` | Berkas konfigurasi/data: .env.vps.example. |
| `project/AGENTS.md` | Berkas konfigurasi/data: AGENTS.md. |
| `project/Buka-POS-Linux.desktop` | Berkas konfigurasi/data: Buka-POS-Linux.desktop. |
| `project/Buka-POS-Windows.url` | Berkas konfigurasi/data: Buka-POS-Windows.url. |
| `project/Caddyfile` | Berkas konfigurasi/data: Caddyfile. |
| `project/FEATURES.md` | Berkas konfigurasi/data: FEATURES.md. |
| `project/HANDOFF-GEMINI.md` | Berkas konfigurasi/data: HANDOFF-GEMINI.md. |
| `project/INDEX-BERKAS.md` | Berkas konfigurasi/data: INDEX-BERKAS.md. |
| `project/MULAI-DISINI.txt` | Berkas konfigurasi/data: MULAI-DISINI.txt. |
| `project/PANDUAN-GITHUB.md` | Berkas konfigurasi/data: PANDUAN-GITHUB.md. |
| `project/PANDUAN-HERMES-AGENT.md` | Berkas konfigurasi/data: PANDUAN-HERMES-AGENT.md. |
| `project/PANDUAN-MIGRASI-VPS-N8N.md` | Berkas konfigurasi/data: PANDUAN-MIGRASI-VPS-N8N.md. |
| `project/PANDUAN-MULTI-NODE-TAILSCALE.md` | Berkas konfigurasi/data: PANDUAN-MULTI-NODE-TAILSCALE.md. |
| `project/PANDUAN-TAILSCALE.md` | Berkas konfigurasi/data: PANDUAN-TAILSCALE.md. |
| `project/README-DEPLOY.md` | Berkas konfigurasi/data: README-DEPLOY.md. |
| `project/README.md` | Berkas konfigurasi/data: README.md. |
| `project/backend_test.py` | Berkas konfigurasi/data: backend_test.py. |
| `project/design_guidelines.json` | Berkas konfigurasi/data: design_guidelines.json. |
| `project/firebase-blueprint.json` | Berkas konfigurasi/data: firebase-blueprint.json. |
| `project/firestore.rules` | Berkas konfigurasi/data: firestore.rules. |
| `project/frontend/.dockerignore` | Berkas konfigurasi/data: .dockerignore. |
| `project/frontend/.env` | Berkas konfigurasi/data: .env. |
| `project/frontend/README-ANDROID.md` | Berkas konfigurasi/data: README-ANDROID.md. |
| `project/frontend/README.md` | Berkas konfigurasi/data: README.md. |
| `project/frontend/capacitor.config.json` | Berkas konfigurasi/data: capacitor.config.json. |
| `project/frontend/components.json` | Berkas konfigurasi/data: components.json. |
| `project/frontend/craco.config.js` | Berkas konfigurasi/data: craco.config.js. |
| `project/frontend/eslint.undef.config.cjs` | Berkas konfigurasi/data: eslint.undef.config.cjs. |
| `project/frontend/jsconfig.json` | Berkas konfigurasi/data: jsconfig.json. |
| `project/frontend/nginx.conf` | Berkas konfigurasi/data: nginx.conf. |
| `project/frontend/package.json` | Berkas konfigurasi/data: package.json. |
| `project/frontend/plugins/health-check/health-endpoints.js` | Berkas konfigurasi/data: health-endpoints.js. |
| `project/frontend/plugins/health-check/webpack-health-plugin.js` | Berkas konfigurasi/data: webpack-health-plugin.js. |
| `project/frontend/postcss.config.js` | Berkas konfigurasi/data: postcss.config.js. |
| `project/frontend/public/.well-known/assetlinks.json` | Berkas konfigurasi/data: assetlinks.json. |
| `project/frontend/public/PANDUAN_APK_SUNMI_T2.txt` | Berkas konfigurasi/data: PANDUAN_APK_SUNMI_T2.txt. |
| `project/frontend/public/PROMPT_AISTUDIO_SUNMI_NATIVE.txt` | Berkas konfigurasi/data: PROMPT_AISTUDIO_SUNMI_NATIVE.txt. |
| `project/frontend/public/SYSTEM_INSTRUCTION_SUNMI_NATIVE.txt` | Berkas konfigurasi/data: SYSTEM_INSTRUCTION_SUNMI_NATIVE.txt. |
| `project/frontend/public/icon-192.png` | Berkas konfigurasi/data: icon-192.png. |
| `project/frontend/public/icon-512.png` | Berkas konfigurasi/data: icon-512.png. |
| `project/frontend/public/index.html` | Berkas konfigurasi/data: index.html. |
| `project/frontend/public/manifest.json` | Berkas konfigurasi/data: manifest.json. |
| `project/frontend/public/polyfills.js` | Polyfill ES6/ES7 khusus WebView Android 7 lama pada terminal Sunmi T2. |
| `project/frontend/public/sw.js` | Service worker dummy nonaktif (mencegah konflik cache OTA). |
| `project/frontend/scripts/make-ota.js` | Berkas konfigurasi/data: make-ota.js. |
| `project/frontend/src/App.css` | Berkas konfigurasi/data: App.css. |
| `project/frontend/src/App.js` | Komponen root routing aplikasi React 19. |
| `project/frontend/src/constants/testIds/auth.js` | Berkas konfigurasi/data: auth.js. |
| `project/frontend/src/constants/testIds/home.js` | Berkas konfigurasi/data: home.js. |
| `project/frontend/src/constants/testIds/index.js` | Berkas konfigurasi/data: index.js. |
| `project/frontend/src/firebase-applet-config.json` | Berkas konfigurasi/data: firebase-applet-config.json. |
| `project/frontend/src/hooks/use-toast.js` | Berkas konfigurasi/data: use-toast.js. |
| `project/frontend/src/index.css` | Berkas konfigurasi/data: index.css. |
| `project/frontend/src/index.js` | Titik masuk render React DOM dengan polyfills. |
| `project/frontend/tailwind.config.js` | Berkas konfigurasi/data: tailwind.config.js. |
| `project/memory/.gitkeep` | Berkas konfigurasi/data: .gitkeep. |
| `project/memory/PRD.md` | Berkas konfigurasi/data: PRD.md. |
| `project/scripts/check_server.py` | Berkas konfigurasi/data: check_server.py. |
| `project/scripts/seed_data.py` | Berkas konfigurasi/data: seed_data.py. |
| `project/scripts/update_file_index.py` | Berkas konfigurasi/data: update_file_index.py. |
| `project/test_result.md` | Berkas konfigurasi/data: test_result.md. |

