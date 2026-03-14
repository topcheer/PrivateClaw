#!/bin/sh
set -eu

REDIS_HOST="${PRIVATECLAW_EMBEDDED_REDIS_HOST:-127.0.0.1}"
REDIS_PORT="${PRIVATECLAW_EMBEDDED_REDIS_PORT:-6379}"
REDIS_DATA_DIR="${PRIVATECLAW_EMBEDDED_REDIS_DATA_DIR:-/tmp/privateclaw-redis}"

mkdir -p "$REDIS_DATA_DIR"

export PRIVATECLAW_REDIS_URL="redis://${REDIS_HOST}:${REDIS_PORT}"

redis-server \
  --bind "$REDIS_HOST" \
  --port "$REDIS_PORT" \
  --dir "$REDIS_DATA_DIR" \
  --save "" \
  --appendonly no \
  --protected-mode yes \
  --daemonize yes

attempt=0
until redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" ping >/dev/null 2>&1; do
  attempt=$((attempt + 1))
  if [ "$attempt" -ge 30 ]; then
    echo "[privateclaw-relay] embedded Redis failed to become ready" >&2
    exit 1
  fi
  sleep 1
done

exec node /app/services/relay-server/dist/cli.js
