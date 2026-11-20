#!/usr/bin/env python3
"""Outbox retry worker: deliver pending WhatsApp messages with backoff.

Usage
-----
    python scripts/outbox_worker.py --once     # single drain pass, exit
    python scripts/outbox_worker.py            # loop until SIGINT/SIGTERM
    python scripts/outbox_worker.py --dry-run  # peek + log, never POST, attempts untouched

Contract
--------
* Claims pending rows atomically with ``FOR UPDATE SKIP LOCKED`` (see
  ``app.outbox_delivery.claim_due_messages``), so N workers running side by
  side never send the same delivery twice.
* Backoff: 1m after attempt 1, 5m after attempt 2, 15m after attempt 3; a
  fourth failure parks the row as ``failed``.
* ``OUTBOX_ENABLED=false`` parks the loop entirely: nothing is claimed or sent,
  and the queue keeps growing for the offline window.
* Delivery never touches the business transaction: this script owns its own
  connection and commits per message.

Environment
-----------
    DATABASE_URL             required
    GRANDPOS_OUTBOX_URL      required (Hermes webhook route)
    GRANDPOS_OUTBOX_SECRET   required (HMAC-SHA256, shared with Hermes)
    OUTBOX_ENABLED           default true
    OUTBOX_POLL_SECONDS      default 60
    OUTBOX_BATCH             rows claimed per pass, default 20
    OUTBOX_HTTP_TIMEOUT      seconds, default 10
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import signal
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app import db as database  # noqa: E402
from app.outbox_delivery import (  # noqa: E402
    MAX_ATTEMPTS,
    claim_due_messages,
    delivery_headers,
    mark_failed,
    mark_retry,
    mark_sent,
    outbox_enabled,
)

log = logging.getLogger("outbox_worker")

_stop = False


def _handle_signal(_signum, _frame):  # noqa: ANN001
    global _stop
    _stop = True
    log.info("stop requested; finishing current batch")


def post_delivery(url: str, body: bytes, headers: dict, *, timeout: float) -> int:
    """POST one signed payload. Returns the HTTP status; raises on transport error."""
    request = urllib.request.Request(url, data=body, headers=dict(headers), method="POST")
    with urllib.request.urlopen(request, timeout=timeout) as response:  # noqa: S310 - URL is operator-provided
        response.read()
        return int(response.status)


def _payload_bytes(payload: object) -> bytes:
    """Body must be byte-identical to what app/signing.py canonicalised."""
    from app.signing import canonical_body

    if isinstance(payload, str):
        payload = json.loads(payload)
    return canonical_body(dict(payload))


def drain_once(*, url: str, secret: str, timeout: float, batch: int,
               dry_run: bool = False) -> dict[str, int]:
    """Claim one batch and attempt delivery. Returns per-outcome counts."""
    counts = {"claimed": 0, "sent": 0, "retry": 0, "failed": 0, "skipped": 0}

    with database.connect() as conn:
        with conn.transaction():
            with conn.cursor() as cur:
                # A dry run must never spend the retry budget: peek without the
                # attempts bump so repeated --dry-run passes cannot strand rows.
                messages = claim_due_messages(cur, limit=batch, max_attempts=MAX_ATTEMPTS,
                                              consume_attempt=not dry_run)
        # The claim is committed; each delivery gets its own short transaction so
        # a slow HTTP call never holds a row lock across the network.
        counts["claimed"] = len(messages)
        if not messages:
            return counts

        for message in messages:
            body = _payload_bytes(message["payload"])
            headers = delivery_headers(message, secret)

            if dry_run:
                log.info("dry-run: would POST %s (%s)", message["dedupe_key"], message["event_type"])
                counts["skipped"] += 1
                continue

            try:
                status = post_delivery(url, body, headers, timeout=timeout)
            except urllib.error.HTTPError as exc:
                _record_failure(conn, message, f"HTTP {exc.code}: {exc.reason}", counts)
                continue
            except Exception as exc:  # noqa: BLE001 - transport/timeout/DNS
                _record_failure(conn, message, f"{type(exc).__name__}: {exc}", counts)
                continue

            with conn.transaction(), conn.cursor() as cur:
                mark_sent(cur, int(message["id"]))
            counts["sent"] += 1
            log.info("delivered %s (attempt %s, HTTP %s)",
                     message["dedupe_key"], message["attempts"], status)

    return counts


def _record_failure(conn, message: dict, error: str, counts: dict[str, int]) -> None:  # noqa: ANN001
    attempts = int(message["attempts"])
    with conn.transaction(), conn.cursor() as cur:
        if attempts >= MAX_ATTEMPTS:
            mark_failed(cur, int(message["id"]), error)
        else:
            mark_retry(cur, int(message["id"]), error)
    if attempts >= MAX_ATTEMPTS:
        counts["failed"] += 1
        log.error("giving up on %s after %s attempts: %s", message["dedupe_key"], attempts, error)
    else:
        counts["retry"] += 1
        log.warning("retry scheduled for %s (attempt %s/%s): %s",
                    message["dedupe_key"], attempts, MAX_ATTEMPTS, error)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="GrandPOS WhatsApp outbox retry worker")
    parser.add_argument("--once", action="store_true", help="one pass then exit")
    parser.add_argument("--dry-run", action="store_true",
                        help="peek and log without POSTing; does not consume attempts")
    parser.add_argument("--verbose", action="store_true")
    args = parser.parse_args(argv)

    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )

    url = os.environ.get("GRANDPOS_OUTBOX_URL", "")
    secret = os.environ.get("GRANDPOS_OUTBOX_SECRET", "")
    poll = float(os.environ.get("OUTBOX_POLL_SECONDS", "60"))
    batch = int(os.environ.get("OUTBOX_BATCH", "20"))
    timeout = float(os.environ.get("OUTBOX_HTTP_TIMEOUT", "10"))

    if not args.dry_run and (not url or not secret):
        log.error("GRANDPOS_OUTBOX_URL and GRANDPOS_OUTBOX_SECRET are required unless --dry-run")
        return 2

    signal.signal(signal.SIGINT, _handle_signal)
    signal.signal(signal.SIGTERM, _handle_signal)

    while not _stop:
        if not outbox_enabled():
            # Kill-switch: keep the queue intact for the offline window.
            log.info("OUTBOX_ENABLED=false — skipping delivery pass (queue kept)")
        else:
            try:
                counts = drain_once(url=url, secret=secret, timeout=timeout,
                                    batch=batch, dry_run=args.dry_run)
                log.info("pass done: %s", counts)
            except Exception:  # noqa: BLE001 - keep the worker alive
                log.exception("delivery pass failed; will retry next tick")
        if args.once:
            break
        deadline = time.monotonic() + poll
        while not _stop and time.monotonic() < deadline:
            time.sleep(min(1.0, deadline - time.monotonic()))

    return 0


if __name__ == "__main__":
    sys.exit(main())
