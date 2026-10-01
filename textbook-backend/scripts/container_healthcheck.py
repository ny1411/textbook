"""Probe the local readiness endpoint without sending localhost to an HTTP proxy."""
import json
import os
import sys
from urllib.error import URLError
from urllib.request import ProxyHandler, build_opener


def main():
    port = os.environ.get("PORT", "8000")
    opener = build_opener(ProxyHandler({}))
    try:
        with opener.open(f"http://127.0.0.1:{port}/healthz", timeout=3) as response:
            if response.status != 200 or json.load(response).get("status") != "ready":
                return 1
    except (OSError, URLError, ValueError, AttributeError):
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
