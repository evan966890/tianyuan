#!/usr/bin/env node

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { chromium } from 'playwright-core';
import * as Lark from '@larksuiteoapi/node-sdk';

const DEFAULT_LOGIN_TIMEOUT_MS = 5 * 60 * 1000;
const DEFAULT_STEP_TIMEOUT_MS = 20 * 1000;
const REQUIRED_EVENT = 'im.message.receive_v1';
const execFileAsync = promisify(execFile);
const INTERACTIVE_POLL_MS = 250;
// Only dismiss clearly informational/notification popups — never "确定"/"取消" which could confirm destructive actions
const POPUP_CLOSE_LABELS = [
  '我知道了',
  '知道了',
  '稍后',
  '稍后处理',
  '稍后再说',
  '稍后再试',
  '下次再说',
  '以后再说',
  '暂不体验',
  '跳过',
  '跳过引导',
  '关闭',
  '完成',
  'Close',
  'Later',
  'Not now',
];
const SAFE_OVERLAY_SELECTOR = [
  '[role="dialog"]',
  '[aria-modal="true"]',
  '[class*="modal"]',
  '[class*="popup"]',
  '[class*="toast"]',
  '[class*="notice"]',
  '[class*="Message"]',
  '[class*="guide"]',
  '[class*="tour"]',
  '[class*="coach"]',
  '[class*="drawer"]',
].join(', ');
const recentNetworkBodies = [];

// --- Long Connection (WSClient) for event subscription ---
let _wsClient = null;
let _wsConnected = false;
let _wsConnectedResolve = null;
const _wsConnectedPromise = new Promise((resolve) => { _wsConnectedResolve = resolve; });

function startLongConnection(appId, appSecret) {
  stderrLog(`Starting SDK long connection for ${appId}...`);
  _wsClient = new Lark.WSClient({
    appId,
    appSecret,
    loggerLevel: Lark.LoggerLevel.info,
  });

  // Start the WebSocket connection with a minimal event dispatcher
  const startPromise = _wsClient.start({
    eventDispatcher: new Lark.EventDispatcher({}).register({
      [REQUIRED_EVENT]: async () => {
        // No-op handler — we just need the connection, not the event processing
      },
    }),
  });

  // The start() promise resolves when connected
  startPromise
    .then(() => {
      stderrLog('SDK long connection established successfully');
      _wsConnected = true;
      _wsConnectedResolve(true);
    })
    .catch((err) => {
      stderrLog(`SDK long connection failed: ${err.message || err}`);
      _wsConnectedResolve(false);
    });

  // Also resolve after a timeout so we don't block forever
  setTimeout(() => {
    if (!_wsConnected) {
      stderrLog('SDK long connection timeout (30s) — resolving anyway');
      _wsConnectedResolve(false);
    }
  }, 30_000);

  return _wsConnectedPromise;
}

function stopLongConnection() {
  if (_wsClient) {
    stderrLog('Stopping SDK long connection');
    // WSClient doesn't have a documented stop method — just null it out
    try { _wsClient.stop?.(); } catch {}
    try { _wsClient.close?.(); } catch {}
    _wsClient = null;
  }
}

async function waitForLongConnection(timeoutMs = 30_000) {
  if (_wsConnected) return true;
  const result = await Promise.race([
    _wsConnectedPromise,
    new Promise((r) => setTimeout(() => r(false), timeoutMs)),
  ]);
  return result;
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function textRegex(label) {
  return new RegExp(escapeRegex(label).replace(/\s+/g, '\\s*'), 'i');
}

function stderrLog(message) {
  process.stderr.write(`[feishu-automation] ${message}\n`);
}

function normalizeSpace(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function unixStamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function nextReleaseVersion() {
  const stamp = new Date().toISOString().replace(/\D/g, '').slice(2, 14);
  return `1.0.${stamp}`;
}

function candidateBrowserPaths() {
  if (process.platform === 'darwin') {
    return [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
      '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
    ];
  }

  if (process.platform === 'win32') {
    const local = process.env.LOCALAPPDATA ?? '';
    const programFiles = process.env.PROGRAMFILES ?? 'C:\\Program Files';
    const programFilesX86 = process.env['PROGRAMFILES(X86)'] ?? 'C:\\Program Files (x86)';
    return [
      path.join(programFiles, 'Google/Chrome/Application/chrome.exe'),
      path.join(programFilesX86, 'Google/Chrome/Application/chrome.exe'),
      path.join(local, 'Google/Chrome/Application/chrome.exe'),
      path.join(programFiles, 'Microsoft/Edge/Application/msedge.exe'),
      path.join(programFilesX86, 'Microsoft/Edge/Application/msedge.exe'),
      path.join(programFiles, 'BraveSoftware/Brave-Browser/Application/brave.exe'),
      path.join(programFilesX86, 'BraveSoftware/Brave-Browser/Application/brave.exe'),
    ];
  }

  return [
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/microsoft-edge',
    '/usr/bin/brave-browser',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ];
}

async function resolveBrowserExecutable(explicitPath) {
  const candidates = explicitPath ? [explicitPath, ...candidateBrowserPaths()] : candidateBrowserPaths();
  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      // Try next candidate.
    }
  }
  return null;
}

function baseOrigin(domain) {
  return domain === 'lark' ? 'https://open.larksuite.com' : 'https://open.feishu.cn';
}

function ensureArray(value) {
  return Array.isArray(value) ? value : [value];
}

async function maybeVisible(locator) {
  const count = await locator.count().catch(() => 0);
  for (let index = 0; index < Math.min(count, 5); index += 1) {
    const candidate = locator.nth(index);
    if (await candidate.isVisible().catch(() => false)) {
      return candidate;
    }
  }
  return null;
}

async function persistResult(artifactDir, result) {
  if (!artifactDir) {
    return;
  }

  await fs.mkdir(artifactDir, { recursive: true }).catch(() => {});
  await fs.writeFile(path.join(artifactDir, 'result.json'), `${JSON.stringify(result, null, 2)}\n`).catch(() => {});
}

async function isPidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function isChromiumProcess(command) {
  const lower = command.toLowerCase();
  return (
    lower.includes('google chrome') ||
    lower.includes('chrome helper') ||
    lower.includes('chromium') ||
    lower.includes('microsoft edge') ||
    lower.includes('brave browser')
  );
}

async function terminateCompetingBrowserProcesses(profileDir) {
  if (!profileDir || process.platform === 'win32') {
    return;
  }

  try {
    const { stdout } = await execFileAsync('ps', ['-ax', '-o', 'pid=,command=']);
    const targets = stdout
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const firstSpace = line.indexOf(' ');
        return {
          pid: Number(line.slice(0, firstSpace)),
          command: line.slice(firstSpace + 1),
        };
      })
      .filter(({ pid, command }) => pid > 0 && pid !== process.pid && command.includes(profileDir) && isChromiumProcess(command));

    if (!targets.length) {
      return;
    }

    stderrLog(`Stopping ${targets.length} stale Chromium process(es) for profile reuse`);
    for (const target of targets) {
      try {
        process.kill(target.pid, 'SIGTERM');
      } catch {
        // Ignore per-process termination failures.
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 1000));

    for (const target of targets) {
      if (!(await isPidAlive(target.pid))) {
        continue;
      }
      try {
        process.kill(target.pid, 'SIGKILL');
      } catch {
        // Ignore per-process kill failures.
      }
    }
  } catch {
    // Ignore process cleanup failures.
  }
}

async function clearProfileLockArtifacts(profileDir) {
  if (!profileDir) {
    return;
  }

  for (const relativePath of ['SingletonLock', 'SingletonCookie', 'SingletonSocket', 'Default/LOCK']) {
    await fs.rm(path.join(profileDir, relativePath), { force: true }).catch(() => {});
  }
}

async function waitForUiIdle(page, timeoutMs = DEFAULT_STEP_TIMEOUT_MS) {
  const end = Date.now() + timeoutMs;

  while (Date.now() < end) {
    const interactive = await page.evaluate(() => {
      const isVisible = (element) => {
        if (!(element instanceof HTMLElement)) return false;
        const style = window.getComputedStyle(element);
        return style.display !== 'none' && style.visibility !== 'hidden' && element.getClientRects().length > 0;
      };

      const selectors = [
        '.ud__loading-nested-loading .ud__spin',
        '.ud__loading-nested-loading [class*="spin"]',
        '.ud__spin',
        '.semi-spin',
        '.ant-spin',
        '[class*="loading-mask"]',
        '[aria-busy="true"]',
      ];

      return !selectors.some((selector) =>
        [...document.querySelectorAll(selector)].some((element) => {
          if (!isVisible(element)) return false;
          const style = window.getComputedStyle(element);
          return style.pointerEvents !== 'none';
        }),
      );
    }).catch(() => true);

    if (interactive) {
      return;
    }

    await page.waitForTimeout(INTERACTIVE_POLL_MS);
  }
}

async function dismissInterferingPopups(page) {
  let closed = false;

  // Only click popup labels that are inside a dialog/modal/popup overlay — NOT page-wide!
  // Page-wide search for "关闭"/"完成" would match action buttons like "关闭权限" on the permissions page.
  for (const label of POPUP_CLOSE_LABELS) {
    const regex = textRegex(label);
    // Search only within dialog/modal/popup containers
    const scoped = page.locator(SAFE_OVERLAY_SELECTOR);
    const scopedBtn = await maybeVisible(scoped.getByRole('button', { name: regex }));
    if (!scopedBtn) continue;
    await scopedBtn.click({ timeout: 1000 }).catch(() => {});
    closed = true;
  }

  // Only match close buttons inside popups/dialogs/modals — NOT action buttons like "关闭权限" on pages
  const closeButtons = page.locator(
    `${SAFE_OVERLAY_SELECTOR} button[aria-label*="关闭"], ` +
    `${SAFE_OVERLAY_SELECTOR} button[aria-label*="close" i]`
  );
  const closeButton = await maybeVisible(closeButtons);
  if (closeButton) {
    await closeButton.click({ timeout: 1000 }).catch(() => {});
    closed = true;
  }

  // Only click modal buttons with clearly safe dismiss labels — never empty text, never "取消"/"确定" which could be destructive
  const modalCloseIcons = page.locator(`${SAFE_OVERLAY_SELECTOR} button`);
  const modalCloseCount = await modalCloseIcons.count().catch(() => 0);
  for (let index = 0; index < Math.min(modalCloseCount, 6); index += 1) {
    const candidate = modalCloseIcons.nth(index);
    const label = await candidate.innerText().catch(() => '');
    const trimmed = label.trim();
    // Must match a safe dismiss label — no empty strings, no "取消"/"确定"
    if (!trimmed || !/^(关闭|完成|知道了|我知道了|Close)$/i.test(trimmed)) {
      continue;
    }
    if (await candidate.isVisible().catch(() => false)) {
      await candidate.click({ timeout: 800 }).catch(() => {});
      closed = true;
    }
  }

  // Don't press Escape blindly — it closes dialogs we may want open (e.g. bulk import)

  if (closed) {
    await page.waitForTimeout(300);
  }

  return closed;
}

async function findConsoleReadyLocator(page) {
  return (
    (await findLocatorByText(page, ['创建企业自建应用', 'Create Custom App', '创建应用'])) ??
    (await maybeVisible(page.getByPlaceholder(/搜索应用名称或 App ID/))) ??
    (await maybeVisible(page.locator('tr.app-table__row[data-row-key], tr[data-row-key]').first()))
  );
}

async function settleLoginLanding(page, rounds = 4) {
  for (let round = 0; round < rounds; round += 1) {
    const dismissed = await dismissInterferingPopups(page).catch(() => false);
    if (!dismissed) {
      break;
    }
    await page.waitForLoadState('networkidle').catch(() => {});
    await waitForUiIdle(page, 2_000).catch(() => {});
  }
}

async function clickLocator(page, locator, options = {}) {
  const timeoutMs = options.timeoutMs ?? DEFAULT_STEP_TIMEOUT_MS;

  await waitForUiIdle(page, timeoutMs).catch(() => {});
  await locator.scrollIntoViewIfNeeded().catch(() => {});

  try {
    await locator.click({ timeout: timeoutMs });
    return;
  } catch {
    await dismissInterferingPopups(page).catch(() => {});
    await waitForUiIdle(page, timeoutMs).catch(() => {});
  }

  try {
    await locator.click({ timeout: timeoutMs, force: true });
    return;
  } catch {
    await locator.evaluate((node) => node.click()).catch(() => {});
  }
}

async function findLocatorByText(root, labels, roles = ['button', 'link', 'tab', 'menuitem']) {
  for (const label of ensureArray(labels)) {
    const regex = textRegex(label);
    for (const role of roles) {
      const locator = await maybeVisible(root.getByRole(role, { name: regex }));
      if (locator) {
        return locator;
      }
    }
    const textLocator = await maybeVisible(root.getByText(regex));
    if (textLocator) {
      return textLocator;
    }
  }
  return null;
}

async function waitForLocator(page, labels, options = {}) {
  return waitForLocatorInRoot(page, page, labels, options);
}

async function waitForLocatorInRoot(page, root, labels, options = {}) {
  const timeoutMs = options.timeoutMs ?? DEFAULT_STEP_TIMEOUT_MS;
  const roles = options.roles ?? ['button', 'link', 'tab', 'menuitem'];
  const end = Date.now() + timeoutMs;

  while (Date.now() < end) {
    const locator = await findLocatorByText(root, labels, roles);
    if (locator) {
      return locator;
    }
    await page.waitForTimeout(500);
  }

  throw new Error(`Timed out waiting for ${ensureArray(labels).join(' / ')}`);
}

async function clickByText(page, labels, options = {}) {
  const locator = await waitForLocator(page, labels, options);
  await clickLocator(page, locator, options);
  return locator;
}

async function clickByTextInRoot(page, root, labels, options = {}) {
  const locator = await waitForLocatorInRoot(page, root, labels, options);
  await clickLocator(page, locator, options);
  return locator;
}

async function clickIfVisible(page, labels, options = {}) {
  const locator = await findLocatorByText(page, labels, options.roles);
  if (!locator) {
    return false;
  }
  await clickLocator(page, locator, options);
  return true;
}

async function fillField(page, labels, value, options = {}) {
  for (const label of ensureArray(labels)) {
    const regex = textRegex(label);
    const labelLocator = await maybeVisible(page.getByLabel(regex));
    if (labelLocator) {
      await labelLocator.fill(value);
      return;
    }

    const placeholderLocator = await maybeVisible(page.getByPlaceholder(regex));
    if (placeholderLocator) {
      await placeholderLocator.fill(value);
      return;
    }

    const textBoxLocator = await maybeVisible(page.getByRole('textbox', { name: regex }));
    if (textBoxLocator) {
      await textBoxLocator.fill(value);
      return;
    }

    const rowText = await maybeVisible(page.getByText(regex));
    if (rowText) {
      const container = rowText.locator('xpath=ancestor::*[self::div or self::section or self::form or self::label][1]');
      const input = await maybeVisible(container.locator('input:not([type="hidden"]), textarea'));
      if (input) {
        await input.fill(value);
        return;
      }
    }
  }

  if (options.fallbackIndex !== undefined) {
    const inputs = page.locator('input:not([type="hidden"]):not([readonly]), textarea');
    const candidate = inputs.nth(options.fallbackIndex);
    if (await candidate.isVisible().catch(() => false)) {
      await candidate.fill(value);
      return;
    }
  }

  throw new Error(`Unable to fill field ${ensureArray(labels).join(' / ')}`);
}

async function setControlledText(locator, value) {
  await locator.click({ timeout: DEFAULT_STEP_TIMEOUT_MS }).catch(() => {});
  await locator.evaluate((node, nextValue) => {
    const element = node;
    const prototype = element instanceof HTMLTextAreaElement
      ? window.HTMLTextAreaElement.prototype
      : window.HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
    setter?.call(element, nextValue);
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
  }, value);
}

async function readMonacoContent(page, editorContainer) {
  // Monaco virtualizes rendering — only visible viewport lines have DOM elements.
  // Use Ctrl+A to select all, then read selection via the editor's internal model.
  // Strategy 1: Try to get content via Monaco's internal API (most reliable)
  const fromApi = await page.evaluate(() => {
    // Try various ways to access Monaco editor content
    try {
      // Way 1: Global Monaco API
      const editors = window.monaco?.editor?.getEditors?.() ?? [];
      for (const e of editors) {
        const val = e.getValue?.();
        if (val) return val;
      }
      const models = window.monaco?.editor?.getModels?.() ?? [];
      for (const m of models) {
        const val = m.getValue?.();
        if (val) return val;
      }
    } catch {}
    try {
      // Way 2: require-based access
      const monacoEditor = window.require?.('vs/editor/editor.main')?.editor;
      if (monacoEditor) {
        for (const e of monacoEditor.getEditors?.() ?? []) {
          const val = e.getValue?.();
          if (val) return val;
        }
      }
    } catch {}
    return null;
  }).catch(() => null);
  if (fromApi) return fromApi;

  // Strategy 2: Read visible view-lines from DOM (may be partial due to virtualization)
  return editorContainer.evaluate((c) => {
    const lines = c.querySelectorAll('.view-line');
    return Array.from(lines).map((l) => l.textContent ?? '').join('\n');
  }).catch(() => '');
}

function verifyMonacoContent(actual, expected, lineCountOnly = false) {
  if (lineCountOnly) {
    // Just check that we have a reasonable number of non-empty lines
    const expectedLines = expected.split('\n').filter((l) => l.trim()).length;
    const actualLines = actual.split('\n').filter((l) => l.trim()).length;
    // Accept if we have at least 60% of expected lines (due to viewport virtualization)
    return { ok: actualLines >= expectedLines * 0.6, missing: actualLines < expectedLines * 0.6 ? [`expected ~${expectedLines} lines, got ${actualLines}`] : [] };
  }
  // Full content verification
  const markers = ['"scopes"', '"tenant"', '"user"'];
  try {
    const parsed = JSON.parse(expected);
    const tenant = parsed?.scopes?.tenant ?? [];
    const user = parsed?.scopes?.user ?? [];
    if (tenant.length > 0) markers.push(tenant[tenant.length - 1]);
    if (user.length > 0) markers.push(user[user.length - 1]);
  } catch {}
  const missing = markers.filter((m) => !actual.includes(m));
  return { ok: missing.length === 0, missing };
}

async function pasteIntoMonaco(page, value, root = page) {
  const editorContainer = root.locator('.monaco-editor').first();
  if (!(await editorContainer.isVisible().catch(() => false))) {
    throw new Error('Unable to find Monaco editor');
  }

  const selectKey = process.platform === 'darwin' ? 'Meta+A' : 'Control+A';
  const pasteKey = process.platform === 'darwin' ? 'Meta+V' : 'Control+V';

  // Focus Monaco textarea via JS (Playwright click is blocked by Monaco's overlay layer)
  const focusTextarea = () => page.evaluate(() => {
    const ta = document.querySelector('.monaco-editor textarea');
    if (ta) ta.focus();
  });

  // Strategy 1: navigator.clipboard.writeText + Cmd+V (proven to work with Feishu's Monaco)
  // Retry up to 3 times if paste is partial
  for (let attempt = 1; attempt <= 3; attempt++) {
    stderrLog(`Monaco paste attempt ${attempt}/3`);

    // Clear editor: focus → select all → delete → wait for editor to settle
    await focusTextarea();
    await page.waitForTimeout(200);
    await page.keyboard.press(selectKey);
    await page.waitForTimeout(200);
    await page.keyboard.press(selectKey);
    await page.waitForTimeout(100);
    await page.keyboard.press('Backspace');
    await page.waitForTimeout(800);

    // Verify editor is cleared
    const contentAfterClear = await readMonacoContent(page, editorContainer);
    const clearOk = contentAfterClear.trim().length < 5;
    stderrLog(`Editor cleared: ${clearOk} (remaining: ${contentAfterClear.trim().length} chars)`);

    if (!clearOk && attempt < 3) {
      // Try harder: Ctrl+A again then Delete key
      await focusTextarea();
      await page.keyboard.press(selectKey);
      await page.waitForTimeout(100);
      await page.keyboard.press('Delete');
      await page.waitForTimeout(500);
    }

    // Write to browser clipboard and paste
    const clipboardWritten = await page.evaluate(async (text) => {
      try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
    }, value).catch(() => false);

    if (!clipboardWritten) {
      stderrLog('navigator.clipboard.writeText failed, trying fallback strategies');
      break; // fall through to Strategy 2/3
    }

    await focusTextarea();
    await page.waitForTimeout(100);
    await page.keyboard.press(pasteKey);
    await page.waitForTimeout(2000); // longer wait for large content

    // Verify the pasted content is complete
    const pastedContent = await readMonacoContent(page, editorContainer);
    const lineCount = pastedContent.split('\n').filter((l) => l.trim()).length;

    // First try full content verification (works if Monaco API is accessible)
    const fullVerify = verifyMonacoContent(pastedContent, value, false);
    if (fullVerify.ok) {
      stderrLog(`Monaco paste complete (${lineCount} lines, all markers found)`);
      return;
    }

    // If full verify fails, check if it's just viewport virtualization (DOM only shows visible lines)
    // Monaco typically shows ~20 lines in viewport. If we have that many, the paste likely worked.
    const lineCountVerify = verifyMonacoContent(pastedContent, value, true);
    if (lineCountVerify.ok) {
      stderrLog(`Monaco paste accepted (${lineCount} visible lines, markers not in viewport — virtualization expected)`);
      return;
    }

    stderrLog(`Monaco paste attempt ${attempt} incomplete: ${fullVerify.missing.join(', ')}, ${lineCount} lines`);

    if (attempt < 3) {
      await page.waitForTimeout(500);
    }
  }

  // Strategy 2: Monaco API (window.monaco or require)
  const setViaApi = await page.evaluate((nextValue) => {
    const sources = [window.monaco?.editor];
    try { sources.push(window.require?.('vs/editor/editor.main')?.editor); } catch {}
    for (const src of sources.filter(Boolean)) {
      for (const e of src.getEditors?.() ?? []) { if (e?.setValue) { e.setValue(nextValue); return true; } }
      for (const m of src.getModels?.() ?? []) { if (m?.setValue) { m.setValue(nextValue); return true; } }
    }
    return false;
  }, value).catch(() => false);
  if (setViaApi) { stderrLog('Monaco setValue via API'); return; }

  // Strategy 3: Synthetic ClipboardEvent
  await focusTextarea();
  await page.keyboard.press(selectKey);
  await page.evaluate((nextValue) => {
    const ta = document.querySelector('.monaco-editor textarea');
    if (!ta) return;
    const dt = new DataTransfer();
    dt.setData('text/plain', nextValue);
    ta.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  }, value).catch(() => {});
  await page.waitForTimeout(1500);

  // Final content check
  const finalContent = await readMonacoContent(page, editorContainer);
  const finalVerify = verifyMonacoContent(finalContent, value);
  if (finalVerify.ok) { stderrLog('Monaco paste via synthetic ClipboardEvent (verified)'); return; }

  // Even if incomplete, if we have some content, log warning and continue
  const finalLines = finalContent.split('\n').filter((l) => l.trim()).length;
  if (finalLines > 3) {
    stderrLog(`Monaco paste partially complete (${finalLines} lines, missing: [${finalVerify.missing.join(', ')}]) — proceeding`);
    return;
  }

  throw new Error('All Monaco paste strategies failed');
}

function flattenScopeIds(permissionsJson) {
  const scopes = permissionsJson?.scopes ?? {};
  return [...(scopes.tenant ?? []), ...(scopes.user ?? [])]
    .map((value) => String(value ?? '').trim())
    .filter(Boolean);
}

async function waitForPermissionEditor(page, dialog, timeoutMs = 20_000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    // Check Monaco is FULLY loaded (has .view-lines with content, not just textarea)
    const monacoReady = await dialog.evaluate(() => {
      const editor = document.querySelector('.monaco-editor');
      if (!editor) return false;
      const viewLines = editor.querySelector('.view-lines');
      const textarea = editor.querySelector('textarea');
      // Editor is ready when view-lines exists and spinner is gone
      return Boolean(viewLines && textarea && !document.querySelector('.monaco-editor .loading'));
    }).catch(() => false);
    if (monacoReady) {
      const monaco = dialog.locator('.monaco-editor textarea').first();
      return { kind: 'monaco', locator: monaco };
    }

    const textarea = await maybeVisible(dialog.locator('textarea:not(.monaco-editor textarea)'));
    if (textarea) {
      return { kind: 'textarea', locator: textarea };
    }

    const contentEditable = await maybeVisible(dialog.locator('[contenteditable="true"]'));
    if (contentEditable) {
      return { kind: 'contenteditable', locator: contentEditable };
    }

    await page.waitForTimeout(400);
  }

  throw new Error('Permission editor did not become ready');
}

async function findDialog(page, labels, options = {}) {
  const timeoutMs = options.timeoutMs ?? DEFAULT_STEP_TIMEOUT_MS;
  const end = Date.now() + timeoutMs;
  const dialogSelector = '[role="dialog"], [aria-modal="true"], [class*="modal"], [class*="dialog"]';

  while (Date.now() < end) {
    for (const label of ensureArray(labels)) {
      const regex = textRegex(label);
      const scoped = page.locator(dialogSelector).filter({ has: page.getByText(regex) });
      const dialog = await maybeVisible(scoped);
      if (dialog) {
        return dialog;
      }

      const title = await maybeVisible(page.getByText(regex));
      if (title) {
        const ancestor = title.locator(
          'xpath=ancestor::*[@role="dialog" or @aria-modal="true" or contains(@class,"modal") or contains(@class,"dialog")][1]',
        );
        const fallback = await maybeVisible(ancestor);
        if (fallback) {
          return fallback;
        }
      }
    }

    await page.waitForTimeout(250);
  }

  throw new Error(`Timed out waiting for dialog ${ensureArray(labels).join(' / ')}`);
}

async function waitForAppCreation(page, dialog, timeoutMs = 20_000) {
  const end = Date.now() + timeoutMs;

  while (Date.now() < end) {
    const dialogVisible = await dialog.isVisible().catch(() => false);
    if (!dialogVisible) {
      return;
    }

    if (/\/app\/cli_[A-Za-z0-9_-]+/.test(page.url())) {
      return;
    }

    const ready = await findLocatorByText(page, ['凭证与基础信息', '基础信息', 'App ID'], ['link', 'tab', 'button']);
    if (ready) {
      return;
    }

    await page.waitForTimeout(500);
  }

  const dialogText = await dialog.innerText().catch(() => '');
  throw new Error(`Create app dialog did not close after submit. ${dialogText}`.trim());
}

async function readClipboard(page) {
  return page.evaluate(async () => {
    try {
      return await navigator.clipboard.readText();
    } catch {
      return '';
    }
  });
}

async function readSystemClipboard() {
  try {
    if (process.platform === 'darwin') {
      const { stdout } = await execFileAsync('pbpaste');
      return stdout.trim();
    }

    if (process.platform === 'win32') {
      const { stdout } = await execFileAsync('powershell', ['-NoProfile', '-Command', 'Get-Clipboard']);
      return stdout.trim();
    }

    for (const candidate of [
      ['xclip', ['-selection', 'clipboard', '-o']],
      ['xsel', ['--clipboard', '--output']],
      ['wl-paste', ['--no-newline']],
    ]) {
      try {
        const { stdout } = await execFileAsync(candidate[0], candidate[1]);
        const value = stdout.trim();
        if (value) {
          return value;
        }
      } catch {
        // Try next clipboard command.
      }
    }
  } catch {
    // Ignore clipboard command failures.
  }

  return '';
}

function textPattern(kind, appId) {
  if (kind === 'appId') {
    return /\bcli_[A-Za-z0-9_-]{6,}\b/;
  }
  return new RegExp(`\\b(?!${escapeRegex(appId ?? 'cli_dummy')})[A-Za-z0-9_-]{24,128}\\b`);
}

function firstPatternMatch(pattern, ...values) {
  for (const value of values) {
    const match = String(value ?? '').match(pattern);
    if (match) {
      return match[0];
    }
  }
  return '';
}

function rememberNetworkBody(url, body) {
  recentNetworkBodies.push({
    url,
    body: String(body ?? '').slice(0, 250_000),
    capturedAt: Date.now(),
  });
  while (recentNetworkBodies.length > 120) {
    recentNetworkBodies.shift();
  }
}

function readCredentialFromNetwork(kind, existingAppId = '') {
  const valuePattern =
    kind === 'appId'
      ? /\bcli_[A-Za-z0-9_-]{6,}\b/
      : new RegExp(`\\b(?!${escapeRegex(existingAppId ?? 'cli_dummy')})[A-Za-z0-9_-]{24,128}\\b`);
  const keyPatterns =
    kind === 'appId'
      ? [
          /"appId"\s*:\s*"([^"]+)"/i,
          /"app_id"\s*:\s*"([^"]+)"/i,
          /\bappId\b[^A-Za-z0-9_-]+([A-Za-z0-9_-]{6,128})/i,
          /\bapp_id\b[^A-Za-z0-9_-]+([A-Za-z0-9_-]{6,128})/i,
        ]
      : [
          /"appSecret"\s*:\s*"([^"]+)"/i,
          /"app_secret"\s*:\s*"([^"]+)"/i,
          /\bappSecret\b[^A-Za-z0-9_-]+([A-Za-z0-9_-]{24,128})/i,
          /\bapp_secret\b[^A-Za-z0-9_-]+([A-Za-z0-9_-]{24,128})/i,
        ];

  for (const entry of [...recentNetworkBodies].reverse()) {
    const body = entry.body;
    for (const keyPattern of keyPatterns) {
      const keyMatch = body.match(keyPattern)?.[1] ?? '';
      const exact = firstPatternMatch(valuePattern, keyMatch);
      if (exact) {
        stderrLog(`Resolved ${kind} from network response ${entry.url}`);
        return exact;
      }
    }

    if (kind === 'appSecret' && !/appSecret|app_secret/i.test(body)) {
      continue;
    }
    if (kind === 'appId' && !/appId|app_id|cli_/i.test(body)) {
      continue;
    }
    const fuzzy = firstPatternMatch(valuePattern, body);
    if (fuzzy) {
      stderrLog(`Resolved ${kind} from fuzzy network match ${entry.url}`);
      return fuzzy;
    }
  }

  return '';
}

function attachNetworkCapture(page) {
  recentNetworkBodies.length = 0;
  page.on('response', async (response) => {
    try {
      const request = response.request();
      const resourceType = request.resourceType();
      if (!['xhr', 'fetch', 'document'].includes(resourceType)) {
        return;
      }
      const url = response.url();
      if (!/open\.feishu\.cn|open\.larksuite\.com/i.test(url)) {
        return;
      }
      const text = await response.text().catch(() => '');
      if (!text) {
        return;
      }
      rememberNetworkBody(url, text);
    } catch {
      // Ignore response capture failures.
    }
  });
}

async function clickIconButton(row, iconNames, fallbackIndex) {
  for (const iconName of ensureArray(iconNames)) {
    const icon = await maybeVisible(row.locator(`[data-icon="${iconName}"], [data-icon*="${iconName}"]`));
    if (!icon) {
      continue;
    }
    const button = await maybeVisible(icon.locator('xpath=ancestor::button[1]'));
    if (button) {
      await button.click({ timeout: DEFAULT_STEP_TIMEOUT_MS });
      return true;
    }
  }

  if (fallbackIndex !== undefined) {
    const buttons = row.locator('button');
    const count = await buttons.count().catch(() => 0);
    if (count > fallbackIndex) {
      const fallbackButton = buttons.nth(fallbackIndex);
      if (await fallbackButton.isVisible().catch(() => false)) {
        await fallbackButton.click({ timeout: DEFAULT_STEP_TIMEOUT_MS });
        return true;
      }
    }
  }

  return false;
}

async function clickCredentialButtonByDom(page, labelText, buttonIndex) {
  return page.evaluate(
    ({ label, index }) => {
      const normalize = (value = '') => value.replace(/\s+/g, ' ').trim();
      const isVisible = (element) => {
        if (!(element instanceof HTMLElement)) return false;
        const style = window.getComputedStyle(element);
        return style.display !== 'none' && style.visibility !== 'hidden' && element.getClientRects().length > 0;
      };

      const candidates = [...document.querySelectorAll('div, section, article, tr')]
        .filter((element) => normalize(element.innerText).includes(label))
        .sort((left, right) => normalize(left.innerText).length - normalize(right.innerText).length);

      for (const candidate of candidates) {
        const buttons = [...candidate.querySelectorAll('button, [role="button"]')].filter(isVisible);
        if (buttons.length > index) {
          buttons[index].click();
          return true;
        }
      }

      return false;
    },
    { label: labelText, index: buttonIndex },
  );
}

async function readCredentialTextByDom(page, labelText) {
  return page.evaluate((label) => {
    const normalize = (value = '') => value.replace(/\s+/g, ' ').trim();
    const isVisible = (element) => {
      if (!(element instanceof HTMLElement)) return false;
      const style = window.getComputedStyle(element);
      return style.display !== 'none' && style.visibility !== 'hidden' && element.getClientRects().length > 0;
    };

    const candidates = [...document.querySelectorAll('div, section, article, tr')]
      .filter((element) => normalize(element.innerText).includes(label))
      .sort((left, right) => normalize(left.innerText).length - normalize(right.innerText).length);

    for (const candidate of candidates) {
      const buttons = [...candidate.querySelectorAll('button, [role="button"]')].filter(isVisible);
      if (buttons.length > 0) {
        const parts = [];
        const append = (value) => {
          const normalized = normalize(value);
          if (normalized) {
            parts.push(normalized);
          }
        };
        const appendAttributes = (element) => {
          append(element.textContent);
          append(element.innerText);
          if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
            append(element.value);
          }
          append(element.getAttribute?.('value'));
          append(element.getAttribute?.('title'));
          append(element.getAttribute?.('aria-label'));
          append(element.getAttribute?.('aria-description'));
          append(element.getAttribute?.('data-clipboard-text'));
          append(element.getAttribute?.('data-copy-text'));
          append(element.getAttribute?.('data-secret'));
          append(element.getAttribute?.('data-value'));
        };

        appendAttributes(candidate);
        append(candidate.outerHTML);
        for (const node of candidate.querySelectorAll('*')) {
          appendAttributes(node);
        }
        return parts.join('\n');
      }
    }

    return '';
  }, labelText);
}

async function readSecretCodeTextByDom(page) {
  return page.evaluate(() => {
    const normalize = (value = '') => value.replace(/\s+/g, ' ').trim();
    const parts = [];
    const append = (value) => {
      const normalized = normalize(value);
      if (normalized) {
        parts.push(normalized);
      }
    };
    const appendAttributes = (element) => {
      append(element.textContent);
      append(element.innerText);
      if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
        append(element.value);
      }
      append(element.getAttribute?.('value'));
      append(element.getAttribute?.('title'));
      append(element.getAttribute?.('aria-label'));
      append(element.getAttribute?.('aria-description'));
      append(element.getAttribute?.('data-clipboard-text'));
      append(element.getAttribute?.('data-copy-text'));
      append(element.getAttribute?.('data-secret'));
      append(element.getAttribute?.('data-value'));
      append(element.outerHTML);
    };

    for (const node of document.querySelectorAll('.secret-code__code, .secret-code__content, .secret-code, [class*="secret-code"]')) {
      appendAttributes(node);
      for (const child of node.querySelectorAll?.('*') ?? []) {
        appendAttributes(child);
      }
    }

    return parts.join('\n');
  });
}

async function clickCredentialButtonNearLabel(page, labelText, buttonIndex) {
  return page.evaluate(
    ({ label, index }) => {
      const normalize = (value = '') => value.replace(/\s+/g, ' ').trim();
      const isVisible = (element) => {
        if (!(element instanceof HTMLElement)) return false;
        const style = window.getComputedStyle(element);
        return style.display !== 'none' && style.visibility !== 'hidden' && element.getClientRects().length > 0;
      };

      const labelNode = [...document.querySelectorAll('div, span, p, td, label, strong')]
        .filter((element) => isVisible(element) && normalize(element.textContent) === label)
        .sort((left, right) => left.getBoundingClientRect().width - right.getBoundingClientRect().width)[0];

      if (!labelNode) {
        return false;
      }

      const labelRect = labelNode.getBoundingClientRect();
      const labelMiddleY = labelRect.top + labelRect.height / 2;
      const buttons = [...document.querySelectorAll('button, [role="button"]')]
        .filter(isVisible)
        .filter((button) => {
          const rect = button.getBoundingClientRect();
          const middleY = rect.top + rect.height / 2;
          return rect.left >= labelRect.right + 80 && Math.abs(middleY - labelMiddleY) <= 24;
        })
        .sort((left, right) => left.getBoundingClientRect().left - right.getBoundingClientRect().left);

      if (buttons.length > index) {
        buttons[index].click();
        return true;
      }

      return false;
    },
    { label: labelText, index: buttonIndex },
  );
}

async function clickCredentialButtonByScan(page, labelText, buttonIndex) {
  return page.evaluate(
    ({ label, index }) => {
      const normalize = (value = '') => value.replace(/\s+/g, ' ').trim();
      const isVisible = (element) => {
        if (!(element instanceof HTMLElement)) return false;
        const style = window.getComputedStyle(element);
        return style.display !== 'none' && style.visibility !== 'hidden' && element.getClientRects().length > 0;
      };
      const clickableAncestor = (element) => {
        if (!(element instanceof HTMLElement)) return null;
        return element.closest('button, [role="button"]');
      };

      const labelNode = [...document.querySelectorAll('div, span, p, td, label, strong')]
        .filter((element) => isVisible(element) && normalize(element.textContent) === label)
        .sort((left, right) => left.getBoundingClientRect().width - right.getBoundingClientRect().width)[0];
      if (!labelNode) {
        return false;
      }

      const labelRect = labelNode.getBoundingClientRect();
      const candidates = new Map();
      for (const offsetY of [24, 30, 36]) {
        const y = Math.round(labelRect.bottom + offsetY);
        for (let x = Math.round(labelRect.right + 100); x < window.innerWidth; x += 8) {
          const hit = document.elementsFromPoint(x, y)
            .map(clickableAncestor)
            .find((element) => element && isVisible(element));
          if (!hit) {
            continue;
          }
          const rect = hit.getBoundingClientRect();
          const key = `${Math.round(rect.left)}:${Math.round(rect.top)}:${Math.round(rect.width)}:${Math.round(rect.height)}`;
          candidates.set(key, hit);
        }
      }

      const buttons = [...candidates.values()]
        .filter((element) => element.getBoundingClientRect().left >= labelRect.right + 100)
        .sort((left, right) => left.getBoundingClientRect().left - right.getBoundingClientRect().left);

      if (buttons.length > index) {
        buttons[index].click();
        return true;
      }

      return false;
    },
    { label: labelText, index: buttonIndex },
  );
}

async function clickSecretCodeAction(page, actionIndex) {
  const actionGroups = page.locator('.secret-code__btns');
  const groupCount = await actionGroups.count().catch(() => 0);
  const scopedGroup = groupCount > 1 ? actionGroups.nth(1) : actionGroups.first();
  const actions = scopedGroup.locator('.secret-code__btn');
  const count = await actions.count().catch(() => 0);
  if (count <= actionIndex) {
    return false;
  }

  const action = actions.nth(actionIndex);
  await action.click({ timeout: DEFAULT_STEP_TIMEOUT_MS, force: true }).catch(() => {});
  await action.evaluate((node) => node.click()).catch(() => {});
  return true;
}

async function extractCredential(page, label, kind, existingAppId = '') {
  const regex = textRegex(label);
  const anchor = await maybeVisible(page.getByText(regex));
  const pattern = textPattern(kind, existingAppId);
  const bodyText = await page.locator('body').innerText().catch(() => '');
  const domText = await readCredentialTextByDom(page, label).catch(() => '');
  const secretCodeText = kind === 'appSecret' ? await readSecretCodeTextByDom(page).catch(() => '') : '';
  const networkMatch = readCredentialFromNetwork(kind, existingAppId);

  if (kind === 'appId') {
    const match = firstPatternMatch(pattern, networkMatch, domText, bodyText);
    if (match) {
      return match;
    }
  }

  if (kind === 'appSecret') {
    // Check if secret is already visible (not masked)
    const directMatch = firstPatternMatch(pattern, networkMatch, secretCodeText, domText, bodyText);
    if (directMatch) {
      return directMatch;
    }

    // === STRATEGY 1: Click the REVEAL/EYE button first, then read from DOM ===
    // This avoids clipboard entirely — most reliable on macOS
    stderrLog('App Secret: clicking reveal/eye button...');

    // Try multiple ways to click the eye/reveal button (index 1 = second icon = eye)
    await clickSecretCodeAction(page, 1).catch(() => false);
    await clickCredentialButtonByDom(page, label, 1).catch(() => false);
    await clickCredentialButtonNearLabel(page, label, 1).catch(() => false);
    await clickCredentialButtonByScan(page, label, 1).catch(() => false);

    // Also try finding "显示" button or eye icon in the App Secret row
    if (anchor) {
      const row = anchor.locator('xpath=ancestor::*[self::div or self::section or self::article or self::tr][1]');
      await clickIconButton(row, ['VisibleOutlined', 'Visible', 'EyeOutlined', 'Eye'], 1).catch(() => false);
      await clickIfVisible(row, ['显示', '查看', 'Reveal', 'Show'], { roles: ['button'] }).catch(() => false);
    }

    // Wait for reveal animation and read from DOM multiple times
    for (const waitMs of [300, 800, 1500, 3000]) {
      await page.waitForTimeout(waitMs);
      const revealedClassText = await page
        .locator('.secret-code__code, .secret-code__content, .secret-code')
        .allInnerTexts()
        .then((values) => values.join('\n'))
        .catch(() => '');
      const revealedSecretCodeText = await readSecretCodeTextByDom(page).catch(() => '');
      const revealedDomText = await readCredentialTextByDom(page, label).catch(() => '');
      const revealedBodyText = await page.locator('body').innerText().catch(() => '');
      const revealedNetworkMatch = readCredentialFromNetwork(kind, existingAppId);
      const revealedMatch = firstPatternMatch(
        pattern,
        revealedNetworkMatch,
        revealedClassText,
        revealedSecretCodeText,
        revealedDomText,
        revealedBodyText,
      );
      if (revealedMatch) {
        stderrLog(`App Secret found via DOM reveal after ${waitMs}ms`);
        return revealedMatch;
      }
    }

    // === STRATEGY 2: Try clipboard as fallback ===
    stderrLog('App Secret: DOM reveal failed, trying clipboard...');

    // Click the COPY button (index 0 = first icon = copy)
    const copiedByClass = await clickSecretCodeAction(page, 0).catch(() => false);
    if (copiedByClass) {
      await page.waitForTimeout(300);
      const browserClipboard = (await readClipboard(page)).trim();
      const browserMatch = browserClipboard.match(pattern);
      stderrLog(`App Secret clipboard length=${browserClipboard.length} matched=${Boolean(browserMatch)}`);
      if (browserMatch) {
        return browserMatch[0];
      }
      const systemClipboard = (await readSystemClipboard()).trim();
      const clipboardMatch = systemClipboard.match(pattern);
      if (clipboardMatch) {
        return clipboardMatch[0];
      }
    }

    // Try other copy button click methods
    for (const clickCopy of [
      () => clickCredentialButtonByDom(page, label, 0),
      () => clickCredentialButtonNearLabel(page, label, 0),
      () => clickCredentialButtonByScan(page, label, 0),
    ]) {
      const copied = await clickCopy().catch(() => false);
      if (!copied) continue;
      await page.waitForTimeout(300);
      const clipboard = (await readClipboard(page)).trim();
      const match = clipboard.match(pattern);
      if (match) return match[0];
      const sysClip = (await readSystemClipboard()).trim();
      const sysMatch = sysClip.match(pattern);
      if (sysMatch) return sysMatch[0];
    }
  }

  if (anchor) {
    const row = anchor.locator('xpath=ancestor::*[self::div or self::section or self::article or self::tr][1]');
    if (kind === 'appSecret') {
      await clickIconButton(row, ['VisibleOutlined', 'Visible'], 1).catch(() => false);
      await clickIfVisible(row, ['显示', '查看', 'Reveal', 'Show'], { roles: ['button'] }).catch(() => false);
      await page.waitForTimeout(250);
    }
    const rowText = await row.innerText().catch(() => '');
    const rowMatch = firstPatternMatch(pattern, rowText);
    if (rowMatch) {
      return rowMatch;
    }

    const copied =
      (await clickIconButton(row, ['CopyOutlined', 'Copy'], 0).catch(() => false)) ||
      (await clickIfVisible(row, ['复制', 'Copy'], { roles: ['button'] }));
    if (copied) {
      await page.waitForTimeout(250);
      const clipboard = await readClipboard(page);
      const clipboardMatch = clipboard.match(pattern);
      if (clipboardMatch) {
        return clipboardMatch[0];
      }
    }

    const input = await maybeVisible(row.locator('input:not([type="hidden"]), textarea'));
    if (input) {
      const inputValue = await input.inputValue().catch(() => '');
      const inputMatch = firstPatternMatch(pattern, inputValue);
      if (inputMatch) {
        return inputMatch;
      }
    }
  }

  const fallbackMatch = firstPatternMatch(
    pattern,
    readCredentialFromNetwork(kind, existingAppId),
    await readCredentialTextByDom(page, label).catch(() => ''),
    await page.locator('body').innerText().catch(() => ''),
  );
  if (fallbackMatch) {
    return fallbackMatch;
  }

  throw new Error(`Unable to extract ${label}`);
}

async function captureScreenshot(page, artifactDir, name) {
  const screenshotPath = path.join(artifactDir, `${name}.png`);
  await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => {});
  return screenshotPath;
}

async function waitForConsoleReady(page, portalUrl, loginTimeoutMs) {
  stderrLog('Opening Feishu developer console');
  await page.goto(portalUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle').catch(() => {});
  await waitForUiIdle(page, 3_000).catch(() => {});
  await settleLoginLanding(page).catch(() => {});

  const loginReady = async () => findConsoleReadyLocator(page);
  const visible = await loginReady();
  if (visible) {
    return;
  }

  stderrLog('Waiting for QR-code login in the browser window');
  const end = Date.now() + loginTimeoutMs;
  while (Date.now() < end) {
    await settleLoginLanding(page).catch(() => {});
    const locator = await loginReady();
    if (locator) {
      return;
    }
    await page.waitForTimeout(1000);
  }

  throw new Error('Timed out waiting for Feishu login');
}

async function extractVisibleApps(page) {
  return await page.evaluate(() => {
    const normalize = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();
    return Array.from(document.querySelectorAll('tr.app-table__row[data-row-key], tr[data-row-key]'))
      .map((row) => {
        const cells = Array.from(row.querySelectorAll('td')).map((cell) => normalize(cell.textContent));
        const meaningful = cells.filter(Boolean);
        return {
          appId: row.getAttribute('data-row-key') || row.dataset.rowKey || '',
          name: cells[1] || meaningful[0] || '',
          owner: cells[2] || '',
          role: cells[3] || '',
          status: cells[4] || '',
          latest: cells[5] || '',
          rowText: normalize(row.textContent),
        };
      })
      .filter((row) => row.appId && row.name);
  });
}

async function getAppSearchInput(page) {
  return (
    (await maybeVisible(page.getByPlaceholder(/搜索应用名称或 App ID/))) ??
    (await maybeVisible(page.locator('input[placeholder*="搜索应用名称"], input[placeholder*="App ID"]').first()))
  );
}

async function searchApps(page, query) {
  const input = await getAppSearchInput(page);
  if (input) {
    await input.click({ timeout: 2_000 }).catch(() => {});
    await input.fill('').catch(() => {});
    if (query) {
      await input.fill(query).catch(async () => {
        await setControlledText(input, query);
      });
      await input.press('Enter').catch(() => {});
    }
    await page.waitForTimeout(1_200);
    await page.waitForLoadState('networkidle').catch(() => {});
    await waitForUiIdle(page, 5_000).catch(() => {});
  }

  return await extractVisibleApps(page);
}

async function clearAppSearch(page) {
  const input = await getAppSearchInput(page);
  if (!input) {
    return;
  }
  await input.fill('').catch(() => {});
  await page.waitForTimeout(400);
}

async function inspectAppStatus(page, portalUrl, appId) {
  await page.goto(portalUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle').catch(() => {});
  await waitForUiIdle(page, 5_000).catch(() => {});
  const matches = (await searchApps(page, appId)).filter((row) => row.appId === appId);
  await clearAppSearch(page);
  return matches[0] ?? null;
}

async function findReusableApp(page, payload) {
  const desiredName = normalizeSpace(payload.appName || payload.botName);
  const aliasNames = ensureArray(payload.aliasNames || [])
    .map((name) => normalizeSpace(name))
    .filter((name) => name && name !== desiredName);

  const exactMatches = (await searchApps(page, desiredName))
    .filter((row) => normalizeSpace(row.name) === desiredName);

  if (exactMatches.length > 1) {
    throw new Error(
      `Found ${exactMatches.length} existing Feishu apps named "${desiredName}". Refusing to create another duplicate.`,
    );
  }

  if (exactMatches.length === 1) {
    await clearAppSearch(page);
    return {
      ...exactMatches[0],
      matchType: 'exact',
    };
  }

  const legacyMatches = [];
  for (const aliasName of aliasNames) {
    const aliasRows = (await searchApps(page, aliasName))
      .filter((row) => normalizeSpace(row.name) === aliasName)
      .map((row) => ({ ...row, matchType: 'legacy' }));
    legacyMatches.push(...aliasRows);
  }
  await clearAppSearch(page);

  if (legacyMatches.length > 0) {
    const matchedNames = legacyMatches.map((row) => `${row.name} (${row.appId})`).join(', ');
    throw new Error(
      `Found legacy-named Feishu app(s) for "${desiredName}": ${matchedNames}. Refusing to create a duplicate.`,
    );
  }

  return null;
}

async function openExistingApp(page, origin, appId) {
  stderrLog(`Reusing existing Feishu app: ${appId}`);
  await page.goto(`${origin}/app/${appId}/baseinfo`, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle').catch(() => {});
  await waitForUiIdle(page, 10_000).catch(() => {});
  await dismissInterferingPopups(page).catch(() => {});
}

async function createSelfBuiltApp(page, payload) {
  stderrLog('Creating Feishu self-built app');
  await dismissInterferingPopups(page).catch(() => {});
  await clickByText(page, ['创建企业自建应用', 'Create Custom App', '创建应用']);
  const dialog = await findDialog(page, ['创建企业自建应用', 'Create Custom App']);

  const nameInput = await fillField(dialog, ['应用名称', '名称', 'App Name'], payload.appName).then(() => null).catch(async () => {
    const nameInput = await maybeVisible(dialog.locator('input:not([type="hidden"]):not([readonly])'));
    if (!nameInput) {
      throw new Error('Unable to find App Name input inside create-app dialog');
    }
    return nameInput;
  });
  if (nameInput) {
    await setControlledText(nameInput, payload.appName);
  }

  const descriptionField = await fillField(dialog, ['应用描述', '描述', 'Description'], payload.appDescription)
    .then(() => null)
    .catch(async () => {
    const descriptionField =
      (await maybeVisible(dialog.locator('textarea'))) ??
      (await maybeVisible(dialog.locator('input:not([type="hidden"]):not([readonly])').nth(1)));
    if (!descriptionField) {
      throw new Error('Unable to find App Description field inside create-app dialog');
    }
    return descriptionField;
  });
  if (descriptionField) {
    await setControlledText(descriptionField, payload.appDescription);
  }

  if (payload.iconPath) {
    const fileInput = await maybeVisible(dialog.locator('input[type="file"]'));
    if (fileInput) {
      await fileInput.setInputFiles(payload.iconPath);
    }
  }

  const createButton = await clickByTextInRoot(page, dialog, ['创建', '确认创建', '确定', 'Create'], { roles: ['button'] });
  await waitForAppCreation(page, dialog).catch(async () => {
    await createButton.evaluate((node) => node.click()).catch(() => {});
    await waitForAppCreation(page, dialog);
  });
  await page.waitForLoadState('networkidle').catch(() => {});
  await waitForUiIdle(page).catch(() => {});
}

async function goToCredentials(page) {
  stderrLog('Reading App ID / App Secret');
  const credentialsLink = await findLocatorByText(page, ['凭证与基础信息', 'Credentials & Basic Info'], ['link', 'tab', 'button']);
  const href = credentialsLink ? await credentialsLink.getAttribute('href').catch(() => null) : null;

  if (credentialsLink) {
    try {
      await credentialsLink.click({ timeout: DEFAULT_STEP_TIMEOUT_MS });
      await page.waitForLoadState('networkidle').catch(() => {});
      return;
    } catch {
      // Fall through to direct navigation when overlays intercept pointer events.
    }
  }

  if (href) {
    await page.goto(new URL(href, page.url()).toString(), { waitUntil: 'domcontentloaded' });
  }
  await page.waitForLoadState('networkidle').catch(() => {});
}

async function goToPermissions(page) {
  await clickByText(page, ['权限管理', 'Permission Management'], { roles: ['link', 'tab', 'button'] });
  await page.waitForLoadState('networkidle').catch(() => {});
  await waitForUiIdle(page).catch(() => {});
}

async function verifyImportedPermissions(page, permissionsJson) {
  // Lightweight verification — just navigate to permissions page and do a simple body text check.
  // Avoid searching individual scopes (triggers UI side-effects and is fragile with virtualization).
  const scopeIds = flattenScopeIds(permissionsJson);
  if (scopeIds.length === 0) {
    return;
  }

  await goToPermissions(page);
  await page.waitForTimeout(1500);

  const body = await page.locator('body').innerText().catch(() => '');
  // Just check for a few sample scope IDs in the body text — don't search one by one
  const samples = scopeIds.slice(0, 3);
  const found = samples.filter((id) => body.includes(id));

  if (found.length === 0) {
    throw new Error(`No imported Feishu scopes visible on page (checked ${samples.join(', ')})`);
  }
  stderrLog(`Verified ${found.length}/${samples.length} sample scopes on page`);
}

/**
 * Handle the data-scope configuration step that appears after "确认新增权限".
 * Some permissions (e.g. contact:contact.base:readonly) require setting a data
 * access range. The dialog shows a list of scopes with scope selectors.
 * Strategy: select the broadest option ("全部成员"/"全部"/"all") for each, then confirm.
 */
async function handleDataScopeStep(page, dialog) {
  stderrLog('Data scope step detected — configuring data access ranges');

  // Give the step UI time to fully render
  await page.waitForTimeout(1500);

  // Strategy 1: Click all "全部成员"/"全部数据"/"全部" radio/option buttons within the dialog
  const scopeSelected = await dialog.evaluate(() => {
    let clicked = 0;
    // Look for radio buttons, selectable options, or links with "全部" text
    const allElements = document.querySelectorAll(
      '[role="dialog"] button, [role="dialog"] [role="radio"], [role="dialog"] [role="option"], ' +
      '[role="dialog"] label, [role="dialog"] span[class*="radio"], [role="dialog"] div[class*="radio"], ' +
      '[aria-modal="true"] button, [aria-modal="true"] [role="radio"], [aria-modal="true"] label, ' +
      '[class*="modal"] button, [class*="modal"] [role="radio"], [class*="modal"] label'
    );
    const scopeLabels = ['全部成员', '全部数据', '全部', '不限'];
    for (const el of allElements) {
      const text = el.textContent?.trim();
      if (!text) continue;
      for (const label of scopeLabels) {
        if (text === label || text.startsWith(label)) {
          const rect = el.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0) {
            el.click();
            clicked++;
            break;
          }
        }
      }
    }
    return clicked;
  });
  stderrLog(`Data scope: selected ${scopeSelected} "全部" option(s)`);

  await page.waitForTimeout(800);

  // Strategy 2: If there are dropdown-style selectors, try to set them
  // Look for any "设置" or "编辑" links within scope rows and click "全部"
  const editLinks = dialog.locator('a, button').filter({ hasText: /设置|编辑|修改|选择/ });
  const editCount = await editLinks.count().catch(() => 0);
  for (let i = 0; i < Math.min(editCount, 10); i++) {
    const link = editLinks.nth(i);
    if (!(await link.isVisible().catch(() => false))) continue;
    await link.click({ timeout: 2000 }).catch(() => {});
    await page.waitForTimeout(600);
    // In the sub-dialog, select "全部" and confirm
    const subClicked = await page.evaluate(() => {
      const labels = ['全部成员', '全部数据', '全部', '不限'];
      const candidates = document.querySelectorAll('[role="dialog"] [role="radio"], [role="dialog"] label, [role="listbox"] [role="option"]');
      for (const el of candidates) {
        const text = el.textContent?.trim();
        for (const label of labels) {
          if (text === label || text?.startsWith(label)) {
            el.click();
            return true;
          }
        }
      }
      return false;
    });
    if (subClicked) {
      await page.waitForTimeout(400);
      // Confirm the sub-dialog
      await page.evaluate(() => {
        const btns = document.querySelectorAll('[role="dialog"] button');
        for (const btn of btns) {
          const text = btn.textContent?.trim();
          if (text === '确定' || text === '确认' || text === '保存') {
            btn.click();
            return;
          }
        }
      });
      await page.waitForTimeout(500);
    }
  }

  await page.waitForTimeout(800);

  // Click the final confirm/submit button of the data scope step
  const finalConfirm = await dialog.evaluate(() => {
    const labels = ['确认', '确定', '提交', '完成', '下一步'];
    const buttons = document.querySelectorAll('[role="dialog"] button, [aria-modal="true"] button, [class*="modal"] button');
    for (const btn of [...buttons].reverse()) { // prefer last (bottom) button
      const text = btn.textContent?.trim();
      if (!text || btn.disabled) continue;
      const rect = btn.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      for (const label of labels) {
        if (text.includes(label)) {
          btn.click();
          return text;
        }
      }
    }
    return null;
  });

  if (finalConfirm) {
    stderrLog(`Data scope: clicked final confirm "${finalConfirm}"`);
  } else {
    stderrLog('Data scope: no final confirm button found, dialog may auto-close');
  }

  await page.waitForTimeout(1500);
}

async function importPermissions(page, permissionsJson) {
  stderrLog('Importing permission scopes from JSON');
  await goToPermissions(page);
  await dismissInterferingPopups(page).catch(() => {});

  // Click the bulk import button
  await clickByText(page, ['批量导入/导出权限', '批量导入', 'Bulk Import'], { roles: ['button', 'link'] });
  await page.waitForTimeout(1500);

  // Find the dialog — look for the actual visible modal overlay
  const dialog = await findDialog(page, ['批量导入', '导出权限', 'JSON'], { timeoutMs: 10_000 }).catch(() => null);
  const dialogRoot = dialog ?? page; // fallback to page if dialog detection fails

  // Make sure we're on the "导入" tab
  await clickIfVisible(dialogRoot, ['导入', 'Import'], { roles: ['tab', 'button'] }).catch(() => false);
  await page.waitForTimeout(500);

  const serialized = JSON.stringify(permissionsJson, null, 2);

  // Wait for Monaco to be FULLY loaded (spinner gone, view-lines rendered)
  stderrLog('Waiting for permission editor to load...');
  const editor = await waitForPermissionEditor(page, dialogRoot);
  stderrLog(`Editor ready: kind=${editor.kind}`);

  if (editor.kind === 'monaco') {
    // Paste directly into Monaco (pasteIntoMonaco handles clearing + retry + verification)
    await pasteIntoMonaco(page, serialized, dialogRoot);
    // Click "格式化 JSON" to validate the pasted content is valid JSON
    await clickIfVisible(dialogRoot, ['格式化 JSON', 'Format JSON'], { roles: ['button'] }).catch(() => false);
    await page.waitForTimeout(800);
  } else if (editor.kind === 'textarea') {
    await setControlledText(editor.locator, serialized);
  } else {
    await editor.locator.click({ timeout: DEFAULT_STEP_TIMEOUT_MS }).catch(() => {});
    await editor.locator.evaluate((node, nextValue) => {
      node.textContent = nextValue;
      node.dispatchEvent(new Event('input', { bubbles: true }));
      node.dispatchEvent(new Event('change', { bubbles: true }));
    }, serialized).catch(() => {});
  }

  // Wait a moment for the editor to process the content, then click "下一步，确认新增权限"
  await page.waitForTimeout(1000);

  // The button text is "下一步，确认新增权限" — try exact match first, then partial
  const confirmBtn =
    (await maybeVisible(dialogRoot.locator('button').filter({ hasText: /确认新增权限/ }))) ??
    (await maybeVisible(dialogRoot.locator('button').filter({ hasText: /下一步/ }))) ??
    (await findLocatorByText(dialogRoot, ['确认新增权限', '下一步', '导入', 'Import'], ['button']));

  if (confirmBtn) {
    // Wait for button to be enabled (not disabled)
    for (let i = 0; i < 10; i++) {
      const disabled = await confirmBtn.isDisabled().catch(() => true);
      if (!disabled) break;
      await page.waitForTimeout(500);
    }
    await confirmBtn.click({ timeout: DEFAULT_STEP_TIMEOUT_MS }).catch(async () => {
      await confirmBtn.evaluate((node) => node.click()).catch(() => {});
    });
  } else {
    await clickByTextInRoot(page, dialogRoot, ['确认新增权限', '下一步', '导入', 'Import'], { roles: ['button'] });
  }

  await page.waitForTimeout(2000);

  // After "确认新增权限", the dialog may transition to a data-scope configuration step
  // instead of closing. This happens when permissions like contact:contact.base:readonly
  // require setting a data access range (全部成员 / 指定部门 etc.).
  if (dialog) {
    const dialogStillVisible = await dialog.isVisible().catch(() => false);
    if (dialogStillVisible) {
      await handleDataScopeStep(page, dialog);
    }
    await dialog.waitFor({ state: 'hidden', timeout: 15_000 }).catch(() => {});
  }
  await page.waitForTimeout(500);

  // Handle the permission approval dialogs that may appear AFTER the import dialog closes.
  // Use direct CSS selectors for speed — findLocatorByText is too slow for time-critical dialogs.
  for (let round = 0; round < 5; round++) {
    // Fast: scan all visible buttons with direct text matching
    const approvalBtn = await page.evaluate(() => {
      const approvalLabels = ['申请开通', '确认开通权限', '确认开通', '确定', '确认'];
      const buttons = document.querySelectorAll('button');
      for (const btn of buttons) {
        const text = btn.textContent?.trim();
        if (!text) continue;
        // Skip disabled buttons
        if (btn.disabled) continue;
        // Check visibility
        const rect = btn.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) continue;
        const style = window.getComputedStyle(btn);
        if (style.display === 'none' || style.visibility === 'hidden') continue;
        // Match approval labels
        for (const label of approvalLabels) {
          if (text.includes(label)) {
            btn.click();
            return label;
          }
        }
      }
      return null;
    });

    if (!approvalBtn) break;
    stderrLog(`Clicked permission approval: "${approvalBtn}" (round ${round + 1})`);
    await page.waitForTimeout(800);
  }

  // Dismiss informational popups only
  await dismissInterferingPopups(page).catch(() => {});
  await page.waitForTimeout(300);

  // Verify — warn only, don't block the flow.
  try {
    await verifyImportedPermissions(page, permissionsJson);
    stderrLog('Permission verification passed');
  } catch (verifyError) {
    stderrLog(`Permission verification warning (non-blocking): ${verifyError.message}`);
  }
}

async function enableBot(page, botName) {
  stderrLog('Enabling bot capability');
  await clickIfVisible(page, ['应用能力', 'Capabilities'], { roles: ['link', 'tab', 'button'] }).catch(() => false);
  await page.waitForLoadState('networkidle').catch(() => {});
  await waitForUiIdle(page).catch(() => {});
  await dismissInterferingPopups(page).catch(() => {});

  let addCapability = false;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    addCapability = await clickIfVisible(page, ['添加应用能力', 'Add App Capability'], { roles: ['button', 'link'] }).catch(
      () => false,
    );
    if (addCapability) {
      break;
    }
    await page.waitForTimeout(700);
    await dismissInterferingPopups(page).catch(() => {});
  }
  if (addCapability) {
    await page.waitForTimeout(1200);
    await dismissInterferingPopups(page).catch(() => {});
    const addButton =
      (await maybeVisible(page.locator('button').filter({ hasText: /^(\+\s*)?添加$/ }))) ??
      (await maybeVisible(page.locator('button').filter({ hasText: /^Add$/i })));
    if (addButton) {
      await addButton.click({ timeout: DEFAULT_STEP_TIMEOUT_MS });
      await page.waitForTimeout(1000);
      await dismissInterferingPopups(page).catch(() => {});
    }
  }

  const botDialog = await findDialog(page, ['机器人', 'Bot'], { timeoutMs: 2_000 }).catch(() => null);
  if (botDialog) {
    const dialogButtons = botDialog.locator('button');
    const buttonCount = await dialogButtons.count().catch(() => 0);
    const confirmAdd = buttonCount > 0 ? dialogButtons.nth(buttonCount - 1) : null;
    if (confirmAdd) {
      await confirmAdd.click({ timeout: DEFAULT_STEP_TIMEOUT_MS, force: true }).catch(() => {});
      await confirmAdd.evaluate((node) => node.click()).catch(() => {});
    }
    await botDialog.waitFor({ state: 'hidden', timeout: 5_000 }).catch(() => {});
    const stillVisible = await botDialog.isVisible().catch(() => false);
    if (stillVisible) {
      await clickIfVisible(botDialog, ['关闭', '取消', 'Close', 'Cancel'], { roles: ['button'] }).catch(() => false);
    }
  }

  await clickIfVisible(page, ['机器人', 'Bot'], { roles: ['link', 'tab', 'button'] }).catch(() => false);
  await clickIfVisible(page, ['启用机器人', '开启机器人能力', 'Enable Bot'], { roles: ['button', 'switch', 'checkbox'] }).catch(
    () => false,
  );
  await fillField(page, ['机器人名称', 'Bot Name'], botName, { fallbackIndex: 0 }).catch(() => {});
  await clickIfVisible(page, ['保存', 'Save'], { roles: ['button'] }).catch(() => false);
  await page.waitForTimeout(800);
  await dismissInterferingPopups(page).catch(() => {});
  await page.waitForTimeout(600);
  await dismissInterferingPopups(page).catch(() => {});
}

async function dismissDangerousDialogs(page) {
  // Handle dialogs like "确认关闭权限?" by clicking Cancel — these must NOT be confirmed
  const dangerousPatterns = ['确认关闭权限', '确认删除', '确认移除'];
  for (const pattern of dangerousPatterns) {
    const dialog = await findDialog(page, [pattern], { timeoutMs: 1_000 }).catch(() => null);
    if (dialog) {
      stderrLog(`Found dangerous dialog "${pattern}" — clicking Cancel`);
      await clickIfVisible(dialog, ['取消', 'Cancel'], { roles: ['button'] }).catch(() => false);
      await page.waitForTimeout(500);
    }
  }
}

async function configureEventSubscription(page, wsReady = false) {
  stderrLog('Configuring event subscription');

  // First dismiss any dangerous dialogs left over from permissions page
  await dismissDangerousDialogs(page).catch(() => {});
  await dismissInterferingPopups(page).catch(() => {});

  // Navigate to event subscription page via URL for reliability
  const currentUrl = page.url();
  const appMatch = currentUrl.match(/\/app\/(cli_[a-z0-9]+)/);
  if (appMatch) {
    const eventUrl = currentUrl.replace(/\/app\/cli_[a-z0-9]+.*/, `/app/${appMatch[1]}/event`);
    stderrLog(`Navigating to event subscription via URL: ${eventUrl}`);
    await page.goto(eventUrl, { waitUntil: 'domcontentloaded' }).catch(() => {});
  } else {
    await clickIfVisible(page, ['事件与回调', '事件订阅', 'Event Subscriptions', 'Events & Callbacks'], {
      roles: ['link', 'tab', 'button'],
    }).catch(() => false);
  }
  await page.waitForLoadState('networkidle').catch(() => {});
  await waitForUiIdle(page, 30_000).catch(() => {});
  await dismissDangerousDialogs(page).catch(() => {});
  await dismissInterferingPopups(page).catch(() => {});

  // Check if event already exists
  const bodyText = await page.locator('body').innerText().catch(() => '');
  if (bodyText.includes(REQUIRED_EVENT) || bodyText.includes('接收消息')) {
    stderrLog('Event im.message.receive_v1 already configured, skipping');
    return;
  }

  // Capture a CSRF token by triggering the edit → save flow
  let csrfToken = null;
  const csrfHandler = (req) => {
    const csrf = req.headers()['x-csrf-token'];
    if (csrf) csrfToken = csrf;
  };
  page.on('request', csrfHandler);

  // Click the edit icon next to 订阅方式 to trigger a CSRF-bearing request
  const editBtn = page.locator('text=订阅方式').locator('..').locator('button').first();
  if (await editBtn.isVisible().catch(() => false)) {
    await editBtn.click({ force: true });
    await page.waitForTimeout(1500);

    const saveBtn = page.locator('button.ud__button--filled').filter({ hasText: /保存/ }).first();
    if (await saveBtn.isVisible().catch(() => false)) {
      await saveBtn.click().catch(() => {});
      await page.waitForTimeout(2000);
    }
  }

  page.off('request', csrfHandler);

  if (!csrfToken) {
    stderrLog('Could not capture CSRF token — cannot configure event subscription');
    return;
  }

  // If SDK long connection was NOT established, we can't set event mode
  if (!wsReady) {
    // One last attempt: try the API anyway — maybe it connected after we last checked
    const wsNow = await waitForLongConnection(5_000);
    if (!wsNow) {
      stderrLog('Event subscription deferred: SDK long connection not established. Events will be configured when Gateway starts.');
      return;
    }
    stderrLog('SDK connection established in last-chance wait');
  }

  // SDK long connection is ready — set event mode to long connection (4) via internal API
  stderrLog('Setting long connection mode via internal API...');
  const switchResult = await page.evaluate(async ({ appId, csrf }) => {
    try {
      const resp = await fetch(`/developers/v1/event/switch/${appId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrf },
        body: JSON.stringify({ eventMode: 4 }),
      });
      return await resp.json();
    } catch {
      return { code: -1, msg: 'fetch error' };
    }
  }, { appId: appMatch?.[1], csrf: csrfToken });

  if (switchResult.code === 0) {
    stderrLog('Long connection mode set successfully');
  } else {
    stderrLog(`Event mode switch failed: code=${switchResult.code} msg=${switchResult.msg}`);
    return;
  }

  // Reload page — "添加事件" should now be enabled
  await page.reload({ waitUntil: 'networkidle' }).catch(() => {});
  await page.waitForTimeout(2000);

  const addBtn = page.locator('button').filter({ hasText: /添加事件/ });
  const isDisabled = await addBtn.isDisabled().catch(() => true);

  if (isDisabled) {
    stderrLog('"添加事件" still disabled after mode switch — deferring');
    return;
  }

  // Button is enabled — add the event via UI
  stderrLog('"添加事件" is enabled — adding event...');
  await addBtn.click();
  await page.waitForTimeout(2000);

  const eventDialog = await findDialog(page, ['添加事件', '订阅事件', 'Add Event'], { timeoutMs: 5_000 }).catch(() => null);
  const eventRoot = eventDialog ?? page;

  // Search for the event
  const searchTerms = [REQUIRED_EVENT, '接收消息', 'im.message'];
  let eventFound = false;

  for (const term of searchTerms) {
    stderrLog(`Searching for event: ${term}`);
    const searchInput =
      (await maybeVisible(eventRoot.locator('input[placeholder*="搜索"], input[placeholder*="Search"], input[type="search"]').first())) ??
      (await maybeVisible(eventRoot.locator('input').first()));

    if (searchInput) {
      await searchInput.click({ timeout: 2000 }).catch(() => {});
      await searchInput.fill('');
      await page.waitForTimeout(300);
      await searchInput.fill(term);
    } else {
      await fillField(eventRoot, ['搜索事件', '事件名称', 'Search Event', '搜索'], term, { fallbackIndex: 0 }).catch(async () => {
        await page.keyboard.type(term);
      });
    }
    await page.waitForTimeout(1500);

    const clicked =
      (await clickIfVisible(eventRoot, [REQUIRED_EVENT, '接收消息', 'Receive messages'], { roles: ['option', 'button', 'link', 'checkbox', 'listitem'] }).catch(() => false)) ||
      (await clickIfVisible(eventRoot, ['im.message.receive_v1'], { roles: ['text'] }).catch(() => false));

    if (clicked) {
      eventFound = true;
      stderrLog(`Event found and selected via search term: ${term}`);
      break;
    }

    const resultCheckbox = await maybeVisible(eventRoot.locator('[class*="checkbox"], [class*="check-box"], [role="checkbox"]').first());
    if (resultCheckbox) {
      await resultCheckbox.click({ timeout: 2000 }).catch(() => {});
      eventFound = true;
      stderrLog('Event selected via checkbox in results');
      break;
    }

    if (searchInput) {
      await searchInput.fill('');
      await page.waitForTimeout(500);
    }
  }

  if (!eventFound) {
    stderrLog('Warning: Could not find event in search results');
  }

  // Confirm event addition
  await clickIfVisible(eventRoot, ['确认添加', '确认', '添加', 'Confirm', 'Add'], { roles: ['button'] }).catch(() => false);
  await page.waitForTimeout(1500);

  // Handle permission approval dialogs
  for (let round = 0; round < 3; round++) {
    const clicked =
      (await clickIfVisible(page, ['确认开通权限', '申请开通', 'Confirm'], { roles: ['button'] }).catch(() => false)) ||
      (await clickIfVisible(page, ['暂不开通', '稍后处理'], { roles: ['button'] }).catch(() => false));
    if (!clicked) break;
    stderrLog(`Handled event permission dialog (round ${round + 1})`);
    await page.waitForTimeout(1000);
  }

  await dismissInterferingPopups(page).catch(() => {});
  stderrLog('Event subscription configured successfully');
}

async function publishVersion(page, appName, version = nextReleaseVersion()) {
  stderrLog('Creating and publishing application version');
  await clickByText(page, ['版本管理与发布', 'Version Management & Release'], {
    roles: ['link', 'tab', 'button'],
    timeoutMs: 30_000,
  });
  await page.waitForLoadState('networkidle').catch(() => {});
  await waitForUiIdle(page, 30_000).catch(() => {});
  await clickIfVisible(page, ['创建版本', '新建版本', 'Create Version'], { roles: ['button'] }).catch(() => false);
  await page.waitForLoadState('domcontentloaded').catch(() => {});
  await waitForUiIdle(page, 10_000).catch(() => {});
  await page.waitForTimeout(1200);

  const versionInput =
    (await maybeVisible(page.getByPlaceholder(/正式版本号/))) ??
    (await maybeVisible(page.locator('input[placeholder*="版本号"]').nth(0)));
  if (versionInput) {
    await setControlledText(versionInput, version);
  } else {
    await fillField(page, ['应用版本号', '版本号', 'Version', '版本'], version, { fallbackIndex: 1 }).catch(() => {});
  }

  const releaseNotes =
    (await maybeVisible(page.getByPlaceholder(/更新日志/))) ??
    (await maybeVisible(page.locator('textarea[placeholder*="更新日志"], textarea').first()));
  if (releaseNotes) {
    await setControlledText(releaseNotes, `${appName} 自动初始化版本`);
  } else {
    await fillField(page, ['更新说明', '版本说明', '更新日志', 'Release Notes'], `${appName} 自动初始化版本`, {
      fallbackIndex: 0,
    }).catch(() => {});
  }

  await clickIfVisible(page, ['保存', '创建', '确认', 'Save'], { roles: ['button'] }).catch(() => false);
  await Promise.race([
    page.waitForURL(/\/version\/\d+/).catch(() => {}),
    page.waitForTimeout(5_000),
  ]);
  await page.waitForTimeout(1000);
  await dismissInterferingPopups(page).catch(() => {});

  // Click "确认发布" on the version page — use JS for speed and precision
  const publishClicked = await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(
      (b) => /确认发布|提交审核并发布|发布版本|提交审核/.test(b.textContent?.trim() ?? '')
    );
    if (btn && !btn.disabled) {
      btn.click();
      return true;
    }
    return false;
  });

  if (!publishClicked) {
    // Fallback: use Playwright locator
    await clickIfVisible(page, ['确认发布', '提交审核并发布', '发布版本', '提交审核', 'Publish'], {
      roles: ['button'],
    }).catch(() => false);
  }
  stderrLog('Clicked publish button');
  await page.waitForTimeout(2000);

  // Wait for the publish confirmation dialog ("确认提交发布申请?")
  const publishDialog = await findDialog(page, ['确认提交发布申请', '确认发布', '提交发布申请'], {
    timeoutMs: 8_000,
  }).catch(() => null);

  if (publishDialog) {
    stderrLog('Found publish confirmation dialog — clicking confirm ONCE');
    // Click the primary/filled button inside the dialog ONCE using JS for speed
    const confirmed = await publishDialog.evaluate((dialog) => {
      // Find the primary/filled button (not "取消")
      const buttons = dialog.querySelectorAll('button');
      for (const btn of buttons) {
        const text = btn.textContent?.trim() ?? '';
        if (text.includes('取消') || text.includes('Cancel')) continue;
        if (text.includes('确认') || text.includes('发布') || text.includes('Publish')) {
          btn.click();
          return text;
        }
      }
      return null;
    });
    stderrLog(`Clicked: "${confirmed}"`);

    // Wait for dialog to close — don't click again
    await publishDialog.waitFor({ state: 'hidden', timeout: 15_000 }).catch(() => {});
  } else {
    stderrLog('No publish dialog found — may have auto-confirmed');
  }

  // Wait for publish to complete
  await Promise.race([
    page.waitForFunction(() => document.body.innerText.includes('已发布') || document.body.innerText.includes('当前修改均已发布'), {
      timeout: 15_000,
    }).catch(() => {}),
    page.waitForTimeout(15_000),
  ]);
  stderrLog('Publish flow completed');
}

async function runStep(result, name, handler, options = {}) {
  const startedAt = new Date().toISOString();
  try {
    const data = await handler();
    result.steps.push({ name, status: 'ok', startedAt, finishedAt: new Date().toISOString() });
    return data;
  } catch (error) {
    const failure = {
      name,
      status: options.optional ? 'warning' : 'error',
      startedAt,
      finishedAt: new Date().toISOString(),
      detail: error instanceof Error ? error.message : String(error),
    };
    result.steps.push(failure);
    if (!options.optional) {
      throw error;
    }
    result.warnings.push(`${name}: ${failure.detail}`);
    return null;
  }
}

async function loadJson(filePath) {
  const content = await fs.readFile(filePath, 'utf8');
  return JSON.parse(content);
}

async function main() {
  const rawPayload = process.argv[2];
  if (!rawPayload) {
    throw new Error('Expected serialized payload as argv[2]');
  }

  const payload = JSON.parse(rawPayload);
  const domain = payload.domain === 'lark' ? 'lark' : 'feishu';
  const origin = baseOrigin(domain);
  const portalUrl = `${origin}/app`;
  const loginTimeoutMs = Number(payload.loginTimeoutMs || DEFAULT_LOGIN_TIMEOUT_MS);
  const profileDir = payload.profileDir || path.join(os.homedir(), '.clawmom', 'feishu-profile');
  const artifactDir = payload.artifactDir || path.join(os.tmpdir(), `clawmom-feishu-${unixStamp()}`);
  const executablePath = await resolveBrowserExecutable(payload.browserExecutablePath);

  if (!executablePath) {
    throw new Error('No supported Chromium-based browser found. Install Chrome, Edge, Brave, or Chromium first.');
  }

  await fs.mkdir(profileDir, { recursive: true });
  await fs.mkdir(artifactDir, { recursive: true });

  const permissionsJson = payload.permissionsPath
    ? await loadJson(payload.permissionsPath)
    : await loadJson(new URL('./feishu-bot-scopes.json', import.meta.url));

  const result = {
    ok: false,
    domain,
    appName: payload.appName,
    botName: payload.botName,
    profileDir,
    artifactDir,
    browserExecutablePath: executablePath,
    consoleUrl: portalUrl,
    warnings: [],
    steps: [],
  };

  let context;
  let page;
  let shouldKeepBrowserOpen = Boolean(payload.keepBrowserOpen);

  try {
    await terminateCompetingBrowserProcesses(profileDir);
    await clearProfileLockArtifacts(profileDir);

    context = await chromium.launchPersistentContext(profileDir, {
      executablePath,
      headless: false,
      viewport: null,
      args: ['--start-maximized', '--disable-blink-features=AutomationControlled'],
    });
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin }).catch(() => {});
    page = context.pages()[0] ?? await context.newPage();
    page.on('dialog', async (dialog) => {
      stderrLog(`Dismissing browser dialog: ${dialog.message()}`);
      await dialog.dismiss().catch(() => {});
    });
    attachNetworkCapture(page);

    await runStep(result, 'login', () => waitForConsoleReady(page, portalUrl, loginTimeoutMs));
    const matchedExistingApp = await runStep(result, 'dedupe_check', () => findReusableApp(page, payload));
    if (matchedExistingApp) {
      result.reusedExistingApp = true;
      result.matchedExistingApp = matchedExistingApp;
      result.appName = matchedExistingApp.name;
      await runStep(result, 'open_existing_app', () => openExistingApp(page, origin, matchedExistingApp.appId));
    } else {
      await runStep(result, 'create_app', () => createSelfBuiltApp(page, payload));
    }
    await runStep(result, 'bot_capability', () => enableBot(page, payload.botName || payload.appName), {
      optional: true,
    });
    await runStep(result, 'credentials_page', () => goToCredentials(page));

    const appId = await runStep(result, 'extract_app_id', () => extractCredential(page, 'App ID', 'appId'));
    const appSecret = await runStep(result, 'extract_app_secret', () =>
      extractCredential(page, 'App Secret', 'appSecret', appId),
    );

    result.appId = appId;
    result.appSecret = appSecret;
    result.consoleUrl = page.url();

    // Start SDK long connection in background — Feishu requires this before event subscription
    // This runs in parallel with permissions import (~40s) to save time
    startLongConnection(appId, appSecret);

    await runStep(result, 'permissions', () => importPermissions(page, permissionsJson));

    // Wait for SDK connection (should be ready by now since permissions took ~40s)
    const wsReady = await waitForLongConnection(15_000);
    stderrLog(`Long connection ready: ${wsReady}`);

    await runStep(result, 'event_subscription', () => configureEventSubscription(page, wsReady), { optional: true });
    result.eventSubscriptionDeferred = !wsReady;
    result.requiredEvent = REQUIRED_EVENT;

    // Stop the SDK connection before publishing — no longer needed
    stopLongConnection();

    const currentAppState = await runStep(result, 'postcheck_status', () => inspectAppStatus(page, portalUrl, appId), {
      optional: true,
    });
    result.currentAppState = currentAppState;

    const appHasPendingChanges = !matchedExistingApp || !currentAppState || /已修改|待上线/.test(
      `${currentAppState?.status || matchedExistingApp?.status || ''} ${currentAppState?.latest || matchedExistingApp?.latest || ''}`,
    );
    if (payload.autoPublish !== false && appHasPendingChanges) {
      await runStep(result, 'return_to_app', () => openExistingApp(page, origin, appId), {
        optional: true,
      });
      await runStep(result, 'publish_v1', () => publishVersion(page, payload.appName, payload.releaseVersion || nextReleaseVersion()));
    } else if (matchedExistingApp) {
      stderrLog('Skipping publish: existing app is already published and has no pending changes');
    }

    result.finalScreenshot = await captureScreenshot(page, artifactDir, 'final');
    result.ok = true;
  } catch (error) {
    if (page) {
      result.failureScreenshot = await captureScreenshot(page, artifactDir, 'failure');
    }
    result.error = error instanceof Error ? error.message : String(error);
    result.ok = false;
    // Only keep browser open if explicitly requested, not on every error
    if (!shouldKeepBrowserOpen) {
      shouldKeepBrowserOpen = Boolean(payload.keepBrowserOpen);
    }
  } finally {
    stopLongConnection();
    if (context && !shouldKeepBrowserOpen) {
      await context.close().catch(() => {});
      await clearProfileLockArtifacts(profileDir);
    } else if (shouldKeepBrowserOpen) {
      stderrLog('Keeping browser open for manual inspection');
    }
  }

  await persistResult(artifactDir, result);
  process.stdout.write(`${JSON.stringify(result)}\n`);

  // Force-exit: the Lark SDK WSClient and internal timers (e.g. the 30s
  // connection timeout) keep the Node event loop alive even after stop/close.
  // Without this, cmd.output() in Rust hangs waiting for the process to exit,
  // which blocks config writeback and leaves the UI progress bar stuck.
  process.exit(result.ok ? 0 : 1);
}

main().catch(async (error) => {
  let artifactDir = '';
  try {
    artifactDir = JSON.parse(process.argv[2] ?? '{}').artifactDir ?? '';
  } catch {
    artifactDir = '';
  }

  const failure = {
    ok: false,
    error: error instanceof Error ? error.message : String(error),
    steps: [],
    warnings: [],
  };
  await persistResult(artifactDir, failure).catch(() => {});
  process.stdout.write(`${JSON.stringify(failure)}\n`);
  process.exit(1);
});
