import React, { useState, useEffect } from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Wifi, WifiOff, RefreshCw, CheckCircle2, AlertTriangle, Server } from "lucide-react";

export default function EvolutionDetectionCard() {
  const [config, setConfig] = useState({
    url: "",
    instance: "",
    hasKey: false,
    status: "unknown"
  });
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(false);

  const fetchConfig = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem("gak_token") || "";
      const res = await fetch("/api/settings/whatsapp", {
        headers: {
          "Authorization": `Bearer ${token}`,
          "X-Gak-Token": "gak_rpt_7f3c9e1b"
        }
      });
      if (res.ok) {
        const data = await res.json();
        setConfig({
          url: data.api_url || "",
          instance: data.instance_name || "",
          hasKey: !!data.api_key,
          status: data.status || "disconnected"
        });
      }
    } catch (e) {
      console.error("Gagal mengambil konfigurasi Evolution API", e);
    } finally {
      setLoading(false);
    }
  };

  const checkConnection = async () => {
    setChecking(true);
    try {
      const token = localStorage.getItem("gak_token") || "";
      const res = await fetch("/api/whatsapp/status", {
        headers: {
          "Authorization": `Bearer ${token}`,
          "X-Gak-Token": "gak_rpt_7f3c9e1b"
        }
      });
      if (res.ok) {
        const data = await res.json();
        setConfig(prev => ({
          ...prev,
          status: data.status || "connected"
        }));
      } else {
        setConfig(prev => ({
          ...prev,
          status: "disconnected"
        }));
      }
    } catch (e) {
      setConfig(prev => ({
        ...prev,
        status: "disconnected"
      }));
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => {
    fetchConfig();
  }, []);

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
                Auto-Deteksi Evolution API
              </CardTitle>
              <CardDescription className="text-xs text-slate-500 mt-1">
                Status sinkronisasi dan konektivitas gateway WhatsApp yang berjalan di PC Server Lokal (Local Master)
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
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-3.5 space-y-1">
            <span className="text-[10px] uppercase font-black tracking-wider text-slate-400">URL Gateway</span>
            <div className="font-extrabold text-sm text-slate-800 break-all">
              {config.url || <span className="text-slate-400 italic font-medium">Belum diatur</span>}
            </div>
          </div>
          <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-3.5 space-y-1">
            <span className="text-[10px] uppercase font-black tracking-wider text-slate-400">Nama Instance</span>
            <div className="font-extrabold text-sm text-slate-800">
              {config.instance || <span className="text-slate-400 italic font-medium">Belum diatur</span>}
            </div>
          </div>
          <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-3.5 space-y-1">
            <span className="text-[10px] uppercase font-black tracking-wider text-slate-400">API Key</span>
            <div>
              <Badge variant={config.hasKey ? "success" : "destructive"} className="font-black text-[10px] uppercase tracking-wider rounded-md">
                {config.hasKey ? "Tersimpan ✓" : "Kosong"}
              </Badge>
            </div>
          </div>
        </div>

        {config.status === "connected" && (
          <Alert className="border-[#10B981] bg-[#F0FDF4] text-[#065F46] rounded-xl">
            <div className="flex gap-3">
              <CheckCircle2 className="h-5 w-5 text-[#10B981] shrink-0" />
              <div>
                <AlertTitle className="font-extrabold text-sm leading-tight">Sistem Online & Terhubung!</AlertTitle>
                <AlertDescription className="text-xs text-[#047857] mt-0.5 leading-relaxed">
                  Layanan WhatsApp siap digunakan. Seluruh notifikasi struk dan laporan akan terkirim secara otomatis.
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
                <AlertTitle className="font-extrabold text-sm leading-tight">Koneksi Gateway Terputus</AlertTitle>
                <AlertDescription className="text-xs text-[#B91C1C] mt-0.5 leading-relaxed">
                  Gagal menghubungi server Evolution API. Pastikan URL dan API Key sudah benar dan instansi aktif.
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
                  Klik tombol "Uji Koneksi" untuk memeriksa status sinkronisasi backend WhatsApp secara real-time.
                </AlertDescription>
              </div>
            </div>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}
