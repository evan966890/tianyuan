#!/usr/bin/env node

import path from "node:path";
import process from "node:process";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  defaultOpenClawConfig,
  applyNativeCapabilityDefaults,
  summarizeNativeCapabilityConfig,
  NATIVE_CORE_TOOLS,
  NATIVE_FEISHU_TOOL_PROVIDERS,
  REQUIRED_NATIVE_SKILLS,
  REQUIRED_NATIVE_PLUGINS,
} from "../lib/openclaw-config.mjs";
import {
  parseArgs,
  resolveHomePath,
  readJsonIfExists,
  writeJson,
  ensureDir,
  copyFile,
  fileExists,
} from "../lib/node-helpers.mjs";

const execFileAsync = promisify(execFile);

function extractSummaryLine(stdout, stderr) {
  return String(stdout || stderr || "")
    .split("\n")
    .find(Boolean)
    ?.trim() ?? "unknown";
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parsePluginStatus(output, pluginId) {
  const regex = new RegExp(`\\u2502[^\\n]*\\u2502\\s*${escapeRegex(pluginId)}\\s*\\u2502\\s*(loaded|disabled)\\s*\\u2502`, "i");
  const match = String(output).match(regex);
  return match ? match[1].toLowerCase() : "missing";
}

function parseSkillReady(output) {
  return /✓ Ready/.test(String(output));
}

function parseFeishuChannelCapabilities(output) {
  const text = String(output);
  return {
    accounts: [...text.matchAll(/^Feishu\s+([^\n]+)$/gm)].map((match) => match[1].trim()),
    mediaSupported: /Support:\s+.*\bmedia\b/i.test(text),
    directSupported: /Support:\s+.*\bdirect\b/i.test(text),
    channelSupported: /Support:\s+.*\bchannel\b/i.test(text),
    probeOkCount: [...text.matchAll(/Probe:\s+ok/gi)].length,
  };
}

async function runOpenClaw(args, options = {}) {
  try {
    const result = await execFileAsync("openclaw", args, {
      cwd: options.cwd || process.cwd(),
      maxBuffer: 1024 * 1024 * 4,
    });
    return {
      ok: true,
      stdout: result.stdout,
      stderr: result.stderr,
    };
  } catch (error) {
    if (!options.allowFailure) {
      throw error;
    }
    return {
      ok: false,
      stdout: error.stdout ?? "",
      stderr: error.stderr ?? error.message ?? "",
    };
  }
}

async function collectRuntimeStatus(cwd) {
  const versionResult = await runOpenClaw(["--version"], { cwd });
  const skills = {};
  for (const skillName of REQUIRED_NATIVE_SKILLS) {
    const result = await runOpenClaw(["skills", "info", skillName], { cwd, allowFailure: true });
    skills[skillName] = {
      ready: result.ok && parseSkillReady(result.stdout),
      detail: extractSummaryLine(result.stdout, result.stderr),
    };
  }

  const pluginsResult = await runOpenClaw(["plugins", "list"], { cwd, allowFailure: true });
  const plugins = Object.fromEntries(
    REQUIRED_NATIVE_PLUGINS.map((pluginId) => [pluginId, parsePluginStatus(pluginsResult.stdout, pluginId)]),
  );

  const channelCapabilitiesResult = await runOpenClaw(["channels", "capabilities", "--channel", "feishu"], {
    cwd,
    allowFailure: true,
  });

  return {
    version: extractSummaryLine(versionResult.stdout, versionResult.stderr),
    skills,
    plugins,
    feishuChannelCapabilities: channelCapabilitiesResult.ok
      ? parseFeishuChannelCapabilities(channelCapabilitiesResult.stdout)
      : {
          accounts: [],
          mediaSupported: false,
          directSupported: false,
          channelSupported: false,
          probeOkCount: 0,
          error: extractSummaryLine(channelCapabilitiesResult.stdout, channelCapabilitiesResult.stderr),
        },
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const dryRun = Boolean(args.dryRun);
  const openclawHome = path.resolve(resolveHomePath(args.openclawHome || "~/.openclaw"));
  const configPath = path.resolve(resolveHomePath(args.config || path.join(openclawHome, "openclaw.json")));
  const config = (await readJsonIfExists(configPath, null)) ?? defaultOpenClawConfig();
  const nextConfig = applyNativeCapabilityDefaults(structuredClone(config));
  const currentSerialized = JSON.stringify(config);
  const nextSerialized = JSON.stringify(nextConfig);
  const changed = currentSerialized !== nextSerialized;

  const summary = {
    configPath,
    changed,
    ensuredConfig: summarizeNativeCapabilityConfig(nextConfig),
    coreTools: {
      activationRule: "tools.profile = full",
      tools: NATIVE_CORE_TOOLS,
    },
    feishuToolProviders: NATIVE_FEISHU_TOOL_PROVIDERS,
  };

  if (!dryRun) {
    if (changed) {
      await ensureDir(path.dirname(configPath));
      const backupDir = path.join(openclawHome, "backups");
      await ensureDir(backupDir);
      const backupPath = path.join(backupDir, `openclaw.native.${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
      if (await fileExists(configPath)) {
        await copyFile(configPath, backupPath);
      } else {
        await writeJson(backupPath, config);
      }
      await writeJson(configPath, nextConfig);
      summary.backupPath = backupPath;
    }
    summary.wroteConfig = changed;
  } else {
    summary.wroteConfig = false;
  }

  summary.runtimeStatus = await collectRuntimeStatus(path.dirname(configPath));
  console.log(JSON.stringify(summary, null, 2));
}

await main();
