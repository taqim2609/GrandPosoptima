#!/usr/bin/env python3
"""Setup script for Hermes AI Provider API Key.

Usage:
    python setup_api_key.py                    # Interactive mode
    python setup_api_key.py --key YOUR_KEY     # Direct input
    python setup_api_key.py --show             # Show current config (masked)
    python setup_api_key.py --test             # Test connection
"""

import argparse
import os
import sys
from pathlib import Path


def get_env_path() -> Path:
    """Get the .env file path."""
    project_root = Path(__file__).resolve().parent.parent
    # Urutan: override eksplisit, lalu .env di root layanan, lalu direktori kerja.
    possible_paths = [
        Path(os.environ["GRANDPOS_ENV_FILE"]) if os.environ.get("GRANDPOS_ENV_FILE") else None,
        project_root / ".env",
        Path.cwd() / ".env",
    ]
    for path in possible_paths:
        if path and path.exists():
            return path
    return project_root / ".env"


def read_env_file(env_path: Path) -> dict:
    """Read .env file and return as dict."""
    config = {}
    if not env_path.exists():
        return config
    
    with open(env_path, "r") as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                key, value = line.split("=", 1)
                config[key.strip()] = value.strip()
    return config


def write_env_file(env_path: Path, config: dict) -> None:
    """Write config dict to .env file."""
    # Read existing content to preserve comments and order
    lines = []
    if env_path.exists():
        with open(env_path, "r") as f:
            lines = f.readlines()
    
    # Update or add LOCAL_AI_API_KEY
    key_found = False
    new_lines = []
    for line in lines:
        stripped = line.strip()
        if stripped.startswith("LOCAL_AI_API_KEY="):
            new_lines.append(f"LOCAL_AI_API_KEY={config['LOCAL_AI_API_KEY']}\n")
            key_found = True
        else:
            new_lines.append(line)
    
    if not key_found:
        # Add to end with comment
        new_lines.append("\n# AI Provider Configuration (Hermes)\n")
        new_lines.append(f"LOCAL_AI_API_KEY={config['LOCAL_AI_API_KEY']}\n")
    
    with open(env_path, "w") as f:
        f.writelines(new_lines)


def mask_key(key: str) -> str:
    """Mask API key for display."""
    if len(key) <= 8:
        return "****"
    return f"{key[:4]}...{key[-4:]}"


def setup_interactive(env_path: Path) -> None:
    """Interactive setup mode."""
    print("=" * 50)
    print("Hermes AI Provider - API Key Setup")
    print("=" * 50)
    print()
    
    # Show current config
    config = read_env_file(env_path)
    current_key = config.get("LOCAL_AI_API_KEY", "")
    
    if current_key and current_key != "your-api-key-here":
        print(f"Current API key: {mask_key(current_key)}")
        print()
    
    # Ask for new key
    print("Enter your API key (press Enter to keep current):")
    print("Examples:")
    print("  - GitHub: ghp_xxxxxxxxxxxxxxxxxxxx")
    print("  - OpenAI: sk-xxxxxxxxxxxxxxxxxxxx")
    print()
    
    new_key = input("API Key: ").strip()
    
    if not new_key and current_key and current_key != "your-api-key-here":
        print("\n✅ Keeping existing API key.")
        return
    elif not new_key:
        print("\n⚠️  No API key provided. Setup cancelled.")
        return
    
    # Confirm
    print(f"\nAPI key will be set to: {mask_key(new_key)}")
    confirm = input("Save? [Y/n]: ").strip().lower()
    
    if confirm in ("", "y", "yes"):
        config["LOCAL_AI_API_KEY"] = new_key
        write_env_file(env_path, config)
        print(f"\n✅ API key saved to {env_path}")
    else:
        print("\n❌ Cancelled.")


def show_config(env_path: Path) -> None:
    """Show current configuration."""
    config = read_env_file(env_path)
    key = config.get("LOCAL_AI_API_KEY", "")
    
    print("=" * 50)
    print("Current Hermes Configuration")
    print("=" * 50)
    print(f"Env file: {env_path}")
    print()
    
    if key and key != "your-api-key-here":
        print(f"API Key: {mask_key(key)} ✅")
    else:
        print("API Key: Not set ❌")
        print("Run: python setup_api_key.py")
    
    # Show provider config
    providers_path = env_path.parent / "hermes" / "providers.json"
    if providers_path.exists():
        print(f"\nProvider config: {providers_path} ✅")
    else:
        print(f"\nProvider config: Not found ❌")


def test_connection(env_path: Path) -> None:
    """Test connection to AI provider."""
    config = read_env_file(env_path)
    key = config.get("LOCAL_AI_API_KEY", "")
    
    if not key or key == "your-api-key-here":
        print("❌ API key not set!")
        print("Run: python setup_api_key.py")
        return
    
    print("Testing connection to AI provider...")
    print(f"API Key: {mask_key(key)}")
    
    try:
        import httpx
        
        # Test models endpoint (no auth required)
        response = httpx.get(
            "http://127.0.0.1:20128/v1/models",
            timeout=10,
        )
        print(f"\nModels endpoint: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            models = data.get("data", [])
            print(f"Available models: {len(models)}")
            print("\nTop 5 models:")
            for model in models[:5]:
                print(f"  - {model['id']}")
        
        # Test chat completion (requires auth)
        print("\nTesting chat completion...")
        response = httpx.post(
            "http://127.0.0.1:20128/v1/chat/completions",
            headers={"Authorization": f"Bearer {key}"},
            json={
                "model": "gh/gpt-4o-mini",
                "messages": [{"role": "user", "content": "Hi"}],
                "max_tokens": 10,
            },
            timeout=30,
        )
        print(f"Chat endpoint: {response.status_code}")
        
        if response.status_code == 200:
            print("\n✅ Connection successful!")
        else:
            print(f"\n❌ Failed: {response.text[:200]}")
            
    except Exception as e:
        print(f"\n❌ Error: {e}")


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Setup Hermes AI Provider API Key"
    )
    parser.add_argument(
        "--key",
        help="API key to set (direct input)",
        default=None,
    )
    parser.add_argument(
        "--show",
        action="store_true",
        help="Show current configuration",
    )
    parser.add_argument(
        "--test",
        action="store_true",
        help="Test connection to provider",
    )
    
    args = parser.parse_args()
    
    env_path = get_env_path()
    
    if args.show:
        show_config(env_path)
    elif args.test:
        test_connection(env_path)
    elif args.key:
        # Direct input mode
        config = read_env_file(env_path)
        config["LOCAL_AI_API_KEY"] = args.key
        write_env_file(env_path, config)
        print(f"✅ API key saved to {env_path}")
        print(f"Key: {mask_key(args.key)}")
    else:
        # Interactive mode
        setup_interactive(env_path)
    
    return 0


if __name__ == "__main__":
    sys.exit(main())