---
name: feishu-voice-reply
description: 用户明确要语音回复，或 Feishu 私聊里语气比文字更重要时使用。把回复转成 Feishu 原生语音气泡而不是音频文件。
---

# Feishu Voice Reply

把回复发成飞书语音气泡，不发成普通文件。

## Quick Start

- 仅在 Feishu 场景使用。
- 用户说“回个语音”“发语音给我”“用语音说”时，优先使用这个 skill。
- 目标是发语音气泡，不是把音频文件丢出去。

## Trigger Signals

- “回个语音”
- “你直接发语音给我”
- “语音讲”
- “别打字了，语音说”

## 必须遵守

- 必须通过 `message` 工具发，不要在文本里写 `MEDIA:`
- 发出去的文件必须是 `.opus`，并放在 `~/.openclaw/media/` 或当前工作区允许目录
- 对 Feishu，优先依赖当前 OpenClaw 的 `message({ action: "send", media: "<path>" })`
- 如果当前 OpenClaw 版本的媒体发送有 bug，再回退到直连飞书 API 的脚本
- 不要手填旧 app 的 `open_id`
- 如果当前就在 Feishu 活跃会话里，优先让 `message` 复用当前会话目标，不额外指定旧 target
- 成功发出后，文本回复用 `NO_REPLY`

## 工作流

1. 先写一版适合口语表达的短文案。
2. 用 `tts` 工具生成音频源文件。
3. 用 [scripts/to_feishu_opus.sh](scripts/to_feishu_opus.sh) 转成 `~/.openclaw/media/*.opus`。
4. 用 `message` 工具发送这个 `.opus` 文件。
5. 如果 `message` 工具因当前 OpenClaw 媒体 bug 失败，再用 [scripts/send_feishu_audio_direct.sh](scripts/send_feishu_audio_direct.sh) 直连飞书 API。
6. 成功后返回 `NO_REPLY`。

## 口语稿规则

- 1 到 4 句
- 像人说话，不要书面腔
- 一段语音只讲一件事
- 如果有数字、日期、行动项，要读得顺

## 失败回退

- 如果 `tts` 不可用，直接说明“当前语音能力不可用”，再给正常文字回复
- 如果 `ffmpeg` 不可用，不要硬发 mp3；改为文字说明并停止
- 如果当前目标不是可用的 Feishu 会话，不要复用旧 `open_id`
- 如果需要重新找同 app 下可用的 `open_id` 做验证，先运行 [scripts/discover_feishu_scope_open_ids.sh](scripts/discover_feishu_scope_open_ids.sh)

## Deepen When Needed

- 飞书语音约束与坑点：读 [references/feishu-voice-guardrails.md](references/feishu-voice-guardrails.md)
- 语音文案怎么写得像人：读 [references/spoken-script-template.md](references/spoken-script-template.md)
