#!/usr/bin/env python3
"""Quick API key setup - edit this file and run."""

import os
import sys
from pathlib import Path

# ✅ ✅ ✅ EDIT DI BAWAH INI ✅ ✅ ✅
# Ganti "your-api-key-here" dengan API key Anda yang sebenarnya
# Contoh: "ghp_xxxxxxxxxxxxxxxxxxxx"

API_KEY = "your-api-key-here"  # <-- EDIT INI

# ✅ ✅ ✅ STOP EDIT ✅ ✅ ✅

if API_KEY == "your-api-key-here":
    print("❌ ERROR: Anda belum mengisi API key!")
    print("   Edit file ini dan ganti 'your-api-key-here' dengan key Anda.")
    sys.exit(1)

# .env ada di root folder layanan (satu tingkat di atas hermes/).
# Bisa dioverride lewat GRANDPOS_ENV_FILE bila .env disimpan di tempat lain.
env_path = Path(os.environ.get("GRANDPOS_ENV_FILE") or Path(__file__).resolve().parent.parent / ".env")

if not env_path.exists():
    print(f"❌ ERROR: {env_path} tidak ditemukan.")
    print("   Salin .env.example ke .env lebih dulu.")
    sys.exit(1)

# Baca file
with open(env_path, 'r') as f:
    lines = f.readlines()

# Update atau tambah LOCAL_AI_API_KEY
key_found = False
new_lines = []

for line in lines:
    if line.strip().startswith("LOCAL_AI_API_KEY="):
        new_lines.append(f"LOCAL_AI_API_KEY={API_KEY}\n")
        key_found = True
    else:
        new_lines.append(line)

if not key_found:
    new_lines.append(f"\n# AI Provider Configuration (Hermes)\n")
    new_lines.append(f"LOCAL_AI_API_KEY={API_KEY}\n")

# Tulis
with open(env_path, 'w') as f:
    f.writelines(new_lines)

# Mask untuk display
masked = API_KEY[:4] + "*" * (len(API_KEY) - 8) + API_KEY[-4:] if len(API_KEY) > 8 else "****"
print(f"✅ API key disimpan: {masked}")
print(f"   File: {env_path}")
