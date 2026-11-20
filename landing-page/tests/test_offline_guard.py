"""API degraded-mode guards for operations that cannot reconcile offline."""

from contextlib import contextmanager, nullcontext

import pytest
from fastapi.testclient import TestClient

import app.api as api_module
from app.api import create_app
from app.guard import OFFLINE_BLOCK_MESSAGE, resolve_connectivity


class _FakeConnection:
    def transaction(self):
        return nullcontext()

    def cursor(self):
        return nullcontext(object())


@contextmanager
def _fake_connect():
    yield _FakeConnection()


@pytest.fixture(autouse=True)
def _clean_offline_mode(monkeypatch):
    monkeypatch.delenv("OFFLINE_MODE", raising=False)


@pytest.fixture
def client(monkeypatch):
    # require_key() is fail-closed, so the fixture configures a key and sends it.
    monkeypatch.setenv("POS_API_KEY", "test-api-key")
    monkeypatch.setattr(api_module.database, "connect", _fake_connect)
    monkeypatch.setattr(api_module, "close_shift", lambda *args, **kwargs: {"status": "closed"})
    monkeypatch.setattr(api_module, "record_cash_movement", lambda *args, **kwargs: {"direction": kwargs["direction"]})
    monkeypatch.setattr(api_module, "create_order", lambda *args, **kwargs: {"id": 10, "status": "open"})
    monkeypatch.setattr(api_module, "pay_order", lambda *args, **kwargs: {"id": 10, "status": "paid"})
    monkeypatch.setattr(api_module, "void_order", lambda *args, **kwargs: {"id": 10, "status": "void"})
    return TestClient(create_app())


def _close(client, headers=None):
    return client.post(
        "/shifts/7/close",
        json={"counted_cash": 500000, "closed_by": 1},
        headers={"X-API-Key": "test-api-key", **(headers or {})},
    )


def _cash(client, direction, headers=None):
    return client.post(
        "/cash-movements",
        json={"direction": direction, "amount": 50000, "reason": "operasional", "created_by": 1},
        headers={"X-API-Key": "test-api-key", **(headers or {})},
    )


def test_offline_env_blocks_close_and_cash_out(client, monkeypatch):
    monkeypatch.setenv("OFFLINE_MODE", "true")

    for response in (_close(client), _cash(client, "out")):
        assert response.status_code == 409
        assert response.json()["detail"] == OFFLINE_BLOCK_MESSAGE


def test_offline_header_blocks_close_and_cash_out(client):
    headers = {"X-Terminal-Connectivity": "offline"}

    for response in (_close(client, headers), _cash(client, "out", headers)):
        assert response.status_code == 409
        assert response.json()["detail"] == OFFLINE_BLOCK_MESSAGE


def test_online_allows_close_cash_out_and_cash_in(client):
    headers = {"X-Terminal-Connectivity": "online"}

    assert _close(client, headers).status_code == 200
    assert _cash(client, "out", headers).status_code == 200
    assert _cash(client, "in", headers).status_code == 200


def test_sales_pay_and_void_remain_allowed_while_offline(client, monkeypatch):
    monkeypatch.setenv("OFFLINE_MODE", "true")

    order = client.post(
        "/orders",
        json={"order_type": "takeaway", "lines": [{"product_id": 1, "qty": 1}]},
        headers={"X-API-Key": "test-api-key"},
    )
    payment = client.post(
        "/orders/10/pay",
        json={"captured_by": 1, "payments": [{"method": "cash", "amount": 50000}]},
        headers={"X-API-Key": "test-api-key"},
    )
    void = client.post(
        "/orders/10/void",
        json={"voided_by": 1, "reason": "salah input"},
        headers={"X-API-Key": "test-api-key"},
    )

    assert order.status_code == 200
    assert payment.status_code == 200
    assert void.status_code == 200


def test_connectivity_reports_env_source(client, monkeypatch):
    monkeypatch.setenv("OFFLINE_MODE", "true")

    response = client.get(
        "/system/connectivity",
        headers={"X-Terminal-Connectivity": "online"},
    )

    assert response.status_code == 200
    assert response.json() == {
        "mode": "offline",
        "source": "env",
        "allowed_operations": ["orders.create", "orders.pay", "orders.void", "cash_movements.in"],
    }


def test_connectivity_reports_header_source(client):
    response = client.get(
        "/system/connectivity",
        headers={"X-Terminal-Connectivity": "offline"},
    )

    assert response.status_code == 200
    assert response.json()["mode"] == "offline"
    assert response.json()["source"] == "header"
    assert "shifts.close" not in response.json()["allowed_operations"]
    assert "cash_movements.out" not in response.json()["allowed_operations"]


def test_resolver_defaults_online_and_env_cannot_be_overridden(monkeypatch):
    assert resolve_connectivity() == {
        "mode": "online",
        "source": "default",
        "allowed_operations": [
            "orders.create",
            "orders.pay",
            "orders.void",
            "cash_movements.in",
            "cash_movements.out",
            "shifts.close",
        ],
    }

    monkeypatch.setenv("OFFLINE_MODE", "1")
    assert resolve_connectivity("online")["mode"] == "offline"
    assert resolve_connectivity("online")["source"] == "env"
