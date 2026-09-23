from dotenv import load_dotenv
from pathlib import Path
import os

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

UPLOAD_DIR = Path(os.environ.get('UPLOAD_DIR') or (ROOT_DIR / 'uploads'))
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
PROJECT_ROOT = ROOT_DIR.parent

from fastapi import FastAPI, APIRouter, HTTPException, Depends, Request, UploadFile, File, Query, BackgroundTasks
from fastapi.responses import StreamingResponse, FileResponse, Response
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pymongo import ReturnDocument
from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional, Literal
from datetime import datetime, timezone, timedelta
import logging, uuid, io, bcrypt, jwt, asyncio, re, zipfile, math, time, json
from bson import json_util

# ------------------------------------------------------------------ DB
mongo_url = os.environ['MONGO_URL']

# Jumlah proses worker uvicorn. Dockerfile menjalankan `--workers ${UVICORN_WORKERS}`,
# jadi nilai ini harus sama dengan jumlah proses yang benar-benar hidup; env yang sama
# dibaca di sini untuk menyesuaikan anggaran koneksi Mongo: N worker tidak boleh
# membuka N x 30 koneksi di Pi ber-RAM kecil.
WORKERS = max(1, int(os.environ.get("UVICORN_WORKERS", "1") or 1))

# Batas koneksi Mongo per proses. Total anggaran 30 koneksi dibagi rata antar worker
# supaya 4 worker tidak membuka 120 koneksi di Pi ber-RAM kecil.
MONGO_POOL_SIZE = int(os.environ.get("MONGO_MAX_POOL_SIZE", str(max(6, 30 // WORKERS))))

client = AsyncIOMotorClient(
    mongo_url,
    # Pooling koneksi: batas wajar + timeout jelas supaya trafik tinggi tidak
    # menguras koneksi Mongo (env bisa di-override).
    maxPoolSize=MONGO_POOL_SIZE,
    minPoolSize=int(os.environ.get("MONGO_MIN_POOL_SIZE", "1")),
    maxIdleTimeMS=int(os.environ.get("MONGO_MAX_IDLE_MS", "60000")),
    serverSelectionTimeoutMS=int(os.environ.get("MONGO_SERVER_SELECTION_TIMEOUT_MS", "5000")),
    connectTimeoutMS=int(os.environ.get("MONGO_CONNECT_TIMEOUT_MS", "5000")),
)
db = client[os.environ['DB_NAME']]

JWT_SECRET = os.environ['JWT_SECRET']
JWT_ALG = "HS256"
EMERGENT_LLM_KEY = os.environ.get('EMERGENT_LLM_KEY')
GEMINI_API_KEY = os.environ.get('GEMINI_API_KEY')
GEMINI_TEXT_MODEL = os.environ.get('GEMINI_MODEL', 'gemini-3.6-flash')
GEMINI_IMAGE_MODEL = os.environ.get('GEMINI_IMAGE_MODEL', 'gemini-3.1-flash-image')
OPENAI_COMPAT_BASE_URL = os.environ.get('OPENAI_COMPAT_BASE_URL')
OPENAI_COMPAT_API_KEY = os.environ.get('OPENAI_COMPAT_API_KEY')
OPENAI_COMPAT_MODEL = os.environ.get('OPENAI_COMPAT_MODEL') or 'gpt-4o-mini'
CHENZK_BASE_URL = "https://chenzk.top/v1"  # default base url provider "chenzk" (ezkielyna.store)
GEMINI_REST_URL = "https://generativelanguage.googleapis.com/v1beta/models"

# ---- Rotasi otomatis API key Gemini ----
# Daftar key dari DB (settings.ai.gemini_keys) + env GEMINI_API_KEY sebagai cadangan.
# Bila satu key kena limit harian (429/403/quota), otomatis coba key berikutnya.
_gemini_cursor = {"i": 0}

async def _gemini_keys(extra=None):
    doc = await db.settings.find_one({"_id": "ai"}) or {}
    keys = []
    seen = set()
    if extra:
        e = (extra or "").strip()
        if e:
            keys.append(e); seen.add(e)
    for k in (doc.get("gemini_keys") or []):
        k = (k or "").strip()
        if k and k not in seen:
            keys.append(k); seen.add(k)
    if GEMINI_API_KEY and GEMINI_API_KEY not in seen:
        keys.append(GEMINI_API_KEY)
    return keys

def _rotate_quota(status, text):
    t = (text or "").lower()
    return status in (429, 403) or (status == 400 and any(
        w in t for w in ("quota", "limit", "api key", "permission", "invalid key", "resource exhausted")))

app = FastAPI(title="Grand Aceh Kuliner POS")
api = APIRouter(prefix="/api")
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("gak-pos")

@api.get("/health")
@app.get("/health")
@app.get("/api/health")
async def health_check():
    return {
        "ok": True,
        "app": "gak-pos",
        "status": "ok",
        "app_name": "Grand Aceh Kuliner POS",
        "node_role": "Google Cloud Primary / PC Server Master",
        "time": datetime.now(timezone.utc).isoformat()
    }

class EvolutionHeartbeatIn(BaseModel):
    instance_name: Optional[str] = "grand-aceh-pos"
    status: Optional[str] = "connected"
    phone: Optional[str] = None
    local_url: Optional[str] = "http://localhost:8080"
    device_name: Optional[str] = "PC Server Toko (Local Master)"
    battery: Optional[int] = None
    node_source: Optional[str] = "local_pc"
    details: Optional[dict] = None

@api.post("/evolution/heartbeat")
async def evolution_receive_heartbeat(body: EvolutionHeartbeatIn):
    now_iso = datetime.now(timezone.utc).isoformat()
    doc = {
        "instance_name": body.instance_name or "grand-aceh-pos",
        "status": body.status or "connected",
        "phone": body.phone or "",
        "local_url": body.local_url or "http://localhost:8080",
        "device_name": body.device_name or "PC Server Toko (Local Master)",
        "battery": body.battery,
        "node_source": body.node_source or "local_pc",
        "details": body.details or {},
        "last_seen": now_iso,
        "updated_at": now_iso,
    }
    await db.settings.update_one({"_id": "evolution_heartbeat"}, {"$set": doc}, upsert=True)
    return {"ok": True, "message": "Heartbeat Evolution API berhasil dicatat", "timestamp": now_iso}

@api.get("/evolution/status")
async def evolution_get_status():
    doc = await db.settings.find_one({"_id": "evolution_heartbeat"}, {"_id": 0}) or {}
    last_seen_str = doc.get("last_seen")
    is_alive = False
    diff_sec = 999999
    if last_seen_str:
        try:
            ls = datetime.fromisoformat(last_seen_str.replace("Z", "+00:00"))
            diff_sec = (datetime.now(timezone.utc) - ls).total_seconds()
            is_alive = diff_sec <= 60  # Heartbeat aktif dalam 60 detik terakhir
        except Exception:
            pass

    return {
        "ok": True,
        "detected_on_pc": is_alive,
        "status": doc.get("status", "disconnected") if is_alive else "offline",
        "instance_name": doc.get("instance_name", "grand-aceh-pos"),
        "phone": doc.get("phone", ""),
        "local_url": doc.get("local_url", "http://localhost:8080"),
        "device_name": doc.get("device_name", "PC Server Toko"),
        "battery": doc.get("battery"),
        "last_seen": last_seen_str,
        "last_seen_seconds_ago": round(diff_sec, 1) if diff_sec < 999999 else None,
        "cloud_sync_active": True,
        "cloud_database_id": "ai-studio-grandposoptima-268f86d5-06a2-4402-8f77-90451ffce535"
    }

@api.get("/sync/ping")
async def sync_ping():
    t0 = time.perf_counter()
    db_ok = True
    try:
        await db.command("ping")
    except Exception:
        db_ok = False
    latency_db_ms = round((time.perf_counter() - t0) * 1000, 2)
    return {
        "ok": True,
        "role": "LOCAL_PC_SERVER_OR_PI",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "database_connected": db_ok,
        "db_latency_ms": latency_db_ms,
        "node_type": "hybrid_pos_node"
    }

@api.get("/sync/diagnostics")
async def sync_diagnostics():
    t0 = time.perf_counter()
    db_ok = True
    prod_count = 0
    order_count = 0
    try:
        await db.command("ping")
        prod_count = await db.products.count_documents({})
        order_count = await db.orders.count_documents({})
    except Exception:
        db_ok = False
    latency_ms = round((time.perf_counter() - t0) * 1000, 2)
    return {
        "ok": db_ok,
        "node": {
            "name": "PC Server / Raspberry Pi Local Engine",
            "type": "master_or_edge_node",
            "database": "MongoDB 7.x (Local Engine)",
            "db_status": "connected" if db_ok else "degraded",
            "db_latency_ms": latency_ms,
            "product_count": prod_count,
            "order_count": order_count,
        },
        "cloud_target": {
            "service": "Google Cloud Firestore",
            "database_id": "ai-studio-grandposoptima-268f86d5-06a2-4402-8f77-90451ffce535",
            "sync_protocol": "HTTPS / WebChannel / gRPC Stream"
        },
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }

PRODUCT_TYPES = ["makanan", "minuman", "retail"]
ORDER_TYPES = ["dine_in", "take_away", "retail"]

def now_utc():
    return datetime.now(timezone.utc)

WIB = timezone(timedelta(hours=7))
LOW_STOCK_THRESHOLD = 10

def wib_today():
    return now_utc().astimezone(WIB).strftime("%Y-%m-%d")

def wib_day_range(date_str):
    """Given a WIB calendar date 'YYYY-MM-DD', return (start_utc_iso, end_utc_iso)."""
    try:
        start = datetime.strptime(date_str, "%Y-%m-%d").replace(tzinfo=WIB)
    except (ValueError, TypeError):
        raise HTTPException(400, f"Tanggal tidak valid: '{date_str}'. Gunakan format YYYY-MM-DD.")
    end = start + timedelta(days=1)
    return start.astimezone(timezone.utc).isoformat(), end.astimezone(timezone.utc).isoformat()

def wib_day_of(iso_str):
    return datetime.fromisoformat(iso_str).astimezone(WIB).strftime("%Y-%m-%d")

def new_id():
    return str(uuid.uuid4())

def _order_pay_parts(o):
    """Bagian pembayaran order: 2 metode (payment_splits) atau 1 metode lama.
    Return [(nama, tipe, jumlah)]."""
    sp = o.get("payment_splits")
    if sp:
        out = []
        for x in sp:
            if not isinstance(x, dict):
                continue
            try:
                amt = round(float(x.get("amount") or 0), 2)
            except (TypeError, ValueError):
                amt = 0.0
            out.append((str(x.get("payment_method_name") or "?"),
                        str(x.get("payment_method_type") or ""), amt))
        return out or [(str(o.get("payment_method_name") or "?"),
                        str(o.get("payment_method_type") or ""), round(float(o.get("total") or 0), 2))]
    return [(str(o.get("payment_method_name") or "?"),
             str(o.get("payment_method_type") or ""), round(float(o.get("total") or 0), 2))]

def _cash_paid(o):
    """Total bagian tunai dari sebuah order (mendukung 2 metode)."""
    return sum(a for _, t, a in _order_pay_parts(o) if t == "cash")

# ------------------------------------------------------------------ Security
def _bcrypt_rounds():
    """Biaya bcrypt (default 11; di Pi cost 12 membuat login 400-900ms+).
    Hash lama dengan cost lain tetap valid (rounds tersimpan di hash)."""
    try:
        return max(8, min(15, int(os.environ.get("BCRYPT_ROUNDS", "11"))))
    except (TypeError, ValueError):
        return 11

def hash_password(p: str) -> str:
    return bcrypt.hashpw(p.encode(), bcrypt.gensalt(rounds=_bcrypt_rounds())).decode()

def verify_password(p: str, h: str) -> bool:
    try:
        return bcrypt.checkpw(p.encode(), h.encode())
    except Exception:
        return False

def create_token(user: dict) -> str:
    payload = {"sub": user["id"], "role": user["role"],
               "email": user.get("email") or user.get("username") or "",
               "exp": now_utc() + timedelta(hours=12), "type": "access"}
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALG)

async def get_current_user(request: Request) -> dict:
    auth = request.headers.get("Authorization", "")
    token = auth[7:] if auth.startswith("Bearer ") else request.cookies.get("access_token")
    if not token:
        raise HTTPException(401, "Not authenticated")
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG])
    except jwt.ExpiredSignatureError:
        raise HTTPException(401, "Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(401, "Invalid token")
    user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0, "password_hash": 0})
    if not user or not user.get("active", True):
        raise HTTPException(401, "User not found or inactive")
    return user

def _route_path(request):
    """Pola (template) path route yang cocok untuk request ini.

    PENTING: `request.scope` adalah DICT; route disimpan di kuncinya (`scope["route"]`,
    diisi FastAPI saat routing), BUKAN atribut — memakai getattr(...) di sini selalu
    menghasilkan None sehingga pemeriksaan modul RBAC diam-diam tidak pernah jalan.
    (Dulu: semua role non-admin selalu ditolak di endpoint require_admin, dan role
    kustom tidak pernah bisa mengakses endpoint modulnya sendiri.)"""
    scope = getattr(request, "scope", None) or {}
    route = scope.get("route") if isinstance(scope, dict) else getattr(scope, "route", None)
    return getattr(route, "path", "") or ""

def _mod_allowed(mod, allowed, path, method="GET"):
    """mod ada di daftar role, ATAU endpoint pendukung lintas-modul yang memang dipakai
    halaman bersama:
    - laporan ringkasan/rentang: dipakai Dashboard (role bermodul dashboard).
    - baca order (open bill) & master member: dipakai POS (role bermodul pos).
    - baca widget kustom: dipakai Dashboard.
    """
    if mod in allowed:
        return True
    p = str(path or "")
    m = (method or "GET").upper()
    if mod == "laporan" and p.rstrip("/").endswith(("/reports/summary", "/reports/range")) and "dashboard" in allowed:
        return True
    if m == "GET":
        if "/custom-widgets" in p and "dashboard" in allowed:
            return True
        if p.startswith("/api/orders") and "pos" in allowed:
            return True
        if p.startswith("/api/members") and "pos" in allowed:
            return True
    return False

async def _role_customized(role):
    """True bila role ini sudah diatur Super Admin di Roles & Izin (daftar izin penuh).
    Role bawaan yang belum disentuh tetap memakai perilaku lama (nama/base), supaya
    hak akses yang sudah berjalan di lapangan tidak berubah tanpa sengaja."""
    info = (await _rbac_doc()).get(str(role or ""))
    return bool(info and info.get("full"))

async def require_admin(request: Request, user: dict = Depends(get_current_user)) -> dict:
    """Admin ATAU role lain yang daftar izinnya (full custom) memuat modul route ini.

    PENTING: role `admin` kini JUGA bisa dibatasi Super Admin (Roles & Izin), jadi
    pemeriksaan modul di bawah berlaku untuk semua role — role yang belum dibatasi
    otomatis lolos karena daftar modulnya memang berisi SEMUA modul.
    """
    base, allowed = await _access(user.get("role") or "kasir")
    mod = _route_module(request)
    path = _route_path(request)
    if mod is None:
        # Route tanpa pemetaan modul (mis. /auth/*, /health): cukup role dasar admin.
        if base == "admin":
            return user
        raise HTTPException(403, "Admin access required")
    if _mod_allowed(mod, allowed, path, getattr(request, "method", "GET")):
        return user
    raise HTTPException(403, "Admin access required")

def require_roles(*roles):
    """Akses menulis utk role dasar tertentu.
    - Role yang SUDAH diatur di Roles & Izin (full custom) → modul route HARUS ada di
      daftarnya (termasuk role `admin` yang dibatasi Super Admin).
    - Role bawaan yang belum diatur → perilaku lama (nama/base) dipertahankan.
    Route tanpa pemetaan modul: fallback nama/base."""
    async def _dep(request: Request, user: dict = Depends(get_current_user)) -> dict:
        role = user.get("role") or "kasir"
        base, allowed = await _access(role)
        mod = _route_module(request)
        if mod:
            path = _route_path(request)
            if _mod_allowed(mod, allowed, path, getattr(request, "method", "GET")):
                return user
            if not await _role_customized(role) and (base == "admin" or role in roles or base in roles):
                return user
            raise HTTPException(403, "Akses ditolak untuk peran ini (modul tidak diizinkan role ini)")
        if base == "admin" or role in roles or base in roles:
            return user
        raise HTTPException(403, "Akses ditolak untuk peran ini")
    return _dep

def require_any_module(*mods):
    """Akses bila daftar izin role memuat salah satu mod yang diminta (admin yang belum
    dibatasi memiliki semua modul, jadi tetap lolos)."""
    async def _dep(request: Request, user: dict = Depends(get_current_user)) -> dict:
        base, allowed = await _access(user.get("role") or "kasir")
        if any(m in mods for m in allowed):
            return user
        raise HTTPException(403, "Akses ditolak untuk peran ini")
    return _dep

# ================================================================== RBAC DINAMIS
# Role & izin bisa dikustomisasi admin (Pengaturan → Roles & Izin) tanpa mengubah kode:
#   - role bawaan: admin (super), kasir, input — masing-masing punya modul dasar.
#   - role kustom: admin bisa membuat role baru dengan role dasar kasir/input + izin ekstra.
#   - izin = per MODUL; server memeriksa modul route (dari request.scope["route"].path)
#     lalu membandingkan dengan daftar izin role tsb. Data disimpan di settings._id="rbac".
BUILTIN_ROLES = ("superadmin", "admin", "kasir", "input", "input_pembayaran", "stok_opname")
RBAC_BASE_MODULES = {
    "superadmin": None,  # pemilik (owner) — semua modul
    "admin": None,  # None = semua modul
    "kasir": {"dashboard", "pos", "pengeluaran", "shift", "laporan", "ai", "reservasi",
              "settlement", "void"},
    "input": {"dashboard", "produk"},
    # Input Pembayaran: khusus mencatat pembayaran/pengeluaran kas
    "input_pembayaran": {"dashboard", "pengeluaran"},
    # Stok Opname: hitung stok bahan & produk retail (tanpa hak ubah master produk)
    "stok_opname": {"dashboard", "produk", "opname_bahan", "opname_produk"},
}
RBAC_MODULE_LABELS = {
    "dashboard": "Dashboard",
    "pos": "POS Kasir",
    "pengeluaran": "Pengeluaran & Kas",
    "shift": "Shift",
    "laporan": "Laporan",
    "ai": "AI / Asisten",
    "reservasi": "Reservasi Meja",
    "produk": "Produk, Kategori & Stok",
    "member": "Member & Poin",
    "promo": "Promo",
    "resep": "Resep & HPP",
    "kupon": "Kupon",
    "meja": "Manajemen Meja",
    "transaksi": "Riwayat Transaksi",
    "vendor": "Vendor",
    # "settlement" = pembayaran bagi hasil ke vendor (rekap harian + bukti pembayaran)
    "settlement": "Settlement Vendor (bagi hasil)",
    # "void" = pembatalan/refund transaksi (kasir boleh, hanya pada shift berjalan —
    #   koreksi lintas shift tetap hanya admin; lihat docs/RANCANGAN-VOID-PESANAN.md)
    "void": "Void & Refund (pembatalan transaksi)",
    # "pengguna" = KELOLA AKUN (daftar akun, buat, reset password, aktif/nonaktif).
    # "role_izin" = LIHAT daftar Role & Izin (read-only untuk role non-Super Admin);
    #   menyimpan/mengubah role tetap HANYA Super Admin (lihat require_superadmin).
    "pengguna": "Akun Pengguna",
    "role_izin": "Roles & Izin (lihat saja)",
    "whatsapp": "WhatsApp",
    "pengaturan": "Pengaturan Aplikasi/Platform",
    "belanja_bahan": "Pembelian Bahan & Daftar Belanja",
    "opname_bahan": "Stok Opname Bahan",
    "belanja_produk": "Belanja / Pembelian Produk Retail",
    "opname_produk": "Stok Opname Produk Retail",
    "superadmin": "Super Admin (Kelola Role & Izin)",
}
RBAC_PATH_MODULE = {
    "products": "produk", "categories": "produk", "inventory": "produk",
    "products/opname-bulk": "opname_produk", "products/{pid}/opname": "opname_produk",
    "purchases": "belanja_produk", "purchases/bulk": "belanja_produk", "stock-opname": "opname_produk",
    "recipes": "resep", "members": "member", "promos": "promo", "coupons": "kupon",
    "tables": "meja", "reservations": "reservasi", "orders": "transaksi",
    "vendors": "vendor", "users": "pengguna", "whatsapp": "whatsapp",
    # settlement pembayaran bagi hasil vendor (modul tersendiri, kasir boleh)
    "vendor-settlements": "settlement",
    # void/refund: modul tersendiri supaya kasir bisa membatalkan tanpa membuka riwayat transaksi
    "orders/{oid}/void": "void", "orders/{oid}/void-preview": "void", "voids": "void",
    # /settings/rbac → izin tersendiri (LIHAT Role & Izin) yang terpisah dari
    # "pengaturan" & "pengguna" — lihat GET /settings/rbac (require_rbac_view).
    "settings/rbac": "role_izin",
    "reports": "laporan", "ai": "ai", "shifts": "shift", "cash": "pengeluaran",
    "custom-widgets": "pengaturan", "settings": "pengaturan", "admin": "pengaturan",
    "update": "pengaturan", "rbac": "pengaturan", "features": "pengaturan",
    # Bahan: jalur per-aksi dipetakan ke izin granular (fallback = "produk" utk master).
    "ingredients/{iid}/purchase": "belanja_bahan",
    "ingredients/{iid}/opname": "opname_bahan",
    "ingredients": "produk", "ingredient-purchases": "belanja_bahan",
    "ingredient-opname": "opname_bahan", "shopping-list": "belanja_bahan",
    # master kategori bahan (dipakai membatasi opname bahan per akun) = kelola master bahan
    "ingredient-categories": "produk",
}
_rbac_cache = {"at": 0.0, "roles": None}

async def _rbac_doc(force=False):
    if force or _rbac_cache["roles"] is None or time.time() - _rbac_cache["at"] > 6:
        doc = await db.settings.find_one({"_id": "rbac"}, {"_id": 0}) or {}
        _rbac_cache["roles"] = doc.get("roles") or {}
        _rbac_cache["at"] = time.time()
    return _rbac_cache["roles"]

async def _access(role):
    """(role_dasar, set modul yang BOLEH diakses) — daftar PENUH (full custom).

    - superadmin           : semua modul, TIDAK BISA dibatasi (owner).
    - admin                : semua modul, TETAPI bisa dibatasi Super Admin
                             (bila settings rbac memuat admin dgn full:1 → persis
                             daftar perms-nya). Belum dikustomisasi = semua modul.
    - Role dgn flag full:1  : persis daftar `perms` yang disimpan super admin
                             (boleh kosong = role tanpa akses operasional).
    - Tanpa flag full      : migrasi lama → modul dasar role + izin ekstra lama,
                             supaya pengaturan sebelum fitur ini tetap berlaku.
    """
    role = str(role or "kasir")
    rbac = await _rbac_doc()
    info = rbac.get(role)
    if role == "superadmin" or (info and info.get("base") == "superadmin"):
        return "admin", _base_modules("superadmin")
    if role == "admin":
        if info and info.get("full"):
            return "admin", set(info.get("perms") or [])
        return "admin", _base_modules("admin")
    if role in BUILTIN_ROLES:
        if info and info.get("full"):
            return role, set(info.get("perms") or [])
        dflt = _base_modules(role) | set(info.get("perms") or []) if info else _base_modules(role)
        return role, dflt
    if info:
        base = info.get("base") if info.get("base") in BUILTIN_ROLES else "kasir"
        if info.get("full"):
            return base, set(info.get("perms") or [])
        dflt = _base_modules(base) | set(info.get("perms") or [])
        return base, dflt
    return "kasir", _base_modules("kasir")

def _route_module(request):
    """Modul (izin) untuk request saat ini berdasarkan route yang cocok."""
    path = _route_path(request)
    segs = [s for s in path.split("/") if s]
    if segs and segs[0] == "api":
        segs = segs[1:]
    if not segs:
        return None
    # /orders dipakai POS (kasir) & riwayat transaksi (admin) — bedakan per METHOD
    if segs[0] == "orders":
        m = (getattr(request, "method", "") or "GET").upper()
        # PENTING: jalur tiga-segmen khusus (mis. orders/{oid}/void) DIPERIKSA LEBIH DULU —
        # kalau tidak, cabang umum di bawah selalu menangkapnya sebagai "transaksi" sehingga
        # pemetaan modul void tak pernah terpakai.
        if len(segs) >= 3 and "/".join(segs[:3]) in RBAC_PATH_MODULE:
            return RBAC_PATH_MODULE["/".join(segs[:3])]
        if len(segs) == 1 and m == "POST":
            return "pos"                      # buat order di POS
        if len(segs) >= 2 and segs[-1] in ("items", "pay") and m in ("PATCH", "POST"):
            return "pos"                      # edit keranjang / bayar di POS
        return "transaksi"
    # izin granular utk aksi bahan per-bahan (purchase/opname) sebelum fallback induk
    if len(segs) >= 3 and "/".join(segs[:3]) in RBAC_PATH_MODULE:
        return RBAC_PATH_MODULE["/".join(segs[:3])]
    if len(segs) >= 2 and "/".join(segs[:2]) in RBAC_PATH_MODULE:
        return RBAC_PATH_MODULE["/".join(segs[:2])]
    return RBAC_PATH_MODULE.get(segs[0])

def _owner_identifiers():
    """Identitas akun pemilik (owner) dari env: ADMIN_EMAIL dan username turunannya."""
    email = (os.environ.get("ADMIN_EMAIL") or "").strip().lower()
    if not email:
        return set()
    return {email, email.split("@")[0]}

async def _is_super(role_or_user):
    """True bila: role bawaan 'superadmin', role kustom dgn dasar superadmin,
    ATAU akun itu sendiri adalah AKUN OWNER (ADMIN_EMAIL) — jaring pengaman supaya
    pemilik tidak pernah terkunci dari Pengaturan → Roles & Izin meskipun kolom
    role di database belum/tidak berisi superadmin."""
    role = role_or_user
    if isinstance(role_or_user, dict):
        ident = _owner_identifiers()
        if ident:
            uname = str(role_or_user.get("username") or "").lower()
            mail = str(role_or_user.get("email") or "").lower()
            if uname and uname in ident:
                return True
            if mail and mail in ident:
                return True
        role = role_or_user.get("role")
    role = str(role or "")
    if role == "superadmin":
        return True
    info = (await _rbac_doc()).get(role)
    return bool(info and info.get("base") == "superadmin")

async def _no_superadmin_exists():
    return not await db.users.find_one({"role": "superadmin"}, {"_id": 1})

# Jejak transaksi per-akun (dipakai aturan hapus akun: yang sudah punya riwayat hanya
# boleh DINONAKTIFKAN, tidak boleh dihapus permanen).
USER_HISTORY_COLLECTIONS = (
    ("orders", "cashier_id", "pesanan"),
    ("shifts", "cashier_id", "shift"),
    ("cash_movements", "cashier_id", "kas masuk/keluar"),
    ("audit_logs", "by_id", "catatan audit"),
)

async def _user_history(uid):
    counts, total = {}, 0
    for coll, field, label in USER_HISTORY_COLLECTIONS:
        try:
            n = await getattr(db, coll).count_documents({field: uid})
        except Exception:
            n = 0
        if n:
            counts[label] = n
            total += n
    return {"has_history": total > 0, "total": total, "counts": counts}

async def _super_accounts_count():
    """Jumlah akun Super Admin (termasuk akun owner dari env ADMIN_EMAIL)."""
    n = 0
    async for u in db.users.find({}, {"_id": 0, "role": 1, "email": 1, "username": 1}):
        if await _is_super(u):
            n += 1
    return n

async def _can_manage_roles(user):
    """Boleh mengatur Role & Izin bila: super admin/owner, ATAU (mode bootstrap)
    BELUM ADA superadmin sama sekali dan user ini admin — supaya pemilik tidak
    pernah terkunci permanen dari menu Roles & Izin."""
    if await _is_super(user):
        return True
    if str(user.get("role") or "") in ("admin", "superadmin") and await _no_superadmin_exists():
        return True
    return False

async def require_superadmin(user: dict = Depends(get_current_user)) -> dict:
    """Endpoint pengaturan Role & Izin — Super Admin/owner (atau mode bootstrap)."""
    if not await _can_manage_roles(user):
        raise HTTPException(403, "Hanya Super Admin (owner) yang boleh mengatur role & izin")
    return user

async def require_rbac_view(user: dict = Depends(get_current_user)) -> dict:
    """Boleh MELIHAT daftar Role & Izin (GET /settings/rbac).

    Terpisah dari modul "pengguna" (kelola akun) dan "pengaturan":
    - Super Admin/owner (pengelola) → boleh lihat & ubah.
    - Role yang diberi modul "role_izin" → boleh LIHAT saja (tanpa tombol Simpan).
    Menyimpan role (PUT /settings/rbac) tetap hanya require_superadmin.
    """
    if await _can_manage_roles(user):
        return user
    base, allowed = await _access(user.get("role") or "kasir")
    if "role_izin" in allowed:
        return user
    raise HTTPException(403, "Butuh izin 'Roles & Izin (lihat saja)' dari Super Admin")

@api.post("/settings/rbac/claim-superadmin")
async def claim_superadmin(user: dict = Depends(get_current_user)):
    """Angkat akun pemanggil menjadi Super Admin — HANYA bila belum ada Super Admin
    sama sekali (pemulihan mandiri saat owner terkunci).
    Sengaja TIDAK memakai require_admin: jalur penyelamat ini tidak boleh ikut
    terblokir bila modul role `admin` dibatasi (mis. tanpa modul "pengaturan")."""
    if await _is_super(user):
        return {"ok": True, "already": True, "role": user.get("role")}
    if not await _can_manage_roles(user):
        raise HTTPException(403, "Hanya akun admin/owner yang boleh mengangkat Super Admin")
    if not await _no_superadmin_exists():
        raise HTTPException(403, "Sudah ada Super Admin — minta Super Admin menaikkan role akun Anda di Pengaturan → Roles & Izin")
    await db.users.update_one({"id": user["id"]}, {"$set": {"role": "superadmin"}})
    logger.info(f"bootstrap: akun {user.get('username')} diangkat menjadi superadmin")
    return {"ok": True, "role": "superadmin"}

def _base_modules(base):
    """Daftar modul yang memang sudah dimiliki sebuah role dasar (bawaan)."""
    m = RBAC_BASE_MODULES.get(base)
    if m is None:
        return set(RBAC_MODULE_LABELS.keys())
    return set(m)

async def _valid_role_name(role):
    """Role valid = bawaan ATAU role kustom yang tersimpan di settings rbac."""
    if role in BUILTIN_ROLES:
        return role
    rbac = await _rbac_doc()
    return role if role in rbac else None

async def _user_view(u):
    """Tambahan role_base & perms utk dipakai frontend (gating menu/halaman).
    perms = daftar PENUH modul yang boleh diakses (full custom) — frontend tinggal cek
    include. Selalu buang _id (ObjectId tak serializable) & password_hash."""
    base, perms = await _access(u.get("role") or "kasir")
    role = u.get("role") or "kasir"
    info = (await _rbac_doc()).get(role)
    full = bool(info and info.get("full"))
    # password_plain = password terlihat (hanya Super Admin, lihat GET /users) — JANGAN
    # pernah ikut di respons /auth/me & /auth/login.
    out = {k: v for k, v in u.items() if k not in ("_id", "password_hash", "password_plain")}
    out["role_base"] = base
    out["perms_full"] = full or base == "admin"
    out["perms"] = sorted(perms)
    out["is_superadmin"] = await _can_manage_roles(u)
    out["bootstrap_owner"] = (not out["is_superadmin"]) and str(u.get("role")) == "admin" and await _no_superadmin_exists()
    out["username"] = u.get("username") or ""
    out["email"] = u.get("email") or ""
    # Wajib ganti password saat login pertama (mis. role Stok Opname) — dibaca frontend
    # di ProtectedRoute untuk menahan akses sampai password diganti.
    out["must_change_password"] = bool(u.get("must_change_password"))
    return out

@api.get("/rbac/my")
async def my_rbac(user: dict = Depends(get_current_user)):
    uv = await _user_view(user)
    return {"role": user.get("role"), "role_base": uv["role_base"],
            "perms_full": uv["perms_full"], "perms": uv["perms"],
            "is_superadmin": uv["is_superadmin"],
            # batas role yang boleh dibuat/ditugaskan admin (ditentukan Super Admin)
            "assignable": sorted(await _assignable_roles()) if not uv["is_superadmin"] else []}

@api.get("/settings/rbac")
async def get_rbac(user: dict = Depends(require_rbac_view)):
    """Daftar role & izin. Bisa dibaca Super Admin DAN role yang punya izin
    `role_izin` (lihat saja) — `can_manage` menandai siapa yang boleh menyimpan."""
    roles = await _rbac_doc(force=True)
    doc = await db.settings.find_one({"_id": "rbac"}, {"_id": 0}) or {}
    rbac_roles = doc.get("roles") or {}
    default_assignable = [r for r in BUILTIN_ROLES if r not in ("superadmin", "admin")] + \
                        [r for r in rbac_roles if r not in BUILTIN_ROLES]
    return {
        "roles": roles,
        "modules": [{"code": k, "label": v} for k, v in RBAC_MODULE_LABELS.items()],
        "base_defaults": {r: sorted(_base_modules(r)) for r in BUILTIN_ROLES},
        "builtin": list(BUILTIN_ROLES),
        # role yang boleh DIBUAT/DITUGASKAN oleh admin biasa (ditentukan super admin)
        "assignable": doc.get("assignable") if isinstance(doc.get("assignable"), list) else default_assignable,
        # hanya Super Admin/owner yang boleh MENYIMPAN (PUT) — sisanya lihat saja
        "can_manage": await _can_manage_roles(user),
    }

@api.put("/settings/rbac")
async def put_rbac(body: dict, admin: dict = Depends(require_superadmin)):
    """Simpan matriks role & izin. Body: {"roles": {nama_role: {base?, perms[]}}}.

    Role yang boleh diatur: semua role BAWAAN kecuali `superadmin` (owner tidak bisa
    dibatasi) — termasuk `admin` yang kini boleh dikurangi modulnya — dan role kustom.
    Role yang dihapus → penggunanya dikembalikan ke role dasar."""
    incoming = body.get("roles") if isinstance(body.get("roles"), dict) else {}
    old = await _rbac_doc(force=True)
    new = {}
    for name, info in incoming.items():
        if not isinstance(info, dict):
            continue
        name = str(name).strip()
        if not name or len(name) > 30:
            continue
        base = str(info.get("base") or "kasir")
        if base not in ("admin", "kasir", "input"):
            continue
        if name in ("superadmin", "admin"):
            # superadmin = owner, TIDAK BISA dibatasi. admin = boleh dibatasi, tapi
            # dasarnya tetap "admin" (agar label & hak dasarnya tidak berubah).
            if name == "superadmin":
                continue
            base = "admin"
        # FULL CUSTOM: perms = daftar PENUH modul yang boleh diakses role ini
        perms = set()
        rawp = info.get("perms") if isinstance(info.get("perms"), list) else []
        for p in rawp:
            if p in RBAC_MODULE_LABELS and p != "superadmin":
                perms.add(str(p))
        if name == "admin" and not perms:
            # Jangan biarkan satu pun modul tersisa 0 — akun admin akan terkunci total.
            raise HTTPException(400, "Role admin harus punya minimal 1 modul (biar akun admin tetap bisa masuk)")
        entry = {"base": base, "perms": sorted(perms), "full": True}
        new[name] = entry
    # hapus role yang tidak ada lagi
    removed = [r for r in old if r not in new and r not in BUILTIN_ROLES]
    for r in removed:
        base = (old[r] or {}).get("base") or "kasir"
        await db.users.update_many({"role": r}, {"$set": {"role": base}})
    upd = {"roles": new}
    if isinstance(body.get("assignable"), list):
        known = set(new.keys()) | set(BUILTIN_ROLES)
        assignable = [str(x) for x in body["assignable"] if str(x) in known and str(x) != "superadmin"]
        upd["assignable"] = assignable
    await db.settings.update_one({"_id": "rbac"}, {"$set": upd}, upsert=True)
    await _rbac_doc(force=True)
    return {"ok": True, "roles": new, "assignable": upd.get("assignable")}

async def _assignable_roles():
    """Daftar role yang boleh dibuat/ditugaskan admin biasa (super admin yg menentukan)."""
    doc = await db.settings.find_one({"_id": "rbac"}, {"_id": 0}) or {}
    if isinstance(doc.get("assignable"), list) and doc["assignable"]:
        return set(str(x) for x in doc["assignable"])
    rbac_roles = doc.get("roles") or {}
    return set([r for r in BUILTIN_ROLES if r not in ("superadmin", "admin")] +
               [r for r in rbac_roles if r not in BUILTIN_ROLES])

class RoleAssignIn(BaseModel):
    role: str

class UserIngCatsIn(BaseModel):
    """Kategori BAHAN yang boleh diisi akun ini (stok opname bahan).
    Daftar kosong = belum diatur → akun tidak boleh mengisi opname bahan apa pun."""
    categories: List[str] = []

admin_or_input = require_roles("admin", "input")
admin_or_kasir = require_roles("admin", "kasir")

# ------------------------------------------------------------------ Models
class LoginIn(BaseModel):
    # Akun tanpa email: login memakai USERNAME. `email` tetap diterima agar
    # aplikasi/APK versi lama (yang mengirim email) tidak langsung rusak.
    username: Optional[str] = None
    email: Optional[str] = None
    password: str

    def ident(self) -> str:
        return str(self.username or self.email or "").strip().lower()

class UserCreate(BaseModel):
    name: str
    username: str
    password: str
    role: str = "kasir"
    # None = bawaan (True: semua akun baru wajib ganti password saat login pertama),
    # bisa dimatikan per akun lewat PATCH /users/{uid}/must-change-password.
    must_change_password: Optional[bool] = None

class ChangePasswordIn(BaseModel):
    current_password: str
    new_password: str

class ResetPasswordIn(BaseModel):
    new_password: str
    must_change_password: Optional[bool] = None

class MustChangePasswordIn(BaseModel):
    value: bool

class ResetDataIn(BaseModel):
    scope: Literal["transactions", "all"]
    password: str

class CategoryIn(BaseModel):
    name: str
    type: Literal["makanan", "minuman", "retail", "vendor"]
    sort_order: int = 0
    active: bool = True

class ProductIn(BaseModel):
    name: str
    sku: str
    category_id: str
    type: Literal["makanan", "minuman", "retail", "vendor"]
    price: float
    cost: float = 0
    vendor_id: Optional[str] = None
    vendor_share_percent: Optional[float] = None
    description: Optional[str] = ""
    image: Optional[str] = ""
    active: bool = True
    sold_out: bool = False
    stock: Optional[int] = 0
    min_stock: Optional[int] = 10
    weight_sale: bool = False   # jual per berat (F&B): harga per satuan berat
    weight_unit: str = ""       # satuan berat: ons / gram / kg / porsi

class VendorIn(BaseModel):
    name: str
    contact: Optional[str] = ""
    note: Optional[str] = ""
    active: bool = True

class TableIn(BaseModel):
    name: str
    area: str = "Umum"
    capacity: int = 4
    active: bool = True

class ReservationIn(BaseModel):
    table_id: str
    customer_name: str
    phone: str = ""
    pax: int = Field(default=1, ge=1)
    date: str = ""          # YYYY-MM-DD
    time: str = ""          # HH:MM
    note: str = ""

class ReservationUpdateIn(BaseModel):
    status: Optional[Literal["pending", "confirmed", "arrived", "cancelled", "done"]] = None
    pax: Optional[int] = Field(default=None, ge=1)
    note: Optional[str] = None

class RecipeIn(BaseModel):
    product_id: str
    ingredients: List[dict] = []   # [{product_id (bahan), qty, unit?}]
    yield_units: float = 1         # berapa unit hasil produksi

class RecipeIngredientIn(BaseModel):
    product_id: str
    qty: float = Field(gt=0)
    unit: str = ""

class PaymentMethodIn(BaseModel):
    name: str
    type: Literal["cash", "qris", "card"]
    active: bool = True

class OrderItem(BaseModel):
    product_id: str
    name: Optional[str] = ""
    price: Optional[float] = 0
    qty: int = Field(gt=0)
    type: Optional[str] = ""
    weight: Optional[float] = None   # berat (untuk produk jual-per-berat)

class CouponIn(BaseModel):
    code: str
    type: Literal["percent", "amount"]
    value: float = Field(ge=0)
    max_uses: int = Field(default=0, ge=0)   # 0 = tak terbatas
    expires_at: Optional[str] = ""            # YYYY-MM-DD
    active: bool = True

class OrderIn(BaseModel):
    order_type: Literal["dine_in", "take_away", "retail"]
    table_id: Optional[str] = None
    items: List[OrderItem]
    discount_type: Literal["none", "percent", "amount"] = "none"
    discount_value: float = Field(0, ge=0)
    note: Optional[str] = ""
    pay_now: bool = False
    payment_method: Optional[str] = None
    amount_paid: Optional[float] = None   # utk bayar langsung (pay_now) sekali request
    client_ref: Optional[str] = None
    member_id: Optional[str] = None
    redeem_points: float = 0
    discount_reason: Optional[str] = None
    coupon_code: Optional[str] = None
    splits: Optional[List[dict]] = None  # 2 metode sekaligus: [{payment_method, amount}]

class ItemsUpdate(BaseModel):
    items: List[OrderItem]

class PayIn(BaseModel):
    payment_method: str
    discount_type: Literal["none", "percent", "amount"] = "none"
    discount_value: float = Field(0, ge=0)
    amount_paid: Optional[float] = None
    member_id: Optional[str] = None
    redeem_points: float = 0
    discount_reason: Optional[str] = None
    coupon_code: Optional[str] = None
    payment_ref: Optional[str] = None   # kunci idempotensi: retry jaringan yg sama tidak menggandakan pembayaran
    splits: Optional[List[dict]] = None  # 2 metode sekaligus: [{payment_method, amount}]

class VoidIn(BaseModel):
    reason: str
    action: Literal["void", "refund"] = "void"
    # Hanya admin: melepas blokir koreksi lintas shift secara sadar (tercatat di audit).
    force_cross_shift: bool = False
    force_note: Optional[str] = ""

class ShiftOpenIn(BaseModel):
    # SATU shift per toko per hari (F&B & Retail), dipakai bersama semua akun.
    # opening_cash (lama) = kas awal F&B bila opening_cash_fnb tidak dikirim.
    opening_cash: float = 0
    opening_cash_fnb: Optional[float] = None
    opening_cash_retail: Optional[float] = None

class ShiftCloseIn(BaseModel):
    # closing_cash (lama) = kas akhir F&B bila closing_cash_fnb tidak dikirim.
    closing_cash: float = 0
    closing_cash_fnb: Optional[float] = None
    closing_cash_retail: Optional[float] = None
    vendor_payments: Optional[List[dict]] = None  # [{vendor_id, paid}]
    # Uang transport: pengeluaran WAJIB saat tutup shift (tidak boleh 0), dibebankan ke F&B.
    # Bila tidak dikirim (perangkat/bundle lama) dipakai nominal dari Pengaturan → Aplikasi.
    transport: Optional[float] = None
    # Konfirmasi sadar bahwa memang tidak ada pengeluaran harian (F&B & Retail kosong).
    # Tanpa ini, tutup shift DITOLAK 400 supaya laporan tidak kehilangan keterangan belanja.
    ack_no_expense: bool = False
    # None = ikuti Pengaturan (bawaan AKTIF); False = jangan kirim WA kali ini; True = paksa kirim.
    send_shift_wa: Optional[bool] = None
    # Pengeluaran yang diisi LANGSUNG saat tutup shift (boleh juga diisi kapan saja
    # selama shift buka lewat halaman Pengeluaran & Kas).
    # [{scope: "fnb"|"retail", category, amount, note}]
    expenses: Optional[List[dict]] = None

class AIDescIn(BaseModel):
    name: str
    type: str
    category: Optional[str] = ""
    keywords: Optional[str] = ""

class AIImageIn(BaseModel):
    name: str
    description: Optional[str] = ""

class AISummaryIn(BaseModel):
    date: Optional[str] = None

# ------------------------------------------------------------------ helpers
def compute_totals(items, discount_type, discount_value):
    subtotal = sum(i["price"] * i["qty"] for i in items)
    discount_value = max(0, discount_value)
    if discount_type == "percent":
        discount = round(subtotal * (min(discount_value, 100) / 100.0), 2)
    elif discount_type == "amount":
        discount = min(discount_value, subtotal)
    else:
        discount = 0
    total = max(0, round(subtotal - discount, 2))
    return round(subtotal, 2), round(discount, 2), total

async def _apply_coupon(code, subtotal):
    """Validasi kupon & hitung diskon. Pemakaian (used_count) dihitung di _finalize_payment
    saat transaksi benar-benar lunas (agar retry/gagal bayar tidak menghabiskan kuota)."""
    if not code or not code.strip():
        return 0.0, ""
    c = await db.coupons.find_one({"code": code.strip().upper()}, {"_id": 0})
    if not c:
        raise HTTPException(400, f"Kupon '{code}' tidak ditemukan")
    if not c.get("active", True):
        raise HTTPException(400, f"Kupon '{c['code']}' sudah nonaktif")
    max_uses = int(c.get("max_uses") or 0)
    if max_uses > 0 and int(c.get("used_count") or 0) >= max_uses:
        raise HTTPException(400, f"Kupon '{c['code']}' sudah habis dipakai")
    exp = (c.get("expires_at") or "").strip()
    if exp and exp < wib_today():
        raise HTTPException(400, f"Kupon '{c['code']}' sudah kedaluwarsa")
    value = float(c.get("value") or 0)
    if c["type"] == "percent":
        d = round(subtotal * (min(value, 100) / 100.0), 2)
    else:
        d = min(value, subtotal)
    d = round(d, 2)
    return d, c["code"]

# ================================================================== PROMO & MEMBER (fitur baru)
async def _active_promos():
    return await db.promos.find({"active": True}, {"_id": 0}).to_list(100)

async def _apply_promos(items, subtotal, now=None):
    """Hitung diskon otomatis dari promo aktif. Return (promo_discount, [nama_promo])."""
    now = now or datetime.now(WIB)
    t = now.strftime("%H:%M")
    wd = now.weekday()  # 0=Senin..6=Minggu
    names = []
    d = 0.0
    for p in await _active_promos():
        try:
            days = p.get("days") or []
            if days and wd not in days:
                continue
            ptype = p.get("type")
            if ptype in ("percent", "happy_hour"):
                if ptype == "happy_hour":
                    st, en = p.get("start_time", ""), p.get("end_time", "")
                    if not (st and en) or not (st <= t <= en):
                        continue
                pct = min(float(p.get("value") or 0), 100)
                d += round(subtotal * pct / 100.0, 2)
                names.append(p.get("name"))
            elif ptype == "min_spend":
                if subtotal >= float(p.get("value") or 0):
                    bonus = float(p.get("bonus") or 0)
                    d += min(bonus, subtotal)
                    names.append(p.get("name"))
            elif ptype == "package":
                # paket: semua produk dalam paket harus ada di keranjang (cocokkan nama)
                pkg = p.get("package_items") or []
                ok = True
                for need in pkg:
                    nm = (need.get("product_name") or "").lower().strip()
                    q = int(need.get("qty") or 1)
                    if nm:
                        have = sum(i["qty"] for i in items if (i["name"] or "").lower().strip() == nm)
                        if have < q:
                            ok = False
                            break
                if ok:
                    bundle = float(p.get("value") or 0)
                    normal = 0.0
                    for need in pkg:
                        nm = (need.get("product_name") or "").lower().strip()
                        q = int(need.get("qty") or 1)
                        for i in items:
                            if (i["name"] or "").lower().strip() == nm:
                                normal += i["price"] * q
                                break
                    d += max(0.0, normal - bundle)
                    names.append(p.get("name"))
            elif ptype == "bogo":
                # beli N gratis 1 (produk sama, unit paling murah dihitung)
                buy = int(p.get("value") or 2)
                for it in items:
                    if it["qty"] >= buy + 1:
                        free = it["price"]
                        d += min(free, subtotal)
                        names.append(p.get("name"))
                        break
        except Exception:
            continue
    promo_discount = min(d, subtotal)
    return round(promo_discount, 2), names

# ================================================================== PENGATURAN APLIKASI (admin, tanpa kode)
BIZ_DEFAULTS = {
    "order_prefix": "GAK-",
    "labels": {"fnb": "F&B", "retail": "Retail"},
    "discount_reason_percent": 15,
    "discount_reason_amount": 50000,
    "member_earn_per_rupiah": 10000,   # 1 poin per RpX belanja
    "member_redeem_per_point": 100,     # 1 poin = RpX
    "low_stock_threshold": 10,
    "service_tax_percent": 0,           # pajak layanan opsional (%)
    # Uang transport saat TUTUP SHIFT: pengeluaran WAJIB (tidak boleh 0), dibebankan ke F&B.
    # Nilai ini = nominal bawaan yang terisi otomatis di form tutup shift.
    "transport_amount": 20000,
}

async def _business():
    if await _feat("perf.cache_master"):
        hit = _cache_get("biz")
        if hit is not None:
            return hit
    doc = await db.settings.find_one({"_id": "business"}, {"_id": 0}) or {}
    out = {}
    for k, v in BIZ_DEFAULTS.items():
        if k == "labels":
            out[k] = {**BIZ_DEFAULTS["labels"], **(doc.get("labels") or {})}
        else:
            out[k] = doc.get(k, v)
    if await _feat("perf.cache_master"):
        _cache_set("biz", out, 8.0)
    return out

async def _biz_val(key):
    return (await _business()).get(key)

# ================================================================== FEATURE FLAGS & OPS TERPUSAT (admin, tanpa deploy)
# Semua fitur berat/eksternal punya saklar di sini (default ON = perilaku lama).
# Dokumen: db.settings._id = "features". Dokumentasi: docs/ANALISIS-FITUR-PRIORITAS.md.
FEATURE_DEFAULTS = {
    "ai": {"enabled": True, "summary": True, "vision": True, "description": True, "image": True, "assistant": True},
    "wa": {"enabled": True},
    "ota": {"autocheck": True},
    "update": {"banner": True},
    "perf": {"cache_master": True, "cache_reports": True},
    # maint: cek data yatim mingguan (Minggu 04:00) + cek integritas mingguan (Minggu 03:00)
    "maint": {"orphan_auto": False, "orphan_hour": 4, "orphan_day": 6,
              "integrity_auto": False, "integrity_hour": 3, "integrity_day": 6},  # 0=Senin
    "webhook": {"enabled": False},
    "dbg": {"slowlog": False, "slowlog_ms": 1500, "metrics": True},
    "guard": {"breaker": True},
}

_feature_mem = {"at": 0.0, "doc": None}
FEATURE_CACHE_TTL = 3.0

def _merge_dict(base, over):
    out = dict(base)
    for k, v in (over or {}).items():
        if isinstance(v, dict) and isinstance(base.get(k), dict):
            out[k] = _merge_dict(base[k], v)
        else:
            out[k] = v
    return out

async def _features():
    """Merge default + tersimpan, dengan cache in-memory singkat (murah dipanggil per-request)."""
    import time as _t
    now = _t.time()
    if _feature_mem["doc"] is not None and (now - _feature_mem["at"]) < FEATURE_CACHE_TTL:
        return _feature_mem["doc"]
    doc = await db.settings.find_one({"_id": "features"}, {"_id": 0}) or {}
    merged = _merge_dict(FEATURE_DEFAULTS, doc)
    _feature_mem.update({"at": now, "doc": merged})
    return merged

async def _feat(path, default=None):
    """Baca satu flag bertitik, mis. _feat('ai.summary'), _feat('perf.cache_master')."""
    cur = await _features()
    for part in str(path).split("."):
        if isinstance(cur, dict) and part in cur:
            cur = cur[part]
        else:
            return default
    return cur

async def _invalidate_features():
    _feature_mem["doc"] = None

async def _feat_int(path, default):
    """Nilai fitur sebagai bilangan bulat.

    PENTING: 0 adalah nilai SAH (Senin = 0, jam 00:00 = 0) dan TIDAK boleh dianggap "kosong".
    Pola lama `int(await _feat(k, default) or default)` membuat jadwal hari Senin / jam 00:00
    diam-diam berubah jadi bawaan (Minggu 03:00) sehingga tugas terjadwal tidak pernah jalan.
    """
    v = await _feat(path, default)
    if v is None or v == "":
        return int(default)
    try:
        return int(v)
    except (TypeError, ValueError):
        return int(default)

FEATURE_LABELS = {
    "ai": "AI (Master)",
    "ai.summary": "AI — Analisis Laporan",
    "ai.vision": "AI — Baca Faktur (Vision)",
    "ai.description": "AI — Deskripsi Produk",
    "ai.image": "AI — Gambar Produk",
    "ai.assistant": "AI — Asisten",
    "wa": "WhatsApp",
    "ota.autocheck": "Pemeriksaan OTA otomatis (APK)",
    "update.banner": "Banner 'Versi Baru' di Dashboard",
    "perf.cache_master": "Cache data master (produk/kategori/metode)",
    "perf.cache_reports": "Cache laporan harian/periode",
    "maint.orphan_auto": "Cek data yatim otomatis (Minggu 04:00)",
    "maint.integrity_auto": "Cek integritas otomatis mingguan (Minggu 03:00)",
    "dbg.slowlog": "Log query lambat",
    "dbg.metrics": "Statistik performa endpoint",
    "guard.breaker": "Circuit breaker layanan luar (WA/AI/update)",
}

async def _ai_allowed(feature):
    """True bila AI master ON dan fitur AI tsb ON."""
    if not await _feat("ai.enabled"):
        return False
    return bool(await _feat(f"ai.{feature}", True))

# ---- Cache in-memory sederhana (master data + laporan; TTL pendek) -------------
_CACHE = {}          # key -> (expires, value)
_RCACHE = {}         # laporan: key -> (gen, expires, value)
_RS_GEN = 0          # bertambah saat data order berubah -> laporan ter-cache invalid

# Cache ini hidup di MEMORI TIAP PROSES. Sejak backend berjalan multi-worker, satu
# penulisan (mis. penjualan retail yang mengurangi stok) hanya membersihkan cache di
# proses yang menanganinya; proses lain masih menyajikan katalog basi sampai TTL (20 dtk).
# Karena itu setiap invalidasi lokal ditandai "kotor", lalu satu epoch bersama dinaikkan
# di MongoDB dan dipantau proses lain (poll 2 dtk) — proses yang melihat epoch berubah
# membersihkan cache lokalnya sendiri. Batas basi turun dari ~20 dtk menjadi ~2 dtk.
# (Jalur uang TIDAK bergantung pada cache: validasi stok & harga selalu baca MongoDB.)
_CACHE_DIRTY = False
_CACHE_EPOCH_SEEN = None
_CACHE_EPOCH_DOC = "cache"
CACHE_SYNC_SECONDS = 2.0

def _cache_get(key):
    e = _CACHE.get(key)
    if e is None:
        return None
    if e[0] < __import__("time").time():
        _CACHE.pop(key, None)
        return None
    return e[1]

def _cache_set(key, value, ttl=20.0):
    import time as _t
    _CACHE[key] = (_t.time() + ttl, value)

def _cache_del(prefix=""):
    global _CACHE_DIRTY
    for k in [k for k in _CACHE if k.startswith(prefix)]:
        _CACHE.pop(k, None)
    _CACHE_DIRTY = True

def _cache_clear_local():
    """Buang seluruh cache proses ini (dipakai saat worker lain menulis data)."""
    _CACHE.clear()
    _RCACHE.clear()

async def _cache_sync():
    """Tandai & sebarkan invalidasi cache antar-worker (dipanggil berkala multi-worker).

    Hanya dijalankan saat WORKERS > 1: satu proses cukup mengandalkan _cache_del langsung.
    """
    global _CACHE_DIRTY, _CACHE_EPOCH_SEEN
    if _CACHE_DIRTY:
        try:
            await db.settings.update_one({"_id": _CACHE_EPOCH_DOC}, {"$inc": {"epoch": 1}}, upsert=True)
            _CACHE_DIRTY = False          # hanya dianggap selesai bila penulisan berhasil
        except Exception as e:
            logger.debug(f"cache epoch bump failed: {e}")
    try:
        doc = await db.settings.find_one({"_id": _CACHE_EPOCH_DOC}, {"epoch": 1}) or {}
        ep = int(doc.get("epoch") or 0)
        if _CACHE_EPOCH_SEEN is None:
            _CACHE_EPOCH_SEEN = ep        # pertama kali: belum ada yang perlu dibuang
        elif ep != _CACHE_EPOCH_SEEN:
            _CACHE_EPOCH_SEEN = ep
            _cache_clear_local()
            logger.info("cache lokal dibersihkan (worker lain menulis data)")
    except Exception as e:
        logger.debug(f"cache epoch read failed: {e}")

def _rcache_get(key):
    import time as _t
    e = _RCACHE.get(key)
    if e is None:
        return None
    gen, exp, val = e
    if gen != _RS_GEN or exp < _t.time():
        _RCACHE.pop(key, None)
        return None
    return val

def _rcache_set(key, value, ttl=3600.0):
    import time as _t
    _RCACHE[key] = (_RS_GEN, _t.time() + ttl, value)

def _bump_rs_gen():
    global _RS_GEN, _CACHE_DIRTY
    _RS_GEN += 1
    _CACHE_DIRTY = True

async def _cached(key, ttl, builder, flag="perf.cache_master"):
    """Generic read-through cache. Flag mati -> selalu bangun ulang."""
    if await _feat(flag):
        hit = _cache_get(key)
        if hit is not None:
            return hit
        val = await builder()
        _cache_set(key, val, ttl)
        return val
    return await builder()

# ---- Circuit breaker layanan eksternal (WA/AI/update center) -------------------
_BREAKERS = {}       # name -> {"fails": int, "open_until": float}
_BREAK_MAX_FAILS = 3
_BREAK_COOLDOWN = 30.0

async def _breaker_check(name):
    if not await _feat("guard.breaker"):
        return
    b = _BREAKERS.get(name)
    if not b:
        return
    import time as _t
    if b["open_until"] and _t.time() < b["open_until"]:
        raise HTTPException(503, f"Layanan {name} sedang gangguan — dicoba lagi otomatis beberapa saat lagi.")
    if b["open_until"]:  # masa cooldown habis -> setengah terbuka, reset
        _BREAKERS[name] = {"fails": 0, "open_until": 0.0}

def _breaker_success(name):
    b = _BREAKERS.get(name)
    if b:
        b["fails"] = 0
        b["open_until"] = 0.0

def _breaker_fail(name):
    import time as _t
    b = _BREAKERS.setdefault(name, {"fails": 0, "open_until": 0.0})
    b["fails"] += 1
    if b["fails"] >= _BREAK_MAX_FAILS:
        b["open_until"] = _t.time() + _BREAK_COOLDOWN
        logger.warning(f"circuit breaker '{name}' terbuka selama {_BREAK_COOLDOWN}s ({b['fails']} gagal berturut-turut)")

def _breaker_status():
    import time as _t
    out = {}
    for name, b in _BREAKERS.items():
        out[name] = {"open": bool(b.get("open_until") and b["open_until"] > _t.time()),
                     "fails": b.get("fails", 0)}
    return out

# ---- Metrik endpoint & slow query log (ring buffer in-memory) ------------------
_PROC_START = __import__("time").time()
_METRICS = {"total": 0, "errors": 0, "total_ms": 0.0, "by_path": {}, "slow": []}

async def _slowlog_threshold():
    try:
        return float(await _feat("dbg.slowlog_ms") or 1500)
    except Exception:
        return 1500.0

def _metric_record(method, path, ms, status):
    import time as _t
    m = _METRICS
    m["total"] += 1
    m["total_ms"] += ms
    if status >= 400:
        m["errors"] += 1
    seg = path.split("/api/")[-1].split("/")[0] if "/api/" in path else path
    key = f"{method} /api/{seg}"
    p = m["by_path"].setdefault(key, {"count": 0, "ms": 0.0, "errors": 0})
    p["count"] += 1
    p["ms"] += ms
    if status >= 400:
        p["errors"] += 1

# ---- Metrik lintas worker -------------------------------------------------------
# Angka _METRICS hidup di memori SATU proses. Sejak backend berjalan multi-worker
# (uvicorn --workers), endpoint /admin/metrics harus menjumlah angka SEMUA worker —
# kalau tidak, halaman metrik menampilkan sebagian kecil trafik dan seolah "tidak ada
# error / semua cepat" hanya karena request kebetulan dilayani worker yang lengang.
_METRICS_DOC_PREFIX = "metrics_process:"
# Penanda asal dokumen = hostname container (Docker menyetelnya ke id container).
# WAJIB dipakai saat menjumlahkan: dokumen metrik hidup di database dan proses lama
# (container yang dibuat ulang saat update) heartbeats-nya masih "segar" beberapa detik
# sehingga ikut terhitung sebagai worker hantu (0 request) — pernah terjadi: dipakai
# melaporkan "3 worker" padahal hanya 2 yang hidup. Dengan penanda ini hanya worker
# dari container YANG SAMA yang dijumlahkan.
_METRICS_NODE = os.uname().nodename

def _metrics_snapshot():
    m = _METRICS
    return {
        "total": m["total"], "errors": m["errors"], "total_ms": round(m["total_ms"], 1),
        "by_path": {k: {"count": v["count"], "ms": round(v["ms"], 1), "errors": v["errors"]}
                    for k, v in m["by_path"].items()},
        "slow": list(m["slow"]),
        "pid": os.getpid(), "workers": WORKERS, "at": now_utc().isoformat(),
        "node": _METRICS_NODE,
    }

_metrics_flush_tick = 0
# Interval tulis ringkasan metrik. Dulu 5 dtk: dengan 2 worker itu ~2.900 tulis/jam
# ke MongoDB yang berada di KARTU SD — tulis kecil yang terus-menerus seperti itu
# menambah keausan kartu dan menyaingi I/O database (yang justru jadi bottleneck Pi).
# 15 dtk sudah jauh lebih halus daripada interval apa pun yang dipakai untuk membaca
# halaman metrik, jadi ketelitian angkanya tidak berkurang.
METRICS_FLUSH_SECONDS = 15.0
# Ringkasan worker dianggap masih hidup bila heartbeat-nya lebih muda dari ini
# (harus > METRICS_FLUSH_SECONDS; dipakai agar worker yang sempat lengang tidak
# tiba-tiba hilang dari penjumlahan).
METRICS_STALE_SECONDS = 45.0

async def _metrics_flush():
    """Tulis ringkasan proses ini ke Mongo (khusus multi-worker)."""
    global _metrics_flush_tick
    if WORKERS <= 1:
        return
    try:
        await db.settings.update_one({"_id": f"{_METRICS_DOC_PREFIX}{os.getpid()}"},
                                     {"$set": _metrics_snapshot()}, upsert=True)
        _metrics_flush_tick += 1
        if _metrics_flush_tick % 40 == 0:   # tiap ~10 menit: bersihkan jejak proses yang sudah mati
            cutoff = (now_utc() - timedelta(hours=1)).isoformat()
            await db.settings.delete_many({"_id": {"$regex": f"^{_METRICS_DOC_PREFIX}"}, "at": {"$lt": cutoff}})
            # Dokumen dari container LAIN tidak akan pernah dihitung lagi (lihat filter node),
            # jadi cukup disimpan sebentar untuk keperluan pemeriksaan, lalu dibuang.
            lama = (now_utc() - timedelta(minutes=10)).isoformat()
            await db.settings.delete_many({"_id": {"$regex": f"^{_METRICS_DOC_PREFIX}"},
                                           "node": {"$ne": _METRICS_NODE}, "at": {"$lt": lama}})
    except Exception as e:
        logger.debug(f"metrics flush failed: {e}")

async def _metrics_aggregate():
    """Jumlahkan metrik semua worker DI CONTAINER INI yang heartbeat-nya masih segar."""
    local = _metrics_snapshot()
    mine = int(local["pid"])
    docs = []
    try:
        cutoff = (now_utc() - timedelta(seconds=METRICS_STALE_SECONDS)).isoformat()
        docs = [d async for d in db.settings.find({"_id": {"$regex": f"^{_METRICS_DOC_PREFIX}"},
                                                  "node": _METRICS_NODE,
                                                  "at": {"$gte": cutoff}})]
    except Exception:
        docs = []
    merged = {"total": 0, "errors": 0, "total_ms": 0.0, "by_path": {}, "slow": [], "nodes": []}
    for d in docs + [local]:               # proses ini selalu ikut, dokumennya sendiri dilewati
        if docs and d is not local and int(d.get("pid") or 0) == mine:
            continue
        merged["total"] += int(d.get("total") or 0)
        merged["errors"] += int(d.get("errors") or 0)
        merged["total_ms"] += float(d.get("total_ms") or 0)
        for k, v in (d.get("by_path") or {}).items():
            p = merged["by_path"].setdefault(k, {"count": 0, "ms": 0.0, "errors": 0})
            p["count"] += int(v.get("count") or 0)
            p["ms"] += float(v.get("ms") or 0)
            p["errors"] += int(v.get("errors") or 0)
        merged["slow"] += list(d.get("slow") or [])
        merged["nodes"].append({"pid": d.get("pid"), "total": int(d.get("total") or 0),
                                "errors": int(d.get("errors") or 0), "at": d.get("at")})
    merged["slow"] = sorted(merged["slow"], key=lambda x: str((x or {}).get("at", "")), reverse=True)[:20]
    merged["nodes"].sort(key=lambda n: -n["total"])
    return merged

async def _record_slow_if_needed(method, path, ms):
    try:
        if not await _feat("dbg.slowlog"):
            return
        thr = await _slowlog_threshold()
        if ms >= thr:
            _METRICS["slow"].append({"at": datetime.now(WIB).strftime("%H:%M:%S"),
                                     "method": method, "path": path, "ms": round(ms, 0)})
            _METRICS["slow"] = _METRICS["slow"][-20:]
            logger.warning(f"SLOW {method} {path} {ms:.0f}ms")
    except Exception:
        pass

# ---- Webhook keluar (integrasi pihak ketiga) -----------------------------------
WEBHOOK_DEFAULTS = {"enabled": False, "url": "", "secret": "", "events": [], "last": None}

async def _webhook_cfg():
    doc = await db.settings.find_one({"_id": "webhook"}, {"_id": 0}) or {}
    out = dict(WEBHOOK_DEFAULTS)
    for k in out:
        if k in doc:
            out[k] = doc[k]
    return out

def _webhook_sign(body: bytes, secret: str):
    import hmac, hashlib
    if not secret:
        return ""
    return "sha256=" + hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()

async def _fire_webhook(event, payload, force=False):
    """Kirim event ke URL webhook (fire-and-forget). Catat status terakhir di settings."""
    import httpx
    try:
        cfg = await _webhook_cfg()
        if not (cfg.get("url") or "").strip():
            return
        if not force and not (cfg.get("enabled") and event in (cfg.get("events") or [])):
            return
        url = str(cfg.get("url") or "").strip()
        body = {"event": event, "at": now_utc().isoformat(), "data": payload}
        raw = __import__("json").dumps(body, ensure_ascii=False, default=str).encode("utf-8")
        sig = _webhook_sign(raw, str(cfg.get("secret") or ""))
        headers = {"Content-Type": "application/json"}
        if sig:
            headers["X-Gak-Webhook-Signature"] = sig
        try:
            async with httpx.AsyncClient(timeout=6) as c:
                r = await c.post(url, content=raw, headers=headers)
            ok = r.status_code < 400
            last = {"ok": ok, "event": event, "at": now_utc().isoformat(),
                    "status": r.status_code, "error": "" if ok else r.text[:200]}
        except Exception as e:
            last = {"ok": False, "event": event, "at": now_utc().isoformat(), "status": 0, "error": str(e)[:200]}
        await db.settings.update_one({"_id": "webhook"}, {"$set": {"last": last}}, upsert=True)
    except Exception as e:
        logger.error(f"webhook {event} gagal: {e}")

# ---- Pemeriksaan data yatim (orphan records) -----------------------------------
async def _run_orphan_check():
    """Cek referensi putus antar koleksi. Aman: read-only, proyeksi minimal."""
    cat_ids = {c["id"] for c in await db.categories.find({}, {"id": 1}).to_list(5000)}
    prod_ids = {p["id"] for p in await db.products.find({}, {"id": 1}).to_list(20000)}
    prod_by_id = {p["id"]: p for p in await db.products.find({}, {"id": 1, "name": 1, "category_id": 1, "vendor_id": 1}).to_list(20000)}
    ven_ids = {v["id"] for v in await db.vendors.find({}, {"id": 1}).to_list(2000)}
    tab_ids = {t["id"] for t in await db.tables.find({}, {"id": 1}).to_list(2000)}
    shift_ids = {s["id"] for s in await db.shifts.find({}, {"id": 1}).to_list(5000)}
    rec_ids = {r["id"] for r in await db.recipes.find({}, {"id": 1}).to_list(5000)}

    res = []

    def add(name, count, samples, note=""):
        res.append({"name": name, "count": count, "samples": samples[:5], "note": note})

    # 1) Produk -> kategori hilang
    miss = [p["name"] for p in prod_by_id.values()
            if p.get("category_id") and p["category_id"] not in cat_ids]
    add("Produk dengan kategori hilang", len(miss), miss, "Kategori terhapus tapi produk masih menunjuknya. Produk tersembunyi dari katalog.")

    # 2) Produk -> vendor hilang
    miss = [p["name"] for p in prod_by_id.values()
            if p.get("vendor_id") and p["vendor_id"] not in ven_ids]
    add("Produk dengan vendor hilang", len(miss), miss, "Vendor titipan terhapus. Periksa bagi hasil & penjualan produk ini.")

    # 3) Item order -> produk hilang (produk tak pernah di-hard-delete jika terpakai; muncul bila restore parsial)
    broken = {}
    for o in await db.orders.find({}, {"id": 1, "order_number": 1, "items": 1}).to_list(50000):
        for it in (o.get("items") or []):
            if it.get("product_id") and it["product_id"] not in prod_ids:
                broken.setdefault(it.get("product_id"), {"qty": 0, "orders": set()})
                broken[it["product_id"]]["qty"] += it.get("qty", 0)
                broken[it["product_id"]]["orders"].add(o.get("order_number", "?"))
    add("Item order dengan produk hilang", len(broken),
        [f"produk {pid} ({len(v['orders'])} order)" for pid, v in list(broken.items())[:5]],
        "Laba & laporan produk terdampak.")

    # 4) Order dine-in -> meja hilang
    miss = (await db.orders.count_documents({"order_type": "dine_in", "table_id": {"$nin": list(tab_ids) + [None, ""]}})) if tab_ids else 0
    add("Order dine-in dengan meja hilang", miss, [], "Meja dine-in harus selalu menunjuk meja yang ada.")

    # 5) Order -> shift hilang (shift_id kosong/null = transaksi tanpa shift terbuka → bukan yatim)
    miss = (await db.orders.count_documents({"shift_id": {"$nin": list(shift_ids) + [None, ""]}})) if shift_ids else 0
    add("Order dengan shift hilang", miss, [], "Laporan shift tidak lengkap.")

    # 6) Kas keluar/masuk -> shift hilang
    miss = (await db.cash_movements.count_documents({"shift_id": {"$nin": list(shift_ids) + [None, ""]}})) if shift_ids else 0
    add("Catatan kas dengan shift hilang", miss, [], "Kas tidak masuk hitungan shift.")

    # 7) Reservasi -> meja hilang
    miss = (await db.reservations.count_documents({"table_id": {"$nin": list(tab_ids) + [None, ""]}})) if tab_ids else 0
    add("Reservasi dengan meja hilang", miss, [], "Meja yang direservasi sudah dihapus.")

    # 8) Resep -> produk hilang / bahan hilang
    miss = 0
    for r in await db.recipes.find({}, {"product_id": 1, "ingredients": 1}).to_list(5000):
        if r.get("product_id") not in prod_ids:
            miss += 1
        for b in (r.get("ingredients") or []):
            if b.get("product_id") and b["product_id"] not in prod_ids:
                miss += 1
    add("Resep dengan produk/bahan hilang", miss, [], "HPP otomatis tidak akurat.")

    result = {"at": now_utc().isoformat(), "results": res}
    await db.settings.update_one({"_id": "orphan"}, {"$set": {"last": result}}, upsert=True)
    return result

async def _maybe_orphan_auto():
    """Jadwal: 1× per minggu (default Minggu 04:00) bila flag maint.orphan_auto ON."""
    if not await _feat("maint.orphan_auto"):
        return
    try:
        noww = datetime.now(WIB)
        hour = int(await _feat("maint.orphan_hour", 4))
        day = int(await _feat("maint.orphan_day", 6))
        if not (noww.hour == hour and noww.weekday() == day):
            return
        today = wib_today()
        # Klaim atomik: cek yatim itu berat & hanya boleh jalan sekali per hari,
        # walau scheduler hidup di beberapa proses worker sekaligus.
        if not await _claim_once("orphan", "auto_date", today, stale_seconds=3600):
            return
        try:
            await _run_orphan_check()
        except Exception:
            await _release_claim("orphan", "auto_date")
            raise
        logger.info("orphan check otomatis mingguan selesai")
    except Exception as e:
        logger.error(f"orphan auto check failed: {e}")

async def _service_tax(net_total):
    """Pajak layanan opsional (%) — dibebankan di atas total bersih (setelah semua diskon)."""
    biz = await _business()
    rate = float(biz.get("service_tax_percent") or 0)
    if rate <= 0 or net_total <= 0:
        return rate if rate else 0.0, 0.0
    return rate, round(net_total * rate / 100.0, 2)

async def _discount_needs_reason(discount_type, discount_value, subtotal):
    biz = await _business()
    if discount_type == "percent":
        return discount_value > float(biz.get("discount_reason_percent") or 15)
    if discount_type == "amount":
        return discount_value > float(biz.get("discount_reason_amount") or 50000)
    return False

async def _apply_redeem(member_id, redeem_points, total_before):
    """Validasi & hitung potongan poin member (1 poin = Rp100).
    Poin baru benar-benar dipotong di _finalize_payment saat pembayaran sukses."""
    if not member_id or not redeem_points or redeem_points <= 0:
        return 0.0, None
    m = await db.members.find_one({"id": member_id})
    if not m:
        raise HTTPException(400, "Member tidak ditemukan")
    pts = float(m.get("points") or 0)
    if redeem_points > pts:
        raise HTTPException(400, f"Poin member tidak cukup (sisa {pts:,.0f})")
    rate = float((await _business()).get("member_redeem_per_point") or 100)
    value = round(redeem_points * rate, 2)
    value = min(value, total_before)
    return value, m

async def _award_member_points(order):
    """Setelah order lunas, tambah poin & total belanja member + kirim notifikasi WA."""
    mid = order.get("member_id")
    if not mid:
        return
    m = await db.members.find_one({"id": mid})
    if not m:
        return
    earn_rp = float((await _business()).get("member_earn_per_rupiah") or 10000)
    redeem_rp = float((await _business()).get("member_redeem_per_point") or 100)
    pts = int(order.get("total", 0) // earn_rp) if earn_rp > 0 else 0
    if pts <= 0:
        return
    await db.members.update_one({"id": mid}, {"$inc": {"points": pts, "total_spend": order.get("total", 0)}})
    await db.orders.update_one({"id": order["id"]}, {"$set": {"points_earned": pts}})
    phone = m.get("phone", "")
    if phone and await _wa_configured():
        try:
            await _send_whatsapp([phone],
                f"*Grand Aceh Kuliner*\nTerima kasih sudah berbelanja!\nTotal: Rp{order.get('total',0):,.0f}\nPoin +{pts} (total poin {float(m.get('points') or 0)+pts:,.0f})\nTukarkan poin 1pt=Rp{redeem_rp:,.0f} saat pembayaran.")
        except Exception:
            pass

async def gen_order_number():
    import re as _re
    prefix = str((await _business()).get("order_prefix") or "GAK-").strip() or "GAK-"
    today = wib_today().replace("-", "")
    cid = f"order-{today}"
    # migration-safe init: seed counter from any orders already created today
    if not await db.counters.find_one({"_id": cid}):
        cnt = await db.orders.count_documents({"order_number": {"$regex": f"^{_re.escape(prefix)}{today}-"}})
        await db.counters.update_one({"_id": cid}, {"$setOnInsert": {"seq": cnt}}, upsert=True)
    doc = await db.counters.find_one_and_update(
        {"_id": cid}, {"$inc": {"seq": 1}}, return_document=ReturnDocument.AFTER
    )
    return f"{prefix}{today}-{doc['seq']:04d}"

# ================================================================== AUTH
def _hash_cost(h):
    """Cost bcrypt dari string hash ("$2b$12$...") → int; None bila tak terurai."""
    try:
        return int(str(h or "").split("$")[2])
    except (IndexError, ValueError):
        return None

USERNAME_RE = re.compile(r"^[a-z0-9._-]{3,32}$")

def _slug_username(src: str, taken=None):
    """Turunkan username aman dari teks (mis. bagian depan email)."""
    base = re.sub(r"[^a-z0-9._-]+", "", str(src or "").strip().lower())[:24] or "user"
    base = base.strip("._-") or "user"
    if len(base) < 3:
        base = (base + "user")[:32]
    taken = taken or set()
    if base not in taken:
        return base
    i = 2
    while f"{base}{i}" in taken and i < 500:
        i += 1
    return f"{base}{i}"

@api.post("/auth/login")
async def login(body: LoginIn):
    ident = body.ident()
    if not ident:
        raise HTTPException(400, "Username wajib diisi")
    user = await db.users.find_one({"$or": [{"username": ident}, {"email": ident}]})
    if not user or not verify_password(body.password, user["password_hash"]):
        raise HTTPException(401, "Username atau password salah")
    # Transparan re-hash bila hash lama memakai cost lebih tinggi (login lebih cepat).
    # Hash lama cost 12 (default lama) membuat login 400-900ms+ di Pi; cost 11 ±2x lebih cepat.
    try:
        hc = _hash_cost(user.get("password_hash"))
        if hc is not None and hc > _bcrypt_rounds():
            await db.users.update_one({"id": user["id"]},
                                      {"$set": {"password_hash": hash_password(body.password)}})
    except Exception:
        pass
    if not user.get("active", True):
        raise HTTPException(403, "Akun dinonaktifkan")
    safe = {"id": user["id"], "name": user["name"], "email": user["email"], "role": user["role"]}
    uv = await _user_view(user)
    uv["id"], uv["name"], uv["email"], uv["role"] = user["id"], user["name"], user["email"], user["role"]
    return {"token": create_token(safe), "user": uv}

@api.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    return await _user_view(user)

@api.get("/users")
async def list_users(user: dict = Depends(require_admin)):
    """Daftar akun. Hanya Super Admin yang menerima kolom `password` (password terlihat,
    direkam saat akun dibuat / password direset — lihat create_user & reset_user_password).
    Akun lama (dibuat sebelum fitur ini) tidak punya rekaman → `password` kosong."""
    is_super = await _is_super(user)
    q = {} if is_super else {"role": {"$ne": "superadmin"}}
    rows = await db.users.find(q, {"_id": 0, "password_hash": 0}).sort("created_at", 1).to_list(500)
    out = []
    for u in rows:
        plain = u.pop("password_plain", None)
        u.pop("_id", None)
        if is_super:
            u["password"] = plain or ""
        out.append(u)
    return out

@api.post("/users")
async def create_user(body: UserCreate, user: dict = Depends(require_admin)):
    role = body.role.strip() or "kasir"
    if not await _valid_role_name(role):
        raise HTTPException(400, f"Role '{role}' tidak dikenal — minta Super Admin membuatnya di Pengaturan → Roles & Izin")
    is_super = await _is_super(user)
    # Admin biasa HANYA boleh membuat akun dengan role yang diizinkan Super Admin.
    if not is_super:
        allowed = await _assignable_roles()
        if role not in allowed:
            raise HTTPException(403, f"Role '{role}' tidak boleh dibuat oleh admin — hanya Super Admin yang menentukan daftar role akun")
    uname = (body.username or "").strip().lower()
    if not USERNAME_RE.match(uname):
        raise HTTPException(400, "Username 3-32 karakter, hanya huruf kecil/angka/titik/garis bawah/minus (tanpa spasi)")
    if await db.users.find_one({"username": uname}):
        raise HTTPException(400, f"Username '{uname}' sudah dipakai")
    if not (body.name or "").strip():
        raise HTTPException(400, "Nama wajib diisi")
    forced = True if body.must_change_password is None else bool(body.must_change_password)
    doc = {"id": new_id(), "name": body.name.strip(), "username": uname, "email": "",
           "password_hash": hash_password(body.password),
           # password terlihat (hanya dikirim ke Super Admin lewat GET /users)
           "password_plain": body.password,
           "must_change_password": forced,
           "role": role,
           "active": True, "created_at": now_utc().isoformat(), "created_by": user.get("username") or user.get("name")}
    await db.users.insert_one(doc)
    return {"id": doc["id"], "name": doc["name"], "username": doc["username"], "role": doc["role"],
            "must_change_password": forced}

@api.patch("/users/{uid}/role")
async def set_user_role(uid: str, body: RoleAssignIn, user: dict = Depends(require_admin)):
    role = body.role.strip()
    if not await _valid_role_name(role):
        raise HTTPException(400, f"Role '{role}' tidak dikenal — minta Super Admin membuatnya di Pengaturan → Roles & Izin")
    target = await db.users.find_one({"id": uid}, {"_id": 0, "role": 1})
    if not target:
        raise HTTPException(404, "User tidak ditemukan")
    is_super = await _is_super(user)
    if not is_super:
        if await _is_super(target):
            raise HTTPException(403, "Akun Super Admin hanya bisa diubah oleh Super Admin")
        allowed = await _assignable_roles()
        if role not in allowed:
            raise HTTPException(403, f"Role '{role}' tidak boleh ditugaskan oleh admin — hanya Super Admin yang menentukan")
    r = await db.users.update_one({"id": uid}, {"$set": {"role": role}})
    if not r.matched_count:
        raise HTTPException(404, "User tidak ditemukan")
    return {"ok": True, "role": role}

@api.patch("/users/{uid}/ingredient-categories")
async def set_user_ingredient_categories(uid: str, body: UserIngCatsIn, user: dict = Depends(require_admin)):
    """Kategori BAHAN yang boleh diisi akun ini (khusus stok opname bahan).
    Daftar kosong = belum diatur → akun tidak bisa mengisi opname bahan apa pun.
    Super Admin (owner) selalu bisa mengisi semua kategori, tidak terpengaruh daftar ini."""
    target = await db.users.find_one({"id": uid}, {"_id": 0, "role": 1, "name": 1})
    if not target:
        raise HTTPException(404, "User tidak ditemukan")
    if await _is_super(target) and not await _is_super(user):
        raise HTTPException(403, "Akun Super Admin hanya bisa diubah oleh Super Admin")
    valid = {c["id"] for c in await db.ingredient_categories.find({}, {"_id": 0, "id": 1}).to_list(500)}
    req = [str(c) for c in (body.categories or [])]
    unknown = [c for c in req if c not in valid]
    if unknown:
        raise HTTPException(400, f"Kategori bahan tidak dikenal: {', '.join(unknown[:5])}")
    cats = list(dict.fromkeys(req))
    r = await db.users.update_one({"id": uid}, {"$set": {"ingredient_categories": cats}})
    if not r.matched_count:
        raise HTTPException(404, "User tidak ditemukan")
    return {"ok": True, "ingredient_categories": cats}

@api.patch("/users/{uid}/toggle")
async def toggle_user(uid: str, user: dict = Depends(require_admin)):
    u = await db.users.find_one({"id": uid})
    if not u:
        raise HTTPException(404, "User tidak ditemukan")
    if await _is_super(u) and not await _is_super(user):
        raise HTTPException(403, "Akun Super Admin hanya bisa diubah oleh Super Admin")
    await db.users.update_one({"id": uid}, {"$set": {"active": not u.get("active", True)}})
    return {"active": not u.get("active", True)}

@api.post("/auth/change-password")
async def change_password(body: ChangePasswordIn, user: dict = Depends(get_current_user)):
    if len(body.new_password) < 6:
        raise HTTPException(400, "Password baru minimal 6 karakter")
    full = await db.users.find_one({"id": user["id"]})
    if not full or not verify_password(body.current_password, full["password_hash"]):
        raise HTTPException(400, "Password lama salah")
    # must_change_password ikut dimatikan: kewajiban ganti password saat login pertama selesai.
    await db.users.update_one({"id": user["id"]},
                              {"$set": {"password_hash": hash_password(body.new_password),
                                        # password terlihat ikut diperbarui agar Super Admin
                                        # tidak melihat password basi di daftar akun.
                                        "password_plain": body.new_password,
                                        "must_change_password": False}})
    return {"ok": True}

@api.post("/users/{uid}/reset-password")
async def reset_user_password(uid: str, body: ResetPasswordIn, user: dict = Depends(require_admin)):
    if len(body.new_password) < 6:
        raise HTTPException(400, "Password minimal 6 karakter")
    u = await db.users.find_one({"id": uid})
    if not u:
        raise HTTPException(404, "User tidak ditemukan")
    if await _is_super(u) and not await _is_super(user):
        raise HTTPException(403, "Akun Super Admin hanya bisa diubah oleh Super Admin")
    forced = True if body.must_change_password is None else bool(body.must_change_password)
    await db.users.update_one({"id": uid},
                              {"$set": {"password_hash": hash_password(body.new_password),
                                        "password_plain": body.new_password,
                                        "must_change_password": forced}})
    # password dikembalikan supaya admin dapat menyalinnya untuk diberikan ke pemilik akun.
    return {"ok": True, "password": body.new_password, "must_change_password": forced}

@api.patch("/users/{uid}/must-change-password")
async def set_must_change_password(uid: str, body: MustChangePasswordIn, user: dict = Depends(require_admin)):
    """Nyalakan/matikan kewajiban ganti password saat login berikutnya (per akun)."""
    target = await db.users.find_one({"id": uid}, {"_id": 0, "role": 1, "email": 1, "username": 1})
    if not target:
        raise HTTPException(404, "User tidak ditemukan")
    if await _is_super(target) and not await _is_super(user):
        raise HTTPException(403, "Akun Super Admin hanya bisa diubah oleh Super Admin")
    await db.users.update_one({"id": uid}, {"$set": {"must_change_password": bool(body.value)}})
    return {"ok": True, "must_change_password": bool(body.value)}

@api.get("/users/{uid}/delete-check")
async def user_delete_check(uid: str, admin: dict = Depends(require_superadmin)):
    """Info sebelum hapus akun: apakah akun punya riwayat transaksi (→ hanya nonaktif)."""
    target = await db.users.find_one({"id": uid}, {"_id": 0, "password_hash": 0, "password_plain": 0})
    if not target:
        raise HTTPException(404, "User tidak ditemukan")
    hist = await _user_history(uid)
    return {"id": uid, "name": target.get("name") or "",
            "username": target.get("username") or target.get("email") or "",
            "role": target.get("role") or "",
            "active": bool(target.get("active", True)),
            "is_superadmin": await _is_super(target),
            "self": uid == admin["id"],
            **hist}

@api.delete("/users/{uid}")
async def delete_user(uid: str, admin: dict = Depends(require_superadmin)):
    """Hapus akun (Super Admin). Akun yang SUDAH punya riwayat transaksi tidak dihapus
    permanen — hanya dinonaktifkan (arsip) agar laporan lama tetap utuh."""
    target = await db.users.find_one({"id": uid}, {"_id": 0, "role": 1, "email": 1, "username": 1, "name": 1})
    if not target:
        raise HTTPException(404, "User tidak ditemukan")
    if uid == admin["id"]:
        raise HTTPException(400, "Tidak bisa menghapus akun Anda sendiri")
    if await _is_super(target) and await _super_accounts_count() <= 1:
        raise HTTPException(400, "Akun Super Admin terakhir tidak bisa dihapus — angkat Super Admin lain lebih dulu")
    hist = await _user_history(uid)
    who = target.get("username") or target.get("email") or target.get("name") or uid
    if hist["has_history"]:
        await db.users.update_one({"id": uid}, {"$set": {"active": False,
                                                        "archived_at": now_utc().isoformat(),
                                                        "archived_by": admin.get("username") or admin.get("name")}})
        logger.info(f"akun {who} dinonaktifkan (punya riwayat: {hist['counts']})")
        return {"action": "deactivated", "username": who, **hist}
    await db.users.delete_one({"id": uid})
    logger.info(f"akun {who} dihapus permanen (tanpa riwayat transaksi)")
    return {"action": "deleted", "username": who, **hist}

@api.post("/admin/reset-data")
async def reset_data(body: ResetDataIn, admin: dict = Depends(require_admin)):
    """Destructive: wipe transactional (and optionally catalog) data. Keeps users, settings, payment methods."""
    full = await db.users.find_one({"id": admin["id"]})
    if not full or not verify_password(body.password, full["password_hash"]):
        raise HTTPException(400, "Password admin salah")
    tx = ["orders", "cash_movements", "shifts", "stock_opname", "purchases", "counters", "import_logs", "audit_logs"]
    catalog = ["products", "categories", "tables"]
    cols = tx + (catalog if body.scope == "all" else [])
    deleted = {}
    for col in cols:
        r = await db[col].delete_many({})
        deleted[col] = r.deleted_count
    return {"ok": True, "scope": body.scope, "deleted": deleted}

# ================================================================== CATEGORIES
@api.get("/categories")
async def list_categories(include_inactive: bool = True, user: dict = Depends(get_current_user)):
    q = {} if include_inactive else {"active": True}
    key = f"categories:{int(include_inactive)}"
    if await _feat("perf.cache_master"):
        hit = _cache_get(key)
        if hit is not None:
            return hit
    rows = await db.categories.find(q, {"_id": 0}).sort("sort_order", 1).to_list(500)
    if await _feat("perf.cache_master"):
        _cache_set(key, rows, 20.0)
    return rows

@api.post("/categories")
async def create_category(body: CategoryIn, admin: dict = Depends(admin_or_input)):
    if await db.categories.find_one({"name": {"$regex": f"^{re.escape(body.name.strip())}$", "$options": "i"}, "type": body.type}):
        raise HTTPException(400, f"Kategori '{body.name}' sudah ada untuk tipe ini")
    doc = body.model_dump()
    doc.update({"id": new_id(), "created_at": now_utc().isoformat()})
    await db.categories.insert_one(doc)
    _cache_del("categories:")
    doc.pop("_id", None)
    return doc

@api.put("/categories/{cid}")
async def update_category(cid: str, body: CategoryIn, admin: dict = Depends(admin_or_input)):
    if not await db.categories.find_one({"id": cid}):
        raise HTTPException(404, "Kategori tidak ditemukan")
    if await db.categories.find_one({"name": {"$regex": f"^{re.escape(body.name.strip())}$", "$options": "i"}, "type": body.type, "id": {"$ne": cid}}):
        raise HTTPException(400, f"Kategori '{body.name}' sudah ada untuk tipe ini")
    await db.categories.update_one({"id": cid}, {"$set": body.model_dump()})
    _cache_del("categories:")
    return await db.categories.find_one({"id": cid}, {"_id": 0})

@api.delete("/categories/{cid}")
async def delete_category(cid: str, admin: dict = Depends(admin_or_input)):
    used = await db.products.count_documents({"category_id": cid})
    if used:
        # soft deactivate instead of hard delete
        await db.categories.update_one({"id": cid}, {"$set": {"active": False}})
        _cache_del("categories:")
        return {"soft_deleted": True, "reason": f"Kategori dipakai {used} produk, dinonaktifkan (tidak dihapus)."}
    await db.categories.delete_one({"id": cid})
    _cache_del("categories:")
    return {"deleted": True}

# ================================================================== PRODUCTS
@api.get("/products")
async def list_products(type: Optional[str] = None, category_id: Optional[str] = None,
                        active_only: bool = False, user: dict = Depends(get_current_user)):
    q = {}
    if type:
        q["type"] = type
    if category_id:
        q["category_id"] = category_id
    if active_only:
        q["active"] = True
    key = f"products:{type or '-'}:{category_id or '-'}:{int(active_only)}"
    if await _feat("perf.cache_master"):
        hit = _cache_get(key)
        if hit is not None:
            return hit
    rows = await db.products.find(q, {"_id": 0}).sort("name", 1).to_list(2000)
    if await _feat("perf.cache_master"):
        _cache_set(key, rows, 20.0)  # katalog jarang berubah; 20 dtk cukup
    return rows

@api.post("/products")
async def create_product(body: ProductIn, admin: dict = Depends(admin_or_input)):
    if body.price < 0 or body.cost < 0:
        raise HTTPException(400, "Harga/HPP tidak boleh negatif")
    if await db.products.find_one({"sku": body.sku}):
        raise HTTPException(400, f"SKU '{body.sku}' sudah dipakai")
    if not await db.categories.find_one({"id": body.category_id}):
        raise HTTPException(400, "Kategori tidak valid")
    doc = body.model_dump()
    doc["track_stock"] = body.type == "retail"
    doc.update({"id": new_id(), "created_at": now_utc().isoformat()})
    await db.products.insert_one(doc)
    _cache_del("products:")
    doc.pop("_id", None)
    return doc

@api.put("/products/{pid}")
async def update_product(pid: str, body: ProductIn, admin: dict = Depends(admin_or_input)):
    if body.price < 0 or body.cost < 0:
        raise HTTPException(400, "Harga/HPP tidak boleh negatif")
    existing = await db.products.find_one({"id": pid})
    if not existing:
        raise HTTPException(404, "Produk tidak ditemukan")
    dup = await db.products.find_one({"sku": body.sku, "id": {"$ne": pid}})
    if dup:
        raise HTTPException(400, f"SKU '{body.sku}' sudah dipakai produk lain")
    doc = body.model_dump(exclude_unset=True)
    if "type" in doc:
        doc["track_stock"] = doc["type"] == "retail"
    await db.products.update_one({"id": pid}, {"$set": doc})
    _cache_del("products:")
    return await db.products.find_one({"id": pid}, {"_id": 0})

@api.patch("/products/{pid}/sold-out")
async def toggle_sold_out(pid: str, user: dict = Depends(get_current_user)):
    p = await db.products.find_one({"id": pid})
    if not p:
        raise HTTPException(404, "Produk tidak ditemukan")
    val = not p.get("sold_out", False)
    await db.products.update_one({"id": pid}, {"$set": {"sold_out": val}})
    _cache_del("products:")
    return {"sold_out": val}

@api.delete("/products/{pid}")
async def delete_product(pid: str, admin: dict = Depends(admin_or_input)):
    used = await db.orders.count_documents({"items.product_id": pid})
    if used:
        await db.products.update_one({"id": pid}, {"$set": {"active": False}})
        _cache_del("products:")
        return {"soft_deleted": True, "reason": "Produk pernah dipakai transaksi, dinonaktifkan."}
    await db.products.delete_one({"id": pid})
    _cache_del("products:")
    return {"deleted": True}

# ================================================================== RESEP & HPP OTOMATIS
async def _calc_recipe_hpp(recipe):
    """Hitung HPP (modal) per unit hasil dari daftar bahan.
    Tiap baris bahan: ingredient_id (master Bahan) ATAU product_id (produk retail lama)."""
    ing = []
    total = 0.0
    for b in recipe.get("ingredients", []):
        qty = float(b.get("qty") or 0)
        if qty <= 0:
            continue
        iid = b.get("ingredient_id")
        pid = b.get("product_id")
        name = b.get("name", "")
        unit = b.get("unit", "")
        cost = 0.0
        if iid:
            ib = await db.ingredients.find_one({"id": iid}, {"_id": 0, "name": 1, "unit": 1, "cost": 1})
            if not ib:
                continue
            name = name or ib.get("name", "?")
            unit = unit or ib.get("unit", "")
            cost = float(ib.get("cost") or 0)  # HPP bahan = harga beli terakhir
        elif pid:
            p = await db.products.find_one({"id": pid}, {"_id": 0, "name": 1, "cost": 1, "price": 1})
            if not p:
                continue
            name = name or p["name"]
            cost = float(p.get("cost") or 0) or float(p.get("price") or 0)  # bahan produk: pakai HPP, fallback harga jual
        if qty == 0:
            continue
        line = round(cost * qty, 2)
        total += line
        ing.append({"ingredient_id": iid, "product_id": pid, "name": name, "qty": qty,
                    "unit": unit, "kind": "ingredient" if iid else "product",
                    "cost": line, "unit_cost": round(cost, 2)})
    yield_units = float(recipe.get("yield_units") or 1) or 1
    return {"ingredients": ing, "total_cost": round(total, 2),
            "hpp_per_unit": round(total / yield_units, 2), "yield_units": yield_units}

@api.get("/recipes")
async def list_recipes(admin: dict = Depends(admin_or_input)):
    recipes = await db.recipes.find({}, {"_id": 0}).to_list(1000)
    out = []
    for r in recipes:
        r["hpp"] = await _calc_recipe_hpp(r)
        out.append(r)
    return {"recipes": out}

@api.get("/recipes/{product_id}")
async def get_recipe(product_id: str, admin: dict = Depends(admin_or_input)):
    r = await db.recipes.find_one({"product_id": product_id}, {"_id": 0})
    if not r:
        raise HTTPException(404, "Resep belum dibuat")
    r["hpp"] = await _calc_recipe_hpp(r)
    return r

@api.post("/recipes")
async def create_recipe(body: RecipeIn, admin: dict = Depends(admin_or_input)):
    if not await db.products.find_one({"id": body.product_id}):
        raise HTTPException(400, "Produk tidak valid")
    await db.recipes.delete_many({"product_id": body.product_id})  # upsert: satu resep per produk
    doc = {"id": new_id(), "product_id": body.product_id, "ingredients": body.ingredients,
           "yield_units": body.yield_units, "created_at": now_utc().isoformat()}
    await db.recipes.insert_one(doc)
    doc.pop("_id", None)
    doc["hpp"] = await _calc_recipe_hpp(doc)
    return doc

@api.put("/recipes/{product_id}")
async def update_recipe(product_id: str, body: RecipeIn, admin: dict = Depends(admin_or_input)):
    doc = {"product_id": product_id, "ingredients": body.ingredients,
           "yield_units": body.yield_units, "updated_at": now_utc().isoformat()}
    r = await db.recipes.update_one({"product_id": product_id}, {"$set": doc}, upsert=True)
    out = await db.recipes.find_one({"product_id": product_id}, {"_id": 0})
    out["hpp"] = await _calc_recipe_hpp(out)
    return out

@api.post("/recipes/{product_id}/apply-hpp")
async def apply_recipe_hpp(product_id: str, admin: dict = Depends(require_admin)):
    """Terapkan HPP hasil resep ke kolom cost produk (HPP otomatis)."""
    r = await db.recipes.find_one({"product_id": product_id})
    if not r:
        raise HTTPException(404, "Resep belum dibuat")
    hpp = await _calc_recipe_hpp(r)
    await db.products.update_one({"id": product_id}, {"$set": {"cost": hpp["hpp_per_unit"]}})
    _cache_del("products:")
    return {"ok": True, "cost": hpp["hpp_per_unit"]}

@api.delete("/recipes/{product_id}")
async def delete_recipe(product_id: str, admin: dict = Depends(require_admin)):
    await db.recipes.delete_one({"product_id": product_id})
    return {"ok": True}

# ================================================================== VENDORS
@api.get("/vendors")
async def list_vendors(active_only: bool = False, user: dict = Depends(get_current_user)):
    q = {"active": True} if active_only else {}
    return await db.vendors.find(q, {"_id": 0}).sort("name", 1).to_list(500)

@api.post("/vendors")
async def create_vendor(body: VendorIn, admin: dict = Depends(admin_or_input)):
    if await db.vendors.find_one({"name": {"$regex": f"^{re.escape(body.name.strip())}$", "$options": "i"}}):
        raise HTTPException(400, f"Vendor '{body.name}' sudah ada")
    doc = body.model_dump()
    doc.update({"id": new_id(), "created_at": now_utc().isoformat()})
    await db.vendors.insert_one(doc)
    doc.pop("_id", None)
    return doc

@api.put("/vendors/{vid}")
async def update_vendor(vid: str, body: VendorIn, admin: dict = Depends(admin_or_input)):
    if not await db.vendors.find_one({"id": vid}):
        raise HTTPException(404, "Vendor tidak ditemukan")
    if await db.vendors.find_one({"name": {"$regex": f"^{re.escape(body.name.strip())}$", "$options": "i"}, "id": {"$ne": vid}}):
        raise HTTPException(400, f"Vendor '{body.name}' sudah ada")
    await db.vendors.update_one({"id": vid}, {"$set": body.model_dump()})
    return await db.vendors.find_one({"id": vid}, {"_id": 0})

@api.delete("/vendors/{vid}")
async def delete_vendor(vid: str, admin: dict = Depends(admin_or_input)):
    used = await db.products.count_documents({"vendor_id": vid})
    if used:
        await db.vendors.update_one({"id": vid}, {"$set": {"active": False}})
        return {"soft_deleted": True, "reason": f"Vendor dipakai {used} produk, dinonaktifkan (tidak dihapus)."}
    await db.vendors.delete_one({"id": vid})
    return {"deleted": True}

# ================================================================== TABLES
@api.get("/tables")
async def list_tables(user: dict = Depends(get_current_user)):
    tables = await db.tables.find({"deleted": {"$ne": True}}, {"_id": 0}).sort("area", 1).to_list(500)
    open_orders = await db.orders.find({"order_type": "dine_in", "status": "open"}, {"_id": 0, "table_id": 1, "id": 1, "total": 1}).to_list(1000)
    open_map = {}
    for o in open_orders:
        open_map[o["table_id"]] = o
    for t in tables:
        oo = open_map.get(t["id"])
        t["status"] = "open_bill" if oo else "empty"
        t["open_order_id"] = oo["id"] if oo else None
        t["reservation"] = await _table_reservation(t["id"])
    return tables

async def _table_reservation(table_id):
    """Reservasi aktif untuk meja (hari ini / belum selesai)."""
    today = wib_today()
    r = await db.reservations.find_one({
        "table_id": table_id,
        "status": {"$in": ["pending", "confirmed", "arrived"]},
        "date": today,
    }, {"_id": 0})
    return r

@api.get("/reservations")
async def list_reservations(date_str: Optional[str] = Query(None, alias="date"), user: dict = Depends(get_current_user)):
    d = date_str or wib_today()
    rows = await db.reservations.find({"date": d}, {"_id": 0}).sort("time", 1).to_list(500)
    tables = {t["id"]: t["name"] for t in await db.tables.find({}, {"_id": 0, "id": 1, "name": 1}).to_list(500)}
    for r in rows:
        r["table_name"] = tables.get(r.get("table_id"), "?")
    return {"date": d, "reservations": rows}

@api.post("/reservations")
async def create_reservation(body: ReservationIn, user: dict = Depends(get_current_user)):
    if not body.customer_name.strip():
        raise HTTPException(400, "Nama pemesan wajib")
    if not body.table_id or not await db.tables.find_one({"id": body.table_id, "deleted": {"$ne": True}}):
        raise HTTPException(400, "Meja tidak valid")
    doc = {"id": new_id(), "table_id": body.table_id, "customer_name": body.customer_name.strip(),
           "phone": body.phone.strip(), "pax": body.pax, "date": body.date or wib_today(),
           "time": body.time or "12:00", "note": body.note, "status": "confirmed",
           "created_by": user["name"], "created_at": now_utc().isoformat()}
    await db.reservations.insert_one(doc)
    doc.pop("_id", None)
    return doc

@api.patch("/reservations/{rid}")
async def update_reservation(rid: str, body: ReservationUpdateIn, user: dict = Depends(get_current_user)):
    upd = body.model_dump(exclude_none=True)
    if not upd:
        raise HTTPException(400, "Tidak ada perubahan")
    r = await db.reservations.update_one({"id": rid}, {"$set": upd})
    if not r.matched_count:
        raise HTTPException(404, "Reservasi tidak ditemukan")
    return {"ok": True}

@api.post("/reservations/{rid}/status")
async def set_reservation_status(rid: str, body: dict, user: dict = Depends(get_current_user)):
    status = (body or {}).get("status", "")
    if status not in ("pending", "confirmed", "arrived", "cancelled", "done"):
        raise HTTPException(400, "Status tidak valid")
    r = await db.reservations.update_one({"id": rid}, {"$set": {"status": status}})
    if not r.matched_count:
        raise HTTPException(404, "Reservasi tidak ditemukan")
    return {"ok": True}

@api.delete("/reservations/{rid}")
async def delete_reservation(rid: str, admin: dict = Depends(require_admin)):
    await db.reservations.delete_one({"id": rid})
    return {"ok": True}

@api.post("/tables")
async def create_table(body: TableIn, admin: dict = Depends(require_admin)):
    if await db.tables.find_one({"name": body.name, "deleted": {"$ne": True}}):
        raise HTTPException(400, f"Nama/kode meja '{body.name}' sudah ada")
    doc = body.model_dump()
    doc.update({"id": new_id(), "deleted": False, "created_at": now_utc().isoformat()})
    await db.tables.insert_one(doc)
    doc.pop("_id", None)
    return doc

@api.put("/tables/{tid}")
async def update_table(tid: str, body: TableIn, admin: dict = Depends(require_admin)):
    t = await db.tables.find_one({"id": tid})
    if not t:
        raise HTTPException(404, "Meja tidak ditemukan")
    dup = await db.tables.find_one({"name": body.name, "id": {"$ne": tid}, "deleted": {"$ne": True}})
    if dup:
        raise HTTPException(400, f"Nama/kode meja '{body.name}' sudah ada")
    if t.get("active") and not body.active:
        open_bill = await db.orders.find_one({"table_id": tid, "status": "open"})
        if open_bill:
            raise HTTPException(400, "Meja punya open bill aktif, tidak bisa dinonaktifkan")
    await db.tables.update_one({"id": tid}, {"$set": body.model_dump()})
    return await db.tables.find_one({"id": tid}, {"_id": 0})

@api.delete("/tables/{tid}")
async def delete_table(tid: str, admin: dict = Depends(require_admin)):
    open_bill = await db.orders.find_one({"table_id": tid, "status": "open"})
    if open_bill:
        raise HTTPException(400, "Meja punya open bill aktif, tidak bisa dihapus")
    used = await db.orders.count_documents({"table_id": tid})
    if used:
        await db.tables.update_one({"id": tid}, {"$set": {"active": False}})
        return {"soft_deleted": True, "reason": "Meja pernah dipakai transaksi, dinonaktifkan (tidak dihapus)."}
    await db.tables.update_one({"id": tid}, {"$set": {"deleted": True, "active": False}})
    return {"deleted": True}

# ================================================================== PAYMENT METHODS
@api.get("/payment-methods")
async def list_payment_methods(user: dict = Depends(get_current_user)):
    if await _feat("perf.cache_master"):
        hit = _cache_get("payment-methods")
        if hit is not None:
            return hit
    rows = await db.payment_methods.find({}, {"_id": 0}).sort("name", 1).to_list(100)
    if await _feat("perf.cache_master"):
        _cache_set("payment-methods", rows, 30.0)
    return rows

@api.post("/payment-methods")
async def create_pm(body: PaymentMethodIn, admin: dict = Depends(require_admin)):
    doc = body.model_dump()
    doc.update({"id": new_id()})
    await db.payment_methods.insert_one(doc)
    _cache_del("payment-methods")
    doc.pop("_id", None)
    return doc

@api.patch("/payment-methods/{pmid}/toggle")
async def toggle_pm(pmid: str, admin: dict = Depends(require_admin)):
    pm = await db.payment_methods.find_one({"id": pmid})
    if not pm:
        raise HTTPException(404, "Metode tidak ditemukan")
    await db.payment_methods.update_one({"id": pmid}, {"$set": {"active": not pm.get("active", True)}})
    _cache_del("payment-methods")
    return {"active": not pm.get("active", True)}

# ================================================================== ORDERS
async def _resolve_items(raw_items):
    """Rebuild every line item from the products collection (server-authoritative).
    Produk diambil SEKALI per keranjang (query $in) — bukan per-baris — supaya
    transaksi dengan banyak item tidak membayar N round-trip ke MongoDB."""
    ids = list({it.product_id for it in raw_items if it.product_id})
    if not ids:
        raise HTTPException(400, "Keranjang kosong")
    prods = {p["id"]: p for p in await db.products.find({"id": {"$in": ids}}, {"_id": 0}).to_list(len(ids) + 10)}
    resolved = []
    for it in raw_items:
        p = prods.get(it.product_id)
        if not p:
            raise HTTPException(400, f"Produk tidak ditemukan: {it.product_id}")
        if not p.get("active", True):
            raise HTTPException(400, f"Produk nonaktif tidak bisa dijual: {p['name']}")
        if p.get("sold_out"):
            raise HTTPException(400, f"Produk sold out: {p['name']}")
        line = {"product_id": p["id"], "name": p["name"], "price": p["price"],
                "cost": float(p.get("cost") or 0),
                "qty": it.qty, "type": p["type"], "track_stock": p.get("track_stock", False)}
        # Produk jual per berat (F&B): harga = harga per satuan berat × berat
        if p.get("weight_sale") and it.weight and float(it.weight) > 0:
            w = float(it.weight)
            line["price"] = round(float(p["price"]) * w, 2)
            line["cost"] = round(line["cost"] * w, 2)  # HPP ikut skala berat
            line["weight"] = round(w, 2)
            line["weight_unit"] = p.get("weight_unit", "")
            line["base_price"] = float(p["price"])
            line["name"] = f"{p['name']} ({w:.2f} {p.get('weight_unit', '')})".strip()
        if p["type"] == "vendor" and p.get("vendor_id"):
            share = float(p.get("vendor_share_percent") or 0)
            line["vendor_id"] = p["vendor_id"]
            line["vendor_share_percent"] = share
            # Bagi hasil vendor dihitung dari HARGA JUAL baris (sudah × berat bila jual per berat).
            # Diskon order TIDAK memotong bagian vendor — yang menanggung diskon adalah outlet.
            line["vendor_total"] = round(line["price"] * it.qty * share / 100, 2)
        resolved.append(line)
    return resolved

async def _validate_order_rules(order_type, table_id, items):
    types = {i["type"] for i in items}
    if order_type == "retail":
        if any(t != "retail" for t in types):
            raise HTTPException(400, "Alur retail hanya boleh berisi item retail")
    else:  # dine_in / take_away
        if "retail" in types:
            raise HTTPException(400, "Item retail tidak boleh masuk alur F&B (dine-in/take away)")
    if order_type == "dine_in":
        if not table_id:
            raise HTTPException(400, "Dine-in wajib memilih meja")
        t = await db.tables.find_one({"id": table_id, "deleted": {"$ne": True}})
        if not t or not t.get("active", True):
            raise HTTPException(400, "Meja tidak valid atau nonaktif")
    elif table_id:
        raise HTTPException(400, "Take away/retail tidak boleh memakai meja")

# ------------------------------------------------------------------ SHIFT HARIAN (F&B & Retail)
# Perubahan model (permintaan pemilik): shift kini MILIK TOKO, bukan milik akun.
#   1. Shift dibuka satu kali per hari lewat SATU tombol → membuat 2 shift: F&B & Retail.
#   2. Akun lain (kasir lain) LANGSUNG memakai shift hari itu, tanpa membuka shift baru.
#   3. Kas awal terpisah untuk F&B dan Retail.
#   4. Nama akun yang MEMBUKA dan yang MENUTUP selalu dicatat.
# Dokumen shift lama (sebelum pemisahan) tidak punya `scope` → dianggap F&B
# (lihat juga _migrate_shift_scopes()).
SHIFT_SCOPES = ("fnb", "retail")
# Uang transport = PENGELUARAN WAJIB saat tutup shift (tidak boleh 0), selalu dibebankan ke F&B.
# Kategori ini dipakai sebagai penanda di kas keluar supaya bisa ditampilkan di laporan shift.
SHIFT_TRANSPORT_CAT = "Transport"


def _shift_scope_label(scope):
    return "Retail" if scope == "retail" else "F&B"


def _shift_scope_of(doc):
    sc = (doc or {}).get("scope")
    return sc if sc in SHIFT_SCOPES else "fnb"


def _expense_rows_of(moves):
    """Ringkas kas keluar (pengeluaran) per toko untuk PENGECEKAN "pengeluaran harian sudah diisi".

    DUA kategori DIKECUALIKAN karena bukan bagian dari laporan pengeluaran harian yang diisi
    kasir (keduanya dibuat OTOMATIS oleh sistem):
      * `Transport` (SHIFT_TRANSPORT_CAT) — uang transport wajib saat tutup shift;
      * `Bagi Hasil Vendor` (SETTLE_CAT) — pembayaran bagi hasil vendor (settlement).
    Tanpa ini, hari yang TIDAK ada pengeluaran apa pun tetap dianggap "sudah diisi" hanya
    karena uang transport/bagi hasil vendor tercatat sebagai kas keluar.
    `SETTLE_CAT` memang didefinisikan jauh di bawah file ini — dibaca saat pemanggilan
    (bukan saat definisi), jadi aman (JANGAN dijadikan konstanta modul di baris ini).
    """
    skip = {SHIFT_TRANSPORT_CAT, SETTLE_CAT}
    out = {"fnb": {"count": 0, "total": 0.0}, "retail": {"count": 0, "total": 0.0}}
    for m in moves:
        if (m.get("category") or "") in skip:
            continue
        sc = m.get("scope") if m.get("scope") in SHIFT_SCOPES else "fnb"
        out[sc]["count"] += 1
        out[sc]["total"] = round(out[sc]["total"] + float(m.get("amount") or 0), 2)
    out["empty"] = (out["fnb"]["count"] + out["retail"]["count"]) == 0
    return out


async def _shift_day_expenses(date):
    """Pengeluaran pada satu tanggal (WIB) per toko — termasuk yang dicatat saat shift
    belum/tidak terbuka (`shift_id` kosong), supaya peringatan "pengeluaran harian belum
    diisi" tidak salah/tidak lolos. Dipakai halaman Shift & penutupan shift."""
    start, end = wib_day_range(date)
    moves = await db.cash_movements.find({"type": "out", "created_at": {"$gte": start, "$lt": end}},
                                         {"_id": 0, "amount": 1, "scope": 1, "category": 1}).to_list(5000)
    return _expense_rows_of(moves)


def _scope_of_order_type(order_type):
    """Retail masuk shift Retail; dine-in & take away masuk shift F&B."""
    return "retail" if order_type == "retail" else "fnb"


def _shift_open_key(scope):
    """Penanda unik shift terbuka (dipakai indeks unik parsial) supaya dua perangkat
    tidak bisa membuka dua shift untuk toko yang sama."""
    return f"{scope}:open"


async def _open_shifts():
    """SEMUA shift yang sedang terbuka (maks 1 per toko), urut waktu buka."""
    return await db.shifts.find({"status": "open"}, {"_id": 0}).sort("opened_at", 1).to_list(20)


async def _open_shift(scope="fnb"):
    """Shift terbuka untuk SATU toko (F&B/Retail) — dipakai siapa pun, bukan milik satu akun."""
    sc = scope if scope in SHIFT_SCOPES else "fnb"
    for d in await _open_shifts():
        if _shift_scope_of(d) == sc:
            return d
    return None


async def _open_shift_any(scope=None):
    """Shift terbuka untuk toko tsb; bila toko itu belum dibuka, pakai shift toko lain yang
    sedang terbuka. Dipakai untuk PENCATATAN (mis. void dicatat pada shift hari ini) dan
    TIDAK membuat shift baru."""
    if scope:
        sh = await _open_shift(scope)
        if sh:
            return sh
    opens = await _open_shifts()
    return opens[0] if opens else None


async def _shift_for_order(order_type):
    """Shift yang harus dipakai order ini, membuat shift toko yang belum ada bila sesi
    hari itu sudah terbuka (mis. shift Retail dibuat belakangan) — supaya transaksi
    tidak pernah tercatat tanpa shift hanya karena satu toko belum dibukakan."""
    scope = _scope_of_order_type(order_type)
    sh = await _open_shift(scope)
    if sh:
        return sh
    opens = await _open_shifts()
    if not opens:
        return None
    anchor = opens[0]
    doc = {"id": new_id(), "cashier_id": anchor.get("cashier_id"), "cashier_name": anchor.get("cashier_name"),
           "opened_by": anchor.get("opened_by") or anchor.get("cashier_name") or "",
           "opened_by_id": anchor.get("opened_by_id") or anchor.get("cashier_id"),
           "opened_at": anchor.get("opened_at") or now_utc().isoformat(), "closed_at": None,
           "opening_cash": 0, "status": "open", "scope": scope, "auto_created": True,
           "session_id": anchor.get("session_id") or anchor.get("id"),
           "date": anchor.get("date") or wib_today(), "open_key": _shift_open_key(scope)}
    try:
        await db.shifts.insert_one(dict(doc))
    except Exception:
        # Balapan dengan perangkat lain: pakai shift yang sudah dibuat itu.
        return await _open_shift(scope)
    doc.pop("_id", None)
    return doc


def _shift_brief(s):
    """Ringkasan satu shift (dipakai UI/print) — tidak memuat _id Mongo."""
    if not s:
        return None
    return {"id": s.get("id"), "scope": _shift_scope_of(s), "status": s.get("status"),
            "opened_at": s.get("opened_at"), "closed_at": s.get("closed_at"),
            "opened_by": s.get("opened_by") or s.get("cashier_name") or "",
            "opened_by_id": s.get("opened_by_id") or s.get("cashier_id"),
            "closed_by": s.get("closed_by") or "", "closed_by_id": s.get("closed_by_id"),
            "opening_cash": round(float(s.get("opening_cash") or 0), 2),
            "closing_cash": round(float(s.get("closing_cash") or 0), 2),
            "auto_created": bool(s.get("auto_created")),
            "session_id": s.get("session_id"), "date": s.get("date")}


async def _session_accounts(shifts):
    """Akun-akun yang memakai shift ini (pembuka + yang membuat order/mengeluarkan kas) —
    ditampilkan supaya jelas siapa saja yang bekerja pada shift bersama ini."""
    ids = [s["id"] for s in shifts]
    if not ids:
        return []
    per = {}
    for s in shifts:
        nm = s.get("opened_by") or s.get("cashier_name") or ""
        if nm:
            d = per.setdefault(nm, {"name": nm, "id": s.get("opened_by_id") or s.get("cashier_id"),
                                    "orders": 0, "amount": 0.0, "opened": True})
            d["opened"] = True
    for coll, is_order in (("orders", True), ("cash_movements", False)):
        docs = await db[coll].find({"shift_id": {"$in": ids}}, {"_id": 0, "cashier_name": 1, "cashier_id": 1,
                                                               "total": 1, "amount": 1, "type": 1,
                                                               "status": 1}).to_list(5000)
        for d in docs:
            if is_order and d.get("status") != "paid":
                continue
            nm = d.get("cashier_name") or ""
            if not nm:
                continue
            rec = per.setdefault(nm, {"name": nm, "id": d.get("cashier_id"), "orders": 0,
                                      "amount": 0.0, "opened": False})
            if is_order:
                rec["orders"] += 1
                rec["amount"] = round(rec["amount"] + float(d.get("total") or 0), 2)
            else:
                rec["amount"] = round(rec["amount"] + float(d.get("amount") or 0), 2)
    return sorted(per.values(), key=lambda x: (-x["orders"], x["name"]))


async def _session_view(shifts=None):
    """/shifts/current: keadaan shift hari ini (bisa dua toko sekaligus)."""
    if shifts is None:
        shifts = await _open_shifts()
    if not shifts:
        return None
    fnb = next((s for s in shifts if _shift_scope_of(s) == "fnb"), None)
    retail = next((s for s in shifts if _shift_scope_of(s) == "retail"), None)
    anchor = fnb or retail
    opened = sorted([s.get("opened_at") or "" for s in shifts])
    return {"id": anchor.get("session_id") or anchor.get("id"),
            "session_id": anchor.get("session_id") or anchor.get("id"),
            "status": "open", "shared": True, "scopes": [sc for sc, s in
                                                          (("fnb", fnb), ("retail", retail)) if s],
            "date": anchor.get("date") or wib_day_of(anchor.get("opened_at") or now_utc().isoformat()),
            "opened_at": (opened[0] if opened else None),
            "opened_by": anchor.get("opened_by") or anchor.get("cashier_name") or "",
            "opened_by_id": anchor.get("opened_by_id") or anchor.get("cashier_id"),
            # kompatibilitas tampilan lama (bundle/APK versi sebelumnya membaca field ini)
            "cashier_name": anchor.get("opened_by") or anchor.get("cashier_name") or "",
            "cashier_id": anchor.get("opened_by_id") or anchor.get("cashier_id"),
            "fnb": _shift_brief(fnb), "retail": _shift_brief(retail),
            "shift_ids": {"fnb": (fnb or {}).get("id"), "retail": (retail or {}).get("id")},
            "accounts": await _session_accounts(shifts),
            # Status pengeluaran harian per toko → dipakai form tutup shift untuk memperingatkan
            # bila laporan pengeluaran harian belum diisi sama sekali.
            "expenses": await _shift_day_expenses(anchor.get("date")
                                                 or wib_day_of(anchor.get("opened_at") or now_utc().isoformat())),
            "wa_auto_shift": await _shift_wa_auto_enabled()}

async def _finalize_payment(order, payment_method, amount_paid, user, splits=None):
    payment_splits = None
    # ---- Pembayaran 2 metode sekaligus (splits) ----
    # Jumlah seluruh bagian harus PAS total tagihan; tidak ada uang kembalian di mode ini.
    if splits and len(splits) >= 2:
        resolved = []
        tot = 0.0
        for sp in splits:
            if not isinstance(sp, dict) or not sp.get("payment_method"):
                raise HTTPException(400, "Data metode pembayaran tidak valid")
            pm = await db.payment_methods.find_one({"id": str(sp["payment_method"]), "active": True}, {"_id": 0})
            if not pm:
                raise HTTPException(400, "Metode pembayaran tidak valid/aktif")
            try:
                amt = round(float(sp.get("amount") or 0), 2)
            except (TypeError, ValueError):
                raise HTTPException(400, "Jumlah bagian pembayaran tidak valid")
            if amt <= 0:
                raise HTTPException(400, "Jumlah tiap metode harus lebih dari 0")
            resolved.append({"pm": pm, "amount": amt})
            tot += amt
        if abs(tot - order["total"]) > 0.01:
            raise HTTPException(400, f"Total metode bayar ({tot:,.0f}) harus PAS total tagihan ({order['total']:,.0f})")
        if len({m["pm"]["id"] for m in resolved}) < 2:
            raise HTTPException(400, "Gunakan 2 metode yang berbeda")
        method_name = " + ".join(m["pm"]["name"] for m in resolved)
        payment_splits = [{"payment_method_id": m["pm"]["id"], "payment_method_name": m["pm"]["name"],
                           "payment_method_type": m["pm"]["type"], "amount": m["amount"]} for m in resolved]
        pm = resolved[0]["pm"]
        payment_method = pm["id"]
        paid = round(tot, 2)
        cash_change = 0.0
    else:
        pm = await db.payment_methods.find_one({"id": payment_method, "active": True})
        if not pm:
            raise HTTPException(400, "Metode pembayaran tidak valid/aktif")
        paid = amount_paid if amount_paid is not None else order["total"]
        if pm["type"] == "cash" and paid < order["total"]:
            raise HTTPException(400, "Jumlah bayar kurang dari total")
        cash_change = round(paid - order["total"], 2)
    # Shift bersama: order F&B masuk shift F&B, order retail masuk shift Retail.
    shift = await _shift_for_order(order.get("order_type"))
    # Validasi stok (baca) — decrement dilakukan SETELAH klaim berhasil.
    for it in order["items"]:
        if it.get("type") == "retail":
            p = await db.products.find_one({"id": it["product_id"]}, {"_id": 0})
            if p and p.get("track_stock") and p.get("stock", 0) < it["qty"]:
                raise HTTPException(400, f"Stok '{it['name']}' tidak cukup (sisa {p.get('stock', 0)})")
    upd = {"status": "paid", "payment_method_id": payment_method, "payment_method_name": pm["name"],
           "payment_method_type": pm["type"], "amount_paid": paid,
           "change": cash_change,
           "payment_splits": payment_splits,
           "paid_at": now_utc().isoformat(), "shift_id": shift["id"] if shift else None}
    if order.get("payment_ref"):
        upd["payment_ref"] = str(order["payment_ref"]).strip()
    # Penanda kupon ditentukan SEBELUM klaim supaya ikut tersimpan ATOMIK bersama status
    # (dipakai void untuk mengembalikan pemakaian kupon).
    if order.get("coupon_code"):
        cou = await db.coupons.find_one({"code": str(order["coupon_code"]).strip().upper()}, {"_id": 0})
        if cou:
            upd["coupon_counted"] = True
    # Klaim ATOMIK: hanya request yang berhasil mengubah status open -> paid yang boleh
    # menjalankan efek samping (stok/poin/kupon/award). Dua request bayar bersamaan utk
    # order yg sama => satu menang, yang lain melihat status sudah paid dan langsung pulang.
    res = await db.orders.update_one({"id": order["id"], "status": "open"}, {"$set": upd})
    if res.matched_count == 0:
        existing = await db.orders.find_one({"id": order["id"]}, {"_id": 0})
        if existing:
            return existing  # sudah dibayar request lain — kembalikan hasil, tanpa efek ganda
        raise HTTPException(404, "Order tidak ditemukan")
    # ---- efek "hanya saat lunas" — dijalankan SEKALI oleh pemenang klaim ----
    # PENTING: blok ini dulu SEMPAT tertulis dua kali (klaim + efek samping dobel) sehingga
    # bagian kedua tidak pernah tercapai oleh request pemenang: poin member tidak pernah
    # bertambah, kuota kupon tidak pernah terpakai, penanda coupon_counted tidak tersimpan,
    # webhook order.paid tidak terkirim, dan cache laporan tidak dibatalkan. Sekarang SATU.
    for it in order["items"]:
        if it.get("type") == "retail":
            await db.products.update_one({"id": it["product_id"], "track_stock": True},
                                         {"$inc": {"stock": -it["qty"]}})
    if order.get("member_id") and (order.get("redeem_points_used") or 0) > 0:
        await db.members.update_one({"id": order["member_id"]},
                                    {"$inc": {"points": -float(order["redeem_points_used"])}})
    if order.get("coupon_code") and upd.get("coupon_counted"):
        await db.coupons.update_one({"code": str(order["coupon_code"]).strip().upper()},
                                    {"$inc": {"used_count": 1}})
    await _award_member_points({**order, **upd})
    # Data berubah -> cache laporan & stok produk yang terlihat usang dibatalkan.
    _bump_rs_gen()
    _cache_del("products:")
    try:
        import asyncio as _aio
        _aio.create_task(_fire_webhook("order.paid", {
            "order_id": order["id"], "order_number": order.get("order_number"),
            "order_type": order.get("order_type"), "total": order.get("total"),
            "payment": pm.get("name"), "cashier": user.get("name"),
            "shift_id": shift["id"] if shift else None,
        }))
    except Exception as e:
        logger.error(f"webhook order.paid task gagal: {e}")
    return {**order, **upd}

@api.post("/orders")
async def create_order(body: OrderIn, user: dict = Depends(admin_or_kasir)):
    if not body.items:
        raise HTTPException(400, "Keranjang kosong")
    if body.pay_now and not body.payment_method:
        raise HTTPException(400, "Pilih metode pembayaran")
    if body.client_ref:
        dup = await db.orders.find_one({"client_ref": body.client_ref}, {"_id": 0})
        if dup:
            return dup  # idempotent: offline sync retry won't duplicate
    items = await _resolve_items(body.items)
    await _validate_order_rules(body.order_type, body.table_id, items)
    subtotal, discount, total = compute_totals(items, body.discount_type, body.discount_value)
    promo_discount, promo_names = await _apply_promos(items, subtotal)
    if await _discount_needs_reason(body.discount_type, body.discount_value, subtotal) and not (body.discount_reason or "").strip():
        raise HTTPException(400, "Alasan diskon wajib diisi untuk diskon besar (lihat ambang di Pengaturan Aplikasi)")
    total = max(0.0, round(total - promo_discount, 2))
    coupon_discount = 0.0
    coupon_code = ""
    if body.coupon_code:
        coupon_discount, coupon_code = await _apply_coupon(body.coupon_code, total)
        total = max(0.0, round(total - coupon_discount, 2))
    redeem_discount = 0.0
    if body.member_id and body.redeem_points:
        rd, m = await _apply_redeem(body.member_id, body.redeem_points, total)
        redeem_discount = rd
        total = max(0.0, round(total - rd, 2))
    srv_rate, srv_amt = await _service_tax(total)
    total = round(total + srv_amt, 2)
    doc = {
        "id": new_id(), "order_number": await gen_order_number(),
        "order_type": body.order_type, "table_id": body.table_id, "items": items,
        "subtotal": subtotal, "discount_type": body.discount_type, "discount_value": body.discount_value,
        "discount": discount, "promo_discount": promo_discount, "promos_applied": promo_names,
        "coupon_code": coupon_code, "coupon_discount": coupon_discount,
        "redeem_discount": redeem_discount, "member_id": body.member_id,
        "redeem_points_used": float(body.redeem_points or 0),
        "service_tax_rate": srv_rate, "service_tax": srv_amt,
        "discount_reason": body.discount_reason, "total": total, "note": body.note,
        "status": "open", "cashier_id": user["id"], "cashier_name": user["name"],
        "client_ref": body.client_ref,
        "created_at": now_utc().isoformat(),
    }
    await db.orders.insert_one(doc)
    doc.pop("_id", None)
    if body.pay_now:
        if not body.payment_method and not body.splits:
            raise HTTPException(400, "Pilih metode pembayaran")
        doc = await _finalize_payment(doc, body.payment_method, body.amount_paid, user, splits=body.splits)
    return doc

@api.get("/orders")
async def list_orders(status: Optional[str] = None, order_type: Optional[str] = None,
                      date_str: Optional[str] = Query(None, alias="date"),
                      user: dict = Depends(admin_or_kasir)):
    q = {}
    if status:
        q["status"] = status
    if order_type:
        q["order_type"] = order_type
    if date_str:
        start, end = wib_day_range(date_str)
        q["created_at"] = {"$gte": start, "$lt": end}
    return await db.orders.find(q, {"_id": 0}).sort("created_at", -1).to_list(1000)

@api.get("/orders/{oid}")
async def get_order(oid: str, user: dict = Depends(admin_or_kasir)):
    o = await db.orders.find_one({"id": oid}, {"_id": 0})
    if not o:
        raise HTTPException(404, "Order tidak ditemukan")
    return o

@api.patch("/orders/{oid}/items")
async def update_order_items(oid: str, body: ItemsUpdate, user: dict = Depends(admin_or_kasir)):
    o = await db.orders.find_one({"id": oid})
    if not o:
        raise HTTPException(404, "Order tidak ditemukan")
    if o["status"] != "open":
        raise HTTPException(400, "Hanya open bill yang bisa ditambah item")
    items = await _resolve_items(body.items)
    await _validate_order_rules(o["order_type"], o.get("table_id"), items)
    subtotal, discount, total = compute_totals(items, o["discount_type"], o["discount_value"])
    promo_discount, promo_names = await _apply_promos(items, subtotal)
    total = max(0.0, round(total - promo_discount, 2))
    srv_rate, srv_amt = await _service_tax(total)
    total = round(total + srv_amt, 2)
    await db.orders.update_one({"id": oid}, {"$set": {"items": items, "subtotal": subtotal,
                                                       "discount": discount, "promo_discount": promo_discount,
                                                       "promos_applied": promo_names,
                                                       "service_tax_rate": srv_rate, "service_tax": srv_amt,
                                                       "total": total}})
    return await db.orders.find_one({"id": oid}, {"_id": 0})

@api.post("/orders/{oid}/pay")
async def pay_order(oid: str, body: PayIn, user: dict = Depends(admin_or_kasir)):
    o = await db.orders.find_one({"id": oid}, {"_id": 0})
    if not o:
        raise HTTPException(404, "Order tidak ditemukan")
    # Idempotensi: retry dengan payment_ref yang sama tidak menggandakan pembayaran.
    if body.payment_ref:
        prev = await db.orders.find_one({"payment_ref": body.payment_ref, "status": "paid"}, {"_id": 0})
        if prev:
            if prev["id"] == oid:
                return prev  # request sebelumnya sudah berhasil — kembalikan hasilnya
            raise HTTPException(409, "payment_ref sudah dipakai transaksi lain")
    if o["status"] != "open":
        raise HTTPException(400, "Order sudah lunas / tidak bisa dibayar")
    subtotal, discount, total = compute_totals(o["items"], body.discount_type, body.discount_value)
    promo_discount, promo_names = await _apply_promos(o["items"], subtotal)
    if await _discount_needs_reason(body.discount_type, body.discount_value, subtotal) and not (body.discount_reason or "").strip():
        raise HTTPException(400, "Alasan diskon wajib diisi untuk diskon besar (lihat ambang di Pengaturan Aplikasi)")
    total = max(0.0, round(total - promo_discount, 2))
    coupon_discount = 0.0
    coupon_code = ""
    if body.coupon_code:
        # Pemakaian kupon (used_count) dihitung di _finalize_payment saat transaksi lunas — sekali.
        coupon_discount, coupon_code = await _apply_coupon(body.coupon_code, total)
        total = max(0.0, round(total - coupon_discount, 2))
    redeem_discount = 0.0
    if body.member_id and body.redeem_points:
        rd, m = await _apply_redeem(body.member_id, body.redeem_points, total)
        redeem_discount = rd
        total = max(0.0, round(total - rd, 2))
    srv_rate, srv_amt = await _service_tax(total)
    total = round(total + srv_amt, 2)
    await db.orders.update_one({"id": oid}, {"$set": {"discount_type": body.discount_type,
                                                      "discount_value": body.discount_value,
                                                      "discount": discount, "promo_discount": promo_discount,
                                                      "promos_applied": promo_names,
                                                      "coupon_code": coupon_code, "coupon_discount": coupon_discount,
                                                      "redeem_discount": redeem_discount,
                                                      "member_id": body.member_id,
                                                      "redeem_points_used": float(body.redeem_points or 0),
                                                      "discount_reason": body.discount_reason,
                                                      "service_tax_rate": srv_rate, "service_tax": srv_amt,
                                                      "total": total, "subtotal": subtotal}})
    o.update({"discount": discount, "promo_discount": promo_discount, "promos_applied": promo_names,
              "redeem_discount": redeem_discount, "member_id": body.member_id,
              "redeem_points_used": float(body.redeem_points or 0),
              "coupon_code": coupon_code, "coupon_discount": coupon_discount,
              "service_tax_rate": srv_rate, "service_tax": srv_amt,
              "discount_reason": body.discount_reason, "total": total, "subtotal": subtotal,
              "payment_ref": body.payment_ref})
    return await _finalize_payment(o, body.payment_method, body.amount_paid, user, splits=body.splits)

# ================================================================== VOID / REFUND (pembatalan order)
# Dokumen rancangan: docs/RANCANGAN-VOID-PESANAN.md
# Aturan bisnis yang dipakai di sini:
#   - kasir boleh membatalkan SENDIRI, tetapi hanya order pada shift yang SEDANG TERBUKA;
#   - order pada shift yang sudah DITUTUP (atau tanpa shift) diblokir → hanya admin boleh
#     melepas blokir secara sadar (dicatat sebagai koreksi lintas shift);
#   - alasan wajib; satu order hanya bisa dibatalkan sekali (klaim atomik);
#   - TIDAK membuat catatan kas keluar (kas sudah otomatis turun karena laporan menghitung
#     order ber-status paid saja — kalau ditambah kas keluar, uangnya terhitung dua kali).
VOID_DEFAULTS = {
    "kasir_boleh_void": True,          # kasir boleh void sendiri (keputusan pemilik)
    "wajib_alasan": True,
    "alasan_min": 5,                   # panjang minimal alasan (huruf)
    "kasir_max_amount": 0,             # 0 = tanpa batas nominal untuk kasir
    "kasir_hanya_shift_berjalan": True,
    "admin_boleh_lepas_blokir": True,
    "restock_retail": True,            # kembalikan stok produk retail saat void
}
VOID_ALLOWED = set(VOID_DEFAULTS.keys())

async def _void_cfg():
    doc = await db.settings.find_one({"_id": "void"}, {"_id": 0}) or {}
    out = {}
    for k, v in VOID_DEFAULTS.items():
        val = doc.get(k, v)
        if isinstance(v, bool):
            out[k] = bool(val)
        elif isinstance(v, (int, float)):
            out[k] = max(0, float(val))
        else:
            out[k] = val
    out["alasan_min"] = max(1, min(50, int(out["alasan_min"] or 1)))
    return out

async def _void_policy(order, user, cfg=None):
    """Boleh/tidak membatalkan `order` oleh `user`, dan alasannya.

    Penentu utamanya adalah **status shift dari ORDER ITU SENDIRI** (bukan shift si pemanggil):
      - order pada shift yang MASIH TERBUKA  → boleh dibatalkan (kasir: hanya shift miliknya);
      - order pada shift yang sudah DITUTUP, atau order tanpa shift_id (dibuat saat tidak ada
        shift terbuka) → DIBLOKIR; hanya admin yang boleh melepas blokir (koreksi lintas shift).

    Mengembalikan dict:
      allowed       : boleh lanjut tanpa pelepasan blokir?
      block_reason  : pesan jelas untuk UI/HTTP bila tidak boleh
      need_force    : blokir yang BISA dilepas admin (koreksi lintas shift)
      can_force     : pemanggil berhak melepas blokir (role dasar admin / Super Admin)
      cross_shift   : order tidak berada di shift yang masih terbuka
    Dipakai bersama oleh endpoint void & pratinjau supaya UI dan server tidak pernah
    berbeda pendapat soal siapa boleh apa."""
    role_base, allowed_mods = await _access(user.get("role") or "kasir")
    is_admin = role_base == "admin" or await _is_super(user)
    if cfg is None:
        cfg = await _void_cfg()
    mod_ok = "void" in allowed_mods
    o_shift = order.get("shift_id") or None
    o_shift_doc = await db.shifts.find_one({"id": o_shift}, {"_id": 0, "status": 1}) if o_shift else None
    order_shift_open = bool(o_shift_doc and o_shift_doc.get("status") == "open")
    cross = bool(cfg["kasir_hanya_shift_berjalan"]) and not order_shift_open
    out = {"allowed": True, "block_reason": "", "need_force": False,
           "can_force": bool(is_admin and cfg["admin_boleh_lepas_blokir"]),
           "cross_shift": cross, "is_admin": is_admin, "mod_ok": mod_ok,
           "order_shift_open": order_shift_open}
    if is_admin:
        # admin: boleh, tetapi koreksi lintas shift tetap perlu pelepasan sadar + catatan
        if cross and cfg["admin_boleh_lepas_blokir"]:
            out.update({"allowed": False, "need_force": True,
                        "block_reason": ("Transaksi ini berada di shift yang sudah ditutup (atau tanpa shift) — "
                                         "koreksi lintas shift perlu dilepas blokirnya (hanya admin)")})
        return out
    if not mod_ok:
        return {**out, "allowed": False,
                "block_reason": "Akun ini tidak punya izin 'Void & Refund' (atur di Pengaturan → Roles & Izin)"}
    if not cfg["kasir_boleh_void"]:
        return {**out, "allowed": False,
                "block_reason": "Pembatalan oleh kasir dimatikan admin (Pengaturan → Aplikasi → Void & Refund)"}
    if cfg["kasir_hanya_shift_berjalan"]:
        # Shift kini BERSAMA (satu shift per toko per hari), jadi patokannya bukan lagi
        # "shift milik akun ini" melainkan "shift order itu masih terbuka?" — kasir mana pun
        # yang bekerja pada shift hari ini boleh membatalkan transaksinya.
        if not order_shift_open:
            return {**out, "allowed": False, "block_reason":
                    "Transaksi ini berada pada shift yang sudah ditutup. Minta admin membatalkannya "
                    "(koreksi lintas shift)"}
    mx = float(cfg["kasir_max_amount"] or 0)
    if mx > 0 and float(order.get("total") or 0) > mx:
        return {**out, "allowed": False,
                "block_reason": f"Nominal transaksi melebihi batas pembatalan kasir (Rp{mx:,.0f}) — minta admin"}
    return out

async def _void_side_effects(order, prev_status, cfg):
    """Efek samping pembatalan — dipanggil SEKALI oleh pemenang klaim atomik.

    Hanya berlaku bila order tadinya sudah LUNAS (bill terbuka belum menyentuh apa pun).
    Kas TIDAK dibuatkan catatan keluar (lihat catatan di atas)."""
    eff = {"restock": 0, "restock_qty": 0.0, "coupon_reverted": False, "points_reverted": 0.0}
    if prev_status != "paid":
        return eff
    if cfg.get("restock_retail", True):
        for it in order.get("items") or []:
            if it.get("type") == "retail" and it.get("product_id"):
                await db.products.update_one({"id": it["product_id"], "track_stock": True},
                                             {"$inc": {"stock": it["qty"]}})
                eff["restock"] += 1
                eff["restock_qty"] = round(eff["restock_qty"] + float(it.get("qty") or 0), 2)
    # balik pemakaian kupon (hanya bila benar-benar sudah dihitung saat lunas)
    if order.get("coupon_code") and order.get("coupon_counted"):
        cou = await db.coupons.find_one({"code": str(order["coupon_code"]).strip().upper()}, {"_id": 0})
        if cou:
            await db.coupons.update_one({"code": cou["code"]}, {"$inc": {"used_count": -1}})
            eff["coupon_reverted"] = True
        await db.orders.update_one({"id": order["id"]}, {"$unset": {"coupon_counted": 1}})
    # balik poin member: poin yang didapat ditarik, poin yang ditukar dikembalikan
    if order.get("member_id"):
        adj = {}
        if order.get("points_earned"):
            adj["points"] = -float(order["points_earned"])
            adj["total_spend"] = -float(order.get("total", 0))
        if order.get("redeem_points_used"):
            adj["points"] = adj.get("points", 0) + float(order["redeem_points_used"])
        if adj:
            await db.members.update_one({"id": order["member_id"]}, {"$inc": adj})
            eff["points_reverted"] = round(float(adj.get("points", 0)), 2)
    return eff

async def _void_impact(order, cfg=None):
    """Ringkasan dampak yang akan terjadi bila order ini dibatalkan (untuk pratinjau UI)."""
    if cfg is None:
        cfg = await _void_cfg()
    paid = order.get("status") == "paid"
    member_name = ""
    if order.get("member_id"):
        m = await db.members.find_one({"id": order["member_id"]}, {"_id": 0, "name": 1, "phone": 1})
        if m:
            member_name = m.get("name") or m.get("phone") or ""
    restock = 0.0
    items_retail = 0
    if paid and cfg.get("restock_retail", True):
        for it in order.get("items") or []:
            if it.get("type") == "retail":
                items_retail += 1
                restock = round(restock + float(it.get("qty") or 0), 2)
    vendor_ids = list({str(it.get("vendor_id")) for it in (order.get("items") or [])
                       if it.get("vendor_id")})
    vendor_share = round(sum(float(it.get("vendor_total") or 0) for it in (order.get("items") or [])
                             if it.get("type") == "vendor"), 2)
    settled = 0.0
    if vendor_ids:
        settled = round(sum((await _vendor_settled_map({"vendor_id": {"$in": vendor_ids}})).values()), 2)
    cash = _cash_paid(order) if paid else 0.0
    return {"prev_status": order.get("status"), "kind_default": "refund" if paid else "void",
            "amount": round(float(order.get("total") or 0), 2),
            "items_count": len(order.get("items") or []),
            "cash_reduction": round(cash, 2),
            "restock_items": items_retail, "restock_qty": restock,
            "coupon": order.get("coupon_code") if (order.get("coupon_counted") and order.get("coupon_code")) else "",
            "coupon_discount": round(float(order.get("coupon_discount") or 0), 2) if order.get("coupon_counted") else 0.0,
            "points_earned_revert": round(float(order.get("points_earned") or 0), 2) if order.get("member_id") else 0.0,
            "points_redeem_back": round(float(order.get("redeem_points_used") or 0), 2) if order.get("member_id") else 0.0,
            "member_name": member_name,
            "vendor_share_removed": vendor_share,
            # peringatan: bagi hasil vendor untuk transaksi ini sudah pernah dibayar
            "vendor_settled_total": settled,
            "vendor_settled_warning": settled > 0,
            "payment_method": order.get("payment_method_name") or ""}

@api.get("/orders/{oid}/void-preview")
async def void_preview(oid: str, user: dict = Depends(require_any_module("void"))):
    """Pratinjau sebelum konfirmasi: boleh/tidak, kenapa diblokir, butuh lepas blokir, dan dampaknya."""
    o = await db.orders.find_one({"id": oid}, {"_id": 0})
    if not o:
        raise HTTPException(404, "Order tidak ditemukan")
    cfg = await _void_cfg()
    polis = await _void_policy(o, user, cfg)
    already = o["status"] in ("void", "refunded")
    return {"order_number": o.get("order_number"), "status": o.get("status"),
            "already_voided": already,
            "can": bool(polis["allowed"]) and not already,
            "need_force": bool(polis["need_force"]),
            "can_force": bool(polis["can_force"]),
            "cross_shift": bool(polis["cross_shift"]),
            "block_reason": "Order sudah dibatalkan/refund" if already else polis["block_reason"],
            "alasan_min": cfg["alasan_min"], "wajib_alasan": cfg["wajib_alasan"],
            "kasir_boleh_void": cfg["kasir_boleh_void"],
            "kasir_max_amount": cfg["kasir_max_amount"],
            "impact": await _void_impact(o, cfg)}

@api.get("/settings/void")
async def get_void_settings(user: dict = Depends(get_current_user)):
    return await _void_cfg()

@api.put("/settings/void")
async def put_void_settings(body: dict, admin: dict = Depends(require_admin)):
    clean = {}
    for k, v in (body or {}).items():
        if k not in VOID_ALLOWED:
            continue
        if isinstance(VOID_DEFAULTS[k], bool):
            clean[k] = bool(v)
        else:
            try:
                clean[k] = max(0, float(v))
            except (TypeError, ValueError):
                continue
    await db.settings.update_one({"_id": "void"}, {"$set": clean}, upsert=True)
    return await _void_cfg()

@api.get("/voids")
async def list_voids(start: Optional[str] = None, end: Optional[str] = None,
                     cashier_id: Optional[str] = None, kind: Optional[str] = None,
                     cross_shift: Optional[bool] = None, shift_id: Optional[str] = None,
                     q: Optional[str] = None, limit: int = 200, skip: int = 0,
                     user: dict = Depends(require_any_module("void"))):
    """Riwayat void/refund untuk halaman 'Void & Refund' (filter kasir/tanggal/jenis/lintas shift)."""
    s = start or wib_today()
    e = end or s
    s_utc, _ = wib_day_range(s)
    _, e_utc = wib_day_range(e)
    flt = {"status": {"$in": ["void", "refunded"]}, "created_at": {"$gte": s_utc, "$lt": e_utc}}
    if cashier_id:
        flt["cashier_id"] = cashier_id
    if shift_id:
        flt["shift_id"] = shift_id
    rows = await db.orders.find(flt, {"_id": 0}).sort("voided_at", -1).to_list(5000)
    # audit berguna untuk alasan/pelaku/shift asal (data lama mungkin belum punya audit)
    logs = await db.audit_logs.find({"order_id": {"$in": [r["id"] for r in rows]}}, {"_id": 0}).to_list(5000)
    by_order = {}
    for lg in logs:
        by_order.setdefault(lg.get("order_id"), lg)
    out = []
    mid_name = {}
    mids = list({r["member_id"] for r in rows if r.get("member_id")})
    if mids:
        for m in await db.members.find({"id": {"$in": mids}}, {"_id": 0, "id": 1, "name": 1, "phone": 1}).to_list(1000):
            mid_name[m["id"]] = m.get("name") or m.get("phone") or ""
    for r in rows:
        lg = by_order.get(r["id"]) or {}
        rkind = lg.get("kind") or r.get("void_kind") or ("refund" if r.get("status") == "refunded" else "void")
        rcross = bool(lg.get("cross_shift") or (r.get("void_force") or {}).get("cross_shift"))
        if kind and rkind != kind:
            continue
        if cross_shift is not None and rcross != bool(cross_shift):
            continue
        if q and str(q).lower() not in str(r.get("order_number") or "").lower():
            continue
        out.append({"id": r["id"], "order_number": r.get("order_number"), "status": r.get("status"),
                    "kind": rkind, "amount": round(float(r.get("total") or 0), 2),
                    "items_count": len(r.get("items") or []),
                    "order_type": r.get("order_type"),
                    "cashier_id": r.get("cashier_id"), "cashier_name": r.get("cashier_name"),
                    "created_at": r.get("created_at"), "voided_at": r.get("voided_at") or lg.get("at"),
                    "reason": lg.get("reason") or r.get("void_reason") or "",
                    "by": lg.get("by") or r.get("voided_by") or "",
                    "prev_status": lg.get("prev_status") or r.get("void_prev_status") or "",
                    "shift_id": lg.get("order_shift_id") or r.get("void_shift_id"),
                    "voided_in_shift_id": lg.get("voided_in_shift_id") or r.get("voided_in_shift_id"),
                    "cross_shift": rcross,
                    "force_note": lg.get("force_note") or (r.get("void_force") or {}).get("note", ""),
                    "payment_method": r.get("payment_method_name") or "",
                    "payment_splits": r.get("payment_splits"),
                    "member_name": mid_name.get(r.get("member_id")) or "",
                    "audit_effects": lg.get("effects") or {}})
    total = len(out)
    summary = {"count": total,
               "void_count": sum(1 for x in out if x["kind"] == "void"),
               "refund_count": sum(1 for x in out if x["kind"] == "refund"),
               "amount": round(sum(x["amount"] for x in out), 2),
               "cross_shift_count": sum(1 for x in out if x["cross_shift"]),
               "by_cashier": []}
    bc = {}
    for x in out:
        k = x["cashier_name"] or "-"
        d = bc.setdefault(k, {"cashier_name": k, "cashier_id": x["cashier_id"], "count": 0, "amount": 0.0})
        d["count"] += 1
        d["amount"] = round(d["amount"] + x["amount"], 2)
    summary["by_cashier"] = sorted(bc.values(), key=lambda z: z["amount"], reverse=True)
    cashiers = {}
    for x in out:
        if x["cashier_id"]:
            cashiers[x["cashier_id"]] = x["cashier_name"] or "-"
    rows_page = out[int(skip or 0): int(skip or 0) + max(1, min(1000, int(limit or 200)))]
    return {"rows": rows_page, "summary": summary, "total": total,
            "start": s, "end": e, "cashiers": [{"id": k, "name": v} for k, v in cashiers.items()]}

@api.post("/orders/{oid}/void")
async def void_order(oid: str, body: VoidIn, user: dict = Depends(require_any_module("void"))):
    """Batalkan / refund order SELURUHNYA dengan jejak audit.

    Aturan (dokumen: docs/RANCANGAN-VOID-PESANAN.md):
      - kasir boleh void SENDIRI, tetapi HANYA order pada shift yang sedang terbuka;
      - order pada shift yang sudah ditutup (atau tanpa shift) DIBLOKIR — hanya admin
        (role dasar admin / Super Admin) yang bisa melepas blokir secara sadar dengan catatan;
      - alasan wajib, sekali void saja (klaim atomik, efek samping tidak bisa dobel);
      - kas TIDAK dibuatkan catatan keluar (kalau dibuat, uang terhitung dua kali).
    """
    o = await db.orders.find_one({"id": oid})
    if not o:
        raise HTTPException(404, "Order tidak ditemukan")
    if o["status"] in ("void", "refunded"):
        raise HTTPException(400, "Order sudah dibatalkan/refund")
    cfg = await _void_cfg()
    reason = (body.reason or "").strip()
    polis = await _void_policy(o, user, cfg)
    if polis["need_force"]:
        # Blokir yang BISA dilepas admin (koreksi lintas shift): butuh aksi sadar + catatan.
        if not polis["can_force"]:
            raise HTTPException(403, "Hanya admin yang boleh melepas blokir koreksi lintas shift")
        if not body.force_cross_shift:
            raise HTTPException(400, polis["block_reason"])
        if len((body.force_note or "").strip()) < 3:
            raise HTTPException(400, "Catatan wajib diisi saat melepas blokir koreksi lintas shift")
    elif not polis["allowed"]:
        raise HTTPException(403, polis["block_reason"])
    if cfg["wajib_alasan"] and len(reason) < max(1, int(cfg["alasan_min"] or 1)):
        raise HTTPException(400, f"Alasan wajib diisi (minimal {int(cfg['alasan_min'])} huruf)")

    prev_status = o["status"]
    new_status = "refunded" if body.action == "refund" else "void"
    now = now_utc().isoformat()
    # Shift tempat void INI dicatat = shift toko yang sedang terbuka hari ini
    # (shift bersama; tidak membuat shift baru hanya untuk mencatat void).
    cur_shift = await _open_shift_any(_scope_of_order_type(o.get("order_type")))
    upd = {"status": new_status, "voided_at": now, "void_reason": reason,
           "voided_by": user.get("name") or user.get("username") or "",
           "voided_by_id": user.get("id"),
           "void_kind": body.action, "void_prev_status": prev_status,
           "void_shift_id": o.get("shift_id") or None,
           "voided_in_shift_id": (cur_shift or {}).get("id"),
           "void_done": True}
    if polis["need_force"]:
        upd["void_force"] = {"cross_shift": True, "by": user.get("name") or "",
                             "by_id": user.get("id"), "at": now,
                             "note": (body.force_note or "").strip()}
    # Klaim ATOMIK (pola sama dengan _finalize_payment): hanya SATU request yang berhasil
    # mengubah status yang boleh menjalankan efek samping. Dua void bersamaan tidak lagi
    # mengembalikan stok / membalik poin dua kali.
    res = await db.orders.update_one({"id": oid, "status": prev_status}, {"$set": upd})
    if res.matched_count == 0:
        raise HTTPException(400, "Order sudah dibatalkan/refund")
    effects = await _void_side_effects(o, prev_status, cfg)
    audit = {"id": new_id(), "order_id": oid, "order_number": o["order_number"],
             "action": body.action, "kind": body.action, "reason": reason, "prev_status": prev_status,
             "by": user.get("name") or "", "by_id": user.get("id"), "amount": o.get("total") or 0,
             "items_count": len(o.get("items") or []),
             "order_shift_id": o.get("shift_id") or None,
             "voided_in_shift_id": (cur_shift or {}).get("id"),
             "cross_shift": bool(polis["need_force"]),
             "force_by": (user.get("name") or "") if polis["need_force"] else "",
             "force_note": (body.force_note or "").strip() if polis["need_force"] else "",
             "effects": effects, "at": now}
    await db.audit_logs.insert_one(dict(audit))
    _bump_rs_gen()
    _cache_del("products:")
    return {"status": new_status, "kind": body.action, "cross_shift": bool(polis["need_force"]),
            "effects": effects, "audit": audit}

@api.get("/audit-logs")
async def audit_logs(admin: dict = Depends(require_admin)):
    return await db.audit_logs.find({}, {"_id": 0}).sort("at", -1).to_list(500)

# ================================================================== SHIFTS
@api.get("/shifts/current")
async def current_shift(user: dict = Depends(admin_or_kasir)):
    """Keadaan shift hari ini — SATU shift per toko (F&B & Retail), dipakai bersama semua akun.

    Mengembalikan null bila belum ada shift terbuka; kalau ada, memuat ringkasan F&B & Retail,
    siapa yang membukanya, dan akun-akun yang ikut memakai shift ini."""
    return await _session_view()

@api.post("/shifts/open")
async def open_shift(body: ShiftOpenIn, user: dict = Depends(admin_or_kasir)):
    """Buka shift HARIAN dengan SATU tombol → membuat shift F&B dan Retail sekaligus.

    Kas awal F&B & Retail terpisah. Akun yang membuka dicatat (opened_by); akun lain
    langsung memakai shift ini tanpa membuka shift baru (satu shift per toko per hari)."""
    opens = await _open_shifts()
    if opens:
        who = opens[0].get("opened_by") or opens[0].get("cashier_name") or "akun lain"
        raise HTTPException(400, f"Shift hari ini sudah dibuka oleh {who} — langsung pakai saja, "
                                 f"atau tutup dulu bila ingin membuka shift baru")
    fnb_cash = body.opening_cash_fnb if body.opening_cash_fnb is not None else body.opening_cash
    retail_cash = body.opening_cash_retail if body.opening_cash_retail is not None else 0
    now = now_utc().isoformat()
    date = wib_today()
    session_id = new_id()
    created = []
    for scope, cash in (("fnb", fnb_cash), ("retail", retail_cash)):
        if await _open_shift(scope):
            continue    # toko ini sudah dibuka (mis. shift lama sebelum pemisahan F&B/Retail)
        doc = {"id": new_id(), "cashier_id": user["id"], "cashier_name": user["name"],
               "opened_by": user.get("name") or "", "opened_by_id": user.get("id"),
               "opening_cash": round(float(cash or 0), 2), "status": "open",
               "opened_at": now, "closed_at": None,
               "scope": scope, "session_id": session_id, "date": date,
               "open_key": _shift_open_key(scope)}
        try:
            await db.shifts.insert_one(dict(doc))
        except Exception:
            # Balapan dua perangkat: shift toko ini baru saja dibuat yang lain → pakai itu.
            continue
        doc.pop("_id", None)
        created.append(doc)
    view = await _session_view()
    if not view:
        raise HTTPException(400, "Shift gagal dibuka — coba lagi")
    view["created"] = [_shift_brief(c) for c in created]
    return view

@api.post("/shifts/close")
async def close_shift(body: ShiftCloseIn, user: dict = Depends(admin_or_kasir)):
    """Tutup shift F&B & Retail SEKALIGUS (kas akhir per toko + pengeluaran + bagi hasil vendor).

    Yang perlu diingat:
      - pengeluaran boleh diisi kapan saja selama shift buka (halaman Pengeluaran & Kas)
        DAN di sini saat tutup shift — dibuat sebagai kas keluar shift toko terkait;
      - nominal "Diberikan" ke vendor SATU PINTU: setiap nominal > 0 otomatis dibuatkan
        dokumen Settlement Vendor + kas keluar (tidak mungkin tercatat dua kali);
      - akun yang menutup dicatat (closed_by), akun yang membuka sudah tercatat sejak awal;
      - PERINGATAN pengeluaran: bila laporan pengeluaran harian sama sekali belum diisi
        (F&B & Retail kosong) dan saat tutup shift ini juga tidak ada pengeluaran yang
        dimasukkan, wajib dikonfirmasi sadar (ack_no_expense) — kalau tidak, tutup shift
        ditolak 400 supaya tidak ada laporan tanpa keterangan belanja;
      - AUTO-KIRIM WA: laporan shift langsung dikirim ke nomor laporan (Pengaturan →
        WhatsApp & Laporan; bawaan AKTIF, bisa dimatikan). Kegagalan WA TIDAK
        menggagalkan penutupan shift.
    """
    shifts = await _open_shifts()
    if not shifts:
        raise HTTPException(400, "Tidak ada shift terbuka")
    by_scope = {_shift_scope_of(s): s for s in shifts}
    fnb_shift = by_scope.get("fnb")
    retail_shift = by_scope.get("retail")
    # --- validasi masukan SEBELUM ada perubahan apa pun (shift tetap terbuka bila ditolak)
    pays = []
    for vp in (body.vendor_payments or []):
        vid = str((vp or {}).get("vendor_id") or "").strip()
        paid = round(float((vp or {}).get("paid") or 0), 2)
        if not vid or paid <= 0:
            continue
        pays.append((vid, paid))
    await _settlement_validate_paid([p[0] for p in pays])
    expenses = []
    for ex in (body.expenses or []):
        sc = str((ex or {}).get("scope") or "").strip().lower()
        if sc not in SHIFT_SCOPES:
            raise HTTPException(400, "Toko pengeluaran harus F&B atau Retail")
        try:
            amt = round(float((ex or {}).get("amount") or 0), 2)
        except (TypeError, ValueError):
            raise HTTPException(400, "Nominal pengeluaran tidak valid")
        if amt <= 0:
            raise HTTPException(400, "Nominal pengeluaran harus lebih dari 0")
        expenses.append({"scope": sc, "amount": amt,
                         "category": (str((ex or {}).get("category") or "Lainnya")).strip() or "Lainnya",
                         "note": str((ex or {}).get("note") or "").strip()})
    # Uang transport: pengeluaran WAJIB (tidak boleh 0), selalu dibebankan ke F&B.
    # Perangkat/bundle lama yang belum mengirim nominal → dipakai nominal dari
    # Pengaturan → Aplikasi (transport_amount) agar tutup shift tetap bisa dilakukan.
    if body.transport is None:
        transport = round(float((await _business()).get("transport_amount") or 0), 2)
    else:
        try:
            transport = round(float(body.transport), 2)
        except (TypeError, ValueError):
            raise HTTPException(400, "Nominal uang transport tidak valid")
    if transport <= 0:
        raise HTTPException(400, "Uang transport wajib diisi dan tidak boleh 0 — "
                                 "atur nominal bawaan di Pengaturan → Aplikasi")
    expenses.append({"scope": "fnb", "amount": transport, "category": SHIFT_TRANSPORT_CAT,
                     "note": "Uang transport (tutup shift)", "is_transport": True})
    # PERINGATAN pengeluaran harian: uang transport TIDAK dihitung (itu pengeluaran otomatis
    # wajib, bukan laporan belanja). Bila hari ini belum ada pengeluaran sama sekali DAN form
    # tutup shift juga tidak mengisi pengeluaran, kasir harus mengonfirmasi sadar.
    day_exp = await _shift_day_expenses(shifts[0].get("date")
                                        or wib_day_of(shifts[0].get("opened_at") or now_utc().isoformat()))
    manual_rows = [e for e in expenses if not e.get("is_transport")]
    no_expense = bool(day_exp.get("empty")) and not manual_rows
    if no_expense and not body.ack_no_expense:
        raise HTTPException(400, "Laporan pengeluaran harian belum diisi (F&B & Retail kosong). "
                                 "Isi pengeluaran hari ini, atau konfirmasi sadar bahwa memang "
                                 "tidak ada pengeluaran untuk melanjutkan tutup shift.")
    fnb_close = body.closing_cash_fnb if body.closing_cash_fnb is not None else body.closing_cash
    retail_close = body.closing_cash_retail if body.closing_cash_retail is not None else 0
    # --- klaim ATOMIK per toko: klik ganda / dua perangkat tidak bisa menggandakan pembayaran
    now = now_utc().isoformat()
    closed_ids = []
    for s, cash in ((fnb_shift, fnb_close), (retail_shift, retail_close)):
        if not s:
            continue
        claim = await db.shifts.update_one({"id": s["id"], "status": "open"},
                                          {"$set": {"status": "closed", "closed_at": now,
                                                    "closing_cash": round(float(cash or 0), 2),
                                                    "closed_by": user.get("name") or "",
                                                    "closed_by_id": user.get("id")},
                                           "$unset": {"open_key": ""}})
        if claim.matched_count == 0:
            raise HTTPException(400, f"Shift {_shift_scope_label(_shift_scope_of(s))} sudah ditutup perangkat lain")
        closed_ids.append(s["id"])
    session_id = shifts[0].get("session_id") or shifts[0].get("id")
    # --- pengeluaran yang diisi saat tutup shift (kas keluar toko terkait)
    expense_rows = []
    for ex in expenses:
        target = fnb_shift if ex["scope"] == "fnb" else retail_shift
        doc = {"id": new_id(), "type": "out", "amount": ex["amount"], "category": ex["category"],
               "note": ex["note"] or "Diisi saat tutup shift", "scope": ex["scope"],
               "cashier_id": user.get("id"), "cashier_name": user.get("name") or "",
               "shift_id": (target or {}).get("id"), "session_id": session_id,
               "source": "shift_close", "created_at": now}
        await db.cash_movements.insert_one(dict(doc))
        doc.pop("_id", None)
        expense_rows.append(doc)
    # --- pembayaran vendor (satu pintu: settlement + kas keluar)
    day = (shifts[0].get("opened_at") and wib_day_of(shifts[0]["opened_at"])) or wib_today()
    created = []
    for vid, paid in pays:
        doc = await _create_settlement(vid, day, paid, user, create_cash_out=True,
                                       shift_id=(fnb_shift or retail_shift or {}).get("id"),
                                       source="shift_close",
                                       note=f"Pembayaran saat tutup shift {day}")
        created.append({k: doc.get(k) for k in ("id", "settlement_no", "vendor_id", "vendor_name",
                                                "paid", "carry_in", "total_due", "carry_out")})
    # --- laporan dihitung SETELAH pengeluaran & settlement dibuat
    fresh = await db.shifts.find({"id": {"$in": closed_ids}}, {"_id": 0}).to_list(5)
    reports = await _session_reports(fresh)
    combined = _combine_reports(reports)
    vendor_rows = combined.get("vendor_share") or []
    # Pembayaran NYATA per vendor pada sesi ini (termasuk yang baru dibuat di atas) —
    # `_shift_report` hanya tahu bagian yang SEHARUSNYA dibayar.
    settled_map = await _vendor_settled_map({"shift_id": {"$in": closed_ids}})
    total_share = 0.0
    total_paid = 0.0
    for v in vendor_rows:
        v["paid"] = settled_map.get(str(v["vendor_id"]), 0.0)
        v["difference"] = round(v["share"] - v["paid"], 2)
        v["outlet_share"] = round(v["gross"] - v["share"], 2)
        total_share += v["share"]
        total_paid += v.get("paid", 0)
    combined["vendor_share"] = vendor_rows
    combined["vendor_total_share"] = round(total_share, 2)
    combined["vendor_total_paid"] = round(total_paid, 2)
    combined["vendor_total_difference"] = round(total_share - total_paid, 2)
    combined["vendor_total_outlet"] = round(sum(v.get("outlet_share", 0) for v in vendor_rows), 2)
    combined["expenses_created"] = expense_rows
    combined["vendor_settlements_created"] = created
    # Catatan pengeluaran harian (dipakai laporan, cetak, WA, dan UI)
    combined["expenses_empty"] = no_expense
    combined["expenses_ack"] = bool(no_expense and body.ack_no_expense)
    combined["expenses_fnb"] = day_exp.get("fnb") or {"count": 0, "total": 0.0}
    combined["expenses_retail"] = day_exp.get("retail") or {"count": 0, "total": 0.0}
    for s in fresh:
        rep = reports.get(_shift_scope_of(s))
        if rep is not None:
            rep["expenses_empty"] = no_expense
            rep["expenses_ack"] = combined["expenses_ack"]
            if _shift_scope_of(s) == "fnb":
                rep["expenses_fnb"] = combined["expenses_fnb"]
            else:
                rep["expenses_retail"] = combined["expenses_retail"]
            await db.shifts.update_one({"id": s["id"]}, {"$set": {"report": rep}})
    _bump_rs_gen()
    try:
        import asyncio as _aio
        _aio.create_task(_fire_webhook("shift.closed", {
            "shift_id": (fnb_shift or {}).get("id"), "session_id": session_id,
            "cashier": shifts[0].get("opened_by") or shifts[0].get("cashier_name"),
            "closed_by": user.get("name"),
            "total_sales": combined.get("total_sales"), "net_cash": combined.get("net_cash"),
        }))
    except Exception as e:
        logger.error(f"webhook shift.closed task gagal: {e}")
    view = _closed_session_view(fresh, user)
    # --- AUTO-KIRIM laporan shift ke WhatsApp (nomor laporan harian; bawaan AKTIF).
    # Dijalankan SETELAH laporan tersimpan, dan TIDAK PERNAH menggagalkan penutupan shift.
    # `send_shift_wa` opsional: None = ikuti Pengaturan; False = lewati kirim; True = paksa kirim.
    want_wa = (await _shift_wa_auto_enabled()) if body.send_shift_wa is None else bool(body.send_shift_wa)
    if want_wa:
        wa = await _send_shift_wa_auto(session_id)
        view["wa_auto"] = wa
        try:
            await db.shifts.update_many({"id": {"$in": closed_ids}},
                                        {"$set": {"wa_auto": wa, "wa_auto_at": now_utc().isoformat()}})
        except Exception as e:
            logger.error(f"simpan status wa_auto gagal: {e}")
    else:
        view["wa_auto"] = {"enabled": False, "ok": False, "skipped": "dilewati"}
    view["report"] = combined
    view["reports"] = dict(reports)
    return view

def _closed_session_view(shifts, user=None):
    """Bentuk balikan tutup shift (kompatibel dengan UI lama yang membaca shift + report)."""
    fnb = next((s for s in shifts if _shift_scope_of(s) == "fnb"), None)
    retail = next((s for s in shifts if _shift_scope_of(s) == "retail"), None)
    anchor = fnb or retail or {}
    nm = anchor.get("opened_by") or anchor.get("cashier_name") or ""
    return {"id": anchor.get("session_id") or anchor.get("id"),
            "session_id": anchor.get("session_id"), "status": "closed", "shared": True,
            "date": anchor.get("date"), "opened_at": anchor.get("opened_at"),
            "closed_at": anchor.get("closed_at"), "opened_by": nm, "cashier_name": nm,
            "closed_by": anchor.get("closed_by") or (user or {}).get("name") or "",
            "closed_by_id": anchor.get("closed_by_id") or (user or {}).get("id"),
            "fnb": _shift_brief(fnb), "retail": _shift_brief(retail),
            "shift_ids": {"fnb": (fnb or {}).get("id"), "retail": (retail or {}).get("id")}}

async def _session_reports(shifts):
    """Laporan per toko (F&B & Retail) untuk shift-shift satu sesi."""
    out = {}
    for s in shifts:
        out[_shift_scope_of(s)] = await _shift_report(s)
    return out

# Kunci angka yang dijumlahkan saat menggabungkan laporan F&B + Retail.
_SHIFT_INT_KEYS = ("order_count", "void_count", "void_refund_count")

def _combine_reports(reports):
    """Gabungkan laporan per toko menjadi satu laporan sesi (dipakai WA, cetak, ringkasan)."""
    reps = [r for r in (reports or {}).values() if r]
    fnb = (reports or {}).get("fnb") or {}
    retail = (reports or {}).get("retail") or {}

    def s(key, as_int=False):
        tot = sum(float(r.get(key) or 0) for r in reps)
        return int(tot) if as_int else round(tot, 2)

    by_type = {"dine_in": 0, "take_away": 0, "retail": 0}
    for r in reps:
        for k in by_type:
            by_type[k] = round(by_type[k] + float((r.get("by_type") or {}).get(k) or 0), 2)
    by_pm = {}
    for r in reps:
        for k, v in (r.get("by_payment") or {}).items():
            by_pm[k] = round(by_pm.get(k, 0) + float(v or 0), 2)
    void_rows = []
    for r in reps:
        void_rows += list(r.get("void_rows") or [])
    return {
        "order_count": s("order_count", True), "total_sales": s("total_sales"),
        "by_type": by_type, "by_payment": by_pm,
        "void_count": s("void_count", True), "void_amount": s("void_amount"),
        "void_refund_count": s("void_refund_count", True), "void_rows": void_rows,
        "fnb_total": s("fnb_total"), "retail_total": s("retail_total"),
        "gross_profit_fnb": s("gross_profit_fnb"), "gross_profit_retail": s("gross_profit_retail"),
        "cash_out": s("cash_out"), "cash_out_fnb": s("cash_out_fnb"), "cash_out_retail": s("cash_out_retail"),
        # rincian metode bayar + sisa kas tunai (setelah pengeluaran) per toko
        "cash_sales_fnb": s("cash_sales_fnb"), "cash_sales_retail": s("cash_sales_retail"),
        "sisa_cash_fnb": s("sisa_cash_fnb"), "sisa_cash_retail": s("sisa_cash_retail"),
        "sisa_cash": s("sisa_cash"), "transport": s("transport"),
        "expected_cash": s("expected_cash"),
        "net_cash_fnb": s("net_cash_fnb"), "net_cash_retail": s("net_cash_retail"), "net_cash": s("net_cash"),
        "opening_cash_fnb": round(float(fnb.get("opening_cash") or 0), 2),
        "opening_cash_retail": round(float(retail.get("opening_cash") or 0), 2),
        "closing_cash_fnb": round(float(fnb.get("closing_cash") or 0), 2),
        "closing_cash_retail": round(float(retail.get("closing_cash") or 0), 2),
        "vendor_share": fnb.get("vendor_share") or [],
        "vendor_expected_share": s("vendor_expected_share"),
        "vendor_total_share": s("vendor_total_share"), "vendor_total_paid": s("vendor_total_paid"),
        "vendor_settled_paid": s("vendor_settled_paid"),
        "vendor_settled_rows": fnb.get("vendor_settled_rows") or [],
        # Peringatan pengeluaran harian (kosong = laporan belanja hari itu belum diisi)
        "expenses_empty": bool(fnb.get("expenses_empty") or retail.get("expenses_empty")),
        "expenses_ack": bool(fnb.get("expenses_ack") or retail.get("expenses_ack")),
        "expenses_fnb": fnb.get("expenses_fnb") or {"count": 0, "total": 0.0},
        "expenses_retail": retail.get("expenses_retail") or {"count": 0, "total": 0.0},
        "variance_report": fnb.get("variance_report") or retail.get("variance_report") or None,
    }

async def _vendor_share_from_orders(orders):
    """Kumpulkan bagian vendor dari order (per vendor): gross & share (yang seharusnya) + detail per produk."""
    per = {}
    for o in orders:
        for it in o.get("items", []):
            if it.get("type") == "vendor" and it.get("vendor_id"):
                vid = it["vendor_id"]
                v = per.get(vid)
                if not v:
                    v = {"vendor_id": vid, "vendor_name": it.get("vendor_name") or "Vendor",
                         "gross": 0.0, "share": 0.0, "_items": {}}
                    per[vid] = v
                line = it["price"] * it["qty"]
                v["gross"] = round(v["gross"] + line, 2)
                v["share"] = round(v["share"] + (it.get("vendor_total") or 0), 2)
                im = v["_items"].setdefault(it.get("product_id") or it["name"], {
                    "product_id": it.get("product_id"), "name": it["name"],
                    "qty": 0, "gross": 0.0, "vendor_share": 0.0})
                im["qty"] += it["qty"]
                im["gross"] = round(im["gross"] + line, 2)
                im["vendor_share"] = round(im["vendor_share"] + (it.get("vendor_total") or 0), 2)
    # isi nama vendor dari koleksi bila belum ada di item
    for vid in list(per.keys()):
        if per[vid]["vendor_name"] == "Vendor":
            vd = await db.vendors.find_one({"id": vid}, {"_id": 0, "name": 1})
            if vd:
                per[vid]["vendor_name"] = vd["name"]
        per[vid]["items"] = [{"product_id": x["product_id"], "name": x["name"], "qty": x["qty"],
                              "gross": round(x["gross"], 2), "vendor_share": round(x["vendor_share"], 2)}
                             for x in sorted(per[vid]["_items"].values(), key=lambda y: y["gross"], reverse=True)]
        per[vid].pop("_items", None)
    return list(per.values())

async def _shift_report(shift):
    orders = await db.orders.find({"shift_id": shift["id"], "status": "paid"}, {"_id": 0}).to_list(5000)
    by_type = {"dine_in": 0, "take_away": 0, "retail": 0}
    by_pm = {}
    total = 0
    cost_fnb = 0.0
    cost_retail = 0.0
    for o in orders:
        by_type[o["order_type"]] = by_type.get(o["order_type"], 0) + o["total"]
        for _pn, _pt, _pa in _order_pay_parts(o):
            by_pm[_pn] = by_pm.get(_pn, 0) + _pa
        total += o["total"]
        for it in o.get("items", []):
            if it.get("type") == "retail":
                cost_retail += (it.get("cost") or 0) * it["qty"]
            else:
                cost_fnb += (it.get("cost") or 0) * it["qty"]
    fnb_total = by_type["dine_in"] + by_type["take_away"]
    retail_total = by_type["retail"]
    cash = sum(_cash_paid(o) for o in orders)
    # Kas keluar (pengeluaran) per scope — TANPA kas masuk (keuangan murni dari penjualan & pengeluaran)
    moves = await db.cash_movements.find({"shift_id": shift["id"]}, {"_id": 0}).to_list(2000)
    cash_out = sum(m["amount"] for m in moves if m["type"] == "out")
    def _out_scope(sc):
        return round(sum(m["amount"] for m in moves if m["type"] == "out" and m.get("scope") == sc), 2)
    out_fnb = _out_scope("fnb"); out_retail = _out_scope("retail")
    # Uang transport (kategori khusus) pada shift ini — pengeluaran wajib saat tutup shift.
    transport = round(sum(m["amount"] for m in moves
                          if m["type"] == "out" and (m.get("category") or "") == SHIFT_TRANSPORT_CAT), 2)
    # Sisa kas TUNAI = penjualan tunai toko − pengeluaran toko (uang laci setelah belanja).
    _sc = _shift_scope_of(shift)
    cash_sales_fnb = round(cash, 2) if _sc == "fnb" else 0.0
    cash_sales_retail = round(cash, 2) if _sc == "retail" else 0.0
    sisa_cash_fnb = round(cash_sales_fnb - out_fnb, 2)
    sisa_cash_retail = round(cash_sales_retail - out_retail, 2)
    vendor_rows = await _vendor_share_from_orders(orders)
    vendor_expected = round(sum(v.get("share", 0) for v in vendor_rows), 2)
    # Bagi hasil yang dibayar lewat modul Settlement Vendor selama shift ini (sudah masuk kas keluar di atas).
    settled_docs = await db.vendor_settlements.find({"shift_id": shift["id"], "voided": {"$ne": True}},
                                                    {"_id": 0, "vendor_id": 1, "vendor_name": 1, "paid": 1,
                                                     "settlement_no": 1}).to_list(500)
    settled_paid = round(sum(float(x.get("paid") or 0) for x in settled_docs), 2)
    # CATATAN: "diberikan ke vendor" (paid) belum diketahui di tahap ini — diisi saat penutupan
    # (close_shift). Uang bersih dihitung ulang di close_shift SETELAH paid diketahui.
    # Uang bersih per toko: penjualan toko - pengeluaran scope toko - vendor yang dibayar.
    net_cash_fnb0 = round(fnb_total - out_fnb, 2)          # placeholder; dihitung ulang saat tutup
    net_cash_retail0 = round(retail_total - out_retail, 2)  # vendor hanya ada di alur F&B
    # Pembatalan/refund pada shift ini: penjualan tunai ikut turun, jadi ANGKA void harus
    # terlihat supaya kas laci tidak terkesan "kurang" tanpa penjelasan.
    void_docs = await db.orders.find({"shift_id": shift["id"], "status": {"$in": ["void", "refunded"]}},
                                     {"_id": 0, "id": 1, "order_number": 1, "total": 1, "status": 1,
                                      "void_kind": 1, "void_reason": 1, "voided_by": 1, "voided_at": 1}
                                     ).sort("voided_at", -1).to_list(2000)
    void_rows = []
    for v in void_docs:
        kind = v.get("void_kind") or ("refund" if v.get("status") == "refunded" else "void")
        void_rows.append({"id": v.get("id"), "order_number": v.get("order_number"), "kind": kind,
                          "amount": round(float(v.get("total") or 0), 2),
                          "reason": v.get("void_reason") or "", "by": v.get("voided_by") or "",
                          "at": v.get("voided_at")})
    void_amount = round(sum(v["amount"] for v in void_rows), 2)
    return {"order_count": len(orders), "total_sales": round(total, 2), "by_type": by_type,
            # identitas toko & kas shift ini (dipakai laporan gabungan F&B+Retail)
            "scope": _shift_scope_of(shift),
            "opening_cash": round(float(shift.get("opening_cash") or 0), 2),
            "closing_cash": round(float(shift.get("closing_cash") or 0), 2),
            # pembatalan pada shift ini (tidak termasuk penjualan karena status bukan 'paid')
            "void_count": len(void_rows), "void_amount": void_amount,
            "void_refund_count": sum(1 for v in void_rows if v["kind"] == "refund"),
            "void_rows": void_rows,
            "fnb_total": round(fnb_total, 2), "retail_total": round(retail_total, 2),
            # Laba kotor F&B = pendapatan F&B − HPP F&B − bagian vendor (omzet titipan milik vendor)
            "gross_profit_fnb": round(fnb_total - cost_fnb - vendor_expected, 2),
            "gross_profit_retail": round(retail_total - cost_retail, 2),
            "by_payment": by_pm,
            # Perkiraan kas = kas awal + penjualan tunai − uang keluar
            "expected_cash": round(shift["opening_cash"] + cash - cash_out, 2),
            "cash_out": round(cash_out, 2),
            "cash_out_fnb": out_fnb, "cash_out_retail": out_retail,
            # Rincian metode pembayaran (by_payment) + sisa kas TUNAI setelah pengeluaran
            "cash_sales_fnb": cash_sales_fnb, "cash_sales_retail": cash_sales_retail,
            "sisa_cash_fnb": sisa_cash_fnb, "sisa_cash_retail": sisa_cash_retail,
            "sisa_cash": round(sisa_cash_fnb + sisa_cash_retail, 2),
            "transport": transport,
            "vendor_share": vendor_rows,
            "vendor_expected_share": vendor_expected,
            "vendor_total_share": round(sum(v["share"] for v in vendor_rows), 2),
            "vendor_total_paid": 0.0,  # diisi close_shift setelah kasir input nominal diberikan
            # dibayar lewat modul Settlement Vendor (SUDAH tercatat sebagai kas keluar shift ini)
            "vendor_settled_paid": settled_paid, "vendor_settled_rows": settled_docs,
            "net_cash_fnb": net_cash_fnb0, "net_cash_retail": net_cash_retail0,
            "net_cash": round(net_cash_fnb0 + net_cash_retail0, 2)}

@api.get("/shifts/current/vendor")
async def shift_vendor_preview(user: dict = Depends(admin_or_kasir)):
    """Preview bagian vendor dari shift F&B yang sedang berjalan (untuk form penutupan)."""
    shift = await _open_shift("fnb") or await _open_shift("retail")
    if not shift:
        raise HTTPException(400, "Tidak ada shift terbuka")
    orders = await db.orders.find({"shift_id": shift["id"], "status": "paid"}, {"_id": 0}).to_list(5000)
    rows = await _vendor_share_from_orders(orders)
    day = (shift.get("opened_at") and wib_day_of(shift["opened_at"])) or wib_today()
    # Pembayaran HARI INI (shift apa pun, termasuk tanpa shift) dihitung supaya kasir tidak
    # membayar dua kali; pembayaran itu melunasi utang hari sebelumnya lebih dulu.
    settled_today = await _vendor_settled_map({"date": day})
    settled_shift = await _vendor_settled_map({"shift_id": shift["id"]})
    balances = await _vendor_balance(day, before=True)
    for r in rows:
        vid = str(r["vendor_id"])
        share = round(float(r.get("share") or 0), 2)
        paid_today = round(float(settled_today.get(vid, 0.0) or 0), 2)
        debt = max(0.0, round(float(balances.get(vid, 0.0) or 0), 2))   # utang sebelum hari ini
        paid_share = max(0.0, round(paid_today - debt, 2))              # yang menutup bagian hari ini
        r["share"] = share
        r["carry_in"] = debt
        r["paid_settled"] = paid_today
        r["paid_this_shift"] = round(float(settled_shift.get(vid, 0.0) or 0), 2)
        r["remaining"] = round(max(0.0, share - paid_share), 2)         # sisa bagi hasil hari ini
        r["due_total"] = round(debt + share - paid_today, 2)            # total masih harus diserahkan
    return {"vendors": rows, "date": day,
            "settled_total": round(sum(settled_today.values()), 2),
            "settled_shift_total": round(sum(settled_shift.values()), 2)}

@api.get("/shifts")
async def list_shifts(admin: dict = Depends(require_admin)):
    return await db.shifts.find({}, {"_id": 0}).sort("opened_at", -1).to_list(200)

@api.get("/shifts/history")
async def shift_history(admin: dict = Depends(admin_or_kasir)):
    """Histori shift tertutup — dikelompokkan PER SESI (F&B + Retail dalam satu baris),
    lengkap dengan nama akun yang membuka & menutup."""
    shifts = await db.shifts.find({"status": "closed"}, {"_id": 0}).sort("opened_at", -1).to_list(400)
    sessions = {}
    order = []
    for s in shifts:
        key = s.get("session_id") or s["id"]
        if key not in sessions:
            sessions[key] = []
            order.append(key)
        sessions[key].append(s)
    out = []
    for key in order:
        grp = sessions[key]
        fnb = next((x for x in grp if _shift_scope_of(x) == "fnb"), None)
        retail = next((x for x in grp if _shift_scope_of(x) == "retail"), None)
        reps = {k: (v.get("report") or {}) for k, v in (("fnb", fnb), ("retail", retail)) if v}
        r = _combine_reports(reps)
        anchor = fnb or retail or grp[0]
        opened = sorted([x.get("opened_at") or "" for x in grp])
        out.append({
            "id": key, "session_id": key,
            "fnb_shift_id": (fnb or {}).get("id"), "retail_shift_id": (retail or {}).get("id"),
            "cashier_name": anchor.get("opened_by") or anchor.get("cashier_name", "-"),
            "opened_by": anchor.get("opened_by") or anchor.get("cashier_name", "-"),
            "closed_by": anchor.get("closed_by") or "",
            "opened_at": opened[0] if opened else None, "closed_at": anchor.get("closed_at"),
            "opening_cash": r.get("opening_cash_fnb", 0), "closing_cash": (fnb or {}).get("closing_cash", 0),
            "opening_cash_fnb": r.get("opening_cash_fnb", 0), "opening_cash_retail": r.get("opening_cash_retail", 0),
            "closing_cash_fnb": (fnb or {}).get("closing_cash", 0),
            "closing_cash_retail": (retail or {}).get("closing_cash", 0),
            "total_sales": r.get("total_sales", 0), "order_count": r.get("order_count", 0),
            "fnb_total": r.get("fnb_total", 0), "retail_total": r.get("retail_total", 0),
            "expected_cash": r.get("expected_cash", 0), "net_cash": r.get("net_cash", 0),
            "net_cash_fnb": r.get("net_cash_fnb", 0), "net_cash_retail": r.get("net_cash_retail", 0),
            "cash_out": r.get("cash_out", 0),
            "cash_out_fnb": r.get("cash_out_fnb", 0), "cash_out_retail": r.get("cash_out_retail", 0),
            "cash_sales_fnb": r.get("cash_sales_fnb", 0), "cash_sales_retail": r.get("cash_sales_retail", 0),
            "sisa_cash_fnb": r.get("sisa_cash_fnb", 0), "sisa_cash_retail": r.get("sisa_cash_retail", 0),
            "sisa_cash": r.get("sisa_cash", 0), "transport": r.get("transport", 0),
            "vendor_total_share": r.get("vendor_total_share", 0),
            "vendor_total_paid": r.get("vendor_total_paid", 0),
            "vendor_settled_paid": r.get("vendor_settled_paid", 0),
            "expenses_empty": bool(r.get("expenses_empty")),
        })
    return {"shifts": out}

async def _shift_report_docs(sid):
    """Cari shift untuk cetak/kirim WA: terima ID SESI (F&B+Retail) maupun ID shift tunggal."""
    s = await db.shifts.find_one({"id": sid}, {"_id": 0})
    if s:
        grp = await db.shifts.find({"session_id": s.get("session_id") or s["id"]}, {"_id": 0}).to_list(10)
        return (grp or [s]), s
    grp = await db.shifts.find({"session_id": sid}, {"_id": 0}).to_list(10)
    if not grp:
        raise HTTPException(404, "Shift tidak ditemukan")
    return grp, (grp[0] if grp else None)

async def _shift_wa_report(sid):
    """Laporan gabungan sesi + nama pembuka/penutup + tanggal untuk template WA/cetak."""
    grp, anchor = await _shift_report_docs(sid)
    reports = {_shift_scope_of(x): (x.get("report") or {}) for x in grp}
    if len(grp) > 1 or not anchor.get("scope"):
        r = _combine_reports(reports)
    else:
        r = dict(anchor.get("report") or {})
        _sc = _shift_scope_of(anchor)
        r.setdefault("opening_cash_fnb", r.get("opening_cash", 0) if _sc == "fnb" else 0)
        r.setdefault("opening_cash_retail", r.get("opening_cash", 0) if _sc == "retail" else 0)
        r["opening_cash_fnb"] = round(float(r.get("opening_cash_fnb") or 0), 2)
        r["opening_cash_retail"] = round(float(r.get("opening_cash_retail") or 0), 2)
        r["closing_cash_fnb"] = round(float(anchor.get("closing_cash") or 0), 2) if _sc == "fnb" else 0
        r["closing_cash_retail"] = round(float(anchor.get("closing_cash") or 0), 2) if _sc == "retail" else 0
    fnb = next((x for x in grp if _shift_scope_of(x) == "fnb"), None)
    anchor2 = fnb or anchor
    r = dict(r)
    r["dibuka_oleh"] = anchor2.get("opened_by") or anchor2.get("cashier_name") or ""
    r["ditutup_oleh"] = anchor2.get("closed_by") or ""
    r["kasir"] = r["dibuka_oleh"]
    return r, anchor2

def _shift_report_lines(r):
    L = ["*LAPORAN SHIFT — Grand Aceh Kuliner*", ""]
    L.append(f"Total Penjualan: Rp{r.get('total_sales', 0):,.0f} ({r.get('order_count', 0)} order)")
    L.append(f"*F&B*: Rp{r.get('fnb_total', 0):,.0f}")
    L.append(f"  Dine-in: Rp{r.get('by_type', {}).get('dine_in', 0):,.0f}")
    L.append(f"  Take Away: Rp{r.get('by_type', {}).get('take_away', 0):,.0f}")
    L.append(f"*Retail*: Rp{r.get('retail_total', 0):,.0f}")
    L.append("")
    # Rincian metode pembayaran (Tunai/QRIS/Transfer/...) — permintaan pemilik
    if r.get("by_payment"):
        L.append("Metode Bayar:")
        for k, v in r["by_payment"].items():
            L.append(f"   - {k}: Rp{float(v or 0):,.0f}")
        L.append("")
    if r.get("void_count"):
        L.append(f"Pembatalan/Refund: {r.get('void_count')} transaksi (Rp{r.get('void_amount', 0):,.0f}) — tidak termasuk penjualan")
    L.append(f"Pengeluaran F&B: Rp{r.get('cash_out_fnb', 0):,.0f}")
    L.append(f"Pengeluaran Retail: Rp{r.get('cash_out_retail', 0):,.0f}")
    if r.get("transport"):
        L.append(f"   termasuk uang transport (wajib): Rp{r.get('transport', 0):,.0f}")
    # Sisa kas TUNAI setelah dikurangi pengeluaran (uang laci) per toko
    L.append("")
    L.append("*SISA KAS TUNAI (tunai − pengeluaran)*")
    L.append(f"F&B: Rp{r.get('sisa_cash_fnb', 0):,.0f} (tunai Rp{r.get('cash_sales_fnb', 0):,.0f})")
    L.append(f"Retail: Rp{r.get('sisa_cash_retail', 0):,.0f} (tunai Rp{r.get('cash_sales_retail', 0):,.0f})")
    L.append(f"Total: Rp{r.get('sisa_cash', 0):,.0f}")
    L.append(f"Perkiraan kas: Rp{r.get('expected_cash', 0):,.0f}")
    if r.get("expenses_empty"):
        L.append("Catatan: laporan pengeluaran harian BELUM DIISI "
                 "(dikonfirmasi memang tidak ada pengeluaran)")
    L.append("")
    L.append("*UANG BERSIH*")
    L.append(f"F&B: Rp{r.get('net_cash_fnb', 0):,.0f}")
    L.append(f"Retail: Rp{r.get('net_cash_retail', 0):,.0f}")
    L.append(f"Total: Rp{r.get('net_cash', 0):,.0f}")
    for v in (r.get("vendor_share") or []):
        L.append(f"Vendor {v.get('vendor_name', '?')}: bagi hasil {v.get('share', 0):,.0f} | diberikan {v.get('paid', 0):,.0f} | selisih {v.get('difference', 0):,.0f}")
        for im in (v.get("items") or []):
            L.append(f"   - {im.get('name', '?')} (x{im.get('qty', 0)}): Rp{im.get('gross', 0):,.0f} (Vendor Rp{im.get('vendor_share', 0):,.0f})")
    if r.get("vendor_total_share"):
        L.append(f"Total vendor: share {r.get('vendor_total_share', 0):,.0f} | diberikan {r.get('vendor_total_paid', 0):,.0f}")
    if r.get("vendor_settled_paid"):
        L.append(f"Bagi hasil dibayar via Settlement: Rp{r.get('vendor_settled_paid', 0):,.0f} (termasuk pengeluaran kas)")
        for x in (r.get("vendor_settled_rows") or []):
            L.append(f"   - {x.get('settlement_no', '?')} {x.get('vendor_name', '?')}: Rp{float(x.get('paid') or 0):,.0f}")
    if r.get("variance_report"):
        vr = r["variance_report"]
        vtot = vr.get("total") or {}
        v_act = float(vtot.get("actual") or 0)
        v_exp = float(vtot.get("expected") or 0)
        v_diff = float(vtot.get("variance") or 0)
        v_stat = vtot.get("status") or ("match" if v_diff == 0 else ("surplus" if v_diff > 0 else "shortage"))
        v_label = "SEIMBANG / PAS" if v_stat == "match" else ("LEBIH / SURPLUS" if v_stat == "surplus" else "KURANG / SHORTAGE")
        L.append("")
        L.append("*REKONSILIASI KAS FISIK & AUDIT LACI*")
        L.append(f"Kas Fisik Terhitung: Rp{v_act:,.0f}")
        L.append(f"Kas Diharapkan Sistem: Rp{v_exp:,.0f}")
        L.append(f"Status: {v_label}")
        L.append(f"Selisih Kas: Rp{v_diff:+,.0f}")
        if vr.get("variance_reason"):
            L.append(f"Catatan/Alasan Kasir: {vr['variance_reason']}")

    L.append("")
    L.append("------------------------------------------")
    L.append("LEMBAR VERIFIKASI AKUNTANSI FISIK")
    L.append("")
    L.append("Kasir Menyerahkan,   Spv/Akunting Menerima,")
    L.append("")
    L.append("")
    L.append("(................)   (................)")
    return L

@api.post("/shifts/{sid}/send-wa")
async def shift_send_wa(sid: str, admin: dict = Depends(require_admin)):
    """Kirim laporan shift ke WhatsApp (nomor tujuan dari Pengaturan Laporan).

    `sid` boleh ID sesi (F&B+Retail sekaligus) maupun ID satu shift."""
    r, anchor = await _shift_wa_report(sid)
    doc = await db.settings.find_one({"_id": "report"}) or {}
    recips = doc.get("recipients", [])
    if not recips:
        raise HTTPException(400, "Belum ada nomor WhatsApp tujuan. Atur di Pengaturan → Laporan & WhatsApp.")
    text = await _tpl_fill("shift", _shift_wa_env(r, r.get("kasir", ""), (anchor.get("opened_at") or "")[:10]))
    result = await _send_whatsapp(recips, text)
    if not any(x.get("ok") for x in result):
        raise HTTPException(400, f"Gagal kirim WhatsApp: {result[0].get('error') if result else 'tidak diketahui'}")
    return {"sent": result, "recipients": recips}

@api.get("/shifts/{sid}/print")
async def shift_print_preview(sid: str, admin: dict = Depends(admin_or_kasir)):
    """Pratinjau teks laporan shift utk dicetak — memakai TEMPLATE laporan shift
    (bisa dirancang sendiri di Pengaturan → WhatsApp & Laporan → Template WhatsApp).
    `sid` boleh ID sesi (F&B+Retail) maupun ID satu shift."""
    r, anchor = await _shift_wa_report(sid)
    text = await _tpl_fill("shift", _shift_wa_env(r, r.get("kasir", ""), (anchor.get("opened_at") or "")[:10]))
    # Pastikan teks cetak memuat blok audit rekonsiliasi akuntansi jika belum ada di template kustom
    if r.get("variance_report") and "REKONSILIASI KAS" not in text:
        vr = r["variance_report"]
        vtot = vr.get("total") or {}
        v_act = float(vtot.get("actual") or 0)
        v_exp = float(vtot.get("expected") or 0)
        v_diff = float(vtot.get("variance") or 0)
        v_stat = vtot.get("status") or ("match" if v_diff == 0 else ("surplus" if v_diff > 0 else "shortage"))
        v_label = "SEIMBANG / KLOP" if v_stat == "match" else ("LEBIH / SURPLUS" if v_stat == "surplus" else "KURANG / SHORTAGE")
        rec_block = [
            "",
            "------------------------------------------",
            "REKONSILIASI KAS FISIK (AUDIT AKUNTANSI)",
            f"Kas Fisik Kasir : Rp{v_act:,.0f}",
            f"Kas Sistem POS  : Rp{v_exp:,.0f}",
            f"Status Selisih  : {v_label}",
            f"Selisih Kas     : Rp{v_diff:+,.0f}",
        ]
        if vr.get("variance_reason"):
            rec_block.append(f"Catatan Kasir   : {vr['variance_reason']}")
        rec_block += [
            "------------------------------------------",
            "LEMBAR VERIFIKASI AKUNTANSI FISIK",
            "",
            "Kasir Menyerahkan,   Spv/Akunting Menerima,",
            "",
            "",
            "(................)   (................)",
            "==========================================",
        ]
        text += "\n" + "\n".join(rec_block)
    return {"text": text, "shift_id": sid,
            "shift_number": anchor.get("shift_number") or (anchor.get("opened_at") or "")[:10]}

# ================================================================== REPORTS
@api.get("/reports/summary")
async def report_summary(date_str: Optional[str] = Query(None, alias="date"),
                         admin: dict = Depends(admin_or_kasir)):
    d = date_str or wib_today()
    # Cache laporan: tanggal HARI INI pendek (20 dtk), tanggal lampau lama (immutable).
    # Data dibatalkan otomatis lewat _bump_rs_gen() saat ada pay/void/refund.
    if await _feat("perf.cache_reports"):
        hit = _rcache_get(f"rs:{d}")
        if hit is not None:
            return hit
    start, end = wib_day_range(d)
    q = {"status": "paid", "created_at": {"$gte": start, "$lt": end}}
    orders = await db.orders.find(q, {"_id": 0}).to_list(5000)
    by_type = {"dine_in": {"count": 0, "total": 0}, "take_away": {"count": 0, "total": 0}, "retail": {"count": 0, "total": 0}}
    by_pm = {}
    product_sales = {}
    total = 0
    total_discount = 0
    total_cost = 0
    prods = await db.products.find({}, {"_id": 0, "id": 1, "category_id": 1, "type": 1}).to_list(5000)
    prod_map = {p["id"]: p for p in prods}
    cats_all = await db.categories.find({}, {"_id": 0}).to_list(1000)
    cat_map = {c["id"]: c for c in cats_all}
    cat_sales = {}
    group_totals = {"makanan": 0, "minuman": 0, "retail": 0}
    for o in orders:
        bt = by_type[o["order_type"]]
        bt["count"] += 1
        bt["total"] += o["total"]
        total += o["total"]
        total_discount += o.get("discount", 0)
        for _pn, _pt, _pa in _order_pay_parts(o):
            by_pm[_pn] = by_pm.get(_pn, 0) + _pa
        for it in o["items"]:
            line = it["price"] * it["qty"]
            pinfo = prod_map.get(it.get("product_id"), {})
            # tipe ditentukan SEKALI di sini (dulu dihitung ulang tiap produk terlaris
            # dengan memindai seluruh order lagi → biaya O(produk × order × item)).
            itype = pinfo.get("type") or it.get("type") or "retail"
            ps = product_sales.setdefault(it["name"], {"qty": 0, "total": 0, "cost": 0, "type": itype})
            ps["qty"] += it["qty"]
            ps["total"] += line
            ps["cost"] += it.get("cost", 0) * it["qty"]
            total_cost += it.get("cost", 0) * it["qty"]
            if itype in group_totals:
                group_totals[itype] += line
            cid = pinfo.get("category_id")
            if cid:
                cinfo = cat_map.get(cid, {})
                cs = cat_sales.setdefault(cid, {"category_id": cid, "name": cinfo.get("name", "?"),
                                                "type": cinfo.get("type", itype), "qty": 0, "total": 0})
                cs["qty"] += it["qty"]
                cs["total"] += line
    top = []
    for k, v in sorted(product_sales.items(), key=lambda x: x[1]["total"], reverse=True)[:20]:
        profit = v["total"] - v["cost"]
        margin = round(profit / v["total"] * 100, 1) if v["total"] else 0
        itype = v.get("type") or "retail"
        top.append({"name": k, "qty": v["qty"], "total": round(v["total"], 2),
                    "cost": round(v["cost"], 2), "profit": round(profit, 2), "margin": margin, "type": itype})
    fnb_total = by_type["dine_in"]["total"] + by_type["take_away"]["total"]
    # laba kotor per toko
    cost_fnb = 0.0; cost_retail = 0.0; vendor_exp_fnb = 0.0
    for o in orders:
        for it in o.get("items", []):
            if it.get("type") == "retail":
                cost_retail += (it.get("cost") or 0) * it["qty"]
            else:
                cost_fnb += (it.get("cost") or 0) * it["qty"]
            if it.get("type") == "vendor":
                vendor_exp_fnb += (it.get("vendor_total") or 0)
    # Laba F&B outlet = pendapatan − HPP − bagian vendor (omzet titipan bukan pendapatan outlet)
    gross_fnb = round(fnb_total - cost_fnb - vendor_exp_fnb, 2)
    gross_retail = round(by_type["retail"]["total"] - cost_retail, 2)
    # top_products per tipe (F&B = makanan+minuman; retail)
    top_fnb = [t for t in top if t.get("type") in ("makanan", "minuman")]
    top_retail = [t for t in top if t.get("type") == "retail"]
    by_cat = sorted(cat_sales.values(), key=lambda x: x["total"], reverse=True)
    for c in by_cat:
        c["total"] = round(c["total"], 2)
    category_report = {
        "makanan": {"total": round(group_totals["makanan"], 2),
                    "categories": [c for c in by_cat if c["type"] == "makanan"]},
        "minuman": {"total": round(group_totals["minuman"], 2),
                    "categories": [c for c in by_cat if c["type"] == "minuman"]},
        "retail": {"total": round(group_totals["retail"], 2),
                   "categories": [c for c in by_cat if c["type"] == "retail"]},
    }
    low_stock_thr = float((await _business()).get("low_stock_threshold") or 10)
    low_stock = await db.products.aggregate([
        {"$match": {"track_stock": True, "active": True}},
        {"$addFields": {"eff_min": {"$ifNull": ["$min_stock", low_stock_thr]}}},
        {"$match": {"$expr": {"$lte": ["$stock", "$eff_min"]}}},
        {"$project": {"_id": 0, "name": 1, "sku": 1, "stock": 1, "min_stock": "$eff_min"}},
        {"$sort": {"stock": 1}},
        {"$limit": 100},
    ]).to_list(100)
    cash_moves = await db.cash_movements.find({"created_at": {"$gte": start, "$lt": end}}, {"_id": 0}).to_list(2000)
    cash_out = sum(m["amount"] for m in cash_moves if m["type"] == "out")
    def _out_scope(sc):
        return round(sum(m["amount"] for m in cash_moves if m["type"] == "out" and m.get("scope") == sc), 2)
    cash_sales = sum(_cash_paid(o) for o in orders)
    cash_sales_fnb = sum(_cash_paid(o) for o in orders if o.get("order_type") != "retail")
    cash_sales_retail = sum(_cash_paid(o) for o in orders if o.get("order_type") == "retail")
    vendor_summary = await _vendor_report(date_str=d)
    void_docs = await db.orders.find({"status": {"$in": ["void", "refunded"]},
                                      "created_at": {"$gte": start, "$lt": end}},
                                     {"_id": 0, "id": 1, "order_number": 1, "total": 1, "status": 1,
                                      "void_kind": 1, "void_reason": 1, "voided_by": 1, "voided_at": 1,
                                      "cashier_name": 1}
                                     ).sort("voided_at", -1).to_list(2000)
    void_amount = round(sum(float(v.get("total") or 0) for v in void_docs), 2)
    void_rows = [{"id": v.get("id"), "order_number": v.get("order_number"),
                  "kind": v.get("void_kind") or ("refund" if v.get("status") == "refunded" else "void"),
                  "amount": round(float(v.get("total") or 0), 2), "reason": v.get("void_reason") or "",
                  "by": v.get("voided_by") or "", "at": v.get("voided_at"),
                  "cashier_name": v.get("cashier_name") or ""} for v in void_docs]
    summary = {"date": d, "vendor_summary": vendor_summary, "total_sales": round(total, 2), "order_count": len(orders),
               "void_count": len(void_rows), "void_amount": void_amount,
               "void_refund_count": sum(1 for v in void_rows if v["kind"] == "refund"),
               "void_rows": void_rows,
               "total_discount": round(total_discount, 2), "by_type": by_type, "by_payment": by_pm,
               "fnb_total": round(fnb_total, 2), "retail_total": round(by_type["retail"]["total"], 2),
               "top_products": top, "top_fnb": top_fnb, "top_retail": top_retail,
               "low_stock": low_stock, "low_stock_threshold": low_stock_thr,
               "total_cost": round(total_cost, 2), "gross_profit": round(total - total_cost, 2),
               "gross_profit_fnb": gross_fnb, "gross_profit_retail": gross_retail,
               "cash_out": round(cash_out, 2),
               "cash_out_fnb": _out_scope("fnb"), "cash_out_retail": _out_scope("retail"),
               "cash_sales": round(cash_sales, 2),
               "cash_sales_fnb": round(cash_sales_fnb, 2), "cash_sales_retail": round(cash_sales_retail, 2),
               # Kas bersih laci per toko & total = penjualan TUNAI − pengambilan keluar (TANPA kas masuk)
               "cash_net_fnb": round(cash_sales_fnb - _out_scope("fnb"), 2),
               "cash_net_retail": round(cash_sales_retail - _out_scope("retail"), 2),
               "cash_net": round(cash_sales - cash_out, 2),
               "category_report": category_report}
    if await _feat("perf.cache_reports"):
        _rcache_set(f"rs:{d}", summary, 20.0 if d == wib_today() else 90000.0)
    return summary

@api.get("/reports/range")
async def report_range(start: str, end: str, admin: dict = Depends(admin_or_kasir)):
    s_utc, _ = wib_day_range(start)
    _, e_utc = wib_day_range(end)
    q = {"status": "paid", "created_at": {"$gte": s_utc, "$lt": e_utc}}
    orders = await db.orders.find(q, {"_id": 0}).to_list(20000)
    daily = {}
    for o in orders:
        day = wib_day_of(o["created_at"])
        daily.setdefault(day, {"date": day, "total": 0, "count": 0, "fnb": 0, "retail": 0})
        daily[day]["total"] += o["total"]
        daily[day]["count"] += 1
        if o["order_type"] == "retail":
            daily[day]["retail"] += o["total"]
        else:
            daily[day]["fnb"] += o["total"]
    return {"daily": sorted(daily.values(), key=lambda x: x["date"])}

async def _period_report(start: str, end: str):
    if await _feat("perf.cache_reports"):
        try:
            if end.replace("-", "") < wib_today().replace("-", ""):  # periode lampau = immutable
                hit = _rcache_get(f"pr:{start}:{end}")
                if hit is not None:
                    return hit
        except Exception:
            pass
    s_utc, _ = wib_day_range(start)
    _, e_utc = wib_day_range(end)
    q = {"status": "paid", "created_at": {"$gte": s_utc, "$lt": e_utc}}
    orders = await db.orders.find(q, {"_id": 0}).to_list(50000)
    prods = await db.products.find({}, {"_id": 0, "id": 1, "category_id": 1, "type": 1}).to_list(5000)
    prod_map = {p["id"]: p for p in prods}
    cats_all = await db.categories.find({}, {"_id": 0}).to_list(1000)
    cat_map = {c["id"]: c for c in cats_all}
    by_type = {"dine_in": {"count": 0, "total": 0}, "take_away": {"count": 0, "total": 0}, "retail": {"count": 0, "total": 0}}
    by_pm = {}
    cat_sales = {}
    group_totals = {"makanan": 0, "minuman": 0, "retail": 0}
    product_sales = {}
    total = 0; total_discount = 0; total_cost = 0
    for o in orders:
        bt = by_type[o["order_type"]]
        bt["count"] += 1
        bt["total"] += o["total"]
        total += o["total"]
        total_discount += o.get("discount", 0)
        for _pn, _pt, _pa in _order_pay_parts(o):
            by_pm[_pn] = by_pm.get(_pn, 0) + _pa
        for it in o["items"]:
            line = it["price"] * it["qty"]
            ps = product_sales.setdefault(it["name"], {"qty": 0, "total": 0, "cost": 0})
            ps["qty"] += it["qty"]; ps["total"] += line; ps["cost"] += it.get("cost", 0) * it["qty"]
            total_cost += it.get("cost", 0) * it["qty"]
            pinfo = prod_map.get(it.get("product_id"), {})
            itype = pinfo.get("type") or it.get("type") or "retail"
            if itype in group_totals:
                group_totals[itype] += line
            cid = pinfo.get("category_id")
            if cid:
                cinfo = cat_map.get(cid, {})
                cs = cat_sales.setdefault(cid, {"category_id": cid, "name": cinfo.get("name", "?"),
                                                "type": cinfo.get("type", itype), "qty": 0, "total": 0})
                cs["qty"] += it["qty"]; cs["total"] += line
    # laba kotor per toko (F&B vs retail) — untuk KPI di halaman Laporan
    cost_fnb = 0.0; cost_retail = 0.0; vendor_exp_fnb = 0.0
    for o in orders:
        for it in o.get("items", []):
            if it.get("type") == "retail":
                cost_retail += (it.get("cost") or 0) * it["qty"]
            else:
                cost_fnb += (it.get("cost") or 0) * it["qty"]
            if it.get("type") == "vendor":
                vendor_exp_fnb += (it.get("vendor_total") or 0)
    fnb_total = by_type["dine_in"]["total"] + by_type["take_away"]["total"]
    retail_total = by_type["retail"]["total"]
    by_cat = sorted(cat_sales.values(), key=lambda x: x["total"], reverse=True)
    for c in by_cat:
        c["total"] = round(c["total"], 2)
    category_report = {
        "makanan": {"total": round(group_totals["makanan"], 2), "categories": [c for c in by_cat if c["type"] == "makanan"]},
        "minuman": {"total": round(group_totals["minuman"], 2), "categories": [c for c in by_cat if c["type"] == "minuman"]},
        "retail": {"total": round(group_totals["retail"], 2), "categories": [c for c in by_cat if c["type"] == "retail"]},
    }
    top = []
    for k, v in sorted(product_sales.items(), key=lambda x: x[1]["total"], reverse=True)[:10]:
        profit = v["total"] - v["cost"]
        margin = round(profit / v["total"] * 100, 1) if v["total"] else 0
        top.append({"name": k, "qty": v["qty"], "total": round(v["total"], 2), "profit": round(profit, 2), "margin": margin})
    vendor = await _vendor_report(start=start, end=end)
    rep = {"start": start, "end": end, "total_sales": round(total, 2), "order_count": len(orders),
           "total_discount": round(total_discount, 2), "total_cost": round(total_cost, 2),
           "gross_profit": round(total - total_cost, 2), "by_type": by_type, "by_payment": by_pm,
           "fnb_total": round(fnb_total, 2), "retail_total": round(retail_total, 2),
           "gross_profit_fnb": round(fnb_total - cost_fnb - vendor_exp_fnb, 2),
           "gross_profit_retail": round(retail_total - cost_retail, 2),
           "category_report": category_report, "top_products": top, "vendor": vendor}
    if await _feat("perf.cache_reports"):
        try:
            if end.replace("-", "") < wib_today().replace("-", ""):
                _rcache_set(f"pr:{start}:{end}", rep, 604800.0)  # 7 hari
        except Exception:
            pass
    return rep

@api.get("/reports/period")
async def report_period(start: str, end: str, admin: dict = Depends(admin_or_kasir)):
    return await _period_report(start, end)

def _period_report_lines(rep):
    cr = rep["category_report"]
    L = ["*Laporan Grand Aceh Kuliner*", f"Periode: {rep['start']} s/d {rep['end']}", "",
         f"Total Penjualan: Rp{rep['total_sales']:,.0f}",
         f"Jumlah Order: {rep['order_count']}",
         f"Laba Kotor: Rp{rep['gross_profit']:,.0f}",
         f"Total Diskon: Rp{rep['total_discount']:,.0f}", ""]
    for key, label in [("makanan", "Makanan"), ("minuman", "Minuman"), ("retail", "Retail")]:
        g = cr[key]
        L.append(f"{label}: Rp{g['total']:,.0f}")
        for c in g["categories"]:
            L.append(f"  - {c['name']} (x{c['qty']}): Rp{c['total']:,.0f}")
    v = rep.get("vendor", {})
    L += ["", f"Bagi Hasil Vendor: Rp{v.get('total_vendor_share', 0):,.0f} (omzet Rp{v.get('total_gross', 0):,.0f})"]
    for r in v.get("rows", []):
        L.append(f"  - {r['vendor_name']}: Rp{r['vendor_share']:,.0f}")
    return L

@api.get("/reports/period/export/excel")
async def export_period_excel(start: str, end: str, admin: dict = Depends(admin_or_kasir)):
    import openpyxl
    rep = await _period_report(start, end)
    wb = openpyxl.Workbook(); ws = wb.active; ws.title = "Laporan"
    ws.append(["Laporan Grand Aceh Kuliner"])
    ws.append(["Periode", f"{start} s/d {end}"])
    ws.append([])
    ws.append(["Total Penjualan", rep["total_sales"]])
    ws.append(["Jumlah Order", rep["order_count"]])
    ws.append(["Laba Kotor", rep["gross_profit"]])
    ws.append(["Total Diskon", rep["total_discount"]])
    ws.append([])
    for key, label in [("makanan", "Makanan"), ("minuman", "Minuman"), ("retail", "Retail")]:
        g = rep["category_report"][key]
        ws.append([label, "", g["total"]])
        for c in g["categories"]:
            ws.append(["  " + c["name"], c["qty"], c["total"]])
        ws.append([])
    v = rep.get("vendor", {})
    ws.append(["Bagi Hasil Vendor"])
    ws.append(["Vendor", "Qty", "Omzet", "Bagi Hasil Vendor", "Bagian Outlet"])
    for r in v.get("rows", []):
        ws.append([r["vendor_name"], r["qty"], r["gross"], r["vendor_share"], r["outlet_share"]])
    ws.append(["TOTAL", "", v.get("total_gross", 0), v.get("total_vendor_share", 0), v.get("total_outlet_share", 0)])
    buf = io.BytesIO(); wb.save(buf); buf.seek(0)
    return StreamingResponse(buf, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                             headers={"Content-Disposition": f"attachment; filename=laporan-{start}_{end}.xlsx"})

@api.get("/reports/period/export/pdf")
async def export_period_pdf(start: str, end: str, admin: dict = Depends(admin_or_kasir)):
    from fpdf import FPDF
    rep = await _period_report(start, end)
    pdf = FPDF(); pdf.add_page(); pdf.set_font("Helvetica", size=12)
    for ln in _period_report_lines(rep):
        txt = ln.replace("*", "").encode("latin-1", "replace").decode("latin-1")
        pdf.multi_cell(pdf.epw, 7, txt or " ")
    out = io.BytesIO(bytes(pdf.output()))
    return StreamingResponse(out, media_type="application/pdf",
                             headers={"Content-Disposition": f"attachment; filename=laporan-{start}_{end}.pdf"})

# ================================================================== INVENTORY (Retail)
class PurchaseIn(BaseModel):
    product_id: str
    qty: int = Field(gt=0)
    unit_cost: float = Field(ge=0)
    note: Optional[str] = ""

@api.post("/purchases")
async def create_purchase(body: PurchaseIn, admin: dict = Depends(require_any_module("belanja_produk", "produk"))):
    p = await db.products.find_one({"id": body.product_id}, {"_id": 0})
    if not p:
        raise HTTPException(404, "Produk tidak ditemukan")
    if not p.get("track_stock"):
        raise HTTPException(400, "Pembelian stok hanya untuk produk retail")
    await db.products.update_one({"id": body.product_id},
                                 {"$inc": {"stock": body.qty}, "$set": {"cost": body.unit_cost}})
    doc = {"id": new_id(), "product_id": p["id"], "product_name": p["name"], "sku": p["sku"],
           "qty": body.qty, "unit_cost": body.unit_cost, "total_cost": round(body.qty * body.unit_cost, 2),
           "note": body.note, "by": admin["name"], "created_at": now_utc().isoformat()}
    await db.purchases.insert_one(doc)
    _cache_del("products:")
    doc.pop("_id", None)
    return {**doc, "new_stock": p.get("stock", 0) + body.qty}

class BulkPurchaseItemIn(BaseModel):
    product_id: Optional[str] = None
    create_new: bool = False
    name: Optional[str] = None
    category_id: Optional[str] = None
    price: Optional[float] = None
    qty: int = Field(gt=0)
    unit_cost: float = Field(ge=0)

class BulkPurchaseIn(BaseModel):
    items: List[BulkPurchaseItemIn]
    note: Optional[str] = "Faktur AI"

@api.post("/purchases/bulk")
async def create_purchases_bulk(body: BulkPurchaseIn, admin: dict = Depends(require_any_module("belanja_produk", "produk"))):
    if not body.items:
        raise HTTPException(400, "Tidak ada item untuk disimpan")
    # Validate all items before writing anything
    for it in body.items:
        if it.create_new:
            if not (it.name and it.name.strip()) or not it.category_id:
                raise HTTPException(400, f"Produk baru '{it.name or '?'}' butuh nama & kategori")
            if not await db.categories.find_one({"id": it.category_id}):
                raise HTTPException(400, f"Kategori untuk '{it.name}' tidak valid")
        else:
            if not it.product_id:
                raise HTTPException(400, "Item lama butuh product_id")
            p = await db.products.find_one({"id": it.product_id}, {"_id": 0})
            if not p:
                raise HTTPException(404, f"Produk '{it.name or it.product_id}' tidak ditemukan")
            if not p.get("track_stock"):
                raise HTTPException(400, f"'{p['name']}' bukan produk retail (tidak melacak stok)")
    saved, created_products = [], 0
    for it in body.items:
        if it.create_new:
            prod = {"id": new_id(), "name": it.name.strip(), "sku": "AI-" + new_id()[:6],
                    "category_id": it.category_id, "type": "retail",
                    "price": float(it.price if it.price is not None else it.unit_cost),
                    "cost": float(it.unit_cost), "description": "", "image": "", "active": True,
                    "sold_out": False, "stock": 0, "min_stock": 10, "track_stock": True,
                    "created_at": now_utc().isoformat()}
            await db.products.insert_one(prod)
            pid, pname, psku, base_stock = prod["id"], prod["name"], prod["sku"], 0
            created_products += 1
        else:
            p = await db.products.find_one({"id": it.product_id}, {"_id": 0})
            pid, pname, psku, base_stock = p["id"], p["name"], p["sku"], p.get("stock", 0)
        await db.products.update_one({"id": pid}, {"$inc": {"stock": it.qty}, "$set": {"cost": it.unit_cost}})
        doc = {"id": new_id(), "product_id": pid, "product_name": pname, "sku": psku,
               "qty": it.qty, "unit_cost": it.unit_cost, "total_cost": round(it.qty * it.unit_cost, 2),
               "note": body.note, "by": admin["name"], "created_at": now_utc().isoformat()}
        await db.purchases.insert_one(doc)
        doc.pop("_id", None)
        saved.append({**doc, "new_stock": base_stock + it.qty})
    _cache_del("products:")
    return {"saved": len(saved), "created_products": created_products,
            "total_cost": round(sum(s["total_cost"] for s in saved), 2), "items": saved}

@api.get("/purchases")
async def list_purchases(date_str: Optional[str] = Query(None, alias="date"), admin: dict = Depends(require_any_module("belanja_produk", "produk"))):
    q = {}
    if date_str:
        s, e = wib_day_range(date_str)
        q["created_at"] = {"$gte": s, "$lt": e}
    return await db.purchases.find(q, {"_id": 0}).sort("created_at", -1).to_list(1000)

class OpnameIn(BaseModel):
    product_id: str
    counted_stock: int = Field(ge=0)
    note: Optional[str] = ""

@api.post("/stock-opname")
async def create_opname(body: OpnameIn, admin: dict = Depends(require_any_module("opname_produk", "produk"))):
    p = await db.products.find_one({"id": body.product_id}, {"_id": 0})
    if not p:
        raise HTTPException(404, "Produk tidak ditemukan")
    if not p.get("track_stock"):
        raise HTTPException(400, "Stok opname hanya untuk produk retail")
    system_stock = p.get("stock", 0)
    diff = body.counted_stock - system_stock
    await db.products.update_one({"id": body.product_id}, {"$set": {"stock": body.counted_stock}})
    doc = {"id": new_id(), "product_id": p["id"], "product_name": p["name"], "sku": p["sku"],
           "system_stock": system_stock, "counted_stock": body.counted_stock, "difference": diff,
           "note": body.note, "by": admin["name"], "created_at": now_utc().isoformat()}
    await db.stock_opname.insert_one(doc)
    _cache_del("products:")
    doc.pop("_id", None)
    return doc

@api.get("/stock-opname")
async def list_opname(date_str: Optional[str] = Query(None, alias="date"), admin: dict = Depends(require_any_module("opname_produk", "produk"))):
    q = {}
    if date_str:
        s, e = wib_day_range(date_str)
        q["created_at"] = {"$gte": s, "$lt": e}
    return await db.stock_opname.find(q, {"_id": 0}).sort("created_at", -1).to_list(1000)

class ProductOpnameBulkItemIn(BaseModel):
    product_id: str
    counted_stock: float = Field(ge=0)
    note: Optional[str] = ""

class ProductOpnameBulkIn(BaseModel):
    items: List[ProductOpnameBulkItemIn] = []

@api.post("/products/opname-bulk")
async def bulk_product_opname(body: ProductOpnameBulkIn, admin: dict = Depends(require_any_module("opname_produk", "produk"))):
    """Opname massal produk retail (dipakai thin-client & tab Stok Opname Produk)."""
    if not body.items:
        raise HTTPException(400, "Tidak ada item")
    out = []
    for it in body.items:
        p = await db.products.find_one({"id": it.product_id}, {"_id": 0})
        if not p or not p.get("track_stock"):
            continue
        system = float(p.get("stock") or 0)
        counted = round(float(it.counted_stock), 2)
        diff = round(counted - system, 2)
        await db.products.update_one({"id": it.product_id}, {"$set": {"stock": counted}})
        doc = {"id": new_id(), "product_id": p["id"], "product_name": p["name"], "sku": p["sku"],
               "system_stock": system, "counted_stock": counted, "difference": diff,
               "note": it.note or "", "by": admin["name"], "created_at": now_utc().isoformat()}
        await db.stock_opname.insert_one(doc)
        out.append({"product_id": it.product_id, "name": p["name"],
                    "system_stock": system, "counted_stock": counted, "difference": diff})
    _cache_del("products:")
    return {"ok": True, "count": len(out), "rows": out}

# ================================================================== MASTER BAHAN (bahan baku resep + daftar belanja)
# Bahan = stok gudang yg TIDAK dijual langsung; dipakai di resep (HPP), punya
# pembelian & stok opname sendiri, dan menjadi dasar daftar belanja harian.

# ---------------------------------------------------------------- KATEGORI BAHAN
# Setiap bahan boleh punya BEBERAPA kategori (ingredients.categories = [id kategori]).
# Kategori dipakai untuk MEMBATASI siapa boleh mengisi stok opname bahan:
# users.ingredient_categories = daftar kategori yang boleh diisi akun itu.
# BELUM DIATUR = tidak boleh mengisi apa pun (sengaja ketat); hanya Super Admin/owner
# (jaring pengaman pemilik) yang bebas mengisi semua kategori.

class IngCatIn(BaseModel):
    name: str

def _ing_cat_name(name):
    """Nama kategori bahan yang sudah dirapikan (spasi ganda dibuang, maks 40 huruf)."""
    return " ".join(str(name or "").split())[:40]

async def _ing_cat_map():
    """(rows, {id: nama}) semua kategori bahan."""
    rows = await db.ingredient_categories.find({}, {"_id": 0}).sort("name", 1).to_list(500)
    return rows, {r["id"]: r["name"] for r in rows}

async def _ing_cat_find_by_name(name):
    """Cari kategori bahan berdasarkan nama (tidak peduli huruf besar/kecil)."""
    key = _ing_cat_name(name).lower()
    if not key:
        return None
    for r in await db.ingredient_categories.find({}, {"_id": 0}).to_list(500):
        if str(r.get("name") or "").lower() == key:
            return r
    return None

async def _user_ing_cats(user):
    """(bebas_semua, set id kategori yang boleh diisi akun ini).

    bebas_semua = Super Admin/owner. Akun lain: PERSIS daftar ingredient_categories
    miliknya — daftar kosong/absent berarti tidak boleh mengisi apa pun."""
    if await _is_super(user):
        return True, set()
    return False, set(str(c) for c in (user.get("ingredient_categories") or []))

async def _ing_opname_allowed(user, ing, allow_all=None, mine=None):
    """Boleh mengisi stok opname bahan ini?"""
    if allow_all is None:
        allow_all, mine = await _user_ing_cats(user)
    if allow_all:
        return True
    return bool(set(str(c) for c in (ing.get("categories") or [])) & mine)

async def _ing_rows_public(rows, user):
    """Tambahkan nama kategori & penanda izin opname pada baris bahan (utk UI)."""
    _, names = await _ing_cat_map()
    allow_all, mine = await _user_ing_cats(user)
    out = []
    for r in rows:
        r = dict(r)
        ids = [str(c) for c in (r.get("categories") or [])]
        r["categories"] = ids
        r["category_names"] = [names[c] for c in ids if c in names]
        r["allowed_opname"] = True if allow_all else bool(set(ids) & mine)
        out.append(r)
    return out

@api.get("/ingredient-categories")
async def list_ingredient_categories(user: dict = Depends(require_any_module("produk", "belanja_bahan", "opname_bahan", "pengguna"))):
    """Daftar kategori bahan + kategori yang boleh diisi AKUN INI (untuk layar opname).
    Modul "pengguna" ikut diizinkan karena halaman Pengguna perlu daftarnya untuk
    mengatur izin kategori per akun."""
    rows, _ = await _ing_cat_map()
    counts = {}
    for ing in await db.ingredients.find({}, {"_id": 0, "categories": 1}).to_list(2000):
        for cid in (ing.get("categories") or []):
            counts[str(cid)] = counts.get(str(cid), 0) + 1
    allow_all, mine = await _user_ing_cats(user)
    _, allowed_mods = await _access(user.get("role") or "kasir")
    return {"items": [{**r, "ingredient_count": counts.get(r["id"], 0)} for r in rows],
            "mine": sorted(mine), "allow_all": bool(allow_all),
            "can_manage": "produk" in allowed_mods}

@api.post("/ingredient-categories")
async def create_ingredient_category(body: IngCatIn, admin: dict = Depends(require_any_module("produk"))):
    name = _ing_cat_name(body.name)
    if not name:
        raise HTTPException(400, "Nama kategori wajib diisi")
    if await _ing_cat_find_by_name(name):
        raise HTTPException(400, f"Kategori '{name}' sudah ada")
    doc = {"id": new_id(), "name": name, "created_at": now_utc().isoformat(),
           "by": admin.get("name") or ""}
    await db.ingredient_categories.insert_one(doc)
    doc.pop("_id", None)
    return doc

@api.put("/ingredient-categories/{cid}")
async def update_ingredient_category(cid: str, body: IngCatIn, admin: dict = Depends(require_any_module("produk"))):
    cur = await db.ingredient_categories.find_one({"id": cid}, {"_id": 0})
    if not cur:
        raise HTTPException(404, "Kategori tidak ditemukan")
    name = _ing_cat_name(body.name)
    if not name:
        raise HTTPException(400, "Nama kategori wajib diisi")
    dup = await _ing_cat_find_by_name(name)
    if dup and dup["id"] != cid:
        raise HTTPException(400, f"Kategori '{name}' sudah ada")
    await db.ingredient_categories.update_one({"id": cid}, {"$set": {"name": name}})
    return {"ok": True, "id": cid, "name": name}

@api.delete("/ingredient-categories/{cid}")
async def delete_ingredient_category(cid: str, admin: dict = Depends(require_any_module("produk"))):
    """Hapus kategori + lepaskan dari semua bahan & akun yang memakainya."""
    cur = await db.ingredient_categories.find_one({"id": cid}, {"_id": 0})
    if not cur:
        raise HTTPException(404, "Kategori tidak ditemukan")
    await db.ingredient_categories.delete_one({"id": cid})
    r1 = await db.ingredients.update_many({"categories": cid}, {"$pull": {"categories": cid}})
    r2 = await db.users.update_many({"ingredient_categories": cid}, {"$pull": {"ingredient_categories": cid}})
    _cache_del("products:")
    return {"ok": True, "name": cur["name"], "removed_from_ingredients": r1.modified_count,
            "removed_from_users": r2.modified_count}

class IngredientIn(BaseModel):
    name: str
    unit: str = ""
    stock: float = 0
    min_stock: float = 0
    cost: float = 0          # harga beli per unit (HPP bahan)
    note: Optional[str] = ""
    active: bool = True
    # Kategori bahan (daftar id). None = jangan diubah (dipakai saat update).
    categories: Optional[List[str]] = None

async def _ing_cat_validate_ids(ids):
    """Buang id kategori yang tidak dikenal dari daftar (jangan gagalkan simpan bahan)."""
    valid = {c["id"] for c in await db.ingredient_categories.find({}, {"_id": 0, "id": 1}).to_list(500)}
    return list(dict.fromkeys([str(c) for c in (ids or []) if str(c) in valid]))

@api.get("/ingredients")
async def list_ingredients(active_only: bool = False, q: Optional[str] = None,
                           user: dict = Depends(require_any_module("produk", "belanja_bahan", "opname_bahan"))):
    flt = {"active": True} if active_only else {}
    cur = db.ingredients.find(flt, {"_id": 0}).sort("name", 1)
    rows = await cur.to_list(2000)
    if q:
        ql = q.lower()
        rows = [r for r in rows if ql in r["name"].lower() or ql in (r.get("sku") or "").lower()]
    # status stok rendah utk UI
    for r in rows:
        st = float(r.get("stock") or 0)
        mn = float(r.get("min_stock") or 0)
        r["low"] = mn > 0 and st <= mn
    # nama kategori + izin opname milik pengguna ini (dipakai UI: tab Stok Opname
    # hanya menampilkan bahan yang boleh diisi akun tsb)
    return await _ing_rows_public(rows, user)

@api.post("/ingredients")
async def create_ingredient(body: IngredientIn, admin: dict = Depends(require_any_module("produk", "belanja_bahan"))):
    name = body.name.strip()
    if not name:
        raise HTTPException(400, "Nama bahan wajib diisi")
    if await db.ingredients.find_one({"name": name}):
        raise HTTPException(400, f"Bahan '{name}' sudah ada")
    doc = {"id": new_id(), "name": name, "unit": body.unit.strip(),
           "stock": round(float(body.stock or 0), 2), "min_stock": round(float(body.min_stock or 0), 2),
           "cost": round(float(body.cost or 0), 2), "note": body.note, "active": bool(body.active),
           "categories": await _ing_cat_validate_ids(body.categories),
           "created_at": now_utc().isoformat()}
    await db.ingredients.insert_one(doc)
    doc.pop("_id", None)
    _cache_del("products:")
    return doc

@api.put("/ingredients/{iid}")
async def update_ingredient(iid: str, body: IngredientIn, admin: dict = Depends(require_any_module("produk", "belanja_bahan"))):
    cur = await db.ingredients.find_one({"id": iid}, {"_id": 0})
    if not cur:
        raise HTTPException(404, "Bahan tidak ditemukan")
    name = body.name.strip()
    if not name:
        raise HTTPException(400, "Nama bahan wajib diisi")
    dup = await db.ingredients.find_one({"name": name, "id": {"$ne": iid}})
    if dup:
        raise HTTPException(400, f"Bahan '{name}' sudah ada")
    upd = {"name": name, "unit": body.unit.strip(), "min_stock": round(float(body.min_stock or 0), 2),
           "cost": round(float(body.cost or 0), 2), "note": body.note,
           "active": bool(body.active), "updated_at": now_utc().isoformat()}
    # categories=None → daftar kategori tidak diubah (mis. pembaruan dari layar lain)
    if body.categories is not None:
        upd["categories"] = await _ing_cat_validate_ids(body.categories)
    await db.ingredients.update_one({"id": iid}, {"$set": upd})
    _cache_del("products:")
    return {**cur, **upd, "id": iid}

@api.delete("/ingredients/{iid}")
async def delete_ingredient(iid: str, admin: dict = Depends(require_any_module("produk", "belanja_bahan"))):
    used = await db.recipes.find_one({"ingredients.ingredient_id": iid}, {"_id": 0, "product_id": 1, "name": 1})
    if used:
        raise HTTPException(400, f"Bahan sedang dipakai resep (produk {used.get('name') or used.get('product_id')}) — hapus dari resep dulu")
    await db.ingredients.delete_one({"id": iid})
    await db.ingredient_purchases.delete_many({"ingredient_id": iid})
    await db.ingredient_opname.delete_many({"ingredient_id": iid})
    return {"ok": True}

class IngPurchaseIn(BaseModel):
    qty: float = Field(gt=0)
    unit_cost: float = Field(ge=0)
    note: Optional[str] = ""

@api.post("/ingredients/{iid}/purchase")
async def create_ingredient_purchase(iid: str, body: IngPurchaseIn, admin: dict = Depends(require_any_module("belanja_bahan", "produk"))):
    ing = await db.ingredients.find_one({"id": iid}, {"_id": 0})
    if not ing:
        raise HTTPException(404, "Bahan tidak ditemukan")
    qty = round(float(body.qty), 2)
    cost = round(float(body.unit_cost), 2)
    new_stock = round(float(ing.get("stock") or 0) + qty, 2)
    await db.ingredients.update_one({"id": iid}, {"$set": {"stock": new_stock, "cost": cost}})
    doc = {"id": new_id(), "ingredient_id": iid, "ingredient_name": ing["name"],
           "unit": ing.get("unit", ""), "qty": qty, "unit_cost": cost,
           "total_cost": round(qty * cost, 2), "note": body.note, "by": admin["name"],
           "created_at": now_utc().isoformat()}
    await db.ingredient_purchases.insert_one(doc)
    doc.pop("_id", None)
    return {**doc, "new_stock": new_stock}

@api.get("/ingredient-purchases")
async def list_ingredient_purchases(date_str: Optional[str] = Query(None, alias="date"),
                                    user: dict = Depends(require_any_module("belanja_bahan", "produk"))):
    q = {}
    if date_str:
        s, e = wib_day_range(date_str)
        q["created_at"] = {"$gte": s, "$lt": e}
    return await db.ingredient_purchases.find(q, {"_id": 0}).sort("created_at", -1).to_list(2000)

class IngOpnameIn(BaseModel):
    counted_stock: float = Field(ge=0)
    note: Optional[str] = ""

@api.post("/ingredients/{iid}/opname")
async def create_ingredient_opname(iid: str, body: IngOpnameIn, admin: dict = Depends(require_any_module("opname_bahan", "produk"))):
    ing = await db.ingredients.find_one({"id": iid}, {"_id": 0})
    if not ing:
        raise HTTPException(404, "Bahan tidak ditemukan")
    if not await _ing_opname_allowed(admin, ing):
        raise HTTPException(403, f"Anda tidak punya izin kategori bahan untuk '{ing['name']}' — minta admin memberi "
                                  f"kategori bahan ini ke akun Anda (Pengaturan → Pengguna → Kategori Bahan)")
    system = float(ing.get("stock") or 0)
    counted = round(float(body.counted_stock), 2)
    diff = round(counted - system, 2)
    await db.ingredients.update_one({"id": iid}, {"$set": {"stock": counted}})
    doc = {"id": new_id(), "ingredient_id": iid, "ingredient_name": ing["name"],
           "unit": ing.get("unit", ""), "system_stock": system, "counted_stock": counted,
           "difference": diff, "note": body.note, "by": admin["name"],
           "created_at": now_utc().isoformat()}
    await db.ingredient_opname.insert_one(doc)
    doc.pop("_id", None)
    return doc

@api.get("/ingredient-opname")
async def list_ingredient_opname(date_str: Optional[str] = Query(None, alias="date"),
                                 user: dict = Depends(require_any_module("opname_bahan", "produk"))):
    q = {}
    if date_str:
        s, e = wib_day_range(date_str)
        q["created_at"] = {"$gte": s, "$lt": e}
    return await db.ingredient_opname.find(q, {"_id": 0}).sort("created_at", -1).to_list(2000)

# ---- operasi massal (tab Pembelian / Stok Opname & thin-client APK) ----
class IngBulkPurchaseItemIn(BaseModel):
    ingredient_id: str
    qty: float = Field(gt=0)
    unit_cost: float = Field(ge=0)
    note: Optional[str] = ""

class IngBulkPurchaseIn(BaseModel):
    items: List[IngBulkPurchaseItemIn] = []
    date: Optional[str] = None

@api.post("/ingredients/purchase-bulk")
async def bulk_ingredient_purchase(body: IngBulkPurchaseIn, admin: dict = Depends(require_any_module("belanja_bahan", "produk"))):
    if not body.items:
        raise HTTPException(400, "Tidak ada item")
    out = []
    for it in body.items:
        ing = await db.ingredients.find_one({"id": it.ingredient_id}, {"_id": 0})
        if not ing:
            continue
        qty = round(float(it.qty), 2)
        cost = round(float(it.unit_cost), 2)
        new_stock = round(float(ing.get("stock") or 0) + qty, 2)
        await db.ingredients.update_one({"id": it.ingredient_id}, {"$set": {"stock": new_stock, "cost": cost}})
        doc = {"id": new_id(), "ingredient_id": it.ingredient_id, "ingredient_name": ing["name"],
               "unit": ing.get("unit", ""), "qty": qty, "unit_cost": cost,
               "total_cost": round(qty * cost, 2), "note": it.note or "", "by": admin["name"],
               "created_at": now_utc().isoformat()}
        await db.ingredient_purchases.insert_one(doc)
        out.append({"ingredient_id": it.ingredient_id, "name": ing["name"], "qty": qty, "new_stock": new_stock})
    return {"ok": True, "count": len(out), "rows": out}

class IngOpnameBulkItemIn(BaseModel):
    ingredient_id: str
    counted_stock: float = Field(ge=0)
    note: Optional[str] = ""

class IngOpnameBulkIn(BaseModel):
    items: List[IngOpnameBulkItemIn] = []
    date: Optional[str] = None

@api.post("/ingredients/opname-bulk")
async def bulk_ingredient_opname(body: IngOpnameBulkIn, admin: dict = Depends(require_any_module("opname_bahan", "produk"))):
    if not body.items:
        raise HTTPException(400, "Tidak ada item")
    # Izin kategori bahan per AKUN: hanya bahan yang kategorinya diizinkan.
    # Diperiksa SEBELUM menyimpan apa pun supaya tidak setengah tersimpan.
    allow_all, mine = await _user_ing_cats(admin)
    if not allow_all:
        denied = []
        for it in body.items:
            ing = await db.ingredients.find_one({"id": it.ingredient_id}, {"_id": 0, "name": 1, "categories": 1})
            if ing and not (set(str(c) for c in (ing.get("categories") or [])) & mine):
                denied.append(ing["name"])
        if denied:
            raise HTTPException(400, "Akun Anda tidak berizin mengisi kategori bahan ini: " +
                                     ", ".join(denied[:5]) + ("…" if len(denied) > 5 else "") +
                                     ". Minta admin mengatur Kategori Bahan akun Anda (Pengaturan → Pengguna).")
    out = []
    for it in body.items:
        ing = await db.ingredients.find_one({"id": it.ingredient_id}, {"_id": 0})
        if not ing:
            continue
        system = float(ing.get("stock") or 0)
        counted = round(float(it.counted_stock), 2)
        diff = round(counted - system, 2)
        await db.ingredients.update_one({"id": it.ingredient_id}, {"$set": {"stock": counted}})
        doc = {"id": new_id(), "ingredient_id": it.ingredient_id, "ingredient_name": ing["name"],
               "unit": ing.get("unit", ""), "system_stock": system, "counted_stock": counted,
               "difference": diff, "note": it.note or "", "by": admin["name"],
               "created_at": now_utc().isoformat()}
        await db.ingredient_opname.insert_one(doc)
        out.append({"ingredient_id": it.ingredient_id, "name": ing["name"],
                    "system_stock": system, "counted_stock": counted, "difference": diff})
    return {"ok": True, "count": len(out), "rows": out}

class AIInvoiceIn(BaseModel):
    image: str

# ---- vision: foto struk/faktur belanja bahan -> item -> komit pembelian ----
class IngVisionCommitItemIn(BaseModel):
    name: str
    qty: float = Field(gt=0)
    unit: str = ""
    amount: float = Field(ge=0)   # total biaya baris di struk

@api.post("/ai/ingredient-vision")
async def ai_ingredient_vision(body: AIInvoiceIn, admin: dict = Depends(require_any_module("belanja_bahan", "produk"))):
    """Scan foto struk belanja bahan baku -> daftar item {name,qty,unit,amount}."""
    if not await _ai_allowed("vision"):
        raise HTTPException(400, "Fitur AI 'Baca Faktur (Vision)' dimatikan. Nyalakan di Pengaturan → Fitur & Integrasi.")
    cfg = await _ai_cfg("vision")
    if not (cfg["api_key"] and cfg["base_url"] and cfg["model"]):
        raise HTTPException(400, "Konfigurasi AI 'Baca Faktur (Vision)' belum lengkap di Pengaturan AI")
    img = body.image if body.image.startswith("data:") else f"data:image/jpeg;base64,{body.image}"
    system = "Anda asisten yang membaca foto struk/nota belanja bahan baku dapur & kafe."
    prompt = ('Baca foto struk belanja bahan baku berikut. Kembalikan HANYA JSON array. '
              'Tiap elemen: {"name": "nama bahan", "qty": angka jumlah dibeli, "unit": "satuan jika ada (kg/gram/liter/pcs/dus/ikat/dll)", '
              '"amount": total biaya baris tsb dalam Rupiah (angka saja tanpa titik/koma)}. '
              'JANGAN sertakan barang non-bahan (mis. rokok) bila ragu boleh tetap masuk. '
              'Bila struk tidak terbaca/tidak jelas, kembalikan []. Tanpa teks lain.')
    from openai import OpenAI

    def run():
        client = OpenAI(api_key=cfg["api_key"], base_url=cfg["base_url"])
        r = client.chat.completions.create(
            model=cfg["model"],
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": [
                    {"type": "text", "text": prompt},
                    {"type": "image_url", "image_url": {"url": img}},
                ]},
            ],
            max_tokens=1800, temperature=0,
        )
        return r.choices[0].message.content or ""
    try:
        raw = await asyncio.to_thread(run)
    except Exception as e:
        logger.error(f"ingredient-vision AI error: {e}")
        raise HTTPException(400, "Model AI yang dipilih tidak mendukung pembacaan gambar. Ganti model Vision di Pengaturan AI.")
    items = _extract_json_list(raw)
    cleaned = []
    for it in items:
        if not isinstance(it, dict):
            continue
        try:
            qty = float(it.get("qty") or 0)
            amt = float(it.get("amount") or 0)
        except (ValueError, TypeError):
            qty, amt = 0, 0
        name = str(it.get("name") or "").strip()
        if not name or qty <= 0:
            continue
        cleaned.append({"name": name[:80], "qty": round(qty, 2),
                        "unit": str(it.get("unit") or "").strip()[:20],
                        "amount": round(max(amt, 0), 2)})
    return {"items": cleaned, "count": len(cleaned),
            "total": round(sum(i["amount"] for i in cleaned), 2)}

@api.post("/ingredients/vision-commit")
async def commit_ingredient_vision(body: dict, admin: dict = Depends(require_any_module("belanja_bahan", "produk"))):
    """Simpan hasil scan menjadi pembelian bahan. Bahan baru otomatis dibuat bila belum ada."""
    raw = body.get("items") if isinstance(body.get("items"), list) else []
    if not raw:
        raise HTTPException(400, "Tidak ada item")
    created, updated, failed = [], [], []
    for it in raw[:100]:
        if not isinstance(it, dict):
            continue
        name = str(it.get("name") or "").strip()
        try:
            qty = round(float(it.get("qty") or 0), 2)
            amt = round(float(it.get("amount") or 0), 2)
        except (ValueError, TypeError):
            qty, amt = 0, 0
        if not name or qty <= 0:
            failed.append({"name": name or "?", "reason": "nama/jumlah tidak valid"})
            continue
        unit = str(it.get("unit") or "").strip()[:20]
        unit_cost = round(amt / qty, 2) if amt > 0 and qty > 0 else 0
        ing = await db.ingredients.find_one({"name": name}, {"_id": 0})
        is_new = ing is None
        if is_new:
            ing = {"id": new_id(), "name": name, "unit": unit, "stock": 0.0,
                   "min_stock": 0, "cost": unit_cost, "note": "dari scan faktur",
                   "categories": [],   # belum dikategorikan → atur di Master Bahan agar bisa diopname staf
                   "active": True, "created_at": now_utc().isoformat()}
            await db.ingredients.insert_one(ing)
        else:
            await db.ingredients.update_one({"id": ing["id"]}, {"$set": {"cost": unit_cost or ing.get("cost", 0),
                                                                          "unit": unit or ing.get("unit", "")}})
        new_stock = round(float(ing["stock"]) + qty, 2)
        await db.ingredients.update_one({"id": ing["id"]}, {"$set": {"stock": new_stock}})
        doc = {"id": new_id(), "ingredient_id": ing["id"], "ingredient_name": ing["name"],
               "unit": unit or ing.get("unit", ""), "qty": qty, "unit_cost": unit_cost,
               "total_cost": round(qty * unit_cost, 2), "note": "Scan faktur (AI)", "by": admin["name"],
               "created_at": now_utc().isoformat()}
        await db.ingredient_purchases.insert_one(doc)
        (created if is_new else updated).append({"name": ing["name"], "qty": qty, "new_stock": new_stock})
    return {"ok": True, "created": created, "updated": updated, "failed": failed,
            "count": len(created) + len(updated)}

@api.post("/ingredients/import")
async def import_ingredients(file: UploadFile = File(...), admin: dict = Depends(require_any_module("produk", "belanja_bahan"))):
    """Import master bahan dari file Excel (.xlsx). Kolom (baris pertama = judul):
    Nama | Satuan | Stok | Stok Minimum | Harga Beli | Catatan | Kategori.
    Kolom Kategori boleh berisi beberapa kategori dipisah koma/titik-koma (';' atau ','),
    kategori baru otomatis dibuat. Bahan yang sudah ada (nama sama persis) diperbarui
    (satuan/min/harga/kategori bila diisi)."""
    if not (file.filename or "").lower().endswith((".xlsx", ".xlsm")):
        raise HTTPException(400, "File harus .xlsx")
    import openpyxl
    data = await file.read()
    if len(data) > 5_000_000:
        raise HTTPException(400, "File maksimal 5MB")
    try:
        wb = openpyxl.load_workbook(io.BytesIO(data), read_only=True, data_only=True)
    except Exception:
        raise HTTPException(400, "File Excel tidak bisa dibaca")
    ws = wb.active
    rows = list(ws.iter_rows(values_only=True))
    if len(rows) < 2:
        raise HTTPException(400, "File kosong — butuh baris judul + minimal 1 baris data")
    def colidx(headers):
        out = {}
        aliases = {
            "nama": ["nama", "nama bahan", "bahan", "nama material"],
            "satuan": ["satuan", "unit"],
            "stok": ["stok", "stok awal", "stock"],
            "min": ["stok minimum", "minimum", "min", "stok min"],
            "harga": ["harga beli", "harga", "cost", "harga/satuan", "harga per satuan"],
            "catatan": ["catatan", "keterangan", "note"],
            "kategori": ["kategori", "kategori bahan", "grup", "group"],
        }
        for i, h in enumerate(headers):
            hl = str(h or "").strip().lower()
            for key, al in aliases.items():
                if hl in al:
                    out[key] = i
                    break
        return out
    def numcell(v):
        try:
            if v is None or str(v).strip() == "":
                return None
            return round(float(v), 2)
        except (ValueError, TypeError):
            return None
    headers = rows[0]
    ci = colidx(headers)
    if "nama" not in ci:
        raise HTTPException(400, "Tidak menemukan kolom 'Nama' di baris pertama. Format: Nama | Satuan | Stok | Stok Minimum | Harga Beli | Catatan | Kategori")

    async def cats_from_cell(v):
        """'Dapur; Minuman' → daftar id kategori (dibuat otomatis bila belum ada)."""
        if ci.get("kategori") is None:
            return None
        txt = str(v or "").strip()
        if not txt:
            return None   # sel kosong = kategori bahan ini tidak diubah
        ids = []
        for part in re.split(r"[;,/|]", txt):
            nm = _ing_cat_name(part)
            if not nm:
                continue
            found = await _ing_cat_find_by_name(nm)
            if not found:
                found = {"id": new_id(), "name": nm, "created_at": now_utc().isoformat(),
                         "by": (admin.get("name") or "") + " (import)"}
                await db.ingredient_categories.insert_one(found)
            if found["id"] not in ids:
                ids.append(found["id"])
        return ids

    created, updated, errors = [], [], []
    for i, row in enumerate(rows[1:], start=2):
        name = str(row[ci["nama"]] or "").strip() if ci["nama"] < len(row) else ""
        if not name:
            continue
        unit = str(row[ci["satuan"]] or "").strip() if ci.get("satuan") is not None and ci["satuan"] < len(row) else ""
        stock = numcell(row[ci["stok"]]) if ci.get("stok") is not None and ci["stok"] < len(row) else None
        mn = numcell(row[ci["min"]]) if ci.get("min") is not None and ci["min"] < len(row) else None
        cost = numcell(row[ci["harga"]]) if ci.get("harga") is not None and ci["harga"] < len(row) else None
        note = str(row[ci["catatan"]] or "").strip() if ci.get("catatan") is not None and ci["catatan"] < len(row) else ""
        stock = 0 if stock is None else stock
        mn = 0 if mn is None else mn
        cost = 0 if cost is None else cost
        cats = await cats_from_cell(row[ci["kategori"]] if ci.get("kategori") is not None and ci["kategori"] < len(row) else None)
        cur = await db.ingredients.find_one({"name": name})
        if cur:
            upd = {"unit": unit or cur.get("unit", ""), "min_stock": mn,
                   "cost": cost if cost > 0 else float(cur.get("cost") or 0),
                   "note": note or cur.get("note", ""), "active": True}
            if cats is not None:
                upd["categories"] = cats
            await db.ingredients.update_one({"id": cur["id"]}, {"$set": upd})
            updated.append({"name": name})
        else:
            doc = {"id": new_id(), "name": name, "unit": unit, "stock": stock, "min_stock": mn,
                   "cost": cost, "note": note, "active": True,
                   "categories": cats or [], "created_at": now_utc().isoformat()}
            await db.ingredients.insert_one(doc)
            created.append({"name": name})
    return {"ok": True, "created": created, "updated": updated,
            "count": len(created) + len(updated), "errors": errors[:50]}

# ================================================================== DAFTAR BELANJA BAHAN
# Lembar belanja harian: otomatis (stok <= stok minimum) + centang manual.
# Bisa dicetak (browser) & dikirim WA ke nomor tujuan khusus.

async def _ing_low_rows():
    """Bahan yang stoknya <= stok minimum (kandidat otomatis daftar belanja)."""
    out = []
    for r in await db.ingredients.find({"active": True}, {"_id": 0}).sort("name", 1).to_list(2000):
        stock = float(r.get("stock") or 0)
        mn = float(r.get("min_stock") or 0)
        if mn > 0 and stock <= mn:
            need = round(mn - stock, 2)
            out.append({"ingredient_id": r["id"], "name": r["name"], "unit": r.get("unit", ""),
                        "stock": stock, "min_stock": mn, "cost": float(r.get("cost") or 0),
                        "auto": True, "qty": need})
    return out

@api.get("/shopping-list/suggest")
async def shopping_suggest(date: Optional[str] = Query(None), user: dict = Depends(require_any_module("belanja_bahan", "produk"))):
    rows = await _ing_low_rows()
    return {"date": date or wib_today(), "items": rows, "source": "auto"}

class ShoppingItemIn(BaseModel):
    ingredient_id: Optional[str] = None   # kosong = bahan baru/manual (nama bebas)
    name: str
    unit: str = ""
    qty: float = Field(ge=0)
    stock: float = 0
    min_stock: float = 0
    cost: float = 0
    note: Optional[str] = ""
    bought: bool = False

class ShoppingListIn(BaseModel):
    date: str
    items: List[ShoppingItemIn]
    note: Optional[str] = ""

@api.put("/shopping-list")
async def save_shopping_list(body: ShoppingListIn, user: dict = Depends(require_any_module("belanja_bahan", "produk"))):
    wib_day_range(body.date)  # validasi
    items = []
    for it in body.items[:200]:
        name = (it.name or "").strip()
        if not name or it.qty <= 0:
            continue
        items.append({"ingredient_id": it.ingredient_id or None, "name": name, "unit": it.unit,
                      "qty": round(float(it.qty), 2), "stock": round(float(it.stock or 0), 2),
                      "min_stock": round(float(it.min_stock or 0), 2),
                      "cost": round(float(it.cost or 0), 2), "note": it.note, "bought": bool(it.bought)})
    await db.shopping_lists.update_one(
        {"date": body.date},
        {"$set": {"items": items, "note": body.note, "updated_at": now_utc().isoformat(),
                  "by": user.get("name", "")}},
        upsert=True)
    return {"ok": True, "date": body.date, "count": len(items)}

@api.get("/shopping-list")
async def get_shopping_list(date: Optional[str] = Query(None), user: dict = Depends(require_any_module("belanja_bahan", "produk", "opname_bahan"))):
    d = date or wib_today()
    doc = await db.shopping_lists.find_one({"date": d}, {"_id": 0})
    if doc:
        return doc
    rows = await _ing_low_rows()
    return {"date": d, "items": rows, "note": "", "generated_auto": True}

@api.delete("/shopping-list")
async def delete_shopping_list(date: str = Query(...), user: dict = Depends(require_any_module("belanja_bahan", "produk"))):
    await db.shopping_lists.delete_one({"date": date})
    return {"ok": True}

def _shopping_lines(items, total_est):
    L = []
    for it in items:
        line = f"- {it.get('name', '?')}: {it.get('qty', 0):g} {it.get('unit', '')}".rstrip()
        if it.get("cost"):
            line += f" (≈Rp{float(it.get('cost', 0)) * float(it.get('qty', 0)):,.0f})"
        if it.get("note"):
            line += f" — {it['note']}"
        L.append(line)
    return L

class ShoppingSendIn(BaseModel):
    date: Optional[str] = None
    items: Optional[List[ShoppingItemIn]] = None
    recipients: Optional[List[str]] = None
    note: Optional[str] = ""

@api.post("/shopping-list/send-wa")
async def send_shopping_wa(body: ShoppingSendIn, admin: dict = Depends(require_any_module("belanja_bahan", "produk"))):
    d = body.date or wib_today()
    if body.items:
        items = []
        for it in body.items[:200]:
            if (it.name or "").strip() and it.qty > 0:
                items.append({"name": it.name.strip(), "unit": it.unit, "qty": round(float(it.qty), 2),
                              "cost": round(float(it.cost or 0), 2), "note": it.note,
                              "ingredient_id": it.ingredient_id or None})
    else:
        sheet = await db.shopping_lists.find_one({"date": d}, {"_id": 0})
        if not sheet:
            rows = await _ing_low_rows()
            items = [{"name": r["name"], "unit": r["unit"], "qty": r["qty"], "cost": r["cost"]} for r in rows]
        else:
            items = sheet.get("items", [])
    if not items:
        raise HTTPException(400, "Daftar belanja kosong — tidak ada yang dikirim")
    total_est = sum(float(it.get("cost") or 0) * float(it.get("qty") or 0) for it in items)
    recips = body.recipients if body.recipients else (await _shopping_recipients())
    if not recips:
        raise HTTPException(400, "Belum ada nomor WhatsApp tujuan belanja. Atur di Pengaturan → WhatsApp & Laporan (nomor belanja bahan).")
    text = _tpl_fill("shopping", {
        "tanggal": d, "items": "\n".join(_shopping_lines(items, total_est)),
        "jumlah_item": len(items), "total_estimasi": f"Rp{total_est:,.0f}", "nama_aplikasi": _tpl_app_name(),
    })
    result = await _send_whatsapp(recips, text)
    if not any(x.get("ok") for x in result):
        raise HTTPException(400, f"Gagal kirim WhatsApp: {result[0].get('error') if result else 'tidak diketahui'}")
    return {"sent": result, "recipients": recips, "count": len(items)}

async def _shopping_recipients():
    doc = await db.settings.find_one({"_id": "shopping"}, {"_id": 0}) or {}
    return doc.get("recipients", []) or []

class ShoppingSettingsIn(BaseModel):
    recipients: List[str] = []
    request_on_close: bool = False

@api.get("/settings/shopping")
async def get_shopping_settings(user: dict = Depends(get_current_user)):
    doc = await db.settings.find_one({"_id": "shopping"}, {"_id": 0}) or {}
    return {"recipients": doc.get("recipients", []), "request_on_close": bool(doc.get("request_on_close")),
            "whatsapp_configured": await _wa_configured()}

@api.put("/settings/shopping")
async def put_shopping_settings(body: ShoppingSettingsIn, admin: dict = Depends(require_admin)):
    await db.settings.update_one({"_id": "shopping"}, {"$set": {
        "recipients": [r.strip() for r in body.recipients if r.strip()],
        "request_on_close": bool(body.request_on_close),
    }}, upsert=True)
    return {"ok": True}


# ================================================================== CASH MOVEMENTS
class CashIn(BaseModel):
    type: Literal["in", "out"]
    amount: float = Field(gt=0)
    category: str = "Lainnya"
    note: Optional[str] = ""
    scope: Literal["fnb", "retail", "general"] = "fnb"   # pengeluaran F&B / retail / umum

class CashBulkIn(BaseModel):
    items: List[CashIn]

class CashCatIn(BaseModel):
    categories: List[str]

@api.post("/cash")
async def create_cash(body: CashIn, user: dict = Depends(admin_or_kasir)):
    # Pengeluaran masuk ke shift TOKO yang sesuai (F&B/Retail) bila shift hari itu terbuka.
    # "general" (fitur lama) ikut shift F&B supaya tidak jatuh ke luar laporan shift.
    _sc = body.scope if body.scope in SHIFT_SCOPES else "fnb"
    shift = await _open_shift(_sc)
    doc = {"id": new_id(), "type": body.type, "amount": body.amount, "category": body.category,
           "note": body.note, "scope": body.scope, "cashier_id": user["id"], "cashier_name": user["name"],
           "shift_id": shift["id"] if shift else None,
           "session_id": (shift or {}).get("session_id"), "created_at": now_utc().isoformat()}
    await db.cash_movements.insert_one(doc)
    _bump_rs_gen()  # pengeluaran masuk ringkasan laporan hari itu
    doc.pop("_id", None)
    return doc

@api.post("/cash/bulk")
async def create_cash_bulk(body: CashBulkIn, user: dict = Depends(admin_or_kasir)):
    """Simpan banyak catatan kas sekaligus (dipakai hasil scan Vision pengeluaran)."""
    created = []
    for it in body.items:
        _sc = it.scope if it.scope in SHIFT_SCOPES else "fnb"
        shift = await _open_shift(_sc)
        doc = {"id": new_id(), "type": it.type, "amount": it.amount, "category": it.category,
               "note": it.note, "scope": it.scope, "cashier_id": user["id"], "cashier_name": user["name"],
               "shift_id": shift["id"] if shift else None,
               "session_id": (shift or {}).get("session_id"), "created_at": now_utc().isoformat()}
        await db.cash_movements.insert_one(doc)
        doc.pop("_id", None)
        created.append(doc)
    _bump_rs_gen()
    return {"created": created, "count": len(created)}

@api.get("/cash")
async def list_cash(date_str: Optional[str] = Query(None, alias="date"), user: dict = Depends(admin_or_kasir)):
    d = date_str or wib_today()
    s, e = wib_day_range(d)
    moves = await db.cash_movements.find({"created_at": {"$gte": s, "$lt": e}}, {"_id": 0}).sort("created_at", -1).to_list(2000)
    cin = sum(m["amount"] for m in moves if m["type"] == "in")
    cout = sum(m["amount"] for m in moves if m["type"] == "out")
    # Pisahkan pengeluaran per scope (F&B / Retail / Umum)
    def _scope_sum(typ, scope):
        return sum(m["amount"] for m in moves if m["type"] == typ and m.get("scope") == scope)
    return {"date": d, "movements": moves, "cash_in": round(cin, 2), "cash_out": round(cout, 2),
            "cash_net": round(cin - cout, 2),
            "out_fnb": round(_scope_sum("out", "fnb"), 2),
            "out_retail": round(_scope_sum("out", "retail"), 2),
            "out_general": round(_scope_sum("out", "general"), 2)}

@api.get("/cash/categories")
async def get_cash_categories(user: dict = Depends(admin_or_kasir)):
    doc = await db.settings.find_one({"_id": "cash"}, {"_id": 0}) or {}
    cats = doc.get("categories") or []
    merged = list(dict.fromkeys(["Bahan Baku", "Belanja Operasional", "Bayar Supplier", "Kasbon",
                                  SETTLE_CAT, "Lainnya"] + cats))
    return {"categories": merged}

@api.put("/cash/categories")
async def put_cash_categories(body: CashCatIn, admin: dict = Depends(require_admin)):
    clean = [c.strip() for c in body.categories if c and c.strip()]
    await db.settings.update_one({"_id": "cash"}, {"$set": {"categories": clean}}, upsert=True)
    return {"ok": True, "count": len(clean)}

# ================================================================== SYNC (local outlet server <-> cloud)
class SyncPushIn(BaseModel):
    orders: List[OrderIn]

@api.get("/sync/master")
async def sync_master(user: dict = Depends(get_current_user)):
    """Pull master data snapshot for a local outlet server / offline client."""
    products = await db.products.find({}, {"_id": 0}).to_list(5000)
    categories = await db.categories.find({}, {"_id": 0}).to_list(500)
    tables = await db.tables.find({"deleted": {"$ne": True}}, {"_id": 0}).to_list(500)
    pms = await db.payment_methods.find({}, {"_id": 0}).to_list(100)
    return {"server_time": now_utc().isoformat(), "products": products, "categories": categories,
            "tables": tables, "payment_methods": pms}

@api.post("/sync/push")
async def sync_push(body: SyncPushIn, user: dict = Depends(get_current_user)):
    """Push a batch of offline orders to cloud. Idempotent via client_ref."""
    results = []
    synced = 0
    for o in body.orders:
        try:
            res = await create_order(o, user)
            synced += 1
            results.append({"client_ref": o.client_ref, "status": "ok", "order_number": res.get("order_number")})
        except HTTPException as e:
            results.append({"client_ref": o.client_ref, "status": "error", "detail": e.detail})
    return {"synced": synced, "total": len(body.orders), "results": results, "server_time": now_utc().isoformat()}

# ================================================================== AI
def _get_chat(session, system, model):
    if not EMERGENT_LLM_KEY:
        raise HTTPException(400, "AI belum dikonfigurasi. Isi API key & endpoint provider Anda di Pengaturan AI.")
    from emergentintegrations.llm.chat import LlmChat
    return LlmChat(api_key=EMERGENT_LLM_KEY, session_id=session, system_message=system).with_model("gemini", model)

AI_FEATURES = {"description": "Deskripsi Produk", "image": "Gambar Produk", "summary": "Analisis Laporan", "vision": "Baca Faktur (Vision)", "assistant": "Asisten Admin"}

async def _ai_cfg(feature="description"):
    """Per-feature AI provider config: DB settings (editable in UI) override .env.
    Fallback order: feature-specific -> legacy flat -> .env defaults."""
    doc = await db.settings.find_one({"_id": "ai"}) or {}
    feat = (doc.get("features", {}) or {}).get(feature, {}) or {}
    return {
        "base_url": feat.get("base_url") or doc.get("openai_base_url") or OPENAI_COMPAT_BASE_URL,
        "api_key": feat.get("api_key") or doc.get("openai_api_key") or OPENAI_COMPAT_API_KEY,
        "model": feat.get("model") or doc.get("openai_model") or OPENAI_COMPAT_MODEL,
    }

async def _ai_provider_cfg(feature="description"):
    """Resolve which provider ('gemini' | 'chenzk') to use for a feature and its creds."""
    doc = await db.settings.find_one({"_id": "ai"}) or {}
    feat = (doc.get("features", {}) or {}).get(feature, {}) or {}
    provider = feat.get("provider")
    if not provider:
        # Infer for backward-compat: OpenAI-compatible creds present -> chenzk, else gemini.
        if feat.get("api_key") and (feat.get("base_url") or OPENAI_COMPAT_BASE_URL):
            provider = "chenzk"
        else:
            provider = "gemini"
    if provider == "gemini":
        # Jangan biarkan base_url/model chenzk lama "bocor" ke jalur Gemini:
        # model Gemini memakai default (GEMINI_TEXT_MODEL) bila field tidak diisi
        # model Gemini; base_url chenzk TIDAK pernah dipakai utk Gemini.
        return {"provider": "gemini",
                "api_key": feat.get("api_key") or GEMINI_API_KEY,
                "model": (feat.get("model") if (feat.get("model") or "").lower().startswith(("gemini", "learnlm", "models/")) else "") or GEMINI_TEXT_MODEL}
    return {"provider": "chenzk",
            "base_url": (feat.get("base_url") or doc.get("openai_base_url") or OPENAI_COMPAT_BASE_URL or CHENZK_BASE_URL),
            "api_key": feat.get("api_key") or doc.get("openai_api_key") or OPENAI_COMPAT_API_KEY,
            "model": feat.get("model") or doc.get("openai_model") or OPENAI_COMPAT_MODEL}

async def _ai_chat(messages, system="", feature="description", temperature=0.5, max_tokens=4000, model=None):
    """Unified text chat across providers. `messages`=[{role:'user'|'assistant',content:str}].
    Routes to Gemini REST (X-goog-api-key) or chenzk (OpenAI-compatible), else Emergent fallback."""
    if not await _ai_allowed(feature):
        label = FEATURE_LABELS.get(f"ai.{feature}") or feature
        raise HTTPException(400, f"Fitur '{label}' dimatikan. Nyalakan di Pengaturan → Fitur & Integrasi.")
    cfg = await _ai_provider_cfg(feature)
    if cfg["provider"] == "gemini":
        import httpx
        keys = await _gemini_keys(cfg.get("api_key"))
        if not keys:
            raise HTTPException(400, "Gemini API key belum diatur. Tambahkan di Pengaturan AI.")
        model = model or cfg["model"] or GEMINI_TEXT_MODEL
        contents = []
        for m in messages:
            role = "model" if m.get("role") == "assistant" else "user"
            contents.append({"role": role, "parts": [{"text": str(m.get("content", ""))}]})
        payload = {"contents": contents,
                   "generationConfig": {"temperature": temperature, "maxOutputTokens": max_tokens}}
        if system:
            payload["systemInstruction"] = {"parts": [{"text": system}]}
        url = f"{GEMINI_REST_URL}/{model}:generateContent"
        # Rotasi: mulai dari kursor, coba tiap key; lanjut ke berikutnya bila kena limit
        start = (_gemini_cursor["i"] % len(keys))
        order = keys[start:] + keys[:start]
        last_err = None
        await _breaker_check("ai-gemini")
        for i, key in enumerate(order):
            try:
                async with httpx.AsyncClient(timeout=60) as c:
                    r = await c.post(url, headers={"Content-Type": "application/json", "X-goog-api-key": key}, json=payload)
            except Exception as e:
                _breaker_fail("ai-gemini")
                last_err = HTTPException(400, f"Gagal menghubungi Gemini: {e}")
                continue
            if r.status_code == 200:
                _breaker_success("ai-gemini")
                _gemini_cursor["i"] = (start + i) % len(keys)  # ingat key yang berhasil
                data = r.json()
                try:
                    parts = data["candidates"][0]["content"]["parts"]
                    return "".join(p.get("text", "") for p in parts).strip()
                except Exception:
                    raise HTTPException(400, "Gemini tidak mengembalikan teks. Coba lagi atau ganti model.")
            txt = r.text[:200]
            if _rotate_quota(r.status_code, txt):
                last_err = HTTPException(400, f"Gemini key #{i + 1} kena limit/gagal (HTTP {r.status_code}): {txt}")
                continue
            _breaker_fail("ai-gemini")
            raise HTTPException(400, f"Gemini menolak permintaan (HTTP {r.status_code}): {txt}")
        raise last_err or HTTPException(400, "Semua Gemini API key gagal")
    if cfg["provider"] == "chenzk" and cfg.get("api_key") and cfg.get("base_url"):
        from openai import OpenAI
        msgs = ([{"role": "system", "content": system}] if system else []) + \
               [{"role": ("assistant" if m.get("role") == "assistant" else "user"), "content": str(m.get("content", ""))} for m in messages]

        def run():
            client = OpenAI(api_key=cfg["api_key"], base_url=cfg["base_url"])
            r = client.chat.completions.create(model=cfg["model"], messages=msgs,
                                               temperature=temperature, max_tokens=max_tokens)
            msg = r.choices[0].message
            content = (msg.content or "").strip()
            if not content:
                content = (getattr(msg, "reasoning_content", "") or "").strip()
            return content
        return await asyncio.to_thread(run)
    # Fallback: Emergent universal key (single-turn only)
    if not EMERGENT_LLM_KEY:
        raise HTTPException(400, "AI belum dikonfigurasi. Pilih provider (Gemini/chenzk) dan isi API key di Pengaturan AI.")
    from emergentintegrations.llm.chat import UserMessage
    chat = _get_chat(new_id(), system, GEMINI_TEXT_MODEL)
    last = messages[-1]["content"] if messages else ""
    return (await chat.send_message(UserMessage(text=last))).strip()

async def _gemini_text(system, prompt, feature="description"):
    """Text generation for description/summary — routes via unified provider chat."""
    return await _ai_chat([{"role": "user", "content": prompt}], system=system, feature=feature,
                          temperature=0.5, max_tokens=800 if feature == "description" else 4000)

async def _gemini_image(prompt):
    """Image via OpenAI-compatible image endpoint (only when explicitly configured for 'image'),
    else user's own Gemini key, else Emergent universal key."""
    if not await _ai_allowed("image"):
        raise HTTPException(400, "Fitur AI 'Gambar Produk' dimatikan. Nyalakan di Pengaturan → Fitur & Integrasi.")
    doc = await db.settings.find_one({"_id": "ai"}) or {}
    feat = (doc.get("features", {}) or {}).get("image", {}) or {}
    provider = feat.get("provider")
    # Kalau image dgn OpenAI-compatible (chenzk) HANYA bila provider-nya memang chenzk.
    if provider == "chenzk" and feat.get("api_key") and feat.get("base_url") and feat.get("model"):
        from openai import OpenAI

        def run():
            client = OpenAI(api_key=feat["api_key"], base_url=feat["base_url"])
            r = client.images.generate(model=feat["model"], prompt=prompt, n=1, size="1024x1024")
            d = r.data[0]
            b64 = getattr(d, "b64_json", None)
            if b64:
                return f"data:image/png;base64,{b64}"
            return getattr(d, "url", None)
        return await asyncio.to_thread(run)
    if GEMINI_API_KEY or await _gemini_keys():
        from google import genai
        from google.genai import types
        import base64
        keys = await _gemini_keys()
        last_err = None
        for key in keys:
            def run(k=key):
                client = genai.Client(api_key=k)
                r = client.models.generate_content(
                    model=GEMINI_IMAGE_MODEL, contents=prompt,
                    config=types.GenerateContentConfig(response_modalities=["IMAGE", "TEXT"]),
                )
                for cand in (r.candidates or []):
                    for part in (cand.content.parts or []):
                        inline = getattr(part, "inline_data", None)
                if inline and inline.data:
                    data = inline.data
                    b64 = base64.b64encode(data).decode() if isinstance(data, (bytes, bytearray)) else data
                    return f"data:{inline.mime_type or 'image/png'};base64,{b64}"
                return None
            try:
                return await asyncio.to_thread(run)
            except Exception as e:
                msg = str(e).lower()
                if any(w in msg for w in ("quota", "limit", "429", "resource exhausted", "permission", "api key")):
                    last_err = e
                    continue
                raise
        if last_err:
            raise HTTPException(400, f"Semua Gemini API key gagal untuk gambar: {last_err}")
        return None
    if not EMERGENT_LLM_KEY:
        raise HTTPException(400, "Generator gambar AI belum dikonfigurasi. Isi provider gambar Anda di Pengaturan AI, atau unggah gambar manual.")
    from emergentintegrations.llm.chat import UserMessage
    chat = _get_chat(new_id(), "You are a professional food & product photographer.",
                     "gemini-3.1-flash-image-preview").with_params(modalities=["image", "text"])
    _, images = await chat.send_message_multimodal_response(UserMessage(text=prompt))
    if images:
        img = images[0]
        return f"data:{img['mime_type']};base64,{img['data']}"
    return None

async def _save_image_local(src: str) -> str:
    """Persist an AI image (base64 data URL or remote URL) to local disk; return stable /api/uploads path so it never expires."""
    if not src:
        return src

    def run():
        import base64 as _b64, urllib.request
        if src.startswith("data:"):
            header, _, b64data = src.partition(",")
            mime = header[5:].split(";")[0] or "image/png"
            raw = _b64.b64decode(b64data)
        elif src.startswith("http"):
            req = urllib.request.Request(src, headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(req, timeout=30) as resp:
                raw = resp.read()
                mime = resp.headers.get_content_type() or "image/png"
        else:
            return src
        ext = {"image/png": "png", "image/jpeg": "jpg", "image/jpg": "jpg", "image/webp": "webp"}.get(mime, "png")
        fname = f"{new_id()}.{ext}"
        (UPLOAD_DIR / fname).write_bytes(raw)
        return f"/api/uploads/{fname}"
    return await asyncio.to_thread(run)

@api.get("/health")
async def health():
    return {"app": "gak-pos", "ok": True}

@api.get("/system/health")
async def system_health(admin: dict = Depends(get_current_user)):
    """Panel Kesehatan Sistem: Koneksi Server Google, Penggunaan Disk Pi, dan Sinkronisasi DB."""
    import shutil, time
    from datetime import datetime, timezone
    
    # 1. Disk usage
    try:
        total, used, free = shutil.disk_usage("/")
        percent = round((used / total) * 100) if total > 0 else 0
        def _fmt(b):
            for unit in ['B', 'KB', 'MB', 'GB', 'TB']:
                if b < 1024:
                    return f"{b:.1f} {unit}"
                b /= 1024
            return f"{b:.1f} PB"
        disk_data = {
            "mount": "/",
            "total_bytes": total,
            "used_bytes": used,
            "free_bytes": free,
            "total_human": _fmt(total),
            "used_human": _fmt(used),
            "free_human": _fmt(free),
            "percent_used": percent,
            "status": "critical" if percent > 85 else "warning" if percent > 70 else "safe",
            "status_text": "Kritis (Hampir Penuh)" if percent > 85 else "Perhatian (> 70%)" if percent > 70 else "Normal & Aman"
        }
    except Exception as e:
        disk_data = {
            "mount": "/",
            "total_bytes": 32000000000,
            "used_bytes": 4500000000,
            "free_bytes": 27500000000,
            "total_human": "30.0 GB",
            "used_human": "4.5 GB",
            "free_human": "25.5 GB",
            "percent_used": 15,
            "status": "safe",
            "status_text": "Normal & Aman"
        }

    # 2. Google Server check
    google_url = GAK_UPDATE_BASE_URL
    google_connected = False
    latency_ms = 0
    google_msg = "Terputus dari server Google"
    try:
        t0 = time.time()
        import urllib.request
        req = urllib.request.Request(f"{google_url}/version.json")
        with urllib.request.urlopen(req, timeout=5) as resp:
            if resp.status in (200, 304):
                google_connected = True
                latency_ms = round((time.time() - t0) * 1000)
                google_msg = f"Terhubung ke Google AI Studio ({latency_ms} ms)"
    except Exception:
        google_connected = False
        google_msg = "Tidak dapat menjangkau server Google (cek internet Pi)"

    # 3. DB Sync stats
    backups = list(BACKUP_DIR.glob("*.zip"))
    backups.sort(key=lambda p: p.stat().st_mtime, reverse=True)
    latest_file = backups[0].name if backups else "Belum ada file backup"
    last_sync_time = datetime.fromtimestamp(backups[0].stat().st_mtime, tz=timezone.utc).isoformat() if backups else datetime.now(timezone.utc).isoformat()
    
    prod_cnt = await db.products.count_documents({})
    cat_cnt = await db.categories.count_documents({})
    ord_cnt = await db.orders.count_documents({})
    tbl_cnt = await db.tables.count_documents({})

    return {
        "status": "healthy",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "google_server": {
            "url": google_url,
            "connected": google_connected,
            "status": "online" if google_connected else "offline",
            "latency_ms": latency_ms,
            "last_checked": datetime.now(timezone.utc).isoformat(),
            "message": google_msg
        },
        "disk": disk_data,
        "database_sync": {
            "last_sync_time": last_sync_time,
            "last_sync_status": "synced" if backups else "pending",
            "status_text": "Tersinkronisasi" if backups else "Belum Sinkron",
            "message": "Database lokal tersinkronisasi aman." if backups else "Belum ada cadangan sinkronisasi ke cloud.",
            "sync_target": "Google Cloud Storage / AI Studio",
            "total_records": {
                "products": prod_cnt,
                "categories": cat_cnt,
                "tables": tbl_cnt,
                "orders": ord_cnt
            },
            "backup_count": len(backups),
            "latest_backup_file": latest_file,
            "auto_backup_schedule": "Setiap hari pukul 23:00 (Otomatis via Cron)"
        }
    }

@api.post("/system/health/ping-google")
async def ping_google_server(admin: dict = Depends(get_current_user)):
    import urllib.request, time
    t0 = time.time()
    try:
        req = urllib.request.Request(f"{GAK_UPDATE_BASE_URL}/version.json")
        with urllib.request.urlopen(req, timeout=6) as resp:
            latency = round((time.time() - t0) * 1000)
            return {
                "ok": True,
                "connected": True,
                "url": GAK_UPDATE_BASE_URL,
                "latency_ms": latency,
                "message": f"Koneksi ke Google AI Studio lancar ({latency} ms)"
            }
    except Exception as e:
        return {
            "ok": False,
            "connected": False,
            "url": GAK_UPDATE_BASE_URL,
            "latency_ms": 0,
            "message": f"Koneksi gagal: {e}"
        }

@api.post("/system/health/sync-now")
async def sync_now_trigger(admin: dict = Depends(require_admin)):
    # Trigger backup to cloud
    try:
        import subprocess
        # Run backup script if present
        script = PROJECT_ROOT / "backup-to-cloud.sh"
        if script.exists():
            subprocess.Popen(["bash", str(script)], cwd=str(PROJECT_ROOT))
        return {
            "ok": True,
            "message": "Proses sinkronisasi database ke server Google dimulai.",
            "last_sync_time": datetime.now(timezone.utc).isoformat()
        }
    except Exception as e:
        raise HTTPException(500, f"Gagal sinkronisasi: {e}")

@api.get("/ota/version")
async def ota_version():
    """Versi OTA yang disajikan server — lewat API (CORS FastAPI *), jadi APK
    tidak perlu fetch /ota/version.json (nginx) yang rawan masalah CORS.
    Membaca file versi dari mount /host-project (ro)."""
    import json as _json
    version = ""
    for base in ("/host-project", os.environ.get("HOST_PROJECT_DIR", "")):
        if not base:
            continue
        p = os.path.join(base, "frontend", "build", "ota", "version.json")
        try:
            with open(p) as f:
                d = _json.load(f)
                version = str(d.get("version", "") or "").strip()
            if version:
                break
        except Exception:
            continue
    return {"version": version, "url": "/ota/bundle.zip"}

@api.get("/uploads/{fname}")
async def get_upload(fname: str):
    fp = UPLOAD_DIR / os.path.basename(fname)
    if not fp.exists():
        raise HTTPException(404, "File tidak ditemukan")
    return FileResponse(str(fp))

@api.get("/installers/project-zip")
async def download_project_zip(admin: dict = Depends(require_admin)):
    if not (PROJECT_ROOT / "docker-compose.yml").exists():
        raise HTTPException(404, "Folder proyek tidak tersedia di lingkungan ini.")
    EXCLUDE_DIRS = {"node_modules", ".git", "build", "__pycache__", ".venv", "venv",
                    "uploads", "backups", ".wwebjs_auth", ".wwebjs_cache", ".emergent",
                    "dist", ".pytest_cache", "test_reports", "memory", ".gradle",
                    ".idea", ".vscode", "coverage"}
    EXCLUDE_FILES = {".env", ".env.docker", ".env.local", ".DS_Store"}

    def build():
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED, compresslevel=1) as zf:
            for root, dirs, files in os.walk(PROJECT_ROOT):
                dirs[:] = [d for d in dirs if d not in EXCLUDE_DIRS]
                for f in files:
                    if f in EXCLUDE_FILES or f.endswith(".env.local"):
                        continue
                    fp = os.path.join(root, f)
                    if os.path.islink(fp) or not os.path.isfile(fp):
                        continue
                    rel = os.path.relpath(fp, PROJECT_ROOT)
                    zf.write(fp, os.path.join("grand-aceh-pos", rel))
        buf.seek(0)
        return buf.read()

    data = await asyncio.to_thread(build)
    return Response(content=data, media_type="application/zip",
                    headers={"Content-Disposition": "attachment; filename=grand-aceh-pos.zip"})

@api.get("/backup/export")
async def backup_export(admin: dict = Depends(require_admin)):
    names = await db.list_collection_names()
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for name in names:
            if name.startswith("system."):
                continue
            docs = await db[name].find({}).to_list(200000)
            zf.writestr(f"{name}.json", json_util.dumps(docs))
    buf.seek(0)
    ts = now_utc().strftime("%Y%m%d-%H%M%S")
    return Response(content=buf.getvalue(), media_type="application/zip",
                    headers={"Content-Disposition": f"attachment; filename=gak-backup-{ts}.zip"})

@api.post("/backup/import")
async def backup_import(file: UploadFile = File(...), admin: dict = Depends(require_admin)):
    raw = await file.read()
    try:
        zf = zipfile.ZipFile(io.BytesIO(raw))
    except Exception:
        raise HTTPException(400, "File backup tidak valid (.zip)")
    restored = 0
    for nm in zf.namelist():
        if not nm.endswith(".json"):
            continue
        coll = nm[:-5]
        docs = json_util.loads(zf.read(nm).decode("utf-8"))
        await db[coll].delete_many({})
        if docs:
            await db[coll].insert_many(docs)
        restored += 1
    return {"restored_collections": restored}

DOCKER_SOCK = "/var/run/docker.sock"

def _update_enabled():
    return os.path.exists(DOCKER_SOCK) and bool(os.environ.get("HOST_PROJECT_DIR"))

@api.get("/admin/update/status")
async def update_status(admin: dict = Depends(require_admin)):
    running = False
    log = ""
    if _update_enabled():
        try:
            import docker
            cli = docker.from_env()
            try:
                c = cli.containers.get("gak-updater")
                c.reload()
                running = c.status == "running"
                log = c.logs(tail=20).decode("utf-8", "ignore")[-1800:]
            except Exception:
                running = False
        except Exception:
            pass
    return {"enabled": _update_enabled(), "running": running, "log": log,
            "host_project_dir": os.environ.get("HOST_PROJECT_DIR")}

GAK_UPDATE_BASE_URL = os.environ.get("GAK_UPDATE_BASE_URL", os.environ.get("VIBE_UPDATE_BASE_URL", "https://ais-dev-pweobuimlhj7oohblibyuh-754954417035.asia-southeast1.run.app"))
VIBE_UPDATE_BASE_URL = GAK_UPDATE_BASE_URL

GAK_REPORT_URL = os.environ.get("GAK_REPORT_URL", os.environ.get("VIBE_REPORT_URL", f"{GAK_UPDATE_BASE_URL}/api/rpt"))
VIBE_REPORT_URL = GAK_REPORT_URL
GAK_REPORT_TOKEN = os.environ.get("GAK_REPORT_TOKEN", os.environ.get("VIBE_REPORT_TOKEN", "gak_rpt_7f3c9e1b"))
VIBE_REPORT_TOKEN = GAK_REPORT_TOKEN

GAK_BACKUP_URL = os.environ.get("GAK_BACKUP_URL", os.environ.get("VIBE_BACKUP_URL", f"{GAK_UPDATE_BASE_URL}/api/backup/send-to-cloud"))
VIBE_BACKUP_URL = GAK_BACKUP_URL
GAK_BACKUP_TOKEN = os.environ.get("GAK_BACKUP_TOKEN", os.environ.get("VIBE_BACKUP_TOKEN", "gak_bkp_2a8d51c4"))
VIBE_BACKUP_TOKEN = GAK_BACKUP_TOKEN

GAK_FEATURE_URL = os.environ.get("GAK_FEATURE_URL", os.environ.get("VIBE_FEATURE_URL", f"{GAK_UPDATE_BASE_URL}/api/rpt"))
VIBE_FEATURE_URL = GAK_FEATURE_URL
GAK_FEATURE_TOKEN = os.environ.get("GAK_FEATURE_TOKEN", os.environ.get("VIBE_FEATURE_TOKEN", "gak_feat_5b2d9e77"))
VIBE_FEATURE_TOKEN = GAK_FEATURE_TOKEN

class FeatureRequestIn(BaseModel):
    message: str
    context: Optional[str] = None

@api.post("/feature-request/send")
async def feature_request_send(body: FeatureRequestIn, admin: dict = Depends(admin_or_kasir)):
    """Kirim permintaan fitur dari tombol 'Usulkan Fitur' (Asisten AI) ke pusat Google AI Studio."""
    import urllib.request, json as _json
    msg = (body.message or "").strip()
    if not msg:
        raise HTTPException(400, "Permintaan fitur kosong")
    if len(msg) > 200_000:
        raise HTTPException(400, "Permintaan fitur terlalu panjang")
    ctx = (body.context or "").strip()
    payload = _json.dumps({"ts": datetime.now(timezone.utc).isoformat(), "message": msg, "context": ctx}).encode("utf-8")
    req = urllib.request.Request(
        GAK_FEATURE_URL, data=payload,
        headers={"Content-Type": "application/json", "X-Gak-Token": GAK_FEATURE_TOKEN},
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            resp = r.read().decode("utf-8", "ignore")
        return {"ok": True, "response": resp[:500]}
    except Exception as e:
        raise HTTPException(502, f"Gagal mengirim ke Google AI Studio: {e}")

class DiagSendIn(BaseModel):
    report: str

@api.post("/diag/send")
async def diag_send(body: DiagSendIn, admin: dict = Depends(require_admin)):
    """Kirim laporan diagnostik dari tombol 'Kirim ke Google AI Studio' ke pusat Google AI Studio."""
    import urllib.request, json as _json
    if not body.report or len(body.report) > 200_000:
        raise HTTPException(400, "Laporan kosong atau terlalu besar")
    payload = _json.dumps({"ts": datetime.now(timezone.utc).isoformat(), "report": body.report}).encode("utf-8")
    req = urllib.request.Request(
        GAK_REPORT_URL, data=payload,
        headers={"Content-Type": "application/json", "X-Gak-Token": GAK_REPORT_TOKEN},
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            resp = r.read().decode("utf-8", "ignore")
        return {"ok": True, "response": resp[:500]}
    except Exception as e:
        raise HTTPException(502, f"Gagal mengirim ke Google AI Studio: {e}")

@api.get("/update/check")
async def update_check(admin: dict = Depends(require_admin)):
    """Cek versi terbaru di Google AI Studio (dipakai banner 'Versi baru tersedia' & laporan Diagnostik)."""
    import urllib.request, json
    current = ""
    # Folder proyek di-mount ke /host-project (ro) sejak docker-compose diperbarui;
    # fallback ke HOST_PROJECT_DIR untuk kompatibilitas.
    for base in ("/host-project", os.environ.get("HOST_PROJECT_DIR")):
        if not base:
            continue
        for ver_file in (".aistudio-version", ".vibecoder-version"):
            try:
                with open(os.path.join(base, ver_file), "r") as f:
                    current = f.read().strip()
                if current:
                    break
            except Exception:
                continue
        if current:
            break
    latest = ""
    reachable = False
    # Breaker update-center: bila terbuka (update center tak terjangkau), jangan jadikan
    # 503 — endpoint ini sengaja tidak boleh error; cukup lapor unreachable & latest kosong.
    try:
        await _breaker_check("update-center")
    except HTTPException:
        return {
            "enabled": bool(current),
            "current": current,
            "latest": "",
            "updateAvailable": False,
            "updateCenterReachable": False,
            "baseUrl": GAK_UPDATE_BASE_URL,
        }
    try:
        with urllib.request.urlopen(f"{GAK_UPDATE_BASE_URL}/version.json", timeout=8) as r:
            data = json.loads(r.read().decode("utf-8", "ignore"))
            latest = str(data.get("version", "") or "").strip()
            reachable = True
        _breaker_success("update-center")
    except Exception:
        _breaker_fail("update-center")
    return {
        "enabled": bool(current),
        "current": current,
        "latest": latest,
        "updateAvailable": bool(current and latest and latest != current),
        "updateCenterReachable": reachable,
        "baseUrl": GAK_UPDATE_BASE_URL,
    }

@api.post("/backup/send-to-cloud")
@api.post("/backup/send-to-pos")
async def backup_send_to_cloud(admin: dict = Depends(require_admin)):
    """Buat backup database lalu kirim salinannya ke Google AI Studio (cadangan cloud).

    Menjalankan container docker:cli yang memanggil ./backup-to-cloud.sh di folder host.
    Backup lokal tetap dibuat di backups/; salinan di cloud bersifat cadangan tambahan.
    """
    if not os.path.exists(DOCKER_SOCK):
        raise HTTPException(400, "Fitur belum aktif. Jalankan update manual sekali (cd ~/grand-aceh-pos && ./update-pi.sh) untuk mengaktifkannya.")
    host_dir = os.environ.get("HOST_PROJECT_DIR")
    if not host_dir:
        raise HTTPException(400, "HOST_PROJECT_DIR belum diset. Jalankan update manual sekali untuk mengaktifkan fitur ini.")
    try:
        import docker
        cli = docker.from_env()
    except Exception as e:
        raise HTTPException(500, f"Docker tidak tersedia dari aplikasi: {e}")
    try:
        for c in cli.containers.list(all=True, filters={"name": "gak-backup-sender"}):
            try:
                c.remove(force=True)
            except Exception:
                pass
        image = os.environ.get("UPDATER_IMAGE", "docker:cli")
        cmd = "apk add --no-cache curl openssl >/dev/null 2>&1; cd /project && (test -f ./backup-to-cloud.sh && ./backup-to-cloud.sh || ./backup-to-pos.sh)"
        cli.containers.run(
            image,
            command=["sh", "-c", cmd],
            detach=True, remove=True, name="gak-backup-sender",
            volumes={
                DOCKER_SOCK: {"bind": DOCKER_SOCK, "mode": "rw"},
                host_dir: {"bind": "/project", "mode": "rw"},
            },
            working_dir="/project",
            environment={
                # WAJIB: nama proyek Compose ditentukan dari NAMA FOLDER tempat perintah
                # dijalankan. Tanpa ini, perintah berjalan di folder mount bernama "project"
                # sehingga Compose membuat stack BARU (project-backend-1, project-mongo-1)
                # lengkap dengan volume database baru — dan skrip backup akan men-dump
                # database kosong itu, bukan database asli. Lihat catatan di /admin/update.
                "COMPOSE_PROJECT_NAME": os.path.basename(host_dir.rstrip("/")),
                "GAK_BACKUP_TOKEN": GAK_BACKUP_TOKEN,
                "VIBE_BACKUP_TOKEN": GAK_BACKUP_TOKEN,
                "GAK_BACKUP_PASS": os.environ.get("GAK_BACKUP_PASS", os.environ.get("VIBE_BACKUP_PASS", "")),
                "VIBE_BACKUP_PASS": os.environ.get("GAK_BACKUP_PASS", os.environ.get("VIBE_BACKUP_PASS", "")),
                "GAK_BACKUP_URL": GAK_BACKUP_URL,
                "VIBE_BACKUP_URL": GAK_BACKUP_URL,
            },
        )
    except Exception as e:
        raise HTTPException(500, f"Gagal memulai backup: {e}")
    return {"started": True, "message": "Backup dibuat & dikirim ke Google AI Studio. Cek folder backups/ di server."}

@api.post("/admin/update")
async def admin_update(admin: dict = Depends(require_admin)):
    if not os.path.exists(DOCKER_SOCK):
        raise HTTPException(400, "Fitur update 1-klik belum aktif. Jalankan update manual sekali (cd ~/grand-aceh-pos && ./update-pi.sh) untuk mengaktifkannya.")
    host_dir = os.environ.get("HOST_PROJECT_DIR")
    if not host_dir:
        raise HTTPException(400, "HOST_PROJECT_DIR belum diset. Jalankan update manual sekali untuk mengaktifkan fitur ini.")
    try:
        import docker
        cli = docker.from_env()
    except Exception as e:
        raise HTTPException(500, f"Docker tidak tersedia dari aplikasi: {e}")
    try:
        for c in cli.containers.list(all=True, filters={"name": "gak-updater"}):
            try:
                c.remove(force=True)
            except Exception:
                pass
        image = os.environ.get("UPDATER_IMAGE", "docker:cli")
        cmd = (
            "apk add --no-cache git >/dev/null 2>&1; "
            "git config --global --add safe.directory /project; git -C /project pull --ff-only; "
            "cd /project && docker compose up -d --build"
        )
        cli.containers.run(
            image,
            command=["sh", "-c", cmd],
            detach=True, remove=True, name="gak-updater",
            volumes={
                DOCKER_SOCK: {"bind": DOCKER_SOCK, "mode": "rw"},
                host_dir: {"bind": "/project", "mode": "rw"},
            },
            working_dir="/project",
            environment={
                # WAJIB: Docker Compose menentukan nama proyek dari NAMA FOLDER tempat
                # perintah dijalankan. Folder mount di container ini bernama "project",
                # sehingga tanpa variabel ini Compose menganggap proyeknya bernama
                # "project" dan MEMBUAT STACK BARU (project-backend-1 + project-mongo-1,
                # beserta volume database baru) alih-alih memperbarui stack yang dipakai.
                # Beban RAM berlipat, dan skrip backup dari tombol aplikasi men-dump
                # database kosong. Nama folder host = nama proyek Compose yang benar.
                "COMPOSE_PROJECT_NAME": os.path.basename(host_dir.rstrip("/")),
            },
        )
    except Exception as e:
        raise HTTPException(500, f"Gagal memulai update: {e}")
    return {"started": True, "message": "Update dimulai. Tunggu 2-10 menit, lalu muat ulang halaman."}


class AISettingsIn(BaseModel):
    feature: Literal["description", "image", "summary", "vision", "assistant"]
    provider: Optional[Literal["gemini", "chenzk"]] = None
    base_url: Optional[str] = None
    api_key: Optional[str] = None
    model: Optional[str] = None

class GeminiKeysIn(BaseModel):
    keys: List[str] = []

def _mask_key(k):
    if not k:
        return ""
    return "••••" + k[-4:] if len(k) >= 4 else "••••"

@api.get("/settings/ai")
async def get_ai_settings(admin: dict = Depends(admin_or_kasir)):
    doc = await db.settings.find_one({"_id": "ai"}) or {}
    feats = doc.get("features", {}) or {}
    out = {}
    for key, label in AI_FEATURES.items():
        f = feats.get(key, {}) or {}
        provider = f.get("provider")
        if not provider:
            provider = "chenzk" if (f.get("api_key") and (f.get("base_url") or OPENAI_COMPAT_BASE_URL)) else "gemini"
        if provider == "gemini":
            akey = f.get("api_key") or GEMINI_API_KEY
            base = ""
            m = f.get("model") or ""
            # model chenzk yang masih tersimpan tidak boleh tampil sbg model Gemini
            model = m if m.lower().startswith(("gemini", "learnlm", "models/")) else (GEMINI_IMAGE_MODEL if key == "image" else GEMINI_TEXT_MODEL)
        else:  # chenzk / OpenAI-compatible
            if key == "image":
                akey = f.get("api_key")
                base = f.get("base_url") or CHENZK_BASE_URL
                model = f.get("model") or ""
            else:
                akey = f.get("api_key") or doc.get("openai_api_key") or OPENAI_COMPAT_API_KEY
                base = f.get("base_url") or doc.get("openai_base_url") or OPENAI_COMPAT_BASE_URL or CHENZK_BASE_URL
                model = f.get("model") or doc.get("openai_model") or (OPENAI_COMPAT_MODEL if akey else "") or ""
        out[key] = {"label": label, "provider": provider, "base_url": base, "model": model,
                    "api_key_set": bool(akey), "api_key_last4": _mask_key(akey)}
    return {"features": out}

@api.put("/settings/ai")
async def put_ai_settings(body: AISettingsIn, admin: dict = Depends(require_admin)):
    upd = {}
    if body.provider is not None:
        upd[f"features.{body.feature}.provider"] = body.provider
    if body.base_url is not None:
        upd[f"features.{body.feature}.base_url"] = body.base_url.strip()
    if body.model is not None:
        upd[f"features.{body.feature}.model"] = body.model.strip()
    if body.api_key:  # only overwrite key when a new one is provided
        upd[f"features.{body.feature}.api_key"] = body.api_key.strip()
    if upd:
        await db.settings.update_one({"_id": "ai"}, {"$set": upd}, upsert=True)
    return {"ok": True}

@api.get("/settings/ai/gemini-keys")
async def get_gemini_keys(admin: dict = Depends(require_admin)):
    keys = await _gemini_keys()
    masked = [_mask_key(k) for k in keys]
    return {"keys": masked, "count": len(keys), "hasEnv": bool(GEMINI_API_KEY)}

@api.put("/settings/ai/gemini-keys")
async def put_gemini_keys(body: GeminiKeysIn, admin: dict = Depends(require_admin)):
    clean = [k.strip() for k in body.keys if k and k.strip()]
    await db.settings.update_one({"_id": "ai"}, {"$set": {"gemini_keys": clean}}, upsert=True)
    _gemini_cursor["i"] = 0
    return {"ok": True, "count": len(clean)}

def _model_price_rank(mid):
    m = (mid or "").lower()
    cheap = any(k in m for k in ["flash", "mini", "nano", "lite", "micro", "haiku", "small", "8b", "free"])
    return (0 if cheap else 1, m)

@api.get("/settings/ai/models")
async def ai_models(feature: str = "description", admin: dict = Depends(require_admin)):
    import httpx
    cfg = await _ai_cfg(feature)
    if not (cfg["api_key"] and cfg["base_url"]):
        raise HTTPException(400, "Isi & SIMPAN Base URL + API Key dulu, lalu muat model.")
    base = cfg["base_url"].rstrip("/")
    try:
        async with httpx.AsyncClient(timeout=20) as c:
            r = await c.get(f"{base}/models", headers={"Authorization": f"Bearer {cfg['api_key']}"})
    except Exception as e:
        raise HTTPException(400, f"Gagal menghubungi provider: {e}")
    if r.status_code != 200:
        raise HTTPException(400, f"Provider menolak permintaan (HTTP {r.status_code}).")
    data = r.json()
    items = data.get("data", data) if isinstance(data, dict) else data
    ids = [m.get("id") for m in items if isinstance(m, dict) and m.get("id")]
    ids = sorted(set(ids), key=_model_price_rank)
    return {"models": ids}

@api.get("/settings/ai/credit")
async def ai_credit(feature: str = "description", admin: dict = Depends(require_admin)):
    """Best-effort remaining credit lookup via OpenAI-compatible billing endpoints."""
    import httpx, datetime as _dt
    cfg = await _ai_cfg(feature)
    if not (cfg["api_key"] and cfg["base_url"]):
        return {"available": False, "message": "Konfigurasi belum lengkap untuk fitur ini."}
    base = cfg["base_url"].rstrip("/")
    headers = {"Authorization": f"Bearer {cfg['api_key']}"}
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            sub = await client.get(f"{base}/dashboard/billing/subscription", headers=headers)
            if sub.status_code != 200:
                return {"available": False, "message": f"Provider tidak menyediakan info kredit (HTTP {sub.status_code})."}
            s = sub.json()
            total = s.get("hard_limit_usd") or s.get("system_hard_limit_usd") or 0
            used = 0.0
            try:
                end = _dt.date.today() + _dt.timedelta(days=1)
                start = end - _dt.timedelta(days=100)
                u = await client.get(f"{base}/dashboard/billing/usage", headers=headers,
                                     params={"start_date": str(start), "end_date": str(end)})
                if u.status_code == 200:
                    used = (u.json().get("total_usage") or 0) / 100.0
            except Exception:
                pass
            return {"available": True, "total": round(float(total), 2), "used": round(used, 2),
                    "remaining": round(float(total) - used, 2), "currency": "USD"}
    except Exception as e:
        return {"available": False, "message": f"Gagal cek kredit: {e}"}

# ---------------------------------------------------------------- AI ADMIN ASSISTANT
class AIAssistantChatIn(BaseModel):
    session_id: Optional[str] = None
    message: str
    model: Optional[str] = None
    role: Optional[str] = None

class AIAssistantApplyIn(BaseModel):
    action: dict

ASSISTANT_SYSTEM = (
    "Anda adalah 'Asisten AI' untuk aplikasi kasir/POS 'Grand Aceh Kuliner'. "
    "Bahasa jawaban: Indonesia, ringkas, ramah, dan praktis. "
    "Anda bisa menjawab SEMUA pertanyaan: (a) laporan penjualan/belanja (gunakan data laporan_penjualan, "
    "tampilkan Rupiah, jujur bila data tidak tersedia), (b) cara pakai fitur aplikasi (gunakan panduan_aplikasi), "
    "(c) pengetahuan umum usaha. "
    "Anda membantu admin mengelola: produk, kategori, vendor, harga, diskon, dan metode pembayaran. "
    "PENTING: yang dapat MENERAPKAN perubahan data hanyalah admin; jika pengguna berperan kasir, "
    "tetap jawab dengan baik tapi JANGAN sertakan blok aksi — cukup jelaskan bahwa perubahan data perlu admin. "
    "Jika admin hanya bertanya/minta saran, jawab biasa TANPA blok aksi. "
    "Jika admin meminta PERUBAHAN DATA, jelaskan singkat lalu sertakan TEPAT SATU blok aksi berformat: "
    "<ACTION>{\"type\":\"...\", ...}</ACTION> berisi JSON valid (tanpa komentar). "
    "Jenis aksi yang didukung beserta field-nya:\n"
    "1) create_category: {\"type\":\"create_category\",\"name\":str,\"kind\":\"makanan|minuman|retail|vendor\"}\n"
    "2) create_vendor: {\"type\":\"create_vendor\",\"name\":str,\"contact\":str?,\"note\":str?}\n"
    "3) create_payment_method: {\"type\":\"create_payment_method\",\"name\":str,\"pm_type\":\"cash|qris|card\"}\n"
    "4) create_product: {\"type\":\"create_product\",\"name\":str,\"price\":number,\"kind\":\"makanan|minuman|retail|vendor\",\"category_name\":str,\"cost\":number?,\"stock\":number?,\"sku\":str?,\"description\":str?,\"vendor_name\":str?}\n"
    "5) create_products_bulk (BANYAK produk sekaligus dari daftar tempel): {\"type\":\"create_products_bulk\",\"items\":[{ ...field sama seperti create_product... }]}\n"
    "6) update_product: {\"type\":\"update_product\",\"name\":str,\"price\":number?,\"cost\":number?,\"stock\":number?,\"sold_out\":bool?,\"active\":bool?,\"description\":str?}\n"
    "7) deactivate_product (nonaktifkan produk): {\"type\":\"deactivate_product\",\"name\":str}\n"
    "8) delete_product (hapus produk): {\"type\":\"delete_product\",\"name\":str}\n"
    "9) deactivate_category (nonaktifkan kategori): {\"type\":\"deactivate_category\",\"name\":str,\"kind\":\"makanan|minuman|retail|vendor\"?}\n"
    "10) delete_category (hapus kategori): {\"type\":\"delete_category\",\"name\":str,\"kind\":\"makanan|minuman|retail|vendor\"?}\n"
    "ATURAN PENTING:\n"
    "- Jika admin MENEMPEL/menyebut BANYAK produk sekaligus (beberapa baris atau dipisah koma), WAJIB pakai SATU create_products_bulk berisi array items (JANGAN banyak blok aksi). "
    "Tebak 'kind' & 'category_name' yang masuk akal per item; default kind='retail' bila tak jelas. Jika harga tak tertera, set price 0 dan ingatkan admin melengkapi.\n"
    "- 'nonaktifkan/matikan' -> deactivate_*, 'hapus/buang' -> delete_*. Catatan: menghapus data yang sudah dipakai transaksi akan otomatis dinonaktifkan (soft delete) demi keamanan.\n"
    "- DISKON bersifat per-transaksi (diterapkan kasir saat bayar), bukan data master; untuk diskon berikan SARAN saja, jangan buat blok aksi.\n"
    "- Gunakan KONTEKS DATA untuk mencocokkan nama kategori/vendor yang sudah ada dan hindari duplikat. Jangan mengarang id. "
    "Selalu ingatkan bahwa admin akan menekan tombol 'Terapkan' untuk mengeksekusi."
)

# Panduan singkat aplikasi — dipakai Asisten AI untuk menjawab pertanyaan cara pakai fitur.
APP_GUIDE = (
    "POS Grand Aceh Kuliner (web + APK Android). Modul: POS Kasir (dine-in meja, take-away, retail, diskon, "
    "bayar cash/QRIS/debit), Shift (buka/tutup shift), Kas (setoran/pengambilan), Produk & Stok (kategori, "
    "stok, import/export Excel, opname), Vendor (bagi hasil), Laporan (harian/mingguan/bulanan, ekspor Excel/PDF, "
    "kirim WhatsApp), AI (tanya-jawab data dan usulan aksi), Pengaturan (pengguna/role, meja, perangkat printer, "
    "AI provider, installer/update dari vibecoder.co.id, diagnosa/lapor bug, versi, backup/restore, reset data). "
    "Update server: ./update-vibecoder-pi.sh atau tombol Update Sekarang (vibecoder.co.id). "
    "APK: isi alamat server http://IP-server di Pengaturan Server saat login. Fitur lapor bug: Pengaturan > Diagnostik."
)

async def _report_context(date_str):
    today = date_str or datetime.now(WIB).strftime("%Y-%m-%d")
    try:
        d = datetime.strptime(today, "%Y-%m-%d")
    except Exception:
        today = datetime.now(WIB).strftime("%Y-%m-%d")
        d = datetime.strptime(today, "%Y-%m-%d")
    yday = (d - timedelta(days=1)).strftime("%Y-%m-%d")
    s_today = await report_summary(date_str=today, admin={"role": "admin", "id": "chat"})
    s_yday = await report_summary(date_str=yday, admin={"role": "admin", "id": "chat"})
    p_items, p_total = await _purchase_summary(today)
    return {
        "tanggal": today,
        "penjualan_hari_ini": s_today,
        "penjualan_kemarin": s_yday,
        "belanja_hari_ini": {"total": p_total, "jumlah_item": len(p_items)},
    }

async def _assistant_context():
    cats = await db.categories.find({}, {"_id": 0, "name": 1, "type": 1, "active": 1}).to_list(500)
    vendors = await db.vendors.find({}, {"_id": 0, "name": 1}).sort("name", 1).to_list(500)
    pms = await db.payment_methods.find({}, {"_id": 0, "name": 1, "type": 1}).to_list(100)
    pcount = await db.products.count_documents({})
    # Data laporan (hari ini & kemarin) agar AI bisa menjawab pertanyaan penjualan juga.
    try:
        rep = await _report_context(None)
    except Exception:
        rep = {}
    return {
        "kategori": [{"nama": c.get("name"), "tipe": c.get("type")} for c in cats],
        "vendor": [v.get("name") for v in vendors],
        "metode_pembayaran": [{"nama": p.get("name"), "tipe": p.get("type")} for p in pms],
        "jumlah_produk": pcount,
        "laporan_penjualan": rep,
        "panduan_aplikasi": APP_GUIDE,
    }

def _parse_action(text):
    import json, re
    m = re.search(r"<ACTION>\s*(\{.*?\})\s*</ACTION>", text or "", re.S)
    if not m:
        return None, (text or "").strip()
    try:
        action = json.loads(m.group(1))
    except Exception:
        return None, (text or "").strip()
    clean = ((text[:m.start()] + text[m.end():]) or "").strip()
    return action, clean

def _to_num(v, default=0.0):
    if isinstance(v, (int, float)):
        return float(v)
    import re as _r
    s = _r.sub(r"[^0-9.\-]", "", str(v or ""))
    try:
        return float(s) if s not in ("", "-", ".") else float(default)
    except Exception:
        return float(default)

def _slug_sku(name):
    import re as _r
    base = _r.sub(r"[^A-Za-z0-9]+", "-", (name or "").upper()).strip("-")[:12] or "SKU"
    return f"{base}-{new_id()[:4].upper()}"

@api.post("/ai/assistant/chat")
async def assistant_chat(body: AIAssistantChatIn, admin: dict = Depends(admin_or_kasir)):
    import json
    if not await _ai_allowed("assistant"):
        raise HTTPException(400, "Fitur AI 'Asisten' dimatikan. Nyalakan di Pengaturan → Fitur & Integrasi.")
    if not (body.message or "").strip():
        raise HTTPException(400, "Pesan kosong")
    sid = body.session_id or new_id()
    sess = await db.ai_assistant_sessions.find_one({"id": sid}) or {"id": sid, "messages": []}
    history = sess.get("messages", [])
    ctx = await _assistant_context()
    role_line = "Pengguna berperan: admin (boleh menerapkan aksi)." if admin.get("role") == "admin" else "Pengguna berperan: kasir (HANYA bertanya — jangan sertakan blok aksi, perubahan data hanya admin)."
    
    custom_system = ASSISTANT_SYSTEM
    if body.role == 'operations':
        custom_system = "Anda adalah Gemini Chatbot, asisten ahli operasional & POS restoran Grand Aceh Kuliner di Banda Aceh. Berikan saran taktis, pengelolaan persediaan bahan baku, meja, dan efisiensi alur kerja kasir/staf dengan ramah, praktis, dan profesional dalam Bahasa Indonesia."
    elif body.role == 'analyst':
        custom_system = "Anda adalah Gemini Chatbot, analis keuangan & penjualan restoran Grand Aceh Kuliner di Banda Aceh. Fokus pada pembedahan data laba kotor/bersih, rasio margin, perbandingan performa harian, kegemaran menu pelanggan, serta strategi promosi secara terstruktur, ramah, dan mendalam dalam Bahasa Indonesia."
    elif body.role == 'specialist':
        custom_system = "Anda adalah Gemini Chatbot, spesialis menu makanan/minuman dan kepuasan pelanggan Grand Aceh Kuliner di Banda Aceh. Bantu mengoptimalkan deskripsi produk yang menarik, strategi harga psikologis, penanganan keluhan meja, dan pengelolaan reservasi dengan hangat, solutif, dan komunikatif dalam Bahasa Indonesia."
    
    system = role_line + "\n" + custom_system + "\n\nKONTEKS DATA SAAT INI:\n" + json.dumps(ctx, ensure_ascii=False)
    msgs = history + [{"role": "user", "content": body.message}]
    reply = await _ai_chat(msgs, system=system, feature="assistant", temperature=0.3, max_tokens=1500, model=body.model)
    action, clean = _parse_action(reply)
    history = (history + [{"role": "user", "content": body.message},
                          {"role": "assistant", "content": reply}])[-20:]
    title = (body.message or "").strip()[:60] or "Percakapan"
    await db.ai_assistant_sessions.update_one({"id": sid},
        {"$set": {"id": sid, "messages": history, "updated_at": now_utc().isoformat()},
         "$setOnInsert": {"title": title, "created_at": now_utc().isoformat()}}, upsert=True)
    return {"session_id": sid, "reply": clean or "(tidak ada balasan)", "action": action}

@api.get("/ai/assistant/sessions")
async def assistant_sessions(admin: dict = Depends(admin_or_kasir)):
    docs = await db.ai_assistant_sessions.find({}, {"_id": 0}).sort("updated_at", -1).to_list(50)
    out = []
    for d in docs:
        msgs = d.get("messages", [])
        title = d.get("title") or next((m.get("content", "") for m in msgs if m.get("role") == "user"), "Percakapan")
        out.append({"id": d["id"], "title": (title or "Percakapan")[:60],
                    "updated_at": d.get("updated_at"), "count": len(msgs)})
    return {"sessions": out}

@api.get("/ai/assistant/sessions/{sid}")
async def assistant_session_detail(sid: str, admin: dict = Depends(admin_or_kasir)):
    d = await db.ai_assistant_sessions.find_one({"id": sid}, {"_id": 0})
    if not d:
        raise HTTPException(404, "Sesi tidak ditemukan")
    msgs = []
    for m in d.get("messages", []):
        if m.get("role") == "assistant":
            _, clean = _parse_action(m.get("content", ""))
            msgs.append({"role": "assistant", "text": clean or m.get("content", "")})
        else:
            msgs.append({"role": "user", "text": m.get("content", "")})
    return {"id": sid, "messages": msgs}

@api.delete("/ai/assistant/sessions/{sid}")
async def assistant_session_delete(sid: str, admin: dict = Depends(admin_or_kasir)):
    await db.ai_assistant_sessions.delete_one({"id": sid})
    return {"deleted": True}

async def _resolve_or_create_category(name, kind):
    kind = kind if kind in ("makanan", "minuman", "retail", "vendor") else "retail"
    name = (name or "").strip() or "Umum"
    cat = await db.categories.find_one({"name": {"$regex": f"^{re.escape(name)}$", "$options": "i"}, "type": kind})
    if cat:
        return cat["id"], False
    doc = {"id": new_id(), "name": name, "type": kind, "sort_order": 0, "active": True,
           "created_at": now_utc().isoformat()}
    await db.categories.insert_one(doc)
    _cache_del("categories:")
    return doc["id"], True

async def _create_one_product(a):
    """Create a single product from an action dict. Returns a human message. Raises on validation error."""
    name = (a.get("name") or "").strip()
    if not name:
        raise HTTPException(400, "Nama produk wajib diisi")
    price = _to_num(a.get("price"), 0)
    cost = _to_num(a.get("cost"), 0)
    if price < 0 or cost < 0:
        raise HTTPException(400, f"Harga/HPP '{name}' tidak boleh negatif")
    kind = a.get("kind") if a.get("kind") in ("makanan", "minuman", "retail", "vendor") else "retail"
    cat_id, cat_created = await _resolve_or_create_category(a.get("category_name") or "Umum", kind)
    sku = (a.get("sku") or "").strip() or _slug_sku(name)
    if await db.products.find_one({"sku": sku}):
        sku = _slug_sku(name)
    vendor_id = None
    if a.get("vendor_name"):
        v = await db.vendors.find_one({"name": {"$regex": f"^{re.escape(str(a.get('vendor_name')).strip())}$", "$options": "i"}})
        vendor_id = v["id"] if v else None
    doc = {"id": new_id(), "name": name, "sku": sku, "category_id": cat_id, "type": kind,
           "price": price, "cost": cost, "vendor_id": vendor_id, "vendor_share_percent": None,
           "description": str(a.get("description") or ""), "image": "", "active": True,
           "sold_out": False, "stock": int(_to_num(a.get("stock"), 0)), "min_stock": 10,
           "track_stock": kind == "retail", "created_at": now_utc().isoformat()}
    await db.products.insert_one(doc)
    _cache_del("products:")
    extra = " (kategori baru)" if cat_created else ""
    return f"'{name}' (SKU {sku}, Rp {int(price):,}){extra}".replace(",", ".")

async def _find_product(name):
    name = (name or "").strip()
    if not name:
        raise HTTPException(400, "Sebutkan nama/SKU produk")
    p = await db.products.find_one({"$or": [
        {"name": {"$regex": f"^{re.escape(name)}$", "$options": "i"}},
        {"sku": {"$regex": f"^{re.escape(name)}$", "$options": "i"}}]})
    if not p:
        raise HTTPException(404, f"Produk '{name}' tidak ditemukan")
    return p

async def _find_category(name, kind=None):
    name = (name or "").strip()
    if not name:
        raise HTTPException(400, "Sebutkan nama kategori")
    q = {"name": {"$regex": f"^{re.escape(name)}$", "$options": "i"}}
    if kind in ("makanan", "minuman", "retail", "vendor"):
        q["type"] = kind
    c = await db.categories.find_one(q)
    if not c:
        raise HTTPException(404, f"Kategori '{name}' tidak ditemukan")
    return c

@api.post("/ai/assistant/apply")
async def assistant_apply(body: AIAssistantApplyIn, admin: dict = Depends(require_admin)):
    a = body.action or {}
    t = a.get("type")
    if t == "create_category":
        name = (a.get("name") or "").strip()
        kind = a.get("kind") if a.get("kind") in ("makanan", "minuman", "retail", "vendor") else "retail"
        if not name:
            raise HTTPException(400, "Nama kategori wajib diisi")
        if await db.categories.find_one({"name": {"$regex": f"^{re.escape(name)}$", "$options": "i"}, "type": kind}):
            raise HTTPException(400, f"Kategori '{name}' ({kind}) sudah ada")
        doc = {"id": new_id(), "name": name, "type": kind, "sort_order": 0, "active": True,
               "created_at": now_utc().isoformat()}
        await db.categories.insert_one(doc)
        return {"ok": True, "message": f"Kategori '{name}' ({kind}) dibuat.", "entity": "category"}

    if t == "create_vendor":
        name = (a.get("name") or "").strip()
        if not name:
            raise HTTPException(400, "Nama vendor wajib diisi")
        if await db.vendors.find_one({"name": {"$regex": f"^{re.escape(name)}$", "$options": "i"}}):
            raise HTTPException(400, f"Vendor '{name}' sudah ada")
        doc = {"id": new_id(), "name": name, "contact": str(a.get("contact") or ""),
               "note": str(a.get("note") or ""), "active": True, "created_at": now_utc().isoformat()}
        await db.vendors.insert_one(doc)
        return {"ok": True, "message": f"Vendor '{name}' dibuat.", "entity": "vendor"}

    if t == "create_payment_method":
        name = (a.get("name") or "").strip()
        pm_type = a.get("pm_type") if a.get("pm_type") in ("cash", "qris", "card") else "cash"
        if not name:
            raise HTTPException(400, "Nama metode pembayaran wajib diisi")
        if await db.payment_methods.find_one({"name": {"$regex": f"^{re.escape(name)}$", "$options": "i"}}):
            raise HTTPException(400, f"Metode pembayaran '{name}' sudah ada")
        doc = {"id": new_id(), "name": name, "type": pm_type, "active": True}
        await db.payment_methods.insert_one(doc)
        return {"ok": True, "message": f"Metode pembayaran '{name}' ({pm_type}) dibuat.", "entity": "payment_method"}

    if t == "create_product":
        msg = await _create_one_product(a)
        return {"ok": True, "message": f"Produk {msg} dibuat.", "entity": "product"}

    if t == "create_products_bulk":
        items = a.get("items") or []
        if not isinstance(items, list) or not items:
            raise HTTPException(400, "Daftar produk kosong")
        if len(items) > 100:
            raise HTTPException(400, "Maksimal 100 produk per sekali proses")
        ok_msgs, errors = [], []
        for it in items:
            try:
                ok_msgs.append(await _create_one_product(it if isinstance(it, dict) else {}))
            except HTTPException as e:
                errors.append(f"{(it or {}).get('name', '?')}: {e.detail}")
            except Exception as e:
                errors.append(f"{(it or {}).get('name', '?')}: {e}")
        summary = f"{len(ok_msgs)} produk dibuat"
        if errors:
            summary += f", {len(errors)} gagal"
        return {"ok": True, "message": summary + ".", "entity": "product",
                "results": {"created": ok_msgs, "errors": errors}}

    if t == "update_product":
        name = (a.get("name") or a.get("sku") or "").strip()
        if not name:
            raise HTTPException(400, "Sebutkan nama/SKU produk yang akan diubah")
        p = await _find_product(name)
        upd = {}
        if a.get("price") is not None:
            upd["price"] = _to_num(a.get("price"))
        if a.get("cost") is not None:
            upd["cost"] = _to_num(a.get("cost"))
        if a.get("stock") is not None:
            upd["stock"] = int(_to_num(a.get("stock")))
        if a.get("sold_out") is not None:
            upd["sold_out"] = bool(a.get("sold_out"))
        if a.get("active") is not None:
            upd["active"] = bool(a.get("active"))
        if a.get("description") is not None:
            upd["description"] = str(a.get("description"))
        if upd.get("price", 0) < 0 or upd.get("cost", 0) < 0:
            raise HTTPException(400, "Harga/HPP tidak boleh negatif")
        if not upd:
            raise HTTPException(400, "Tidak ada perubahan untuk diterapkan")
        await db.products.update_one({"id": p["id"]}, {"$set": upd})
        changed = ", ".join(f"{k}={v}" for k, v in upd.items())
        return {"ok": True, "message": f"Produk '{p['name']}' diperbarui ({changed}).", "entity": "product"}

    if t == "deactivate_product":
        p = await _find_product(a.get("name") or a.get("sku"))
        await db.products.update_one({"id": p["id"]}, {"$set": {"active": False}})
        return {"ok": True, "message": f"Produk '{p['name']}' dinonaktifkan.", "entity": "product"}

    if t == "delete_product":
        p = await _find_product(a.get("name") or a.get("sku"))
        used = await db.orders.count_documents({"items.product_id": p["id"]})
        if used:
            await db.products.update_one({"id": p["id"]}, {"$set": {"active": False}})
            return {"ok": True, "message": f"Produk '{p['name']}' pernah dipakai transaksi, jadi DINONAKTIFKAN (bukan dihapus).", "entity": "product"}
        await db.products.delete_one({"id": p["id"]})
        return {"ok": True, "message": f"Produk '{p['name']}' dihapus.", "entity": "product"}

    if t == "deactivate_category":
        c = await _find_category(a.get("name"), a.get("kind"))
        await db.categories.update_one({"id": c["id"]}, {"$set": {"active": False}})
        return {"ok": True, "message": f"Kategori '{c['name']}' dinonaktifkan.", "entity": "category"}

    if t == "delete_category":
        c = await _find_category(a.get("name"), a.get("kind"))
        used = await db.products.count_documents({"category_id": c["id"]})
        if used:
            await db.categories.update_one({"id": c["id"]}, {"$set": {"active": False}})
            return {"ok": True, "message": f"Kategori '{c['name']}' dipakai {used} produk, jadi DINONAKTIFKAN (bukan dihapus).", "entity": "category"}
        await db.categories.delete_one({"id": c["id"]})
        return {"ok": True, "message": f"Kategori '{c['name']}' dihapus.", "entity": "category"}

    raise HTTPException(400, f"Jenis aksi tidak didukung: {t}")

import json as _json, re as _re

def _num(v):
    if isinstance(v, (int, float)):
        return float(v)
    s = _re.sub(r"[^0-9]", "", str(v))
    return float(s) if s else 0.0

def _extract_json_list(text):
    t = (text or "").strip()
    m = _re.search(r"\[.*\]", t, _re.S)
    if m:
        t = m.group(0)
    try:
        data = _json.loads(t)
    except Exception:
        return []
    out = []
    for d in (data if isinstance(data, list) else []):
        if not isinstance(d, dict):
            continue
        name = str(d.get("name", "")).strip()
        if name:
            out.append({"name": name, "qty": _num(d.get("qty", 1)) or 1, "unit_cost": _num(d.get("unit_cost", 0))})
    return out

@api.post("/ai/parse-invoice")
async def ai_parse_invoice(body: AIInvoiceIn, admin: dict = Depends(admin_or_input)):
    if not await _ai_allowed("vision"):
        raise HTTPException(400, "Fitur AI 'Baca Faktur (Vision)' dimatikan. Nyalakan di Pengaturan → Fitur & Integrasi.")
    cfg = await _ai_cfg("vision")
    if not (cfg["api_key"] and cfg["base_url"] and cfg["model"]):
        raise HTTPException(400, "Konfigurasi AI 'Baca Faktur (Vision)' belum lengkap di Pengaturan AI")
    img = body.image if body.image.startswith("data:") else f"data:image/jpeg;base64,{body.image}"
    system = "Anda asisten yang membaca foto faktur/nota pembelian toko."
    prompt = ('Baca foto faktur berikut dan ekstrak daftar barang. Kembalikan HANYA JSON array. '
              'Tiap elemen: {"name": "nama barang", "sku": "kode/barcode jika terlihat (else kosong)", "qty": angka, "unit_cost": angka}. '
              'unit_cost = harga beli per unit (Rupiah, angka saja tanpa titik/koma). Tanpa teks lain.')
    from openai import OpenAI

    def run():
        client = OpenAI(api_key=cfg["api_key"], base_url=cfg["base_url"])
        r = client.chat.completions.create(
            model=cfg["model"],
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": [
                    {"type": "text", "text": prompt},
                    {"type": "image_url", "image_url": {"url": img}},
                ]},
            ],
            max_tokens=1500, temperature=0,
        )
        return r.choices[0].message.content or ""
    try:
        raw = await asyncio.to_thread(run)
    except Exception as e:
        logger.error(f"parse-invoice AI error: {e}")
        raise HTTPException(400, "Model AI yang dipilih tidak mendukung pembacaan gambar. Ganti model Vision di Pengaturan AI.")
    return {"items": _extract_json_list(raw)}

@api.post("/ai/expense-vision")
async def ai_expense_vision(body: AIInvoiceIn, admin: dict = Depends(require_any_module("pengeluaran", "produk", "belanja_bahan"))):
    """Scan foto struk/nota pembelian -> daftar PENGELUARAN (F&B) yang siap dicatat ke kas."""
    if not await _ai_allowed("vision"):
        raise HTTPException(400, "Fitur AI 'Baca Faktur (Vision)' dimatikan. Nyalakan di Pengaturan → Fitur & Integrasi.")
    cfg = await _ai_cfg("vision")
    if not (cfg["api_key"] and cfg["base_url"] and cfg["model"]):
        raise HTTPException(400, "Konfigurasi AI 'Baca Faktur (Vision)' belum lengkap di Pengaturan AI")
    img = body.image if body.image.startswith("data:") else f"data:image/jpeg;base64,{body.image}"
    system = "Anda asisten yang membaca foto struk/nota pembelian toko (pengeluaran operasional)."
    prompt = ('Baca foto nota/struk pembelian berikut. Kembalikan HANYA JSON array. '
              'Tiap elemen: {"name": "nama barang/belanja", "amount": angka total biaya item (Rupiah, angka saja tanpa titik/koma), '
              '"category": salah satu dari ["Bahan Baku", "Belanja Operasional", "Bayar Supplier", "Kasbon", "Lainnya"]}. '
              'Bila struk tidak terbaca/tidak jelas, kembalikan []. Tanpa teks lain.')
    from openai import OpenAI

    def run():
        client = OpenAI(api_key=cfg["api_key"], base_url=cfg["base_url"])
        r = client.chat.completions.create(
            model=cfg["model"],
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": [
                    {"type": "text", "text": prompt},
                    {"type": "image_url", "image_url": {"url": img}},
                ]},
            ],
            max_tokens=1500, temperature=0,
        )
        return r.choices[0].message.content or ""
    try:
        raw = await asyncio.to_thread(run)
    except Exception as e:
        logger.error(f"expense-vision AI error: {e}")
        raise HTTPException(400, "Model AI yang dipilih tidak mendukung pembacaan gambar. Ganti model Vision di Pengaturan AI.")
    items = _extract_json_list(raw)
    # normalisasi & filter
    cleaned = []
    for it in items:
        if not isinstance(it, dict):
            continue
        try:
            amt = float(it.get("amount") or 0)
        except (ValueError, TypeError):
            amt = 0
        if amt <= 0:
            continue
        cleaned.append({
            "name": str(it.get("name") or "Belanja"),
            "amount": round(amt, 2),
            "category": str(it.get("category") or "Lainnya"),
        })
    return {"items": cleaned, "count": len(cleaned), "total": round(sum(i["amount"] for i in cleaned), 2)}

@api.post("/ai/product-description")
async def ai_description(body: AIDescIn, admin: dict = Depends(admin_or_input)):
    try:
        system = "Anda copywriter menu F&B & retail Indonesia. Tulis deskripsi produk singkat, menggugah selera, maksimal 2 kalimat, bahasa Indonesia. Jangan pakai emoji."
        prompt = f"Produk: {body.name}\nTipe: {body.type}\nKategori: {body.category}\nKata kunci: {body.keywords}\nTulis deskripsi produk."
        text = await _gemini_text(system, prompt, "description")
        return {"description": text}
    except Exception as e:
        logger.error(f"AI desc error: {e}")
        raise HTTPException(500, f"AI gagal: {e}")

@api.post("/ai/product-image")
async def ai_image(body: AIImageIn, admin: dict = Depends(admin_or_input)):
    try:
        prompt = f"Professional appetizing product photo of '{body.name}'. {body.description}. Clean studio background, top menu photography, high detail, no text overlay."
        image = await _gemini_image(prompt)
        if not image:
            raise HTTPException(500, "Tidak ada gambar dihasilkan")
        stored = await _save_image_local(image)
        return {"image": stored or image}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"AI image error: {e}")
        msg = str(e)
        if "RESOURCE_EXHAUSTED" in msg or "429" in msg:
            raise HTTPException(429, "Gambar AI belum aktif di akun Gemini Anda (kuota gambar free tier = 0). Aktifkan billing di Google Cloud/AI Studio untuk memakainya, atau unggah gambar produk secara manual.")
        raise HTTPException(500, f"AI gambar gagal: {e}")

@api.post("/reports/ai-summary")
async def ai_summary(body: AISummaryIn, admin: dict = Depends(admin_or_kasir)):
    d = body.date or now_utc().strftime("%Y-%m-%d")
    summary = await report_summary(date_str=d, admin=admin)
    try:
        system = ("Anda analis bisnis F&B & retail. Tulis LAPORAN penjualan harian dalam bahasa Indonesia yang tegas dan actionable. "
                  "Struktur: (1) Ringkasan singkat, (2) Sorotan per kategori (Makanan/Minuman/Retail), (3) 2-3 insight, (4) 1-2 rekomendasi. Tanpa emoji.")
        cr = summary.get("category_report", {})
        mk, mn, rt = cr.get("makanan", {}), cr.get("minuman", {}), cr.get("retail", {})

        def _cats(g):
            return ", ".join(f"{c['name']} Rp{c['total']:,.0f}" for c in g.get("categories", [])[:6]) or "-"
        prompt = (f"Data penjualan {d}:\n"
                  f"Total: Rp{summary['total_sales']:,.0f} dari {summary['order_count']} order. Laba kotor: Rp{summary['gross_profit']:,.0f}.\n"
                  f"Dine-in: Rp{summary['by_type']['dine_in']['total']:,.0f}; Take away: Rp{summary['by_type']['take_away']['total']:,.0f}; Retail: Rp{summary['by_type']['retail']['total']:,.0f}.\n"
                  f"Makanan Rp{mk.get('total', 0):,.0f} (rincian: {_cats(mk)}).\n"
                  f"Minuman Rp{mn.get('total', 0):,.0f} (rincian: {_cats(mn)}).\n"
                  f"Retail gabungan Rp{rt.get('total', 0):,.0f}.\n"
                  f"Total diskon: Rp{summary['total_discount']:,.0f}. Kas masuk: Rp{summary['cash_in']:,.0f}, kas keluar: Rp{summary['cash_out']:,.0f}.\n"
                  f"Produk terlaris: {', '.join(p['name'] for p in summary['top_products'][:5])}.\n"
                  f"Stok retail menipis: {len(summary.get('low_stock', []))} produk.\n"
                  f"Buat laporan analitik.")
        text = await _gemini_text(system, prompt, "summary")
        return {"date": d, "summary": text, "data": summary}
    except Exception as e:
        logger.error(f"AI summary error: {e}")
        raise HTTPException(500, f"AI ringkasan gagal: {e}")

# ================================================================== REPORT EXPORT & WHATSAPP (wacloud.id gateway)
WEBHOOK_CRON_SECRET = os.environ.get('WEBHOOK_CRON_SECRET')
WACLOUD_DEFAULT_BASE = "https://app.wacloud.id/api/v1"

async def _wa_config():
    return await db.settings.find_one({"_id": "wa"}, {"_id": 0}) or {}

async def _wa_configured():
    c = await _wa_config()
    return bool(c.get("api_key") and c.get("device_id"))

def _wa_normalize(num):
    n = "".join(ch for ch in str(num) if ch.isdigit())
    if n.startswith("0"):
        n = "62" + n[1:]
    return n

async def _wacloud_request(method, path, **kw):
    import httpx
    await _breaker_check("WA")
    cfg = await _wa_config()
    api_key = cfg.get("api_key")
    base = (cfg.get("base_url") or WACLOUD_DEFAULT_BASE).rstrip("/")
    if not api_key:
        raise HTTPException(400, "API Key WhatsApp (wacloud.id) belum diisi di Pengaturan")
    headers = {"X-Api-Key": api_key, "Content-Type": "application/json"}
    try:
        async with httpx.AsyncClient(timeout=30) as c:
            r = await c.request(method, f"{base}{path}", headers=headers, **kw)
    except Exception:
        _breaker_fail("WA")
        raise
    if r.status_code >= 500:
        _breaker_fail("WA")
    else:
        _breaker_success("WA")
    return r

async def _wa_send_text(to, text):
    cfg = await _wa_config()
    device_id = cfg.get("device_id")
    if not device_id:
        raise HTTPException(400, "Device WhatsApp belum dipilih di Pengaturan")
    return await _wacloud_request("POST", "/messages", json={
        "device_id": device_id, "to": _wa_normalize(to),
        "message_type": "text", "text": text,
    })

# ================================================================== TEMPLATE WHATSAPP (bisa diedit admin)
# Semua pesan WA (laporan harian, laporan shift, bagi hasil vendor, belanja harian,
# pembelian retail) dirender dari template teks yang bisa diubah di Pengaturan →
# WhatsApp & Laporan → Template WhatsApp. Variabel ditulis {nama}; blok dinamis
# (rincian vendor / produk terlaris dll) disediakan sbg variabel {rincian_*}.
def _tpl_app_name():
    return "Grand Aceh Kuliner"

TPL_DEFAULTS = {
    "daily": "*Laporan {nama_aplikasi}*\nTanggal: {tanggal}\n\n"
             "Total Penjualan: {total_penjualan}\n"
             "Jumlah Order: {order_count}\n"
             "Laba Kotor: {laba_kotor}\n"
             "Total Diskon: {total_diskon}\n\n"
             "Per Kategori:\n- Makanan: {kategori_makanan}\n- Minuman: {kategori_minuman}\n- Retail: {kategori_retail}"
             "{rincian_metode}{rincian_terlaris}{rincian_ai}",
    "shift": "*LAPORAN SHIFT {kasir} ({tanggal_shift}) — {nama_aplikasi}*\n\n"
             "Dibuka oleh: {dibuka_oleh}\nDitutup oleh: {ditutup_oleh}\n"
             "Kas awal F&B: {kas_awal_fnb} | Retail: {kas_awal_retail}\n\n"
             "Total Penjualan: {total_penjualan} ({order_count} order)\n"
             "*F&B*: {fnb_total}\n  Dine-in: {dine_in}\n  Take Away: {take_away}\n"
             "*Retail*: {retail_total}"
             "{rincian_metode}\n\n"
             "Pengeluaran F&B: {out_fnb}\nPengeluaran Retail: {out_retail}\n"
             "  termasuk uang transport (wajib): {transport}\n"
             "Pembatalan/Refund: {void_count} transaksi ({void_amount})\n"
             "Bagi hasil vendor dibayar: {bayar_vendor}\n\n"
             "*SISA KAS TUNAI (tunai − pengeluaran)*\n"
             "F&B: {sisa_cash_fnb} (tunai {penjualan_tunai_fnb})\n"
             "Retail: {sisa_cash_retail} (tunai {penjualan_tunai_retail})\n"
             "Total: {sisa_cash}\n"
             "Perkiraan kas: {expected_cash}\n"
             "{catatan_pengeluaran}\n\n"
             "*UANG BERSIH*\nF&B: {net_cash_fnb}\nRetail: {net_cash_retail}\nTotal: {net_cash}"
             "{rincian_vendor}",
    "vendor": "*Laporan Bagi Hasil Vendor — {nama_aplikasi}*\nPeriode: {periode}\n\n"
              "Total Omzet Vendor: {total_omzet}\n"
              "Total Bagi Hasil Vendor: {total_bagi_hasil}\n"
              "Bagian Outlet: {bagian_outlet}"
              "{rincian_vendor}",
    "shopping": "*DAFTAR BELANJA BAHAN — {tanggal}*\n\n{items}\n\n"
                "Jumlah item: {jumlah_item}\nEstimasi biaya: {total_estimasi}",
    "purchase": "*Laporan Belanja {nama_aplikasi}*\nTanggal: {tanggal}\n\n"
                "Total Belanja: {total_belanja}\nJumlah Item: {jumlah_item}\n\n{items}",
    # BUKTI PEMBAYARAN (settlement) bagi hasil vendor — dipakai untuk cetak/WA ke vendor.
    "settlement": "*BUKTI PEMBAYARAN BAGI HASIL — {nama_aplikasi}*\n"
                  "No: {nomor}\nVendor: {vendor}\nTanggal: {tanggal}\n\n"
                  "Omzet penjualan vendor: {omzet_vendor}\n"
                  "Bagi hasil hari ini: {bagi_hasil}\n"
                  "Bagian outlet: {bagian_outlet}\n\n"
                  "Saldo sebelumnya: {saldo_sebelum}\n"
                  "Total harus dibayar: {total_harus_dibayar}\n"
                  "Dibayarkan: {dibayar}\n"
                  "Sisa saldo (dibawa ke berikutnya): {sisa_saldo}\n"
                  "Metode: {metode}\n"
                  "{catatan}\n"
                  "{rincian_produk}\n"
                  "Diterima oleh: ____________________",
}

async def _tpl_doc():
    doc = await db.settings.find_one({"_id": "wa_templates"}, {"_id": 0}) or {}
    return doc.get("templates") or {}

async def _tpl_get(key):
    doc = await _tpl_doc()
    text = doc.get(key)
    return (text if text is not None else None) or TPL_DEFAULTS.get(key, "")

async def _tpl_fill(key, env):
    """Render template WA: ganti {variabel} dengan nilai env. Variabel tak dikenal → ''."""
    import re as _re
    tpl = await _tpl_get(key)
    def _sub(m):
        name = m.group(1)
        val = env.get(name, "")
        return "" if val is None else str(val)
    return _re.sub(r"\{([A-Za-z_][A-Za-z0-9_]*)\}", _sub, tpl)

@api.get("/settings/wa-templates")
async def get_wa_templates(admin: dict = Depends(require_admin)):
    doc = await _tpl_doc()
    out = {}
    for k, dflt in TPL_DEFAULTS.items():
        out[k] = doc.get(k, dflt)
    return {"templates": out, "defaults": dict(TPL_DEFAULTS)}

class WATemplatesIn(BaseModel):
    templates: dict = {}

@api.put("/settings/wa-templates")
async def put_wa_templates(body: WATemplatesIn, admin: dict = Depends(require_admin)):
    clean = {}
    tpls = body.templates if isinstance(body.templates, dict) else {}
    for k in TPL_DEFAULTS:
        v = tpls.get(k)
        if isinstance(v, str) and v.strip():
            clean[k] = v.strip()
    await db.settings.update_one({"_id": "wa_templates"}, {"$set": {"templates": clean}}, upsert=True)
    return {"ok": True, "count": len(clean)}

# ---- pembangun lingkungan (env) utk tiap jenis pesan WA ----
def _rp(x):
    return f"Rp{float(x or 0):,.0f}"

def _daily_wa_env(d, s, ai_text=None):
    cr = s.get("category_report", {})
    env = {
        "nama_aplikasi": _tpl_app_name(), "tanggal": d,
        "total_penjualan": _rp(s["total_sales"]), "order_count": str(s["order_count"]),
        "laba_kotor": _rp(s["gross_profit"]), "total_diskon": _rp(s["total_discount"]),
        "kategori_makanan": _rp(cr.get("makanan", {}).get("total", 0)),
        "kategori_minuman": _rp(cr.get("minuman", {}).get("total", 0)),
        "kategori_retail": _rp(cr.get("retail", {}).get("total", 0)),
    }
    blk_metode = ""
    blk_terlaris = ""
    blk_ai = ""
    if s.get("by_payment"):
        blk_metode = "\nMetode Bayar:\n" + "\n".join(f"- {k}: {_rp(v)}" for k, v in s["by_payment"].items())
    if s.get("top_products"):
        blk_terlaris = "\nProduk Terlaris:\n" + "\n".join(f"- {p['name']} (x{p['qty']})" for p in s["top_products"][:5])
    if ai_text:
        blk_ai = "\nAnalisis AI:\n" + ai_text
    env["rincian_metode"] = blk_metode
    env["rincian_terlaris"] = blk_terlaris
    env["rincian_ai"] = blk_ai
    return env

def _shift_wa_env(r, cashier="", date_shift=""):
    env = {
        "nama_aplikasi": _tpl_app_name(), "kasir": cashier or r.get("cashier_name", ""),
        "tanggal_shift": date_shift or (r.get("opened_at") or "")[:10],
        "total_penjualan": _rp(r.get("total_sales", 0)), "order_count": str(r.get("order_count", 0)),
        "fnb_total": _rp(r.get("fnb_total", 0)), "dine_in": _rp(r.get("by_type", {}).get("dine_in", 0)),
        "take_away": _rp(r.get("by_type", {}).get("take_away", 0)), "retail_total": _rp(r.get("retail_total", 0)),
        "out_fnb": _rp(r.get("cash_out_fnb", 0)), "out_retail": _rp(r.get("cash_out_retail", 0)),
        "expected_cash": _rp(r.get("expected_cash", 0)),
        "net_cash_fnb": _rp(r.get("net_cash_fnb", 0)), "net_cash_retail": _rp(r.get("net_cash_retail", 0)),
        "net_cash": _rp(r.get("net_cash", 0)),
        # bagi hasil yang dibayar lewat modul Settlement Vendor selama shift ini
        "bayar_vendor": _rp(r.get("vendor_settled_paid", 0)),
        # pembatalan/refund pada shift ini
        "void_count": str(r.get("void_count", 0)), "void_amount": _rp(r.get("void_amount", 0)),
        # shift harian bersama: siapa yang membuka & menutup + kas awal/akhir per toko
        "dibuka_oleh": r.get("dibuka_oleh") or cashier or r.get("cashier_name", ""),
        "ditutup_oleh": r.get("ditutup_oleh") or "",
        "kas_awal_fnb": _rp(r.get("opening_cash_fnb", 0)), "kas_awal_retail": _rp(r.get("opening_cash_retail", 0)),
        "kas_akhir_fnb": _rp(r.get("closing_cash_fnb", 0)), "kas_akhir_retail": _rp(r.get("closing_cash_retail", 0)),
        # sisa kas TUNAI setelah dikurangi pengeluaran (uang laci) + uang transport wajib
        "penjualan_tunai": _rp(float(r.get("cash_sales_fnb", 0) or 0) + float(r.get("cash_sales_retail", 0) or 0)),
        "penjualan_tunai_fnb": _rp(r.get("cash_sales_fnb", 0)),
        "penjualan_tunai_retail": _rp(r.get("cash_sales_retail", 0)),
        "sisa_cash_fnb": _rp(r.get("sisa_cash_fnb", 0)), "sisa_cash_retail": _rp(r.get("sisa_cash_retail", 0)),
        "sisa_cash": _rp(r.get("sisa_cash", 0)),
        "transport": _rp(r.get("transport", 0)),
        # Peringatan pengeluaran harian: kosong = laporan belanja hari itu belum diisi
        "pengeluaran_fnb": _rp((r.get("expenses_fnb") or {}).get("total", 0)),
        "pengeluaran_retail": _rp((r.get("expenses_retail") or {}).get("total", 0)),
        "catatan_pengeluaran": ("Pengeluaran harian: BELUM DIISI (dikonfirmasi tidak ada pengeluaran)"
                                if r.get("expenses_empty") else ""),
    }
    # Rincian metode pembayaran (Tunai / QRIS / Transfer / ...) — blok dinamis {rincian_metode}
    blk_pm = ""
    if r.get("by_payment"):
        blk_pm = "\nMetode Bayar:\n" + "\n".join(f"- {k}: {_rp(v)}" for k, v in r["by_payment"].items())
    env["rincian_metode"] = blk_pm
    L = []
    for v in (r.get("vendor_share") or []):
        L.append(f"Vendor {v.get('vendor_name', '?')}: bagi hasil {v.get('share', 0):,.0f} | diberikan {v.get('paid', 0):,.0f} | selisih {v.get('difference', 0):,.0f}")
        for im in (v.get("items") or []):
            L.append(f"   - {im.get('name', '?')} (x{im.get('qty', 0)}): Rp{im.get('gross', 0):,.0f} (Vendor Rp{im.get('vendor_share', 0):,.0f})")
    if r.get("vendor_total_share"):
        L.append(f"Total vendor: share {r.get('vendor_total_share', 0):,.0f} | diberikan {r.get('vendor_total_paid', 0):,.0f}")
    env["rincian_vendor"] = ("\n" + "\n".join(L)) if L else ""
    return env

def _vendor_wa_env(rep):
    env = {
        "nama_aplikasi": _tpl_app_name(), "periode": rep["label"],
        "total_omzet": _rp(rep["total_gross"]), "total_bagi_hasil": _rp(rep["total_vendor_share"]),
        "bagian_outlet": _rp(rep["total_outlet_share"]),
    }
    L = []
    if rep["rows"]:
        L.append("Rincian per Vendor:")
        for r in rep["rows"]:
            L.append(f"- {r['vendor_name']} (x{r['qty']}): Omzet Rp{r['gross']:,.0f} -> Vendor Rp{r['vendor_share']:,.0f}")
            for im in (r.get("items") or []):
                L.append(f"    - {im['name']} (x{im['qty']}): Omzet Rp{im['gross']:,.0f} (Vendor Rp{im['vendor_share']:,.0f})")
    else:
        L.append("Belum ada penjualan produk vendor pada periode ini.")
    env["rincian_vendor"] = "\n" + "\n".join(L)
    return env

def _purchase_wa_env(d, items, total):
    env = {"nama_aplikasi": _tpl_app_name(), "tanggal": d,
           "total_belanja": _rp(total), "jumlah_item": str(len(items))}
    if items:
        L = ["Rincian:"] + [f"- {x.get('product_name', '?')} x{x.get('qty', 0)} = {_rp(x.get('total_cost', 0))}" for x in items[:40]]
    else:
        L = ["Tidak ada pembelian pada tanggal ini."]
    env["items"] = "\n".join(L)
    return env


def _settlement_wa_env(st):
    """Nilai variabel untuk template BUKTI PEMBAYARAN vendor (key "settlement")."""
    env = {
        "nama_aplikasi": _tpl_app_name(),
        "nomor": st.get("settlement_no", ""),
        "vendor": st.get("vendor_name", ""),
        "tanggal": st.get("date", ""),
        "omzet_vendor": _rp(st.get("gross", 0)),
        "bagi_hasil": _rp(st.get("vendor_share", 0)),
        "bagian_outlet": _rp(st.get("outlet_share", 0)),
        "saldo_sebelum": _rp(st.get("carry_in", 0)),
        "total_harus_dibayar": _rp(st.get("total_due", 0)),
        "dibayar": _rp(st.get("paid", 0)),
        "sisa_saldo": _rp(st.get("carry_out", 0)),
        "metode": st.get("payment_method") or "-",
    }
    note = st.get("note") or ""
    env["catatan"] = f"Catatan: {note}" if note else ""
    items = st.get("items") or []
    if items:
        L = ["Rincian penjualan:"]
        for im in items[:40]:
            L.append(f"- {im.get('name', '?')} x{im.get('qty', 0)} = {_rp(im.get('gross', 0))} (vendor {_rp(im.get('vendor_share', 0))})")
        env["rincian_produk"] = "\n".join(L)
    else:
        env["rincian_produk"] = "Tidak ada penjualan produk vendor pada tanggal ini."
    return env

def _report_lines(d, s, ai_text=None):
    cr = s.get("category_report", {})
    L = ["*Laporan Grand Aceh Kuliner*", f"Tanggal: {d}", "",
         f"Total Penjualan: Rp{s['total_sales']:,.0f}",
         f"Jumlah Order: {s['order_count']}",
         f"Laba Kotor: Rp{s['gross_profit']:,.0f}",
         f"Total Diskon: Rp{s['total_discount']:,.0f}", "",
         "Per Kategori:",
         f"- Makanan: Rp{cr.get('makanan', {}).get('total', 0):,.0f}",
         f"- Minuman: Rp{cr.get('minuman', {}).get('total', 0):,.0f}",
         f"- Retail: Rp{cr.get('retail', {}).get('total', 0):,.0f}"]
    if s.get("by_payment"):
        L += ["", "Metode Bayar:"] + [f"- {k}: Rp{v:,.0f}" for k, v in s["by_payment"].items()]
    if s.get("top_products"):
        L += ["", "Produk Terlaris:"] + [f"- {p['name']} (x{p['qty']})" for p in s["top_products"][:5]]
    if ai_text:
        L += ["", "Analisis AI:", ai_text]
    return L

async def _purchase_summary(d):
    start, end = wib_day_range(d)
    items = await db.purchases.find({"created_at": {"$gte": start, "$lt": end}}, {"_id": 0}).sort("created_at", 1).to_list(2000)
    total = sum(float(x.get("total_cost", 0)) for x in items)
    return items, total

def _purchase_report_lines(d, items, total):
    L = ["*Laporan Belanja Grand Aceh Kuliner*", f"Tanggal: {d}", "",
         f"Total Belanja: Rp{total:,.0f}",
         f"Jumlah Item: {len(items)}", ""]
    if items:
        L.append("Rincian:")
        for x in items[:40]:
            L.append(f"- {x.get('product_name', '?')} x{x.get('qty', 0)} = Rp{float(x.get('total_cost', 0)):,.0f}")
    else:
        L.append("Tidak ada pembelian pada tanggal ini.")
    return L

def _report_excel(d, s):
    import openpyxl
    wb = openpyxl.Workbook(); ws = wb.active; ws.title = "Laporan"
    for ln in _report_lines(d, s):
        ws.append([ln.replace("*", "")])
    buf = io.BytesIO(); wb.save(buf); buf.seek(0)
    return buf

def _report_pdf(d, s, ai_text=None):
    from fpdf import FPDF
    pdf = FPDF(); pdf.add_page(); pdf.set_font("Helvetica", size=12)
    for ln in _report_lines(d, s, ai_text):
        txt = ln.replace("*", "").encode("latin-1", "replace").decode("latin-1")
        pdf.multi_cell(pdf.epw, 7, txt or " ")
    return io.BytesIO(bytes(pdf.output()))

@api.get("/reports/export/excel")
async def export_report_excel(date_str: Optional[str] = Query(None, alias="date"), user: dict = Depends(get_current_user)):
    d = date_str or wib_today()
    s = await report_summary(date_str=d, admin=user)
    return StreamingResponse(_report_excel(d, s), media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                             headers={"Content-Disposition": f"attachment; filename=laporan-{d}.xlsx"})

@api.get("/reports/export/pdf")
async def export_report_pdf(date_str: Optional[str] = Query(None, alias="date"), user: dict = Depends(get_current_user)):
    d = date_str or wib_today()
    s = await report_summary(date_str=d, admin=user)
    return StreamingResponse(_report_pdf(d, s), media_type="application/pdf",
                             headers={"Content-Disposition": f"attachment; filename=laporan-{d}.pdf"})

# -------------------------------------------------------- VENDOR SETTLEMENT
async def _vendor_report(date_str=None, start=None, end=None):
    if start and end:
        s_utc, _ = wib_day_range(start)
        _, e_utc = wib_day_range(end)
        label = f"{start} s/d {end}"
    else:
        d = date_str or wib_today()
        s_utc, e_utc = wib_day_range(d)
        label = d
    q = {"status": "paid", "created_at": {"$gte": s_utc, "$lt": e_utc}}
    orders = await db.orders.find(q, {"_id": 0}).to_list(20000)
    vendors = await db.vendors.find({}, {"_id": 0}).to_list(500)
    vmap = {v["id"]: v for v in vendors}
    agg = {}
    for o in orders:
        for it in o.get("items", []):
            if it.get("type") == "vendor" and it.get("vendor_id"):
                vid = it["vendor_id"]
                a = agg.setdefault(vid, {"vendor_id": vid,
                                         "vendor_name": vmap.get(vid, {}).get("name", "(vendor dihapus)"),
                                         "qty": 0, "gross": 0, "vendor_share": 0, "_items": {}})
                line = it["price"] * it["qty"]
                share = it.get("vendor_total", round(line * float(it.get("vendor_share_percent") or 0) / 100, 2))
                a["qty"] += it["qty"]
                a["gross"] += line
                a["vendor_share"] += share
                im = a["_items"].setdefault(it.get("product_id") or it["name"], {
                    "product_id": it.get("product_id"), "name": it["name"],
                    "qty": 0, "gross": 0.0, "vendor_share": 0.0})
                im["qty"] += it["qty"]
                im["gross"] += line
                im["vendor_share"] += share
    # Deteksi tipe vendor (F&B = produk makanan/minuman/vendor dgn kategori fnb; else retail)
    prod_vendor_type = {}
    for p in await db.products.find({"type": "vendor"}, {"_id": 0, "id": 1, "category_id": 1}).to_list(2000):
        cid = p.get("category_id")
        prod_vendor_type[p["id"]] = "fnb"  # default; diperhalus via kategori
    cats = {c["id"]: c for c in await db.categories.find({}, {"_id": 0}).to_list(1000)}
    for p in await db.products.find({"type": "vendor"}, {"_id": 0, "id": 1, "category_id": 1}).to_list(2000):
        c = cats.get(p.get("category_id")) or {}
        if c.get("type") == "retail":
            prod_vendor_type[p["id"]] = "retail"
    # Tambah scope ke tiap baris vendor: dari tipe produk item (item punya 'type' vendor; pakai kategori produk)
    # Per vendor, kita ambil scope mayoritas dari item yang bersangkutan.
    vendor_scope = {}
    for o in orders:
        for it in o.get("items", []):
            if it.get("type") == "vendor" and it.get("vendor_id"):
                sc = prod_vendor_type.get(it.get("product_id"), "fnb")
                vendor_scope[it["vendor_id"]] = sc
    rows = sorted(agg.values(), key=lambda x: x["gross"], reverse=True)
    for r in rows:
        r["gross"] = round(r["gross"], 2)
        r["vendor_share"] = round(r["vendor_share"], 2)
        r["outlet_share"] = round(r["gross"] - r["vendor_share"], 2)
        r["scope"] = vendor_scope.get(r["vendor_id"], "fnb")
        items = sorted(r.pop("_items", {}).values(), key=lambda y: y["gross"], reverse=True)
        for im in items:
            im["gross"] = round(im["gross"], 2)
            im["vendor_share"] = round(im["vendor_share"], 2)
        r["items"] = items
    total_gross = round(sum(r["gross"] for r in rows), 2)
    total_vendor = round(sum(r["vendor_share"] for r in rows), 2)
    fnb = [r for r in rows if r["scope"] == "fnb"]
    retail = [r for r in rows if r["scope"] == "retail"]
    return {"label": label, "rows": rows, "total_gross": total_gross,
            "total_vendor_share": total_vendor, "total_outlet_share": round(total_gross - total_vendor, 2),
            "fnb_gross": round(sum(r["gross"] for r in fnb), 2),
            "fnb_vendor_share": round(sum(r["vendor_share"] for r in fnb), 2),
            "retail_gross": round(sum(r["gross"] for r in retail), 2),
            "retail_vendor_share": round(sum(r["vendor_share"] for r in retail), 2)}

def _vendor_report_lines(rep):
    L = ["*Laporan Bagi Hasil Vendor - Grand Aceh Kuliner*", f"Periode: {rep['label']}", "",
         f"Total Omzet Vendor: Rp{rep['total_gross']:,.0f}",
         f"Total Bagi Hasil Vendor: Rp{rep['total_vendor_share']:,.0f}",
         f"Bagian Outlet: Rp{rep['total_outlet_share']:,.0f}", ""]
    if rep["rows"]:
        L.append("Rincian per Vendor:")
        for r in rep["rows"]:
            L.append(f"- {r['vendor_name']} (x{r['qty']}): Omzet Rp{r['gross']:,.0f} -> Vendor Rp{r['vendor_share']:,.0f}")
            for im in (r.get("items") or []):
                L.append(f"    - {im['name']} (x{im['qty']}): Omzet Rp{im['gross']:,.0f} (Vendor Rp{im['vendor_share']:,.0f})")
    else:
        L.append("Belum ada penjualan produk vendor pada periode ini.")
    return L

@api.get("/reports/vendors")
async def report_vendors(date_str: Optional[str] = Query(None, alias="date"),
                         start: Optional[str] = None, end: Optional[str] = None,
                         admin: dict = Depends(admin_or_kasir)):
    return await _vendor_report(date_str, start, end)

@api.get("/reports/vendors/export/excel")
async def export_vendor_excel(date_str: Optional[str] = Query(None, alias="date"),
                              start: Optional[str] = None, end: Optional[str] = None,
                              admin: dict = Depends(admin_or_kasir)):
    import openpyxl
    rep = await _vendor_report(date_str, start, end)
    wb = openpyxl.Workbook(); ws = wb.active; ws.title = "Bagi Hasil Vendor"
    ws.append(["Vendor", "Qty", "Omzet", "Bagi Hasil Vendor", "Bagian Outlet"])
    for r in rep["rows"]:
        ws.append([r["vendor_name"], r["qty"], r["gross"], r["vendor_share"], r["outlet_share"]])
        for im in (r.get("items") or []):
            ws.append(["   - " + im["name"], im["qty"], im["gross"], im["vendor_share"], ""])
    ws.append([])
    ws.append(["TOTAL", "", rep["total_gross"], rep["total_vendor_share"], rep["total_outlet_share"]])
    buf = io.BytesIO(); wb.save(buf); buf.seek(0)
    return StreamingResponse(buf, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                             headers={"Content-Disposition": f"attachment; filename=bagi-hasil-vendor-{rep['label']}.xlsx"})

@api.get("/reports/vendors/export/pdf")
async def export_vendor_pdf(date_str: Optional[str] = Query(None, alias="date"),
                            start: Optional[str] = None, end: Optional[str] = None,
                            admin: dict = Depends(admin_or_kasir)):
    from fpdf import FPDF
    rep = await _vendor_report(date_str, start, end)
    pdf = FPDF(); pdf.add_page(); pdf.set_font("Helvetica", size=12)
    for ln in _vendor_report_lines(rep):
        txt = ln.replace("*", "").encode("latin-1", "replace").decode("latin-1")
        pdf.multi_cell(pdf.epw, 7, txt or " ")
    out = io.BytesIO(bytes(pdf.output()))
    return StreamingResponse(out, media_type="application/pdf",
                             headers={"Content-Disposition": f"attachment; filename=bagi-hasil-vendor-{rep['label']}.pdf"})

class VendorWASendIn(BaseModel):
    date: Optional[str] = None
    start: Optional[str] = None
    end: Optional[str] = None
    recipients: Optional[List[str]] = None

@api.post("/reports/vendors/send-whatsapp")
async def send_vendor_whatsapp(body: VendorWASendIn, admin: dict = Depends(require_admin)):
    rep = await _vendor_report(body.date, body.start, body.end)
    doc = await db.settings.find_one({"_id": "report"}) or {}
    recips = body.recipients or doc.get("recipients", [])
    if not recips:
        raise HTTPException(400, "Belum ada nomor WhatsApp tujuan. Atur di 'WhatsApp & Laporan'.")
    text = await _tpl_fill("vendor", _vendor_wa_env(rep))
    result = await _send_whatsapp(recips, text)
    if not any(r.get("ok") for r in result):
        raise HTTPException(400, f"Gagal kirim WhatsApp: {result[0].get('error') if result else 'tidak diketahui'}")
    return {"sent": result}

# ================================================================== VENDOR SETTLEMENT
# Modul pembayaran (settlement) bagi hasil vendor: HARIAN, SATU VENDOR per transaksi.
# Saldo utang ke vendor DIHITUNG DARI DATA (bukan angka tersimpan) sehingga tidak pernah
# meleset:  saldo(sebelum tanggal D) = Σ bagi hasil vendor dari penjualan < D − Σ pembayaran < D.
# Kekurangan bayar otomatis terbawa ke settlement berikutnya (carry), termasuk hari-hari
# yang belum pernah disettle. Pembayaran dicatat juga sebagai KAS KELUAR (kas laci & uang bersih).
SETTLE_CAT = "Bagi Hasil Vendor"
VENDOR_ID_RE = re.compile(r"^[A-Za-z0-9_-]{1,64}$")

class VendorSettlementIn(BaseModel):
    date: Optional[str] = None            # periode HARIAN (YYYY-MM-DD), default hari ini
    vendor_id: str
    paid: float = Field(ge=0, description="nominal yang diserahkan ke vendor")
    payment_method: Optional[str] = "Tunai"
    note: Optional[str] = ""
    create_cash_out: bool = True          # catat sebagai kas keluar (mengurangi kas laci)

class VendorSettlementVoidIn(BaseModel):
    reason: str

class VendorSettlementSendIn(BaseModel):
    recipients: Optional[List[str]] = None

async def _vendor_settled_map(q):
    """{vendor_id: total dibayarkan} dari dokumen settlement yang cocok query `q` (void tidak dihitung)."""
    out = {}
    async for row in db.vendor_settlements.aggregate([
        {"$match": {**q, "voided": {"$ne": True}}},
        {"$group": {"_id": "$vendor_id", "paid": {"$sum": "$paid"}}},
    ]):
        if row["_id"]:
            out[str(row["_id"])] = round(float(row.get("paid") or 0), 2)
    return out

async def _vendor_balance(date_str, before=True):
    """{vendor_id: saldo} — utang outlet ke vendor SEBELUM tanggal (before=True) atau
    SAMPAI DENGAN akhir tanggal itu (before=False). Nol/negatif = tidak ada utang."""
    s_utc, e_utc = wib_day_range(date_str)
    upto = s_utc if before else e_utc
    q_settle = {"date": {"$lt": date_str}} if before else {"date": {"$lte": date_str}}
    share_expr = {"$ifNull": ["$items.vendor_total",
                             {"$multiply": ["$items.price", "$items.qty",
                                            {"$divide": [{"$ifNull": ["$items.vendor_share_percent", 0]}, 100]}]}]}
    due = {}
    async for row in db.orders.aggregate([
        {"$match": {"status": "paid", "created_at": {"$lt": upto}}},
        {"$unwind": "$items"},
        {"$match": {"items.type": "vendor", "items.vendor_id": {"$nin": [None, ""]}}},
        {"$group": {"_id": "$items.vendor_id", "share": {"$sum": share_expr}}},
    ]):
        due[str(row["_id"])] = round(float(row.get("share") or 0), 2)
    paid = await _vendor_settled_map(q_settle)
    return {k: round(due.get(k, 0.0) - paid.get(k, 0.0), 2) for k in (set(due) | set(paid))}

async def _vendor_scopes():
    """{vendor_id: 'fnb'|'retail'} dari produk vendor (dipakai vendor yang tidak ada penjualan hari itu)."""
    cats = {c["id"]: c for c in await db.categories.find({}, {"_id": 0, "id": 1, "type": 1}).to_list(2000)}
    out = {}
    for p in await db.products.find({"vendor_id": {"$nin": [None, ""]}},
                                    {"_id": 0, "vendor_id": 1, "category_id": 1}).to_list(20000):
        sc = "retail" if (cats.get(p.get("category_id")) or {}).get("type") == "retail" else "fnb"
        out.setdefault(p["vendor_id"], sc)
    return out

async def _vendor_settlement_no(date_str):
    """Nomor bukti pembayaran berurutan per hari: STL-YYYYMMDD-0001."""
    today = str(date_str).replace("-", "")
    cid = f"settlement-{today}"
    if not await db.counters.find_one({"_id": cid}):
        cnt = await db.vendor_settlements.count_documents({"settlement_no": {"$regex": f"^STL-{today}-"}})
        await db.counters.update_one({"_id": cid}, {"$setOnInsert": {"seq": cnt}}, upsert=True)
    doc = await db.counters.find_one_and_update({"_id": cid}, {"$inc": {"seq": 1}},
                                               return_document=ReturnDocument.AFTER)
    return f"STL-{today}-{doc['seq']:04d}"

async def _vendor_settlement_public(doc):
    """Bersihkan dokumen utk dikirim ke klien (tanpa _id) + teks bukti pembayaran."""
    out = {k: v for k, v in doc.items() if k != "_id"}
    out["text"] = await _tpl_fill("settlement", _settlement_wa_env(out))
    return out

@api.get("/vendor-settlements/board")
async def vendor_settlement_board(date_str: Optional[str] = Query(None, alias="date"),
                                  admin: dict = Depends(admin_or_kasir)):
    """Rekap hari itu PER VENDOR: omzet, bagi hasil, saldo sebelumnya, total harus dibayar,
    status pembayaran hari itu, dan sisa setelah dibayar."""
    d = date_str or wib_today()
    rep = await _vendor_report(date_str=d)
    carry = await _vendor_balance(d, before=True)
    today_map = await _vendor_settled_map({"date": d})
    docs = await db.vendor_settlements.find({"date": d, "voided": {"$ne": True}}, {"_id": 0}).to_list(500)
    by_vendor = {}
    for doc in docs:
        by_vendor.setdefault(str(doc["vendor_id"]), []).append(doc)
    rows = []
    seen = set()
    for r in rep["rows"]:
        vid = str(r["vendor_id"])
        seen.add(vid)
        rows.append(_settle_row(r, carry.get(vid, 0.0), by_vendor.get(vid) or []))
    others = []
    for vid, saldo in carry.items():
        if vid in seen or abs(saldo) < 0.01:
            continue
        name = (await db.vendors.find_one({"id": vid}, {"_id": 0, "name": 1}) or {}).get("name") or "(vendor dihapus)"
        others.append(vid)
        rows.append(_settle_row({"vendor_id": vid, "vendor_name": name, "qty": 0, "gross": 0.0,
                                 "vendor_share": 0.0, "outlet_share": 0.0, "items": []},
                                saldo, by_vendor.get(vid) or []))
    if others:  # vendor tanpa penjualan hari ini → scope dari master produk
        scopes = await _vendor_scopes()
        for row in rows:
            if row["vendor_id"] in others:
                row["scope"] = scopes.get(row["vendor_id"], "fnb")
    _shift = await _open_shift("fnb") or await _open_shift("retail")
    return {"date": d, "rows": rows,
            "totals": {
                "gross": round(sum(r["gross"] for r in rows), 2),
                "vendor_share": round(sum(r["vendor_share"] for r in rows), 2),
                "carry_in": round(sum(r["carry_in"] for r in rows), 2),
                "total_due": round(sum(r["total_due"] for r in rows), 2),
                "paid_today": round(sum(today_map.values()), 2),
                "remaining": round(sum(r["remaining"] for r in rows), 2),
            },
            "shift": ({"id": _shift["id"], "opened_at": _shift.get("opened_at")} if _shift else None)}

def _settle_row(r, carry_in, docs):
    paid_today = round(sum(float(x.get("paid") or 0) for x in docs), 2)
    total_due = round(carry_in + float(r.get("vendor_share") or 0), 2)
    return {"vendor_id": str(r["vendor_id"]), "vendor_name": r.get("vendor_name") or "Vendor",
            "qty": r.get("qty", 0), "gross": round(float(r.get("gross") or 0), 2),
            "vendor_share": round(float(r.get("vendor_share") or 0), 2),
            "outlet_share": round(float(r.get("outlet_share") or 0), 2),
            "scope": r.get("scope") or "fnb",
            "items": r.get("items") or [],
            "carry_in": round(carry_in, 2), "total_due": total_due,
            "paid_today": paid_today, "remaining": round(total_due - paid_today, 2),
            "settlements": [{k: x.get(k) for k in ("id", "settlement_no", "paid", "payment_method", "note",
                                                   "created_at", "by", "source")} for x in docs]}

async def _settlement_validate_paid(vendor_ids):
    """Pastikan semua vendor_id yang akan dibayar benar-benar ada (dipakai SEBELUM ada
    perubahan data apa pun — supaya tutup shift tidak pernah setengah jalan)."""
    ids = sorted({str(x) for x in vendor_ids if str(x)})
    if not ids:
        return
    bad = [x for x in ids if not VENDOR_ID_RE.match(x)]
    if bad:
        raise HTTPException(400, f"vendor_id tidak valid: {', '.join(bad)}")
    found = {v["id"] for v in await db.vendors.find({"id": {"$in": ids}}, {"_id": 0, "id": 1}).to_list(500)}
    missing = [x for x in ids if x not in found]
    if missing:
        raise HTTPException(404, f"Vendor tidak ditemukan: {', '.join(missing)}")

async def _create_settlement(vendor_id, date_str, paid, user, payment_method="Tunai", note="",
                             create_cash_out=True, shift_id=None, source="manual"):
    """Buat SATU dokumen pembayaran bagi hasil vendor (+ kas keluar bila diminta).

    Dipakai DUA tempat (satu pintu):
      * endpoint POST /vendor-settlements (halaman Settlement Vendor, source="manual")
      * close_shift (isian "Diberikan" saat tutup shift, source="shift_close")
    Karena keduanya menghasilkan dokumen yang sama, saldo utang vendor selalu ikut
    berkurang dan tidak mungkin tercatat dua kali (lihat _vendor_balance).
    Nominal omzet/bagi hasil DIHITUNG ULANG di server dari data penjualan."""
    if not VENDOR_ID_RE.match(str(vendor_id or "")):
        raise HTTPException(400, "vendor_id tidak valid")
    vendor = await db.vendors.find_one({"id": vendor_id}, {"_id": 0})
    if not vendor:
        raise HTTPException(404, "Vendor tidak ditemukan")
    paid = round(float(paid or 0), 2)
    if paid <= 0:
        raise HTTPException(400, "Nominal pembayaran harus lebih dari 0")
    d = date_str or wib_today()
    wib_day_range(d)  # validasi tanggal (HTTPException 400 bila format salah)
    rep = await _vendor_report(date_str=d)
    row = next((r for r in rep["rows"] if r["vendor_id"] == vendor_id), None)
    carry_in = (await _vendor_balance(d, before=True)).get(vendor_id, 0.0)
    gross = round(float((row or {}).get("gross") or 0), 2)
    share = round(float((row or {}).get("vendor_share") or 0), 2)
    total_due = round(carry_in + share, 2)
    scope = (row or {}).get("scope") or (await _vendor_scopes()).get(vendor_id, "fnb")
    doc = {
        "id": new_id(), "settlement_no": await _vendor_settlement_no(d), "date": d,
        "vendor_id": vendor_id, "vendor_name": vendor.get("name") or "Vendor", "scope": scope,
        "gross": gross, "vendor_share": share, "outlet_share": round(gross - share, 2),
        "carry_in": round(carry_in, 2), "total_due": total_due, "paid": paid,
        "carry_out": round(total_due - paid, 2),
        "payment_method": (payment_method or "Tunai").strip() or "Tunai",
        "note": (note or "").strip(), "source": source,
        "items": (row or {}).get("items") or [],
        "shift_id": shift_id,
        "cash_movement_id": None, "voided": False,
        "by": (user or {}).get("name") or (user or {}).get("username") or "",
        "created_at": now_utc().isoformat(),
    }
    if create_cash_out:
        mv = {"id": new_id(), "type": "out", "amount": paid, "category": SETTLE_CAT,
              "note": f"Settlement {doc['settlement_no']} — {doc['vendor_name']} ({d})",
              "scope": scope, "cashier_id": (user or {}).get("id"),
              "cashier_name": (user or {}).get("name") or "",
              "shift_id": shift_id, "created_at": doc["created_at"]}
        await db.cash_movements.insert_one(mv)
        doc["cash_movement_id"] = mv["id"]
    await db.vendor_settlements.insert_one(dict(doc))
    _bump_rs_gen()  # kas keluar hari itu ikut terhitung di ringkasan laporan
    return doc

@api.post("/vendor-settlements")
async def create_vendor_settlement(body: VendorSettlementIn, admin: dict = Depends(admin_or_kasir)):
    """Bayar bagi hasil SATU vendor untuk SATU hari.

    Nominal omzet/bagi hasil DIHITUNG ULANG di server (sumber kebenaran), saldo sebelumnya
    diambil dari riwayat, sisa kekurangan otomatis menjadi saldo berikutnya. Bila
    `create_cash_out` aktif, pembayaran dicatat sebagai kas keluar sehingga mengurangi
    kas laci & uang bersih (dan muncul di laporan shift yang berjalan)."""
    shift = await _open_shift("fnb") or await _open_shift("retail")
    doc = await _create_settlement(body.vendor_id, body.date or wib_today(), body.paid, admin,
                                   payment_method=body.payment_method, note=body.note,
                                   create_cash_out=body.create_cash_out,
                                   shift_id=shift["id"] if shift else None, source="manual")
    return await _vendor_settlement_public(doc)

@api.get("/vendor-settlements")
async def list_vendor_settlements(start: Optional[str] = None, end: Optional[str] = None,
                                  vendor_id: Optional[str] = None, include_voided: bool = False,
                                  limit: int = 300, admin: dict = Depends(admin_or_kasir)):
    """Riwayat penyerahan uang bagi hasil + saldo berjalan per vendor."""
    e = end or wib_today()
    s = start or e
    if s > e:
        s, e = e, s
    q = {"date": {"$gte": s, "$lte": e}}
    if vendor_id:
        q["vendor_id"] = vendor_id
    if not include_voided:
        q["voided"] = {"$ne": True}
    rows = await db.vendor_settlements.find(q, {"_id": 0}).sort("created_at", -1).to_list(max(1, min(limit, 1000)))
    saldo = await _vendor_balance(e, before=False)
    names = {v["id"]: v.get("name") for v in await db.vendors.find({}, {"_id": 0, "id": 1, "name": 1}).to_list(1000)}
    balances = sorted([{"vendor_id": k, "vendor_name": names.get(k) or "(vendor dihapus)", "balance": round(x, 2)}
                       for k, x in saldo.items() if abs(x) >= 0.01], key=lambda x: -x["balance"])
    return {"start": s, "end": e, "rows": rows,
            "totals": {"paid": round(sum(float(r.get("paid") or 0) for r in rows), 2),
                       "gross": round(sum(float(r.get("gross") or 0) for r in rows), 2),
                       "vendor_share": round(sum(float(r.get("vendor_share") or 0) for r in rows), 2),
                       "carry_out": round(sum(float(r.get("carry_out") or 0) for r in rows), 2)},
            "balances": balances,
            "total_balance": round(sum(x["balance"] for x in balances), 2)}

@api.get("/vendor-settlements/{sid}/print")
async def vendor_settlement_print(sid: str, admin: dict = Depends(admin_or_kasir)):
    """Teks BUKTI PEMBAYARAN (format dari template WhatsApp "settlement") untuk dicetak."""
    doc = await db.vendor_settlements.find_one({"id": sid})
    if not doc:
        raise HTTPException(404, "Settlement tidak ditemukan")
    return {"text": await _tpl_fill("settlement", _settlement_wa_env({k: v for k, v in doc.items() if k != "_id"})),
            "settlement_no": doc.get("settlement_no"), "id": sid}

@api.post("/vendor-settlements/{sid}/send-wa")
async def vendor_settlement_send_wa(sid: str, body: VendorSettlementSendIn,
                                    admin: dict = Depends(require_admin)):
    """Kirim bukti pembayaran ke vendor (nomor kontak vendor) atau nomor yang diberikan."""
    doc = await db.vendor_settlements.find_one({"id": sid})
    if not doc:
        raise HTTPException(404, "Settlement tidak ditemukan")
    recips = [str(x).strip() for x in (body.recipients or []) if str(x).strip()]
    if not recips:
        v = await db.vendors.find_one({"id": doc.get("vendor_id")}, {"_id": 0, "contact": 1})
        if (v or {}).get("contact"):
            recips = [x.strip() for x in re.split(r"[,;\s]+", str(v["contact"])) if x.strip()]
    if not recips:
        rd = await db.settings.find_one({"_id": "report"}, {"_id": 0}) or {}
        recips = list(rd.get("recipients") or [])
    if not recips:
        raise HTTPException(400, "Nomor WhatsApp vendor belum diisi (isi kontak vendor atau nomor tujuan laporan)")
    text = await _tpl_fill("settlement", _settlement_wa_env({k: v for k, v in doc.items() if k != "_id"}))
    result = await _send_whatsapp(recips, text)
    if not any(r.get("ok") for r in result):
        raise HTTPException(400, f"Gagal kirim WhatsApp: {result[0].get('error') if result else 'tidak diketahui'}")
    return {"sent": result}

@api.post("/vendor-settlements/{sid}/void")
async def void_vendor_settlement(sid: str, body: VendorSettlementVoidIn, admin: dict = Depends(require_admin)):
    """Batalkan settlement (mis. salah vendor/nominal). Kas keluar terkait ikut dihapus dan
    saldo vendor otomatis kembali (saldo DIHITUNG dari dokumen yang tersisa)."""
    doc = await db.vendor_settlements.find_one({"id": sid})
    if not doc:
        raise HTTPException(404, "Settlement tidak ditemukan")
    if doc.get("voided"):
        raise HTTPException(400, "Settlement ini sudah dibatalkan")
    reason = (body.reason or "").strip()
    if not reason:
        raise HTTPException(400, "Alasan pembatalan wajib diisi")
    if doc.get("cash_movement_id"):
        await db.cash_movements.delete_one({"id": doc["cash_movement_id"]})
    await db.vendor_settlements.update_one({"id": sid}, {"$set": {
        "voided": True, "voided_at": now_utc().isoformat(),
        "voided_by": admin.get("name") or admin.get("username") or "", "void_reason": reason}})
    _bump_rs_gen()
    return {"ok": True, "id": sid}

class ReportSettingsIn(BaseModel):
    whatsapp_enabled: bool = False
    whatsapp_time: str = "22:00"
    recipients: List[str] = []
    include_ai: bool = True
    send_sales: bool = True
    send_purchases: bool = False
    # Kirim laporan SHIFT otomatis setiap kali shift ditutup (nomor tujuan = nomor laporan harian).
    send_shift_auto: bool = True

async def _report_cfg():
    return await db.settings.find_one({"_id": "report"}, {"_id": 0}) or {}

async def _shift_wa_auto_enabled():
    return bool((await _report_cfg()).get("send_shift_auto", True))

@api.get("/settings/report")
async def get_report_settings(admin: dict = Depends(require_admin)):
    doc = await _report_cfg()
    return {
        "whatsapp_enabled": doc.get("whatsapp_enabled", False),
        "whatsapp_time": doc.get("whatsapp_time", "22:00"),
        "recipients": doc.get("recipients", []),
        "include_ai": doc.get("include_ai", True),
        "send_sales": doc.get("send_sales", True),
        "send_purchases": doc.get("send_purchases", False),
        # BAWAAN AKTIF (permintaan pemilik): laporan tutup shift langsung dikirim ke WA,
        # bisa dimatikan di Pengaturan → WhatsApp & Laporan.
        "send_shift_auto": doc.get("send_shift_auto", True),
        "whatsapp_configured": await _wa_configured(),
        "last_sent_date": doc.get("last_sent_date"),
    }

@api.put("/settings/report")
async def put_report_settings(body: ReportSettingsIn, admin: dict = Depends(require_admin)):
    await db.settings.update_one({"_id": "report"}, {"$set": {
        "whatsapp_enabled": body.whatsapp_enabled, "whatsapp_time": body.whatsapp_time,
        "recipients": [r.strip() for r in body.recipients if r.strip()], "include_ai": body.include_ai,
        "send_sales": body.send_sales, "send_purchases": body.send_purchases,
        "send_shift_auto": body.send_shift_auto,
    }}, upsert=True)
    return {"ok": True}

async def _send_shift_wa_auto(sid):
    """Kirim laporan shift ke WA otomatis (dipakai SAAT TUTUP SHIFT).

    Tidak pernah menggagalkan penutupan shift: status tunai sudah berubah sebelum ini,
    jadi kegagalan WhatsApp dilaporkan sebagai hasil (bukan error) supaya kasir tidak
    mengulang tutup shift. Ada batas waktu supaya WA yang lambat/mati tidak menahan
    respons penutupan shift.
    """
    enabled = await _shift_wa_auto_enabled()
    recips = list((await _report_cfg()).get("recipients") or [])
    if not enabled:
        return {"enabled": False, "ok": False, "skipped": "dimatikan di Pengaturan"}
    if not recips:
        return {"enabled": True, "ok": False, "skipped": "belum ada nomor WhatsApp tujuan"}
    if not await _wa_configured():
        return {"enabled": True, "ok": False, "skipped": "WhatsApp gateway belum siap"}
    try:
        r, anchor = await _shift_wa_report(sid)
        text = await _tpl_fill("shift", _shift_wa_env(r, r.get("kasir", ""), (anchor.get("opened_at") or "")[:10]))
        result = await asyncio.wait_for(_send_whatsapp(recips, text), timeout=25)
    except Exception as e:
        logger.error(f"auto-kirim laporan shift gagal: {e}")
        return {"enabled": True, "ok": False, "recipients": recips, "error": str(e)}
    ok = any(x.get("ok") for x in result)
    return {"enabled": True, "ok": ok, "recipients": recips, "sent": result,
            "error": None if ok else (result[0].get("error") if result else "tidak diketahui")}

async def _send_whatsapp(recipients, text):
    if not await _feat("wa.enabled"):
        raise HTTPException(400, "Fitur WhatsApp dimatikan. Nyalakan di Pengaturan → Fitur & Integrasi.")
    out = []
    for to in recipients:
        try:
            r = await _wa_send_text(to, text)
            body = {}
            try:
                body = r.json()
            except Exception:
                pass
            if r.status_code in (200, 201) and body.get("success", True):
                out.append({"to": to, "ok": True, "id": (body.get("data") or {}).get("message_id")})
            else:
                out.append({"to": to, "ok": False, "error": body.get("error") or body.get("message") or r.text})
        except HTTPException as he:
            out.append({"to": to, "ok": False, "error": he.detail})
        except Exception as e:
            out.append({"to": to, "ok": False, "error": str(e)})
    return out

class WhatsAppSendIn(BaseModel):
    date: Optional[str] = None
    recipients: Optional[List[str]] = None

@api.post("/reports/send-whatsapp")
async def send_report_whatsapp(body: WhatsAppSendIn, admin: dict = Depends(require_admin)):
    d = body.date or wib_today()
    s = await report_summary(date_str=d, admin=admin)
    doc = await db.settings.find_one({"_id": "report"}) or {}
    recips = body.recipients or doc.get("recipients", [])
    if not recips:
        raise HTTPException(400, "Belum ada nomor WhatsApp tujuan. Atur di Pengaturan.")
    ai_text = None
    if doc.get("include_ai", True):
        try:
            r = await ai_summary(AISummaryIn(date=d), admin=admin)
            ai_text = r.get("summary")
        except Exception:
            ai_text = None
    text = await _tpl_fill("daily", _daily_wa_env(d, s, ai_text))
    result = await _send_whatsapp(recips, text)
    if not any(r.get("ok") for r in result):
        raise HTTPException(400, f"Gagal kirim WhatsApp: {result[0].get('error') if result else 'tidak diketahui'}")
    return {"sent": result}

async def _claim_once(doc_id, field, value, stale_seconds=900, guard_field=None, guard_value=None):
    """Klaim atomik "kerjakan sekali" pada satu dokumen settings.

    Dipakai tugas terjadwal (laporan WA harian, cek data yatim, cek integritas) supaya
    beberapa proses backend yang hidup bersamaan — uvicorn multi-worker, atau backend
    Pi + PC pada rancangan replika — TIDAK menjalankan tugas yang sama dua kali.
    Pola lama (baca `last_sent_date` lalu tulis setelah kirim) punya celah: dua proses
    membaca nilai lama pada saat hampir bersamaan, keduanya lolos, keduanya mengirim.
    Di sini pemeriksaan dan penulisan menjadi SATU operasi Mongo, sehingga hanya satu
    proses yang mendapat matched_count = 1.

    Klaim juga menyimpan <field>_at; bila proses mati di tengah tugas, klaim yang lebih
    tua dari `stale_seconds` boleh diambil alih tick berikutnya (jadi tugas tidak
    hilang selamanya, tapi juga tidak dobel dalam jendela singkat).
    True = pemanggil berhak mengerjakan; False = sudah dikerjakan/diambil proses lain.
    """
    now = now_utc()
    stale_iso = (now - timedelta(seconds=int(stale_seconds))).isoformat()
    try:
        await db.settings.update_one({"_id": doc_id}, {"$setOnInsert": {"_id": doc_id}}, upsert=True)
    except Exception:
        # Balapan upsert (dua proses membuat dokumen yang sama) — dokumennya toh sudah
        # ada, jadi klaim di bawah tetap boleh dicoba. JANGAN keluar di sini.
        pass
    flt = {"_id": doc_id,
           "$or": [{field: {"$ne": value}}, {f"{field}_at": {"$lt": stale_iso}}, {f"{field}_at": {"$exists": False}}]}
    if guard_field:
        flt[guard_field] = {"$ne": guard_value}
    upd = {"$set": {field: value, f"{field}_at": now.isoformat()}}
    try:
        res = await db.settings.update_one(flt, upd)
        return bool(getattr(res, "matched_count", 0))
    except Exception as e:
        logger.error(f"claim {doc_id}.{field} failed: {e}")
        return False

async def _release_claim(doc_id, field):
    """Lepas klaim setelah tugas GAGAL, supaya tick berikutnya (10 menit) boleh mencoba lagi."""
    try:
        await db.settings.update_one({"_id": doc_id}, {"$unset": {field: "", f"{field}_at": ""}})
    except Exception as e:
        logger.error(f"release claim {doc_id}.{field} failed: {e}")

async def _run_daily_report_job():
    if not await _feat("wa.enabled"):
        return
    doc = await db.settings.find_one({"_id": "report"}) or {}
    if not doc.get("whatsapp_enabled") or not doc.get("recipients"):
        return
    if not await _wa_configured():
        return
    noww = datetime.now(WIB)
    try:
        target_hour = int(str(doc.get("whatsapp_time", "22:00")).split(":")[0])
    except Exception:
        target_hour = 22
    if noww.hour != target_hour:
        return
    today = noww.strftime("%Y-%m-%d")
    # Klaim SEBELUM menyusun/mengirim. `last_sent_date` tetap hanya diisi setelah
    # benar-benar terkirim, supaya tampilan "terakhir dikirim" di Pengaturan jujur.
    if not await _claim_once("report", "sending_date", today, stale_seconds=900,
                             guard_field="last_sent_date", guard_value=today):
        return
    messages = []
    if doc.get("send_sales", True):
        s = await report_summary(date_str=today, admin={"role": "admin", "id": "cron"})
        ai_text = None
        if doc.get("include_ai", True):
            try:
                r = await ai_summary(AISummaryIn(date=today), admin={"role": "admin", "id": "cron"})
                ai_text = r.get("summary")
            except Exception:
                pass
        messages.append(await _tpl_fill("daily", _daily_wa_env(today, s, ai_text)))
    if doc.get("send_purchases", False):
        items, total = await _purchase_summary(today)
        messages.append(await _tpl_fill("purchase", _purchase_wa_env(today, items, total)))
    if not messages:
        await _release_claim("report", "sending_date")
        return
    try:
        for msg in messages:
            await _send_whatsapp(doc["recipients"], msg)
        await db.settings.update_one({"_id": "report"},
                                     {"$set": {"last_sent_date": today, "last_sent_at": now_utc().isoformat()},
                                      "$unset": {"sending_date": "", "sending_date_at": ""}}, upsert=True)
        logger.info(f"Daily WA report sent for {today}")
    except Exception as e:
        logger.error(f"Daily WA report failed: {e}")
        await _release_claim("report", "sending_date")

@api.post("/cron/daily-report")
async def cron_daily_report(request: Request, background: BackgroundTasks):
    # Cron endpoints must ack 2xx immediately; enqueue/background the actual work.
    import hmac as _hmac
    auth = request.headers.get("Authorization", "")
    token = auth[7:] if auth.startswith("Bearer ") else ""
    if not (WEBHOOK_CRON_SECRET and _hmac.compare_digest(token, WEBHOOK_CRON_SECRET)):
        raise HTTPException(401, "unauthorized")
    background.add_task(_run_daily_report_job)
    return {"ok": True}

class CronNotifyIn(BaseModel):
    to: str
    message: str

@api.post("/cron/notify")
async def cron_notify(request: Request, body: CronNotifyIn):
    import hmac as _hmac
    auth = request.headers.get("Authorization", "")
    token = auth[7:] if auth.startswith("Bearer ") else ""
    if not (WEBHOOK_CRON_SECRET and _hmac.compare_digest(token, WEBHOOK_CRON_SECRET)):
        raise HTTPException(401, "unauthorized")
    if not body.to.strip():
        raise HTTPException(400, "nomor tujuan kosong")
    res = await _send_whatsapp([body.to.strip()], body.message)
    return {"sent": res}

# ---- WhatsApp Gateway (wacloud.id) config, devices & test ----
class WAConfigIn(BaseModel):
    api_key: Optional[str] = None
    base_url: Optional[str] = None
    device_id: Optional[str] = None
    device_name: Optional[str] = None

@api.get("/whatsapp/config")
async def whatsapp_get_config(admin: dict = Depends(require_admin)):
    c = await _wa_config()
    key = c.get("api_key") or ""
    return {
        "configured": bool(c.get("api_key") and c.get("device_id")),
        "api_key_set": bool(key),
        "api_key_masked": (key[:6] + "…" + key[-4:]) if len(key) > 12 else ("•" * len(key)),
        "base_url": c.get("base_url") or WACLOUD_DEFAULT_BASE,
        "device_id": c.get("device_id", ""),
        "device_name": c.get("device_name", ""),
    }

@api.put("/whatsapp/config")
async def whatsapp_put_config(body: WAConfigIn, admin: dict = Depends(require_admin)):
    upd = {}
    if body.api_key is not None and body.api_key.strip():
        upd["api_key"] = body.api_key.strip()
    if body.base_url is not None:
        upd["base_url"] = body.base_url.strip() or WACLOUD_DEFAULT_BASE
    if body.device_id is not None:
        upd["device_id"] = body.device_id.strip()
    if body.device_name is not None:
        upd["device_name"] = body.device_name.strip()
    if upd:
        await db.settings.update_one({"_id": "wa"}, {"$set": upd}, upsert=True)
    return {"ok": True}

@api.get("/whatsapp/devices")
async def whatsapp_devices(admin: dict = Depends(require_admin)):
    try:
        r = await _wacloud_request("GET", "/devices")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(400, f"Gagal menghubungi wacloud.id: {e}")
    if r.status_code != 200:
        try:
            j = r.json()
            detail = j.get("message") or j.get("error") or r.text
        except Exception:
            detail = r.text
        raise HTTPException(r.status_code if r.status_code >= 400 else 400, f"wacloud.id: {detail}")
    data = r.json()
    devices = data.get("data", data) if isinstance(data, dict) else data
    return {"devices": devices or []}

class WATestIn(BaseModel):
    to: str
    message: Optional[str] = "Tes notifikasi Grand Aceh Kuliner POS ✅"

@api.post("/whatsapp/test")
async def whatsapp_test(body: WATestIn, admin: dict = Depends(require_admin)):
    if not body.to.strip():
        raise HTTPException(400, "Nomor tujuan wajib diisi")
    res = await _send_whatsapp([body.to.strip()], body.message or "Tes")
    if not any(x.get("ok") for x in res):
        raise HTTPException(400, f"Gagal kirim: {res[0].get('error') if res else 'tidak diketahui'}")
    return {"sent": res}

# Webhook penerima pesan dari WACloud.id untuk booking otomatis
def _parse_wacloud_payload(payload: dict):
    sender = None
    body = None
    
    # 1. Coba dari objek nested 'data'
    data = payload.get("data")
    if isinstance(data, dict):
        sender = data.get("from") or data.get("sender") or data.get("phone") or data.get("phone_number") or data.get("participant")
        body = data.get("body") or data.get("message") or data.get("text") or data.get("caption")
        
    # 2. Coba dari tingkat root
    if not sender:
        sender = payload.get("from") or payload.get("sender") or payload.get("phone") or payload.get("phone_number") or payload.get("participant")
    if not body:
        body = payload.get("body") or payload.get("message") or payload.get("text") or payload.get("caption")
        
    return sender, body

async def _process_whatsapp_webhook(payload: dict):
    logger.info(f"Menerima webhook WACloud: {payload}")
    sender, body = _parse_wacloud_payload(payload)
    if not sender or not body:
        logger.warning("Webhook tidak memiliki sender atau body.")
        return
        
    body_str = str(body)
    body_lower = body_str.lower()
    
    # Deteksi arah pesan keluar untuk menghindari loop rekursif
    if payload.get("from_me") is True or payload.get("fromMe") is True:
        logger.info("Mengabaikan pesan keluar dari diri sendiri (from_me: True).")
        return
        
    event_type = str(payload.get("event") or "").lower()
    if "sent" in event_type or "outbound" in event_type:
        logger.info(f"Mengabaikan event keluar: {event_type}")
        return
        
    direction = str(payload.get("direction") or "").lower()
    if "out" in direction or "sent" in direction:
        logger.info(f"Mengabaikan arah keluar: {direction}")
        return
        
    # Hindari memproses balasan dari bot itu sendiri
    bot_keywords = ["booking berhasil", "booking gagal", "mohon kirimkan format booking", "terima kasih telah memilih grand aceh kuliner"]
    if any(bk in body_lower for bk in bot_keywords):
        logger.info("Mengabaikan pesan yang mengandung tanda/balasan bot.")
        return

    # Filter apakah pesan mengandung niat booking/reservasi
    keywords = ["booking", "reservasi", "meja", "pesan tempat", "pax", "porsi", "makan", "reserv"]
    if not any(k in body_lower for k in keywords):
        logger.info("Pesan bukan permintaan booking, mengabaikan.")
        return

    # Kirim ke Gemini untuk parsing parameter booking
    try:
        system_prompt = (
            "Anda adalah asisten AI restoran Grand Aceh Kuliner. "
            "Tugas Anda adalah membaca pesan WhatsApp dari pelanggan yang ingin melakukan booking/reservasi meja. "
            "Ekstrak detail tersebut menjadi objek JSON yang valid dengan kunci: "
            "'customer_name', 'pax', 'date', 'time', 'table_name', 'note'.\n"
            "Gunakan aturan parsing berikut:\n"
            "- 'customer_name': Ekstrak nama pelanggan. Jika tidak ditemukan, gunakan string kosong.\n"
            "- 'pax': Jumlah orang (integer). Berikan nilai default 1 jika tidak ditentukan.\n"
            "- 'date': Tanggal reservasi dalam format YYYY-MM-DD. Selesaikan istilah relatif (seperti 'hari ini', 'besok', 'lusa') "
            f"berdasarkan tanggal hari ini: {wib_today()}.\n"
            "- 'time': Waktu reservasi dalam format HH:MM (24 jam). Jika tidak ditentukan, berikan nilai default '12:00'.\n"
            "- 'table_name': Nama atau nomor meja yang diminta (misal: 'Meja 5', '5', 'VIP'). Jika tidak ada, berikan string kosong.\n"
            "- 'note': Catatan tambahan, permintaan khusus, atau detail lainnya.\n"
            "Hanya keluarkan JSON yang valid saja, tanpa blok kode markdown atau penjelasan tambahan."
        )
        
        ai_enabled = await _feat("ai.enabled")
        if not ai_enabled:
            reply = "Halo, terima kasih telah menghubungi kami. Mohon maaf, sistem reservasi otomatis kami saat ini sedang dinonaktifkan. Silakan hubungi kasir kami secara langsung."
            await _send_whatsapp([sender], reply)
            return

        response_text = await _gemini_text(system_prompt, body_str, feature="summary")
        cleaned_text = response_text.replace("```json", "").replace("```", "").strip()
        parsed = json.loads(cleaned_text)
    except Exception as e:
        logger.error(f"Gagal mem-parsing pesan dengan Gemini: {e}")
        reply = "Halo, maaf kami kesulitan memahami pesan booking Anda secara otomatis. Mohon kirimkan format booking berikut:\n\n*Nama:* [Nama Anda]\n*Jumlah Orang:* [Jumlah]\n*Tanggal:* [YYYY-MM-DD]\n*Waktu:* [Jam]\n*Meja:* [Nomor Meja]"
        await _send_whatsapp([sender], reply)
        return

    cust_name = parsed.get("customer_name") or ""
    try:
        pax = int(parsed.get("pax") or 1)
    except Exception:
        pax = 1
    res_date = parsed.get("date") or wib_today()
    res_time = parsed.get("time") or "12:00"
    req_table = parsed.get("table_name") or ""
    note = parsed.get("note") or ""

    if not cust_name.strip():
        cust_name = "Pelanggan WA"

    try:
        tables = await db.tables.find({"deleted": {"$ne": True}}).to_list(500)
        matched_table_id = None
        matched_table_name = None
        
        # Cocokkan meja secara presisi jika disebutkan
        req_table_clean = req_table.lower().replace("meja", "").strip()
        if req_table_clean:
            for t in tables:
                db_table_clean = t["name"].lower().replace("meja", "").strip()
                if db_table_clean == req_table_clean or t["name"].lower().strip() == req_table.lower().strip():
                    existing = await db.reservations.find_one({
                        "table_id": t["id"],
                        "status": {"$in": ["pending", "confirmed", "arrived"]},
                        "date": res_date
                    })
                    if existing:
                        reply = f"Maaf Kak {cust_name}, Meja {t['name']} sudah dibooking pada tanggal {res_date}. Silakan pilih meja lain atau kirim pesan baru tanpa menentukan nomor meja agar kami pilihkan meja kosong terbaik."
                        await _send_whatsapp([sender], reply)
                        return
                    matched_table_id = t["id"]
                    matched_table_name = t["name"]
                    break

        # Jika tidak ada meja yang cocok atau tidak ditentukan nomor mejanya, pilih meja kosong secara otomatis
        if not matched_table_id:
            for t in tables:
                if t.get("capacity", 4) >= pax:
                    existing = await db.reservations.find_one({
                        "table_id": t["id"],
                        "status": {"$in": ["pending", "confirmed", "arrived"]},
                        "date": res_date
                    })
                    if not existing:
                        matched_table_id = t["id"]
                        matched_table_name = t["name"]
                        break
                        
        if not matched_table_id:
            reply = f"Maaf Kak {cust_name}, tidak ada meja kosong yang tersedia untuk kapasitas {pax} orang pada tanggal {res_date}. Mohon coba tanggal atau waktu yang lain."
            await _send_whatsapp([sender], reply)
            return

        # Simpan reservasi ke database
        doc = {
            "id": new_id(),
            "table_id": matched_table_id,
            "customer_name": cust_name.strip(),
            "phone": _wa_normalize(sender),
            "pax": pax,
            "date": res_date,
            "time": res_time,
            "note": f"{note} (Booking Otomatis via WhatsApp)".strip(),
            "status": "confirmed",
            "created_by": "WACloud AI",
            "created_at": now_utc().isoformat()
        }
        await db.reservations.insert_one(doc)
        
        # Kirim konfirmasi balasan WhatsApp
        reply_msg = (
            f"🎉 *BOOKING BERHASIL!*\n\n"
            f"Halo Kak *{cust_name}*,\n"
            f"Reservasi Anda telah dikonfirmasi oleh sistem otomatis kami:\n\n"
            f"📍 *Meja:* {matched_table_name}\n"
            f"👥 *Jumlah Orang:* {pax} Orang\n"
            f"📅 *Tanggal:* {res_date}\n"
            f"⏰ *Waktu:* {res_time} WIB\n"
            f"📝 *Catatan:* {note or '-'}\n\n"
            f"Terima kasih telah memilih Grand Aceh Kuliner. Sampai jumpa di lokasi! 😊"
        )
        await _send_whatsapp([sender], reply_msg)
        logger.info(f"Booking sukses disimpan untuk {cust_name} di {matched_table_name}")
    except Exception as e:
        logger.error(f"Gagal memproses reservasi otomatis: {e}")
        reply = f"Mohon maaf Kak, terjadi kesalahan sistem saat memproses reservasi otomatis Anda. Silakan hubungi admin kami secara manual."
        await _send_whatsapp([sender], reply)

@api.post("/webhook/whatsapp")
async def wacloud_webhook(request: Request, background_tasks: BackgroundTasks):
    """Endpoint Webhook publik untuk memproses booking otomatis via WACloud.id."""
    try:
        payload = await request.json()
    except Exception:
        return {"ok": False, "error": "Invalid JSON payload"}
        
    background_tasks.add_task(_process_whatsapp_webhook, payload)
    return {"ok": True, "message": "Webhook received"}

# ================================================================== MEMBERS (poin loyalitas)
class MemberIn(BaseModel):
    name: str
    phone: str = ""
    points: float = 0

@api.get("/members")
async def list_members(q: Optional[str] = None, user: dict = Depends(admin_or_kasir)):
    query = {}
    if q:
        import re as _re
        rx = _re.compile(re.escape(q), _re.I)
        query["$or"] = [{"name": rx}, {"phone": rx}]
    return await db.members.find(query, {"_id": 0}).sort("name", 1).to_list(500)

@api.post("/members")
async def create_member(body: MemberIn, admin: dict = Depends(require_admin)):
    m = {"id": new_id(), "name": body.name.strip(), "phone": body.phone.strip(),
         "points": float(body.points or 0), "total_spend": 0.0, "created_at": now_utc().isoformat()}
    if not m["name"]:
        raise HTTPException(400, "Nama wajib diisi")
    await db.members.insert_one(m)
    m.pop("_id", None)
    return m

@api.put("/members/{mid}")
async def update_member(mid: str, body: MemberIn, admin: dict = Depends(require_admin)):
    upd = {"name": body.name.strip(), "phone": body.phone.strip(), "points": float(body.points or 0)}
    r = await db.members.update_one({"id": mid}, {"$set": upd})
    if not r.matched_count:
        raise HTTPException(404, "Member tidak ditemukan")
    return {"ok": True}

@api.delete("/members/{mid}")
async def delete_member(mid: str, admin: dict = Depends(require_admin)):
    await db.members.delete_one({"id": mid})
    return {"ok": True}

@api.get("/members/search")
async def search_member(phone: str, user: dict = Depends(admin_or_kasir)):
    if not phone.strip():
        return {"member": None}
    m = await db.members.find_one({"phone": phone.strip()}, {"_id": 0})
    return {"member": m}

# ================================================================== PROMOS
class PromoIn(BaseModel):
    name: str
    type: Literal["percent", "happy_hour", "min_spend", "package", "bogo"]
    value: float = 0
    bonus: float = 0
    start_time: str = ""
    end_time: str = ""
    days: List[int] = []
    package_items: List[dict] = []
    active: bool = True

@api.get("/promos")
async def list_promos(user: dict = Depends(get_current_user)):
    return await db.promos.find({}, {"_id": 0}).sort("created_at", -1).to_list(200)

@api.post("/promos")
async def create_promo(body: PromoIn, admin: dict = Depends(require_admin)):
    p = {"id": new_id(), "name": body.name.strip(), "type": body.type, "value": body.value,
         "bonus": body.bonus, "start_time": body.start_time, "end_time": body.end_time,
         "days": body.days, "package_items": body.package_items, "active": body.active,
         "created_at": now_utc().isoformat()}
    if not p["name"]:
        raise HTTPException(400, "Nama promo wajib diisi")
    await db.promos.insert_one(p)
    p.pop("_id", None)
    return p

@api.put("/promos/{pid}")
async def update_promo(pid: str, body: PromoIn, admin: dict = Depends(require_admin)):
    upd = {"name": body.name.strip(), "type": body.type, "value": body.value, "bonus": body.bonus,
           "start_time": body.start_time, "end_time": body.end_time, "days": body.days,
           "package_items": body.package_items, "active": body.active}
    r = await db.promos.update_one({"id": pid}, {"$set": upd})
    if not r.matched_count:
        raise HTTPException(404, "Promo tidak ditemukan")
    return {"ok": True}

@api.delete("/promos/{pid}")
async def delete_promo(pid: str, admin: dict = Depends(require_admin)):
    await db.promos.delete_one({"id": pid})
    return {"ok": True}

# ================================================================== KUPON DISKON
@api.get("/coupons")
async def list_coupons(user: dict = Depends(get_current_user)):
    return await db.coupons.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)

@api.post("/coupons")
async def create_coupon(body: CouponIn, admin: dict = Depends(require_admin)):
    code = body.code.strip().upper()
    if not code:
        raise HTTPException(400, "Kode kupon wajib")
    if await db.coupons.find_one({"code": code}):
        raise HTTPException(400, f"Kode kupon '{code}' sudah ada")
    doc = body.model_dump()
    doc["code"] = code
    doc["used_count"] = 0
    doc.update({"id": new_id(), "created_at": now_utc().isoformat()})
    await db.coupons.insert_one(doc)
    doc.pop("_id", None)
    return doc

@api.put("/coupons/{cid}")
async def update_coupon(cid: str, body: CouponIn, admin: dict = Depends(require_admin)):
    code = body.code.strip().upper()
    dup = await db.coupons.find_one({"code": code, "id": {"$ne": cid}})
    if dup:
        raise HTTPException(400, f"Kode kupon '{code}' sudah dipakai")
    upd = body.model_dump()
    upd["code"] = code
    r = await db.coupons.update_one({"id": cid}, {"$set": upd})
    if not r.matched_count:
        raise HTTPException(404, "Kupon tidak ditemukan")
    return {"ok": True}

@api.delete("/coupons/{cid}")
async def delete_coupon(cid: str, admin: dict = Depends(require_admin)):
    await db.coupons.delete_one({"id": cid})
    return {"ok": True}

# ================================================================== SPLIT / PINDAH / GABUNG MEJA
class SplitIn(BaseModel):
    items: List[OrderItem]

@api.post("/orders/{oid}/split")
async def split_order(oid: str, body: SplitIn, admin: dict = Depends(require_admin)):
    if not body.items:
        raise HTTPException(400, "Pilih item yang akan dipindah")
    o = await db.orders.find_one({"id": oid})
    if not o or o["status"] != "open":
        raise HTTPException(400, "Order tidak ditemukan / bukan open bill")
    moved_ids = {it.product_id: it.qty for it in body.items}
    keep, moved = [], []
    for it in o["items"]:
        need = moved_ids.get(it["product_id"], 0)
        if need >= it["qty"]:
            moved.append({**it})
            moved_ids[it["product_id"]] = need - it["qty"]
        elif need > 0:
            moved.append({**it, "qty": need})
            keep.append({**it, "qty": it["qty"] - need})
            moved_ids[it["product_id"]] = 0
        else:
            keep.append({**it})
    if not moved:
        raise HTTPException(400, "Tidak ada item yang valid untuk dipindah")
    st_k, d_k, _ = compute_totals(keep, o["discount_type"], o["discount_value"])
    pr_k, pn_k = await _apply_promos(keep, st_k)
    t_k = max(0.0, round(st_k - d_k - pr_k, 2))
    new_doc = {
        "id": new_id(), "order_number": await gen_order_number(),
        "order_type": o["order_type"], "table_id": o.get("table_id"), "items": moved,
        "subtotal": sum(i["price"] * i["qty"] for i in moved),
        "discount_type": "none", "discount_value": 0, "discount": 0,
        "promo_discount": 0, "promos_applied": [], "redeem_discount": 0,
        "total": sum(i["price"] * i["qty"] for i in moved),
        "note": f"Split dari {o['order_number']}", "status": "open",
        "cashier_id": admin["id"], "cashier_name": admin["name"],
        "created_at": now_utc().isoformat(), "parent_order": o["id"],
    }
    await db.orders.insert_one(new_doc)
    await db.orders.update_one({"id": oid}, {"$set": {"items": keep, "subtotal": st_k,
                                                      "discount": d_k, "promo_discount": pr_k,
                                                      "promos_applied": pn_k, "total": t_k}})
    new_doc.pop("_id", None)
    return {"original": await db.orders.find_one({"id": oid}, {"_id": 0}), "new_order": new_doc}

class TableMoveIn(BaseModel):
    table_id: str

@api.patch("/orders/{oid}/table")
async def move_order_table(oid: str, body: TableMoveIn, user: dict = Depends(get_current_user)):
    o = await db.orders.find_one({"id": oid})
    if not o or o["status"] != "open":
        raise HTTPException(400, "Order tidak ditemukan / bukan open bill")
    await db.orders.update_one({"id": oid}, {"$set": {"table_id": body.table_id}})
    return {"ok": True}

class MergeIn(BaseModel):
    target_id: str

@api.post("/orders/{oid}/merge")
async def merge_orders(oid: str, body: MergeIn, admin: dict = Depends(require_admin)):
    o = await db.orders.find_one({"id": oid})
    t = await db.orders.find_one({"id": body.target_id})
    if not o or not t or o["status"] != "open" or t["status"] != "open":
        raise HTTPException(400, "Kedua order harus open bill")
    if o["id"] == t["id"]:
        raise HTTPException(400, "Target tidak boleh sama")
    merged_items = t["items"] + o["items"]
    st, d, _ = compute_totals(merged_items, t["discount_type"], t["discount_value"])
    pr, pn = await _apply_promos(merged_items, st)
    tot = max(0.0, round(st - d - pr, 2))
    await db.orders.update_one({"id": t["id"]}, {"$set": {"items": merged_items, "subtotal": st,
                                                          "discount": d, "promo_discount": pr,
                                                          "promos_applied": pn, "total": tot}})
    await db.orders.update_one({"id": oid}, {"$set": {"status": "merged", "merged_into": t["id"],
                                                      "void_reason": f"Digabung ke {t['order_number']}"}})
    return {"ok": True, "target": await db.orders.find_one({"id": t["id"]}, {"_id": 0})}

# ================================================================== LABA KOTOR PER PRODUK
@api.get("/reports/profit")
async def report_profit(start: str, end: str, admin: dict = Depends(admin_or_kasir)):
    s, e = wib_day_range(start[:10]), wib_day_range(end[:10])
    q = {"status": "paid", "created_at": {"$gte": s[0], "$lte": e[1]}}
    orders = await db.orders.find(q, {"_id": 0}).to_list(5000)
    rows = {}
    for o in orders:
        for it in o.get("items", []):
            pid = it["product_id"]
            r = rows.setdefault(pid, {"name": it["name"], "qty": 0, "revenue": 0.0, "cost": 0.0})
            r["qty"] += it["qty"]
            r["revenue"] += it["price"] * it["qty"]
            r["cost"] += (it.get("cost") or 0) * it["qty"]
    out = []
    for pid, r in rows.items():
        out.append({"product_id": pid, "name": r["name"], "qty": r["qty"],
                    "revenue": round(r["revenue"], 2), "cost": round(r["cost"], 2),
                    "profit": round(r["revenue"] - r["cost"], 2),
                    "margin": round((r["revenue"] - r["cost"]) / r["revenue"] * 100, 1) if r["revenue"] else 0})
    out.sort(key=lambda x: x["profit"], reverse=True)
    return {"rows": out, "total_revenue": round(sum(r["revenue"] for r in rows.values()), 2),
            "total_cost": round(sum(r["cost"] for r in rows.values()), 2),
            "total_profit": round(sum(r["revenue"] - r["cost"] for r in rows.values()), 2)}

# ================================================================== REKOMENDASI PEMBELIAN STOK (AI)
@api.post("/ai/purchase-recommendation")
async def purchase_recommendation(admin: dict = Depends(admin_or_kasir)):
    import json
    end = datetime.now(WIB)
    start = end - timedelta(days=30)
    days = 30
    sold = {}
    for o in await db.orders.find({"status": "paid", "created_at": {"$gte": start.isoformat()}}, {"_id": 0, "items": 1}).to_list(5000):
        for it in o.get("items", []):
            if it.get("type") == "retail":
                sold[it["product_id"]] = sold.get(it["product_id"], 0) + it["qty"]
    recs = []
    for p in await db.products.find({"type": "retail", "track_stock": True}, {"_id": 0}).to_list(2000):
        qty30 = sold.get(p["id"], 0)
        avg = qty30 / days
        stock = float(p.get("stock") or 0)
        min_stock = float(p.get("min_stock") or 10)
        suggest = max(0.0, (avg * 14) - stock)
        recs.append({"product_id": p["id"], "name": p["name"], "stock": stock,
                     "min_stock": min_stock, "sold_30d": qty30, "daily_avg": round(avg, 2),
                     "suggest": math.ceil(suggest)})
    recs.sort(key=lambda x: x["sold_30d"], reverse=True)
    ai_text = ""
    try:
        top = recs[:12]
        prompt = ("Buat ringkasan rekomendasi pembelian stok dalam 3-5 baris Bahasa Indonesia. "
                  f"Data (produk, stok, terjual 30 hari, saran beli):\n{json.dumps(top, ensure_ascii=False, default=str)}")
        ai_text = await _gemini_text("Anda analis stok restoran.", prompt, feature="summary")
    except Exception:
        ai_text = ""
    return {"rows": recs, "ai_summary": ai_text}

# ================================================================== SETTINGS OUTLET (nama/alamat/logo)
class OutletIn(BaseModel):
    name: str = ""
    address: str = ""
    phone: str = ""

@api.get("/settings/outlet")
async def get_outlet(admin: dict = Depends(require_admin)):
    doc = await db.settings.find_one({"_id": "outlet"}, {"_id": 0}) or {}
    return {"name": doc.get("name", ""), "address": doc.get("address", ""),
            "phone": doc.get("phone", ""), "logo_url": doc.get("logo_url", "")}

@api.put("/settings/outlet")
async def put_outlet(body: OutletIn, admin: dict = Depends(require_admin)):
    await db.settings.update_one({"_id": "outlet"}, {"$set": {
        "name": body.name.strip(), "address": body.address.strip(), "phone": body.phone.strip()}}, upsert=True)
    return {"ok": True}

@api.post("/settings/outlet/logo")
async def upload_logo(file: UploadFile = File(...), admin: dict = Depends(require_admin)):
    import mimetypes
    ok_types = {"image/png": ".png", "image/jpeg": ".jpg", "image/webp": ".webp", "image/gif": ".gif"}
    ext = ok_types.get(file.content_type or "")
    if not ext:
        raise HTTPException(400, "Format logo harus PNG/JPG/WEBP/GIF")
    data = await file.read()
    if len(data) > 2_000_000:
        raise HTTPException(400, "Logo maksimal 2MB")
    fname = f"logo-{new_id()}{ext}"
    (UPLOAD_DIR / fname).write_bytes(data)
    url = f"/uploads/{fname}"
    await db.settings.update_one({"_id": "outlet"}, {"$set": {"logo_url": url}}, upsert=True)
    return {"ok": True, "url": url}

# ================================================================== PENGATURAN APLIKASI (bisa diubah admin tanpa kode)
@api.get("/settings/business")
async def get_business(user: dict = Depends(get_current_user)):
    return await _business()

BIZ_ALLOWED = set(BIZ_DEFAULTS.keys())

@api.put("/settings/business")
async def put_business(body: dict, admin: dict = Depends(require_admin)):
    clean = {}
    for k, v in (body or {}).items():
        if k not in BIZ_ALLOWED:
            continue
        if k == "labels" and isinstance(v, dict):
            clean["labels"] = {str(kk).strip(): str(vv).strip() for kk, vv in v.items() if str(vv).strip()}
        elif k == "order_prefix":
            clean["order_prefix"] = str(v).strip()[:10] or "GAK-"
        elif k == "transport_amount":
            # Uang transport wajib & tidak boleh 0 (dipakai sebagai bawaan tutup shift).
            try:
                amt = float(v)
            except (TypeError, ValueError):
                raise HTTPException(400, "Nominal uang transport tidak valid")
            if amt <= 0:
                raise HTTPException(400, "Uang transport tidak boleh 0 (wajib diisi saat tutup shift)")
            clean[k] = round(amt, 2)
        elif isinstance(v, (int, float)) and not isinstance(v, bool):
            clean[k] = max(0, float(v)) if k != "discount_reason_percent" else min(100, max(0, float(v)))
        elif isinstance(v, str) and str(v).strip() and k not in ("labels", "order_prefix"):
            clean[k] = str(v).strip()
    if not clean:
        raise HTTPException(400, "Tidak ada pengaturan valid")
    await db.settings.update_one({"_id": "business"}, {"$set": clean}, upsert=True)
    _cache_del("biz")
    return await _business()

# ================================================================== DASHBOARD WIDGET (default per role)
ROLE_WIDGET_DEFAULTS = {
    "admin": ["kpi", "jenis", "finansial", "trend", "kategori", "terlaris", "metode", "ai", "lowstock"],
    "kasir": ["kpi", "jenis", "finansial", "trend", "terlaris", "metode"],
    "input": ["lowstock"],
}

@api.get("/settings/dashboard")
async def get_dashboard_layouts(user: dict = Depends(get_current_user)):
    doc = await db.settings.find_one({"_id": "dashboard"}, {"_id": 0}) or {}
    out = {}
    for role, dflt in ROLE_WIDGET_DEFAULTS.items():
        val = doc.get(role)
        out[role] = val if isinstance(val, list) and val else dflt
    return out

@api.put("/settings/dashboard")
async def put_dashboard_layout(body: dict, admin: dict = Depends(require_admin)):
    role = str(body.get("role") or "")
    widgets = body.get("widgets")
    if role not in ROLE_WIDGET_DEFAULTS:
        raise HTTPException(400, "Role tidak valid")
    if not isinstance(widgets, list):
        raise HTTPException(400, "widgets harus berupa daftar")
    known = {"kpi", "jenis", "finansial", "trend", "kategori", "terlaris", "metode", "ai", "lowstock"}
    # izinkan juga widget kustom (id "custom:<widget_id>") yang masih ada
    cw_ids = {d["id"] for d in await db.custom_widgets.find({}, {"_id": 0, "id": 1}).to_list(500)}
    clean = []
    for w in widgets:
        w = str(w)
        if w in known or (w.startswith("custom:") and w[len("custom:"):] in cw_ids):
            clean.append(w)
    await db.settings.update_one({"_id": "dashboard"}, {"$set": {role: clean}}, upsert=True)
    return {"ok": True, role: clean}

# ================================================================== KUSTOMISASI UI (tanpa ubah kode)
# settings._id="ui": {menu:{order:[], hidden:[], labels:{}}} + pos:{labels:{}} +
# dashboard:{order:{role:[widget_ids]}} (default urutan widget dashboard per role).
UI_DEFAULT = {"menu": {"order": [], "hidden": [], "labels": {}}, "pos": {"labels": {}}, "dashboard": {"order": {}}}

async def _ui_config():
    doc = await db.settings.find_one({"_id": "ui"}, {"_id": 0}) or {}
    out = json.loads(json.dumps(UI_DEFAULT))
    menu = doc.get("menu") or {}
    if isinstance(menu.get("order"), list):
        out["menu"]["order"] = [str(x) for x in menu["order"] if str(x).startswith("/")]
    if isinstance(menu.get("hidden"), list):
        out["menu"]["hidden"] = [str(x) for x in menu["hidden"] if str(x).startswith("/")]
    if isinstance(menu.get("labels"), dict):
        out["menu"]["labels"] = {str(k): str(v)[:40] for k, v in menu["labels"].items() if str(k).startswith("/") and str(v).strip()}
    pos = doc.get("pos") or {}
    if isinstance(pos.get("labels"), dict):
        out["pos"]["labels"] = {str(k): str(v)[:40] for k, v in pos["labels"].items() if str(v).strip()}
    dash = doc.get("dashboard") or {}
    if isinstance(dash.get("order"), dict):
        out["dashboard"]["order"] = {str(r): [str(x) for x in v] for r, v in dash["order"].items() if isinstance(v, list)}
    return out

@api.get("/settings/ui")
async def get_ui_config(user: dict = Depends(get_current_user)):
    """Dipakai Layout/POS/Dashboard — boleh dibaca semua user terautentikasi."""
    return await _ui_config()

@api.put("/settings/ui")
async def put_ui_config(body: dict, admin: dict = Depends(require_admin)):
    cur = await _ui_config()
    menu = body.get("menu") if isinstance(body.get("menu"), dict) else {}
    pos = body.get("pos") if isinstance(body.get("pos"), dict) else {}
    dash = body.get("dashboard") if isinstance(body.get("dashboard"), dict) else {}
    if isinstance(menu.get("order"), list):
        cur["menu"]["order"] = [str(x) for x in menu["order"] if str(x).startswith("/")]
    if isinstance(menu.get("hidden"), list):
        cur["menu"]["hidden"] = [str(x) for x in menu["hidden"] if str(x).startswith("/")]
    if isinstance(menu.get("labels"), dict):
        cur["menu"]["labels"] = {str(k): str(v)[:40] for k, v in menu["labels"].items() if str(k).startswith("/") and str(v).strip()}
    if isinstance(pos.get("labels"), dict):
        cur["pos"]["labels"] = {str(k): str(v)[:40] for k, v in pos["labels"].items() if str(v).strip()}
    if isinstance(dash.get("order"), dict):
        cur["dashboard"]["order"] = {str(r): [str(x) for x in v] for r, v in dash["order"].items() if isinstance(v, list)}
    await db.settings.update_one({"_id": "ui"}, {"$set": cur}, upsert=True)
    return {"ok": True, "ui": cur}

# ================================================================== PENGATURAN PLATFORM (nama aplikasi, logo, warna tema)
# Bisa diubah admin tanpa deploy ulang; dipakai login, sidebar, & judul aplikasi.
PLATFORM_DEFAULTS = {
    "app_name": "Grand Aceh Kuliner",
    "tagline": "KULINER POS",
    "primary": "#E63946",
    "accent": "#F97316",
    "logo_url": "",
}

async def _platform():
    doc = await db.settings.find_one({"_id": "platform"}, {"_id": 0}) or {}
    out = dict(PLATFORM_DEFAULTS)
    for k in out:
        v = doc.get(k)
        if k == "logo_url":
            if isinstance(v, str) and v:
                out[k] = v
        elif isinstance(v, str) and v.strip():
            out[k] = v.strip()[:60]
    return out

@api.get("/app-info")
async def app_info():
    """Info publik (tanpa login) utk layar login & branding aplikasi."""
    p = await _platform()
    p["has_custom"] = bool(p["logo_url"]) or p["primary"] != PLATFORM_DEFAULTS["primary"] or p["accent"] != PLATFORM_DEFAULTS["accent"]
    return p

@api.get("/settings/platform")
async def get_platform(admin: dict = Depends(require_admin)):
    return await _platform()

@api.put("/settings/platform")
async def put_platform(body: dict, admin: dict = Depends(require_admin)):
    p = await _platform()
    upd = {}
    for k in ("app_name", "tagline", "logo_url"):
        if isinstance(body.get(k), str):
            v = body[k].strip()[:60]
            if k == "logo_url":
                if not v or re.fullmatch(r"(?:/uploads/[\w.\-]+|https?://[\w.\-:/]+)", v):
                    upd[k] = v
            elif v:
                upd[k] = v
    for k in ("primary", "accent"):
        v = str(body.get(k) or "").strip().lower()
        if re.fullmatch(r"#[0-9a-f]{6}", v):
            upd[k] = v
    if not upd:
        raise HTTPException(400, "Tidak ada pengaturan valid")
    await db.settings.update_one({"_id": "platform"}, {"$set": upd}, upsert=True)
    out = dict(p)
    out.update(upd)
    return out

@api.post("/settings/platform/logo")
async def upload_platform_logo(file: UploadFile = File(...), admin: dict = Depends(require_admin)):
    ok_types = {"image/png": ".png", "image/jpeg": ".jpg", "image/webp": ".webp", "image/gif": ".gif"}
    ext = ok_types.get(file.content_type or "")
    if not ext:
        raise HTTPException(400, "Format logo harus PNG/JPG/WEBP/GIF")
    data = await file.read()
    if len(data) > 2_000_000:
        raise HTTPException(400, "Logo maksimal 2MB")
    fname = f"logo-{new_id()}{ext}"
    (UPLOAD_DIR / fname).write_bytes(data)
    url = f"/uploads/{fname}"
    await db.settings.update_one({"_id": "platform"}, {"$set": {"logo_url": url}}, upsert=True)
    return {"ok": True, "url": url}

# ================================================================== WIDGET KUSTOM DASHBOARD
# Widget buatan admin: kombinasi isian SENDIRI (nilai tetap / isian harian per tanggal)
# dengan data otomatis aplikasi (laporan hari ini) lewat RUMUS sederhana.
# Rumus aman: hanya angka + variabel + operator + - * / % ( ) — tidak ada eval() bebas.
CW_FORMATS = ("rupiah", "jumlah", "persen", "angka")
CW_AUTO_VARS = {
    "penjualan_total":   "Total penjualan (F&B + Retail)",
    "penjualan_fnb":     "Penjualan F&B (dine-in + take-away)",
    "penjualan_retail":  "Penjualan Retail",
    "penjualan_dinein":  "Penjualan dine-in",
    "penjualan_takeaway": "Penjualan take-away",
    "laba_fnb":          "Laba kotor F&B (setelah HPP & bagian vendor)",
    "laba_retail":       "Laba kotor Retail",
    "laba_total":        "Laba kotor total (F&B + Retail)",
    "kas_bersih_fnb":    "Kas bersih laci F&B (tunai − pengeluaran)",
    "kas_bersih_retail": "Kas bersih laci Retail",
    "kas_bersih_total":  "Kas bersih laci total",
    "kas_tunai_fnb":     "Pembayaran tunai F&B",
    "kas_tunai_retail":  "Pembayaran tunai Retail",
    "kas_keluar_fnb":    "Pengeluaran F&B hari ini",
    "kas_keluar_retail": "Pengeluaran Retail hari ini",
    "order_total":       "Jumlah order lunas (semua)",
    "order_dinein":      "Jumlah order dine-in",
    "order_takeaway":    "Jumlah order take-away",
    "order_retail":      "Jumlah order retail",
    "diskon_total":      "Total diskon yang diberikan",
}
CW_AUTO_KEYS = set(CW_AUTO_VARS.keys())
_CW_RE_ID = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")

def _cw_tokenize(expr):
    """Token rumus: angka desimal, variabel, operator + - * / % ( )."""
    bad = re.sub(r"[\sA-Za-z0-9_()+\-*/%.]", "", expr)
    if bad:
        raise ValueError(f"Rumus mengandung karakter tidak dikenal: '{bad[:10]}'")
    toks = re.findall(r"\d+\.?\d*|[A-Za-z_][A-Za-z0-9_]*|[()+\-*/%]", expr)
    if not toks:
        raise ValueError("Rumus kosong")
    return toks

def _cw_to_rpn(tokens, allowed):
    """Shunting-yard → notasi postfix. allowed = set kode variabel yang dikenal."""
    out, ops = [], []
    for t in tokens:
        if re.fullmatch(r"\d+\.?\d*", t):
            out.append(("n", float(t)))
        elif _CW_RE_ID.fullmatch(t):
            if t not in allowed:
                raise ValueError(f"Variabel '{t}' tidak dikenal (gunakan kode isian atau data otomatis)")
            out.append(("v", t))
        elif t in ("+", "-", "*", "/", "%"):
            prec = {"+": 1, "-": 1, "*": 2, "/": 2, "%": 2}
            while ops and ops[-1] != "(" and prec[ops[-1]] >= prec[t]:
                out.append(("o", ops.pop()))
            ops.append(t)
        elif t == "(":
            ops.append(t)
        elif t == ")":
            while ops and ops[-1] != "(":
                out.append(("o", ops.pop()))
            if not ops or ops[-1] != "(":
                raise ValueError("Kurung tidak seimbang")
            ops.pop()
    while ops:
        if ops[-1] == "(":
            raise ValueError("Kurung tidak seimbang")
        out.append(("o", ops.pop()))
    return out

def _cw_eval_rpn(rpn, env):
    st = []
    for kind, v in rpn:
        if kind == "n":
            st.append(v)
        elif kind == "v":
            st.append(float(env.get(v, 0) or 0))
        else:
            if len(st) < 2:
                raise ValueError("Rumus tidak valid")
            b, a = st.pop(), st.pop()
            if v == "+":
                st.append(a + b)
            elif v == "-":
                st.append(a - b)
            elif v == "*":
                st.append(a * b)
            elif v == "/":
                if b == 0:
                    raise ValueError("Pembagian dengan nol")
                st.append(a / b)
            elif v == "%":
                if b == 0:
                    raise ValueError("Pembagian dengan nol (operator %)")
                st.append(a % b)
    return st[-1] if st else 0.0

def _cw_parse_formula(formula, field_codes):
    """Validasi rumus → (rpn, refs). refs = kode yang dipakai (auto + isian)."""
    toks = _cw_tokenize(formula)
    allowed = set(field_codes) | CW_AUTO_KEYS
    rpn = _cw_to_rpn(toks, allowed)
    return rpn, sorted({v for k, v in rpn if k == "v"})

def _clean_cw_body(body, allow_empty_formula=False):
    """Bersihkan payload definisi widget kustom; raise HTTPException bila tidak valid."""
    b = body if isinstance(body, dict) else {}
    name = str(b.get("name") or "").strip()
    if not name:
        raise HTTPException(400, "Nama widget wajib diisi")
    if len(name) > 60:
        name = name[:60]
    fmt = str(b.get("format") or "angka")
    if fmt not in CW_FORMATS:
        raise HTTPException(400, "Format hasil tidak valid")
    color = str(b.get("color") or "#E63946")
    if not re.fullmatch(r"#[0-9a-fA-F]{6}", color):
        color = "#E63946"
    enabled = bool(b.get("enabled", True))
    desc = str(b.get("desc") or "").strip()[:240]

    fields, seen = [], set()
    raw_fields = b.get("fields") if isinstance(b.get("fields"), list) else []
    if len(raw_fields) > 30:
        raise HTTPException(400, "Maksimal 30 isian per widget")
    for i, f in enumerate(raw_fields[:30]):
        if not isinstance(f, dict):
            continue
        label = str(f.get("label") or "").strip()
        kind = f.get("kind") if f.get("kind") in ("daily", "fixed") else "daily"
        code = str(f.get("code") or "").strip()
        if not label:
            raise HTTPException(400, f"Isian ke-{i + 1}: label wajib diisi")
        if len(label) > 40:
            label = label[:40]
        if not _CW_RE_ID.fullmatch(code):
            raise HTTPException(400, f"Isian '{label}': kode harus tanpa spasi (huruf/angka/garis bawah)")
        if code in CW_AUTO_KEYS:
            raise HTTPException(400, f"Isian '{label}': kode '{code}' sama dengan variabel otomatis — ganti kode lain")
        if code in seen:
            raise HTTPException(400, f"Kode isian '{code}' dipakai dua kali")
        seen.add(code)
        value = 0.0
        if kind == "fixed":
            try:
                value = round(float(f.get("value") or 0), 2)
            except (TypeError, ValueError):
                raise HTTPException(400, f"Isian tetap '{label}': nilai harus angka")
            if not math.isfinite(value):
                raise HTTPException(400, f"Isian tetap '{label}': nilai tidak valid")
        fields.append({"label": label, "kind": kind, "code": code, "value": value})

    formula = str(b.get("formula") or "").strip()
    if not formula and not allow_empty_formula:
        raise HTTPException(400, "Rumus wajib diisi (contoh: penjualan_fnb + t1 - i1)")
    try:
        rpn, refs = _cw_parse_formula(formula, seen) if formula else ([], [])
    except ValueError as e:
        raise HTTPException(400, str(e))
    return {"name": name, "format": fmt, "color": color, "enabled": enabled, "desc": desc,
            "fields": fields, "formula": formula, "refs": refs, "rpn": rpn}

@api.get("/custom-widgets")
async def list_custom_widgets(user: dict = Depends(admin_or_kasir)):
    out = []
    for d in await db.custom_widgets.find({}, {"_id": 0, "rpn": 0}).sort("created_at", 1).to_list(500):
        out.append(d)
    return out

@api.post("/custom-widgets")
async def create_custom_widget(body: dict, admin: dict = Depends(require_admin)):
    clean = _clean_cw_body(body)
    clean.update({"id": new_id(), "created_at": now_utc().isoformat(), "updated_at": now_utc().isoformat()})
    await db.custom_widgets.insert_one(clean)
    clean.pop("rpn", None)
    return clean

@api.put("/custom-widgets/{wid}")
async def update_custom_widget(wid: str, body: dict, admin: dict = Depends(require_admin)):
    cur = await db.custom_widgets.find_one({"id": wid})
    if not cur:
        raise HTTPException(404, "Widget tidak ditemukan")
    clean = _clean_cw_body(body)
    # kode isian yang dihapus → bersihkan nilai harian lama agar tidak tersisa
    old_codes = {f["code"] for f in cur.get("fields", []) if f["kind"] == "daily"}
    new_codes = {f["code"] for f in clean["fields"] if f["kind"] == "daily"}
    gone = old_codes - new_codes
    if gone:
        unset = {f"daily.{c}": "" for c in gone}
        try:
            await db.custom_widget_entries.update_many({"widget_id": wid}, {"$unset": unset})
        except Exception:
            pass
    clean.update({"id": wid, "created_at": cur.get("created_at") or now_utc().isoformat(),
                  "updated_at": now_utc().isoformat()})
    await db.custom_widgets.replace_one({"id": wid}, clean)
    clean.pop("rpn", None)
    return clean

@api.delete("/custom-widgets/{wid}")
async def delete_custom_widget(wid: str, admin: dict = Depends(require_admin)):
    await db.custom_widgets.delete_one({"id": wid})
    await db.custom_widget_entries.delete_many({"widget_id": wid})
    return {"ok": True}

@api.get("/custom-widgets/entries")
async def list_custom_widget_entries(date: str = Query(..., description="YYYY-MM-DD"),
                                     user: dict = Depends(admin_or_kasir)):
    wib_day_range(date)  # validasi format tanggal
    out = {}
    for d in await db.custom_widget_entries.find({"date": date}, {"_id": 0}).to_list(1000):
        out[d["widget_id"]] = {"date": date, "daily": d.get("daily", {})}
    return out

@api.get("/custom-widgets/{wid}/entries")
async def list_widget_entries_history(wid: str, limit: int = Query(30, ge=1, le=200),
                                      user: dict = Depends(admin_or_kasir)):
    """Riwayat isian harian satu widget (tanggal terbaru dulu)."""
    if not await db.custom_widgets.find_one({"id": wid}, {"_id": 0, "id": 1}):
        raise HTTPException(404, "Widget tidak ditemukan")
    docs = []
    async for d in db.custom_widget_entries.find({"widget_id": wid}, {"_id": 0}).sort("date", -1).limit(limit):
        docs.append(d)
    return docs

@api.put("/custom-widgets/entry")
async def put_custom_widget_entry(body: dict, user: dict = Depends(admin_or_kasir)):
    wid = str(body.get("widget_id") or "")
    date = str(body.get("date") or "")
    wib_day_range(date)
    widget = await db.custom_widgets.find_one({"id": wid})
    if not widget:
        raise HTTPException(404, "Widget tidak ditemukan")
    daily_codes = {f["code"] for f in widget.get("fields", []) if f["kind"] == "daily"}
    raw = body.get("daily") if isinstance(body.get("daily"), dict) else {}
    clean = {}
    for k, v in raw.items():
        if k not in daily_codes:
            continue
        try:
            nv = round(float(v), 2)
        except (TypeError, ValueError):
            continue
        if math.isfinite(nv):
            clean[k] = nv
    await db.custom_widget_entries.update_one(
        {"widget_id": wid, "date": date},
        {"$set": {"daily": clean, "updated_at": now_utc().isoformat()}},
        upsert=True)
    return {"widget_id": wid, "date": date, "daily": clean}

# ================================================================== EXCEL
IMPORT_COLUMNS = ["nama_produk", "sku", "kategori", "tipe_produk", "harga", "harga_beli", "status_aktif", "sold_out", "deskripsi", "stok_awal"]

@api.get("/products/template")
async def download_template(user: dict = Depends(get_current_user)):
    import openpyxl
    from openpyxl.styles import Font, PatternFill
    cats = await db.categories.find({}, {"_id": 0, "name": 1, "type": 1}).to_list(500)
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Produk"
    ws.append(IMPORT_COLUMNS)
    # Contoh memakai KATEGORI NYATA dari database supaya langsung valid
    ex = []
    by_type = {}
    for c in cats:
        by_type.setdefault(c["type"], []).append(c["name"])
    if by_type.get("makanan"):
        ex.append(["Nasi Goreng Aceh", "FD-001", by_type["makanan"][0], "makanan", 25000, 12000, "aktif", "tidak", "Nasi goreng khas Aceh", 0])
    if by_type.get("minuman"):
        ex.append(["Kopi Sanger", "DR-001", by_type["minuman"][0], "minuman", 15000, 6000, "aktif", "tidak", "Kopi susu khas Aceh", 0])
    if by_type.get("retail"):
        ex.append(["Keripik Pisang", "RT-001", by_type["retail"][0], "retail", 12000, 8000, "aktif", "tidak", "Keripik pisang kemasan", 50])
    if not ex:
        ex = [["Nasi Goreng Aceh", "FD-001", "", "makanan", 25000, 12000, "aktif", "tidak", "Nasi goreng khas Aceh", 0]]
    for row in ex:
        ws.append(row)
    # Styling header
    for cell in ws[1]:
        cell.font = Font(bold=True, color="FFFFFF")
        cell.fill = PatternFill("solid", fgColor="E63946")
    ws.column_dimensions["A"].width = 22
    ws.column_dimensions["B"].width = 10
    ws.column_dimensions["C"].width = 18
    ws.column_dimensions["D"].width = 12
    ws.column_dimensions["E"].width = 10
    ws.column_dimensions["F"].width = 12
    ws.column_dimensions["G"].width = 13
    ws.column_dimensions["H"].width = 10
    ws.column_dimensions["I"].width = 30
    ws.column_dimensions["J"].width = 10

    # Lembar Petunjuk
    guide = wb.create_sheet("Petunjuk")
    guide.column_dimensions["A"].width = 26
    guide.column_dimensions["B"].width = 60
    guide.append(["Kolom", "Keterangan & Nilai yang Diterima"])
    guide.append(["nama_produk", "Nama produk (wajib)"])
    guide.append(["sku", "Kode SKU unik (wajib)"])
    guide.append(["kategori", "Nama kategori — harus SAMA dengan kategori yang ada di aplikasi. Kategori valid:"])
    for c in cats:
        guide.append(["", f"- {c['name']}  (tipe: {c['type']})"])
    if not cats:
        guide.append(["", "(belum ada kategori — buat dulu di menu Produk & Stok > Kategori)"])
    guide.append(["tipe_produk", "makanan | minuman | retail (harus sesuai tipe kategori)"])
    guide.append(["harga", "Angka (rupiah), contoh: 25000"])
    guide.append(["harga_beli", "Angka HPP/modal (0 untuk produk tanpa HPP)"])
    guide.append(["status_aktif", "aktif | nonaktif (juga diterima: ya/tidak/true/false/1/0)"])
    guide.append(["sold_out", "tidak | ya (tandai produk habis)"])
    guide.append(["deskripsi", "Teks deskripsi (opsional)"])
    guide.append(["stok_awal", "Angka stok (hanya dipakai untuk produk retail)"])
    guide.append([])
    guide.append(["CATATAN", "Hapus baris contoh sebelum mengisi data Anda. Baris yang error tidak akan diimpor; perbaiki lalu ulangi."])
    for cell in guide[1]:
        cell.font = Font(bold=True, color="FFFFFF")
        cell.fill = PatternFill("solid", fgColor="4F46E5")

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return StreamingResponse(buf, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                             headers={"Content-Disposition": "attachment; filename=template_produk_gak.xlsx"})

@api.get("/products/export")
async def export_products(admin: dict = Depends(require_admin)):
    import openpyxl
    cats = {c["id"]: c["name"] for c in await db.categories.find({}, {"_id": 0}).to_list(500)}
    products = await db.products.find({}, {"_id": 0}).sort("name", 1).to_list(5000)
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Produk"
    ws.append(IMPORT_COLUMNS)
    for p in products:
        ws.append([p["name"], p["sku"], cats.get(p["category_id"], ""), p["type"], p["price"], p.get("cost", 0),
                   "aktif" if p.get("active") else "nonaktif", "ya" if p.get("sold_out") else "tidak",
                   p.get("description", ""), p.get("stock", 0)])
    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return StreamingResponse(buf, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                             headers={"Content-Disposition": "attachment; filename=produk_gak.xlsx"})

async def _parse_import(file_bytes):
    import openpyxl
    wb = openpyxl.load_workbook(io.BytesIO(file_bytes), read_only=True)
    ws = wb.active
    rows = list(ws.iter_rows(values_only=True))
    if not rows:
        return [], ["File kosong"]
    header = [str(h).strip().lower() if h else "" for h in rows[0]]
    dict_rows = [{header[i]: raw[i] if i < len(raw) else None for i in range(len(header))} for raw in rows[1:]]
    return await _validate_import_rows(dict_rows)

async def _validate_import_rows(dict_rows):
    """Validasi baris import (dari file Excel atau JSON hasil perbaikan) -> parsed."""
    cats = {c["name"].strip().lower(): c for c in await db.categories.find({}, {"_id": 0}).to_list(500)}
    existing_skus = {p["sku"] for p in await db.products.find({}, {"_id": 0, "sku": 1}).to_list(5000)}
    parsed = []
    seen_skus = set()
    for idx, row in enumerate(dict_rows, start=2):
        errors = []
        name = str(row.get("nama_produk") or "").strip()
        sku = str(row.get("sku") or "").strip()
        cat_name = str(row.get("kategori") or "").strip()
        ptype = str(row.get("tipe_produk") or "").strip().lower()
        if not name:
            errors.append("nama produk kosong")
        if not sku:
            errors.append("SKU kosong")
        elif sku in seen_skus:
            errors.append(f"SKU '{sku}' duplikat di file")
        seen_skus.add(sku)
        cat = cats.get(cat_name.lower())
        if not cat:
            errors.append(f"kategori '{cat_name}' tidak valid")
        if ptype not in PRODUCT_TYPES:
            errors.append(f"tipe '{ptype}' tidak valid (makanan/minuman/retail)")
        elif cat and cat["type"] != ptype:
            errors.append(f"tipe produk '{ptype}' tidak sesuai tipe kategori '{cat['type']}'")
        try:
            price = float(row.get("harga") or 0)
            if price < 0:
                errors.append("harga negatif")
        except (ValueError, TypeError):
            price = 0
            errors.append("harga bukan angka")
        try:
            cost = float(row.get("harga_beli") or 0)
            if cost < 0:
                cost = 0
        except (ValueError, TypeError):
            cost = 0
        try:
            stock = int(float(row.get("stok_awal") or 0))
        except (ValueError, TypeError):
            stock = 0
        active = str(row.get("status_aktif") or "aktif").strip().lower() in ("aktif", "aktif ", "ya", "true", "1", "active")
        sold_out = str(row.get("sold_out") or "tidak").strip().lower() in ("ya", "true", "1", "sold out", "soldout")
        parsed.append({
            "row": idx, "name": name, "sku": sku, "category_id": cat["id"] if cat else None,
            "category_name": cat_name, "type": ptype, "price": price, "cost": cost, "stock": stock,
            "description": str(row.get("deskripsi") or ""), "active": active, "sold_out": sold_out,
            "exists": sku in existing_skus, "errors": errors, "valid": len(errors) == 0,
        })
    return parsed, []

@api.post("/products/import/preview")
async def import_preview(file: UploadFile = File(...), admin: dict = Depends(admin_or_input)):
    content = await file.read()
    parsed, file_errors = await _parse_import(content)
    if file_errors:
        raise HTTPException(400, file_errors[0])
    valid = [p for p in parsed if p["valid"]]
    return {"rows": parsed, "total": len(parsed), "valid_count": len(valid),
            "error_count": len(parsed) - len(valid),
            "new_count": len([p for p in valid if not p["exists"]]),
            "update_count": len([p for p in valid if p["exists"]])}

@api.post("/products/import/commit")
async def import_commit(file: UploadFile = File(...), admin: dict = Depends(admin_or_input)):
    content = await file.read()
    parsed, file_errors = await _parse_import(content)
    if file_errors:
        raise HTTPException(400, file_errors[0])
    created = updated = 0
    for p in parsed:
        if not p["valid"]:
            continue
        doc = {"name": p["name"], "sku": p["sku"], "category_id": p["category_id"], "type": p["type"],
               "price": p["price"], "cost": p["cost"], "description": p["description"], "active": p["active"],
               "sold_out": p["sold_out"], "stock": p["stock"], "track_stock": p["type"] == "retail",
               "image": ""}
        if p["exists"]:
            await db.products.update_one({"sku": p["sku"]}, {"$set": doc})
            updated += 1
        else:
            doc.update({"id": new_id(), "created_at": now_utc().isoformat()})
            await db.products.insert_one(doc)
            created += 1
    log = {"id": new_id(), "filename": file.filename, "at": now_utc().isoformat(), "by": admin["name"],
           "created": created, "updated": updated, "errors": len([p for p in parsed if not p["valid"]])}
    await db.import_logs.insert_one(log)
    log.pop("_id", None)
    return log

class ImportRowsFixIn(BaseModel):
    rows: List[dict]

@api.post("/products/import/commit-fix")
async def import_commit_fix(body: ImportRowsFixIn, admin: dict = Depends(admin_or_input)):
    """Commit hasil PERBAIKAN import (JSON) — baris yang diedit user di UI.
    Validasi ulang server-side lalu simpan yang valid."""
    if not body.rows:
        raise HTTPException(400, "Tidak ada baris untuk diimpor")
    parsed, file_errors = await _validate_import_rows(body.rows)
    created = updated = 0
    for p in parsed:
        if not p["valid"]:
            continue
        doc = {"name": p["name"], "sku": p["sku"], "category_id": p["category_id"], "type": p["type"],
               "price": p["price"], "cost": p["cost"], "description": p["description"], "active": p["active"],
               "sold_out": p["sold_out"], "stock": p["stock"], "track_stock": p["type"] == "retail",
               "image": ""}
        if p["exists"]:
            await db.products.update_one({"sku": p["sku"]}, {"$set": doc})
            updated += 1
        else:
            doc.update({"id": new_id(), "created_at": now_utc().isoformat()})
            await db.products.insert_one(doc)
            created += 1
    log = {"id": new_id(), "filename": "perbaikan-import", "at": now_utc().isoformat(), "by": admin["name"],
           "created": created, "updated": updated, "errors": len([p for p in parsed if not p["valid"]])}
    await db.import_logs.insert_one(log)
    _cache_del("products:")
    log.pop("_id", None)
    return log

@api.get("/import-logs")
async def import_logs(admin: dict = Depends(require_admin)):
    return await db.import_logs.find({}, {"_id": 0}).sort("at", -1).to_list(100)

@api.post("/ai/assistant/import-excel")
async def assistant_import_excel(file: UploadFile = File(...), admin: dict = Depends(admin_or_input)):
    """Parse file Excel yang diupload di chat Asisten AI — return baris siap
    commit (commit-fix). Tidak menyimpan apa pun sampai admin klik Terapkan."""
    content = await file.read()
    if len(content) > 5_000_000:
        raise HTTPException(400, "File terlalu besar (maks 5MB)")
    parsed, file_errors = await _parse_import(content)
    if file_errors:
        raise HTTPException(400, file_errors[0])
    rows = [{
        "nama_produk": p["name"], "sku": p["sku"], "kategori": p.get("category_name") or "",
        "tipe_produk": p["type"], "harga": p["price"], "harga_beli": p["cost"],
        "exists": p["exists"], "errors": p["errors"], "valid": p["valid"],
    } for p in parsed]
    return {
        "rows": rows, "total": len(rows),
        "valid_count": sum(1 for r in rows if r["valid"]),
        "error_count": sum(1 for r in rows if not r["valid"]),
        "new_count": sum(1 for r in rows if r["valid"] and not r["exists"]),
        "update_count": sum(1 for r in rows if r["valid"] and r["exists"]),
    }

# ================================================================== FITUR & INTEGRASI (admin, tanpa deploy)
# Dokumentasi: docs/ANALISIS-FITUR-PRIORITAS.md bagian 2.
@api.get("/settings/features")
async def get_features(user: dict = Depends(get_current_user)):
    """Daftar feature flag (dibaca frontend utk menyembunyikan menu/tombol)."""
    return await _features()

@api.put("/settings/features")
async def put_features(body: dict, admin: dict = Depends(require_admin)):
    """Simpan feature flag. Hanya terima struktur & tipe yang cocok dgn default."""
    def clean(base, over):
        out = {}
        for k, dval in (base or {}).items():
            if k not in (over or {}):
                continue
            v = over[k]
            if isinstance(dval, bool) and isinstance(v, bool):
                out[k] = v
            elif isinstance(dval, dict) and isinstance(v, dict):
                sub = clean(dval, v)
                if sub:
                    out[k] = sub
            elif isinstance(dval, (int, float)) and isinstance(v, (int, float)) and not isinstance(v, bool):
                out[k] = v
        return out
    cleaned = clean(FEATURE_DEFAULTS, body or {})
    if not cleaned:
        raise HTTPException(400, "Tidak ada pengaturan valid")
    await db.settings.update_one({"_id": "features"}, {"$set": cleaned}, upsert=True)
    await _invalidate_features()
    return await _features()

class WebhookIn(BaseModel):
    enabled: bool = False
    url: str = ""
    secret: str = ""          # kosong => biarkan secret lama tetap
    events: List[str] = []    # order.paid | shift.closed | test

@api.get("/settings/webhook")
async def get_webhook(admin: dict = Depends(require_admin)):
    cfg = await _webhook_cfg()
    return {"enabled": cfg["enabled"], "url": cfg["url"],
            "secret_set": bool(cfg.get("secret")), "events": cfg.get("events") or [],
            "last": cfg.get("last")}

@api.put("/settings/webhook")
async def put_webhook(body: WebhookIn, admin: dict = Depends(require_admin)):
    url = (body.url or "").strip()
    if body.enabled and not (url.startswith("https://") or url.startswith("http://")):
        raise HTTPException(400, "URL webhook tidak valid (harus http/https)")
    upd = {"enabled": body.enabled, "url": url,
           "events": [e for e in body.events if e in ("order.paid", "shift.closed", "test")]}
    if (body.secret or "").strip():
        upd["secret"] = body.secret.strip()
    await db.settings.update_one({"_id": "webhook"}, {"$set": upd}, upsert=True)
    return {"ok": True}

@api.post("/settings/webhook/test")
async def test_webhook(admin: dict = Depends(require_admin)):
    cfg = await _webhook_cfg()
    if not (cfg.get("url") or "").strip():
        raise HTTPException(400, "Isi URL webhook terlebih dahulu")
    await _fire_webhook("test", {"message": "Uji webhook dari Grand Aceh Kuliner POS"}, force=True)
    return {"ok": True}

@api.get("/admin/orphan-check")
async def orphan_status(admin: dict = Depends(require_admin)):
    doc = await db.settings.find_one({"_id": "orphan"}, {"_id": 0}) or {}
    hour = int(await _feat("maint.orphan_hour", 4))
    day = int(await _feat("maint.orphan_day", 6))
    nama_hari = ["Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu", "Minggu"]
    return {"last": doc.get("last"), "auto": await _feat("maint.orphan_auto"),
            "schedule": f"{nama_hari[day % 7]} {hour:02d}:00 WIB"}

@api.post("/admin/orphan-check")
async def orphan_run(admin: dict = Depends(require_admin)):
    """Jalankan pemeriksaan data yatim sekarang (read-only)."""
    return await _run_orphan_check()

# ================================================================== INTEGRITAS DATA
# Audit menyeluruh: relasi (data yatim), angka/keuangan, stok & HPP, akun,
# indeks database, dan kesegaran backup. Berbeda dari /admin/orphan-check yang
# hanya memeriksa referensi, pemeriksaan ini juga menghitung angka transaksi.
# Setiap temuan yang JELAS AMAN punya aksi "Perbaiki" (INTEGRITY_FIXES) yang
# dipanggil dari UI — tidak ada perbaikan yang menghapus transaksi; satu-satunya
# yang mengubah status adalah "void bill menggantung" dan itu pun butuh konfirmasi.
# Hasil terakhir disimpan di settings._id="integrity" supaya skrip di Pi
# (check-integrity-pi.sh) bisa membacanya tanpa perlu login admin.
_INTG_CAP = 20000        # batas dokumen berat yang diperiksa sekali jalan (performa Pi)
_INTG_BACKUP_MAX_DAYS = 3
_IDX_WARN = []           # indeks yang GAGAL dipasang (mis. karena duplikat) — diisi _ensure_indexes

# Indeks wajib (rancangan: docs/INDEKS-DATABASE.md). Perbandingan hanya memakai
# NAMA kolom (arah 1/-1 diabaikan) supaya tidak salah lapor.
INTG_REQUIRED_INDEXES = {
    "orders": [["order_number"], ["id"], ["status", "created_at"], ["table_id", "status"], ["shift_id", "status"],
               ["status", "voided_at"]],
    "products": [["id"], ["sku"]],
    "users": [["id"], ["username"]],
    "shifts": [["id"], ["cashier_id", "status"], ["status", "scope"], ["session_id"], ["open_key"]],
    "coupons": [["id"], ["code"]],
    "reservations": [["id"], ["date", "table_id"]],
    "ingredients": [["id"], ["name"]],
    "audit_logs": [["at"], ["by_id", "at"], ["order_id"]],
    "ingredient_categories": [["id"], ["name"]],
    "custom_widgets": [["id"]],
    "members": [["id"]], "categories": [["id"]], "vendors": [["id"]],
    "vendor_settlements": [["id"], ["settlement_no"], ["vendor_id", "date"], ["date"]],
    "tables": [["id"]], "payment_methods": [["id"]], "promos": [["id"]],
}


def _intg_index_name(keys):
    """Nama indeks default MongoDB dari definisi kunci (mis. 'client_ref_1')."""
    if isinstance(keys, str):
        return f"{keys}_1"
    parts = []
    for k in (keys or []):
        if isinstance(k, (tuple, list)):
            parts.append(f"{k[0]}_{k[1]}")
        else:
            parts.append(f"{k}_1")
    return "_".join(parts)


def _intg_chk(key, name, count, note="", samples=None, level=None, fix=None, fix_label=None):
    """Satu temuan pemeriksaan. count=0 → level ok (kecuali level dipaksa)."""
    return {"key": key, "name": name, "count": int(count or 0),
            "level": level or ("ok" if not count else "warn"),
            "note": note, "samples": [str(s) for s in list(samples or [])[:5]],
            "fix": fix, "fix_label": fix_label}


def _intg_expected_total(o):
    """Total yang seharusnya dari komponen tersimpan (tanpa melihat item)."""
    net = ((o.get("subtotal") or 0) - (o.get("discount") or 0) - (o.get("promo_discount") or 0)
           - (o.get("coupon_discount") or 0) - (o.get("redeem_discount") or 0))
    net = max(0.0, net)
    return round(net + (o.get("service_tax") or 0), 2)


def _intg_age_days(iso_str):
    try:
        d = datetime.fromisoformat(str(iso_str).replace("Z", "+00:00"))
        if d.tzinfo is None:
            d = d.replace(tzinfo=timezone.utc)
        return (now_utc() - d).total_seconds() / 86400.0
    except Exception:
        return None


async def _intg_list_indexes(coll):
    """Daftar kolom tiap indeks pada satu koleksi; None bila koleksi belum ada."""
    try:
        res = await db.command("listIndexes", coll)
    except Exception:
        return None
    batch = (((res or {}).get("cursor") or {}).get("firstBatch")) or []
    return [dict(ix.get("key") or {}) for ix in batch]


async def _intg_backup_info():
    """(hari sejak backup terakhir, nama file) dari folder backups/ proyek (/host-project)."""
    newest, name = None, ""
    for base in ("/host-project", os.environ.get("HOST_PROJECT_DIR", "")):
        if not base:
            continue
        folder = os.path.join(base, "backups")
        try:
            files = [f for f in os.listdir(folder) if f.endswith((".gz", ".zip", ".dump"))]
        except Exception:
            continue
        for f in files:
            try:
                mt = os.path.getmtime(os.path.join(folder, f))
            except Exception:
                continue
            if newest is None or mt > newest:
                newest, name = mt, f
        if newest is not None:
            break
    if newest is None:
        return None, ""
    return round((time.time() - newest) / 86400.0, 1), name


async def _intg_load():
    """Muat semua data yang dibutuhkan pemeriksaan sekali jalan (proyeksi minimal)."""
    return {
        "products": await db.products.find({}, {"_id": 0, "id": 1, "name": 1, "category_id": 1, "vendor_id": 1,
                                                "type": 1, "track_stock": 1, "stock": 1, "sku": 1,
                                                "cost": 1, "price": 1, "active": 1}).to_list(_INTG_CAP),
        "categories": await db.categories.find({}, {"_id": 0, "id": 1, "name": 1, "type": 1}).to_list(5000),
        "vendors": await db.vendors.find({}, {"_id": 0, "id": 1, "name": 1}).to_list(3000),
        "tables": await db.tables.find({}, {"_id": 0, "id": 1, "name": 1}).to_list(3000),
        "shifts": await db.shifts.find({}, {"_id": 0, "id": 1, "status": 1, "opened_at": 1,
                                            "closed_at": 1, "cashier_id": 1}).to_list(10000),
        "recipes": await db.recipes.find({}, {"_id": 0, "id": 1, "product_id": 1, "name": 1,
                                              "ingredients": 1}).to_list(5000),
        "ingredients": await db.ingredients.find({}, {"_id": 0, "id": 1, "name": 1, "unit": 1,
                                                      "stock": 1, "cost": 1, "active": 1,
                                                      "categories": 1}).to_list(5000),
        "ing_cats": await db.ingredient_categories.find({}, {"_id": 0, "id": 1, "name": 1}).to_list(1000),
        "users": await db.users.find({}, {"_id": 0, "id": 1, "username": 1, "name": 1, "email": 1,
                                          "role": 1, "active": 1, "password_hash": 1,
                                          "ingredient_categories": 1}).to_list(3000),
        "methods": await db.payment_methods.find({}, {"_id": 0, "id": 1, "name": 1, "active": 1,
                                                      "type": 1}).to_list(200),
        "orders": await db.orders.find({}, {"_id": 0, "id": 1, "order_number": 1, "order_type": 1,
                                            "table_id": 1, "shift_id": 1, "status": 1, "items": 1,
                                            "subtotal": 1, "discount": 1, "promo_discount": 1,
                                            "coupon_discount": 1, "redeem_discount": 1, "service_tax": 1,
                                            "total": 1, "payment_method_name": 1, "payment_method_id": 1,
                                            "payment_splits": 1, "created_at": 1, "paid_at": 1}
                                ).sort("created_at", -1).to_list(_INTG_CAP),
        "cash": await db.cash_movements.find({}, {"_id": 0, "id": 1, "shift_id": 1, "type": 1,
                                                  "amount": 1, "scope": 1, "created_at": 1}
                                              ).sort("created_at", -1).to_list(_INTG_CAP),
        "reservations": await db.reservations.find({}, {"_id": 0, "id": 1, "table_id": 1, "date": 1,
                                                        "name": 1, "status": 1}).to_list(5000),
    }


async def _run_integrity_check():
    """Jalankan seluruh pemeriksaan (read-only) & simpan hasilnya sebagai laporan terakhir."""
    t0 = time.time()
    d = await _intg_load()
    prod_by_id = {p.get("id"): p for p in d["products"]}
    prod_ids = set(prod_by_id)
    cat_ids = {c.get("id") for c in d["categories"]}
    ven_ids = {v.get("id") for v in d["vendors"]}
    tab_ids = {t.get("id") for t in d["tables"]}
    shift_ids = {s.get("id") for s in d["shifts"]}
    orders = d["orders"]
    paid = [o for o in orders if o.get("status") == "paid"]

    # ---------------------------------------------------------- A. Referensi & relasi
    ref = []
    bad_cat = [p for p in d["products"] if p.get("category_id") and p["category_id"] not in cat_ids]
    ref.append(_intg_chk(
        "ref_product_category", "Produk menunjuk kategori yang sudah hilang", len(bad_cat),
        "Produk begini tidak muncul di katalog POS. Perbaikan: dikosongkan (atau dipindahkan ke kategori pilihan Anda).",
        [p.get("name") for p in bad_cat], fix="fix_product_category",
        fix_label="Kosongkan / pindahkan kategori"))

    bad_ven = [p for p in d["products"] if p.get("vendor_id") and p["vendor_id"] not in ven_ids]
    ref.append(_intg_chk(
        "ref_product_vendor", "Produk menunjuk vendor yang sudah hilang", len(bad_ven),
        "Bagi hasil vendor untuk produk ini tidak bisa dihitung. Perbaikan: lepas penunjuk vendor.",
        [p.get("name") for p in bad_ven], fix="fix_product_vendor", fix_label="Lepas vendor hilang"))

    broken_items = {}
    for o in orders:
        for it in (o.get("items") or []):
            pid = it.get("product_id")
            if pid and pid not in prod_ids:
                e = broken_items.setdefault(pid, {"qty": 0, "rows": 0, "name": it.get("name") or pid})
                e["qty"] += it.get("qty") or 0
                e["rows"] += 1
    ref.append(_intg_chk(
        "ref_order_product", "Item transaksi menunjuk produk yang sudah hilang", len(broken_items),
        "Laporan laba produk ini tidak akurat. Biasanya muncul setelah restore backup parsial.",
        [f"{v['name']} ({v['rows']} baris, {v['qty']:g} unit)" for v in list(broken_items.values())[:5]]))

    bad_tab = [o for o in orders if o.get("order_type") == "dine_in" and o.get("table_id")
               and o["table_id"] not in tab_ids]
    ref.append(_intg_chk(
        "ref_order_table", "Transaksi dine-in menunjuk meja yang sudah dihapus", len(bad_tab),
        "Riwayat & laporan tetap benar; hanya peta meja yang tidak bisa dilacak. Periksa di Transaksi.",
        [o.get("order_number") for o in bad_tab]))

    bad_shift = [o for o in orders if o.get("shift_id") and o["shift_id"] not in shift_ids]
    ref.append(_intg_chk(
        "ref_order_shift", "Transaksi menunjuk shift yang sudah hilang", len(bad_shift),
        "Transaksi ini tidak ikut hitungan laporan shift (tetap masuk laporan harian).",
        [o.get("order_number") for o in bad_shift]))

    bad_cash = [m for m in d["cash"] if m.get("shift_id") and m["shift_id"] not in shift_ids]
    ref.append(_intg_chk(
        "ref_cash_shift", "Catatan kas menunjuk shift yang sudah hilang", len(bad_cash),
        "Pengeluaran ini tidak ikut hitungan shift. Perbaikan: lepas penunjuk shift (tetap masuk laporan harian).",
        [m.get("id") for m in bad_cash], fix="fix_cash_shift", fix_label="Lepas penunjuk shift"))

    bad_res = [r for r in d["reservations"] if r.get("table_id") and r["table_id"] not in tab_ids
               and str(r.get("status") or "") not in ("cancelled", "done")]
    ref.append(_intg_chk(
        "ref_reservation_table", "Reservasi menunjuk meja yang sudah dihapus", len(bad_res),
        "Reservasi tanpa meja tidak bisa dipakai. Perbaikan: dibatalkan.",
        [f"{r.get('name') or '-'} ({r.get('date') or '-'})" for r in bad_res],
        fix="fix_reservation_table", fix_label="Batalkan reservasi yatim"))

    bad_rec = []
    for r in d["recipes"]:
        if r.get("product_id") and r["product_id"] not in prod_ids:
            bad_rec.append(r.get("name") or r.get("product_id"))
            continue
        for b in (r.get("ingredients") or []):
            if b.get("product_id") and b["product_id"] not in prod_ids:
                bad_rec.append(f"{r.get('name') or r.get('product_id')} -> bahan hilang")
    ref.append(_intg_chk(
        "ref_recipe", "Resep menunjuk produk/bahan yang sudah hilang", len(bad_rec),
        "HPP otomatis tidak akurat. Perbaikan: resep/bahan yatim dihapus (resep produk hilang tidak bisa dipakai).",
        bad_rec[:5], fix="fix_recipe_orphan", fix_label="Bersihkan resep yatim"))

    # Kategori bahan: bahan/akun menunjuk kategori yang sudah dihapus (izin opname jadi tidak jalan).
    ing_cat_ids = {c.get("id") for c in d.get("ing_cats") or []}
    bad_icat = []
    for ing in d["ingredients"]:
        dang = [c for c in (ing.get("categories") or []) if c not in ing_cat_ids]
        if dang:
            bad_icat.append(f"bahan {ing.get('name')} ({len(dang)} kategori hilang)")
    for u in d["users"]:
        dang = [c for c in (u.get("ingredient_categories") or []) if c not in ing_cat_ids]
        if dang:
            bad_icat.append(f"akun @{u.get('username') or u.get('id')} ({len(dang)} kategori hilang)")
    ref.append(_intg_chk(
        "ref_ingredient_category", "Bahan/akun menunjuk kategori bahan yang sudah dihapus", len(bad_icat),
        "Izin isi stok opname bahan per akun bisa ikut macet. Perbaikan: penunjuk kategori yatim dilepas.",
        bad_icat[:5], fix="fix_ingredient_category", fix_label="Lepas kategori bahan yatim"))
    groups = [{"key": "ref", "label": "Referensi & Relasi", "checks": ref}]

    # ---------------------------------------------------------- B. Angka & transaksi
    num = []
    mism = []
    for o in paid:
        exp = _intg_expected_total(o)
        if abs(exp - round(float(o.get("total") or 0), 2)) > 0.01:
            mism.append(f"{o.get('order_number')}: tersimpan Rp{float(o.get('total') or 0):,.0f} vs seharusnya Rp{exp:,.0f}")
    num.append(_intg_chk(
        "num_total_mismatch", "Total transaksi lunas tidak sama dengan rinciannya", len(mism),
        "Penjualan/laba jadi salah hitung. Perbaikan: total dihitung ulang dari subtotal, diskon, dan pajak tersimpan.",
        mism, level="error", fix="fix_order_totals", fix_label="Hitung ulang total"))

    no_items = [o for o in paid if not (o.get("items") or [])]
    num.append(_intg_chk(
        "num_paid_no_items", "Transaksi lunas tanpa satu pun item", len(no_items),
        "Menggelembungkan jumlah transaksi & rata-rata per order. Periksa di Transaksi lalu void bila memang salah.",
        [f"{o.get('order_number')} (Rp{float(o.get('total') or 0):,.0f})" for o in no_items], level="error"))

    no_pay = [o for o in paid if not o.get("payment_method_name") and not o.get("payment_splits")]
    num.append(_intg_chk(
        "num_paid_no_method", "Transaksi lunas tanpa metode pembayaran", len(no_pay),
        "Transaksi ini tidak masuk rekap metode bayar maupun kas tunai.",
        [o.get("order_number") for o in no_pay]))

    seen, dup_num = {}, []
    for o in orders:
        n = o.get("order_number")
        if not n:
            continue
        seen[n] = seen.get(n, 0) + 1
    dup_num = [f"{n} ({c}x)" for n, c in seen.items() if c > 1]
    num.append(_intg_chk(
        "num_dup_order_number", "Nomor transaksi ganda", len(dup_num),
        "Nomor ganda membuat indeks unik gagal dipasang & struk sulit dilacak. Perbaikan: nomor berikutnya diberi akhiran.",
        dup_num, level="error", fix="fix_order_numbers", fix_label="Beri akhiran nomor ganda"))

    bad_items = []
    for o in orders:
        for it in (o.get("items") or []):
            qty = it.get("qty") or 0
            price = it.get("price")
            if price is None:
                price = it.get("base_price") or 0
            if qty <= 0 or price < 0 or (it.get("weight") is not None and (it.get("weight") or 0) <= 0):
                bad_items.append(f"{o.get('order_number')}: {it.get('name')} (qty {qty:g}, harga {price:g})")
    num.append(_intg_chk(
        "num_item_bad", "Baris item dengan jumlah/harga tidak wajar", len(bad_items),
        "Qty <= 0 atau harga negatif/berat nol. Laporan tetap menghitungnya, jadi angkanya bisa aneh.",
        bad_items))

    stale = [o for o in orders if o.get("status") == "open" and (_intg_age_days(o.get("created_at")) or 0) > 1]
    num.append(_intg_chk(
        "num_open_stale", "Bill terbuka menggantung lebih dari 24 jam", len(stale),
        "Meja bisa tampak terisi & daftar bill menumpuk. Perbaikan: di-void (tanpa pembayaran, stok tidak berubah).",
        [f"{o.get('order_number')} ({str(o.get('created_at'))[:16]})" for o in stale],
        fix="fix_stale_bills", fix_label="Void bill menggantung"))

    bad_cash_num = [m for m in d["cash"] if (m.get("amount") or 0) <= 0 or m.get("type") not in ("in", "out")]
    num.append(_intg_chk(
        "num_cash_bad", "Catatan kas dengan nominal/tipe tidak wajar", len(bad_cash_num),
        "Nominal <= 0 atau tipe bukan masuk/keluar — tidak dihitung di rekap kas.",
        [f"{m.get('id')} ({m.get('type')}, {m.get('amount')})" for m in bad_cash_num]))
    groups.append({"key": "num", "label": "Angka & Transaksi", "checks": num})

    # ---------------------------------------------------------- C. Stok & HPP
    stk = []
    neg_p = [p for p in d["products"] if p.get("track_stock") and (p.get("stock") or 0) < 0]
    stk.append(_intg_chk(
        "stk_product_negative", "Produk dengan stok negatif", len(neg_p),
        "Biasanya karena penjualan retail saat stok belum diisi. Perbaikan: stok negatif dinolkan (lalu opname ulang bila perlu).",
        [f"{p.get('name')}: {p.get('stock')}" for p in neg_p], fix="fix_stock_negative", fix_label="Nolkan stok negatif"))

    neg_i = [i for i in d["ingredients"] if (i.get("stock") or 0) < 0]
    stk.append(_intg_chk(
        "stk_ingredient_negative", "Bahan baku dengan stok negatif", len(neg_i),
        "Pemakaian bahan melebihi catatan pembelian. Perbaikan: stok negatif dinolkan (lalu opname ulang bila perlu).",
        [f"{i.get('name')}: {i.get('stock')} {i.get('unit') or ''}" for i in neg_i],
        fix="fix_stock_negative", fix_label="Nolkan stok negatif"))

    p_cost = {p.get("id"): (p.get("cost") or p.get("price") or 0) for p in d["products"]}
    i_cost = {i.get("id"): (i.get("cost") or 0) for i in d["ingredients"]}
    zero_hpp = []
    for r in d["recipes"]:
        ings = r.get("ingredients") or []
        if not ings:
            continue
        tot = 0.0
        for b in ings:
            q = float(b.get("qty") or 0)
            if b.get("ingredient_id"):
                tot += (i_cost.get(b["ingredient_id"]) or 0) * q
            elif b.get("product_id"):
                tot += (p_cost.get(b["product_id"]) or 0) * q
        if tot <= 0:
            nm = r.get("name") or (prod_by_id.get(r.get("product_id")) or {}).get("name") or r.get("product_id")
            zero_hpp.append(nm)
    stk.append(_intg_chk(
        "stk_recipe_zero_cost", "Resep dengan HPP 0 (harga bahan belum diisi)", len(zero_hpp),
        "Laba kotor produk ini dihitung 100%. Isi harga beli bahan / harga pokok produk.",
        zero_hpp))
    groups.append({"key": "stok", "label": "Stok & HPP", "checks": stk})

    # ---------------------------------------------------------- D. Akun & akses
    sysg = []
    supers = [u for u in d["users"] if _is_super(u)]
    sysg.append(_intg_chk(
        "sys_no_superadmin", "Tidak ada akun Super Admin", 0 if supers else 1,
        "Tanpa Super Admin, Roles & Izin & pembuatan akun admin tidak bisa dikelola. Angkat satu akun jadi Super Admin.",
        [], level="error"))

    rbac_roles = set((await _rbac_doc()).keys())
    valid_roles = set(BUILTIN_ROLES) | rbac_roles
    bad_role = [u for u in d["users"] if u.get("active") is not False and str(u.get("role")) not in valid_roles]
    sysg.append(_intg_chk(
        "sys_user_bad_role", "Akun aktif dengan role yang tidak dikenal", len(bad_role),
        "Role ini tidak ada di daftar role (bawaan/kustom) sehingga akun praktis tanpa akses. Ganti role-nya di Pengguna.",
        [f"{u.get('username') or u.get('email')} ({u.get('role')})" for u in bad_role], level="error"))

    bad_pw = [u for u in d["users"] if u.get("active") is not False and not str(u.get("password_hash") or "").startswith("$2")]
    sysg.append(_intg_chk(
        "sys_user_no_password", "Akun aktif tanpa password yang valid", len(bad_pw),
        "Akun ini tidak akan pernah bisa login. Reset password-nya di Pengguna (atau lewat CLI).",
        [u.get("username") or u.get("email") for u in bad_pw], level="error"))

    act_methods = [m for m in d["methods"] if m.get("active") is not False]
    sysg.append(_intg_chk(
        "sys_no_active_method", "Tidak ada metode pembayaran aktif", 0 if act_methods else 1,
        "POS tidak bisa menyelesaikan pembayaran. Aktifkan minimal satu metode (mis. Cash).",
        [], level="error"))
    groups.append({"key": "akun", "label": "Akun & Akses", "checks": sysg})

    # ---------------------------------------------------------- E. Database & operasional
    sysc = []
    missing_idx = []
    for coll, reqs in INTG_REQUIRED_INDEXES.items():
        idx = await _intg_list_indexes(coll)
        if idx is None:
            continue  # koleksi belum ada (mis. bahan belum dipakai) — bukan masalah
        have = {frozenset(k.keys()) for k in idx}
        for r in reqs:
            if frozenset(r) not in have:
                missing_idx.append(f"{coll}: ({', '.join(r)})")
    sysc.append(_intg_chk(
        "db_index_missing", "Indeks database belum terpasang", len(missing_idx),
        "Laporan & pencarian jadi lambat (data tetap benar). Perbaikan: indeks dipasang ulang sekarang.",
        missing_idx, fix="fix_indexes", fix_label="Pasang ulang indeks"))

    # Shift harian bersama: idealnya MAKSIMAL satu shift terbuka per toko (F&B/Retail).
    # Kalau ada dua, transaksi bisa tersebar ke dua shift → laporan shift tidak lengkap.
    open_by_scope = {}
    for s in d["shifts"]:
        if s.get("status") != "open":
            continue
        open_by_scope.setdefault(_shift_scope_of(s), []).append(s)
    dup_open = [f"{_shift_scope_label(sc)}: {len(v)} shift terbuka ({', '.join(x.get('id', '?') for x in v)})"
                for sc, v in open_by_scope.items() if len(v) > 1]
    sysc.append(_intg_chk(
        "shift_open_duplicate", "Ada lebih dari satu shift terbuka untuk toko yang sama", len(dup_open),
        "Shift harian seharusnya hanya satu per toko (dipakai bersama semua akun). Bila ini sisa percobaan "
        "buka shift, tutup shift yang tidak dipakai dari halaman Shift (jangan dihapus — laporan tetap tercatat). "
        "Tidak ada perbaikan otomatis karena menyangkut uang.",
        dup_open, level="warn"))

    idx_warn = list(_IDX_WARN)
    # Dipisah menurut SEBABNYA — dulu semuanya disebut "data ganda", padahal kasus paling
    # umum di lapangan adalah indeks sudah ada dengan opsi berbeda (kode 85, mis. indeks
    # lama dibuat tanpa unique/sparse). Salah label membuat pemilik mengira datanya kembar.
    dup = [w for w in idx_warn if w.get("kind") == "duplicate"]
    opt = [w for w in idx_warn if w.get("kind") == "options"]
    oth = [w for w in idx_warn if w.get("kind") not in ("duplicate", "options")]

    sysc.append(_intg_chk(
        "db_index_options", "Indeks ada tapi opsinya berbeda (belum unik/sparse)", len(opt),
        "Bukan data kembar: indeks bernama sama sudah ada dari versi lama dengan opsi berbeda, "
        "sehingga indeks yang baru (unik) tidak bisa dipasang. Akibatnya perlindungan dari data kembar "
        "belum aktif (mis. order ganda saat sinkronisasi offline, atau dua akun ber-email sama). "
        "Perbaikan: indeks lama dihapus lalu dibuat ulang sesuai kebutuhan.",
        [f"{w.get('coll')}.{w.get('name') or _intg_index_name(w.get('raw'))}" for w in opt],
        fix="fix_indexes", fix_label="Tulis ulang indeks"))

    sysc.append(_intg_chk(
        "db_unique_failed", "Indeks unik gagal dipasang karena data kembar", len(dup),
        "Ada nilai kembar (mis. nomor transaksi / kode kupon / email sama). Rapikan datanya lebih dulu, "
        "lalu pasang ulang indeks.",
        [f"{w.get('coll')}: {w.get('keys')} - {w.get('error')}" for w in dup], level="error",
        fix="fix_indexes", fix_label="Coba pasang ulang indeks"))

    sysc.append(_intg_chk(
        "db_index_error", "Indeks gagal dipasang karena sebab lain", len(oth),
        "Penyebab di luar dua hal di atas — lihat contohnya, biasanya hak akses atau tipe data.",
        [f"{w.get('coll')}: {w.get('keys')} - {w.get('error')}" for w in oth]))

    age, bname = await _intg_backup_info()
    if age is None:
        b_cnt = 1
        b_note = ("Folder backups/ belum ada atau tidak terlihat dari container backend (mount /host-project). "
                  "Jalankan ./backup-pi.sh di Pi.")
        b_sample = []
    elif age > _INTG_BACKUP_MAX_DAYS:
        b_cnt = 1
        b_note = f"Backup terakhir {age} hari lalu (batas {_INTG_BACKUP_MAX_DAYS} hari)."
        b_sample = [bname]
    else:
        b_cnt = 0
        b_note = f"Backup terakhir {age} hari lalu."
        b_sample = [bname]
    sysc.append(_intg_chk(
        "ops_backup_stale", "Backup lokal sudah lama tidak dibuat", b_cnt,
        b_note + " Pasang backup otomatis: ./setup-autobackup-pi.sh", b_sample))
    groups.append({"key": "sistem", "label": "Database & Operasional", "checks": sysc})

    checks = [c for g in groups for c in g["checks"]]
    summary = {
        "total": len(checks),
        "error": sum(1 for c in checks if c["count"] and c["level"] == "error"),
        "warn": sum(1 for c in checks if c["count"] and c["level"] == "warn"),
        "ok": sum(1 for c in checks if not c["count"]),
        "fixable": sum(1 for c in checks if c["count"] and c["fix"]),
    }
    counts = {}
    for coll in ("orders", "products", "categories", "vendors", "tables", "shifts", "users",
                 "members", "ingredients", "cash_movements", "purchases", "stock_opname"):
        try:
            counts[coll] = await db[coll].count_documents({})
        except Exception:
            counts[coll] = None
    versi = ""
    for base in ("/host-project", os.environ.get("HOST_PROJECT_DIR", "")):
        if not base:
            continue
        try:
            with open(os.path.join(base, ".vibecoder-version")) as f:
                versi = f.read().strip()
            if versi:
                break
        except Exception:
            continue
    rep = {
        "at": now_utc().isoformat(),
        "duration_ms": int((time.time() - t0) * 1000),
        "orders_scanned": len(orders), "cap": _INTG_CAP,
        "summary": summary, "groups": groups,
        "info": {"versi_terpasang": versi, "jumlah_dokumen": counts,
                 "uptime_s": round(time.time() - _PROC_START, 1)},
    }
    await db.settings.update_one({"_id": "integrity"}, {"$set": {"last": rep}}, upsert=True)
    return rep


# ------------------------------------------------------------------ perbaikan aman
# Setiap handler: async (target: str) -> {"changed": int, "detail": str}
INTEGRITY_FIXES = {}


def _intg_fix(key, label):
    def deco(fn):
        INTEGRITY_FIXES[key] = {"key": key, "label": label, "fn": fn}
        return fn
    return deco


@_intg_fix("fix_product_category", "Kosongkan / pindahkan kategori produk")
async def _fix_product_category(target: str = ""):
    cat_ids = [c["id"] for c in await db.categories.find({}, {"_id": 0, "id": 1}).to_list(5000)]
    q = {"category_id": {"$nin": cat_ids + [None, ""]}}
    n = await db.products.count_documents(q)
    if not n:
        return {"changed": 0, "detail": "Tidak ada produk dengan kategori hilang."}
    if target:
        if target not in cat_ids:
            raise HTTPException(400, "Kategori tujuan tidak ditemukan")
        res = await db.products.update_many(q, {"$set": {"category_id": target}})
        detail = f"{res.modified_count} produk dipindahkan ke kategori pilihan."
    else:
        res = await db.products.update_many(q, {"$unset": {"category_id": ""}})
        detail = (f"{res.modified_count} produk dijadikan tanpa kategori — produk tetap aktif, "
                  "kategorinya bisa diatur lagi di Produk & Stok.")
    _cache_del("products:")
    return {"changed": res.modified_count, "detail": detail}


@_intg_fix("fix_product_vendor", "Lepas vendor yang sudah hilang")
async def _fix_product_vendor(target: str = ""):
    ids = [v["id"] for v in await db.vendors.find({}, {"_id": 0, "id": 1}).to_list(3000)]
    res = await db.products.update_many({"vendor_id": {"$nin": ids + [None, ""]}}, {"$unset": {"vendor_id": ""}})
    _cache_del("products:")
    return {"changed": res.modified_count,
            "detail": f"{res.modified_count} produk dilepas dari vendor yang sudah hilang (tidak lagi masuk bagi hasil)."}


@_intg_fix("fix_cash_shift", "Lepas penunjuk shift yang hilang")
async def _fix_cash_shift(target: str = ""):
    ids = [s["id"] for s in await db.shifts.find({}, {"_id": 0, "id": 1}).to_list(10000)]
    res = await db.cash_movements.update_many({"shift_id": {"$nin": ids + [None, ""]}}, {"$unset": {"shift_id": ""}})
    _bump_rs_gen()
    return {"changed": res.modified_count,
            "detail": f"{res.modified_count} catatan kas dilepas dari shift yang hilang (tetap ikut laporan harian)."}


@_intg_fix("fix_reservation_table", "Batalkan reservasi yang mejanya hilang")
async def _fix_reservation_table(target: str = ""):
    ids = [t["id"] for t in await db.tables.find({}, {"_id": 0, "id": 1}).to_list(3000)]
    q = {"table_id": {"$nin": ids + [None, ""]}, "status": {"$nin": ["cancelled", "done"]}}
    res = await db.reservations.update_many(q, {"$set": {
        "status": "cancelled", "cancel_note": "Dibatalkan otomatis: meja sudah dihapus (perbaikan integritas)",
        "cancelled_at": now_utc().isoformat()}})
    return {"changed": res.modified_count, "detail": f"{res.modified_count} reservasi dibatalkan (mejanya sudah tidak ada)."}


@_intg_fix("fix_recipe_orphan", "Bersihkan resep/bahan resep yang produknya hilang")
async def _fix_recipe_orphan(target: str = ""):
    prod_ids = [p["id"] for p in await db.products.find({}, {"_id": 0, "id": 1}).to_list(_INTG_CAP)]
    res = await db.recipes.delete_many({"product_id": {"$nin": prod_ids + [None, ""]}})
    changed = res.deleted_count
    lines = 0
    for r in await db.recipes.find({}, {"_id": 0, "id": 1, "ingredients": 1}).to_list(5000):
        ings = r.get("ingredients") or []
        keep = [b for b in ings if not (b.get("product_id") and b["product_id"] not in prod_ids)]
        if len(keep) != len(ings):
            await db.recipes.update_one({"id": r["id"]}, {"$set": {"ingredients": keep}})
            lines += len(ings) - len(keep)
    return {"changed": changed + lines,
            "detail": f"{changed} resep yatim dihapus, {lines} baris bahan yatim dibersihkan dari resep."}


@_intg_fix("fix_ingredient_category", "Lepas penunjuk kategori bahan yang sudah dihapus")
async def _fix_ingredient_category(target: str = ""):
    """Buang id kategori bahan yang tidak ada lagi dari master bahan & akun.
    (Kategori yang dihapus lewat Pengaturan → Bahan sudah dilepas otomatis; ini untuk
    sisa data lama/impor langsung ke database.)"""
    ids = [c["id"] for c in await db.ingredient_categories.find({}, {"_id": 0, "id": 1}).to_list(1000)]
    changed = 0
    for ing in await db.ingredients.find({}, {"_id": 0, "id": 1, "categories": 1}).to_list(5000):
        dang = [c for c in (ing.get("categories") or []) if c not in ids]
        if dang:
            res = await db.ingredients.update_one({"id": ing["id"]}, {"$pull": {"categories": {"$in": dang}}})
            changed += res.modified_count
    for u in await db.users.find({}, {"_id": 0, "id": 1, "ingredient_categories": 1}).to_list(3000):
        dang = [c for c in (u.get("ingredient_categories") or []) if c not in ids]
        if dang:
            res = await db.users.update_one({"id": u["id"]},
                                            {"$pull": {"ingredient_categories": {"$in": dang}}})
            changed += res.modified_count
    _cache_del("products:")
    return {"changed": changed,
            "detail": f"{changed} penunjuk kategori bahan yatim dilepas dari bahan & akun."}


@_intg_fix("fix_order_totals", "Hitung ulang total dari rincian tersimpan")
async def _fix_order_totals(target: str = ""):
    fixed = 0
    for o in await db.orders.find({"status": "paid"}, {"_id": 0, "id": 1, "order_number": 1, "subtotal": 1,
                                                       "discount": 1, "promo_discount": 1, "coupon_discount": 1,
                                                       "redeem_discount": 1, "service_tax": 1, "total": 1}
                                  ).to_list(_INTG_CAP):
        exp = _intg_expected_total(o)
        if abs(exp - round(float(o.get("total") or 0), 2)) > 0.01:
            await db.orders.update_one({"id": o["id"]}, {"$set": {"total": exp,
                                                                  "total_fixed_at": now_utc().isoformat(),
                                                                  "total_fixed_note": "Dihitung ulang oleh cek integritas"}})
            fixed += 1
    _bump_rs_gen()
    return {"changed": fixed, "detail": f"{fixed} transaksi totalnya dihitung ulang dari subtotal, diskon, dan pajak tersimpan."}


@_intg_fix("fix_order_numbers", "Beri akhiran pada nomor transaksi ganda")
async def _fix_order_numbers(target: str = ""):
    orders = await db.orders.find({}, {"_id": 0, "id": 1, "order_number": 1, "created_at": 1}
                                  ).sort("created_at", 1).to_list(_INTG_CAP)
    seen, fixed = {}, 0
    for o in orders:
        n = o.get("order_number")
        if not n:
            continue
        seen[n] = seen.get(n, 0) + 1
        if seen[n] > 1:
            new = f"{n}-{seen[n]}"
            while new in seen:
                seen[n] += 1
                new = f"{n}-{seen[n]}"
            await db.orders.update_one({"id": o["id"]}, {"$set": {"order_number": new}})
            seen[new] = 1
            fixed += 1
    return {"changed": fixed, "detail": f"{fixed} nomor ganda diberi akhiran (-2, -3, ...). Nomor tertua tetap dipakai."}


@_intg_fix("fix_stock_negative", "Nolkan stok negatif (produk & bahan)")
async def _fix_stock_negative(target: str = ""):
    res_p = await db.products.update_many({"track_stock": True, "stock": {"$lt": 0}}, {"$set": {"stock": 0}})
    res_i = await db.ingredients.update_many({"stock": {"$lt": 0}}, {"$set": {"stock": 0}})
    _cache_del("products:")
    return {"changed": res_p.modified_count + res_i.modified_count,
            "detail": (f"{res_p.modified_count} produk & {res_i.modified_count} bahan dinolkan. "
                       "Lakukan stok opname bila jumlah fisiknya berbeda.")}


@_intg_fix("fix_stale_bills", "Void bill terbuka yang menggantung (>24 jam)")
async def _fix_stale_bills(target: str = ""):
    cutoff = (now_utc() - timedelta(hours=24)).isoformat()
    rows = await db.orders.find({"status": "open", "created_at": {"$lt": cutoff}},
                                {"_id": 0, "id": 1, "order_number": 1}).to_list(5000)
    if not rows:
        return {"changed": 0, "detail": "Tidak ada bill terbuka yang menggantung."}
    ids = [r["id"] for r in rows]
    await db.orders.update_many({"id": {"$in": ids}},
                                {"$set": {"status": "void", "voided_at": now_utc().isoformat(),
                                          "voided_by": "cek integritas",
                                          "void_reason": "Void otomatis: bill terbuka lebih dari 24 jam"}})
    _bump_rs_gen()
    return {"changed": len(ids),
            "detail": (f"{len(ids)} bill terbuka di-void tanpa pembayaran (stok tidak berubah, meja kembali kosong): "
                       + ", ".join([str(r.get("order_number")) for r in rows[:5]])
                       + (" ..." if len(rows) > 5 else ""))}


@_intg_fix("fix_indexes", "Pasang ulang / tulis ulang indeks database")
async def _fix_indexes(target: str = ""):
    """Menuntaskan dua sebab kegagalan indeks:
      1) bentrokan OPSI — indeks lama bernama sama (mis. dibuat tanpa unique/sparse) dihapus,
         lalu dibuat ulang sesuai kebutuhan aplikasi;
      2) DATA KEMBAR — indeks unik tidak bisa dipasang; dipasang versi TANPA unik supaya
         query tetap cepat, dan datanya dilaporkan agar dirapikan manual.
    """
    conflicts = [w for w in _IDX_WARN if w.get("kind") == "options"]
    dropped, drop_failed = 0, 0
    for w in conflicts:
        name = w.get("name") or _intg_index_name(w.get("raw") or w.get("keys"))
        try:
            await db[w["coll"]].drop_index(name)
            dropped += 1
            logger.info(f"indeks {w['coll']}.{name} dihapus agar bisa dibuat ulang sesuai kebutuhan")
        except Exception as e:
            drop_failed += 1
            logger.warning(f"gagal menghapus indeks {w['coll']}.{name}: {e}")

    await _ensure_indexes()

    # Bila pembuatan indeks UNIK masih gagal (data kembar), pasang versi tanpa unik
    # supaya pencarian/laporan tetap cepat. Data kembarnya tetap dilaporkan.
    fallback = 0
    for w in list(_IDX_WARN):
        if w.get("kind") != "duplicate":
            continue
        try:
            await db[w["coll"]].create_index(w.get("raw") or w.get("keys"))
            fallback += 1
        except Exception as e:
            logger.warning(f"indeks cadangan {w['coll']} {w.get('keys')} juga gagal: {e}")

    sisa = list(_IDX_WARN)
    if sisa:
        kinds = {}
        for w in sisa:
            kinds[w.get("kind")] = kinds.get(w.get("kind"), 0) + 1
        detail = (f"{dropped} indeks lama ditulis ulang; masih ada {len(sisa)} masalah "
                  f"({', '.join(f'{k}: {v}' for k, v in kinds.items())}). "
                  + ("Data kembar perlu dirapikan manual" if kinds.get("duplicate") else "Lihat contohnya di halaman ini")
                  + (f". {drop_failed} indeks gagal dihapus." if drop_failed else "."))
    else:
        detail = (f"Indeks beres: {dropped} indeks lama ditulis ulang, tidak ada yang gagal lagi."
                  if dropped else "Indeks dipasang ulang — tidak ada yang gagal.")
    return {"changed": dropped or fallback or 1, "detail": detail}


async def _notify_integrity(rep):
    """Kirim ringkasan WA hanya bila ditemukan masalah & WA aktif (jadwal mingguan)."""
    if not await _feat("wa.enabled"):
        return
    s = rep.get("summary") or {}
    if not (s.get("error") or s.get("warn")):
        return
    doc = await db.settings.find_one({"_id": "report"}) or {}
    recips = doc.get("recipients") or []
    if not recips or not await _wa_configured():
        return
    lines = [f"Cek integritas data otomatis - {str(rep.get('at'))[:16].replace('T', ' ')} UTC",
             f"{s.get('error', 0)} masalah berat, {s.get('warn', 0)} peringatan (durasi {rep.get('duration_ms')} ms)."]
    for g in (rep.get("groups") or []):
        for c in (g.get("checks") or []):
            if c.get("count") and c.get("level") in ("error", "warn"):
                lines.append(f"{'!' if c['level'] == 'error' else '~'} {c['name']}: {c['count']}")
        if len(lines) >= 16:
            break
    lines.append("Buka aplikasi > Pengaturan > Fitur & Integrasi > Integritas untuk memperbaiki.")
    await _send_whatsapp(recips, "\n".join(lines))


async def _maybe_integrity_auto():
    """Jadwal mingguan (default Minggu 03:00) bila flag maint.integrity_auto ON."""
    if not await _feat("maint.integrity_auto"):
        return
    noww = datetime.now(WIB)
    today = noww.strftime("%Y-%m-%d")
    hour = await _feat_int("maint.integrity_hour", 3)
    day = await _feat_int("maint.integrity_day", 6)
    if noww.weekday() != (day % 7) or noww.hour != hour:
        return
    # Klaim atomik SEBELUM memeriksa (pemeriksaan ini membaca ribuan dokumen; tidak boleh
    # dijalankan serentak oleh beberapa proses worker). Penanda hari (WIB) sekaligus
    # menjaga zona waktu UTC/WIB tidak membuat pemeriksaan jalan dua kali.
    if not await _claim_once("integrity", "auto_date", today, stale_seconds=3600):
        return
    try:
        rep = await _run_integrity_check()
    except Exception as e:
        logger.error(f"cek integritas otomatis gagal: {e}")
        await _release_claim("integrity", "auto_date")
        return
    s = rep.get("summary") or {}
    logger.info(f"cek integritas otomatis: error={s.get('error')} warn={s.get('warn')} durasi={rep.get('duration_ms')}ms")
    try:
        await _notify_integrity(rep)
    except Exception as e:
        logger.error(f"kirim ringkasan integritas ke WA gagal: {e}")


class IntegrityFixIn(BaseModel):
    key: str
    target: str = ""


class CronIntegrityIn(BaseModel):
    notify: str = ""


@api.get("/admin/integrity")
async def integrity_status(admin: dict = Depends(require_admin)):
    """Hasil cek integritas terakhir + jadwal mingguan + daftar perbaikan yang tersedia."""
    doc = await db.settings.find_one({"_id": "integrity"}, {"_id": 0}) or {}
    hour = await _feat_int("maint.integrity_hour", 3)
    day = await _feat_int("maint.integrity_day", 6)
    nama = ["Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu", "Minggu"]
    return {"last": doc.get("last"), "auto": bool(await _feat("maint.integrity_auto")),
            "schedule": f"{nama[day % 7]} {hour:02d}:00 WIB",
            "fixes": [{"key": k, "label": v["label"]} for k, v in INTEGRITY_FIXES.items()]}


@api.post("/admin/integrity/check")
async def integrity_check(admin: dict = Depends(require_admin)):
    """Jalankan pemeriksaan integritas sekarang (read-only) — bisa makan beberapa detik."""
    return await _run_integrity_check()


@api.post("/admin/integrity/fix")
async def integrity_do_fix(body: IntegrityFixIn, admin: dict = Depends(require_admin)):
    """Terapkan satu perbaikan aman, lalu kembalikan hasilnya (UI memuat ulang pemeriksaan)."""
    item = INTEGRITY_FIXES.get((body.key or "").strip())
    if not item:
        raise HTTPException(400, "Perbaikan tidak dikenal")
    res = await item["fn"]((body.target or "").strip())
    logger.info(f"integritas: perbaikan {body.key} oleh {admin.get('name')} -> {res.get('detail')}")
    return {"ok": True, "key": body.key, "label": item["label"], **res}


@api.post("/cron/integrity")
async def cron_integrity(request: Request, body: Optional[CronIntegrityIn] = None):
    """Dipakai skrip di Pi (check-integrity-pi.sh) dengan WEBHOOK_CRON_SECRET."""
    import hmac as _hmac
    auth = request.headers.get("Authorization", "")
    token = auth[7:] if auth.startswith("Bearer ") else ""
    if not (WEBHOOK_CRON_SECRET and _hmac.compare_digest(token, WEBHOOK_CRON_SECRET)):
        raise HTTPException(401, "unauthorized")
    rep = await _run_integrity_check()
    to = ((body.notify if body else "") or "").strip()
    if to:
        try:
            s = rep.get("summary") or {}
            msg = (f"Cek integritas server: {s.get('error', 0)} masalah berat, {s.get('warn', 0)} peringatan, "
                   f"{s.get('ok', 0)} normal (durasi {rep.get('duration_ms')} ms).")
            await _send_whatsapp([to], msg)
            rep["notified"] = to
        except Exception as e:
            rep["notify_error"] = str(e)
    return rep


@api.get("/admin/metrics")
async def admin_metrics(admin: dict = Depends(require_admin)):
    """Statistik performa endpoint (dikumpulkan middleware bila dbg.metrics ON).

    Multi-worker: angka dijumlahkan dari SEMUA proses worker (heartbeat < 30 detik),
    bukan hanya proses yang melayani request ini. `cache_entries` tetap per worker
    karena cache memang in-memory per proses.
    """
    m = await _metrics_aggregate()
    total = m["total"] or 1
    return {
        "total": m["total"], "errors": m["errors"],
        "error_rate": round(m["errors"] / total * 100, 2) if m["total"] else 0,
        "avg_ms": round(m["total_ms"] / total, 1) if m["total"] else 0,
        "by_path": [{"path": k, "count": v["count"], "avg_ms": round(v["ms"] / v["count"], 1),
                     "errors": v["errors"]} for k, v in sorted(m["by_path"].items(), key=lambda x: -x[1]["count"])],
        "slow": list(m["slow"]),
        "breakers": _breaker_status(),
        "cache_entries": len(_CACHE) + len(_RCACHE),
        "uptime_s": round(__import__("time").time() - _PROC_START, 1),
        "workers": WORKERS,
        "nodes": m["nodes"],
        # Dipakai alat pemantau (check-workers-pi.sh) untuk tahu berapa lama harus menunggu
        # sebelum membandingkan angka: tiap worker menulis ringkasannya sebesar ini.
        "metrics_flush_s": METRICS_FLUSH_SECONDS,
        "node": _METRICS_NODE,
    }

# ------------------------------------------------------------------ indexes
async def _ensure_indexes():
    """Indeks MongoDB untuk kolom yang sering dipakai pencarian/query.

    create_index() idempotent: dipanggil tiap startup, tanpa efek bila indeks
    sudah ada. Indeks UNIK dibungkus try/except — bila data lama mengandung
    duplikat (mis. order_number, kode kupon), cukup diberi warning dan startup
    tetap lanjut; bersihkan duplikatnya lalu restart agar indeks terpasang.
    Catatan rancangan lengkap: docs/INDEKS-DATABASE.md di root repo."""
    _IDX_WARN.clear()

    async def _index_present(coll, keys, unique, sparse, partial):
        """True bila indeks dengan kunci & opsi yang diminta SUDAH ada.

        Dipakai saat multi-worker: beberapa proses menjalankan _ensure_indexes()
        hampir bersamaan, sehingga create_index bisa gagal (balapan membangun indeks
        yang sama). Kalau ternyata indeksnya sudah ada dengan opsi yang benar, itu
        bukan masalah dan TIDAK boleh dicatat sebagai temuan integritas.
        """
        try:
            info = await db[coll].index_information()
        except Exception:
            return False
        want = None
        for name, spec in info.items():
            k = spec.get("key") or []
            if list(k) == list(keys if not isinstance(keys, str) else [(keys, 1)]):
                want = spec
                break
        if want is None:
            return False
        if bool(want.get("unique")) != bool(unique):
            return False
        if unique and not partial:                     # sparse hanya relevan untuk indeks unik
            if bool(want.get("sparse")) != bool(sparse):
                return False
        return True

    async def _mk(coll, keys, unique=False, sparse=False, partial=None):
        import asyncio as _aio
        for attempt in (1, 2):
            try:
                kw = {"unique": unique, "sparse": sparse}
                if partial:
                    kw["partialFilterExpression"] = partial
                await db[coll].create_index(keys, **kw)
                return
            except Exception as e:
                msg = str(e)
                code = getattr(e, "code", None)
                if await _index_present(coll, keys, unique, sparse, partial):
                    return                       # dibuat oleh worker lain — beres
                if attempt == 1:
                    await _aio.sleep(0.6)        # beri kesempatan worker lain menyelesaikan
                    continue
                # Dibedakan: bentrokan OPSI (indeks lama bernama sama) vs DATA KEMBAR vs lainnya.
                if code == 85 or "already exists with different options" in msg:
                    kind = "options"
                elif code == 11000 or "E11000" in msg or "duplicate key" in msg.lower():
                    kind = "duplicate"
                else:
                    kind = "other"
                logger.warning(f"index {coll} {keys} not applied ({kind}): {msg[:200]}")
                # Dicatat agar muncul di cek integritas (Pengaturan > Fitur & Integrasi > Integritas)
                _IDX_WARN.append({"coll": coll, "keys": str(keys), "raw": keys, "kind": kind,
                                  "name": _intg_index_name(keys), "unique": unique, "sparse": sparse,
                                  "partial": bool(partial), "error": msg[:180], "at": now_utc().isoformat()})
                del _IDX_WARN[:-20]
                return

    # ---- orders (koleksi terbesar & terpanas) --------------------------------
    # Setiap muat dashboard/laporan menscan order lunas per rentang tanggal
    # (report_summary, /reports/range, /reports/period, _vendor_report,
    # /reports/profit, rekomendasi stok) → (status, created_at) wajib ada.
    await _mk("orders", "order_number", unique=True)              # 1 order = 1 nomor
    # PENTING: jangan pakai "unique + sparse" untuk kolom yang diisi null/"" oleh aplikasi.
    # Sparse hanya melewati field yang TIDAK ADA, sedangkan null & "" tetap diindeks →
    # begitu ada dua dokumen bernilai null/"" pembuatan indeks unik GAGAL (E11000).
    # create_order menyimpan client_ref: None dan POST /users menyimpan email: "" —
    # jadi keduanya memakai indeks PARSIAL yang hanya mencakup nilai bermakna.
    _IDX_MEANINGFUL = {"$type": "string", "$gt": ""}   # string, bukan kosong
    await _mk("orders", "client_ref", unique=True, partial={"client_ref": _IDX_MEANINGFUL})   # idempotensi sync offline
    await _mk("orders", "payment_ref", unique=True, sparse=True)  # idempotensi pembayaran (retry)
    await _mk("orders", "id", unique=True)                        # get/pay/void/split/merge per id
    await _mk("orders", [("status", 1), ("created_at", -1)])      # laporan: status paid + rentang tanggal
    await _mk("orders", [("order_type", 1), ("status", 1)])       # open bill dine-in (peta meja)
    await _mk("orders", [("table_id", 1), ("status", 1)])         # cek open bill / validasi meja
    await _mk("orders", [("shift_id", 1), ("status", 1)])         # laporan & preview shift
    await _mk("orders", [("created_at", -1)])                     # urutan default daftar order
    await _mk("orders", [("status", 1), ("voided_at", -1)])       # halaman Void & Refund (filter tanggal void)
    await _mk("audit_logs", [("at", -1)])                         # riwayat audit terbaru
    await _mk("audit_logs", [("by_id", 1), ("at", -1)])           # void per kasir (pengawasan)
    await _mk("audit_logs", "order_id")                           # join audit <-> order (halaman void)

    # ---- products ------------------------------------------------------------
    # find_one({"id"}) dipanggil per BARIS item saat buat/ubah order & faktur.
    await _mk("products", "sku", unique=True)
    await _mk("products", "id", unique=True)
    await _mk("products", [("type", 1), ("active", 1)])           # daftar per tipe / aktif saja
    await _mk("products", "category_id")                          # cek pemakaian kategori

    # ---- master kecil yang dibaca per-id hampir di tiap transaksi -------------
    for c in ("users", "categories", "vendors", "tables", "payment_methods",
              "members", "promos", "coupons", "shifts", "reservations"):
        await _mk(c, "id", unique=True)
    await _mk("users", "username", unique=True)                   # login (akun tanpa email)
    await _mk("users", "email", unique=True, partial={"email": _IDX_MEANINGFUL})  # login legacy (APK lama)
    await _mk("members", "phone")                                 # lookup member saat bayar
    await _mk("coupons", "code", unique=True)                     # lookup kupon tiap pembayaran
    await _mk("recipes", "product_id", unique=True)               # 1 resep per produk (natural key)
    await _mk("custom_widgets", "id", unique=True)                # definisi widget kustom dashboard
    await _mk("custom_widget_entries", [("widget_id", 1), ("date", 1)])  # isian harian widget kustom
    # ---- bahan baku & daftar belanja ----------------------------------------
    await _mk("ingredients", "name", unique=True)                 # master bahan (1 nama = 1 bahan)
    await _mk("ingredients", "id", unique=True)
    await _mk("ingredients", "categories")                        # kategori bahan (izin opname per akun)
    await _mk("ingredient_categories", "id", unique=True)         # master kategori bahan
    await _mk("ingredient_categories", "name", unique=True)
    await _mk("ingredient_purchases", [("ingredient_id", 1), ("created_at", -1)])
    await _mk("ingredient_opname", [("ingredient_id", 1), ("created_at", -1)])
    await _mk("shopping_lists", "date", unique=True)              # 1 lembar belanja per tanggal

    # ---- shift: cari shift terbuka kasir dipanggil di hampir tiap aksi POS ----
    await _mk("shifts", [("cashier_id", 1), ("status", 1)])

    # ---- reservasi meja --------------------------------------------------------
    await _mk("reservations", [("date", 1), ("table_id", 1)])     # daftar harian + cek per meja

    # ---- log & inventori: daftar harian selalu filter rentang created_at -------
    await _mk("cash_movements", "created_at")                     # /cash & laporan harian
    await _mk("cash_movements", "shift_id")                       # laporan shift (pengeluaran)
    await _mk("vendor_settlements", "id", unique=True)             # buka/void/print per id
    await _mk("vendor_settlements", "settlement_no", unique=True)   # 1 nomor bukti = 1 pembayaran
    await _mk("vendor_settlements", [("vendor_id", 1), ("date", -1)])  # saldo & riwayat per vendor
    await _mk("vendor_settlements", [("date", -1)])                 # rekap harian & daftar riwayat
    await _mk("vendor_settlements", "shift_id")                     # laporan shift (settlement shift ini)
    await _mk("purchases", "created_at")                          # daftar & ringkasan belanja
    await _mk("stock_opname", "created_at")                       # daftar opname per tanggal

    # ---- shift harian bersama (satu shift per toko per hari: F&B & Retail) ----
    # Cari shift terbuka per toko dipanggil di hampir tiap aksi POS.
    await _mk("shifts", [("status", 1), ("scope", 1)])
    await _mk("shifts", "session_id")                             # kelompok F&B + Retail satu sesi
    await _mk("shifts", [("date", 1), ("scope", 1)])               # histori harian per toko
    # Kunci unik shift TERBUKA: dua perangkat tidak bisa membuka dua shift untuk toko yang
    # sama. `open_key` hanya ada saat status open (dilepas $unset saat tutup), dan karena
    # sparse hanya melewati field yang TIDAK ADA, indeksnya dibuat PARSIAL atas tipe string
    # supaya dokumen lama/tanpa kunci tidak saling dianggap duplikat.
    await _mk("shifts", "open_key", unique=True, partial={"open_key": {"$type": "string"}})
    await _mk("cash_movements", "session_id")                     # ringkasan kas per sesi shift

# ------------------------------------------------------------------ startup
async def _migrate_shift_scopes():
    """Migrasi shift TERBUKA dari model lama (per akun, satu dokumen gabungan F&B+Retail)
    ke model baru (satu shift per toko, dipakai bersama).

    Tanpa ini, shift yang sedang terbuka saat update akan "hilang" di mata POS (dianggap
    belum dibuka) dan kas keluar tidak nyambung ke laporan shift. Dokumen lama dianggap
    F&B (mayoritas transaksi); shift Retail dibuat otomatis saat ada transaksi retail
    (lihat _shift_for_order) atau saat dibuka manual.
    Shift lama yang sudah TERTUTUP tidak disentuh — laporannya sudah tersimpan apa adanya."""
    try:
        opens = await db.shifts.find({"status": "open"}, {"_id": 0}).to_list(50)
        if not opens:
            return
        seen = {}
        for s in opens:
            upd = {}
            if s.get("scope") not in SHIFT_SCOPES:
                upd["scope"] = "fnb"
            if not s.get("session_id"):
                upd["session_id"] = s.get("id") or new_id()
            if not s.get("date"):
                upd["date"] = wib_day_of(s.get("opened_at") or now_utc().isoformat())
            if not s.get("opened_by"):
                upd["opened_by"] = s.get("cashier_name") or ""
                upd["opened_by_id"] = s.get("cashier_id")
            sc = upd.get("scope") or s.get("scope")
            # Kalau sudah ada shift terbuka lain untuk toko yang sama, jangan pasang open_key
            # (indeks unik akan menolaknya) — yang duplikat ditutup manual lewat
            # Pengaturan → Integritas (temuan "shift terbuka ganda").
            if sc not in seen and not s.get("open_key"):
                upd["open_key"] = _shift_open_key(sc)
            seen.setdefault(sc, True)
            if upd:
                await db.shifts.update_one({"id": s["id"]}, {"$set": upd})
                logger.info(f"migrasi shift {s['id']} → scope={sc} (shift harian bersama)")
    except Exception as e:
        logger.warning(f"migrasi shift scope gagal: {e}")

@app.on_event("startup")
async def startup():
    import asyncio as _aio
    import random as _random
    if WORKERS > 1:
        # Semua worker start hampir bersamaan: beri jeda acak singkat supaya
        # migrasi/seed/pembuatan indeks tidak bertabrakan (create_index untuk indeks
        # yang sama bisa gagal bila dua proses membangunnya serentak).
        await _aio.sleep(_random.uniform(0, min(3.0, 0.6 * WORKERS)))
    logger.info(f"backend start: worker={os.getpid()} UVICORN_WORKERS={WORKERS} "
                f"mongo_pool={MONGO_POOL_SIZE}")
    await _ensure_indexes()
    await _migrate_shift_scopes()
    # ---- MIGRASI akun: email -> username (tanpa email) ----
    # Username diambil dari bagian depan email (mis. admin@grandaceh.com -> admin),
    # dijamin unik. Email tetap disimpan agar APK/bundle versi lama masih bisa login.
    try:
        taken = set()
        migrated = 0
        async for u in db.users.find({}, {"_id": 0, "id": 1, "username": 1, "email": 1}):
            if u.get("username"):
                taken.add(str(u["username"]).lower())
        async for u in db.users.find({}, {"_id": 0, "id": 1, "username": 1, "email": 1}):
            if u.get("username"):
                continue
            src = (u.get("email") or "").split("@")[0] or "user"
            uname = _slug_username(src, taken)
            taken.add(uname)
            await db.users.update_one({"id": u["id"]}, {"$set": {"username": uname}})
            migrated += 1
        if migrated:
            logger.info(f"migrasi username: {migrated} akun")
    except Exception as e:
        logger.warning(f"migrasi username gagal: {e}")

    # ---- MIGRASI: akun role Stok Opname wajib ganti password saat login pertama ----
    # (permintaan pemilik) — hanya akun yang belum punya penanda, jadi perubahan manual
    # di UI/PATCH tidak tertimpa tiap startup.
    try:
        r = await db.users.update_many({"role": "stok_opname", "must_change_password": {"$exists": False}},
                                       {"$set": {"must_change_password": True}})
        if r.modified_count:
            logger.info(f"wajib ganti password (login pertama): {r.modified_count} akun stok_opname")
    except Exception as e:
        logger.warning(f"migrasi wajib-ganti-password gagal: {e}")

    admin_email = os.environ["ADMIN_EMAIL"].lower()
    admin_username = _slug_username(admin_email.split("@")[0])
    admin_pw = os.environ["ADMIN_PASSWORD"]
    existing = await db.users.find_one({"$or": [{"email": admin_email}, {"username": admin_username}]})
    if not existing:
        await db.users.insert_one({"id": new_id(), "name": os.environ.get("ADMIN_NAME", "Admin"),
                                   "username": admin_username, "email": admin_email,
                                   "password_hash": hash_password(admin_pw),
                                   "role": "superadmin", "active": True, "created_at": now_utc().isoformat()})
    else:
        # Akun owner (ADMIN_EMAIL) SELALU dipastikan superadmin — pemilik tidak boleh
        # terkunci dari Pengaturan → Roles & Izin (mis. bila kolom role berubah/terhapus).
        if existing.get("role") != "superadmin":
            await db.users.update_one({"id": existing["id"]},
                                      {"$set": {"role": "superadmin",
                                                "username": existing.get("username") or admin_username}})
            logger.info(f"akun owner {admin_email} dipastikan superadmin (role sebelumnya: {existing.get('role')})")
        elif not existing.get("username"):
            await db.users.update_one({"id": existing["id"]}, {"$set": {"username": admin_username}})
        elif os.environ.get("ADMIN_FORCE_PASSWORD", "0") == "1" and not verify_password(admin_pw, existing["password_hash"]):
            # Ganti password admin TIDAK otomatis di-reset dari env tiap startup (agar ganti password
            # lewat UI bertahan). Set ADMIN_FORCE_PASSWORD=1 bila memang ingin memaksa sinkron dari env.
            await db.users.update_one({"id": existing["id"]}, {"$set": {"password_hash": hash_password(admin_pw)}})
    # seed a cashier
    if not await db.users.find_one({"email": "kasir@grandaceh.com"}):
        await db.users.insert_one({"id": new_id(), "name": "Kasir Satu", "email": "kasir@grandaceh.com",
                                   "password_hash": hash_password("kasir123"), "role": "kasir",
                                   "active": True, "created_at": now_utc().isoformat()})
    # seed payment methods
    if await db.payment_methods.count_documents({}) == 0:
        for n, t in [("Cash", "cash"), ("QRIS", "qris"), ("Kartu Debit/Kredit", "card")]:
            await db.payment_methods.insert_one({"id": new_id(), "name": n, "type": t, "active": True})
    logger.info("Startup seeding complete")

    # Scheduler internal untuk laporan WhatsApp harian (self-hosted; tanpa cron eksternal).
    # CATATAN multi-worker: ketiga tugas di bawah WAJIB memakai klaim atomik (_claim_once);
    # pola lama (baca penanda -> kerjakan -> tulis penanda) membuat SEMUA worker yang start
    # bersamaan mengerjakan tugas yang sama (mis. laporan WA terkirim berulang).
    import asyncio as _asyncio

    async def _report_scheduler():
        while True:
            try:
                await _run_daily_report_job()
            except Exception as e:
                logger.error(f"report scheduler tick failed: {e}")
            try:
                await _maybe_orphan_auto()
            except Exception as e:
                logger.error(f"orphan scheduler tick failed: {e}")
            try:
                await _maybe_integrity_auto()
            except Exception as e:
                logger.error(f"integrity scheduler tick failed: {e}")
            await _asyncio.sleep(600)  # cek tiap 10 menit
    _asyncio.create_task(_report_scheduler())
    if WORKERS > 1:
        async def _metrics_flush_loop():
            while True:
                await _asyncio.sleep(METRICS_FLUSH_SECONDS)
                await _metrics_flush()
        _asyncio.create_task(_metrics_flush_loop())

        async def _cache_sync_loop():
            while True:
                await _asyncio.sleep(CACHE_SYNC_SECONDS)
                await _cache_sync()
        _asyncio.create_task(_cache_sync_loop())

@app.on_event("shutdown")
async def shutdown():
    client.close()

app.include_router(api)
app.add_middleware(
    CORSMiddleware,
    allow_credentials=False,
    allow_origins=[o.strip() for o in os.environ.get('CORS_ORIGINS', '*').split(',') if o.strip()],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Private Network Access (PNA): Chrome/WebView memblokir panggilan cross-origin ke
# IP privat (LAN 192.168.x / tailnet 100.x) bila respons tidak menyertakan
# Access-Control-Allow-Private-Network: true. Middleware ini dipasang PALING LUAR
# (setelah CORSMiddleware) sehingga menambah header ke SEMUA respons, termasuk
# preflight OPTIONS yang ditangani CORSMiddleware.
from starlette.middleware.base import BaseHTTPMiddleware

class PrivateNetworkAccessMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        response = await call_next(request)
        try:
            response.headers["Access-Control-Allow-Private-Network"] = "true"
        except Exception:
            pass
        return response

app.add_middleware(PrivateNetworkAccessMiddleware)

# Kompres gzip utk respons JSON besar (katalog, laporan) — menghemat bandwidth APK/Internet.
from starlette.middleware.gzip import GZipMiddleware
app.add_middleware(GZipMiddleware, minimum_size=1024)

# Metrik performa endpoint & slow query log (lihat /api/admin/metrics).
# Dikumpulkan bila dbg.metrics ON; overhead ~0,1-0,5% per request.
class MetricsMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        import time as _t
        # OPTIONS = preflight CORS dari browser, bukan panggilan API — tidak dihitung
        # supaya statistik (jumlah/rata-rata/lambat) mencerminkan request bisnis.
        if (request.method or "").upper() == "OPTIONS":
            return await call_next(request)
        t0 = _t.time()
        try:
            response = await call_next(request)
        except Exception:
            try:
                if await _feat("dbg.metrics"):
                    _metric_record(request.method, request.url.path, (_t.time() - t0) * 1000, 500)
            except Exception:
                pass
            raise
        ms = (_t.time() - t0) * 1000
        try:
            if await _feat("dbg.metrics"):
                _metric_record(request.method, request.url.path, ms, response.status_code)
            await _record_slow_if_needed(request.method, request.url.path, ms)
        except Exception:
            pass
        return response

app.add_middleware(MetricsMiddleware)
