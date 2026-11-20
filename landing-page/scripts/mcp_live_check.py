"""End-to-end MCP handshake test against a locally started GrandPOS MCP server.

Read-only: the script starts its own server instance on a free port using the
repo's venv, performs a real MCP SSE handshake, lists tools, and calls a few
report tools.  It never touches port 8001 (the running service) and never
writes to the database.

Usage:
    ./venv_mcp/bin/python scripts/mcp_live_check.py [--port 8011]
"""

from __future__ import annotations

import argparse
import asyncio
import os
import socket
import subprocess
import sys
import time
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent


def _free_port() -> int:
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def _wait_ready(port: int, timeout: float = 30.0) -> None:
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            with socket.create_connection(("127.0.0.1", port), timeout=1):
                return
        except OSError:
            time.sleep(0.3)
    raise RuntimeError(f"MCP server did not open port {port} within {timeout}s")


async def _exercise(url: str) -> None:
    from mcp import ClientSession
    from mcp.client.sse import sse_client

    async with sse_client(url) as (read, write):
        async with ClientSession(read, write) as session:
            init = await session.initialize()
            info = getattr(init, "server_info", None) or getattr(init, "serverInfo", None)
            label = f"{info.name} v{getattr(info, 'version', '?')}" if info else "?"
            print(f"handshake OK: {label}")

            tools = await session.list_tools()
            names = sorted(tool.name for tool in tools.tools)
            print(f"tools ({len(names)}): {', '.join(names)}")

            calls = [
                ("reports_catalog", {}),
                ("sales_today", {}),
                ("sales_report", {"date_from": "2026-10-01",
                                  "date_to": "2026-10-31", "limit": 3}),
                ("order_items_report", {"date_from": "2026-10-01",
                                        "date_to": "2026-10-31", "limit": 3}),
                ("payments_report", {"date_from": "2026-10-01",
                                     "date_to": "2026-10-31", "limit": 3}),
                ("shifts_report", {"date_from": "2026-10-01",
                                   "date_to": "2026-10-31", "limit": 3}),
                ("inventory_movements_report", {"date_from": "2026-10-01",
                                                "date_to": "2026-10-31", "limit": 3}),
                ("report_query", {"report": "sales", "date_from": "2026-10-01",
                                  "date_to": "2026-10-31", "limit": 2, "offset": 0}),
                ("report_query", {"report": "sales", "date_from": "2026-10-01",
                                  "date_to": "2026-10-31", "limit": 2, "offset": 2}),
                ("report_query", {"report": "does_not_exist"}),
                ("sales_report", {"date_from": "2026-10-31", "date_to": "2026-10-01"}),
                ("sales_report", {"limit": 999999}),
            ]

            for name, args in calls:
                result = await session.call_tool(name, args)
                text = "\n".join(
                    str(getattr(block, "text", "")) for block in result.content
                    if getattr(block, "type", None) == "text"
                )
                first = text.strip().splitlines()[0] if text.strip() else "(empty)"
                is_error = bool(getattr(result, "is_error", getattr(result, "isError", False)))
                print(f"\n--- {name} {args}")
                print(f"    isError={is_error} :: {first[:150]}")
                if name == "reports_catalog":
                    for line in text.strip().splitlines()[:4]:
                        print("    " + line)
                if name == "report_query" and args.get("report") == "sales":
                    for line in text.strip().splitlines()[:2]:
                        print("    " + line)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=0)
    args = parser.parse_args()

    port = args.port or _free_port()
    env = os.environ.copy()
    env["MCP_HOST"] = "127.0.0.1"
    env["MCP_PORT"] = str(port)
    env.setdefault("GRANDPOS_ENV_FILE", str(REPO_ROOT / ".env"))

    proc = subprocess.Popen(
        [str(REPO_ROOT / "venv_mcp" / "bin" / "python"), "app/mcp_server.py"],
        cwd=str(REPO_ROOT),
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
    )
    try:
        _wait_ready(port)
        print(f"server ready on 127.0.0.1:{port} (pid {proc.pid})")
        asyncio.run(_exercise(f"http://127.0.0.1:{port}/sse"))
    finally:
        proc.terminate()
        try:
            out, _ = proc.communicate(timeout=10)
        except subprocess.TimeoutExpired:
            proc.kill()
            out, _ = proc.communicate()
        tail = [line for line in (out or "").splitlines() if "ERROR" in line or "Traceback" in line]
        if tail:
            print("\nserver stderr warnings:")
            for line in tail[-10:]:
                print("  " + line)
        print(f"server stopped (exit {proc.returncode})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
