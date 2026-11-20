"""Hermes AI Provider Manager.

Manages LLM provider configurations and client initialization for the
GrandPOS Hermes AI integration layer.
"""

from __future__ import annotations

import json
import logging
import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import httpx

log = logging.getLogger(__name__)

# Default configuration path
DEFAULT_CONFIG_PATH = Path(__file__).parent / "providers.json"


@dataclass(frozen=True)
class ProviderConfig:
    """Configuration for a single LLM provider."""

    name: str
    base_url: str
    api_key: str | None = None
    default_model: str = "default"
    timeout: int = 60
    max_retries: int = 3
    enabled: bool = True
    extra_headers: dict[str, str] = field(default_factory=dict)

    @property
    def chat_completion_url(self) -> str:
        """Return the full URL for chat completions endpoint."""
        base = self.base_url.rstrip("/")
        return f"{base}/chat/completions"

    @property
    def models_url(self) -> str:
        """Return the full URL for models listing endpoint."""
        base = self.base_url.rstrip("/")
        return f"{base}/models"

    def get_headers(self) -> dict[str, str]:
        """Build request headers for this provider."""
        headers = {
            "Content-Type": "application/json",
            **self.extra_headers,
        }
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"
        return headers


class ProviderManager:
    """Manages AI provider configurations and HTTP clients."""

    def __init__(self, config_path: Path | str | None = None) -> None:
        self.config_path = Path(config_path or DEFAULT_CONFIG_PATH)
        self._providers: dict[str, ProviderConfig] = {}
        self._clients: dict[str, httpx.Client] = {}
        self._default_provider: str | None = None
        self._load_config()

    def _load_config(self) -> None:
        """Load provider configuration from JSON file."""
        if not self.config_path.exists():
            log.warning("Provider config not found at %s; using empty config", self.config_path)
            return

        try:
            with open(self.config_path, "r", encoding="utf-8") as f:
                config = json.load(f)
        except json.JSONDecodeError as exc:
            log.error("Invalid JSON in provider config: %s", exc)
            return

        # Load providers
        for provider_data in config.get("providers", []):
            # Resolve environment variables in API key
            api_key = provider_data.get("api_key", "")
            if api_key.startswith("${") and api_key.endswith("}"):
                # Handle ${VAR:-default} syntax
                var_expr = api_key[2:-1]  # Remove ${ and }
                if ":-" in var_expr:
                    var_name, default_val = var_expr.split(":-", 1)
                else:
                    var_name, default_val = var_expr, ""
                api_key = os.getenv(var_name, default_val) or None
            elif api_key:
                api_key = os.getenv(api_key, api_key) if not api_key.startswith("sk-") else api_key
            else:
                api_key = None

            provider = ProviderConfig(
                name=provider_data["name"],
                base_url=provider_data["base_url"],
                api_key=api_key,
                default_model=provider_data.get("default_model", "default"),
                timeout=provider_data.get("timeout", 60),
                max_retries=provider_data.get("max_retries", 3),
                enabled=provider_data.get("enabled", True),
                extra_headers=provider_data.get("extra_headers", {}),
            )
            self._providers[provider.name] = provider

        self._default_provider = config.get("default_provider")
        log.info(
            "Loaded %d provider(s): %s",
            len(self._providers),
            list(self._providers.keys()),
        )

    def get_provider(self, name: str | None = None) -> ProviderConfig:
        """Get a provider by name, or the default if no name given."""
        provider_name = name or self._default_provider
        if not provider_name:
            raise ValueError("No provider specified and no default configured")

        provider = self._providers.get(provider_name)
        if not provider:
            raise ValueError(f"Provider '{provider_name}' not found")
        if not provider.enabled:
            raise ValueError(f"Provider '{provider_name}' is disabled")

        return provider

    def get_client(self, name: str | None = None) -> httpx.Client:
        """Get or create an HTTP client for the specified provider."""
        provider_name = name or self._default_provider
        if not provider_name:
            raise ValueError("No provider specified and no default configured")

        if provider_name not in self._clients:
            provider = self.get_provider(provider_name)
            self._clients[provider_name] = httpx.Client(
                base_url=provider.base_url.rstrip("/"),
                headers=provider.get_headers(),
                timeout=provider.timeout,
            )

        return self._clients[provider_name]

    def list_providers(self) -> list[str]:
        """List all configured provider names."""
        return list(self._providers.keys())

    def list_enabled_providers(self) -> list[str]:
        """List only enabled provider names."""
        return [name for name, p in self._providers.items() if p.enabled]

    def health_check(self, name: str | None = None) -> dict[str, Any]:
        """Check if a provider is reachable."""
        provider = self.get_provider(name)
        try:
            client = httpx.Client(timeout=10)
            response = client.get(
                provider.models_url,
                headers=provider.get_headers(),
            )
            response.raise_for_status()
            return {
                "status": "healthy",
                "provider": provider.name,
                "base_url": provider.base_url,
                "models": response.json().get("data", []),
            }
        except Exception as exc:
            log.warning("Health check failed for %s: %s", provider.name, exc)
            return {
                "status": "unhealthy",
                "provider": provider.name,
                "base_url": provider.base_url,
                "error": str(exc),
            }

    def close(self) -> None:
        """Close all HTTP clients."""
        for client in self._clients.values():
            client.close()
        self._clients.clear()

    def __enter__(self) -> ProviderManager:
        return self

    def __exit__(self, *args: Any) -> None:
        self.close()


# Singleton instance for application-wide use
_manager: ProviderManager | None = None


def get_manager(config_path: Path | str | None = None) -> ProviderManager:
    """Get or create the singleton ProviderManager instance."""
    global _manager
    if _manager is None:
        _manager = ProviderManager(config_path)
    return _manager


def reset_manager() -> None:
    """Reset the singleton (useful for testing)."""
    global _manager
    if _manager is not None:
        _manager.close()
    _manager = None