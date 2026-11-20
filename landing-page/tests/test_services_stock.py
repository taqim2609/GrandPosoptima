"""Regression tests for FIX-A Bug 5: stock validation in _consume_stock."""

import pytest
from decimal import Decimal

from app.services import BusinessRuleError, _consume_stock


class FakeCursor:
    """Minimal fake cursor that records movements and allows ingredient lookup."""

    def __init__(self, *, stock_qty: int = 100):
        self.queries: list = []
        self._stock_qty = stock_qty
        self._movement_rows: list[dict] = []

    def execute(self, sql: str, params: tuple = ()):
        self.queries.append((sql, params))

    def fetchall(self):
        return self._movement_rows

    def fetchone(self):
        return {"stock_qty": self._stock_qty}


class FakeCursorOneRow:
    """Fake cursor that returns a single movement row."""

    def __init__(self, *, stock_qty: int | Decimal = 100, delta: int | Decimal = -10):
        self.queries: list = []
        self._stock_qty = stock_qty
        self._delta = delta

    def execute(self, sql: str, params: tuple = ()):
        self.queries.append((sql, params))

    def fetchall(self):
        return [{"ingredient_id": 1, "qty_delta": self._delta}]

    def fetchone(self):
        return {"id": 1, "name": "Tepung", "stock_qty": self._stock_qty}


def _one(cur, sql, params):
    """Helper matching app.services._one signature."""
    cur.execute(sql, params)
    return cur.fetchone()


def _exec(cur, sql, params):
    """Helper matching app.services._exec signature."""
    cur.execute(sql, params)


class TestConsumeStock:
    """FIX-A/R-05-001: stock must be checked BEFORE the UPDATE so the balance
    can never go negative."""

    def test_sufficient_stock_does_not_raise(self, monkeypatch):
        cur = FakeCursorOneRow(stock_qty=100, delta=-10)
        monkeypatch.setattr("app.services._one", _one)
        monkeypatch.setattr("app.services._exec", _exec)
        # Should not raise
        _consume_stock(cur, order_id=42, created_by=1)
        # Verify the UPDATE was issued
        update_queries = [q for q, _ in cur.queries if "UPDATE ingredients" in q]
        assert len(update_queries) == 1

    def test_insufficient_stock_raises_business_rule_error(self, monkeypatch):
        cur = FakeCursorOneRow(stock_qty=5, delta=-10)
        monkeypatch.setattr("app.services._one", _one)
        monkeypatch.setattr("app.services._exec", _exec)
        with pytest.raises(BusinessRuleError, match="stok.*tidak mencukupi"):
            _consume_stock(cur, order_id=42, created_by=1)

    def test_exactly_zero_stock_is_accepted(self, monkeypatch):
        # stock=10, delta=-10 -> exactly zero, should succeed
        cur = FakeCursorOneRow(stock_qty=10, delta=-10)
        monkeypatch.setattr("app.services._one", _one)
        monkeypatch.setattr("app.services._exec", _exec)
        _consume_stock(cur, order_id=42, created_by=1)
        update_queries = [q for q, _ in cur.queries if "UPDATE ingredients" in q]
        assert len(update_queries) == 1

    def test_error_message_contains_ingredient_name(self, monkeypatch):
        cur = FakeCursorOneRow(stock_qty=3, delta=-10)
        monkeypatch.setattr("app.services._one", _one)
        monkeypatch.setattr("app.services._exec", _exec)
        with pytest.raises(BusinessRuleError, match="Tepung"):
            _consume_stock(cur, order_id=42, created_by=1)

    def test_fractional_stock_is_not_truncated(self, monkeypatch):
        cur = FakeCursorOneRow(stock_qty=Decimal("0.5"), delta=Decimal("-0.4"))
        monkeypatch.setattr("app.services._one", _one)
        monkeypatch.setattr("app.services._exec", _exec)
        _consume_stock(cur, order_id=42, created_by=1)
        update_queries = [params for sql, params in cur.queries if "UPDATE ingredients" in sql]
        assert update_queries == [(Decimal("-0.4"), 1)]

    def test_fractional_shortage_is_rejected(self, monkeypatch):
        cur = FakeCursorOneRow(stock_qty=Decimal("0.3"), delta=Decimal("-0.4"))
        monkeypatch.setattr("app.services._one", _one)
        monkeypatch.setattr("app.services._exec", _exec)
        with pytest.raises(BusinessRuleError, match="tersisa 0.3"):
            _consume_stock(cur, order_id=42, created_by=1)
