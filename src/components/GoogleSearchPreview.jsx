import React, { useState } from "react";
import { Search, Globe, Smartphone, Monitor, AlertTriangle, CheckCircle2, Share2, Info } from "lucide-react";

export default function GoogleSearchPreview({
  title = "",
  description = "",
  canonicalUrl = "https://grandacehkuliner.com",
  brandName = "Grand Aceh Kuliner",
  imageUrl = "/screenshot-desktop.png"
}) {
  const [deviceMode, setDeviceMode] = useState("desktop"); // 'desktop' | 'mobile'
  const [previewTab, setPreviewTab] = useState("google"); // 'google' | 'social'

  const titleLength = (title || "").length;
  const descLength = (description || "").length;

  // Title Status (Ideal 30 - 60 chars)
  const getTitleStatus = () => {
    if (titleLength === 0) return { label: "Kosong", color: "text-rose-600 bg-rose-50 border-rose-200", bar: "bg-rose-500", percent: 0 };
    if (titleLength < 30) return { label: "Terlalu Pendek (<30 kar)", color: "text-amber-700 bg-amber-50 border-amber-200", bar: "bg-amber-500", percent: (titleLength / 60) * 100 };
    if (titleLength <= 60) return { label: "Sangat Baik (30-60 kar)", color: "text-emerald-700 bg-emerald-50 border-emerald-200", bar: "bg-emerald-500", percent: (titleLength / 60) * 100 };
    return { label: "Terlalu Panjang (>60 kar, akan terpotong)", color: "text-rose-700 bg-rose-50 border-rose-200", bar: "bg-rose-500", percent: 100 };
  };

  // Description Status (Ideal 120 - 160 chars)
  const getDescStatus = () => {
    if (descLength === 0) return { label: "Kosong", color: "text-rose-600 bg-rose-50 border-rose-200", bar: "bg-rose-500", percent: 0 };
    if (descLength < 120) return { label: "Kurang Optimum (<120 kar)", color: "text-amber-700 bg-amber-50 border-amber-200", bar: "bg-amber-500", percent: (descLength / 160) * 100 };
    if (descLength <= 160) return { label: "Sangat Baik (120-160 kar)", color: "text-emerald-700 bg-emerald-50 border-emerald-200", bar: "bg-emerald-500", percent: (descLength / 160) * 100 };
    return { label: "Terlalu Panjang (>160 kar, akan terpotong)", color: "text-rose-700 bg-rose-50 border-rose-200", bar: "bg-rose-500", percent: 100 };
  };

  const titleStatus = getTitleStatus();
  const descStatus = getDescStatus();

  const formattedUrl = (canonicalUrl || "https://grandacehkuliner.com").replace(/\/+$/, "");
  const domainName = formattedUrl.replace(/^https?:\/\//i, "");

  // Display truncated text if exceeds limit
  const displayTitle = titleLength > 60 ? title.substring(0, 58) + "..." : title || "Judul Halaman Belum Diisi";
  const displayDesc = descLength > 160 ? description.substring(0, 157) + "..." : description || "Deskripsi meta belum diisi. Google akan otomatis mengambil cuplikan teks acak dari halaman.";

  return (
    <div className="space-y-4 rounded-2xl border border-neutral-200 bg-white p-5 shadow-xs" data-testid="google-search-preview">
      {/* Header Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-neutral-100 pb-4">
        <div className="flex items-center gap-2">
          <Search size={18} className="text-[#E63946]" />
          <div>
            <h4 className="text-sm font-black text-neutral-900 leading-tight">
              Pratinjau Hasil Pencarian Google (SERP Preview)
            </h4>
            <p className="text-[11px] text-neutral-500">
              Simulasi tampilan tautan restoran Anda saat muncul di Google &amp; Media Sosial.
            </p>
          </div>
        </div>

        {/* View Switchers */}
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <div className="p-0.5 bg-neutral-100 rounded-xl flex items-center gap-1 border border-neutral-200 text-xs">
            <button
              type="button"
              onClick={() => setPreviewTab("google")}
              className={`px-3 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                previewTab === "google" ? "bg-white text-neutral-900 shadow-2xs" : "text-neutral-500 hover:text-neutral-800"
              }`}
            >
              Google SERP
            </button>
            <button
              type="button"
              onClick={() => setPreviewTab("social")}
              className={`px-3 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                previewTab === "social" ? "bg-white text-neutral-900 shadow-2xs" : "text-neutral-500 hover:text-neutral-800"
              }`}
            >
              Kartu Sosial WA/FB
            </button>
          </div>

          {previewTab === "google" && (
            <div className="p-0.5 bg-neutral-100 rounded-xl flex items-center gap-0.5 border border-neutral-200">
              <button
                type="button"
                onClick={() => setDeviceMode("desktop")}
                title="Tampilan Komputer (Desktop)"
                className={`p-1.5 rounded-lg transition-all cursor-pointer ${
                  deviceMode === "desktop" ? "bg-white text-neutral-900 shadow-2xs" : "text-neutral-400 hover:text-neutral-700"
                }`}
              >
                <Monitor size={15} />
              </button>
              <button
                type="button"
                onClick={() => setDeviceMode("mobile")}
                title="Tampilan HP (Mobile)"
                className={`p-1.5 rounded-lg transition-all cursor-pointer ${
                  deviceMode === "mobile" ? "bg-white text-neutral-900 shadow-2xs" : "text-neutral-400 hover:text-neutral-700"
                }`}
              >
                <Smartphone size={15} />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Meter Indicators */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Title Meter */}
        <div className="p-3 bg-neutral-50 rounded-xl border border-neutral-200/80 space-y-1.5">
          <div className="flex items-center justify-between text-[11px]">
            <span className="font-extrabold text-neutral-700">Panjang Meta Title</span>
            <span className={`px-2 py-0.2 rounded-full font-black text-[10px] border ${titleStatus.color}`}>
              {titleLength} / 60 Karakter · {titleStatus.label}
            </span>
          </div>
          <div className="w-full h-1.5 bg-neutral-200 rounded-full overflow-hidden">
            <div className={`h-full transition-all duration-300 ${titleStatus.bar}`} style={{ width: `${Math.min(100, titleStatus.percent)}%` }} />
          </div>
        </div>

        {/* Description Meter */}
        <div className="p-3 bg-neutral-50 rounded-xl border border-neutral-200/80 space-y-1.5">
          <div className="flex items-center justify-between text-[11px]">
            <span className="font-extrabold text-neutral-700">Panjang Meta Description</span>
            <span className={`px-2 py-0.2 rounded-full font-black text-[10px] border ${descStatus.color}`}>
              {descLength} / 160 Karakter · {descStatus.label}
            </span>
          </div>
          <div className="w-full h-1.5 bg-neutral-200 rounded-full overflow-hidden">
            <div className={`h-full transition-all duration-300 ${descStatus.bar}`} style={{ width: `${Math.min(100, descStatus.percent)}%` }} />
          </div>
        </div>
      </div>

      {/* PREVIEW CONTAINER */}
      {previewTab === "google" ? (
        <div className="p-4 sm:p-5 bg-white rounded-xl border border-neutral-200 shadow-xs space-y-3 font-sans">
          {/* Top Google Search Mock Header */}
          <div className="flex items-center gap-2 pb-2 border-b border-neutral-100 text-[11px] text-neutral-400">
            <Globe size={13} className="text-blue-500" />
            <span>Simulasi Tampilan Google ({deviceMode === "desktop" ? "Komputer" : "Layar HP"})</span>
          </div>

          <div className={`space-y-1.5 ${deviceMode === "mobile" ? "max-w-sm border-l-2 border-amber-400 pl-3 py-1 bg-neutral-50/50 rounded-r-xl" : ""}`}>
            {/* Favicon & Breadcrumb */}
            <div className="flex items-center gap-2 text-xs">
              <div className="w-6 h-6 rounded-full bg-rose-100 border border-rose-200 flex items-center justify-center shrink-0">
                <span className="text-[10px] font-black text-[#E63946]">GAK</span>
              </div>
              <div className="flex flex-col text-[12px] leading-none">
                <span className="font-bold text-neutral-900">{brandName}</span>
                <span className="text-neutral-500 text-[11px] truncate">{domainName} › landing</span>
              </div>
            </div>

            {/* Google Blue Link Title */}
            <h3 className="text-[18px] sm:text-[20px] font-medium text-[#1a0dab] hover:underline cursor-pointer leading-tight tracking-normal">
              {displayTitle}
            </h3>

            {/* Google Snippet Text */}
            <p className="text-[13px] sm:text-[14px] text-[#4d5156] leading-snug">
              {displayDesc}
            </p>
          </div>
        </div>
      ) : (
        /* SOCIAL SHARE CARD PREVIEW (OpenGraph / WhatsApp / Twitter) */
        <div className="p-4 bg-slate-100 rounded-xl border border-slate-200 space-y-3">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span className="font-bold flex items-center gap-1">
              <Share2 size={13} className="text-emerald-600" /> Pratinjau Tautan Berbagi WhatsApp &amp; Sosial Media
            </span>
            <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded">OpenGraph Meta</span>
          </div>

          <div className="max-w-sm mx-auto bg-white rounded-2xl overflow-hidden border border-slate-200 shadow-md">
            {/* Card Thumbnail Image */}
            <div className="h-40 bg-slate-200 relative overflow-hidden flex items-center justify-center">
              {imageUrl ? (
                <img src={imageUrl} alt="Card Preview" className="w-full h-full object-cover" />
              ) : (
                <div className="text-slate-400 text-xs font-bold flex items-center gap-2">
                  <Globe size={18} /> Sampul Gambar
                </div>
              )}
            </div>

            <div className="p-3 bg-[#F0F2F5] space-y-1">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                {domainName}
              </span>
              <h4 className="text-xs font-black text-slate-900 line-clamp-1">
                {title || brandName}
              </h4>
              <p className="text-[11px] text-slate-600 line-clamp-2 leading-tight">
                {description || "Deskripsi lengkap kuliner dan reservasi restoran..."}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Advice Alert */}
      <div className="p-3 bg-blue-50 rounded-xl border border-blue-200 text-xs text-blue-900 flex items-start gap-2">
        <Info size={15} className="text-blue-600 shrink-0 mt-0.5" />
        <p className="leading-relaxed text-[11px]">
          <strong>Tips SEO Restoran:</strong> Masukkan kata kunci utama seperti <i>"Mie Aceh"</i>, <i>"Restoran"</i>, dan <i>"Banda Aceh"</i> pada <strong>Meta Title</strong> dan <strong>Meta Description</strong> agar calon pengunjung lokal mudah menemukan restoran Anda di Google.
        </p>
      </div>
    </div>
  );
}
