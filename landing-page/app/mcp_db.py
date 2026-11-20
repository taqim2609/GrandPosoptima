"""Read-only database helper for the GrandPOS MCP server.

Every query run through this module is executed inside a READ ONLY transaction
with a short statement timeout, and the business timezone (`grandpos.timezone`)
is set for the session so date filters match the analytics views.

Which DSN is used (first match wins)
------------------------------------
1. ``MCP_DATABASE_URL``  — explicit override for this server.
2. ``AI_DATABASE_URL``   — only when ``MCP_DB_USE_AI_ROLE=1``.
3. ``DATABASE_URL``      — process environment.
4. ``DATABASE_URL`` from the repo ``.env`` file (``GRANDPOS_ENV_FILE`` overrides
   the path).  ``db`` is rewritten to ``127.0.0.1`` because the MCP server runs
   on the host, not inside the compose network.
5. ``POSTGRES_*`` from the same ``.env`` file, assembled into a DSN.

Credentials are never logged, never returned to a tool caller, and never
hardcoded in this module.

Why the application role instead of ``grandpos_ai``
---------------------------------------------------
The report tools read base tables (``orders``, ``payments``, ``shifts``, …).
``grandpos_ai`` only holds SELECT on the four analytics views (see
``db/roles.sql``), so it cannot answer historical detail questions.  This
module therefore uses the application role and enforces read-only at the
transaction level:

    SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY
    SET LOCAL statement_timeout = '15s'
"""

from __future__ import annotations

import os
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Iterator

# psycopg2 is imported lazily so the pure-Python report layer (and its tests)
# can be imported on hosts that only have the API's psycopg 3 installed.
psycopg2 = None  # type: ignore[assignment]
RealDictCursor = None  # type: ignore[assignment]

MISSING_DRIVER = (
    "psycopg2 is not installed. Install it with "
    "`pip install psycopg2-binary` (the MCP venv already has it)."
)
MISSING_DSN = (
    "No database DSN available. Set MCP_DATABASE_URL or DATABASE_URL in the "
    "environment, or point GRANDPOS_ENV_FILE at the GrandPOS .env file."
)

DEFAULT_ENV_FILE = Path(__file__).resolve().parent.parent / ".env"


def _load_driver() -> None:
    global psycopg2, RealDictCursor
    if psycopg2 is not None:
        return
    try:
        import psycopg2 as _psycopg2
        from psycopg2.extras import RealDictCursor as _RealDictCursor
    except ImportError as exc:  # pragma: no cover - depends on environment
        raise RuntimeError(MISSING_DRIVER) from exc
    psycopg2 = _psycopg2
    RealDictCursor = _RealDictCursor


def _read_env_file(path: Path | None = None) -> dict[str, str]:
    """Parse KEY=VALUE pairs from the GrandPOS .env file (no secrets logged)."""
    env_path = path or Path(os.getenv("GRANDPOS_ENV_FILE", str(DEFAULT_ENV_FILE)))
    if not env_path.is_file():
        return {}
    values: dict[str, str] = {}
    try:
        text = env_path.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return {}
    for raw in text.splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        values[key.strip()] = value.strip().strip('"').strip("'")
    return values


def _host_dsn(dsn: str) -> str:
    """Rewrite only the compose-internal ``db`` host to a reachable host address.

    The compose service publishes Postgres on the Tailscale address
    (``100.117.186.13:5432``), not on loopback, so ``db`` must be rewritten to that
    address. Rewriting to ``127.0.0.1`` made every host-run MCP query fail with
    "connection refused" and silently fall back to whatever else listened there.
    """
    if "@db:" in dsn:
        host = os.getenv("MCP_DB_HOST") or os.getenv("GRANDPOS_DB_HOST") or "100.117.186.13"
        return dsn.replace("@db:", f"@{host}:")
    return dsn


def database_url() -> str:
    """Resolve the DSN for analytics queries without ever logging it."""
    explicit = os.getenv("MCP_DATABASE_URL")
    if explicit:
        return _host_dsn(explicit)

    if os.getenv("MCP_DB_USE_AI_ROLE", "").lower() in ("1", "true", "yes"):
        ai_url = os.getenv("AI_DATABASE_URL")
        if ai_url:
            return _host_dsn(ai_url)

    env_url = os.getenv("DATABASE_URL")
    if env_url:
        return _host_dsn(env_url)

    file_values = _read_env_file()
    file_url = file_values.get("DATABASE_URL")
    if file_url:
        return _host_dsn(file_url)

    user = file_values.get("POSTGRES_USER")
    password = file_values.get("POSTGRES_PASSWORD")
    name = file_values.get("POSTGRES_DB")
    port = file_values.get("POSTGRES_PORT", "5432") or "5432"
    if user and name:
        auth = f"{user}:{password}" if password else user
        return f"postgresql://{auth}@127.0.0.1:{port}/{name}"

    raise RuntimeError(MISSING_DSN)


def describe_target() -> str:
    """Return a credential-free description of the configured target."""
    try:
        dsn = database_url()
    except RuntimeError:
        return "unconfigured"
    tail = dsn.rsplit("@", 1)[-1]
    return f"postgresql://***@{tail}"


@contextmanager
def connect() -> Iterator[Any]:
    """Yield a connection pinned to a READ ONLY transaction.

    Two independent guards are applied because ``SET SESSION CHARACTERISTICS``
    alone is not enough: psycopg2 opens a transaction on the first statement, so
    the characteristics must be set *before* that happens.

      1. ``conn.set_session(readonly=True)`` — every transaction on this
         connection is read-only at the libpq/PostgreSQL level.
      2. ``SET TRANSACTION READ ONLY`` — belt and braces for the open
         transaction, so a write raises ``ReadOnlySqlTransaction``.
    """
    _load_driver()
    driver = psycopg2
    assert driver is not None
    conn = driver.connect(database_url(), cursor_factory=RealDictCursor)
    try:
        conn.set_session(readonly=True, autocommit=False)
        with conn.cursor() as cur:
            cur.execute("SET TRANSACTION READ ONLY")
            cur.execute("SET LOCAL statement_timeout = '15s'")
            cur.execute(
                "SELECT set_config('grandpos.timezone', %s, true)",
                (os.getenv("GRANDPOS_TZ", "Asia/Jakarta"),),
            )
        yield conn
    finally:
        # Never commit: rollback keeps even an accidental write out of the DB.
        try:
            conn.rollback()
        finally:
            conn.close()


def query(sql: str, params: tuple[Any, ...] = ()) -> list[dict[str, Any]]:
    """Run one read-only query and return rows as plain dicts."""
    with connect() as conn:
        with conn.cursor() as cur:
            cur.execute(sql, params)
            rows = cur.fetchall()
    return [dict(row) for row in rows]


def query_one(sql: str, params: tuple[Any, ...] = ()) -> dict[str, Any] | None:
    """Run a read-only query and return at most one row."""
    rows = query(sql, params)
    return rows[0] if rows else None
