# syntax=docker/dockerfile:1
FROM python:3.11-slim-bookworm

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    HF_HOME=/app/model-cache/huggingface \
    FASTEMBED_CACHE_PATH=/app/model-cache/fastembed \
    PORT=8000 \
    OMP_NUM_THREADS=2 \
    TOKENIZERS_PARALLELISM=false

WORKDIR /app

# OpenMP is required by the CPU inference libraries. No compiler or CUDA runtime
# is needed. An optional combined CA bundle supports builds behind an HTTPS proxy.
RUN --mount=type=secret,id=proxy_ca \
    if [ -f /run/secrets/proxy_ca ]; then \
        export SSL_CERT_FILE=/run/secrets/proxy_ca; \
    fi; \
    apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates libgomp1 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt ./

# Install and constrain the CPU build explicitly so dependency resolution cannot
# replace it with the much larger default CUDA distribution from PyPI.
ARG TORCH_VERSION=2.9.1
RUN --mount=type=secret,id=proxy_ca \
    if [ -f /run/secrets/proxy_ca ]; then \
        export PIP_CERT=/run/secrets/proxy_ca; \
        export SSL_CERT_FILE=/run/secrets/proxy_ca; \
    fi; \
    python -m pip install --no-cache-dir \
        --index-url https://download.pytorch.org/whl/cpu "torch==${TORCH_VERSION}+cpu" \
    && printf 'torch==%s+cpu\n' "$TORCH_VERSION" > /tmp/torch-constraint.txt \
    && python -m pip install --no-cache-dir \
        -r requirements.txt -c /tmp/torch-constraint.txt \
    && python -m pip check \
    && rm /tmp/torch-constraint.txt

RUN useradd --create-home --uid 10001 app \
    && mkdir -p /app/model-cache/huggingface /app/model-cache/fastembed \
    && chown -R app:app /app

COPY --chown=app:app . .
USER app

EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=120s --retries=3 \
    CMD ["python", "scripts/container_healthcheck.py"]
CMD ["sh", "scripts/start-server.sh"]
