# 消息防抖和队列策略

## 推荐配置

```json
{
  "messages": {
    "queue": {
      "mode": "collect",
      "debounceMs": 2000,
      "cap": 20,
      "drop": "old"
    },
    "inbound": {
      "debounceMs": 3000,
      "byChannel": {
        "feishu": 3000
      }
    },
    "ackReactionScope": "group-mentions"
  }
}
```

## 用途

- 合并用户连续碎片化输入
- 避免每条消息都触发一次 LLM
- 减少重复回复和上下文切碎

## 当前项目落点

- `scripts/configure-openclaw-suite.mjs` 会把这些值作为默认值写入 `~/.openclaw/openclaw.json`
- 如果用户已有更明确配置，脚本只补默认值，不强行覆盖
