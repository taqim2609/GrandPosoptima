"""Go-live regression suite: the AI-Studio 5-item checklist on LIVE PostgreSQL.

Runner: ``scripts/run_go_live_regression.sh`` (brings the compose stack up if
needed, waits for health, then runs ONLY these five tests against a DISPOSABLE
database and prints a PASS/FAIL table).

Contract
--------
* Every test talks to the REAL compose PostgreSQL 16 — no fakes, no SQLite.
* The suite builds a throwaway database (``GRANDPOS_TEST_DB``, default
  ``grandpos_golive_test``) fresh from the repository's own DDL on every test:
  ``db/schema.sql`` -> ``db/seed.sql`` -> ``db/migrations/0002_optimistic_lock.sql``
  -> ``db/roles.sql``. The production database and the ``grandpos_pgdata``
  volume are never dropped, truncated or written to.
* If psycopg is missing, or no PostgreSQL answers, every test SKIPs with an
  explicit reason. These tests can never silently pass by "not needing a
  database" — that would defeat the purpose of a go-live gate.

Items (AI Studio pre-go-live checklist)
---------------------------------------
R1  Two cashiers pay the same order concurrently: exactly ONE payment
    succeeds, the other is rejected as a concurrency conflict, and the side
    effects exist exactly once (one payment row, one cash movement, one stock
    deduction).
R2  Outbox/WhatsApp failure during payment: the payment still commits, the
    order is ``paid``, the cash ledger is correct, and the receipt is queued
    ``pending`` (a sale is never lost to a broken side channel).
R3  Full shift reconciliation across F&B, weighted retail, cash_in, cash_out
    and vendor settlement: ``expected_cash`` is exact, ``variance`` is 0 when
    the counted cash matches, and each vendor settlement is deducted exactly
    once.
R4  Duplicate webhook delivery with the same dedupe key: exactly one outbox
    send, every duplicate is a no-op.
R5  ``grandpos_ai`` can SELECT the four analytic views but is DENIED on
    ``orders`` and on ``CREATE TABLE``.
"""

from __future__ import annotations

import os
import re
import sys
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from decimal import Decimal
from pathlib import Path
from typing import Any, Iterator
from urllib.parse import urlsplit, urlunsplit

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import pytest

from app.outbox_delivery import claim_due_messages, due_at_expression, enqueue_receipt, mark_retry
from app.services import (
    CONCURRENT_UPDATE_MESSAGE,
    BusinessRuleError,
    LineInput,
    close_shift,
    create_order,
    generate_vendor_settlements,
    open_shift,
    paid_order_items,
    pay_order,
    record_cash_movement,
)

try:
    import psycopg
    from psycopg import sql as pgsql
    from psycopg.rows import dict_row
except ImportError:  # pragma: no cover - depends on the environment
    psycopg = None
    pgsql = None
    dict_row = None

REPO_ROOT = Path(__file__).resolve().parent.parent

#: Disposable database name. The runner exports GRANDPOS_TEST_DB; the default
#: is deliberately NOT the production name.
TEST_DB = os.environ.get("GRANDPOS_TEST_DB", "grandpos_golive_test")

#: Cluster roles we must never create or drop carelessly: grandpos_ai is
#: cluster-wide, so it is only dropped when this run created it.
AI_ROLE = "grandpos_ai"

VIEW_NAMES = ("v_daily_turnover", "v_shift_cash", "v_low_stock", "v_weekly_best_sellers")

SCHEMA_FILES = (
    "db/schema.sql",
    "db/seed.sql",
    "db/migrations/0002_optimistic_lock.sql",
    "db/migrations/0003_edge_sync.sql",
    "db/migrations/0005_payment_tendered_drift.sql",
    "db/roles.sql",
)

MIGRATION_0005 = "db/migrations/0005_payment_tendered_drift.sql"
MIGRATION_0005_ROLLBACK = "db/migrations/0005_payment_tendered_drift_rollback.sql"

#: State of a database deployed before 0005 — used to prove the upgrade path.
SCHEMA_PRE_0005 = tuple(f for f in SCHEMA_FILES if f != MIGRATION_0005)

BUSINESS_TZ = "Asia/Jakarta"

SKIP_NO_DRIVER = (
    "SKIP reason: psycopg is not installed for this interpreter, so the live-PostgreSQL "
    "go-live regression cannot run. Install requirements.txt (or run "
    "scripts/run_go_live_regression.sh, which uses the api container image)."
)


# ---------------------------------------------------------------------------
# DSN helpers
# ---------------------------------------------------------------------------

def _retarget(dsn: str, dbname: str) -> str:
    """Point a libpq DSN at another database on the same server."""
    parts = urlsplit(dsn)
    return urlunsplit((parts.scheme, parts.netloc, f"/{dbname}", parts.query, parts.fragment))


def admin_dsn() -> str:
    """DSN for the cluster's maintenance database.

    ``GRANDPOS_ADMIN_DATABASE_URL`` wins when provided; otherwise the app DSN
    (``GRANDPOS_TEST_DATABASE_URL`` or ``DATABASE_URL``) is retargeted to
    ``postgres`` so the suite can create/drop its own database.
    """
    explicit = os.environ.get("GRANDPOS_ADMIN_DATABASE_URL")
    if explicit:
        return explicit
    base = os.environ.get("GRANDPOS_TEST_DATABASE_URL") or os.environ.get("DATABASE_URL")
    if not base:
        raise RuntimeError(
            "no PostgreSQL DSN: set GRANDPOS_TEST_DATABASE_URL (or DATABASE_URL) so the "
            "go-live suite knows where the compose database is"
        )
    return _retarget(base, "postgres")


def connect(dsn: str, **kwargs: Any):
    """Dict-row connection (the service layer expects dict rows)."""
    return psycopg.connect(dsn, row_factory=dict_row, **kwargs)


# ---------------------------------------------------------------------------
# Environment
# ---------------------------------------------------------------------------

@dataclass
class GoLiveEnv:
    """Connection strings plus seeded ids for one freshly built database."""

    admin_url: str
    app_url: str
    kasir1: int
    kasir2: int
    superadmin: int
    tables: list[int] = field(default_factory=list)
    products: dict[str, int] = field(default_factory=dict)
    vendors: dict[str, int] = field(default_factory=dict)

    def product(self, sku: str) -> int:
        return self.products[sku]

    def vendor(self, name: str) -> int:
        return self.vendors[name]


def _validate_test_db_name() -> str | None:
    if not re.fullmatch(r"[a-z][a-z0-9_]{0,62}", TEST_DB):
        return f"GRANDPOS_TEST_DB must be a simple lowercase identifier, got {TEST_DB!r}"
    if TEST_DB in ("postgres", "template0", "template1"):
        return f"GRANDPOS_TEST_DB must not be a system database, got {TEST_DB!r}"
    production = os.environ.get("POSTGRES_DB") or "grandpos"
    if TEST_DB == production:
        return (
            f"refusing to run: GRANDPOS_TEST_DB ({TEST_DB}) equals the production database "
            f"POSTGRES_DB. Set GRANDPOS_TEST_DB to a separate name."
        )
    return None


@pytest.fixture(scope="session")
def _reachable() -> str:
    """Session-wide reachability probe; skips the whole module when absent."""
    if psycopg is None:
        pytest.skip(SKIP_NO_DRIVER)
    try:
        admin = admin_dsn()
    except RuntimeError as exc:
        pytest.skip(f"SKIP reason: {exc}")
    try:
        with connect(admin, connect_timeout=5) as conn, conn.cursor() as cur:
            cur.execute("SELECT 1 AS ok")
            row = cur.fetchone()
        assert row and row["ok"] == 1
    except Exception as exc:  # noqa: BLE001 - probe must never raise
        pytest.skip(
            f"SKIP reason: live PostgreSQL not reachable at {admin} "
            f"({type(exc).__name__}: {exc}). Bring the stack up with "
            f"`docker compose up -d db` or use scripts/run_go_live_regression.sh."
        )
    return admin


@pytest.fixture
def golive_env(_reachable: str) -> Iterator[GoLiveEnv]:
    """Build a pristine disposable database for ONE test, then drop it."""
    problem = _validate_test_db_name()
    if problem:
        pytest.fail(problem)

    admin = _reachable
    created_role = False

    with connect(admin, autocommit=True) as conn, conn.cursor() as cur:
        cur.execute("SELECT 1 AS present FROM pg_roles WHERE rolname = %s", (AI_ROLE,))
        created_role = cur.fetchone() is None
        cur.execute(pgsql.SQL("DROP DATABASE IF EXISTS {} WITH (FORCE)").format(
            pgsql.Identifier(TEST_DB)))
        cur.execute(pgsql.SQL("CREATE DATABASE {} TEMPLATE template0").format(
            pgsql.Identifier(TEST_DB)))
        # The analytic views read current_setting('grandpos.timezone').
        cur.execute(pgsql.SQL("ALTER DATABASE {} SET grandpos.timezone = {}").format(
            pgsql.Identifier(TEST_DB), pgsql.Literal(BUSINESS_TZ)))

    app_url = _retarget(admin, TEST_DB)
    with connect(app_url, autocommit=True) as conn, conn.cursor() as cur:
        for rel in SCHEMA_FILES:
            cur.execute((REPO_ROOT / rel).read_text(encoding="utf-8"))

    env = GoLiveEnv(admin_url=admin, app_url=app_url, kasir1=0, kasir2=0, superadmin=0)
    with connect(app_url) as conn, conn.cursor() as cur:
        cur.execute(
            "SELECT username, id FROM users WHERE username IN ('kasir1', 'kasir2', 'taqim2609')"
        )
        ids = {r["username"]: int(r["id"]) for r in cur.fetchall()}
        env.kasir1, env.kasir2, env.superadmin = ids["kasir1"], ids["kasir2"], ids["taqim2609"]
        cur.execute("SELECT id FROM tables ORDER BY sort_order, id")
        env.tables = [int(r["id"]) for r in cur.fetchall()]
        cur.execute("SELECT sku, id FROM products")
        env.products = {r["sku"]: int(r["id"]) for r in cur.fetchall()}
        cur.execute("SELECT name, id FROM vendors")
        env.vendors = {r["name"]: int(r["id"]) for r in cur.fetchall()}

    try:
        yield env
    finally:
        if os.environ.get("GRANDPOS_KEEP_TEST_DB") == "1":
            print(f"\nGRANDPOS_KEEP_TEST_DB=1: kept {TEST_DB} for forensics")
        else:
            try:
                with connect(admin, autocommit=True) as conn, conn.cursor() as cur:
                    cur.execute(pgsql.SQL("DROP DATABASE IF EXISTS {} WITH (FORCE)").format(
                        pgsql.Identifier(TEST_DB)))
                    if created_role:
                        cur.execute(pgsql.SQL("DROP ROLE IF EXISTS {}").format(
                            pgsql.Identifier(AI_ROLE)))
            except Exception as exc:  # noqa: BLE001 - teardown must not mask results
                print(f"\nWARNING: teardown left {TEST_DB} behind: {exc}")


def pay(cur: Any, *, order_id: int, total: int, method: str, captured_by: int) -> dict:
    """Settle an order with a single payment of the exact grand total."""
    payment: dict[str, Any] = {"method": method, "amount": total}
    if method == "cash":
        payment["tendered"] = total
    return pay_order(cur, order_id=order_id, payments=[payment], captured_by=captured_by)


# ---------------------------------------------------------------------------
# R1 — concurrent payment of the same order
# ---------------------------------------------------------------------------

def test_r1_concurrent_payment_exactly_one_winner(golive_env: GoLiveEnv) -> None:
    env = golive_env
    product = env.product("MKA-001")

    with connect(env.app_url) as conn, conn.cursor() as cur:
        open_shift(cur, opening_float=100_000, opened_by=env.kasir1, cashier_id=env.kasir1)
        created = create_order(
            cur, order_type="dine_in", created_by=env.kasir1, table_id=env.tables[0],
            lines=[LineInput(product_id=product, qty="2")],
        )
        order_id = int(created["order"]["id"])
        total = int(created["totals"]["grand_total"])
        assert total == 76_000, "2 x Mie Aceh @38.000 must be 76.000"

        cur.execute(
            "SELECT i.id AS ingredient_id, i.stock_qty FROM ingredients i "
            "  JOIN recipes r ON r.ingredient_id = i.id WHERE r.product_id = %s",
            (product,),
        )
        stock_before = {int(r["ingredient_id"]): Decimal(r["stock_qty"]) for r in cur.fetchall()}
        assert len(stock_before) == 4, "MKA-001 must have its four recipe ingredients"

    def attempt(captured_by: int) -> tuple[str, str]:
        try:
            with connect(env.app_url) as conn, conn.cursor() as cur:
                pay(cur, order_id=order_id, total=total, method="cash", captured_by=captured_by)
            return "ok", ""
        except BusinessRuleError as exc:
            return "rule_error", str(exc)
        except Exception as exc:  # noqa: BLE001 - surface anything unexpected verbatim
            return "error", f"{type(exc).__name__}: {exc}"

    with ThreadPoolExecutor(max_workers=2) as pool:
        results = [f.result() for f in [pool.submit(attempt, w) for w in (env.kasir1, env.kasir2)]]

    statuses = [s for s, _ in results]
    details = [d for _, d in results]
    assert "error" not in statuses, f"unexpected failure instead of a business rejection: {results}"
    assert statuses.count("ok") == 1, (
        f"exactly ONE payment must succeed, got {statuses} ({details})"
    )
    loser = next(d for s, d in results if s == "rule_error")
    assert "already paid" in loser or CONCURRENT_UPDATE_MESSAGE in loser, (
        f"the losing cashier must get a concurrency conflict, got: {loser!r}"
    )

    with connect(env.app_url) as conn, conn.cursor() as cur:
        cur.execute("SELECT status, paid_total, version FROM orders WHERE id = %s", (order_id,))
        order = cur.fetchone()
        assert order["status"] == "paid", "the order must end up paid"
        assert int(order["paid_total"]) == total
        assert int(order["version"]) == 2, "exactly one optimistic-lock bump, not two"

        cur.execute(
            "SELECT count(*) AS n, COALESCE(sum(amount), 0) AS total FROM payments "
            " WHERE order_id = %s", (order_id,))
        p = cur.fetchone()
        assert int(p["n"]) == 1, f"exactly one payment row expected, got {p['n']}"
        assert int(p["total"]) == total

        cur.execute(
            "SELECT count(*) AS n, COALESCE(sum(amount), 0) AS total FROM cash_movements "
            " WHERE movement_type = 'sale_cash' AND reference_type = 'order' AND reference_id = %s",
            (order_id,))
        c = cur.fetchone()
        assert int(c["n"]) == 1, f"exactly one cash_movement expected, got {c['n']}"
        assert int(c["total"]) == total

        cur.execute(
            "SELECT ingredient_id, count(*) AS n, sum(qty_delta) AS delta FROM inventory_movements "
            " WHERE order_id = %s AND movement_type = 'sale_consumption' GROUP BY ingredient_id",
            (order_id,))
        moves = cur.fetchall()
        assert {int(m["ingredient_id"]) for m in moves} == set(stock_before), (
            "every recipe ingredient must be deducted exactly once"
        )
        assert all(int(m["n"]) == 1 for m in moves), f"double stock deduction: {moves}"

        cur.execute("SELECT id, stock_qty FROM ingredients")
        stock_after = {int(r["id"]): Decimal(r["stock_qty"]) for r in cur.fetchall()}
        for m in moves:
            ing = int(m["ingredient_id"])
            assert stock_after[ing] == stock_before[ing] + Decimal(m["delta"]), (
                f"ingredient {ing}: stock must reflect exactly one deduction"
            )

    # Optimistic locking: a stale expected_version is rejected and writes nothing.
    with connect(env.app_url) as conn, conn.cursor() as cur:
        fresh = create_order(
            cur, order_type="takeaway", created_by=env.kasir1,
            lines=[LineInput(product_id=env.product("MNA-002"), qty="1")],
        )
        stale_id = int(fresh["order"]["id"])
        stale_total = int(fresh["totals"]["grand_total"])

    with pytest.raises(BusinessRuleError) as stale:
        with connect(env.app_url) as conn, conn.cursor() as cur:
            pay_order(
                cur, order_id=stale_id,
                payments=[{"method": "cash", "amount": stale_total, "tendered": stale_total}],
                captured_by=env.kasir2, expected_version=999,
            )
    assert CONCURRENT_UPDATE_MESSAGE in str(stale.value), (
        f"stale expected_version must raise the documented concurrency error, got {stale.value!r}"
    )

    with connect(env.app_url) as conn, conn.cursor() as cur:
        cur.execute("SELECT status, version FROM orders WHERE id = %s", (stale_id,))
        untouched = cur.fetchone()
        assert untouched["status"] == "open" and int(untouched["version"]) == 1
        cur.execute("SELECT count(*) AS n FROM payments WHERE order_id = %s", (stale_id,))
        assert int(cur.fetchone()["n"]) == 0, "a rejected version check must write no payment"

    print(f"\nR1 evidence: order {order_id} paid {total} IDR by exactly one cashier; "
          f"loser rejected -> {loser!r}; 1 payment / 1 cash_movement / 1 stock batch; "
          f"stale-version guard -> {stale.value!r}")


# ---------------------------------------------------------------------------
# R2 — outbox / WhatsApp failure during payment
# ---------------------------------------------------------------------------

def test_r2_outbox_failure_never_loses_the_sale(golive_env: GoLiveEnv) -> None:
    env = golive_env
    dedupe_key = None

    with connect(env.app_url) as conn, conn.cursor() as cur:
        open_shift(cur, opening_float=50_000, opened_by=env.kasir1, cashier_id=env.kasir1)
        created = create_order(
            cur, order_type="takeaway", created_by=env.kasir1,
            lines=[LineInput(product_id=env.product("MNA-002"), qty="1")],
        )
        order_id = int(created["order"]["id"])
        total = int(created["totals"]["grand_total"])
        assert total == 15_000

        # A real database-level outbox outage: every INSERT into
        # outbox_messages raises. This exercises the SAVEPOINT contract for
        # real instead of raising a Python exception in a fake.
        cur.execute(
            "CREATE FUNCTION golive_outbox_outage() RETURNS trigger LANGUAGE plpgsql AS $$ "
            "BEGIN RAISE EXCEPTION 'simulated WhatsApp/outbox outage (go-live drill)'; END $$"
        )
        cur.execute(
            "CREATE TRIGGER golive_outbox_outage_trg BEFORE INSERT ON outbox_messages "
            "FOR EACH ROW EXECUTE FUNCTION golive_outbox_outage()"
        )

        paid = pay(cur, order_id=order_id, total=total, method="cash", captured_by=env.kasir1)
        assert paid["replayed"] is False
        assert paid["order"]["status"] == "paid", "the payment must commit despite the outage"

        cur.execute("SELECT count(*) AS n FROM outbox_messages")
        assert int(cur.fetchone()["n"]) == 0, (
            "the failed enqueue must roll back to its savepoint: no partial outbox row"
        )

        # Recovery: once the side channel is back, the receipt is queued.
        cur.execute("DROP TRIGGER golive_outbox_outage_trg ON outbox_messages")
        cur.execute("DROP FUNCTION golive_outbox_outage()")
        items = paid_order_items(cur, order_id)
        requeued = enqueue_receipt(
            cur, order=paid["order"],
            payments=[{"method": "cash", "amount": total}],
            load_items=lambda: items,
        )
        assert requeued is True

        dedupe_key = f"receipt:{order_id}"
        cur.execute(
            "SELECT id, status, attempts FROM outbox_messages WHERE dedupe_key = %s",
            (dedupe_key,),
        )
        row = cur.fetchone()
        assert row is not None, "the receipt must be queued once the outbox is healthy"
        assert row["status"] == "pending"
        receipt_id = int(row["id"])

        # The worker claimed it and the HTTP send failed (503): retry contract.
        mark_retry(cur, receipt_id, "simulated webhook 503 during go-live drill")
        cur.execute("UPDATE outbox_messages SET attempts = 1 WHERE id = %s", (receipt_id,))

    with connect(env.app_url) as conn, conn.cursor() as cur:
        cur.execute("SELECT status, paid_total FROM orders WHERE id = %s", (order_id,))
        order = cur.fetchone()
        assert order["status"] == "paid", "the sale survived the outbox outage"
        assert int(order["paid_total"]) == total

        cur.execute(
            "SELECT count(*) AS n, COALESCE(sum(amount), 0) AS total FROM cash_movements "
            " WHERE movement_type = 'sale_cash' AND reference_type = 'order' AND reference_id = %s",
            (order_id,))
        cash = cur.fetchone()
        assert int(cash["n"]) == 1 and int(cash["total"]) == total, "cash ledger must be intact"

        cur.execute(
            "SELECT status, attempts, last_error FROM outbox_messages WHERE dedupe_key = %s",
            (dedupe_key,))
        ob = cur.fetchone()
        assert ob["status"] == "pending", "the receipt must stay queued for retry, not be lost"
        assert int(ob["attempts"]) == 1
        assert (ob["last_error"] or "").startswith("simulated webhook 503")

        # Backoff: a failed attempt is not due again immediately.
        cur.execute(
            "SELECT id FROM outbox_messages WHERE dedupe_key = %s AND status = 'pending' "
            "   AND attempts < 4 AND (" + due_at_expression() + ")", (dedupe_key,))
        assert cur.fetchone() is None, "a retried row must respect the 60s backoff window"

        # Nothing was double-counted while the side channel was down.
        cur.execute(
            "SELECT count(*) AS n FROM cash_movements WHERE shift_id = "
            " (SELECT shift_id FROM orders WHERE id = %s) AND movement_type = 'sale_cash'",
            (order_id,))
        assert int(cur.fetchone()["n"]) == 1

    print(f"\nR2 evidence: order {order_id} paid {total} IDR with outbox INSERT raising; "
          f"receipt {dedupe_key} queued pending after recovery, attempts=1, "
          f"last_error recorded, not due before backoff")


# ---------------------------------------------------------------------------
# R3 — full shift reconciliation
# ---------------------------------------------------------------------------

def test_r3_full_shift_reconciliation_exact(golive_env: GoLiveEnv) -> None:
    env = golive_env
    dapur = env.vendor("Dapur Grand Aceh")        # 0 %   -> in-house, no cash event
    mitra = env.vendor("Mitra Kue Aceh")          # 20 %
    kopi = env.vendor("Titipan Kopi Gayo")        # 15 %

    with connect(env.app_url) as conn, conn.cursor() as cur:
        shift = open_shift(cur, opening_float=75_000, opened_by=env.kasir1, cashier_id=env.kasir1)
        sid = int(shift["id"])

        def sell(order_type: str, table_id: int | None, lines: list[LineInput], method: str) -> int:
            created = create_order(cur, order_type=order_type, created_by=env.kasir1,
                                   table_id=table_id, lines=lines)
            total = int(created["totals"]["grand_total"])
            pay(cur, order_id=int(created["order"]["id"]), total=total, method=method,
                captured_by=env.kasir1)
            return total

        # F&B dine-in: Mie Aceh x2 (38.000) + Ayam Tangkap Kiloan 0.750 kg x 120 = 90.
        a = sell("dine_in", env.tables[1],
                 [LineInput(env.product("MKA-001"), "2"),
                  LineInput(env.product("MKA-004"), "1", weight_kg="0.750")], "cash")
        assert a == 76_090, f"F&B order must be 76.090, got {a}"

        # Weighted retail: Kopi Gayo Bubuk Kiloan 2.500 kg x 180 = 450.
        c = sell("retail", None, [LineInput(env.product("RTL-002"), "1", weight_kg="2.500")], "cash")
        assert c == 450, f"weighted retail must be 450, got {c}"

        # Non-cash retail: Kue Bhoi x5 (qris) and x1 (debit).
        b = sell("retail", None, [LineInput(env.product("RTL-003"), "5")], "qris")
        d = sell("retail", None, [LineInput(env.product("RTL-003"), "1")], "debit")
        assert (b, d) == (60_000, 12_000)

        record_cash_movement(cur, shift_id=sid, direction="in", amount=25_000,
                             reason="Golive: tambah modal", created_by=env.kasir1)
        record_cash_movement(cur, shift_id=sid, direction="out", amount=40_000,
                             reason="Golive: belanja dapur", created_by=env.kasir1)

        cash_sales = a + c                      # 76.540
        non_cash = b + d                        # 72.000
        # Vendor share is computed on the PRE-discount commission base:
        #   Mitra Kue Aceh 20 % of (60.000 + 12.000) = 14.400
        #   Titipan Kopi Gayo 15 % of 450           =    67,5 -> 68 (ROUND_HALF_UP)
        #   Dapur Grand Aceh 0 %                    =     0 (no cash event)
        vendor_expected = {dapur: 0, mitra: 14_400, kopi: 68}
        vendor_cash_total = 14_468
        expected = 75_000 + cash_sales + 25_000 - 40_000 - vendor_cash_total
        assert expected == 122_072

        closed = close_shift(cur, shift_id=sid, closed_by=env.kasir2,
                             counted_cash=expected, notes="go-live R3 reconciliation")

        assert closed["expected_cash"] == expected, (
            f"expected_cash must be exact: want {expected}, got {closed['expected_cash']}"
        )
        assert closed["variance"] == 0, "variance must be 0 when counted == expected"
        assert closed["shift"]["status"] == "closed"
        assert int(closed["shift"]["cash_sales"]) == cash_sales
        assert int(closed["shift"]["non_cash_sales"]) == non_cash
        assert int(closed["shift"]["cash_in_total"]) == 25_000
        assert int(closed["shift"]["cash_out_total"]) == 40_000
        assert int(closed["shift"]["vendor_cash_total"]) == vendor_cash_total

        settlements = {int(s["vendor_id"]): int(s["vendor_amount"]) for s in closed["settlements"]}
        assert settlements == vendor_expected, (
            f"vendor settlement amounts must match profit shares, got {settlements}"
        )

        # Each non-zero settlement hits the cash ledger exactly once.
        cur.execute(
            "SELECT vs.vendor_id, count(*) AS n, sum(cm.amount) AS total "
            "  FROM vendor_settlements vs JOIN cash_movements cm ON cm.id = vs.cash_movement_id "
            " WHERE vs.shift_id = %s GROUP BY vs.vendor_id", (sid,))
        rows = {int(r["vendor_id"]): (int(r["n"]), int(r["total"])) for r in cur.fetchall()}
        assert rows == {mitra: (1, -14_400), kopi: (1, -68)}, (
            f"each vendor settlement must deduct cash exactly once, got {rows}"
        )
        assert dapur not in rows, "a 0 % in-house vendor must not create a cash movement"

        # Re-running the settlement generator on the same open shift (the
        # interrupted-close retry the finding demands) must be a no-op: the
        # rows exist, some already point at cash, so no new movement may be
        # attempted for any vendor, paid or not.
        retried = generate_vendor_settlements(cur, shift_id=sid, created_by=env.kasir2)
        assert {int(s["vendor_id"]): int(s["vendor_amount"]) for s in retried} == vendor_expected
        cur.execute(
            "SELECT count(*) AS n FROM cash_movements WHERE shift_id = %s "
            "   AND movement_type = 'vendor_settlement'", (sid,))
        assert int(cur.fetchone()["n"]) == 2, "a retried settlement run must not add movements"

        cur.execute(
            "SELECT count(*) AS n FROM cash_movements WHERE shift_id = %s "
            "   AND movement_type = 'vendor_settlement'", (sid,))
        assert int(cur.fetchone()["n"]) == 2, "exactly two vendor cash events for this shift"

        # Closing twice must not settle twice.
        with pytest.raises(BusinessRuleError, match="already closed"):
            close_shift(cur, shift_id=sid, closed_by=env.kasir2, counted_cash=expected)
        cur.execute(
            "SELECT count(*) AS n FROM cash_movements WHERE shift_id = %s "
            "   AND movement_type = 'vendor_settlement'", (sid,))
        assert int(cur.fetchone()["n"]) == 2, "a second close must not deduct vendors again"

    # The analyst views agree with the closed shift row.
    with connect(env.app_url) as conn, conn.cursor() as cur:
        cur.execute("SELECT * FROM v_shift_cash WHERE shift_id = %s", (sid,))
        v = cur.fetchone()
        assert int(v["expected_cash"]) == expected
        assert int(v["variance"]) == 0
        assert int(v["cash_sales"]) == cash_sales
        assert int(v["cash_in_total"]) == 25_000
        assert abs(int(v["cash_out_total"])) == 40_000
        assert abs(int(v["vendor_cash_total"])) == vendor_cash_total

        cur.execute(
            "SELECT channel, paid_orders, gross_turnover FROM v_daily_turnover WHERE shift_id = %s",
            (sid,))
        daily = {r["channel"]: (int(r["paid_orders"]), int(r["gross_turnover"]))
                 for r in cur.fetchall()}
        assert daily == {"fnb": (1, 76_090), "retail": (3, 72_450)}, f"unexpected turnover: {daily}"

        cur.execute(
            "SELECT product_id, units_sold, revenue FROM v_weekly_best_sellers "
            " WHERE product_id IN (%s, %s, %s)",
            (env.product("RTL-003"), env.product("RTL-002"), env.product("MKA-004")))
        best = {int(r["product_id"]): (Decimal(r["units_sold"]), int(r["revenue"]))
                for r in cur.fetchall()}
        assert best[env.product("RTL-003")] == (Decimal("6"), 72_000)
        assert best[env.product("RTL-002")] == (Decimal("2.5"), 450)
        assert best[env.product("MKA-004")] == (Decimal("0.75"), 90)

    print(f"\nR3 evidence: shift {sid} -> opening 75.000 + cash {cash_sales} + in 25.000 "
          f"- out 40.000 - vendor {vendor_cash_total} = expected {expected}; "
          f"variance 0; settlements {settlements}; v_shift_cash identical")


# ---------------------------------------------------------------------------
# R4 — duplicate webhook delivery, same dedupe key
# ---------------------------------------------------------------------------

def test_r4_duplicate_webhook_single_send(golive_env: GoLiveEnv) -> None:
    env = golive_env
    with connect(env.app_url) as conn, conn.cursor() as cur:
        open_shift(cur, opening_float=20_000, opened_by=env.kasir1, cashier_id=env.kasir1)
        created = create_order(
            cur, order_type="takeaway", created_by=env.kasir1,
            lines=[LineInput(product_id=env.product("MNA-002"), qty="1")])
        order_id = int(created["order"]["id"])
        total = int(created["totals"]["grand_total"])
        paid = pay(cur, order_id=order_id, total=total, method="cash", captured_by=env.kasir1)
        dedupe_key = f"receipt:{order_id}"

        cur.execute("SELECT id, status FROM outbox_messages WHERE dedupe_key = %s", (dedupe_key,))
        first = cur.fetchone()
        assert first is not None and first["status"] == "pending"
        receipt_id = int(first["id"])

    # Duplicate delivery #2 while the first is still pending.
    with connect(env.app_url) as conn, conn.cursor() as cur:
        items = paid_order_items(cur, order_id)
        enqueue_receipt(cur, order=paid["order"], payments=[{"method": "cash", "amount": total}],
                        load_items=lambda: items)
        cur.execute("SELECT count(*) AS n FROM outbox_messages WHERE dedupe_key = %s", (dedupe_key,))
        assert int(cur.fetchone()["n"]) == 1, "a duplicate enqueue must be a no-op"

    # Two concurrent duplicate deliveries on separate connections.
    def duplicate_delivery() -> None:
        with connect(env.app_url) as conn, conn.cursor() as cur:
            items = paid_order_items(cur, order_id)
            enqueue_receipt(cur, order=paid["order"],
                            payments=[{"method": "cash", "amount": total}],
                            load_items=lambda: items)

    with ThreadPoolExecutor(max_workers=2) as pool:
        for f in [pool.submit(duplicate_delivery) for _ in range(2)]:
            f.result()

    with connect(env.app_url) as conn, conn.cursor() as cur:
        cur.execute("SELECT count(*) AS n FROM outbox_messages WHERE dedupe_key = %s", (dedupe_key,))
        assert int(cur.fetchone()["n"]) == 1, "concurrent duplicates must still yield one row"

        # The first (and only) send happens now.
        cur.execute(
            "UPDATE outbox_messages SET status = 'sent', attempts = 1, updated_at = now() "
            " WHERE id = %s", (receipt_id,))

        # Duplicate delivery #3 after the send: must not re-open or re-send.
        items = paid_order_items(cur, order_id)
        enqueue_receipt(cur, order=paid["order"], payments=[{"method": "cash", "amount": total}],
                        load_items=lambda: items)
        cur.execute(
            "SELECT status, count(*) AS n FROM outbox_messages WHERE dedupe_key = %s "
            " GROUP BY status", (dedupe_key,))
        states = {r["status"]: int(r["n"]) for r in cur.fetchall()}
        assert states == {"sent": 1}, f"exactly one sent message allowed, got {states}"

        # A worker scanning for due work must never pick a delivered row.
        claimed = claim_due_messages(cur, limit=100)
        assert dedupe_key not in {m["dedupe_key"] for m in claimed}, (
            "a sent message must never be claimed for delivery again"
        )
        cur.execute("SELECT count(*) AS n FROM outbox_messages")
        assert int(cur.fetchone()["n"]) == 1

    print(f"\nR4 evidence: {dedupe_key} enqueued 4x (incl. 2 concurrent duplicates), "
          f"delivered exactly once, final states {states}, never re-claimed")


# ---------------------------------------------------------------------------
# R5 — grandpos_ai: four views yes, orders no, CREATE TABLE no
# ---------------------------------------------------------------------------

def test_r5_ai_role_views_only(golive_env: GoLiveEnv) -> None:
    env = golive_env

    with connect(env.admin_url) as conn, conn.cursor() as cur:
        cur.execute("SELECT rolcanlogin, rolconfig FROM pg_roles WHERE rolname = %s", (AI_ROLE,))
        role = cur.fetchone()
        assert role is not None, "db/roles.sql must create the grandpos_ai role"

    # Privilege model, checked from the catalogue (independent of SET ROLE).
    with connect(env.app_url) as conn, conn.cursor() as cur:
        for view in VIEW_NAMES:
            cur.execute("SELECT has_table_privilege(%s, %s, 'SELECT') AS ok", (AI_ROLE, view))
            assert cur.fetchone()["ok"] is True, f"grandpos_ai must be able to SELECT {view}"
        cur.execute("SELECT has_table_privilege(%s, 'orders', 'SELECT') AS ok", (AI_ROLE,))
        assert cur.fetchone()["ok"] is False, "grandpos_ai must NOT be able to SELECT orders"
        cur.execute("SELECT has_schema_privilege(%s, 'public', 'CREATE') AS ok", (AI_ROLE,))
        assert cur.fetchone()["ok"] is False, "grandpos_ai must NOT be able to CREATE in public"
        cur.execute(
            "SELECT table_name FROM information_schema.role_table_grants "
            " WHERE grantee = %s AND privilege_type = 'SELECT'", (AI_ROLE,))
        readable = {r["table_name"] for r in cur.fetchall()}
        assert readable == set(VIEW_NAMES), (
            f"grandpos_ai must read exactly the four analytic views, got {sorted(readable)}"
        )

    # Behavioural check: run the statements as the role itself.
    # grandpos_ai is NOLOGIN by design until an operator sets
    # GRANDPOS_AI_DB_PASSWORD, so the session is assumed with SET ROLE — the
    # same technique the repository's own smoke flow used.
    with connect(env.app_url) as conn, conn.cursor() as cur:
        cur.execute(pgsql.SQL("SET ROLE {}").format(pgsql.Identifier(AI_ROLE)))
        for view in VIEW_NAMES:
            cur.execute(pgsql.SQL("SELECT count(*) AS n FROM {}").format(pgsql.Identifier(view)))
            cur.fetchone()
        cur.execute("SELECT current_user AS who")
        assert cur.fetchone()["who"] == AI_ROLE
        cur.execute("ROLLBACK")

    with connect(env.app_url) as conn, conn.cursor() as cur:
        cur.execute(pgsql.SQL("SET ROLE {}").format(pgsql.Identifier(AI_ROLE)))
        with pytest.raises(psycopg.Error) as orders_err:
            cur.execute("SELECT order_number FROM orders LIMIT 1")
        assert "permission denied" in str(orders_err.value).lower()
        cur.execute("ROLLBACK")

    with connect(env.app_url) as conn, conn.cursor() as cur:
        cur.execute(pgsql.SQL("SET ROLE {}").format(pgsql.Identifier(AI_ROLE)))
        with pytest.raises(psycopg.Error) as create_err:
            cur.execute("CREATE TABLE golive_r5_probe (id integer PRIMARY KEY)")
        assert "permission denied" in str(create_err.value).lower()
        cur.execute("ROLLBACK")

    with connect(env.app_url) as conn, conn.cursor() as cur:
        cur.execute("SELECT to_regclass('public.golive_r5_probe') AS t")
        assert cur.fetchone()["t"] is None, "grandpos_ai must not have created a table"

    print("\nR5 evidence (verbatim denials):\n"
          f"  SELECT {', '.join(VIEW_NAMES)} -> allowed\n"
          f"  SELECT orders       -> {orders_err.value}\n"
          f"  CREATE TABLE        -> {create_err.value}")
