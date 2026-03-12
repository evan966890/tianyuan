#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import process from "node:process";
import { renderDocuments } from "../lib/profile-renderer.mjs";
import { AGENT_SPECS, DEFAULT_FEISHU_ACCOUNTS_FILE, SUITE_ROOT_NAME } from "../lib/suite-manifest.mjs";
import {
  repoRootFromImport,
  parseArgs,
  resolveHomePath,
  ensureDir,
  readJson,
  readJsonIfExists,
  copyDirRecursive,
  copyFile,
  writeJson,
  writeTextFile,
  fileExists,
  readTextIfExists,
  ensureSymlink,
} from "../lib/node-helpers.mjs";

function todayOffset(days = 0) {
  const now = new Date();
  now.setDate(now.getDate() + days);
  return now.toISOString().slice(0, 10);
}

function defaultAccountsFallback() {
  return {
    accounts: Object.fromEntries(
      AGENT_SPECS.map((spec) => [
        spec.id,
        {
          accountId: spec.id,
          botName: spec.botName,
          appId: `cli_placeholder_${spec.id}`,
          appSecret: `placeholder_secret_${spec.id}`,
        },
      ]),
    ),
  };
}

function isPlaceholderAccount(account) {
  return String(account?.appId || "").startsWith("cli_placeholder_")
    || String(account?.appSecret || "").startsWith("placeholder_secret_");
}

function validateAccountsData(accountsData, accountsPath) {
  if (!accountsData?.accounts) {
    throw new Error(`Accounts file not found: ${accountsPath}`);
  }

  const errors = [];
  for (const spec of AGENT_SPECS) {
    const account = accountsData.accounts?.[spec.id];
    if (!account) {
      errors.push(`missing ${spec.id}`);
      continue;
    }
    if (!account.appId || !account.appSecret) {
      errors.push(`incomplete ${spec.id}`);
      continue;
    }
    if (isPlaceholderAccount(account)) {
      errors.push(`placeholder ${spec.id}`);
    }
  }

  if (errors.length) {
    throw new Error(
      `Usable Feishu accounts are required before configure: ${errors.join(", ")}. Run npm run provision:feishu first or provide --accounts with real credentials.`,
    );
  }
}

function defaultOpenClawConfig() {
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

function ensureFeishuPlugin(nextConfig) {
  nextConfig.plugins ??= {};
  nextConfig.plugins.entries ??= {};
  nextConfig.plugins.entries.feishu = {
    ...(nextConfig.plugins.entries.feishu ?? {}),
    enabled: true,
  };
}

function ensureVoiceSupport(nextConfig) {
  nextConfig.tools ??= {};
  nextConfig.tools.media ??= {};
  nextConfig.tools.media.audio = {
    ...(nextConfig.tools.media.audio ?? {}),
    enabled: nextConfig.tools.media.audio?.enabled ?? true,
    maxBytes: nextConfig.tools.media.audio?.maxBytes ?? 20 * 1024 * 1024,
    echoTranscript: nextConfig.tools.media.audio?.echoTranscript ?? false,
  };

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

function parseCsvArg(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

async function copyFileIfNeeded(sourcePath, targetPath, overwrite = false) {
  if (!overwrite && (await fileExists(targetPath))) {
    return;
  }
  await copyFile(sourcePath, targetPath);
}

async function seedAgentState(openclawHome, agentId) {
  const targetRoot = path.join(openclawHome, "agents", agentId);
  const targetAgentDir = path.join(targetRoot, "agent");
  const targetSessionsDir = path.join(targetRoot, "sessions");
  const mainAgentDir = path.join(openclawHome, "agents", "main", "agent");

  await ensureDir(targetAgentDir);
  await ensureDir(targetSessionsDir);

  for (const fileName of ["auth-profiles.json", "models.json"]) {
    const targetFile = path.join(targetAgentDir, fileName);
    if (await fileExists(targetFile)) {
      continue;
    }
    const seedFile = path.join(mainAgentDir, fileName);
    if (await fileExists(seedFile)) {
      await copyFile(seedFile, targetFile);
    }
  }
}

async function installSharedProfile(repoRoot, suiteRoot, args) {
  const sharedRoot = path.join(suiteRoot, "shared");
  await ensureDir(path.join(sharedRoot, "radar"));

  if (args.profileJson) {
    const profilePath = path.resolve(resolveHomePath(args.profileJson));
    const rawProfile = JSON.parse(await fs.readFile(profilePath, "utf8"));
    const docs = renderDocuments(rawProfile);
    await writeTextFile(path.join(sharedRoot, "USER.md"), docs.user);
    await writeTextFile(path.join(sharedRoot, "MEMORY.md"), docs.memory);
    await writeTextFile(
      path.join(sharedRoot, "radar", "INTERESTS.md"),
      docs.radar ?? "<!-- executive-radar-status: disabled -->\n# 知识雷达 · 兴趣画像\n\n## 状态\n\n- 当前为按需搜索型，尚未启用主动推送。\n",
    );
    await writeJson(path.join(sharedRoot, "profile.json"), rawProfile);
  } else {
    await copyFileIfNeeded(path.join(repoRoot, "shared-profile", "USER.md"), path.join(sharedRoot, "USER.md"), Boolean(args.forceShared));
    await copyFileIfNeeded(path.join(repoRoot, "shared-profile", "MEMORY.md"), path.join(sharedRoot, "MEMORY.md"), Boolean(args.forceShared));
    await copyFileIfNeeded(path.join(repoRoot, "shared-profile", "radar", "INTERESTS.md"), path.join(sharedRoot, "radar", "INTERESTS.md"), Boolean(args.forceShared));
  }

  await copyFileIfNeeded(path.join(repoRoot, "shared-profile", "TOOLS.md"), path.join(sharedRoot, "TOOLS.md"), Boolean(args.refreshTools));
  return sharedRoot;
}

async function installWorkspaceTemplates(repoRoot, suiteRoot, sharedRoot, args) {
  for (const spec of AGENT_SPECS) {
    const sourceDir = path.join(repoRoot, "templates", "agents", spec.templateDirName);
    const targetDir = path.join(suiteRoot, "agents", spec.workspaceDirName);
    const refreshPersona = Boolean(args.refreshPersona);

    await ensureDir(targetDir);
    await ensureDir(path.join(targetDir, "memory"));
    const templateEntries = await fs.readdir(sourceDir, { withFileTypes: true });
    for (const entry of templateEntries) {
      const sourcePath = path.join(sourceDir, entry.name);
      const targetPath = path.join(targetDir, entry.name);
      if (entry.isDirectory()) {
        if (refreshPersona || !(await fileExists(targetPath))) {
          await copyDirRecursive(sourcePath, targetPath);
        }
        continue;
      }
      await copyFileIfNeeded(sourcePath, targetPath, refreshPersona);
    }

    await ensureSymlink(path.join(sharedRoot, "USER.md"), path.join(targetDir, "USER.md"));
    await ensureSymlink(path.join(sharedRoot, "MEMORY.md"), path.join(targetDir, "MEMORY.md"));
    await ensureSymlink(path.join(sharedRoot, "TOOLS.md"), path.join(targetDir, "TOOLS.md"));

    if (spec.id === "second-brain") {
      await ensureDir(path.join(targetDir, "radar"));
      await ensureSymlink(path.join(sharedRoot, "radar", "INTERESTS.md"), path.join(targetDir, "radar", "INTERESTS.md"));
      if (!(await fileExists(path.join(targetDir, "notes", "INDEX.md")))) {
        await writeTextFile(path.join(targetDir, "notes", "INDEX.md"), "# 知识索引\n\n- [待初始化]\n");
      }
    }

    for (const offset of [0, -1]) {
      const dailyPath = path.join(targetDir, "memory", `${todayOffset(offset)}.md`);
      if (!(await fileExists(dailyPath))) {
        await writeTextFile(
          dailyPath,
          `# ${todayOffset(offset)}\n\n- Status: initialized\n- Notes:\n  - [待补充]\n`,
        );
      }
    }
  }
}

async function installSkillDir(sourceDir, targetRoot) {
  const resolvedSource = path.resolve(resolveHomePath(sourceDir));
  const skillName = path.basename(resolvedSource);
  const targetDir = path.join(targetRoot, skillName);
  await fs.rm(targetDir, { recursive: true, force: true });
  await copyDirRecursive(resolvedSource, targetDir);
  return { skillName, sourceDir: resolvedSource, targetDir };
}

function mergeAgentEntries(config, openclawHome, suiteRoot) {
  const list = Array.isArray(config.agents?.list) ? [...config.agents.list] : [];
  for (const spec of AGENT_SPECS) {
    const entry = {
      id: spec.id,
      workspace: path.join(suiteRoot, "agents", spec.workspaceDirName),
      agentDir: path.join(openclawHome, "agents", spec.id, "agent"),
    };
    const index = list.findIndex((item) => item.id === spec.id);
    if (index === -1) {
      list.push(entry);
    } else {
      list[index] = { ...list[index], ...entry };
    }
  }
  return list;
}

function mergeBindings(config) {
  const bindings = Array.isArray(config.bindings) ? [...config.bindings] : [];
  for (const spec of AGENT_SPECS) {
    const exists = bindings.some(
      (binding) =>
        binding.agentId === spec.id &&
        binding.match?.channel === "feishu" &&
        binding.match?.accountId === spec.id,
    );
    if (!exists) {
      bindings.push({
        agentId: spec.id,
        match: {
          channel: "feishu",
          accountId: spec.id,
        },
      });
    }
  }
  return bindings;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const dryRun = Boolean(args.dryRun);
  const repoRoot = repoRootFromImport(import.meta.url);
  const openclawHome = path.resolve(resolveHomePath(args.openclawHome || "~/.openclaw"));
  const configPath = path.resolve(resolveHomePath(args.config || path.join(openclawHome, "openclaw.json")));
  const suiteRoot = path.resolve(resolveHomePath(args.suiteRoot || path.join(openclawHome, SUITE_ROOT_NAME)));
  const accountsPath = path.resolve(repoRoot, args.accounts ? resolveHomePath(args.accounts) : DEFAULT_FEISHU_ACCOUNTS_FILE);
  const skillSourceDir = path.join(repoRoot, "templates", "skills", "executive-profile-onboarding");
  const skillTargetDir = path.join(openclawHome, "skills", "executive-profile-onboarding");
  const extraSkillInputs = parseCsvArg(args.extraSkills);

  const config = (await readJsonIfExists(configPath, null)) ?? defaultOpenClawConfig();
  const accountsData = dryRun
    ? ((await readJsonIfExists(accountsPath, defaultAccountsFallback())) ?? defaultAccountsFallback())
    : await readJsonIfExists(accountsPath, null);

  if (!dryRun) {
    validateAccountsData(accountsData, accountsPath);
  }

  const sharedRoot = path.join(suiteRoot, "shared");
  const nextConfig = structuredClone(config);
  nextConfig.tools ??= {};
  nextConfig.tools.profile ??= "full";
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
  ensureVoiceSupport(nextConfig);
  ensureFeishuPlugin(nextConfig);
  nextConfig.channels ??= {};
  nextConfig.channels.feishu ??= {};
  nextConfig.channels.feishu.enabled = true;
  nextConfig.channels.feishu.connectionMode ??= "websocket";
  nextConfig.channels.feishu.accounts = {
    ...(nextConfig.channels.feishu.accounts ?? {}),
  };
  nextConfig.channels.feishu.accounts.default = {
    ...(nextConfig.channels.feishu.accounts.default ?? {}),
    dmPolicy: nextConfig.channels.feishu.accounts.default?.dmPolicy ?? nextConfig.channels.feishu.dmPolicy ?? "open",
    allowFrom: nextConfig.channels.feishu.accounts.default?.allowFrom ?? nextConfig.channels.feishu.allowFrom ?? ["*"],
  };
  delete nextConfig.channels.feishu.dmPolicy;
  delete nextConfig.channels.feishu.allowFrom;

  for (const spec of AGENT_SPECS) {
    const account = accountsData.accounts?.[spec.id];
    if (!account) {
      throw new Error(`Missing account payload for ${spec.id} in ${accountsPath}`);
    }
    nextConfig.channels.feishu.accounts[spec.id] = {
      appId: account.appId,
      appSecret: account.appSecret,
      botName: account.botName || spec.botName,
    };
  }

  nextConfig.channels.feishu.defaultAccount ??= Object.keys(nextConfig.channels.feishu.accounts)[0];
  nextConfig.gateway ??= {};
  nextConfig.gateway.mode ??= "local";
  nextConfig.gateway.bind ??= "loopback";
  nextConfig.agents ??= {};
  nextConfig.agents.defaults ??= {};
  nextConfig.agents.list = mergeAgentEntries(nextConfig, openclawHome, suiteRoot);
  nextConfig.bindings = mergeBindings(nextConfig);
  if (nextConfig.meta && typeof nextConfig.meta === "object") {
    delete nextConfig.meta.lastExecutiveSuiteSyncAt;
    if (!Object.keys(nextConfig.meta).length) {
      delete nextConfig.meta;
    }
  }

  const summary = {
    suiteRoot,
    configPath,
    accountsPath,
    skillTargetDir,
    extraSkills: extraSkillInputs,
    agents: AGENT_SPECS.map((spec) => ({
      id: spec.id,
      workspace: path.join(suiteRoot, "agents", spec.workspaceDirName),
    })),
  };

  if (dryRun) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  await ensureDir(suiteRoot);
  await installSharedProfile(repoRoot, suiteRoot, args);
  await installWorkspaceTemplates(repoRoot, suiteRoot, sharedRoot, args);
  await ensureDir(path.dirname(skillTargetDir));
  await fs.rm(skillTargetDir, { recursive: true, force: true });
  await copyDirRecursive(skillSourceDir, skillTargetDir);
  const installedExtraSkills = [];
  if (extraSkillInputs.length) {
    const extraSkillRoot = path.join(openclawHome, "skills");
    await ensureDir(extraSkillRoot);
    for (const skillInput of extraSkillInputs) {
      const repoRelativeSource = path.join(repoRoot, skillInput);
      const sourceDir = (await fileExists(repoRelativeSource)) ? repoRelativeSource : skillInput;
      installedExtraSkills.push(await installSkillDir(sourceDir, extraSkillRoot));
    }
  }

  for (const spec of AGENT_SPECS) {
    await seedAgentState(openclawHome, spec.id);
  }

  const backupDir = path.join(repoRoot, ".state", "openclaw-backups");
  const backupPath = path.join(backupDir, `openclaw.${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  await ensureDir(backupDir);
  if (await fileExists(configPath)) {
    await copyFile(configPath, backupPath);
  } else {
    await writeJson(backupPath, config);
  }
  await writeJson(configPath, nextConfig);

  const currentTools = await readTextIfExists(path.join(sharedRoot, "TOOLS.md"));
  if (!currentTools) {
    await writeTextFile(path.join(sharedRoot, "TOOLS.md"), "## Feishu operating notes\n");
  }

  console.log(`Suite installed to ${suiteRoot}`);
  console.log(`OpenClaw config updated: ${configPath}`);
  console.log(`Backup saved to ${backupPath}`);
  if (installedExtraSkills.length) {
    for (const skill of installedExtraSkills) {
      console.log(`Extra skill installed: ${skill.skillName} -> ${skill.targetDir}`);
    }
  }
}

await main();
