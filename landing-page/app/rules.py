"""Shared pure-business-logic for GrandPOS.

Every money value is an int (IDR). No float arithmetic anywhere in this
module. Weights are Decimal kilograms; rounding is ROUND_HALF_UP to match the
SQL ROUND() semantics in the paid path.
"""

from __future__ import annotations

from datetime import date
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from typing import Optional

from .constants import (
    CHANNELS,
    ORDER_TYPES,
    PAYMENT_METHODS,
    SHIFT_CLOSING_STATUSES,
    WA_COMMANDS,
)

CHANNEL_PRODUCT_KIND = {"fnb": "fnb", "retail": "retail"}
# order_type -> (channel, requires_table)
ORDER_TYPE_RULES = {
    "dine_in": ("fnb", True),
    "takeaway": ("fnb", False),
    "retail": ("retail", False),
}

POINTS_PER_1000_NET = 1
POINTS_VALUE_IDR = 100
MAX_PARTY_SIZE = 500
MIN_RESERVATION_DATE = date(2020, 1, 1)
MAX_RESERVATION_DATE = date(2100, 12, 31)
OPENING_HOUR = 0
CLOSING_HOUR = 23


def quantize_weight(weight_kg: str | Decimal | float | int) -> Decimal:
    """Parse grams/decimal kg input into Decimal kilograms, rejecting floats."""
    if isinstance(weight_kg, float):
        raise ValueError("weight must not be a float; pass str or Decimal")
    try:
        value = weight_kg if isinstance(weight_kg, Decimal) else Decimal(str(weight_kg))
    except (InvalidOperation, ValueError, TypeError) as exc:
        raise ValueError(f"invalid weight: {weight_kg!r}") from exc
    if value <= 0:
        raise ValueError("weight must be positive")
    return value


def round_idr(amount: Decimal) -> int:
    """Deterministic ROUND_HALF_UP to whole rupiah (matches SQL ROUND)."""
    if not isinstance(amount, Decimal):
        amount = Decimal(str(amount))
    return int(amount.quantize(Decimal("1"), rounding=ROUND_HALF_UP))


def weighted_line_total(weight_kg: str | Decimal, base_price: int) -> int:
    """price = weight_kg x base_price with deterministic rounding."""
    if base_price < 0:
        raise ValueError("base_price must be >= 0")
    return round_idr(quantize_weight(weight_kg) * Decimal(base_price))


def compute_promo_discount(
    *,
    kind: str,
    value: int,
    subtotal: int,
    min_subtotal: int = 0,
    max_discount: Optional[int] = None,
) -> int:
    """Outlet-borne discount (never reduces COGS or vendor commission base)."""
    if kind not in ("percent", "amount"):
        raise ValueError(f"unknown promo kind: {kind}")
    if subtotal < 0 or value <= 0 or min_subtotal < 0:
        raise ValueError("negative pricing input")
    if subtotal < min_subtotal:
        return 0
    if kind == "percent":
        if value > 100:
            raise ValueError("percent promo cannot exceed 100")
        discount = round_idr(Decimal(subtotal) * Decimal(value) / Decimal(100))
    else:
        discount = value
    if max_discount is not None:
        discount = min(discount, max_discount)
    return min(discount, subtotal)


def vendor_share_amount(commission_base: int, share_percent: Decimal) -> int:
    """Vendor profit-share on the pre-discount commission base."""
    if commission_base < 0:
        raise ValueError("commission_base must be >= 0")
    if share_percent < 0 or share_percent > 100:
        raise ValueError("share_percent out of range")
    return round_idr(Decimal(commission_base) * Decimal(share_percent) / Decimal(100))


def expected_cash(
    opening_float: int,
    cash_sales: int,
    cash_in: int,
    cash_out: int,
    vendor_cash: int,
) -> int:
    """Shift reconciliation: opening + cash sales + in - out - vendor cash."""
    for name, value in (
        ("opening_float", opening_float), ("cash_sales", cash_sales),
        ("cash_in", cash_in), ("cash_out", cash_out), ("vendor_cash", vendor_cash),
    ):
        if value < 0:
            raise ValueError(f"{name} must be >= 0")
    return opening_float + cash_sales + cash_in - cash_out - vendor_cash


def points_earned(net_total: int) -> int:
    """Points awarded on PAID orders only (never on open/void)."""
    if net_total < 0:
        raise ValueError("net_total must be >= 0")
    return (net_total // 1000) * POINTS_PER_1000_NET


def validate_order_channel(order_type: str, table_id: Optional[int], product_channel: str) -> str:
    """Enforce F&B dine-in/takeaway vs retail separation. Returns channel."""
    if order_type not in ORDER_TYPE_RULES:
        raise ValueError(f"unknown order_type: {order_type}")
    if product_channel not in CHANNELS:
        raise ValueError(f"unknown product channel: {product_channel}")
    channel, requires_table = ORDER_TYPE_RULES[order_type]
    if requires_table and table_id is None:
        raise ValueError("dine_in orders require a table")
    if not requires_table and table_id is not None:
        raise ValueError(f"{order_type} orders must not carry a table")
    if product_channel != channel:
        raise ValueError(f"{order_type} accepts {channel} products only, got {product_channel}")
    return channel


def validate_payment(method: str, amount: int, tendered: Optional[int]) -> int:
    """Return change_due for cash payments; validate tender covers amount."""
    if method not in PAYMENT_METHODS:
        raise ValueError(f"unknown payment method: {method}")
    if amount <= 0:
        raise ValueError("payment amount must be > 0")
    if method == "cash":
        if tendered is None or tendered < amount:
            raise ValueError("cash tendered must cover the amount")
        return tendered - amount
    return 0


def reservation_slot_ok(reserved_date: date, hour: int, minute: int, party_size: int) -> None:
    """Validate an inbound #reservasi request before it touches the database."""
    if not (MIN_RESERVATION_DATE <= reserved_date <= MAX_RESERVATION_DATE):
        raise ValueError("reservation date out of range")
    if not (OPENING_HOUR <= hour <= CLOSING_HOUR) or not (0 <= minute <= 59):
        raise ValueError("reservation time out of range")
    if party_size <= 0 or party_size > MAX_PARTY_SIZE:
        raise ValueError("party size out of range")


def closing_status_ok(current: str) -> str:
    if current not in SHIFT_CLOSING_STATUSES:
        raise ValueError(f"cannot close shift in status {current!r}")
    return "closed"


def wa_command_ok(command: str) -> str:
    if command not in WA_COMMANDS:
        raise ValueError(f"unknown command: {command}")
    return command


def table_code_ok(code: str) -> str:
    cleaned = code.strip().upper()
    if not cleaned or len(cleaned) > 16:
        raise ValueError("table code invalid")
    return cleaned


# ---------------------------------------------------------------------------
# Landing Page Configuration Validation
# ---------------------------------------------------------------------------

LANDING_SECTIONS = (
    "hero",
    "stats",
    "promo_banner",
    "features",
    "contact_info",
    "reservation",
    "articles_header",
    "seo",
)

LANDING_KEY_SCHEMA = {
    "hero": {
        "badge": "string",
        "title": "string",
        "subtitle": "string",
        "image_url": "string",
        "primary_cta": "object",
        "secondary_cta": "object",
    },
    "stats": {
        "show_section": "boolean",
        "items": "array",
    },
    "promo_banner": {
        "enabled": "boolean",
        "badge": "string",
        "title": "string",
        "subtitle": "string",
        "cta_text": "string",
        "cta_link": "string",
    },
    "features": {
        "items": "array",
    },
    "contact_info": {
        "address": "string",
        "google_maps_url": "string",
        "phone": "string",
        "whatsapp": "string",
        "email": "string",
        "opening_hours": "string",
        "instagram": "string",
    },
    "reservation": {
        "title": "string",
        "subtitle": "string",
        "note": "string",
        "max_pax": "integer",
    },
    "articles_header": {
        "badge": "string",
        "title": "string",
        "subtitle": "string",
    },
    "seo": {
        "site_title": "string",
        "meta_title": "string",
        "meta_description": "string",
        "og_image_url": "string",
        "site_name": "string",
        "canonical_url": "string",
        "keywords": "string",
        "twitter_handle": "string",
    },
}


def validate_landing_section(section: str) -> str:
    """Validate that section is a known landing config section."""
    if section not in LANDING_SECTIONS:
        raise ValueError(f"unknown landing section: {section}")
    return section


def validate_landing_key(section: str, key: str) -> str:
    """Validate that key is allowed for the given section."""
    section_schema = LANDING_KEY_SCHEMA.get(section)
    if section_schema is None:
        raise ValueError(f"unknown landing section: {section}")
    if key not in section_schema:
        raise ValueError(f"unknown key {key!r} for section {section!r}")
    return key


def validate_landing_value(section: str, key: str, value: object) -> object:
    """Validate that value matches the expected type for the key."""
    expected_type = LANDING_KEY_SCHEMA[section][key]
    if expected_type == "string":
        if not isinstance(value, str):
            raise ValueError(f"{section}.{key} must be a string")
    elif expected_type == "boolean":
        if not isinstance(value, bool):
            raise ValueError(f"{section}.{key} must be a boolean")
    elif expected_type == "integer":
        if not isinstance(value, int) or isinstance(value, bool):
            raise ValueError(f"{section}.{key} must be an integer")
    elif expected_type == "array":
        if not isinstance(value, list):
            raise ValueError(f"{section}.{key} must be an array")
    elif expected_type == "object":
        if not isinstance(value, dict):
            raise ValueError(f"{section}.{key} must be an object")
    else:
        raise ValueError(f"unknown expected type {expected_type!r} for {section}.{key}")
    return value


def validate_landing_config(config: dict) -> dict:
    """Validate an entire landing config object (section -> {key -> value})."""
    if not isinstance(config, dict):
        raise ValueError("landing config must be an object")
    for section, keys in config.items():
        validate_landing_section(section)
        if not isinstance(keys, dict):
            raise ValueError(f"section {section!r} must be an object")
        for key, value in keys.items():
            validate_landing_key(section, key)
            validate_landing_value(section, key, value)
    return config
