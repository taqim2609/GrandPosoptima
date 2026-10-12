from unittest.mock import patch

import pytest

from backend.whatsapp_pairing import normalize_whatsapp_pairing_number, validate_evolution_url


def test_normalize_local_indonesian_number():
    assert normalize_whatsapp_pairing_number("0812-3456-7890") == "6281234567890"


def test_normalize_international_number_keeps_country_code():
    assert normalize_whatsapp_pairing_number("+62 812 3456 7890") == "6281234567890"


def test_normalize_rejects_too_short_number():
    assert normalize_whatsapp_pairing_number("0812") == ""


def test_normalize_rejects_non_indonesian_number():
    assert normalize_whatsapp_pairing_number("+1 212 555 0123") == ""


def test_validate_evolution_url_accepts_public_host():
    public = [(None, None, None, None, ("8.8.8.8", 443))]
    with patch("backend.whatsapp_pairing.socket.getaddrinfo", return_value=public):
        assert validate_evolution_url("https://wa.example.com/") == "https://wa.example.com"


def test_validate_evolution_url_rejects_private_host():
    private = [(None, None, None, None, ("127.0.0.1", 8080))]
    with patch("backend.whatsapp_pairing.socket.getaddrinfo", return_value=private):
        with pytest.raises(ValueError, match="alamat publik"):
            validate_evolution_url("http://localhost:8080")
