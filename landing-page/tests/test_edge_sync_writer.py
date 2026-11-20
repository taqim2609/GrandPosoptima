"""Hermetic writer tests for edge-sync payment splits."""

import pytest

from app import edge_sync


class RecordingCursor:
    def __init__(self):
        self.executed = []
        self.payment_ids = iter([101, 102])

    def execute(self, sql, params=()):
        self.executed.append((sql, params))

    def fetchone(self):
        sql = self.executed[-1][0]
        if "SELECT id FROM orders WHERE order_number" in sql:
            return None
        if "INSERT INTO orders" in sql:
            return {"id": 55, "order_number": "EDGE-1", "grand_total": 100000}
        if "INSERT INTO order_items" in sql:
            return {"id": 77}
        if "INSERT INTO payments" in sql:
            return {"id": next(self.payment_ids)}
        if "SELECT to_char" in sql:
            return {"d": "20261111"}
        if "SELECT count(*)" in sql:
            return {"n": 0}
        return None

    def fetchall(self):
        return []


def _normalised_product(cur, lines):
    return [
        {
            **line,
            "product": {
                "id": 9,
                "name": "Produk",
                "channel": "retail",
                "base_price": 100000,
                "cost_price": 50000,
                "vendor_id": None,
            },
        }
        for line in lines
    ]


def test_apply_transaction_writes_split_payments_and_cash_only_movement(monkeypatch):
    monkeypatch.setattr(edge_sync, "_resolve_products", _normalised_product)
    monkeypatch.setattr(edge_sync, "_resolve_user", lambda cur, username: 7)
    monkeypatch.setattr(edge_sync, "_resolve_shift", lambda cur: 12)
    monkeypatch.setattr(edge_sync, "_resolve_table", lambda cur, code: None)
    monkeypatch.setattr(edge_sync, "_next_order_number", lambda cur: "EDGE-1")
    cur = RecordingCursor()

    result = edge_sync.apply_transaction(
        cur,
        node_id="node-1",
        payload={
            "client_ref": "split-1",
            "order_type": "retail",
            "total": 100000,
            "items": [{"sku": "SKU-1", "name": "Produk", "type": "retail", "qty": 1, "price": 100000}],
            "payments": [
                {"payment_method": "cash", "amount": 40000, "amount_paid": 50000},
                {"payment_method": "qris", "amount": 60000},
            ],
        },
    )

    payment_rows = [params for sql, params in cur.executed if "INSERT INTO payments" in sql]
    cash_rows = [params for sql, params in cur.executed if "INSERT INTO cash_movements" in sql]
    shift_updates = [params for sql, params in cur.executed if "UPDATE shifts SET cash_sales" in sql]

    assert result["order_id"] == 55
    assert len(payment_rows) == 2
    assert [row[1:4] for row in payment_rows] == [("cash", 40000, 50000), ("qris", 60000, None)]
    assert [row[5] for row in payment_rows] == [0, 0], "tanpa kenaikan harga, drift harus nol"
    assert len(cash_rows) == 1
    assert cash_rows[0][1] == 40000
    assert shift_updates == [(40000, 1, 12)]


def _split_payload(*, item_price: int, cash_amount: int, cash_paid: int) -> dict:
    return {
        "client_ref": "split-2",
        "order_type": "retail",
        "total": 90000,
        "items": [{"sku": "SKU-1", "name": "Produk", "type": "retail", "qty": 1,
                   "price": item_price}],
        "payments": [
            {"payment_method": "cash", "amount": cash_amount, "amount_paid": cash_paid},
            {"payment_method": "qris", "amount": 50000},
        ],
    }


def _run(monkeypatch, payload: dict) -> RecordingCursor:
    monkeypatch.setattr(edge_sync, "_resolve_products", _normalised_product)
    monkeypatch.setattr(edge_sync, "_resolve_user", lambda cur, username: 7)
    monkeypatch.setattr(edge_sync, "_resolve_shift", lambda cur: 12)
    monkeypatch.setattr(edge_sync, "_resolve_table", lambda cur, code: None)
    monkeypatch.setattr(edge_sync, "_next_order_number", lambda cur: "EDGE-1")
    cur = RecordingCursor()
    edge_sync.apply_transaction(cur, node_id="node-1", payload=payload)
    return cur


def test_price_rise_writes_drift_and_never_bumps_tendered(monkeypatch):
    """Kontrak BA di jalur insert: `tendered` tetap 40.000, drift 10.000.

    Gudang menaikkan harga 90.000 -> 100.000, jadi alokasi tunai naik ke 50.000
    sementara kasir hanya menerima 40.000. Nilai itu harus tercatat sebagai
    `tendered_drift`, bukan ditutupi dengan menaikkan `tendered` (yang membuat
    change_due 0 dan menyembunyikan shortage di tutup shift).
    """
    cur = _run(monkeypatch, _split_payload(item_price=90000, cash_amount=40000, cash_paid=40000))

    cash_row = [params for sql, params in cur.executed if "INSERT INTO payments" in sql][0]
    method, amount, tendered, change_due, drift = cash_row[1:6]
    assert (method, amount, tendered) == ("cash", 50000, 40000)
    assert drift == 10000
    assert change_due == 40000 + 10000 - 50000
    assert "tendered_drift" in [s for s, _ in cur.executed if "INSERT INTO payments" in s][0]


def test_cash_shortfall_without_drift_is_rejected_not_invented(monkeypatch):
    """Kas 30.000 untuk alokasi 40.000 tanpa kenaikan harga = data rusak.

    Total pembayaran sudah cocok dengan grand_total, jadi reconciler tidak
    menyentuhnya dan tidak ada drift yang bisa menjelaskan selisih 10.000.
    Baris seperti ini harus ditolak; menaikkan `tendered` akan mengarang uang.
    """
    payload = {
        "client_ref": "short-1",
        "order_type": "retail",
        "total": 100000,
        "items": [{"sku": "SKU-1", "name": "Produk", "type": "retail", "qty": 1,
                   "price": 100000}],
        "payments": [
            {"payment_method": "cash", "amount": 40000, "amount_paid": 30000},
            {"payment_method": "qris", "amount": 60000},
        ],
    }
    with pytest.raises(edge_sync.EdgeSyncError) as exc:
        _run(monkeypatch, payload)
    assert "tendered_drift" in str(exc.value)
