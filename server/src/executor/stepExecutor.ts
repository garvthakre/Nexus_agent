import { exec } from 'child_process';
import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as https from 'https';
import * as http from 'http';
import { promisify } from 'util';
import { PlanStep, StepResult } from '../types';

const execAsync = promisify(exec);

let browserInstance: import('playwright').Browser | null = null;
let pageInstance: import('playwright').Page | null = null;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
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

async function downloadFile(url: string, destPath: string, hops = 10): Promise<void> {
  if (hops === 0) throw new Error('Too many redirects');
  return new Promise((resolve, reject) => {
    let parsed: URL;
    try { parsed = new URL(url); }
    catch { reject(new Error(`Invalid URL: ${url}`)); return; }

    const isHttps = parsed.protocol === 'https:';
    const mod = isHttps ? https : http;

    const req = mod.get(
      {
        hostname: parsed.hostname,
        port: parsed.port || (isHttps ? 443 : 80),
        path: parsed.pathname + parsed.search,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120',
          'Accept': 'image/*,*/*;q=0.8',
        },
      },
      (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          const next = res.headers.location.startsWith('http')
            ? res.headers.location
            : `${parsed.protocol}//${parsed.hostname}${res.headers.location}`;
          downloadFile(next, destPath, hops - 1).then(resolve).catch(reject);
          return;
        }
        if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 400) {
          reject(new Error(`HTTP ${res.statusCode} from ${url}`));
          return;
        }
        const file = fsSync.createWriteStream(destPath);
        res.pipe(file);
        file.on('finish', () => file.close(() => resolve()));
        file.on('error', (e) => { fsSync.unlink(destPath, () => {}); reject(e); });
      }
    );
    req.on('error', (e) => { fsSync.unlink(destPath, () => {}); reject(e); });
    req.setTimeout(45000, () => { req.destroy(); reject(new Error('Download timeout')); });
  });
}

async function fetchWallpaperImage(query: string, destPath: string): Promise<string> {
  const enc = encodeURIComponent(query);
  const ts = Date.now();
  const providers = [
    { name: 'Picsum',       url: `https://picsum.photos/seed/${enc}/1920/1080` },
    { name: 'LoremFlickr',  url: `https://loremflickr.com/1920/1080/${enc}?lock=${ts}` },
    { name: 'PicsumRandom', url: `https://picsum.photos/1920/1080?random=${ts}` },
    { name: 'PicsumSeed2',  url: `https://picsum.photos/seed/${ts % 1000}/1920/1080` },
  ];
  for (const { name, url } of providers) {
    try {
      console.log(`[Wallpaper] Trying ${name} → ${url}`);
      await downloadFile(url, destPath);
      const stat = await fs.stat(destPath);
      if (stat.size < 10_000) {
        console.warn(`[Wallpaper] ${name} returned ${stat.size}B (too small), skipping`);
        await fs.unlink(destPath).catch(() => {});
        continue;
      }
      console.log(`[Wallpaper] ✓ ${name}: ${Math.round(stat.size / 1024)}KB`);
      return name;
    } catch (e) {
      console.warn(`[Wallpaper] ${name} failed: ${(e as Error).message}`);
      await fs.unlink(destPath).catch(() => {});
    }
  }
  throw new Error(`All wallpaper image providers failed for "${query}"`);
}

// ─── Playwright Setup ─────────────────────────────────────────────────────────

async function ensurePlaywright(): Promise<import('playwright').Page> {
  // Reuse existing page if still alive
  if (pageInstance) {
    try {
      await pageInstance.evaluate(() => true);
      return pageInstance;
    } catch {
      pageInstance = null;
      browserInstance = null;
    }
  }

  const { chromium } = await import('playwright');
  const base = {
    headless: false,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--start-maximized'],
  };

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

// ─── Resilient Element Finder ─────────────────────────────────────────────────
//
// Classifies the AI's hint into an intent (search-input, search-submit,
// first-video-result, generic) then picks the right strategy list for that
// intent. This prevents "yt:searchbox" from matching a button or video click.
//
// ─────────────────────────────────────────────────────────────────────────────

type ElementAction = 'fill' | 'click';

// Intent labels used to select the right strategy bucket
type HintIntent =
  | 'yt-search-input'    // filling the YouTube search box
  | 'yt-search-submit'   // clicking the search / submit button
  | 'yt-first-video'     // clicking the first video result
  | 'generic-fill'       // filling any non-YouTube input
  | 'generic-click';     // clicking any non-YouTube element

function classifyHint(hint: string, action: ElementAction, url: string): HintIntent {
  const h = hint.toLowerCase();
  const isYT = url.includes('youtube.com');

  if (!isYT) return action === 'fill' ? 'generic-fill' : 'generic-click';

  // YouTube fill → always the search box
  if (action === 'fill') return 'yt-search-input';

  // YouTube click: detect search-button vs first-video by hint keywords
  const isSearchButton =
    h.includes('search') && (h.includes('button') || h.includes('icon') || h.includes('submit') || h.includes('aria'));
  if (isSearchButton) return 'yt-search-submit';

  // Anything that mentions video / result / title / renderer / top → first video
  const isVideoResult =
    h.includes('video') || h.includes('result') || h.includes('title') ||
    h.includes('renderer') || h.includes('thumbnail') || h.includes('top') ||
    h.includes('first') || h.includes('play');
  if (isVideoResult) return 'yt-first-video';

  // Default YouTube click → try search-submit first, then video
  return 'yt-search-submit';
}

async function findAndAct(
  page: import('playwright').Page,
  hint: string,
  action: ElementAction,
  value?: string,
): Promise<string> {
  // Wait for the page to be reasonably loaded before doing anything
  await page.waitForLoadState('domcontentloaded').catch(() => {});
  await sleep(600);

  let currentUrl = '';
  try { currentUrl = page.url(); } catch { /* ignore */ }

  const intent = classifyHint(hint, action, currentUrl);
  console.log(`[Browser] intent="${intent}" hint="${hint.substring(0, 60)}"`);

  // ── Strategy lists per intent ─────────────────────────────────────────────

  type Strategy = { label: string; locator: () => import('playwright').Locator };

  const STRATEGIES: Record<HintIntent, Strategy[]> = {

    'yt-search-input': [
      { label: 'yt:searchbox-input',   locator: () => page.locator('ytd-searchbox input[name="search_query"]').first() },
      { label: 'yt:input-search',      locator: () => page.locator('input[name="search_query"]').first() },
      { label: 'yt:input#search',      locator: () => page.locator('input#search').first() },
      { label: 'role:searchbox',       locator: () => page.getByRole('searchbox').first() },
      { label: 'yt:searchbox-generic', locator: () => page.locator('ytd-searchbox input').first() },
    ],

    'yt-search-submit': [
      { label: 'yt:search-btn-legacy', locator: () => page.locator('button#search-icon-legacy').first() },
      { label: 'yt:search-btn-aria',   locator: () => page.locator('button[aria-label="Search"]').first() },
      { label: 'yt:search-btn-any',    locator: () => page.locator('ytd-searchbox button').first() },
      { label: 'role:button[Search]',  locator: () => page.getByRole('button', { name: 'Search', exact: false }).first() },
      { label: 'key:Enter',            locator: () => ({
          // Special: press Enter instead of clicking a button
          waitFor: async () => {},
          click: async () => { await page.keyboard.press('Enter'); },
        } as unknown as import('playwright').Locator) },
    ],

    'yt-first-video': [
      // Wait for search results to render before trying to click a video
      { label: 'yt:video-title-link',  locator: () => page.locator('ytd-video-renderer a#video-title-link').first() },
      { label: 'yt:video-title',       locator: () => page.locator('ytd-video-renderer a#video-title').first() },
      { label: 'yt:rich-item-title',   locator: () => page.locator('ytd-rich-item-renderer a#video-title').first() },
      { label: 'yt:any-video-title',   locator: () => page.locator('a#video-title').first() },
      { label: 'yt:thumbnail-link',    locator: () => page.locator('ytd-video-renderer a#thumbnail').first() },
    ],

    'generic-fill': [
      { label: 'role:searchbox',       locator: () => page.getByRole('searchbox').first() },
      { label: 'role:textbox',         locator: () => page.getByRole('textbox', { name: hint, exact: false }).first() },
      { label: 'placeholder',          locator: () => page.getByPlaceholder(hint, { exact: false }).first() },
      { label: 'label',                locator: () => page.getByLabel(hint, { exact: false }).first() },
      { label: 'aria-label',           locator: () => page.locator(`[aria-label*="${hint}" i]`).first() },
      { label: 'name-attr',            locator: () => page.locator(`[name="${hint}"]`).first() },
      { label: 'css-hint',             locator: () => page.locator(hint).first() },
    ],

    'generic-click': [
      { label: 'role:button',          locator: () => page.getByRole('button', { name: hint, exact: false }).first() },
      { label: 'role:link',            locator: () => page.getByRole('link',   { name: hint, exact: false }).first() },
      { label: 'aria-label',           locator: () => page.locator(`[aria-label="${hint}"]`).first() },
      { label: 'aria-label~',          locator: () => page.locator(`[aria-label*="${hint}" i]`).first() },
      { label: 'title',                locator: () => page.locator(`[title="${hint}"]`).first() },
      { label: 'text',                 locator: () => page.getByText(hint, { exact: false }).first() },
      { label: 'css-hint',             locator: () => page.locator(hint).first() },
    ],
  };

  const strategies = STRATEGIES[intent];

  // For first-video clicks: wait for results to render before attempting
  if (intent === 'yt-first-video') {
    console.log('[Browser] Waiting for YouTube search results to render...');
    await page.waitForSelector('ytd-video-renderer', { timeout: 10_000 }).catch(() => {});
    await sleep(800);
  }

  // ── Try every strategy ────────────────────────────────────────────────────
  for (const { label, locator } of strategies) {
    try {
      const loc = locator();

      // Handle the special keyboard-press strategy (Enter key)
      if (label === 'key:Enter') {
        await page.keyboard.press('Enter');
        console.log(`[Browser] ✓ ${action} via strategy: ${label}`);
        return label;
      }

      await loc.waitFor({ state: 'visible', timeout: 3000 });

      if (action === 'fill') {
        await loc.click({ timeout: 2000 });
        await loc.fill(value ?? '', { timeout: 3000 });
      } else {
        await loc.click({ timeout: 2000 });
      }

      console.log(`[Browser] ✓ ${action} via strategy: ${label}`);
      return label;
    } catch {
      // This strategy didn't work — try the next one silently
    }
  }

  // ── Last resort: "/" keyboard shortcut for YouTube search fill ────────────
  if (intent === 'yt-search-input') {
    try {
      await page.keyboard.press('/');
      await sleep(400);
      await page.locator(':focus').fill(value ?? '', { timeout: 3000 });
      console.log('[Browser] ✓ fill via YouTube "/" keyboard shortcut');
      return 'yt:keyboard-shortcut';
    } catch { /* ignore */ }
  }

  throw new Error(
    `Could not find element matching "${hint}" (intent: ${intent}) on ${currentUrl || 'the page'}. ` +
    `Tried ${strategies.length} strategies.`,
  );
}

// ─── Main Dispatcher ──────────────────────────────────────────────────────────

export async function executeStep(step: PlanStep): Promise<StepResult> {
  const { capability, parameters } = step;
  console.log(`[Executor] Running: ${capability}`, parameters);

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

// ─── Capabilities ─────────────────────────────────────────────────────────────

async function openApplication(appName: string | undefined): Promise<StepResult> {
  if (!appName) throw new Error('app_name is required');
  const platform = process.platform;
  const lo = appName.toLowerCase();

  if (platform === 'win32') {
    const WIN_KNOWN: Record<string, string[]> = {
      chrome:              ['"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"', '"C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe"'],
      firefox:             ['"C:\\Program Files\\Mozilla Firefox\\firefox.exe"'],
      edge:                ['start microsoft-edge:'],
      notepad:             ['notepad'],
      explorer:            ['explorer'],
      'file explorer':     ['explorer .'],
      calculator:          ['calc'],
      paint:               ['mspaint'],
      cmd:                 ['start cmd'],
      terminal:            ['start wt'],
      'windows terminal':  ['start wt'],
      vscode:              ['code'],
      'visual studio code':['code'],
      spotify:             [`"${os.homedir()}\\AppData\\Roaming\\Spotify\\Spotify.exe"`],
      discord:             [`"${os.homedir()}\\AppData\\Local\\Discord\\Update.exe" --processStart Discord.exe`],
      steam:               [`"${os.homedir()}\\AppData\\Local\\Steam\\steam.exe"`],
      whatsapp:            [`"${os.homedir()}\\AppData\\Local\\WhatsApp\\WhatsApp.exe"`],
      telegram:            [`"${os.homedir()}\\AppData\\Roaming\\Telegram Desktop\\Telegram.exe"`],
      vlc:                 ['"C:\\Program Files\\VideoLAN\\VLC\\vlc.exe"', '"C:\\Program Files (x86)\\VideoLAN\\VLC\\vlc.exe"'],
    };
    const candidates: string[] = [];
    for (const [key, cmds] of Object.entries(WIN_KNOWN)) {
      if (lo.includes(key) || key.includes(lo)) candidates.push(...cmds);
    }
    candidates.push(
      `start "" "${appName}"`,
      `start "" "${lo.replace(/\s+/g, '')}"`,
      `powershell -Command "Start-Process '${appName}'"`,
    );
    for (const cmd of candidates) {
      try {
        await execAsync(cmd, { timeout: 8000 });
        await sleep(500);
        return { success: true, message: `Opened ${appName}` };
      } catch { /* try next */ }
    }
    throw new Error(`Could not open "${appName}" — app may not be installed`);

  } else if (platform === 'darwin') {
    const MAC_KNOWN: Record<string, string> = {
      chrome: 'Google Chrome', vscode: 'Visual Studio Code',
      'visual studio code': 'Visual Studio Code', spotify: 'Spotify',
      discord: 'Discord', terminal: 'Terminal', finder: 'Finder',
      safari: 'Safari', firefox: 'Firefox', vlc: 'VLC', steam: 'Steam',
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
      const script = `
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class WP {
  [DllImport("user32.dll", CharSet=CharSet.Auto)]
  public static extern int SystemParametersInfo(int uAction,int uParam,string lpvParam,int fuWinIni);
}
"@
[WP]::SystemParametersInfo(20, 0, "${wp}", 3)
`.trim();
      await fs.writeFile(scriptPath, script, 'utf-8');
      try {
        await execAsync(`powershell -ExecutionPolicy Bypass -File "${scriptPath}"`, { timeout: 15000 });
      } finally {
        await fs.unlink(scriptPath).catch(() => {});
      }

    } else if (platform === 'darwin') {
      await execAsync(
        `osascript -e 'tell application "Finder" to set desktop picture to POSIX file "${wallpaperPath}"'`,
        { timeout: 15000 }
      );

    } else {
      const attempts = [
        `gsettings set org.gnome.desktop.background picture-uri "file://${wallpaperPath}"`,
        `gsettings set org.gnome.desktop.background picture-uri-dark "file://${wallpaperPath}"`,
        `pcmanfm --set-wallpaper "${wallpaperPath}"`,
        `feh --bg-fill "${wallpaperPath}"`,
        `nitrogen --set-zoom-fill "${wallpaperPath}"`,
        `xfconf-query -c xfce4-desktop -p /backdrop/screen0/monitor0/workspace0/last-image -s "${wallpaperPath}"`,
      ];
      for (const cmd of attempts) {
        try { await execAsync(cmd, { timeout: 8000 }); break; } catch { /* try next */ }
      }
    }

    return { success: true, message: `✓ Wallpaper set to "${query}" theme (source: ${provider})`, path: wallpaperPath };
  } catch (err) {
    return { success: true, message: `Image downloaded to ${wallpaperPath} but auto-set failed`, path: wallpaperPath, warning: (err as Error).message };
  }
}

async function runShellCommand(command: string | undefined): Promise<StepResult> {
  if (!command) throw new Error('command is required');

  // Safety blocklist
  for (const p of [
    /rm\s+-rf\s+\/\s*$/, /format\s+[a-z]:/i, /del\s+\/[sf]/i,
    /mkfs\.\w+\s+\/dev\//, /dd\s+if=.*of=\/dev\/(sd|hd|nvme)/,
    /:\(\)\s*\{.*\}.*:/, /\b(shutdown|reboot|halt|poweroff)\b/i,
  ]) {
    if (p.test(command)) throw new Error(`Blocked dangerous command: ${command}`);
  }

  const maxLen = parseInt(process.env.MAX_SHELL_COMMAND_LENGTH ?? '500', 10);
  if (command.length > maxLen) throw new Error(`Command too long (max ${maxLen} chars)`);

  // Expand ~ to the real home directory on all platforms.
  // Windows cmd.exe does not understand ~, so we must expand it before exec.
  const home = os.homedir();
  const expanded = command.replace(/(^|\s)~(?=[\\/]|$)/g, `$1${home}`);
  if (expanded !== command) {
    console.log(`[Shell] Expanded ~ → "${expanded}"`);
  }

  // Detect editor-launcher commands (code, notepad, subl, atom, vim, nano…).
  // These open a GUI window and return immediately — we don't need to await
  // their stdout and should not treat a non-zero exit as a failure.
  const isEditorLaunch = /^\s*(code|notepad|notepad2|subl|atom|gedit|kate|nano|vim|nvim)\s+/i.test(expanded);

  if (isEditorLaunch && process.platform === 'win32') {
    // On Windows, wrap with `start ""` so the process is detached
    const detached = `start "" ${expanded}`;
    try {
      await execAsync(detached, { timeout: 10_000 });
    } catch {
      // start returns exit 0 even for GUI apps — any error means the binary wasn't found
      // fall through to the plain attempt below
      try { await execAsync(expanded, { timeout: 10_000 }); } catch { /* ignore GUI exit */ }
    }
    return { success: true, message: `Launched: ${expanded}` };
  }

  if (isEditorLaunch && process.platform !== 'win32') {
    // macOS / Linux: fire and forget
    execAsync(`${expanded} &`).catch(() => {});
    await sleep(800);
    return { success: true, message: `Launched: ${expanded}` };
  }

  // Normal blocking command
  try {
    const { stdout, stderr } = await execAsync(expanded, { timeout: 60_000, maxBuffer: 10 * 1024 * 1024 });
    return {
      success: true,
      stdout: stdout.trim().slice(0, 5000),
      stderr: stderr.trim().slice(0, 1000),
    };
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string; message: string };
    if (e.stdout || e.stderr) {
      return {
        success: true,
        stdout: (e.stdout ?? '').trim().slice(0, 5000),
        stderr: (e.stderr ?? '').trim().slice(0, 1000),
        warning: `Non-zero exit: ${e.message.slice(0, 200)}`,
      };
    }
    throw new Error(`Shell failed: ${e.message.slice(0, 300)}`);
  }
}

// ─── Browser Capabilities (now using findAndAct) ──────────────────────────────

async function browserOpen(url: string | undefined): Promise<StepResult> {
  if (!url) throw new Error('url is required');
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = (!url.includes('.') || url.includes(' '))
      ? `https://www.google.com/search?q=${encodeURIComponent(url)}`
      : `https://${url}`;
  }

  // Always use Playwright for browser_open so subsequent fill/click steps
  // work on the same page instance. Opening with `start` / `open` spawns a
  // separate process that Playwright can't control.
  const page = await ensurePlaywright();
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });

  // Wait a bit extra for JS-heavy sites (YouTube, etc.) to render their DOM
  await sleep(1500);

  const title = await page.title().catch(() => url!);
  console.log(`[Browser] Loaded: "${title}" — ${url}`);
  return { success: true, url, title, message: `Opened ${url} — "${title}"` };
}

async function browserFill(selector: string | undefined, value: string | undefined): Promise<StepResult> {
  if (!selector) throw new Error('selector is required');
  if (value === undefined) throw new Error('value is required');

  const page = await ensurePlaywright();
  const usedStrategy = await findAndAct(page, selector, 'fill', value);
  await sleep(300); // small pause after typing so the site can react
  return { success: true, selector: usedStrategy, value, message: `Filled "${usedStrategy}" with "${value}"` };
}

async function browserClick(selector: string | undefined): Promise<StepResult> {
  if (!selector) throw new Error('selector is required');

  const page = await ensurePlaywright();

  // After clicking something that triggers navigation (e.g. search button, video link),
  // give the page time to respond before the next step runs.
  const usedStrategy = await findAndAct(page, selector, 'click');
  await sleep(1500);
  return { success: true, selector: usedStrategy, message: `Clicked "${usedStrategy}"` };
}

// ─── Remaining Capabilities (unchanged) ──────────────────────────────────────

async function typeText(text: string | undefined): Promise<StepResult> {
  if (text === undefined) throw new Error('text is required');
  if (process.platform === 'win32') {
    try {
      const esc = text.replace(/'/g, "''").replace(/([+^%~(){}[\]])/g, '{$1}');
      await execAsync(`powershell -Command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('${esc}')"`, { timeout: 10_000 });
      return { success: true, message: `Typed ${text.length} chars` };
    } catch { /* try clipboard */ }
    try {
      const esc2 = text.replace(/"/g, '\\"').replace(/`/g, '``');
      await execAsync(`powershell -Command "Set-Clipboard -Value \\"${esc2}\\""`, { timeout: 5000 });
      await sleep(200);
      await execAsync(`powershell -Command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('^v')"`, { timeout: 5000 });
      return { success: true, message: `Typed ${text.length} chars via clipboard` };
    } catch { /* fall through */ }
  }
  if (process.platform === 'darwin') {
    try {
      const esc = text.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
      await execAsync(`osascript -e 'tell application "System Events" to keystroke "${esc}"'`);
      return { success: true, message: `Typed ${text.length} chars` };
    } catch { /* fall through */ }
  }
  if (process.platform === 'linux') {
    try {
      await execAsync(`xdotool type --clearmodifiers --delay 50 "${text.replace(/"/g, '\\"')}"`);
      return { success: true, message: `Typed ${text.length} chars` };
    } catch { /* fall through */ }
  }
  if (pageInstance) {
    try { await pageInstance.keyboard.type(text, { delay: 30 }); return { success: true, message: `Typed ${text.length} chars via Playwright` }; }
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
  if (/example\.(com|org|net)|placeholder\.|your.?url|\/path\/to\/|localhost|127\.0\.0\.1/i.test(url)) {
    throw new Error(`"${url}" looks like a placeholder URL. For wallpapers use set_wallpaper. For downloads provide a real URL.`);
  }
  if (!url.startsWith('http://') && !url.startsWith('https://')) url = `https://${url}`;

  let destPath: string;
  if (destination) {
    destPath = resolvePath(destination);
  } else {
    const filename = path.basename(new URL(url).pathname).replace(/[?#].*$/, '') || `download-${Date.now()}`;
    destPath = path.join(os.homedir(), 'Downloads', filename);
  }
  await fs.mkdir(path.dirname(destPath), { recursive: true });
  console.log(`[Executor] Downloading ${url} → ${destPath}`);
  await downloadFile(url, destPath);
  const stat = await fs.stat(destPath);
  return { success: true, path: destPath, url, message: `Downloaded ${Math.round(stat.size / 1024)}KB → ${destPath}` };
}

async function wait(seconds: number): Promise<StepResult> {
  await sleep(seconds * 1000);
  return { success: true, message: `Waited ${seconds}s` };
}

process.on('exit', () => { void browserInstance?.close(); });