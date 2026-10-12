"""Plugin Hermes: teruskan pesan WhatsApp masuk ke Grand POS.

Kenapa plugin, bukan adapter baru: Hermes sudah memegang sesi WhatsApp (Baileys)
dan menormalkan pesan masuk. Yang kurang hanyalah jalur pesan itu ke aplikasi
POS. Hook ``pre_gateway_dispatch`` berjalan **sebelum** agent dipanggil, jadi:

* pelanggan dibalas oleh mesin POS (reservasi, struk, perintah ber-allowlist),
  bukan oleh agent — nol token LLM per pesan;
* bila POS tidak dapat dihubungi, pesan di-``skip`` (bot diam), bukan dibalas
  dengan teks agent yang tidak relevan.

Catatan keamanan:
* Autentikasi ke POS memakai header ``X-Hermes-Secret`` dari ``WA_WEBHOOK_SECRET``
  (POS menolak webhook bila secret belum diisi — fail-closed di kedua sisi).
* Log plugin tidak pernah memuat nomor telepon atau isi pesan.
* Hanya pustaka standar; tidak ada dependency tambahan di host Hermes.
"""

from __future__ import annotations

import json
import logging
import os

logger = logging.getLogger("grandpos-wa-inbound")

DEFAULT_POS_URL = "http://127.0.0.1:8001/api/webhook/whatsapp"

# Batas keras timeout: gateway Hermes memanggil hook ini secara serial, jadi
# satu POS yang lambat tidak boleh menahan seluruh antrean pesan.
MAX_FORWARD_TIMEOUT = 2.0


def _pos_url() -> str:
    return (os.environ.get("GRANDPOS_WEBHOOK_URL") or DEFAULT_POS_URL).strip()


def _secret() -> str:
    return (os.environ.get("WA_WEBHOOK_SECRET") or "").strip()


def _timeout() -> float:
    """Timeout diteruskan-ke-POS, **selalu** dipotong ke ``MAX_FORWARD_TIMEOUT``.

    Dibuat ``min(...)`` di kode — bukan hanya disarankan di komentar — supaya
    nilai env yang salah (mis. 30 dtk) tidak bisa memblokir gateway.
    """
    try:
        value = float(os.environ.get("GRANDPOS_FORWARD_TIMEOUT") or MAX_FORWARD_TIMEOUT)
    except Exception:
        value = MAX_FORWARD_TIMEOUT
    return max(0.1, min(value, MAX_FORWARD_TIMEOUT))


def _platform_name(platform) -> str:
    """Nama platform sebagai huruf kecil, aman untuk enum maupun string."""
    value = getattr(platform, "value", platform)
    return str(value or "").strip().lower()


def _is_whatsapp(platform) -> bool:
    return _platform_name(platform) == "whatsapp"


def build_payload(event) -> dict:
    """Ubah MessageEvent Hermes menjadi payload webhook POS.

    Bentuk ``data`` sengaja memakai kontrak generik yang sudah diterima POS
    (``chatId``/``from``/``body``), bukan bentuk vendor tertentu.
    """
    source = getattr(event, "source", None)
    chat_id = str(getattr(source, "chat_id", "") or "")
    user_id = str(getattr(source, "user_id", "") or "")
    chat_type = str(getattr(source, "chat_type", "dm") or "dm")
    is_group = chat_type == "group"
    author = user_id.split(":")[0] if user_id else chat_id.split("@")[0]
    return {
        "event": "messages.upsert",
        "isGroup": is_group,
        "source": "hermes-gateway",
        "data": {
            "chatId": chat_id,
            "remoteJid": chat_id,
            "from": author,
            "participant": author if is_group else None,
            "isGroup": is_group,
            "fromMe": False,
            "body": str(getattr(event, "text", "") or ""),
            "message_id": str(getattr(event, "message_id", "") or ""),
        },
    }


def _httpx():
    """Import httpx secara lazy — host Hermes mungkin tidak memasangnya, dan
    ketiadaan itu harus menjadi *fail-soft*, bukan ImportError saat load plugin.
    """
    try:
        import httpx  # noqa: PLC0415
        return httpx
    except Exception:
        return None


async def forward(payload: dict, url: str = "", secret: str = "", timeout: float = 0) -> tuple:
    """POST payload ke POS **secara async**. Mengembalikan ``(ok, keterangan)``
    tanpa pernah melempar exception dan tanpa menulis nomor/isi pesan ke log.

    Memakai ``httpx.AsyncClient`` (bukan ``urlopen``) supaya hook yang memanggil
    tidak memblokir event loop gateway — dulu ``urlopen`` sinkron di dalam hook
    sinkron bisa menahan seluruh gateway sampai timeout habis.
    """
    url = url or _pos_url()
    secret = secret or _secret()
    timeout = timeout or _timeout()
    if not secret:
        logger.error("WA_WEBHOOK_SECRET belum diset — pesan WA tidak diteruskan")
        return False, "secret kosong"
    httpx = _httpx()
    if httpx is None:
        logger.error("httpx tidak tersedia di host Hermes — pesan WA tidak diteruskan")
        return False, "httpx tidak tersedia"
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            resp = await client.post(
                url,
                content=body,
                headers={
                    "Content-Type": "application/json",
                    "X-Hermes-Secret": secret,
                },
            )
        ok = 200 <= int(resp.status_code) < 300
        if not ok:
            # Hanya statusnya yang dicatat — bukan body, yang bisa memuat nomor.
            logger.warning("POS menolak pesan WA masuk: HTTP %s", resp.status_code)
        return ok, f"HTTP {resp.status_code}"
    except Exception as e:
        logger.warning("POS tidak dapat dihubungi: %s", type(e).__name__)
        return False, type(e).__name__


async def on_pre_gateway_dispatch(event, **kwargs):
    """Hook async: serahkan pesan WA ke POS lalu hentikan dispatch agent.

    ``async def`` di sini **bukan** kosmetik: kalau hook ini sinkron, satu
    panggilan HTTP yang lambat menahan seluruh gateway. Karena itu ``forward``
    juga async dan tidak memakai ``urlopen``.
    """
    if getattr(event, "internal", False):
        return None  # event internal bukan pesan pengguna
    source = getattr(event, "source", None)
    if source is None or not _is_whatsapp(getattr(source, "platform", None)):
        return None  # platform lain: biarkan Hermes menangani seperti biasa
    if not str(getattr(event, "text", "") or "").strip():
        return {"action": "skip", "reason": "grandpos-non-teks"}
    ok, detail = await forward(build_payload(event))
    if not ok:
        # Sengaja tetap skip: lebih baik bot diam daripada agent membalas
        # pelanggan dengan teks yang tidak sesuai skenario POS.
        logger.warning("pesan WA masuk tidak diteruskan ke POS (%s)", detail)
        return {"action": "skip", "reason": "grandpos-unreachable"}
    return {"action": "skip", "reason": "grandpos-forwarded"}


def register(ctx):
    ctx.register_hook("pre_gateway_dispatch", on_pre_gateway_dispatch)
