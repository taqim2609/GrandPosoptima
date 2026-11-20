"""Registration tests for the GrandPOS MCP server.

The MCP SDK (``mcp``) is only installed in the MCP virtualenv, so these tests
skip cleanly on a host that only has the API dependencies.  They assert:

  * the original six tools are still registered (backward compatibility);
  * every new report tool is registered and read-only by name;
  * no tool name suggests a write/mutation operation;
  * tool input schemas expose the paging/date parameters and nothing that looks
    like raw SQL.
"""

from __future__ import annotations

import asyncio
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

pytest.importorskip("mcp", reason="MCP SDK only present in venv_mcp")

from app import mcp_server  # noqa: E402

LEGACY_TOOLS = {
    "sales_today",
    "shift_current",
    "menu_popular",
    "vendor_settlement_today",
    "cash_variance",
    "stock_low",
}

NEW_TOOLS = {
    "sales_report",
    "order_items_report",
    "payments_report",
    "shifts_report",
    "cash_movements_report",
    "inventory_movements_report",
    "vendor_settlements_report",
    "products_report",
    "low_stock_report",
    "daily_turnover_report",
    "members_report",
    "audit_logs_report",
    "report_query",
    "reports_catalog",
}

FORBIDDEN_NAME_FRAGMENTS = (
    "create", "update", "delete", "insert", "write", "set_", "edit",
    "void_", "pay_", "refund", "adjust", "close_", "open_", "bootstrap",
    "reset", "drop", "truncate",
)


def _tools() -> dict:
    return {tool.name: tool for tool in asyncio.run(mcp_server.app.list_tools())}


class TestRegistration:
    def test_legacy_tools_still_registered(self):
        names = set(_tools())
        assert LEGACY_TOOLS <= names, f"missing legacy tools: {LEGACY_TOOLS - names}"

    def test_new_report_tools_registered(self):
        names = set(_tools())
        assert NEW_TOOLS <= names, f"missing new tools: {NEW_TOOLS - names}"

    def test_no_mutation_tool_names(self):
        for name in _tools():
            lowered = name.lower()
            for fragment in FORBIDDEN_NAME_FRAGMENTS:
                assert fragment not in lowered, f"tool {name!r} looks mutating"

    def test_every_tool_has_a_description(self):
        for name, tool in _tools().items():
            assert tool.description, f"{name} has no description"


class TestSchemas:
    def test_sales_report_exposes_range_and_paging(self):
        schema = _tools()["sales_report"].input_schema
        props = schema["properties"]
        for field in ("date_from", "date_to", "limit", "offset", "status", "channel", "shift_id"):
            assert field in props, f"sales_report missing {field}"

    @pytest.mark.parametrize(
        "tool_name",
        [
            "sales_report",
            "order_items_report",
            "payments_report",
            "shifts_report",
            "cash_movements_report",
            "inventory_movements_report",
            "vendor_settlements_report",
            "products_report",
            "daily_turnover_report",
            "members_report",
            "audit_logs_report",
        ],
    )
    def test_list_tools_support_paging(self, tool_name):
        props = _tools()[tool_name].input_schema["properties"]
        assert "limit" in props and "offset" in props

    def test_no_tool_accepts_raw_sql(self):
        for name, tool in _tools().items():
            props = tool.input_schema.get("properties", {})
            for field in props:
                assert field.lower() not in {"sql", "query", "statement", "raw_sql"}, (
                    f"{name} exposes a raw SQL parameter: {field}"
                )

    def test_report_query_lists_allowlisted_reports(self):
        description = _tools()["report_query"].description or ""
        for report in ("sales", "order_items", "payments", "shifts", "inventory_movements"):
            assert report in description

    def test_reports_catalog_is_callable_without_arguments(self):
        schema = _tools()["reports_catalog"].input_schema
        assert not schema.get("properties")
