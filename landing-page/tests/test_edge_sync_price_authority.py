"""Regression tests for warehouse-authoritative edge-sync pricing."""

from app.edge_sync import EdgeSyncError, _apply_warehouse_prices


def _normalised(lines, *, subtotal=999, grand_total=999):
    return {
        "lines": lines,
        "subtotal": subtotal,
        "grand_total": grand_total,
        "discount_total": 0,
        "service_total": 0,
        "payments": [{"method": "cash", "amount": grand_total, "tendered": grand_total}],
        "payment": {"method": "cash", "amount": grand_total, "tendered": grand_total},
    }


def test_stale_kiosk_price_uses_warehouse_price_and_records_drift():
    normalized = _normalised(
        [{
            "sku": "SKU-1",
            "name": "Produk",
            "qty": 2,
            "unit_price": 40000,
            "product": {"name": "Produk", "base_price": 50000},
        }]
    )

    drifts = _apply_warehouse_prices(normalized, normalized["lines"])

    assert normalized["lines"][0]["unit_price"] == 50000
    assert normalized["subtotal"] == 100000
    assert normalized["grand_total"] == 100000
    assert normalized["payments"][0]["amount"] == 100000
    assert drifts == [{
        "sku": "SKU-1",
        "name": "Produk",
        "kiosk_price": 40000,
        "warehouse_price": 50000,
    }]


def test_price_decrease_reconciles_last_payment_without_zeroing_a_payment():
    normalized = _normalised(
        [{
            "sku": "SKU-1",
            "name": "Produk",
            "qty": 1,
            "unit_price": 100000,
            "product": {"name": "Produk", "base_price": 90000},
        }],
        subtotal=100000,
        grand_total=100000,
    )
    normalized["payments"] = [
        {"method": "cash", "amount": 50000, "tendered": 50000},
        {"method": "qris", "amount": 50000, "tendered": None},
    ]

    _apply_warehouse_prices(normalized, normalized["lines"])

    assert [payment["amount"] for payment in normalized["payments"]] == [50000, 40000]
    assert sum(payment["amount"] for payment in normalized["payments"]) == 90000


def test_price_increase_lands_on_the_cash_row_not_on_the_card_row():
    """A stale low price must not fabricate a bigger QRIS/card settlement."""
    normalized = _normalised(
        [
            {
                "sku": "SKU-1",
                "name": "Produk",
                "qty": 1,
                "unit_price": 90000,
                "product": {"name": "Produk", "base_price": 100000},
            }
        ],
        subtotal=90000,
        grand_total=90000,
    )
    normalized["payments"] = [
        {"method": "cash", "amount": 40000, "tendered": 40000},
        {"method": "qris", "amount": 50000, "tendered": None},
    ]

    _apply_warehouse_prices(normalized, normalized["lines"])

    assert [p["method"] for p in normalized["payments"]] == ["cash", "qris"]
    assert [p["amount"] for p in normalized["payments"]] == [50000, 50000]
    assert sum(p["amount"] for p in normalized["payments"]) == 100000


def test_card_only_price_increase_is_recorded_for_manual_reconciliation():
    """Decided behaviour (H1): tanpa baris cash, delta penuh jatuh ke baris non-cash
    dan drift dikembalikan agar bisa direkonsiliasi manual saat tutup shift.
    Kalau ini berubah, keputusan bisnisnya harus diambil ulang."""
    normalized = _normalised(
        [{
            "sku": "SKU-1",
            "name": "Produk",
            "qty": 1,
            "unit_price": 90000,
            "product": {"name": "Produk", "base_price": 100000},
        }],
        subtotal=90000,
        grand_total=90000,
    )
    normalized["payments"] = [{"method": "qris", "amount": 90000, "tendered": None}]
    normalized["payment"] = normalized["payments"][0]

    drifts = _apply_warehouse_prices(normalized, normalized["lines"])

    assert normalized["grand_total"] == 100000
    assert [(p["method"], p["amount"]) for p in normalized["payments"]] == [("qris", 100000)]
    assert drifts == [{
        "sku": "SKU-1",
        "name": "Produk",
        "kiosk_price": 90000,
        "warehouse_price": 100000,
    }]


def test_split_cash_price_rise_records_drift_not_fabricated_tender():
    """Kontrak BA: `amount` boleh disesuaikan, `tendered` adalah fakta fisik.

    Kenaikan harga gudang menambah alokasi buku di baris tunai, tetapi uang yang
    benar-benar diterima kasir tidak ikut naik. Selisihnya dicatat eksplisit
    sebagai `tendered_drift` (shortage saat tutup shift), bukan ditutupi dengan
    menaikkan `tendered`.
    """
    normalized = _normalised(
        [{
            "sku": "SKU-1",
            "name": "Produk",
            "qty": 1,
            "unit_price": 90000,
            "product": {"name": "Produk", "base_price": 100000},
        }],
        subtotal=90000,
        grand_total=90000,
    )
    normalized["payments"] = [
        {"method": "cash", "amount": 40000, "tendered": 40000},
        {"method": "qris", "amount": 50000, "tendered": None},
    ]

    _apply_warehouse_prices(normalized, normalized["lines"])

    cash = normalized["payments"][0]
    assert [p["amount"] for p in normalized["payments"]] == [50000, 50000]
    assert sum(p["amount"] for p in normalized["payments"]) == 100000
    assert cash["tendered"] == 40000, "tendered adalah fakta fisik, tidak boleh dikarang"
    assert cash["tendered_drift"] == 10000

    # Baris non-cash tidak boleh ikut menanggung drift tunai.
    assert "tendered_drift" not in normalized["payments"][1]


def test_payment_cannot_be_reconciled_to_non_positive_rows():
    normalized = _normalised(
        [{
            "sku": "SKU-1",
            "name": "Produk",
            "qty": 1,
            "unit_price": 100,
            "product": {"name": "Produk", "base_price": 0},
        }],
        subtotal=100,
        grand_total=100,
    )
    normalized["payments"] = [{"method": "cash", "amount": 100, "tendered": 100}]

    try:
        _apply_warehouse_prices(normalized, normalized["lines"])
    except EdgeSyncError as exc:
        assert "total payment hasil penyesuaian tidak valid" in str(exc)
    else:
        raise AssertionError("expected non-positive payment reconciliation to fail")
