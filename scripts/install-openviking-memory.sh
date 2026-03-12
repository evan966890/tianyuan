#!/bin/bash
set -euo pipefail

INSTALL_URL="${OPENVIKING_INSTALL_URL:-https://raw.githubusercontent.com/volcengine/OpenViking/main/examples/openclaw-memory-plugin/install.sh}"
OPENCLAW_HOME="${OPENCLAW_HOME:-$HOME/.openclaw}"

has_workdir=0
show_help=0
prev_is_workdir=0
args=()

for arg in "$@"; do
  if [[ "$prev_is_workdir" == "1" ]]; then
    has_workdir=1
    prev_is_workdir=0
  fi

  case "$arg" in
    --workdir)
      has_workdir=1
      prev_is_workdir=1
      ;;
    --workdir=*)
      has_workdir=1
      ;;
    -h|--help)
      show_help=1
      ;;
  esac
  args+=("$arg")
done

if [[ "$show_help" != "1" && "$has_workdir" != "1" ]]; then
  args=(--workdir "$OPENCLAW_HOME" "${args[@]}")
fi

echo "Using official OpenViking installer: $INSTALL_URL"
if [[ "$show_help" != "1" ]]; then
  echo "Default OpenClaw workdir: $OPENCLAW_HOME"
fi

curl -fsSL "$INSTALL_URL" | bash -s -- "${args[@]}"
