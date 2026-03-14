#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
TMP_ENV=$(mktemp)
WORKDIR=""

cleanup() {
  rm -f "$TMP_ENV"
}

trap cleanup EXIT HUP INT TERM

if [ "${1:-}" = "--cwd" ]; then
  if [ "$#" -lt 3 ]; then
    echo "usage: $0 [--cwd DIR] command [args...]" >&2
    exit 64
  fi

  WORKDIR=$2
  shift 2
fi

if [ "$#" -lt 1 ]; then
  echo "usage: $0 [--cwd DIR] command [args...]" >&2
  exit 64
fi

node "$SCRIPT_DIR/export-store-env-from-ggai.mjs" > "$TMP_ENV"
. "$TMP_ENV"

if [ -n "$WORKDIR" ]; then
  cd "$WORKDIR"
fi

exec "$@"
