---
name: feishu-skills-kit
description: |
  Complete Feishu (Lark) Skills collection for Claude Code / OpenClaw.
  Includes 10 skills covering: document management, messaging, spreadsheets,
  Bitable, interactive cards, bot bridge, cross-group memory, and leave requests.

  飞书 Skills 全集，含文档管理、消息发送、表格操作、多维表格、卡片消息、
  Bot 桥接、跨群记忆、请假审批等 10 个 Skill，附完整配置教程。

  Trigger on: feishu, 飞书, lark, feishu doc, feishu message, feishu sheet,
  feishu bitable, feishu card, feishu bridge, feishu bot
---

# Feishu Skills Kit — 飞书 Skills 全集

Complete collection of 10 Feishu/Lark skills for Claude Code and OpenClaw agents.

## Included Skills

| Skill | Category | Description |
|-------|----------|-------------|
| feishu-doc-manager | Document | Markdown → Feishu Doc with auto-formatting |
| feishu-docx-powerwrite | Document | High-quality Markdown → Feishu Docx conversion |
| feishu-doc-editor | Document | Create/edit Feishu documents via OpenAPI |
| feishu-messaging | Messaging | Send text/image/file messages |
| feishu-card | Messaging | Rich interactive card messages |
| feishu-sheets-skill | Spreadsheet | Full spreadsheet CRUD operations |
| feishu-bitable | Spreadsheet | Bitable/Base record management |
| feishu-bridge | Integration | Bot ↔ Clawdbot WebSocket bridge |
| feishu-memory-recall | Memory | Cross-group message search and digest |
| feishu-leave-request | Workflow | Leave request submission assistant |

## Prerequisites

1. Create an app on [Feishu Open Platform](https://open.feishu.cn/app)
2. Obtain your `App ID` and `App Secret`
3. Configure required permissions based on the skills you use
4. Set up MCP Server (see README.md for details)

## Quick Start

```bash
# Install all skills
clawhub install feishu-skills-kit --dir ~/.claude/skills

# Configure MCP (edit ~/.claude/mcp.json)
# Add your FEISHU_APP_ID and FEISHU_APP_SECRET
# See mcp-config-template.json for reference

# Restart Claude Code
```

## MCP Configuration

See `mcp-config-template.json` for the configuration template. Replace placeholders with your own credentials.

## Documentation

See `README.md` for the complete setup guide (in Chinese).
