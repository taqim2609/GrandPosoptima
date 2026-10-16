import React, { useState, useEffect } from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Shield, Wifi, WifiOff, RefreshCw, CheckCircle2, AlertTriangle, Network, Server, ArrowLeftRight } from "lucide-react";
import api from "@/lib/api";
import { toast } from "sonner";

export default function TailscaleDashboard() {
  const [data, setData] = useState({
    active: false,
    ip: "127.0.0.1",
    role: "PC Server Master",
    backend_url: "http://grandpos.local:3000",
    evolution_url: "http://localhost:8080"
  });
  const [loading, setLoading] = useState(false);
  const [latencyTest, setLatencyTest] = useState(null);
  const [testing, setTesting] = useState(false);

  const fetchStatus = async () => {
    setLoading(true);
    try {
      const res = await api.get("/system/tailscale-status");
      if (res.data) {
        setData(res.data);
      }
    } catch (e) {
      console.error("Gagal memuat status Tailscale", e);
    } finally {
      setLoading(false);
    }
  };

  const testConnectionHealth = async () => {
    setTesting(true);
    const t0 = performance.now();
    try {
      // Test ping directly to backend API
      const res = await api.get("/health");
      const duration = Math.round(performance.now() - t0);
      
      setLatencyTest({
        ok: true,
        latency: duration,
        status: duration < 50 ? "Excellent" : duration < 150 ? "Good" : "Laggy"
      });
      toast.success(`Koneksi sehat! Latensi: ${duration} ms`);
    } catch (e) {
      setLatencyTest({
        ok: false,
        latency: 0,
        status: "Disconnected"
      });
      toast.error("Koneksi bermasalah atau timeout.");
    } finally {
      setTesting(false);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  return (
    <Card className="border-2 border-indigo-200 shadow-sm rounded-2xl overflow-hidden" data-testid="tailscale-dashboard">
      <CardHeader className="bg-indigo-50/50 border-b border-indigo-100 p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-100 rounded-xl text-indigo-700">
              <Network size={22} />
            </div>
            <div>
              <CardTitle className="text-base font-extrabold text-slate-900 leading-none flex items-center gap-2">
                Tailscale Jaringan Hybrid POS
              </CardTitle>
              <CardDescription className="text-xs text-slate-500 mt-1">
                Kesehatan koneksi VPN Tailscale antara PC Server Utama dan Raspberry Pi
              </CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs font-bold gap-1 rounded-lg border-indigo-200 hover:bg-indigo-50"
              onClick={fetchStatus}
              disabled={loading}
            >
              <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
              Segarkan IP
            </Button>
            <Button
              size="sm"
              className="h-8 text-xs font-bold gap-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white"
              onClick={testConnectionHealth}
              disabled={testing}
            >
              {testing ? "Menguji..." : "Uji Latensi Jaringan"}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-5 space-y-5">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Tailscale IP Card */}
          <div className="rounded-xl border border-indigo-100 bg-indigo-50/20 p-4 space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase font-black tracking-wider text-indigo-500 font-sans">IP Tailscale Aktif</span>
              <Badge variant={data.active ? "success" : "warning"} className="text-[9px] px-1.5 py-0 rounded-md font-extrabold">
                {data.active ? "Tailscale UP" : "Lokal / LAN Only"}
              </Badge>
            </div>
            <div className="font-mono font-black text-lg text-slate-800 break-all pt-1">
              {data.ip || "127.0.0.1"}
            </div>
          </div>

          {/* Device Role Card */}
          <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-4 space-y-1">
            <span className="text-[10px] uppercase font-black tracking-wider text-slate-400 font-sans">Peran Node Aktif</span>
            <div className="font-extrabold text-sm text-slate-800 flex items-center gap-1.5 pt-1">
              <Server size={14} className="text-slate-500" />
              {data.role}
            </div>
          </div>

          {/* Connection Quality Card */}
          <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-4 space-y-1">
            <span className="text-[10px] uppercase font-black tracking-wider text-slate-400 font-sans">Kualitas Sambungan</span>
            <div className="pt-1">
              {latencyTest ? (
                <div className="flex items-center gap-1.5 font-extrabold text-sm">
                  <Badge 
                    variant={latencyTest.status === "Excellent" ? "success" : latencyTest.status === "Good" ? "success" : "destructive"}
                    className="font-black text-[10px]"
                  >
                    {latencyTest.status} ({latencyTest.latency} ms)
                  </Badge>
                </div>
              ) : (
                <span className="text-xs text-slate-400 italic font-medium">Lakukan uji koneksi</span>
              )}
            </div>
          </div>
        </div>

        {/* CONNECTION FLOW VISUALIZER */}
        <div className="p-4 rounded-xl border bg-slate-50/30 flex flex-col md:flex-row items-center justify-center gap-6 md:gap-12 relative overflow-hidden">
          <div className="flex flex-col items-center gap-1 shrink-0">
            <div className="h-10 w-10 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700 font-extrabold border-2 border-emerald-300">
              PC
            </div>
            <span className="text-[11px] font-extrabold text-slate-700">PC Server Utama</span>
            <span className="text-[10px] text-slate-400 font-mono">Master (DB &amp; WA)</span>
          </div>

          {/* Flow Arrow */}
          <div className="flex flex-1 flex-col items-center justify-center w-full max-w-xs gap-1">
            <div className="w-full flex items-center justify-between px-2 text-[10px] text-slate-400 font-bold">
              <span>Tailscale Tunnel</span>
              {latencyTest && <span className="text-indigo-600 font-mono">{latencyTest.latency}ms</span>}
            </div>
            <div className="w-full h-1 bg-indigo-200 rounded-full relative flex items-center justify-center">
              <div className="absolute h-2 w-2 rounded-full bg-indigo-600 animate-ping" />
              <ArrowLeftRight size={14} className="text-indigo-500 absolute -top-1.5 bg-white px-0.5 rounded-full" />
            </div>
            <span className="text-[9px] text-indigo-500 font-extrabold tracking-wide uppercase">Koneksi P2P Enkripsi Aman</span>
          </div>

          <div className="flex flex-col items-center gap-1 shrink-0">
            <div className="h-10 w-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-extrabold border-2 border-indigo-300">
              Pi
            </div>
            <span className="text-[11px] font-extrabold text-slate-700">Raspberry Pi</span>
            <span className="text-[10px] text-slate-400 font-mono">Client (Kasir / Dapur)</span>
          </div>
        </div>

        {/* ALERTS */}
        {data.active ? (
          <Alert className="border-[#10B981] bg-[#F0FDF4] text-[#065F46] rounded-xl">
            <div className="flex gap-3">
              <CheckCircle2 className="h-5 w-5 text-[#10B981] shrink-0" />
              <div>
                <AlertTitle className="font-extrabold text-sm leading-tight">IP Tailscale Terdeteksi Aktif!</AlertTitle>
                <AlertDescription className="text-xs text-[#047857] mt-0.5 leading-relaxed">
                  Raspberry Pi dan perangkat POS lain dapat mengakses server utama melalui alamat IP VPN aman: <b>{data.ip}</b> meskipun berada di luar jaringan WiFi toko.
                </AlertDescription>
              </div>
            </div>
          </Alert>
        ) : (
          <Alert className="border-amber-200 bg-amber-50 text-amber-900 rounded-xl">
            <div className="flex gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0" />
              <div>
                <AlertTitle className="font-extrabold text-sm leading-tight">Tailscale Belum Aktif di Mesin Ini</AlertTitle>
                <AlertDescription className="text-xs text-amber-700 mt-0.5 leading-relaxed">
                  Aplikasi POS berjalan menggunakan koneksi LAN/WiFi lokal. Untuk menghubungkan antar-cabang atau dari jarak jauh lewat internet, silakan aktifkan Tailscale dengan perintah <code>tailscale up</code> di terminal.
                </AlertDescription>
              </div>
            </div>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}
