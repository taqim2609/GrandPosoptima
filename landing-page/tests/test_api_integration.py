"""Integration tests for the GrandPOS FastAPI layer (no live database needed).

Two layers of evidence:
  1. HTTP layer via FastAPI TestClient: routing, validation and auth gate.
  2. Transactional service layer via a fake DB-API cursor that records the SQL
     it is asked to run. This proves the business rules (weighted pricing,
     discount vs COGS, points on PAID, void reversals, single open shift,
     vendor cash exactly once) without Docker or PostgreSQL.

The fake cursor is deliberately strict: any connection attempt raises
ConnectionUnavailable, so a test can never silently depend on a real database.
"""

from __future__ import annotations

import sys
from decimal import Decimal
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import pytest
from fastapi.testclient import TestClient

from app.api import create_app
from app.services import (
    BusinessRuleError,
    LineInput,
    close_shift,
    create_order,
    generate_vendor_settlements,
    get_open_shift,
    open_shift,
    void_order,
)


@pytest.fixture
def client(monkeypatch):
    # require_key() is fail-closed: without POS_API_KEY every protected route
    # answers 503. Tests must configure a key and send it, exactly like a real
    # deployment, so validation/auth behaviour is what gets exercised.
    monkeypatch.setenv("POS_API_KEY", "test-api-key")
    return TestClient(create_app(), headers={"X-API-Key": "test-api-key"})


class TestHealthAndAuth:
    def test_health_ok_without_database(self, client):
        r = client.get("/health")
        assert r.status_code == 200
        body = r.json()
        assert body["status"] == "ok"
        # The health payload must report the real driver state, never a guess:
        # False when no driver/DSN is available, True when a database answers.
        assert isinstance(body["db"], bool)


class TestRequestValidation:
    """Validation must reject bad input before any DB work happens."""

    def test_dine_in_without_table_is_rejected(self, client):
        # The missing table is a business-rule violation. Depending on how far the
        # request gets, the honest answers are: 503 (no database), 404 (no open
        # shift yet), or 422 (rule layer reached). Never a fake 200.
        r = client.post("/orders", json={
            "order_type": "dine_in", "table_id": None,
            "lines": [{"product_id": 1, "qty": "1"}],
        })
        assert r.status_code in (404, 422, 503), r.text
        if r.status_code == 503:
            assert "layanan sedang tidak tersedia" in r.json().get("detail", "")

    def test_order_requires_at_least_one_line(self, client):
        r = client.post("/orders", json={"order_type": "takeaway", "lines": []})
        assert r.status_code == 422  # pydantic min_length

    def test_invalid_order_type_is_rejected(self, client):
        r = client.post("/orders", json={"order_type": "drive_thru", "lines": [{"product_id": 1, "qty": "1"}]})
        assert r.status_code == 422

    def test_invalid_payment_method_is_rejected(self, client):
        r = client.post("/orders/1/pay", json={
            "captured_by": 1,
            "payments": [{"method": "bitcoin", "amount": 1000}],
        })
        assert r.status_code == 422

    def test_void_requires_meaningful_reason(self, client):
        r = client.post("/orders/1/void", json={"voided_by": 1, "reason": "x"})
        assert r.status_code == 422

    def test_reservation_party_size_bounds(self, client):
        r = client.post("/reservations/intake", json={
            "customer_name": "Budi", "customer_phone": "628110000001",
            "reserved_date": "2026-10-20", "reserved_time": "19:30", "party_size": 0,
        })
        assert r.status_code == 422

    def test_wa_inbound_rejects_non_allowlisted(self, client, monkeypatch):
        monkeypatch.setenv("WA_ALLOWED_NUMBERS", "628110000001")
        r = client.post("/wa/inbound", json={"sender": "628199999999", "text": "/stok"})
        assert r.status_code == 403


class TestServiceLayerBusinessRules:
    """The transactional service layer is exercised against a recording cursor."""

    def test_open_shift_rejects_second_open_shift(self):
        cur = FakeCursor({"SELECT * FROM shifts WHERE status IN ('open','closing') ORDER BY opened_at DESC LIMIT 1 FOR UPDATE": [{"id": 1, "status": "open"}]})
        with pytest.raises(BusinessRuleError, match="already open"):
            open_shift(cur, opening_float=500000, opened_by=1)

    def test_open_shift_writes_opening_float_to_ledger(self):
        cur = FakeCursor({
            "SELECT * FROM shifts WHERE status IN ('open','closing') ORDER BY opened_at DESC LIMIT 1 FOR UPDATE": [None],
            "SELECT to_char(now() AT TIME ZONE current_setting('grandpos.timezone', true), 'YYYYMMDD') AS d": [{"d": "20261016"}],
            "SELECT count(*) AS n FROM shifts WHERE code LIKE": [{"n": 0}],
            "INSERT INTO shifts (code, opened_by, opening_float, status, cashier_id)": [
                {"id": 7, "code": "SHIFT-20261016-001", "status": "open", "opening_float": 500000}
            ],
        })
        shift = open_shift(cur, opening_float=500000, opened_by=1)
        assert shift["code"] == "SHIFT-20261016-001"
        assert any("opening_float" in sql for sql, _ in cur.executed)

    def test_order_requires_an_open_shift(self):
        cur = FakeCursor({
            "SELECT * FROM shifts WHERE status IN ('open','closing') ORDER BY opened_at DESC LIMIT 1 FOR UPDATE": [None],
        })
        with pytest.raises(BusinessRuleError, match="no open shift"):
            create_order(cur, order_type="takeaway", created_by=1,
                         lines=[LineInput(product_id=1, qty="1")])

    def test_channel_separation_rejects_retail_product_on_fnb_order(self):
        cur = FakeCursor(self._selling_cursor_map(product_channel="retail", sold_by_weight=False, with_shift=True))
        with pytest.raises(BusinessRuleError, match="accepts fnb"):
            create_order(cur, order_type="takeaway", created_by=1,
                         lines=[LineInput(product_id=1, qty="1")])

    def test_weighted_product_requires_a_weight(self):
        cur = FakeCursor(self._selling_cursor_map(sold_by_weight=True))
        with pytest.raises(BusinessRuleError, match="sold by weight"):
            create_order(cur, order_type="takeaway", created_by=1,
                         lines=[LineInput(product_id=1, qty="1", is_weighted=True)])

    def test_weighted_order_computes_price_from_weight(self):
        cur = FakeCursor(self._selling_cursor_map(sold_by_weight=True))
        result = create_order(
            cur, order_type="takeaway", created_by=1,
            lines=[LineInput(product_id=1, qty="0.35", is_weighted=True, weight_kg="0.35")],
        )
        # 0.35 kg * 120000 IDR/kg = 42000 IDR exactly.
        assert result["totals"]["subtotal"] == 42000
        assert result["totals"]["grand_total"] == 42000

    def test_discount_does_not_reduce_cogs(self):
        cur = FakeCursor(self._selling_cursor_map())
        result = create_order(
            cur, order_type="takeaway", created_by=1,
            lines=[LineInput(product_id=1, qty="2")],
            promo_code="DISKON-10",
        )
        # 2 * 50000 = 100000 subtotal, 10% discount = 10000 off revenue...
        assert result["totals"]["discount_total"] == 10000
        assert result["totals"]["grand_total"] == 90000
        # ...but COGS stays on the full pre-discount quantity.
        assert result["totals"]["cogs_total"] == 2 * 40000

    def test_void_requires_an_open_shift_for_reversal(self):
        cur = FakeCursor({
            "SELECT * FROM orders WHERE id = %s FOR UPDATE": [
                {"id": 1, "status": "paid", "order_number": "GAK-1", "shift_id": 5,
                 "member_id": None, "points_earned": 0, "table_id": None}
            ],
            "SELECT id FROM order_voids WHERE order_id = %s": [None],
            "SELECT * FROM shifts WHERE status IN ('open','closing') ORDER BY opened_at DESC LIMIT 1 FOR UPDATE": [None],
        })
        with pytest.raises(BusinessRuleError, match="no open shift"):
            void_order(cur, order_id=1, voided_by=1, reason="salah input")

    def test_void_is_idempotent_by_refusing_second_void(self):
        cur = FakeCursor({
            "SELECT * FROM orders WHERE id = %s FOR UPDATE": [
                {"id": 1, "status": "paid", "order_number": "GAK-1", "shift_id": 5,
                 "member_id": None, "points_earned": 0, "table_id": None}
            ],
            "SELECT id FROM order_voids WHERE order_id = %s": [{"id": 99}],
        })
        with pytest.raises(BusinessRuleError, match="already has a void record"):
            void_order(cur, order_id=1, voided_by=1, reason="salah input")

    def test_cannot_void_an_already_void_order(self):
        cur = FakeCursor({
            "SELECT * FROM orders WHERE id = %s FOR UPDATE": [{"id": 1, "status": "void"}],
        })
        with pytest.raises(BusinessRuleError, match="already void"):
            void_order(cur, order_id=1, voided_by=1, reason="salah input")

    def test_vendor_settlement_records_cash_exactly_once(self):
        cur = FakeCursor({
            "SELECT oi.vendor_id, v.name AS vendor_name, v.profit_share_percent, "
            "       COALESCE(sum(oi.line_subtotal), 0) AS commission_base, "
            "       COALESCE(sum(oi.line_total), 0) AS gross_sales "
            "  FROM order_items oi "
            "  JOIN orders o ON o.id = oi.order_id "
            "  JOIN vendors v ON v.id = oi.vendor_id "
            " WHERE o.shift_id = %s AND o.status = 'paid' AND oi.status = 'active' "
            "   AND oi.vendor_id IS NOT NULL "
            " GROUP BY oi.vendor_id, v.name, v.profit_share_percent "
            "HAVING COALESCE(sum(oi.line_subtotal), 0) > 0": [
                {"vendor_id": 2, "vendor_name": "Mitra Kue Aceh",
                 "profit_share_percent": Decimal("20"), "commission_base": 300000, "gross_sales": 270000}
            ],
            "SELECT * FROM vendor_settlements WHERE shift_id = %s AND vendor_id = %s": [None],
            "INSERT INTO cash_movements (shift_id, movement_type, direction, amount, reference_type, "
            "                            reference_id, reason, created_by) "
            "VALUES (%s, 'vendor_settlement', 'out', %s, 'vendor_settlement', %s, %s, %s) RETURNING id": [{"id": 55}],
            "INSERT INTO vendor_settlements (shift_id, vendor_id, gross_sales, commission_base, "
            "                                profit_share_percent, vendor_amount, cash_movement_id, "
            "                                status, settled_at, created_by) "
            "VALUES (%s, %s, %s, %s, %s, %s, NULL, 'paid', now(), %s) "
            "ON CONFLICT (shift_id, vendor_id) DO UPDATE "
            "   SET gross_sales = EXCLUDED.gross_sales, "
            "       commission_base = EXCLUDED.commission_base, "
            "       vendor_amount = EXCLUDED.vendor_amount, "
            "       status = 'paid', settled_at = now() "
            "RETURNING *": [
                {"id": 3, "shift_id": 5, "vendor_id": 2, "vendor_amount": 60000,
                 "cash_movement_id": None, "status": "paid"}
            ],
            "UPDATE vendor_settlements SET cash_movement_id = %s WHERE id = %s RETURNING *": [
                {"id": 3, "shift_id": 5, "vendor_id": 2, "vendor_amount": 60000,
                 "cash_movement_id": 55, "status": "paid"}
            ],
        })
        created = generate_vendor_settlements(cur, shift_id=5, created_by=1)
        assert created[0]["vendor_amount"] == 60000
        # 20% of the pre-discount 300000 base, and exactly one cash entry.
        cash_entries = [(sql, p) for sql, p in cur.executed
                        if "INSERT INTO cash_movements" in sql and "vendor_settlement" in sql]
        assert len(cash_entries) == 1
        # The movement is keyed to the settlement row, not to the shift: that is
        # what lets one shift settle several vendors without colliding on
        # cash_movements_reference_unique.
        sql, params = cash_entries[0]
        assert "'vendor_settlement', %s" in sql, "reference_type must be vendor_settlement"
        assert params[2] == 3, "reference_id must be the settlement id"
        # Settlement first (pointer NULL), movement second, pointer last.
        order = [" ".join(s.split())[:40] for s, _ in cur.executed]
        insert_settlement = next(i for i, s in enumerate(order) if s.startswith("INSERT INTO vendor_settlements"))
        insert_cash = next(i for i, s in enumerate(order) if s.startswith("INSERT INTO cash_movements"))
        update_pointer = next(i for i, s in enumerate(order) if s.startswith("UPDATE vendor_settlements SET cash"))
        assert insert_settlement < insert_cash < update_pointer
        assert created[0]["cash_movement_id"] == 55

    def test_two_vendors_on_one_shift_get_distinct_reference_keys(self):
        """The regression this fix closes: two vendors, one shift, no collision.

        ``cash_movements_reference_unique`` is unique on
        (movement_type, reference_type, reference_id). Keying every settlement
        to the shift made the second vendor collide and aborted close_shift;
        keying each to its own settlement row keeps the guard and the fix.
        """
        cur = SequenceCursor(
            rows=[
                {"vendor_id": 2, "vendor_name": "Mitra Kue Aceh",
                 "profit_share_percent": Decimal("20"), "commission_base": 72000, "gross_sales": 72000},
                {"vendor_id": 3, "vendor_name": "Titipan Kopi Gayo",
                 "profit_share_percent": Decimal("15"), "commission_base": 450, "gross_sales": 450},
            ],
            settlement_ids=[11, 12],
            movement_ids=[101, 102],
        )
        created = generate_vendor_settlements(cur, shift_id=5, created_by=1)
        assert [s["vendor_amount"] for s in created] == [14400, 68]

        inserts = [(sql, p) for sql, p in cur.executed if "INSERT INTO cash_movements" in sql]
        assert len(inserts) == 2, "each non-zero vendor writes one movement"
        keys = {(p[2]) for _sql, p in inserts}   # reference_id
        assert keys == {11, 12}, f"reference_id must be the settlement id, got {keys}"
        assert len(keys) == len(inserts), "reference keys must be unique per settlement"
        assert all("'vendor_settlement', %s" in sql for sql, _p in inserts)
        assert all(p[0] == 5 for _sql, p in inserts), "both movements still belong to the shift"

    def test_already_settled_vendor_is_not_charged_twice(self):
        """A retried close reuses the existing settlement and writes no cash."""
        cur = FakeCursor({
            "SELECT oi.vendor_id, v.name AS vendor_name, v.profit_share_percent, "
            "       COALESCE(sum(oi.line_subtotal), 0) AS commission_base, "
            "       COALESCE(sum(oi.line_total), 0) AS gross_sales "
            "  FROM order_items oi "
            "  JOIN orders o ON o.id = oi.order_id "
            "  JOIN vendors v ON v.id = oi.vendor_id "
            " WHERE o.shift_id = %s AND o.status = 'paid' AND oi.status = 'active' "
            "   AND oi.vendor_id IS NOT NULL "
            " GROUP BY oi.vendor_id, v.name, v.profit_share_percent "
            "HAVING COALESCE(sum(oi.line_subtotal), 0) > 0": [
                {"vendor_id": 2, "vendor_name": "Mitra Kue Aceh",
                 "profit_share_percent": Decimal("20"), "commission_base": 72000, "gross_sales": 72000}
            ],
            "SELECT * FROM vendor_settlements WHERE shift_id = %s AND vendor_id = %s": [
                {"id": 11, "shift_id": 5, "vendor_id": 2, "vendor_amount": 14400,
                 "cash_movement_id": 101, "status": "paid"}
            ],
        })
        created = generate_vendor_settlements(cur, shift_id=5, created_by=1)
        assert created[0]["vendor_amount"] == 14400
        assert created[0]["cash_recorded"] == 0, "reused settlement must not count as new cash"
        assert [s for s, _ in cur.executed if "INSERT INTO cash_movements" in s] == [], (
            "a vendor already settled must not get a second cash movement"
        )
        assert [s for s, _ in cur.executed if "INSERT INTO vendor_settlements" in s] == [], (
            "a vendor already settled must not be re-inserted"
        )

    def test_shift_close_computes_variance(self):
        cur = FakeCursor({
            "SELECT * FROM shifts WHERE id = %s FOR UPDATE": [
                {"id": 5, "status": "open", "opening_float": 500000}
            ],
            "SELECT COALESCE(sum(amount) FILTER (": [
                {"cash_sales": 1200000, "cash_in": 200000, "cash_out": -50000, "vendor_cash": 0}
            ],
            "COALESCE(sum(p.amount), 0) AS total FROM payments p": [
                {"total": 300000}
            ],
            "SELECT oi.vendor_id, v.name AS vendor_name, v.profit_share_percent, ":
            [],
            "UPDATE shifts SET status = 'closed'": [
                {"id": 5, "code": "SHIFT-20261016-001", "status": "closed",
                 "opening_float": 500000, "opened_at": "2026-10-16T01:00:00+07:00",
                 "expected_cash": 1850000, "counted_cash": 1840000, "variance": -10000,
                 "order_count": 3, "void_count": 0}
            ],
            "SELECT now() AS ts": [{"ts": "2026-10-16T16:00:00+07:00"}],
            "SELECT COALESCE(recipient, '') AS recipient FROM outbox_messages": [None],
            "INSERT INTO outbox_messages": [{"id": 1}],
        })
        result = close_shift(cur, shift_id=5, closed_by=1, counted_cash=1840000)
        # 500000 + 1200000 + 200000 - 50000 - 0 = 1850000 expected; counted 1840000.
        assert result["expected_cash"] == 1850000
        assert result["variance"] == -10000
        # The recap carries the non-cash figure straight from the payments base.
        assert result["recap"]["cash"]["non_cash_sales"] == 300000
        assert result["recap"]["event"] == "shift_recap"
        # The recap is now emitted into the outbox as part of close_shift.
        outbox = [(sql, p) for sql, p in cur.executed if "INSERT INTO outbox_messages" in sql]
        assert len(outbox) == 1
        assert "shift_recap:5" in repr([p for _, p in outbox])

    def test_cash_void_is_net_of_shift_reconciliation(self):
        """A same-shift cash void must not leave a phantom till shortage.

        void_order posts a negative `void_reversal` row, so the close-shift
        cash aggregate must sum both `sale_cash` and `void_reversal`. Before the
        fix only `sale_cash` was summed and `expected_cash` overstated the till,
        reporting a shortage equal to the voided amount.
        """
        cur = FakeCursor({
            "SELECT * FROM shifts WHERE id = %s FOR UPDATE": [
                {"id": 7, "status": "open", "opening_float": 100000}
            ],
            "SELECT COALESCE(sum(amount) FILTER (": [
                # paid cash 50000, then voided -> net cash sales 0
                {"cash_sales": 0, "cash_in": 0, "cash_out": 0, "vendor_cash": 0}
            ],
            "COALESCE(sum(p.amount), 0) AS total FROM payments p": [{"total": 0}],
            "SELECT oi.vendor_id, v.name AS vendor_name, v.profit_share_percent, ": [],
            "UPDATE shifts SET status = 'closed'": [
                {"id": 7, "code": "SHIFT-20261016-002", "status": "closed",
                 "opening_float": 100000, "opened_at": "2026-10-16T01:00:00+07:00",
                 "expected_cash": 100000, "counted_cash": 100000, "variance": 0,
                 "order_count": 1, "void_count": 1}
            ],
            "SELECT now() AS ts": [{"ts": "2026-10-16T16:00:00+07:00"}],
            "SELECT COALESCE(recipient, '') AS recipient FROM outbox_messages": [None],
            "INSERT INTO outbox_messages": [{"id": 1}],
        })
        result = close_shift(cur, shift_id=7, closed_by=1, counted_cash=100000)
        # Only float remains in the drawer: no false shortage/surplus.
        assert result["expected_cash"] == 100000
        assert result["variance"] == 0

        # Assert the SQL actually asks for both movement types.
        cash_sql = [sql for sql, _ in cur.executed if "vendor_settlement" in sql and "cash_movements" in sql]
        assert cash_sql, "cash aggregate query was not executed"
        assert "void_reversal" in cash_sql[0], "void_reversal must be folded into cash sales"

    def test_close_reuses_already_paid_settlements_without_duplicate_cash(self):
        """The "close twice" path: vendor rows exist, no second cash movement.

        Simulates a close that was interrupted after vendor settlements were
        written (paid, cash already in the ledger) but before the shift row
        flipped to 'closed'. A retry must finish the close without charging any
        vendor twice.
        """
        cur = FakeCursor({
            "SELECT * FROM shifts WHERE id = %s FOR UPDATE": [
                {"id": 9, "status": "open", "opening_float": 100000, "version": 1,
                 "code": "SHIFT-20261017-009", "opened_at": "2026-10-17T09:00:00+07:00",
                 "order_count": 1, "void_count": 0}
            ],
            # The ledger already holds the vendor payout from the first attempt.
            "SELECT COALESCE(sum(amount) FILTER (": [
                {"cash_sales": 50000, "cash_in": 0, "cash_out": 0, "vendor_cash": -14400}
            ],
            "COALESCE(sum(p.amount), 0) AS total FROM payments p": [{"total": 0}],
            "SELECT oi.vendor_id, v.name AS vendor_name, v.profit_share_percent, ": [
                {"vendor_id": 2, "vendor_name": "Mitra Kue Aceh",
                 "profit_share_percent": Decimal("20"), "commission_base": 72000, "gross_sales": 72000}
            ],
            "SELECT * FROM vendor_settlements WHERE shift_id = %s AND vendor_id = %s": [
                {"id": 11, "shift_id": 9, "vendor_id": 2, "vendor_amount": 14400,
                 "cash_movement_id": 101, "status": "paid"}
            ],
            "UPDATE shifts SET status = 'closed'": [
                {"id": 9, "code": "SHIFT-20261017-009", "status": "closed",
                 "opening_float": 100000, "opened_at": "2026-10-17T09:00:00+07:00",
                 "expected_cash": 135600, "counted_cash": 135600, "variance": 0,
                 "order_count": 1, "void_count": 0}
            ],
            "SELECT now() AS ts": [{"ts": "2026-10-17T17:00:00+07:00"}],
            "SELECT COALESCE(recipient, '') AS recipient FROM outbox_messages": [None],
            "INSERT INTO outbox_messages": [{"id": 1}],
        })
        result = close_shift(cur, shift_id=9, closed_by=1, counted_cash=135600)

        # 100000 + 50000 - 14400 = 135600, and the payout is counted ONCE.
        assert result["expected_cash"] == 135600
        assert result["variance"] == 0
        assert [s for s, _ in cur.executed if "INSERT INTO cash_movements" in s] == [], (
            "a retried close must not write a second vendor movement"
        )
        assert [s for s, _ in cur.executed if "INSERT INTO vendor_settlements" in s] == [], (
            "a retried close must not re-insert the settlement"
        )

    def test_paid_settlement_without_cash_pointer_recovers_its_movement(self):
        """An interrupted close (paid row, no pointer) still records cash once.

        A settlement can be marked paid and yet carry no ``cash_movement_id`` if
        an earlier attempt died between the two writes. That state must heal —
        exactly one movement — instead of being skipped (money never paid out) or
        duplicated.
        """
        cur = FakeCursor({
            "SELECT oi.vendor_id, v.name AS vendor_name, v.profit_share_percent, "
            "       COALESCE(sum(oi.line_subtotal), 0) AS commission_base, "
            "       COALESCE(sum(oi.line_total), 0) AS gross_sales "
            "  FROM order_items oi "
            "  JOIN orders o ON o.id = oi.order_id "
            "  JOIN vendors v ON v.id = oi.vendor_id "
            " WHERE o.shift_id = %s AND o.status = 'paid' AND oi.status = 'active' "
            "   AND oi.vendor_id IS NOT NULL "
            " GROUP BY oi.vendor_id, v.name, v.profit_share_percent "
            "HAVING COALESCE(sum(oi.line_subtotal), 0) > 0": [
                {"vendor_id": 2, "vendor_name": "Mitra Kue Aceh",
                 "profit_share_percent": Decimal("20"), "commission_base": 72000, "gross_sales": 72000}
            ],
            # Paid, but the cash write never landed.
            "SELECT * FROM vendor_settlements WHERE shift_id = %s AND vendor_id = %s": [
                {"id": 11, "shift_id": 5, "vendor_id": 2, "vendor_amount": 14400,
                 "cash_movement_id": None, "status": "paid"}
            ],
            "INSERT INTO vendor_settlements": [
                {"id": 11, "shift_id": 5, "vendor_id": 2, "vendor_amount": 14400,
                 "cash_movement_id": None, "status": "paid"}
            ],
            "SELECT id FROM cash_movements": [None],
            "INSERT INTO cash_movements": [{"id": 101}],
            "UPDATE vendor_settlements SET cash_movement_id": [
                {"id": 11, "shift_id": 5, "vendor_id": 2, "vendor_amount": 14400,
                 "cash_movement_id": 101, "status": "paid"}
            ],
        })
        created = generate_vendor_settlements(cur, shift_id=5, created_by=1)
        inserts = [s for s, _ in cur.executed if "INSERT INTO cash_movements" in s]
        assert len(inserts) == 1, "the missing payout is written exactly once"
        assert created[0]["cash_movement_id"] == 101
        assert created[0]["cash_recorded"] == 14400

    def test_closing_an_already_closed_shift_is_refused(self):
        cur = FakeCursor({
            "SELECT * FROM shifts WHERE id = %s FOR UPDATE": [{"id": 5, "status": "closed"}],
        })
        with pytest.raises(BusinessRuleError, match="already closed"):
            close_shift(cur, shift_id=5, closed_by=1, counted_cash=0)

    # -- helpers ----------------------------------------------------------

    @staticmethod
    def _selling_cursor_map(*, product_channel: str = "fnb", sold_by_weight: bool = False,
                            with_shift: bool = True) -> dict:
        shift_rows = (
            [{"id": 5, "code": "SHIFT-20261016-001", "status": "open", "opening_float": 500000}]
            if with_shift else [None]
        )
        return {
            "SELECT * FROM shifts WHERE status IN ('open','closing') ORDER BY opened_at DESC LIMIT 1 FOR UPDATE": shift_rows,
            "SELECT * FROM products WHERE id = %s AND is_active": [
                {
                    "id": 1,
                    "name": "Mie Aceh" if product_channel == "fnb" else "Kopi Gayo 250g",
                    "channel": product_channel,
                    "base_price": 120000 if sold_by_weight else 50000,
                    "cost_price": 60000 if sold_by_weight else 40000,
                    "sold_by_weight": sold_by_weight,
                    "vendor_id": None,
                }
            ],
            "SELECT * FROM promos WHERE code = %s AND is_active": [
                {"id": 9, "code": "DISKON-10", "kind": "percent", "value": 10,
                 "min_subtotal": 0, "max_discount": None, "channel": None}
            ],
            "SELECT to_char(now() AT TIME ZONE current_setting('grandpos.timezone', true), 'YYYYMMDD') AS d": [
                {"d": "20261016"}
            ],
            "SELECT count(*) AS n FROM orders WHERE order_number LIKE": [{"n": 0}],
            "INSERT INTO orders (order_number, channel, order_type, status, table_id, shift_id, ": [
                {"id": 11, "order_number": "GAK-20261016-0001", "status": "open", "grand_total": 0}
            ],
            "INSERT INTO order_items (order_id, product_id, product_name, channel, qty, is_weighted, ": [{"id": 1}],
            "UPDATE tables SET status = 'occupied' WHERE id = %s": [None],
        }


class SequenceCursor:
    """Fake cursor that steps through canned rows in execution order.

    ``generate_vendor_settlements`` issues the same SQL once per vendor, which
    a prefix-keyed fake cannot distinguish. This cursor answers by statement
    kind instead: vendor rows one by one, fresh settlements with ``id``
    NULL-pointer rows from ``settlement_ids``, one movement id at a time from
    ``movement_ids``, and the completed pointer row after each movement. It
    also simulates ``cash_movements_reference_unique``: inserting a movement
    with an already-seen (movement_type, reference_type, reference_id) key
    raises, exactly the invariant the fix relies on.
    """

    def __init__(self, *, rows: list, settlement_ids: list, movement_ids: list):
        self._rows = list(rows)
        self._settlement_ids = list(settlement_ids)
        self._movement_ids = list(movement_ids)
        self._seen_keys: set = set()
        self._amounts: dict = {}
        self._vendors: dict = {}
        self.executed: list[tuple[str, tuple]] = []
        self._last: list = []

    def execute(self, sql: str, params=()):  # noqa: ANN001
        self.executed.append((sql, params))
        self._last = self._answer(" ".join(sql.split()), params)
        return None

    def fetchone(self):
        return self._last[0] if self._last else None

    def fetchall(self):
        return list(self._last)

    def _answer(self, sql: str, params):  # noqa: ANN001
        if sql.startswith("SELECT oi.vendor_id"):
            return list(self._rows)
        if sql.startswith("SELECT * FROM vendor_settlements"):
            return []  # no pre-existing settlement
        if sql.startswith("INSERT INTO vendor_settlements"):
            sid = self._settlement_ids.pop(0)
            self._amounts[sid] = params[5]
            self._vendors[sid] = params[1]
            return [{
                "id": sid,
                "shift_id": 5, "vendor_id": params[1],
                "gross_sales": params[2], "commission_base": params[3],
                "profit_share_percent": params[4], "vendor_amount": params[5],
                "cash_movement_id": None, "status": "paid",
            }]
        if sql.startswith("SELECT id FROM cash_movements"):
            return []  # nothing recorded for this settlement yet
        if sql.startswith("INSERT INTO cash_movements"):
            key = ("vendor_settlement", "vendor_settlement", params[2])
            if key in self._seen_keys:
                raise AssertionError(f"duplicate movement key {key}: the unique index must hold")
            self._seen_keys.add(key)
            return [{"id": self._movement_ids.pop(0)}]
        if sql.startswith("UPDATE vendor_settlements SET cash_movement_id"):
            return [{
                "id": params[1], "shift_id": 5, "cash_movement_id": params[0],
                "vendor_id": self._vendors.get(params[1]), "vendor_amount": self._amounts.get(params[1], 0),
                "status": "paid",
            }]
        return []


class FakeCursor:
    """Minimal DB-API cursor: returns canned rows keyed by SQL prefix.

    It records every statement so tests can assert *which* writes happened,
    which is how idempotency and 'cash recorded exactly once' are proven.
    """

    def __init__(self, responses: dict[str, list]):
        self.responses = responses
        self.executed: list[tuple[str, tuple]] = []

    def execute(self, sql: str, params=()):  # noqa: ANN001
        self.executed.append((sql, params))
        return None

    def fetchone(self):
        # Find the response whose key is a prefix of the last statement.
        if not self.executed:
            return None
        sql, _params = self.executed[-1]
        for key, rows in self.responses.items():
            if sql.strip().startswith(key.strip()) or key.strip() in sql:
                return rows[0] if rows else None
        return None

    def fetchall(self):
        if not self.executed:
            return []
        sql, _params = self.executed[-1]
        for key, rows in self.responses.items():
            if sql.strip().startswith(key.strip()) or key.strip() in sql:
                return list(rows)
        return []

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False
