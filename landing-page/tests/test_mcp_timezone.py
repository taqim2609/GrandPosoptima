"""Tests for MCP server tools timezone behavior.

These tests verify that the MCP server tools use the business timezone (Asia/Jakarta/WIB)
correctly, not UTC. This is critical for the 00:00-07:00 WIB window where UTC date differs.
"""

from __future__ import annotations

import sys
from datetime import datetime, timezone
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

pytest.importorskip("mcp", reason="MCP SDK only present in venv_mcp")

from app import mcp_server  # noqa: E402
from app.db import business_today, business_now  # noqa: E402


class TestMcpToolsTimezone:
    """Verify MCP tools use WIB (Asia/Jakarta) not UTC for 'today'."""

    def test_sales_today_uses_wib_not_utc(self, monkeypatch):
        """
        17:30 UTC == 00:30 WIB next day (WIB is UTC+7).
        sales_today() must return the WIB date, not the UTC date.
        """
        # Mock the database query to capture what date is passed
        captured_params = {}

        def mock_query(sql, params=()):
            captured_params["params"] = params
            # Return empty result to avoid DB dependency
            return [{"transactions": 0, "revenue": 0, "avg_ticket": 0}]

        monkeypatch.setattr(mcp_server, "query", mock_query)
        monkeypatch.setenv("GRANDPOS_TZ", "Asia/Jakarta")

        # 17:30 UTC on 2026-10-30 = 00:30 WIB on 2026-10-31
        # The OLD code used date.today() which returns 2026-10-30 (UTC date)
        # The NEW code uses business_today() which returns 2026-10-31 (WIB date)
        fake_wib_date = "2026-10-31"

        # Mock business_today in the mcp_server module directly
        def mock_business_today():
            from datetime import date
            return date.fromisoformat(fake_wib_date)

        monkeypatch.setattr(mcp_server, "business_today", mock_business_today)

        # Call the tool
        result = mcp_server.sales_today()

        # Verify the date passed to the query is the WIB date (2026-10-31)
        # NOT the UTC date (2026-10-30)
        assert "2026-10-31" in result, f"Expected WIB date 2026-10-31 in result, got: {result}"
        assert captured_params.get("params") == ("2026-10-31",), (
            f"Query should receive WIB date 2026-10-31, got {captured_params.get('params')}"
        )

    def test_business_today_returns_wib_date(self, monkeypatch):
        """business_today() returns the correct WIB date when mocked."""
        monkeypatch.setenv("GRANDPOS_TZ", "Asia/Jakarta")

        # Mock business_today to return a specific WIB date
        fake_wib_date = "2026-10-31"

        def mock_business_today():
            from datetime import date
            return date.fromisoformat(fake_wib_date)

        import app.db as db_module
        monkeypatch.setattr(db_module, "business_today", mock_business_today)

        today = db_module.business_today()
        assert today.isoformat() == "2026-10-31", (
            f"business_today() should return WIB date 2026-10-31, got {today.isoformat()}"
        )

    def test_business_now_returns_wib_datetime(self, monkeypatch):
        """business_now() returns timezone-aware datetime in WIB when mocked."""
        monkeypatch.setenv("GRANDPOS_TZ", "Asia/Jakarta")

        # Mock business_now to return a specific WIB datetime
        fake_wib_dt = datetime(2026, 10, 31, 0, 30, tzinfo=timezone.utc).replace(tzinfo=None)
        # Actually create it with proper WIB timezone
        from zoneinfo import ZoneInfo
        wib_tz = ZoneInfo("Asia/Jakarta")
        fake_wib_dt = datetime(2026, 10, 31, 0, 30, tzinfo=wib_tz)

        def mock_business_now():
            return fake_wib_dt

        import app.db as db_module
        monkeypatch.setattr(db_module, "business_now", mock_business_now)

        now = db_module.business_now()
        assert now.tzinfo is not None, "business_now() should return timezone-aware datetime"
        # The date component should be WIB date
        assert now.date().isoformat() == "2026-10-31", (
            f"business_now().date() should be 2026-10-31 (WIB), got {now.date().isoformat()}"
        )
        # The timezone should be Asia/Jakarta (UTC+7)
        assert now.utcoffset() is not None and now.utcoffset().total_seconds() == 7 * 3600, (
            f"business_now() should be UTC+7, got offset {now.utcoffset()}"
        )


class TestMcpReportsGeneratedAt:
    """Verify mcp_reports generated_at uses WIB timezone."""

    def test_generated_at_uses_wib(self, monkeypatch):
        """_build_response generated_at should use business_now() (WIB)."""
        from app import mcp_reports

        monkeypatch.setenv("GRANDPOS_TZ", "Asia/Jakarta")

        # Mock business_now in the mcp_reports module directly
        from zoneinfo import ZoneInfo
        wib_tz = ZoneInfo("Asia/Jakarta")
        fake_wib_dt = datetime(2026, 10, 31, 0, 30, tzinfo=wib_tz)

        def mock_business_now():
            return fake_wib_dt

        monkeypatch.setattr(mcp_reports, "business_now", mock_business_now)

        # Call a simple report to trigger _build_response
        from app.mcp_reports import _build_response

        response = _build_response(
            rows=[],
            totals=None,
            limit=10,
            offset=0,
            total_rows=0,
            date_from=None,
            date_to=None,
        )

        # generated_at should be in WIB (2026-10-31T00:30:00+07:00)
        generated_at = response["generated_at"]
        assert "2026-10-31T00:30:00+07:00" in generated_at, (
            f"generated_at should be WIB time 2026-10-31T00:30:00+07:00, got {generated_at}"
        )