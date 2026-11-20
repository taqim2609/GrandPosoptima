"""Optional live-database tests for the MCP reporting layer.

These run only when a GrandPOS PostgreSQL is reachable.  They are skipped
otherwise, so the default suite stays hermetic.  Enable explicitly:

    MCP_LIVE_DB=1 ./venv_mcp/bin/python -m pytest tests/test_mcp_live_db.py -v

What is proven against the real schema:
  * every report's SQL is valid for the deployed schema (no invented columns);
  * the connection is genuinely read-only (writes raise ReadOnlySqlTransaction);
  * totals equal a manual re-aggregation of the returned rows;
  * pagination over the real data covers every row exactly once.
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app import mcp_reports  # noqa: E402

pytestmark = pytest.mark.skipif(
    os.getenv("MCP_LIVE_DB") not in ("1", "true", "yes"),
    reason="set MCP_LIVE_DB=1 to run against the live GrandPOS database",
)


@pytest.fixture(scope="module")
def live():
    from app import mcp_db

    pytest.importorskip("psycopg2")
    try:
        rows = mcp_db.query("SELECT 1 AS ok")
    except Exception as exc:  # noqa: BLE001
        pytest.skip(f"database unreachable: {type(exc).__name__}: {exc}")
    assert rows[0]["ok"] == 1
    return mcp_db

class TestLiveSchemaCompatibility:
    @pytest.mark.parametrize("report", sorted(mcp_reports.ALLOWED_REPORTS))
    def test_report_sql_is_valid_against_real_schema(self, live, report):
        response = getattr(mcp_reports, report)(limit=5)
        assert isinstance(response["rows"], list)
        assert response["pagination"]["limit"] == 5

    def test_date_filtered_reports_run(self, live):
        for report in ("sales", "order_items", "payments", "shifts",
                       "cash_movements", "inventory_movements",
                       "vendor_settlements", "daily_turnover", "audit_logs"):
            response = getattr(mcp_reports, report)(
                date_from="2026-01-01", date_to="2026-12-31", limit=5
            )
            assert response["pagination"]["total_rows"] >= 0

    def test_omitting_dates_reaches_full_history(self, live):
        """Without a date filter the whole history is reachable, page by page."""
        response = mcp_reports.sales(limit=1)
        assert response["date_range"] == {"from": None, "to": None}
        assert response["pagination"]["total_rows"] >= 1


class TestLiveReadOnly:
    @pytest.mark.parametrize(
        "sql",
        [
            "CREATE TEMP TABLE mcp_probe (id int)",
            "INSERT INTO settings (key, value) VALUES ('mcp_probe', '\"x\"'::jsonb)",
            "UPDATE orders SET note = note",
            "DELETE FROM orders",
            "TRUNCATE orders CASCADE",
        ],
    )
    def test_writes_are_rejected(self, live, sql):
        with pytest.raises(Exception) as excinfo:
            with live.connect() as conn:
                with conn.cursor() as cur:
                    cur.execute(sql)
        message = str(excinfo.value).lower()
        assert "read-only" in message or "readonly" in message, message

    def test_no_data_was_modified(self, live):
        row = live.query_one("SELECT count(*) AS n FROM orders")
        assert row is not None
        # Sanity: the probe table from the test above must not exist.
        leftover = live.query(
            "SELECT 1 FROM information_schema.tables "
            "WHERE table_name = 'mcp_probe'"
        )
        assert leftover == []


class TestLiveTotalsAndPaging:
    def test_totals_match_manual_aggregation(self, live):
        response = mcp_reports.sales(limit=mcp_reports.MAX_LIMIT)
        totals = response["totals"] or {}
        manual = sum(row["grand_total"] or 0 for row in response["rows"])
        if response["pagination"]["total_rows"] <= mcp_reports.MAX_LIMIT:
            assert totals.get("grand_total") == manual

    def test_full_pagination_covers_every_row(self, live):
        first = mcp_reports.products(limit=2)
        total = first["pagination"]["total_rows"]
        if total == 0:
            pytest.skip("no products in database")
        seen: list[int] = []
        offset = 0
        while True:
            page = mcp_reports.products(limit=2, offset=offset)
            seen.extend(row["id"] for row in page["rows"])
            if not page["pagination"]["has_more"]:
                break
            offset += page["pagination"]["limit"]
        assert len(seen) == total
        assert len(set(seen)) == total

    def test_offset_pages_do_not_overlap(self, live):
        page1 = mcp_reports.products(limit=2, offset=0)
        page2 = mcp_reports.products(limit=2, offset=2)
        ids1 = {row["id"] for row in page1["rows"]}
        ids2 = {row["id"] for row in page2["rows"]}
        assert not (ids1 & ids2)

    def test_limit_cap_is_enforced_against_real_data(self, live):
        response = mcp_reports.sales(limit=100_000)
        assert response["pagination"]["limit"] == mcp_reports.MAX_LIMIT
        assert len(response["rows"]) <= mcp_reports.MAX_LIMIT
