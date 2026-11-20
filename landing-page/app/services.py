"""Transactional service layer for GrandPOS.

Every method here encodes one business rule from the spec and runs inside a
single transaction that the caller opens. Money is int IDR; weights are
Decimal. Stock/member/vendor effects are written to append-only ledgers and
the cached balance columns are derived from them in the same transaction.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from decimal import Decimal
from typing import Any, Iterable, Sequence

from .constants import ORDER_STATUSES
from .outbox import shift_recap_payload
from .outbox_delivery import enqueue_receipt, enqueue_shift_recap
from .rules import (
    compute_promo_discount,
    expected_cash,
    points_earned,
    quantize_weight,
    round_idr,
    validate_order_channel,
    validate_payment,
    vendor_share_amount,
    weighted_line_total,
)

log = logging.getLogger(__name__)


class BusinessRuleError(Exception):
    """Raised when a request violates a documented business rule."""


def _validate_order_status(status: str) -> None:
    """Validate that the given status is a known order status.

    Uses ORDER_STATUSES from constants to ensure consistency with
    the database CHECK constraint and cross-service sync.
    """
    if status not in ORDER_STATUSES:
        raise BusinessRuleError(f"invalid order status: {status!r}")


def _rule_check(fn, *args, **kwargs):
    """Run a rules.* validator and normalise ValueError into BusinessRuleError.

    Without this, a rule violation would escape as a bare ValueError and reach
    the caller as an unhandled 500 instead of a mapped 4xx.
    """
    try:
        return fn(*args, **kwargs)
    except ValueError as exc:
        raise BusinessRuleError(str(exc)) from exc


@dataclass(frozen=True)
class LineInput:
    product_id: int
    qty: str | Decimal
    is_weighted: bool = False
    weight_kg: str | Decimal | None = None
    note: str | None = None


def _one(cur: Any, sql: str, params: Sequence[Any] = ()) -> dict | None:
    cur.execute(sql, params)
    return cur.fetchone()


def _exec(cur: Any, sql: str, params: Sequence[Any] = ()) -> None:
    """Run a write that returns no rows (INSERT/UPDATE without RETURNING).

    psycopg raises ProgrammingError if fetchone() follows such a statement,
    so fire-and-forget writes must never go through _one().
    """
    cur.execute(sql, params)


def _require(row: dict | None, message: str) -> dict:
    if row is None:
        raise BusinessRuleError(message)
    return row


def get_open_shift(cur: Any, *, for_update: bool = True) -> dict | None:
    suffix = " FOR UPDATE" if for_update else ""
    return _one(
        cur,
        "SELECT * FROM shifts WHERE status IN ('open','closing') ORDER BY opened_at DESC LIMIT 1" + suffix,
    )


CONCURRENT_UPDATE_MESSAGE = "order changed by another cashier, refresh"


def open_shift(cur: Any, *, opening_float: int, opened_by: int, cashier_id: int | None = None) -> dict:
    """Open a shift; only one may be open at a time per cashier drawer."""
    if opening_float < 0:
        raise BusinessRuleError("opening float must be >= 0")
    drawer = cashier_id if cashier_id is not None else opened_by
    existing = get_open_shift(cur)
    if existing is not None:
        if existing.get("cashier_id") is not None and drawer is not None:
            if existing.get("cashier_id") == drawer:
                raise BusinessRuleError("a shift is already open for this cashier")
        else:
            raise BusinessRuleError("a shift is already open")
    code = _next_shift_code(cur)
    row = _one(
        cur,
        "INSERT INTO shifts (code, opened_by, opening_float, status, cashier_id) "
        "VALUES (%s, %s, %s, 'open', %s) RETURNING *",
        (code, opened_by, opening_float, drawer),
    )
    shift = _require(row, "failed to open shift")
    # The opening float is itself a cash ledger entry, never a loose column.
    _exec(
        cur,
        "INSERT INTO cash_movements (shift_id, movement_type, direction, amount, reason, created_by) "
        "VALUES (%s, 'opening_float', 'in', %s, 'Modal awal shift', %s)",
        (shift["id"], opening_float, opened_by),
    )
    return shift


def _next_shift_code(cur: Any) -> str:
    row = _one(cur, "SELECT to_char(now() AT TIME ZONE current_setting('grandpos.timezone', true), 'YYYYMMDD') AS d")
    day = (row or {}).get("d") or "00000000"
    count = _one(cur, "SELECT count(*) AS n FROM shifts WHERE code LIKE %s", (f"SHIFT-{day}-%",))
    return f"SHIFT-{day}-{(count or {}).get('n', 0) + 1:03d}"


def create_order(
    cur: Any,
    *,
    order_type: str,
    created_by: int,
    table_id: int | None = None,
    member_id: int | None = None,
    lines: Iterable[LineInput] = (),
    promo_code: str | None = None,
    note: str | None = None,
) -> dict:
    """Create an order, computing weighted prices and channel separation."""
    shift = get_open_shift(cur)
    if shift is None:
        raise BusinessRuleError("no open shift; open a shift before selling")

    prepared: list[dict] = []
    channel: str | None = None
    for line in lines:
        product = _require(
            _one(cur, "SELECT * FROM products WHERE id = %s AND is_active", (line.product_id,)),
            f"product {line.product_id} not found",
        )
        # Raises when the product channel does not match the order type.
        channel = _rule_check(validate_order_channel, order_type, table_id, product["channel"])

        if product["sold_by_weight"]:
            if line.weight_kg is None:
                raise BusinessRuleError(f"{product['name']} is sold by weight")
            weight = quantize_weight(line.weight_kg)
            unit_price = int(product["base_price"])
            line_total = weighted_line_total(weight, unit_price)
            qty = weight
            is_weighted = True
        else:
            if line.is_weighted or line.weight_kg is not None:
                raise BusinessRuleError(f"{product['name']} is not sold by weight")
            qty = Decimal(str(line.qty))
            if qty <= 0:
                raise BusinessRuleError("qty must be positive")
            unit_price = int(product["base_price"])
            line_total = round_idr(qty * Decimal(unit_price))
            weight = None
            is_weighted = False

        unit_cost = int(product["cost_price"])
        # Snapshot the vendor profit-share at sale time so a later change to the
        # vendor's percent cannot retroactively alter this line's settlement
        # base. None for in-house products with no vendor.
        vendor_share = None
        if product.get("vendor_id") is not None:
            vendor = _one(
                cur, "SELECT profit_share_percent FROM vendors WHERE id = %s",
                (product["vendor_id"],),
            )
            if vendor is not None:
                vendor_share = vendor["profit_share_percent"]
        prepared.append(
            {
                "product": product,
                "qty": qty,
                "is_weighted": is_weighted,
                "weight": weight,
                "unit_price": unit_price,
                "line_subtotal": line_total,
                "unit_cost": unit_cost,
                "line_cost": round_idr(qty * Decimal(unit_cost)),
                "vendor_share_percent": vendor_share,
                "note": line.note,
            }
        )

    if not prepared:
        raise BusinessRuleError("order must contain at least one item")

    subtotal = sum(p["line_subtotal"] for p in prepared)
    cogs_total = sum(p["line_cost"] for p in prepared)

    discount_total = 0
    promo_id = None
    if promo_code:
        promo = _require(
            _one(cur, "SELECT * FROM promos WHERE code = %s AND is_active", (promo_code,)),
            f"promo {promo_code} not found or inactive",
        )
        if promo["channel"] and promo["channel"] != channel:
            raise BusinessRuleError(f"promo {promo_code} is not valid for {channel}")
        discount_total = compute_promo_discount(
            kind=promo["kind"],
            value=int(promo["value"]),
            subtotal=subtotal,
            min_subtotal=int(promo["min_subtotal"]),
            max_discount=int(promo["max_discount"]) if promo["max_discount"] is not None else None,
        )
        promo_id = promo["id"]

    # Discount reduces revenue only: subtotal used for COGS/vendor stays intact.
    grand_total = subtotal - discount_total
    order_number = _next_order_number(cur)
    _validate_order_status("open")
    order = _require(
        _one(
            cur,
            "INSERT INTO orders (order_number, channel, order_type, status, table_id, shift_id, "
            "                    member_id, subtotal, discount_total, grand_total, cogs_total, "
            "                    discount_source, promo_id, note, created_by) "
            "VALUES (%s, %s, %s, 'open', %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s) RETURNING *",
            (
                order_number, channel, order_type, table_id, shift["id"], member_id,
                subtotal, discount_total, grand_total, cogs_total,
                "promo" if promo_id else None, promo_id, note, created_by,
            ),
        ),
        "failed to create order",
    )

    for p in prepared:
        product = p["product"]
        _one(
            cur,
            "INSERT INTO order_items (order_id, product_id, product_name, channel, qty, is_weighted, "
            "                        weight_grams, base_price, unit_price, line_subtotal, line_total, "
            "                        unit_cost, line_cost, vendor_id, vendor_share_percent, note) "
            "VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s) RETURNING id",
            (
                order["id"], product["id"], product["name"], product["channel"], p["qty"],
                p["is_weighted"], p["weight"], product["base_price"], p["unit_price"],
                p["line_subtotal"], p["line_subtotal"], p["unit_cost"], p["line_cost"],
                product["vendor_id"], p["vendor_share_percent"], p["note"],
            ),
        )

    if table_id:
        _exec(cur, "UPDATE tables SET status = 'occupied' WHERE id = %s", (table_id,))

    return {
        "order": order,
        "items": prepared,
        "totals": {
            "subtotal": subtotal,
            "discount_total": discount_total,
            "grand_total": grand_total,
            "cogs_total": cogs_total,
        },
    }


def _next_order_number(cur: Any) -> str:
    row = _one(cur, "SELECT to_char(now() AT TIME ZONE current_setting('grandpos.timezone', true), 'YYYYMMDD') AS d")
    day = (row or {}).get("d") or "00000000"
    count = _one(cur, "SELECT count(*) AS n FROM orders WHERE order_number LIKE %s", (f"GAK-{day}-%",))
    return f"GAK-{day}-{(count or {}).get('n', 0) + 1:04d}"


def paid_order_items(cur: Any, order_id: int) -> list[dict]:
    """Active item lines for a paid order, ready for the receipt payload.

    Only ``status = 'active'`` lines are printed: a voided line was never
    charged, so it must not appear on the customer's receipt. Order (by id)
    keeps the receipt stable for a given order.
    """
    cur.execute(
        "SELECT product_name, qty, unit_price, line_total, is_weighted "
        "  FROM order_items WHERE order_id = %s AND status = 'active' ORDER BY id",
        (order_id,),
    )
    return list(cur.fetchall() or ())


def pay_order(
    cur: Any,
    *,
    order_id: int,
    payments: Sequence[dict],
    captured_by: int,
    idempotency_key: str | None = None,
    consume_stock: bool = True,
    expected_version: int | None = None,
) -> dict:
    """Settle an order: payments, cash ledger, stock consumption, points."""
    if idempotency_key:
        # P1-H: the replay lookup used to match on `idempotency_key` alone. A key that
        # was already used for a *different* order therefore returned "replayed: True"
        # with that other order's row, so the caller believed this order was paid while
        # it was still open. Scope the lookup to the order being settled.
        existing = _one(
            cur,
            "SELECT * FROM payments WHERE idempotency_key = %s AND order_id = %s",
            (idempotency_key, order_id),
        )
        if existing is not None:
            return {"order": _one(cur, "SELECT * FROM orders WHERE id = %s", (order_id,)), "replayed": True}

    order = _require(
        _one(cur, "SELECT * FROM orders WHERE id = %s FOR UPDATE", (order_id,)),
        f"order {order_id} not found",
    )
    _validate_order_status(order["status"])
    if order["status"] == "void":
        raise BusinessRuleError("cannot pay a voided order")
    if order["status"] == "paid":
        raise BusinessRuleError("order is already paid")

    if expected_version is not None and order.get("version") != expected_version:
        raise BusinessRuleError(CONCURRENT_UPDATE_MESSAGE)

    shift = _require(get_open_shift(cur), "no open shift")
    total_paid = 0
    cash_amount = 0
    for payment in payments:
        method = payment["method"]
        amount = int(payment["amount"])
        change = _rule_check(validate_payment, method, amount, payment.get("tendered"))
        total_paid += amount
        if method == "cash":
            cash_amount += amount
        _one(
            cur,
            "INSERT INTO payments (order_id, method, amount, tendered, change_due, reference_no, "
            "                      idempotency_key, captured_by, shift_id) "
            "VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s) RETURNING id",
            (
                order_id, method, amount, payment.get("tendered"), change if method == "cash" else None,
                payment.get("reference_no"), payment.get("idempotency_key"), captured_by, shift["id"],
            ),
        )

    if total_paid != int(order["grand_total"]):
        raise BusinessRuleError(
            f"payment total {total_paid} does not match grand total {order['grand_total']}"
        )

    _validate_order_status("paid")
    _exec(
        cur,
        "UPDATE orders SET status = 'paid', paid_total = %s, paid_at = now(), version = version + 1 "
        "WHERE id = %s AND version = %s",
        (total_paid, order_id, order.get("version")),
    )
    updated = _one(cur, "SELECT version FROM orders WHERE id = %s", (order_id,))
    if updated is None:
        raise BusinessRuleError(CONCURRENT_UPDATE_MESSAGE)

    if cash_amount:
        _exec(
            cur,
            "INSERT INTO cash_movements (shift_id, movement_type, direction, amount, reference_type, "
            "                            reference_id, reason, created_by) "
            "VALUES (%s, 'sale_cash', 'in', %s, 'order', %s, %s, %s)",
            (shift["id"], cash_amount, order_id, f"Tunai {order['order_number']}", captured_by),
        )

    if consume_stock:
        _consume_stock(cur, order_id=order_id, created_by=captured_by)

    earned = 0
    if order["member_id"]:
        earned = points_earned(total_paid)
        if earned:
            _award_points(cur, member_id=order["member_id"], order_id=order_id,
                          points=earned, created_by=captured_by)
        _exec(
            cur,
            "UPDATE members SET total_spend = total_spend + %s WHERE id = %s",
            (total_paid, order["member_id"]),
        )

    _exec(
        cur,
        "UPDATE shifts SET cash_sales = cash_sales + %s, order_count = order_count + 1 WHERE id = %s",
        (cash_amount, shift["id"]),
    )
    _exec(cur, "UPDATE orders SET points_earned = %s WHERE id = %s", (earned, order_id))

    result_order = _one(cur, "SELECT * FROM orders WHERE id = %s", (order_id,))

    # Receipt enqueue is best-effort and happens AFTER every money-moving write
    # above. The item lookup runs inside the same savepoint, so a failed query
    # rolls back only the receipt: the payment stays committed and the
    # connection is never left in an aborted transaction.
    enqueue_receipt(
        cur,
        order=result_order or {},
        load_items=lambda: paid_order_items(cur, order_id),
        payments=list(payments),
    )

    return {
        "order": result_order,
        "points_earned": earned,
        "cash_amount": cash_amount,
        "replayed": False,
    }


def _consume_stock(cur: Any, *, order_id: int, created_by: int) -> None:
    """Deduct ingredient stock from the recipe, appending movements.

    Stock is checked BEFORE the UPDATE: `ingredients.stock_qty` carries only a
    `CHECK (stock_qty >= 0)` constraint in schema.sql, so a sale larger than the
    remaining stock used to drive the balance negative (or abort the whole
    payment on a stricter deployment) instead of failing as a business rule.
    """
    cur.execute(
        "INSERT INTO inventory_movements (ingredient_id, movement_type, qty_delta, order_id, "
        "                                 order_item_id, reason, created_by) "
        "SELECT r.ingredient_id, 'sale_consumption', -(r.qty_per_unit * oi.qty), oi.order_id, oi.id, "
        "       'Konsumsi penjualan', %s "
        "  FROM order_items oi "
        "  JOIN recipes r ON r.product_id = oi.product_id "
        " WHERE oi.order_id = %s AND oi.status = 'active' "
        "RETURNING ingredient_id, qty_delta",
        (created_by, order_id),
    )
    movements = cur.fetchall()
    needed: dict[int, Decimal] = {}
    for movement in movements:
        ingredient_id = int(movement["ingredient_id"])
        qty_delta = Decimal(str(movement["qty_delta"]))
        needed[ingredient_id] = needed.get(ingredient_id, Decimal("0")) + qty_delta
    for ingredient_id, delta in needed.items():
        row = _one(cur, "SELECT name, stock_qty FROM ingredients WHERE id = %s FOR UPDATE",
                   (ingredient_id,))
        current = Decimal(str((row or {}).get("stock_qty", 0)))
        if current + delta < 0:
            name = (row or {}).get("name") or f"#{ingredient_id}"
            raise BusinessRuleError(
                f"stok {name} tidak mencukupi: tersisa {current}, butuh {abs(delta)}"
            )
        _exec(
            cur,
            "UPDATE ingredients SET stock_qty = stock_qty + %s WHERE id = %s",
            (delta, ingredient_id),
        )


def _award_points(cur: Any, *, member_id: int, order_id: int, points: int, created_by: int) -> None:
    member = _require(
        _one(cur, "SELECT * FROM members WHERE id = %s FOR UPDATE", (member_id,)),
        f"member {member_id} not found",
    )
    new_balance = int(member["points_balance"]) + points
    _exec(
        cur,
        "INSERT INTO member_point_ledger (member_id, order_id, entry_type, points, "
        "                                  points_balance_after, reason, created_by) "
        "VALUES (%s, %s, 'earn', %s, %s, 'Poin pembelian lunas', %s)",
        (member_id, order_id, points, new_balance, created_by),
    )
    _exec(cur, "UPDATE members SET points_balance = %s WHERE id = %s", (new_balance, member_id))


def void_order(
    cur: Any, *, order_id: int, voided_by: int, reason: str, expected_version: int | None = None
) -> dict:
    """Void a paid order and reverse every side effect exactly once."""
    if len(reason.strip()) < 3:
        raise BusinessRuleError("void reason must be at least 3 characters")
    order = _require(
        _one(cur, "SELECT * FROM orders WHERE id = %s FOR UPDATE", (order_id,)),
        f"order {order_id} not found",
    )
    _validate_order_status(order["status"])
    if order["status"] == "void":
        raise BusinessRuleError("order is already void")

    if expected_version is not None and order.get("version") != expected_version:
        raise BusinessRuleError(CONCURRENT_UPDATE_MESSAGE)

    prior = _one(cur, "SELECT id FROM order_voids WHERE order_id = %s", (order_id,))
    if prior is not None:
        raise BusinessRuleError("order already has a void record")

    shift = _require(get_open_shift(cur), "no open shift for reversal")
    reversal: dict[str, int] = {"cash_refund": 0, "points_reversed": 0, "stock_reversed": 0}

    # 1. Reverse cash exactly once, mirroring the captured cash entry.
    cash_row = _one(
        cur,
        "SELECT COALESCE(sum(amount), 0) AS total FROM cash_movements "
        " WHERE reference_type = 'order' AND reference_id = %s AND movement_type = 'sale_cash'",
        (order_id,),
    )
    cash_refund = int((cash_row or {}).get("total", 0))
    if cash_refund:
        _exec(
            cur,
            "INSERT INTO cash_movements (shift_id, movement_type, direction, amount, reference_type, "
            "                            reference_id, reason, created_by) "
            "VALUES (%s, 'void_reversal', 'out', %s, 'order', %s, %s, %s)",
            (shift["id"], -cash_refund, order_id, f"Void {order['order_number']}", voided_by),
        )
        reversal["cash_refund"] = cash_refund

    # 2. Reverse stock movements with compensating rows.
    cur.execute(
        "INSERT INTO inventory_movements (ingredient_id, movement_type, qty_delta, order_id, "
        "                                 reversal_of_id, reason, created_by) "
        "SELECT ingredient_id, 'reversal', -qty_delta, order_id, id, 'Reversal void', %s "
        "  FROM inventory_movements "
        " WHERE order_id = %s AND movement_type = 'sale_consumption' "
        "RETURNING ingredient_id, qty_delta",
        (voided_by, order_id),
    )
    for movement in cur.fetchall():
        _exec(
            cur,
            "UPDATE ingredients SET stock_qty = stock_qty + %s WHERE id = %s",
            (movement["qty_delta"], movement["ingredient_id"]),
        )
        reversal["stock_reversed"] += 1

    # 3. Reverse member points.
    if order["member_id"] and order["points_earned"]:
        member = _require(
            _one(cur, "SELECT * FROM members WHERE id = %s FOR UPDATE", (order["member_id"],)),
            "member not found",
        )
        new_balance = max(0, int(member["points_balance"]) - int(order["points_earned"]))
        existing = _one(
            cur,
            "SELECT id FROM member_point_ledger WHERE order_id = %s AND entry_type = 'reversal'",
            (order_id,),
        )
        if existing is None:
            _exec(
                cur,
                "INSERT INTO member_point_ledger (member_id, order_id, entry_type, points, "
                "                                  points_balance_after, reason, created_by) "
                "VALUES (%s, %s, 'reversal', %s, %s, 'Reversal void', %s)",
                (member["id"], order_id, -int(order["points_earned"]), new_balance, voided_by),
            )
            _exec(cur, "UPDATE members SET points_balance = %s WHERE id = %s", (new_balance, member["id"]))
        reversal["points_reversed"] = int(order["points_earned"])

    # 4. Mark payments voided, free the table, record the audit trail.
    _exec(
        cur,
        "UPDATE payments SET status = 'voided', voided_at = now(), void_reason = %s "
        " WHERE order_id = %s AND status = 'captured'",
        (reason, order_id),
    )
    if order["table_id"]:
        _exec(cur, "UPDATE tables SET status = 'available' WHERE id = %s", (order["table_id"],))

    _exec(
        cur,
        "INSERT INTO order_voids (order_id, voided_by, reason, cash_refund, points_reversed, stock_reversed)"
        "VALUES (%s, %s, %s, %s, %s, %s)",
        (order_id, voided_by, reason, cash_refund, reversal["points_reversed"],
         reversal["stock_reversed"] > 0),
    )
    _validate_order_status("void")
    _exec(
        cur,
        "UPDATE orders SET status = 'void', voided_at = now(), voided_by = %s, void_reason = %s, "
        "version = version + 1 WHERE id = %s AND version = %s",
        (voided_by, reason, order_id, order.get("version")),
    )
    updated = _one(cur, "SELECT version FROM orders WHERE id = %s", (order_id,))
    if updated is None:
        raise BusinessRuleError(CONCURRENT_UPDATE_MESSAGE)
    _exec(
        cur,
        "INSERT INTO audit_logs (entity_type, entity_id, action, actor_id, reason, before_state, after_state) "
        "VALUES ('order', %s, 'void', %s, %s, %s, %s)",
        (order_id, voided_by, reason, _json(order), _json({"status": "void"})),
    )
    _exec(
        cur,
        "UPDATE shifts SET void_count = void_count + 1, cash_sales = cash_sales - %s WHERE id = %s",
        (cash_refund, shift["id"]),
    )
    return {"order_id": order_id, "reversal": reversal}


def _json(value: Any) -> str:
    import json

    return json.dumps(value, default=str, sort_keys=True)


def close_shift(
    cur: Any,
    *,
    shift_id: int,
    closed_by: int,
    counted_cash: int,
    notes: str | None = None,
    expected_version: int | None = None,
) -> dict:
    """Close a shift: compute expected cash, variance, and vendor settlements."""
    shift = _require(
        _one(cur, "SELECT * FROM shifts WHERE id = %s FOR UPDATE", (shift_id,)),
        f"shift {shift_id} not found",
    )
    if shift["status"] == "closed":
        raise BusinessRuleError("shift is already closed")
    if expected_version is not None and shift.get("version") != expected_version:
        raise BusinessRuleError("shift changed by another cashier, refresh")
    if counted_cash < 0:
        raise BusinessRuleError("counted cash must be >= 0")

    # Cash sales net of voids: a void writes a negative `void_reversal` row
    # (see void_order), so both types must be summed or a same-shift cash void
    # would leave a phantom shortage in the till reconciliation.
    cash = _one(
        cur,
        "SELECT COALESCE(sum(amount) FILTER ("
        "           WHERE movement_type IN ('sale_cash', 'void_reversal')), 0) AS cash_sales, "
        "       COALESCE(sum(amount) FILTER (WHERE movement_type = 'cash_in'), 0) AS cash_in, "
        "       COALESCE(sum(amount) FILTER (WHERE movement_type = 'cash_out'), 0) AS cash_out, "
        "       COALESCE(sum(amount) FILTER (WHERE movement_type = 'vendor_settlement'), 0) AS vendor_cash "
        "  FROM cash_movements WHERE shift_id = %s",
        (shift_id,),
    ) or {}
    cash_sales = int(cash.get("cash_sales", 0))
    cash_in = int(cash.get("cash_in", 0))
    cash_out = abs(int(cash.get("cash_out", 0)))
    vendor_cash_existing = abs(int(cash.get("vendor_cash", 0)))

    non_cash = _one(
        cur,
        "SELECT COALESCE(sum(p.amount), 0) AS total FROM payments p "
        "  JOIN orders o ON o.id = p.order_id "
        " WHERE p.shift_id = %s AND p.status = 'captured' AND p.method <> 'cash' "
        "   AND o.status = 'paid'",
        (shift_id,),
    ) or {}
    non_cash_sales = int(non_cash.get("total", 0))

    settlements = generate_vendor_settlements(cur, shift_id=shift_id, created_by=closed_by)
    # Only cash written by THIS attempt is added to the pre-settlement total.
    # A settlement that was already paid keeps its existing movement and reports
    # cash_recorded = 0, so a retried close cannot count the same payout twice.
    vendor_new = sum(int(s.get("cash_recorded", 0)) for s in settlements)
    vendor_cash_total = vendor_cash_existing + vendor_new
    # "cash_recorded" is an internal ledger marker for the total above; it is
    # not part of the settlement row and must not leak into the response or
    # the recap payload.
    for settlement in settlements:
        settlement.pop("cash_recorded", None)

    expected = expected_cash(
        int(shift["opening_float"]), cash_sales, cash_in, cash_out, vendor_cash_total,
    )
    variance = counted_cash - expected
    closed_at_row = _one(cur, "SELECT now() AS ts")
    closed_at = (closed_at_row or {}).get("ts")

    closed_shift = _require(
        _one(
            cur,
            "UPDATE shifts SET status = 'closed', closed_by = %s, closed_at = now(), expected_cash = %s, "
            "                  counted_cash = %s, variance = %s, notes = %s, "
            "                  cash_sales = %s, non_cash_sales = %s, cash_in_total = %s, cash_out_total = %s, "
            "                  vendor_cash_total = %s, version = version + 1 "
            " WHERE id = %s AND version = %s RETURNING *",
            (closed_by, expected, counted_cash, variance, notes, cash_sales, non_cash_sales,
             cash_in, cash_out, vendor_cash_total, shift_id, shift.get("version")),
        ),
        "failed to close shift",
    )

    recap = None
    try:
        recap = shift_recap_payload(
            shift_code=closed_shift["code"],
            status=closed_shift["status"],
            opened_at=str(closed_shift["opened_at"]),
            closed_at=str(closed_at) if closed_at is not None else None,
            opening_float=int(closed_shift["opening_float"]),
            cash_sales=cash_sales,
            non_cash_sales=non_cash_sales,
            cash_in_total=cash_in,
            cash_out_total=cash_out,
            vendor_cash_total=vendor_cash_total,
            expected_cash=expected,
            counted_cash=counted_cash,
            variance=variance,
            order_count=int(closed_shift["order_count"]),
            void_count=int(closed_shift["void_count"]),
            settlements=settlements,
        )
    except Exception:  # noqa: BLE001 - recap is a side effect, not the close
        log.warning("shift recap build failed for shift %s; close is unaffected",
                    shift_id, exc_info=True)

    # Shift recap goes to the outbox AFTER the shift row is closed. Both the
    # payload build above and the enqueue below are best-effort: an outbox
    # failure must never roll back the close (thermal print is the source of
    # truth, WhatsApp is a side channel).
    if recap is not None:
        enqueue_shift_recap(cur, shift_id=shift_id, recap=recap)

    return {
        "shift": closed_shift,
        "expected_cash": expected,
        "counted_cash": counted_cash,
        "variance": variance,
        "settlements": settlements,
        "recap": recap,
    }


def generate_vendor_settlements(cur: Any, *, shift_id: int, created_by: int) -> list[dict]:
    """Create vendor settlements for a shift; each records cash exactly once.

    The cash movement points at the settlement row it pays
    (``reference_type='vendor_settlement'``, ``reference_id=<settlement id>``)
    instead of at the shift. ``cash_movements_reference_unique`` therefore
    enforces "one cash event per settlement", so one shift can settle several
    vendors at once without every movement colliding on the same shift key.

    Write order is settlement -> movement -> pointer: the settlement row is
    inserted first with ``cash_movement_id`` NULL, the movement is keyed to the
    new settlement id, and the pointer is filled last. Cash is only ever written
    for a settlement that has no movement yet, so re-running this for the same
    shift is a no-op for vendors it already settled. Each returned row carries
    ``cash_recorded`` = the amount this call actually wrote to the ledger (0 for
    an already-settled vendor), which is what close_shift adds to the
    pre-settlement vendor total.
    """
    cur.execute(
        "SELECT oi.vendor_id, v.name AS vendor_name, v.profit_share_percent, "
        "       COALESCE(sum(oi.line_subtotal), 0) AS commission_base, "
        "       COALESCE(sum(oi.line_total), 0) AS gross_sales "
        "  FROM order_items oi "
        "  JOIN orders o ON o.id = oi.order_id "
        "  JOIN vendors v ON v.id = oi.vendor_id "
        " WHERE o.shift_id = %s AND o.status = 'paid' AND oi.status = 'active' "
        "   AND oi.vendor_id IS NOT NULL "
        " GROUP BY oi.vendor_id, v.name, v.profit_share_percent "
        "HAVING COALESCE(sum(oi.line_subtotal), 0) > 0",
        (shift_id,),
    )
    rows = cur.fetchall()
    created: list[dict] = []
    for row in rows:
        existing = _one(
            cur,
            "SELECT * FROM vendor_settlements WHERE shift_id = %s AND vendor_id = %s",
            (shift_id, row["vendor_id"]),
        )
        if existing is not None and existing["status"] == "paid" and (
            existing.get("cash_movement_id") is not None or not existing.get("vendor_amount")
        ):
            # Idempotent retry: this vendor's settlement is already complete
            # (cash already in the ledger, or a legitimate 0-share row). A
            # retried close must never record a second movement for it.
            settled = dict(existing)
            settled["cash_recorded"] = 0
            created.append(settled)
            continue

        commission_base = int(row["commission_base"])
        gross_sales = int(row["gross_sales"])
        # Discount is absorbed by the outlet: the vendor base is pre-discount.
        share = row["profit_share_percent"]
        amount = vendor_share_amount(commission_base, share if isinstance(share, Decimal) else Decimal(str(share)))

        # 1. The settlement row comes first with no cash pointer, so the cash
        #    movement can reference the settlement row itself. The upsert keeps
        #    an already-recorded cash_movement_id untouched (a normal retry
        #    path never reaches this point, but nothing may overwrite it).
        settlement = _one(
            cur,
            "INSERT INTO vendor_settlements (shift_id, vendor_id, gross_sales, commission_base, "
            "                                profit_share_percent, vendor_amount, cash_movement_id, "
            "                                status, settled_at, created_by) "
            "VALUES (%s, %s, %s, %s, %s, %s, NULL, 'paid', now(), %s) "
            "ON CONFLICT (shift_id, vendor_id) DO UPDATE "
            "   SET gross_sales = EXCLUDED.gross_sales, "
            "       commission_base = EXCLUDED.commission_base, "
            "       vendor_amount = EXCLUDED.vendor_amount, "
            "       status = 'paid', settled_at = now() "
            "RETURNING *",
            (shift_id, row["vendor_id"], gross_sales, commission_base, share, amount,
             created_by),
        )
        settlement = dict(settlement or {})
        settlement_id = settlement.get("id")
        cash_recorded = 0

        # Zero-share rows are in-house sales, not a cash event: the ledger
        # forbids amount = 0, and a zero "settlement" would credit nothing.
        if amount and settlement.get("cash_movement_id") is None and settlement_id is not None:
            # 2. One cash event per settlement, keyed to the settlement row.
            #    The unique index blocks a second movement for the same vendor
            #    settlement instead of aborting the whole close on a shift key.
            existing_movement = _one(
                cur,
                "SELECT id FROM cash_movements "
                " WHERE movement_type = 'vendor_settlement' "
                "   AND reference_type = 'vendor_settlement' AND reference_id = %s",
                (settlement_id,),
            )
            movement_id = (existing_movement or {}).get("id")
            if movement_id is None:
                movement = _one(
                    cur,
                    "INSERT INTO cash_movements (shift_id, movement_type, direction, amount, reference_type, "
                    "                            reference_id, reason, created_by) "
                    "VALUES (%s, 'vendor_settlement', 'out', %s, 'vendor_settlement', %s, %s, %s) RETURNING id",
                    (shift_id, -amount, settlement_id, f"Bagi hasil {row['vendor_name']}", created_by),
                )
                movement_id = (movement or {}).get("id")
                if movement_id is not None:
                    cash_recorded = amount
            # 3. Point the settlement at the cash it paid out.
            if movement_id is not None:
                updated = _one(
                    cur,
                    "UPDATE vendor_settlements SET cash_movement_id = %s WHERE id = %s RETURNING *",
                    (movement_id, settlement_id),
                )
                settlement = dict(updated or settlement)
        settlement["cash_recorded"] = cash_recorded if amount else 0
        created.append(settlement)
    return created


def record_cash_movement(
    cur: Any, *, shift_id: int, direction: str, amount: int, reason: str, created_by: int
) -> dict:
    """Record a manual cash in/out against the open shift."""
    if direction not in ("in", "out"):
        raise BusinessRuleError("direction must be 'in' or 'out'")
    if amount <= 0:
        raise BusinessRuleError("amount must be > 0")
    shift = _require(get_open_shift(cur), "no open shift")
    movement_type = "cash_in" if direction == "in" else "cash_out"
    signed = amount if direction == "in" else -amount
    return _require(
        _one(
            cur,
            "INSERT INTO cash_movements (shift_id, movement_type, direction, amount, reason, created_by) "
            "VALUES (%s, %s, %s, %s, %s, %s) RETURNING *",
            (shift["id"], movement_type, direction, signed, reason, created_by),
        ),
        "failed to record cash movement",
    )


def create_reservation(
    cur: Any,
    *,
    customer_name: str,
    customer_phone: str,
    reserved_date: Any,
    reserved_time: Any,
    party_size: int,
    source: str = "whatsapp",
    created_by: int | None = None,
) -> dict:
    """Intake a reservation (used by the WhatsApp #reservasi router)."""
    if party_size <= 0 or party_size > 500:
        raise BusinessRuleError("party size out of range")
    code = _next_reservation_code(cur)
    return _require(
        _one(
            cur,
            "INSERT INTO reservations (code, customer_name, customer_phone, party_size, reserved_date, "
            "                          reserved_time, status, source, created_by) "
            "VALUES (%s, %s, %s, %s, %s, %s, 'pending', %s, %s) RETURNING *",
            (code, customer_name, customer_phone, party_size, reserved_date, reserved_time, source, created_by),
        ),
        "failed to create reservation",
    )


def _next_reservation_code(cur: Any) -> str:
    row = _one(cur, "SELECT to_char(now(), 'YYYYMMDD') AS d")
    day = (row or {}).get("d") or "00000000"
    count = _one(cur, "SELECT count(*) AS n FROM reservations WHERE code LIKE %s", (f"RSV-{day}-%",))
    return f"RSV-{day}-{(count or {}).get('n', 0) + 1:03d}"
