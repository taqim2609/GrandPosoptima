"""Unit tests for landing config validation rules (no database needed)."""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import pytest

from app.rules import (
    LANDING_KEY_SCHEMA,
    LANDING_SECTIONS,
    validate_landing_config,
    validate_landing_key,
    validate_landing_section,
    validate_landing_value,
)


class TestLandingSectionValidation:
    def test_valid_sections(self):
        for section in LANDING_SECTIONS:
            assert validate_landing_section(section) == section

    def test_invalid_section_raises(self):
        with pytest.raises(ValueError, match="unknown landing section"):
            validate_landing_section("invalid_section")


class TestLandingKeyValidation:
    def test_valid_keys(self):
        for section, keys in LANDING_KEY_SCHEMA.items():
            for key in keys:
                assert validate_landing_key(section, key) == key

    def test_invalid_key_raises(self):
        with pytest.raises(ValueError, match="unknown key"):
            validate_landing_key("hero", "invalid_key")

    def test_invalid_section_for_key_raises(self):
        with pytest.raises(ValueError, match="unknown landing section"):
            validate_landing_key("invalid", "badge")


class TestLandingValueValidation:
    def test_string_value(self):
        assert validate_landing_value("hero", "badge", "Test") == "Test"

    def test_string_value_rejects_int(self):
        with pytest.raises(ValueError, match="must be a string"):
            validate_landing_value("hero", "badge", 123)

    def test_boolean_value(self):
        assert validate_landing_value("stats", "show_section", True) is True

    def test_boolean_value_rejects_string(self):
        with pytest.raises(ValueError, match="must be a boolean"):
            validate_landing_value("stats", "show_section", "true")

    def test_integer_value(self):
        assert validate_landing_value("reservation", "max_pax", 20) == 20

    def test_integer_value_rejects_bool(self):
        with pytest.raises(ValueError, match="must be an integer"):
            validate_landing_value("reservation", "max_pax", True)

    def test_array_value(self):
        assert validate_landing_value("stats", "items", [{"id": "a"}]) == [{"id": "a"}]

    def test_array_value_rejects_dict(self):
        with pytest.raises(ValueError, match="must be an array"):
            validate_landing_value("stats", "items", {"id": "a"})

    def test_object_value(self):
        assert validate_landing_value("hero", "primary_cta", {"text": "Click"}) == {"text": "Click"}

    def test_object_value_rejects_list(self):
        with pytest.raises(ValueError, match="must be an object"):
            validate_landing_value("hero", "primary_cta", ["text"])


class TestLandingConfigValidation:
    def test_valid_config(self):
        config = {
            "hero": {"badge": "Test Badge", "title": "Test Title"},
            "stats": {"show_section": True, "items": [{"id": "a"}]},
        }
        assert validate_landing_config(config) == config

    def test_invalid_section(self):
        with pytest.raises(ValueError, match="unknown landing section"):
            validate_landing_config({"invalid": {"key": "value"}})

    def test_invalid_key(self):
        with pytest.raises(ValueError, match="unknown key"):
            validate_landing_config({"hero": {"invalid_key": "value"}})

    def test_invalid_value_type(self):
        with pytest.raises(ValueError, match="must be a string"):
            validate_landing_config({"hero": {"badge": 123}})

    def test_non_dict_config_raises(self):
        with pytest.raises(ValueError, match="must be an object"):
            validate_landing_config(["not", "a", "dict"])

    def test_section_not_dict_raises(self):
        with pytest.raises(ValueError, match="must be an object"):
            validate_landing_config({"hero": "not a dict"})


class TestLandingConfigInContract:
    """The PUT /api/landing/config body model must reject an unwrapped body.

    Regression guard: with ``extra="allow"`` and a defaulted ``config`` field, a
    caller sending ``{"hero": {...}}`` (forgetting the ``config`` wrapper) got a
    200 no-op — the write silently did nothing while the client believed it
    succeeded. ``extra="forbid"`` turns that into a validation error.
    """

    def test_wrapped_body_is_accepted(self):
        from app.api import LandingConfigIn

        model = LandingConfigIn.model_validate({"config": {"hero": {"badge": "Hi"}}})
        assert model.config == {"hero": {"badge": "Hi"}}

    def test_unwrapped_body_is_rejected(self):
        from pydantic import ValidationError

        from app.api import LandingConfigIn

        with pytest.raises(ValidationError):
            LandingConfigIn.model_validate({"hero": {"badge": "Hi"}})

    def test_empty_body_still_parses(self):
        """An explicit empty config is valid (no-op is then intentional)."""
        from app.api import LandingConfigIn

        assert LandingConfigIn.model_validate({}).config == {}
