import SystemHealthPanel from "@/components/SystemHealthPanel";

export default function SystemHealth() {
  return (
    <div className="h-full overflow-y-auto p-6 lg:p-8" data-testid="settings-system-health-page">
      <SystemHealthPanel />
    </div>
  );
}
