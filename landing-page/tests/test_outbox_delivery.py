"""Offline-first step 2: outbox decoupling, backoff, dedupe, concurrent claim.

These tests pin the delivery contract from AI Studio R2:

  1. An outbox failure must NEVER fail a payment or a shift close.
  2. The same delivery key sent twice results in exactly ONE outbox row.
  3. The retry backoff schedule is 1m / 5m / 15m and matches its SQL twin.
  4. Two workers claiming concurrently: one message, one winner.

No live PostgreSQL is required. ``SavepointCursor`` models the part of
PostgreSQL that matters here: a statement after ROLLBACK TO SAVEPOINT would
abort in psycopg3, so the fake rolls back its recorded effects too. That is what
proves the enclosing business transaction survives an outbox failure instead of
just asserting that an exception was swallowed.
"""

from __future__ import annotations

import importlib
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import pytest

from app import outbox_delivery
from app.outbox_delivery import (
    BACKOFF_SCHEDULE,
    MAX_ATTEMPTS,
    backoff_seconds,
    claim_due_messages,
    due_at_expression,
    enqueue_best_effort,
    enqueue_receipt,
    enqueue_shift_recap,
    outbox_enabled,
)
from app.services import close_shift, pay_order


# ---------------------------------------------------------------------------
# Fakes
# ---------------------------------------------------------------------------

class Boom(RuntimeError):
    """Simulated outbox infrastructure failure."""


class AbortedTransaction(RuntimeError):
    """A SQL error aborted the current PostgreSQL transaction."""


class SavepointCursor:
    """Fake cursor with real savepoint semantics.

    ``fail_on`` is a substring; any statement containing it raises ``Boom`` and
    aborts the current transaction. Further statements raise
    ``AbortedTransaction`` until ROLLBACK TO SAVEPOINT clears that state, so a
    test cannot pass by merely swallowing the original SQL error.
    """

    def __init__(self, responses: dict[str, list] | None = None, *, fail_on: str | None = None):
        self.responses = responses or {}
        self.fail_on = fail_on
        self.executed: list[tuple[str, tuple]] = []
        self.savepoints: list[str] = []
        self.released: set[str] = set()
        self.aborted = False
        self._last: list[dict] = []

    # -- DB-API ---------------------------------------------------------

    def execute(self, sql: str, params=()):  # noqa: ANN001
        self.executed.append((sql, params))
        normalized = " ".join(sql.split()).upper()

        if normalized.startswith("ROLLBACK TO SAVEPOINT "):
            self.aborted = False
            self._last = []
            return None
        if self.aborted:
            raise AbortedTransaction("current transaction is aborted")
        if normalized.startswith("SAVEPOINT "):
            name = normalized.split()[-1]
            self.savepoints.append(name)
            self._last = []
            return None
        if normalized.startswith("RELEASE SAVEPOINT "):
            self.released.add(normalized.split()[-1])
            self._last = []
            return None

        if self.fail_on and self.fail_on in sql:
            self.aborted = True
            raise Boom(f"simulated outbox failure on: {self.fail_on}")

        self._last = self._rows_for(sql)
        return None

    def fetchone(self):
        return self._last[0] if self._last else None

    def fetchall(self):
        return list(self._last)

    # -- helpers --------------------------------------------------------

    def _rows_for(self, sql: str) -> list[dict]:
        for key, rows in self.responses.items():
            if key in sql:
                return list(rows)
        if sql.strip().upper().startswith("UPDATE "):
            return []
        return []

    def statements(self, needle: str) -> list[tuple[str, tuple]]:
        return [(sql, params) for sql, params in self.executed
                if needle in " ".join(sql.split())]


def _close_responses() -> dict[str, list]:
    return {
        "SELECT * FROM shifts WHERE id = %s FOR UPDATE": [
            {"id": 5, "status": "open", "opening_float": 500000, "version": 1,
             "code": "SHIFT-20261017-001", "opened_at": "2026-10-17T09:00:00+07:00",
             "order_count": 3, "void_count": 0}
        ],
        "SELECT COALESCE(sum(amount) FILTER (": [
            {"cash_sales": 1200000, "cash_in": 0, "cash_out": 0, "vendor_cash": 0}
        ],
        "COALESCE(sum(p.amount), 0) AS total FROM payments p": [{"total": 0}],
        "SELECT oi.vendor_id, v.name AS vendor_name": [],
        "UPDATE shifts SET status = 'closed'": [
            {"id": 5, "code": "SHIFT-20261017-001", "status": "closed",
             "opening_float": 500000, "opened_at": "2026-10-17T09:00:00+07:00",
             "expected_cash": 1700000, "counted_cash": 1700000, "variance": 0,
             "order_count": 3, "void_count": 0}
        ],
        "SELECT now() AS ts": [{"ts": "2026-10-17T17:00:00+07:00"}],
        "INSERT INTO outbox_messages": [{"id": 1}],
        "SELECT * FROM orders WHERE id = %s": [
            {"id": 11, "order_number": "GAK-20261017-0001", "channel": "fnb",
             "order_type": "takeaway", "status": "paid", "subtotal": 50000,
             "discount_total": 0, "service_total": 0, "tax_total": 0,
             "grand_total": 50000, "paid_total": 50000, "member_id": None,
             "points_earned": 0, "version": 2}
        ],
    }


def _pay_responses() -> dict[str, list]:
    return {
        "SELECT * FROM orders WHERE id = %s FOR UPDATE": [
            {"id": 11, "status": "open", "order_number": "GAK-20261017-0001",
             "grand_total": 50000, "version": 1, "member_id": None,
             "points_earned": 0, "table_id": None, "shift_id": 5}
        ],
        "SELECT * FROM shifts WHERE status IN ('open','closing')": [
            {"id": 5, "status": "open", "opening_float": 500000, "version": 1}
        ],
        "INSERT INTO payments": [{"id": 1}],
        "SELECT version FROM orders WHERE id = %s": [{"version": 2}],
        "SELECT * FROM orders WHERE id = %s": [
            {"id": 11, "order_number": "GAK-20261017-0001", "channel": "fnb",
             "order_type": "takeaway", "status": "paid", "subtotal": 50000,
             "discount_total": 0, "service_total": 0, "tax_total": 0,
             "grand_total": 50000, "paid_total": 50000, "member_id": None,
             "points_earned": 0, "version": 2}
        ],
        "FROM order_items WHERE order_id": [
            {"product_name": "Mie Aceh", "qty": 1, "unit_price": 35000,
             "line_total": 35000, "is_weighted": False},
            {"product_name": "Kopi Sanger", "qty": 1, "unit_price": 15000,
             "line_total": 15000, "is_weighted": False},
        ],
        "INSERT INTO outbox_messages": [{"id": 1}],
    }


# ---------------------------------------------------------------------------
# 1. Outbox failures never fail a payment / shift close
# ---------------------------------------------------------------------------

class TestOutboxNeverFailsBusinessTransaction:
    def test_shift_close_succeeds_when_outbox_insert_raises(self):
        cur = SavepointCursor(_close_responses(), fail_on="INSERT INTO outbox_messages")

        result = close_shift(cur, shift_id=5, closed_by=1, counted_cash=1700000)

        # Business outcome is intact: the shift really closed with variance 0.
        assert result["shift"]["status"] == "closed"
        assert result["variance"] == 0
        assert result["expected_cash"] == 1700000
        # The outbox attempt happened and was rolled back to its savepoint.
        assert cur.statements("SAVEPOINT outbox_enqueue")
        assert cur.statements("ROLLBACK TO SAVEPOINT")

    def test_shift_close_succeeds_when_outbox_payload_build_raises(self, monkeypatch):
        """A raising payload builder is as harmless as a failing INSERT."""
        def explode(*_a, **_kw):
            raise Boom("payload builder exploded")

        # close_shift imported the builder by name, so patch it where it is used.
        monkeypatch.setattr("app.services.shift_recap_payload", explode)
        cur = SavepointCursor(_close_responses())

        result = close_shift(cur, shift_id=5, closed_by=1, counted_cash=1700000)

        assert result["shift"]["status"] == "closed"
        assert result["variance"] == 0
        assert result["recap"] is None, "no recap built, and the close still stands"
        # No outbox row was attempted, but the close did not care.
        assert cur.statements("INSERT INTO outbox_messages") == []

    def test_payment_succeeds_when_outbox_insert_raises(self):
        cur = SavepointCursor(_pay_responses(), fail_on="INSERT INTO outbox_messages")

        result = pay_order(
            cur, order_id=11, captured_by=1,
            payments=[{"method": "cash", "amount": 50000, "tendered": 60000}],
            consume_stock=False,
        )

        assert result["replayed"] is False
        assert result["order"]["status"] == "paid"
        assert result["cash_amount"] == 50000
        # The sale is recorded even though WhatsApp delivery could not queue.
        assert cur.statements("INSERT INTO payments")
        assert cur.statements("UPDATE orders SET status = 'paid'")

    def test_savepoint_rollback_does_not_abort_the_parent_transaction(self):
        """After the guarded enqueue fails, later statements still execute."""
        cur = SavepointCursor(_close_responses(), fail_on="INSERT INTO outbox_messages")

        close_shift(cur, shift_id=5, closed_by=1, counted_cash=1700000)

        # A statement issued after the rollback (the return-value write path)
        # would have raised on a genuinely aborted transaction.
        cur.execute("SELECT 1")
        assert cur.executed[-1][0] == "SELECT 1"

    def test_enqueue_reports_false_instead_of_raising(self):
        cur = SavepointCursor(fail_on="INSERT INTO outbox_messages")
        ok = enqueue_best_effort(
            cur, event_type="receipt", dedupe_key="receipt:99",
            build=lambda: ("owner", {"event": "receipt"}),
        )
        assert ok is False
        assert cur.statements("ROLLBACK TO SAVEPOINT")

    def test_enqueue_reports_true_on_success(self):
        cur = SavepointCursor()
        ok = enqueue_shift_recap(cur, shift_id=5, recap={"event": "shift_recap"})
        assert ok is True
        insert = cur.statements("INSERT INTO outbox_messages")[0]
        assert "ON CONFLICT (dedupe_key) DO NOTHING" in " ".join(insert[0].split())
        assert insert[1][4] == "shift_recap:5"


class TestReceiptCarriesTheOrderLines:
    """A receipt with no item lines is not a receipt (review defect 2)."""

    @staticmethod
    def _enqueue(current: SavepointCursor) -> tuple[dict, str]:
        insert = current.statements("INSERT INTO outbox_messages")
        assert len(insert) == 1, "payment must queue exactly one receipt"
        return json.loads(insert[0][1][3]), insert[0][1][4]

    def test_payment_receipt_lists_the_paid_order_items(self):
        cur = SavepointCursor(_pay_responses())

        pay_order(
            cur, order_id=11, captured_by=1,
            payments=[{"method": "cash", "amount": 50000, "tendered": 60000}],
            consume_stock=False,
        )

        payload, dedupe_key = self._enqueue(cur)
        assert dedupe_key == "receipt:11"
        assert [line["name"] for line in payload["items"]] == ["Mie Aceh", "Kopi Sanger"]
        assert [line["line_total"] for line in payload["items"]] == [35000, 15000]
        # The WhatsApp text is what the customer actually reads.
        assert "- Mie Aceh x1.0 = Rp 35.000" in payload["text"]
        assert "- Kopi Sanger x1.0 = Rp 15.000" in payload["text"]
        assert "Total: Rp 50.000" in payload["text"]

    def test_item_query_filters_voided_lines_and_targets_the_paid_order(self):
        cur = SavepointCursor(_pay_responses())

        pay_order(
            cur, order_id=11, captured_by=1,
            payments=[{"method": "cash", "amount": 50000, "tendered": 60000}],
            consume_stock=False,
        )

        statements = cur.statements("FROM order_items")
        assert len(statements) == 1
        sql, params = statements[0]
        assert "status = 'active'" in " ".join(sql.split())
        assert params == (11,)

    def test_payment_survives_a_failing_item_query(self):
        """The lookup fails inside a savepoint, leaving the parent usable.

        Fail-closed on the receipt itself: an unreadable item list skips the
        WhatsApp message rather than sending a receipt with no product lines,
        and the payment transaction stays healthy.
        """
        cur = SavepointCursor(_pay_responses(), fail_on="FROM order_items")

        result = pay_order(
            cur, order_id=11, captured_by=1,
            payments=[{"method": "cash", "amount": 50000, "tendered": 60000}],
            consume_stock=False,
        )

        assert result["order"]["status"] == "paid"
        assert cur.statements("SAVEPOINT outbox_enqueue")
        assert cur.statements("ROLLBACK TO SAVEPOINT outbox_enqueue")
        assert cur.statements("INSERT INTO outbox_messages") == []

        # PostgreSQL rejects every statement after a SQL error until the guarded
        # savepoint is rolled back. This proves the payment transaction survived.
        cur.execute("SELECT 1")
        assert cur.aborted is False

    def test_item_loader_runs_after_the_receipt_savepoint(self):
        cur = SavepointCursor(_pay_responses())

        pay_order(
            cur, order_id=11, captured_by=1,
            payments=[{"method": "cash", "amount": 50000, "tendered": 60000}],
            consume_stock=False,
        )

        statements = [" ".join(sql.split()) for sql, _ in cur.executed]
        assert statements.index("SAVEPOINT outbox_enqueue") < next(
            index for index, sql in enumerate(statements) if "FROM order_items" in sql
        )


# ---------------------------------------------------------------------------
# 2. Dedupe: same key twice -> one delivery
# ---------------------------------------------------------------------------

class DedupeCursor(SavepointCursor):
    """Cursor holding a real unique-key table so ON CONFLICT is observable."""

    def __init__(self):
        super().__init__()
        self.table: dict[str, dict] = {}

    def _rows_for(self, sql: str) -> list[dict]:
        normalized = " ".join(sql.split())
        if normalized.startswith("INSERT INTO outbox_messages"):
            return [{"id": len(self.table) + 1}]
        return super()._rows_for(sql)

    def execute(self, sql: str, params=()):  # noqa: ANN001
        normalized = " ".join(sql.split())
        if normalized.startswith("INSERT INTO outbox_messages"):
            event_type, channel, recipient, payload, dedupe_key = params
            self.executed.append((sql, params))
            if dedupe_key in self.table:  # ON CONFLICT DO NOTHING
                self._last = []
                return None
            self.table[dedupe_key] = {
                "id": len(self.table) + 1, "event_type": event_type,
                "channel": channel, "recipient": recipient,
                "payload": payload, "dedupe_key": dedupe_key,
                "status": "pending", "attempts": 0,
            }
            self._last = [{"id": self.table[dedupe_key]["id"]}]
            return None
        return super().execute(sql, params)


class TestDedupe:
    def test_same_delivery_key_enqueued_twice_yields_one_row(self):
        cur = DedupeCursor()
        first = enqueue_shift_recap(cur, shift_id=5, recap={"event": "shift_recap"})
        second = enqueue_shift_recap(cur, shift_id=5, recap={"event": "shift_recap"})

        assert first is True and second is True  # second is a no-op, not an error
        assert list(cur.table) == ["shift_recap:5"]
        assert len(cur.table) == 1

    def test_receipt_dedupe_key_is_derived_from_order_id(self):
        cur = DedupeCursor()
        order = {"id": 77, "order_number": "GAK-1", "channel": "fnb",
                 "order_type": "takeaway", "grand_total": 10000, "paid_total": 10000}
        for _ in range(3):
            enqueue_receipt(cur, order=order, items=[], payments=[])

        assert list(cur.table) == ["receipt:77"]
        assert len(cur.table) == 1, "one WhatsApp receipt per order, no matter the retries"

    def test_distinct_orders_produce_distinct_keys(self):
        cur = DedupeCursor()
        for order_id in (1, 2):
            enqueue_receipt(cur, order={"id": order_id, "order_number": f"GAK-{order_id}"},
                            items=[], payments=[])
        assert sorted(cur.table) == ["receipt:1", "receipt:2"]


# ---------------------------------------------------------------------------
# 3. Backoff schedule
# ---------------------------------------------------------------------------

class TestBackoffSchedule:
    def test_schedule_is_one_five_fifteen_minutes(self):
        assert BACKOFF_SCHEDULE == (60, 300, 900)
        # Four attempts: the 15m window is a real wait, not dead code.
        assert MAX_ATTEMPTS == 4

    @pytest.mark.parametrize(
        ("attempts", "expected"),
        [(0, 0), (1, 60), (2, 300), (3, 900), (4, 900), (99, 900)],
    )
    def test_delay_after_n_failed_attempts(self, attempts, expected):
        assert backoff_seconds(attempts) == expected

    def test_negative_attempts_are_treated_as_never_tried(self):
        assert backoff_seconds(-1) == 0

    def test_sql_due_expression_matches_the_python_schedule(self):
        sql = due_at_expression()
        assert "ARRAY[60,300,900]" in sql
        assert "LEAST(attempts, 3)" in sql
        assert "attempts = 0" in sql
        assert "now()" in sql

    def test_max_attempts_covers_every_scheduled_wait(self):
        # 3 waits + the attempt that follows the last one, which parks the row.
        assert MAX_ATTEMPTS == len(BACKOFF_SCHEDULE) + 1

    def test_no_scheduled_wait_is_unreachable(self):
        """Every delay must sit strictly below the claim ceiling.

        Under the old ``MAX_ATTEMPTS == len(schedule)`` the 900s entry could
        never apply: a row with attempts == 3 was already at the ceiling and
        was claimed one last time, so only 60s and 300s ever happened.
        """
        reachable = [backoff_seconds(n) for n in range(1, MAX_ATTEMPTS)]
        assert reachable == list(BACKOFF_SCHEDULE)


# ---------------------------------------------------------------------------
# 4. Concurrent claim: two workers, one message, one winner
# ---------------------------------------------------------------------------

class SharedOutbox:
    """In-memory outbox table with Postgres-like SKIP LOCKED semantics."""

    def __init__(self, rows: list[dict]):
        self.rows = {int(r["id"]): dict(r) for r in rows}
        self.locked: set[int] = set()

    def claim(self, limit: int, max_attempts: int) -> list[dict]:
        winners: list[dict] = []
        for row_id in sorted(self.rows):
            if len(winners) >= limit:
                break
            row = self.rows[row_id]
            if row["status"] != "pending" or row["attempts"] >= max_attempts:
                continue
            if row_id in self.locked:  # SKIP LOCKED
                continue
            self.locked.add(row_id)
            row["attempts"] += 1
            winners.append(dict(row))
        return winners

    def release(self) -> None:
        self.locked.clear()


class WorkerCursor:
    """One worker's cursor over the shared outbox."""

    def __init__(self, shared: SharedOutbox, *, limit: int):
        self.shared = shared
        self.limit = limit
        self.params: tuple = ()
        self._last: list[dict] = []

    def execute(self, sql: str, params=()):  # noqa: ANN001
        if "FOR UPDATE SKIP LOCKED" in " ".join(sql.split()):
            self.params = params
            self._last = self.shared.claim(params[1], params[0])
        else:
            self._last = []

    def fetchall(self):
        return list(self._last)


class TestConcurrentClaim:
    def _rows(self, n: int) -> list[dict]:
        return [
            {"id": i, "event_type": "receipt", "channel": "whatsapp",
             "recipient": "owner", "payload": {"event": "receipt"},
             "dedupe_key": f"receipt:{i}", "status": "pending", "attempts": 0}
            for i in range(1, n + 1)
        ]

    def test_two_workers_one_message_exactly_one_winner(self):
        shared = SharedOutbox(self._rows(1))
        worker_a = WorkerCursor(shared, limit=10)
        worker_b = WorkerCursor(shared, limit=10)

        got_a = claim_due_messages(worker_a, limit=10)
        got_b = claim_due_messages(worker_b, limit=10)

        assert [m["dedupe_key"] for m in got_a] == ["receipt:1"]
        assert got_b == [], "second worker must not re-claim a locked row"

    def test_two_workers_split_a_batch_without_overlap(self):
        shared = SharedOutbox(self._rows(4))
        got_a = claim_due_messages(WorkerCursor(shared, limit=2), limit=2)
        got_b = claim_due_messages(WorkerCursor(shared, limit=2), limit=2)

        ids_a = {m["id"] for m in got_a}
        ids_b = {m["id"] for m in got_b}
        assert ids_a.isdisjoint(ids_b)
        assert len(ids_a | ids_b) == 4

    def test_claim_sql_uses_skip_locked_and_bumps_attempts(self):
        from app.outbox_delivery import CLAIM_SQL

        normalized = " ".join(CLAIM_SQL.split())
        assert "FOR UPDATE SKIP LOCKED" in normalized
        assert "attempts = attempts + 1" in normalized
        assert "status = 'pending'" in normalized
        assert normalized.endswith("RETURNING id, event_type, channel, recipient, payload, dedupe_key, attempts")

    def test_claim_is_guarded_against_infinite_retry(self):
        from app.outbox_delivery import CLAIM_SQL

        assert "attempts < %s" in " ".join(CLAIM_SQL.split())


# ---------------------------------------------------------------------------
# 5. Dry run must not spend the retry budget
# ---------------------------------------------------------------------------

class StatefulOutboxTable:
    """Mutable stand-in for ``outbox_messages`` with SKIP LOCKED + due-at."""

    def __init__(self, rows: list[dict]):
        self.rows = {int(r["id"]): dict(r) for r in rows}

    def select_due(self, max_attempts: int, limit: int) -> list[dict]:
        due = [r for r in sorted(self.rows.values(), key=lambda r: r["id"])
               if r["status"] == "pending" and int(r["attempts"]) < max_attempts]
        return [dict(r) for r in due[:limit]]

    def bump_attempts(self, ids: list[int]) -> None:
        for row_id in ids:
            self.rows[row_id]["attempts"] = int(self.rows[row_id]["attempts"]) + 1


class StatefulCursor:
    """Cursor that dispatches the real SQL shapes to a StatefulOutboxTable."""

    def __init__(self, table: StatefulOutboxTable):
        self.table = table
        self._last: list[dict] = []

    def execute(self, sql: str, params=()):  # noqa: ANN001
        normalized = " ".join(sql.split()).upper()
        if normalized.startswith("UPDATE OUTBOX_MESSAGES SET ATTEMPTS = ATTEMPTS + 1"):
            max_attempts, limit = params
            picked = self.table.select_due(max_attempts, limit)
            self.table.bump_attempts([r["id"] for r in picked])
            for row in picked:
                row["attempts"] = int(row["attempts"]) + 1  # RETURNING the new value
            self._last = picked
        elif normalized.startswith("SELECT ID, EVENT_TYPE"):
            max_attempts, limit = params
            self._last = self.table.select_due(max_attempts, limit)  # NO attempt bump
        else:
            self._last = []
        return None

    def fetchall(self):
        return list(self._last)

    def fetchone(self):
        return self._last[0] if self._last else None


class _NoLockConn:
    """Minimal psycopg-like connection: transaction()/cursor() context managers."""

    def __init__(self, table: StatefulOutboxTable):
        self.cursor_obj = StatefulCursor(table)

    def cursor(self):
        cursor = self.cursor_obj

        class _Ctx:
            def __enter__(self):
                return cursor

            def __exit__(self, *_exc):
                return False

        return _Ctx()

    def transaction(self):
        class _Txn:
            def __enter__(self):
                return self

            def __exit__(self, *_exc):
                return False

        return _Txn()

    def __enter__(self):
        return self

    def __exit__(self, *_exc):
        return False


class TestDryRunDoesNotConsumeAttempts:
    """Review defect 3: ``--dry-run`` used to strand real rows permanently."""

    @staticmethod
    def _worker(monkeypatch) -> object:
        sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))
        return importlib.import_module("outbox_worker")

    @staticmethod
    def _rows(n: int = 1) -> list[dict]:
        return [
            {"id": i, "event_type": "receipt", "channel": "whatsapp",
             "recipient": "owner", "payload": {"event": "receipt"},
             "dedupe_key": f"receipt:{i}", "status": "pending", "attempts": 0}
            for i in range(1, n + 1)
        ]

    def test_repeated_dry_runs_leave_attempts_untouched(self, monkeypatch):
        worker = self._worker(monkeypatch)
        table = StatefulOutboxTable(self._rows())
        monkeypatch.setattr(worker.database, "connect", lambda: _NoLockConn(table))

        posted: list[str] = []
        monkeypatch.setattr(worker, "post_delivery", lambda *a, **kw: posted.append("POST") or 200)

        for _ in range(MAX_ATTEMPTS + 2):
            counts = worker.drain_once(url="http://127.0.0.1:9/x", secret="s",
                                       timeout=1.0, batch=10, dry_run=True)
            assert counts["skipped"] == 1

        assert posted == [], "dry-run must never POST"
        assert table.rows[1]["attempts"] == 0, "dry-run must not spend the retry budget"
        assert table.rows[1]["status"] == "pending"

        # The row is still claimable for a real delivery afterwards -- this is
        # exactly what used to break.
        claim_cursor = StatefulCursor(table)
        claimed = claim_due_messages(claim_cursor, limit=10)
        assert [m["dedupe_key"] for m in claimed] == ["receipt:1"]
        assert table.rows[1]["attempts"] == 1

    def test_peek_sql_has_no_attempt_bump(self):
        from app.outbox_delivery import PEEK_SQL

        normalized = " ".join(PEEK_SQL.split())
        assert "attempts = attempts + 1" not in normalized
        assert "FOR UPDATE SKIP LOCKED" in normalized
        assert "status = 'pending' AND attempts < %s" in normalized
        assert normalized.startswith("SELECT id, event_type")

    def test_real_claim_still_bumps_attempts(self):
        table = StatefulOutboxTable(self._rows(2))
        got = claim_due_messages(StatefulCursor(table), limit=10)

        assert {m["id"] for m in got} == {1, 2}
        assert [r["attempts"] for r in table.rows.values()] == [1, 1]


# ---------------------------------------------------------------------------
# 6. Operational flag
# ---------------------------------------------------------------------------

class TestOutboxEnabledFlag:
    def test_default_is_enabled(self, monkeypatch):
        monkeypatch.delenv("OUTBOX_ENABLED", raising=False)
        assert outbox_enabled() is True

    @pytest.mark.parametrize("value", ["false", "FALSE", "0", "no", "off", " false "])
    def test_false_disables_delivery(self, monkeypatch, value):
        monkeypatch.setenv("OUTBOX_ENABLED", value)
        assert outbox_enabled() is False

    @pytest.mark.parametrize("value", ["true", "1", "yes", "on"])
    def test_true_enables_delivery(self, monkeypatch, value):
        monkeypatch.setenv("OUTBOX_ENABLED", value)
        assert outbox_enabled() is True

    def test_worker_skips_delivery_but_keeps_queueing(self, monkeypatch):
        """Disabled flag: the drain pass must not even claim rows.

        Counterpart to this test is ``enqueue_*``: queueing keeps working while
        the flag is off, so the offline window is recoverable. That is covered
        by TestOutboxNeverFailsBusinessTransaction, which never reads the flag.
        """
        monkeypatch.setenv("OUTBOX_ENABLED", "false")
        monkeypatch.setenv("GRANDPOS_OUTBOX_URL", "http://127.0.0.1:9/webhooks/x")
        monkeypatch.setenv("GRANDPOS_OUTBOX_SECRET", "test-secret-not-real")
        sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))
        worker = importlib.import_module("outbox_worker")

        calls: list[dict] = []
        monkeypatch.setattr(worker, "drain_once", lambda **kw: calls.append(kw) or {})

        assert worker.main(["--once"]) == 0
        assert calls == [], "OUTBOX_ENABLED=false must not drain anything"

    def test_worker_drains_when_flag_is_true(self, monkeypatch):
        monkeypatch.setenv("OUTBOX_ENABLED", "true")
        monkeypatch.setenv("GRANDPOS_OUTBOX_URL", "http://127.0.0.1:9/webhooks/x")
        monkeypatch.setenv("GRANDPOS_OUTBOX_SECRET", "test-secret-not-real")
        sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))
        worker = importlib.import_module("outbox_worker")

        calls: list[dict] = []
        monkeypatch.setattr(worker, "drain_once", lambda **kw: calls.append(kw) or {})

        assert worker.main(["--once"]) == 0
        assert len(calls) == 1
        assert calls[0]["url"] == "http://127.0.0.1:9/webhooks/x"

    def test_worker_refuses_to_start_without_secret(self, monkeypatch):
        monkeypatch.delenv("GRANDPOS_OUTBOX_SECRET", raising=False)
        monkeypatch.delenv("GRANDPOS_OUTBOX_URL", raising=False)
        sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))
        worker = importlib.import_module("outbox_worker")

        assert worker.main(["--once"]) == 2, "missing credentials must exit non-zero"
