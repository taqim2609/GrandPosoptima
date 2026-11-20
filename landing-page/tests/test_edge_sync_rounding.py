"""Regression tests for edge-sync money rounding."""

from decimal import Decimal

from app.edge_sync import ROUND_HALF_UP


def _round_idr(value: Decimal) -> int:
    return int(value.quantize(Decimal("1"), rounding=ROUND_HALF_UP))


def test_half_idr_rounds_up_for_line_totals():
    assert _round_idr(Decimal("2500.5")) == 2501


def test_negative_half_idr_rounds_away_from_zero():
    assert _round_idr(Decimal("-2500.5")) == -2501
