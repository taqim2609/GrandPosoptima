import { Component } from "react";
import { AlertTriangle, RefreshCw, Send } from "lucide-react";
import { logAppError } from "@/lib/diag";
import { logRuntimeErrorToFirestore } from "@/lib/firebase";

/* Menahan error render agar tidak mematikan seluruh aplikasi/halaman.
   Dipakai membungkus isi sub-tab & halaman Pengaturan. */
export default class ErrorBoundary extends Component {
  constructor(p) { super(p); this.state = { err: null, reported: false }; }
  static getDerivedStateFromError(err) { return { err, reported: false }; }
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
      }).then(() => this.setState({ reported: true })).catch(() => {});
    } catch (e) {}

    const errStr = String(err?.message || err || "");
    if (errStr.includes("Loading chunk") || errStr.includes("ChunkLoadError") || errStr.includes("Dynamically imported module")) {
      const reloaded = JSON.parse(window.sessionStorage.getItem("retry-eb-refreshed") || "false");
      if (!reloaded) {
        window.sessionStorage.setItem("retry-eb-refreshed", "true");
        window.location.reload();
      }
    }
  }
  render() {
    if (!this.state.err) return this.props.children;
    const isChunkError = String(this.state.err?.message || "").includes("ChunkLoadError") || String(this.state.err?.message || "").includes("Loading chunk");
    return (
      <div className="h-full overflow-y-auto p-6" data-testid="render-error">
        <div className="max-w-xl rounded-2xl border-2 border-[#F59E0B] bg-[#FFFBEB] p-5">
          <div className="font-extrabold text-[#92400E] flex items-center gap-2"><AlertTriangle size={18} /> {isChunkError ? "Pembaruan Versi Aplikasi" : "Bagian ini gagal dimuat"}</div>
          <p className="text-sm text-[#92400E] mt-1">
            {isChunkError
              ? "Aplikasi telah diperbarui ke versi terbaru. Klik tombol di bawah untuk memuat ulang halaman."
              : "Sisa aplikasi tetap bisa dipakai (kolom lain tidak terpengaruh). Laporan error telah otomatis terkirim ke Firestore Remote Debugging."}
          </p>
          <pre className="mt-3 rounded-xl bg-white border p-3 text-[11px] overflow-x-auto whitespace-pre-wrap">{String(this.state.err?.message || this.state.err)}</pre>
          <div className="flex items-center gap-2 mt-3">
            <button onClick={() => { if (isChunkError) { window.location.reload(); } else { this.setState({ err: null }); } }}
              className="tap h-10 px-4 rounded-xl bg-[#B45309] text-white font-bold text-sm inline-flex items-center gap-2">
              <RefreshCw size={14} /> {isChunkError ? "Muat Ulang Aplikasi Versi Baru" : "Coba Muat Ulang Bagian Ini"}
            </button>
            {this.state.reported && (
              <span className="text-xs font-bold text-[#047857] flex items-center gap-1">
                <Send size={12} /> Terkirim ke Telemetri
              </span>
            )}
          </div>
        </div>
      </div>
    );
  }
}
