# Bundled Skills

- `board-brief-builder`
- `decision-options-memo`
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

这些技能是仓库内置的全局技能。

推荐映射：

- 商业参谋：`board-brief-builder`、`decision-options-memo`、`xiaomi-sentinel`
- 效率管家：`meeting-prep-pack`、`action-closure-tracker`、`voice-note-intake`
- 生活助理：`executive-travel-desk`、`gift-and-hospitality`、`care-companion`、`feishu-voice-reply`
- 知识管家：`source-reliability-triage`、`note-synthesis-linker`、`ai-it-radar`、`voice-note-intake`
- 全角色共享：`voice-note-intake`、`feishu-voice-reply`

语音相关补充：

- `voice-note-intake` 负责吃进语音输入，尽量不让用户重复打字
- `feishu-voice-reply` 负责把回复发成飞书语音气泡
- `feishu-voice-reply` 内置两条发送路径：优先 OpenClaw `message`，异常时回退直连飞书 API

设计原则：

- 一个 skill 只解决一种高频工作流
- 输出形状固定，减少 agent 临场发挥
- 先做筛选和压缩，再做生成和归档
- 高风险动作保持确认门槛

安装方式：

```bash
bash scripts/install-skills.sh
```
