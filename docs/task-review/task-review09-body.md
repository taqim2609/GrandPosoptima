Review-09: Frontend — Audit sisa halaman, komponen, dan lib yang belum ditinjau (project/frontend/src/)
Ruang lingkup: audit frontend di pos-engine/project/frontend/src untuk halaman, komponen, dan lib yang belum masuk Review-03/Fix-02/Fix-03.
Tujuan: menemukan bug UX, ketidakpatuhan aturan UI AGENTS.md, dan risiko tanpa mengubah kode berisiko.
Halaman (47 file) yang belum diverifikasi penuh: Dashboard.jsx, POS.jsx, Reports.jsx, Catalog.jsx, Categories.jsx, Coupons.jsx, Ingredients.jsx, Inventory.jsx, LandingPage.jsx, Members.jsx, Orders.jsx, Products.jsx, Promos.jsx, Recipes.jsx, Reservations.jsx, Tables.jsx, Users.jsx, Vendors.jsx, VendorSettlement.jsx, WhatsApp.jsx, SettingsAI.jsx, SettingsBusiness.jsx, SettingsCustomWidgets.jsx, SettingsData.jsx, SettingsInstaller.jsx, SettingsIntegrations.jsx, SettingsPlatform.jsx, SettingsReport.jsx, SettingsRoles.jsx, SettingsUI.jsx, SettingsWATemplates.jsx, AssistantAI.jsx, Cash.jsx, Diagnostik.jsx, Integritas.jsx, Login.jsx, RoleBasedAccess.jsx, SystemHealth.jsx, VoidRefund.jsx, WhatsAppReport.jsx.
Komponen (26 file) dan lib (23 file): cek konsistensi dengan AGENTS.md.
Lihat:
1. Ketaatan aturan UI AGENTS.md (ErrorBoundary key, void bill total, emoji→Lucide, format rupiah "Rp ", tanggal WIB post-Fix-03).
2. Tidak ada dynamic import / chunk splitting.
3. Tidak ada bocor path file internal (.md, konfigurasi) ke UI.
4. Tidak ada perubahan perilaku bisnis ambigu tanpa keputusan.
5. Tidak refactor OfflineContext.jsx, tidak aktifkan sw.js, tidak hapus polyfills.js.
Acceptance:
- Daftar halaman/komponen/lib yang diperiksa dengan path.
- Temuan P0-P3 dengan bukti path + baris + reproduksi/alasan teknis.
- Catat file yang sengaja tidak diubah (alasan: ambigu/perlu keputusan).
- Laporan dalam Bahasa Indonesia, read-only (kecuali Fix-03 yang sedang berjalan terpisah).
Constraints: tidak refactor OfflineContext.jsx; tidak mengaktifkan sw.js; tidak menghapus polyfills.js; tidak dynamic import; tidak ubah perilaku bisnis ambigu tanpa keputusan.