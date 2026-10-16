import SubTabs from "@/components/SubTabs";
import { MessageSquare, Clock, FileText } from "lucide-react";
import WhatsApp from "@/pages/WhatsApp";
import SettingsReport from "@/pages/SettingsReport";
import SettingsWATemplates from "@/pages/SettingsWATemplates";

export default function WhatsAppReport() {
  return (
    <SubTabs
      testid="wa-gateway-subtabs"
      items={[
        { key: "gateway", label: "Gateway & Koneksi", icon: MessageSquare, comp: WhatsApp },
        { key: "schedule", label: "Jadwal Laporan Otomatis", icon: Clock, comp: SettingsReport },
        { key: "templates", label: "Template Pesan", icon: FileText, comp: SettingsWATemplates },
      ]}
    />
  );
}
