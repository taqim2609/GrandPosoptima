"""Deterministic parsers for the zero-LLM WhatsApp command surface.

Pure functions only: no I/O, no LLM, no side effects. The Baileys service calls
these to turn an inbound message into an allowlisted API action, so an
allowlisted cashier number costs exactly zero tokens.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import date, datetime, timedelta

from .db import business_today
from .rules import reservation_slot_ok

_WS = re.compile(r"\s+")
_SLASH = re.compile(r"^/(stok|laporan-shift|dashboard)\b\s*(.*)$", re.IGNORECASE)
_RESERVASI = re.compile(r"^#reservasi\b(.*)$", re.IGNORECASE)
_DATE_FORMATS = ("%Y-%m-%d", "%d-%m-%Y", "%d/%m/%Y", "%d %m %Y")

MONTHS_ID = {
    "jan": 1, "januari": 1, "feb": 2, "februari": 2, "mar": 3, "maret": 3,
    "apr": 4, "april": 4, "mei": 5, "jun": 6, "juni": 6, "jul": 7, "juli": 7,
    "agu": 8, "agustus": 8, "aug": 8, "sep": 9, "september": 9, "okt": 10,
    "oktober": 10, "nov": 11, "november": 11, "des": 12, "desember": 12,
}

TODAY_WORDS = ("hari ini", "today", "skrg", "sekarang")
TOMORROW_WORDS = ("besok", "tomorrow", "esok")


@dataclass(frozen=True)
class Command:
    """A recognised zero-token command and the allowlisted endpoint to call."""

    name: str
    endpoint: str
    args: tuple[str, ...] = ()

    @property
    def is_command(self) -> bool:
        return True


@dataclass(frozen=True)
class ReservationRequest:
    customer_name: str
    reserved_date: date
    hour: int
    minute: int
    party_size: int

    @property
    def is_command(self) -> bool:
        return True


@dataclass(frozen=True)
class Unrecognised:
    """Not a command: forward to the Hermes profile for conversational handling."""

    raw: str

    @property
    def is_command(self) -> bool:
        return False


def _normalise(text: str) -> str:
    return _WS.sub(" ", (text or "").strip())


def parse_command(text: str, *, today: date | None = None) -> Command | ReservationRequest | Unrecognised:
    """Parse an inbound WhatsApp message with zero LLM involvement."""
    cleaned = _normalise(text)
    if not cleaned:
        return Unrecognised("")

    slash = _SLASH.match(cleaned)
    if slash:
        name = "/" + slash.group(1).lower()
        rest = _WS.sub(" ", slash.group(2)).strip()
        args: tuple[str, ...] = ()
        if name == "/laporan-shift" and rest:
            # Only a bare argument set is accepted; anything else is a hint we
            # should not guess about, so it becomes conversational traffic.
            if re.fullmatch(r"[A-Za-z0-9\- ]{1,32}", rest):
                args = (rest,)
            else:
                return Unrecognised(cleaned)
        elif name in ("/stok", "/dashboard") and rest:
            return Unrecognised(cleaned)
        return Command(name=name, endpoint=_endpoint_for(name), args=args)

    res = _RESERVASI.match(cleaned)
    if res:
        return parse_reservation(res.group(1), today=today)

    return Unrecognised(cleaned)


def _endpoint_for(name: str) -> str:
    return {
        "/stok": "/reports/low-stock",
        "/laporan-shift": "/shifts/active/summary",
        "/dashboard": "/reports/dashboard",
    }[name]


def parse_reservation(payload: str, *, today: date | None = None) -> ReservationRequest | Unrecognised:
    """Parse `Nama/Tgl/Jam/JumlahOrang` (Date/Time are flexible, ID or ISO)."""
    today = today or business_today()
    body = payload.strip(" /|,")
    if not body:
        return Unrecognised("#reservasi")

    parts = [p.strip() for p in re.split(r"[/|,]", body) if p.strip()]
    if len(parts) < 3:
        return Unrecognised(f"#reservasi {body}")

    party_size = _parse_party_size(parts[-1])
    reserved_time = _parse_time(parts[-2])
    reserved_date = _parse_date(parts[-3], today)
    name = " ".join(parts[:-3]).strip()
    if not name or len(name) > 80:
        return Unrecognised(f"#reservasi {body}")
    if party_size is None or reserved_time is None or reserved_date is None:
        return Unrecognised(f"#reservasi {body}")

    hour, minute = reserved_time
    try:
        reservation_slot_ok(reserved_date, hour, minute, party_size)
    except ValueError:
        return Unrecognised(f"#reservasi {body}")

    return ReservationRequest(
        customer_name=name,
        reserved_date=reserved_date,
        hour=hour,
        minute=minute,
        party_size=party_size,
    )


def _parse_party_size(token: str) -> int | None:
    digits = re.sub(r"[^\d]", "", token)
    if not digits or len(digits) > 3:
        return None
    value = int(digits)
    return value if 0 < value <= 500 else None


def _parse_time(token: str) -> tuple[int, int] | None:
    t = token.lower().replace("wib", "").replace(":", ".").strip()
    m = re.fullmatch(r"(\d{1,2})[.\s]?(\d{2})?", t)
    if not m:
        return None
    hour = int(m.group(1))
    minute = int(m.group(2) or 0)
    if 0 <= hour <= 23 and 0 <= minute <= 59:
        return hour, minute
    return None


DIGIT_MONTH_FORMATS = ("%d-%m", "%d/%m", "%d %m")


def _parse_date(token: str, today: date) -> date | None:
    t = token.strip().lower()
    if t in TODAY_WORDS:
        return today
    if t in TOMORROW_WORDS:
        return today + timedelta(days=1)

    for fmt in _DATE_FORMATS:
        try:
            return datetime.strptime(t, fmt).date()
        except ValueError:
            continue

    # Day/month without a year -> this year, rolling forward when already past.
    for fmt in DIGIT_MONTH_FORMATS:
        try:
            parsed = datetime.strptime(t, fmt).date()
        except ValueError:
            continue
        candidate = parsed.replace(year=today.year)
        if candidate < today:
            try:
                candidate = parsed.replace(year=today.year + 1)
            except ValueError:
                return None
        return candidate

    m = re.fullmatch(r"(\d{1,2})\s+([a-z]+)(?:\s+(\d{4}))?", t)
    resolved = _resolve_named_month(m, today, day_first=True)
    if resolved is not None:
        return resolved
    m2 = re.fullmatch(r"([a-z]+)\s+(\d{1,2})(?:\s+(\d{4}))?", t)
    return _resolve_named_month(m2, today, day_first=False)


def _resolve_named_month(m: re.Match | None, today: date, *, day_first: bool) -> date | None:
    if not m:
        return None
    day = int(m.group(1) if day_first else m.group(2))
    name = m.group(2) if day_first else m.group(1)
    month = MONTHS_ID.get(name) or MONTHS_ID.get(name[:9]) or MONTHS_ID.get(name[:3])
    if not month:
        return None
    year_token = m.group(3)
    year = int(year_token) if year_token else today.year
    try:
        candidate = date(year, month, day)
    except ValueError:
        return None
    if not m.group(3):
        try:
            if candidate < today:
                candidate = date(year + 1, month, day)
        except ValueError:
            return None
    return candidate
