"""CLI utilities for Hermes provider management.

Usage:
    python -m hermes.cli health
    python -m hermes.cli chat "Hello, how are you?"
    python -m hermes.cli models
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys

from . import ProviderManager, get_manager
from .completions import chat_completion, extract_message_content


def cmd_health(args: argparse.Namespace) -> int:
    """Check provider health."""
    manager = get_manager()
    provider_name = args.provider

    if provider_name:
        result = manager.health_check(provider_name)
        print(json.dumps(result, indent=2, default=str))
        return 0 if result["status"] == "healthy" else 1

    # Check all enabled providers
    all_healthy = True
    for name in manager.list_enabled_providers():
        result = manager.health_check(name)
        print(json.dumps(result, indent=2, default=str))
        if result["status"] != "healthy":
            all_healthy = False

    return 0 if all_healthy else 1


def cmd_models(args: argparse.Namespace) -> int:
    """List available models from provider."""
    manager = get_manager()
    provider = manager.get_provider(args.provider)

    import httpx
    client = httpx.Client(timeout=10)
    response = client.get(
        provider.models_url,
        headers=provider.get_headers(),
    )
    response.raise_for_status()
    data = response.json()

    models = data.get("data", [])
    for model in models:
        print(f"- {model.get('id', 'unknown')}")
        if model.get("owned_by"):
            print(f"  owned_by: {model['owned_by']}")

    return 0


def cmd_chat(args: argparse.Namespace) -> int:
    """Send a chat completion request."""
    messages = []
    if args.system:
        messages.append({"role": "system", "content": args.system})
    messages.append({"role": "user", "content": args.message})

    response = chat_completion(
        messages,
        model=args.model,
        provider=args.provider,
        temperature=args.temperature,
        max_tokens=args.max_tokens,
    )

    if args.raw:
        print(json.dumps(response, indent=2, default=str))
    else:
        content = extract_message_content(response)
        print(content)

    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="hermes",
        description="Hermes AI Provider CLI",
    )
    parser.add_argument(
        "--config",
        help="Path to providers.json config file",
        default=None,
    )
    parser.add_argument(
        "--provider",
        help="Provider name to use",
        default=None,
    )

    subparsers = parser.add_subparsers(dest="command", required=True)

    # health command
    health_parser = subparsers.add_parser("health", help="Check provider health")
    health_parser.set_defaults(func=cmd_health)

    # models command
    models_parser = subparsers.add_parser("models", help="List available models")
    models_parser.set_defaults(func=cmd_models)

    # chat command
    chat_parser = subparsers.add_parser("chat", help="Send a chat message")
    chat_parser.add_argument("message", help="Message to send")
    chat_parser.add_argument("--system", help="System prompt", default=None)
    chat_parser.add_argument("--model", help="Model name", default=None)
    chat_parser.add_argument(
        "--temperature",
        type=float,
        default=0.7,
        help="Sampling temperature",
    )
    chat_parser.add_argument(
        "--max-tokens",
        type=int,
        default=None,
        help="Maximum tokens to generate",
    )
    chat_parser.add_argument(
        "--raw",
        action="store_true",
        help="Print raw JSON response",
    )
    chat_parser.set_defaults(func=cmd_chat)

    args = parser.parse_args(argv)

    # Initialize manager with custom config if provided
    if args.config:
        ProviderManager(args.config)

    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())