export const NATIVE_CORE_TOOLS = [
  "web_search",
  "web_fetch",
  "browser",
  "pdf",
  "image",
  "tts",
  "Read",
  "Write",
  "Edit",
  "exec",
  "process",
  "subagents",
  "canvas",
  "message",
  "nodes",
];

export const NATIVE_FEISHU_TOOL_PROVIDERS = [
  {
    tool: "feishu_doc",
    provider: "feishu-doc",
    type: "skill",
  },
  {
    tool: "feishu_app_scopes",
    provider: "feishu-perm",
    type: "skill",
  },
  {
    tool: "feishu_drive",
    provider: "feishu-drive",
    type: "skill",
  },
  {
    tool: "feishu_wiki",
    provider: "feishu-wiki",
    type: "skill",
  },
  {
    tool: "feishu_chat",
    provider: "feishu",
    type: "plugin",
  },
  {
    tool: "feishu_bitable_*",
    provider: "feishu",
    type: "plugin",
  },
];

export const REQUIRED_NATIVE_SKILLS = ["peekaboo", "feishu-doc", "feishu-drive", "feishu-perm", "feishu-wiki"];
export const REQUIRED_NATIVE_PLUGINS = ["feishu"];

export function defaultOpenClawConfig() {
  return {
    auth: {},
    models: {},
    agents: {
      defaults: {},
      list: [],
    },
    tools: {},
    commands: {},
    channels: {},
    gateway: {},
    plugins: {},
    bindings: [],
  };
}

export function ensureToolProfile(nextConfig) {
  nextConfig.tools ??= {};
  nextConfig.tools.profile ??= "full";
}

export function ensureQueueDefaults(nextConfig) {
  nextConfig.messages ??= {};
  nextConfig.messages.queue = {
    mode: nextConfig.messages.queue?.mode ?? "collect",
    debounceMs: nextConfig.messages.queue?.debounceMs ?? 2000,
    cap: nextConfig.messages.queue?.cap ?? 20,
    drop: nextConfig.messages.queue?.drop ?? "old",
  };
  nextConfig.messages.inbound = {
    ...(nextConfig.messages.inbound ?? {}),
    debounceMs: nextConfig.messages.inbound?.debounceMs ?? 3000,
    byChannel: {
      ...(nextConfig.messages.inbound?.byChannel ?? {}),
      feishu: nextConfig.messages.inbound?.byChannel?.feishu ?? 3000,
    },
  };
  nextConfig.messages.ackReactionScope ??= "group-mentions";
}

export function ensureFeishuPlugin(nextConfig) {
  nextConfig.plugins ??= {};
  nextConfig.plugins.entries ??= {};
  nextConfig.plugins.entries.feishu = {
    ...(nextConfig.plugins.entries.feishu ?? {}),
    enabled: true,
  };
}

export function ensureVoiceSupport(nextConfig) {
  nextConfig.tools ??= {};
  nextConfig.tools.media ??= {};
  nextConfig.tools.media.audio = {
    ...(nextConfig.tools.media.audio ?? {}),
    enabled: nextConfig.tools.media.audio?.enabled ?? true,
    maxBytes: nextConfig.tools.media.audio?.maxBytes ?? 20 * 1024 * 1024,
    echoTranscript: nextConfig.tools.media.audio?.echoTranscript ?? false,
  };
  if (!Array.isArray(nextConfig.tools.media.audio.models) || nextConfig.tools.media.audio.models.length === 0) {
    nextConfig.tools.media.audio.models = [
      {
        type: "cli",
        command: "whisper",
        args: ["--model", "base", "{{MediaPath}}"],
      },
    ];
  }

  nextConfig.messages ??= {};
  nextConfig.messages.tts = {
    ...(nextConfig.messages.tts ?? {}),
    auto: nextConfig.messages.tts?.auto ?? "off",
    mode: nextConfig.messages.tts?.mode ?? "final",
    maxTextLength: nextConfig.messages.tts?.maxTextLength ?? 1200,
    edge: {
      ...(nextConfig.messages.tts?.edge ?? {}),
      enabled: nextConfig.messages.tts?.edge?.enabled ?? true,
    },
  };
}

export function ensurePeekabooSupport(nextConfig) {
  nextConfig.skills ??= {};
  const allowBundled = new Set(Array.isArray(nextConfig.skills.allowBundled) ? nextConfig.skills.allowBundled : []);
  allowBundled.add("peekaboo");
  nextConfig.skills.allowBundled = [...allowBundled];
  nextConfig.skills.entries ??= {};
  nextConfig.skills.entries.peekaboo = {
    ...(nextConfig.skills.entries.peekaboo ?? {}),
    enabled: nextConfig.skills.entries.peekaboo?.enabled ?? true,
  };
}

export function applyNativeCapabilityDefaults(nextConfig) {
  ensureToolProfile(nextConfig);
  ensureQueueDefaults(nextConfig);
  ensureVoiceSupport(nextConfig);
  ensurePeekabooSupport(nextConfig);
  ensureFeishuPlugin(nextConfig);
  return nextConfig;
}

export function summarizeNativeCapabilityConfig(config) {
  return {
    toolsProfile: config.tools?.profile ?? null,
    audio: {
      enabled: config.tools?.media?.audio?.enabled ?? false,
      models: config.tools?.media?.audio?.models ?? [],
    },
    queue: {
      mode: config.messages?.queue?.mode ?? null,
      debounceMs: config.messages?.queue?.debounceMs ?? null,
      cap: config.messages?.queue?.cap ?? null,
      drop: config.messages?.queue?.drop ?? null,
    },
    inbound: {
      debounceMs: config.messages?.inbound?.debounceMs ?? null,
      feishuDebounceMs: config.messages?.inbound?.byChannel?.feishu ?? null,
    },
    ackReactionScope: config.messages?.ackReactionScope ?? null,
    tts: {
      auto: config.messages?.tts?.auto ?? null,
      mode: config.messages?.tts?.mode ?? null,
      maxTextLength: config.messages?.tts?.maxTextLength ?? null,
      edgeEnabled: config.messages?.tts?.edge?.enabled ?? null,
    },
    feishuPluginEnabled: config.plugins?.entries?.feishu?.enabled ?? false,
    allowBundled: config.skills?.allowBundled ?? [],
    peekabooEnabled: config.skills?.entries?.peekaboo?.enabled ?? false,
  };
}
