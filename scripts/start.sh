#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

PORT="${1:-8000}"
IMAGE_NAME="personal-manager-backend"
CONTAINER_NAME="personal-manager"

docker build -t "$IMAGE_NAME" .

docker rm -f "$CONTAINER_NAME" >/dev/null 2>&1 || true

docker run -d \
  --name "$CONTAINER_NAME" \
  --env-file .env \
  -p "$PORT:8000" \
  "$IMAGE_NAME"

echo "Running at http://localhost:$PORT"
