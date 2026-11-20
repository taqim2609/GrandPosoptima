"""Container healthcheck entrypoint (used by docker-compose api.healthcheck).

Exits 0 when the API answers /health, 1 otherwise. Kept dependency-free so it
works before the app has any DB connectivity: the endpoint itself reports the
database state, and the container should be considered alive regardless.
"""

from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request


def main() -> int:
    port = os.environ.get("API_PORT", "8000")
    url = f"http://127.0.0.1:{port}/health"
    try:
        with urllib.request.urlopen(url, timeout=5) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except (urllib.error.URLError, OSError, ValueError) as exc:
        print(f"healthcheck failed: {exc}", file=sys.stderr)
        return 1
    if payload.get("status") != "ok":
        print(f"healthcheck unexpected payload: {payload}", file=sys.stderr)
        return 1
    print(json.dumps(payload))
    return 0


if __name__ == "__main__":
    sys.exit(main())
