#!/usr/bin/env bash
# GrandPOS go-live regression runner.
#
# Runs ONLY the five AI-Studio pre-go-live checklist tests against a real
# PostgreSQL, then prints a PASS/FAIL table and exits non-zero on any failure.
#
# Safety
#   * The production database (POSTGRES_DB) and the grandpos_pgdata volume are
#     never dropped, truncated or written to. The suite creates, uses and
#     drops its own database (GRANDPOS_TEST_DB, default grandpos_golive_test).
#   * Never runs `docker compose down -v`.
#   * The suite runs inside the api image, so it uses the exact psycopg/app
#     versions the deployment ships with, and reaches the db service over the
#     compose network instead of the host port.
#
# Usage
#   scripts/run_go_live_regression.sh              # bring stack up if needed
#   scripts/run_go_live_regression.sh --no-up      # assume the stack is running
#   GRANDPOS_TEST_DB=grandpos_golive_ci scripts/run_go_live_regression.sh
#
# Exit codes: 0 = all five passed, 1 = at least one failed, 2 = could not run
# (stack unhealthy / tests skipped, i.e. the gate did not actually execute).

set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

TEST_FILE="tests/test_go_live_regression.py"
TEST_DB="${GRANDPOS_TEST_DB:-grandpos_golive_test}"
LOG_DIR="${TMPDIR:-/tmp}/grandpos-golive"
LOG_FILE="$LOG_DIR/pytest-$(date +%Y%m%d-%H%M%S).log"
BRING_UP=1
HEALTH_TIMEOUT="${GRANDPOS_HEALTH_TIMEOUT:-120}"

for arg in "$@"; do
  case "$arg" in
    --no-up) BRING_UP=0 ;;
    -h|--help) sed -n '2,30p' "$0"; exit 0 ;;
    *) echo "unknown argument: $arg" >&2; exit 2 ;;
  esac
done

mkdir -p "$LOG_DIR"

say() { printf '%s\n' "$*"; }
die() { printf 'ERROR: %s\n' "$*" >&2; exit 2; }

# ---------------------------------------------------------------------------
# 0. Preconditions
# ---------------------------------------------------------------------------

command -v docker >/dev/null 2>&1 || die "docker is not installed"
docker compose version >/dev/null 2>&1 || die "docker compose plugin is not available"
[ -f "$ROOT/docker-compose.yml" ] || die "docker-compose.yml not found in $ROOT"
[ -f "$ROOT/.env" ] || die ".env is missing; copy .env.example to .env and set the values"
[ -f "$ROOT/$TEST_FILE" ] || die "$TEST_FILE is missing"

if ! grep -Eq "^GRANDPOS_TEST_DB=|^POSTGRES_DB=" "$ROOT/.env"; then
  die ".env does not define POSTGRES_DB"
fi
PRODUCTION_DB="$(grep -E '^POSTGRES_DB=' "$ROOT/.env" | tail -1 | cut -d= -f2- | tr -d '\r"'"'"' ')"
if [ "$TEST_DB" = "$PRODUCTION_DB" ]; then
  die "GRANDPOS_TEST_DB ($TEST_DB) equals POSTGRES_DB ($PRODUCTION_DB); refusing to run the suite against production"
fi

# ---------------------------------------------------------------------------
# 1. Bring the stack up (only what the tests need: db + api image)
# ---------------------------------------------------------------------------

if [ "$BRING_UP" -eq 1 ]; then
  say "==> docker compose up -d (db only; the API is not needed for these tests)"
  docker compose up -d db >/dev/null
fi

say "==> waiting for the db healthcheck (timeout ${HEALTH_TIMEOUT}s)"
DB_CID="$(docker compose ps -q db || true)"
[ -n "$DB_CID" ] || die "db service is not running; start it with: docker compose up -d db"

deadline=$(( $(date +%s) + HEALTH_TIMEOUT ))
while :; do
  state="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$DB_CID" 2>/dev/null || echo missing)"
  [ "$state" = "healthy" ] && break
  if [ "$(date +%s)" -ge "$deadline" ]; then
    docker compose logs --tail 30 db >&2 || true
    die "db did not become healthy within ${HEALTH_TIMEOUT}s (state=$state)"
  fi
  sleep 2
done
say "    db health: healthy"

# ---------------------------------------------------------------------------
# 2. Run the five tests inside the api image (exact deployed dependencies)
# ---------------------------------------------------------------------------

IMAGE="$(docker compose images -q api 2>/dev/null | head -1 || true)"
if [ -z "$IMAGE" ]; then
  say "==> api image not built yet; building it (first run only)"
  docker compose build api >/dev/null
  IMAGE="$(docker compose images -q api | head -1)"
fi
[ -n "$IMAGE" ] || die "could not resolve the api image"

NETWORK="$(docker inspect --format '{{range $k, $v := .NetworkSettings.Networks}}{{$k}}{{end}}' "$DB_CID")"
[ -n "$NETWORK" ] || die "could not resolve the compose network of the db container"

say "==> running $TEST_FILE"
say "    image:   $IMAGE"
say "    network: $NETWORK"
say "    test db: $TEST_DB (created and dropped by the suite; production volume untouched)"
say "    log:     $LOG_FILE"
say ""

set +e
EXTRA_ENV=()
# Optional: point the suite at another cluster/DSN without editing .env.
if [ -n "${GRANDPOS_TEST_DATABASE_URL:-}" ]; then
  EXTRA_ENV+=(-e "GRANDPOS_TEST_DATABASE_URL=$GRANDPOS_TEST_DATABASE_URL")
fi
docker run --rm \
  --network "$NETWORK" \
  --env-file "$ROOT/.env" \
  "${EXTRA_ENV[@]}" \
  -e "GRANDPOS_TEST_DB=$TEST_DB" \
  -e "PYTHONDONTWRITEBYTECODE=1" \
  -v "$ROOT:/srv/grandpos:ro" \
  -w /srv/grandpos \
  --entrypoint python \
  "$IMAGE" -m pytest "$TEST_FILE" -o addopts="--strict-markers" -v -rfEP \
  -p no:cacheprovider --tb=short 2>&1 | tee "$LOG_FILE"
rc=${PIPESTATUS[0]}
set -e

# ---------------------------------------------------------------------------
# 3. PASS/FAIL table
# ---------------------------------------------------------------------------

declare -A LABEL=(
  [r1]="R1 concurrent payment: exactly one winner, no double ledger/stock"
  [r2]="R2 outbox/WhatsApp failure: sale commits, receipt queued pending"
  [r3]="R3 shift reconciliation: exact expected_cash, variance 0, vendor once"
  [r4]="R4 duplicate webhook same dedupe key: exactly one send"
  [r5]="R5 grandpos_ai: 4 views readable, orders + CREATE TABLE denied"
)
declare -A STATUS=(
  [r1]="NOT RUN" [r2]="NOT RUN" [r3]="NOT RUN" [r4]="NOT RUN" [r5]="NOT RUN"
)

# pytest -v emits "tests/test_go_live_regression.py::test_r1_... PASSED [ 20%]".
while IFS= read -r line; do
  key="$(printf '%s' "$line" | grep -oE 'test_r[1-5]_' | head -1 | sed 's/^test_//; s/_$//')"
  [ -n "$key" ] || continue
  case "$line" in
    *PASSED*)  STATUS[$key]="PASS" ;;
    *FAILED*)  STATUS[$key]="FAIL" ;;
    *SKIPPED*) STATUS[$key]="SKIP" ;;
    *ERROR*)   STATUS[$key]="ERROR" ;;
  esac
done < <(grep -E '::test_r[1-5]_' "$LOG_FILE" || true)

say ""
say "=========================== GO-LIVE REGRESSION ==========================="
say "  ID  RESULT  CHECK"
for key in r1 r2 r3 r4 r5; do
  printf '  %-2s  %-6s  %s\n' "${key^^}" "${STATUS[$key]}" "${LABEL[$key]}"
done
say "========================================================================="

if grep -q "SKIP reason:" "$LOG_FILE"; then
  say ""
  say "SKIP reasons recorded in the log:"
  grep -o "SKIP reason:.*" "$LOG_FILE" | sed 's/^/  - /' | sort -u
fi

say ""
say "Full pytest output: $LOG_FILE"

# ---------------------------------------------------------------------------
# 4. Verdict
# ---------------------------------------------------------------------------

skipped=0
for key in r1 r2 r3 r4 r5; do
  case "${STATUS[$key]}" in
    SKIP) skipped=$((skipped + 1)) ;;
  esac
done

if [ "$rc" -ne 0 ]; then
  say "RESULT: FAIL — the go-live gate did not pass (pytest exit $rc)"
  exit 1
fi

if [ "$skipped" -gt 0 ]; then
  say "RESULT: NOT EXECUTED — $skipped of 5 checks skipped (no live PostgreSQL reachable)."
  say "        A skipped go-live gate is not a pass. Fix the connection and re-run."
  exit 2
fi

say "RESULT: PASS — all 5 go-live checks executed and passed."
exit 0
