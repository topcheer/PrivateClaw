#!/bin/sh
set -eu

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
REPO_ROOT="$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)"
RELAY_ENV_FILE="$REPO_ROOT/services/relay-server/.env"

if [ -f "$RELAY_ENV_FILE" ]; then
  set -a
  # shellcheck disable=SC1090
  . "$RELAY_ENV_FILE"
  set +a
fi

exec "$@"
