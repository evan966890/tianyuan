#!/bin/bash
# Feishu File Sender Skill Script
# Uploads a local file to Feishu and sends it as a message to a specific receiver.

set -e

# Configuration
# These should be passed as environment variables or arguments
# APP_ID="${FEISHU_APP_ID}"
# APP_SECRET="${FEISHU_APP_SECRET}"
# RECEIVER="${FEISHU_RECEIVER}"

# Arguments
FILE_PATH="$1"
RECEIVER_ID="$2"
RECEIVER_TYPE="${3:-open_id}" # default to open_id, others: user_id, chat_id, email

if [ -z "$FILE_PATH" ]; then
    echo "❌ Error: Missing file path"
    echo "Usage: $0 <file_path> [receiver_id] [receiver_type]"
    exit 1
fi

if [ ! -f "$FILE_PATH" ]; then
    echo "❌ Error: File not found: $FILE_PATH"
    exit 1
fi

# Use environment variables if receiver id is not provided as argument
if [ -z "$RECEIVER_ID" ]; then
    RECEIVER_ID="${FEISHU_RECEIVER}"
fi

if [ -z "$RECEIVER_ID" ]; then
    echo "❌ Error: Missing receiver ID (provide as argument or set FEISHU_RECEIVER env var)"
    exit 1
fi

# Use credentials from environment or fallback to OpenClaw config if possible
# Note: In OpenClaw exec context, FEISHU_APP_ID/SECRET are usually available if configured
if [ -z "$FEISHU_APP_ID" ] || [ -z "$FEISHU_APP_SECRET" ]; then
    echo "❌ Error: Missing FEISHU_APP_ID or FEISHU_APP_SECRET environment variables"
    exit 1
fi

FILE_NAME=$(basename "$FILE_PATH")

echo "📂 Sending file: $FILE_NAME to $RECEIVER_ID ($RECEIVER_TYPE)"

# 1. Get Tenant Access Token
echo "🔑 Getting access token..."
TOKEN_RESPONSE=$(curl -s -X POST "https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal" \
    -H "Content-Type: application/json" \
    -d "{\"app_id\": \"$FEISHU_APP_ID\", \"app_secret\": \"$FEISHU_APP_SECRET\"}")

TOKEN=$(echo "$TOKEN_RESPONSE" | jq -r '.tenant_access_token')

if [ "$TOKEN" = "null" ] || [ -z "$TOKEN" ]; then
    echo "❌ Failed to get token"
    echo "$TOKEN_RESPONSE" | jq .
    exit 1
fi

# 2. Upload file to Feishu
echo "📤 Uploading file to Feishu..."
UPLOAD_RESPONSE=$(curl -s -X POST "https://open.feishu.cn/open-apis/im/v1/files" \
    -H "Authorization: Bearer $TOKEN" \
    -F "file_type=stream" \
    -F "file_name=$FILE_NAME" \
    -F "file=@$FILE_PATH")

UPLOAD_CODE=$(echo "$UPLOAD_RESPONSE" | jq -r '.code')
if [ "$UPLOAD_CODE" != "0" ]; then
    echo "❌ File upload failed"
    echo "$UPLOAD_RESPONSE" | jq .
    exit 1
fi

FILE_KEY=$(echo "$UPLOAD_RESPONSE" | jq -r '.data.file_key')
echo "✅ File uploaded (file_key: $FILE_KEY)"

# 3. Send message
echo "📨 Sending message..."
SEND_RESPONSE=$(curl -s -X POST "https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=$RECEIVER_TYPE" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "{
        \"receive_id\": \"$RECEIVER_ID\",
        \"msg_type\": \"file\",
        \"content\": \"{\\\"file_key\\\": \\\"$FILE_KEY\\\"}\"
    }")

SEND_CODE=$(echo "$SEND_RESPONSE" | jq -r '.code')
if [ "$SEND_CODE" != "0" ]; then
    echo "❌ Failed to send message"
    echo "$SEND_RESPONSE" | jq .
    exit 1
fi

echo "🎉 Success! File $FILE_NAME sent to $RECEIVER_ID"
