# 飞书高管四 Agent 套件

一个可迁移的 OpenClaw 项目模板，用来一键搭建 4 个飞书高管机器人：

- 商业参谋 `strategist`
- 效率管家 `chief-of-staff`
- 生活助理 `life-concierge`
- 知识管家 `second-brain`

仓库同时包含五类能力：

1. 4 个 agent 的完整 workspace 模板
2. 高管画像问卷与 `USER.md` / `MEMORY.md` / `radar/INTERESTS.md` 生成器
3. 读取 ClawMom 飞书自动化脚本后封装的一键建 bot + OpenClaw 配置注入脚本
4. 语音输入 / 飞书语音回复技能与对应配置
5. 复用用户 cookie 的豆包免费生图能力
6. OpenViking 记忆插件的可选接入入口

## 目录

- `AI_PROMPT.md`：给本地 AI 的执行提示
- `AI_SPEC.yaml`：机器可执行安装规格
- `apps/questionnaire/`：纯前端单页问卷
- `config/messages-and-queue.md`：消息防抖和队列策略
- `lib/`：问卷字段、Markdown 生成器、suite 清单、Node 辅助函数
- `scripts/`：问卷预览、飞书建 bot、OpenClaw 注入、一键安装
- `docs/feishu-voice.md`：飞书语音能力说明与验证结论
- `docs/doubao-image.md`：豆包免费生图与 cookie 复用说明
- `docs/openviking-memory.md`：OpenViking 记忆插件可选接入说明
- `skills/`：仓库内置的全局技能
- `shared-profile/`：共享 `USER.md` / `MEMORY.md` / `TOOLS.md` 初始模板
- `templates/agents/`：4 个 agent 的独立文件模板
- `templates/skills/executive-profile-onboarding/`：首次角色初始化 skill
- `troubleshooting/mimo-tool-calls.md`：MiMo / 非 Claude 工具调用修复
- `tools/feishu-automation/`：ClawMom 飞书自动化脚本副本

## 前置要求

- Windows / macOS / Linux
- Node.js 20+
- Chrome / Edge / Brave / Chromium 之一
- 已安装 ClawMom / OpenClaw
- 当前机器可登录飞书开放平台

说明：

- 如果 `~/.openclaw/openclaw.json` 不存在，配置脚本会自动创建最小可用配置
- 如果本地已经有完整的 `.state/feishu-accounts.json`，可以跳过飞书 provisioning

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
- 自动化会尽量关闭首登后的安全引导弹窗；为了避免重复触发，建议固定使用同一个 `--profile-dir`
- 结果默认写入 `.state/feishu-accounts.json`
- 如果当前机器已经有可用的 `.state/feishu-accounts.json`，这一步不是必须

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
- 启用 Feishu 插件，并写入当前版本兼容的多账号 schema
- 为入站语音补 `tools.media.audio.enabled = true`
- 为入站语音补本地 `whisper` CLI 转写模型
- 为语音回复补 `messages.tts` 默认配置（默认不自动发语音）
- 为本地 UI 自动化放行 bundled `peekaboo`
- 如果当前配置里有旧的 `meta.lastExecutiveSuiteSyncAt`，会自动移除
- 增量更新 `~/.openclaw/openclaw.json`
- 为 4 个 Feishu account 建立 `bindings`
- 为 second-brain 挂载 `radar/INTERESTS.md`
- 非 `--dry-run` 情况下，需要真实可用的 `.state/feishu-accounts.json`，不会再写入占位凭证

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
4. 安装仓库内置 skills（含语音能力）

如果当前机器已经有可复用的 `.state/feishu-accounts.json`，可以执行：

```bash
npm run setup:all -- --skip-provision
```

如果你还想把 OpenViking 一起接进去：

```bash
npm run setup:all -- --install-openviking-memory
```

这一步是可选的，不会默认执行。

## 安装仓库内置技能

```bash
npm run install:skills
```

默认会安装：

- `executive-profile-onboarding`
- `board-brief-builder`
- `decision-options-memo`
- `doubao-image-studio`
- `meeting-prep-pack`
- `action-closure-tracker`
- `executive-travel-desk`
- `feishu-voice-reply`
- `gift-and-hospitality`
- `source-reliability-triage`
- `note-synthesis-linker`
- `voice-note-intake`
- `ai-it-radar`
- `care-companion`
- `fun-feed`
- `music-scout`
- `xiaomi-sentinel`

## 可选：接入 OpenViking 记忆插件

如果你希望升级 OpenClaw 的长程记忆，可以直接用仓库内包装器调用 OpenViking 官方安装脚本：

```bash
npm run install:openviking-memory
```

非交互模式：

```bash
npm run install:openviking-memory -- --yes
```

说明：

- 仓库不会默认启用它
- 这层包装器只负责把当前 `OPENCLAW_HOME` 补成默认 `--workdir`
- 真正的安装逻辑仍然来自 OpenViking 官方脚本

详细约束见 [docs/openviking-memory.md](docs/openviking-memory.md)。

## 语音能力

仓库现在内置两条语音工作流：

- `voice-note-intake`
  - 用户发语音、录音、音频附件时，先基于 transcript 理解诉求，再用最少追问推进
- `feishu-voice-reply`
  - 用户明确要语音回复时，先做 TTS，再转 `.opus`，优先通过 `message` 工具发成飞书语音气泡；若遇到上游 bug，再回退到直连飞书 API

飞书语音的关键约束见 [docs/feishu-voice.md](docs/feishu-voice.md)：

- 不要在文本里写 `MEDIA:`
- 必须通过 `message` 工具发送
- 本地文件要放到 `~/.openclaw/media/` 或允许目录
- 不要跨 app 复用旧 `open_id`
- 当前仓库也内置了 `clawgirl` 同类回退脚本，可在 OpenClaw 媒体发送异常时继续发飞书原生语音

收语音默认走免费本地链路：

- Feishu 入站 `audio` 会先下载为本地媒体
- `tools.media.audio.models` 默认补本机 `whisper` CLI
- agent 拿到 transcript 后再继续走 `voice-note-intake`

## 免费生图

仓库现在内置 `doubao-image-studio`：

- 第一次：让用户自己在原浏览器里扫码登录豆包
- 第二次：关闭用户浏览器，把用户 profile/cookie 同步到 OpenClaw Browser
- 之后：由 OpenClaw Browser 驱动豆包 Web 生图
- 回退：如果 CDP 页面状态不稳，就用 `peekaboo`

初始化命令：

```bash
npm run bootstrap:doubao-cookie -- --source-browser chrome --source-profile Default --target-profile openclaw
```

详细约束见 [docs/doubao-image.md](docs/doubao-image.md)。

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
