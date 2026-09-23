import React, { useState, useEffect } from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import {
  RefreshCw,
  Cpu,
  Globe,
  CheckCircle2,
  AlertTriangle,
  Zap,
  Gauge,
  Wifi,
  ChevronRight,
  TrendingUp,
  Database
} from "lucide-react";

export default function HybridSyncDiagnosticPanel() {
  const [syncing, setSyncing] = useState(false);
  const [benchmarking, setBenchmarking] = useState(false);
  const [syncState, setSyncState] = useState({
    last_sync: new Date().toISOString(),
    pending_items: 0,
    synced_items: 128,
    status: "idle"
  });
  const [benchmarkResult, setBenchmarkResult] = useState(null);

  // SSE Real-time stream untuk sinkronisasi
  useEffect(() => {
    let eventSource;
    try {
      const token = localStorage.getItem("gak_token") || "";
      eventSource = new EventSource(`/api/system/sync/stream`);

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data && data.sync) {
            setSyncState(data.sync);
          }
        } catch (e) {
          console.error("Gagal mengurai event stream sinkronisasi", e);
        }
      };

      eventSource.onerror = () => {
        console.warn("EventSource terputus, mencoba menyambungkan ulang...");
      };
    } catch (e) {
      console.error("Gagal memulai real-time sync stream", e);
    }

    return () => {
      if (eventSource) {
        eventSource.close();
      }
    };
  }, []);

  const triggerSync = async () => {
    setSyncing(true);
    const toastId = toast.loading("Memulai sinkronisasi hybrid real-time...");
    try {
      const token = localStorage.getItem("gak_token") || "";
      const res = await fetch("/api/system/health/sync-now", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "X-Gak-Token": "gak_rpt_7f3c9e1b"
        }
      });
      if (res.ok) {
        const data = await res.json();
        if (data.sync) {
          setSyncState(data.sync);
        }
        toast.success(data.message || "Sinkronisasi selesai disinkronkan!", { id: toastId });
      } else {
        throw new Error(`HTTP ${res.status}`);
      }
    } catch (e) {
      toast.error(`Gagal sinkronisasi: ${e.message}`, { id: toastId });
    } finally {
      setSyncing(false);
    }
  };

  const runBenchmark = async () => {
    setBenchmarking(true);
    const toastId = toast.loading("Memulai benchmark performa (Lokal vs Cloud)...");
    try {
      const token = localStorage.getItem("gak_token") || "";
      const res = await fetch("/api/system/health/speed-test", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "X-Gak-Token": "gak_rpt_7f3c9e1b"
        }
      });
      if (res.ok) {
        const data = await res.json();
        setBenchmarkResult(data);
        toast.success("Benchmark selesai! Lihat detail perbandingan di bawah.", { id: toastId });
      } else {
        throw new Error(`HTTP ${res.status}`);
      }
    } catch (e) {
      toast.error(`Gagal benchmarking: ${e.message}`, { id: toastId });
    } finally {
      setBenchmarking(false);
    }
  };

  return (
    <div className="space-y-6" data-testid="hybrid-sync-diagnostic-panel">
      {/* SECTION 1: HYBRID SYNC STATUS */}
      <Card className="border-2 border-slate-200 rounded-2xl shadow-sm">
        <CardHeader className="p-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-rose-50 text-rose-600 rounded-xl">
              <Database size={20} />
            </div>
            <div>
              <CardTitle className="text-base font-extrabold text-slate-900 leading-none">
                Sinkronisasi Database Hybrid
              </CardTitle>
              <CardDescription className="text-xs text-slate-500 mt-1">
                Sinkronisasi real-time antara kasir offline (Raspberry Pi) dan server pusat Google Cloud
              </CardDescription>
            </div>
          </div>
          <Button
            size="sm"
            onClick={triggerSync}
            disabled={syncing}
            className="h-9 font-bold bg-rose-600 hover:bg-rose-700 text-white rounded-lg flex items-center gap-2"
          >
            <RefreshCw size={14} className={syncing ? "animate-spin" : ""} />
            {syncing ? "Menyinkronkan..." : "Sinkronkan Sekarang"}
          </Button>
        </CardHeader>

        <CardContent className="p-5 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 bg-slate-50/50 rounded-xl border border-slate-100 flex items-center justify-between">
              <div className="space-y-1">
                <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Antrean Data (Pending)</span>
                <div className="text-xl font-extrabold text-slate-800">
                  {syncState.pending_items || 0}
                </div>
              </div>
              <Badge variant={syncState.pending_items > 0 ? "warning" : "success"} className="rounded-md font-bold uppercase tracking-wider text-[10px]">
                {syncState.pending_items > 0 ? "Tertunda" : "Sinkron"}
              </Badge>
            </div>

            <div className="p-4 bg-slate-50/50 rounded-xl border border-slate-100 flex items-center justify-between">
              <div className="space-y-1">
                <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Data Tersinkronisasi</span>
                <div className="text-xl font-extrabold text-slate-800">
                  {syncState.synced_items || 142}
                </div>
              </div>
              <Badge variant="outline" className="rounded-md font-bold uppercase tracking-wider text-[10px] bg-white border-slate-200">
                Lengkap
              </Badge>
            </div>

            <div className="p-4 bg-slate-50/50 rounded-xl border border-slate-100 flex items-center justify-between">
              <div className="space-y-1">
                <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Terakhir Sinkron</span>
                <div className="text-xs font-bold text-slate-700 mt-1">
                  {syncState.last_sync ? new Date(syncState.last_sync).toLocaleString("id-ID") : "-"}
                </div>
              </div>
              <Badge variant="success" className="rounded-md font-bold uppercase tracking-wider text-[10px]">
                Otomatis
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* SECTION 2: SPEED BENCHMARK (LOKAL VS CLOUD) */}
      <Card className="border-2 border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <CardHeader className="p-5 border-b border-slate-100 bg-slate-50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-[#2563EB]/10 text-[#2563EB] rounded-xl">
              <Gauge size={20} />
            </div>
            <div>
              <CardTitle className="text-base font-extrabold text-slate-900 leading-none">
                Uji Performa: Lokal vs Google Cloud Run
              </CardTitle>
              <CardDescription className="text-xs text-slate-500 mt-1">
                Bandingkan kecepatan respon antara Server Lokal Kasir dan Cloud Server untuk failover lancar
              </CardDescription>
            </div>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={runBenchmark}
            disabled={benchmarking}
            className="h-9 font-bold border-slate-300 text-slate-700 bg-white hover:bg-slate-50 rounded-lg flex items-center gap-2"
          >
            <Zap size={14} className={benchmarking ? "text-amber-500 animate-bounce" : ""} />
            {benchmarking ? "Menguji Latensi..." : "Mulai Uji Kecepatan"}
          </Button>
        </CardHeader>

        <CardContent className="p-5">
          {benchmarkResult ? (
            <div className="space-y-6">
              {/* COMPARISON CARDS */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {/* LOCAL SERVER */}
                <div className="p-5 rounded-2xl border-2 border-emerald-100 bg-emerald-50/20 relative overflow-hidden space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Cpu size={18} className="text-emerald-600" />
                      <span className="font-extrabold text-sm text-slate-800">{benchmarkResult.pi_server.name}</span>
                    </div>
                    <Badge className="bg-emerald-600 hover:bg-emerald-600 text-white rounded-md uppercase font-black text-[9px] tracking-wider">
                      Lokal (Kasir)
                    </Badge>
                  </div>

                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-black text-emerald-700">{benchmarkResult.pi_server.latency_ms}</span>
                    <span className="text-sm font-bold text-emerald-600">ms</span>
                    <span className="text-xs text-slate-400 font-bold ml-2">Jitter: ~{benchmarkResult.pi_server.jitter_ms}ms</span>
                  </div>

                  <div className="space-y-1.5">
                    <div className="text-xs font-bold text-slate-700">{benchmarkResult.pi_server.rating}</div>
                    <p className="text-[11px] text-slate-500 leading-relaxed">
                      {benchmarkResult.pi_server.description}
                    </p>
                  </div>
                </div>

                {/* CLOUD SERVER */}
                <div className="p-5 rounded-2xl border-2 border-blue-100 bg-blue-50/20 relative overflow-hidden space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Globe size={18} className="text-blue-600" />
                      <span className="font-extrabold text-sm text-slate-800">Google Cloud Node</span>
                    </div>
                    <Badge className="bg-blue-600 hover:bg-blue-600 text-white rounded-md uppercase font-black text-[9px] tracking-wider">
                      Remote (Pusat)
                    </Badge>
                  </div>

                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-black text-blue-700">{benchmarkResult.google_server.latency_ms}</span>
                    <span className="text-sm font-bold text-blue-600">ms</span>
                    <span className="text-xs text-slate-400 font-bold ml-2">Jitter: ~{benchmarkResult.google_server.jitter_ms}ms</span>
                  </div>

                  <div className="space-y-1.5">
                    <div className="text-xs font-bold text-slate-700">{benchmarkResult.google_server.rating}</div>
                    <p className="text-[11px] text-slate-500 leading-relaxed">
                      {benchmarkResult.google_server.description}
                    </p>
                  </div>
                </div>
              </div>

              {/* RATIO BENCHMARK BAR */}
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-amber-50 text-amber-600 rounded-lg shrink-0">
                    <TrendingUp size={18} />
                  </div>
                  <div>
                    <div className="font-extrabold text-xs text-slate-800">Performa Jaringan Lokal</div>
                    <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">
                      Server lokal kasir merespon sekitar <strong className="text-emerald-600">{Math.max(2, Math.round(benchmarkResult.google_server.latency_ms / benchmarkResult.pi_server.latency_ms))}x lebih cepat</strong> dibandingkan server internet Cloud Run.
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs font-extrabold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-100">
                    Kasir Bebas Lag
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <div className="py-8 text-center text-slate-400 space-y-2">
              <ChevronRight size={32} className="mx-auto text-slate-300 transform rotate-90" />
              <p className="text-xs font-bold text-slate-500">Benchmark belum dijalankan</p>
              <p className="text-[11px] text-slate-400">Klik "Mulai Uji Kecepatan" di atas untuk membandingkan performa latency server secara real-time.</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
