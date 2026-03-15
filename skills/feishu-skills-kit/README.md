# 飞书 Skills 合集 — Claude Code / OpenClaw 接入指南

> 本合集收录了 ClawHub 上全部 10 个飞书（Feishu/Lark）相关 Skills，涵盖文档、消息、表格、卡片、多维表格、请假、Bot 桥接等场景。按照本指南，任何人都可以在自己的电脑上完成飞书 Skills 的安装和 MCP Server 接入。

---

## 目录

1. [Skills 总览](#1-skills-总览)
2. [前置准备](#2-前置准备)
3. [飞书开放平台应用创建](#3-飞书开放平台应用创建)
4. [飞书 MCP Server 配置](#4-飞书-mcp-server-配置)
5. [Skills 安装](#5-skills-安装)
6. [各 Skill 详细说明](#6-各-skill-详细说明)
7. [发布到 ClawHub](#7-发布到-clawhub)
8. [常见问题](#8-常见问题)

---

## 1. Skills 总览

| # | Skill 名称 | 功能 | 分类 | 作者 |
|---|-----------|------|------|------|
| 1 | **feishu-doc-manager** | Markdown 发布到飞书文档，自动格式化 | 文档 | Shuai-DaiDai |
| 2 | **feishu-docx-powerwrite** | 高质量 Markdown → 飞书 Docx 转换 | 文档 | xiongjjlj |
| 3 | **feishu-doc-editor** | 飞书文档创建/编辑（OpenAPI） | 文档 | zhuligu |
| 4 | **feishu-messaging** | 发送飞书消息（文本/图片/文件） | 消息 | jypjypjypjyp |
| 5 | **feishu-card** | 发送富交互卡片消息（Markdown/按钮/图片） | 消息 | autogame-17 |
| 6 | **feishu-sheets-skill** | 飞书在线表格操作（读写/追加/工作表管理） | 表格 | wesley138cn |
| 7 | **feishu-bitable** | 飞书多维表格（Bitable）记录管理 | 表格 | autogame-17 |
| 8 | **feishu-bridge** | 飞书 Bot ↔ Clawdbot 网关 WebSocket 桥接 | 桥接 | AlexAnys |
| 9 | **feishu-memory-recall** | 跨群消息搜索、摘要、事件共享 | 记忆 | autogame-17 |
| 10 | **feishu-leave-request** | 飞书请假流程引导（浏览器自动化） | 审批 | baofeidyz |

### 按场景推荐

| 你想做什么 | 推荐 Skill |
|-----------|-----------|
| 将 Markdown 文档写入飞书 | feishu-doc-manager 或 feishu-docx-powerwrite |
| 通过 API 编辑飞书文档 | feishu-doc-editor |
| 发送飞书消息/通知 | feishu-messaging |
| 发送富文本卡片消息 | feishu-card |
| 操作飞书在线表格 | feishu-sheets-skill |
| 操作飞书多维表格 | feishu-bitable |
| 飞书 Bot 接入 AI Agent | feishu-bridge |
| 跨群搜索/消息摘要 | feishu-memory-recall |
| 自动提交请假申请 | feishu-leave-request |

---

## 2. 前置准备

### 2.1 环境要求

- **Node.js** >= 18（部分 skill 需要）
- **Python** >= 3.10（部分 skill 需要 `lark_oapi`）
- **Claude Code** 已安装
- **npm** 已可用

### 2.2 安装基础工具

```bash
# 安装 ClawHub CLI（用于从 ClawHub 安装 Skills）
npm i -g clawhub

# 安装飞书 Python SDK（feishu-messaging 等需要）
pip install lark-oapi
```

---

## 3. 飞书开放平台应用创建

所有飞书 Skills 都需要一个飞书开放平台的**企业自建应用**来获取 API 凭证。

### 3.1 创建应用

1. 访问 [飞书开放平台](https://open.feishu.cn/app)
2. 点击 **创建企业自建应用**
3. 填写应用名称（如 "AI Assistant"）和描述
4. 创建完成后，进入应用详情页

### 3.2 获取凭证

在应用详情页的 **凭证与基础信息** 中获取：

| 凭证 | 说明 | 示例格式 |
|------|------|----------|
| **App ID** | 应用唯一标识 | `cli_a5xxxxxxxxxxxxx` |
| **App Secret** | 应用密钥（请妥善保管） | `xxxxxxxxxxxxxxxxxxxxxxxx` |

### 3.3 配置权限

根据你要使用的 Skill，在 **开发配置 → 权限管理** 中申请对应权限：

#### 文档类 Skills 权限

| 权限 | 说明 | 适用 Skill |
|------|------|-----------|
| `docx:document` | 查看文档 | doc-manager, doc-editor |
| `docx:document:create` | 创建文档 | doc-manager |
| `docx:document:write_only` | 编辑文档 | doc-manager, docx-powerwrite, doc-editor |
| `docx:document:readonly` | 只读文档 | doc-editor |
| `docs:permission.member` | 管理文档权限 | doc-manager |

#### 消息类 Skills 权限

| 权限 | 说明 | 适用 Skill |
|------|------|-----------|
| `im:message` | 接收消息 | bridge, messaging |
| `im:message:send_as_bot` | 以 Bot 身份发消息 | messaging, card |
| `im:message.group_at_msg` | 接收群 @消息 | bridge |
| `im:message.p2p_msg` | 接收私聊消息 | bridge |
| `im:chat:readonly` | 获取群聊列表 | messaging |
| `im:chat.members:read` | 获取群成员 | messaging |

#### 表格类 Skills 权限

| 权限 | 说明 | 适用 Skill |
|------|------|-----------|
| `sheets:spreadsheet` | 创建/管理表格 | sheets-skill |
| `sheets:spreadsheet:readonly` | 读取表格 | sheets-skill |
| `drive:drive` | 访问云空间 | sheets-skill |
| `bitable:app` | 多维表格操作 | bitable |

### 3.4 添加 Bot 能力（可选）

如果需要使用 feishu-bridge、feishu-messaging、feishu-card 等消息类 skill：

1. 进入 **添加应用能力 → 机器人**
2. 在 **事件订阅** 中添加 `im.message.receive_v1`
3. 事件接收方式选择 **WebSocket 长连接**（feishu-bridge 使用此方式）
4. **发布应用**：创建版本 → 提交审核 → 发布

### 3.5 安全存储凭证

```bash
# 方式一：环境变量（推荐用于开发）
export FEISHU_APP_ID="cli_a5xxxxxxxxxxxxx"
export FEISHU_APP_SECRET="your_app_secret_here"

# 方式二：.env 文件
cat > ~/.feishu-skills.env << 'EOF'
FEISHU_APP_ID=cli_a5xxxxxxxxxxxxx
FEISHU_APP_SECRET=your_app_secret_here
EOF
chmod 600 ~/.feishu-skills.env

# 方式三：安全文件（feishu-bridge 使用）
mkdir -p ~/.clawdbot/secrets
echo "your_app_secret_here" > ~/.clawdbot/secrets/feishu_app_secret
chmod 600 ~/.clawdbot/secrets/feishu_app_secret
```

> **警告**：切勿将 App ID / App Secret 提交到 Git 仓库或分享给他人。

---

## 4. 飞书 MCP Server 配置

飞书 Skills 需要通过 MCP Server 与 Claude Code 交互。以下是不同 MCP Server 的配置方式。

### 4.1 feishu-doc-manager MCP Server

```bash
# 克隆 MCP Server
cd ~/.openclaw/workspace/skills 2>/dev/null || mkdir -p ~/.openclaw/workspace/skills && cd ~/.openclaw/workspace/skills
git clone https://github.com/Shuai-DaiDai/feishu-doc-manager.git
cd feishu-doc-manager
# 如果有 install.sh 则执行
[ -f install.sh ] && bash install.sh
```

编辑 `~/.claude/mcp.json`，添加飞书 MCP Server 配置：

```json
{
  "mcpServers": {
    "feishu-doc-manager": {
      "command": "bash",
      "args": [
        "/path/to/feishu-doc-manager/install.sh"
      ],
      "env": {
        "FEISHU_APP_ID": "<YOUR_APP_ID>",
        "FEISHU_APP_SECRET": "<YOUR_APP_SECRET>"
      }
    }
  }
}
```

### 4.2 通用飞书 MCP Server 配置模板

如果你使用的是其他飞书 MCP Server（如 OpenClaw 自带的），参考以下模板：

```json
{
  "mcpServers": {
    "feishu": {
      "command": "node",
      "args": ["/path/to/feishu-mcp-server/index.js"],
      "env": {
        "FEISHU_APP_ID": "<YOUR_APP_ID>",
        "FEISHU_APP_SECRET": "<YOUR_APP_SECRET>"
      }
    }
  }
}
```

### 4.3 配置占位符说明

| 占位符 | 替换为 | 获取方式 |
|--------|--------|----------|
| `<YOUR_APP_ID>` | 你的飞书 App ID | [飞书开放平台](https://open.feishu.cn/app) → 应用详情 → 凭证信息 |
| `<YOUR_APP_SECRET>` | 你的飞书 App Secret | 同上 |
| `/path/to/feishu-mcp-server/` | MCP Server 安装路径 | 根据你克隆/安装的实际路径 |

### 4.4 验证 MCP Server

配置完成后重启 Claude Code，然后在对话中测试：

```
请列出我的飞书文档
```

如果 MCP Server 正确连接，Claude Code 应能通过飞书 API 工具响应。

---

## 5. Skills 安装

### 5.1 从 ClawHub 安装（推荐）

```bash
# 登录 ClawHub（需 GitHub 账号）
clawhub login

# 安装单个 skill
clawhub install feishu-doc-manager --dir ~/.claude/skills

# 批量安装所有飞书 skills
for skill in feishu-doc-manager feishu-docx-powerwrite feishu-doc-editor \
  feishu-messaging feishu-card feishu-sheets-skill feishu-bitable \
  feishu-bridge feishu-memory-recall feishu-leave-request; do
  clawhub install "$skill" --dir ~/.claude/skills --force
done
```

### 5.2 从本合集文件夹安装

如果你拿到了本文件夹的完整副本：

```bash
# 将 skills 目录复制到 Claude Code 的 skills 目录
cp -R /path/to/feishu-skills-kit/skills/* ~/.claude/skills/
```

### 5.3 验证安装

重启 Claude Code 后，在对话中输入：

```
列出我安装的飞书相关 skills
```

Claude Code 应能识别已安装的飞书 skills。

---

## 6. 各 Skill 详细说明

### 6.1 feishu-doc-manager — 飞书文档管理器

**功能**：将 Markdown 内容无缝发布到飞书文档，自动渲染格式。

**核心特性**：
- Markdown 表格自动转换为格式化列表
- 一键权限管理（查看/编辑/完全访问）
- 长文档自动分段写入（避免 400 错误）
- `write`/`append` 自动渲染 Markdown

**所需权限**：`docx:document`、`docx:document:write_only`、`docs:permission.member`

**使用示例**：
```
将以下 Markdown 内容写入飞书文档 [文档链接]：
# 会议纪要
- 讨论了 Q2 计划
- 确定了技术方案
```

---

### 6.2 feishu-docx-powerwrite — 高质量文档写入

**功能**：使用 `feishu_docx_write_markdown` 工具将 Markdown 高质量转换为飞书 Docx。

**写入模式**：
| 模式 | 说明 | 使用场景 |
|------|------|----------|
| `append` | 追加到文档末尾（安全） | 会议记录、日志 |
| `replace` | 覆盖整个文档（需确认） | 从零生成完整文档 |

**支持的 Markdown 语法**：标题、列表、粗体/斜体、代码块、引用

**使用示例**：
```
帮我把这份报告追加到飞书文档 https://xxx.feishu.cn/docx/ABC123
```

---

### 6.3 feishu-doc-editor — 文档编辑器

**功能**：通过飞书 OpenAPI 创建和编辑文档（Block 级别操作）。

**核心操作**：
- 从 URL 提取 `document_id`
- 获取 `tenant_access_token`
- 创建/读取/写入文档 Block

**文档 ID 提取**：
```
URL: https://xxx.feishu.cn/docx/HpK2dtGu9omhMAxV12zcB6i7ngd
document_id = HpK2dtGu9omhMAxV12zcB6i7ngd
```

**所需权限**：`docx:document:write_only`、`docx:document:readonly`

---

### 6.4 feishu-messaging — 飞书消息

**功能**：发送飞书消息（文本、图片、文件），管理群聊。

**核心能力**：
| 功能 | 权限 |
|------|------|
| 发送文本消息 | `im:message:send_as_bot` |
| 获取群聊列表 | `im:chat:readonly` |
| 获取群成员 | `im:chat.members:read` |

**依赖**：`pip install lark-oapi`

**使用示例**：
```
给张三发一条飞书消息，告诉他明天上午 10 点开会
```

---

### 6.5 feishu-card — 富交互卡片

**功能**：发送支持 Markdown、标题、按钮、图片的富交互飞书卡片。

**依赖**：需要先安装 `feishu-common` 模块

**命令行用法**：
```bash
# 简单文本
node skills/feishu-card/send.js --target "ou_..." --text "Hello"

# Markdown 内容（推荐使用文件方式避免 shell 转义问题）
node skills/feishu-card/send.js --target "ou_..." --text-file "msg.md"

# 带按钮和颜色
node skills/feishu-card/send.js --target "ou_..." --text "Deploy done" \
  --title "CI/CD" --color green --button-text "View" --button-url "https://..."
```

**Persona 消息**：支持 d-guide（红色警告）、green-tea（柔和风格）、mad-dog（运行时错误风格）

---

### 6.6 feishu-sheets-skill — 飞书表格

**功能**：飞书在线表格的完整操作（创建、读写、追加、工作表管理）。

**操作列表**：
| action | 说明 |
|--------|------|
| `create` | 创建新表格 |
| `write` | 写入单元格 |
| `read` | 读取单元格 |
| `append` | 追加数据行 |
| `insert_dimension` | 插入行/列 |
| `delete_dimension` | 删除行/列 |
| `get_info` | 获取表格元数据 |
| `add_sheet` | 添加工作表 |
| `delete_sheet` | 删除工作表 |

**Token 提取**：
```
URL: https://xxx.feishu.cn/sheets/shtABC123 → spreadsheet_token = shtABC123
```

**所需权限**：`sheets:spreadsheet`、`sheets:spreadsheet:readonly`、`drive:drive`

---

### 6.7 feishu-bitable — 多维表格

**功能**：操作飞书多维表格（Bitable/Base）记录。

**核心功能**：
- 列出 Base 内的表
- 向表中新增记录/任务

**配置**：需要 `FEISHU_APP_ID` 和 `FEISHU_APP_SECRET` 环境变量

---

### 6.8 feishu-bridge — Bot 桥接

**功能**：通过 WebSocket 长连接将飞书 Bot 消息桥接到 Clawdbot Gateway。

**架构**：
```
飞书用户 → 飞书云 ←WS→ bridge.mjs (本地) ←WS→ Clawdbot Gateway → AI Agent
```

**特点**：无需公网 IP、域名或 ngrok。

**环境变量**：

| 变量 | 必需 | 默认值 |
|------|------|--------|
| `FEISHU_APP_ID` | 是 | — |
| `FEISHU_APP_SECRET_PATH` | 否 | `~/.clawdbot/secrets/feishu_app_secret` |
| `CLAWDBOT_CONFIG_PATH` | 否 | `~/.clawdbot/clawdbot.json` |

**启动**：
```bash
cd skills/feishu-bridge && npm install
FEISHU_APP_ID=cli_xxx node bridge.mjs
```

**macOS 开机自启**：
```bash
FEISHU_APP_ID=cli_xxx node setup-service.mjs
launchctl load ~/Library/LaunchAgents/com.clawdbot.feishu-bridge.plist
```

---

### 6.9 feishu-memory-recall — 跨群记忆

**功能**：跨群消息搜索、活动摘要、事件日志。

**命令**：
| 命令 | 说明 |
|------|------|
| `search --keyword <text>` | 跨群搜索消息 |
| `recall --user <id>` | 查找某用户的消息 |
| `digest` | 所有群的活动摘要 |
| `log-event` | 记录跨会话事件 |
| `sync-groups` | 自动发现群组 |

**配置**：需要 `.env` 文件中的 `FEISHU_APP_ID` 和 `FEISHU_APP_SECRET`

---

### 6.10 feishu-leave-request — 请假助手

**功能**：通过浏览器自动化引导用户在飞书中提交请假申请。

**流程**：收集请假信息 → 确认 → 导航飞书审批页面 → 填写表单 → 提交

**支持的假期类型**：年假、事假、病假、育儿假、产假、陪产假

---

## 7. 发布到 ClawHub

### 7.1 打包发布（已脱敏）

本合集中所有 Skill 文件已脱敏处理，不包含任何个人凭证。你可以直接将合集发布到 ClawHub：

```bash
clawhub login

# 发布整合包
clawhub publish ~/Desktop/feishu-skills-kit \
  --slug feishu-skills-kit \
  --name "Feishu Skills Kit" \
  --version 1.0.0 \
  --changelog "Complete Feishu skills collection with setup guide" \
  --tags "latest,feishu,lark,mcp,claude-code"
```

### 7.2 其他用户安装

```bash
clawhub install feishu-skills-kit --dir ~/Desktop/feishu-skills-kit
```

---

## 8. 常见问题

### Q: 如何获取 tenant_access_token？

```bash
curl -X POST https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal \
  -H "Content-Type: application/json" \
  -d '{"app_id": "<YOUR_APP_ID>", "app_secret": "<YOUR_APP_SECRET>"}'
```

返回中的 `tenant_access_token` 有效期 2 小时。

### Q: 如何将应用添加为文档协作者？

在飞书客户端中打开文档 → 点击右上角 "..." → "更多" → "添加文档应用" → 搜索并添加你的应用 → 授予 "可编辑" 权限。

### Q: feishu-bridge 启动失败？

```bash
# 检查服务状态
launchctl list | grep feishu

# 查看日志
tail -f ~/.clawdbot/logs/feishu-bridge.err.log

# 停止服务
launchctl unload ~/Library/LaunchAgents/com.clawdbot.feishu-bridge.plist
```

### Q: 发送消息时找不到用户的 open_id？

先通过飞书 API 获取群成员列表，找到目标用户的 `open_id`（格式：`ou_xxxxxxxx`）。

### Q: MCP Server 连接不上？

1. 确认 `~/.claude/mcp.json` 配置正确
2. 确认 `FEISHU_APP_ID` 和 `FEISHU_APP_SECRET` 填写正确
3. 重启 Claude Code
4. 查看 Claude Code 的 MCP 日志排查错误

---

## 文件结构

```
feishu-skills-kit/
├── README.md                         # 本文档（使用教程）
├── SKILL.md                          # ClawHub 发布用的 Skill 描述
├── mcp-config-template.json          # MCP Server 配置模板
└── skills/                           # 全部 10 个飞书 Skills
    ├── feishu-doc-manager/           # 文档管理器
    ├── feishu-docx-powerwrite/       # 高质量文档写入
    ├── feishu-doc-editor/            # 文档编辑器
    ├── feishu-messaging/             # 消息发送
    ├── feishu-card/                  # 卡片消息
    ├── feishu-sheets-skill/          # 表格操作
    ├── feishu-bitable/               # 多维表格
    ├── feishu-bridge/                # Bot 桥接
    ├── feishu-memory-recall/         # 跨群记忆
    └── feishu-leave-request/         # 请假助手
```

---

## 参考链接

- [飞书开放平台](https://open.feishu.cn/)
- [飞书 API 文档](https://open.feishu.cn/document/server-docs/api-call-guide/server-api-list)
- [ClawHub](https://clawhub.ai/)
- [ClawHub 文档](https://docs.openclaw.ai/tools/clawhub)
