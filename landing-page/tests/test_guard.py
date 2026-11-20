"""Unit tests for the WhatsApp gateway guard: allowlist, JID, rate limit, logs."""

import logging

import pytest

from app.guard import Allowlist, NotAllowedError, RateLimitedError, RateLimiter, SafeLogger, dedupe_key, jid_for, mask_phone, normalise_phone


class TestNormalise:
    def test_strips_jid_suffix_and_device(self):
        assert normalise_phone("628110000001@s.whatsapp.net:12") == "628110000001"

    def test_leading_zero_becomes_62(self):
        assert normalise_phone("08110000001") == "628110000001"

    def test_plus_prefix_is_stripped(self):
        assert normalise_phone("+628110000001") == "628110000001"

    def test_garbage_is_rejected(self):
        with pytest.raises(NotAllowedError):
            normalise_phone("not-a-number")

    def test_suffix_cannot_smuggle_prefix_match(self):
        # A suffix on an allowlisted-looking string is dropped before compare.
        assert normalise_phone("628110000001@c.us") == "628110000001"


class TestAllowlist:
    def test_owner_is_always_included(self):
        allow = Allowlist.from_env("628110000002", owner="628110000001")
        assert allow.allows("628110000001")
        assert allow.allows("+628110000002")
        assert allow.is_owner("628110000001")
        assert not allow.is_owner("628110000002")

    def test_non_member_is_rejected(self):
        allow = Allowlist.from_env("628110000001")
        assert not allow.allows("628199999999")
        with pytest.raises(NotAllowedError):
            allow.require("628199999999")

    def test_require_accepts_jid_form(self):
        allow = Allowlist.from_env("628110000001")
        assert allow.require("628110000001@s.whatsapp.net") == "628110000001"


class TestRateLimiter:
    def test_under_limit_passes(self):
        limiter = RateLimiter(limit_per_minute=2)
        limiter.check("628110000001", now=60)
        limiter.check("628110000001", now=61)

    def test_over_limit_raises(self):
        limiter = RateLimiter(limit_per_minute=2)
        limiter.check("628110000001", now=60)
        limiter.check("628110000001", now=61)
        with pytest.raises(RateLimitedError):
            limiter.check("628110000001", now=62)

    def test_window_resets(self):
        limiter = RateLimiter(limit_per_minute=1)
        limiter.check("628110000001", now=60)
        limiter.check("628110000001", now=120)  # next window

    def test_limits_are_per_sender(self):
        limiter = RateLimiter(limit_per_minute=1)
        limiter.check("628110000001", now=60)
        limiter.check("628110000002", now=60)  # other sender unaffected


class TestMasking:
    def test_full_number_is_never_logged_verbatim(self):
        masked = mask_phone("628110000001")
        assert "628110000001" not in masked
        assert masked == "62811***01"

    def test_jid_helper_shape(self):
        assert jid_for("08110000001") == "628110000001@s.whatsapp.net"


class TestSafeLogger:
    def test_bodies_and_secrets_never_reach_records(self, caplog):
        logger = SafeLogger(logging.getLogger("test.grandpos"))
        with caplog.at_level(logging.INFO, logger="test.grandpos"):
            logger.event(
                "inbound.received",
                sender="628110000001",
                body="halo ini rahasia",
                message="teks",
                secret="super-secret",
                command="/stok",
                ms=12,
            )
        assert caplog.records, "expected a log record"
        text = caplog.text
        assert "628110000001" not in text
        assert "halo ini rahasia" not in text
        assert "super-secret" not in text
        assert "62811***01" in text
        assert "/stok" in text

    def test_invalid_sender_is_marked_not_dropped(self, caplog):
        logger = SafeLogger(logging.getLogger("test.grandpos.invalid"))
        with caplog.at_level(logging.INFO, logger="test.grandpos.invalid"):
            logger.event("inbound.received", sender="garbage")
        assert "invalid" in caplog.text


class TestDedupe:
    def test_keys_are_stable_and_opaque(self):
        a = dedupe_key("receipt", "GAK-001", "628110000001")
        b = dedupe_key("receipt", "GAK-001", "628110000001")
        c = dedupe_key("receipt", "GAK-002", "628110000001")
        assert a == b
        assert a != c
        assert "GAK-001" not in a
