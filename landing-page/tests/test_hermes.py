"""Tests for Hermes provider management."""

import json
import os
from pathlib import Path

import pytest

from hermes import ProviderConfig, ProviderManager, get_manager, reset_manager


@pytest.fixture
def temp_config(tmp_path: Path) -> Path:
    """Create a temporary provider config file."""
    config = {
        "providers": [
            {
                "name": "test-local",
                "base_url": "http://127.0.0.1:54321/v1",
                "api_key": "test-key-123",
                "default_model": "gpt-4",
                "timeout": 30,
                "enabled": True,
            }
        ],
        "default_provider": "test-local",
    }
    config_path = tmp_path / "test_providers.json"
    config_path.write_text(json.dumps(config))
    return config_path


class TestProviderConfig:
    def test_chat_completion_url(self) -> None:
        config = ProviderConfig(
            name="test",
            base_url="http://127.0.0.1:54321/v1",
        )
        assert config.chat_completion_url == "http://127.0.0.1:54321/v1/chat/completions"

    def test_chat_completion_url_trailing_slash(self) -> None:
        config = ProviderConfig(
            name="test",
            base_url="http://127.0.0.1:54321/v1/",
        )
        assert config.chat_completion_url == "http://127.0.0.1:54321/v1/chat/completions"

    def test_headers_with_api_key(self) -> None:
        config = ProviderConfig(
            name="test",
            base_url="http://localhost/v1",
            api_key="secret123",
        )
        headers = config.get_headers()
        assert headers["Authorization"] == "Bearer secret123"
        assert headers["Content-Type"] == "application/json"

    def test_headers_without_api_key(self) -> None:
        config = ProviderConfig(
            name="test",
            base_url="http://localhost/v1",
        )
        headers = config.get_headers()
        assert "Authorization" not in headers


class TestProviderManager:
    def test_load_config(self, temp_config: Path) -> None:
        manager = ProviderManager(temp_config)
        assert "test-local" in manager.list_providers()
        assert manager.list_enabled_providers() == ["test-local"]

    def test_get_provider(self, temp_config: Path) -> None:
        manager = ProviderManager(temp_config)
        provider = manager.get_provider("test-local")
        assert provider.name == "test-local"
        assert provider.base_url == "http://127.0.0.1:54321/v1"
        assert provider.default_model == "gpt-4"

    def test_get_default_provider(self, temp_config: Path) -> None:
        manager = ProviderManager(temp_config)
        provider = manager.get_provider()  # No name = default
        assert provider.name == "test-local"

    def test_provider_not_found(self, temp_config: Path) -> None:
        manager = ProviderManager(temp_config)
        with pytest.raises(ValueError, match="Provider 'nonexistent' not found"):
            manager.get_provider("nonexistent")

    def test_disabled_provider(self, temp_config: Path) -> None:
        config = {
            "providers": [
                {
                    "name": "disabled-provider",
                    "base_url": "http://localhost/v1",
                    "enabled": False,
                }
            ],
        }
        config_path = temp_config.parent / "disabled.json"
        config_path.write_text(json.dumps(config))
        manager = ProviderManager(config_path)

        with pytest.raises(ValueError, match="disabled"):
            manager.get_provider("disabled-provider")

    def test_env_var_api_key(self, tmp_path: Path) -> None:
        os.environ["TEST_API_KEY"] = "from-env"
        config = {
            "providers": [
                {
                    "name": "env-test",
                    "base_url": "http://localhost/v1",
                    "api_key": "${TEST_API_KEY}",
                }
            ],
        }
        config_path = tmp_path / "env_test.json"
        config_path.write_text(json.dumps(config))
        manager = ProviderManager(config_path)
        provider = manager.get_provider("env-test")
        assert provider.api_key == "from-env"
        del os.environ["TEST_API_KEY"]

    def test_env_var_with_default(self, tmp_path: Path) -> None:
        config = {
            "providers": [
                {
                    "name": "default-test",
                    "base_url": "http://localhost/v1",
                    "api_key": "${MISSING_KEY:-fallback}",
                }
            ],
        }
        config_path = tmp_path / "default_test.json"
        config_path.write_text(json.dumps(config))
        manager = ProviderManager(config_path)
        provider = manager.get_provider("default-test")
        assert provider.api_key == "fallback"

    def test_singleton(self, temp_config: Path) -> None:
        reset_manager()
        manager1 = get_manager(temp_config)
        manager2 = get_manager()
        assert manager1 is manager2
        reset_manager()


class TestHealthCheck:
    def test_health_check_unhealthy(self, temp_config: Path) -> None:
        """Health check should fail when server is not running."""
        manager = ProviderManager(temp_config)
        result = manager.health_check("test-local")
        assert result["status"] == "unhealthy"
        assert result["provider"] == "test-local"
        assert "error" in result