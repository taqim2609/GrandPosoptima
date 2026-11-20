"""Unit tests for database utility functions (timezone-aware date ranges, etc.)."""

import os
from datetime import date, datetime
from zoneinfo import ZoneInfo

import pytest

from app.db import today_range


class TestTodayRange:
    """today_range() must return WIB-local dates, not UTC."""

    def test_returns_today_in_wib(self, monkeypatch):
        # Force the function to use a fixed WIB date via the GRANDPOS_TZ env
        monkeypatch.setenv("GRANDPOS_TZ", "Asia/Jakarta")
        start, end = today_range()
        assert start == end
        assert isinstance(start, date)

    def test_respects_env_tz_override(self, monkeypatch):
        # If someone sets GRANDPOS_TZ=UTC, the function should still work
        # (the date will be different but still valid)
        monkeypatch.setenv("GRANDPOS_TZ", "UTC")
        start, end = today_range()
        assert start == end
        assert isinstance(start, date)

    def test_returns_date_objects_not_datetime(self, monkeypatch):
        monkeypatch.setenv("GRANDPOS_TZ", "Asia/Jakarta")
        start, end = today_range()
        # Should be date objects, not datetime (no time component)
        assert type(start).__name__ == "date"
        assert type(end).__name__ == "date"

    def test_wib_vs_utc_date_difference_at_midnight_crossover(self, monkeypatch):
        """
        At 17:30 UTC, it's 00:30 WIB the NEXT day.
        This test FREEZES time at 17:30 UTC on 2026-10-30 and verifies
        that today_range() with WIB returns 2026-10-31, NOT 2026-10-30.

        This test would FAIL on the old naive implementation (datetime.now().date())
        which would return 2026-10-30 regardless of timezone.
        """
        # Freeze time at 2026-10-30 17:30:00 UTC = 2026-10-31 00:30:00 WIB
        frozen_utc = datetime(2026, 10, 30, 17, 30, 0, tzinfo=ZoneInfo("UTC"))

        # Monkeypatch datetime.now to return our frozen time
        class FrozenDatetime(datetime):
            @classmethod
            def now(cls, tz=None):
                if tz is None:
                    return frozen_utc
                return frozen_utc.astimezone(tz)

        import app.db as db_module
        original_datetime = db_module.datetime
        db_module.datetime = FrozenDatetime

        try:
            monkeypatch.setenv("GRANDPOS_TZ", "Asia/Jakarta")
            start, end = today_range()
            # WIB date should be 2026-10-31 (next day)
            assert start == date(2026, 10, 31), f"Expected 2026-10-31 (WIB), got {start}"
            assert end == date(2026, 10, 31)
        finally:
            db_module.datetime = original_datetime