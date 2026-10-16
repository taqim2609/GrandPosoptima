import { Component } from "react";
import { AlertTriangle, RefreshCw, Send, ShieldAlert, ChevronDown, ChevronUp } from "lucide-react";
import { logAppError } from "@/lib/diag";
import { logRuntimeErrorToFirestore } from "@/lib/firebase";
import GlobalErrorDiagnosticPanel from "./GlobalErrorDiagnosticPanel";

/* Menahan error render agar tidak mematikan seluruh aplikasi/halaman.
   Dipakai membungkus isi sub-tab & halaman Pengaturan. */
export default class ErrorBoundary extends Component {
  constructor(p) {
    super(p);
    this.state = { err: null, reported: false, showDiagPanel: false };
  }
  static getDerivedStateFromError(err) {
    return { err, reported: false };
  }
  componentDidCatch(err, info) {
    try {
      console.error("[gak] render error:", err, info?.componentStack?.slice(0, 400));
      // Log to diagnostic module and Firestore collection for remote debugging
      logAppError("react_render_error", err?.message || String(err), {
        stack: err?.stack || "",
        componentStack: info?.componentStack || "",
      });
      logRuntimeErrorToFirestore({
        type: "react_render_error",
        message: err?.message || String(err),
        stack: err?.stack || "",
        componentStack: info?.componentStack || "",
      })
        .then(() => this.setState({ reported: true }))
        .catch(() => {});
    } catch (e) {}

    const errStr = String(err?.message || err || "");
    if (
      errStr.includes("Loading chunk") ||
      errStr.includes("ChunkLoadError") ||
      errStr.includes("Dynamically imported module")
    ) {
      const reloaded = JSON.parse(window.sessionStorage.getItem("retry-eb-refreshed") || "false");
      if (!reloaded) {
        window.sessionStorage.setItem("retry-eb-refreshed", "true");
        window.location.reload();
      }
    }
  }
  render() {
    if (!this.state.err) return this.props.children;
    const isChunkError =
      String(this.state.err?.message || "").includes("ChunkLoadError") ||
      String(this.state.err?.message || "").includes("Loading chunk");

    return (
      <div className="h-full overflow-y-auto p-6 space-y-6" data-testid="render-error">
        <div className="max-w-2xl rounded-2xl border-2 border-[#F59E0B] bg-[#FFFBEB] p-5 shadow-sm">
          <div className="font-extrabold text-[#92400E] flex items-center gap-2 text-base">
            <AlertTriangle size={20} /> {isChunkError ? "Pembaruan Versi Aplikasi / Bundle" : "Bagian ini gagal dimuat (Render Exception)"}
          </div>
          <p className="text-sm text-[#92400E] mt-1.5 leading-relaxed">
            {isChunkError
              ? "Aplikasi telah diperbarui ke versi terbaru di server. Klik tombol di bawah untuk memuat ulang halaman dan menyinkronkan bundle."
              : "Sisa aplikasi tetap bisa dipakai (kolom dan halaman lain tidak terpengaruh). Laporan error telah otomatis dicatat di panel diagnostik dan dikirim ke telemetri Firestore."}
          </p>
          <pre className="mt-3 rounded-xl bg-white border border-amber-200/80 p-3 text-[11px] overflow-x-auto whitespace-pre-wrap font-mono text-amber-950">
            {String(this.state.err?.message || this.state.err)}
          </pre>
          <div className="flex items-center gap-2.5 mt-4 flex-wrap">
            <button
              onClick={() => {
                if (isChunkError) {
                  window.location.reload();
                } else {
                  this.setState({ err: null });
                }
              }}
              className="tap h-10 px-4 rounded-xl bg-[#B45309] hover:bg-[#92400E] text-white font-bold text-sm inline-flex items-center gap-2 transition shadow-sm"
            >
              <RefreshCw size={14} /> {isChunkError ? "Muat Ulang Aplikasi Versi Baru" : "Coba Muat Ulang Bagian Ini"}
            </button>

            <button
              onClick={() => this.setState((prev) => ({ showDiagPanel: !prev.showDiagPanel }))}
              className="h-10 px-4 rounded-xl bg-white border border-amber-300 hover:bg-amber-100/50 text-[#92400E] font-bold text-sm inline-flex items-center gap-2 transition"
            >
              <ShieldAlert size={14} />
              {this.state.showDiagPanel ? "Sembunyikan Panel Diagnostik" : "Buka Panel Diagnostik Error"}
              {this.state.showDiagPanel ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>

            {this.state.reported && (
              <span className="text-xs font-bold text-[#047857] flex items-center gap-1 ml-auto">
                <Send size={12} /> Terkirim ke Telemetri
              </span>
            )}
          </div>
        </div>

        {this.state.showDiagPanel && (
          <div className="max-w-4xl border border-zinc-200 rounded-3xl p-4 bg-zinc-50/50 shadow-inner">
            <GlobalErrorDiagnosticPanel embedded={true} />
          </div>
        )}
      </div>
    );
  }
}

