# Hermes AI Provider

Hermes adalah layer integrasi AI untuk GrandPOS yang menyediakan akses ke LLM (Large Language Model) melalui API yang kompatibel dengan OpenAI.

## Konfigurasi

### 1. File Konfigurasi

Provider dikonfigurasi di `hermes/providers.json`:

```json
{
  "providers": [
    {
      "name": "local-ai",
      "base_url": "http://127.0.0.1:20128/v1",
      "api_key": "${LOCAL_AI_API_KEY}",
      "default_model": "gh/gpt-4o-mini",
      "timeout": 60,
      "max_retries": 3,
      "enabled": true
    }
  ],
  "default_provider": "local-ai"
}
```

### 2. Environment Variables

| Variable | Deskripsi | Contoh |
|----------|-----------|--------|
| `LOCAL_AI_API_KEY` | API key untuk autentikasi | `ghp_xxxxxxxxxxxx` |

Set environment variable:
```bash
export LOCAL_AI_API_KEY="your-api-key-here"
```

### 3. Model yang Tersedia

Server ini (GitHub Copilot AI Gateway) menyediakan berbagai model:

**GPT Models:**
- `gh/gpt-4o-mini` - Cepat & ekonomis
- `gh/gpt-4o` - Vision + tools
- `gh/gpt-4` - Model klasik
- `gh/gpt-5-mini` - Model terbaru
- `gh/gpt-5.6-luna` - Context window besar (1M)

**Claude Models:**
- `gh/claude-haiku-4.5` - Cepat
- `ag/claude-sonnet-4-6` - Balance
- `ag/claude-opus-4-6-thinking` - Reasoning

**Kimi Models:**
- `kimi/kimi-k3` - Context 1M tokens
- `kimi/kimi-k2.5` - Coding optimized

**Gemini Models:**
- `ag/gemini-3.8-flash` - Multimodal

## Penggunaan

### Python API

```python
from hermes import get_manager
from hermes.completions import chat_completion, extract_message_content

# Chat completion
response = chat_completion(
    messages=[
        {"role": "system", "content": "You are a POS assistant."},
        {"role": "user", "content": "Analyze today's sales"},
    ],
    provider="local-ai",
    model="gh/gpt-4o-mini",  # optional, uses default if not set
)

content = extract_message_content(response)
print(content)
```

### Function Calling

```python
from hermes.completions import chat_completion

tools = [
    {
        "type": "function",
        "function": {
            "name": "get_sales_report",
            "description": "Get sales report",
            "parameters": {
                "type": "object",
                "properties": {
                    "date": {"type": "string"},
                },
            },
        },
    }
]

response = chat_completion(
    messages=[{"role": "user", "content": "Show me yesterday's sales"}],
    tools=tools,
    tool_choice="auto",
)
```

### Streaming

```python
from hermes.completions import stream_chat_completion

for chunk in stream_chat_completion(
    messages=[{"role": "user", "content": "Tell me a story"}],
):
    print(chunk, end="", flush=True)
```

### CLI

```bash
# Health check
python -m hermes health

# List models
python -m hermes models

# Chat
python -m hermes chat "Hello, how are you?"

# With options
python -m hermes chat "Explain quantum computing" --model gh/gpt-4o --temperature 0.5
```

## Struktur File

```
hermes/
├── __init__.py          # ProviderManager & config
├── __main__.py          # Entry point untuk python -m hermes
├── cli.py               # Command-line interface
├── completions.py       # Chat completion functions
├── example.py           # Contoh penggunaan
└── providers.json       # Konfigurasi provider
```

## Health Check

```python
from hermes import get_manager

manager = get_manager()
result = manager.health_check("local-ai")
print(result)
# {'status': 'healthy', 'provider': 'local-ai', 'models': [...]}
```

## Error Handling

```python
from hermes.completions import chat_completion, ChatCompletionError

try:
    response = chat_completion(messages=[...])
except ChatCompletionError as e:
    print(f"AI request failed: {e}")
```

## Menambahkan Provider Baru

Edit `hermes/providers.json`:

```json
{
  "providers": [
    {
      "name": "local-ai",
      "base_url": "http://127.0.0.1:20128/v1",
      "api_key": "${LOCAL_AI_API_KEY}",
      "default_model": "gh/gpt-4o-mini",
      "enabled": true
    },
    {
      "name": "openai",
      "base_url": "https://api.openai.com/v1",
      "api_key": "${OPENAI_API_KEY}",
      "default_model": "gpt-4",
      "enabled": true
    }
  ],
  "default_provider": "local-ai"
}
```

## Dependensi

- `httpx` - HTTP client (sudah ada di requirements.txt)

## Testing

```bash
# Run tests
pytest tests/test_hermes.py -v
```