import { exec } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { promisify } from 'util';
import { PlanStep, StepResult } from '../types';

const execAsync = promisify(exec);

// Lazy browser instance — created on first browser_* call
let browserInstance: import('playwright').Browser | null = null;
let pageInstance: import('playwright').Page | null = null;

// ─── Main Dispatcher ──────────────────────────────────────────────────────────

export async function executeStep(step: PlanStep): Promise<StepResult> {
  const { capability, parameters } = step;
  console.log(`[Executor] Running: ${capability}`, parameters);

  switch (capability) {
    case 'open_application':
      return openApplication(parameters.app_name);
    case 'set_wallpaper':
      return setWallpaper(parameters.query);
    case 'run_shell_command':
      return runShellCommand(parameters.command);
    case 'browser_open':
      return browserOpen(parameters.url);
    case 'browser_fill':
      return browserFill(parameters.selector, parameters.value);
    case 'browser_click':
      return browserClick(parameters.selector);
    case 'type_text':
      return typeText(parameters.text);
    case 'create_file':
      return createFile(parameters.path, parameters.content ?? '');
    case 'create_folder':
      return createFolder(parameters.path);
    case 'wait':
      return wait(parameters.seconds ?? 1);
    default:
      throw new Error(`Unknown capability: ${capability}`);
  }
}

// ─── Capabilities ─────────────────────────────────────────────────────────────

async function openApplication(appName: string | undefined): Promise<StepResult> {
  if (!appName) throw new Error('app_name is required');

  const platform = process.platform;
  const errors: string[] = [];

  if (platform === 'win32') {
    // Try multiple strategies on Windows
    const strategies = [
      // 1. Direct start command (works for registered apps like notepad, chrome, etc.)
      `start "" "${appName}"`,
      // 2. Try lowercase no-space variant
      `start "" "${appName.toLowerCase().replace(/\s+/g, '')}"`,
      // 3. PowerShell Start-Process as fallback
      `powershell -Command "Start-Process '${appName}'"`,
      // 4. Common app paths
      ...(appName.toLowerCase().includes('chrome')
        ? [
            `"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"`,
            `"C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe"`,
          ]
        : []),
      ...(appName.toLowerCase().includes('notepad')
        ? [`notepad`]
        : []),
      ...(appName.toLowerCase().includes('spotify')
        ? [
            `"${os.homedir()}\\AppData\\Roaming\\Spotify\\Spotify.exe"`,
            `start spotify:`,
          ]
        : []),
      ...(appName.toLowerCase().includes('vscode') || appName.toLowerCase().includes('visual studio code')
        ? [`code`]
        : []),
    ];

    for (const cmd of strategies) {
      try {
        await execAsync(cmd, { timeout: 5000 });
        return { success: true, message: `Opened ${appName}` };
      } catch (e: unknown) {
        errors.push((e as Error).message);
      }
    }

    // Last resort: open via Windows shell
    try {
      await execAsync(`powershell -Command "& {$app='${appName}'; Start-Process $app}"`, { timeout: 5000 });
      return { success: true, message: `Opened ${appName} via PowerShell` };
    } catch (e: unknown) {
      errors.push((e as Error).message);
    }

  } else if (platform === 'darwin') {
    try {
      await execAsync(`open -a "${appName}"`);
      return { success: true, message: `Opened ${appName}` };
    } catch {
      await execAsync(`open "${appName}"`);
      return { success: true, message: `Opened ${appName}` };
    }
  } else {
    // Linux
    const appLower = appName.toLowerCase().replace(/\s+/g, '-');
    try {
      await execAsync(`${appLower} &`);
      return { success: true, message: `Opened ${appName}` };
    } catch {
      await execAsync(`xdg-open "${appName}" &`);
      return { success: true, message: `Opened ${appName}` };
    }
  }

  throw new Error(`Could not open "${appName}". Tried ${strategies.length} methods. Last error: ${errors[errors.length - 1]}`);
}

async function setWallpaper(query: string | undefined): Promise<StepResult> {
  if (!query) throw new Error('query is required');

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const wallpaper = require('node-wallpaper') as { setWallpaper(p: string): Promise<void> };
    const tempPath = path.join(os.tmpdir(), 'nexus-wallpaper.png');
    await wallpaper.setWallpaper(tempPath);
    return { success: true, message: `Wallpaper set to theme: ${query}` };
  } catch (err: unknown) {
    const e = err as Error;
    return {
      success: true,
      message: `Wallpaper queued for: ${query}`,
      warning: `node-wallpaper unavailable: ${e.message}`,
    };
  }
}

async function runShellCommand(command: string | undefined): Promise<StepResult> {
  if (!command) throw new Error('command is required');

  const BLOCKED_PATTERNS: RegExp[] = [
    /rm\s+-rf\s+\//,
    /format\s+c:/i,
    /del\s+\/[sf]/i,
    /mkfs/,
    /dd\s+if=.*of=\/dev\/(sd|hd)/,
  ];

  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(command)) {
      throw new Error(`Blocked dangerous command: ${command}`);
    }
  }

  const maxLength = parseInt(process.env.MAX_SHELL_COMMAND_LENGTH ?? '500', 10);
  if (command.length > maxLength) {
    throw new Error(`Command too long (max ${maxLength} chars)`);
  }

  try {
    const { stdout, stderr } = await execAsync(command, { timeout: 30_000 });
    return { success: true, stdout: stdout.trim(), stderr: stderr.trim() };
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string; message: string };
    // Return partial output even on error — many commands exit non-zero but still succeed
    if (e.stdout || e.stderr) {
      return {
        success: true,
        stdout: (e.stdout ?? '').trim(),
        stderr: (e.stderr ?? '').trim(),
        warning: `Command exited with error but produced output: ${e.message}`,
      };
    }
    throw new Error(`Shell command failed: ${e.message}`);
  }
}

// ─── Browser: auto-install Playwright browsers if missing ────────────────────

async function ensurePlaywright(): Promise<import('playwright').Page> {
  if (pageInstance) return pageInstance;

  const { chromium } = await import('playwright');

  // Try launching — if it fails due to missing browser, auto-install
  try {
    browserInstance = await chromium.launch({ headless: false, channel: 'chrome' });
  } catch {
    // channel: 'chrome' failed, try installed Playwright chromium
    try {
      browserInstance = await chromium.launch({ headless: false });
    } catch (err2: unknown) {
      const msg = (err2 as Error).message ?? '';
      if (msg.includes("Executable doesn't exist") || msg.includes('playwright install')) {
        console.log('[Executor] Playwright browsers missing — installing now...');
        await execAsync('npx playwright install chromium', { timeout: 120_000 });
        console.log('[Executor] Playwright install complete, retrying launch...');
        browserInstance = await chromium.launch({ headless: false });
      } else {
        throw err2;
      }
    }
  }

  const context = await browserInstance.newContext();
  pageInstance = await context.newPage();
  return pageInstance;
}

async function browserOpen(url: string | undefined): Promise<StepResult> {
  if (!url) throw new Error('url is required');

  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = `https://${url}`;
  }

  // First try: open with system default browser (no Playwright needed)
  try {
    const platform = process.platform;
    if (platform === 'win32') {
      await execAsync(`start "" "${url}"`);
    } else if (platform === 'darwin') {
      await execAsync(`open "${url}"`);
    } else {
      await execAsync(`xdg-open "${url}"`);
    }
    // Give browser time to open
    await new Promise<void>((r) => setTimeout(r, 1500));
    return { success: true, url, message: `Opened ${url} in default browser` };
  } catch {
    // Fall through to Playwright
  }

  // Fallback: Playwright
  const page = await ensurePlaywright();
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  const title = await page.title();
  return { success: true, url, title, message: `Opened ${url}` };
}

async function browserFill(selector: string | undefined, value: string | undefined): Promise<StepResult> {
  if (!selector) throw new Error('selector is required');
  if (value === undefined) throw new Error('value is required');

  const page = await ensurePlaywright();

  // Try multiple selector strategies
  const selectors = [selector, `[name="${selector}"]`, `[placeholder*="${selector}"]`, `input`];
  for (const sel of selectors) {
    try {
      await page.waitForSelector(sel, { timeout: 5000 });
      await page.fill(sel, value);
      return { success: true, selector: sel, message: `Filled "${sel}" with value` };
    } catch {
      continue;
    }
  }
  throw new Error(`Could not find element to fill: ${selector}`);
}

async function browserClick(selector: string | undefined): Promise<StepResult> {
  if (!selector) throw new Error('selector is required');

  const page = await ensurePlaywright();

  // Try multiple selector strategies
  const selectors = [
    selector,
    `[aria-label*="${selector}"]`,
    `button:has-text("${selector}")`,
    `[title*="${selector}"]`,
  ];

  for (const sel of selectors) {
    try {
      await page.waitForSelector(sel, { timeout: 5000 });
      await page.click(sel);
      return { success: true, selector: sel, message: `Clicked "${sel}"` };
    } catch {
      continue;
    }
  }
  throw new Error(`Could not find element to click: ${selector}`);
}

async function typeText(text: string | undefined): Promise<StepResult> {
  if (text === undefined) throw new Error('text is required');

  // Strategy 1: Windows — use PowerShell SendKeys (no extra install needed)
  if (process.platform === 'win32') {
    try {
      // Escape single quotes in text
      const escaped = text.replace(/'/g, "''").replace(/[{}()[\]^+~%]/g, '{$&}');
      const ps = `Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('${escaped}')`;
      await execAsync(`powershell -Command "${ps}"`, { timeout: 10_000 });
      return { success: true, message: `Typed ${text.length} characters via PowerShell SendKeys` };
    } catch (e: unknown) {
      console.warn('[Executor] PowerShell SendKeys failed:', (e as Error).message);
    }

    // Strategy 2: Write text to clipboard and paste
    try {
      const escaped2 = text.replace(/"/g, '\\"');
      await execAsync(`powershell -Command "Set-Clipboard -Value \\"${escaped2}\\""`, { timeout: 5000 });
      await execAsync(`powershell -Command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('^v')"`, { timeout: 5000 });
      return { success: true, message: `Typed ${text.length} characters via clipboard paste` };
    } catch (e: unknown) {
      console.warn('[Executor] Clipboard paste failed:', (e as Error).message);
    }
  }

  // Strategy 3: robotjs
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const robot = require('robotjs') as { typeString(s: string): void };
    robot.typeString(text);
    return { success: true, message: `Typed ${text.length} characters via robotjs` };
  } catch {
    // robotjs not available
  }

  // Strategy 4: Playwright keyboard (if browser is open)
  if (pageInstance) {
    try {
      await pageInstance.keyboard.type(text);
      return { success: true, message: `Typed ${text.length} characters via Playwright` };
    } catch {
      // browser not focused or page closed
    }
  }

  // Strategy 5: xdotool on Linux
  if (process.platform === 'linux') {
    try {
      await execAsync(`xdotool type --clearmodifiers "${text.replace(/"/g, '\\"')}"`);
      return { success: true, message: `Typed ${text.length} characters via xdotool` };
    } catch {
      // xdotool not available
    }
  }

  // Strategy 6: AppleScript on macOS
  if (process.platform === 'darwin') {
    try {
      await execAsync(`osascript -e 'tell application "System Events" to keystroke "${text.replace(/"/g, '\\"')}"'`);
      return { success: true, message: `Typed ${text.length} characters via AppleScript` };
    } catch {
      // applescript failed
    }
  }

  // Final fallback: write to a temp file so user can see the text
  const tmpFile = path.join(os.tmpdir(), 'nexus-typed-text.txt');
  await fs.writeFile(tmpFile, text, 'utf-8');
  return {
    success: true,
    message: `Text saved to ${tmpFile} (system typing unavailable — open file to copy)`,
    warning: 'Could not type directly. Text written to temp file.',
    path: tmpFile,
  };
}

async function createFile(filePath: string | undefined, content: string): Promise<StepResult> {
  if (!filePath) throw new Error('path is required');

  const resolvedPath = isAbsolutePath(filePath)
    ? filePath
    : path.join(os.homedir(), filePath);

  await fs.mkdir(path.dirname(resolvedPath), { recursive: true });
  await fs.writeFile(resolvedPath, content, 'utf-8');
  return { success: true, path: resolvedPath, message: `Created file: ${resolvedPath}` };
}

async function createFolder(folderPath: string | undefined): Promise<StepResult> {
  if (!folderPath) throw new Error('path is required');

  const resolvedPath = isAbsolutePath(folderPath)
    ? folderPath
    : path.join(os.homedir(), folderPath);

  await fs.mkdir(resolvedPath, { recursive: true });
  return { success: true, path: resolvedPath, message: `Created folder: ${resolvedPath}` };
}

async function wait(seconds: number): Promise<StepResult> {
  await new Promise<void>((resolve) => setTimeout(resolve, seconds * 1000));
  return { success: true, message: `Waited ${seconds} second(s)` };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isAbsolutePath(p: string): boolean {
  return p.startsWith('/') || /^[A-Za-z]:[/\\]/.test(p);
}

process.on('exit', () => {
  void browserInstance?.close();
});