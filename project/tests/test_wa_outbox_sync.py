"""Regression tests for the authenticated Pi -> primary WA outbox endpoint."""

import asyncio
import os
import sys
from types import SimpleNamespace
from unittest import mock

from fastapi import HTTPException

PROJECT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(PROJECT, "backend"))
os.environ.setdefault("MONGO_URL", "mongodb://127.0.0.1:27017")
os.environ.setdefault("DB_NAME", "grandpos_test")
os.environ.setdefault("JWT_SECRET", "test-only-secret")

import server  # noqa: E402


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
