# GrandPOS MCP Reports

The GrandPOS MCP server (`app/mcp_server.py`) now exposes a read-only reporting
surface in addition to the original today-only snapshot tools. Every new tool
queries PostgreSQL inside a read-only transaction and cannot modify data.

## Available tools

Legacy tools (kept unchanged):

- `sales_today`
- `shift_current`
- `menu_popular`
- `vendor_settlement_today`
- `cash_variance`
- `stock_low`

New historical / comprehensive tools:

| Tool | Description |
|------|-------------|
| `sales_report` | Transactions, subtotal, discount, service, tax, grand total, COGS |
| `order_items_report` | Sold line items: qty, price, discount, cost, gross margin |
| `payments_report` | Payments/settlements by method and status |
| `shifts_report` | Shift summaries including cash variance |
| `cash_movements_report` | Cash drawer movements |
| `inventory_movements_report` | Stock movements: purchase, consumption, adjustment, waste |
| `vendor_settlements_report` | Vendor settlements |
| `products_report` | Product/menu catalogue |
| `low_stock_report` | Ingredients below minimum stock |
| `daily_turnover_report` | Aggregated daily turnover from `v_daily_turnover` |
| `members_report` | Member points & spend (no phone/email) |
| `audit_logs_report` | Audit trail (no JSON snapshots) |
| `report_query` | Universal gate: choose report by name and page through it |
| `reports_catalog` | List every available report |

## Paging and date range

- `limit`: 1–500 rows per call (default 50, capped at 500).
- `offset`: 0-based, for the next page.
- `date_from` / `date_to`: ISO dates (`YYYY-MM-DD`), Jakarta business timezone.
  Maximum range is 366 days. Omit both to paginate the entire history.

## Universal entrypoint: `report_query`

```json
{
  "report": "sales",
  "date_from": "2026-10-01",
  "date_to": "2026-10-31",
  "filter_key": "status",
  "filter_value": "paid",
  "limit": 100,
  "offset": 0
}
```

Repeat with `offset += limit` while `pagination.has_more == true` to fetch all
rows.

## Safety guarantees

1. **No SQL injection** — every value is a psycopg2 bound parameter.
2. **Read-only transactions** — every connection calls `conn.set_session(readonly=True)` and `SET TRANSACTION READ ONLY`. Any write raises `ReadOnlySqlTransaction`.
3. **No hardcoded credentials** — DSN is resolved from `MCP_DATABASE_URL`, `DATABASE_URL`, or the repo `.env` file.
4. **No mutation tools** — tool names are checked by tests to avoid `create/update/delete/write/reset/...`.
5. **No PII leakage** — member phone/email, audit JSON snapshots and payment idempotency keys are never selected.
6. **Bounded dumps** — hard limits on rows and date ranges.

## Environment variables

| Variable | Purpose |
|----------|---------|
| `MCP_DATABASE_URL` | Optional explicit DSN for the MCP server |
| `DATABASE_URL` | Default DSN; `db:` host is rewritten to `127.0.0.1` |
| `GRANDPOS_ENV_FILE` | Path to `.env` if not at repo root |
| `MCP_DB_USE_AI_ROLE=1` | Use `AI_DATABASE_URL` (only analytics views work) |
| `GRANDPOS_TZ` | Business timezone (default `Asia/Jakarta`) |
| `MCP_HOST` / `MCP_PORT` | Bind address and port |

## Local verification

```bash
# Hermetic unit tests (no DB needed)
./venv_mcp/bin/python -m pytest tests/test_mcp_reports.py tests/test_mcp_server_tools.py -q

# Live DB tests (read-only)
MCP_LIVE_DB=1 ./venv_mcp/bin/python -m pytest tests/test_mcp_live_db.py -q

# End-to-end MCP handshake against a fresh server instance
./venv_mcp/bin/python scripts/mcp_live_check.py
```

If `ImportError: cannot import name 'ArgsKwargs' from 'pydantic_core._pydantic_core'`
appears, the venv interpreter (Python 3.11) is loading another Python's
`site-packages` through `PYTHONPATH`. Re-run with
`env -u PYTHONPATH PYTHONNOUSERSITE=1 ...`.

## Deployment notes

The existing systemd unit `/etc/systemd/system/grandpos-mcp.service` runs
`app/mcp_server.py` from the `venv_mcp` environment. After pulling the new
files, only a service restart is needed:

```bash
systemctl daemon-reload
systemctl restart grandpos-mcp.service
systemctl status grandpos-mcp.service
```

No production deployment has been performed by this task; stop here and have
Qim run the restart step above.
