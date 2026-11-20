"""Regression tests for migration 0005 (`payments.tendered_drift`).

These run against a real PostgreSQL on a disposable database created and
dropped by ``golive_env`` (see tests/test_go_live_regression.py) — never the
production database. They prove the three things the application contract
depends on:

  * a cash row may carry `tendered < amount` ONLY when the gap is recorded as
    `tendered_drift`, and `change_due` must include that drift;
  * non-cash rows can never carry drift;
  * rollback restores the old strict constraints without deleting the column
    or its evidence, and refuses while drift data still exists.

Plus the end-to-end path: an edge-sync price rise stores physical cash
unchanged, and shift close reports the gap as a shortage (variance < 0).
"""

from __future__ import annotations

import pytest

from app import edge_sync
from app.outbox_delivery import enqueue_receipt
from app.services import close_shift, open_shift

from test_go_live_regression import (  # noqa: F401 - _reachable/golive_env are fixtures
    MIGRATION_0005,
    MIGRATION_0005_ROLLBACK,
    REPO_ROOT,
    GoLiveEnv,
    _reachable,
    connect,
    golive_env,
)

psycopg = pytest.importorskip("psycopg")


def _apply_sql(url: str, relative_path: str) -> None:
    with connect(url, autocommit=True) as conn, conn.cursor() as cur:
        cur.execute((REPO_ROOT / relative_path).read_text(encoding="utf-8"))


def _order(cur, *, created_by: int, grand_total: int = 50000) -> int:
    row = cur.execute(
        "INSERT INTO orders (order_number, channel, order_type, status, subtotal, "
        "                    grand_total, paid_total, created_by) "
        "VALUES (%s, 'retail', 'retail', 'paid', %s, %s, %s, %s) RETURNING id",
        (f"MIG-{grand_total}", grand_total, grand_total, grand_total, created_by),
    ).fetchone()
    return int(row["id"])


def _pay(
    cur, *, order_id: int, created_by: int, method: str = "cash",
    amount: int = 50000, tendered: int | None = 40000, change_due: int | None = 0,
    drift: int = 10000,
):
    cur.execute(
        "INSERT INTO payments (order_id, method, amount, tendered, change_due, "
        "                      tendered_drift, captured_by) "
        "VALUES (%s, %s, %s, %s, %s, %s, %s) RETURNING id",
        (order_id, method, amount, tendered, change_due, drift, created_by),
    )
    return cur.fetchone()["id"]


# ---------------------------------------------------------------------------
# Schema contract
# ---------------------------------------------------------------------------

def test_cash_row_accepts_drift_and_zero_change_due(golive_env: GoLiveEnv) -> None:
    """amount 50.000, kas fisik 40.000, drift 10.000 -> change_due 0 (bukan karangan)."""
    with connect(golive_env.app_url) as conn, conn.cursor() as cur:
        order_id = _order(cur, created_by=golive_env.kasir1)
        _pay(cur, order_id=order_id, created_by=golive_env.kasir1)
        row = cur.execute(
            "SELECT amount, tendered, tendered_drift, change_due FROM payments "
            " WHERE order_id = %s", (order_id,),
        ).fetchone()

    assert (row["amount"], row["tendered"], row["tendered_drift"], row["change_due"]) == (
        50000, 40000, 10000, 0,
    )


def test_shortfall_without_drift_is_rejected(golive_env: GoLiveEnv) -> None:
    """Kas 40.000 < alokasi 50.000 tanpa drift harus ditolak schema."""
    with connect(golive_env.app_url) as conn, conn.cursor() as cur:
        order_id = _order(cur, created_by=golive_env.kasir1)
        with pytest.raises(psycopg.errors.CheckViolation) as exc:
            _pay(cur, order_id=order_id, created_by=golive_env.kasir1, drift=0)
        assert "violates check constraint" in str(exc.value)
        cur.execute("ROLLBACK")


def test_change_due_must_include_drift(golive_env: GoLiveEnv) -> None:
    """change_due dihitung dari tendered + drift, bukan tendered saja."""
    with connect(golive_env.app_url) as conn, conn.cursor() as cur:
        order_id = _order(cur, created_by=golive_env.kasir1)
        with pytest.raises(psycopg.errors.CheckViolation) as exc:
            _pay(cur, order_id=order_id, created_by=golive_env.kasir1, change_due=5000)
        assert "payments_change_check" in str(exc.value)
        cur.execute("ROLLBACK")


def test_non_cash_row_cannot_carry_drift(golive_env: GoLiveEnv) -> None:
    """QRIS/kartu tidak punya uang diterima; drift di sana selalu salah catat."""
    with connect(golive_env.app_url) as conn, conn.cursor() as cur:
        order_id = _order(cur, created_by=golive_env.kasir1)
        with pytest.raises(psycopg.errors.CheckViolation) as exc:
            _pay(cur, order_id=order_id, created_by=golive_env.kasir1, method="qris",
                 tendered=None, change_due=None, drift=10000)
        assert "payments_tendered_drift_cash_only" in str(exc.value)
        cur.execute("ROLLBACK")


# ---------------------------------------------------------------------------
# Upgrade path: 0005 applied to a database that predates it and already has rows
# ---------------------------------------------------------------------------

def test_0005_upgrades_a_populated_pre_0005_database(_reachable: str) -> None:
    """Bukan fresh install: baris tunai lama (tendered >= amount) harus selamat."""
    from psycopg import sql as pgsql

    from test_go_live_regression import SCHEMA_PRE_0005, _retarget, admin_dsn

    upgrade_db = "grandpos_drift_upgrade_test"
    with connect(admin_dsn(), autocommit=True) as conn, conn.cursor() as cur:
        cur.execute(pgsql.SQL("DROP DATABASE IF EXISTS {} WITH (FORCE)").format(
            pgsql.Identifier(upgrade_db)))
        cur.execute(pgsql.SQL("CREATE DATABASE {} TEMPLATE template0").format(
            pgsql.Identifier(upgrade_db)))

    app_url = _retarget(admin_dsn(), upgrade_db)
    try:
        with connect(app_url, autocommit=True) as conn, conn.cursor() as cur:
            for rel in SCHEMA_PRE_0005:
                cur.execute((REPO_ROOT / rel).read_text(encoding="utf-8"))
            cashier = cur.execute(
                "SELECT id FROM users WHERE username = 'kasir1'"
            ).fetchone()["id"]
            order_id = cur.execute(
                "INSERT INTO orders (order_number, channel, order_type, status, subtotal, "
                "                    grand_total, paid_total, created_by) "
                "VALUES ('PRE-0005-1', 'retail', 'retail', 'paid', 100000, 100000, 100000, %s) "
                "RETURNING id", (cashier,),
            ).fetchone()["id"]
            # Dua baris warisan: satu pas, satu dengan kembalian.
            for tendered, change in ((50000, 0), (60000, 10000)):
                cur.execute(
                    "INSERT INTO payments (order_id, method, amount, tendered, change_due, "
                    "                      captured_by) "
                    "VALUES (%s, 'cash', 50000, %s, %s, %s)",
                    (order_id, tendered, change, cashier),
                )
            legacy_order = order_id

        _apply_sql(app_url, MIGRATION_0005)

        with connect(app_url) as conn, conn.cursor() as cur:
            rows = cur.execute(
                "SELECT amount, tendered, tendered_drift, change_due FROM payments ORDER BY id"
            ).fetchall()
            assert [(r["tendered_drift"], r["change_due"]) for r in rows] == [(0, 0), (0, 10000)], (
                "baris lama harus tetap utuh: drift 0, change_due tidak berubah"
            )
            # Kontrak baru berlaku untuk baris berikutnya.
            cur.execute(
                "INSERT INTO payments (order_id, method, amount, tendered, change_due, "
                "                      tendered_drift, captured_by) "
                "VALUES (%s, 'cash', 50000, 40000, 0, 10000, "
                "        (SELECT created_by FROM orders WHERE id = %s))",
                (legacy_order, legacy_order),
            )
            assert cur.execute("SELECT count(*) AS n FROM payments").fetchone()["n"] == 3
            cur.execute("ROLLBACK")

        # Idempotent: menjalankan ulang tidak mengubah apa pun.
        _apply_sql(app_url, MIGRATION_0005)
        with connect(app_url) as conn, conn.cursor() as cur:
            assert cur.execute("SELECT count(*) AS n FROM payments").fetchone()["n"] == 2
    finally:
        with connect(admin_dsn(), autocommit=True) as conn, conn.cursor() as cur:
            cur.execute(pgsql.SQL("DROP DATABASE IF EXISTS {} WITH (FORCE)").format(
                pgsql.Identifier(upgrade_db)))


# ---------------------------------------------------------------------------
# Rollback
# ---------------------------------------------------------------------------

def test_rollback_refuses_while_drift_evidence_exists(golive_env: GoLiveEnv) -> None:
    with connect(golive_env.app_url) as conn, conn.cursor() as cur:
        order_id = _order(cur, created_by=golive_env.kasir1)
        _pay(cur, order_id=order_id, created_by=golive_env.kasir1)

    with pytest.raises(Exception) as exc:
        _apply_sql(golive_env.app_url, MIGRATION_0005_ROLLBACK)
    assert "rollback ditolak" in str(exc.value)


def test_rollback_restores_strict_constraints_and_keeps_the_column(
    golive_env: GoLiveEnv,
) -> None:
    """Rollback mengembalikan constraint lama, tetapi kolom + nilainya tetap ada."""
    with connect(golive_env.app_url, autocommit=True) as conn, conn.cursor() as cur:
        order_id = _order(cur, created_by=golive_env.kasir1, grand_total=60000)
        _pay(cur, order_id=order_id, created_by=golive_env.kasir1, amount=50000,
             tendered=40000, change_due=0, drift=10000)
        # Selesaikan shortage dulu, seperti yang diminta prosedur rollback.
        cur.execute("UPDATE payments SET tendered_drift = 0, tendered = amount, "
                    "                     change_due = 0 WHERE order_id = %s", (order_id,))

    _apply_sql(golive_env.app_url, MIGRATION_0005_ROLLBACK)

    with connect(golive_env.app_url) as conn, conn.cursor() as cur:
        row = cur.execute(
            "SELECT tendered_drift, tendered, amount FROM payments WHERE order_id = %s",
            (order_id,),
        ).fetchone()
        assert row["tendered_drift"] == 0, "rollback tidak boleh menghapus kolom/baris"
        assert (row["tendered"], row["amount"]) == (50000, 50000)

        with pytest.raises(psycopg.errors.CheckViolation):
            _pay(cur, order_id=order_id, created_by=golive_env.kasir1, amount=50000,
                 tendered=40000, change_due=0, drift=10000)
        cur.execute("ROLLBACK")

    # Re-apply: migration is idempotent and restores the drift contract.
    _apply_sql(golive_env.app_url, MIGRATION_0005)
    with connect(golive_env.app_url) as conn, conn.cursor() as cur:
        order_id = _order(cur, created_by=golive_env.kasir1, grand_total=70000)
        _pay(cur, order_id=order_id, created_by=golive_env.kasir1, amount=50000,
             tendered=40000, change_due=0, drift=10000)
        assert cur.execute(
            "SELECT tendered_drift FROM payments WHERE order_id = %s", (order_id,)
        ).fetchone()["tendered_drift"] == 10000


# ---------------------------------------------------------------------------
# End-to-end: price rise -> no fabricated tender -> shortage at shift close
# ---------------------------------------------------------------------------

def test_price_rise_writes_drift_and_shift_close_reports_shortage(
    golive_env: GoLiveEnv,
) -> None:
    """Kiosk mengirim 30.000, gudang memakai harga katalog 38.000 (MKA-001).

    Kas fisik 20.000 tidak boleh naik menjadi 28.000. Setelah tutup shift,
    variance harus -8.000 (shortage), bukan 0.
    """
    env = golive_env
    cash_paid = 20_000
    payload = {
        "client_ref": "drift-e2e-1",
        "order_type": "retail",
        "total": 30_000,
        "items": [{"sku": "MKA-001", "name": "Mie Aceh", "type": "makanan", "qty": 1,
                   "price": 30_000}],
        "payments": [
            {"payment_method": "cash", "amount": 20_000, "amount_paid": cash_paid},
            {"payment_method": "qris", "amount": 10_000},
        ],
        "cashier_username": "kasir1",
    }

    opening_float = 10_000
    with connect(env.app_url) as conn, conn.cursor() as cur:
        shift = open_shift(cur, opening_float=opening_float, opened_by=env.kasir1,
                           cashier_id=env.kasir1)
        shift_id = int(shift["id"])
        result = edge_sync.apply_transaction(cur, node_id="pi-test", payload=payload)
        assert result["grand_total"] == 38_000, "total gudang harus harga katalog, bukan 30.000 kiosk"

        rows = cur.execute(
            "SELECT method, amount, tendered, change_due, tendered_drift "
            "  FROM payments WHERE order_id = %s ORDER BY id", (int(result["order_id"]),),
        ).fetchall()
        conn.commit()

    by_method = {r["method"]: r for r in rows}
    cash = by_method["cash"]
    # Total kiosk 30.000 -> gudang 38.000: selisih 8.000 jatuh ke alokasi tunai.
    assert (cash["amount"], cash["tendered"]) == (28_000, cash_paid)
    assert cash["tendered_drift"] == 8_000
    assert cash["change_due"] == 0
    assert by_method["qris"]["tendered"] is None
    assert by_method["qris"]["tendered_drift"] == 0

    # Kas fisik di drawer = modal awal + uang yang benar-benar diterima kasir.
    counted_cash = opening_float + cash_paid
    with connect(env.app_url) as conn, conn.cursor() as cur:
        closed = close_shift(cur, shift_id=shift_id, closed_by=env.kasir2,
                             counted_cash=counted_cash)
        conn.commit()

    assert closed["expected_cash"] == opening_float + 28_000
    assert closed["variance"] == -8_000, "shortage harus negatif, bukan surplus"


def test_receipt_outbox_payload_carries_drift(golive_env: GoLiveEnv) -> None:
    """Payload outbox yang benar-benar tersimpan memuat tendered_drift."""
    env = golive_env
    with connect(env.app_url) as conn, conn.cursor() as cur:
        order = cur.execute(
            "INSERT INTO orders (order_number, channel, order_type, status, subtotal, "
            "                    grand_total, paid_total, created_by) "
            "VALUES ('DRIFT-OUTBOX-1', 'retail', 'retail', 'paid', 50000, 50000, 50000, %s) "
            "RETURNING *", (env.kasir1,),
        ).fetchone()
        _pay(cur, order_id=int(order["id"]), created_by=env.kasir1)
        queued = enqueue_receipt(
            cur,
            order=dict(order),
            payments=[{"method": "cash", "amount": 50000, "change_due": 0,
                       "tendered_drift": 10000}],
        )
        assert queued is True
        stored = cur.execute(
            "SELECT payload FROM outbox_messages WHERE dedupe_key = %s",
            (f"receipt:{order['id']}",),
        ).fetchone()
        conn.commit()

    assert stored["payload"]["payments"][0]["tendered_drift"] == 10000
