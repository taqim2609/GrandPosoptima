"""Regression tests for edge-sync split payments."""

from app.edge_sync import EdgeSyncError, normalize_payload


def _payload(**overrides):
    payload = {
        "client_ref": "edge-split-1",
        "order_type": "takeaway",
        "total": 100000,
        "items": [{"sku": "SKU-1", "name": "Produk", "type": "retail", "qty": 1, "price": 100000}],
    }
    payload.update(overrides)
    return payload


def test_legacy_single_payment_is_preserved():
    normalized = normalize_payload(_payload(payment_method="cash", amount_paid=120000))
    assert normalized["payments"] == [normalized["payment"]]
    assert normalized["payments"][0]["amount"] == 100000
    assert normalized["payments"][0]["tendered"] == 120000


def test_split_payments_are_normalized_and_sum_to_total():
    normalized = normalize_payload(
        _payload(
            payments=[
                {"payment_method": "cash", "amount": 40000, "amount_paid": 50000},
                {"payment_method": "qris", "amount": 60000, "reference_no": "QR-1"},
            ]
        )
    )
    assert [p["method"] for p in normalized["payments"]] == ["cash", "qris"]
    assert [p["amount"] for p in normalized["payments"]] == [40000, 60000]
    assert normalized["payments"][0]["tendered"] == 50000
    assert normalized["payments"][1]["tendered"] is None


def test_split_payment_total_mismatch_is_rejected():
    try:
        normalize_payload(
            _payload(
                payments=[
                    {"payment_method": "cash", "amount": 40000},
                    {"payment_method": "qris", "amount": 50000},
                ]
            )
        )
    except EdgeSyncError as exc:
        assert "jumlah payments" in str(exc)
    else:
        raise AssertionError("expected split total mismatch to be rejected")
