"""Unit tests for GrandPOS business rules (money, weights, discounts, cash)."""

from decimal import Decimal

import pytest

from app.constants import ORDER_STATUSES
from app.rules import (
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


class TestWeightedPricing:
    """price = weight x base price with deterministic rounding."""

    def test_round_numbers_are_exact(self):
        assert weighted_line_total("0.250", 120000) == 30000

    def test_half_rounds_up_not_to_even(self):
        # 0.0005 kg * 1000 IDR = 0.5 IDR -> 1 (HALF_UP), never 0
        assert weighted_line_total("0.0005", 1000) == 1

    def test_classic_float_trap_is_avoided(self):
        # 2.675 * 1000 is 2674.999... in binary float; Decimal gives 2675
        assert weighted_line_total("2.675", 1000) == 2675

    def test_rejects_float_input(self):
        with pytest.raises(ValueError):
            weighted_line_total(0.25, 120000)  # type: ignore[arg-type]

    def test_rejects_zero_and_negative_weight(self):
        with pytest.raises(ValueError):
            quantize_weight("0")
        with pytest.raises(ValueError):
            weighted_line_total("-1", 1000)

    def test_rejects_negative_base_price(self):
        with pytest.raises(ValueError):
            weighted_line_total("0.5", -1)

    def test_round_idr_is_half_up(self):
        assert round_idr(Decimal("10.5")) == 11
        assert round_idr(Decimal("10.4")) == 10


class TestOutletDiscount:
    """Discount cuts revenue only; it must never touch COGS/vendor base."""

    def test_percent_below_minimum_returns_zero(self):
        assert compute_promo_discount(kind="percent", value=10, subtotal=50000, min_subtotal=100000) == 0

    def test_percent_is_floor_division(self):
        assert compute_promo_discount(kind="percent", value=10, subtotal=100001) == 10000

    def test_percent_rounds_half_up_not_truncation(self):
        # (100050 * 33) / 100 = 33016.5 -> ROUND_HALF_UP = 33017,
        # old truncation (// 100) would give 33016. R-04 found this mismatch
        # vs SQL ROUND() semantics in the paid path.
        assert compute_promo_discount(kind="percent", value=33, subtotal=100050) == 33017
        # 100055 * 33 / 100 = 33018.15 -> rounds to 33018 either way
        assert compute_promo_discount(kind="percent", value=33, subtotal=100055) == 33018

    def test_max_discount_caps_percent(self):
        got = compute_promo_discount(kind="percent", value=10, subtotal=1000000, max_discount=25000)
        assert got == 25000

    def test_amount_is_capped_at_subtotal(self):
        assert compute_promo_discount(kind="amount", value=50000, subtotal=20000) == 20000

    def test_commission_base_is_pre_discount(self):
        subtotal = 100000
        discount = compute_promo_discount(kind="percent", value=10, subtotal=subtotal)
        revenue = subtotal - discount
        vendor = vendor_share_amount(commission_base=subtotal, share_percent=Decimal("20"))
        assert discount == 10000
        assert revenue == 90000
        # Vendor base stayed at the pre-discount subtotal.
        assert vendor == 20000

    def test_rejects_bad_kind_and_percent(self):
        with pytest.raises(ValueError):
            compute_promo_discount(kind="bogus", value=1, subtotal=1000)
        with pytest.raises(ValueError):
            compute_promo_discount(kind="percent", value=101, subtotal=1000)


class TestVendorShare:
    def test_share_amount_rounds_half_up(self):
        assert vendor_share_amount(33333, Decimal("15")) == 5000

    def test_zero_share_is_allowed(self):
        assert vendor_share_amount(50000, Decimal("0")) == 0

    def test_rejects_out_of_range(self):
        with pytest.raises(ValueError):
            vendor_share_amount(1000, Decimal("101"))
        with pytest.raises(ValueError):
            vendor_share_amount(-1, Decimal("10"))


class TestShiftReconciliation:
    def test_expected_cash_formula(self):
        # opening 500000 + cash sales 1200000 + in 200000 - out 50000 - vendor 300000
        assert expected_cash(500000, 1200000, 200000, 50000, 300000) == 1550000

    def test_zero_traffic_returns_opening_float(self):
        assert expected_cash(300000, 0, 0, 0, 0) == 300000

    def test_variance_is_counted_minus_expected(self):
        expected = expected_cash(500000, 1200000, 0, 0, 0)
        counted = 1690000
        assert counted - expected == -10000  # cash short

    def test_rejects_negative_inputs(self):
        with pytest.raises(ValueError):
            expected_cash(-1, 0, 0, 0, 0)


class TestPoints:
    def test_points_only_on_net_total(self):
        assert points_earned(0) == 0
        assert points_earned(999) == 0

    def test_points_floor_per_thousand(self):
        assert points_earned(1500) == 1
        assert points_earned(1900) == 1

    def test_points_on_exact_multiple(self):
        assert points_earned(90000) == 90

    def test_rejects_negative(self):
        with pytest.raises(ValueError):
            points_earned(-1)


class TestChannelSeparation:
    def test_dine_in_requires_table_and_fnb_product(self):
        assert validate_order_channel("dine_in", 3, "fnb") == "fnb"

    def test_retail_rejects_fnb_product(self):
        with pytest.raises(ValueError):
            validate_order_channel("retail", None, "fnb")

    def test_dine_in_without_table_is_rejected(self):
        with pytest.raises(ValueError):
            validate_order_channel("dine_in", None, "fnb")

    def test_takeaway_must_not_carry_a_table(self):
        with pytest.raises(ValueError):
            validate_order_channel("takeaway", 2, "fnb")

    def test_takeaway_accepts_fnb(self):
        assert validate_order_channel("takeaway", None, "fnb") == "fnb"

    def test_retail_accepts_retail(self):
        assert validate_order_channel("retail", None, "retail") == "retail"


class TestPayment:
    def test_cash_change_is_exact_integer(self):
        assert validate_payment("cash", 38000, 50000) == 12000

    def test_cash_exact_tender_gives_zero_change(self):
        assert validate_payment("cash", 38000, 38000) == 0

    def test_cash_underpaid_is_rejected(self):
        with pytest.raises(ValueError):
            validate_payment("cash", 38000, 37000)

    def test_non_cash_needs_no_tender(self):
        assert validate_payment("qris", 38000, None) == 0

    def test_unknown_method_is_rejected(self):
        with pytest.raises(ValueError):
            validate_payment("bitcoin", 1000, None)

    def test_non_positive_amount_is_rejected(self):
        with pytest.raises(ValueError):
            validate_payment("qris", 0, None)


class TestOrderStatusVocabulary:
    """FIX-A/R-03-001: the order status enum must cover every status both
    backends can emit, otherwise P1A (Express) -> P1B (FastAPI) sync drops
    rows whose status the receiving side has never heard of."""

    def test_legacy_pg_statuses_are_present(self):
        for status in ("open", "paid", "void"):
            assert status in ORDER_STATUSES

    def test_express_aliases_are_present(self):
        # Express emits open_bill/completed/cancelled/pending in addition to
        # the PostgreSQL trio; missing entries used to make sync fail 1:1.
        for status in ("open_bill", "completed", "cancelled", "pending"):
            assert status in ORDER_STATUSES

    def test_vocabulary_has_no_duplicates(self):
        assert len(set(ORDER_STATUSES)) == len(ORDER_STATUSES)
