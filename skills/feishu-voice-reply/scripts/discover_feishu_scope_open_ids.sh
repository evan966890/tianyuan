#!/bin/bash
set -euo pipefail

ACCOUNT_ID="${1:-strategist}"
CONFIG_PATH="${OPENCLAW_CONFIG_PATH:-$HOME/.openclaw/openclaw.json}"

if [ ! -f "$CONFIG_PATH" ]; then
  echo "openclaw config not found: $CONFIG_PATH" >&2
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

TOKEN="$(curl -fsS -X POST 'https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal' \
  -H 'Content-Type: application/json' \
  -d "{\"app_id\":\"$APP_ID\",\"app_secret\":\"$APP_SECRET\"}" | jq -r '.tenant_access_token')"

if [ -z "$TOKEN" ] || [ "$TOKEN" = "null" ]; then
  echo "failed to get tenant_access_token" >&2
  exit 1
fi

curl -fsS \
  -H "Authorization: Bearer $TOKEN" \
  'https://open.feishu.cn/open-apis/contact/v3/scopes' | jq '{code,msg,data}'
