import React, { useState, useEffect } from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { WifiOff, RefreshCw, CheckCircle2, AlertTriangle, Server } from "lucide-react";

/**
 * Kartu diagnostik WhatsApp Gateway.
 *
 * Menggantikan "Auto-Deteksi Evolution API": kini menampilkan provider yang
 * benar-benar aktif (Hermes Baileys / Evolution / WACloud) beserta status bridge,
 * outbox, dan allowlist perintah. Tidak pernah menampilkan secret atau nomor.
 */
export default function WhatsAppGatewayCard() {
  const [config, setConfig] = useState({
    url: "",
    instance: "",
    hasKey: false,
    status: "unknown",
    provider: "-",
    state: "",
    outboxPending: 0,
    allowlist: {},
  });
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(false);

  const token = () => localStorage.getItem("gak_token") || "";
  // Endpoint status diproteksi require_admin; tidak ada token konstanta kedua.
  const headers = () => ({ Authorization: `Bearer ${token()}` });

  const applyStatus = (data) => {
    setConfig({
      url: data.api_url || "",
      instance: data.instance_name || "",
      hasKey: !!data.has_key,
      status: data.status || "disconnected",
      provider: data.provider || "-",
      state: data.state || "",
      outboxPending: data.outbox_pending || 0,
      allowlist: data.allowlist || {},
    });
  };

  const fetchConfig = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/whatsapp/status", { headers: headers() });
      if (res.ok) applyStatus(await res.json());
      const o = await fetch("/api/whatsapp/outbox", { headers: headers() });
      if (o.ok) {
        const d = await o.json();
        setConfig((prev) => ({ ...prev, outboxPending: d.pending || 0 }));
      }
    } catch (e) {
      console.error("Gagal mengambil status WhatsApp gateway");
    } finally {
      setLoading(false);
    }
  };

  const checkConnection = async () => {
    setChecking(true);
    try {
      const res = await fetch("/api/whatsapp/status", { headers: headers() });
      if (res.ok) applyStatus(await res.json());
      else setConfig((prev) => ({ ...prev, status: "disconnected" }));
    } catch (e) {
      setConfig((prev) => ({ ...prev, status: "disconnected" }));
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => {
    fetchConfig();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isHermes = config.provider === "hermes";

  return (
    <Card className="border-2 border-slate-200 shadow-sm rounded-2xl overflow-hidden">
      <CardHeader className="bg-slate-50 border-b border-slate-100 p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-50 rounded-xl text-green-600">
              <Server size={22} />
            </div>
            <div>
              <CardTitle className="text-base font-extrabold text-slate-900 leading-none">
                Diagnostik WhatsApp Gateway
              </CardTitle>
              <CardDescription className="text-xs text-slate-500 mt-1">
                Provider aktif, status bridge, dan outbox pesan yang belum terkirim
              </CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs font-bold gap-1 rounded-lg"
              onClick={fetchConfig}
              disabled={loading || checking}
            >
              <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
              Segarkan
            </Button>
            <Button
              size="sm"
              className="h-8 text-xs font-bold gap-1 rounded-lg bg-green-600 hover:bg-green-700 text-white"
              onClick={checkConnection}
              disabled={loading || checking}
            >
              {checking ? "Memeriksa..." : "Uji Koneksi"}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-5 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-3.5 space-y-1">
            <span className="text-[10px] uppercase font-black tracking-wider text-slate-400">Provider</span>
            <div className="font-extrabold text-sm text-slate-800">
              {config.provider === "hermes"
                ? "Hermes Baileys"
                : config.provider === "evolution"
                ? "Evolution API"
                : config.provider === "wacloud"
                ? "WACloud.id"
                : <span className="text-slate-400 italic font-medium">Belum diatur</span>}
            </div>
          </div>
          <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-3.5 space-y-1">
            <span className="text-[10px] uppercase font-black tracking-wider text-slate-400">Endpoint</span>
            <div className="font-extrabold text-xs text-slate-800 break-all">
              {config.url || <span className="text-slate-400 italic font-medium">Belum diatur</span>}
            </div>
          </div>
          <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-3.5 space-y-1">
            <span className="text-[10px] uppercase font-black tracking-wider text-slate-400">Sesi / Kredensial</span>
            <div>
              <Badge variant={config.hasKey ? "success" : "destructive"} className="font-black text-[10px] uppercase tracking-wider rounded-md">
                {config.hasKey ? "Tersimpan ✓" : "Kosong"}
              </Badge>
            </div>
          </div>
          <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-3.5 space-y-1">
            <span className="text-[10px] uppercase font-black tracking-wider text-slate-400">Outbox</span>
            <div className="font-extrabold text-sm text-slate-800">
              {config.outboxPending} <span className="text-xs font-medium text-slate-500">menunggu</span>
            </div>
          </div>
        </div>

        {isHermes && Object.keys(config.allowlist || {}).length > 0 && (
          <div className="rounded-xl border border-slate-100 bg-white p-3.5">
            <span className="text-[10px] uppercase font-black tracking-wider text-slate-400">Perintah WhatsApp (allowlist per-role)</span>
            <div className="mt-1 flex flex-wrap gap-2 text-xs font-mono text-slate-700">
              {Object.entries(config.allowlist).map(([cmd, roles]) => (
                <span key={cmd} className="px-2 py-0.5 rounded-md bg-slate-100">
                  {cmd} → {roles.join(",")}
                </span>
              ))}
            </div>
          </div>
        )}

        {config.status === "connected" && (
          <Alert className="border-[#10B981] bg-[#F0FDF4] text-[#065F46] rounded-xl">
            <div className="flex gap-3">
              <CheckCircle2 className="h-5 w-5 text-[#10B981] shrink-0" />
              <div>
                <AlertTitle className="font-extrabold text-sm leading-tight">Gateway Online</AlertTitle>
                <AlertDescription className="text-xs text-[#047857] mt-0.5 leading-relaxed">
                  Notifikasi struk, laporan shift, dan laporan harian akan terkirim otomatis.
                </AlertDescription>
              </div>
            </div>
          </Alert>
        )}

        {config.status === "disconnected" && (
          <Alert className="border-[#EF4444] bg-[#FEF2F2] text-[#991B1B] rounded-xl">
            <div className="flex gap-3">
              <AlertTriangle className="h-5 w-5 text-[#EF4444] shrink-0" />
              <div>
                <AlertTitle className="font-extrabold text-sm leading-tight">Gateway Belum Terhubung</AlertTitle>
                <AlertDescription className="text-xs text-[#B91C1C] mt-0.5 leading-relaxed">
                  {isHermes
                    ? "Bridge Hermes belum siap. Pesan yang gagal akan disimpan di outbox dan dikirim setelah bridge hidup di server gudang."
                    : "Periksa endpoint dan kredensial gateway pada halaman Pengaturan WhatsApp."}
                </AlertDescription>
              </div>
            </div>
          </Alert>
        )}

        {config.status === "unknown" && (
          <Alert className="border-slate-200 bg-slate-50 text-slate-700 rounded-xl">
            <div className="flex gap-3">
              <WifiOff className="h-5 w-5 text-slate-400 shrink-0" />
              <div>
                <AlertTitle className="font-extrabold text-sm leading-tight">Status Belum Diketahui</AlertTitle>
                <AlertDescription className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                  Klik "Uji Koneksi" untuk memeriksa status gateway secara real-time.
                </AlertDescription>
              </div>
            </div>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}
