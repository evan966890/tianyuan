#!/usr/bin/env node

import path from "node:path";
import process from "node:process";
import { spawn } from "node:child_process";
import { repoRootFromImport, parseArgs } from "../lib/node-helpers.mjs";

async function runStep(scriptName, argv) {
  const repoRoot = repoRootFromImport(import.meta.url);
  const scriptPath = path.join(repoRoot, "scripts", scriptName);
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [scriptPath, ...argv], {
      stdio: "inherit",
    });
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${scriptName} exited with code ${code}`));
    });
    child.on("error", reject);
  });
}

async function runShellStep(command, argv = []) {
  await new Promise((resolve, reject) => {
    const child = spawn(command, argv, {
      stdio: "inherit",
    });
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${command} exited with code ${code}`));
    });
    child.on("error", reject);
  });
}

async function main() {
  const rawArgs = process.argv.slice(2);
  const args = parseArgs(rawArgs);
  const dryRun = Boolean(args.dryRun);

  if (!args.skipProvision) {
    await runStep("provision-feishu-bots.mjs", rawArgs);
  }

  if (!args.skipConfigure) {
    await runStep("configure-openclaw-suite.mjs", rawArgs);
  }

  if (!args.skipSkillInstall) {
    const repoRoot = repoRootFromImport(import.meta.url);
    if (dryRun) {
      console.log(`[dry-run] bash ${path.join(repoRoot, "scripts", "install-skills.sh")}`);
    } else {
      await runShellStep("bash", [path.join(repoRoot, "scripts", "install-skills.sh")]);
    }
  }

  if (args.installOpenvikingMemory) {
    const repoRoot = repoRootFromImport(import.meta.url);
    const scriptPath = path.join(repoRoot, "scripts", "install-openviking-memory.sh");
    if (dryRun) {
      console.log(`[dry-run] bash ${scriptPath}`);
      return;
    }
    await runShellStep("bash", [scriptPath]);
  }
}

await main();
