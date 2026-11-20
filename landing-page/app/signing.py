"""HMAC-SHA256 signing and verification for the GrandPOS WhatsApp outbox.

The POS signs outbound webhook bodies; Hermes verifies them with the shared
secret. The WhatsApp gateway verifies the POS->gateway hop the same way.
No secret is ever logged: only fingerprints.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import time
from dataclasses import dataclass
from typing import Mapping

DEFAULT_TOLERANCE_SECONDS = 300
_MAX_CLOCK_SKEW_FUTURE = 60


class SignatureError(Exception):
    """Raised when an outbound/inbound webhook body fails verification."""


def canonical_body(payload: dict) -> bytes:
    """Deterministic JSON: sorted keys, compact separators, UTF-8."""
    return json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")


def sign(payload: dict, secret: str, *, timestamp: int | None = None) -> tuple[str, int]:
    """Sign a payload. Returns (hex_digest, timestamp)."""
    if not secret:
        raise SignatureError("missing HMAC secret")
    ts = int(timestamp if timestamp is not None else time.time())
    signed = f"{ts}.".encode("ascii") + canonical_body(payload)
    digest = hmac.new(secret.encode("utf-8"), signed, hashlib.sha256).hexdigest()
    return digest, ts


def signature_header(digest: str) -> str:
    return f"sha256={digest}"


def parse_signature_header(header: str) -> str:
    """Accept `sha256=<hex>` (Hermes/GitHub style) or a bare hex digest."""
    if not header:
        raise SignatureError("missing signature header")
    value = header.strip()
    if value.startswith("sha256="):
        value = value[len("sha256="):]
    if len(value) != 64 or any(c not in "0123456789abcdefABCDEF" for c in value):
        raise SignatureError("malformed signature")
    return value.lower()


def verify(
    payload: dict,
    secret: str,
    header: str,
    timestamp: int | str,
    *,
    tolerance_seconds: int = DEFAULT_TOLERANCE_SECONDS,
    now: int | None = None,
) -> None:
    """Verify signature and replay window. Raises SignatureError on failure."""
    if not secret:
        raise SignatureError("missing HMAC secret")
    try:
        ts = int(timestamp)
    except (TypeError, ValueError) as exc:
        raise SignatureError("missing or invalid timestamp") from exc

    current = int(now if now is not None else time.time())
    if ts > current + _MAX_CLOCK_SKEW_FUTURE:
        raise SignatureError("timestamp in the future")
    if current - ts > tolerance_seconds:
        raise SignatureError("timestamp outside tolerance window")

    provided = parse_signature_header(header)
    signed = f"{ts}.".encode("ascii") + canonical_body(payload)
    expected = hmac.new(secret.encode("utf-8"), signed, hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, provided):
        raise SignatureError("signature mismatch")


def secret_fingerprint(secret: str) -> str:
    """Safe-to-log identifier for a secret; never the secret itself."""
    if not secret:
        return "none"
    return hashlib.sha256(secret.encode("utf-8")).hexdigest()[:12]


@dataclass(frozen=True)
class ReplayGuard:
    """In-memory replay guard keyed by dedupe key + signature digest."""

    def __init__(self) -> None:
        object.__setattr__(self, "_seen", {})

    def check_and_record(self, dedupe_key: str, digest: str, *, now: int | None = None,
                         ttl_seconds: int = 86400) -> bool:
        """Return True if this (key, digest) pair is new; False if replayed."""
        current = int(now if now is not None else time.time())
        seen: dict = self._seen
        for key in [k for k, exp in seen.items() if exp < current]:
            seen.pop(key, None)
        composite = f"{dedupe_key}:{digest}"
        if composite in seen:
            return False
        seen[composite] = current + ttl_seconds
        return True


def headers_for(payload: dict, secret: str, *, event: str, dedupe_key: str,
                timestamp: int | None = None) -> Mapping[str, str]:
    """Build the outbound header set the POS sends to the Hermes webhook."""
    digest, ts = sign(payload, secret, timestamp=timestamp)
    return {
        "Content-Type": "application/json",
        "X-GrandPOS-Event": event,
        "X-GrandPOS-Delivery": dedupe_key,
        "X-GrandPOS-Timestamp": str(ts),
        "X-Hub-Signature-256": signature_header(digest),
    }
