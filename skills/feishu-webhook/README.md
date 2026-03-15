# Feishu Webhook

使用飞书Webhook发送富文本消息。

## 使用方法

```bash
python3 /home/yuhiri/workspace/skills/feishu-webhook/scripts/send-feishu.py << 'EOF'
# 在这里写Markdown内容（避免使用1-2级标题；3-6级标题均可）
- 列表
- **粗体文本**
EOF
```

## 功能

- 📝 Heredoc 输入
- 📄 Markdown 支持（飞书卡片样式）
- ⚙️ 从 OpenClaw 配置读取环境变量

## 配置 (OpenClaw)

在 `~/.openclaw/openclaw.json` 的 `env.vars` 中添加：

```json
{
  "env": {
    "vars": {
      "FEISHU_WEBHOOK_URL": "https://open.feishu.cn/open-apis/bot/v2/hook/xxx",
      "FEISHU_WEBHOOK_SECRET": "your_secret"
    }
  }
}
```

## 文件说明

- `scripts/send-feishu.py` - 主脚本

## 版本

- **1.2.1**
