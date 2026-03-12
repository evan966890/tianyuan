# OpenClaw 原生能力接入说明

这份仓库把“原生能力”分成 3 类，不混着处理：

## 1. 核心原生工具

这些本来就是 OpenClaw 核心工具面，不需要仓库重复安装：

- `web_search`
- `web_fetch`
- `browser`
- `pdf`
- `image`
- `tts`
- `Read`
- `Write`
- `Edit`
- `exec`
- `process`
- `subagents`
- `canvas`
- `message`
- `nodes`

启用规则：

- 主要靠 `tools.profile = full`
- 仓库通过 `npm run ensure:native-capabilities` 做配置补齐和校验摘要

## 2. Feishu 插件工具

这些能力来自 Feishu 插件或它附带的扩展技能，不要当成仓库自带 skill 去重复复制：

- `feishu_doc` <- `feishu-doc`
- `feishu_app_scopes` <- `feishu-perm`
- `feishu_drive` <- `feishu-drive`
- `feishu_wiki` <- `feishu-wiki`
- `feishu_chat` <- Feishu plugin
- `feishu_bitable_*` <- Feishu plugin

启用规则：

- `plugins.entries.feishu.enabled = true`
- `channels.feishu.enabled = true`
- 已配置至少一个可用 Feishu account

## 3. Bundled / Native fallback

这些是仓库明确依赖的 native/bundled 提供者：

- `peekaboo`

用途：

- 豆包免费生图在 Browser 不稳定时回退
- 本地 native UI 操作

启用规则：

- `skills.allowBundled` 必须包含 `peekaboo`
- `skills.entries.peekaboo.enabled = true`

## 判重原则

- 已经由 OpenClaw 原生提供的，不重复安装
- 已经由 Feishu 插件加载的，不复制成仓库 skill
- 已经 ready 的 bundled/native provider，只做记录，不重复变更
- 只有配置缺失时才补齐配置项

## 命令

```bash
npm run ensure:native-capabilities
```

Dry run：

```bash
npm run ensure:native-capabilities -- --dry-run
```

输出内容包括：

- 当前 OpenClaw 版本
- 原生工具清单
- Feishu 工具由谁提供
- `peekaboo` / `feishu-doc` / `feishu-drive` / `feishu-perm` / `feishu-wiki` 是否 ready
- Feishu 插件是否 loaded
- Feishu channel 是否支持 `media`

## 适用边界

- 这不是 OpenClaw 升级器
- 如果某台机器的 OpenClaw 版本过旧，缺少这些原生能力，先升级 OpenClaw，再跑这个脚本
