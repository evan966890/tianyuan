# Feishu Voice Guardrails

## 发送前检查

1. 当前渠道是 Feishu
2. 目标是当前活跃会话，或是当前 app 下重新解析过的目标
3. 输出文件在 `~/.openclaw/media/` 或允许目录
4. 文件扩展名是 `.opus`

## 为什么不能偷懒

- 文本里的 `MEDIA:` 行，Feishu 不会按语音气泡处理
- 旧 app 的 `open_id` 会报 `99992361 open_id cross app`
- `/tmp/...` 这类路径可能被 OpenClaw 拦截，报 `LocalMediaAccessError`

## 当前验证结论

- 本机 `openclaw` 2026.3.8 的飞书扩展源码已包含 `.opus -> msg_type: "audio"` 逻辑
- 因此当前版本优先直接用 `message` 工具，不需要额外绕路发飞书 API
- 老版本如果没有这段逻辑，再考虑运行仓库内的 `docs/patch_feishu_audio_msgtype.py`

## 推荐发送形态

```text
1. tts 工具产出临时音频
2. 转成 ~/.openclaw/media/xxx.opus
3. message({ action: "send", media: "<path>" })
4. NO_REPLY
```
