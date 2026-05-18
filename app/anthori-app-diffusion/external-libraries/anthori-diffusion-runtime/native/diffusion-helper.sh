#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)

if [ -n "${ANTHORI_PYTHON_BIN:-}" ] && [ -x "$ANTHORI_PYTHON_BIN" ]; then
  exec "$ANTHORI_PYTHON_BIN" "$SCRIPT_DIR/diffusion_helper.py" "$@"
fi

if command -v python3 >/dev/null 2>&1; then
  exec python3 "$SCRIPT_DIR/diffusion_helper.py" "$@"
fi

if command -v python >/dev/null 2>&1; then
  exec python "$SCRIPT_DIR/diffusion_helper.py" "$@"
fi

printf '%s\n' '{"error":"python runtime is unavailable"}'
exit 1
