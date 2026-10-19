import {
  Globe,
  Save,
  RotateCcw,
  ExternalLink,
  Sparkles,
  Flame,
  Clock,
  Phone,
  MapPin,
  MessageCircle,
  Armchair,
  Check,
  AlertCircle,
  Image as ImageIcon,
  Tag,
  BarChart2,
  RefreshCw,
  BookOpen,
  Search
} from "lucide-react";
import { toast } from "sonner";
import { useLandingConfig, updateLandingConfig, resetLandingConfigService } from "@/services/landingService";
import { DEFAULT_LANDING_CONFIG } from "@/config/landing-page.config";
import GoogleSearchPreview from "@/components/GoogleSearchPreview";

export default function SettingsLandingPage() {
  const { config: initialConfig, loading: isServiceLoading } = useLandingConfig();
  const [config, setConfig] = useState(DEFAULT_LANDING_CONFIG);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState("hero");

  useEffect(() => {
    if (initialConfig) setConfig(initialConfig);
  }, [initialConfig]);

  const handleSave = async (e) => {
    if (e) e.preventDefault();
    setSaving(true);
    try {
      const res = await updateLandingConfig(config);
      if (res.successServer) {
        toast.success("Pengaturan Landing Page berhasil tersimpan di Database Server!");
      } else {
        toast.info("Pengaturan tersimpan di Cache Lokal (Server Offline).");
      }
    } catch (err) {
      toast.error("Gagal menyimpan ke server: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    if (window.confirm("Kembalikan seluruh konten landing page ke konfigurasi default awal?")) {
      setSaving(true);
      try {
        const resetCfg = await resetLandingConfigService();
        setConfig(resetCfg);
        toast.success("Konfigurasi landing page berhasil dikembalikan ke default.");
      } catch (err) {
        toast.error("Gagal melakukan reset: " + err.message);
      } finally {
        setSaving(false);
      }
    }
  };

  const updateNested = (section, field, value) => {
    setConfig((prev) => ({
      ...prev,
      [section]: {
        ...prev[section],
        [field]: value
      }
    }));
  };

  const updateHeroCta = (ctaType, field, value) => {
    setConfig((prev) => ({
      ...prev,
      hero: {
        ...prev.hero,
        [ctaType]: {
          ...prev.hero?.[ctaType],
          [field]: value
        }
      }
    }));
  };

  const updateStatItem = (index, field, value) => {
    setConfig((prev) => {
      const items = [...(prev.stats?.items || [])];
      items[index] = { ...items[index], [field]: value };
      return {
        ...prev,
        stats: {
          ...prev.stats,
          items
        }
      };
    });
  };

  if (loading) {
    return (
      <div className="p-8 text-center text-neutral-500 space-y-2">
        <RefreshCw size={24} className="animate-spin mx-auto text-[#E63946]" />
        <p className="text-sm font-semibold">Memuat konfigurasi landing page...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 bg-white rounded-2xl border border-neutral-200 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-rose-50 rounded-xl text-[#E63946] border border-rose-100">
            <Globe size={22} />
          </div>
          <div>
            <h2 className="text-base font-black text-neutral-900 tracking-tight">
              Pengaturan Landing Page Publik
            </h2>
            <p className="text-xs text-neutral-500 mt-0.5">
              Kelola teks, hero banner, statistik, dan promo landing page dari file <code className="text-[#E63946] font-mono">src/config/landing-page.config.js</code>.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <a
            href="/landing"
            target="_blank"
            rel="noreferrer"
            className="h-9 px-3 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 text-xs font-bold rounded-xl inline-flex items-center gap-1.5 transition-colors"
          >
            <ExternalLink size={14} />
            <span>Lihat Live</span>
          </a>

          <button
            type="button"
            onClick={handleReset}
            disabled={saving}
            className="h-9 px-3 border border-neutral-300 hover:bg-neutral-50 text-neutral-700 text-xs font-bold rounded-xl inline-flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <RotateCcw size={14} />
            <span>Reset Default</span>
          </button>

          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="h-9 px-4 bg-[#E63946] hover:bg-[#be123c] text-white text-xs font-bold rounded-xl inline-flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer disabled:opacity-50"
          >
            {saving ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />}
            <span>Simpan Perubahan</span>
          </button>
        </div>
      </div>

      {/* Sub Tab Navigation */}
      <div className="flex border-b border-neutral-200 gap-2 overflow-x-auto">
        {[
          { id: "hero", label: "1. Hero Banner", icon: Sparkles },
          { id: "stats", label: "2. Statistik Toko", icon: BarChart2 },
          { id: "promo", label: "3. Banner Promo", icon: Tag },
          { id: "contact", label: "4. Kontak & Jam Buka", icon: Clock },
          { id: "reservation", label: "5. Integrasi Meja", icon: Armchair },
          { id: "articles", label: "6. Cerita & Artikel", icon: BookOpen },
          { id: "seo", label: "7. SEO & Google Preview", icon: Search },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2.5 text-xs font-extrabold border-b-2 transition-colors shrink-0 ${
                isActive
                  ? "border-[#E63946] text-[#E63946] bg-rose-50/40 rounded-t-lg"
                  : "border-transparent text-neutral-600 hover:text-neutral-900"
              }`}
            >
              <Icon size={14} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* TAB 1: HERO BANNER */}
      {activeTab === "hero" && (
        <div className="space-y-4 bg-white p-6 rounded-2xl border border-neutral-200 shadow-xs">
          <h3 className="text-sm font-black text-neutral-900 flex items-center gap-2">
            <Sparkles size={16} className="text-[#E63946]" /> Section 1: Hero Banner Utama
          </h3>

          <div className="space-y-3 pt-2">
            <div>
              <label className="text-xs font-bold text-neutral-700 block mb-1">Badge Kicker Atas</label>
              <input
                type="text"
                value={config.hero?.badge || ""}
                onChange={(e) => updateNested("hero", "badge", e.target.value)}
                className="w-full h-9 px-3 rounded-xl border border-neutral-300 text-xs outline-none focus:border-[#E63946]"
                placeholder="Contoh: Restoran & Kuliner Otentik Aceh"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-neutral-700 block mb-1">Judul Utama Landing Page</label>
              <input
                type="text"
                value={config.hero?.title || ""}
                onChange={(e) => updateNested("hero", "title", e.target.value)}
                className="w-full h-9 px-3 rounded-xl border border-neutral-300 text-xs font-bold outline-none focus:border-[#E63946]"
                placeholder="Contoh: Cita Rasa Otentik Tanah Rencong"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-neutral-700 block mb-1">Deskripsi / Subjudul Hero</label>
              <textarea
                rows={3}
                value={config.hero?.subtitle || ""}
                onChange={(e) => updateNested("hero", "subtitle", e.target.value)}
                className="w-full p-3 rounded-xl border border-neutral-300 text-xs outline-none focus:border-[#E63946]"
                placeholder="Deskripsi singkat mengenai suasana dan produk keunggulan restoran..."
              />
            </div>

            <div>
              <label className="text-xs font-bold text-neutral-700 block mb-1">URL Gambar Sampul Hero</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={config.hero?.image_url || ""}
                  onChange={(e) => updateNested("hero", "image_url", e.target.value)}
                  className="flex-1 h-9 px-3 rounded-xl border border-neutral-300 text-xs font-mono outline-none focus:border-[#E63946]"
                  placeholder="/screenshot-desktop.png atau URL gambar"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-neutral-100">
              <div>
                <label className="text-xs font-bold text-neutral-700 block mb-1">Tombol Utama (CTA 1)</label>
                <input
                  type="text"
                  value={config.hero?.primary_cta?.text || ""}
                  onChange={(e) => updateHeroCta("primary_cta", "text", e.target.value)}
                  className="w-full h-9 px-3 rounded-xl border border-neutral-300 text-xs outline-none focus:border-[#E63946]"
                  placeholder="Lihat Menu & Order"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-neutral-700 block mb-1">Tombol Kedua (CTA 2)</label>
                <input
                  type="text"
                  value={config.hero?.secondary_cta?.text || ""}
                  onChange={(e) => updateHeroCta("secondary_cta", "text", e.target.value)}
                  className="w-full h-9 px-3 rounded-xl border border-neutral-300 text-xs outline-none focus:border-[#E63946]"
                  placeholder="Reservasi Meja"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: STATISTIK TOKO */}
      {activeTab === "stats" && (
        <div className="space-y-4 bg-white p-6 rounded-2xl border border-neutral-200 shadow-xs">
          <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
            <h3 className="text-sm font-black text-neutral-900 flex items-center gap-2">
              <BarChart2 size={16} className="text-[#E63946]" /> Section 2: Statistik &amp; Keunggulan Toko
            </h3>

            <label className="inline-flex items-center gap-2 text-xs font-bold text-neutral-700 cursor-pointer">
              <input
                type="checkbox"
                checked={config.stats?.show_section ?? true}
                onChange={(e) => updateNested("stats", "show_section", e.target.checked)}
                className="rounded border-neutral-300 text-[#E63946] focus:ring-[#E63946]"
              />
              <span>Tampilkan Section Ini</span>
            </label>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {(config.stats?.items || []).map((item, idx) => (
              <div key={item.id || idx} className="p-4 bg-neutral-50 rounded-xl border border-neutral-200 space-y-2">
                <span className="text-[10px] font-black uppercase text-neutral-400">Statistik #{idx + 1}</span>
                <div>
                  <label className="text-[11px] font-bold text-neutral-600 block mb-0.5">Label Statistik</label>
                  <input
                    type="text"
                    value={item.label || ""}
                    onChange={(e) => updateStatItem(idx, "label", e.target.value)}
                    className="w-full h-8 px-2.5 bg-white rounded-lg border border-neutral-300 text-xs outline-none focus:border-[#E63946]"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[11px] font-bold text-neutral-600 block mb-0.5">Nilai Angka</label>
                    <input
                      type="text"
                      value={item.value || ""}
                      onChange={(e) => updateStatItem(idx, "value", e.target.value)}
                      className="w-full h-8 px-2.5 bg-white rounded-lg border border-neutral-300 text-xs font-extrabold outline-none focus:border-[#E63946]"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-neutral-600 block mb-0.5">Satuan/Suffix</label>
                    <input
                      type="text"
                      value={item.suffix || ""}
                      onChange={(e) => updateStatItem(idx, "suffix", e.target.value)}
                      className="w-full h-8 px-2.5 bg-white rounded-lg border border-neutral-300 text-xs outline-none focus:border-[#E63946]"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 3: BANNER PROMO */}
      {activeTab === "promo" && (
        <div className="space-y-4 bg-white p-6 rounded-2xl border border-neutral-200 shadow-xs">
          <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
            <h3 className="text-sm font-black text-neutral-900 flex items-center gap-2">
              <Tag size={16} className="text-[#E63946]" /> Section 3: Banner Promo &amp; Pengumuman
            </h3>

            <label className="inline-flex items-center gap-2 text-xs font-bold text-neutral-700 cursor-pointer">
              <input
                type="checkbox"
                checked={config.promo_banner?.enabled ?? true}
                onChange={(e) => updateNested("promo_banner", "enabled", e.target.checked)}
                className="rounded border-neutral-300 text-[#E63946] focus:ring-[#E63946]"
              />
              <span>Aktifkan Banner Promo</span>
            </label>
          </div>

          <div className="space-y-3">
            <div>
              <label className="text-xs font-bold text-neutral-700 block mb-1">Badge Promo</label>
              <input
                type="text"
                value={config.promo_banner?.badge || ""}
                onChange={(e) => updateNested("promo_banner", "badge", e.target.value)}
                className="w-full h-9 px-3 rounded-xl border border-neutral-300 text-xs outline-none focus:border-[#E63946]"
                placeholder="PROMO BULAN INI"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-neutral-700 block mb-1">Judul Promo Utama</label>
              <input
                type="text"
                value={config.promo_banner?.title || ""}
                onChange={(e) => updateNested("promo_banner", "title", e.target.value)}
                className="w-full h-9 px-3 rounded-xl border border-neutral-300 text-xs font-bold outline-none focus:border-[#E63946]"
                placeholder="Diskon 15% Paket Mie Aceh Tumis"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-neutral-700 block mb-1">Syarat &amp; Ketentuan Singkat</label>
              <textarea
                rows={2}
                value={config.promo_banner?.subtitle || ""}
                onChange={(e) => updateNested("promo_banner", "subtitle", e.target.value)}
                className="w-full p-3 rounded-xl border border-neutral-300 text-xs outline-none focus:border-[#E63946]"
                placeholder="Berlaku Senin - Kamis..."
              />
            </div>

            <div>
              <label className="text-xs font-bold text-neutral-700 block mb-1">Teks Tombol Aksi Promo</label>
              <input
                type="text"
                value={config.promo_banner?.cta_text || ""}
                onChange={(e) => updateNested("promo_banner", "cta_text", e.target.value)}
                className="w-full h-9 px-3 rounded-xl border border-neutral-300 text-xs outline-none focus:border-[#E63946]"
                placeholder="Klaim Kupon Member"
              />
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: KONTAK & JAM BUKA */}
      {activeTab === "contact" && (
        <div className="space-y-4 bg-white p-6 rounded-2xl border border-neutral-200 shadow-xs">
          <h3 className="text-sm font-black text-neutral-900 flex items-center gap-2">
            <Clock size={16} className="text-[#E63946]" /> Section 4: Kontak, Alamat &amp; Jam Operasional
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <label className="text-xs font-bold text-neutral-700 block mb-1">Alamat Lengkap Restoran</label>
              <input
                type="text"
                value={config.contact_info?.address || ""}
                onChange={(e) => updateNested("contact_info", "address", e.target.value)}
                className="w-full h-9 px-3 rounded-xl border border-neutral-300 text-xs outline-none focus:border-[#E63946]"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-neutral-700 block mb-1">Jam Operasional</label>
              <input
                type="text"
                value={config.contact_info?.opening_hours || ""}
                onChange={(e) => updateNested("contact_info", "opening_hours", e.target.value)}
                className="w-full h-9 px-3 rounded-xl border border-neutral-300 text-xs outline-none focus:border-[#E63946]"
                placeholder="Setiap Hari: 08:00 - 23:00 WIB"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-neutral-700 block mb-1">Nomor WhatsApp Hotlline</label>
              <input
                type="text"
                value={config.contact_info?.whatsapp || ""}
                onChange={(e) => updateNested("contact_info", "whatsapp", e.target.value)}
                className="w-full h-9 px-3 rounded-xl border border-neutral-300 text-xs outline-none focus:border-[#E63946]"
                placeholder="6281269001234"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-neutral-700 block mb-1">Nomor Telepon Toko</label>
              <input
                type="text"
                value={config.contact_info?.phone || ""}
                onChange={(e) => updateNested("contact_info", "phone", e.target.value)}
                className="w-full h-9 px-3 rounded-xl border border-neutral-300 text-xs outline-none focus:border-[#E63946]"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-neutral-700 block mb-1">Instagram Handlename</label>
              <input
                type="text"
                value={config.contact_info?.instagram || ""}
                onChange={(e) => updateNested("contact_info", "instagram", e.target.value)}
                className="w-full h-9 px-3 rounded-xl border border-neutral-300 text-xs outline-none focus:border-[#E63946]"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="text-xs font-bold text-neutral-700 block mb-1">URL Google Maps Location</label>
              <input
                type="text"
                value={config.contact_info?.google_maps_url || ""}
                onChange={(e) => updateNested("contact_info", "google_maps_url", e.target.value)}
                className="w-full h-9 px-3 rounded-xl border border-neutral-300 text-xs font-mono outline-none focus:border-[#E63946]"
              />
            </div>
          </div>
        </div>
      )}

      {/* TAB 5: INTEGRASI MEJA & RESERVASI */}
      {activeTab === "reservation" && (
        <div className="space-y-4 bg-white p-6 rounded-2xl border border-neutral-200 shadow-xs">
          <h3 className="text-sm font-black text-neutral-900 flex items-center gap-2">
            <Armchair size={16} className="text-[#E63946]" /> Section 5: Tautan Reservasi &amp; Data Meja
          </h3>

          <div className="p-4 bg-emerald-50 rounded-xl border border-emerald-200 text-xs text-emerald-900 space-y-1.5">
            <div className="flex items-center gap-2 font-black">
              <Check size={16} className="text-emerald-600" />
              <span>Otomatis Terhubung ke Database Manajemen Meja</span>
            </div>
            <p className="leading-relaxed text-emerald-800">
              Formulir Reservasi di Landing Page publik membaca pilihan area ruangan (Indoor, VIP, Outdoor) dan kapasitas kursi secara <strong>real-time</strong> langsung dari database <code className="font-mono bg-white/70 px-1 py-0.5 rounded">/settings?tab=tables</code>.
            </p>
          </div>

          <div className="space-y-3 pt-2">
            <div>
              <label className="text-xs font-bold text-neutral-700 block mb-1">Judul Seksi Reservasi</label>
              <input
                type="text"
                value={config.reservation?.title || ""}
                onChange={(e) => updateNested("reservation", "title", e.target.value)}
                className="w-full h-9 px-3 rounded-xl border border-neutral-300 text-xs font-bold outline-none focus:border-[#E63946]"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-neutral-700 block mb-1">Subjudul / Catatan Reservasi</label>
              <textarea
                rows={2}
                value={config.reservation?.subtitle || ""}
                onChange={(e) => updateNested("reservation", "subtitle", e.target.value)}
                className="w-full p-3 rounded-xl border border-neutral-300 text-xs outline-none focus:border-[#E63946]"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-neutral-700 block mb-1">Maksimal Orang (Pax) per Booking</label>
              <input
                type="number"
                value={config.reservation?.max_pax || 20}
                onChange={(e) => updateNested("reservation", "max_pax", Number(e.target.value))}
                className="w-32 h-9 px-3 rounded-xl border border-neutral-300 text-xs font-bold outline-none focus:border-[#E63946]"
              />
            </div>
          </div>
        </div>
      )}

      {/* TAB 6: CERITA & ARTIKEL HEADER */}
      {activeTab === "articles" && (
        <div className="space-y-4 bg-white p-6 rounded-2xl border border-neutral-200 shadow-xs">
          <h3 className="text-sm font-black text-neutral-900 flex items-center gap-2">
            <BookOpen size={16} className="text-[#E63946]" /> Section 6: Header Seksi Cerita &amp; Artikel Kuliner
          </h3>

          <div className="p-3.5 bg-neutral-50 rounded-xl border border-neutral-200 text-xs text-neutral-600 space-y-1">
            <span className="font-bold text-neutral-900 block">Pengelolaan Artikel &amp; Konten Cerita</span>
            <p>
              Daftar artikel dan konten cerita kuliner dikelola melalui menu <strong>Artikel &amp; Cerita</strong> (<code className="font-mono text-[#E63946]">/articles</code>). Di bawah ini adalah pengaturan judul dan deskripsi header seksi cerita pada Landing Page.
            </p>
          </div>

          <div className="space-y-3 pt-2">
            <div>
              <label className="text-xs font-bold text-neutral-700 block mb-1">Badge Kicker Seksi</label>
              <input
                type="text"
                value={config.articles_header?.badge || ""}
                onChange={(e) => updateNested("articles_header", "badge", e.target.value)}
                className="w-full h-9 px-3 rounded-xl border border-neutral-300 text-xs outline-none focus:border-[#E63946]"
                placeholder="Kisah & Filosofi Kuliner"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-neutral-700 block mb-1">Judul Seksi Cerita</label>
              <input
                type="text"
                value={config.articles_header?.title || ""}
                onChange={(e) => updateNested("articles_header", "title", e.target.value)}
                className="w-full h-9 px-3 rounded-xl border border-neutral-300 text-xs font-bold outline-none focus:border-[#E63946]"
                placeholder="Cerita di Balik Rempah Tanah Rencong"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-neutral-700 block mb-1">Deskripsi / Subjudul Seksi</label>
              <textarea
                rows={3}
                value={config.articles_header?.subtitle || ""}
                onChange={(e) => updateNested("articles_header", "subtitle", e.target.value)}
                className="w-full p-3 rounded-xl border border-neutral-300 text-xs outline-none focus:border-[#E63946]"
                placeholder="Setiap mangkuk masakan dan cangkir kopi menyimpan sejarah panjang..."
              />
            </div>
          </div>
        </div>
      )}

      {/* TAB 7: SEO & GOOGLE REAL-TIME PREVIEW */}
      {activeTab === "seo" && (
        <div className="space-y-6">
          {/* Real-time Google Preview Component */}
          <GoogleSearchPreview
            title={config.seo?.site_title || config.seo?.meta_title}
            description={config.seo?.meta_description}
            canonicalUrl={config.seo?.canonical_url}
            brandName={config.seo?.site_name || config.hero?.title || "Grand Aceh Kuliner"}
            imageUrl={config.seo?.og_image_url || config.hero?.image_url || "/screenshot-desktop.png"}
          />

          {/* Form Editors */}
          <div className="space-y-4 bg-white p-6 rounded-2xl border border-neutral-200 shadow-xs">
            <h3 className="text-sm font-black text-neutral-900 flex items-center gap-2">
              <Search size={16} className="text-[#E63946]" /> Pengaturan Global SEO Metadata &amp; Social Share Cards
            </h3>

            <div className="space-y-4 pt-1">
              {/* Site Title */}
              <div>
                <label className="text-xs font-bold text-neutral-700 block mb-1">
                  Site Title / Meta Title (Judul Utama Website di Google)
                </label>
                <input
                  type="text"
                  value={config.seo?.site_title || config.seo?.meta_title || ""}
                  onChange={(e) => {
                    updateNested("seo", "site_title", e.target.value);
                    updateNested("seo", "meta_title", e.target.value);
                  }}
                  className="w-full h-9 px-3 rounded-xl border border-neutral-300 text-xs font-bold outline-none focus:border-[#E63946]"
                  placeholder="Grand Aceh Kuliner — Restoran & Mie Aceh Otentik"
                />
                <span className="text-[10px] text-neutral-400 mt-1 block">
                  Judul ini muncul sebagai judul tautan biru di hasil pencarian Google dan tab browser (30 - 60 karakter).
                </span>
              </div>

              {/* Meta Description */}
              <div>
                <label className="text-xs font-bold text-neutral-700 block mb-1">
                  Meta Description (Deskripsi Ringkasan Hasil Pencarian)
                </label>
                <textarea
                  rows={3}
                  value={config.seo?.meta_description || ""}
                  onChange={(e) => updateNested("seo", "meta_description", e.target.value)}
                  className="w-full p-3 rounded-xl border border-neutral-300 text-xs outline-none focus:border-[#E63946]"
                  placeholder="Nikmati kelezatan Mie Aceh Rempah, Nasi Gurih, Kopi Sanger, dan Ayam Tangkap khas Banda Aceh..."
                />
                <span className="text-[10px] text-neutral-400 mt-1 block">
                  Ringkasan 120 - 160 karakter yang tampil di bawah judul pencarian Google.
                </span>
              </div>

              {/* Open Graph Image URL */}
              <div>
                <label className="text-xs font-bold text-neutral-700 block mb-1">
                  Open Graph Image URL (Gambar Sampul Pratinjau WhatsApp &amp; Sosial Media)
                </label>
                <input
                  type="text"
                  value={config.seo?.og_image_url || ""}
                  onChange={(e) => updateNested("seo", "og_image_url", e.target.value)}
                  className="w-full h-9 px-3 rounded-xl border border-neutral-300 text-xs font-mono outline-none focus:border-[#E63946]"
                  placeholder="/screenshot-desktop.png atau https://domain.com/gambar-share.jpg"
                />
                <span className="text-[10px] text-neutral-400 mt-1 block">
                  Gambar yang otomatis muncul saat tautan restoran dibagikan di WhatsApp, Facebook, LinkedIn, atau Twitter/X.
                </span>
              </div>

              {/* Grid 2 Column for Additional Metadata */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-neutral-100">
                <div>
                  <label className="text-xs font-bold text-neutral-700 block mb-1">
                    Nama Situs / Brand Name (`og:site_name`)
                  </label>
                  <input
                    type="text"
                    value={config.seo?.site_name || ""}
                    onChange={(e) => updateNested("seo", "site_name", e.target.value)}
                    className="w-full h-9 px-3 rounded-xl border border-neutral-300 text-xs outline-none focus:border-[#E63946]"
                    placeholder="Grand Aceh Kuliner"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-neutral-700 block mb-1">
                    Canonical Domain URL
                  </label>
                  <input
                    type="text"
                    value={config.seo?.canonical_url || ""}
                    onChange={(e) => updateNested("seo", "canonical_url", e.target.value)}
                    className="w-full h-9 px-3 rounded-xl border border-neutral-300 text-xs font-mono outline-none focus:border-[#E63946]"
                    placeholder="https://grandacehkuliner.com"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-neutral-700 block mb-1">
                    Kata Kunci SEO (Keywords)
                  </label>
                  <input
                    type="text"
                    value={config.seo?.keywords || ""}
                    onChange={(e) => updateNested("seo", "keywords", e.target.value)}
                    className="w-full h-9 px-3 rounded-xl border border-neutral-300 text-xs outline-none focus:border-[#E63946]"
                    placeholder="Mie Aceh, Restoran Aceh, Halal Food, Banda Aceh"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-neutral-700 block mb-1">
                    Twitter / X Card Handle
                  </label>
                  <input
                    type="text"
                    value={config.seo?.twitter_handle || ""}
                    onChange={(e) => updateNested("seo", "twitter_handle", e.target.value)}
                    className="w-full h-9 px-3 rounded-xl border border-neutral-300 text-xs outline-none focus:border-[#E63946]"
                    placeholder="@grandacehkuliner"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
