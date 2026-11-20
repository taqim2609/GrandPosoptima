"""Outbox delivery pipeline: best-effort enqueue + retry worker contract.

Design contract (AI Studio R2, offline-first step 2)
----------------------------------------------------
* Thermal print is the source of truth. WhatsApp delivery is a *side effect*.
* An outbox write may never raise into the business transaction. Every enqueue
  runs inside a SAVEPOINT, so a failed outbox statement rolls back only the
  enqueue and leaves the parent transaction (payment / shift close) intact.
* Delivery is asynchronous and retried with a fixed backoff schedule
  (1m / 5m / 15m): four attempts in total, and the failure after the 15m window
  parks the row as ``failed``. Deliveries are deduped by
  ``outbox_messages.dedupe_key`` (UNIQUE) and claimed atomically so concurrent
  workers never send the same message twice.
* ``OUTBOX_ENABLED`` is the operational kill-switch: when false the worker
  stops sending but the POS keeps queueing for later (offline period).

This module holds no HTTP client and no transaction boundary of its own: the
worker script (``scripts/outbox_worker.py``) owns those, and the pure functions
here stay unit-testable without a database.
"""

from __future__ import annotations

import json
import logging
import os
from typing import Any, Callable

log = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Backoff schedule
# ---------------------------------------------------------------------------

#: Delays (seconds) applied *before* retry N, i.e. after N attempts failed.
BACKOFF_SCHEDULE: tuple[int, ...] = (60, 300, 900)

#: Attempts allowed in total before a message is parked as ``failed``.
#: One more than the schedule length: every delay in BACKOFF_SCHEDULE is a real
#: wait, and the failure that follows the last wait (the 4th) parks the row.
MAX_ATTEMPTS: int = len(BACKOFF_SCHEDULE) + 1

#: SQL twin of BACKOFF_SCHEDULE, used by the worker's claim predicate so the
#: due-time rule lives in one place and needs no extra schema column.
BACKOFF_SQL_ARRAY = "ARRAY[60,300,900]"


def backoff_seconds(attempts: int) -> int:
    """Seconds to wait before the next attempt, given ``attempts`` already made.

    ``attempts == 0`` means "never tried yet" -> no delay (due immediately).
    Beyond the schedule the last delay repeats (capped, never infinite).
    """
    if attempts <= 0:
        return 0
    # 1 failed attempt -> 60s, 2 -> 300s, 3 -> 900s, 4+ -> 900s.
    idx = min(attempts, len(BACKOFF_SCHEDULE)) - 1
    return BACKOFF_SCHEDULE[idx]


def due_at_expression() -> str:
    """SQL fragment: TRUE when a pending row is due for its next attempt."""
    return (
        "CASE WHEN attempts = 0 THEN updated_at "
        f"     ELSE updated_at + make_interval(secs => ({BACKOFF_SQL_ARRAY})[LEAST(attempts, {len(BACKOFF_SCHEDULE)})]) "
        "END <= now()"
    )


def outbox_enabled() -> bool:
    """Operational kill-switch. False => worker skips sending, queue keeps growing."""
    raw = os.environ.get("OUTBOX_ENABLED", "true")
    return raw.strip().lower() not in ("false", "0", "no", "off")


# ---------------------------------------------------------------------------
# Best-effort enqueue (never raises into the caller)
# ---------------------------------------------------------------------------

def _jsonb(value: Any) -> str:
    return json.dumps(value, default=str, sort_keys=True)


def enqueue_best_effort(
    cur: Any,
    *,
    event_type: str,
    dedupe_key: str,
    build: Callable[[], tuple[str, dict]],
    channel: str = "whatsapp",
) -> bool:
    """Insert one outbox row inside a savepoint; swallow every failure.

    ``build()`` returns ``(recipient, payload)`` and runs *inside* the guarded
    block, so a payload builder that raises (missing column, bad Decimal, ...)
    is just as harmless as a failed INSERT.

    Returns True when the row was written (or already existed and ON CONFLICT
    skipped it), False when the savepoint was rolled back. Never raises.
    """
    savepoint = "outbox_enqueue"
    try:
        cur.execute(f"SAVEPOINT {savepoint}")
        recipient, payload = build()
        cur.execute(
            "INSERT INTO outbox_messages "
            "  (event_type, channel, recipient, payload, dedupe_key, status) "
            "VALUES (%s, %s, %s, %s, %s, 'pending') "
            "ON CONFLICT (dedupe_key) DO NOTHING",
            (event_type, channel, recipient or "owner", _jsonb(payload), dedupe_key),
        )
        cur.execute(f"RELEASE SAVEPOINT {savepoint}")
        return True
    except Exception as exc:  # noqa: BLE001 - deliberately swallowed by design
        log.warning(
            "outbox enqueue skipped (business transaction preserved): "
            "event=%s dedupe_key=%s error=%s",
            event_type, dedupe_key, exc,
        )
        try:
            cur.execute(f"ROLLBACK TO SAVEPOINT {savepoint}")
        except Exception:  # noqa: BLE001 - connection may already be broken
            log.debug("savepoint rollback failed for %s", dedupe_key, exc_info=True)
        return False


def enqueue_shift_recap(cur: Any, *, shift_id: int, recap: dict) -> bool:
    """Queue the shift recap; the caller passes an already-built payload."""
    return enqueue_best_effort(
        cur,
        event_type="shift_recap",
        dedupe_key=f"shift_recap:{shift_id}",
        build=lambda: ("owner", recap),
    )


def enqueue_receipt(
    cur: Any,
    *,
    order: dict,
    payments: list[dict],
    items: list[dict] | None = None,
    load_items: Callable[[], list[dict]] | None = None,
) -> bool:
    """Queue the digital receipt for a paid order. Best-effort by construction.

    Database-backed item loading must be passed via ``load_items`` so it runs
    after the savepoint is established. This keeps a failed lookup from
    aborting the parent payment transaction in PostgreSQL.
    """
    from .outbox import receipt_payload

    def build() -> tuple[str, dict]:
        receipt_items = load_items() if load_items is not None else (items or [])
        payload = receipt_payload(
            order_number=str(order.get("order_number") or ""),
            customer_name=order.get("customer_name"),
            channel=str(order.get("channel") or "fnb"),
            order_type=str(order.get("order_type") or "takeaway"),
            items=[
                {
                    "product_name": i.get("product_name") or i.get("name") or "",
                    "qty": i.get("qty"),
                    "unit_price": int(i.get("unit_price") or 0),
                    "line_total": int(i.get("line_total") or 0),
                    "is_weighted": bool(i.get("is_weighted", False)),
                }
                for i in receipt_items
            ],
            subtotal=int(order.get("subtotal") or 0),
            discount_total=int(order.get("discount_total") or 0),
            service_total=int(order.get("service_total") or 0),
            tax_total=int(order.get("tax_total") or 0),
            grand_total=int(order.get("grand_total") or 0),
            paid_total=int(order.get("paid_total") or 0),
            payments=payments,
            points_earned=int(order.get("points_earned") or 0),
            member_code=order.get("member_code"),
            business_time=str(order.get("paid_at") or "") or None,
        )
        recipient = str(order.get("customer_name") or order.get("member_code") or "owner")
        return recipient, payload

    return enqueue_best_effort(
        cur,
        event_type="receipt",
        dedupe_key=f"receipt:{order.get('id')}",
        build=build,
    )


# ---------------------------------------------------------------------------
# Worker: atomic claim
# ---------------------------------------------------------------------------

CLAIM_SQL = (
    "UPDATE outbox_messages "
    "   SET attempts = attempts + 1, updated_at = now() "
    " WHERE id IN ("
    "   SELECT id FROM outbox_messages "
    "    WHERE status = 'pending' AND attempts < %s AND (" + due_at_expression() + ") "
    "    ORDER BY created_at "
    "    FOR UPDATE SKIP LOCKED "
    "    LIMIT %s) "
    "RETURNING id, event_type, channel, recipient, payload, dedupe_key, attempts"
)

#: Dry-run twin of CLAIM_SQL: same selection, but DOES NOT bump ``attempts``.
#: The retry budget is a delivery contract, so a dry run must not spend it --
#: otherwise three ``--dry-run`` passes would leave a real row at
#: ``attempts = MAX_ATTEMPTS`` where the claim predicate never picks it up again.
PEEK_SQL = (
    "SELECT id, event_type, channel, recipient, payload, dedupe_key, attempts "
    "  FROM outbox_messages "
    " WHERE status = 'pending' AND attempts < %s AND (" + due_at_expression() + ") "
    " ORDER BY created_at "
    " FOR UPDATE SKIP LOCKED "
    " LIMIT %s"
)


def claim_due_messages(cur: Any, *, limit: int = 20, max_attempts: int = MAX_ATTEMPTS,
                       consume_attempt: bool = True) -> list[dict]:
    """Atomically claim up to ``limit`` due messages for one worker.

    The inner ``SELECT ... FOR UPDATE SKIP LOCKED`` is what makes two concurrent
    workers safe: the loser's subquery does not see the winner's locked row, so
    exactly one worker gets each message. ``attempts`` is bumped in the same
    statement, which is also the retry counter used by the backoff rule.

    ``consume_attempt=False`` (used by ``--dry-run``) selects and locks the same
    rows with the same predicate but leaves ``attempts`` untouched, so a dry run
    can never burn a delivery attempt. The returned rows are a snapshot.
    """
    if consume_attempt:
        cur.execute(CLAIM_SQL, (max_attempts, limit))
    else:
        cur.execute(PEEK_SQL, (max_attempts, limit))
    return list(cur.fetchall())


def mark_sent(cur: Any, message_id: int) -> None:
    cur.execute(
        "UPDATE outbox_messages SET status = 'sent', last_error = NULL, updated_at = now() "
        " WHERE id = %s AND status = 'pending'",
        (message_id,),
    )


def mark_failed(cur: Any, message_id: int, error: str) -> None:
    """Park a message after the last allowed attempt (status -> 'failed')."""
    cur.execute(
        "UPDATE outbox_messages SET status = 'failed', last_error = %s, updated_at = now() "
        " WHERE id = %s AND status = 'pending'",
        (error[:500], message_id),
    )


def mark_retry(cur: Any, message_id: int, error: str) -> None:
    """Keep the message pending for the next backoff window, recording the error."""
    cur.execute(
        "UPDATE outbox_messages SET last_error = %s, updated_at = now() "
        " WHERE id = %s AND status = 'pending'",
        (error[:500], message_id),
    )


def delivery_headers(message: dict, secret: str) -> dict:
    """HMAC header set for one claimed row, via app/signing.py (single source)."""
    from .signing import headers_for

    payload = message["payload"]
    if isinstance(payload, str):
        payload = json.loads(payload)
    return dict(
        headers_for(
            payload,
            secret,
            event=message["event_type"],
            dedupe_key=message["dedupe_key"],
        )
    )
