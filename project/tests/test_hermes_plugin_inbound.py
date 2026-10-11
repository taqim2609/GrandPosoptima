"""Uji plugin Hermes `grandpos-wa-inbound` tanpa menjalankan Hermes.

Memakai server HTTP lokal sebagai pengganti backend POS, sehingga yang diuji
adalah perilaku nyata: payload yang dikirim, header secret, dan keputusan hook.

Jalankan: ``python3 project/tests/test_hermes_plugin_inbound.py``
"""

import json
import os
import sys
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from types import SimpleNamespace

PLUGIN_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "hermes-integration", "grandpos-wa-inbound"
)
sys.path.insert(0, PLUGIN_DIR)

import importlib.util  # noqa: E402

spec = importlib.util.spec_from_file_location("grandpos_wa_inbound", os.path.join(PLUGIN_DIR, "__init__.py"))
assert spec is not None and spec.loader is not None
plugin = importlib.util.module_from_spec(spec)
spec.loader.exec_module(plugin)

SECRET = "rahasia-webhook-uji"
received = []


class _Handler(BaseHTTPRequestHandler):
    status = 200

    def log_message(self, format, *args):  # noqa: A002
        pass

    def do_POST(self):
        raw = self.rfile.read(int(self.headers.get("Content-Length") or 0))
        received.append({
            "secret": self.headers.get("X-Hermes-Secret"),
            "payload": json.loads(raw.decode("utf-8")),
        })
        body = json.dumps({"ok": True}).encode()
        self.send_response(self.status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def _serve():
    srv = ThreadingHTTPServer(("127.0.0.1", 0), _Handler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv, srv.server_address[1]


def _event(text="halo", chat_type="dm", platform="whatsapp", internal=False):
    source = SimpleNamespace(platform=platform, chat_id="628111222333@s.whatsapp.net",
                             user_id="628111222333", chat_type=chat_type)
    return SimpleNamespace(text=text, source=source, message_id="m-1", internal=internal)


def _env(port, secret=SECRET):
    os.environ["GRANDPOS_WEBHOOK_URL"] = f"http://127.0.0.1:{port}/api/webhook/whatsapp"
    os.environ["WA_WEBHOOK_SECRET"] = secret


def test_dm_is_forwarded_and_agent_skipped():
    srv, port = _serve()
    try:
        _env(port)
        received.clear()
        out = plugin.on_pre_gateway_dispatch(_event("halo kak"))
        assert out == {"action": "skip", "reason": "grandpos-forwarded"}, out
        assert len(received) == 1
        assert received[0]["secret"] == SECRET
        d = received[0]["payload"]["data"]
        assert d["body"] == "halo kak"
        assert d["from"] == "628111222333"
        assert d["isGroup"] is False
        assert received[0]["payload"]["event"] == "messages.upsert"
    finally:
        srv.shutdown()


def test_group_message_marks_participant():
    srv, port = _serve()
    try:
        _env(port)
        received.clear()
        plugin.on_pre_gateway_dispatch(_event("#reservasi meja 4", chat_type="group"))
        d = received[0]["payload"]["data"]
        assert d["isGroup"] is True
        assert d["participant"] == "628111222333"
    finally:
        srv.shutdown()


def test_non_whatsapp_platform_passes_through():
    srv, port = _serve()
    try:
        _env(port)
        received.clear()
        assert plugin.on_pre_gateway_dispatch(_event("hai", platform="telegram")) is None
        assert received == []
    finally:
        srv.shutdown()


def test_internal_event_ignored():
    srv, port = _serve()
    try:
        _env(port)
        received.clear()
        assert plugin.on_pre_gateway_dispatch(_event("internal", internal=True)) is None
        assert received == []
    finally:
        srv.shutdown()


def test_pos_unreachable_keeps_bot_silent():
    """POS mati -> pesan di-skip (bot diam), bukan dibalas agent."""
    os.environ["GRANDPOS_WEBHOOK_URL"] = "http://127.0.0.1:9/api/webhook/whatsapp"
    os.environ["WA_WEBHOOK_SECRET"] = SECRET
    os.environ["GRANDPOS_FORWARD_TIMEOUT"] = "2"
    out = plugin.on_pre_gateway_dispatch(_event("halo"))
    assert out == {"action": "skip", "reason": "grandpos-unreachable"}, out


def test_missing_secret_fails_closed():
    srv, port = _serve()
    try:
        _env(port, secret="")
        received.clear()
        out = plugin.on_pre_gateway_dispatch(_event("halo"))
        assert out["reason"] == "grandpos-unreachable"
        assert received == []  # tidak ada request tanpa secret
    finally:
        srv.shutdown()


def test_pos_rejecting_keeps_bot_silent():
    srv, port = _serve()
    try:
        _env(port)
        _Handler.status = 401
        out = plugin.on_pre_gateway_dispatch(_event("halo"))
        assert out["reason"] == "grandpos-unreachable"
    finally:
        _Handler.status = 200
        srv.shutdown()


def test_empty_text_skipped_without_forward():
    srv, port = _serve()
    try:
        _env(port)
        received.clear()
        out = plugin.on_pre_gateway_dispatch(_event("   "))
        assert out == {"action": "skip", "reason": "grandpos-non-teks"}
        assert received == []
    finally:
        srv.shutdown()


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
