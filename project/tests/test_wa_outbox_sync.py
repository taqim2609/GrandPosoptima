"""Regression tests for the authenticated Pi -> primary WA outbox endpoint."""

import asyncio
import json
import os
import sys
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from types import SimpleNamespace
from unittest import mock

from fastapi import HTTPException

PROJECT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(PROJECT, "backend"))
os.environ.setdefault("MONGO_URL", "mongodb://127.0.0.1:27017")
os.environ.setdefault("DB_NAME", "grandpos_test")
os.environ.setdefault("JWT_SECRET", "test-only-secret")

import server  # noqa: E402
import hermes_bridge as hb  # noqa: E402


class _Request:
    def __init__(self, token=""):
        self.headers = {"X-WA-Sync-Token": token} if token else {}


def _body():
    return server.WaOutboxSyncIn(
        node="backup",
        rows=[server.WaOutboxRowIn(wa_id="wa-1", to="0812", text="laporan")],
    )


def _expect_http_error(status_code, call):
    try:
        call()
    except HTTPException as exc:
        assert exc.status_code == status_code
        return
    raise AssertionError(f"expected HTTP {status_code}")


def test_sync_wa_outbox_fails_closed_without_token():
    with mock.patch.object(server, "WA_OUTBOX_SYNC_TOKEN", ""):
        _expect_http_error(503, lambda: asyncio.run(server.sync_wa_outbox(_body(), _Request())))


def test_sync_wa_outbox_rejects_wrong_token():
    with mock.patch.object(server, "WA_OUTBOX_SYNC_TOKEN", "correct-token"):
        _expect_http_error(401, lambda: asyncio.run(server.sync_wa_outbox(_body(), _Request("wrong-token"))))


def test_sync_wa_outbox_accepts_valid_token():
    calls = []

    async def ingest(_db, rows):
        calls.append(rows)
        return {"accepted": 1, "sent": 1}

    bridge = SimpleNamespace(bridge_configured=lambda: True, ingest_outbox=ingest)
    with mock.patch.object(server, "WA_OUTBOX_SYNC_TOKEN", "correct-token"), \
            mock.patch.object(server, "hermes_bridge", bridge):
        result = asyncio.run(server.sync_wa_outbox(_body(), _Request("correct-token")))

    assert result["ok"] is True
    assert result["accepted"] == 1
    assert calls == [[{
        "wa_id": "wa-1",
        "to": "0812",
        "text": "laporan",
        "kind": "wa",
        "created_at": None,
        "origin_node": None,
    }]]


class _SyncHandler(BaseHTTPRequestHandler):
    received = []

    def log_message(self, format, *args):  # noqa: A002
        pass

    def do_POST(self):
        raw = self.rfile.read(int(self.headers.get("Content-Length") or 0))
        self.received.append({
            "path": self.path,
            "token": self.headers.get("X-WA-Sync-Token"),
            "body": json.loads(raw.decode("utf-8")),
        })
        response = json.dumps({"ok": True}).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(response)))
        self.end_headers()
        self.wfile.write(response)


def _sync_server():
    srv = ThreadingHTTPServer(("127.0.0.1", 0), _SyncHandler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv, srv.server_address[1]


class _Cursor:
    def __init__(self, rows):
        self.rows = rows

    def sort(self, *_args):
        return self

    def limit(self, n):
        self.rows = self.rows[:int(n)]
        return self

    def __aiter__(self):
        async def generate():
            for row in self.rows:
                yield dict(row)
        return generate()


class _Outbox:
    def __init__(self, rows):
        self.rows = rows

    def find(self, _query):
        return _Cursor([row for row in self.rows
                        if row.get("sent_at") is None and not row.get("forwarded_at")])

    async def update_one(self, query, update):
        for row in self.rows:
            if row.get("wa_id") == query.get("wa_id") and row.get("sent_at") is None:
                row.update(update.get("$set", {}))
                return


class _DB:
    def __init__(self, rows):
        self.wa_outbox = _Outbox(rows)


def test_push_outbox_upstream_posts_once_and_marks_forwarded():
    srv, port = _sync_server()
    try:
        _SyncHandler.received.clear()
        db = _DB([{
            "wa_id": "wa-forward-1", "to": "0812", "text": "laporan",
            "kind": "report", "created_at": "2026-10-12T00:00:00+00:00",
            "sent_at": None, "forwarded_at": None,
        }])
        with mock.patch.dict(os.environ, {"NODE_ROLE": "backup"}):
            first = asyncio.run(hb.push_outbox_upstream(
                db, f"http://127.0.0.1:{port}", "sync-token", limit=10
            ))
            second = asyncio.run(hb.push_outbox_upstream(
                db, f"http://127.0.0.1:{port}", "sync-token", limit=10
            ))
        assert first["pushed"] == 1
        assert second["pushed"] == 0
        assert len(_SyncHandler.received) == 1
        assert _SyncHandler.received[0]["path"] == "/api/sync/wa-outbox"
        assert _SyncHandler.received[0]["token"] == "sync-token"
        assert _SyncHandler.received[0]["body"]["rows"][0]["wa_id"] == "wa-forward-1"
        assert db.wa_outbox.rows[0]["forwarded_at"]
    finally:
        srv.shutdown()


def test_scheduler_dispatch_uses_upstream_on_backup():
    bridge = SimpleNamespace(
        node_role=lambda: "backup",
        push_outbox_upstream=mock.AsyncMock(return_value={"pushed": 1}),
        dispatch_outbox=mock.AsyncMock(return_value={"sent": 1}),
    )
    with mock.patch.object(server, "hermes_bridge", bridge), \
            mock.patch.object(server, "WA_OUTBOX_UPSTREAM_URL", "http://primary:8000"), \
            mock.patch.object(server, "WA_OUTBOX_SYNC_TOKEN", "sync-token"):
        result = asyncio.run(server.dispatch_wa_outbox(limit=7))
    assert result == {"pushed": 1}
    bridge.push_outbox_upstream.assert_awaited_once_with(
        server.db, "http://primary:8000", "sync-token", limit=7
    )
    bridge.dispatch_outbox.assert_not_awaited()


def _run_all():
    tests = [(name, fn) for name, fn in sorted(globals().items())
             if name.startswith("test_") and callable(fn)]
    failures = []
    for name, fn in tests:
        try:
            fn()
            print("PASS", name)
        except Exception as exc:
            failures.append(name)
            print(f"FAIL {name}: {type(exc).__name__}: {exc}")
    print(f"\n{len(tests) - len(failures)}/{len(tests)} lulus")
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(_run_all())
