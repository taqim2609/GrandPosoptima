#!/usr/bin/env python3
"""Script Generator & Pembaru Indeks Berkas (INDEX-BERKAS.md)
Grand Aceh Kuliner POS & Planora Framework.

Script ini memindai struktur berkas repositori dan memperbarui INDEX-BERKAS.md
secara otomatis setiap kali ada berkas baru yang ditambahkan.

Jalankan:
    python3 project/scripts/update_file_index.py
"""

import os
import sys
from datetime import datetime, timezone, timedelta

WIB = timezone(timedelta(hours=7))

# Direktori yang diabaikan dalam pemindaian
IGNORE_DIRS = {
    "node_modules",
    ".git",
    "__pycache__",
    "build",
    ".cache",
    ".tmp",
    "dist",
    ".gradle",
}

# Berkas atau ekstensi yang diabaikan
IGNORE_EXTS = {
    ".pyc",
    ".swp",
    ".DS_Store",
}

IGNORE_FILES = {
    ".gitignore",
    ".gcloudignore",
    ".gitattributes",
    ".gitconfig",
    "package-lock.json",
    "bun.lock",
}

# Kamus deskripsi terdefinisi untuk berkas utama
FILE_DESCRIPTIONS = {
    "server.js": "Server utama Express.js Node.js (Cloud Run & development) melayani API dan fallback SPA.",
    "build.js": "Skrip build dan packaging bundle statis, OTA ZIP, dan sanitasi index.html.",
    "metadata.json": "Metadata manifes AI Studio (nama aplikasi, deskripsi, capabilities server-side).",
    "index.html": "Entrypoint HTML utama untuk web build dengan polyfill WebView Android 7 lama.",
    "PANDUAN-HERMES-AGENT.md": "Panduan resmi integrasi Hermes Agent (Nous Research) untuk AI Brain & WA Gateway.",
    "AGENTS.md": "Aturan emas agen, konvensi teknis arsitektur F&B/Retail, dan alur Planora.",
    "CLAUDE.md": "Panduan instruksi agen berbasis Claude untuk repositori.",
    "INDEX-BERKAS.md": "Buku besar indeks katalog seluruh berkas dalam proyek.",
    "package.json": "Konfigurasi dependensi Node.js root server.",
    "firebase-blueprint.json": "Skema cetak biru Firestore dan konfigurasi database cloud.",
    "firestore.rules": "Aturan keamanan Firestore Cloud Database.",
    "firebase-applet-config.json": "Konfigurasi kredensial koneksi Firebase Applet.",

    # Planora
    ".planora/manifest.json": "Manifes status dan daftar berkas paket Planora.",
    ".planora/PRD/PRD.md": "Spesifikasi kebutuhan produk utama Grand Aceh Kuliner POS.",
    ".planora/EXECUTION/TODO.md": "Buku besar pelacakan tugas hidup (*live TODO ledger*).",
    ".planora/UI/design-direction.md": "Panduan arah desain UI POS layar sentuh dan komponen.",
    ".planora/DX/quickstart.md": "Panduan setup cepat dan alur pengembang.",

    # Backend
    "project/backend/server.py": "Backend FastAPI (Python/Motor) utama melayani semua endpoint POS (/api).",
    "project/backend/hermes_bridge.py": "Jembatan WhatsApp POS <-> Hermes gateway (HMAC Generic V2 & outbox idempoten).",
    "project/backend/create_user.py": "Utilitas CLI pembuatan akun pengguna kasir/admin.",
    "project/backend/requirements.txt": "Daftar pustaka Python backend (FastAPI, Motor, Uvicorn, bcrypt, jwt).",
    "project/backend/Dockerfile": "Definisi kontainer Docker backend Python.",

    # Frontend Core
    "project/frontend/src/App.js": "Komponen root routing aplikasi React 19.",
    "project/frontend/src/index.js": "Titik masuk render React DOM dengan polyfills.",
    "project/frontend/src/context/AuthContext.jsx": "Konteks autentikasi pengguna, sesi token JWT, dan login PIN.",
    "project/frontend/src/context/OfflineContext.jsx": "Konteks sinkronisasi offline-first IndexedDB idempoten (JANGAN DI-REFACTOR).",
    "project/frontend/public/polyfills.js": "Polyfill ES6/ES7 khusus WebView Android 7 lama pada terminal Sunmi T2.",
    "project/frontend/public/sw.js": "Service worker dummy nonaktif (mencegah konflik cache OTA).",

    # Pages
    "project/frontend/src/pages/POS.jsx": "Layar transaksi kasir hybrid F&B (dine-in/meja, take-away) dan Retail.",
    "project/frontend/src/pages/Shift.jsx": "Layar buka/tutup shift kasir, rekonsiliasi kas, dan bagi hasil vendor.",
    "project/frontend/src/pages/Orders.jsx": "Daftar pesanan aktif, riwayat transaksi, dan cetak ulang struk.",
    "project/frontend/src/pages/Products.jsx": "Manajemen katalog produk F&B dan retail, stok, dan harga.",
    "project/frontend/src/pages/Tables.jsx": "Manajemen tata letak meja makan, status terisi/kosong, dan pindah meja.",
    "project/frontend/src/pages/Dashboard.jsx": "Dashboard ringkasan omzet penjualan, grafik transaksi, dan produk terlaris.",
    "project/frontend/src/pages/AssistantAI.jsx": "Antarmuka obrolan cerdas Asisten AI POS dengan dukungan multi-model.",
    "project/frontend/src/pages/SettingsAI.jsx": "Pengaturan penyedia AI (Gemini AI & OpenAI/Hermes Gateway VPS).",
    "project/frontend/src/pages/WhatsApp.jsx": "Dasbor manajemen WhatsApp Gateway, status instance, dan riwayat pesan.",
    "project/frontend/src/pages/WhatsAppReport.jsx": "Laporan pengiriman pesan otomatis dan log notifikasi WhatsApp.",
    "project/frontend/src/pages/Ingredients.jsx": "Manajemen inventaris bahan baku dapur dan peringatan stok menipis.",
    "project/frontend/src/pages/Recipes.jsx": "Manajemen formula resep F&B dan perhitungan HPP otomatis.",
    "project/frontend/src/pages/VendorSettlement.jsx": "Manajemen konsinyasi titipan vendor dan pembayaran bagi hasil.",
    "project/frontend/src/pages/Vendors.jsx": "Daftar data mitra vendor produk titipan dan persentase bagi hasil.",
    "project/frontend/src/pages/VoidRefund.jsx": "Manajemen pembatalan pesanan (void/refund) dengan otorisasi PIN.",
    "project/frontend/src/pages/Cash.jsx": "Pencatatan mutasi kas masuk dan kas keluar operasional.",
    "project/frontend/src/pages/Members.jsx": "Manajemen data pelanggan setia, perolehan poin, dan riwayat belanja.",
    "project/frontend/src/pages/PromosCoupons.jsx": "Manajemen kode kupon diskon dan promosi musiman.",
    "project/frontend/src/pages/Categories.jsx": "Manajemen kategori makanan, minuman, dan snack retail.",
    "project/frontend/src/pages/Reservations.jsx": "Manajemen reservasi meja makan dan integrasi reservasi via WhatsApp.",
    "project/frontend/src/pages/Users.jsx": "Manajemen akun pengguna kasir, admin, dan hak akses.",
    "project/frontend/src/pages/SettingsBusiness.jsx": "Pengaturan identitas outlet, alamat, logo, dan footer struk belanja.",
    "project/frontend/src/pages/SystemHealth.jsx": "Panel diagnostik kesehatan sistem, status server, dan sinkronisasi.",

    # Libs
    "project/frontend/src/lib/api.js": "Klien HTTP Axios dengan interceptor token autentikasi otomatis.",
    "project/frontend/src/lib/receipt.js": "Generator layout cetak struk thermal 58mm/80mm dan perintah openDrawer.",
    "project/frontend/src/lib/print.js": "Bridge pencetakan printer thermal Bluetooth dan Sunmi native.",
    "project/frontend/src/lib/format.js": "Utilitas pemformatan mata uang Rupiah dan tanggal WIB.",
    "project/frontend/src/lib/rbac.js": "Utilitas verifikasi hak akses berbasis peran (RBAC).",
    "project/frontend/src/lib/ota.js": "Utilitas pengecekan pembaruan Capgo OTA langsung di perangkat kasir.",
    "project/frontend/src/lib/offlineQueue.js": "Antrean transaksi luring berbasis IndexedDB yang sinkron saat online.",
    "src/components/QuickStockManager.jsx": "Komponen pembaruan cepat stok fisik massal dan pencatatan penggunaan bahan dapur (100% backend mandiri).",
    "project/frontend/src/components/QuickStockManager.jsx": "Komponen pembaruan cepat stok fisik massal dan pencatatan penggunaan bahan dapur.",

    # Hardware & Android
    "apk/Grand-Aceh-Kuliner-POS-v2.10.apk": "Paket instalasi Android release untuk perangkat Sunmi T2 / tablet POS.",
    "project/frontend/android/app/src/main/java/host/emergent/hybridposaceh/MainActivity.java": "Bridge Android Java untuk Sunmi SDK, printer thermal, dan pemicu laci kasir.",

    # Hermes Integration
    "project/hermes-integration/grandpos-wa-inbound/__init__.py": "Plugin Hermes inbound hook pre_gateway_dispatch untuk meneruskan WA ke POS.",
    "project/hermes-integration/grandpos-wa-inbound/plugin.yaml": "Manifes registrasi plugin Hermes grandpos-wa-inbound.",
    "project/tests/test_hermes_bridge.py": "Pengujian unit logika jembatan outbox Hermes (22 tes).",
    "project/tests/test_hermes_plugin_inbound.py": "Pengujian unit plugin hook masuk Hermes tanpa dependensi eksternal (8 tes).",
    "project/tests/test_hermes_wa_e2e.py": "Pengujian end-to-end penandatanganan HMAC V2 dan render webhook (5 tes).",
    "project/tests/test_wa_provider_migration.py": "Pengujian migrasi provider legacy (wacloud/evolution) ke hermes (3 tes).",
}


def categorize_file(rel_path: str) -> str:
    """Tentukan kategori modul berdasarkan jalur berkas."""
    rp = rel_path.replace("\\", "/")
    if rp.startswith(".planora/"):
        return "Planora Framework"
    if rp.startswith(".agents/skills/"):
        return "Agent Skill System"
    if rp.startswith("project/backend/"):
        return "Backend FastAPI & Data"
    if rp.startswith("project/frontend/src/pages/"):
        return "Frontend — Halaman UI"
    if rp.startswith("project/frontend/src/components/"):
        return "Frontend — Komponen UI"
    if rp.startswith("project/frontend/src/context/"):
        return "Frontend — State & Context"
    if rp.startswith("project/frontend/src/lib/"):
        return "Frontend — Utility & Library"
    if rp.startswith("project/frontend/android/") or rp.startswith("apk/"):
        return "Mobile Android & Sunmi Hardware"
    if rp.startswith("project/hermes-integration/"):
        return "Integrasi Hermes Agent"
    if rp.startswith("project/tests/"):
        return "Testing & Verifikasi"
    if rp.startswith("project/n8n-workflows/"):
        return "Automasi n8n & Workflow"
    if rp.startswith("project/docs/"):
        return "Dokumentasi Teknis"
    if rp.endswith(".sh") or rp.endswith(".bat") or "docker-compose" in rp or "Dockerfile" in rp:
        return "Deployment & DevOps"
    if rp in ("server.js", "build.js", "metadata.json", "index.html", "package.json", "routes/allMissingRoutes.js"):
        return "Cloud Run & Server Root"
    return "Berkas Pendukung / Konfigurasi"


def guess_description(rel_path: str) -> str:
    """Tebak deskripsi otomatis jika belum terdaftar di kamus."""
    if rel_path in FILE_DESCRIPTIONS:
        return FILE_DESCRIPTIONS[rel_path]

    base = os.path.basename(rel_path)
    cat = categorize_file(rel_path)

    if cat == "Frontend — Halaman UI":
        name = base.replace(".jsx", "").replace(".js", "")
        return f"Halaman antarmuka pengguna untuk modul {name}."
    if cat == "Frontend — Komponen UI":
        name = base.replace(".jsx", "").replace(".js", "")
        return f"Komponen visual antarmuka pengguna: {name}."
    if cat == "Deployment & DevOps":
        if base.endswith(".sh"):
            return f"Skrip otomatisasi Linux/Raspberry Pi: {base}."
        if base.endswith(".bat"):
            return f"Skrip otomatisasi Windows Server: {base}."
        if "docker" in base:
            return f"Konfigurasi Docker container: {base}."
    if cat == "Integrasi Hermes Agent":
        return f"Komponen integrasi gateway agen AI Hermes ({base})."
    if cat == "Testing & Verifikasi":
        return f"Skrip pengujian otomatis: {base}."
    if cat == "Planora Framework":
        return f"Dokumen spesifikasi Planora ({base})."
    if cat == "Agent Skill System":
        return f"Definisi kemampuan agen: {base}."
    if cat == "Automasi n8n & Workflow":
        return f"Workflow automasi alur kerja n8n: {base}."
    if cat == "Dokumentasi Teknis":
        return f"Dokumen acuan teknis operasional: {base}."

    return f"Berkas konfigurasi/data: {base}."


def scan_repository(root_dir: str):
    """Pindai seluruh berkas yang relevan dalam repositori."""
    indexed_files = []
    for dirpath, dirnames, filenames in os.walk(root_dir):
        # Filter direktori yang diabaikan secara in-place
        dirnames[:] = [d for d in dirnames if d not in IGNORE_DIRS and not d.startswith(".git")]

        for f in filenames:
            ext = os.path.splitext(f)[1]
            if ext in IGNORE_EXTS or f in IGNORE_FILES:
                continue

            full_path = os.path.join(dirpath, f)
            rel_path = os.path.relpath(full_path, root_dir).replace("\\", "/")

            # Lewati berkas sementara
            if rel_path.startswith(".aistudio/") or "/__pycache__/" in rel_path:
                continue

            indexed_files.append(rel_path)

    indexed_files.sort()
    return indexed_files


def generate_index_markdown(root_dir: str, files: list) -> str:
    """Bentuk dokumen Markdown indeks berkas terstruktur."""
    now_str = datetime.now(WIB).strftime("%Y-%m-%d %H:%M:%S WIB")

    # Kelompokkan berkas per kategori
    categories = {}
    for f in files:
        cat = categorize_file(f)
        if cat not in categories:
            categories[cat] = []
        categories[cat].append(f)

    # Urutan kategori yang rapi
    category_order = [
        "Cloud Run & Server Root",
        "Backend FastAPI & Data",
        "Frontend — Halaman UI",
        "Frontend — Komponen UI",
        "Frontend — State & Context",
        "Frontend — Utility & Library",
        "Mobile Android & Sunmi Hardware",
        "Integrasi Hermes Agent",
        "Testing & Verifikasi",
        "Planora Framework",
        "Dokumentasi Teknis",
        "Automasi n8n & Workflow",
        "Deployment & DevOps",
        "Agent Skill System",
        "Berkas Pendukung / Konfigurasi",
    ]

    lines = [
        "# Indeks Katalog Berkas — Grand Aceh Kuliner POS",
        "",
        "> **Buku Besar Katalog Berkas Repositori**",
        "> Terakhir diperbarui: `" + now_str + "`",
        "> Total Berkas Terindeks: **" + str(len(files)) + " berkas**",
        "",
        "Dokumen ini memuat daftar lengkap seluruh berkas di repositori beserta kategori dan fungsinya.",
        "Setiap kali ada penambahan atau perubahan berkas, jalankan skrip berikut untuk memperbarui indeks:",
        "```bash",
        "python3 project/scripts/update_file_index.py",
        "```",
        "",
        "---",
        "",
        "## Ringkasan Kategori Berkas",
        "",
        "| Kategori | Jumlah Berkas | Keterangan |",
        "| :--- | :---: | :--- |",
    ]

    for cat in category_order:
        if cat in categories:
            count = len(categories[cat])
            lines.append(f"| **{cat}** | `{count}` | Modul {cat.lower()} sistem POS |")

    lines.extend([
        "",
        "---",
        "",
        "## Daftar Lengkap Berkas Menurut Modul",
        "",
    ])

    for cat in category_order:
        if cat not in categories:
            continue
        items = categories[cat]
        lines.append(f"### 📁 {cat} ({len(items)} berkas)")
        lines.append("")
        lines.append("| Jalur Berkas (`Path`) | Deskripsi Fungsi |")
        lines.append("| :--- | :--- |")
        for item in items:
            desc = guess_description(item)
            lines.append(f"| `{item}` | {desc} |")
        lines.append("")

    return "\n".join(lines) + "\n"


def main():
    # Menemukan root repositori
    script_dir = os.path.dirname(os.path.abspath(__file__))
    root_dir = os.path.dirname(os.path.dirname(script_dir))
    if not os.path.exists(os.path.join(root_dir, "package.json")):
        root_dir = os.path.dirname(script_dir)

    print(f"[Index] Memindai repositori di: {root_dir}")
    files = scan_repository(root_dir)
    print(f"[Index] Berhasil memindai {len(files)} berkas.")

    content = generate_index_markdown(root_dir, files)

    # Simpan di root dan di project/
    targets = [
        os.path.join(root_dir, "INDEX-BERKAS.md"),
        os.path.join(root_dir, "project", "INDEX-BERKAS.md"),
    ]

    for target in targets:
        if os.path.exists(os.path.dirname(target)):
            with open(target, "w", encoding="utf-8") as f:
                f.write(content)
            print(f"[Index] Berhasil memperbarui: {target}")

    print("[Index] Selesai 100%.")


if __name__ == "__main__":
    main()
