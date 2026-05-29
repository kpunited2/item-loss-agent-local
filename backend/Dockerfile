# syntax=docker/dockerfile:1.6

# ---- Stage 1: Build ----
FROM --platform=$BUILDPLATFORM python:3.11-slim AS builder

COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

WORKDIR /backend

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    UV_SYSTEM_PYTHON=1 \
    UV_LINK_MODE=copy

# Install dependencies first (cached layer via BuildKit cache mount)
COPY requirements.lock ./
RUN --mount=type=cache,target=/root/.cache/uv \
    uv pip install --system -r requirements.lock

# Copy project metadata and install the package itself
COPY pyproject.toml prompts.yaml gemini_models.yaml ./
COPY app/ app/
RUN --mount=type=cache,target=/root/.cache/uv \
    uv pip install --system --no-deps .

# ---- Stage 2: Runtime ----
FROM python:3.11-slim AS runtime

WORKDIR /backend

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PATH="/usr/local/bin:$PATH"

# Install su-exec for privilege dropping (Debian-slim doesn't have it by default)
RUN apt-get update && apt-get install -y --no-install-recommends gosu \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /usr/local/lib/python3.11/site-packages /usr/local/lib/python3.11/site-packages
COPY --from=builder /usr/local/bin/uvicorn /usr/local/bin/uvicorn
COPY --from=builder /backend/app ./app
COPY --from=builder /backend/prompts.yaml ./prompts.yaml
COPY --from=builder /backend/gemini_models.yaml ./gemini_models.yaml

# Create the non-root user (but DON'T switch to it here)
RUN useradd --create-home --shell /bin/bash appuser \
    && chown -R appuser:appuser /backend

# Entrypoint runs as root to fix permissions, then drops to appuser
COPY entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

EXPOSE 8257

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
CMD ["uvicorn", "app.api:app", "--host", "0.0.0.0", "--port", "8257"]