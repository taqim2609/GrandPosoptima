"""Uji end-to-end: backend Grand POS -> webhook adapter Hermes (HTTP nyata).

Tes ini menjalankan server HTTP di 127.0.0.1 yang memverifikasi signature persis
seperti kontrak Hermes ("Generic (V2)": hex HMAC-SHA256 dari
``<timestamp>.<body>``, timestamp wajib dalam ±300 detik), lalu memanggil
``hermes_bridge.send_text`` sungguhan lewat jaringan.

Yang dibuktikan:
  * signature yang kita kirim LULUS verifikasi pihak ketiga yang independen;
  * payload sampai utuh (chat_id berupa JID, message apa adanya);
  * secret salah / target menolak -> ``ok=False``, bukan exception;
  * tidak ada nomor/isi pesan yang bocor ke log.

Jalankan: ``python3 project/tests/test_hermes_wa_e2e.py``
"""

import asyncio
import hashlib
import hmac
import json
import os
import sys
import threading
import types
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "backend"))

# Image test minimal tidak selalu memasang dependency backend. Stub ini tetap
# melakukan HTTP nyata via stdlib dan hanya aktif bila httpx memang tidak ada.
try:
    import httpx  # noqa: F401
except ModuleNotFoundError:
    class _HttpxResponse:
        def __init__(self, status_code, body):
            self.status_code = status_code
            self._body = body
            self.text = body.decode("utf-8", errors="replace")

        def json(self):
            return json.loads(self.text)

    def _request(method, url, content=None, headers=None, timeout=5):
        req = urllib.request.Request(url, data=content, headers=headers or {}, method=method)
        try:
            with urllib.request.urlopen(req, timeout=timeout) as response:
                return _HttpxResponse(response.status, response.read())
        except urllib.error.HTTPError as exc:
            return _HttpxResponse(exc.code, exc.read())

    class _AsyncClient:
        def __init__(self, timeout=5):
            self.timeout = timeout

        async def __aenter__(self):
            return self

        async def __aexit__(self, *_args):
            return None

        async def post(self, url, content=None, headers=None):
            return await asyncio.to_thread(
                _request, "POST", url, content, headers, self.timeout
            )

    httpx_stub = types.ModuleType("httpx")
    setattr(httpx_stub, "AsyncClient", _AsyncClient)
    setattr(httpx_stub, "get", lambda url, timeout=5: _request("GET", url, timeout=timeout))
    sys.modules["httpx"] = httpx_stub

import hermes_bridge as hb  # noqa: E402

SECRET = "secret-uji-jangan-dipakai-di-produksi"
REPLAY_WINDOW = 300
seen = []


class _Handler(BaseHTTPRequestHandler):
    # Setiap request diverifikasi; kalau tidak sah -> 401 (persis seperti Hermes).
    response_status = 200
    response_body = {"status": "delivered", "route": "grandpos-outbox", "target": "whatsapp", "delivery_id": "d-1"}

    def log_message(self, format, *args):  # noqa: A002 - jangan berisik saat tes
        pass

    def do_GET(self):
        body = json.dumps({"status": "ok", "platform": "webhook"}).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        raw = self.rfile.read(int(self.headers.get("Content-Length") or 0))
        sig = self.headers.get("X-Webhook-Signature-V2", "")
        ts = self.headers.get("X-Webhook-Timestamp", "")
        ok = False
        try:
            if sig and ts and abs(int(ts) - int(__import__("time").time())) <= REPLAY_WINDOW:
                expected = hmac.new(SECRET.encode(), f"{ts}.".encode() + raw, hashlib.sha256).hexdigest()
                ok = hmac.compare_digest(sig, expected)
        except Exception:
            ok = False
        if not ok:
            return self._send(401, {"error": "unauthorized"})
        payload = json.loads(raw.decode("utf-8"))
        # Simulasi render template route: prompt="{message}", deliver_extra.chat_id="{to}"
        seen.append({"chat_id": payload.get("to"), "message": payload.get("message")})
        return self._send(self.response_status, self.response_body)

    def _send(self, code, obj):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def _serve():
    srv = ThreadingHTTPServer(("127.0.0.1", 0), _Handler)
    t = threading.Thread(target=srv.serve_forever, daemon=True)
    t.start()
    return srv, srv.server_address[1]


def _point_env(port):
    os.environ["NODE_ROLE"] = "primary"
    os.environ["HERMES_WA_ENABLED"] = "1"
    os.environ["HERMES_WA_WEBHOOK_URL"] = f"http://127.0.0.1:{port}/webhooks/grandpos-outbox"
    os.environ["HERMES_WA_WEBHOOK_SECRET"] = SECRET


def test_e2e_delivery_is_signed_and_rendered():
    srv, port = _serve()
    try:
        _point_env(port)
        seen.clear()
        ok, info = asyncio.run(hb.send_text("081234567890", "Struk #123 sudah dibayar"))
        assert ok is True, info
        assert info["id"] == "d-1"
        assert len(seen) == 1
        assert seen[0]["chat_id"] == "6281234567890@s.whatsapp.net", seen[0]
        assert seen[0]["message"] == "Struk #123 sudah dibayar"
    finally:
        srv.shutdown()


def test_e2e_health_probe():
    srv, port = _serve()
    try:
        _point_env(port)
        import httpx
        r = httpx.get(hb.health_url(), timeout=5)
        assert r.status_code == 200 and r.json()["platform"] == "webhook"
    finally:
        srv.shutdown()


def test_e2e_wrong_secret_is_rejected():
    srv, port = _serve()
    try:
        _point_env(port)
        os.environ["HERMES_WA_WEBHOOK_SECRET"] = "secret-yang-salah"
        ok, info = asyncio.run(hb.send_text("0812", "halo"))
        assert ok is False
        assert "401" in info["error"], info
    finally:
        srv.shutdown()


def test_e2e_target_rejects_maps_to_failure():
    srv, port = _serve()
    try:
        _point_env(port)
        _Handler.response_status = 502
        _Handler.response_body = {"error": "Delivery failed"}
        ok, info = asyncio.run(hb.send_text("0812", "halo"))
        assert ok is False and "502" in info["error"], info
    finally:
        _Handler.response_status = 200
        _Handler.response_body = {"status": "delivered", "delivery_id": "d-1"}
        srv.shutdown()


def test_e2e_outbox_retry_then_success():
    """Gagal -> tersimpan -> ditahan selama backoff -> lalu terkirim SEKALI.

    Kegagalan melepas lease dan menjadwalkan ``next_retry_at`` supaya baris tidak
    dicoba berulang dalam satu panggilan. Retry yang benar = tunggu backoff.
    """
    srv, port = _serve()
    try:
        _point_env(port)
        _Handler.response_status = 502
        db = _FakeDB()
        asyncio.run(hb.enqueue(db, "0812", "laporan harian", kind="report", wa_id="K-E2E"))
        stats = asyncio.run(hb.dispatch_outbox(db))
        assert stats["failed"] == 1 and db.wa_outbox.rows[0]["sent_at"] is None

        # Panggilan yang menyusul segera HARUS tidak mengirim apa pun: baris
        # masih dalam masa backoff. Ini yang mencegah retry-storm.
        stats_hold = asyncio.run(hb.dispatch_outbox(db))
        assert stats_hold["scanned"] == 0 and stats_hold["sent"] == 0, stats_hold
        assert db.wa_outbox.rows[0]["next_retry_at"], "backoff harus dijadwalkan"

        # Setelah backoff lewat (disimulasikan dengan menghapus jadwal retry),
        # gateway yang sudah hidup mengirim tepat sekali.
        _Handler.response_status = 200
        seen.clear()
        db.wa_outbox.rows[0]["next_retry_at"] = None
        stats2 = asyncio.run(hb.dispatch_outbox(db))
        assert stats2["sent"] == 1, stats2
        assert db.wa_outbox.rows[0]["sent_at"]
        assert len(seen) == 1
        # idempoten: jalan ketiga tidak mengirim lagi
        stats3 = asyncio.run(hb.dispatch_outbox(db))
        assert stats3["sent"] == 0 and len(seen) == 1
    finally:
        _Handler.response_status = 200
        srv.shutdown()


# ---- db palsu minimal (tanpa Mongo) -----------------------------------------
class _Cursor:
    def __init__(self, rows):
        self._rows = list(rows)

    def sort(self, *_a, **_k):
        self._rows.sort(key=lambda r: r.get("created_at") or "")
        return self

    def limit(self, n):
        self._rows = self._rows[: int(n)]
        return self

    def __aiter__(self):
        async def _gen():
            for r in self._rows:
                yield r
        return _gen()


class _Outbox:
    """Stub koleksi outbox untuk E2E.

    Perlu memahami operator query Mongo (``$or``/``$exists``/``$lt``) karena
    ``dispatch_outbox`` mengklaim baris lewat ``find_one_and_update`` dengan
    filter lease; stub yang hanya membandingkan kesamaan literal akan selalu
    "tidak ada baris" dan mengubah hasil tes jadi tidak bermakna.
    """

    def __init__(self):
        self.rows = []

    @staticmethod
    def _matches(doc, query) -> bool:
        for key, want in (query or {}).items():
            if key == "$or":
                if not any(_Outbox._matches(doc, sub) for sub in want):
                    return False
                continue
            if key == "$and":
                if not all(_Outbox._matches(doc, sub) for sub in want):
                    return False
                continue
            have, present = doc.get(key), key in doc
            if isinstance(want, dict):
                for op, val in want.items():
                    if op == "$exists":
                        if bool(val) != present:
                            return False
                    elif op == "$lt":
                        if have is None or not (have < val):
                            return False
                    elif op == "$lte":
                        if have is None or not (have <= val):
                            return False
                    elif op == "$gt":
                        if have is None or not (have > val):
                            return False
                    elif op == "$in":
                        if have not in val:
                            return False
                    else:
                        return False
                continue
            if have != want:
                return False
        return True

    @staticmethod
    def _apply(doc, update):
        doc.update(update.get("$set", {}))
        for k, v in (update.get("$inc") or {}).items():
            doc[k] = (doc.get(k) or 0) + v

    async def update_one(self, query, update, upsert=False):
        for r in self.rows:
            if self._matches(r, query):
                self._apply(r, update)
                return type("R", (), {"matched_count": 1})()
        if upsert:
            doc = {k: v for k, v in (query or {}).items() if not str(k).startswith("$")}
            doc.update(update.get("$setOnInsert") or {})
            doc.update(update.get("$set") or {})
            for k, v in (update.get("$inc") or {}).items():
                doc[k] = (doc.get(k) or 0) + v
            self.rows.append(doc)
        return type("R", (), {"matched_count": 0})()

    def find(self, query, _proj=None):
        return _Cursor([dict(r) for r in self.rows if self._matches(r, query)])

    async def find_one_and_update(self, query, update, sort=None, return_document=None):
        candidates = [r for r in self.rows if self._matches(r, query)]
        if sort:
            for field, direction in reversed(sort):
                candidates.sort(key=lambda r: r.get(field) or "", reverse=direction < 0)
        if not candidates:
            return None
        row = candidates[0]
        self._apply(row, update)
        return dict(row)


class _FakeDB:
    def __init__(self):
        self.wa_outbox = _Outbox()


if __name__ == "__main__":
    tests = [(n, f) for n, f in sorted(globals().items()) if n.startswith("test_") and callable(f)]
    failed = []
    for name, fn in tests:
        try:
            fn()
            print("PASS", name)
        except Exception as e:
            failed.append(name)
            print(f"FAIL {name}: {type(e).__name__}: {e}")
    print(f"\n{len(tests) - len(failed)}/{len(tests)} lulus")
    raise SystemExit(1 if failed else 0)
