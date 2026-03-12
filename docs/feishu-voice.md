# Feishu 语音能力

## 结论

当前仓库默认按“无需额外 patch”的路径实现飞书语音：

- 接收语音：依赖 `tools.media.audio`
- 发送语音：依赖 `tts` 工具生成音频，再转成 `.opus`，最后通过 `message` 工具发送
- 如果遇到 OpenClaw 某版本的媒体发送 bug，再回退到 `clawgirl` 同类思路：直连飞书 API 发送 `msg_type: "audio"`

## 本机验证结论

2026-03-12 在本机 `openclaw` 2026.3.8 上做过真实验证：

- Feishu 插件实际加载成功
- `contact/v3/scopes` 可返回当前 app 下真实可用的 `open_id`
- 用 `openclaw message send` 成功发出文本消息
- 用 `openclaw message send --media <...>.opus` 成功发出语音消息
- `sendMediaFeishu` 真实进入飞书扩展发送链路
- 旧 app 的 `open_id` 会报 `99992361 open_id cross app`
- `/tmp/...` 音频路径会被本地路径白名单拦截
- `.opus` 发送逻辑由飞书扩展源码负责映射为 `msg_type: "audio"`

对应源码落点：

- `extensions/feishu/src/media.ts`
- `extensions/feishu/src/media.test.ts`

其中测试已明确断言 `.opus -> msg_type: "audio"`。

## 必须遵守

- 不要在回复文本中写 `MEDIA:`
- 必须通过 `message` 工具发
- 输出文件要放到 `~/.openclaw/media/` 或受允许目录
- 文件格式必须是 `.opus`
- 不要跨 app 复用旧 `open_id`

## `clawgirl` 融合点

`clawgirl` 里的 `voice.sh` 证明了另一条稳定路径：

- 先把音频转成 `.opus`
- 调飞书 `im/v1/files` 上传
- 再调飞书 `im/v1/messages`，强制 `msg_type: "audio"`

这个仓库已经把同类回退脚本放进：

- `skills/feishu-voice-reply/scripts/discover_feishu_scope_open_ids.sh`
- `skills/feishu-voice-reply/scripts/send_feishu_audio_direct.sh`

所以当前推荐策略是：

1. 正常情况优先用 OpenClaw `message` 工具
2. 如果你碰到尚未合并的上游 bug，再回退到直连飞书 API

## 推荐配置

```json5
{
  tools: {
    media: {
      audio: {
        enabled: true,
      },
    },
  },
  messages: {
    tts: {
      auto: "off",
      mode: "final",
      maxTextLength: 1200,
      edge: {
        enabled: true,
      },
    },
  },
  plugins: {
    entries: {
      feishu: {
        enabled: true,
      },
    },
  },
}
```

## 老版本兼容

如果你本机 OpenClaw 的飞书扩展还没有 `.opus -> audio` 这段逻辑，再运行：

```bash
python3 docs/patch_feishu_audio_msgtype.py
```

当前仓库默认不依赖它。
