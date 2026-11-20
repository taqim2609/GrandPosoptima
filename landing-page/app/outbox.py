"""Outbox payload builders: receipts and shift recaps.

Pure functions so the HTTP layer, the gateway and the tests all produce byte
identical payloads for a given input.
"""

from __future__ import annotations

from typing import Any, Mapping, Sequence

from .constants import WA_EVENT_TYPES


def _idr(value: int) -> str:
    return "Rp " + f"{int(value):,}".replace(",", ".")


def receipt_payload(
    *,
    order_number: str,
    customer_name: str | None,
    channel: str,
    order_type: str,
    items: Sequence[Mapping[str, Any]],
    subtotal: int,
    discount_total: int,
    service_total: int,
    tax_total: int,
    grand_total: int,
    paid_total: int,
    payments: Sequence[Mapping[str, Any]],
    points_earned: int = 0,
    member_code: str | None = None,
    business_time: str | None = None,
) -> dict:
    """Digital receipt for the customer (POS -> WhatsApp)."""
    _require_event("receipt")
    lines = []
    for item in items:
        qty = item.get("qty")
        lines.append(
            {
                "name": item.get("product_name") or item.get("name") or "",
                "qty": float(qty) if qty is not None else None,
                "unit_price": int(item.get("unit_price", 0)),
                "line_total": int(item.get("line_total", 0)),
                "weighted": bool(item.get("is_weighted", False)),
            }
        )
    return {
        "event": "receipt",
        "order_number": order_number,
        "customer_name": customer_name or "Pelanggan",
        "channel": channel,
        "order_type": order_type,
        "business_time": business_time,
        "items": lines,
        "totals": {
            "subtotal": int(subtotal),
            "discount_total": int(discount_total),
            "service_total": int(service_total),
            "tax_total": int(tax_total),
            "grand_total": int(grand_total),
            "paid_total": int(paid_total),
        },
        "payments": [
            {
                "method": p.get("method"),
                "amount": int(p.get("amount", 0)),
                "change_due": int(p.get("change_due", 0) or 0),
                # Bagian `amount` yang tidak pernah diterima kasir; bukan nol
                # berarti ada shortage yang harus terlihat di struk/analitik.
                "tendered_drift": int(p.get("tendered_drift", 0) or 0),
            }
            for p in payments
        ],
        "points_earned": int(points_earned),
        "member_code": member_code,
        "text": _receipt_text(
            order_number=order_number,
            items=lines,
            grand_total=int(grand_total),
            paid_total=int(paid_total),
            points_earned=int(points_earned),
        ),
    }


def _receipt_text(*, order_number: str, items: list[dict], grand_total: int,
                  paid_total: int, points_earned: int) -> str:
    rows = "\n".join(
        f"- {i['name']} x{i['qty']} = {_idr(i['line_total'])}" for i in items
    )
    tail = f"\nPoin diperoleh: {points_earned}" if points_earned else ""
    return (
        f"Struk {order_number} - Grand Aceh Kuliner\n"
        f"{rows}\n"
        f"Total: {_idr(grand_total)}\nDibayar: {_idr(paid_total)}{tail}\n"
        f"Terima kasih!"
    )


def shift_recap_payload(
    *,
    shift_code: str,
    status: str,
    opened_at: str,
    closed_at: str | None,
    opening_float: int,
    cash_sales: int,
    non_cash_sales: int,
    cash_in_total: int,
    cash_out_total: int,
    vendor_cash_total: int,
    expected_cash: int,
    counted_cash: int | None,
    variance: int | None,
    order_count: int,
    void_count: int,
    settlements: Sequence[Mapping[str, Any]] = (),
) -> dict:
    """Shift recap for the owner (POS -> WhatsApp), sent at shift close."""
    _require_event("shift_recap")
    variance_note = "BELUM DIHITUNG" if variance is None else (
        "SESUAI" if variance == 0 else ("LEBIH" if variance > 0 else "KURANG")
    )
    return {
        "event": "shift_recap",
        "shift_code": shift_code,
        "status": status,
        "opened_at": opened_at,
        "closed_at": closed_at,
        "cash": {
            "opening_float": int(opening_float),
            "cash_sales": int(cash_sales),
            "non_cash_sales": int(non_cash_sales),
            "cash_in_total": int(cash_in_total),
            "cash_out_total": int(cash_out_total),
            "vendor_cash_total": int(vendor_cash_total),
            "expected_cash": int(expected_cash),
            "counted_cash": None if counted_cash is None else int(counted_cash),
            "variance": None if variance is None else int(variance),
            "variance_note": variance_note,
        },
        "orders": {"order_count": int(order_count), "void_count": int(void_count)},
        "vendor_settlements": [
            {
                "vendor_name": s.get("vendor_name"),
                "vendor_amount": int(s.get("vendor_amount", 0)),
                "status": s.get("status", "paid"),
            }
            for s in settlements
        ],
        "text": (
            f"Rekap Shift {shift_code} ({status})\n"
            f"Omzet tunai: {_idr(cash_sales)} | Non-tunai: {_idr(non_cash_sales)}\n"
            f"Kas sistem: {_idr(expected_cash)} | Kas fisik: "
            f"{'-' if counted_cash is None else _idr(counted_cash)}\n"
            f"Selisih: "
            f"{'-' if variance is None else _idr(abs(variance)) + ' (' + variance_note + ')'}\n"
            f"Transaksi: {order_count} | Void: {void_count}"
        ),
    }


def reservation_confirm_payload(
    *,
    code: str,
    customer_name: str,
    reserved_date: str,
    reserved_time: str,
    party_size: int,
    table_code: str | None = None,
) -> dict:
    """Optional confirmation message back to the customer (no LLM involved)."""
    _require_event("reservation_confirm")
    table_part = f" Meja {table_code}." if table_code else ""
    return {
        "event": "reservation_confirm",
        "code": code,
        "customer_name": customer_name,
        "reserved_date": reserved_date,
        "reserved_time": reserved_time,
        "party_size": int(party_size),
        "table_code": table_code,
        "text": (
            f"Reservasi {code} diterima: {customer_name}, {reserved_date} pukul "
            f"{reserved_time} untuk {party_size} orang.{table_part}"
        ),
    }


def _require_event(event: str) -> None:
    if event not in WA_EVENT_TYPES:
        raise ValueError(f"unknown outbox event: {event}")
