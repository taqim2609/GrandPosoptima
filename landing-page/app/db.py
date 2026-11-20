"""Database access layer for GrandPOS.

Uses psycopg 3 directly with explicit SQL and explicit row locks. There is no
ORM: transactional semantics (SELECT ... FOR UPDATE, single-commit business
flows) are the core of this POS, so they are written out rather than hidden.

Every public method takes an open connection and never commits on its own;
the service layer owns the transaction boundary.
"""

from __future__ import annotations

import os
from contextlib import contextmanager
from datetime import date, datetime
from typing import Any, Iterator, Sequence

try:
    import psycopg
    from psycopg.rows import dict_row
except ImportError:  # pragma: no cover - exercised only when deps missing
    psycopg = None  # type: ignore[assignment]
    dict_row = None  # type: ignore[assignment]


MISSING_DRIVER = (
    "psycopg is not installed. Install the API requirements with "
    "`pip install -r requirements.txt` (psycopg[binary])."
)


def database_url() -> str:
    url = os.environ.get("DATABASE_URL")
    if not url:
        raise RuntimeError("DATABASE_URL is not set")
    return url


def ai_database_url() -> str | None:
    """Separate read-only DSN for the analyst; falls back to None."""
    return os.environ.get("AI_DATABASE_URL") or None


@contextmanager
def connect(url: str | None = None, *, readonly: bool = False) -> Iterator[Any]:
    """Yield a dict-row connection with the business timezone applied."""
    if psycopg is None:
        raise RuntimeError(MISSING_DRIVER)
    with psycopg.connect(url or database_url(), row_factory=dict_row) as conn:
        tz = os.environ.get("GRANDPOS_TZ", "Asia/Jakarta")
        with conn.cursor() as cur:
            cur.execute("SELECT set_config('grandpos.timezone', %s, false)", (tz,))
        if readonly:
            with conn.cursor() as cur:
                cur.execute("SET TRANSACTION READ ONLY")
        yield conn


def healthcheck() -> bool:
    if psycopg is None:
        return False
    try:
        with connect() as conn, conn.cursor() as cur:
            cur.execute("SELECT 1 AS ok")
            row = cur.fetchone()
            return bool(row and row["ok"] == 1)
    except Exception:
        return False


# ---------------------------------------------------------------------------
# Read helpers. These are the ONLY data paths exposed to the AI analyst, and
# every one of them takes structured parameters. No caller may pass SQL text.
# ---------------------------------------------------------------------------

REPORT_SQL = {
    "daily_turnover": (
        "SELECT business_date, shift_id, channel, paid_orders, void_orders, "
        "       gross_turnover, total_discount, net_revenue, total_cogs "
        "  FROM v_daily_turnover "
        " WHERE business_date BETWEEN %(start)s AND %(end)s "
        " ORDER BY business_date DESC, channel"
    ),
    "shift_cash": (
        "SELECT shift_id, code, status, opening_float, cash_sales, cash_in_total, "
        "       cash_out_total, vendor_cash_total, expected_cash, counted_cash, variance "
        "  FROM v_shift_cash "
        " WHERE shift_id = %(shift_id)s"
    ),
    "low_stock": (
        "SELECT id, sku, name, unit, stock_qty, min_stock_qty, reorder_qty, shortage_qty "
        "  FROM v_low_stock "
        " WHERE is_low = TRUE "
        " ORDER BY shortage_qty DESC LIMIT %(limit)s"
    ),
    "weekly_best_sellers": (
        "SELECT week_start, product_id, product_name, channel, units_sold, revenue, cogs, gross_margin "
        "  FROM v_weekly_best_sellers "
        " WHERE week_start >= %(week_start)s "
        " ORDER BY units_sold DESC, revenue DESC LIMIT %(limit)s"
    ),
}


def run_report(name: str, params: dict[str, Any], url: str | None = None) -> list[dict]:
    """Run one allowlisted analytics query. Unknown names are rejected."""
    if name not in REPORT_SQL:
        raise ValueError(f"report not allowlisted: {name}")
    with connect(url or ai_database_url(), readonly=True) as conn, conn.cursor() as cur:
        cur.execute(REPORT_SQL[name], params)
        return list(cur.fetchall())


def today_range() -> tuple[date, date]:
    from zoneinfo import ZoneInfo
    tz_name = os.environ.get("GRANDPOS_TZ", "Asia/Jakarta")
    tz = ZoneInfo(tz_name)
    today = datetime.now(tz).date()
    return today, today


def business_today() -> date:
    """Return today's date in the business timezone (Asia/Jakarta by default).

    This is the single source of truth for 'what day is it' in business logic.
    Uses GRANDPOS_TZ env var (default Asia/Jakarta) to match the database
    session timezone set in connect().
    """
    from zoneinfo import ZoneInfo
    tz_name = os.environ.get("GRANDPOS_TZ", "Asia/Jakarta")
    tz = ZoneInfo(tz_name)
    return datetime.now(tz).date()


def business_now() -> datetime:
    """Return current datetime in the business timezone (Asia/Jakarta by default).

    Use for generated_at timestamps and any timezone-aware datetime needs.
    """
    from zoneinfo import ZoneInfo
    tz_name = os.environ.get("GRANDPOS_TZ", "Asia/Jakarta")
    tz = ZoneInfo(tz_name)
    return datetime.now(tz)
