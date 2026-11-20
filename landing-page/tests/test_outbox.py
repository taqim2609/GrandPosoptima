"""Unit tests for outbox payloads (receipt + shift recap): content and math."""

import pytest

from app.outbox import receipt_payload, reservation_confirm_payload, shift_recap_payload


def _receipt():
    return receipt_payload(
        order_number="GAK-20261016-0001",
        customer_name="Budi",
        channel="fnb",
        order_type="dine_in",
        items=[
            {"product_name": "Mie Aceh", "qty": 2, "unit_price": 38000, "line_total": 76000},
            {"product_name": "Ayam Tangkap Kiloan", "qty": 0.35, "unit_price": 120000,
             "line_total": 42000, "is_weighted": True},
        ],
        subtotal=118000,
        discount_total=10000,
        service_total=0,
        tax_total=0,
        grand_total=108000,
        paid_total=108000,
        payments=[{"method": "cash", "amount": 108000, "change_due": 2000}],
        points_earned=108,
        member_code="MBR-0001",
        business_time="2026-10-16 19:30 WIB",
    )


class TestReceipt:
    def test_totals_are_carried_verbatim(self):
        payload = _receipt()
        assert payload["event"] == "receipt"
        assert payload["totals"] == {
            "subtotal": 118000, "discount_total": 10000, "service_total": 0,
            "tax_total": 0, "grand_total": 108000, "paid_total": 108000,
        }

    def test_text_renders_rupiah_without_decimals(self):
        payload = _receipt()
        assert "Rp 108.000" in payload["text"]
        assert "GAK-20261016-0001" in payload["text"]
        assert "Poin diperoleh: 108" in payload["text"]

    def test_weights_flagged_per_line(self):
        payload = _receipt()
        by_name = {i["name"]: i for i in payload["items"]}
        assert by_name["Ayam Tangkap Kiloan"]["weighted"] is True
        assert by_name["Mie Aceh"]["weighted"] is False

    def test_change_is_included(self):
        payload = _receipt()
        assert payload["payments"][0]["change_due"] == 2000

    def test_tendered_drift_reaches_the_receipt_payload(self):
        """Shortage kas harus ikut ke struk/analitik; 0 bila tidak ada drift."""
        payload = receipt_payload(
            order_number="GAK-20261016-0002",
            customer_name=None,
            channel="retail",
            order_type="retail",
            items=[],
            subtotal=50000,
            discount_total=0,
            service_total=0,
            tax_total=0,
            grand_total=50000,
            paid_total=50000,
            payments=[
                {"method": "cash", "amount": 50000, "change_due": 0, "tendered_drift": 10000},
                {"method": "qris", "amount": 50000, "change_due": 0},
            ],
        )
        assert [p["tendered_drift"] for p in payload["payments"]] == [10000, 0]

    def test_no_points_means_no_points_line(self):
        payload = _receipt()
        payload["points_earned"] = 0
        text_without = receipt_payload(
            order_number="X", customer_name=None, channel="fnb", order_type="takeaway",
            items=[], subtotal=0, discount_total=0, service_total=0, tax_total=0,
            grand_total=15000, paid_total=15000, payments=[],
        )["text"]
        assert "Poin" not in text_without


class TestShiftRecap:
    def _recap(self, variance):
        counted = 1550000 if variance is not None else None
        return shift_recap_payload(
            shift_code="SHIFT-20261016-PAGI",
            status="closed",
            opened_at="2026-10-16 08:00 WIB",
            closed_at="2026-10-16 16:00 WIB",
            opening_float=500000,
            cash_sales=1200000,
            non_cash_sales=300000,
            cash_in_total=200000,
            cash_out_total=50000,
            vendor_cash_total=300000,
            expected_cash=1550000,
            counted_cash=counted,
            variance=variance,
            order_count=42,
            void_count=1,
            settlements=[{"vendor_name": "Mitra Kue Aceh", "vendor_amount": 60000, "status": "paid"}],
        )

    def test_balanced_shift_is_marked_sesuai(self):
        payload = self._recap(0)
        assert payload["cash"]["variance_note"] == "SESUAI"
        assert "SESUAI" in payload["text"]

    def test_short_shift_is_marked_kurang(self):
        payload = self._recap(-10000)
        assert payload["cash"]["variance_note"] == "KURANG"
        assert "Rp 10.000 (KURANG)" in payload["text"]

    def test_missing_count_marks_belum_dihitung(self):
        payload = self._recap(None)
        assert payload["cash"]["variance_note"] == "BELUM DIHITUNG"

    def test_settlements_are_carried(self):
        payload = self._recap(0)
        assert payload["vendor_settlements"][0]["vendor_amount"] == 60000


class TestReservationConfirm:
    def test_table_part_is_optional(self):
        with_table = reservation_confirm_payload(
            code="RSV-001", customer_name="Budi", reserved_date="2026-10-20",
            reserved_time="19:30", party_size=4, table_code="T03",
        )
        assert "Meja T03" in with_table["text"]
        without_table = reservation_confirm_payload(
            code="RSV-002", customer_name="Ani", reserved_date="2026-10-20",
            reserved_time="12:00", party_size=2, table_code=None,
        )
        assert "Meja" not in without_table["text"]

    def test_unknown_event_rejected(self):
        with pytest.raises(ValueError):
            receipt_payload(
                order_number="X", customer_name=None, channel="fnb", order_type="takeaway",
                items=[], subtotal=0, discount_total=0, service_total=0, tax_total=0,
                grand_total=0, paid_total=0, payments=[],
            )
            from app import outbox as _o
            _o._require_event("bogus")
