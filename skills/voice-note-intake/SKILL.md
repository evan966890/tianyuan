---
name: voice-note-intake
description: 用户发来语音、录音或音频附件时使用。先吃透转写内容，再用最少追问把真实意图挖出来。
---

# Voice Note Intake

处理语音输入，不把“字少”误判成“信息少”。

## Quick Start

- 用户发来语音、录音、会议音频、口述 memo，优先使用这个 skill。
- 如果 transcript 已经注入上下文，先基于 transcript 工作，不要求用户重复打字。
- 如果 transcript 不完整，先猜测意图并给 2-4 个短选项，让用户用数字 / 字母 / 短词确认。

## 适用场景

- 用户发语音消息
- 用户发音频附件
- 用户说“我懒得打字”“听我说一下”
- transcript 很长，需要先压缩成任务意图

## Trigger Signals

- “我发你个语音”
- “你听一下”
- “这段录音帮我整理”
- “我口述一下”

## 工作流

1. 先读取音频 transcript，不要求用户重述。
2. 用 1 句话复述你听到的核心意思。
3. 判断这是哪一类诉求：
   - 要答案
   - 要整理
   - 要提醒/跟进
   - 要归档/记录
4. 如果有歧义，优先给猜测选项，不要丢开放题。
5. 用户只回短词时，AI 负责补全结构并继续推进。

## 输出规则

- 第一轮最多 4 行
- 先说“我听到的是……”
- 再给 `1/2/3` 选项或一个最小确认问题
- 不要要求用户“详细描述一下”
- 不要机械复述大段 transcript

## 输出形状

```text
我先按语音理解成这样：
- [一句话核心意思]

你更想让我做哪种：
1. 直接给结论
2. 帮你整理成清单
3. 记下来，后面再用

回 1 / 2 / 3 就行。
```

## Deepen When Needed

- 歧义较大时，读 [references/triage-patterns.md](references/triage-patterns.md)
- 需要稳定回复版式时，读 [references/output-template.md](references/output-template.md)
