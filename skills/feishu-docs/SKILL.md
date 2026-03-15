---
name: feishu-docs
description: 飞书文档(Docx)API技能。用于创建、读取、更新和删除飞书文档。支持Markdown/HTML内容转换、文档权限管理。
metadata: {"clawdbot":{"emoji":"📝","requires":{"env":["FEISHU_APP_ID","FEISHU_APP_SECRET"]},"primaryEnv":"FEISHU_APP_ID"}}
---

# 飞书文档(Docx)技能

操作飞书新版文档(Docx)的openClaw技能，基于飞书开放平台 API 实现文档全生命周期管理。

## 功能特性

| 功能 | 说明 |
|------|------|
| 文档 CRUD | 创建、获取、更新（全量替换）、删除文档 |
| 内容追加 | 向已有文档末尾追加 Markdown/HTML 内容 |
| 内容转换 | 通过飞书服务端 API 将 Markdown/HTML 转换为文档块 |
| 块操作 | 获取文档块列表（自动分页）、插入子块、删除块 |
| 权限管理 | 添加协作者、查看权限成员列表 |
| 文件管理 | 按文件夹列出文件、按关键词搜索文档 |

## 环境变量

```bash
export FEISHU_APP_ID=cli_xxxxxx          # 飞书应用 App ID
export FEISHU_APP_SECRET=your_app_secret  # 飞书应用 App Secret
```

也可通过 `.env` 文件配置（项目使用 dotenv 自动加载）。

## 快速开始

```bash
# 安装依赖
npm install

# 查看帮助
node bin/cli.js --help

# 创建文档（含 Markdown 内容）
node bin/cli.js create -f fldxxxxxx -t "项目计划" -c "# 概述\n\n内容..."

# 获取文档
node bin/cli.js get -d dcnxxxxxx --format markdown --include-content

# 全量替换文档内容
node bin/cli.js update -d dcnxxxxxx --content-file new-content.md

# 追加内容
node bin/cli.js update -d dcnxxxxxx --append -c "## 补充\n\n新增内容"

# 删除文档
node bin/cli.js delete -d dcnxxxxxx
```

## CLI 命令

| 命令 | 说明 | 必要参数 |
|------|------|----------|
| `create` | 创建文档（有内容时自动使用转换流程） | `-f`文件夹token, `-t`标题 |
| `create-with-content` | 创建文档并通过转换API插入内容 | `-f`文件夹token, `-t`标题 |
| `get` | 获取文档信息 | `-d`文档ID |
| `update` | 替换或追加文档内容 | `-d`文档ID, `-c`内容或`--content-file` |
| `delete` | 删除文档 | `-d`文档ID |
| `search` | 搜索文档 | `-q`关键词 |
| `list` | 列出文件夹中的文件 | `-f`文件夹token |
| `share` | 分享文档给用户 | `-d`文档ID, `-u`用户ID |
| `permissions` | 查看文档权限成员 | `-d`文档ID |
| `convert` | 将Markdown/HTML转换为文档块（预览） | `-t`内容类型 |

所有命令均支持 `--app-id` 和 `--app-secret` 参数覆盖环境变量。

## API 方法

### 文档管理

| 方法 | 说明 |
|------|------|
| `createDocument(folderToken, title)` | 创建空文档 |
| `createDocumentWithContent(folderToken, title, content, contentType)` | 创建文档并插入内容 |
| `getDocument(documentId)` | 获取文档信息 |
| `getDocumentRawContent(documentId)` | 获取文档纯文本内容 |
| `deleteDocument(documentId)` | 删除文档（通过 Drive API） |

### 文档块操作

| 方法 | 说明 |
|------|------|
| `getDocumentBlocks(documentId, pageSize, pageToken)` | 获取文档块列表（单页） |
| `getAllDocumentBlocks(documentId)` | 获取所有块（自动分页） |
| `updateDocumentBlock(documentId, blockId, updateRequest)` | 更新指定块 |
| `createDocumentBlocks(documentId, blockId, children, index)` | 在指定块下插入子块 |
| `deleteDocumentBlock(documentId, blockId)` | 删除指定块 |
| `batchDeleteBlocks(documentId, blockIds)` | 批量删除块 |

### 内容操作

| 方法 | 说明 |
|------|------|
| `appendToDocument(documentId, content, contentType)` | 向文档末尾追加内容 |
| `replaceDocumentContent(documentId, content, contentType)` | 全量替换文档内容 |
| `convertContent(contentType, content, userIdType)` | 将 Markdown/HTML 转换为文档块 |

### 文件与搜索

| 方法 | 说明 |
|------|------|
| `listFolderFiles(folderToken, type)` | 列出文件夹下的文件 |
| `searchDocuments(query, folderToken)` | 按关键词搜索文档 |

### 权限管理

| 方法 | 说明 |
|------|------|
| `addPermissionMember(token, memberId, memberType, perm)` | 添加权限成员 |
| `getPermissionMembers(token)` | 获取权限成员列表 |

### 格式转换（本地）

| 方法 | 说明 |
|------|------|
| `markdownToBlocks(markdown)` | Markdown → 飞书块结构（本地转换） |
| `blocksToMarkdown(blocks)` | 飞书块结构 → Markdown（支持数字/字符串 block_type） |

## 飞书 API 端点

代码实际调用的飞书开放平台端点：

```
POST   /docx/v1/documents                                    # 创建文档
GET    /docx/v1/documents/{document_id}                      # 获取文档信息
GET    /docx/v1/documents/{document_id}/raw_content          # 获取文档纯文本
GET    /docx/v1/documents/{document_id}/blocks               # 获取文档块列表
PATCH  /docx/v1/documents/{document_id}/blocks/{block_id}    # 更新块
DELETE /docx/v1/documents/{document_id}/blocks/{block_id}    # 删除块
POST   /docx/v1/documents/{document_id}/blocks/{block_id}/children  # 插入子块
POST   /docx/v1/documents/blocks/convert                     # Markdown/HTML→块
DELETE /drive/v1/files/{file_token}?type=docx                # 删除文档
GET    /drive/v1/files?folder_token=xxx                      # 列出文件夹文件
POST   /drive/v1/permissions/{token}/members?type=docx       # 添加权限成员
GET    /drive/v1/permissions/{token}/members?type=docx       # 获取权限成员
POST   /auth/v3/tenant_access_token/internal/                # 获取 tenant_access_token
```

## 可靠性机制

- **Token 缓存与并发控制**：access_token 缓存复用，多个并发请求不会重复刷新
- **自动重试**：401 未授权自动刷新 token 重试；429 限流和 5xx 错误指数退避重试（最多 2 次）
- **Token 过期码识别**：检测飞书错误码 `99991663`/`99991661` 自动刷新 token
- **安全错误处理**：安全访问 `error.response.data`，避免非 JSON 响应导致崩溃

## 注意事项

1. **应用权限**：飞书应用需具备 `docs:doc`、`drive:drive`、`drive:file` 等相关权限
2. **内容插入**：`create` 命令含 content 时自动走 `convertContent` → `createDocumentBlocks` 流程，确保文档结构正确
3. **批量插入限制**：每批最多插入 50 个块（飞书 API 限制）
4. **表格处理**：转换含表格的内容时自动去除 `merge_info` 字段；block_type 为 31/32 的表格块暂被过滤
5. **内容大小**：单次转换内容不超过 10MB

## 项目结构

```
├── src/api.js        # FeishuDocsAPI 类（所有 API 方法 + 格式转换）
├── bin/cli.js        # Commander 命令行工具
├── package.json      # 依赖：axios, commander, dotenv
├── test-convert.js   # 转换接口测试
├── SKILL.md          # 本文件
└── README.md         # 项目说明
```