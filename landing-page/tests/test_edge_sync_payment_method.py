"""Regressions for edge-sync payment-method handling.

The bug: an unknown/absent payment method used to be coerced to "cash". A card or
transfer sale from the kiosk would then be booked as drawer cash, inflating
cash_sales and breaking shift reconciliation.
"""

import pytest

from app import edge_sync


def _normalise(method):
    payload = {
        "order_type": "takeaway",
        "total": 10000,
        "items": [{"sku": "SKU-1", "name": "Produk", "qty": 1, "price": 10000}],
    }
    if method is not None:
        payload["payment_method"] = method
    return edge_sync.normalize_payload(payload)


@pytest.mark.parametrize(
    "raw,expected",
    [
        ("cash", "cash"),
        ("tunai", "cash"),
        ("qris", "qris"),
        ("transfer", "transfer"),
        ("debit", "debit"),
        ("kartu debit", "debit"),
        ("credit", "credit"),
        ("voucher", "voucher"),
    ],
)
def test_known_methods_map_to_their_own_vocabulary(raw, expected):
    assert _normalise(raw)["payments"][0]["method"] == expected


def test_unknown_method_is_rejected_not_booked_as_cash():
    with pytest.raises(edge_sync.EdgeSyncError) as excinfo:
        _normalise("bitcoin")
    assert "metode pembayaran tidak dikenal" in str(excinfo.value)


def test_missing_method_defaults_to_cash_for_legacy_payloads():
    # Legacy Pi payloads predate the payment_method field; those really were cash.
    assert _normalise(None)["payments"][0]["method"] == "cash"


def test_split_payments_keep_each_method():
    payload = {
        "order_type": "takeaway",
        "total": 10000,
        "items": [{"sku": "SKU-1", "name": "Produk", "qty": 1, "price": 10000}],
        "payments": [
            {"payment_method": "cash", "amount": 4000},
            {"payment_method": "transfer", "amount": 6000},
        ],
    }
    methods = [p["method"] for p in edge_sync.normalize_payload(payload)["payments"]]
    assert methods == ["cash", "transfer"]


def test_unknown_method_in_a_split_rejects_the_whole_transaction():
    payload = {
        "order_type": "takeaway",
        "total": 10000,
        "items": [{"sku": "SKU-1", "name": "Produk", "qty": 1, "price": 10000}],
        "payments": [
            {"payment_method": "cash", "amount": 4000},
            {"payment_method": "ewallet", "amount": 6000},
        ],
    }
    with pytest.raises(edge_sync.EdgeSyncError):
        edge_sync.normalize_payload(payload)
