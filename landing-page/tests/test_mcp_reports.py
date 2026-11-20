"""Tests for the read-only GrandPOS MCP reporting layer.

These tests never touch a live database.  ``app.mcp_reports`` talks to the DB
only through ``query`` / ``query_one``, so a fake cursor records every SQL
statement and its parameters.  That lets us prove, without Docker:

  * every user-supplied value travels as a bound parameter (%s), never spliced
    into SQL text;
  * date ranges and pagination are validated and bounded;
  * totals are computed by a separate aggregate query, so they stay stable
    while paging;
  * only SELECT statements are ever issued.
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app import mcp_reports


class FakeDB:
    """Records SQL + params and replays canned rows."""

    def __init__(self) -> None:
        self.calls: list[tuple[str, tuple]] = []
        self.rows: list[dict] = []
        self.one: dict | None = None

    def query(self, sql: str, params: tuple = ()):
        self.calls.append((sql, params))
        return list(self.rows)

    def query_one(self, sql: str, params: tuple = ()):
        self.calls.append((sql, params))
        return dict(self.one) if self.one is not None else None


@pytest.fixture
def fake(monkeypatch):
    db = FakeDB()
    monkeypatch.setattr(mcp_reports, "query", db.query)
    monkeypatch.setattr(mcp_reports, "query_one", db.query_one)
    return db


# ── Safety: parameters, allowlist, read-only ────────────────────────────────


class TestSqlSafety:
    def test_user_values_are_bound_not_interpolated(self, fake):
        fake.one = {"total_rows": 0}
        mcp_reports.sales(
            date_from="2026-01-01",
            date_to="2026-01-31",
            status="paid",
            channel="fnb",
            shift_id=7,
        )
        row_sql, row_params = fake.calls[0]
        # Nothing the caller sent may appear literally in the SQL text.
        for needle in ("2026-01-01", "2026-01-31", "'paid'", "'fnb'"):
            assert needle not in row_sql
        assert "2026-01-01" in row_params
        assert "2026-01-31" in row_params
        assert "paid" in row_params
        assert "fnb" in row_params
        assert 7 in row_params

    def test_injection_attempt_stays_a_parameter(self, fake):
        fake.one = {"total_rows": 0}
        evil = "paid'; DROP TABLE orders; --"
        mcp_reports.sales(status=evil)
        row_sql, row_params = fake.calls[0]
        assert "DROP TABLE" not in row_sql
        assert evil in row_params

    def test_product_name_filter_is_bound(self, fake):
        fake.one = {"total_rows": 0}
        mcp_reports.order_items(product_name="mie' OR 1=1 --")
        row_sql, row_params = fake.calls[0]
        assert "OR 1=1" not in row_sql
        assert "%mie' OR 1=1 --%" in row_params

    @pytest.mark.parametrize(
        "report_name",
        sorted(mcp_reports.ALLOWED_REPORTS),
    )
    def test_every_report_emits_only_select(self, fake, report_name):
        fake.one = {"total_rows": 0}
        func = getattr(mcp_reports, report_name)
        func()
        assert fake.calls, f"{report_name} issued no query"
        for sql, _ in fake.calls:
            assert sql.lstrip().upper().startswith("SELECT"), sql
            for keyword in ("INSERT ", "UPDATE ", "DELETE ", "TRUNCATE", "ALTER ", "DROP "):
                assert keyword not in sql.upper()

    def test_unknown_report_is_rejected(self, fake):
        with pytest.raises(ValueError, match="unknown report"):
            mcp_reports.paginated("orders_dump")

    @pytest.mark.parametrize("report_name", sorted(mcp_reports.ALLOWED_REPORTS))
    def test_universal_gate_accepts_every_allowlisted_report(self, fake, report_name):
        """report_query must not blow up on reports without a date parameter."""
        fake.one = {"total_rows": 0}
        response = mcp_reports.paginated(
            report_name, date_from="2026-10-01", date_to="2026-10-31", limit=5
        )
        assert response["pagination"]["limit"] == 5
        # Snapshot reports must not silently keep a date filter.
        if report_name in ("products", "low_stock", "members"):
            assert response["date_range"] == {"from": None, "to": None}

    def test_universal_gate_applies_canonical_filters(self, fake):
        fake.one = {"total_rows": 0}
        mcp_reports.paginated("sales", filter_key="shift_id", filter_value="4")
        _, params = fake.calls[0]
        assert 4 in params

    def test_no_arbitrary_sql_parameter_exists(self):
        import inspect

        for name in mcp_reports.ALLOWED_REPORTS:
            signature = inspect.signature(getattr(mcp_reports, name))
            assert "sql" not in signature.parameters
            assert "query" not in signature.parameters

    def test_date_column_must_be_allowlisted(self):
        with pytest.raises(ValueError, match="not allowlisted"):
            mcp_reports._date_sql("o.created_at; DROP TABLE orders --")

    def test_every_report_uses_an_allowlisted_date_column(self, fake):
        fake.one = {"total_rows": 0}
        for name in mcp_reports.ALLOWED_REPORTS:
            fake.calls.clear()
            getattr(mcp_reports, name)()
            for sql, _ in fake.calls:
                for fragment in ("AT TIME ZONE",):
                    if fragment in sql:
                        assert "created_at" in sql or "opened_at" in sql


# ── Validation and bounds ───────────────────────────────────────────────────


class TestValidation:
    def test_invalid_date_rejected(self, fake):
        with pytest.raises(ValueError, match="ISO date"):
            mcp_reports.sales(date_from="17-10-2026")

    def test_reversed_range_rejected(self, fake):
        with pytest.raises(ValueError, match="earlier than or equal"):
            mcp_reports.sales(date_from="2026-10-31", date_to="2026-10-01")

    def test_range_larger_than_a_year_rejected(self, fake):
        with pytest.raises(ValueError, match="date range too large"):
            mcp_reports.sales(date_from="2024-01-01", date_to="2026-01-01")

    def test_limit_is_capped(self, fake):
        fake.one = {"total_rows": 0}
        response = mcp_reports.sales(limit=10_000)
        assert response["pagination"]["limit"] == mcp_reports.MAX_LIMIT

    def test_limit_floor_is_one(self, fake):
        fake.one = {"total_rows": 0}
        assert mcp_reports.sales(limit=0)["pagination"]["limit"] == 1
        assert mcp_reports.sales(limit=-50)["pagination"]["limit"] == 1

    def test_offset_never_negative(self, fake):
        fake.one = {"total_rows": 0}
        assert mcp_reports.sales(offset=-10)["pagination"]["offset"] == 0

    def test_non_integer_limit_rejected(self, fake):
        with pytest.raises(ValueError, match="limit must be an integer"):
            mcp_reports.sales(limit="many")  # type: ignore[arg-type]

    def test_filter_key_must_belong_to_report(self, fake):
        with pytest.raises(ValueError, match="not valid for report"):
            mcp_reports.paginated("sales", filter_key="method", filter_value="cash")

    def test_id_filter_must_be_numeric(self, fake):
        with pytest.raises(ValueError, match="must be an integer"):
            mcp_reports.paginated("sales", filter_key="shift_id", filter_value="abc")


# ── Pagination and stable totals ────────────────────────────────────────────


class TestPagination:
    def test_totals_query_is_independent_of_page(self, fake):
        fake.rows = [{"id": 1, "grand_total": 76_000}]
        fake.one = {"total_rows": 3, "grand_total": 250_000}

        page1 = mcp_reports.sales(limit=1, offset=0)
        row_sql_1, row_params_1 = fake.calls[0]
        totals_sql_1, totals_params_1 = fake.calls[1]

        fake.calls.clear()
        page2 = mcp_reports.sales(limit=1, offset=2)
        row_sql_2, row_params_2 = fake.calls[0]
        totals_sql_2, totals_params_2 = fake.calls[1]

        # The aggregate query never contains LIMIT/OFFSET and is byte-identical
        # across pages, so totals cannot drift while paging.
        assert "LIMIT" not in totals_sql_1.upper()
        assert totals_sql_1 == totals_sql_2
        assert totals_params_1 == totals_params_2
        assert page1["totals"] == page2["totals"] == {"grand_total": 250_000.0}

        # Only the row query carries the paging parameters.
        assert row_params_1[-2:] == (1, 0)
        assert row_params_2[-2:] == (1, 2)
        assert row_sql_1 == row_sql_2

    def test_has_more_reflects_total_rows(self, fake):
        fake.rows = [{"id": 1}]
        fake.one = {"total_rows": 10}
        assert mcp_reports.sales(limit=1, offset=0)["pagination"]["has_more"] is True
        assert mcp_reports.sales(limit=1, offset=9)["pagination"]["has_more"] is False

    def test_offset_beyond_total_returns_empty_page(self, fake):
        fake.rows = []
        fake.one = {"total_rows": 2}
        response = mcp_reports.sales(limit=50, offset=100)
        assert response["rows"] == []
        assert response["pagination"]["returned"] == 0
        assert response["pagination"]["has_more"] is False

    def test_full_dump_via_repeated_pages(self, fake, monkeypatch):
        """Walking offset by limit must cover every row exactly once."""
        total = 7
        all_rows = [{"id": i, "grand_total": 1_000} for i in range(total)]

        def query(sql, params=()):
            limit, offset = params[-2], params[-1]
            fake.calls.append((sql, params))
            return all_rows[offset: offset + limit]

        monkeypatch.setattr(mcp_reports, "query", query)
        fake.one = {"total_rows": total}

        seen: list[int] = []
        offset = 0
        while True:
            page = mcp_reports.sales(limit=3, offset=offset)
            seen.extend(row["id"] for row in page["rows"])
            if not page["pagination"]["has_more"]:
                break
            offset += page["pagination"]["limit"]
        assert seen == list(range(total))


# ── Rendering ──────────────────────────────────────────────────────────────


class TestFormatting:
    def test_response_renders_totals_and_page_info(self, fake):
        fake.rows = [{"id": 1, "grand_total": 76_000, "status": "paid"}]
        fake.one = {"total_rows": 1, "grand_total": 76_000}
        text = mcp_reports.run_and_format("sales", date_from="2026-10-01",
                                          date_to="2026-10-31", limit=10)
        assert "Rp 76.000" in text
        assert "has_more: no" in text
        assert "Totals" in text
        assert "2026-10-01" in text

    def test_empty_result_is_explicit(self, fake):
        fake.rows = []
        fake.one = {"total_rows": 0}
        text = mcp_reports.run_and_format("sales")
        assert "tidak ada baris" in text

    def test_long_cells_are_truncated(self):
        rendered = mcp_reports._format_cell("note", "x" * 200)
        assert len(rendered) <= mcp_reports._MAX_CELL_WIDTH
        assert rendered.endswith("…")

    def test_money_and_quantity_formatting(self):
        assert mcp_reports._format_cell("grand_total", 76_000) == "Rp 76.000"
        assert mcp_reports._format_cell("qty", 2.0) == "2"
        assert mcp_reports._format_cell("qty_delta", -0.25) == "-0.25"

    def test_no_rupiah_without_space_in_output(self, fake):
        """Ensure all money formatting uses 'Rp ' (with space) and '.' as thousand separator."""
        # Test _format_money directly
        assert mcp_reports._format_money(76_000) == "Rp 76.000"
        assert mcp_reports._format_money(0) == "Rp 0"
        assert mcp_reports._format_money(None) == "Rp 0"
        assert mcp_reports._format_money(1_500_000) == "Rp 1.500.000"
        assert mcp_reports._format_money(999) == "Rp 999"
        
        # Test through _format_cell for all money fields
        for field in mcp_reports._MONEY_FIELDS:
            formatted = mcp_reports._format_cell(field, 76_000)
            assert formatted.startswith("Rp "), f"Field {field} missing space after Rp: {formatted!r}"
            assert formatted[:3] == "Rp ", f"Field {field} has malformed Rp prefix: {formatted!r}"
            assert "," not in formatted, f"Field {field} uses comma separator: {formatted!r}"
        
        # Test through run_and_format for a real report
        fake.rows = [{"id": 1, "grand_total": 76_000, "subtotal": 70_000, "discount_total": 5_000}]
        fake.one = {"total_rows": 1, "grand_total": 76_000, "subtotal": 70_000, "discount_total": 5_000}
        
        text = mcp_reports.run_and_format("sales", date_from="2026-10-01", date_to="2026-10-31", limit=10)
        
        # No "Rp" without following space should appear
        import re
        # Find all occurrences of Rp followed by a digit (no space)
        bad_matches = re.findall(r"Rp\d", text)
        assert not bad_matches, f"Found Rp without space in output: {bad_matches}"
        
        # No comma thousand separators in money values
        comma_matches = re.findall(r"Rp [\d,]+", text)
        for match in comma_matches:
            assert "," not in match, f"Found comma in formatted money: {match}"


class TestMcpServerMoneyFormat:
    """The MCP tool layer (app/mcp_server.py) must use the same canonical
    rupiah format as app/mcp_reports.py.

    Regression guard: FIX-D only fixed mcp_reports, leaving 7 raw
    `Rp{value:,.0f}` interpolations in mcp_server.py. Those render as
    "Rp76,000" — no space, comma separator — so a tool like sales_today
    produced a different format from the reports it summarizes.
    """

    def test_mcp_server_source_has_no_raw_rupiah_interpolation(self):
        """Source-level guard: no `Rp{` f-string interpolation in mcp_server.py."""
        import pathlib
        import re as _re

        src = pathlib.Path(mcp_server_path()).read_text(encoding="utf-8")
        bad = _re.findall(r"Rp\{", src)
        assert not bad, (
            "app/mcp_server.py still interpolates raw rupiah "
            f"({len(bad)} occurrence(s)). Use mcp_reports._format_money()."
        )

    def test_mcp_server_tools_render_canonical_rupiah(self, monkeypatch):
        """Call a real MCP tool and assert its money output uses 'Rp 76.000'."""
        import importlib
        import re as _re

        mod = importlib.import_module("app.mcp_server")

        rows = [
            {
                "transactions": 2,
                "revenue": 76_000,
                "avg_ticket": 38_000,
            }
        ]

        monkeypatch.setattr(mod, "query", lambda *a, **k: rows)
        out = mod.sales_today()
        assert "Rp 76.000" in out, f"Expected canonical rupiah in sales_today output: {out!r}"
        assert "Rp0" not in out, f"sales_today still emits bare 'Rp0': {out!r}"
        assert not _re.search(r"Rp\d", out), f"sales_today emits 'Rp' without space: {out!r}"


def mcp_server_path():
    import pathlib

    import app.mcp_server as _m

    return pathlib.Path(_m.__file__).resolve()


# ── Privacy ────────────────────────────────────────────────────────────────


class TestPrivacy:
    def test_members_report_excludes_pii(self, fake):
        fake.one = {"total_rows": 0}
        mcp_reports.members()
        row_sql, _ = fake.calls[0]
        assert "phone" not in row_sql
        assert "email" not in row_sql

    def test_audit_logs_does_not_dump_json_snapshots(self, fake):
        fake.one = {"total_rows": 0}
        mcp_reports.audit_logs()
        row_sql, _ = fake.calls[0]
        assert "before_state" not in row_sql
        assert "after_state" not in row_sql

    def test_payments_report_exposes_no_idempotency_key(self, fake):
        fake.one = {"total_rows": 0}
        mcp_reports.payments()
        row_sql, _ = fake.calls[0]
        assert "idempotency_key" not in row_sql

    def test_payments_report_carries_tendered_drift(self, fake):
        """Shortage kas harus terlihat di laporan, bukan hanya di baris payments."""
        fake.one = {"total_rows": 0}
        mcp_reports.payments()
        row_sql, _ = fake.calls[0]
        total_sql, _ = fake.calls[1]
        assert "tendered_drift" in row_sql
        assert "SUM(tendered_drift)" in total_sql


# ── DSN resolution never hardcodes a credential ────────────────────────────


class TestDsnResolution:
    def test_dsn_prefers_explicit_override(self, monkeypatch):
        from app import mcp_db

        monkeypatch.setenv("MCP_DATABASE_URL", "postgresql://u@example:5432/d")
        assert mcp_db.database_url() == "postgresql://u@example:5432/d"

    def test_compose_host_is_rewritten_for_host_process(self, monkeypatch):
        from app import mcp_db

        # The compose service publishes Postgres on the Tailscale address, not on
        # loopback, so rewriting `db` to 127.0.0.1 produced connection refused (R-08).
        monkeypatch.delenv("MCP_DATABASE_URL", raising=False)
        monkeypatch.delenv("MCP_DB_HOST", raising=False)
        monkeypatch.delenv("GRANDPOS_DB_HOST", raising=False)
        monkeypatch.setenv("DATABASE_URL", "postgresql://u:***@db:5432/grandpos")
        assert mcp_db.database_url() == "postgresql://u:***@100.117.186.13:5432/grandpos"

    def test_compose_host_rewrite_is_overridable(self, monkeypatch):
        from app import mcp_db

        monkeypatch.delenv("MCP_DATABASE_URL", raising=False)
        monkeypatch.setenv("MCP_DB_HOST", "10.0.0.9")
        monkeypatch.setenv("DATABASE_URL", "postgresql://u:***@db:5432/grandpos")
        assert mcp_db.database_url() == "postgresql://u:***@10.0.0.9:5432/grandpos"

    def test_explicit_host_is_never_rewritten(self, monkeypatch):
        from app import mcp_db

        monkeypatch.setenv("MCP_DB_HOST", "10.0.0.9")
        monkeypatch.setenv("MCP_DATABASE_URL", "postgresql://u@127.0.0.1:5432/grandpos")
        assert mcp_db.database_url() == "postgresql://u@127.0.0.1:5432/grandpos"

    def test_ai_role_used_only_when_requested(self, monkeypatch):
        from app import mcp_db

        monkeypatch.delenv("MCP_DATABASE_URL", raising=False)
        monkeypatch.setenv("AI_DATABASE_URL", "postgresql://ai@127.0.0.1:5432/grandpos")
        monkeypatch.setenv("DATABASE_URL", "postgresql://app@127.0.0.1:5432/grandpos")
        monkeypatch.delenv("MCP_DB_USE_AI_ROLE", raising=False)
        assert mcp_db.database_url() == "postgresql://app@127.0.0.1:5432/grandpos"
        monkeypatch.setenv("MCP_DB_USE_AI_ROLE", "1")
        assert mcp_db.database_url() == "postgresql://ai@127.0.0.1:5432/grandpos"

    def test_describe_target_never_leaks_a_password(self, monkeypatch):
        from app import mcp_db

        monkeypatch.setenv(
            "MCP_DATABASE_URL", "postgresql://user:sup3rs3cret@127.0.0.1:5432/grandpos"
        )
        assert "sup3rs3cret" not in mcp_db.describe_target()

    def test_no_credential_literal_in_source(self):
        source = Path(mcp_reports.__file__).with_name("mcp_db.py").read_text()
        assert "sup3rs3cret" not in source
        # A literal password would look like user:long-token@ inside a DSN.
        import re

        assert not re.search(r"postgresql://[a-z_]+:[A-Za-z0-9]{16,}@", source)
