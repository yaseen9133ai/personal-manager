#!/usr/bin/env bash
set -euo pipefail

# On Git Bash for Windows, MSYS auto-converts POSIX-looking args (e.g. the
# "/app/data" container path below) into Windows paths before they reach
# docker.exe, silently breaking the volume mount. Harmless no-op on Mac/Linux.
export MSYS_NO_PATHCONV=1

cd "$(dirname "$0")/.."

PORT="${1:-8000}"
IMAGE_NAME="personal-manager-backend"
CONTAINER_NAME="personal-manager"

mkdir -p data

docker build -t "$IMAGE_NAME" .

docker rm -f "$CONTAINER_NAME" >/dev/null 2>&1 || true

docker run -d \
  --name "$CONTAINER_NAME" \
  --env-file .env \
  -p "$PORT:8000" \
  -v "$(pwd)/data:/app/data" \
  "$IMAGE_NAME"

echo "Running at http://localhost:$PORT"
