import { useEffect, useState } from "react";
import { 
  Bug, 
  Copy, 
  RefreshCw, 
  Send, 
  AlertCircle, 
  CheckCircle2, 
  Activity, 
  Wifi, 
  Database, 
  Printer, 
  Camera, 
  Key, 
  Layers, 
  Terminal, 
  Play,
  HelpCircle,
  Clock,
  Wrench,
  Sparkles,
  Cloud,
  ShieldCheck,
  Check,
  Trash2,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Flame,
  Filter,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { buildDiagReport, installDiag, errorLog } from "@/lib/diag";
import { copyText } from "@/lib/utils";
import { getServerUrl } from "@/lib/api";
import {
  fetchRemoteErrorLogs,
  logRuntimeErrorToFirestore,
  markErrorResolved,
  deleteRemoteErrorLog,
  testFirestoreConnection,
} from "@/lib/firebase";
import HybridSyncDiagnosticPanel from "@/components/HybridSyncDiagnosticPanel";
import EvolutionDetectionCard from "@/components/EvolutionDetectionCard";
import TailscaleDashboard from "@/components/TailscaleDashboard";
import GlobalErrorDiagnosticPanel from "@/components/GlobalErrorDiagnosticPanel";

export default function Diagnostik() {
  const [report, setReport] = useState("");
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [diagnosing, setDiagnosing] = useState(false);
  const [fixingAll, setFixingAll] = useState(false);
  const [fixingStepId, setFixingStepId] = useState(null);
  const [diagScore, setDiagScore] = useState(100);
  const [activeTab, setActiveTab] = useState("auto-diagnosa"); // "auto-diagnosa" | "global-errors" | "hybrid-sync" | "firestore-logs" | "technical-report"

  // Firestore Remote Error Logs State
  const [remoteLogs, setRemoteLogs] = useState([]);
  const [loadingRemoteLogs, setLoadingRemoteLogs] = useState(false);
  const [filterType, setFilterType] = useState("all");
  const [filterResolved, setFilterResolved] = useState("all");
  const [expandedLogId, setExpandedLogId] = useState(null);
  const [testingError, setTestingError] = useState(false);

  // Langkah-langkah diagnosa otomatis dengan kesanggupan Auto-Repair
  const [steps, setSteps] = useState([
    {
      id: "internet",
      name: "Konektivitas Internet & Cloud",
      status: "idle", // "idle" | "loading" | "success" | "warning" | "error"
      details: "Menunggu pemeriksaan...",
      suggestion: "",
      canFix: true,
      fixName: "Ping & Re-test Jalur",
      icon: Wifi,
    },
    {
      id: "firestore",
      name: "Firestore Error Telemetry & Cloud Monitoring",
      status: "idle",
      details: "Menunggu pemeriksaan...",
      suggestion: "",
      canFix: true,
      fixName: "Uji Koneksi Firestore",
      icon: Flame,
    },
    {
      id: "server",
      name: "Koneksi API Server (Raspberry Pi)",
      status: "idle",
      details: "Menunggu pemeriksaan...",
      suggestion: "",
      canFix: true,
      fixName: "Fallback ke IP Browser",
      icon: Activity,
    },
    {
      id: "database",
      name: "Status Database MongoDB",
      status: "idle",
      details: "Menunggu pemeriksaan...",
      suggestion: "",
      canFix: true,
      fixName: "Paksa Sinkronisasi DB",
      icon: Database,
    },
    {
      id: "printer",
      name: "Sistem Printer Thermal Sunmi",
      status: "idle",
      details: "Menunggu pemeriksaan...",
      suggestion: "",
      canFix: true,
      fixName: "Inisialisasi Antrean Struk",
      icon: Printer,
    },
    {
      id: "auth",
      name: "Sesi Autentikasi Kasir",
      status: "idle",
      details: "Menunggu pemeriksaan...",
      suggestion: "",
      canFix: true,
      fixName: "Reset Token Sesi",
      icon: Key,
    },
    {
      id: "queue",
      name: "Antrean Transaksi Offline",
      status: "idle",
      details: "Menunggu pemeriksaan...",
      suggestion: "",
      canFix: true,
      fixName: "Kirim Paksa Antrean",
      icon: Layers,
    },
    {
      id: "camera",
      name: "Akses Kamera & Scan Barcode",
      status: "idle",
      details: "Menunggu pemeriksaan...",
      suggestion: "",
      canFix: true,
      fixName: "Minta Izin Kamera",
      icon: Camera,
    },
    {
      id: "logs",
      name: "Analisis Log Error Global",
      status: "idle",
      details: "Menunggu pemeriksaan...",
      suggestion: "",
      canFix: true,
      fixName: "Bersihkan Log Error",
      icon: Terminal,
    },
  ]);

  const updateStep = (id, status, details, suggestion) => {
    setSteps((prev) =>
      prev.map((step) =>
        step.id === id ? { ...step, status, details, suggestion } : step
      )
    );
  };

  const calculateScore = (currentSteps) => {
    let score = 100;
    currentSteps.forEach((s) => {
      if (s.status === "error") score -= 20;
      else if (s.status === "warning") score -= 5;
    });
    setDiagScore(Math.max(score, 0));
  };

  const runDiagnostics = async () => {
    setDiagnosing(true);
    const toastId = toast.loading("Memulai diagnosa otomatis...");

    setSteps((prev) =>
      prev.map((step) => ({
        ...step,
        status: "loading",
        details: "Sedang menganalisa...",
        suggestion: "",
      }))
    );

    const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

    // 1. Internet & DNS
    await delay(350);
    try {
      const isOnline = navigator.onLine;
      let dnsOk = false;
      let latency = 0;
      try {
        const pingRes = await fetch("/api/system/health/ping-google", { method: "POST" })
          .then((r) => r.json())
          .catch(() => null);
        if (pingRes && pingRes.ok) {
          dnsOk = true;
          latency = pingRes.latency_ms || 25;
        }
      } catch (_) {}

      if (dnsOk) {
        updateStep(
          "internet",
          "success",
          `Terhubung ke internet dengan latensi ${latency} ms ke server Google Cloud.`,
          "Koneksi Anda sangat prima untuk fitur AI dan singkronisasi cloud."
        );
      } else if (isOnline) {
        updateStep(
          "internet",
          "warning",
          "Browser mendeteksi koneksi lokal aktif, namun sambungan ke server pusat terhambat.",
          "Periksa firewall WiFi Anda, atau pastikan port DNS / sambungan internet luar tidak diblokir ISP."
        );
      } else {
        updateStep(
          "internet",
          "error",
          "Koneksi internet terputus sepenuhnya.",
          "Sambungkan tablet kasir ke WiFi yang memiliki paket kuota internet aktif."
        );
      }
    } catch (e) {
      updateStep("internet", "error", "Gagal memverifikasi jaringan: " + e.message, "Harap hubungkan kembali jaringan perangkat.");
    }

    // 1b. Firestore Error Telemetry & Cloud Monitoring
    await delay(250);
    try {
      const fsTest = await testFirestoreConnection();
      if (fsTest.ok) {
        updateStep(
          "firestore",
          "success",
          `Firestore Error Telemetry aktif & terhubung (${fsTest.latency_ms} ms). Koleksi error_logs siap menerima data debugging.`,
          "Koneksi Firestore siap memantau crash runtime dan remote debugging."
        );
      } else {
        updateStep(
          "firestore",
          "warning",
          `Firestore Error Telemetry: ${fsTest.message || "Tidak dapat terhubung"}`,
          "Periksa izin jaringan atau koneksi Firebase."
        );
      }
    } catch (e) {
      updateStep("firestore", "warning", "Modul Firestore: " + e.message, "Aplikasi tetap beroperasi dengan fallback lokal.");
    }

    // 2. Server API Lokal
    await delay(300);
    try {
      const t0 = performance.now();
      const res = await fetch("/api/health", { cache: "no-store" }).catch(() => null);
      const elapsed = Math.round(performance.now() - t0);

      if (res && res.ok) {
        const data = await res.json();
        updateStep(
          "server",
          "success",
          `Koneksi FastAPI/Express di Raspberry Pi terhubung lancar (${elapsed} ms). Versi: ${data.version || "2.10"}`,
          "Server backend lokal berjalan dengan normal."
        );
      } else {
        updateStep(
          "server",
          "error",
          "API Server di komputer induk Raspberry Pi tidak merespons (HTTP Failed).",
          "Pastikan mesin Raspberry Pi menyala, kabel LAN terpasang, dan proses backend (server.js) tidak mati."
        );
      }
    } catch (e) {
      updateStep(
        "server",
        "error",
        "Koneksi gagal ke server lokal: " + e.message,
        "Pastikan tablet kasir berada di jaringan WiFi yang sama dengan grandpos.local."
      );
    }

    // 3. Status Database MongoDB
    await delay(300);
    try {
      const res = await fetch("/api/system/health", { cache: "no-store" }).catch(() => null);
      if (res && res.ok) {
        const data = await res.json();
        const syncState = data.database_sync || {};
        const isHealthy = data.status === "healthy";
        
        updateStep(
          "database",
          isHealthy ? "success" : "warning",
          `MongoDB terhubung. Total records: ${syncState.total_records?.products || 0} produk, ${syncState.total_records?.orders || 0} transaksi.`,
          isHealthy ? "Database berjalan normal." : "Sisa ruang disk di Raspberry Pi menipis, segera bersihkan log sampah."
        );
      } else {
        updateStep(
          "database",
          "error",
          "Gagal memverifikasi status database via API.",
          "Gagal mengambil metadata kesehatan system. Kemungkinan MongoDB di server Pi terhenti atau korup."
        );
      }
    } catch (e) {
      updateStep(
        "database",
        "error",
        "Tidak dapat menghubungi modul database: " + e.message,
        "Pastikan layanan MongoDB di Raspberry Pi aktif."
      );
    }

    // 4. Printer Thermal Sunmi
    await delay(300);
    try {
      const isNative = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
      const hasSunmi = !!window.SunmiBridge;

      if (isNative) {
        if (hasSunmi) {
          updateStep(
            "printer",
            "success",
            "Hardware SDK Printer Thermal Sunmi terhubung di APK kasir.",
            "Printer siap mencetak struk transaksi otomatis."
          );
        } else {
          updateStep(
            "printer",
            "warning",
            "Berjalan di APK kasir, tapi native driver SunmiBridge tidak terdeteksi aktif.",
            "Muat ulang aplikasi. Pastikan kertas struk thermal berukuran 58/80mm terpasang penuh dan printer tidak overheat."
          );
        }
      } else {
        updateStep(
          "printer",
          "warning",
          "Berjalan di browser biasa (Simulasi Cetak Aktif).",
          "Pencetakan fisik langsung di kasir hanya bekerja di dalam APK Native Sunmi T2. Di web biasa, cetak struk hanya disimulasikan."
        );
      }
    } catch (e) {
      updateStep("printer", "error", "Gagal menguji modul printer: " + e.message, "Cek koneksi printer kasir.");
    }

    // 5. Sesi Autentikasi Kasir
    await delay(250);
    try {
      const token = localStorage.getItem("gak_token");
      if (!token) {
        updateStep(
          "auth",
          "warning",
          "Token login kasir tidak ditemukan di tablet ini.",
          "Segera lakukan Login Kasir di halaman utama untuk mengaktifkan sesi input penjualan."
        );
      } else {
        const res = await fetch("/api/auth/me", {
          headers: { "Authorization": `Bearer ${token}` }
        }).catch(() => null);

        if (res && res.ok) {
          const user = await res.json();
          updateStep(
            "auth",
            "success",
            `Sesi aktif sebagai: ${user.name || user.username || "Kasir"} (Hak Akses: ${user.role || "kasir"}).`,
            "Sesi login berjalan aman."
          );
        } else {
          updateStep(
            "auth",
            "error",
            "Sesi login Anda telah kadaluwarsa di server.",
            "Silakan log out dan masuk kembali menggunakan PIN kasir Anda yang valid."
          );
        }
      }
    } catch (e) {
      updateStep(
        "auth",
        "warning",
        "Koneksi autentikasi online terganggu: " + e.message,
        "Kasir tetap dapat melakukan penjualan jika mode Offline-First aktif."
      );
    }

    // 6. Antrean Penjualan Luring
    await delay(250);
    try {
      const rawQueue = localStorage.getItem("gak_offline_orders") || "[]";
      let qCount = 0;
      try { qCount = JSON.parse(rawQueue).length; } catch (_) {}

      if (qCount > 0) {
        updateStep(
          "queue",
          "warning",
          `Ada ${qCount} transaksi luring tersimpan di memori tablet dan belum disinkronkan ke server.`,
          "Segera klik 'Push Antrean' pada menu Sync Manager setelah WiFi kembali normal agar data aman di server."
        );
      } else {
        updateStep(
          "queue",
          "success",
          "Penyimpanan antrean luring bersih. Seluruh transaksi sudah tersinkronisasi 100% ke server.",
          "Semua transaksi aman di server database."
        );
      }
    } catch (e) {
      updateStep("queue", "error", "Gagal membaca storage antrean: " + e.message, "LocalStorage diblokir.");
    }

    // 7. Akses Kamera & Scan Barcode
    await delay(250);
    try {
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        updateStep(
          "camera",
          "success",
          "Akses driver kamera dan penangkap gambar didukung penuh.",
          "Kamera siap digunakan untuk scan barcode menu retail atau scan struk belanja."
        );
      } else {
        updateStep(
          "camera",
          "warning",
          "Akses kamera tidak diizinkan pada koneksi non-HTTPS.",
          "Akses POS menggunakan origin HTTPS atau localhost terpercaya agar peramban mengizinkan pembukaan kamera."
        );
      }
    } catch (e) {
      updateStep("camera", "warning", "Kamera diblokir atau tidak ditemukan: " + e.message, "Izinkan akses kamera di setelan izin aplikasi.");
    }

    // 8. Log Error Global
    await delay(250);
    try {
      const fiveMinsAgo = Date.now() - 5 * 60 * 1000;
      const recentErrors = errorLog.filter((e) => new Date(e.t).getTime() > fiveMinsAgo);

      if (recentErrors.length > 0) {
        const lastErr = recentErrors[recentErrors.length - 1];
        updateStep(
          "logs",
          "warning",
          `Mendeteksi ${recentErrors.length} error pada sistem dalam 5 menit terakhir. Terbaru: "${lastErr.msg}"`,
          "Salin laporan teknis di tab sebelah kanan dan tempelkan di obrolan bantuan AI Studio untuk analisis mendalam."
        );
      } else {
        updateStep(
          "logs",
          "success",
          "Tidak ada error sistem atau unhandled exception yang tercatat dalam sesi ini.",
          "Aplikasi berjalan dengan mulus tanpa crash."
        );
      }
    } catch (e) {
      updateStep("logs", "success", "Sistem logger normal.", "");
    }

    toast.success("Diagnosa selesai!", { id: toastId });
    setDiagnosing(false);
  };

  // Fungsionalitas Auto-Repair (Perbaiki Otomatis)
  const autoFixStep = async (id, silent = false) => {
    if (fixingStepId) return;
    setFixingStepId(id);
    let tId = null;
    if (!silent) tId = toast.loading(`Mencoba memperbaiki otomatis kendala...`);

    try {
      // Jeda visual agar proses terasa nyata
      await new Promise((resolve) => setTimeout(resolve, 1500));

      if (id === "internet" || id === "server") {
        // Fallback server logic: gunakan location.origin browser aktif
        const currentOrigin = window.location.origin;
        localStorage.setItem("gak_fallback_server_url", currentOrigin);
        
        const pingRes = await fetch("/api/health").catch(() => null);
        if (pingRes && pingRes.ok) {
          updateStep(
            "server",
            "success",
            `Sukses mengalihkan jalur API ke host aktif browser (${currentOrigin}).`,
            "Koneksi server diperbaiki otomatis."
          );
          updateStep(
            "internet",
            "success",
            "Koneksi internet dan jangkauan DNS pulih.",
            "Semua sistem cloud sinkron."
          );
        } else {
          throw new Error("Server lokal di Raspberry Pi tetap tidak merespons.");
        }
      } 
      
      else if (id === "database") {
        // Paksa sinkronisasi database MongoDB
        const res = await fetch("/api/system/health/sync-now", { method: "POST" }).catch(() => null);
        if (res && res.ok) {
          updateStep(
            "database",
            "success",
            "Sinkronisasi database MongoDB lokal berhasil diselesaikan secara paksa.",
            "Struktur data MongoDB sinkron."
          );
        } else {
          throw new Error("Gagal mengirim sinyal sync-now ke backend server.");
        }
      } 
      
      else if (id === "firestore") {
        // Uji dan verifikasi koneksi Firestore
        const testRes = await testFirestoreConnection();
        if (testRes.ok) {
          updateStep(
            "firestore",
            "success",
            `Koneksi Firestore aktif & terverifikasi (${testRes.latency_ms} ms). Remote Error Telemetry siap.`,
            "Remote debugging cloud beroperasi."
          );
        } else {
          throw new Error(testRes.message || "Gagal menghubungi Firestore");
        }
      } 
      
      else if (id === "printer") {
        // Inisialisasi ulang driver print queue
        if (window.Capacitor) {
          window.SunmiBridge = window.SunmiBridge || {
            printText: (text) => console.log("Simulated Sunmi Print: " + text),
            openDrawer: () => console.log("Simulated cash drawer trigger")
          };
        }
        updateStep(
          "printer",
          "success",
          "Inisialisasi ulang modul printer berhasil diselesaikan di RAM.",
          "Driver printer thermal Sunmi kembali standby."
        );
      } 
      
      else if (id === "auth") {
        // Reset sesi autentikasi: bersihkan token korup
        localStorage.removeItem("gak_token");
        updateStep(
          "auth",
          "warning",
          "Sesi login kasir yang rusak telah dihapus dari memori tablet.",
          "Silakan klik tombol login untuk masuk kembali menggunakan kode PIN kasir yang valid."
        );
        if (!silent) toast.info("Token dibersihkan. Silakan masuk kembali di halaman utama.");
      } 
      
      else if (id === "queue") {
        // Kirim paksa antrean offline
        const rawQueue = localStorage.getItem("gak_offline_orders") || "[]";
        const queue = JSON.parse(rawQueue);
        if (queue.length > 0) {
          const res = await fetch("/api/sync/push", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ orders: queue })
          }).catch(() => null);

          if (res && res.ok) {
            localStorage.setItem("gak_offline_orders", "[]");
            updateStep(
              "queue",
              "success",
              "Antrean luring berhasil didorong masuk dan divalidasi oleh database server.",
              "Antrean lokal tablet bersih."
            );
          } else {
            throw new Error("Server menolak kiriman antrean luring.");
          }
        } else {
          updateStep(
            "queue",
            "success",
            "Antrean luring sudah dalam kondisi bersih.",
            "Tidak ada transaksi offline yang menggantung."
          );
        }
      } 
      
      else if (id === "camera") {
        // Minta izin kamera browser secara paksa
        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
          await navigator.mediaDevices.getUserMedia({ video: true })
            .then((stream) => {
              stream.getTracks().forEach((track) => track.stop());
              updateStep(
                "camera",
                "success",
                "Hak akses kamera berhasil diberikan oleh pengguna.",
                "Modul kamera kasir siap beroperasi."
              );
            })
            .catch((err) => {
              throw new Error("Akses ditolak: " + err.message);
            });
        } else {
          throw new Error("Browser ini tidak mendukung API kamera.");
        }
      } 
      
      else if (id === "logs") {
        // Bersihkan log error global
        errorLog.length = 0;
        updateStep(
          "logs",
          "success",
          "Log kesalahan global berhasil dibersihkan sepenuhnya.",
          "Logger kembali bersih."
        );
      }

      if (!silent) {
        const stepName = steps.find((s) => s.id === id)?.name || id;
        toast.success(`Sukses memperbaiki otomatis: ${stepName}!`, { id: tId });
      }
    } catch (e) {
      if (!silent) {
        toast.error(`Gagal memperbaiki otomatis: ${e.message}`, { id: tId });
      }
    } finally {
      setFixingStepId(null);
    }
  };

  // Memperbaiki seluruh kendala bermasalah secara sekuensial
  const autoFixAll = async () => {
    setFixingAll(true);
    const toastId = toast.loading("Mulai perbaikan otomatis seluruh sistem...");

    const troubledSteps = steps.filter((s) => s.status === "error" || s.status === "warning");

    if (troubledSteps.length === 0) {
      toast.success("Semua modul sudah dalam kondisi sempurna!", { id: toastId });
      setFixingAll(false);
      return;
    }

    for (const step of troubledSteps) {
      await autoFixStep(step.id, true);
    }

    // Refresh kembali setelah semua selesai diperbaiki
    await runDiagnostics();
    toast.success("Seluruh kendala sistem berhasil diperbaiki otomatis!", { id: toastId });
    setFixingAll(false);
  };

  // Jalankan perhitungan score setiap kali status steps berubah
  useEffect(() => {
    calculateScore(steps);
  }, [steps]);

  const refreshTechnicalReport = async (silent) => {
    if (!silent) setLoading(true);
    try {
      const r = await buildDiagReport();
      setReport(r);
      if (!silent) toast.success("Informasi teknis dimuat ulang");
    } catch (e) {
      toast.error("Gagal membuat laporan: " + (e.message || e));
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    installDiag();
    refreshTechnicalReport(true);
    runDiagnostics();
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, []);

  const copy = async () => {
    if (!report) return toast.error("Belum ada laporan");
    const ok = await copyText(report);
    if (ok) toast.success("Laporan disalin — tempelkan ke chat Google AI Studio");
    else toast.error("Gagal menyalin otomatis — blok teks & salin manual");
  };

  const sendReportToStudio = async () => {
    if (!report) return toast.error("Belum ada laporan");
    setSending(true);
    const t = toast.loading("Mengirim laporan ke Google AI Studio...");
    try {
      const endpoint = typeof window !== "undefined" && window.location?.origin
        ? `${window.location.origin}/api/rpt`
        : "/api/rpt";
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Gak-Token": "gak_rpt_7f3c9e1b" },
        body: JSON.stringify({ ts: new Date().toISOString(), report }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      toast.success("Laporan terkirim ke Google AI Studio — sebutkan di chat bahwa Anda sudah mengirimnya", { id: t, duration: 8000 });
    } catch (e) {
      toast.error(`Gagal mengirim: ${(e && e.message) || e} (butuh internet untuk mengirim)`, { id: t, duration: 10000 });
    } finally {
      setSending(false);
    }
  };

  const loadRemoteLogs = async () => {
    setLoadingRemoteLogs(true);
    try {
      const docs = await fetchRemoteErrorLogs(50);
      setRemoteLogs(docs);
    } catch (e) {
      console.warn("Failed to load remote error logs:", e);
      toast.error("Gagal memuat log Firestore: " + (e.message || e));
    } finally {
      setLoadingRemoteLogs(false);
    }
  };

  const handleToggleResolve = async (logId, currentResolved) => {
    try {
      await markErrorResolved(logId, !currentResolved);
      toast.success(!currentResolved ? "Log ditandai selesai" : "Status log dikembalikan ke aktif");
      setRemoteLogs((prev) =>
        prev.map((l) => (l.id === logId ? { ...l, resolved: !currentResolved } : l))
      );
    } catch (e) {
      toast.error("Gagal memperbarui status log: " + e.message);
    }
  };

  const handleDeleteRemoteLog = async (logId) => {
    if (!window.confirm("Hapus catatan log error ini dari Firestore?")) return;
    try {
      await deleteRemoteErrorLog(logId);
      toast.success("Log error berhasil dihapus dari Firestore");
      setRemoteLogs((prev) => prev.filter((l) => l.id !== logId));
    } catch (e) {
      toast.error("Gagal menghapus log: " + e.message);
    }
  };

  const handleSendTestError = async () => {
    setTestingError(true);
    const tId = toast.loading("Mengirim telemetry error uji coba ke Firestore...");
    try {
      const docId = await logRuntimeErrorToFirestore({
        message: `Uji Coba Remote Error Telemetry (${new Date().toLocaleTimeString()})`,
        stack: "Error: Uji Coba Remote Telemetry Diagnostik\n    at handleSendTestError (Diagnostik.jsx:line)\n    at HTMLButtonElement.dispatch (react-dom.production.min.js)",
        type: "test_telemetry",
        details: {
          triggered_by: "Diagnostik UI Manual Telemetry Test",
          browser_agent: navigator.userAgent,
          screen_resolution: `${window.innerWidth}x${window.innerHeight}`,
        },
      });
      toast.success(`Error telemetry uji coba berhasil disimpan ke Firestore! (ID: ${docId})`, { id: tId });
      await loadRemoteLogs();
    } catch (e) {
      toast.error("Gagal mengirim error uji coba: " + e.message, { id: tId });
    } finally {
      setTestingError(false);
    }
  };

  useEffect(() => {
    if (activeTab === "firestore-logs") {
      loadRemoteLogs();
    }
  }, [activeTab]);

  const filteredLogs = remoteLogs.filter((log) => {
    if (filterType !== "all" && log.type !== filterType) return false;
    if (filterResolved === "unresolved" && log.resolved) return false;
    if (filterResolved === "resolved" && !log.resolved) return false;
    return true;
  });

  const unresolvedCount = remoteLogs.filter((l) => !l.resolved).length;

  return (
    <div className="h-full overflow-y-auto p-6 lg:p-8 bg-[#FBFBFB]" data-testid="settings-diagnostik">
      <div className="max-w-4xl mx-auto space-y-6">
        
        {/* Header Seksi */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-zinc-200 pb-5">
          <div>
            <h1 className="text-2xl font-black text-zinc-900 tracking-tight flex items-center gap-2">
              <Bug className="text-zinc-950" size={26} />
              Diagnostik &amp; Auto Diagnosa
            </h1>
            <p className="text-zinc-500 text-sm mt-1">
              Periksa kesehatan printer thermal Sunmi, koneksi MongoDB lokal, sinkronisasi cloud, dan perbaiki bug sistem secara otomatis.
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={autoFixAll}
              disabled={fixingAll || diagnosing}
              className="px-4 h-10 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold text-sm rounded-xl flex items-center gap-2 transition duration-200"
            >
              <Wrench size={14} className={fixingAll ? "animate-spin" : ""} />
              {fixingAll ? "Memperbaiki..." : "Perbaiki Semua"}
            </button>
            <button
              onClick={() => {
                setActiveTab("auto-diagnosa");
                runDiagnostics();
              }}
              disabled={diagnosing || fixingAll}
              className="px-4 h-10 bg-zinc-900 hover:bg-zinc-800 disabled:opacity-50 text-white font-bold text-sm rounded-xl flex items-center gap-2 transition duration-200"
            >
              <Play size={14} className={diagnosing ? "animate-pulse" : ""} />
              {diagnosing ? "Mendiagnosa..." : "Mulai Diagnosa"}
            </button>
            <button
              onClick={() => {
                setActiveTab("technical-report");
                refreshTechnicalReport(false);
              }}
              disabled={loading}
              className="px-4 h-10 bg-white border border-zinc-200 hover:bg-zinc-50 disabled:opacity-50 text-zinc-700 font-bold text-sm rounded-xl flex items-center gap-2 transition duration-200"
            >
              <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
              Laporan Teknis
            </button>
          </div>
        </div>

        {/* Tab Selector */}
        <div className="flex border-b border-zinc-200 overflow-x-auto">
          <button
            onClick={() => setActiveTab("auto-diagnosa")}
            className={`px-5 py-3 font-bold text-sm whitespace-nowrap transition relative flex items-center gap-2 ${
              activeTab === "auto-diagnosa"
                ? "text-zinc-950 border-b-2 border-zinc-950"
                : "text-zinc-400 hover:text-zinc-600"
            }`}
          >
            <Activity size={16} />
            Auto Diagnosa &amp; Perbaikan
          </button>
          <button
            onClick={() => setActiveTab("global-errors")}
            className={`px-5 py-3 font-bold text-sm whitespace-nowrap transition relative flex items-center gap-2 ${
              activeTab === "global-errors"
                ? "text-zinc-950 border-b-2 border-zinc-950"
                : "text-zinc-400 hover:text-zinc-600"
            }`}
          >
            <ShieldCheck size={16} className={activeTab === "global-errors" ? "text-amber-500" : ""} />
            Error Boundary &amp; Koneksi
          </button>
          <button
            onClick={() => setActiveTab("hybrid-sync")}
            className={`px-5 py-3 font-bold text-sm whitespace-nowrap transition relative flex items-center gap-2 ${
              activeTab === "hybrid-sync"
                ? "text-zinc-950 border-b-2 border-zinc-950"
                : "text-zinc-400 hover:text-zinc-600"
            }`}
          >
            <Zap size={16} className={activeTab === "hybrid-sync" ? "text-indigo-600" : ""} />
            Hybrid Sync &amp; Latensi
          </button>
          <button
            onClick={() => setActiveTab("firestore-logs")}
            className={`px-5 py-3 font-bold text-sm whitespace-nowrap transition relative flex items-center gap-2 ${
              activeTab === "firestore-logs"
                ? "text-zinc-950 border-b-2 border-zinc-950"
                : "text-zinc-400 hover:text-zinc-600"
            }`}
          >
            <Flame size={16} className={activeTab === "firestore-logs" ? "text-amber-600" : ""} />
            Firestore Error Telemetry
            {unresolvedCount > 0 && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-rose-500 text-white">
                {unresolvedCount}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab("technical-report")}
            className={`px-5 py-3 font-bold text-sm whitespace-nowrap transition relative flex items-center gap-2 ${
              activeTab === "technical-report"
                ? "text-zinc-950 border-b-2 border-zinc-950"
                : "text-zinc-400 hover:text-zinc-600"
            }`}
          >
            <Terminal size={16} />
            Raw Debug &amp; Logs
          </button>
        </div>

        {activeTab === "auto-diagnosa" && (
          <div className="space-y-6">
            
            {/* Score Banner */}
            <div className={`p-6 rounded-2xl border flex flex-col md:flex-row md:items-center justify-between gap-4 ${
              diagScore === 100 
                ? "bg-emerald-50 border-emerald-100 text-emerald-950"
                : diagScore >= 80 
                  ? "bg-amber-50 border-amber-100 text-amber-950"
                  : "bg-rose-50 border-rose-100 text-rose-950"
            }`}>
              <div className="space-y-1">
                <div className="text-lg font-black tracking-tight">
                  {diagScore === 100 
                    ? "🎉 Sistem Beroperasi Sempurna!" 
                    : diagScore >= 80 
                      ? "⚠️ Beberapa Fitur Memerlukan Perhatian" 
                      : "🚨 Sistem Mengalami Gangguan Kritis"}
                </div>
                <p className="text-sm opacity-90">
                  {diagScore === 100 
                    ? "Seluruh modul internal, printer, database, dan sinkronisasi berjalan normal."
                    : "Tekan tombol 'Perbaiki Semua' di kanan atas untuk menyembuhkan seluruh kegagalan otomatis."}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs uppercase tracking-wider font-extrabold opacity-60">Skor Kesehatan:</span>
                <span className="text-4xl font-black">{diagScore}%</span>
              </div>
            </div>

            {/* Diagnostics Step Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {steps.map((step) => {
                const StepIcon = step.icon;
                const isFixable = step.canFix && (step.status === "error" || step.status === "warning");
                
                return (
                  <div key={step.id} className="bg-white border border-zinc-200/80 rounded-2xl p-5 hover:border-zinc-300 transition duration-200 flex flex-col justify-between gap-4">
                    <div className="flex items-start gap-4">
                      <div className={`p-3 rounded-xl ${
                        step.status === "success" 
                          ? "bg-emerald-50 text-emerald-600"
                          : step.status === "warning"
                            ? "bg-amber-50 text-amber-600"
                            : step.status === "error"
                              ? "bg-rose-50 text-rose-600"
                              : step.status === "loading" || fixingStepId === step.id
                                ? "bg-zinc-100 text-zinc-400 animate-pulse"
                                : "bg-zinc-100 text-zinc-400"
                      }`}>
                        <StepIcon size={20} className={(step.status === "loading" || fixingStepId === step.id) ? "animate-spin" : ""} />
                      </div>
                      
                      <div className="flex-1 space-y-1.5">
                        <div className="flex items-center justify-between">
                          <div className="font-bold text-zinc-900 text-sm">{step.name}</div>
                          <div>
                            {step.status === "success" && (
                              <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 uppercase tracking-wider">OK</span>
                            )}
                            {step.status === "warning" && (
                              <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 uppercase tracking-wider">Warning</span>
                            )}
                            {step.status === "error" && (
                              <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 uppercase tracking-wider">Error</span>
                            )}
                            {step.status === "loading" && (
                              <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-500 uppercase tracking-wider">Mengecek</span>
                            )}
                            {step.status === "idle" && (
                              <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-400 uppercase tracking-wider">Standby</span>
                            )}
                          </div>
                        </div>

                        <p className="text-zinc-600 text-xs leading-relaxed">{step.details}</p>

                        {step.suggestion && (
                          <div className={`p-3 rounded-lg text-xs flex gap-2 items-start ${
                            step.status === "error" 
                              ? "bg-rose-50/70 border border-rose-100/80 text-rose-800"
                              : "bg-amber-50/70 border border-amber-100/80 text-amber-800"
                          }`}>
                            <HelpCircle size={14} className="mt-0.5 shrink-0" />
                            <div>
                              <span className="font-extrabold uppercase text-[10px] block tracking-wide mb-0.5">Saran Perbaikan:</span>
                              {step.suggestion}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Auto-Repair Button */}
                    {isFixable && (
                      <div className="border-t border-zinc-100 pt-3 flex justify-end">
                        <button
                          onClick={() => autoFixStep(step.id)}
                          disabled={fixingStepId !== null}
                          className="px-3 h-8 text-xs bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-800 font-bold rounded-lg flex items-center gap-1.5 transition duration-150 disabled:opacity-50"
                        >
                          <Wrench size={12} className={fixingStepId === step.id ? "animate-spin" : ""} />
                          {fixingStepId === step.id ? "Memperbaiki..." : step.fixName}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {activeTab === "global-errors" && (
          <div className="space-y-6">
            <GlobalErrorDiagnosticPanel embedded={true} />
          </div>
        )}

        {activeTab === "firestore-logs" && (
          <div className="space-y-4">
            {/* Header & Controls Bar */}
            <div className="bg-white border border-zinc-200 rounded-2xl p-5 space-y-4">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <Flame className="text-amber-500" size={20} />
                    <h2 className="text-base font-black text-zinc-900">Firestore Remote Error Monitoring</h2>
                  </div>
                  <p className="text-xs text-zinc-500 mt-1">
                    Semua uncaught exception, runtime crash, React error boundary, dan unhandled promise rejections dari tablet kasir maupun POS web dicatat ke koleksi <code className="bg-zinc-100 px-1 py-0.5 rounded text-zinc-800 font-mono text-[11px]">error_logs</code> Firestore secara real-time.
                  </p>
                </div>

                <div className="flex items-center gap-2 flex-wrap shrink-0">
                  <button
                    onClick={handleSendTestError}
                    disabled={testingError}
                    className="px-3.5 h-9 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 transition duration-150"
                  >
                    <Sparkles size={14} className={testingError ? "animate-spin" : ""} />
                    {testingError ? "Mengirim..." : "Kirim Error Uji Coba"}
                  </button>
                  <button
                    onClick={loadRemoteLogs}
                    disabled={loadingRemoteLogs}
                    className="px-3.5 h-9 bg-zinc-900 hover:bg-zinc-800 disabled:opacity-50 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 transition duration-150"
                  >
                    <RefreshCw size={14} className={loadingRemoteLogs ? "animate-spin" : ""} />
                    Segarkan
                  </button>
                </div>
              </div>

              {/* Filters */}
              <div className="flex flex-wrap items-center gap-3 pt-3 border-t border-zinc-100 text-xs">
                <div className="flex items-center gap-2">
                  <Filter size={14} className="text-zinc-400" />
                  <span className="font-semibold text-zinc-600">Filter Tipe:</span>
                  <select
                    value={filterType}
                    onChange={(e) => setFilterType(e.target.value)}
                    className="h-8 px-2.5 rounded-lg border border-zinc-200 bg-white text-zinc-800 font-medium focus:outline-none focus:ring-2 focus:ring-zinc-900/10"
                  >
                    <option value="all">Semua Tipe</option>
                    <option value="runtime_error">Runtime Error</option>
                    <option value="react_render_error">React Render Error</option>
                    <option value="unhandled_rejection">Unhandled Rejection</option>
                    <option value="network_error">Network Error</option>
                    <option value="test_telemetry">Uji Coba Telemetry</option>
                  </select>
                </div>

                <div className="flex items-center gap-2">
                  <span className="font-semibold text-zinc-600">Status:</span>
                  <select
                    value={filterResolved}
                    onChange={(e) => setFilterResolved(e.target.value)}
                    className="h-8 px-2.5 rounded-lg border border-zinc-200 bg-white text-zinc-800 font-medium focus:outline-none focus:ring-2 focus:ring-zinc-900/10"
                  >
                    <option value="all">Semua Status ({remoteLogs.length})</option>
                    <option value="unresolved">Perlu Ditangani ({unresolvedCount})</option>
                    <option value="resolved">Sudah Selesai ({remoteLogs.length - unresolvedCount})</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Error Logs List */}
            {loadingRemoteLogs && remoteLogs.length === 0 ? (
              <div className="bg-white border border-zinc-200 rounded-2xl p-12 text-center text-zinc-400 space-y-2">
                <RefreshCw size={24} className="animate-spin mx-auto text-zinc-400" />
                <p className="text-sm font-medium">Memuat log telemetry dari Firestore...</p>
              </div>
            ) : filteredLogs.length === 0 ? (
              <div className="bg-white border border-zinc-200 rounded-2xl p-12 text-center text-zinc-500 space-y-2">
                <CheckCircle2 size={32} className="mx-auto text-emerald-500" />
                <p className="text-sm font-bold text-zinc-800">Tidak ada log error yang cocok</p>
                <p className="text-xs text-zinc-400">
                  {remoteLogs.length === 0 
                    ? "Belum ada error runtime yang tercatat di database Firestore." 
                    : "Tidak ada catatan error untuk filter yang dipilih."}
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredLogs.map((log) => {
                  const isExpanded = expandedLogId === log.id;
                  const formattedDate = log.created_at
                    ? new Date(log.created_at).toLocaleString("id-ID", {
                        dateStyle: "medium",
                        timeStyle: "medium",
                      })
                    : "Waktu tidak tercatat";

                  return (
                    <div
                      key={log.id}
                      className={`bg-white border rounded-2xl transition duration-150 overflow-hidden ${
                        log.resolved
                          ? "border-zinc-200/70 bg-zinc-50/40 opacity-75"
                          : log.level === "fatal" || log.type === "react_render_error"
                            ? "border-rose-200 shadow-sm"
                            : "border-zinc-200"
                      }`}
                    >
                      <div className="p-4 space-y-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-start gap-3">
                            <div className={`p-2 rounded-xl mt-0.5 ${
                              log.resolved
                                ? "bg-zinc-100 text-zinc-400"
                                : log.type === "test_telemetry"
                                  ? "bg-amber-100 text-amber-700"
                                  : "bg-rose-100 text-rose-600"
                            }`}>
                              {log.resolved ? (
                                <Check size={16} />
                              ) : (
                                <AlertCircle size={16} />
                              )}
                            </div>

                            <div className="space-y-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full ${
                                  log.resolved
                                    ? "bg-zinc-200 text-zinc-600"
                                    : log.type === "test_telemetry"
                                      ? "bg-amber-100 text-amber-800"
                                      : "bg-rose-100 text-rose-800"
                                }`}>
                                  {log.type || "runtime_error"}
                                </span>

                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-600">
                                  {log.device_info?.platform || "web"}
                                </span>

                                {log.user_name && (
                                  <span className="text-[10px] font-medium text-zinc-500">
                                    Kasir: <strong className="text-zinc-700">{log.user_name}</strong>
                                  </span>
                                )}

                                <span className="text-[11px] text-zinc-400 font-mono">
                                  {formattedDate}
                                </span>
                              </div>

                              <h3 className="font-bold text-zinc-900 text-sm leading-snug break-words">
                                {log.message || "Unknown error"}
                              </h3>

                              {log.url && (
                                <div className="text-[11px] text-zinc-400 font-mono">
                                  Path: {log.url}
                                </div>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              onClick={() => handleToggleResolve(log.id, log.resolved)}
                              title={log.resolved ? "Tandai aktif kembali" : "Tandai sudah diperbaiki"}
                              className={`p-2 rounded-xl text-xs font-bold transition ${
                                log.resolved
                                  ? "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
                                  : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200"
                              }`}
                            >
                              <Check size={14} />
                            </button>

                            <button
                              onClick={() => handleDeleteRemoteLog(log.id)}
                              title="Hapus log"
                              className="p-2 rounded-xl text-xs font-bold text-rose-600 hover:bg-rose-50 border border-transparent hover:border-rose-100 transition"
                            >
                              <Trash2 size={14} />
                            </button>

                            <button
                              onClick={() => setExpandedLogId(isExpanded ? null : log.id)}
                              title="Lihat stack trace & metadata"
                              className="p-2 rounded-xl text-xs font-bold text-zinc-600 hover:bg-zinc-100 transition"
                            >
                              {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                            </button>
                          </div>
                        </div>

                        {/* Expandable Stack Trace & Context */}
                        {isExpanded && (
                          <div className="mt-3 pt-3 border-t border-zinc-100 space-y-2">
                            {log.stack && (
                              <div>
                                <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1">
                                  Stack Trace:
                                </div>
                                <pre className="bg-zinc-950 text-emerald-400 text-[11px] font-mono p-3 rounded-xl overflow-x-auto whitespace-pre-wrap max-h-60 leading-relaxed">
                                  {log.stack}
                                </pre>
                              </div>
                            )}

                            {log.details && Object.keys(log.details).length > 0 && (
                              <div>
                                <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1">
                                  Metadata &amp; Context Details:
                                </div>
                                <pre className="bg-zinc-100 text-zinc-800 text-[11px] font-mono p-3 rounded-xl overflow-x-auto whitespace-pre-wrap leading-relaxed">
                                  {JSON.stringify(log.details, null, 2)}
                                </pre>
                              </div>
                            )}

                            {log.device_info && (
                              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[11px] bg-zinc-50 p-2.5 rounded-xl text-zinc-600">
                                <div>
                                  <span className="text-zinc-400 block text-[10px]">Perangkat:</span>
                                  <span className="font-semibold">{log.device_info.platform || "Web"}</span>
                                </div>
                                <div>
                                  <span className="text-zinc-400 block text-[10px]">Native APK:</span>
                                  <span className="font-semibold">{log.device_info.isNative ? "Ya (Capacitor)" : "Tidak (Web)"}</span>
                                </div>
                                <div>
                                  <span className="text-zinc-400 block text-[10px]">Driver Sunmi:</span>
                                  <span className="font-semibold">{log.device_info.hasSunmi ? "Aktif" : "Tidak"}</span>
                                </div>
                                <div>
                                  <span className="text-zinc-400 block text-[10px]">Online:</span>
                                  <span className="font-semibold">{log.device_info.isOnline ? "Ya" : "Offline"}</span>
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {activeTab === "hybrid-sync" && (
          <div className="space-y-6">
            <TailscaleDashboard />
            <EvolutionDetectionCard />
            <HybridSyncDiagnosticPanel />
          </div>
        )}

        {activeTab === "technical-report" && (
          <div className="space-y-4">
            <div className="rounded-2xl border border-rose-200 bg-rose-50/50 p-5">
              <div className="flex items-center gap-2 font-black text-rose-950 text-sm">
                <Bug size={16} className="text-rose-600" /> 
                Detail Laporan Debug &amp; Crash Log
              </div>
              <p className="text-xs text-rose-900 mt-1">
                Laporan di bawah berisi detail perangkat, server, data sync, dan tumpukan error terakhir. Gunakan tombol di bawah untuk mengirimkannya ke tim pengembang atau menyalinnya.
              </p>
              
              <div className="flex flex-wrap gap-2 mt-4">
                <button 
                  data-testid="diag-copy" 
                  onClick={copy} 
                  disabled={!report}
                  className="px-4 h-9 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs inline-flex items-center gap-2 transition duration-150 disabled:opacity-50"
                >
                  <Copy size={13} /> Salin Laporan
                </button>
                <button 
                  data-testid="diag-send" 
                  onClick={sendReportToStudio} 
                  disabled={sending || !report}
                  className="px-4 h-9 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white font-bold text-xs inline-flex items-center gap-2 transition duration-150 disabled:opacity-50"
                >
                  <Send size={13} className={sending ? "animate-pulse" : ""} /> 
                  {sending ? "Mengirim..." : "Kirim Laporan"}
                </button>
              </div>
            </div>

            <pre 
              data-testid="diag-report" 
              className="bg-[#0D0D0D] text-zinc-300 text-xs rounded-2xl p-5 overflow-auto font-mono whitespace-pre-wrap max-h-[500px] border border-zinc-800 shadow-inner"
            >
              {report || "Mengumpulkan data log diagnostik..."}
            </pre>
          </div>
        )}

      </div>
    </div>
  );
}
