"""Unit tests for HMAC-SHA256 signing, verification window and replay guard."""

import pytest

from app.signing import (
    ReplayGuard,
    SignatureError,
    canonical_body,
    headers_for,
    parse_signature_header,
    secret_fingerprint,
    sign,
    signature_header,
    verify,
)

SECRET = "test-only-hmac-secret-0123456789abcdef"
WRONG = "wrong-secret"
PAYLOAD = {"event": "receipt", "order_number": "GAK-20261016-0001", "total": 91000}


class TestSigning:
    def test_canonical_body_is_deterministic(self):
        a = canonical_body({"b": 1, "a": 2})
        b = canonical_body({"a": 2, "b": 1})
        assert a == b
        assert a == b'{"a":2,"b":1}'

    def test_sign_and_verify_round_trip(self):
        digest, ts = sign(PAYLOAD, SECRET, timestamp=1_700_000_000)
        verify(PAYLOAD, SECRET, signature_header(digest), ts, now=1_700_000_100)

    def test_wrong_secret_fails(self):
        digest, ts = sign(PAYLOAD, WRONG, timestamp=1_700_000_000)
        with pytest.raises(SignatureError, match="mismatch"):
            verify(PAYLOAD, SECRET, signature_header(digest), ts, now=1_700_000_100)

    def test_tampered_body_fails(self):
        digest, ts = sign(PAYLOAD, SECRET, timestamp=1_700_000_000)
        with pytest.raises(SignatureError, match="mismatch"):
            verify({**PAYLOAD, "total": 1}, SECRET, signature_header(digest), ts, now=1_700_000_100)

    def test_expired_timestamp_fails(self):
        digest, ts = sign(PAYLOAD, SECRET, timestamp=1_700_000_000)
        with pytest.raises(SignatureError, match="tolerance"):
            verify(PAYLOAD, SECRET, signature_header(digest), ts, now=1_700_000_000 + 301)

    def test_future_timestamp_fails(self):
        digest, ts = sign(PAYLOAD, SECRET, timestamp=1_700_000_000 + 500)
        with pytest.raises(SignatureError, match="future"):
            verify(PAYLOAD, SECRET, signature_header(digest), ts, now=1_700_000_000)

    def test_bare_hex_header_is_accepted(self):
        digest, ts = sign(PAYLOAD, SECRET, timestamp=1_700_000_000)
        verify(PAYLOAD, SECRET, digest, ts, now=1_700_000_100)

    def test_malformed_header_is_rejected(self):
        with pytest.raises(SignatureError):
            parse_signature_header("not-hex")
        with pytest.raises(SignatureError):
            parse_signature_header("")

    def test_missing_secret_is_rejected(self):
        with pytest.raises(SignatureError):
            sign(PAYLOAD, "")
        with pytest.raises(SignatureError):
            verify(PAYLOAD, "", "sha256=" + "0" * 64, 1700000000)


class TestHeaders:
    def test_outbound_header_set_shape(self):
        headers = headers_for(PAYLOAD, SECRET, event="receipt", dedupe_key="abc-123", timestamp=1_700_000_000)
        assert headers["Content-Type"] == "application/json"
        assert headers["X-GrandPOS-Event"] == "receipt"
        assert headers["X-GrandPOS-Delivery"] == "abc-123"
        assert headers["X-GrandPOS-Timestamp"] == "1700000000"
        assert headers["X-Hub-Signature-256"].startswith("sha256=")

    def test_headers_verify_end_to_end(self):
        headers = headers_for(PAYLOAD, SECRET, event="receipt", dedupe_key="abc-123", timestamp=1_700_000_000)
        verify(
            PAYLOAD,
            SECRET,
            headers["X-Hub-Signature-256"],
            headers["X-GrandPOS-Timestamp"],
            now=1_700_000_100,
        )


class TestReplayGuard:
    def test_first_delivery_is_accepted(self):
        guard = ReplayGuard()
        assert guard.check_and_record("key-1", "digest-1", now=1000) is True

    def test_replay_is_rejected(self):
        guard = ReplayGuard()
        guard.check_and_record("key-1", "digest-1", now=1000)
        assert guard.check_and_record("key-1", "digest-1", now=1100) is False

    def test_same_key_new_digest_is_accepted(self):
        guard = ReplayGuard()
        guard.check_and_record("key-1", "digest-1", now=1000)
        assert guard.check_and_record("key-1", "digest-2", now=1100) is True

    def test_expired_entries_are_pruned(self):
        guard = ReplayGuard()
        guard.check_and_record("key-1", "digest-1", now=1000, ttl_seconds=60)
        assert guard.check_and_record("key-1", "digest-1", now=1000 + 61) is True


class TestFingerprint:
    def test_fingerprint_does_not_contain_secret(self):
        fp = secret_fingerprint(SECRET)
        assert SECRET not in fp
        assert len(fp) == 12

    def test_empty_secret_is_marked_none(self):
        assert secret_fingerprint("") == "none"
