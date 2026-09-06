#!/usr/bin/env bash
set -euo pipefail

CONTAINER_NAME="personal-manager"

if docker rm -f "$CONTAINER_NAME" >/dev/null 2>&1; then
  echo "Stopped $CONTAINER_NAME"
else
  echo "$CONTAINER_NAME was not running"
fi
