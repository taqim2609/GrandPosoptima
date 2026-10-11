"""Integrasi WhatsApp Grand POS <-> Hermes gateway (khusus server gudang-644).

Arah keluar (POS -> WA) memakai **webhook adapter Hermes** dengan
``deliver_only: true`` dan ``deliver: whatsapp`` — bukan endpoint kirim-pesan
bikinan sendiri, karena Hermes tidak menyediakan REST untuk outbound.
Adapter itu menerima POST ber-HMAC, me-render template, lalu meneruskan pesan
ke sesi WhatsApp Baileys milik gateway Hermes.

Arah masuk (WA -> POS) ditangani plugin hook ``pre_gateway_dispatch`` di sisi
Hermes, yang meneruskan pesan ke ``POST /api/webhook/whatsapp`` di sini dan
mengembalikan ``skip`` supaya agent tidak ikut membalas (nol token LLM).

Desain yang dikunci pemilik dan gate review:

* WhatsApp **hanya** hidup di server gudang-644. URL adapter wajib loopback
  (``127.0.0.1``/``localhost``); Pi tidak pernah memanggilnya.
* Bila ``HERMES_WA_WEBHOOK_URL`` kosong (kasus Pi), fitur WA tidak error keras:
  pesan yang gagal dikirim **disimpan** ke koleksi ``wa_outbox`` dengan kunci
  idempoten, lalu **644 sendiri** yang mengirim ulang satu kali setelah sinkron.
* Autentikasi memakai HMAC-SHA256 milik Hermes (header
  ``X-Webhook-Signature-V2`` + ``X-Webhook-Timestamp``), bukan shared-secret
  buatan sendiri.
* Log **tidak pernah** memuat token, nomor telepon, atau isi pesan.

Modul ini sengaja hanya bergantung pada pustaka standar saat di-import supaya
dapat diuji tanpa menjalankan server penuh; ``httpx`` di-import di dalam fungsi.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import logging
import os
import re
import time
from datetime import datetime, timedelta, timezone

logger = logging.getLogger("gak-pos")

# TZ WIB dipakai konsisten dengan server utama.
WIB = timezone(timedelta(hours=7))

# Endpoint kesehatan gateway Hermes (dipakai UI untuk status).
WA_HEALTH_PATH = "/health"

# Suffix JID WhatsApp untuk nomor perorangan.
WA_JID_SUFFIX = "@s.whatsapp.net"

LOCAL_HOSTS = {"127.0.0.1", "::1", "localhost"}

# Allowlist default bila HERMES_CMD_ALLOWLIST tidak diisi.
DEFAULT_CMD_ALLOWLIST = {
    "/stok": ("kasir", "admin", "superadmin"),
    "/laporan-shift": ("admin", "superadmin"),
    "/dashboard": ("admin", "superadmin"),
}


def wib_now() -> datetime:
    return datetime.now(WIB)


def _env_float(name: str, default: float) -> float:
    try:
        return float(os.environ.get(name) or default)
    except Exception:
        return default


def bridge_config() -> dict:
    """Konfigurasi webhook adapter Hermes dari environment (diisi di server 644).

    ``HERMES_WA_WEBHOOK_URL`` adalah URL lengkap route, mis.
    ``http://127.0.0.1:8644/webhooks/grandpos-outbox``.
    """
    return {
        "url": (os.environ.get("HERMES_WA_WEBHOOK_URL") or "").strip().rstrip("/"),
        "secret": (os.environ.get("HERMES_WA_WEBHOOK_SECRET") or "").strip(),
        "timeout": _env_float("HERMES_WA_TIMEOUT", 20.0),
        "enabled": (os.environ.get("HERMES_WA_ENABLED", "1") or "1").strip() not in ("0", "false", "False"),
    }


def node_role() -> str:
    """Peran node: "primary" (server gudang, pengirim WA) atau "backup" (Pi)."""
    return (os.environ.get("NODE_ROLE") or "backup").strip().lower()


def bridge_configured(cfg: dict | None = None) -> bool:
    """True hanya bila node ini memang boleh mengirim WhatsApp.

    Dua pagar:
      1. peran node harus primary — Pi (backup) tidak pernah mengirim WA;
      2. URL bridge harus localhost + secret terisi.
    Default peran adalah "backup", jadi node baru tidak akan mengirim WA
    sebelum dinyatakan primary secara eksplisit.
    """
    c = cfg or bridge_config()
    if node_role() not in ("primary", "master", "gudang", "644"):
        return False
    return bool(c.get("enabled") and c.get("url") and c.get("secret") and is_local_bridge_url(c["url"]))


def is_local_bridge_url(url: str) -> bool:
    """True hanya bila URL adapter menunjuk localhost.

    Pagar keamanan: adapter Hermes memegang akses kirim ke sesi WhatsApp.
    Bila URL-nya menunjuk host lain, konfigurasi dianggap salah dan pengiriman
    ditolak — jangan sampai backend diarahkan ke endpoint publik.
    """
    m = re.match(r"^https?://([^/:]+)", (url or "").strip())
    if not m:
        return False
    host = m.group(1).strip("[]").lower()
    return host in LOCAL_HOSTS


def command_allowlist() -> dict:
    """Peta perintah -> role yang boleh memakainya.

    Format env: ``/stok:kasir,admin;/laporan-shift:admin``
    """
    raw = (os.environ.get("HERMES_CMD_ALLOWLIST") or "").strip()
    if not raw:
        return {k: tuple(v) for k, v in DEFAULT_CMD_ALLOWLIST.items()}
    out: dict = {}
    for part in raw.split(";"):
        if ":" not in part:
            continue
        cmd, roles = part.split(":", 1)
        cmd = cmd.strip().lower()
        role_list = tuple(r.strip().lower() for r in roles.split(",") if r.strip())
        if cmd and role_list:
            out[cmd] = role_list
    return out or {k: tuple(v) for k, v in DEFAULT_CMD_ALLOWLIST.items()}


def redact_phone(num: str) -> str:
    """Nomor untuk log: hanya 4 digit awal & 2 digit akhir, sisanya bintang."""
    digits = "".join(ch for ch in str(num or "") if ch.isdigit())
    if len(digits) <= 6:
        return "*" * len(digits)
    return f"{digits[:4]}{'*' * (len(digits) - 6)}{digits[-2:]}"


def mask_secret(secret: str) -> str:
    if not secret:
        return ""
    return f"{secret[:4]}…{secret[-2:]}" if len(secret) > 8 else "•" * len(secret)


def parse_command(text: str):
    """Ambil perintah pertama dari isi pesan (mis. '/stok 5' -> ('/stok', '5'))."""
    raw = (text or "").strip()
    if not raw.startswith("/"):
        return None, ""
    parts = raw.split(maxsplit=1)
    return parts[0].strip().lower(), (parts[1].strip() if len(parts) > 1 else "")


async def authorize_command(command: str, sender: str, db) -> tuple:
    """Cek apakah pengirim boleh menjalankan perintah ini.

    Pengirim dicocokkan dengan akun POS lewat kolom ``phone`` (dinormalisasi).
    Mengembalikan ``(ok, user_atau_alasan)``; alasan selalu berupa string pendek
    tanpa data sensitif agar aman dicatat/dibalas.
    """
    allow = command_allowlist()
    roles = allow.get(command)
    if not roles:
        return False, "perintah tidak dikenal"
    digits = "".join(ch for ch in str(sender or "") if ch.isdigit())
    if not digits:
        return False, "pengirim tidak dikenali"
    candidates = {digits}
    if digits.startswith("62"):
        candidates.add("0" + digits[2:])
    user = await db.users.find_one({"phone": {"$in": list(candidates)}}, {"_id": 0, "password_hash": 0})
    if not user:
        return False, "nomor belum terdaftar di POS"
    if not user.get("active", True):
        return False, "akun tidak aktif"
    role = str(user.get("role") or "").lower()
    if role not in roles:
        return False, "role tidak punya izin perintah ini"
    return True, user


def to_jid(phone: str) -> str:
    """Nomor -> JID WhatsApp (``6281...@s.whatsapp.net``).

    JID yang sudah lengkap (mengandung ``@``) dibiarkan apa adanya supaya
    grup (``...@g.us``) juga bisa dituju.
    """
    raw = str(phone or "").strip()
    if "@" in raw:
        return raw
    digits = "".join(ch for ch in raw if ch.isdigit())
    if digits.startswith("0"):
        digits = "62" + digits[1:]
    return f"{digits}{WA_JID_SUFFIX}"


def sign_v2(secret: str, body: bytes, timestamp: str | None = None) -> dict:
    """Header HMAC gaya "Generic (V2)" milik Hermes: hex HMAC-SHA256 dari
    ``<timestamp>.<body>``. Timestamp memberi perlindungan replay (±300 s).
    """
    ts = str(int(timestamp if timestamp is not None else time.time()))
    return {
        "X-Webhook-Timestamp": ts,
        "X-Webhook-Signature-V2": hmac.new(
            secret.encode("utf-8"), f"{ts}.".encode("utf-8") + body, hashlib.sha256
        ).hexdigest(),
    }


def health_url(cfg: dict | None = None) -> str:
    """URL /health gateway, diturunkan dari URL route (dipakai UI status)."""
    c = cfg or bridge_config()
    url = (c.get("url") or "").strip()
    if not url:
        return ""
    m = re.match(r"^(https?://[^/]+)", url)
    return f"{m.group(1)}{WA_HEALTH_PATH}" if m else ""


async def send_text(to: str, text: str, cfg: dict | None = None):
    """Kirim teks lewat webhook adapter Hermes (``deliver_only``).

    Selalu mengembalikan ``(ok: bool, info: dict)`` dan **tidak pernah** melempar
    exception — supaya jalur laporan/cron tidak ikut mati saat gateway offline
    (di Pi memang selalu offline; itu kondisi normal, bukan kegagalan).
    """
    c = cfg or bridge_config()
    if not c.get("enabled"):
        return False, {"error": "WA dimatikan (HERMES_WA_ENABLED=0)"}
    if node_role() not in ("primary", "master", "gudang", "644"):
        return False, {"error": f"node berperan {node_role()} (bukan primary) — tidak mengirim WA"}
    if not c.get("url"):
        return False, {"error": "HERMES_WA_WEBHOOK_URL belum diisi (node ini tidak mengirim WA)"}
    if not c.get("secret"):
        return False, {"error": "HERMES_WA_WEBHOOK_SECRET belum diisi"}
    if not is_local_bridge_url(c["url"]):
        return False, {"error": "HERMES_WA_WEBHOOK_URL harus localhost (adapter tidak boleh publik)"}

    import httpx

    # Payload dipakai template route: prompt="{message}", deliver_extra.chat_id="{to}".
    body = json.dumps({"to": to_jid(to), "message": text}, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    headers = {"Content-Type": "application/json", **sign_v2(c["secret"], body)}
    try:
        async with httpx.AsyncClient(timeout=c.get("timeout") or 20.0) as client:
            r = await client.post(c["url"], content=body, headers=headers)
    except Exception as e:
        # Jangan pernah mencetak nomor atau isi pesan.
        logger.warning("gateway Hermes tidak dapat dihubungi: %s", type(e).__name__)
        return False, {"error": f"gateway tidak dapat dihubungi ({type(e).__name__})"}

    resp = {}
    try:
        resp = r.json()
    except Exception:
        resp = {}
    # deliver_only mengembalikan 200 {"status":"delivered"} atau 502 bila target menolak.
    if r.status_code == 200 and str(resp.get("status") or "delivered").lower() in ("delivered", "duplicate"):
        return True, {"id": resp.get("delivery_id") or "sent"}
    err = resp.get("error") or resp.get("detail") or "ditolak"
    # Status HTTP ikut disertakan supaya diagnosa jelas, tanpa isi pesan/nomor.
    logger.warning("gateway Hermes menolak kirim: HTTP %s", r.status_code)
    return False, {"error": f"HTTP {r.status_code}: {str(err)[:160]}"}


async def enqueue(db, to: str, text: str, kind: str = "manual", wa_id: str = "", attempts: int = 0):
    """Simpan pesan ke outbox idempoten (aman dipanggil berulang).

    Kunci ``wa_id`` wajib stabil dari sisi pemanggil; dokumen dengan ``wa_id``
    sama tidak akan digandakan.
    """
    now = datetime.now(timezone.utc).isoformat()
    doc = {
        "to": to,
        "text": text,
        "kind": kind,
        "wa_id": wa_id,
        "created_at": now,
        "updated_at": now,
    }
    await db.wa_outbox.update_one(
        {"wa_id": wa_id},
        {
            "$set": {"to": to, "text": text, "kind": kind, "updated_at": now},
            "$setOnInsert": {"created_at": now, "sent_at": None, "attempts": attempts, "last_error": None},
        },
        upsert=True,
    )
    return wa_id


async def dispatch_outbox(db, limit: int = 20, cfg: dict | None = None, sender=None) -> dict:
    """Kirim ulang isi outbox. Hanya node 644 (bridge terkonfigurasi) yang jalan.

    Return ringkasan angka saja — tidak memuat nomor/isi pesan.
    """
    c = cfg or bridge_config()
    stats = {"enabled": bool(c.get("url")), "scanned": 0, "sent": 0, "failed": 0, "skipped": True}
    if not bridge_configured(c):
        return stats
    send = sender or send_text
    stats["skipped"] = False
    cursor = db.wa_outbox.find({"sent_at": None}).sort("created_at", 1).limit(max(1, int(limit)))
    async for row in cursor:
        stats["scanned"] += 1
        ok, info = await send(row.get("to"), row.get("text"), c)
        now = datetime.now(timezone.utc).isoformat()
        if ok:
            await db.wa_outbox.update_one(
                {"wa_id": row["wa_id"]},
                {"$set": {"sent_at": now, "updated_at": now, "last_error": None},
                 "$inc": {"attempts": 1}},
            )
            stats["sent"] += 1
        else:
            await db.wa_outbox.update_one(
                {"wa_id": row["wa_id"]},
                {"$set": {"updated_at": now, "last_error": str(info.get("error"))[:200]},
                 "$inc": {"attempts": 1}},
            )
            stats["failed"] += 1
    return stats


def format_rupiah(value) -> str:
    try:
        n = float(value or 0)
    except Exception:
        n = 0.0
    return "Rp " + f"{n:,.0f}".replace(",", ".")


async def handle_command(db, text: str, sender: str) -> str | None:
    """Jalankan perintah WA ber-allowlist dan kembalikan teks balasan.

    Read-only: tidak ada perintah yang mengubah data. Mengembalikan ``None``
    bila pesan bukan perintah yang dikenal (biarkan alur lain yang menangani).
    """
    command, arg = parse_command(text)
    if not command:
        return None
    if command not in command_allowlist():
        return None

    ok, user_or_reason = await authorize_command(command, sender, db)
    if not ok:
        logger.info("perintah WA %s ditolak: %s", command, user_or_reason)
        return f"⛔ Perintah {command} tidak dapat dijalankan: {user_or_reason}."

    user = user_or_reason
    today = wib_now().strftime("%Y-%m-%d")
    start = f"{today}T00:00:00"

    if command == "/stok":
        threshold = 10.0
        try:
            business = await db.settings.find_one({"_id": "business"}, {"_id": 0}) or {}
            threshold = float(business.get("low_stock_threshold") or 10)
        except Exception:
            pass
        rows = await db.products.aggregate([
            {"$match": {"track_stock": True}},
            {"$addFields": {"eff_min": {"$ifNull": ["$min_stock", threshold]}}},
            {"$match": {"$expr": {"$lte": ["$stock", "$eff_min"]}}},
            {"$sort": {"stock": 1}},
            {"$limit": 15},
        ]).to_list(15)
        if not rows:
            return "📦 Stok aman — tidak ada produk di bawah batas minimum."
        lines = [f"📦 *Stok menipis* (ambang {threshold:g}):"]
        for p in rows:
            lines.append(f"• {p.get('name')} — sisa {p.get('stock')} {p.get('unit') or ''}".rstrip())
        lines.append(f"\nTotal {len(rows)} produk (maks 15 ditampilkan).")
        return "\n".join(lines)

    if command == "/laporan-shift":
        orders = await db.orders.find(
            {"status": "paid", "created_at": {"$gte": start}}, {"_id": 0, "total": 1}
        ).to_list(5000)
        total = sum(float(o.get("total") or 0) for o in orders)
        return (f"🧾 *Ringkasan penjualan hari ini* ({today})\n"
                f"Order lunas: {len(orders)}\nTotal: {format_rupiah(total)}")

    if command == "/dashboard":
        orders = await db.orders.find(
            {"status": "paid", "created_at": {"$gte": start}}, {"_id": 0, "total": 1}
        ).to_list(5000)
        open_bills = await db.orders.count_documents({"status": "open"})
        total = sum(float(o.get("total") or 0) for o in orders)
        avg = (total / len(orders)) if orders else 0
        return (f"📊 *Dashboard hari ini* ({today})\n"
                f"Order lunas: {len(orders)}\n"
                f"Penjualan: {format_rupiah(total)}\n"
                f"Rata-rata/order: {format_rupiah(avg)}\n"
                f"Bill terbuka: {open_bills}")

    return None
