/* Daftar menu samping aplikasi — SATU sumber kebenaran.
   Dipakai Layout (render menu) & Pengaturan → Menu & Tampilan UI (atur urutan/nama).
   Jangan duplikasi daftar ini di tempat lain. */
import { Ban, BarChart3, Bot, Boxes, CalendarCheck, Clock, FileSpreadsheet, FlaskConical, HandCoins, LayoutDashboard, Package, Printer, Settings, ShoppingCart, Tag, Ticket, Users, Wallet } from "lucide-react";

export const NAV_ITEMS = [
  // Operasional
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, roles: ["admin", "kasir", "input"], mod: "dashboard", section: "Operasional" },
  { to: "/pos", label: "POS Kasir", icon: ShoppingCart, roles: ["admin", "kasir"], mod: "pos", section: "Operasional" },
  { to: "/shift", label: "Shift", icon: Clock, roles: ["admin", "kasir"], mod: "shift", section: "Operasional" },
  { to: "/orders", label: "Transaksi", icon: FileSpreadsheet, roles: ["admin"], mod: "transaksi", section: "Operasional" },
  { to: "/reservations", label: "Reservasi", icon: CalendarCheck, roles: ["admin", "kasir"], mod: "reservasi", section: "Operasional" },
  { to: "/void", label: "Void & Refund", icon: Ban, roles: ["admin", "kasir"], mod: "void", section: "Operasional" },

  // Katalog & Stok
  { to: "/catalog", label: "Produk & Stok", icon: Package, roles: ["admin", "input"], mod: "produk", section: "Katalog & Stok" },
  { to: "/ingredients", label: "Bahan & Belanja", icon: Boxes, roles: ["admin", "input"], mods: ["produk", "belanja_bahan", "opname_bahan"], section: "Katalog & Stok" },
  { to: "/settlement", label: "Settlement Vendor", icon: HandCoins, roles: ["admin", "kasir"], mod: "settlement", section: "Katalog & Stok" },

  // Pelanggan & Kas
  { to: "/members", label: "Member & Poin", icon: Users, roles: ["admin"], mod: "member", section: "Pelanggan & Kas" },
  { to: "/promo-kupon", label: "Promo & Kupon", icon: Tag, roles: ["admin"], mod: "promo", section: "Pelanggan & Kas" },
  { to: "/cash", label: "Pengeluaran & Kas", icon: Wallet, roles: ["admin", "kasir"], mod: "pengeluaran", section: "Pelanggan & Kas" },

  // Laporan & Sistem
  { to: "/laporan", label: "Laporan", icon: BarChart3, roles: ["admin", "kasir"], mod: "laporan", section: "Laporan & Sistem" },
  { to: "/asisten-ai", label: "Asisten AI", icon: Bot, roles: ["admin", "kasir"], mod: "ai", section: "Laporan & Sistem" },
  { to: "/device", label: "Perangkat", icon: Printer, roles: ["kasir", "input"], section: "Laporan & Sistem" },
  { to: "/settings", label: "Pengaturan", icon: Settings, roles: ["admin"], mods: ["pengaturan", "pengguna", "role_izin"], section: "Laporan & Sistem" },
];
