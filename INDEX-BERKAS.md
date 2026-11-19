# Indeks Katalog Berkas — Grand Aceh Kuliner POS

> **Buku Besar Katalog Berkas Repositori**
> Terakhir diperbarui: `2026-11-19 07:35:21 WIB`
> Total Berkas Terindeks: **834 berkas**

Dokumen ini memuat daftar lengkap seluruh berkas di repositori beserta kategori dan fungsinya.
Setiap kali ada penambahan atau perubahan berkas, jalankan skrip berikut untuk memperbarui indeks:
```bash
python3 project/scripts/update_file_index.py
```

---

## Ringkasan Kategori Berkas

| Kategori | Jumlah Berkas | Keterangan |
| :--- | :---: | :--- |
| **Cloud Run & Server Root** | `4` | Modul cloud run & server root sistem POS |
| **Frontend — Halaman UI** | `48` | Modul frontend — halaman ui sistem POS |
| **Frontend — Komponen UI** | `72` | Modul frontend — komponen ui sistem POS |
| **Frontend — State & Context** | `2` | Modul frontend — state & context sistem POS |
| **Frontend — Utility & Library** | `23` | Modul frontend — utility & library sistem POS |
| **Mobile Android & Sunmi Hardware** | `53` | Modul mobile android & sunmi hardware sistem POS |
| **Integrasi Hermes Agent** | `2` | Modul integrasi hermes agent sistem POS |
| **Planora Framework** | `51` | Modul planora framework sistem POS |
| **Dokumentasi Teknis** | `17` | Modul dokumentasi teknis sistem POS |
| **Deployment & DevOps** | `71` | Modul deployment & devops sistem POS |
| **Agent Skill System** | `51` | Modul agent skill system sistem POS |
| **Berkas Pendukung / Konfigurasi** | `440` | Modul berkas pendukung / konfigurasi sistem POS |

---

## Daftar Lengkap Berkas Menurut Modul

### 📁 Cloud Run & Server Root (4 berkas)

| Jalur Berkas (`Path`) | Deskripsi Fungsi |
| :--- | :--- |
| `build.js` | Skrip build dan packaging bundle statis, OTA ZIP, dan sanitasi index.html. |
| `metadata.json` | Metadata manifes AI Studio (nama aplikasi, deskripsi, capabilities server-side). |
| `package.json` | Konfigurasi dependensi Node.js root server. |
| `routes/allMissingRoutes.js` | Berkas konfigurasi/data: allMissingRoutes.js. |

### 📁 Frontend — Halaman UI (48 berkas)

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
| `project/frontend/src/pages/Diagnostik.test.js` | Halaman antarmuka pengguna untuk modul Diagnostik.test. |
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
| `project/frontend/src/pages/SettingsLandingPage.jsx` | Halaman antarmuka pengguna untuk modul SettingsLandingPage. |
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

### 📁 Frontend — Komponen UI (72 berkas)

| Jalur Berkas (`Path`) | Deskripsi Fungsi |
| :--- | :--- |
| `project/frontend/src/components/AiIngredientRecommendationModal.jsx` | Komponen visual antarmuka pengguna: AiIngredientRecommendationModal. |
| `project/frontend/src/components/ErrorBoundary.jsx` | Komponen visual antarmuka pengguna: ErrorBoundary. |
| `project/frontend/src/components/ForceChangePassword.jsx` | Komponen visual antarmuka pengguna: ForceChangePassword. |
| `project/frontend/src/components/GDriveBackupManager.jsx` | Komponen visual antarmuka pengguna: GDriveBackupManager. |
| `project/frontend/src/components/GlobalErrorDiagnosticPanel.jsx` | Komponen visual antarmuka pengguna: GlobalErrorDiagnosticPanel. |
| `project/frontend/src/components/GoogleSearchPreview.jsx` | Komponen visual antarmuka pengguna: GoogleSearchPreview. |
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

### 📁 Frontend — Utility & Library (23 berkas)

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
| `project/frontend/src/lib/sync.js` | Berkas konfigurasi/data: sync.js. |
| `project/frontend/src/lib/ui.js` | Berkas konfigurasi/data: ui.js. |
| `project/frontend/src/lib/utils.js` | Berkas konfigurasi/data: utils.js. |
| `project/frontend/src/lib/versions.js` | Berkas konfigurasi/data: versions.js. |

### 📁 Mobile Android & Sunmi Hardware (53 berkas)

| Jalur Berkas (`Path`) | Deskripsi Fungsi |
| :--- | :--- |
| `apk/Grand-Aceh-Kuliner-POS-v2.10.apk` | Paket instalasi Android release untuk perangkat Sunmi T2 / tablet POS. |
| `apk/Grand-Aceh-Kuliner-POS-v3.0.0.apk` | Berkas konfigurasi/data: Grand-Aceh-Kuliner-POS-v3.0.0.apk. |
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

### 📁 Planora Framework (51 berkas)

| Jalur Berkas (`Path`) | Deskripsi Fungsi |
| :--- | :--- |
| `.planora/DX/README.md` | Dokumen spesifikasi Planora (README.md). |
| `.planora/DX/api-ergonomics.md` | Dokumen spesifikasi Planora (api-ergonomics.md). |
| `.planora/DX/api-rust-ergonomics.md` | Dokumen spesifikasi Planora (api-rust-ergonomics.md). |
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
| `.planora/EXECUTION/phases/phase-03-rust-migration.md` | Dokumen spesifikasi Planora (phase-03-rust-migration.md). |
| `.planora/EXECUTION/release-readiness.md` | Dokumen spesifikasi Planora (release-readiness.md). |
| `.planora/PRD/PRD.md` | Spesifikasi kebutuhan produk utama Grand Aceh Kuliner POS. |
| `.planora/PRD/README.md` | Dokumen spesifikasi Planora (README.md). |
| `.planora/PRD/asumsi-dan-pertanyaan.md` | Dokumen spesifikasi Planora (asumsi-dan-pertanyaan.md). |
| `.planora/PRD/fitur/hardware-sunmi.md` | Dokumen spesifikasi Planora (hardware-sunmi.md). |
| `.planora/PRD/fitur/keamanan-login.md` | Dokumen spesifikasi Planora (keamanan-login.md). |
| `.planora/PRD/fitur/landing-page-dan-reservasi.md` | Dokumen spesifikasi Planora (landing-page-dan-reservasi.md). |
| `.planora/PRD/fitur/manajemen-meja.md` | Dokumen spesifikasi Planora (manajemen-meja.md). |
| `.planora/PRD/fitur/migrasi-backend-rust.md` | Dokumen spesifikasi Planora (migrasi-backend-rust.md). |
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

### 📁 Dokumentasi Teknis (17 berkas)

| Jalur Berkas (`Path`) | Deskripsi Fungsi |
| :--- | :--- |
| `project/docs/ANALISA-DB-WINDOWS-PI.md` | Dokumen acuan teknis operasional: ANALISA-DB-WINDOWS-PI.md. |
| `project/docs/ANALISIS-FITUR-PRIORITAS.md` | Dokumen acuan teknis operasional: ANALISIS-FITUR-PRIORITAS.md. |
| `project/docs/CONTRACT-ALIGNMENT-FIX02.md` | Dokumen acuan teknis operasional: CONTRACT-ALIGNMENT-FIX02.md. |
| `project/docs/INDEKS-DATABASE.md` | Dokumen acuan teknis operasional: INDEKS-DATABASE.md. |
| `project/docs/INTEGRASI-NETZME.md` | Dokumen acuan teknis operasional: INTEGRASI-NETZME.md. |
| `project/docs/LAPORAN-AUDIT-DAN-PERBAIKAN-20261101.md` | Dokumen acuan teknis operasional: LAPORAN-AUDIT-DAN-PERBAIKAN-20261101.md. |
| `project/docs/LAPORAN-VERIFIKASI-VERIFY-01.md` | Dokumen acuan teknis operasional: LAPORAN-VERIFIKASI-VERIFY-01.md. |
| `project/docs/PANDUAN-AKUN-CLI.md` | Dokumen acuan teknis operasional: PANDUAN-AKUN-CLI.md. |
| `project/docs/PANDUAN-BUILD-PI.md` | Dokumen acuan teknis operasional: PANDUAN-BUILD-PI.md. |
| `project/docs/PANDUAN-DEPLOY-VPS-DAN-PI-TAILSCALE.md` | Dokumen acuan teknis operasional: PANDUAN-DEPLOY-VPS-DAN-PI-TAILSCALE.md. |
| `project/docs/PANDUAN-INTEGRITAS.md` | Dokumen acuan teknis operasional: PANDUAN-INTEGRITAS.md. |
| `project/docs/PANDUAN-KATEGORI-BAHAN.md` | Dokumen acuan teknis operasional: PANDUAN-KATEGORI-BAHAN.md. |
| `project/docs/PANDUAN-SHIFT-HARIAN.md` | Dokumen acuan teknis operasional: PANDUAN-SHIFT-HARIAN.md. |
| `project/docs/PANDUAN-WHATSAPP-HERMES.md` | Dokumen acuan teknis operasional: PANDUAN-WHATSAPP-HERMES.md. |
| `project/docs/PANDUAN-WORKER-UVICORN.md` | Dokumen acuan teknis operasional: PANDUAN-WORKER-UVICORN.md. |
| `project/docs/RANCANGAN-VOID-PESANAN.md` | Dokumen acuan teknis operasional: RANCANGAN-VOID-PESANAN.md. |
| `project/docs/RANCANGAN-WINDOWS-UTAMA-PI-CADANGAN.md` | Dokumen acuan teknis operasional: RANCANGAN-WINDOWS-UTAMA-PI-CADANGAN.md. |

### 📁 Deployment & DevOps (71 berkas)

| Jalur Berkas (`Path`) | Deskripsi Fungsi |
| :--- | :--- |
| `Buat-Shortcut-Desktop.bat` | Skrip otomatisasi Windows Server: Buat-Shortcut-Desktop.bat. |
| `Buka-POS-Desktop.bat` | Skrip otomatisasi Windows Server: Buka-POS-Desktop.bat. |
| `Buka-POS-KioskPrint.bat` | Skrip otomatisasi Windows Server: Buka-POS-KioskPrint.bat. |
| `Dockerfile` | Berkas konfigurasi/data: Dockerfile. |
| `backup-pi-to-vps.sh` | Skrip otomatisasi Linux/Raspberry Pi: backup-pi-to-vps.sh. |
| `backup-pi.sh` | Skrip otomatisasi Linux/Raspberry Pi: backup-pi.sh. |
| `backup-to-cloud.sh` | Skrip otomatisasi Linux/Raspberry Pi: backup-to-cloud.sh. |
| `bootstrap-pi.sh` | Skrip otomatisasi Linux/Raspberry Pi: bootstrap-pi.sh. |
| `bootstrap-vps.sh` | Skrip otomatisasi Linux/Raspberry Pi: bootstrap-vps.sh. |
| `check-integrity-pi.sh` | Skrip otomatisasi Linux/Raspberry Pi: check-integrity-pi.sh. |
| `check-workers-pi.sh` | Skrip otomatisasi Linux/Raspberry Pi: check-workers-pi.sh. |
| `collect-metrics-pi.sh` | Skrip otomatisasi Linux/Raspberry Pi: collect-metrics-pi.sh. |
| `deploy/docker-compose.host.yml` | Konfigurasi Docker container: docker-compose.host.yml. |
| `deploy/docker-compose.pi.yml` | Konfigurasi Docker container: docker-compose.pi.yml. |
| `fix-permission-pi.sh` | Skrip otomatisasi Linux/Raspberry Pi: fix-permission-pi.sh. |
| `install-pi.sh` | Skrip otomatisasi Linux/Raspberry Pi: install-pi.sh. |
| `ops/disk-alert.sh` | Skrip otomatisasi Linux/Raspberry Pi: disk-alert.sh. |
| `ops/grandpos-backup.sh` | Skrip otomatisasi Linux/Raspberry Pi: grandpos-backup.sh. |
| `ops/reclaim.sh` | Skrip otomatisasi Linux/Raspberry Pi: reclaim.sh. |
| `project/.emergent/cron/dispatch_webhook.sh` | Skrip otomatisasi Linux/Raspberry Pi: dispatch_webhook.sh. |
| `project/.emergent/cron/watch_crons.sh` | Skrip otomatisasi Linux/Raspberry Pi: watch_crons.sh. |
| `project/.emergent/cron/webhook_crond.sh` | Skrip otomatisasi Linux/Raspberry Pi: webhook_crond.sh. |
| `project/Buat-Shortcut-Desktop.bat` | Skrip otomatisasi Windows Server: Buat-Shortcut-Desktop.bat. |
| `project/Buka-POS-Desktop.bat` | Skrip otomatisasi Windows Server: Buka-POS-Desktop.bat. |
| `project/Buka-POS-KioskPrint.bat` | Skrip otomatisasi Windows Server: Buka-POS-KioskPrint.bat. |
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
| `project/fix-permission-pi.sh` | Skrip otomatisasi Linux/Raspberry Pi: fix-permission-pi.sh. |
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
| `public/bootstrap-pi.sh` | Skrip otomatisasi Linux/Raspberry Pi: bootstrap-pi.sh. |
| `public/bootstrap-vps.sh` | Skrip otomatisasi Linux/Raspberry Pi: bootstrap-vps.sh. |
| `scripts/install-vps-one-click.sh` | Skrip otomatisasi Linux/Raspberry Pi: install-vps-one-click.sh. |
| `setup-autobackup-pi.sh` | Skrip otomatisasi Linux/Raspberry Pi: setup-autobackup-pi.sh. |
| `setup-autoupdate-pi.sh` | Skrip otomatisasi Linux/Raspberry Pi: setup-autoupdate-pi.sh. |
| `setup-raspberrypi.sh` | Skrip otomatisasi Linux/Raspberry Pi: setup-raspberrypi.sh. |
| `setup-tailscale.sh` | Skrip otomatisasi Linux/Raspberry Pi: setup-tailscale.sh. |
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

### 📁 Berkas Pendukung / Konfigurasi (440 berkas)

| Jalur Berkas (`Path`) | Deskripsi Fungsi |
| :--- | :--- |
| `.omh/plans/2026-11-13T154324838163Z-grandpos-remediation-ota-skew-landing-contract-disk-backup-deps-aeadcf.md` | Berkas konfigurasi/data: 2026-11-13T154324838163Z-grandpos-remediation-ota-skew-landing-contract-disk-backup-deps-aeadcf.md. |
| `.omh/plans/2026-11-13T202649885060Z-remove-the-dead-module-script-tag-and-close-the-200-html-fallbac-f586e3.md` | Berkas konfigurasi/data: 2026-11-13T202649885060Z-remove-the-dead-module-script-tag-and-close-the-200-html-fallbac-f586e3.md. |
| `AGENTS.md` | Aturan emas agen, konvensi teknis arsitektur F&B/Retail, dan alur Planora. |
| `CLAUDE.md` | Panduan instruksi agen berbasis Claude untuk repositori. |
| `IDEA.md` | Berkas konfigurasi/data: IDEA.md. |
| `INDEX-BERKAS.md` | Buku besar indeks katalog seluruh berkas dalam proyek. |
| `PANDUAN-DEPLOY-VPS-DAN-PI-TAILSCALE.md` | Berkas konfigurasi/data: PANDUAN-DEPLOY-VPS-DAN-PI-TAILSCALE.md. |
| `PANDUAN-HERMES-AGENT.md` | Panduan resmi integrasi Hermes Agent (Nous Research) untuk AI Brain & WA Gateway. |
| `PANDUAN-INSTALASI-LENGKAP.md` | Berkas konfigurasi/data: PANDUAN-INSTALASI-LENGKAP.md. |
| `README.md` | Berkas konfigurasi/data: README.md. |
| `api-server.js` | Berkas konfigurasi/data: api-server.js. |
| `capacitor.config.json` | Berkas konfigurasi/data: capacitor.config.json. |
| `data/pos-db.json` | Berkas konfigurasi/data: pos-db.json. |
| `deploy/PANDUAN-PI.md` | Berkas konfigurasi/data: PANDUAN-PI.md. |
| `deploy/nginx-kiosk.conf` | Berkas konfigurasi/data: nginx-kiosk.conf. |
| `docs/GRANDPOS-TEMUAN-AUDIT.md` | Berkas konfigurasi/data: GRANDPOS-TEMUAN-AUDIT.md. |
| `dokumentasi/01-PROMPT-HERMES-INSTALLER.md` | Berkas konfigurasi/data: 01-PROMPT-HERMES-INSTALLER.md. |
| `dokumentasi/02-PANDUAN-FITUR-DAN-PENGGUNAAN.md` | Berkas konfigurasi/data: 02-PANDUAN-FITUR-DAN-PENGGUNAAN.md. |
| `dokumentasi/03-FUNGSI-SELURUH-FILE.md` | Berkas konfigurasi/data: 03-FUNGSI-SELURUH-FILE.md. |
| `dokumentasi/04-INDEX-NAVIGASI-KODE.md` | Berkas konfigurasi/data: 04-INDEX-NAVIGASI-KODE.md. |
| `dokumentasi/05-PANDUAN-KODING-HERMES-AGENT.md` | Berkas konfigurasi/data: 05-PANDUAN-KODING-HERMES-AGENT.md. |
| `dokumentasi/README.md` | Berkas konfigurasi/data: README.md. |
| `feature-requests.jsonl` | Berkas konfigurasi/data: feature-requests.jsonl. |
| `firebase-applet-config.json` | Konfigurasi kredensial koneksi Firebase Applet. |
| `firebase-blueprint.json` | Skema cetak biru Firestore dan konfigurasi database cloud. |
| `firestore.rules` | Aturan keamanan Firestore Cloud Database. |
| `graphify-out/.graphify_build_state.json` | Berkas konfigurasi/data: .graphify_build_state.json. |
| `graphify-out/.graphify_labels.json` | Berkas konfigurasi/data: .graphify_labels.json. |
| `graphify-out/.graphify_labels.json.sig` | Berkas konfigurasi/data: .graphify_labels.json.sig. |
| `graphify-out/.graphify_labels.pending.json` | Berkas konfigurasi/data: .graphify_labels.pending.json. |
| `graphify-out/.graphify_root` | Berkas konfigurasi/data: .graphify_root. |
| `graphify-out/GRAPH_REPORT.md` | Berkas konfigurasi/data: GRAPH_REPORT.md. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/0070e8254ed23fd5a07ffe2a88d537bcd66b2fd005c54627b940da52d7cbbbfc.json` | Berkas konfigurasi/data: 0070e8254ed23fd5a07ffe2a88d537bcd66b2fd005c54627b940da52d7cbbbfc.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/008b9803edf37f72ba8a332d888898c044970f69d2a65012ce50ada0a2fbe02c.json` | Berkas konfigurasi/data: 008b9803edf37f72ba8a332d888898c044970f69d2a65012ce50ada0a2fbe02c.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/0350eb1585b5ec2effd1aa986cf0a920eb4881f685673e6881a721cffd320d10.json` | Berkas konfigurasi/data: 0350eb1585b5ec2effd1aa986cf0a920eb4881f685673e6881a721cffd320d10.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/03695c542c739f1f9ace22b61ce531f8090565cad81e725ae7a4fcf816fcce9f.json` | Berkas konfigurasi/data: 03695c542c739f1f9ace22b61ce531f8090565cad81e725ae7a4fcf816fcce9f.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/0383bb015c5d3c017bc3e4faa2ef21e182bad6f1a423b550ff5d34aa9625158e.json` | Berkas konfigurasi/data: 0383bb015c5d3c017bc3e4faa2ef21e182bad6f1a423b550ff5d34aa9625158e.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/03a71fa9b3324a26c3edad01065ae4662ac3294a4bb18b9bb3d5e4f6fe941433.json` | Berkas konfigurasi/data: 03a71fa9b3324a26c3edad01065ae4662ac3294a4bb18b9bb3d5e4f6fe941433.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/04c37a20bd750acebc5613b3476816661d25d874993db5c2c147c32b9c8e7ad5.json` | Berkas konfigurasi/data: 04c37a20bd750acebc5613b3476816661d25d874993db5c2c147c32b9c8e7ad5.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/062fd2df3b9dbcdf7f2cfe514007f0544455224edc24f2cd1e39fd9ba6057e0e.json` | Berkas konfigurasi/data: 062fd2df3b9dbcdf7f2cfe514007f0544455224edc24f2cd1e39fd9ba6057e0e.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/0702973f643fa7b42616df1237e274426a69dbf3724090b680a1f641dc2f3228.json` | Berkas konfigurasi/data: 0702973f643fa7b42616df1237e274426a69dbf3724090b680a1f641dc2f3228.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/0afe4ebc9436de4810d787e85a676ecde684882901a2510575219eda4c119bee.json` | Berkas konfigurasi/data: 0afe4ebc9436de4810d787e85a676ecde684882901a2510575219eda4c119bee.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/0bac497571e515bc93efb166d2a1f2b7175d197ce70d57212e7688599b77e9e6.json` | Berkas konfigurasi/data: 0bac497571e515bc93efb166d2a1f2b7175d197ce70d57212e7688599b77e9e6.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/0d5cc8f6c98683cf1dc43643f1aea5113bd8416e4acf50e589457dd71c1c1979.json` | Berkas konfigurasi/data: 0d5cc8f6c98683cf1dc43643f1aea5113bd8416e4acf50e589457dd71c1c1979.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/0da3859fdef6e8a4df05a57ff07243ca024b9c43fcd7f878d6c7c74cdeb57190.json` | Berkas konfigurasi/data: 0da3859fdef6e8a4df05a57ff07243ca024b9c43fcd7f878d6c7c74cdeb57190.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/0de414f1a3f3f0b12ae6386c86658a36d3c09166bc077c1e0690446378abd1af.json` | Berkas konfigurasi/data: 0de414f1a3f3f0b12ae6386c86658a36d3c09166bc077c1e0690446378abd1af.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/0de7f7dc6251efe74523655efbfe0e9ea7cee713beb3c18497f2b30f9c0fa81b.json` | Berkas konfigurasi/data: 0de7f7dc6251efe74523655efbfe0e9ea7cee713beb3c18497f2b30f9c0fa81b.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/11271c4a0577bff48654fb9019cacc7590e1031665fe6b5414581c4053f099e3.json` | Berkas konfigurasi/data: 11271c4a0577bff48654fb9019cacc7590e1031665fe6b5414581c4053f099e3.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/11736ef0189be655f46341927e1bd49667bcef396d13052ef38416f56c8677e9.json` | Berkas konfigurasi/data: 11736ef0189be655f46341927e1bd49667bcef396d13052ef38416f56c8677e9.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/13ad22c41ab5a04762531e4b561d86c6999856fbb60bd6f4cd7b72b0ffabb68a.json` | Berkas konfigurasi/data: 13ad22c41ab5a04762531e4b561d86c6999856fbb60bd6f4cd7b72b0ffabb68a.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/142e797892281714d9d1589e07906c457b90206d9087c862921266bee286e8e3.json` | Berkas konfigurasi/data: 142e797892281714d9d1589e07906c457b90206d9087c862921266bee286e8e3.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/1723a4907b0c314937bd850a22f258e5971bc14134a24e1928af52b1ac35582e.json` | Berkas konfigurasi/data: 1723a4907b0c314937bd850a22f258e5971bc14134a24e1928af52b1ac35582e.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/19903ac582706c3dcb98ae8ffc6bc64b41e7cd53d5846735f458fb5d9c223657.json` | Berkas konfigurasi/data: 19903ac582706c3dcb98ae8ffc6bc64b41e7cd53d5846735f458fb5d9c223657.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/1b4824f1a237e69222e33becba8f3418ace1e5ba3d1926119f8fc16e8c333e7c.json` | Berkas konfigurasi/data: 1b4824f1a237e69222e33becba8f3418ace1e5ba3d1926119f8fc16e8c333e7c.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/1bd7a092852337f8dd22dc423883b94fbad8564dac0bc8c773cc0734cf24f1fd.json` | Berkas konfigurasi/data: 1bd7a092852337f8dd22dc423883b94fbad8564dac0bc8c773cc0734cf24f1fd.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/1d8ff3c0821411aaed0af2255d2c0211ae2a7e5a3739a17894f059ba0adac18c.json` | Berkas konfigurasi/data: 1d8ff3c0821411aaed0af2255d2c0211ae2a7e5a3739a17894f059ba0adac18c.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/1e110bd3b5906a53226eeb43a584c865f05e2bfc464092c5519315a4dc4b5128.json` | Berkas konfigurasi/data: 1e110bd3b5906a53226eeb43a584c865f05e2bfc464092c5519315a4dc4b5128.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/1f0346eaa988822502ff5974cbb3192fb54b13d3e4da6f0b203ed00667562b1a.json` | Berkas konfigurasi/data: 1f0346eaa988822502ff5974cbb3192fb54b13d3e4da6f0b203ed00667562b1a.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/2149829fab41697c659550e8dc3bbb8147de28496de482944933910b35c35a4d.json` | Berkas konfigurasi/data: 2149829fab41697c659550e8dc3bbb8147de28496de482944933910b35c35a4d.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/215af1573b8bac925e6dca42e4c338b1e7a115f5c82d7f3eae9824355dda61ee.json` | Berkas konfigurasi/data: 215af1573b8bac925e6dca42e4c338b1e7a115f5c82d7f3eae9824355dda61ee.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/22df056063ee2930f5834c8c3eee87352ff13263c66b5fb5d1ef1cbbafb0563e.json` | Berkas konfigurasi/data: 22df056063ee2930f5834c8c3eee87352ff13263c66b5fb5d1ef1cbbafb0563e.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/23a3f28115d9b2027ecbb19684ed0afb4c4b29ecbad06beeda1602f52df14e35.json` | Berkas konfigurasi/data: 23a3f28115d9b2027ecbb19684ed0afb4c4b29ecbad06beeda1602f52df14e35.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/24041c0a1a35f4b30562be9435d6abe7c0d53ecc6958a4399aede44b615567a5.json` | Berkas konfigurasi/data: 24041c0a1a35f4b30562be9435d6abe7c0d53ecc6958a4399aede44b615567a5.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/24a1f49bb383ef61fdab75f47a309af785e62955d1749601333b90d02316b8ef.json` | Berkas konfigurasi/data: 24a1f49bb383ef61fdab75f47a309af785e62955d1749601333b90d02316b8ef.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/253d1b7a87fff8aadce7b1df723720d2d7ff47f2860b1fd245ba05f186e28671.json` | Berkas konfigurasi/data: 253d1b7a87fff8aadce7b1df723720d2d7ff47f2860b1fd245ba05f186e28671.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/26bbfdcb38f18a2edd8a3cee2203686ae9dd9d17e102a20eb643d45a3fa961a8.json` | Berkas konfigurasi/data: 26bbfdcb38f18a2edd8a3cee2203686ae9dd9d17e102a20eb643d45a3fa961a8.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/2789d547a05d86f34c1270854290853abbdf90b2850e7509f54e9bcf127af024.json` | Berkas konfigurasi/data: 2789d547a05d86f34c1270854290853abbdf90b2850e7509f54e9bcf127af024.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/27e9ede5d0899a6e6e162ed7357a48d80c514d3b8ba2d244231e51de81024ca0.json` | Berkas konfigurasi/data: 27e9ede5d0899a6e6e162ed7357a48d80c514d3b8ba2d244231e51de81024ca0.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/283ea0abf59db71dc9df25f59a7205aa8aa07de609a957a444a9a8768585c89d.json` | Berkas konfigurasi/data: 283ea0abf59db71dc9df25f59a7205aa8aa07de609a957a444a9a8768585c89d.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/294c5aae5c0372f71957c5a7832a0996e3beac4fa84ea4ff4ee89db715f46ba7.json` | Berkas konfigurasi/data: 294c5aae5c0372f71957c5a7832a0996e3beac4fa84ea4ff4ee89db715f46ba7.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/2be45e122d97a3565763e5bdf60c808d142687b5e2181ca05b777536778ac2fd.json` | Berkas konfigurasi/data: 2be45e122d97a3565763e5bdf60c808d142687b5e2181ca05b777536778ac2fd.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/2ce693bdded69f34759484014db9d6b93e46deca1ab63baa97e926ff938ee918.json` | Berkas konfigurasi/data: 2ce693bdded69f34759484014db9d6b93e46deca1ab63baa97e926ff938ee918.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/2cf39bb52fc49b96f47d40a390b846c5c128a156284a2def5795f118a1538b66.json` | Berkas konfigurasi/data: 2cf39bb52fc49b96f47d40a390b846c5c128a156284a2def5795f118a1538b66.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/2d72e87946c80d711f423324c64bcc943e48b629a51ee7d2207c4b3e05e5c4e5.json` | Berkas konfigurasi/data: 2d72e87946c80d711f423324c64bcc943e48b629a51ee7d2207c4b3e05e5c4e5.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/2f713ccc4782571ddd071c51f7adfdb73ad9e974b0f755a71c7057e2886a5515.json` | Berkas konfigurasi/data: 2f713ccc4782571ddd071c51f7adfdb73ad9e974b0f755a71c7057e2886a5515.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/307e7851ef6da427948dab046118b73f6a65a87d3c437cd283ecf0388a207732.json` | Berkas konfigurasi/data: 307e7851ef6da427948dab046118b73f6a65a87d3c437cd283ecf0388a207732.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/30f4362e4a799c081705ed21f5b2944f69ae319343a7d7f8ed4b22d10f6c4efd.json` | Berkas konfigurasi/data: 30f4362e4a799c081705ed21f5b2944f69ae319343a7d7f8ed4b22d10f6c4efd.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/34759ef7808a5e1fbb74142889bd5cc4fc878719b04846a4ad58dd6a9c8e9f92.json` | Berkas konfigurasi/data: 34759ef7808a5e1fbb74142889bd5cc4fc878719b04846a4ad58dd6a9c8e9f92.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/392288834cc62d097777fe9db3d8a8e8ced2b0981b44b831ba3044a3ad3a48c8.json` | Berkas konfigurasi/data: 392288834cc62d097777fe9db3d8a8e8ced2b0981b44b831ba3044a3ad3a48c8.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/393ed9035b6b110b78faff3f64846252a0c287222f7a8949620fa34d5f6d04cc.json` | Berkas konfigurasi/data: 393ed9035b6b110b78faff3f64846252a0c287222f7a8949620fa34d5f6d04cc.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/39d3405413119e88f36edee1a30297ddbf702633a1892d4170d2e7557902f449.json` | Berkas konfigurasi/data: 39d3405413119e88f36edee1a30297ddbf702633a1892d4170d2e7557902f449.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/39f3089fa8d50f512f03d274c94479323ba12e7c9a5404e05c068d6dc148080c.json` | Berkas konfigurasi/data: 39f3089fa8d50f512f03d274c94479323ba12e7c9a5404e05c068d6dc148080c.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/3c25e68e1de4e34d16e19ace2c460d674b707df78bdda2c0991ce8dcf923e2e0.json` | Berkas konfigurasi/data: 3c25e68e1de4e34d16e19ace2c460d674b707df78bdda2c0991ce8dcf923e2e0.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/3d71a52196fb7dfc4c626c09c4f4ce3d51131d75b7ce8074d8fe164690a6e145.json` | Berkas konfigurasi/data: 3d71a52196fb7dfc4c626c09c4f4ce3d51131d75b7ce8074d8fe164690a6e145.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/3e6a382535f86068ff72e7e7a8660f3aa225fc52e62d416f26125d78fdc68ee7.json` | Berkas konfigurasi/data: 3e6a382535f86068ff72e7e7a8660f3aa225fc52e62d416f26125d78fdc68ee7.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/3e8abbd245e268ced123782c2331304df751b356ada8cce8c40e78b872b9865b.json` | Berkas konfigurasi/data: 3e8abbd245e268ced123782c2331304df751b356ada8cce8c40e78b872b9865b.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/3ec90d727b4bc065cc7c12f9358e65e2738be9796567859d468a2b8b1a8c0099.json` | Berkas konfigurasi/data: 3ec90d727b4bc065cc7c12f9358e65e2738be9796567859d468a2b8b1a8c0099.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/3fc2ca8203f35d202da6bf7c8271a54238073aed5fff05d4bc2425b8bcf4e5fb.json` | Berkas konfigurasi/data: 3fc2ca8203f35d202da6bf7c8271a54238073aed5fff05d4bc2425b8bcf4e5fb.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/400aaa85712920ada52ab16e0ef79a077182ba05be86c0762789a04ce3e236f6.json` | Berkas konfigurasi/data: 400aaa85712920ada52ab16e0ef79a077182ba05be86c0762789a04ce3e236f6.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/40175e5466636a5f6014f24a115fb11cfff28d570bb1db4a065b378ef3e55ea1.json` | Berkas konfigurasi/data: 40175e5466636a5f6014f24a115fb11cfff28d570bb1db4a065b378ef3e55ea1.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/409d014f243866eb25afbcb941da55e184a20079380b3ed067645846930b4467.json` | Berkas konfigurasi/data: 409d014f243866eb25afbcb941da55e184a20079380b3ed067645846930b4467.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/40ae8244a9edb1caf3b09f4c98e17b338071f8ab9157fd3f056dd07532123642.json` | Berkas konfigurasi/data: 40ae8244a9edb1caf3b09f4c98e17b338071f8ab9157fd3f056dd07532123642.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/415d6e41ea12205513aad077615fd1ee5e867347e161095917fb8fdb2e560f5d.json` | Berkas konfigurasi/data: 415d6e41ea12205513aad077615fd1ee5e867347e161095917fb8fdb2e560f5d.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/415fb6d32a08422d3b08b8828c082bd82e70c8244080d60182ac5f478a5398c7.json` | Berkas konfigurasi/data: 415fb6d32a08422d3b08b8828c082bd82e70c8244080d60182ac5f478a5398c7.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/417bea4afdc75e910d5637f811280df9cade40a2afe542639ba379425da30d2e.json` | Berkas konfigurasi/data: 417bea4afdc75e910d5637f811280df9cade40a2afe542639ba379425da30d2e.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/43ee7582bb7f0ad8e0b5b2749ed7c17b84842874ee20c290f3b4c3c2cecde631.json` | Berkas konfigurasi/data: 43ee7582bb7f0ad8e0b5b2749ed7c17b84842874ee20c290f3b4c3c2cecde631.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/43f57f17f3bedeb02679eb2cca101b87ff7e6849dd107eb734ed40e898e69639.json` | Berkas konfigurasi/data: 43f57f17f3bedeb02679eb2cca101b87ff7e6849dd107eb734ed40e898e69639.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/446005d843429565f40bac6e0a619b2d8d38fe02c0b2ed85f155abc6d23c4149.json` | Berkas konfigurasi/data: 446005d843429565f40bac6e0a619b2d8d38fe02c0b2ed85f155abc6d23c4149.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/45b1a852f020da7854b0536f135ad4b2f62f56aaae42e28d0894c577a6d42c3e.json` | Berkas konfigurasi/data: 45b1a852f020da7854b0536f135ad4b2f62f56aaae42e28d0894c577a6d42c3e.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/4721b3039df79c296f8fbf831dba7eca0218da5c017150eecc7fdba63dd2f83f.json` | Berkas konfigurasi/data: 4721b3039df79c296f8fbf831dba7eca0218da5c017150eecc7fdba63dd2f83f.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/49fa4b61d5587f4330830fb87aa6afb395b7a05954f928158b6d752a0530165a.json` | Berkas konfigurasi/data: 49fa4b61d5587f4330830fb87aa6afb395b7a05954f928158b6d752a0530165a.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/4dce287aeb08762769ee0b6265255b3c6e265bdbfc9ba4968705bbc8e52ff719.json` | Berkas konfigurasi/data: 4dce287aeb08762769ee0b6265255b3c6e265bdbfc9ba4968705bbc8e52ff719.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/4defcc288359cac0836bbeedd66a9f7e2f17172e5bbccefc237d4c9e17f3ae41.json` | Berkas konfigurasi/data: 4defcc288359cac0836bbeedd66a9f7e2f17172e5bbccefc237d4c9e17f3ae41.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/4ea5504135f44a2b4b9323010f2a569466325e6385c956764e605f126781b6a4.json` | Berkas konfigurasi/data: 4ea5504135f44a2b4b9323010f2a569466325e6385c956764e605f126781b6a4.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/4ec7c05deb9bf6f6450622e84728400833fce944ded1b8ca14d18807973b29aa.json` | Berkas konfigurasi/data: 4ec7c05deb9bf6f6450622e84728400833fce944ded1b8ca14d18807973b29aa.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/4f7c8b2581ec049fb77e49ba12f926f0bac803b499f1d64e7f545b53cf7f3bb1.json` | Berkas konfigurasi/data: 4f7c8b2581ec049fb77e49ba12f926f0bac803b499f1d64e7f545b53cf7f3bb1.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/510804a740b14bea63ba9fabe788316c26d5c07c357807da062f39b24aab75e9.json` | Berkas konfigurasi/data: 510804a740b14bea63ba9fabe788316c26d5c07c357807da062f39b24aab75e9.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/51a2bcbfdb1440e10f22cad6ce79d410b99761819d6c986619ee1b83047d8f84.json` | Berkas konfigurasi/data: 51a2bcbfdb1440e10f22cad6ce79d410b99761819d6c986619ee1b83047d8f84.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/52e6c190bbc9c81cd7565ee42991c1db1eb27cf06a3f8260271b17134a365e60.json` | Berkas konfigurasi/data: 52e6c190bbc9c81cd7565ee42991c1db1eb27cf06a3f8260271b17134a365e60.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/52f318c5908c83f9fcb4c664f494fab2ec3279e660d3e36c2ab86c123ce2b08c.json` | Berkas konfigurasi/data: 52f318c5908c83f9fcb4c664f494fab2ec3279e660d3e36c2ab86c123ce2b08c.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/549996f576ad16cbb3fc6241840a1d50fa4773a34df812e529ef4f3943a92d27.json` | Berkas konfigurasi/data: 549996f576ad16cbb3fc6241840a1d50fa4773a34df812e529ef4f3943a92d27.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/56a903c66f4395cf3648f398e89779a08c08fead3649cb2cb3438def4500ca1e.json` | Berkas konfigurasi/data: 56a903c66f4395cf3648f398e89779a08c08fead3649cb2cb3438def4500ca1e.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/5778289e771e51c832d60901cb2c6de9a6634cfc4ce05d04e264ffd5b3331857.json` | Berkas konfigurasi/data: 5778289e771e51c832d60901cb2c6de9a6634cfc4ce05d04e264ffd5b3331857.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/595dfe13367bc6436e057aeae1f284b8c03ee9b9cdad981ea356e9050aada183.json` | Berkas konfigurasi/data: 595dfe13367bc6436e057aeae1f284b8c03ee9b9cdad981ea356e9050aada183.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/5ac070818e2b1caab629b433679a09c1ad1e0896fe1f08f78acb375be58ab5ca.json` | Berkas konfigurasi/data: 5ac070818e2b1caab629b433679a09c1ad1e0896fe1f08f78acb375be58ab5ca.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/5ca96f51e3ba3aed785b87383040f5715408c402e536df1f22b29a4f6a2824ea.json` | Berkas konfigurasi/data: 5ca96f51e3ba3aed785b87383040f5715408c402e536df1f22b29a4f6a2824ea.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/5cc0c06e0a02bf85259a43159bfe97dedf4de8bb37332fe14ea103faee1cae39.json` | Berkas konfigurasi/data: 5cc0c06e0a02bf85259a43159bfe97dedf4de8bb37332fe14ea103faee1cae39.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/5e0082c2680223fbae7f5b11e5c8bb9571448290104cf2b96f275c19310a46da.json` | Berkas konfigurasi/data: 5e0082c2680223fbae7f5b11e5c8bb9571448290104cf2b96f275c19310a46da.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/5edea7a02dbff83a6b27ff4bf5098d0ce4924353024242b09548910836a838e1.json` | Berkas konfigurasi/data: 5edea7a02dbff83a6b27ff4bf5098d0ce4924353024242b09548910836a838e1.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/6083e9bb3986cd8b49f8010798c06616bd3e8f62e7fe6b4cad41eae26291e785.json` | Berkas konfigurasi/data: 6083e9bb3986cd8b49f8010798c06616bd3e8f62e7fe6b4cad41eae26291e785.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/60d16d668ad352463624adccd201c231880c78f2920479458ce495d44ca80821.json` | Berkas konfigurasi/data: 60d16d668ad352463624adccd201c231880c78f2920479458ce495d44ca80821.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/644c37dd890c74841527fe3a47da88fe4a8ce91d975f564a408602de6feccfaa.json` | Berkas konfigurasi/data: 644c37dd890c74841527fe3a47da88fe4a8ce91d975f564a408602de6feccfaa.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/65ea868b85f7f48381ae4aca99f74591093223a3d7000a5d2d4b0c23471d21e8.json` | Berkas konfigurasi/data: 65ea868b85f7f48381ae4aca99f74591093223a3d7000a5d2d4b0c23471d21e8.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/68ae10e67d938a08b4ce18033b67384b2d89dab93cdc6bb20365c2c178b19b3c.json` | Berkas konfigurasi/data: 68ae10e67d938a08b4ce18033b67384b2d89dab93cdc6bb20365c2c178b19b3c.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/68f796ab23624006eb492d1c8ab493043f28936f5eeb0a282b0d4c14d3ff74c2.json` | Berkas konfigurasi/data: 68f796ab23624006eb492d1c8ab493043f28936f5eeb0a282b0d4c14d3ff74c2.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/6995f115d32febad9af9969fb392efbec7215512e7a1ab20ff04f4ca0ffc797e.json` | Berkas konfigurasi/data: 6995f115d32febad9af9969fb392efbec7215512e7a1ab20ff04f4ca0ffc797e.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/6a06187374b6c8495c8139d3d3bd6d5c8b1000b75df7f458edc3b58074a21c9f.json` | Berkas konfigurasi/data: 6a06187374b6c8495c8139d3d3bd6d5c8b1000b75df7f458edc3b58074a21c9f.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/6a4a044f13fe5f04726b94ef6eeee4497c4406045385eb5642fa7100baea99f0.json` | Berkas konfigurasi/data: 6a4a044f13fe5f04726b94ef6eeee4497c4406045385eb5642fa7100baea99f0.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/6a558da54f5cfa87b87e57be4c147ae9740e3195e113797f8159760342e58398.json` | Berkas konfigurasi/data: 6a558da54f5cfa87b87e57be4c147ae9740e3195e113797f8159760342e58398.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/6d734ea6fe4acbc1f0aaa03894994829382164a5be367acef5f35cc7944c5a01.json` | Berkas konfigurasi/data: 6d734ea6fe4acbc1f0aaa03894994829382164a5be367acef5f35cc7944c5a01.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/6df05432dedf4be10035e2a46da96aa9dc0d01c8f7b9507e1e8125a03d6d186f.json` | Berkas konfigurasi/data: 6df05432dedf4be10035e2a46da96aa9dc0d01c8f7b9507e1e8125a03d6d186f.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/6f947afd4962bd038d45259e55ff61acb6a0cc3b2489b3cce6fa3c32de0bebb1.json` | Berkas konfigurasi/data: 6f947afd4962bd038d45259e55ff61acb6a0cc3b2489b3cce6fa3c32de0bebb1.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/71b3759fff32f7ce5af3b98ff49f73164e16551dc99a194b096c5e70cd64fdcd.json` | Berkas konfigurasi/data: 71b3759fff32f7ce5af3b98ff49f73164e16551dc99a194b096c5e70cd64fdcd.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/72515e72409d7b8b93dd87bc71a423bd64df5ab48e1d6e82c06ca37720bfe564.json` | Berkas konfigurasi/data: 72515e72409d7b8b93dd87bc71a423bd64df5ab48e1d6e82c06ca37720bfe564.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/74925a0d7c79b20ae1bad4046d2e3a9e1589adcb11a45111ca6cdf139ede8797.json` | Berkas konfigurasi/data: 74925a0d7c79b20ae1bad4046d2e3a9e1589adcb11a45111ca6cdf139ede8797.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/749dd8e48f11cd9cc0985276e457a5f6c31c2a5efd92ae9fe4ea3d2d8fc583cd.json` | Berkas konfigurasi/data: 749dd8e48f11cd9cc0985276e457a5f6c31c2a5efd92ae9fe4ea3d2d8fc583cd.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/74ef16a01ec5ea78e146333345b29ad3e2623b3fd9e6bcaf2d571d3cb459d57c.json` | Berkas konfigurasi/data: 74ef16a01ec5ea78e146333345b29ad3e2623b3fd9e6bcaf2d571d3cb459d57c.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/7692f9d603f13961b2d4284a639e67a9ea3a4c7e3d5f88e66f6cb58b7fb7e09d.json` | Berkas konfigurasi/data: 7692f9d603f13961b2d4284a639e67a9ea3a4c7e3d5f88e66f6cb58b7fb7e09d.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/76c2ccf3df26d768ddeda5f28fd4f63c069dff2952db0763ed8d55a32f6d407a.json` | Berkas konfigurasi/data: 76c2ccf3df26d768ddeda5f28fd4f63c069dff2952db0763ed8d55a32f6d407a.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/788ea3bdf9250d776fce8ffa083eb34b61ad2a22e2abccc2e1864e8e46a93f25.json` | Berkas konfigurasi/data: 788ea3bdf9250d776fce8ffa083eb34b61ad2a22e2abccc2e1864e8e46a93f25.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/79a9466e28c3288a18f8bc8381621377e0006c0c6bc31d03c9348061ce140739.json` | Berkas konfigurasi/data: 79a9466e28c3288a18f8bc8381621377e0006c0c6bc31d03c9348061ce140739.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/79de188de9bfb24b8f97c6a62f8a64219415e5c6974b553b0fc49d8a9773a5f9.json` | Berkas konfigurasi/data: 79de188de9bfb24b8f97c6a62f8a64219415e5c6974b553b0fc49d8a9773a5f9.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/79f352adb3b43b119f70580bbf9501ff08a48e4969bed34334a85dfb28d5fa30.json` | Berkas konfigurasi/data: 79f352adb3b43b119f70580bbf9501ff08a48e4969bed34334a85dfb28d5fa30.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/7b1a99dd68dd0f1a8c0193e0be41f74dbd1ba003e1d6ee0c4e072aa01ba71d09.json` | Berkas konfigurasi/data: 7b1a99dd68dd0f1a8c0193e0be41f74dbd1ba003e1d6ee0c4e072aa01ba71d09.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/7be570c0b34e44cf4316bc7495a5e09dbed6bc3d6b7c1806196fd71d58a3c361.json` | Berkas konfigurasi/data: 7be570c0b34e44cf4316bc7495a5e09dbed6bc3d6b7c1806196fd71d58a3c361.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/7f1b580539a6f71600ef7b0b37a731e164c3ad28594aa6a64fdd352b3a7877a0.json` | Berkas konfigurasi/data: 7f1b580539a6f71600ef7b0b37a731e164c3ad28594aa6a64fdd352b3a7877a0.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/7f999356fb206d81ca32e12d7093be1006ed7e3ded62858dc34d709ec4cd11a7.json` | Berkas konfigurasi/data: 7f999356fb206d81ca32e12d7093be1006ed7e3ded62858dc34d709ec4cd11a7.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/821c285245b7d8329972be4958ff1cb1529f5bcd2cf6ea6877b742ae6ac2c0ab.json` | Berkas konfigurasi/data: 821c285245b7d8329972be4958ff1cb1529f5bcd2cf6ea6877b742ae6ac2c0ab.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/8374e8d91d71105021bbf8d50429281be5182613e30eda9df13af6a549892540.json` | Berkas konfigurasi/data: 8374e8d91d71105021bbf8d50429281be5182613e30eda9df13af6a549892540.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/83e6fb850cc11a4031ee12d9e724ef5d6b33099a00e6b17c0e8a8bda45238a40.json` | Berkas konfigurasi/data: 83e6fb850cc11a4031ee12d9e724ef5d6b33099a00e6b17c0e8a8bda45238a40.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/8667ea5df745d4865b692accdc6579faee3f9d506ecb45e6403055809162a2df.json` | Berkas konfigurasi/data: 8667ea5df745d4865b692accdc6579faee3f9d506ecb45e6403055809162a2df.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/873b35453c036cf57a5f6d8eaa3af55bacfa6acba4463ff017fec5e33a05aa45.json` | Berkas konfigurasi/data: 873b35453c036cf57a5f6d8eaa3af55bacfa6acba4463ff017fec5e33a05aa45.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/8a3d32dc5605f93683b53d9b99e74f4ed0b868c3cb385809eae9071faf403cd2.json` | Berkas konfigurasi/data: 8a3d32dc5605f93683b53d9b99e74f4ed0b868c3cb385809eae9071faf403cd2.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/8db7ef2b240928af944d7beb03fb7a05b049971f65e19cee083ed9b46d3737dd.json` | Berkas konfigurasi/data: 8db7ef2b240928af944d7beb03fb7a05b049971f65e19cee083ed9b46d3737dd.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/8e53e76c2a374cc1578c37454427a8f4973518cc5113102731342ff15ea068ea.json` | Berkas konfigurasi/data: 8e53e76c2a374cc1578c37454427a8f4973518cc5113102731342ff15ea068ea.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/8e7e522b3ebd2f8717165b37367370aff6376b65fcdf5589fecfc37b62e369b2.json` | Berkas konfigurasi/data: 8e7e522b3ebd2f8717165b37367370aff6376b65fcdf5589fecfc37b62e369b2.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/8ed28154565eab6d19bb57e870e90ad6bd578917fa53f897c7ebd73478bf1c92.json` | Berkas konfigurasi/data: 8ed28154565eab6d19bb57e870e90ad6bd578917fa53f897c7ebd73478bf1c92.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/8f4293d48f6fa85e98c2999b52133f8b3f3de4db75bdc40e57ccdea75a13af6f.json` | Berkas konfigurasi/data: 8f4293d48f6fa85e98c2999b52133f8b3f3de4db75bdc40e57ccdea75a13af6f.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/8ffd52a2021846ac4d78027b37ea5a97aa0e92afaee941182014ece7448d25b0.json` | Berkas konfigurasi/data: 8ffd52a2021846ac4d78027b37ea5a97aa0e92afaee941182014ece7448d25b0.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/914be5a2f16230324d59d217a0d1374d9358291e384d322b70466b24b0b99979.json` | Berkas konfigurasi/data: 914be5a2f16230324d59d217a0d1374d9358291e384d322b70466b24b0b99979.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/92849f8486b0ecd6379016c72bef0664b123b9f76b3d1dc45a168bd1436eb470.json` | Berkas konfigurasi/data: 92849f8486b0ecd6379016c72bef0664b123b9f76b3d1dc45a168bd1436eb470.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/929b62df25ec146a449391f0d8120bc1fe047840f56cac463620405b60c011c2.json` | Berkas konfigurasi/data: 929b62df25ec146a449391f0d8120bc1fe047840f56cac463620405b60c011c2.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/954cda0d6881b167cb61156847dc3406282bbcdbbe357f1da6c8ab5584ecde5e.json` | Berkas konfigurasi/data: 954cda0d6881b167cb61156847dc3406282bbcdbbe357f1da6c8ab5584ecde5e.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/965f1004556d8b659e4ebf6c04f11e34c91a802b9a93a803948ee174db73c484.json` | Berkas konfigurasi/data: 965f1004556d8b659e4ebf6c04f11e34c91a802b9a93a803948ee174db73c484.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/9750e1ddfb13ca628dbefbb71b829863e59a47058b483759649b37d4ee9c988d.json` | Berkas konfigurasi/data: 9750e1ddfb13ca628dbefbb71b829863e59a47058b483759649b37d4ee9c988d.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/97ebcaa9982e4e76cb9c4bc15f2231b8212e4b48ea66d01c1f481fb4c8542390.json` | Berkas konfigurasi/data: 97ebcaa9982e4e76cb9c4bc15f2231b8212e4b48ea66d01c1f481fb4c8542390.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/9898f269106a5ade011714963ba572ae349df20ffbae9e339bbd656bd77beea4.json` | Berkas konfigurasi/data: 9898f269106a5ade011714963ba572ae349df20ffbae9e339bbd656bd77beea4.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/9b4f4733d9c949543d71b63a79eda7b3918446624d822685be95e7cef460e9a9.json` | Berkas konfigurasi/data: 9b4f4733d9c949543d71b63a79eda7b3918446624d822685be95e7cef460e9a9.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/9bb4bd0821a9125f6711b97c36c9740e547361a591cc4edb98c31e29942b364a.json` | Berkas konfigurasi/data: 9bb4bd0821a9125f6711b97c36c9740e547361a591cc4edb98c31e29942b364a.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/9bbbc442be21ffd3d8d4e53bc97159c5b72a22c20f619adaaf40fabb96df9a70.json` | Berkas konfigurasi/data: 9bbbc442be21ffd3d8d4e53bc97159c5b72a22c20f619adaaf40fabb96df9a70.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/9c46092fc984606c65854124bd568119163f2055eb00be4c102e0d327df2995f.json` | Berkas konfigurasi/data: 9c46092fc984606c65854124bd568119163f2055eb00be4c102e0d327df2995f.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/a050c3343b9dee4b55b70062ce34010fb240581cb90701599acdfbc9bb3b26a7.json` | Berkas konfigurasi/data: a050c3343b9dee4b55b70062ce34010fb240581cb90701599acdfbc9bb3b26a7.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/a0654bce31d6dca807af7431732eacc705a3bb95330990252af7d683f92577e7.json` | Berkas konfigurasi/data: a0654bce31d6dca807af7431732eacc705a3bb95330990252af7d683f92577e7.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/a0f1b470e4be22706cead29b96b9adb8d1df79e4a9a1edb4a437addfdcacb303.json` | Berkas konfigurasi/data: a0f1b470e4be22706cead29b96b9adb8d1df79e4a9a1edb4a437addfdcacb303.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/a1a20bf1c75c40e65829ffaeaf1361ac5382a80429241ab389bcc737368eb468.json` | Berkas konfigurasi/data: a1a20bf1c75c40e65829ffaeaf1361ac5382a80429241ab389bcc737368eb468.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/a1f37e9fe537946fa50f4b1f7fe28b1674a70efbddaf659093fa6e05c121ce8f.json` | Berkas konfigurasi/data: a1f37e9fe537946fa50f4b1f7fe28b1674a70efbddaf659093fa6e05c121ce8f.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/a21d91997bb30de160995fd584bf40d9473049515561391b43ccca65bf7a7026.json` | Berkas konfigurasi/data: a21d91997bb30de160995fd584bf40d9473049515561391b43ccca65bf7a7026.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/a3f6c03a47c521f9d442d961098bc64a7019f6ec3676ac655b3986f98f82fcb9.json` | Berkas konfigurasi/data: a3f6c03a47c521f9d442d961098bc64a7019f6ec3676ac655b3986f98f82fcb9.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/a4acddfb288d4dcc00891618f2247c904106235c6420cf13aa8afde31f2b5f59.json` | Berkas konfigurasi/data: a4acddfb288d4dcc00891618f2247c904106235c6420cf13aa8afde31f2b5f59.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/a53afa6e3d056e3798ef6101cdb9b8310054319520150dc46d23ec5bc20173e7.json` | Berkas konfigurasi/data: a53afa6e3d056e3798ef6101cdb9b8310054319520150dc46d23ec5bc20173e7.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/a7469aff7ba86c360ce17211813ec9005ab35ad3130764f382e8d147c1fded65.json` | Berkas konfigurasi/data: a7469aff7ba86c360ce17211813ec9005ab35ad3130764f382e8d147c1fded65.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/a953d077b13f78cd5711e78f0f08e5e13d2719942eb59e88d9c00944b6d21a94.json` | Berkas konfigurasi/data: a953d077b13f78cd5711e78f0f08e5e13d2719942eb59e88d9c00944b6d21a94.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/a95f7494d7b8cd68323ad67a8aed5d07d453ba7f1650745a7c4133b96632bfb9.json` | Berkas konfigurasi/data: a95f7494d7b8cd68323ad67a8aed5d07d453ba7f1650745a7c4133b96632bfb9.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/a9636ae567efb025cc557cdd15817edbb6f5743c1da5c73e8ad2bb4c3baf4095.json` | Berkas konfigurasi/data: a9636ae567efb025cc557cdd15817edbb6f5743c1da5c73e8ad2bb4c3baf4095.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/aab7e247a10b7c90e8037f3e36d4d0f869dccd1971aefbf6addd214b3e93b2d8.json` | Berkas konfigurasi/data: aab7e247a10b7c90e8037f3e36d4d0f869dccd1971aefbf6addd214b3e93b2d8.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/ab6afb5247e8d0bee08c8c70abfd19bb07bb927174be069bd328ad0716421651.json` | Berkas konfigurasi/data: ab6afb5247e8d0bee08c8c70abfd19bb07bb927174be069bd328ad0716421651.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/abb5a9dc4afaf739918bf6f4b514643e2ddb2d2820bc03f204e145d6ab26f4d5.json` | Berkas konfigurasi/data: abb5a9dc4afaf739918bf6f4b514643e2ddb2d2820bc03f204e145d6ab26f4d5.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/ac198e9e202a2c167cba05a7536a9263ff884c4e5346fc43e757afd0820705ad.json` | Berkas konfigurasi/data: ac198e9e202a2c167cba05a7536a9263ff884c4e5346fc43e757afd0820705ad.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/ac5b2d6a1d18d74d29403a785bbbcb561a3101420df631a5cfd8b251e1b9688e.json` | Berkas konfigurasi/data: ac5b2d6a1d18d74d29403a785bbbcb561a3101420df631a5cfd8b251e1b9688e.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/ad92deb50e45a1c0cd81fec31add83450e98c515a3fc6d6d0f8182ce80d8b8d5.json` | Berkas konfigurasi/data: ad92deb50e45a1c0cd81fec31add83450e98c515a3fc6d6d0f8182ce80d8b8d5.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/ae3ebc3b9e82fb0bf379188aa08152ecc1dc5552a79e18730616a17778c30b65.json` | Berkas konfigurasi/data: ae3ebc3b9e82fb0bf379188aa08152ecc1dc5552a79e18730616a17778c30b65.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/ae4e4c53c5d81450faa68c684e3bdd0da7780b5b2dac55c04b67fd7a8f673e63.json` | Berkas konfigurasi/data: ae4e4c53c5d81450faa68c684e3bdd0da7780b5b2dac55c04b67fd7a8f673e63.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/aea3ab639c60ca9945e306622581880ce383e82bdb8e12d7a2f85f377b6ebece.json` | Berkas konfigurasi/data: aea3ab639c60ca9945e306622581880ce383e82bdb8e12d7a2f85f377b6ebece.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/aeca83d77bda7a6c71499cb61fde545ff9dccd064f3b4227293db0e6da635b25.json` | Berkas konfigurasi/data: aeca83d77bda7a6c71499cb61fde545ff9dccd064f3b4227293db0e6da635b25.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/b0ca40becba68950f62d6a59d97e2a6c28fd24bdf20f5f806a29ab312e5bb9f0.json` | Berkas konfigurasi/data: b0ca40becba68950f62d6a59d97e2a6c28fd24bdf20f5f806a29ab312e5bb9f0.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/b1165dc84f25b8e22d8626d194ea86444d6311304ce7ccc443320ac80e197f5c.json` | Berkas konfigurasi/data: b1165dc84f25b8e22d8626d194ea86444d6311304ce7ccc443320ac80e197f5c.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/b266d162dfc3f341583d027aa8fc822f95d94f070d2207f02f87ff01b6eac938.json` | Berkas konfigurasi/data: b266d162dfc3f341583d027aa8fc822f95d94f070d2207f02f87ff01b6eac938.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/b27f445cd0a5176f168b482e1c3ea0bc64970ad325637b9df99e6610189e5f92.json` | Berkas konfigurasi/data: b27f445cd0a5176f168b482e1c3ea0bc64970ad325637b9df99e6610189e5f92.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/b4ae28951cdae54488af5b2d8569f7b015c1f0690d936a693178e9b05139c91b.json` | Berkas konfigurasi/data: b4ae28951cdae54488af5b2d8569f7b015c1f0690d936a693178e9b05139c91b.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/b50a5933203b7145ef26dfc2144e26e999bb7e9524348e7158a4fce575f1849a.json` | Berkas konfigurasi/data: b50a5933203b7145ef26dfc2144e26e999bb7e9524348e7158a4fce575f1849a.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/b65daef439a86365bb2c7b4e33e3a2cbd5c0256f99a8edb985df3a721e666325.json` | Berkas konfigurasi/data: b65daef439a86365bb2c7b4e33e3a2cbd5c0256f99a8edb985df3a721e666325.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/b6ff5a846e52a291e33c4f0906a19939d7d43f0a5fff902299599b77098266df.json` | Berkas konfigurasi/data: b6ff5a846e52a291e33c4f0906a19939d7d43f0a5fff902299599b77098266df.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/b8af66c08f4ca969f66531285f2439e021969f9d4a71b8b359cd77b79f0d42d5.json` | Berkas konfigurasi/data: b8af66c08f4ca969f66531285f2439e021969f9d4a71b8b359cd77b79f0d42d5.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/badcca872e3af8cbe3e4a77afa3791c697dc252dd2d53e265c7ad7e2adb75f8b.json` | Berkas konfigurasi/data: badcca872e3af8cbe3e4a77afa3791c697dc252dd2d53e265c7ad7e2adb75f8b.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/bb0912c44e38d5a9b850428b402063603b9360cad841f3688dc467bb9ae09d12.json` | Berkas konfigurasi/data: bb0912c44e38d5a9b850428b402063603b9360cad841f3688dc467bb9ae09d12.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/bbd453af61106d51ac34c78fbbab42c0a5098434227b3a0b45cb60618bd86118.json` | Berkas konfigurasi/data: bbd453af61106d51ac34c78fbbab42c0a5098434227b3a0b45cb60618bd86118.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/bd408c99e32221b5d2f3b76cfd6bf9ea4587ca5ce64c4bc998f44fa546dcc033.json` | Berkas konfigurasi/data: bd408c99e32221b5d2f3b76cfd6bf9ea4587ca5ce64c4bc998f44fa546dcc033.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/be2258a41f8448f275cc228d8c4ba5a7c92e5ec6c11e88f4019385e4754442c0.json` | Berkas konfigurasi/data: be2258a41f8448f275cc228d8c4ba5a7c92e5ec6c11e88f4019385e4754442c0.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/c1251bf2712998efc433c7f896c67d9b6c830ee4a6466f6cf1a63c24f3563181.json` | Berkas konfigurasi/data: c1251bf2712998efc433c7f896c67d9b6c830ee4a6466f6cf1a63c24f3563181.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/c14bbe04ced9784f1998d02022890365093608699c568d96f6347b30d0606b0e.json` | Berkas konfigurasi/data: c14bbe04ced9784f1998d02022890365093608699c568d96f6347b30d0606b0e.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/c2039050c2b6a340028391a1b794db9a7e462e64af00c5c91f76fe6291ab185b.json` | Berkas konfigurasi/data: c2039050c2b6a340028391a1b794db9a7e462e64af00c5c91f76fe6291ab185b.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/c20f8e8b45599ee7cb511ae4973d7e4e9e272d36cc04191842b15cdbe9ebe33a.json` | Berkas konfigurasi/data: c20f8e8b45599ee7cb511ae4973d7e4e9e272d36cc04191842b15cdbe9ebe33a.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/c31c10b65cfb459cae2e6bd203a05f51c5d9e8d0e219d24f97ddbbacf1909898.json` | Berkas konfigurasi/data: c31c10b65cfb459cae2e6bd203a05f51c5d9e8d0e219d24f97ddbbacf1909898.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/c5d580ba23a6f0ef0457f877a3ebe575881cf484a6374bdcb70c8f0bcf35435a.json` | Berkas konfigurasi/data: c5d580ba23a6f0ef0457f877a3ebe575881cf484a6374bdcb70c8f0bcf35435a.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/c6248c1d37d3aeb485b69c146772d614094e3f25b6ef2c6849366044f91e63df.json` | Berkas konfigurasi/data: c6248c1d37d3aeb485b69c146772d614094e3f25b6ef2c6849366044f91e63df.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/c649b8771f4f4f0035c2c7184a87285d3cfc9b8198408c4fd32468cc78b7cc55.json` | Berkas konfigurasi/data: c649b8771f4f4f0035c2c7184a87285d3cfc9b8198408c4fd32468cc78b7cc55.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/c6ccb4e64842da20b3150578e92b754d73c9de20752a2ef5341f8a9d887b67e4.json` | Berkas konfigurasi/data: c6ccb4e64842da20b3150578e92b754d73c9de20752a2ef5341f8a9d887b67e4.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/c73a800fa3256615bdf8b8514cacdfa3441f14aa679d291b76c1e00b78e5ce7f.json` | Berkas konfigurasi/data: c73a800fa3256615bdf8b8514cacdfa3441f14aa679d291b76c1e00b78e5ce7f.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/c7f017d6d56e52bfba99ea3517cfad97ff7c87121d1ed1fed5054a06783bf278.json` | Berkas konfigurasi/data: c7f017d6d56e52bfba99ea3517cfad97ff7c87121d1ed1fed5054a06783bf278.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/c845c5e728c89d56c0313e5ebd33582955a0e245999d18d21078b5694efc7c92.json` | Berkas konfigurasi/data: c845c5e728c89d56c0313e5ebd33582955a0e245999d18d21078b5694efc7c92.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/c8a7017d0bd7dd17bb06214acd1f7d51259c22d3ee0b267bcafc53f21ced158a.json` | Berkas konfigurasi/data: c8a7017d0bd7dd17bb06214acd1f7d51259c22d3ee0b267bcafc53f21ced158a.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/c9ea53d00944f914d4e9d92db77ef4d32f9be4d267ea76cf08a9c8abf97b4542.json` | Berkas konfigurasi/data: c9ea53d00944f914d4e9d92db77ef4d32f9be4d267ea76cf08a9c8abf97b4542.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/c9f75b33769062775c9aa2f0606d1a5cb068eb0fa2ad09ab90f32989e301d953.json` | Berkas konfigurasi/data: c9f75b33769062775c9aa2f0606d1a5cb068eb0fa2ad09ab90f32989e301d953.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/ca25897fa26385663168196c84037f87aade4047407d9767a46617fb4c3429d3.json` | Berkas konfigurasi/data: ca25897fa26385663168196c84037f87aade4047407d9767a46617fb4c3429d3.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/cb36c3f15461bcf82a860194584305ae78ea6518cd4588edf0ec352c41eb293b.json` | Berkas konfigurasi/data: cb36c3f15461bcf82a860194584305ae78ea6518cd4588edf0ec352c41eb293b.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/cb513e6f6196c0d176511f06f647a543f46689875a4e7bef4866411d8841e072.json` | Berkas konfigurasi/data: cb513e6f6196c0d176511f06f647a543f46689875a4e7bef4866411d8841e072.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/cb93948bbf0278c5f73a9d485f47f2cf508af92dff8e618f71a02bb9a8c9a01c.json` | Berkas konfigurasi/data: cb93948bbf0278c5f73a9d485f47f2cf508af92dff8e618f71a02bb9a8c9a01c.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/cc0cdb0691b063c3b578d0a9224f47922e8dcc631c035f4cdafb198aa4a48a6b.json` | Berkas konfigurasi/data: cc0cdb0691b063c3b578d0a9224f47922e8dcc631c035f4cdafb198aa4a48a6b.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/cc24e525fb8506e4e6ad2675d1f688646840fb02cc5733067b3e475f2ca0dfcd.json` | Berkas konfigurasi/data: cc24e525fb8506e4e6ad2675d1f688646840fb02cc5733067b3e475f2ca0dfcd.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/cd6221ad61a4c5c8a609f61820d35e38834ad6f467f0f5fb4e6c792a414220cd.json` | Berkas konfigurasi/data: cd6221ad61a4c5c8a609f61820d35e38834ad6f467f0f5fb4e6c792a414220cd.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/cd8ed9311504a4eca6f80120217aafdd44e15e306b801ea36438da974ec442ec.json` | Berkas konfigurasi/data: cd8ed9311504a4eca6f80120217aafdd44e15e306b801ea36438da974ec442ec.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/cec97b44635b3be151686ee0b64c8342766925c083416ab9bf57039d8614f436.json` | Berkas konfigurasi/data: cec97b44635b3be151686ee0b64c8342766925c083416ab9bf57039d8614f436.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/d0266d59605d77fc6acd2eff05a73d5e68268fdd1dc9dd171bd0f31898460bf6.json` | Berkas konfigurasi/data: d0266d59605d77fc6acd2eff05a73d5e68268fdd1dc9dd171bd0f31898460bf6.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/d0dae69043b318b9e4b64d0726c38c02f757787cf32a2916816c9b4b227e2ae8.json` | Berkas konfigurasi/data: d0dae69043b318b9e4b64d0726c38c02f757787cf32a2916816c9b4b227e2ae8.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/d1388ae59a92f4b5c12a8a46485dc08e954d38bd75af597cde9eb69f5243bdc5.json` | Berkas konfigurasi/data: d1388ae59a92f4b5c12a8a46485dc08e954d38bd75af597cde9eb69f5243bdc5.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/d27b7eaf31e9000d2898e5821bf135c2d6f669297ce8f3aba8bd9b921ea3c276.json` | Berkas konfigurasi/data: d27b7eaf31e9000d2898e5821bf135c2d6f669297ce8f3aba8bd9b921ea3c276.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/d5b2cc12ac4a9895aeaeb42e4c0fb9195bc8b82f9b42776def3ea9d838acef4c.json` | Berkas konfigurasi/data: d5b2cc12ac4a9895aeaeb42e4c0fb9195bc8b82f9b42776def3ea9d838acef4c.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/d5e4b7e2d89b8e66d9443c86050c6cc085dd7425c515adc13fb4289981ffe68d.json` | Berkas konfigurasi/data: d5e4b7e2d89b8e66d9443c86050c6cc085dd7425c515adc13fb4289981ffe68d.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/d680dc379e322cb8b20983355341900994cedee538b18810ec1ef0de3aabefec.json` | Berkas konfigurasi/data: d680dc379e322cb8b20983355341900994cedee538b18810ec1ef0de3aabefec.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/d6b1ee42ff3da43e0b12105d27d216317d577e6c0ce99016cf9d11a8ae6fe308.json` | Berkas konfigurasi/data: d6b1ee42ff3da43e0b12105d27d216317d577e6c0ce99016cf9d11a8ae6fe308.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/d77bb30b56633b6e158d4813f7cd405e40b765cc0c4a73cef6a8e6b97b04916c.json` | Berkas konfigurasi/data: d77bb30b56633b6e158d4813f7cd405e40b765cc0c4a73cef6a8e6b97b04916c.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/da4e396e2f9fde672d1d8a0f919d93c7e20b41c6792b6e265b8d390532dc64b3.json` | Berkas konfigurasi/data: da4e396e2f9fde672d1d8a0f919d93c7e20b41c6792b6e265b8d390532dc64b3.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/dc46000d805f320f5b9242b2f22975486067134c60a5dfee226c65ae7618782a.json` | Berkas konfigurasi/data: dc46000d805f320f5b9242b2f22975486067134c60a5dfee226c65ae7618782a.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/dcc03fb71fa308aca9c762f55b622d3f5f3ea08e2a3774c5d7c8d41953470f12.json` | Berkas konfigurasi/data: dcc03fb71fa308aca9c762f55b622d3f5f3ea08e2a3774c5d7c8d41953470f12.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/dde9e4652beaa0bcbff127140d337d3eb531765e55bfef79d6b6367f9b37d3f8.json` | Berkas konfigurasi/data: dde9e4652beaa0bcbff127140d337d3eb531765e55bfef79d6b6367f9b37d3f8.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/e003cd3041aa2a25cd79581b92550837b996d2f758820cb39dfeb5acc19251f5.json` | Berkas konfigurasi/data: e003cd3041aa2a25cd79581b92550837b996d2f758820cb39dfeb5acc19251f5.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/e19acb104b9c9f09b8c39c5c68ff1a3e1e5b57763b9da5ecefcc03a5d5943a8e.json` | Berkas konfigurasi/data: e19acb104b9c9f09b8c39c5c68ff1a3e1e5b57763b9da5ecefcc03a5d5943a8e.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/e2acfc12f22f7f5e4b6c1fbdc74b43343690593796351387fe9bafff662c892e.json` | Berkas konfigurasi/data: e2acfc12f22f7f5e4b6c1fbdc74b43343690593796351387fe9bafff662c892e.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/e2d6bd50a6fb7c3a3019f31e259fffbac4a007c5a2e6b9882fb65745cb2d75c7.json` | Berkas konfigurasi/data: e2d6bd50a6fb7c3a3019f31e259fffbac4a007c5a2e6b9882fb65745cb2d75c7.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/e42605c7f7e49ec49926b65a39ce05b6c6a61727ea8725e2f598522195c1878f.json` | Berkas konfigurasi/data: e42605c7f7e49ec49926b65a39ce05b6c6a61727ea8725e2f598522195c1878f.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/e430e4d104befd38242411714fea123547afc1f42964b6e6780481d0b3d34c37.json` | Berkas konfigurasi/data: e430e4d104befd38242411714fea123547afc1f42964b6e6780481d0b3d34c37.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/e6080c2e950cb9396433e9c6183d6085666c1e5510674ecff6aa684b220aa9c6.json` | Berkas konfigurasi/data: e6080c2e950cb9396433e9c6183d6085666c1e5510674ecff6aa684b220aa9c6.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/e66a842c18b56425fcc744ad1e3d1afc5944edb06663589f6b09398a1266b2cd.json` | Berkas konfigurasi/data: e66a842c18b56425fcc744ad1e3d1afc5944edb06663589f6b09398a1266b2cd.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/e6af01d35df3ad8566ee315d07091a52ded24a9332c47c1d11875b8c38baba65.json` | Berkas konfigurasi/data: e6af01d35df3ad8566ee315d07091a52ded24a9332c47c1d11875b8c38baba65.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/e6c3afaea9c7c86ebb1f7d7f4adf9895a658c18fdc09622948cb7c333035e4cf.json` | Berkas konfigurasi/data: e6c3afaea9c7c86ebb1f7d7f4adf9895a658c18fdc09622948cb7c333035e4cf.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/e7534e855b553d3ffec613a75794a4259d3884e795dc422692a9895d83ca851f.json` | Berkas konfigurasi/data: e7534e855b553d3ffec613a75794a4259d3884e795dc422692a9895d83ca851f.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/e98ffb7367e3f2743ed5553ffd5b9fddffad8dd211dc5be771b81e05f7343389.json` | Berkas konfigurasi/data: e98ffb7367e3f2743ed5553ffd5b9fddffad8dd211dc5be771b81e05f7343389.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/eb51296f6967215c29bbcbc86b95d4db89b126e06d2e32d51e175f0e5e08fd37.json` | Berkas konfigurasi/data: eb51296f6967215c29bbcbc86b95d4db89b126e06d2e32d51e175f0e5e08fd37.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/edd4eaef1de98ea7e326db522820621b62643057d48d1bdf35237d02ec16b759.json` | Berkas konfigurasi/data: edd4eaef1de98ea7e326db522820621b62643057d48d1bdf35237d02ec16b759.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/ee4e4edf07bc2c690d7a301edb7897436365698f1408883fb319545ded9feee3.json` | Berkas konfigurasi/data: ee4e4edf07bc2c690d7a301edb7897436365698f1408883fb319545ded9feee3.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/ef980b994b896da8eb40cf429e0a2b58f3ec58622fe62685e339005f77be1f8d.json` | Berkas konfigurasi/data: ef980b994b896da8eb40cf429e0a2b58f3ec58622fe62685e339005f77be1f8d.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/f03594ff2564a81486093f02c40adbf5ffd6237b9dbc5f068d0839806ed640db.json` | Berkas konfigurasi/data: f03594ff2564a81486093f02c40adbf5ffd6237b9dbc5f068d0839806ed640db.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/f212a25ba68b3a08a978b510c48245a689691b9ee3a3f47edc49b4a68a221cc0.json` | Berkas konfigurasi/data: f212a25ba68b3a08a978b510c48245a689691b9ee3a3f47edc49b4a68a221cc0.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/f2c84f09d34ffdcebef25ed2c6d2afb0dcc7fd801046cbd4ba330c8f1d4c5f2a.json` | Berkas konfigurasi/data: f2c84f09d34ffdcebef25ed2c6d2afb0dcc7fd801046cbd4ba330c8f1d4c5f2a.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/f3e226aa3aa176844d5c7ca31f068f5c59755e2adc8d1a9e233b11e60f7d519f.json` | Berkas konfigurasi/data: f3e226aa3aa176844d5c7ca31f068f5c59755e2adc8d1a9e233b11e60f7d519f.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/f4aaff3bea7320a073c99c138f07209f5c78c0579e5e67132f1e31304755d579.json` | Berkas konfigurasi/data: f4aaff3bea7320a073c99c138f07209f5c78c0579e5e67132f1e31304755d579.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/f4b15fbe3a37b210bf146bdd7d5fb328444dceb86459b8c2a3fd94bbef21a9c9.json` | Berkas konfigurasi/data: f4b15fbe3a37b210bf146bdd7d5fb328444dceb86459b8c2a3fd94bbef21a9c9.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/f51ec3de93d9f7909333e9cfc2c148ac6d05ea44ec427f65e084ab3a4a014eeb.json` | Berkas konfigurasi/data: f51ec3de93d9f7909333e9cfc2c148ac6d05ea44ec427f65e084ab3a4a014eeb.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/f5586c009205be2f91a07b345d595b6584a22339676a350020030fc1b9a30add.json` | Berkas konfigurasi/data: f5586c009205be2f91a07b345d595b6584a22339676a350020030fc1b9a30add.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/f82e0b16ef17a7695adb6b28b382a67fd1fe08ff6e187aedae50965dca1e8a49.json` | Berkas konfigurasi/data: f82e0b16ef17a7695adb6b28b382a67fd1fe08ff6e187aedae50965dca1e8a49.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/f8fb150fdb411a4787c7e57d091b7a3d921c507b3ccfc781fe766ea283e6947d.json` | Berkas konfigurasi/data: f8fb150fdb411a4787c7e57d091b7a3d921c507b3ccfc781fe766ea283e6947d.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/f9564233d91df4090d482c1be69b67b4690fa6abc35a86ade3a9cbbfb1a1e58c.json` | Berkas konfigurasi/data: f9564233d91df4090d482c1be69b67b4690fa6abc35a86ade3a9cbbfb1a1e58c.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/faf4ef0154c6496f1522b82baa8c80409f165816145cd5ecc9c236df7710e292.json` | Berkas konfigurasi/data: faf4ef0154c6496f1522b82baa8c80409f165816145cd5ecc9c236df7710e292.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/fb6c5c611f8b02ab330ed7ad507274e365e6010b5239fa37da6fa15e92db1507.json` | Berkas konfigurasi/data: fb6c5c611f8b02ab330ed7ad507274e365e6010b5239fa37da6fa15e92db1507.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/fc35e32b8d4a0fcfb11c7f4a48702deea5322538991c4ef32afa8e3e9f22d67a.json` | Berkas konfigurasi/data: fc35e32b8d4a0fcfb11c7f4a48702deea5322538991c4ef32afa8e3e9f22d67a.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/fc784bde1234a8efaace46bccefbb8cd17e1875fe707747a3a983e881259af75.json` | Berkas konfigurasi/data: fc784bde1234a8efaace46bccefbb8cd17e1875fe707747a3a983e881259af75.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/fd0aa9f26fd0e6aedfaa99d970983d03db24592d758ff680b8a8ffdedeb8b2b6.json` | Berkas konfigurasi/data: fd0aa9f26fd0e6aedfaa99d970983d03db24592d758ff680b8a8ffdedeb8b2b6.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/fdddd0c15128a5798c8f6d9ee56387cc734891498f57685caa1d1a2a49873500.json` | Berkas konfigurasi/data: fdddd0c15128a5798c8f6d9ee56387cc734891498f57685caa1d1a2a49873500.json. |
| `graphify-out/cache/ast/v0.9.112-s48-g460503b3f2a4/fe1e8046c79ceffe6b8d7f891fbb519c1884a3e5c5a865180b471d9aba7f879c.json` | Berkas konfigurasi/data: fe1e8046c79ceffe6b8d7f891fbb519c1884a3e5c5a865180b471d9aba7f879c.json. |
| `graphify-out/cache/last_query_stamp` | Berkas konfigurasi/data: last_query_stamp. |
| `graphify-out/cache/stat-index.json` | Berkas konfigurasi/data: stat-index.json. |
| `graphify-out/graph.html` | Berkas konfigurasi/data: graph.html. |
| `graphify-out/graph.json` | Berkas konfigurasi/data: graph.json. |
| `graphify-out/manifest.json` | Berkas konfigurasi/data: manifest.json. |
| `lib/analytics-sync.js` | Berkas konfigurasi/data: analytics-sync.js. |
| `lib/db-snapshot.js` | Berkas konfigurasi/data: db-snapshot.js. |
| `lib/diag-orders.js` | Berkas konfigurasi/data: diag-orders.js. |
| `lib/e2e-sync-test.js` | Berkas konfigurasi/data: e2e-sync-test.js. |
| `lib/journal-correction.js` | Berkas konfigurasi/data: journal-correction.js. |
| `lib/seed-products.js` | Berkas konfigurasi/data: seed-products.js. |
| `lib/sync-to-analytics.js` | Berkas konfigurasi/data: sync-to-analytics.js. |
| `lib/vendor-settlement.js` | Berkas konfigurasi/data: vendor-settlement.js. |
| `ops/PANDUAN-DISK-ALERT.md` | Berkas konfigurasi/data: PANDUAN-DISK-ALERT.md. |
| `ops/PANDUAN-DOCKER-LOG.md` | Berkas konfigurasi/data: PANDUAN-DOCKER-LOG.md. |
| `ops/QUERIES.md` | Berkas konfigurasi/data: QUERIES.md. |
| `ops/docker-daemon.json` | Berkas konfigurasi/data: docker-daemon.json. |
| `ops/grandpos-alert.service` | Berkas konfigurasi/data: grandpos-alert.service. |
| `ops/grandpos-alert.timer` | Berkas konfigurasi/data: grandpos-alert.timer. |
| `ops/grandpos-backup.service` | Berkas konfigurasi/data: grandpos-backup.service. |
| `ops/grandpos-backup.timer` | Berkas konfigurasi/data: grandpos-backup.timer. |
| `ops/grandpos-reclaim.service` | Berkas konfigurasi/data: grandpos-reclaim.service. |
| `ops/grandpos-reclaim.timer` | Berkas konfigurasi/data: grandpos-reclaim.timer. |
| `postcss.config.js` | Berkas konfigurasi/data: postcss.config.js. |
| `project/.emergent/cron/applied.hash` | Berkas konfigurasi/data: applied.hash. |
| `project/.emergent/cron/webhook-crons` | Berkas konfigurasi/data: webhook-crons. |
| `project/.emergent/crons.yml` | Berkas konfigurasi/data: crons.yml. |
| `project/.emergent/emergent.yml` | Berkas konfigurasi/data: emergent.yml. |
| `project/.emergent/markers/.bootstrap-complete` | Berkas konfigurasi/data: .bootstrap-complete. |
| `project/.emergent/markers/.restore-complete` | Berkas konfigurasi/data: .restore-complete. |
| `project/.emergent/system_deps.txt` | Berkas konfigurasi/data: system_deps.txt. |
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
| `project/PANDUAN-MULTI-NODE-TAILSCALE.md` | Berkas konfigurasi/data: PANDUAN-MULTI-NODE-TAILSCALE.md. |
| `project/PANDUAN-TAILSCALE.md` | Berkas konfigurasi/data: PANDUAN-TAILSCALE.md. |
| `project/README-DEPLOY.md` | Berkas konfigurasi/data: README-DEPLOY.md. |
| `project/README.md` | Berkas konfigurasi/data: README.md. |
| `project/design_guidelines.json` | Berkas konfigurasi/data: design_guidelines.json. |
| `project/firebase-blueprint.json` | Berkas konfigurasi/data: firebase-blueprint.json. |
| `project/firestore.rules` | Berkas konfigurasi/data: firestore.rules. |
| `project/frontend/.dockerignore` | Berkas konfigurasi/data: .dockerignore. |
| `project/frontend/README-ANDROID.md` | Berkas konfigurasi/data: README-ANDROID.md. |
| `project/frontend/README.md` | Berkas konfigurasi/data: README.md. |
| `project/frontend/capacitor.config.json` | Berkas konfigurasi/data: capacitor.config.json. |
| `project/frontend/components.json` | Berkas konfigurasi/data: components.json. |
| `project/frontend/craco.config.js` | Berkas konfigurasi/data: craco.config.js. |
| `project/frontend/eslint.jsx.config.cjs` | Berkas konfigurasi/data: eslint.jsx.config.cjs. |
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
| `project/frontend/public/apple-touch-icon.png` | Berkas konfigurasi/data: apple-touch-icon.png. |
| `project/frontend/public/icon-192.png` | Berkas konfigurasi/data: icon-192.png. |
| `project/frontend/public/icon-512.png` | Berkas konfigurasi/data: icon-512.png. |
| `project/frontend/public/icon-maskable-512.png` | Berkas konfigurasi/data: icon-maskable-512.png. |
| `project/frontend/public/icon.svg` | Berkas konfigurasi/data: icon.svg. |
| `project/frontend/public/index.html` | Berkas konfigurasi/data: index.html. |
| `project/frontend/public/manifest.json` | Berkas konfigurasi/data: manifest.json. |
| `project/frontend/public/ota/bundle.zip` | Berkas konfigurasi/data: bundle.zip. |
| `project/frontend/public/ota/version.json` | Berkas konfigurasi/data: version.json. |
| `project/frontend/public/polyfills.js` | Polyfill ES6/ES7 khusus WebView Android 7 lama pada terminal Sunmi T2. |
| `project/frontend/public/screenshot-desktop.png` | Berkas konfigurasi/data: screenshot-desktop.png. |
| `project/frontend/public/sw.js` | Service worker dummy nonaktif (mencegah konflik cache OTA). |
| `project/frontend/scripts/make-ota.js` | Berkas konfigurasi/data: make-ota.js. |
| `project/frontend/src/App.css` | Berkas konfigurasi/data: App.css. |
| `project/frontend/src/App.js` | Komponen root routing aplikasi React 19. |
| `project/frontend/src/config/landing-page.config.js` | Berkas konfigurasi/data: landing-page.config.js. |
| `project/frontend/src/constants/testIds/auth.js` | Berkas konfigurasi/data: auth.js. |
| `project/frontend/src/constants/testIds/home.js` | Berkas konfigurasi/data: home.js. |
| `project/frontend/src/constants/testIds/index.js` | Berkas konfigurasi/data: index.js. |
| `project/frontend/src/hooks/use-toast.js` | Berkas konfigurasi/data: use-toast.js. |
| `project/frontend/src/index.css` | Berkas konfigurasi/data: index.css. |
| `project/frontend/src/index.js` | Titik masuk render React DOM dengan polyfills. |
| `project/frontend/src/services/landingService.js` | Berkas konfigurasi/data: landingService.js. |
| `project/frontend/tailwind.config.js` | Berkas konfigurasi/data: tailwind.config.js. |
| `project/memory/.gitkeep` | Berkas konfigurasi/data: .gitkeep. |
| `project/memory/PRD.md` | Berkas konfigurasi/data: PRD.md. |
| `project/scripts/check_server.py` | Berkas konfigurasi/data: check_server.py. |
| `project/scripts/security-probe-apk-path-traversal.js` | Berkas konfigurasi/data: security-probe-apk-path-traversal.js. |
| `project/scripts/security-probe-auth-gate.js` | Berkas konfigurasi/data: security-probe-auth-gate.js. |
| `project/scripts/security-probe-auth-token.js` | Berkas konfigurasi/data: security-probe-auth-token.js. |
| `project/scripts/security-probe-head-spa-fallback.js` | Berkas konfigurasi/data: security-probe-head-spa-fallback.js. |
| `project/scripts/security-regression-test.js` | Berkas konfigurasi/data: security-regression-test.js. |
| `project/scripts/security-verify-routes.js` | Berkas konfigurasi/data: security-verify-routes.js. |
| `project/scripts/seed_data.py` | Berkas konfigurasi/data: seed_data.py. |
| `project/scripts/update_file_index.py` | Berkas konfigurasi/data: update_file_index.py. |
| `project/scripts/verify-ota-bundle.py` | Berkas konfigurasi/data: verify-ota-bundle.py. |
| `project/test_result.md` | Berkas konfigurasi/data: test_result.md. |
| `public/.well-known/assetlinks.json` | Berkas konfigurasi/data: assetlinks.json. |
| `public/PANDUAN_APK_SUNMI_T2.txt` | Berkas konfigurasi/data: PANDUAN_APK_SUNMI_T2.txt. |
| `public/PROMPT_AISTUDIO_SUNMI_NATIVE.txt` | Berkas konfigurasi/data: PROMPT_AISTUDIO_SUNMI_NATIVE.txt. |
| `public/SYSTEM_INSTRUCTION_SUNMI_NATIVE.txt` | Berkas konfigurasi/data: SYSTEM_INSTRUCTION_SUNMI_NATIVE.txt. |
| `public/apple-touch-icon.png` | Berkas konfigurasi/data: apple-touch-icon.png. |
| `public/icon-192.png` | Berkas konfigurasi/data: icon-192.png. |
| `public/icon-512.png` | Berkas konfigurasi/data: icon-512.png. |
| `public/icon-maskable-512.png` | Berkas konfigurasi/data: icon-maskable-512.png. |
| `public/icon.svg` | Berkas konfigurasi/data: icon.svg. |
| `public/manifest.json` | Berkas konfigurasi/data: manifest.json. |
| `public/ota/bundle.zip` | Berkas konfigurasi/data: bundle.zip. |
| `public/ota/version.json` | Berkas konfigurasi/data: version.json. |
| `public/polyfills.js` | Berkas konfigurasi/data: polyfills.js. |
| `public/screenshot-desktop.png` | Berkas konfigurasi/data: screenshot-desktop.png. |
| `public/sw.js` | Berkas konfigurasi/data: sw.js. |
| `routes/mcpServer.js` | Berkas konfigurasi/data: mcpServer.js. |
| `run-tests.js` | Berkas konfigurasi/data: run-tests.js. |
| `scripts/generate_pwa_assets.py` | Berkas konfigurasi/data: generate_pwa_assets.py. |
| `scripts/hapus-user-alihkan.js` | Berkas konfigurasi/data: hapus-user-alihkan.js. |
| `scripts/koreksi-jurnal-vendor.js` | Berkas konfigurasi/data: koreksi-jurnal-vendor.js. |
| `scripts/make-ota.js` | Berkas konfigurasi/data: make-ota.js. |
| `scripts/perbaiki-pasca-hapus-user.js` | Berkas konfigurasi/data: perbaiki-pasca-hapus-user.js. |
| `scripts/requeue-analytics.js` | Berkas konfigurasi/data: requeue-analytics.js. |
| `server.ts` | Berkas konfigurasi/data: server.ts. |
| `shift-single-form.png` | Berkas konfigurasi/data: shift-single-form.png. |
| `tailwind.config.js` | Berkas konfigurasi/data: tailwind.config.js. |
| `tests/_e2e-server.js` | Berkas konfigurasi/data: _e2e-server.js. |
| `tests/accounting-discount-tax-split-isolated.js` | Berkas konfigurasi/data: accounting-discount-tax-split-isolated.js. |
| `tests/analytics-sync-rbac.js` | Berkas konfigurasi/data: analytics-sync-rbac.js. |
| `tests/analytics-sync-retry-policy.js` | Berkas konfigurasi/data: analytics-sync-retry-policy.js. |
| `tests/bakso-cash-void-isolated.js` | Berkas konfigurasi/data: bakso-cash-void-isolated.js. |
| `tests/cash-drawer-authority.js` | Berkas konfigurasi/data: cash-drawer-authority.js. |
| `tests/cash-tunai-normalisation.js` | Berkas konfigurasi/data: cash-tunai-normalisation.js. |
| `tests/fix01-functional.js` | Berkas konfigurasi/data: fix01-functional.js. |
| `tests/fix01-negative-control.js` | Berkas konfigurasi/data: fix01-negative-control.js. |
| `tests/fix01-regression.js` | Berkas konfigurasi/data: fix01-regression.js. |
| `tests/fix02-contract.js` | Berkas konfigurasi/data: fix02-contract.js. |
| `tests/fix02-negative-control.js` | Berkas konfigurasi/data: fix02-negative-control.js. |
| `tests/fix05-server-authority.js` | Berkas konfigurasi/data: fix05-server-authority.js. |
| `tests/import-rbac-prod-data.js` | Berkas konfigurasi/data: import-rbac-prod-data.js. |
| `tests/import-rbac.js` | Berkas konfigurasi/data: import-rbac.js. |
| `tests/journal-correction-e2e.js` | Berkas konfigurasi/data: journal-correction-e2e.js. |
| `tests/journal-correction-integrity.js` | Berkas konfigurasi/data: journal-correction-integrity.js. |
| `tests/kiosk-shift-ui-check.js` | Berkas konfigurasi/data: kiosk-shift-ui-check.js. |
| `tests/landing-page-auth-guard.js` | Berkas konfigurasi/data: landing-page-auth-guard.js. |
| `tests/loyalty-rounding-shift-isolated.js` | Berkas konfigurasi/data: loyalty-rounding-shift-isolated.js. |
| `tests/outlet-identity-isolated.js` | Berkas konfigurasi/data: outlet-identity-isolated.js. |
| `tests/pos-host-gate.js` | Berkas konfigurasi/data: pos-host-gate.js. |
| `tests/receipt-single-print.js` | Berkas konfigurasi/data: receipt-single-print.js. |
| `tests/recipe-hpp-order-isolated.js` | Berkas konfigurasi/data: recipe-hpp-order-isolated.js. |
| `tests/settings-persistence.js` | Berkas konfigurasi/data: settings-persistence.js. |
| `tests/shift-single-form-e2e.js` | Berkas konfigurasi/data: shift-single-form-e2e.js. |
| `tests/test_backup_redaction.js` | Berkas konfigurasi/data: test_backup_redaction.js. |
| `tests/vendor-settlement-e2e.js` | Berkas konfigurasi/data: vendor-settlement-e2e.js. |
| `tests/vendor-settlement-integrity.js` | Berkas konfigurasi/data: vendor-settlement-integrity.js. |
| `tests/vendor-share-on-order.js` | Berkas konfigurasi/data: vendor-share-on-order.js. |
| `tests/x-gak-token-bypass-removed.js` | Berkas konfigurasi/data: x-gak-token-bypass-removed.js. |
| `tsconfig.json` | Berkas konfigurasi/data: tsconfig.json. |

