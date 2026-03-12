# OpenViking 记忆插件接入

## 结论

仓库现在已经内置 OpenViking 的可选接入入口，但默认不自动启用。

原因：

- OpenViking 需要额外依赖和配置
- 本地模式通常还需要 Ark API Key
- 这更适合按需增强，不适合无条件塞进默认初始化链路

## 官方来源

- 官方仓库：https://github.com/volcengine/OpenViking
- 官方安装脚本：
  - `https://raw.githubusercontent.com/volcengine/OpenViking/main/examples/openclaw-memory-plugin/install.sh`
- 官方中文说明：
  - `https://github.com/volcengine/OpenViking/blob/main/examples/openclaw-memory-plugin/INSTALL-ZH.md`

## 仓库内用法

默认把当前 OpenClaw 实例目录作为 `--workdir`：

```bash
npm run install:openviking-memory
```

非交互：

```bash
npm run install:openviking-memory -- --yes
```

指定实例：

```bash
npm run install:openviking-memory -- --workdir ~/.openclaw-second
```

如果你已经知道要走远端模式，官方安装器里也会继续引导配置。

## 这层包装器做了什么

仓库内脚本 [install-openviking-memory.sh](/Users/xiaomimacmini3/clawmom-feishu-exec-suite/scripts/install-openviking-memory.sh) 只是：

1. 调用 OpenViking 官方安装脚本
2. 默认补上当前 `OPENCLAW_HOME` 对应的 `--workdir`
3. 其余参数原样透传

也就是说，真正的安装逻辑仍然来自官方，不是仓库自己重写了一份。

## 前置条件

- Python >= 3.10
- Node.js >= 22
- 已安装 OpenClaw

## 何时建议安装

- 你想让 OpenClaw 获得更强的长程记忆
- 你愿意额外维护 OpenViking 依赖和模型 / API Key
- 你希望把记忆能力从本仓库默认的轻量基座升级成独立服务

## 何时不要默认安装

- 机器还在做最小初始化
- 当前没有 Ark API Key
- 只想先把 4 个 agent 跑起来，不想引入额外变量
