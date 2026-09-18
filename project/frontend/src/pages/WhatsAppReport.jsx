import { Suspense, lazy } from "react";

const WhatsApp = lazy(() => import("@/pages/WhatsApp"));
const SettingsReport = lazy(() => import("@/pages/SettingsReport"));
const SettingsWATemplates = lazy(() => import("@/pages/SettingsWATemplates"));

// Gabungan: konfigurasi WhatsApp Gateway + pengaturan Laporan otomatis + Template WA dalam satu tab.
export default function WhatsAppReport() {
  return (
    <div className="h-full overflow-y-auto" data-testid="wa-report-page">
      <Suspense fallback={<div className="flex items-center justify-center p-8"><div className="animate-spin h-8 w-8 border-4 border-[#E63946] border-t-transparent rounded-full"></div></div>}>
        <WhatsApp />
        <div className="h-2 bg-[#F4F5F7] border-y" />
        <SettingsReport />
        <div className="h-2 bg-[#F4F5F7] border-y" />
        <SettingsWATemplates />
      </Suspense>
    </div>
  );
}
