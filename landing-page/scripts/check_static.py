"""Static repository checks for GrandPOS (no Docker required).

Validates that the repo keeps its contracts without a live database:
  1. SQL files are syntactically plausible (balanced dollar-quoting,
     single trailing transaction, required security clauses present).
  2. docker-compose.yml parses as YAML and ships no literal credentials.
  3. .env.example ships placeholders, not real secrets.
  4. No known default/weak password literal is shipped in seed SQL.
  5. Python and Node test suites still pass (invoked, not reimplemented).

Usage: python3 scripts/check_static.py
Exit code 0 when all checks pass, 1 otherwise. Prints PASS/FAIL per check.
"""

from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

PASS_COUNT = 0
FAILURES: list[str] = []


def check(name: str, condition: bool, detail: str = "") -> None:
    global PASS_COUNT
    if condition:
        PASS_COUNT += 1
        print(f"PASS  {name}")
    else:
        FAILURES.append(name)
        print(f"FAIL  {name}" + (f" — {detail}" if detail else ""))


def balanced_dollar_quoting(sql: str) -> bool:
    return len(re.findall(r"\$\$(?:[a-zA-Z_][a-zA-Z0-9_]*)?", sql)) % 2 == 0


def sql_code_only(sql: str) -> str:
    """Strip line comments and string literals so checks see real DDL only."""
    without_lines = re.sub(r"--[^\n]*", "", sql)
    without_block = re.sub(r"/\*.*?\*/", "", without_lines, flags=re.DOTALL)
    return re.sub(r"'(?:[^']|'')*'", "''", without_block)


def main() -> int:
    try:
        import yaml  # noqa: F401
    except ImportError:
        print("PyYAML is required for the compose check")
        return 1

    import yaml

    schema = (ROOT / "db" / "schema.sql").read_text(encoding="utf-8")
    seed = (ROOT / "db" / "seed.sql").read_text(encoding="utf-8")
    roles = (ROOT / "db" / "roles.sql").read_text(encoding="utf-8")
    bootstrap = (ROOT / "db" / "bootstrap_superadmin.sql").read_text(encoding="utf-8")

    # 1. Dollar-quoting balance per SQL file.
    for name, sql in (("schema", schema), ("seed", seed), ("roles", roles), ("bootstrap", bootstrap)):
        check(f"sql.{name}.dollar_quoting_balanced", balanced_dollar_quoting(sql))

    # 2. schema.sql opens one transaction and commits once.
    check("sql.schema.single_transaction",
          schema.count("BEGIN;") == 1 and schema.count("COMMIT;") == 1)

    # 3. Required tables exist.
    required = [
        "users", "categories", "products", "tables", "orders", "order_items",
        "shifts", "cash_movements", "members", "promos", "coupons",
        "ingredients", "recipes", "reservations", "vendors",
        "vendor_settlements", "articles", "settings",
    ]
    for table in required:
        check(f"sql.schema.table_{table}",
              re.search(rf"CREATE\s+TABLE\s+{table}\s*\(", schema, re.IGNORECASE) is not None)

    # 4. Supporting ledger/payment tables exist.
    for table in ["payments", "inventory_movements", "member_point_ledger",
                  "coupon_redemptions", "audit_logs", "order_voids",
                  "user_credentials", "outbox_messages"]:
        check(f"sql.schema.support_{table}",
              re.search(rf"CREATE\s+TABLE\s+{table}\s*\(", schema, re.IGNORECASE) is not None)

    # 5. Money discipline: no float/double columns, BIGINT for money.
    #    Comments and literals are stripped first so prose cannot trip the check.
    schema_code = sql_code_only(schema)
    check("sql.schema.no_float_columns",
          re.search(r"\b(float|double precision|real)\b", schema_code, re.IGNORECASE) is None)
    check("sql.schema.bigint_money",
          "BIGINT" in schema_code and "base_price" in schema_code)

    # 6. Seeded superadmin is disabled and bootstrappable, never with a password.
    check("sql.seed.no_password_literal",
          not re.search(r"(password\s*=\s*'[^']+'|PASSWORD\s+'[^']+')", seed, re.IGNORECASE))
    check("sql.seed.taqim2609_disabled",
          "taqim2609" in seed and "TRUE, TRUE" in seed)
    check("sql.seed.no_default_password_word",
          not re.search(r"(changeme|password123|admin123|grandpos123)", seed, re.IGNORECASE))
    check("sql.bootstrap.refuses_short_password",
          "at least 12 characters" in bootstrap)

    # 7. Read-only role exists and only touches the views.
    check("sql.roles.grandpos_ai_exists", "grandpos_ai" in roles)
    check("sql.roles.revoke_before_grant",
          roles.index("REVOKE ALL") < roles.index("GRANT SELECT"))
    for view in ["v_daily_turnover", "v_shift_cash", "v_low_stock", "v_weekly_best_sellers"]:
        check(f"sql.roles.view_{view}_granted", view in roles)

    # 8. Seed covers the required menu.
    for item in ["Mie Aceh", "Kopi Sanger", "Ayam Tangkap", "Nasi Goreng Aceh", "Kopi Gayo", "Teh Tarik"]:
        check(f"sql.seed.menu_{item}", item in seed)

    # 9. Compose parses and ships no literal credentials.
    compose_raw = (ROOT / "docker-compose.yml").read_text(encoding="utf-8")
    compose = yaml.safe_load(compose_raw)
    check("compose.parses", isinstance(compose, dict) and "services" in compose)
    check("compose.has_db_and_api",
          {"db", "api"}.issubset(set(compose.get("services", {}))))
    check("compose.postgres_16",
          "postgres:16" in compose["services"]["db"].get("image", ""))
    check("compose.db_healthcheck",
          "healthcheck" in compose["services"]["db"])
    check("compose.api_links_healthy_db",
          compose["services"]["api"].get("depends_on", {}).get("db", {}).get("condition") == "service_healthy")
    check("compose.no_literal_password",
          not re.search(r"(?i)(password|secret|DATABASE_URL)\s*:\s*(?!.*\$\{)['\"][^'\"]+['\"]", compose_raw))
    check("compose.required_env_guarded",
          "${POSTGRES_PASSWORD:?" in compose_raw and "${DATABASE_URL:?" in compose_raw)

    # 10. .env.example has placeholders only.
    example = (ROOT / ".env.example").read_text(encoding="utf-8")
    check("env.example_placeholders_only",
          "CHANGE_ME" in example and "postgres:16" not in example)
    check("env.no_real_secret",
          not re.search(r"(?i)(sk-|ghp_|xoxb-|AKIA)", example))
    # The API talks to PostgreSQL through psycopg 3 directly (no SQLAlchemy),
    # so a `postgresql+driver://` DSN is a config error, not a style choice.
    check("env.database_url_is_libpq_dsn",
          not re.search(r"(?m)^DATABASE_URL=postgresql\+", example))

    # 11. Node tests pass (gateway boundary).
    node = subprocess.run(
        ["node", "--test", "test/*.test.js"],
        cwd=ROOT / "gateway",
        capture_output=True, text=True, timeout=120,
    )
    node_ok = node.returncode == 0 and "fail 0" in (node.stdout + node.stderr)
    check("node.tests_pass", node_ok, (node.stdout + node.stderr)[-400:])

    # 12. Python tests pass — exit 0 alone is not enough: a run that collects
    #     0 tests must fail this check, so guard on the real passed count.
    py = subprocess.run(
        [sys.executable, "-m", "pytest"],
        cwd=ROOT, capture_output=True, text=True, timeout=180,
    )
    matches = re.findall(r"(\d+) passed", py.stdout)
    passed_count = int(matches[-1]) if matches else 0
    py_ok = py.returncode == 0 and passed_count > 0
    detail = (py.stdout[-400:] + py.stderr[-400:]) if not py_ok else f"{passed_count} passed"
    check("pytest.tests_pass", py_ok, detail)

    print(f"\n{PASS_COUNT} passed, {len(FAILURES)} failed")
    if FAILURES:
        print("Failures:", ", ".join(FAILURES))
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
