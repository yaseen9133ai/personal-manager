# syntax=docker/dockerfile:1

FROM node:22-bookworm-slim AS frontend-builder
WORKDIR /frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM ghcr.io/astral-sh/uv:python3.12-bookworm-slim

WORKDIR /app

COPY backend/pyproject.toml backend/uv.lock backend/README.md ./
RUN uv sync --frozen --no-install-project --no-dev

COPY backend/src ./src
RUN uv sync --frozen --no-dev

COPY --from=frontend-builder /frontend/out ./src/backend/static

ENV PATH="/app/.venv/bin:${PATH}"

EXPOSE 8000

CMD ["uv", "run", "--frozen", "--no-dev", "uvicorn", "backend.main:app", "--app-dir", "src", "--host", "0.0.0.0", "--port", "8000"]
