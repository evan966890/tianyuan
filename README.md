# 飞书高管四 Agent 套件

一个可迁移的 OpenClaw 项目模板，用来一键搭建 4 个飞书高管机器人：

- 商业参谋 `strategist`
- 效率管家 `chief-of-staff`
- 生活助理 `life-concierge`
- 知识管家 `second-brain`

仓库同时包含三类能力：

1. 4 个 agent 的完整 workspace 模板
2. 高管画像问卷与 `USER.md` / `MEMORY.md` / `radar/INTERESTS.md` 生成器
3. 读取 ClawMom 飞书自动化脚本后封装的一键建 bot + OpenClaw 配置注入脚本

## 目录

- `AI_PROMPT.md`：给本地 AI 的执行提示
- `AI_SPEC.yaml`：机器可执行安装规格
- `apps/questionnaire/`：纯前端单页问卷
- `config/messages-and-queue.md`：消息防抖和队列策略
- `lib/`：问卷字段、Markdown 生成器、suite 清单、Node 辅助函数
- `scripts/`：问卷预览、飞书建 bot、OpenClaw 注入、一键安装
- `skills/`：仓库内置的 5 个可选全局技能
- `shared-profile/`：共享 `USER.md` / `MEMORY.md` / `TOOLS.md` 初始模板
- `templates/agents/`：4 个 agent 的独立文件模板
- `templates/skills/executive-profile-onboarding/`：首次角色初始化 skill
- `troubleshooting/mimo-tool-calls.md`：MiMo / 非 Claude 工具调用修复
- `tools/feishu-automation/`：ClawMom 飞书自动化脚本副本

## 前置要求

- macOS
- Node.js 20+
- Chrome / Edge / Brave / Chromium 之一
- 已安装 ClawMom / OpenClaw，并存在 `~/.openclaw/openclaw.json`
- 当前机器可登录飞书开放平台

## 快速开始

```bash
npm install
npm run questionnaire
```

浏览器打开问卷后，可以直接复制最后一步生成的 Markdown；如果你希望把答案保存为文件再写入 suite：

```bash
npm run render:profile -- --input /path/to/profile.json --output-dir /tmp/executive-profile
```

## 一键创建 4 个飞书机器人

```bash
npm run provision:feishu
```

说明：

- 默认应用名就是 `商业参谋 / 效率管家 / 生活助理 / 知识管家`
- 会顺序检查并创建 4 个企业自建应用
- 若控制台已存在同名应用，会直接复用，不会重复创建
- 若发现旧的 `OpenClaw xxx` 遗留应用，会直接中止，避免继续堆重复项
- 首次运行会打开浏览器并等待你扫码登录飞书开放平台
- 结果默认写入 `.state/feishu-accounts.json`

常用参数：

```bash
npm run provision:feishu -- --force
npm run provision:feishu -- --browser-executable /Applications/Google\\ Chrome.app/Contents/MacOS/Google\\ Chrome
npm run provision:feishu -- --profile-dir ~/.clawmom/exec-suite-feishu-profile
```

`--force` 只会强制刷新本地映射，不会绕过飞书控制台的防重校验。

## 注入 OpenClaw

```bash
npm run configure:openclaw
```

默认动作：

- 在 `~/.openclaw/executive-feishu-suite/` 生成 4 个 agent workspace
- 安装共享 skill 到 `~/.openclaw/skills/executive-profile-onboarding`
- 为 OpenAI 兼容模型补 `tools.profile = full`
- 为飞书补默认消息防抖与队列配置
- 增量更新 `~/.openclaw/openclaw.json`
- 为 4 个 Feishu account 建立 `bindings`
- 为 second-brain 挂载 `radar/INTERESTS.md`

可选参数：

```bash
npm run configure:openclaw -- --profile-json /path/to/profile.json
npm run configure:openclaw -- --accounts .state/feishu-accounts.json
npm run configure:openclaw -- --suite-root ~/.openclaw/executive-feishu-suite
npm run configure:openclaw -- --extra-skills /abs/path/to/skillA,/abs/path/to/skillB
npm run configure:openclaw -- --dry-run
```

## 全流程

```bash
npm run setup:all
```

等价于：

1. 创建 4 个飞书应用
2. 安装 suite 到 `~/.openclaw`
3. 写入共享画像与 4 个 agent 模板

## 安装仓库内置技能

```bash
npm run install:skills
```

默认会安装：

- `executive-profile-onboarding`
- `ai-it-radar`
- `care-companion`
- `fun-feed`
- `music-scout`
- `xiaomi-sentinel`

## 首次初始化方式

有两种入口：

1. 浏览器问卷：适合一次性完整填写
2. 机器人对话：每个 agent 都内置 `executive-profile-onboarding` skill

当共享 `USER.md` 仍是 `pending` 状态时，机器人在首次私聊中会优先引导完成画像初始化，并更新：

- `USER.md`
- `MEMORY.md`
- `radar/INTERESTS.md`（仅主动推送型 / 混合型）

## 重要文件

- 共享画像：
  - `~/.openclaw/executive-feishu-suite/shared/USER.md`
  - `~/.openclaw/executive-feishu-suite/shared/MEMORY.md`
  - `~/.openclaw/executive-feishu-suite/shared/TOOLS.md`
- 第二大脑：
  - `~/.openclaw/executive-feishu-suite/shared/radar/INTERESTS.md`
- 本地机密状态：
  - `.state/feishu-accounts.json`
  - `.state/feishu-artifacts/`

## 验证命令

```bash
npm run render:profile -- --demo
npm run configure:openclaw -- --dry-run
npm run validate:skill
```
