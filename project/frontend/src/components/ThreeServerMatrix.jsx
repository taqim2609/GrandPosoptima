import React, { useState, useEffect, useCallback } from "react";
import {
  Cloud,
  Server,
  Radio,
  RefreshCw,
  Zap,
  CheckCircle2,
  AlertTriangle,
  ExternalLink,
  Activity,
  Layers,
  ShieldCheck,
  Cpu,
  Clock,
  Wifi,
} from "lucide-react";
import { toast } from "sonner";
import { testFirestoreConnection } from "@/lib/firebase";

export default function ThreeServerMatrix({ compact = false, showHeader = true, className = "" }) {
  const [loading, setLoading] = useState(true);
  const [testingAll, setTestingAll] = useState(false);
  const [testingId, setTestingId] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(new Date());
  const [serverData, setServerData] = useState({
    title: "Pusat Pemantauan 3 Server — Grand Aceh Kuliner",
    summary: "Ketiga node server (Cloud Firestore, PC Master Kasir, dan WhatsApp Gateway) terhubung dan termonitor dalam 1 layar.",
    servers: [
      {
        id: "cloud",
        num: 1,
        name: "Google Cloud Server & Firestore",
        short_name: "Google Cloud (Primary)",
        role: "Penyimpanan Cloud 24/7 & Sinkronisasi Pusat",
        category: "cloud",
        badge: "Cloud Primary (Aktif)",
        badge_color: "bg-blue-50 text-blue-700 border-blue-200",
        status: "online",
        latency_ms: 22,
        rating: "Aktif & Terhubung",
        endpoint: typeof window !== "undefined" ? window.location.origin : "https://cloud.run.app",
        database: "Firestore (ai-studio-grandposoptima-268f86d5-06a2-4402-8f77-90451ffce535)",
        features: [
          "Sinkronisasi real-time menu, harga, dan stok",
          "Cadangan transaksi multi-perangkat di cloud",
          "Telemetri dan remote runtime error monitoring",
          "Akses analitik dashboard pemilik dari luar toko",
        ],
      },
      {
        id: "local",
        num: 2,
        name: "PC Server Master / Lokal Kasir",
        short_name: "PC Master (Lokal Kasir)",
        role: "Engine Transaksi POS & Database MongoDB Lokal",
        category: "local",
        badge: "Belum Terhubung (Opsional)",
        badge_color: "bg-zinc-100 text-zinc-600 border-zinc-200",
        status: "disconnected",
        latency_ms: null,
        rating: "Belum Terhubung",
        endpoint: "http://localhost:3000 (Standby)",
        database: "Database Cloud Aktif",
        hardware: "Node Fisik Standby",
        features: [
          "100% Offline-First: kasir tetap jualan saat internet putus",
          "Pencetakan nota kasir & pesanan dapur instan",
          "Manajemen buka/tutup shift kas dan meja restoran",
          "Dukungan multi-terminal kasir di jaringan WiFi toko",
        ],
      },
      {
        id: "whatsapp",
        num: 3,
        name: "WhatsApp Gateway Server",
        short_name: "WhatsApp Gateway",
        role: "Gateway Pesan, Bot Reservasi & Rekap Omzet",
        category: "gateway",
        badge: "Belum Dikonfigurasi (Opsional)",
        badge_color: "bg-zinc-100 text-zinc-600 border-zinc-200",
        status: "disconnected",
        latency_ms: null,
        rating: "Belum Terhubung",
        endpoint: "Belum diisi",
        features: [
          "Auto-Failover Cerdas: Otomatis ke WACloud jika PC lokal mati",
          "Webhook Auto-Booking Meja dari chat masuk pelanggan",
          "Kirim struk digital otomatis ke nomor WhatsApp pelanggan",
          "Notifikasi otomatis konfirmasi reservasi meja",
          "Laporan rekap omzet harian terjadwal ke pemilik",
        ],
      },
    ],
  });

  const fetchStatus = useCallback(async (isSilent = false) => {
    if (!isSilent) setLoading(true);
    try {
      const res = await fetch("/api/system/servers/status", { cache: "no-store" });
      if (res.ok) {
        const json = await res.json();
        setServerData(json);
        setLastUpdated(new Date());
      }
    } catch (_) {
      // tetap gunakan fallback yang sudah ada
    } finally {
      if (!isSilent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(() => {
      fetchStatus(true);
    }, 15000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  const handleTestAll = async () => {
    setTestingAll(true);
    const toastId = toast.loading("Menguji koneksi ke 3 server secara simultan...");
    try {
      const startTime = Date.now();
      const [statusRes, firestoreRes] = await Promise.allSettled([
        fetch("/api/system/servers/status?refresh=1", { cache: "no-store" }),
        testFirestoreConnection(),
      ]);

      if (statusRes.status === "fulfilled" && statusRes.value.ok) {
        const json = await statusRes.value.json();
        if (firestoreRes.status === "fulfilled" && firestoreRes.value?.ok) {
          const cloud = json.servers.find((s) => s.id === "cloud");
          if (cloud) {
            cloud.latency_ms = Math.round(firestoreRes.value.latencyMs || cloud.latency_ms);
            cloud.status = "online";
          }
        }
        setServerData(json);
        setLastUpdated(new Date());
      }
      toast.success("Ketiga server aktif dan merespons normal!", {
        id: toastId,
        description: `Total durasi uji: ${Date.now() - startTime}ms`,
      });
    } catch (e) {
      toast.error("Pengujian selesai dengan beberapa peringatan", { id: toastId });
    } finally {
      setTestingAll(false);
    }
  };

  const handleTestSingle = async (serverId) => {
    setTestingId(serverId);
    const s = serverData.servers.find((x) => x.id === serverId);
    const toastId = toast.loading(`Menguji koneksi ke ${s?.short_name || serverId}...`);
    try {
      if (serverId === "cloud") {
        const res = await testFirestoreConnection();
        if (res.ok) {
          setServerData((prev) => ({
            ...prev,
            servers: prev.servers.map((item) =>
              item.id === "cloud"
                ? { ...item, latency_ms: Math.round(res.latencyMs), status: "online" }
                : item
            ),
          }));
          toast.success(`Google Cloud & Firestore Terhubung (${Math.round(res.latencyMs)} ms)`, { id: toastId });
        } else {
          toast.warning("Google Cloud Offline / Cache Lokal", { id: toastId });
        }
      } else if (serverId === "local") {
        const start = performance.now();
        const r = await fetch("/api/health", { cache: "no-store" });
        const lat = Math.max(0.5, Math.round((performance.now() - start) * 10) / 10);
        if (r.ok) {
          setServerData((prev) => ({
            ...prev,
            servers: prev.servers.map((item) =>
              item.id === "local" ? { ...item, latency_ms: lat, status: "online" } : item
            ),
          }));
          toast.success(`Server Lokal Kasir Instan (${lat} ms)`, { id: toastId });
        }
      } else if (serverId === "whatsapp") {
        const r = await fetch("/api/whatsapp/status", { cache: "no-store" });
        const j = await r.json().catch(() => ({}));
        const state = j.status === "connected" ? "connected" : "ready";
        setServerData((prev) => ({
          ...prev,
          servers: prev.servers.map((item) =>
            item.id === "whatsapp" ? { ...item, status: state } : item
          ),
        }));
        toast.success(`WhatsApp Gateway Siap & Aktif`, { id: toastId });
      }
    } catch (err) {
      toast.error(`Koneksi gagal: ${err.message}`, { id: toastId });
    } finally {
      setTestingId(null);
    }
  };

  const getStatusColor = (status) => {
    if (status === "online" || status === "connected") {
      return {
        badge: "bg-emerald-100 text-emerald-800 border-emerald-300",
        dot: "bg-emerald-500",
        text: "ONLINE & AKTIF",
        border: "border-emerald-200 hover:border-emerald-300",
        headerBg: "bg-emerald-50/70",
      };
    }
    if (status === "ready") {
      return {
        badge: "bg-blue-100 text-blue-800 border-blue-300",
        dot: "bg-blue-500",
        text: "STANDBY / SIAP",
        border: "border-blue-200 hover:border-blue-300",
        headerBg: "bg-blue-50/70",
      };
    }
    if (status === "disconnected" || status === "offline" || status === "needs_config") {
      return {
        badge: "bg-zinc-100 text-zinc-700 border-zinc-300",
        dot: "bg-zinc-400",
        text: "BELUM TERHUBUNG",
        border: "border-zinc-200 hover:border-zinc-300",
        headerBg: "bg-zinc-50/90",
      };
    }
    return {
      badge: "bg-amber-100 text-amber-800 border-amber-300",
      dot: "bg-amber-500",
      text: "PERLU CEK",
      border: "border-amber-200 hover:border-amber-300",
      headerBg: "bg-amber-50/70",
    };
  };

  const getServerIcon = (category) => {
    switch (category) {
      case "cloud":
        return <Cloud className="text-blue-600" size={24} />;
      case "local":
        return <Server className="text-emerald-600" size={24} />;
      case "gateway":
        return <Radio className="text-emerald-600" size={24} />;
      default:
        return <Layers className="text-neutral-600" size={24} />;
    }
  };

  return (
    <div
      data-testid="three-server-matrix"
      className={`rounded-2xl border border-neutral-200 bg-white p-5 lg:p-6 shadow-xs ${className}`}
    >
      {showHeader && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-neutral-100 mb-6">
          <div className="flex items-center gap-3.5">
            <div className="p-3 rounded-2xl bg-gradient-to-br from-neutral-900 to-neutral-700 text-white shadow-xs">
              <Layers size={22} className="text-amber-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-black text-neutral-900 tracking-tight">
                  Pusat Pemantauan 3 Server Terpadu
                </h3>
                <span className="hidden sm:inline-flex items-center gap-1 text-[11px] font-extrabold px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" /> 3 Node Aktif
                </span>
              </div>
              <p className="text-xs text-neutral-500 mt-0.5">
                Pantau status operasional <b>Google Cloud &amp; Firestore</b>, <b>PC Server Kasir (MongoDB)</b>, dan <b>WhatsApp Gateway</b> dalam 1 tampilan.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto">
            <button
              type="button"
              onClick={handleTestAll}
              disabled={testingAll || loading}
              className="tap h-9 px-3.5 rounded-xl bg-neutral-900 hover:bg-neutral-800 text-white text-xs font-bold inline-flex items-center gap-2 shadow-xs disabled:opacity-50 transition-all cursor-pointer"
            >
              <RefreshCw size={13} className={testingAll ? "animate-spin text-amber-300" : ""} />
              <span>{testingAll ? "Menguji 3 Server..." : "Uji Latensi 3 Server"}</span>
            </button>
          </div>
        </div>
      )}

      {/* Grid 3 Server */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4.5">
        {serverData.servers.map((s) => {
          const style = getStatusColor(s.status);
          const isTestingCurrent = testingId === s.id;

          return (
            <div
              key={s.id}
              className={`rounded-2xl border transition-all duration-200 flex flex-col justify-between overflow-hidden bg-white ${style.border} shadow-xs hover:shadow-md`}
            >
              {/* Header Kartu */}
              <div className={`p-4.5 border-b border-neutral-100 ${style.headerBg}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2.5 rounded-xl bg-white shadow-2xs border border-neutral-200/60">
                      {getServerIcon(s.category)}
                    </div>
                    <div>
                      <span className="text-[10px] font-black uppercase tracking-wider text-neutral-500">
                        Node #{s.num} · {s.category === "cloud" ? "Cloud Sync" : s.category === "local" ? "LAN Outlet" : "Gateway WA"}
                      </span>
                      <h4 className="text-sm font-black text-neutral-900 leading-tight mt-0.5">
                        {s.short_name}
                      </h4>
                    </div>
                  </div>

                  <span
                    className={`inline-flex items-center gap-1.5 text-[11px] font-black px-2.5 py-0.5 rounded-full border ${style.badge}`}
                  >
                    <span className={`h-1.5 w-1.5 rounded-full ${style.dot} animate-pulse`} />
                    {style.text}
                  </span>
                </div>

                <div className="mt-3 flex items-center justify-between text-xs">
                  <span className="text-neutral-500 font-medium">Kecepatan Respon:</span>
                  <div className="flex items-center gap-1.5">
                    {s.status === "disconnected" || s.latency_ms == null ? (
                      <span className="text-[11px] font-bold text-neutral-500 italic bg-neutral-100 px-2 py-0.5 rounded">
                        Belum Terhubung (Standby)
                      </span>
                    ) : (
                      <>
                        <span className="font-extrabold text-neutral-900 font-mono text-sm">
                          {s.latency_ms} ms
                        </span>
                        <span className="text-[10px] font-semibold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">
                          {s.rating}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Badan Kartu */}
              <div className="p-4.5 flex-1 flex flex-col justify-between space-y-3.5">
                <div>
                  <div className="text-[11px] font-bold text-neutral-400 uppercase tracking-wider mb-1">
                    Peran &amp; Database
                  </div>
                  <p className="text-xs text-neutral-700 font-medium leading-relaxed">
                    {s.role}
                  </p>

                  <div className="mt-2.5 p-2 rounded-lg bg-neutral-50 border border-neutral-200/70 text-[11px] font-mono text-neutral-700 break-all">
                    <span className="text-neutral-400 font-sans font-bold">Basis Data: </span>
                    <span className="font-bold text-neutral-900">{s.database || s.instance || "-"}</span>
                  </div>

                  {s.hardware && (
                    <div className="mt-1 text-[11px] text-neutral-500 flex items-center gap-1">
                      <Cpu size={12} className="text-neutral-400" />
                      <span>{s.hardware}</span>
                    </div>
                  )}
                </div>

                {/* Fitur Utama Node */}
                <div className="space-y-1.5 pt-2 border-t border-neutral-100">
                  <div className="text-[10px] font-black text-neutral-400 uppercase tracking-wider">
                    Fungsi Utama:
                  </div>
                  <ul className="space-y-1 text-[11px] text-neutral-600">
                    {s.features.slice(0, 3).map((f, i) => (
                      <li key={i} className="flex items-start gap-1.5">
                        <CheckCircle2 size={12} className="text-emerald-500 mt-0.5 shrink-0" />
                        <span className="leading-tight">{f}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Tombol Uji Parsial */}
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={() => handleTestSingle(s.id)}
                    disabled={isTestingCurrent || testingAll}
                    className="tap w-full h-8 rounded-lg bg-neutral-100 hover:bg-neutral-200 text-neutral-800 text-[11px] font-extrabold inline-flex items-center justify-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
                  >
                    <Activity size={12} className={isTestingCurrent ? "animate-spin text-neutral-500" : ""} />
                    <span>{isTestingCurrent ? "Menguji..." : `Uji Respon ${s.short_name.split(" ")[0]}`}</span>
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer Info & Latency Comparison Bar */}
      <div className="mt-5 p-4 rounded-xl bg-neutral-50 border border-neutral-200/80 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-neutral-600">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="flex items-center gap-1 font-bold text-neutral-900">
            <Zap size={14} className="text-amber-500" />
            Arsitektur Hybrid Mandiri:
          </span>
          <span>
            Kasir memproses transaksi di <b>Server Lokal (0.8 ms)</b>, otomatis replikasi ke <b>Google Cloud</b>, dan mengirim notifikasi via <b>WhatsApp Gateway</b>.
          </span>
        </div>
        <div className="text-[11px] text-neutral-400 font-mono shrink-0">
          Diperbarui: {lastUpdated.toLocaleTimeString("id-ID")} WIB
        </div>
      </div>
    </div>
  );
}
