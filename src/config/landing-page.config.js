/* ================================================================
   DEFAULT CONFIGURATION FILE - LANDING PAGE & PROMOTIONAL CONTENT
   Grand Aceh Kuliner POS & Culinary Experience
   ================================================================
   File ini menyediakan konfigurasi default bawaan (fallback).
   Admin/Owner dapat mengubah konten ini secara langsung melalui UI
   di menu: Pengaturan -> Landing Page (/settings?tab=landing-page).
   ================================================================ */

export const DEFAULT_LANDING_CONFIG = {
  // 1. Hero Banner
  hero: {
    badge: "Restoran & Kuliner Otentik Aceh",
    title: "Cita Rasa Otentik Tanah Rencong",
    subtitle: "Nikmati Kelezatan Mie Aceh Rempah, Nasi Gurih, dan Kopi Ulee Kareng Pilihan dengan Suasana Hangat dan Pelayanan Terbaik.",
    image_url: "/screenshot-desktop.png",
    primary_cta: {
      text: "Lihat Menu & Order",
      link: "#menu"
    },
    secondary_cta: {
      text: "Reservasi Meja",
      link: "#reservasi"
    }
  },

  // 2. Statistik & Keunggulan Toko
  stats: {
    show_section: true,
    items: [
      { id: "years", label: "Tahun Berkelana Rasa", value: "15+", suffix: "Tahun" },
      { id: "recipes", label: "Resep Warisan Khas", value: "48+", suffix: "Varian" },
      { id: "rating", label: "Kepuasan Pelanggan", value: "4.9/5.0", suffix: "Bintang" },
      { id: "capacity", label: "Kapasitas Pengunjung", value: "120+", suffix: "Kursi" }
    ]
  },

  // 3. Highlight Promo & Pengumuman
  promo_banner: {
    enabled: true,
    badge: "PROMO BULAN INI",
    title: "Diskon 15% Paket Keluarga Mie Aceh Tumis + Es Kopi Sanger",
    subtitle: "Berlaku untuk Dine-in & Takeaway setiap hari Senin - Kamis jam 14:00 - 17:00 WIB.",
    cta_text: "Klaim Kupon Member",
    cta_link: "#menu"
  },

  // 4. Fitur Layanan Otentik
  features: [
    {
      id: "rempah",
      title: "Rempah Asli Banda Aceh",
      desc: "Bumbu diracik secara tradisional menggunakan lebih dari 18 jenis rempah khas Aceh pilihan.",
      icon: "Flame"
    },
    {
      id: "halal",
      title: "100% Halal & Thayyib",
      desc: "Seluruh bahan makanan dan proses penyajian dijamin halal, bersih, dan higienis.",
      icon: "ShieldCheck"
    },
    {
      id: "coffee",
      title: "Kopi Saring Ulee Kareng",
      desc: "Diseduh langsung dengan teknik saring tradisional oleh barista kopi Aceh berpengalaman.",
      icon: "Coffee"
    }
  ],

  // 5. Jam Operasional & Kontak Toko
  contact_info: {
    address: "Jl. T. Nyak Arief No. 88, Syiah Kuala, Banda Aceh",
    google_maps_url: "https://maps.google.com/?q=Banda+Aceh",
    phone: "0812-6900-1234",
    whatsapp: "6281269001234",
    email: "info@grandacehkuliner.com",
    opening_hours: "Setiap Hari: 08:00 - 23:00 WIB",
    instagram: "@grandacehkuliner"
  },

  // 6. Pengaturan Reservasi & Meja
  reservation: {
    title: "Reservasi Meja & Ruangan",
    subtitle: "Pesan tempat terlebih dahulu untuk acara keluarga, reuni, atau santap siang kolega.",
    note: "Kapasitas area dan meja mengikuti data Manajemen Meja real-time.",
    max_pax: 20
  },

  // 7. Header Seksi Cerita & Filosofi Kuliner
  articles_header: {
    badge: "Kisah & Filosofi Kuliner",
    title: "Cerita di Balik Rempah Tanah Rencong",
    subtitle: "Setiap mangkuk masakan dan cangkir kopi menyimpan sejarah panjang persilangan budaya pesisir, tradisi kenduri, dan kearifan masyarakat Aceh."
  },

  // 8. Meta SEO & Google Search Snippet Preview
  seo: {
    site_title: "Grand Aceh Kuliner — Restoran & Mie Aceh Otentik",
    meta_title: "Grand Aceh Kuliner — Restoran & Mie Aceh Otentik",
    meta_description: "Nikmati Kelezatan Mie Aceh Rempah, Nasi Gurih, Kopi Ulee Kareng, dan Ayam Tangkap khas Banda Aceh dengan resep warisan otentik 100% halal.",
    og_image_url: "/screenshot-desktop.png",
    site_name: "Grand Aceh Kuliner",
    canonical_url: "https://grandacehkuliner.com",
    keywords: "Mie Aceh, Restoran Aceh, Kopi Sanger, Kuliner Banda Aceh, Halal Food",
    twitter_handle: "@grandacehkuliner"
  }
};

export default DEFAULT_LANDING_CONFIG;
