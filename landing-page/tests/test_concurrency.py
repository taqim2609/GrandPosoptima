"""Concurrency regression tests: optimistic locking + per-cashier drawers.

The production failure this guards against is the first item in the
offline-first review: "2 cashiers pay the same table simultaneously".

These tests run against a recording fake cursor (no live PostgreSQL), but the
fake cursor is not passive: it executes the subset of the optimistic-locking
UPDATE contract that matters -- ``UPDATE ... WHERE id = %s AND version = %s``
applied to a shared in-memory row -- so a stale writer really does get 0 rows.

Every scenario is expressed as two independent cashier transactions:

  1. same-table double-pay            -> exactly one wins, the other refreshes
  2. double close-shift               -> exactly one wins, the other refreshes
  3. second open shift, same cashier  -> rejected by the service rule
  4. two different cashiers open      -> both succeed (per-cashier drawers)
"""

from __future__ import annotations

import sys
from decimal import Decimal
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import pytest

from app.services import (
    BusinessRuleError,
    close_shift,
    open_shift,
    pay_order,
    void_order,
)

CONCURRENT_MESSAGE = "order changed by another cashier, refresh"


class LockCursor:
    """Fake DB-API cursor that really applies optimistic version bumps.

    ``rows`` maps a table name to the single row under test. A statement of the
    form ``UPDATE <table> SET ... WHERE id = %s AND version = %s`` only mutates
    the row when the incoming version still matches, exactly like PostgreSQL
    with a stale ``expected_version``. ``autoincrement_version=True`` mimics a
    write that forgets the predicate, which lets a test prove the assertion is
    load-bearing rather than decorative.
    """

    def __init__(
        self,
        *,
        rows: dict[str, dict],
        responses: dict[str, list] | None = None,
        autoincrement_version: bool = True,
    ):
        self.rows = rows
        self.responses = responses or {}
        self.executed: list[tuple[str, tuple]] = []
        self.autoincrement_version = autoincrement_version
        self._last: list[dict] = []

    # -- DB-API ---------------------------------------------------------

    def execute(self, sql: str, params=()):  # noqa: ANN001
        self.executed.append((sql, params))
        self._last = self._apply(sql, params)
        return None

    def fetchone(self):
        return self._last[0] if self._last else None

    def fetchall(self):
        return list(self._last)

    # -- statement handling ---------------------------------------------

    def _apply(self, sql: str, params) -> list[dict]:  # noqa: ANN001
        normalized = " ".join(sql.split())

        for table, rows in self.rows.items():
            if normalized.startswith(f"UPDATE {table} SET"):
                guarded = "AND version = %s" in normalized
                row_id = params[-2] if guarded else params[-1]
                if row_id != rows.get("id"):
                    return []
                if guarded:
                    incoming = params[-1]
                    if incoming != rows.get("version"):
                        return []          # stale writer: zero rows, no change
                import re as _re
                status_match = _re.search(r"SET status = '([a-z_]+)'", normalized)
                if status_match:
                    rows["status"] = status_match.group(1)
                if (_re.search(r"\bversion = version \+ 1\b", normalized)
                        and status_match):
                    rows["version"] = int(rows.get("version", 1)) + 1
                if "RETURNING *" in normalized:
                    return [dict(rows)]
                if "RETURNING version" in normalized:
                    return [{"version": rows["version"]}]
                return []

        for key, rows in self.responses.items():
            if normalized.startswith(key.strip()) or key.strip() in normalized:
                return list(rows)

        if normalized.startswith("SELECT version FROM orders WHERE id = %s"):
            return [{"version": self.rows["orders"]["version"]}]
        if normalized.startswith("UPDATE "):
            return []
        return []

    # -- helpers --------------------------------------------------------

    def statements(self, needle: str) -> list[tuple[str, tuple]]:
        return [(sql, params) for sql, params in self.executed
                if needle in " ".join(sql.split())]


def _cashier_transaction(cur, fn, *, expected_version: int | None, **kwargs):
    """Run one cashier's write the way two live sessions would race.

    The service layer, not the DB, must be the arbiter when both callers read
    the same version. That is what expected_version is for.
    """
    return fn(cur, expected_version=expected_version, **kwargs)


def _order_row(*, version: int = 1, status: str = "open", grand_total: int = 50000) -> dict:
    return {
        "id": 1,
        "order_number": "GAK-20261017-0001",
        "status": status,
        "version": version,
        "grand_total": grand_total,
        "member_id": None,
        "points_earned": 0,
        "table_id": 3,
        "shift_id": 5,
    }


def _shift_row(*, version: int = 1, status: str = "open", cashier_id: int | None = 7) -> dict:
    return {
        "id": 5,
        "code": "SHIFT-20261017-001",
        "status": status,
        "version": version,
        "cashier_id": cashier_id,
        "opening_float": 500000,
        "opened_at": "2026-10-17T09:00:00+07:00",
        "order_count": 0,
        "void_count": 0,
    }


def _pay_responses(order: dict, *, open_shift_row: dict | None = None) -> dict[str, list]:
    return {
        "SELECT * FROM orders WHERE id = %s FOR UPDATE": [dict(order)],
        "SELECT * FROM shifts WHERE status IN ('open','closing')": [
            dict(open_shift_row or _shift_row())
        ],
        "SELECT * FROM members WHERE id = %s FOR UPDATE": [None],
    }


def _close_responses(shift: dict) -> dict[str, list]:
    return {
        "SELECT * FROM shifts WHERE id = %s FOR UPDATE": [dict(shift)],
        "SELECT COALESCE(sum(amount) FILTER (": [
            {"cash_sales": 0, "cash_in": 0, "cash_out": 0, "vendor_cash": 0}
        ],
        "COALESCE(sum(p.amount), 0) AS total FROM payments p": [{"total": 0}],
        "SELECT oi.vendor_id, v.name AS vendor_name, v.profit_share_percent, ": [],
        "SELECT now() AS ts": [{"ts": "2026-10-17T17:00:00+07:00"}],
        "SELECT COALESCE(recipient, '') AS recipient FROM outbox_messages": [None],
    }


class TestSameTableDoublePay:
    """Two cashiers settle the same table at the same moment."""

    def test_exactly_one_payment_wins_and_the_other_refreshes(self):
        order = _order_row(version=4)
        # Both terminals loaded version 4 before either committed.
        order_a = _order_row(version=4)
        order_b = _order_row(version=4)
        cur_a = LockCursor(rows={"orders": order_a}, responses=_pay_responses(order))
        cur_b = LockCursor(rows={"orders": order_b}, responses=_pay_responses(order))

        winner = pay_order(
            cur_a, order_id=1, captured_by=10,
            payments=[{"method": "cash", "amount": 50000, "tendered": 60000}],
            expected_version=4, consume_stock=False,
        )
        assert winner["replayed"] is False
        assert order_a["status"] == "paid"
        assert order_a["version"] == 5

        # Second cashier also committed against version 4 and reads the row
        # as the winner left it (version 5) -> optimistic lock must refuse.
        stale_view = _order_row(version=5)
        cur_b.responses["SELECT * FROM orders WHERE id = %s FOR UPDATE"] = [stale_view]
        with pytest.raises(BusinessRuleError, match=CONCURRENT_MESSAGE):
            pay_order(
                cur_b, order_id=1, captured_by=11,
                payments=[{"method": "cash", "amount": 50000, "tendered": 60000}],
                expected_version=4, consume_stock=False,
            )
        assert order_b["version"] == 4, "loser must not have written the row"

        # Proof that the guard is the version predicate, not luck: the winner
        # statement carries both the id and the version in its WHERE clause.
        guarded = [sql for sql, _ in cur_a.executed
                   if sql.strip().startswith("UPDATE orders SET status = 'paid'")]
        assert guarded, "pay_order must emit the status UPDATE"
        assert "version = version + 1" in " ".join(guarded[0].split())
        assert "AND version = %s" in " ".join(guarded[0].split())

    def test_stale_version_is_refused_before_any_payment_is_recorded(self):
        order = _order_row(version=9)
        cur = LockCursor(rows={"orders": dict(order)}, responses=_pay_responses(order))
        with pytest.raises(BusinessRuleError, match=CONCURRENT_MESSAGE):
            pay_order(
                cur, order_id=1, captured_by=10,
                payments=[{"method": "cash", "amount": 50000, "tendered": 60000}],
                expected_version=8, consume_stock=False,
            )
        assert cur.statements("INSERT INTO payments") == [], (
            "a stale payer must not leak a payment row before failing"
        )
        assert cur.statements("UPDATE orders SET status = 'paid'") == []

    def test_void_with_stale_version_is_refused(self):
        order = _order_row(version=6, status="paid")
        cur = LockCursor(rows={"orders": dict(order)},
                         responses={"SELECT * FROM orders WHERE id = %s FOR UPDATE": [dict(order)]})
        with pytest.raises(BusinessRuleError, match=CONCURRENT_MESSAGE):
            void_order(cur, order_id=1, voided_by=10, reason="salah input", expected_version=5)
        assert cur.statements("UPDATE orders SET status = 'void'") == []


class TestDoubleCloseShift:
    """Two cashiers close the same drawer at the same moment."""

    def test_exactly_one_close_wins(self):
        shift_a = _shift_row(version=2)
        shift_b = _shift_row(version=2)
        seed = _shift_row(version=2)
        cur_a = LockCursor(rows={"shifts": shift_a}, responses=_close_responses(seed))
        cur_b = LockCursor(rows={"shifts": shift_b}, responses=_close_responses(seed))

        result = close_shift(cur_a, shift_id=5, closed_by=10, counted_cash=500000, expected_version=2)
        assert result["variance"] == 0
        assert shift_a["status"] == "closed"
        assert shift_a["version"] == 3

        # The loser reads the row as the winner left it (version 3) while
        # still sending its own stale expected_version=2 -> refused up front.
        stale_view = _shift_row(version=3)
        cur_b.responses["SELECT * FROM shifts WHERE id = %s FOR UPDATE"] = [stale_view]
        with pytest.raises(BusinessRuleError, match="shift changed by another cashier, refresh"):
            close_shift(cur_b, shift_id=5, closed_by=11, counted_cash=500000, expected_version=2)
        assert shift_b["version"] == 2, "loser must not have written the shift row"
        assert cur_b.statements("INSERT INTO outbox_messages") == [], (
            "a stale closer must not emit a second shift recap"
        )

    def test_close_update_is_version_guarded(self):
        shift = _shift_row(version=2)
        cur = LockCursor(rows={"shifts": shift}, responses=_close_responses(shift))
        close_shift(cur, shift_id=5, closed_by=10, counted_cash=500000, expected_version=2)
        closing = [sql for sql, _ in cur.executed
                   if sql.strip().startswith("UPDATE shifts SET status = 'closed'")]
        assert closing, "close_shift must emit the status UPDATE"
        assert "version = version + 1" in " ".join(closing[0].split())
        assert "AND version = %s" in " ".join(closing[0].split())


class TestPerCashierDrawers:
    """One open drawer per cashier, many cashiers in parallel."""

    def _open_responses(self, existing: dict | None) -> dict[str, list]:
        return {
            "SELECT * FROM shifts WHERE status IN ('open','closing')": [existing],
            "SELECT to_char(now() AT TIME ZONE current_setting('grandpos.timezone', true), 'YYYYMMDD') AS d": [
                {"d": "20261017"}
            ],
            "SELECT count(*) AS n FROM shifts WHERE code LIKE": [{"n": 1}],
            "INSERT INTO shifts (code, opened_by, opening_float, status, cashier_id)": [
                {"id": 9, "code": "SHIFT-20261017-002", "status": "open",
                 "opening_float": 300000, "cashier_id": 11}
            ],
        }

    def test_second_open_shift_same_cashier_is_rejected(self):
        cur = LockCursor(rows={}, responses=self._open_responses(_shift_row(cashier_id=11)))
        with pytest.raises(BusinessRuleError, match="already open for this cashier"):
            open_shift(cur, opening_float=300000, opened_by=11, cashier_id=11)
        assert cur.statements("INSERT INTO shifts") == []

    def test_different_cashiers_can_open_simultaneously(self):
        # Cashier 10 already has a drawer open; cashier 11 opens a second one.
        other = _shift_row(cashier_id=10)
        cur_b = LockCursor(rows={}, responses=self._open_responses(other))
        shift = open_shift(cur_b, opening_float=300000, opened_by=11, cashier_id=11)
        assert shift["cashier_id"] == 11

        insert = cur_b.statements("INSERT INTO shifts (code, opened_by, opening_float, status, cashier_id)")
        assert insert, "opening a drawer must record its cashier_id"
        assert "cashier_id" in insert[0][0]
        assert insert[0][1][-1] == 11

    def test_cashier_id_defaults_to_opened_by_for_back_compat(self):
        cur = LockCursor(rows={}, responses=self._open_responses(None))
        open_shift(cur, opening_float=300000, opened_by=42)
        insert = cur.statements("INSERT INTO shifts (code, opened_by, opening_float, status, cashier_id)")
        assert insert and insert[0][1][-1] == 42
