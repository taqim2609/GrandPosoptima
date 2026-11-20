"""Example usage of Hermes AI provider.

This module demonstrates how to use the Hermes provider layer
for AI-powered features in GrandPOS.
"""

from hermes import get_manager
from hermes.completions import chat_completion, extract_message_content


def example_basic_chat() -> None:
    """Send a simple chat message to the AI provider."""
    response = chat_completion(
        messages=[
            {"role": "system", "content": "You are a helpful POS assistant."},
            {"role": "user", "content": "What are the top selling items today?"},
        ],
        provider="local-ai",  # Uses the provider from providers.json
    )

    content = extract_message_content(response)
    print(f"AI Response: {content}")


def example_with_tools() -> None:
    """Use function calling with the AI provider."""
    tools = [
        {
            "type": "function",
            "function": {
                "name": "get_sales_report",
                "description": "Get sales report for a date range",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "start_date": {"type": "string", "format": "date"},
                        "end_date": {"type": "string", "format": "date"},
                    },
                    "required": ["start_date", "end_date"],
                },
            },
        }
    ]

    response = chat_completion(
        messages=[
            {"role": "user", "content": "Show me sales from 2024-01-01 to 2024-01-31"},
        ],
        tools=tools,
        tool_choice="auto",
    )

    # Check if AI wants to call a function
    tool_calls = response.get("choices", [{}])[0].get("message", {}).get("tool_calls", [])
    if tool_calls:
        print(f"AI wants to call: {tool_calls[0]['function']['name']}")
        print(f"Arguments: {tool_calls[0]['function']['arguments']}")
    else:
        content = extract_message_content(response)
        print(f"AI Response: {content}")


def example_health_check() -> None:
    """Check if the AI provider is healthy."""
    manager = get_manager()
    result = manager.health_check("local-ai")

    if result["status"] == "healthy":
        print("✓ AI provider is online")
        print(f"  Available models: {len(result.get('models', []))}")
    else:
        print("✗ AI provider is offline")
        print(f"  Error: {result.get('error')}")


def example_streaming() -> None:
    """Stream chat completion chunks."""
    from hermes.completions import stream_chat_completion

    for chunk in stream_chat_completion(
        messages=[{"role": "user", "content": "Tell me a story"}],
    ):
        print(chunk, end="", flush=True)
    print()


if __name__ == "__main__":
    print("=== Hermes AI Provider Examples ===\n")

    print("1. Health Check:")
    example_health_check()
    print()

    print("2. Basic Chat (requires running server):")
    try:
        example_basic_chat()
    except Exception as e:
        print(f"   Skipped: {e}")
    print()

    print("3. Function Calling (requires running server):")
    try:
        example_with_tools()
    except Exception as e:
        print(f"   Skipped: {e}")
    print()

    print("See hermes/completions.py for more utilities.")