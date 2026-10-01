#!/bin/sh
set -eu

# One process keeps one copy of the BGE and cross-encoder models in memory.
# exec forwards platform shutdown signals to Uvicorn instead of a wrapper shell.
exec python -m uvicorn main:app \
    --host 0.0.0.0 \
    --port "${PORT:-8000}" \
    --workers 1 \
    --timeout-graceful-shutdown "${UVICORN_TIMEOUT_GRACEFUL_SHUTDOWN:-120}"
