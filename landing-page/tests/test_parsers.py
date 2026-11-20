"""Unit tests for the deterministic zero-LLM WhatsApp parsers."""

from datetime import date

import pytest

from app.parsers import Command, ReservationRequest, Unrecognised, parse_command, parse_reservation

TODAY = date(2026, 10, 16)


class TestSlashCommands:
    def test_stok_maps_to_low_stock_endpoint(self):
        result = parse_command("/stok")
        assert isinstance(result, Command)
        assert result.name == "/stok"
        assert result.endpoint == "/reports/low-stock"

    def test_laporan_shift_maps_to_active_shift_summary(self):
        result = parse_command("/laporan-shift")
        assert isinstance(result, Command)
        assert result.endpoint == "/shifts/active/summary"

    def test_dashboard_maps_to_dashboard_endpoint(self):
        result = parse_command("/dashboard")
        assert isinstance(result, Command)
        assert result.endpoint == "/reports/dashboard"

    def test_commands_are_case_insensitive_and_trimmed(self):
        result = parse_command("  /STOK  ")
        assert isinstance(result, Command)
        assert result.name == "/stok"

    def test_stok_with_argument_is_not_a_command(self):
        # Guessing intent here would be unsafe; it becomes conversational traffic.
        assert isinstance(parse_command("/stok semua"), Unrecognised)

    def test_unknown_slash_command_is_unrecognised(self):
        assert isinstance(parse_command("/hapus-semua"), Unrecognised)

    def test_empty_message_is_unrecognised(self):
        result = parse_command("   ")
        assert isinstance(result, Unrecognised)
        assert result.raw == ""

    def test_free_text_is_unrecognised(self):
        assert isinstance(parse_command("halo kak, buka jam berapa?"), Unrecognised)

    def test_command_carries_zero_token_marker(self):
        assert parse_command("/stok").is_command is True
        assert parse_command("halo").is_command is False


class TestReservation:
    def test_iso_date_form(self):
        result = parse_reservation("Budi/2026-10-20/19.30/4", today=TODAY)
        assert isinstance(result, ReservationRequest)
        assert result.customer_name == "Budi"
        assert result.reserved_date == date(2026, 10, 20)
        assert (result.hour, result.minute) == (19, 30)
        assert result.party_size == 4

    def test_indonesian_month_name(self):
        result = parse_reservation("Cut Nyak/Okt 25/19:00/6", today=TODAY)
        assert isinstance(result, ReservationRequest)
        assert result.reserved_date == date(2026, 10, 25)

    def test_day_first_month_name(self):
        result = parse_reservation("Cut Nyak/25 Okt/19:00/6", today=TODAY)
        assert isinstance(result, ReservationRequest)
        assert result.reserved_date == date(2026, 10, 25)

    def test_tomorrow_keyword(self):
        result = parse_reservation("Teuku/besok/12.00/2", today=TODAY)
        assert isinstance(result, ReservationRequest)
        assert result.reserved_date == date(2026, 10, 17)

    def test_hari_ini_keyword(self):
        result = parse_reservation("Ani/hari ini/20.00/10", today=TODAY)
        assert isinstance(result, ReservationRequest)
        assert result.reserved_date == TODAY

    def test_multi_word_name_is_joined(self):
        result = parse_reservation("Cut Nyak Dhien/2026-11-01/18.00/5", today=TODAY)
        assert isinstance(result, ReservationRequest)
        assert result.customer_name == "Cut Nyak Dhien"

    def test_date_without_year_rolls_forward(self):
        # `/` separates the fields, so a year-less day/month uses `-` or `.`.
        result = parse_reservation("Budi/5-1/10.00/3", today=date(2026, 3, 1))
        assert isinstance(result, ReservationRequest)
        # 5 Jan already passed this year, so it rolls to next year.
        assert result.reserved_date == date(2027, 1, 5)

    def test_date_without_year_keeps_current_year_when_future(self):
        result = parse_reservation("Budi/5-12/10.00/3", today=date(2026, 3, 1))
        assert isinstance(result, ReservationRequest)
        assert result.reserved_date == date(2026, 12, 5)

    def test_hash_reservasi_prefix_accepted(self):
        result = parse_command("#reservasi Budi/2026-10-20/19.30/4", today=TODAY)
        assert isinstance(result, ReservationRequest)

    @pytest.mark.parametrize(
        "payload",
        [
            "Budi/2026-10-20/19.30",           # missing party size
            "Budi/2026-10-20//4",              # missing time
            "/2026-10-20/19.30/4",             # missing name
            "Budi/2026-10-20/25.00/4",         # hour out of range
            "Budi/2026-10-20/19.70/4",         # minute out of range
            "Budi/2026-10-20/19.30/0",         # zero guests
            "Budi/2026-10-20/19.30/9999",      # absurd party size
            "Budi/2026-10-20/19.30/4",         # (control: valid, see below)
        ][:-1],
    )
    def test_invalid_reservations_are_rejected(self, payload):
        assert isinstance(parse_reservation(payload, today=TODAY), Unrecognised)

    def test_valid_control_case_is_accepted(self):
        assert isinstance(
            parse_reservation("Budi/2026-10-20/19.30/4", today=TODAY), ReservationRequest
        )

    def test_bare_hash_reservasi_is_unrecognised(self):
        assert isinstance(parse_command("#reservasi"), Unrecognised)

    def test_reservation_never_claims_to_be_free_text(self):
        result = parse_reservation("Budi/2026-10-20/19.30/4", today=TODAY)
        assert result.is_command is True
