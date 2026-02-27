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

// ─── openApplication — comprehensive multi-strategy launcher ─────────────────

async function openApplication(appName: string | undefined): Promise<StepResult> {
  if (!appName) throw new Error('app_name is required');
  const platform = process.platform;
  const lo = appName.toLowerCase().trim();

  if (platform === 'win32') {
    return openApplicationWindows(appName, lo);
  } else if (platform === 'darwin') {
    return openApplicationMac(appName, lo);
  } else {
    return openApplicationLinux(appName, lo);
  }
}

// ── Windows launcher ──────────────────────────────────────────────────────────

async function openApplicationWindows(appName: string, lo: string): Promise<StepResult> {
  const home = os.homedir();

  // ── 1. Known exact paths (fastest) ────────────────────────────────────────
  const WIN_KNOWN: Record<string, string[]> = {
    // Browsers
    chrome:               ['"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"',
                           '"C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe"'],
    firefox:              ['"C:\\Program Files\\Mozilla Firefox\\firefox.exe"',
                           '"C:\\Program Files (x86)\\Mozilla Firefox\\firefox.exe"'],
    edge:                 ['start microsoft-edge:', '"C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"'],
    brave:                ['"C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe"'],
    opera:                ['"C:\\Users\\' + os.userInfo().username + '\\AppData\\Local\\Programs\\Opera\\opera.exe"'],

    // Productivity
    notepad:              ['notepad'],
    calculator:           ['calc'],
    paint:                ['mspaint'],
    wordpad:              ['write'],
    'sticky notes':       ['stikynot'],
    snipping:             ['snippingtool'],
    'snipping tool':      ['snippingtool'],

    // Terminals
    cmd:                  ['start cmd'],
    terminal:             ['start wt', 'start cmd'],
    'windows terminal':   ['start wt'],
    powershell:           ['start powershell'],

    // Editors / Dev
    vscode:               ['code'],
    'visual studio code': ['code'],
    'visual studio':      ['"C:\\Program Files\\Microsoft Visual Studio\\2022\\Community\\Common7\\IDE\\devenv.exe"',
                           '"C:\\Program Files\\Microsoft Visual Studio\\2022\\Professional\\Common7\\IDE\\devenv.exe"'],
    notepad2:             ['notepad2'],
    notepadpp:            ['"C:\\Program Files\\Notepad++\\notepad++.exe"',
                           '"C:\\Program Files (x86)\\Notepad++\\notepad++.exe"'],
    'notepad++':          ['"C:\\Program Files\\Notepad++\\notepad++.exe"',
                           '"C:\\Program Files (x86)\\Notepad++\\notepad++.exe"'],

    // Communication — these are the ones most likely to be missing
    whatsapp:             [
      `"${home}\\AppData\\Local\\WhatsApp\\WhatsApp.exe"`,
      `"${home}\\AppData\\Roaming\\WhatsApp\\WhatsApp.exe"`,
      `"C:\\Program Files\\WindowsApps\\5319275A.WhatsAppDesktop_*\\WhatsApp.exe"`,
    ],
    discord:              [
      `"${home}\\AppData\\Local\\Discord\\Update.exe" --processStart Discord.exe`,
      `"${home}\\AppData\\Local\\Discord\\app-*\\Discord.exe"`,
    ],
    telegram:             [
      `"${home}\\AppData\\Roaming\\Telegram Desktop\\Telegram.exe"`,
      `"${home}\\AppData\\Local\\Telegram Desktop\\Telegram.exe"`,
      `"C:\\Program Files\\Telegram Desktop\\Telegram.exe"`,
    ],
    slack:                [
      `"${home}\\AppData\\Local\\slack\\slack.exe"`,
      `"${home}\\AppData\\Roaming\\Microsoft\\Windows\\Start Menu\\Programs\\Slack\\Slack.lnk"`,
    ],
    zoom:                 [
      `"${home}\\AppData\\Roaming\\Zoom\\bin\\Zoom.exe"`,
      `"C:\\Program Files\\Zoom\\bin\\Zoom.exe"`,
      `"C:\\Program Files (x86)\\Zoom\\bin\\Zoom.exe"`,
    ],
    teams:                [
      `"${home}\\AppData\\Local\\Microsoft\\Teams\\current\\Teams.exe"`,
      `"C:\\Program Files\\Microsoft\\Teams\\current\\Teams.exe"`,
      'start ms-teams:',
    ],
    'microsoft teams':    [
      `"${home}\\AppData\\Local\\Microsoft\\Teams\\current\\Teams.exe"`,
      'start ms-teams:',
    ],
    skype:                [
      `"${home}\\AppData\\Roaming\\Microsoft\\Windows\\Start Menu\\Programs\\Skype\\Skype.lnk"`,
      'start skype:',
    ],

    // Media
    spotify:              [
      `"${home}\\AppData\\Roaming\\Spotify\\Spotify.exe"`,
      `"${home}\\AppData\\Local\\Microsoft\\WindowsApps\\Spotify.exe"`,
    ],
    vlc:                  ['"C:\\Program Files\\VideoLAN\\VLC\\vlc.exe"',
                           '"C:\\Program Files (x86)\\VideoLAN\\VLC\\vlc.exe"'],
    'media player':       ['start wmplayer'],
    'windows media player': ['start wmplayer'],

    // Gaming / Launchers
    steam:                [
      `"${home}\\AppData\\Local\\Steam\\steam.exe"`,
      '"C:\\Program Files (x86)\\Steam\\steam.exe"',
      '"C:\\Program Files\\Steam\\steam.exe"',
    ],
    epic:                 [
      `"${home}\\AppData\\Local\\EpicGamesLauncher\\Portal\\Binaries\\Win64\\EpicGamesLauncher.exe"`,
    ],
    'epic games':         [
      `"${home}\\AppData\\Local\\EpicGamesLauncher\\Portal\\Binaries\\Win64\\EpicGamesLauncher.exe"`,
    ],
    xbox:                 ['start xbox:'],
    'xbox app':           ['start xbox:'],

    // Office
    word:                 ['"C:\\Program Files\\Microsoft Office\\root\\Office16\\WINWORD.EXE"',
                           '"C:\\Program Files (x86)\\Microsoft Office\\root\\Office16\\WINWORD.EXE"'],
    excel:                ['"C:\\Program Files\\Microsoft Office\\root\\Office16\\EXCEL.EXE"',
                           '"C:\\Program Files (x86)\\Microsoft Office\\root\\Office16\\EXCEL.EXE"'],
    powerpoint:           ['"C:\\Program Files\\Microsoft Office\\root\\Office16\\POWERPNT.EXE"'],
    outlook:              ['"C:\\Program Files\\Microsoft Office\\root\\Office16\\OUTLOOK.EXE"'],
    onenote:              ['start onenote:'],

    // System
    'file explorer':      ['explorer'],
    explorer:             ['explorer'],
    'task manager':       ['taskmgr'],
    settings:             ['start ms-settings:'],
    'control panel':      ['control'],
    'device manager':     ['devmgmt.msc'],
    regedit:              ['regedit'],
  };

  // Find matching keys (substring match both ways)
  const matchedCmds: string[] = [];
  for (const [key, cmds] of Object.entries(WIN_KNOWN)) {
    if (lo.includes(key) || key.includes(lo) || lo.replace(/\s+/g, '') === key.replace(/\s+/g, '')) {
      matchedCmds.push(...cmds);
    }
  }

  // ── 2. Try known paths first ───────────────────────────────────────────────
  for (const cmd of matchedCmds) {
    try {
      // Handle glob paths (e.g. app-* directories for Discord)
      if (cmd.includes('*')) {
        const resolved = await resolveGlobPath(cmd);
        if (resolved) {
          await execAsync(`start "" ${resolved}`, { timeout: 8000 });
          await sleep(800);
          return { success: true, message: `Opened ${appName} via resolved path` };
        }
        continue;
      }
      // Handle 'start xxx:' protocol URLs
      if (cmd.startsWith('start ') && cmd.includes(':') && !cmd.includes('.exe') && !cmd.includes('.lnk')) {
        await execAsync(cmd, { timeout: 8000 });
        await sleep(800);
        return { success: true, message: `Opened ${appName} via protocol handler` };
      }
      // Handle .lnk shortcut files
      if (cmd.endsWith('.lnk"')) {
        const lnkPath = cmd.replace(/^"/, '').replace(/"$/, '');
        try {
          await fs.access(lnkPath);
          await execAsync(`start "" "${lnkPath}"`, { timeout: 8000 });
          await sleep(800);
          return { success: true, message: `Opened ${appName} via shortcut` };
        } catch { continue; }
      }
      // Regular exe path — check it exists before trying
      const exeMatch = cmd.match(/"([^"]+\.exe)"/i);
      if (exeMatch) {
        try {
          await fs.access(exeMatch[1]);
        } catch { continue; } // path doesn't exist, skip
      }
      await execAsync(cmd.startsWith('start') ? cmd : `start "" ${cmd}`, { timeout: 8000 });
      await sleep(800);
      return { success: true, message: `Opened ${appName}` };
    } catch { /* try next */ }
  }

  // ── 3. PowerShell Start-Process (searches PATH + registry) ────────────────
  const psNames = buildPsNameVariants(appName);
  for (const name of psNames) {
    try {
      await execAsync(
        `powershell -Command "Start-Process '${name}' -ErrorAction Stop"`,
        { timeout: 8000 }
      );
      await sleep(800);
      return { success: true, message: `Opened ${appName} via PowerShell` };
    } catch { /* try next */ }
  }

  // ── 4. Windows Store / UWP apps via shell:AppsFolder ─────────────────────
  try {
    const appId = await findUwpAppId(lo);
    if (appId) {
      await execAsync(`explorer shell:AppsFolder\\${appId}`, { timeout: 8000 });
      await sleep(1200);
      return { success: true, message: `Opened ${appName} via UWP (${appId})` };
    }
  } catch { /* fall through */ }

  // ── 5. Start Menu shortcut search ─────────────────────────────────────────
  try {
    const lnk = await findStartMenuShortcut(lo);
    if (lnk) {
      await execAsync(`start "" "${lnk}"`, { timeout: 8000 });
      await sleep(800);
      return { success: true, message: `Opened ${appName} via Start Menu shortcut` };
    }
  } catch { /* fall through */ }

  // ── 6. where.exe / which fallback ─────────────────────────────────────────
  for (const name of psNames) {
    try {
      const { stdout } = await execAsync(`where "${name}" 2>nul`, { timeout: 5000 });
      const exePath = stdout.trim().split('\n')[0].trim();
      if (exePath) {
        await execAsync(`start "" "${exePath}"`, { timeout: 8000 });
        await sleep(800);
        return { success: true, message: `Opened ${appName} via where.exe` };
      }
    } catch { /* try next */ }
  }

  throw new Error(
    `Could not open "${appName}". Make sure it is installed. ` +
    `Tried: known paths, PowerShell, UWP shell, Start Menu shortcuts, PATH lookup.`
  );
}

// ── Helpers for Windows app search ───────────────────────────────────────────

function buildPsNameVariants(appName: string): string[] {
  const variants = new Set<string>();
  variants.add(appName);
  variants.add(appName.replace(/\s+/g, ''));         // "WhatsApp"
  variants.add(appName.toLowerCase());
  variants.add(appName.toLowerCase().replace(/\s+/g, ''));
  variants.add(appName.replace(/\s+/g, '-'));        // "some-app"
  return Array.from(variants);
}

async function resolveGlobPath(cmd: string): Promise<string | null> {
  // Extract the directory with the glob and try to expand it
  const match = cmd.match(/"([^"]*\*[^"]*)"/);
  if (!match) return null;
  const globPath = match[1];
  const dir = path.dirname(globPath);
  const pattern = path.basename(globPath);

  try {
    const entries = await fs.readdir(dir);
    const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$', 'i');
    const found = entries.filter(e => regex.test(e)).sort().reverse(); // newest first
    if (found.length > 0) {
      const fullPath = path.join(dir, found[0]);
      // If the glob was for a directory, return the inner exe
      const stat = await fs.stat(fullPath);
      if (stat.isDirectory()) {
        const innerExe = cmd.replace(match[0], `"${fullPath}"`);
        return innerExe;
      }
      return `"${fullPath}"`;
    }
  } catch { /* fall through */ }
  return null;
}

async function findUwpAppId(appNameLower: string): Promise<string | null> {
  // Known UWP package family names
  const UWP_KNOWN: Record<string, string> = {
    whatsapp:     '5319275A.WhatsAppDesktop_cv1g1gvanyjgm!WhatsApp',
    calculator:   'Microsoft.WindowsCalculator_8wekyb3d8bbwe!App',
    'ms paint':   'Microsoft.MSPaint_8wekyb3d8bbwe!Microsoft.MSPaint',
    paint:        'Microsoft.MSPaint_8wekyb3d8bbwe!Microsoft.MSPaint',
    photos:       'Microsoft.Windows.Photos_8wekyb3d8bbwe!App',
    notepad:      'Microsoft.WindowsNotepad_8wekyb3d8bbwe!Notepad',
    store:        'Microsoft.WindowsStore_8wekyb3d8bbwe!App',
    'windows store': 'Microsoft.WindowsStore_8wekyb3d8bbwe!App',
    spotify:      'SpotifyAB.SpotifyMusic_zpdnekdrzrea0!Spotify',
    netflix:      '4DF9E0F8.Netflix_mcm4njqhnhss8!Netflix.App',
    'xbox game bar': 'Microsoft.XboxGamingOverlay_8wekyb3d8bbwe!App',
    'mail':       'microsoft.windowscommunicationsapps_8wekyb3d8bbwe!microsoft.windowslive.mail',
    'calendar':   'microsoft.windowscommunicationsapps_8wekyb3d8bbwe!microsoft.windowslive.calendar',
    'maps':       'Microsoft.WindowsMaps_8wekyb3d8bbwe!App',
    'weather':    'Microsoft.BingWeather_8wekyb3d8bbwe!App',
    'news':       'Microsoft.BingNews_8wekyb3d8bbwe!AppexNews',
  };

  for (const [key, id] of Object.entries(UWP_KNOWN)) {
    if (appNameLower.includes(key) || key.includes(appNameLower)) {
      return id;
    }
  }

  // Try dynamic lookup via PowerShell
  try {
    const query = appNameLower.replace(/\s+/g, '*');
    const { stdout } = await execAsync(
      `powershell -Command "Get-AppxPackage -Name '*${query}*' | Select-Object -First 1 -ExpandProperty PackageFamilyName"`,
      { timeout: 10000 }
    );
    const pkgFamily = stdout.trim();
    if (pkgFamily && !pkgFamily.includes('WARNING') && !pkgFamily.includes('ERROR')) {
      // Try to get the app ID
      const { stdout: appIds } = await execAsync(
        `powershell -Command "(Get-AppxPackage -Name '*${query}*' | Select-Object -First 1 | Get-AppxPackageManifest).Package.Applications.Application.Id"`,
        { timeout: 10000 }
      );
      const appId = appIds.trim().split('\n')[0].trim();
      if (appId) {
        return `${pkgFamily}!${appId}`;
      }
      return `${pkgFamily}!App`;
    }
  } catch { /* fall through */ }

  return null;
}

async function findStartMenuShortcut(appNameLower: string): Promise<string | null> {
  const home = os.homedir();
  const username = os.userInfo().username;
  const startMenuDirs = [
    `${home}\\AppData\\Roaming\\Microsoft\\Windows\\Start Menu\\Programs`,
    `C:\\ProgramData\\Microsoft\\Windows\\Start Menu\\Programs`,
    `C:\\Users\\${username}\\AppData\\Roaming\\Microsoft\\Windows\\Start Menu\\Programs`,
  ];

  for (const dir of startMenuDirs) {
    try {
      const lnk = await searchDirForShortcut(dir, appNameLower);
      if (lnk) return lnk;
    } catch { /* dir might not exist */ }
  }
  return null;
}

async function searchDirForShortcut(dir: string, query: string, depth = 0): Promise<string | null> {
  if (depth > 3) return null;
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const entryLower = entry.name.toLowerCase();
      if (entry.isFile() && entry.name.endsWith('.lnk')) {
        const nameLower = entryLower.replace('.lnk', '');
        if (nameLower.includes(query) || query.includes(nameLower) ||
            nameLower.replace(/\s+/g, '').includes(query.replace(/\s+/g, ''))) {
          return path.join(dir, entry.name);
        }
      } else if (entry.isDirectory() && depth < 2) {
        const found = await searchDirForShortcut(path.join(dir, entry.name), query, depth + 1);
        if (found) return found;
      }
    }
  } catch { /* dir not accessible */ }
  return null;
}

// ── macOS launcher ────────────────────────────────────────────────────────────

async function openApplicationMac(appName: string, lo: string): Promise<StepResult> {
  const MAC_KNOWN: Record<string, string> = {
    chrome:               'Google Chrome',
    vscode:               'Visual Studio Code',
    'visual studio code': 'Visual Studio Code',
    spotify:              'Spotify',
    discord:              'Discord',
    terminal:             'Terminal',
    iterm:                'iTerm',
    iterm2:               'iTerm',
    safari:               'Safari',
    finder:               'Finder',
    whatsapp:             'WhatsApp',
    telegram:             'Telegram',
    slack:                'Slack',
    zoom:                 'zoom.us',
    teams:                'Microsoft Teams',
    'microsoft teams':    'Microsoft Teams',
    mail:                 'Mail',
    calendar:             'Calendar',
    notes:                'Notes',
    xcode:                'Xcode',
    preview:              'Preview',
    pages:                'Pages',
    numbers:              'Numbers',
    keynote:              'Keynote',
    word:                 'Microsoft Word',
    excel:                'Microsoft Excel',
    powerpoint:           'Microsoft PowerPoint',
  };

  const macName = MAC_KNOWN[lo] ?? appName;
  for (const name of [macName, appName]) {
    try {
      await execAsync(`open -a "${name}"`, { timeout: 8000 });
      return { success: true, message: `Opened ${appName}` };
    } catch { /* try next */ }
  }

  // Try Spotlight / mdfind as last resort
  try {
    const { stdout } = await execAsync(
      `mdfind 'kMDItemKind == "Application" && kMDItemDisplayName == "${appName}*"' | head -1`,
      { timeout: 8000 }
    );
    const appPath = stdout.trim();
    if (appPath) {
      await execAsync(`open "${appPath}"`, { timeout: 8000 });
      return { success: true, message: `Opened ${appName} via Spotlight` };
    }
  } catch { /* fall through */ }

  throw new Error(`Could not open "${appName}" on macOS`);
}

// ── Linux launcher ────────────────────────────────────────────────────────────

async function openApplicationLinux(appName: string, lo: string): Promise<StepResult> {
  const LINUX_KNOWN: Record<string, string[]> = {
    chrome:     ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser'],
    firefox:    ['firefox'],
    vscode:     ['code'],
    discord:    ['discord'],
    telegram:   ['telegram-desktop', 'Telegram'],
    spotify:    ['spotify'],
    slack:      ['slack'],
    zoom:       ['zoom'],
    whatsapp:   ['whatsapp-desktop', 'whatsapp'],
    terminal:   ['gnome-terminal', 'konsole', 'xterm', 'xfce4-terminal'],
    files:      ['nautilus', 'dolphin', 'thunar'],
    calculator: ['gnome-calculator', 'kcalc'],
  };

  const candidates: string[] = [];
  for (const [key, cmds] of Object.entries(LINUX_KNOWN)) {
    if (lo.includes(key) || key.includes(lo)) candidates.push(...cmds);
  }
  candidates.push(lo.replace(/\s+/g, '-'), lo.replace(/\s+/g, ''), lo);

  for (const cmd of candidates) {
    try {
      execAsync(`${cmd} &`);
      await sleep(500);
      return { success: true, message: `Launched ${appName}` };
    } catch { /* try next */ }
  }

  try {
    await execAsync(`xdg-open "${appName}" &`);
    return { success: true, message: `Opened ${appName}` };
  } catch {
    throw new Error(`Could not open "${appName}" on Linux`);
  }
}

// ─── Non-Browser Capabilities ─────────────────────────────────────────────────

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