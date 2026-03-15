---
name: feishu-file
description: Send local files to Feishu chats. Supports uploading and sending any file type as a Feishu file message.
metadata: {
  "openclaw": {
    "requires": {
      "bins": ["curl", "jq"],
      "env": ["FEISHU_APP_ID", "FEISHU_APP_SECRET"]
    }
  }
}
---

# Feishu File Sender

A skill to send local files to Feishu users or groups.

## Setup

Requires Feishu App credentials. Ensure these are set in your environment or `openclaw.json`:

```bash
export FEISHU_APP_ID="cli_xxx"
export FEISHU_APP_SECRET="xxx"
export FEISHU_RECEIVER="ou_xxx" # Default receiver (optional)
```

## Usage

### Basic Usage

Send a file to the default receiver (configured in `FEISHU_RECEIVER`):

```bash
bash scripts/send_file.sh "/path/to/your/file.pdf"
```

### Specific Receiver

Send to a specific OpenID:

```bash
bash scripts/send_file.sh "/path/to/report.xlsx" "ou_abcdef123456"
```

### Different Receiver Types

Send to a Group (chat_id):

```bash
bash scripts/send_file.sh "/path/to/archive.zip" "oc_abcdef123456" "chat_id"
```

Supported types: `open_id`, `user_id`, `chat_id`, `email`.

## Script Details

### scripts/send_file.sh

The main script that handles the 3-step process:
1. **Auth**: Obtains a `tenant_access_token`.
2. **Upload**: Uploads the file to Feishu's internal storage using `POST /im/v1/files`.
3. **Send**: Sends the file message using `POST /im/v1/messages`.

## Permissions Required

The Feishu App must have the following permissions:
- `im:message` (Send and receive messages)
- `im:message:send_as_bot` (Send messages as bot)
- `im:resource` (Access and upload resources)
