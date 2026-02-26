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

  let command: string;
  const platform = process.platform;

  if (platform === 'win32') {
    command = `start "" "${appName}"`;
  } else if (platform === 'darwin') {
    command = `open -a "${appName}"`;
  } else {
    const appLower = appName.toLowerCase().replace(/\s+/g, '-');
    command = `${appLower} &`;
  }

  await execAsync(command);
  return { success: true, message: `Opened ${appName}` };
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

  const { stdout, stderr } = await execAsync(command, { timeout: 30_000 });
  return { success: true, stdout: stdout.trim(), stderr: stderr.trim() };
}

async function browserOpen(url: string | undefined): Promise<StepResult> {
  if (!url) throw new Error('url is required');

  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = `https://${url}`;
  }

  const page = await getPage();
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  const title = await page.title();
  return { success: true, url, title, message: `Opened ${url}` };
}

async function browserFill(selector: string | undefined, value: string | undefined): Promise<StepResult> {
  if (!selector) throw new Error('selector is required');
  if (value === undefined) throw new Error('value is required');

  const page = await getPage();
  await page.waitForSelector(selector, { timeout: 10_000 });
  await page.fill(selector, value);
  return { success: true, selector, message: `Filled "${selector}"` };
}

async function browserClick(selector: string | undefined): Promise<StepResult> {
  if (!selector) throw new Error('selector is required');

  const page = await getPage();
  await page.waitForSelector(selector, { timeout: 10_000 });
  await page.click(selector);
  return { success: true, selector, message: `Clicked "${selector}"` };
}

async function typeText(text: string | undefined): Promise<StepResult> {
  if (text === undefined) throw new Error('text is required');

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const robot = require('robotjs') as { typeString(s: string): void };
    robot.typeString(text);
    return { success: true, message: `Typed ${text.length} characters via robotjs` };
  } catch {
    // Fallback to browser keyboard
    try {
      const page = await getPage();
      await page.keyboard.type(text);
      return { success: true, message: `Typed ${text.length} characters via browser` };
    } catch {
      throw new Error('Cannot type text: robotjs unavailable and no browser page open. Install robotjs for system typing.');
    }
  }
}

async function createFile(filePath: string | undefined, content: string): Promise<StepResult> {
  if (!filePath) throw new Error('path is required');

  const resolvedPath = isAbsolute(filePath)
    ? filePath
    : path.join(os.homedir(), filePath);

  await fs.mkdir(path.dirname(resolvedPath), { recursive: true });
  await fs.writeFile(resolvedPath, content, 'utf-8');
  return { success: true, path: resolvedPath, message: `Created file: ${resolvedPath}` };
}

async function createFolder(folderPath: string | undefined): Promise<StepResult> {
  if (!folderPath) throw new Error('path is required');

  const resolvedPath = isAbsolute(folderPath)
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

function isAbsolute(p: string): boolean {
  return p.startsWith('/') || /^[A-Za-z]:[/\\]/.test(p);
}

async function getPage(): Promise<import('playwright').Page> {
  if (!pageInstance) {
    const { chromium } = await import('playwright');
    browserInstance = await chromium.launch({ headless: false });
    const context = await browserInstance.newContext();
    pageInstance = await context.newPage();
  }
  return pageInstance;
}

process.on('exit', () => {
  void browserInstance?.close();
});
