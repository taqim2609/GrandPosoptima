"""Allowlist, rate limiting and privacy-safe logging for the WhatsApp gateway.

Design rules enforced here:
  * only explicitly allowlisted phone numbers may use the zero-token commands;
  * WhatsApp JIDs are normalised before comparison so device suffixes cannot
    smuggle a caller past the allowlist;
  * log records never contain message bodies, secrets, or full phone numbers.
"""

from __future__ import annotations

import hashlib
import json
import logging
import re
import time
from dataclasses import dataclass, field
from typing import Iterable

_PHONE = re.compile(r"^\d{8,15}$")
JID_SUFFIXES = ("@s.whatsapp.net", "@c.us", "@g.us", "@lid")


class NotAllowedError(Exception):
    """Sender is not allowlisted."""


class RateLimitedError(Exception):
    """Sender exceeded the configured command rate."""


def normalise_phone(raw: str) -> str:
    """`62811xxxx@s.whatsapp.net:12` -> `62811xxxx`. Digits only, ID-normalised."""
    if raw is None:
        raise NotAllowedError("empty sender")
    value = str(raw).strip()
    for suffix in JID_SUFFIXES:
        if suffix in value:
            value = value.split(suffix, 1)[0]
            break
    value = value.split(":", 1)[0]
    value = re.sub(r"[^\d+]", "", value)
    if value.startswith("+"):
        value = value[1:]
    if value.startswith("0"):
        value = "62" + value[1:]
    if not _PHONE.match(value):
        raise NotAllowedError("unparseable sender")
    return value


def jid_for(phone: str) -> str:
    return f"{normalise_phone(phone)}@s.whatsapp.net"


def mask_phone(phone: str) -> str:
    """Stable, non-reversible-enough log token: `62811***01`."""
    digits = normalise_phone(phone)
    if len(digits) <= 6:
        return "*" * len(digits)
    return f"{digits[:5]}***{digits[-2:]}"


@dataclass
class RateLimiter:
    """Fixed-window per-sender limiter (per-minute by default)."""

    limit_per_minute: int = 20
    window_seconds: int = 60
    _hits: dict[str, tuple[int, int]] = field(default_factory=dict)

    def check(self, sender: str, *, now: int | None = None) -> None:
        current = int(now if now is not None else time.time())
        window = current // self.window_seconds
        key = normalise_phone(sender)
        recorded_window, count = self._hits.get(key, (window, 0))
        if recorded_window != window:
            recorded_window, count = window, 0
        if count >= self.limit_per_minute:
            raise RateLimitedError("rate limit exceeded")
        self._hits[key] = (recorded_window, count + 1)

    def retry_after(self, sender: str, *, now: int | None = None) -> int:
        current = int(now if now is not None else time.time())
        return self.window_seconds - (current % self.window_seconds)


@dataclass(frozen=True)
class Allowlist:
    numbers: frozenset[str]
    owner: str | None = None

    @classmethod
    def from_env(cls, raw: str, owner: str | None = None) -> "Allowlist":
        parsed = {normalise_phone(n) for n in (raw or "").split(",") if n.strip()}
        owner_norm = normalise_phone(owner) if owner else None
        if owner_norm:
            parsed.add(owner_norm)
        return cls(numbers=frozenset(parsed), owner=owner_norm)

    def allows(self, sender: str) -> bool:
        try:
            return normalise_phone(sender) in self.numbers
        except NotAllowedError:
            return False

    def require(self, sender: str) -> str:
        normalised = normalise_phone(sender)
        if normalised not in self.numbers:
            raise NotAllowedError("sender not allowlisted")
        return normalised

    def is_owner(self, sender: str) -> bool:
        if not self.owner:
            return False
        try:
            return normalise_phone(sender) == self.owner
        except NotAllowedError:
            return False


def dedupe_key(*parts: object) -> str:
    """Stable dedupe/idempotency key without leaking the inputs."""
    joined = "|".join(str(p) for p in parts)
    return hashlib.sha256(joined.encode("utf-8")).hexdigest()[:40]


# ---------------------------------------------------------------------------
# Degraded / offline mode.
#
# During offline periods cash-out and shift close are BLOCKED so cash
# reconciliation cannot drift; cash sales (orders/pay/void, cash-in) continue.
# Resolution lives in ONE helper so it is unit-testable. Guards themselves
# live in the API layer (app/api.py), never inside services.py math.
# ---------------------------------------------------------------------------

OFFLINE_BLOCK_MESSAGE = "Tutup shift diblokir saat offline; selesaikan sinkronisasi dulu"

CONNECTIVITY_HEADER = "X-Terminal-Connectivity"

ONLINE_OPERATIONS = (
    "orders.create",
    "orders.pay",
    "orders.void",
    "cash_movements.in",
    "cash_movements.out",
    "shifts.close",
)

OFFLINE_OPERATIONS = (
    "orders.create",
    "orders.pay",
    "orders.void",
    "cash_movements.in",
)

_OFFLINE_ENV_VALUES = frozenset({"1", "true", "yes", "y", "on", "offline"})


def offline_mode_from_env() -> bool:
    """Server-side degraded signal: env/setting `OFFLINE_MODE` (default false)."""
    import os

    return os.environ.get("OFFLINE_MODE", "").strip().lower() in _OFFLINE_ENV_VALUES


def normalise_connectivity_header(raw: str | None) -> str | None:
    """`X-Terminal-Connectivity: online|offline` -> normalised mode or None."""
    if raw is None:
        return None
    value = str(raw).strip().lower()
    if value in {"online", "offline"}:
        return value
    return None


def resolve_connectivity(header_value: str | None = None) -> dict:
    """Effective connectivity mode.

    Offline wins from either side: env/setting says offline OR the calling
    terminal's header says offline. Env can never be overridden back to
    online by a header -- the server signal is authoritative for blocking.
    """
    import os

    env_raw = os.environ.get("OFFLINE_MODE")
    env_set = env_raw is not None and str(env_raw).strip() != ""
    env_offline = offline_mode_from_env()
    header_mode = normalise_connectivity_header(header_value)
    if env_offline:
        mode, source = "offline", "env"
    elif header_mode == "offline":
        mode, source = "offline", "header"
    elif env_set:
        mode, source = "online", "env"
    elif header_mode == "online":
        mode, source = "online", "header"
    else:
        mode, source = "online", "default"
    operations = list(OFFLINE_OPERATIONS if mode == "offline" else ONLINE_OPERATIONS)
    return {"mode": mode, "source": source, "allowed_operations": operations}


def is_offline(header_value: str | None = None) -> bool:
    """True when the effective mode blocks close-shift and cash-out."""
    return resolve_connectivity(header_value)["mode"] == "offline"


class SafeLogger:
    """Log envelope wrapper that scrubs bodies and secrets.

    Only metadata is emitted: event name, masked sender, command name, latency,
    outcome. Message text never reaches the log stream.
    """

    def __init__(self, logger: logging.Logger | None = None) -> None:
        self._log = logger or logging.getLogger("grandpos.gateway")

    def event(self, name: str, **fields: object) -> None:
        record = {"event": name}
        for key, value in fields.items():
            if key in {"sender", "phone", "recipient", "to", "from"} and value:
                try:
                    record[key] = mask_phone(str(value))
                    continue
                except NotAllowedError:
                    record[key] = "invalid"
                    continue
            if key in {"body", "message", "text", "secret", "token", "authorization"}:
                # Never log payload content or credentials.
                continue
            if isinstance(value, (str, int, float, bool)) or value is None:
                record[key] = value
            else:
                record[key] = str(value)[:64]
        self._log.info(json.dumps(record, ensure_ascii=False, sort_keys=True))
