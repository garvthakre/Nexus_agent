 

import { exec } from 'child_process';
import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as https from 'https';
import * as http from 'http';
import { promisify } from 'util';
import { PlanStep, StepResult } from '../types';
import { smartFindAndAct } from './Browserengine';

const execAsync = promisify(exec);

let browserInstance: import('playwright').Browser | null = null;
let pageInstance:    import('playwright').Page    | null = null;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

function resolvePath(filePath: string): string {
  const home = os.homedir();
  filePath = filePath
    .replace(/^~[\\/]/, home + path.sep)
    .replace(/^\/Users\/[^/\\]+[\\/]/, home + path.sep)
    .replace(/^\/home\/[^/\\]+[\\/]/, home + path.sep);
  if (process.platform === 'win32') filePath = filePath.replace(/\//g, '\\');
  return path.isAbsolute(filePath) ? filePath : path.join(home, filePath);
}

// ─── Playwright Setup ─────────────────────────────────────────────────────────

async function ensurePlaywright(): Promise<import('playwright').Page> {
  if (pageInstance) {
    try { await pageInstance.evaluate(() => true); return pageInstance; }
    catch { pageInstance = null; browserInstance = null; }
  }

  const { chromium } = await import('playwright');
  const base = { headless: false, args: ['--no-sandbox', '--disable-setuid-sandbox', '--start-maximized'] };

  for (const opts of [{ ...base, channel: 'chrome' }, { ...base, channel: 'msedge' }, base] as object[]) {
    try {
      browserInstance = await chromium.launch(opts as Parameters<typeof chromium.launch>[0]);
      break;
    } catch (e) {
      const msg = (e as Error).message;
      if (msg.includes("Executable doesn't exist") || msg.includes('playwright install')) {
        await execAsync('npx playwright install chromium', { timeout: 120_000 });
        browserInstance = await chromium.launch(base);
        break;
      }
    }
  }

  if (!browserInstance) throw new Error('Could not launch browser. Run: npx playwright install chromium');

  const ctx = await browserInstance.newContext({
    viewport: { width: 1280, height: 800 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  });
  pageInstance = await ctx.newPage();
  return pageInstance;
}

// ─── Main Dispatcher ──────────────────────────────────────────────────────────

export async function executeStep(step: PlanStep): Promise<StepResult> {
  const { capability, parameters } = step;
  console.log(`[Executor] ${capability}`, parameters);

  switch (capability) {
    case 'open_application':  return openApplication(parameters.app_name);
    case 'set_wallpaper':     return setWallpaper(parameters.query);
    case 'run_shell_command': return runShellCommand(parameters.command);
    case 'browser_open':      return browserOpen(parameters.url);
    case 'browser_fill':      return browserFill(parameters.selector, parameters.value);
    case 'browser_click':     return browserClick(parameters.selector);
    case 'type_text':         return typeText(parameters.text);
    case 'create_file':       return createFile(parameters.path, parameters.content ?? '');
    case 'create_folder':     return createFolder(parameters.path);
    case 'wait':              return wait(parameters.seconds ?? 1);
    case 'download_file':     return downloadFileCapability(parameters.url, parameters.destination ?? parameters.path);
    default: throw new Error(`Unknown capability: ${capability}`);
  }
}

// ─── Browser Capabilities (use smartFindAndAct) ───────────────────────────────

async function browserOpen(url: string | undefined): Promise<StepResult> {
  if (!url) throw new Error('url is required');
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = (!url.includes('.') || url.includes(' '))
      ? `https://www.google.com/search?q=${encodeURIComponent(url)}`
      : `https://${url}`;
  }
  const page = await ensurePlaywright();
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await sleep(1500);
  const title = await page.title().catch(() => url!);
  console.log(`[Browser] Loaded: "${title}" — ${url}`);
  return { success: true, url, title, message: `Opened ${url} — "${title}"` };
}

async function browserFill(selector: string | undefined, value: string | undefined): Promise<StepResult> {
  if (!selector) throw new Error('selector is required');
  if (value === undefined) throw new Error('value is required');
  const page = await ensurePlaywright();
  const result = await smartFindAndAct(page, selector, 'fill', value);
  await sleep(300);
  return {
    success: true,
    message: `Filled via ${result.strategy} (tier ${result.tier})`,
    ...(result.warning ? { warning: result.warning } : {}),
  };
}

async function browserClick(selector: string | undefined): Promise<StepResult> {
  if (!selector) throw new Error('selector is required');
  const page = await ensurePlaywright();
  const result = await smartFindAndAct(page, selector, 'click');
  await sleep(1200);
  return {
    success: true,
    message: `Clicked via ${result.strategy} (tier ${result.tier})`,
    ...(result.warning ? { warning: result.warning } : {}),
  };
}

// ─── Non-Browser Capabilities ─────────────────────────────────────────────────

async function openApplication(appName: string | undefined): Promise<StepResult> {
  if (!appName) throw new Error('app_name is required');
  const platform = process.platform;
  const lo = appName.toLowerCase();

  if (platform === 'win32') {
    const WIN_KNOWN: Record<string, string[]> = {
      chrome:               ['"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"'],
      firefox:              ['"C:\\Program Files\\Mozilla Firefox\\firefox.exe"'],
      edge:                 ['start microsoft-edge:'],
      notepad:              ['notepad'],
      calculator:           ['calc'],
      paint:                ['mspaint'],
      cmd:                  ['start cmd'],
      terminal:             ['start wt'],
      'windows terminal':   ['start wt'],
      vscode:               ['code'],
      'visual studio code': ['code'],
      spotify:              [`"${os.homedir()}\\AppData\\Roaming\\Spotify\\Spotify.exe"`],
      discord:              [`"${os.homedir()}\\AppData\\Local\\Discord\\Update.exe" --processStart Discord.exe`],
      steam:                [`"${os.homedir()}\\AppData\\Local\\Steam\\steam.exe"`],
    };
    const candidates: string[] = [];
    for (const [key, cmds] of Object.entries(WIN_KNOWN)) {
      if (lo.includes(key) || key.includes(lo)) candidates.push(...cmds);
    }
    candidates.push(`start "" "${appName}"`, `powershell -Command "Start-Process '${appName}'"`);
    for (const cmd of candidates) {
      try { await execAsync(cmd, { timeout: 8000 }); await sleep(500); return { success: true, message: `Opened ${appName}` }; }
      catch { /* try next */ }
    }
    throw new Error(`Could not open "${appName}"`);

  } else if (platform === 'darwin') {
    const MAC_KNOWN: Record<string, string> = {
      chrome: 'Google Chrome', vscode: 'Visual Studio Code', spotify: 'Spotify',
      discord: 'Discord', terminal: 'Terminal', safari: 'Safari',
    };
    const macName = MAC_KNOWN[lo] ?? appName;
    for (const cmd of [`open -a "${macName}"`, `open -a "${appName}"`]) {
      try { await execAsync(cmd, { timeout: 8000 }); return { success: true, message: `Opened ${appName}` }; }
      catch { /* try next */ }
    }
    throw new Error(`Could not open "${appName}" on macOS`);

  } else {
    for (const cmd of [lo.replace(/\s+/g, '-'), lo.replace(/\s+/g, ''), lo]) {
      try { execAsync(`${cmd} &`); await sleep(500); return { success: true, message: `Launched ${appName}` }; }
      catch { /* try next */ }
    }
    await execAsync(`xdg-open "${appName}" &`);
    return { success: true, message: `Opened ${appName}` };
  }
}

async function setWallpaper(query: string | undefined): Promise<StepResult> {
  if (!query) throw new Error('query is required');
  const wallpaperPath = path.join(os.tmpdir(), `nexus-wallpaper-${Date.now()}.jpg`);
  const provider = await fetchWallpaperImage(query, wallpaperPath);
  const platform = process.platform;

  try {
    if (platform === 'win32') {
      const scriptPath = path.join(os.tmpdir(), `set-wp-${Date.now()}.ps1`);
      const wp = wallpaperPath.replace(/\\/g, '\\\\');
      const script = `Add-Type -TypeDefinition @"
using System; using System.Runtime.InteropServices;
public class WP {
  [DllImport("user32.dll", CharSet=CharSet.Auto)]
  public static extern int SystemParametersInfo(int uAction,int uParam,string lpvParam,int fuWinIni);
}
"@
[WP]::SystemParametersInfo(20, 0, "${wp}", 3)`;
      await fs.writeFile(scriptPath, script, 'utf-8');
      try { await execAsync(`powershell -ExecutionPolicy Bypass -File "${scriptPath}"`, { timeout: 15000 }); }
      finally { await fs.unlink(scriptPath).catch(() => {}); }
    } else if (platform === 'darwin') {
      await execAsync(`osascript -e 'tell application "Finder" to set desktop picture to POSIX file "${wallpaperPath}"'`, { timeout: 15000 });
    } else {
      const attempts = [
        `gsettings set org.gnome.desktop.background picture-uri "file://${wallpaperPath}"`,
        `pcmanfm --set-wallpaper "${wallpaperPath}"`,
        `feh --bg-fill "${wallpaperPath}"`,
      ];
      for (const cmd of attempts) {
        try { await execAsync(cmd, { timeout: 8000 }); break; } catch { /* try next */ }
      }
    }
    return { success: true, message: `✓ Wallpaper set (source: ${provider})`, path: wallpaperPath };
  } catch (err) {
    return { success: true, message: `Downloaded but auto-set failed`, path: wallpaperPath, warning: (err as Error).message };
  }
}

async function runShellCommand(command: string | undefined): Promise<StepResult> {
  if (!command) throw new Error('command is required');
  for (const p of [
    /rm\s+-rf\s+\/\s*$/, /format\s+[a-z]:/i, /mkfs\.\w+\s+\/dev\//,
    /:\(\)\s*\{.*\}.*:/, /\b(shutdown|reboot|halt|poweroff)\b/i,
  ]) {
    if (p.test(command)) throw new Error(`Blocked dangerous command: ${command}`);
  }
  const home = os.homedir();
  const expanded = command.replace(/(^|\s)~(?=[\\/]|$)/g, `$1${home}`);
  const isEditorLaunch = /^\s*(code|notepad|notepad2|subl|atom|gedit|kate|nano|vim|nvim)\s+/i.test(expanded);

  if (isEditorLaunch) {
    if (process.platform === 'win32') {
      try { await execAsync(`start "" ${expanded}`, { timeout: 10_000 }); }
      catch { try { await execAsync(expanded, { timeout: 10_000 }); } catch { /* ignore */ } }
    } else {
      execAsync(`${expanded} &`).catch(() => {});
      await sleep(800);
    }
    return { success: true, message: `Launched: ${expanded}` };
  }

  try {
    const { stdout, stderr } = await execAsync(expanded, { timeout: 60_000, maxBuffer: 10 * 1024 * 1024 });
    return { success: true, stdout: stdout.trim().slice(0, 5000), stderr: stderr.trim().slice(0, 1000) };
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string; message: string };
    if (e.stdout || e.stderr) {
      return { success: true, stdout: (e.stdout ?? '').trim(), stderr: (e.stderr ?? '').trim(), warning: 'Non-zero exit' };
    }
    throw new Error(`Shell failed: ${e.message.slice(0, 300)}`);
  }
}

async function typeText(text: string | undefined): Promise<StepResult> {
  if (text === undefined) throw new Error('text is required');
  if (process.platform === 'win32') {
    try {
      const esc = text.replace(/'/g, "''").replace(/([+^%~(){}[\]])/g, '{$1}');
      await execAsync(`powershell -Command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('${esc}')"`, { timeout: 10_000 });
      return { success: true, message: `Typed ${text.length} chars` };
    } catch { /* fall through */ }
  }
  if (pageInstance) {
    try { await pageInstance.keyboard.type(text, { delay: 30 }); return { success: true, message: `Typed via Playwright` }; }
    catch { /* fall through */ }
  }
  const tmp = path.join(os.tmpdir(), `nexus-text-${Date.now()}.txt`);
  await fs.writeFile(tmp, text, 'utf-8');
  return { success: true, path: tmp, message: `Text saved to ${tmp}`, warning: 'Direct typing unavailable' };
}

async function createFile(filePath: string | undefined, content: string): Promise<StepResult> {
  if (!filePath) throw new Error('path is required');
  const p = resolvePath(filePath);
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.writeFile(p, content, 'utf-8');
  const stat = await fs.stat(p);
  return { success: true, path: p, message: `Created ${p} (${stat.size}B)` };
}

async function createFolder(folderPath: string | undefined): Promise<StepResult> {
  if (!folderPath) throw new Error('path is required');
  const p = resolvePath(folderPath);
  await fs.mkdir(p, { recursive: true });
  return { success: true, path: p, message: `Created folder: ${p}` };
}

async function downloadFileCapability(url: string | undefined, destination: string | undefined): Promise<StepResult> {
  if (!url) throw new Error('url is required');
  if (!url.startsWith('http://') && !url.startsWith('https://')) url = `https://${url}`;
  let destPath: string;
  if (destination) {
    destPath = resolvePath(destination);
  } else {
    const filename = path.basename(new URL(url).pathname).replace(/[?#].*$/, '') || `download-${Date.now()}`;
    destPath = path.join(os.homedir(), 'Downloads', filename);
  }
  await fs.mkdir(path.dirname(destPath), { recursive: true });
  await downloadFile(url, destPath);
  const stat = await fs.stat(destPath);
  return { success: true, path: destPath, url, message: `Downloaded ${Math.round(stat.size / 1024)}KB → ${destPath}` };
}

async function wait(seconds: number): Promise<StepResult> {
  await sleep(seconds * 1000);
  return { success: true, message: `Waited ${seconds}s` };
}

// ─── Download Helper ──────────────────────────────────────────────────────────

async function downloadFile(url: string, destPath: string, hops = 10): Promise<void> {
  if (hops === 0) throw new Error('Too many redirects');
  return new Promise((resolve, reject) => {
    let parsed: URL;
    try { parsed = new URL(url); } catch { reject(new Error(`Invalid URL: ${url}`)); return; }
    const isHttps = parsed.protocol === 'https:';
    const mod = isHttps ? https : http;
    const req = mod.get({
      hostname: parsed.hostname,
      port: parsed.port || (isHttps ? 443 : 80),
      path: parsed.pathname + parsed.search,
      headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'image/*,*/*;q=0.8' },
    }, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        const next = res.headers.location.startsWith('http') ? res.headers.location : `${parsed.protocol}//${parsed.hostname}${res.headers.location}`;
        downloadFile(next, destPath, hops - 1).then(resolve).catch(reject);
        return;
      }
      if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 400) { reject(new Error(`HTTP ${res.statusCode}`)); return; }
      const file = fsSync.createWriteStream(destPath);
      res.pipe(file);
      file.on('finish', () => file.close(() => resolve()));
      file.on('error', (e) => { fsSync.unlink(destPath, () => {}); reject(e); });
    });
    req.on('error', (e) => { fsSync.unlink(destPath, () => {}); reject(e); });
    req.setTimeout(45000, () => { req.destroy(); reject(new Error('Download timeout')); });
  });
}

async function fetchWallpaperImage(query: string, destPath: string): Promise<string> {
  const enc = encodeURIComponent(query);
  const ts = Date.now();
  const providers = [
    { name: 'Picsum',      url: `https://picsum.photos/seed/${enc}/1920/1080` },
    { name: 'LoremFlickr', url: `https://loremflickr.com/1920/1080/${enc}?lock=${ts}` },
    { name: 'PicsumRand',  url: `https://picsum.photos/1920/1080?random=${ts}` },
  ];
  for (const { name, url } of providers) {
    try {
      await downloadFile(url, destPath);
      const stat = await fs.stat(destPath);
      if (stat.size < 10_000) { await fs.unlink(destPath).catch(() => {}); continue; }
      return name;
    } catch { await fs.unlink(destPath).catch(() => {}); }
  }
  throw new Error('All wallpaper providers failed');
}

process.on('exit', () => { void browserInstance?.close(); });