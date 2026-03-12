#!/bin/bash
set -euo pipefail

ACCOUNT_ID="${1:-}"
TARGET_ID="${2:-}"
OPUS_PATH="${3:-}"
RECEIVE_ID_TYPE="${4:-open_id}"
CONFIG_PATH="${OPENCLAW_CONFIG_PATH:-$HOME/.openclaw/openclaw.json}"

if [ -z "$ACCOUNT_ID" ] || [ -z "$TARGET_ID" ] || [ -z "$OPUS_PATH" ]; then
  echo "usage: bash scripts/send_feishu_audio_direct.sh <account-id> <target-id> <opus-path> [receive-id-type]" >&2
  exit 1
fi

if [ ! -f "$CONFIG_PATH" ]; then
  echo "openclaw config not found: $CONFIG_PATH" >&2
  exit 1
fi

if [ ! -f "$OPUS_PATH" ]; then
  echo "audio file not found: $OPUS_PATH" >&2
  exit 1
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "jq not found" >&2
  exit 1
fi

APP_ID="$(jq -r --arg account "$ACCOUNT_ID" '.channels.feishu.accounts[$account].appId // empty' "$CONFIG_PATH")"
APP_SECRET="$(jq -r --arg account "$ACCOUNT_ID" '.channels.feishu.accounts[$account].appSecret // empty' "$CONFIG_PATH")"

if [ -z "$APP_ID" ] || [ -z "$APP_SECRET" ]; then
  echo "feishu account not configured: $ACCOUNT_ID" >&2
  exit 1
fi

if ! command -v ffprobe >/dev/null 2>&1; then
  echo "ffprobe not found" >&2
  exit 1
fi

DURATION_RAW="$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$OPUS_PATH" 2>/dev/null || true)"
DURATION_SECONDS="${DURATION_RAW%%.*}"
if [ -z "$DURATION_SECONDS" ] || [ "$DURATION_SECONDS" = "0" ]; then
  DURATION_SECONDS=3
fi
DURATION_MS=$((DURATION_SECONDS * 1000))

TOKEN="$(curl -fsS -X POST 'https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal' \
  -H 'Content-Type: application/json' \
  -d "{\"app_id\":\"$APP_ID\",\"app_secret\":\"$APP_SECRET\"}" | jq -r '.tenant_access_token')"

if [ -z "$TOKEN" ] || [ "$TOKEN" = "null" ]; then
  echo "failed to get tenant_access_token" >&2
  exit 1
fi

FILE_KEY="$(curl -fsS -X POST 'https://open.feishu.cn/open-apis/im/v1/files' \
  -H "Authorization: Bearer $TOKEN" \
  -F "file_type=opus" \
  -F "file_name=$(basename "$OPUS_PATH")" \
  -F "duration=$DURATION_MS" \
  -F "file=@$OPUS_PATH" | jq -r '.data.file_key')"

if [ -z "$FILE_KEY" ] || [ "$FILE_KEY" = "null" ]; then
  echo "failed to upload opus file" >&2
  exit 1
fi

RESULT="$(curl -fsS -X POST "https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=$RECEIVE_ID_TYPE" \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"receive_id\":\"$TARGET_ID\",\"content\":\"{\\\"file_key\\\":\\\"$FILE_KEY\\\",\\\"duration\\\":$DURATION_MS}\",\"msg_type\":\"audio\"}")"

echo "$RESULT" | jq '{code,msg,data}'
