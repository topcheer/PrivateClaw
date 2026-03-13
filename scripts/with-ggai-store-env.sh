#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
TMP_ENV=$(mktemp)

cleanup() {
  rm -f "$TMP_ENV"
}

trap cleanup EXIT HUP INT TERM

node "$SCRIPT_DIR/export-store-env-from-ggai.mjs" > "$TMP_ENV"
. "$TMP_ENV"

exec "$@"
