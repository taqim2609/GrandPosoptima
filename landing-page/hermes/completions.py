"""OpenAI-compatible chat completions for Hermes providers."""

from __future__ import annotations

import json
import logging
from typing import Any, AsyncIterator, Iterator

import httpx

from . import get_manager

log = logging.getLogger(__name__)


class ChatCompletionError(Exception):
    """Raised when a chat completion request fails."""


async def achat_completion(
    messages: list[dict[str, str]],
    *,
    model: str | None = None,
    provider: str | None = None,
    temperature: float = 0.7,
    max_tokens: int | None = None,
    stream: bool = False,
    tools: list[dict] | None = None,
    tool_choice: str | None = None,
    extra_body: dict | None = None,
) -> dict[str, Any]:
    """Async chat completion using configured provider.

    Args:
        messages: List of message dicts with 'role' and 'content' keys.
        model: Model name override. Uses provider default if not set.
        provider: Provider name. Uses default provider if not set.
        temperature: Sampling temperature.
        max_tokens: Maximum tokens to generate.
        stream: Whether to stream the response.
        tools: Optional list of tool definitions for function calling.
        tool_choice: Tool choice strategy ("auto", "none", or specific).
        extra_body: Additional fields to include in the request body.

    Returns:
        Parsed JSON response from the API.

    Raises:
        ChatCompletionError: If the request fails.
    """
    manager = get_manager()
    config = manager.get_provider(provider)
    model = model or config.default_model

    payload: dict[str, Any] = {
        "model": model,
        "messages": messages,
        "temperature": temperature,
        "stream": stream,
    }
    if max_tokens is not None:
        payload["max_tokens"] = max_tokens
    if tools:
        payload["tools"] = tools
    if tool_choice:
        payload["tool_choice"] = tool_choice
    if extra_body:
        payload.update(extra_body)

    async with httpx.AsyncClient(
        base_url=config.base_url.rstrip("/"),
        headers=config.get_headers(),
        timeout=config.timeout,
    ) as client:
        try:
            response = await client.post("/chat/completions", json=payload)
            response.raise_for_status()
            return response.json()
        except httpx.HTTPStatusError as exc:
            error_body = exc.response.text
            log.error(
                "Chat completion failed: %s %s - %s",
                exc.response.status_code,
                exc.response.reason_phrase,
                error_body,
            )
            raise ChatCompletionError(
                f"HTTP {exc.response.status_code}: {error_body}"
            ) from exc
        except Exception as exc:
            log.error("Chat completion request failed: %s", exc)
            raise ChatCompletionError(str(exc)) from exc


def chat_completion(
    messages: list[dict[str, str]],
    *,
    model: str | None = None,
    provider: str | None = None,
    temperature: float = 0.7,
    max_tokens: int | None = None,
    stream: bool = False,
    tools: list[dict] | None = None,
    tool_choice: str | None = None,
    extra_body: dict | None = None,
) -> dict[str, Any]:
    """Synchronous chat completion using configured provider.

    See ``achat_completion`` for argument details.
    """
    manager = get_manager()
    config = manager.get_provider(provider)
    model = model or config.default_model

    payload: dict[str, Any] = {
        "model": model,
        "messages": messages,
        "temperature": temperature,
        "stream": stream,
    }
    if max_tokens is not None:
        payload["max_tokens"] = max_tokens
    if tools:
        payload["tools"] = tools
    if tool_choice:
        payload["tool_choice"] = tool_choice
    if extra_body:
        payload.update(extra_body)

    client = manager.get_client(provider)
    try:
        response = client.post("/chat/completions", json=payload)
        response.raise_for_status()
        return response.json()
    except httpx.HTTPStatusError as exc:
        error_body = exc.response.text
        log.error(
            "Chat completion failed: %s %s - %s",
            exc.response.status_code,
            exc.response.reason_phrase,
            error_body,
        )
        raise ChatCompletionError(
            f"HTTP {exc.response.status_code}: {error_body}"
        ) from exc
    except Exception as exc:
        log.error("Chat completion request failed: %s", exc)
        raise ChatCompletionError(str(exc)) from exc


def stream_chat_completion(
    messages: list[dict[str, str]],
    *,
    model: str | None = None,
    provider: str | None = None,
    temperature: float = 0.7,
    max_tokens: int | None = None,
) -> Iterator[str]:
    """Stream chat completion chunks (server-sent events format).

    Yields raw SSE chunks. The caller is responsible for parsing
    the ``data: {...}`` lines.
    """
    manager = get_manager()
    config = manager.get_provider(provider)
    model = model or config.default_model

    payload = {
        "model": model,
        "messages": messages,
        "temperature": temperature,
        "stream": True,
    }
    if max_tokens is not None:
        payload["max_tokens"] = max_tokens

    client = manager.get_client(provider)
    with client.stream(
        "POST",
        "/chat/completions",
        json=payload,
        headers={"Accept": "text/event-stream"},
    ) as response:
        response.raise_for_status()
        for line in response.iter_lines():
            if line:
                yield line


async def astream_chat_completion(
    messages: list[dict[str, str]],
    *,
    model: str | None = None,
    provider: str | None = None,
    temperature: float = 0.7,
    max_tokens: int | None = None,
) -> AsyncIterator[str]:
    """Async stream chat completion chunks."""
    manager = get_manager()
    config = manager.get_provider(provider)
    model = model or config.default_model

    payload = {
        "model": model,
        "messages": messages,
        "temperature": temperature,
        "stream": True,
    }
    if max_tokens is not None:
        payload["max_tokens"] = max_tokens

    async with httpx.AsyncClient(
        base_url=config.base_url.rstrip("/"),
        headers=config.get_headers(),
        timeout=config.timeout,
    ) as client:
        async with client.stream(
            "POST",
            "/chat/completions",
            json=payload,
            headers={"Accept": "text/event-stream"},
        ) as response:
            response.raise_for_status()
            async for line in response.aiter_lines():
                if line:
                    yield line


def extract_message_content(response: dict[str, Any]) -> str:
    """Extract the assistant's message content from a completion response.

    Handles both standard OpenAI format and various edge cases.
    """
    choices = response.get("choices", [])
    if not choices:
        return ""

    message = choices[0].get("message", {})
    content = message.get("content")

    # Handle tool calls
    if not content and "tool_calls" in message:
        tool_calls = message["tool_calls"]
        return json.dumps({"tool_calls": tool_calls}, indent=2)

    return content or ""


def extract_tool_calls(response: dict[str, Any]) -> list[dict]:
    """Extract tool calls from a completion response, if any."""
    choices = response.get("choices", [])
    if not choices:
        return []

    message = choices[0].get("message", {})
    return message.get("tool_calls", [])