"""Read-only reporting layer for the GrandPOS MCP server.

Each public function returns a plain dict with:

  rows        — list of result rows (already converted to JSON-safe values)
  totals      — dict of stable aggregates computed over the full filter set
  page        — human-readable pagination info
  generated_at — ISO timestamp

Design rules:

* No caller-supplied SQL is ever concatenated.  Every value is passed as a
  psycopg2 parameter (%s).
* Pagination limits are hard-capped so a single tool call cannot dump the DB.
* Date filters use the business timezone (Asia/Jakarta) so reports match the
  analytics views.
* Money stays as integer Rupiah; quantities are returned as float.
* No credential, hash, or sensitive customer detail (phone/email) is exposed.
"""

from __future__ import annotations

import json
from datetime import date, datetime
from decimal import Decimal
from typing import Any

from app.db import business_now
from app.mcp_db import query, query_one

# ── Bounds ───────────────────────────────────────────────────────────────────

MAX_LIMIT = 500
MAX_DATE_RANGE_DAYS = 366
DEFAULT_LIMIT = 50

ALLOWED_REPORTS = {
    "sales",
    "order_items",
    "payments",
    "shifts",
    "cash_movements",
    "inventory_movements",
    "vendor_settlements",
    "products",
    "low_stock",
    "daily_turnover",
    "members",
    "audit_logs",
}


# ── Sanitise / format helpers ────────────────────────────────────────────────


def _safe(value: Any) -> Any:
    """Convert PostgreSQL/Decimal/datetime values into JSON-safe primitives."""
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, date):
        return value.isoformat()
    if isinstance(value, Decimal):
        return float(value)
    return value


def _sanitize(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [{k: _safe(v) for k, v in row.items()} for row in rows]


def _format_money(value: int | float | Decimal | None) -> str:
    if value is None:
        return "Rp 0"
    return "Rp " + f"{int(value):,}".replace(",", ".")


# ── Validation helpers ───────────────────────────────────────────────────────


def _parse_date(value: str | None, name: str = "date") -> date | None:
    if not value:
        return None
    try:
        return date.fromisoformat(value)
    except ValueError as exc:
        raise ValueError(f"{name} must be ISO date (YYYY-MM-DD): {value!r}") from exc


def _validate_date_range(
    date_from: str | None,
    date_to: str | None,
    max_days: int = MAX_DATE_RANGE_DAYS,
) -> tuple[date | None, date | None]:
    d_from = _parse_date(date_from, "date_from")
    d_to = _parse_date(date_to, "date_to")
    if d_from and d_to and d_from > d_to:
        raise ValueError("date_from must be earlier than or equal to date_to")
    if d_from and d_to and (d_to - d_from).days > max_days:
        raise ValueError(
            f"date range too large ({(d_to - d_from).days} days); max {max_days} days"
        )
    return d_from, d_to


def _clamp_limit(limit: int | None) -> int:
    if limit is None:
        return DEFAULT_LIMIT
    try:
        limit = int(limit)
    except (TypeError, ValueError) as exc:
        raise ValueError("limit must be an integer") from exc
    if limit < 1:
        limit = 1
    if limit > MAX_LIMIT:
        limit = MAX_LIMIT
    return limit


def _clamp_offset(offset: int | None) -> int:
    if offset is None:
        return 0
    try:
        offset = int(offset)
    except (TypeError, ValueError) as exc:
        raise ValueError("offset must be an integer") from exc
    return max(0, offset)


_DATE_COLUMNS = {
    "o.created_at",
    "oi.created_at",
    "p.created_at",
    "s.opened_at",
    "c.created_at",
    "im.created_at",
    "vs.created_at",
    "a.created_at",
}


def _date_sql(column: str) -> str:
    """Return a business-timezone date filter fragment with two %s placeholders.

    ``column`` is interpolated into the SQL text, so it is checked against a
    fixed allowlist of qualified column names defined in this module.  It is
    never derived from caller input.
    """
    if column not in _DATE_COLUMNS:
        raise ValueError(f"date column not allowlisted: {column!r}")
    return (
        f"({column} AT TIME ZONE current_setting('grandpos.timezone', true))::date "
        "BETWEEN %s AND %s"
    )


def _apply_filters(
    filters: list[str],
    params: list[Any],
    *,
    date_from: date | None,
    date_to: date | None,
    date_column: str,
) -> None:
    if date_from and date_to:
        filters.append(_date_sql(date_column))
        params.extend([date_from.isoformat(), date_to.isoformat()])


def _where(filters: list[str]) -> str:
    return "WHERE " + " AND ".join(filters) if filters else ""


# ── Response builder ──────────────────────────────────────────────────────────


def _build_response(
    rows: list[dict[str, Any]],
    totals: dict[str, Any] | None,
    *,
    limit: int,
    offset: int,
    total_rows: int,
    date_from: date | None,
    date_to: date | None,
) -> dict[str, Any]:
    return {
        "rows": _sanitize(rows),
        "totals": _sanitize([totals])[0] if totals else None,
        "pagination": {
            "limit": limit,
            "offset": offset,
            "returned": len(rows),
            "total_rows": total_rows,
            "has_more": offset + len(rows) < total_rows,
        },
        "date_range": {
            "from": date_from.isoformat() if date_from else None,
            "to": date_to.isoformat() if date_to else None,
        },
        "generated_at": business_now().isoformat(),
    }


_MONEY_FIELDS = {
    "amount", "grand_total", "subtotal", "line_total", "cash_sales",
    "non_cash_sales", "cash_in_total", "cash_out_total", "vendor_cash_total",
    "expected_cash", "counted_cash", "variance", "total_cost", "gross_turnover",
    "total_discount", "net_revenue", "total_cogs", "revenue", "cogs",
    "gross_margin", "vendor_amount", "opening_float", "discount_total",
    "tax_total", "service_total", "line_subtotal", "line_discount", "tendered",
    "tendered_drift",
    "change_due", "paid_total", "total_spend", "base_price", "cost_price",
    "unit_price", "gross_sales", "commission_base", "discount_absorbed",
    "cash_in", "cash_out", "cogs_total",
}

_QUANTITY_FIELDS = {
    "qty", "qty_delta", "stock_qty", "min_stock_qty", "reorder_qty",
    "shortage_qty", "weight_grams", "points_earn_rate", "profit_share_percent",
    "units_sold",
}

_MAX_CELL_WIDTH = 24
_MAX_TABLE_COLUMNS = 9


def _format_cell(key: str, value: Any) -> str:
    if value is None:
        return "-"
    if key in _MONEY_FIELDS and isinstance(value, (int, float)):
        return _format_money(value)
    if key in _QUANTITY_FIELDS and isinstance(value, (int, float)):
        if float(value).is_integer():
            return f"{int(value):,}"
        return f"{float(value):,.3f}".rstrip("0").rstrip(".")
    if isinstance(value, bool):
        return "yes" if value else "no"
    if isinstance(value, (list, dict)):
        return json.dumps(value, ensure_ascii=False)
    text = str(value)
    # Compact ISO timestamps so wide tables stay readable.
    if "T" in text and len(text) >= 16 and text[4] == "-" and text[10] == "T":
        text = text.replace("T", " ")[:16]
    if len(text) > _MAX_CELL_WIDTH:
        return text[: _MAX_CELL_WIDTH - 1] + "…"
    return text


def _format_table(rows: list[dict[str, Any]], columns: list[str] | None = None) -> list[str]:
    """Render rows as an aligned, width-capped text table.

    ``columns`` (when given) is a curated, report-specific projection so wide
    result sets stay readable in a chat transcript.  It only affects rendering;
    the underlying data returned to a programmatic caller is untouched.  Any
    column not listed is reported in a footer so nothing silently disappears.
    """
    all_keys = list(rows[0].keys())
    keys = [k for k in (columns or all_keys) if k in all_keys]
    hidden = [k for k in all_keys if k not in keys]

    rendered = [[_format_cell(k, row.get(k)) for k in keys] for row in rows]
    headers = [str(k).replace("_", " ") for k in keys]

    widths = []
    for idx, header in enumerate(headers):
        width = len(header)
        for line in rendered:
            width = max(width, len(line[idx]))
        widths.append(min(width, _MAX_CELL_WIDTH))

    def fmt_line(cells: list[str]) -> str:
        return "  " + "  ".join(
            cell[:widths[i]].ljust(widths[i]) for i, cell in enumerate(cells)
        ).rstrip()

    lines = [fmt_line(headers), "  " + "  ".join("-" * w for w in widths)]
    lines.extend(fmt_line(line) for line in rendered)
    if hidden:
        lines.append("  (kolom tidak ditampilkan: " + ", ".join(hidden) + ")")
    return lines


def _format_response(response: dict[str, Any], title: str) -> str:
    """Render a response dict as a concise text table plus totals block."""
    page = response["pagination"]
    lines: list[str] = [f"📋 {title}"]
    lines.append(
        f"  Range: {response['date_range']['from'] or '-'} → "
        f"{response['date_range']['to'] or '-'}"
    )
    lines.append(
        f"  Rows: {page['returned']} of {page['total_rows']} "
        f"(offset {page['offset']}, limit {page['limit']}, "
        f"has_more: {'yes' if page['has_more'] else 'no'})"
    )

    rows = response["rows"]
    if rows:
        lines.append("")
        lines.extend(_format_table(rows))
    else:
        lines.append("  (tidak ada baris)")

    totals = response.get("totals")
    if totals:
        lines.append("")
        lines.append("Totals (seluruh hasil filter):")
        for k, v in totals.items():
            label = str(k).replace("_", " ")
            if isinstance(v, bool):
                lines.append(f"  • {label}: {'yes' if v else 'no'}")
            elif k in _MONEY_FIELDS and isinstance(v, (int, float)):
                lines.append(f"  • {label}: {_format_money(v)}")
            elif k in _QUANTITY_FIELDS and isinstance(v, (int, float)):
                lines.append(f"  • {label}: {_format_cell(k, v)}")
            else:
                lines.append(f"  • {label}: {v}")

    return "\n".join(lines)


# ── Core report implementations ──────────────────────────────────────────────


def sales(
    date_from: str | None = None,
    date_to: str | None = None,
    status: str | None = None,
    channel: str | None = None,
    shift_id: int | None = None,
    limit: int = DEFAULT_LIMIT,
    offset: int = 0,
) -> dict[str, Any]:
    """Sales/transactions with date range, status, channel and shift filters."""
    d_from, d_to = _validate_date_range(date_from, date_to)
    limit = _clamp_limit(limit)
    offset = _clamp_offset(offset)

    filters: list[str] = []
    params: list[Any] = []
    _apply_filters(filters, params, date_from=d_from, date_to=d_to, date_column="o.created_at")

    if status:
        filters.append("o.status = %s")
        params.append(status)
    if channel:
        filters.append("o.channel = %s")
        params.append(channel)
    if shift_id:
        filters.append("o.shift_id = %s")
        params.append(shift_id)

    where = _where(filters)

    row_sql = (
        "SELECT o.id, o.order_number, o.channel, o.order_type, o.status, "
        "       o.customer_name, o.guest_count, o.subtotal, o.discount_total, "
        "       o.service_total, o.tax_total, o.grand_total, o.cogs_total, "
        "       o.points_earned, o.points_redeemed, o.paid_at, o.created_at "
        "FROM orders o " + where + " ORDER BY o.created_at DESC LIMIT %s OFFSET %s"
    )
    total_sql = (
        "SELECT COUNT(*) AS total_rows, "
        "       COALESCE(SUM(subtotal), 0) AS subtotal, "
        "       COALESCE(SUM(discount_total), 0) AS discount_total, "
        "       COALESCE(SUM(service_total), 0) AS service_total, "
        "       COALESCE(SUM(tax_total), 0) AS tax_total, "
        "       COALESCE(SUM(grand_total), 0) AS grand_total, "
        "       COALESCE(SUM(cogs_total), 0) AS cogs_total "
        "FROM orders o " + where
    )

    rows = query(row_sql, tuple(params + [limit, offset]))
    totals = query_one(total_sql, tuple(params))
    total_rows = totals.pop("total_rows", 0) if totals else 0

    return _build_response(
        rows, totals, limit=limit, offset=offset, total_rows=total_rows,
        date_from=d_from, date_to=d_to,
    )


def order_items(
    date_from: str | None = None,
    date_to: str | None = None,
    product_id: int | None = None,
    product_name: str | None = None,
    channel: str | None = None,
    status: str | None = None,
    limit: int = DEFAULT_LIMIT,
    offset: int = 0,
) -> dict[str, Any]:
    """Sale line items / menu performance with optional product and date filters."""
    d_from, d_to = _validate_date_range(date_from, date_to)
    limit = _clamp_limit(limit)
    offset = _clamp_offset(offset)

    filters: list[str] = []
    params: list[Any] = []
    _apply_filters(filters, params, date_from=d_from, date_to=d_to, date_column="oi.created_at")

    if product_id:
        filters.append("oi.product_id = %s")
        params.append(product_id)
    if product_name:
        filters.append("oi.product_name ILIKE %s")
        params.append(f"%{product_name}%")
    if channel:
        filters.append("oi.channel = %s")
        params.append(channel)
    if status:
        filters.append("oi.status = %s")
        params.append(status)

    where = _where(filters)

    row_sql = (
        "SELECT o.order_number, oi.product_id, oi.product_name, oi.channel, "
        "       oi.qty, oi.unit_price, oi.line_subtotal, oi.line_discount, "
        "       oi.line_total, oi.unit_cost, oi.line_cost, "
        "       (oi.line_total - oi.line_cost) AS gross_margin, oi.status, "
        "       oi.created_at "
        "FROM order_items oi "
        "JOIN orders o ON o.id = oi.order_id " + where +
        " ORDER BY oi.created_at DESC LIMIT %s OFFSET %s"
    )
    total_sql = (
        "SELECT COUNT(*) AS total_rows, "
        "       COALESCE(SUM(oi.qty), 0) AS qty, "
        "       COALESCE(SUM(oi.line_total), 0) AS revenue, "
        "       COALESCE(SUM(oi.line_cost), 0) AS cogs, "
        "       COALESCE(SUM(oi.line_total - oi.line_cost), 0) AS gross_margin "
        "FROM order_items oi "
        "JOIN orders o ON o.id = oi.order_id " + where
    )

    rows = query(row_sql, tuple(params + [limit, offset]))
    totals = query_one(total_sql, tuple(params))
    total_rows = totals.pop("total_rows", 0) if totals else 0

    return _build_response(
        rows, totals, limit=limit, offset=offset, total_rows=total_rows,
        date_from=d_from, date_to=d_to,
    )


def payments(
    date_from: str | None = None,
    date_to: str | None = None,
    method: str | None = None,
    status: str | None = None,
    limit: int = DEFAULT_LIMIT,
    offset: int = 0,
) -> dict[str, Any]:
    """Payment/settlements list with method and status filters."""
    d_from, d_to = _validate_date_range(date_from, date_to)
    limit = _clamp_limit(limit)
    offset = _clamp_offset(offset)

    filters: list[str] = []
    params: list[Any] = []
    _apply_filters(filters, params, date_from=d_from, date_to=d_to, date_column="p.created_at")

    if method:
        filters.append("p.method = %s")
        params.append(method)
    if status:
        filters.append("p.status = %s")
        params.append(status)

    where = _where(filters)

    row_sql = (
        "SELECT p.id, o.order_number, p.method, p.amount, p.tendered, "
        "       p.tendered_drift, p.change_due, p.reference_no, p.status, p.captured_by, "
        "       p.shift_id, p.created_at "
        "FROM payments p "
        "LEFT JOIN orders o ON o.id = p.order_id " + where +
        " ORDER BY p.created_at DESC LIMIT %s OFFSET %s"
    )
    total_sql = (
        "SELECT COUNT(*) AS total_rows, COALESCE(SUM(amount), 0) AS amount, "
        "       COALESCE(SUM(tendered_drift), 0) AS tendered_drift "
        "FROM payments p " + where
    )

    rows = query(row_sql, tuple(params + [limit, offset]))
    totals = query_one(total_sql, tuple(params))
    total_rows = totals.pop("total_rows", 0) if totals else 0

    return _build_response(
        rows, totals, limit=limit, offset=offset, total_rows=total_rows,
        date_from=d_from, date_to=d_to,
    )


def shifts(
    date_from: str | None = None,
    date_to: str | None = None,
    status: str | None = None,
    limit: int = DEFAULT_LIMIT,
    offset: int = 0,
) -> dict[str, Any]:
    """Shift/cashier summaries including cash variance."""
    d_from, d_to = _validate_date_range(date_from, date_to)
    limit = _clamp_limit(limit)
    offset = _clamp_offset(offset)

    filters: list[str] = []
    params: list[Any] = []
    _apply_filters(filters, params, date_from=d_from, date_to=d_to, date_column="s.opened_at")

    if status:
        filters.append("s.status = %s")
        params.append(status)

    where = _where(filters)

    row_sql = (
        "SELECT s.id, s.code, s.status, u.username AS cashier, "
        "       s.opened_at, s.closed_at, s.opening_float, s.cash_sales, "
        "       s.non_cash_sales, s.cash_in_total, s.cash_out_total, "
        "       s.vendor_cash_total, s.expected_cash, s.counted_cash, "
        "       s.variance, s.order_count, s.void_count "
        "FROM shifts s "
        "LEFT JOIN users u ON u.id = s.cashier_id " + where +
        " ORDER BY s.opened_at DESC LIMIT %s OFFSET %s"
    )
    total_sql = (
        "SELECT COUNT(*) AS total_rows, "
        "       COALESCE(SUM(cash_sales), 0) AS cash_sales, "
        "       COALESCE(SUM(non_cash_sales), 0) AS non_cash_sales, "
        "       COALESCE(SUM(cash_in_total), 0) AS cash_in_total, "
        "       COALESCE(SUM(cash_out_total), 0) AS cash_out_total, "
        "       COALESCE(SUM(vendor_cash_total), 0) AS vendor_cash_total, "
        "       COALESCE(SUM(variance), 0) AS variance, "
        "       COALESCE(SUM(order_count), 0) AS order_count "
        "FROM shifts s " + where
    )

    rows = query(row_sql, tuple(params + [limit, offset]))
    totals = query_one(total_sql, tuple(params))
    total_rows = totals.pop("total_rows", 0) if totals else 0

    return _build_response(
        rows, totals, limit=limit, offset=offset, total_rows=total_rows,
        date_from=d_from, date_to=d_to,
    )


def cash_movements(
    date_from: str | None = None,
    date_to: str | None = None,
    shift_id: int | None = None,
    movement_type: str | None = None,
    limit: int = DEFAULT_LIMIT,
    offset: int = 0,
) -> dict[str, Any]:
    """Cash drawer movements: float, sales, cash in/out, vendor settlements."""
    d_from, d_to = _validate_date_range(date_from, date_to)
    limit = _clamp_limit(limit)
    offset = _clamp_offset(offset)

    filters: list[str] = []
    params: list[Any] = []
    _apply_filters(filters, params, date_from=d_from, date_to=d_to, date_column="c.created_at")

    if shift_id:
        filters.append("c.shift_id = %s")
        params.append(shift_id)
    if movement_type:
        filters.append("c.movement_type = %s")
        params.append(movement_type)

    where = _where(filters)

    row_sql = (
        "SELECT c.id, c.shift_id, c.movement_type, c.direction, c.amount, "
        "       c.reference_type, c.reference_id, c.reason, c.created_by, c.created_at "
        "FROM cash_movements c " + where +
        " ORDER BY c.created_at DESC LIMIT %s OFFSET %s"
    )
    total_sql = (
        "SELECT COUNT(*) AS total_rows, "
        "       COALESCE(SUM(amount) FILTER (WHERE direction = 'in'), 0) AS cash_in, "
        "       COALESCE(SUM(-amount) FILTER (WHERE direction = 'out'), 0) AS cash_out "
        "FROM cash_movements c " + where
    )

    rows = query(row_sql, tuple(params + [limit, offset]))
    totals = query_one(total_sql, tuple(params))
    total_rows = totals.pop("total_rows", 0) if totals else 0

    return _build_response(
        rows, totals, limit=limit, offset=offset, total_rows=total_rows,
        date_from=d_from, date_to=d_to,
    )


def inventory_movements(
    date_from: str | None = None,
    date_to: str | None = None,
    ingredient_id: int | None = None,
    movement_type: str | None = None,
    limit: int = DEFAULT_LIMIT,
    offset: int = 0,
) -> dict[str, Any]:
    """Inventory/stock movements (purchase, sale consumption, adjustment, waste)."""
    d_from, d_to = _validate_date_range(date_from, date_to)
    limit = _clamp_limit(limit)
    offset = _clamp_offset(offset)

    filters: list[str] = []
    params: list[Any] = []
    _apply_filters(filters, params, date_from=d_from, date_to=d_to, date_column="im.created_at")

    if ingredient_id:
        filters.append("im.ingredient_id = %s")
        params.append(ingredient_id)
    if movement_type:
        filters.append("im.movement_type = %s")
        params.append(movement_type)

    where = _where(filters)

    row_sql = (
        "SELECT im.id, i.sku AS ingredient_sku, i.name AS ingredient_name, "
        "       im.movement_type, im.qty_delta, im.unit_cost, "
        "       (im.qty_delta * im.unit_cost) AS total_cost, "
        "       o.order_number, im.reason, im.created_at "
        "FROM inventory_movements im "
        "JOIN ingredients i ON i.id = im.ingredient_id "
        "LEFT JOIN orders o ON o.id = im.order_id " + where +
        " ORDER BY im.created_at DESC LIMIT %s OFFSET %s"
    )
    total_sql = (
        "SELECT COUNT(*) AS total_rows, "
        "       COALESCE(SUM(im.qty_delta), 0) AS qty_delta, "
        "       COALESCE(SUM(im.qty_delta * im.unit_cost), 0) AS total_cost "
        "FROM inventory_movements im "
        "JOIN ingredients i ON i.id = im.ingredient_id "
        "LEFT JOIN orders o ON o.id = im.order_id " + where
    )

    rows = query(row_sql, tuple(params + [limit, offset]))
    totals = query_one(total_sql, tuple(params))
    total_rows = totals.pop("total_rows", 0) if totals else 0

    return _build_response(
        rows, totals, limit=limit, offset=offset, total_rows=total_rows,
        date_from=d_from, date_to=d_to,
    )


def vendor_settlements(
    date_from: str | None = None,
    date_to: str | None = None,
    vendor_id: int | None = None,
    status: str | None = None,
    limit: int = DEFAULT_LIMIT,
    offset: int = 0,
) -> dict[str, Any]:
    """Vendor settlements with vendor and status filters."""
    d_from, d_to = _validate_date_range(date_from, date_to)
    limit = _clamp_limit(limit)
    offset = _clamp_offset(offset)

    filters: list[str] = []
    params: list[Any] = []
    _apply_filters(filters, params, date_from=d_from, date_to=d_to, date_column="vs.created_at")

    if vendor_id:
        filters.append("vs.vendor_id = %s")
        params.append(vendor_id)
    if status:
        filters.append("vs.status = %s")
        params.append(status)

    where = _where(filters)

    row_sql = (
        "SELECT vs.id, vs.shift_id, v.name AS vendor_name, "
        "       vs.gross_sales, vs.commission_base, vs.discount_absorbed, "
        "       vs.profit_share_percent, vs.vendor_amount, vs.paid_via, "
        "       vs.status, vs.settled_at, vs.created_at "
        "FROM vendor_settlements vs "
        "JOIN vendors v ON v.id = vs.vendor_id " + where +
        " ORDER BY vs.created_at DESC LIMIT %s OFFSET %s"
    )
    total_sql = (
        "SELECT COUNT(*) AS total_rows, "
        "       COALESCE(SUM(gross_sales), 0) AS gross_sales, "
        "       COALESCE(SUM(commission_base), 0) AS commission_base, "
        "       COALESCE(SUM(discount_absorbed), 0) AS discount_absorbed, "
        "       COALESCE(SUM(vendor_amount), 0) AS vendor_amount "
        "FROM vendor_settlements vs "
        "JOIN vendors v ON v.id = vs.vendor_id " + where
    )

    rows = query(row_sql, tuple(params + [limit, offset]))
    totals = query_one(total_sql, tuple(params))
    total_rows = totals.pop("total_rows", 0) if totals else 0

    return _build_response(
        rows, totals, limit=limit, offset=offset, total_rows=total_rows,
        date_from=d_from, date_to=d_to,
    )


def products(
    active_only: bool | None = None,
    category_id: int | None = None,
    limit: int = DEFAULT_LIMIT,
    offset: int = 0,
) -> dict[str, Any]:
    """Product/menu catalogue with optional active/category filters."""
    limit = _clamp_limit(limit)
    offset = _clamp_offset(offset)

    filters: list[str] = []
    params: list[Any] = []
    if active_only:
        filters.append("p.is_active = TRUE")
    if category_id:
        filters.append("p.category_id = %s")
        params.append(category_id)

    where = _where(filters)

    row_sql = (
        "SELECT p.id, p.sku, p.name, c.name AS category_name, p.channel, "
        "       p.base_price, p.cost_price, p.sold_by_weight, p.unit, "
        "       p.weight_rounding, p.points_earn_rate, p.is_active, "
        "       p.created_at, p.updated_at "
        "FROM products p "
        "LEFT JOIN categories c ON c.id = p.category_id " + where +
        " ORDER BY p.name LIMIT %s OFFSET %s"
    )
    total_sql = (
        "SELECT COUNT(*) AS total_rows FROM products p " + where
    )

    rows = query(row_sql, tuple(params + [limit, offset]))
    totals = query_one(total_sql, tuple(params))
    total_rows = totals.pop("total_rows", 0) if totals else 0

    return _build_response(
        rows, None, limit=limit, offset=offset, total_rows=total_rows,
        date_from=None, date_to=None,
    )


def low_stock(limit: int = 50, offset: int = 0) -> dict[str, Any]:
    """Ingredients below their minimum stock threshold."""
    limit = _clamp_limit(limit)
    offset = _clamp_offset(offset)
    row_sql = (
        "SELECT id, sku, name, unit, stock_qty, min_stock_qty, "
        "       reorder_qty, shortage_qty "
        "FROM v_low_stock WHERE is_low = TRUE "
        "ORDER BY shortage_qty DESC LIMIT %s OFFSET %s"
    )
    total_sql = (
        "SELECT COUNT(*) AS total_rows FROM v_low_stock WHERE is_low = TRUE"
    )
    rows = query(row_sql, (limit, offset))
    totals = query_one(total_sql, ())
    total_rows = totals.pop("total_rows", 0) if totals else 0

    return _build_response(
        rows, None, limit=limit, offset=offset, total_rows=total_rows,
        date_from=None, date_to=None,
    )


def daily_turnover(
    date_from: str | None = None,
    date_to: str | None = None,
    limit: int = DEFAULT_LIMIT,
    offset: int = 0,
) -> dict[str, Any]:
    """Daily aggregated turnover per shift/channel from v_daily_turnover."""
    d_from, d_to = _validate_date_range(date_from, date_to)
    limit = _clamp_limit(limit)
    offset = _clamp_offset(offset)

    filters: list[str] = []
    params: list[Any] = []
    if d_from and d_to:
        filters.append("business_date BETWEEN %s AND %s")
        params.extend([d_from.isoformat(), d_to.isoformat()])

    where = _where(filters)

    row_sql = (
        "SELECT business_date, shift_id, channel, paid_orders, void_orders, "
        "       gross_turnover, total_discount, net_revenue, total_cogs "
        "FROM v_daily_turnover " + where +
        " ORDER BY business_date DESC, channel LIMIT %s OFFSET %s"
    )
    total_sql = (
        "SELECT COUNT(*) AS total_rows, "
        "       COALESCE(SUM(paid_orders), 0) AS paid_orders, "
        "       COALESCE(SUM(void_orders), 0) AS void_orders, "
        "       COALESCE(SUM(gross_turnover), 0) AS gross_turnover, "
        "       COALESCE(SUM(total_discount), 0) AS total_discount, "
        "       COALESCE(SUM(net_revenue), 0) AS net_revenue, "
        "       COALESCE(SUM(total_cogs), 0) AS total_cogs "
        "FROM v_daily_turnover " + where
    )

    rows = query(row_sql, tuple(params + [limit, offset]))
    totals = query_one(total_sql, tuple(params))
    total_rows = totals.pop("total_rows", 0) if totals else 0

    return _build_response(
        rows, totals, limit=limit, offset=offset, total_rows=total_rows,
        date_from=d_from, date_to=d_to,
    )


def members(
    active_only: bool | None = None,
    tier: str | None = None,
    limit: int = DEFAULT_LIMIT,
    offset: int = 0,
) -> dict[str, Any]:
    """Member list (PII such as phone/email is deliberately excluded)."""
    limit = _clamp_limit(limit)
    offset = _clamp_offset(offset)

    filters: list[str] = []
    params: list[Any] = []
    if active_only:
        filters.append("is_active = TRUE")
    if tier:
        filters.append("tier = %s")
        params.append(tier)

    where = _where(filters)

    row_sql = (
        "SELECT id, member_code, name, tier, points_balance, total_spend, "
        "       is_active, joined_at, created_at "
        "FROM members " + where + " ORDER BY name LIMIT %s OFFSET %s"
    )
    total_sql = (
        "SELECT COUNT(*) AS total_rows, COALESCE(SUM(points_balance), 0) AS points_balance, "
        "       COALESCE(SUM(total_spend), 0) AS total_spend "
        "FROM members " + where
    )

    rows = query(row_sql, tuple(params + [limit, offset]))
    totals = query_one(total_sql, tuple(params))
    total_rows = totals.pop("total_rows", 0) if totals else 0

    return _build_response(
        rows, totals, limit=limit, offset=offset, total_rows=total_rows,
        date_from=None, date_to=None,
    )


def audit_logs(
    date_from: str | None = None,
    date_to: str | None = None,
    entity_type: str | None = None,
    limit: int = DEFAULT_LIMIT,
    offset: int = 0,
) -> dict[str, Any]:
    """Audit trail.  before_state/after_state JSONB values are kept concise."""
    d_from, d_to = _validate_date_range(date_from, date_to)
    limit = _clamp_limit(limit)
    offset = _clamp_offset(offset)

    filters: list[str] = []
    params: list[Any] = []
    _apply_filters(filters, params, date_from=d_from, date_to=d_to, date_column="a.created_at")

    if entity_type:
        filters.append("a.entity_type = %s")
        params.append(entity_type)

    where = _where(filters)

    row_sql = (
        "SELECT a.id, a.created_at, a.entity_type, a.action, "
        "       u.username AS actor, a.reason "
        "FROM audit_logs a "
        "LEFT JOIN users u ON u.id = a.actor_id " + where +
        " ORDER BY a.created_at DESC LIMIT %s OFFSET %s"
    )
    total_sql = (
        "SELECT COUNT(*) AS total_rows FROM audit_logs a " + where
    )

    rows = query(row_sql, tuple(params + [limit, offset]))
    totals = query_one(total_sql, tuple(params))
    total_rows = totals.pop("total_rows", 0) if totals else 0

    return _build_response(
        rows, totals, limit=limit, offset=offset, total_rows=total_rows,
        date_from=d_from, date_to=d_to,
    )


def paginated(
    report_name: str,
    date_from: str | None = None,
    date_to: str | None = None,
    filter_key: str | None = None,
    filter_value: str | None = None,
    limit: int = DEFAULT_LIMIT,
    offset: int = 0,
) -> dict[str, Any]:
    """Universal owner-style paginated access to any allowlisted report.

    The caller selects the report by name and pages through it with
    ``limit``/``offset``.  Total rows are returned so a client knows how many
    pages remain.  Arbitrary SQL is never accepted; ``report_name`` is validated
    against an allowlist.
    """
    if report_name not in ALLOWED_REPORTS:
        raise ValueError(
            f"unknown report: {report_name!r}. Choose one of: "
            + ", ".join(sorted(ALLOWED_REPORTS))
        )

    kwargs: dict[str, Any] = {
        "date_from": date_from,
        "date_to": date_to,
        "limit": limit,
        "offset": offset,
    }

    # These reports are catalogue/state snapshots, not time series.
    if report_name in ("low_stock", "products", "members"):
        kwargs.pop("date_from", None)
        kwargs.pop("date_to", None)
    if filter_key and filter_value:
        # Map a small number of canonical filters onto each report.
        mapping: dict[str, dict[str, str]] = {
            "sales": {"status": "status", "channel": "channel", "shift_id": "shift_id"},
            "order_items": {"product_id": "product_id", "product_name": "product_name",
                            "channel": "channel", "status": "status"},
            "payments": {"method": "method", "status": "status"},
            "shifts": {"status": "status"},
            "cash_movements": {"shift_id": "shift_id", "movement_type": "movement_type"},
            "inventory_movements": {"ingredient_id": "ingredient_id",
                                    "movement_type": "movement_type"},
            "vendor_settlements": {"vendor_id": "vendor_id", "status": "status"},
            "products": {"category_id": "category_id"},
            "members": {"tier": "tier"},
            "audit_logs": {"entity_type": "entity_type"},
        }
        if report_name in mapping and filter_key in mapping[report_name]:
            target = mapping[report_name][filter_key]
            value: Any = filter_value
            if target.endswith("_id"):
                try:
                    value = int(filter_value)
                except (TypeError, ValueError) as exc:
                    raise ValueError(
                        f"filter_value for {filter_key!r} must be an integer"
                    ) from exc
            kwargs[target] = value
        else:
            raise ValueError(
                f"filter_key {filter_key!r} is not valid for report {report_name!r}"
            )

    func = globals()[report_name]
    return func(**kwargs)


# ── Public formatting helper used by the MCP server tools ──────────────────────


def run_and_format(
    report_name: str,
    **kwargs: Any,
) -> str:
    """Run a report and return a human-readable MCP tool response."""
    func = globals()[report_name]
    response = func(**kwargs)
    return _format_response(response, title=report_name.replace("_", " ").title())
