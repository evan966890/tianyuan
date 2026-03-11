# MiMo/非 Claude 模型工具调用修复

## 问题

OpenAI 兼容模型有时会输出 XML 风格的伪工具调用，而不是原生 `tool_calls`。

## 修复

在 `openclaw.json` 中设置：

```json
{
  "tools": {
    "profile": "full"
  }
}
```

## 当前项目落点

- `scripts/configure-openclaw-suite.mjs` 会默认补上 `tools.profile = "full"`
- 这样 MiMo、Qwen、Kimi、GLM、DeepSeek 等 OpenAI 兼容模型更容易走原生工具调用
