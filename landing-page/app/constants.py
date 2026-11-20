"""Closed vocabularies for GrandPOS (mirrors db/schema.sql CHECK constraints)."""

CHANNELS = ("fnb", "retail")
ORDER_TYPES = ("dine_in", "takeaway", "retail")
ORDER_STATUSES = ("open_bill", "open", "completed", "paid", "void", "cancelled", "pending")
PAYMENT_METHODS = ("cash", "qris", "debit", "credit", "transfer", "voucher")
SHIFT_STATUSES = ("open", "closing", "closed")
SHIFT_CLOSING_STATUSES = ("open", "closing")
CASH_MOVEMENT_TYPES = (
    "opening_float",
    "sale_cash",
    "sale_cash_reversal",
    "cash_in",
    "cash_out",
    "vendor_settlement",
    "vendor_settlement_reversal",
    "void_reversal",
    "closing_adjustment",
)
POINT_ENTRY_TYPES = ("earn", "redeem", "reversal", "expire", "adjust")
WA_COMMANDS = ("/stok", "/laporan-shift", "/dashboard")
WA_EVENT_TYPES = ("receipt", "shift_recap", "reservation_confirm")
