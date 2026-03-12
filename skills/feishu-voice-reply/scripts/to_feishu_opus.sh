#!/bin/bash
set -euo pipefail

INPUT_PATH="${1:-}"
OUTPUT_PATH="${2:-$HOME/.openclaw/media/voice_$(date +%s).opus}"

if [ -z "$INPUT_PATH" ]; then
  echo "usage: bash scripts/to_feishu_opus.sh <input-audio> [output-opus]" >&2
  exit 1
fi

if [ ! -f "$INPUT_PATH" ]; then
  echo "input not found: $INPUT_PATH" >&2
  exit 1
fi

if ! command -v ffmpeg >/dev/null 2>&1; then
  echo "ffmpeg not found" >&2
  exit 1
fi

mkdir -p "$(dirname "$OUTPUT_PATH")"

ffmpeg -y \
  -i "$INPUT_PATH" \
  -c:a libopus \
  -b:a 32k \
  -ar 16000 \
  -ac 1 \
  "$OUTPUT_PATH" >/dev/null 2>&1

printf '%s\n' "$OUTPUT_PATH"
