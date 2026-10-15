import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  UtensilsCrossed, CalendarCheck, Clock, MapPin, Phone,
  Sparkles, ChevronRight, CheckCircle2, MessageCircle,
  Search, BookOpen, Coffee, Award, Users, ArrowRight,
  Flame, HeartHandshake, ShieldCheck, X, Share2
} from "lucide-react";
import { rupiah } from "@/lib/format";
import { toast } from "sonner";

export default function LandingPage({ defaultSection = "hero" }) {
  const navigate = useNavigate();

  // Navigation active state
  const [activeSection, setActiveSection] = useState(defaultSection);

  // Menu state
  const [menuItems, setMenuItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [selectedCat, setSelectedCat] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [loadingMenu, setLoadingMenu] = useState(true);

  // Articles state
  const [articles, setArticles] = useState([]);
  const [selectedArticle, setSelectedArticle] = useState(null);
  const [loadingArticles, setLoadingArticles] = useState(true);

  // Tables state for booking
  const [tables, setTables] = useState([]);
  const [bookingForm, setBookingForm] = useState({
    customer_name: "",
    phone: "",
    date: new Date().toISOString().slice(0, 10),
    time: "19:00",
    pax: 2,
    seating_area: "Indoor",
    table_id: "",
    note: "",
  });
  const [submittingBooking, setSubmittingBooking] = useState(false);
  const [bookingResult, setBookingResult] = useState(null);

  // Fetch Public Data on mount
  useEffect(() => {
    // Scroll to default section if provided
    if (defaultSection && defaultSection !== "hero") {
      const el = document.getElementById(defaultSection);
      if (el) el.scrollIntoView({ behavior: "smooth" });
    }

    // 1. Fetch Menu
    fetch("/api/public/menu")
      .then((res) => (res.ok ? res.json() : Promise.reject(res)))
      .then((data) => {
        setMenuItems(data.products || []);
        setCategories(data.categories || []);
      })
      .catch((err) => {
        console.warn("Failed fetching public menu, fallback to default", err);
      })
      .finally(() => setLoadingMenu(false));

    // 2. Fetch Articles
    fetch("/api/public/articles")
      .then((res) => (res.ok ? res.json() : Promise.reject(res)))
      .then((data) => {
        setArticles(Array.isArray(data) ? data : []);
      })
      .catch((err) => {
        console.warn("Failed fetching public articles", err);
      })
      .finally(() => setLoadingArticles(false));

    // 3. Fetch Tables
    fetch("/api/public/tables")
      .then((res) => (res.ok ? res.json() : Promise.reject(res)))
      .then((data) => {
        setTables(Array.isArray(data) ? data : []);
      })
      .catch((err) => {
        console.warn("Failed fetching public tables", err);
      });
  }, [defaultSection]);

  // Filtered menu
  const filteredMenu = menuItems.filter((item) => {
    const matchCat =
      selectedCat === "all" ||
      item.category_id === selectedCat ||
      (selectedCat === "makanan" && item.type === "makanan") ||
      (selectedCat === "minuman" && item.type === "minuman") ||
      (selectedCat === "retail" && item.type === "retail");

    const matchSearch =
      !searchQuery.trim() ||
      item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (item.description && item.description.toLowerCase().includes(searchQuery.toLowerCase()));

    return matchCat && matchSearch;
  });

  // Handle Booking Submit
  const handleBookingSubmit = async (e) => {
    e.preventDefault();
    if (!bookingForm.customer_name.trim()) {
      toast.error("Nama pemesan wajib diisi");
      return;
    }
    if (!bookingForm.phone.trim() || bookingForm.phone.length < 8) {
      toast.error("Nomor WhatsApp tidak valid");
      return;
    }

    setSubmittingBooking(true);
    try {
      const res = await fetch("/api/public/booking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bookingForm),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Gagal mengirimkan reservasi");

      setBookingResult(data);
      toast.success("Reservasi Anda berhasil dikirim!");
    } catch (err) {
      toast.error(err.message || "Terjadi kesalahan saat reservasi");
    } finally {
      setSubmittingBooking(false);
    }
  };

  const scrollTo = (id) => {
    setActiveSection(id);
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  return (
    <div className="min-h-screen bg-[#FAF8F5] text-stone-900 font-sans selection:bg-amber-100 selection:text-amber-900">
      {/* ==============================================================
          1. TOP BAR CONTRACT (Strict 3-zone layout)
          [Brand Wordmark] — [Nav Links] — [Primary Action: Masuk POS]
      ============================================================== */}
      <header className="sticky top-0 z-40 bg-[#FAF8F5]/95 backdrop-blur-md border-b border-stone-200/80 transition-all">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-18 flex items-center justify-between gap-8">
          {/* Zone 1: Single text element wordmark */}
          <button
            onClick={() => scrollTo("hero")}
            className="flex items-center gap-2 text-xl font-bold tracking-tight text-stone-950 hover:text-amber-800 transition-colors whitespace-nowrap shrink-0"
          >
            <div className="w-8 h-8 rounded-lg bg-amber-800 text-amber-50 flex items-center justify-center font-bold text-sm shadow-sm">
              GA
            </div>
            <span>Grand Aceh Kuliner</span>
          </button>

          {/* Zone 2: Clean single-line text navigation links */}
          <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-stone-600">
            <button
              onClick={() => scrollTo("menu")}
              className={`hover:text-stone-950 transition-colors whitespace-nowrap shrink-0 ${
                activeSection === "menu" ? "text-amber-800 font-semibold" : ""
              }`}
            >
              Menu Pilihan
            </button>
            <button
              onClick={() => scrollTo("cerita")}
              className={`hover:text-stone-950 transition-colors whitespace-nowrap shrink-0 ${
                activeSection === "cerita" ? "text-amber-800 font-semibold" : ""
              }`}
            >
              Cerita Rempah
            </button>
            <button
              onClick={() => scrollTo("reservasi")}
              className={`hover:text-stone-950 transition-colors whitespace-nowrap shrink-0 ${
                activeSection === "reservasi" ? "text-amber-800 font-semibold" : ""
              }`}
            >
              Reservasi Meja
            </button>
            <button
              onClick={() => scrollTo("lokasi")}
              className={`hover:text-stone-950 transition-colors whitespace-nowrap shrink-0 ${
                activeSection === "lokasi" ? "text-amber-800 font-semibold" : ""
              }`}
            >
              Lokasi & Jam
            </button>
          </nav>

          {/* Zone 3: 1 primary action */}
          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={() => navigate("/login")}
              className="px-4 py-2 text-xs font-semibold text-white bg-amber-800 rounded-lg hover:bg-amber-900 active:scale-95 transition-all shadow-sm whitespace-nowrap shrink-0 flex items-center gap-1.5"
            >
              <span>Masuk POS</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </header>

      {/* ==============================================================
          2. HERO SECTION
          Cinematic Typography + Authentic Aceh Culinary Value Proposition
      ============================================================== */}
      <section id="hero" className="relative pt-12 pb-20 md:pt-20 md:pb-28 overflow-hidden">
        {/* Subtle decorative background glow */}
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[350px] bg-amber-200/30 rounded-full blur-3xl pointer-events-none -z-10" />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
            {/* Left Column: Proposition */}
            <div className="lg:col-span-7 space-y-6">
              <div className="inline-flex items-center gap-2 text-xs font-semibold tracking-wider text-amber-900 uppercase">
                <span className="w-2 h-2 rounded-full bg-amber-700" />
                <span>Otentik Serambi Mekkah</span>
                <span aria-hidden="true">·</span>
                <span>Sejak 2018</span>
              </div>

              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-stone-950 leading-[1.12]">
                Cita Rasa Rempah Warisan Tanah Rencong.
              </h1>

              <p className="text-lg sm:text-xl text-stone-600 max-w-2xl leading-relaxed">
                Nikmati kehangatan Kuah Beulangong berpadu 16 rempah pilihan, Mie Aceh kenyal berkuah kari pekat, Ayam Tangkap berbalut daun temurui renyah, dan kenikmatan Kopi Sanger Khop khas pesisir.
              </p>

              <div className="pt-2 flex flex-wrap items-center gap-4">
                <button
                  onClick={() => scrollTo("menu")}
                  className="px-6 py-3.5 text-sm font-semibold text-white bg-amber-800 rounded-xl hover:bg-amber-900 active:scale-95 transition-all shadow-md flex items-center gap-2"
                >
                  <UtensilsCrossed className="w-4 h-4" />
                  <span>Jelajahi Menu Pilihan</span>
                </button>
                <button
                  onClick={() => scrollTo("reservasi")}
                  className="px-6 py-3.5 text-sm font-semibold text-stone-800 bg-white border border-stone-300 rounded-xl hover:bg-stone-50 active:scale-95 transition-all shadow-sm flex items-center gap-2"
                >
                  <CalendarCheck className="w-4 h-4 text-amber-800" />
                  <span>Reservasi Meja Online</span>
                </button>
              </div>

              {/* Trust markers */}
              <div className="pt-6 flex flex-wrap items-center gap-6 text-xs text-stone-500 border-t border-stone-200">
                <div className="flex items-center gap-1.5 font-medium text-stone-700">
                  <ShieldCheck className="w-4 h-4 text-amber-700" />
                  <span>100% Halal & Tanpa Pengawet</span>
                </div>
                <span aria-hidden="true">·</span>
                <div className="flex items-center gap-1.5 font-medium text-stone-700">
                  <Flame className="w-4 h-4 text-amber-700" />
                  <span>Dimasak Tradisional Kayu Bakar</span>
                </div>
                <span aria-hidden="true">·</span>
                <div className="flex items-center gap-1.5 font-medium text-stone-700">
                  <Award className="w-4 h-4 text-amber-700" />
                  <span>Racikan Rempah Asli Aceh</span>
                </div>
              </div>
            </div>

            {/* Right Column: Visual Showcase Card */}
            <div className="lg:col-span-5">
              <div className="relative rounded-3xl bg-gradient-to-br from-amber-900 via-stone-900 to-stone-950 p-8 text-white shadow-2xl overflow-hidden border border-stone-800">
                <div className="absolute top-0 right-0 -translate-y-8 translate-x-8 w-48 h-48 bg-amber-600/20 rounded-full blur-2xl" />

                <div className="relative z-10 space-y-6">
                  <div className="flex items-center justify-between text-xs text-amber-200 tracking-wide font-medium">
                    <span>HIDANGAN UTAMA HARI INI</span>
                    <span>TERSEDIA FRESH</span>
                  </div>

                  <div className="space-y-3">
                    <h2 className="text-2xl font-bold tracking-tight text-white">
                      Kuah Beulangong & Mie Aceh Spesial
                    </h2>
                    <p className="text-sm text-stone-300 leading-relaxed">
                      Daging kambing empuk berpadu nangka muda dalam kuah kari rempah merah beraroma kayu manis, cengkeh, dan kapulaga nusantara.
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-4 pt-4 border-t border-white/10 text-xs">
                    <div className="p-3 rounded-xl bg-white/5 border border-white/10">
                      <div className="text-stone-400">Porsi Populer</div>
                      <div className="font-semibold text-white mt-0.5 text-sm">Dine-in & Kenduri</div>
                    </div>
                    <div className="p-3 rounded-xl bg-white/5 border border-white/10">
                      <div className="text-stone-400">Tingkat Gurih</div>
                      <div className="font-semibold text-amber-300 mt-0.5 text-sm">Kari Rempah 16</div>
                    </div>
                  </div>

                  <div className="pt-2 flex items-center justify-between">
                    <div>
                      <span className="text-xs text-stone-400">Mulai dari</span>
                      <div className="text-xl font-extrabold text-amber-400 tabular-nums">Rp 28.000</div>
                    </div>
                    <button
                      onClick={() => {
                        setBookingForm((prev) => ({
                          ...prev,
                          note: "Ingin memesan Kuah Beulangong & Mie Aceh Spesial",
                        }));
                        scrollTo("reservasi");
                      }}
                      className="px-4 py-2 text-xs font-semibold bg-amber-500 hover:bg-amber-400 text-stone-950 rounded-lg transition-colors shadow-sm"
                    >
                      Pesan Meja Ini
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ==============================================================
          3. MENU SECTION
          Published Menu from Live Database with Category Filters & Search
      ============================================================== */}
      <section id="menu" className="py-20 bg-stone-100/70 border-y border-stone-200/80">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-10">
          {/* Header */}
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
            <div className="space-y-2 max-w-2xl">
              <span className="text-xs font-bold tracking-widest text-amber-800 uppercase">
                Etalase Sajian Terbitan
              </span>
              <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-stone-950">
                Menu Otentik Grand Aceh Kuliner
              </h2>
              <p className="text-stone-600 text-sm sm:text-base">
                Setiap menu diracik segar dari rempah murni, daging pilihan, dan racikan kopi asli dataran tinggi Gayo serta Ulee Kareng.
              </p>
            </div>

            {/* Search Box */}
            <div className="relative w-full md:w-72">
              <Search className="w-4 h-4 text-stone-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Cari hidangan atau minuman..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 text-xs bg-white rounded-xl border border-stone-300 focus:outline-none focus:ring-2 focus:ring-amber-800/30 text-stone-900 placeholder:text-stone-400 shadow-sm"
              />
            </div>
          </div>

          {/* Category Tabs */}
          <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
            <button
              onClick={() => setSelectedCat("all")}
              className={`px-4 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                selectedCat === "all"
                  ? "bg-amber-800 text-white shadow-sm"
                  : "bg-white text-stone-700 border border-stone-200 hover:bg-stone-50"
              }`}
            >
              Semua Menu ({menuItems.length})
            </button>
            <button
              onClick={() => setSelectedCat("makanan")}
              className={`px-4 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                selectedCat === "makanan"
                  ? "bg-amber-800 text-white shadow-sm"
                  : "bg-white text-stone-700 border border-stone-200 hover:bg-stone-50"
              }`}
            >
              Makanan Khas Aceh
            </button>
            <button
              onClick={() => setSelectedCat("minuman")}
              className={`px-4 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                selectedCat === "minuman"
                  ? "bg-amber-800 text-white shadow-sm"
                  : "bg-white text-stone-700 border border-stone-200 hover:bg-stone-50"
              }`}
            >
              Kopi Gayo & Minuman
            </button>
            <button
              onClick={() => setSelectedCat("retail")}
              className={`px-4 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                selectedCat === "retail"
                  ? "bg-amber-800 text-white shadow-sm"
                  : "bg-white text-stone-700 border border-stone-200 hover:bg-stone-50"
              }`}
            >
              Oleh-oleh & Retail
            </button>
          </div>

          {/* Menu Grid */}
          {loadingMenu ? (
            <div className="py-20 text-center space-y-3">
              <div className="w-8 h-8 border-4 border-amber-800 border-t-transparent rounded-full animate-spin mx-auto" />
              <p className="text-xs text-stone-500">Memuat katalog menu terbitan...</p>
            </div>
          ) : filteredMenu.length === 0 ? (
            <div className="py-16 text-center bg-white rounded-2xl border border-stone-200 p-8">
              <UtensilsCrossed className="w-10 h-10 text-stone-300 mx-auto mb-3" />
              <p className="text-stone-700 font-semibold text-sm">Tidak ada menu yang sesuai pencarian</p>
              <p className="text-xs text-stone-500 mt-1">Coba kata kunci lain atau pilih kategori Semua Menu</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredMenu.map((item) => (
                <div
                  key={item.id}
                  className="group bg-white rounded-2xl border border-stone-200/90 hover:border-amber-700/50 p-5 transition-all duration-300 ease-out hover:-translate-y-1.5 hover:shadow-xl hover:shadow-amber-950/10 flex flex-col justify-between cursor-pointer will-change-transform motion-reduce:transition-none motion-reduce:transform-none"
                >
                  <div className="space-y-3">
                    {/* Visual container with styled gradient fallback and smooth hover scaling */}
                    <div className="w-full h-44 rounded-xl bg-gradient-to-tr from-stone-900 via-amber-950 to-stone-900 relative overflow-hidden flex items-center justify-center p-4 text-center">
                      <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
                      <div className="space-y-1 transform group-hover:scale-105 transition-transform duration-300 ease-out">
                        <UtensilsCrossed className="w-8 h-8 text-amber-400 mx-auto opacity-75 group-hover:opacity-100 group-hover:scale-110 group-hover:text-amber-300 transition-all duration-300" />
                        <span className="block text-xs font-bold text-amber-200 tracking-wide">
                          {item.category_name}
                        </span>
                      </div>
                      {item.is_best_seller && (
                        <div className="absolute top-3 left-3 bg-amber-600 group-hover:bg-amber-500 text-white text-[10px] font-bold px-2 py-0.5 rounded tracking-wide uppercase shadow-sm transition-colors duration-200">
                          Favorit Tamu
                        </div>
                      )}
                    </div>

                    <div className="space-y-1.5">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="font-bold text-stone-950 text-base group-hover:text-amber-800 transition-colors duration-200">
                          {item.name}
                        </h3>
                      </div>
                      <p className="text-xs text-stone-500 line-clamp-2 leading-relaxed group-hover:text-stone-600 transition-colors duration-200">
                        {item.description || "Menu khas otentik disiapkan dengan bumbu dan bahan pilihan harian."}
                      </p>
                    </div>
                  </div>

                  <div className="pt-4 mt-3 border-t border-stone-100 flex items-center justify-between">
                    <div>
                      <span className="text-[10px] text-stone-400 uppercase tracking-wider block">Harga</span>
                      <span className="text-base font-extrabold text-stone-900 tabular-nums group-hover:text-amber-900 transition-colors duration-200">
                        {rupiah(item.price)}
                      </span>
                    </div>

                    <button
                      onClick={() => {
                        setBookingForm((prev) => ({
                          ...prev,
                          note: `Ingin memesan menu: ${item.name}`,
                        }));
                        scrollTo("reservasi");
                        toast.info(`Menu "${item.name}" ditambahkan ke catatan reservasi meja`);
                      }}
                      className="px-3.5 py-1.5 text-xs font-semibold text-amber-800 bg-amber-50 group-hover:bg-amber-800 group-hover:text-white rounded-lg transition-all duration-200 flex items-center gap-1 shadow-sm group-hover:shadow"
                    >
                      <span>Booking Meja</span>
                      <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform duration-200" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ==============================================================
          4. ARTICLES & HERITAGE STORIES
          Cultural essays on Acehnese Spices, Coffee & Tradition
      ============================================================== */}
      <section id="cerita" className="py-20 bg-[#FAF8F5]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-10">
          {/* Header */}
          <div className="space-y-2 max-w-2xl">
            <span className="text-xs font-bold tracking-widest text-amber-800 uppercase">
              Kisah & Filosofi Kuliner
            </span>
            <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-stone-950">
              Cerita di Balik Rempah Tanah Rencong
            </h2>
            <p className="text-stone-600 text-sm sm:text-base">
              Setiap mangkuk masakan dan cangkir kopi menyimpan sejarah panjang persilangan budaya pesisir, tradisi kenduri, dan kearifan masyarakat Aceh.
            </p>
          </div>

          {/* Articles Grid */}
          {loadingArticles ? (
            <div className="py-12 text-center text-xs text-stone-500">Memuat artikel kuliner...</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {articles.map((art) => (
                <div
                  key={art.id}
                  onClick={() => setSelectedArticle(art)}
                  className="cursor-pointer group bg-white rounded-2xl border border-stone-200/90 hover:border-amber-700/50 p-6 transition-all duration-300 ease-out hover:-translate-y-1.5 hover:shadow-xl hover:shadow-amber-950/10 space-y-4 will-change-transform motion-reduce:transition-none motion-reduce:transform-none"
                >
                  {/* Clean unboxed metadata (Anti-slop zero pill rule) */}
                  <div className="flex items-center gap-2 text-xs text-stone-500 font-medium">
                    <span className="text-amber-800 font-semibold">{art.category}</span>
                    <span aria-hidden="true">·</span>
                    <span>{art.read_time || "4 menit baca"}</span>
                    <span aria-hidden="true">·</span>
                    <span>{art.author || "Dapur Grand Aceh"}</span>
                  </div>

                  <h3 className="text-xl font-bold text-stone-950 group-hover:text-amber-800 transition-colors leading-snug">
                    {art.title}
                  </h3>

                  <p className="text-sm text-stone-600 leading-relaxed line-clamp-3">
                    {art.excerpt}
                  </p>

                  <div className="pt-2 flex items-center gap-1.5 text-xs font-semibold text-amber-800 group-hover:underline">
                    <span>Baca Selengkapnya</span>
                    <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ==============================================================
          5. TABLE BOOKING & RESERVATION SECTION
          Online booking form directly integrated with POS & WhatsApp
      ============================================================== */}
      <section id="reservasi" className="py-20 bg-stone-900 text-white relative overflow-hidden">
        {/* Ambient background decoration */}
        <div className="absolute top-0 right-1/4 w-96 h-96 bg-amber-600/10 rounded-full blur-3xl pointer-events-none" />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-start">
            {/* Left information */}
            <div className="lg:col-span-5 space-y-6">
              <span className="text-xs font-bold tracking-widest text-amber-400 uppercase">
                Pemesanan Meja Mandiri
              </span>
              <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white leading-tight">
                Reservasi Meja Santap Keluarga & Kolega
              </h2>
              <p className="text-stone-300 text-sm sm:text-base leading-relaxed">
                Amankan meja Anda sebelum tiba. Kami menyediakan area santap Indoor Ber-AC yang sejuk, ruang VIP untuk acara tertutup, serta area Lesehan khas Aceh yang akrab.
              </p>

              <div className="space-y-4 pt-4 border-t border-stone-800 text-sm text-stone-300">
                <div className="flex items-center gap-3">
                  <Clock className="w-5 h-5 text-amber-400 shrink-0" />
                  <span>Buka Setiap Hari: 08:00 – 23:00 WIB</span>
                </div>
                <div className="flex items-center gap-3">
                  <Phone className="w-5 h-5 text-amber-400 shrink-0" />
                  <span>WhatsApp Layanan Kasir: 0812-6900-1234</span>
                </div>
                <div className="flex items-center gap-3">
                  <MapPin className="w-5 h-5 text-amber-400 shrink-0" />
                  <span>Jl. Teuku Umar No. 12, Banda Aceh</span>
                </div>
              </div>

              {/* Informative notification note */}
              <div className="p-4 rounded-xl bg-stone-800/80 border border-stone-700 text-xs text-stone-300 space-y-1">
                <span className="font-semibold text-amber-300 block">Sistem Terintegrasi Kasir</span>
                <span>
                  Permintaan reservasi otomatis tercatat pada daftar antrean kasir POS dan dilengkapi konfirmasi WhatsApp instan.
                </span>
              </div>
            </div>

            {/* Right form card */}
            <div className="lg:col-span-7">
              <div className="bg-white rounded-3xl p-6 sm:p-8 text-stone-900 shadow-2xl border border-stone-200">
                {bookingResult ? (
                  /* Booking Confirmation Card */
                  <div className="text-center py-8 space-y-6">
                    <div className="w-16 h-16 bg-emerald-100 text-emerald-700 rounded-full flex items-center justify-center mx-auto">
                      <CheckCircle2 className="w-8 h-8" />
                    </div>

                    <div className="space-y-2">
                      <span className="text-xs font-bold text-emerald-800 tracking-wider uppercase">
                        Reservasi Berhasil Dikirim
                      </span>
                      <h3 className="text-2xl font-bold text-stone-950">
                        Kode Booking: {bookingResult.booking_code}
                      </h3>
                      <p className="text-stone-600 text-xs sm:text-sm max-w-md mx-auto">
                        Data pemesanan meja atas nama <b>{bookingForm.customer_name}</b> telah tercatat di sistem kasir kami.
                      </p>
                    </div>

                    <div className="p-4 rounded-xl bg-stone-50 border border-stone-200 text-left text-xs space-y-2 max-w-sm mx-auto">
                      <div className="flex justify-between">
                        <span className="text-stone-500">Tanggal:</span>
                        <span className="font-semibold text-stone-900">{bookingForm.date}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-stone-500">Jam Kedatangan:</span>
                        <span className="font-semibold text-stone-900">{bookingForm.time} WIB</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-stone-500">Jumlah Tamu:</span>
                        <span className="font-semibold text-stone-900">{bookingForm.pax} Orang</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-stone-500">Area Meja:</span>
                        <span className="font-semibold text-stone-900">{bookingForm.seating_area}</span>
                      </div>
                    </div>

                    <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
                      {bookingResult.whatsapp_url && (
                        <a
                          href={bookingResult.whatsapp_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="w-full sm:w-auto px-6 py-3 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl shadow-md transition-all flex items-center justify-center gap-2"
                        >
                          <MessageCircle className="w-4 h-4" />
                          <span>Kirim ke WhatsApp Kasir</span>
                        </a>
                      )}
                      <button
                        onClick={() => {
                          setBookingResult(null);
                          setBookingForm({
                            customer_name: "",
                            phone: "",
                            date: new Date().toISOString().slice(0, 10),
                            time: "19:00",
                            pax: 2,
                            seating_area: "Indoor",
                            table_id: "",
                            note: "",
                          });
                        }}
                        className="w-full sm:w-auto px-5 py-3 text-xs font-semibold text-stone-700 hover:text-stone-950 bg-stone-100 hover:bg-stone-200 rounded-xl transition-all"
                      >
                        Buat Reservasi Baru
                      </button>
                    </div>
                  </div>
                ) : (
                  /* Active Booking Form */
                  <form onSubmit={handleBookingSubmit} className="space-y-5">
                    <div className="space-y-1">
                      <h3 className="text-xl font-bold text-stone-950">Formulir Reservasi Meja</h3>
                      <p className="text-xs text-stone-500">Isi detail kedatangan Anda secara lengkap.</p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {/* Name */}
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-stone-700">Nama Pemesan *</label>
                        <input
                          type="text"
                          required
                          placeholder="cth. Teuku Farhan"
                          value={bookingForm.customer_name}
                          onChange={(e) =>
                            setBookingForm({ ...bookingForm, customer_name: e.target.value })
                          }
                          className="w-full px-3.5 py-2.5 text-xs bg-stone-50 rounded-xl border border-stone-300 focus:outline-none focus:ring-2 focus:ring-amber-800/30 text-stone-900"
                        />
                      </div>

                      {/* WhatsApp Phone */}
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-stone-700">Nomor WhatsApp *</label>
                        <input
                          type="tel"
                          required
                          placeholder="cth. 08123456789"
                          value={bookingForm.phone}
                          onChange={(e) => setBookingForm({ ...bookingForm, phone: e.target.value })}
                          className="w-full px-3.5 py-2.5 text-xs bg-stone-50 rounded-xl border border-stone-300 focus:outline-none focus:ring-2 focus:ring-amber-800/30 text-stone-900"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      {/* Date */}
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-stone-700">Tanggal *</label>
                        <input
                          type="date"
                          required
                          min={new Date().toISOString().slice(0, 10)}
                          value={bookingForm.date}
                          onChange={(e) => setBookingForm({ ...bookingForm, date: e.target.value })}
                          className="w-full px-3.5 py-2.5 text-xs bg-stone-50 rounded-xl border border-stone-300 focus:outline-none focus:ring-2 focus:ring-amber-800/30 text-stone-900"
                        />
                      </div>

                      {/* Time */}
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-stone-700">Jam Datang *</label>
                        <select
                          value={bookingForm.time}
                          onChange={(e) => setBookingForm({ ...bookingForm, time: e.target.value })}
                          className="w-full px-3.5 py-2.5 text-xs bg-stone-50 rounded-xl border border-stone-300 focus:outline-none focus:ring-2 focus:ring-amber-800/30 text-stone-900"
                        >
                          {["11:00", "12:00", "13:00", "14:00", "17:00", "18:00", "19:00", "20:00", "21:00"].map(
                            (t) => (
                              <option key={t} value={t}>
                                {t} WIB
                              </option>
                            )
                          )}
                        </select>
                      </div>

                      {/* Pax */}
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-stone-700">Jumlah Tamu *</label>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              setBookingForm((prev) => ({
                                ...prev,
                                pax: Math.max(1, prev.pax - 1),
                              }))
                            }
                            className="w-9 h-9 rounded-lg bg-stone-200 text-stone-700 font-bold hover:bg-stone-300"
                          >
                            -
                          </button>
                          <span className="flex-1 text-center font-bold text-sm tabular-nums">
                            {bookingForm.pax} Orang
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              setBookingForm((prev) => ({
                                ...prev,
                                pax: Math.min(30, prev.pax + 1),
                              }))
                            }
                            className="w-9 h-9 rounded-lg bg-stone-200 text-stone-700 font-bold hover:bg-stone-300"
                          >
                            +
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Seating Area Selection */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-stone-700">Pilihan Area Meja</label>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        {["Indoor", "VIP", "Lesehan", "Outdoor"].map((area) => (
                          <button
                            type="button"
                            key={area}
                            onClick={() => setBookingForm({ ...bookingForm, seating_area: area })}
                            className={`py-2 px-3 text-xs font-semibold rounded-xl border text-center transition-all ${
                              bookingForm.seating_area === area
                                ? "bg-amber-800 text-white border-amber-800 shadow-sm"
                                : "bg-stone-50 text-stone-700 border-stone-200 hover:bg-stone-100"
                            }`}
                          >
                            {area}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Specific Table (Optional) */}
                    {tables.length > 0 && (
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-stone-700">
                          Pilih Meja Spesifik (Opsional)
                        </label>
                        <select
                          value={bookingForm.table_id}
                          onChange={(e) => setBookingForm({ ...bookingForm, table_id: e.target.value })}
                          className="w-full px-3.5 py-2.5 text-xs bg-stone-50 rounded-xl border border-stone-300 focus:outline-none focus:ring-2 focus:ring-amber-800/30 text-stone-900"
                        >
                          <option value="">Pilih otomatis oleh sistem POS</option>
                          {tables.map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.name} (Kapasitas: {t.capacity} Orang, Area: {t.area})
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    {/* Notes */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-stone-700">Catatan Khusus</label>
                      <textarea
                        rows={2}
                        placeholder="Contoh: Menu pesanan khusus, meja dekat jendela, atau kursi bayi..."
                        value={bookingForm.note}
                        onChange={(e) => setBookingForm({ ...bookingForm, note: e.target.value })}
                        className="w-full px-3.5 py-2 text-xs bg-stone-50 rounded-xl border border-stone-300 focus:outline-none focus:ring-2 focus:ring-amber-800/30 text-stone-900"
                      />
                    </div>

                    {/* Submit Button */}
                    <button
                      type="submit"
                      disabled={submittingBooking}
                      className="w-full py-3.5 text-xs font-bold text-white bg-amber-800 hover:bg-amber-900 active:scale-[0.99] rounded-xl shadow-md transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      {submittingBooking ? (
                        <span>Mengirimkan Reservasi...</span>
                      ) : (
                        <>
                          <CalendarCheck className="w-4 h-4" />
                          <span>Kirim Reservasi Meja Sekarang</span>
                        </>
                      )}
                    </button>
                  </form>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ==============================================================
          6. LOCATION, OPERATIONAL HOURS & FOOTER
      ============================================================== */}
      <footer id="lokasi" className="bg-stone-950 text-stone-400 text-xs py-16 border-t border-stone-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            {/* Brand column */}
            <div className="space-y-3 md:col-span-1">
              <div className="flex items-center gap-2 text-white font-bold text-base">
                <div className="w-7 h-7 rounded-lg bg-amber-700 text-white flex items-center justify-center font-bold text-xs">
                  GA
                </div>
                <span>Grand Aceh Kuliner</span>
              </div>
              <p className="text-stone-400 text-xs leading-relaxed">
                Menghidangkan kelezatan rempah khas Serambi Mekkah dengan tradisi dan dedikasi otentik.
              </p>
            </div>

            {/* Jam Operasional */}
            <div className="space-y-2">
              <span className="font-semibold text-stone-200 block uppercase tracking-wider text-[11px]">
                Jam Operasional
              </span>
              <p className="text-stone-300">Setiap Hari (Senin – Minggu)</p>
              <p className="text-stone-400">08:00 – 23:00 WIB</p>
              <p className="text-amber-400 pt-1 text-[11px]">Dine-in, Takeaway & Reservasi</p>
            </div>

            {/* Kontak & Lokasi */}
            <div className="space-y-2">
              <span className="font-semibold text-stone-200 block uppercase tracking-wider text-[11px]">
                Alamat & Kontak
              </span>
              <p className="text-stone-300">Jl. Teuku Umar No. 12, Banda Aceh</p>
              <p className="text-stone-400">WhatsApp: 0812-6900-1234</p>
              <p className="text-stone-400">Email: info@grandacehkuliner.id</p>
            </div>

            {/* Akses Cepat Kasir */}
            <div className="space-y-3">
              <span className="font-semibold text-stone-200 block uppercase tracking-wider text-[11px]">
                Akses Internal Staf
              </span>
              <p className="text-stone-400 text-xs leading-relaxed">
                Khusus kasir, koki, dan manajer operasional Grand Aceh Kuliner:
              </p>
              <button
                onClick={() => navigate("/login")}
                className="px-4 py-2 bg-stone-800 hover:bg-stone-700 text-amber-300 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5"
              >
                <span>Masuk ke Sistem POS Kasir</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div className="pt-8 border-t border-stone-800 flex flex-col sm:flex-row items-center justify-between gap-4 text-[11px] text-stone-500">
            <div>
              &copy; {new Date().getFullYear()} Grand Aceh Kuliner POS. All rights reserved.
            </div>
            <div className="flex items-center gap-4">
              <span>Masakan Tradisional Aceh</span>
              <span aria-hidden="true">·</span>
              <span>Kopi Gayo Asli</span>
              <span aria-hidden="true">·</span>
              <span>Halal & Alami</span>
            </div>
          </div>
        </div>
      </footer>

      {/* ==============================================================
          7. ARTICLE DETAIL READING MODAL
      ============================================================== */}
      {selectedArticle && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-2xl w-full max-h-[85vh] overflow-y-auto p-6 sm:p-8 space-y-6 shadow-2xl relative text-stone-900 border border-stone-200">
            <button
              onClick={() => setSelectedArticle(null)}
              className="absolute top-5 right-5 w-8 h-8 rounded-full bg-stone-100 hover:bg-stone-200 flex items-center justify-center text-stone-600 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs text-stone-500 font-medium">
                <span className="text-amber-800 font-semibold">{selectedArticle.category}</span>
                <span aria-hidden="true">·</span>
                <span>{selectedArticle.read_time || "4 menit baca"}</span>
                <span aria-hidden="true">·</span>
                <span>{selectedArticle.author || "Dapur Utama Grand Aceh"}</span>
              </div>

              <h2 className="text-2xl sm:text-3xl font-extrabold text-stone-950 leading-tight">
                {selectedArticle.title}
              </h2>
            </div>

            <div className="prose prose-stone text-stone-700 text-sm leading-relaxed space-y-4 whitespace-pre-line border-t border-stone-100 pt-4">
              {selectedArticle.content}
            </div>

            <div className="pt-4 border-t border-stone-100 flex items-center justify-between">
              <button
                onClick={() => {
                  setSelectedArticle(null);
                  scrollTo("reservasi");
                }}
                className="px-4 py-2 text-xs font-semibold text-white bg-amber-800 hover:bg-amber-900 rounded-xl transition-all shadow-sm"
              >
                Reservasi Meja & Cicipi Hidangan Ini
              </button>
              <button
                onClick={() => setSelectedArticle(null)}
                className="px-4 py-2 text-xs font-semibold text-stone-600 hover:text-stone-900 bg-stone-100 rounded-xl transition-colors"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
