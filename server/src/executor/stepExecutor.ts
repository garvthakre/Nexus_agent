import { exec } from 'child_process';
import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as https from 'https';
import * as http from 'http';
import { promisify } from 'util';
import { PlanStep, StepResult } from '../types';
import { appFindWindow, appClick, appType, appFocusWindow, appScreenshot, appVerify } from './desktopEngine';
import { openApplicationWindows } from './windowsAppLauncher';
import { smartFindAndAct } from './Browserengine';

const execAsync = promisify(exec);

// ─── Browser State ────────────────────────────────────────────────────────────

let browserInstance: import('playwright').Browser | null = null;
let pageInstance:    import('playwright').Page    | null = null;
let browserContext:  import('playwright').BrowserContext | null = null;

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

// ─── Anti-Bot Browser Configuration ──────────────────────────────────────────
// Prevents Google / Cloudflare "Are you human?" detection.

const STEALTH_ARGS = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--start-maximized',

  // ★ The key anti-bot flags ★
  '--disable-blink-features=AutomationControlled',
  '--disable-automation',

  // Remove "Chrome is being controlled by automated test software" banner
  '--disable-infobars',
  '--no-first-run',
  '--no-default-browser-check',

  // Realistic browser behavior
  '--disable-features=IsolateOrigins,site-per-process',
  '--disable-web-security',
  '--allow-running-insecure-content',
  '--disable-component-update',
  '--lang=en-US',
];

const REAL_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

// ─── Stealth Script Injection ─────────────────────────────────────────────────
// Patches the DOM/JS properties that bot detectors check BEFORE the page loads.

async function applyStealthScripts(page: import('playwright').Page): Promise<void> {
  await page.addInitScript(() => {
    // 1. Remove navigator.webdriver — THE primary bot signal
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });

    // 2. Spoof plugins array (headless has 0 plugins, real Chrome has several)
    Object.defineProperty(navigator, 'plugins', {
      get: () => {
        const fakePlugins = [
          { name: 'Chrome PDF Plugin',  filename: 'internal-pdf-viewer', description: 'Portable Document Format', length: 0 },
          { name: 'Chrome PDF Viewer',  filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai', description: '', length: 0 },
          { name: 'Native Client',      filename: 'internal-nacl-plugin', description: '', length: 0 },
        ];
        return Object.assign([], fakePlugins, { item: (i: number) => fakePlugins[i] });
      },
    });

    // 3. Correct languages
    Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });

    // 4. Inject window.chrome (missing in headless)
    (window as any).chrome = {
      runtime: { id: undefined },
      loadTimes: () => ({}),
      csi: () => ({}),
      app: {},
    };

    // 5. Patch permission query (Cloudflare checks this)
    const originalQuery = window.navigator.permissions?.query;
    if (originalQuery) {
      (window.navigator.permissions as any).query = (params: PermissionDescriptor) =>
        params.name === 'notifications'
          ? Promise.resolve({ state: Notification.permission } as PermissionStatus)
          : originalQuery.call(window.navigator.permissions, params);
    }

    // 6. Fix screen size (headless often reports 0×0)
    try {
      Object.defineProperty(screen, 'availWidth',  { get: () => 1920 });
      Object.defineProperty(screen, 'availHeight', { get: () => 1040 });
    } catch { /* already defined — safe to ignore */ }

    // 7. WebGL vendor spoofing
    try {
      const origGetParam = WebGLRenderingContext.prototype.getParameter;
      WebGLRenderingContext.prototype.getParameter = function (parameter: number) {
        if (parameter === 37445) return 'Intel Inc.';
        if (parameter === 37446) return 'Intel Iris OpenGL Engine';
        return origGetParam.call(this, parameter);
      };
    } catch { /* ignore */ }
  });
}

// ─── Playwright Setup ─────────────────────────────────────────────────────────

async function isPageAlive(page: import('playwright').Page): Promise<boolean> {
  try { await page.evaluate(() => true); return true; }
  catch { return false; }
}

async function ensurePlaywright(): Promise<import('playwright').Page> {
  // Return existing page if still alive
  if (pageInstance) {
    if (await isPageAlive(pageInstance)) return pageInstance;

    console.log('[Browser] Page closed — recovering...');
    pageInstance = null;

    // Try creating new page in existing context
    if (browserContext) {
      try {
        pageInstance = await browserContext.newPage();
        await applyStealthScripts(pageInstance);
        console.log('[Browser] ✓ Recovered with new page');
        return pageInstance;
      } catch { browserContext = null; }
    }

    // Full restart
    try { await browserInstance?.close(); } catch { /* ignore */ }
    browserInstance = null;
  }

  const { chromium } = await import('playwright');

  // Try real Chrome → Edge → bundled Chromium (in that order)
  // Real Chrome has the best anti-detection fingerprint
  const configs = [
    { channel: 'msedge',  args: STEALTH_ARGS, headless: false },   // Microsoft Edge — preferred
    { channel: 'chrome',  args: STEALTH_ARGS, headless: false },   // Chrome fallback
    {                      args: STEALTH_ARGS, headless: false },   // bundled Chromium last resort
  ];

  for (const cfg of configs) {
    try {
      browserInstance = await chromium.launch(cfg as Parameters<typeof chromium.launch>[0]);
      console.log(`[Browser] Launched with config: ${(cfg as any).channel ?? 'bundled-chromium'}`);
      break;
    } catch (e) {
      const msg = (e as Error).message;
      if (msg.includes("Executable doesn't exist") || msg.includes('playwright install')) {
        console.log('[Browser] Installing Playwright Chromium...');
        await execAsync('npx playwright install chromium', { timeout: 120_000 });
        browserInstance = await chromium.launch({ args: STEALTH_ARGS, headless: false });
        break;
      }
      // Try next config
    }
  }

  if (!browserInstance) throw new Error('Could not launch browser. Run: npx playwright install chromium');

  // Create context with full realistic fingerprint
  browserContext = await browserInstance.newContext({
    viewport: { width: 1280, height: 800 },
    userAgent: REAL_USER_AGENT,
    locale: 'en-US',
    timezoneId: 'Asia/Kolkata',
    colorScheme: 'light',
    extraHTTPHeaders: {
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'sec-ch-ua': '"Chromium";v="122", "Not(A:Brand";v="24", "Google Chrome";v="122"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '"Windows"',
      'Upgrade-Insecure-Requests': '1',
    },
  });

  pageInstance = await browserContext.newPage();
  await applyStealthScripts(pageInstance);

  pageInstance.on('crash', () => {
    console.warn('[Browser] Page crashed — will recover on next action');
    pageInstance = null;
  });

  return pageInstance;
}

// ─── Bot Detection Handler ────────────────────────────────────────────────────

async function handleBotDetection(page: import('playwright').Page): Promise<void> {
  const title = await page.title().catch(() => '');
  const url   = page.url();

  const botSignals = [
    'just a moment', 'are you human', 'attention required',
    'access denied', 'checking your browser', 'ddos-guard',
    'please wait', 'one more step', 'enable javascript and cookies',
  ];

  const isBlocked = botSignals.some(s =>
    title.toLowerCase().includes(s) || url.toLowerCase().includes('challenge')
  );

  if (!isBlocked) return;

  console.log('[Browser] ⚠ Bot detection page detected — waiting for auto-pass...');

  // With real Chrome + stealth flags, Cloudflare usually auto-passes in 3-8 seconds
  for (let i = 0; i < 20; i++) {
    await sleep(1000);
    const newTitle = await page.title().catch(() => '');
    const stillBlocked = botSignals.some(s => newTitle.toLowerCase().includes(s));

    if (!stillBlocked) {
      console.log(`[Browser] ✓ Bot detection passed after ${i + 1}s`);
      await sleep(500);
      return;
    }

    // After 5s, try gentle mouse movements to simulate human
    if (i === 5) {
      try {
        await page.mouse.move(400 + Math.random() * 400, 300 + Math.random() * 200);
        await sleep(200);
        await page.mouse.move(500 + Math.random() * 200, 400 + Math.random() * 100);
      } catch { /* ignore */ }
    }
  }

  console.log('[Browser] Continuing despite bot detection (stealth mode active)');
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
    case 'browser_read_page':      return browserReadPage(parameters.variable_name, parameters.topic);
    case 'browser_extract_results': return browserExtractResults(parameters.variable_name, parameters.count ?? 10);
    case 'type_text':         return typeText(parameters.text);
    case 'create_file':       return createFile(parameters.path, parameters.content ?? '');
    case 'create_folder':     return createFolder(parameters.path);
    case 'wait':              return wait(parameters.seconds ?? 1);
    case 'download_file':     return downloadFileCapability(parameters.url, parameters.destination ?? parameters.path);
    case 'app_find_window':   return appFindWindowStep(parameters.app_name, parameters.seconds);
    case 'app_focus_window':  return appFocusWindowStep(parameters.app_name);
    case 'app_click':         return appClickStep(parameters.app_name, parameters.element_name);
    case 'app_type':          return appTypeStep(parameters.app_name, parameters.element_name, parameters.text);
    case 'app_screenshot':    return appScreenshotStep(parameters.app_name);
    case 'app_verify':        return appVerifyStep(parameters.app_name, parameters.text);
    default: throw new Error(`Unknown capability: ${capability}`);
  }
}

// ─── Browser Capabilities ─────────────────────────────────────────────────────

async function browserOpen(url: string | undefined): Promise<StepResult> {
  if (!url) throw new Error('url is required');

  // Resolve {{variable}} templates — e.g. "{{jobs_0_url}}" → actual URL from articleStore
  url = url.replace(/\{\{([^}]+)\}\}/g, (match, key) => {
    const val = articleStore[key.trim()];
    if (val) {
      console.log(`[browserOpen] Resolved {{${key.trim()}}} → ${val.slice(0, 80)}`);
      return val;
    }
    console.warn(`[browserOpen] Template {{${key.trim()}}} not found in articleStore — keeping as-is`);
    return match;
  });

  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    // ★ Use Bing (Edge default search) — Google blocks automated browsers with CAPTCHA
    url = (!url.includes('.') || url.includes(' '))
      ? `https://www.bing.com/search?q=${encodeURIComponent(url)}`
      : `https://${url}`;
  }
  const page = await ensurePlaywright();
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await sleep(1500);
  await handleBotDetection(page);
  const title = await page.title().catch(() => url!);
  console.log(`[Browser] Loaded: "${title}" — ${url}`);
  return { success: true, url, title, message: `Opened ${url} — "${title}"` };
}

async function browserFill(selector: string | undefined, value: string | undefined): Promise<StepResult> {
  if (!selector) throw new Error('selector is required');
  if (value === undefined) throw new Error('value is required');
  const page = await ensurePlaywright();

  // Human-like pause before typing
  await sleep(300 + Math.random() * 200);

  // Special: contenteditable (WhatsApp, etc.)
  if (selector.includes('contenteditable')) {
    try {
      const loc = page.locator(selector).first();
      await loc.waitFor({ state: 'visible', timeout: 5000 });
      await loc.click();
      await sleep(300);
      await page.keyboard.press('Control+a');
      await sleep(100);
      await page.keyboard.type(value, { delay: 35 + Math.random() * 20 });
      return { success: true, message: `Typed into contenteditable` };
    } catch (e) {
      console.warn('[browserFill] contenteditable failed:', (e as Error).message);
    }
  }

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

  if (!await isPageAlive(page)) {
    pageInstance = null;
    throw new Error('Page was closed before click');
  }

  // Human-like pause before clicking
  await sleep(200 + Math.random() * 300);

  const result = await smartFindAndAct(page, selector, 'click');
  await sleep(1200);

  const livePage = await ensurePlaywright();
  await handleBotDetection(livePage);
  const title = await livePage.title().catch(() => '');

  return {
    success: true,
    message: `Clicked via ${result.strategy} (tier ${result.tier})${title ? ` → "${title}"` : ''}`,
    ...(result.warning ? { warning: result.warning } : {}),
  };
}

// ─── Article Store ────────────────────────────────────────────────────────────
// Holds extracted article summaries across steps so create_file can use them.

const articleStore: Record<string, string> = {};

export function getArticleStore(): Record<string, string> {
  return { ...articleStore };
}

export function clearArticleStore(): void {
  Object.keys(articleStore).forEach(k => delete articleStore[k]);
}

// ─── browser_read_page ────────────────────────────────────────────────────────
// Reads the current browser page, extracts the main text, summarizes it via
// Groq, and stores the result in articleStore[variable_name].
// The create_file step can use {{variable_name}} in its content template.

async function browserReadPage(
  variableName: string | undefined,
  topic: string | undefined,
): Promise<StepResult> {
  const page = await ensurePlaywright();
  const url   = page.url();
  const title = await page.title().catch(() => 'Unknown');

  // Extract main text — remove clutter first
  const rawText = await page.evaluate(() => {
    const REMOVE = ['script', 'style', 'nav', 'header', 'footer', 'aside',
                    '[class*="ad"]', '[id*="ad"]', '[class*="cookie"]',
                    '[class*="banner"]', '[class*="popup"]', '[class*="modal"]'];
    REMOVE.forEach(sel => {
      try { document.querySelectorAll(sel).forEach(el => el.remove()); } catch {}
    });

    const candidates = [
      'article', 'main', '[role="main"]', '.article-body',
      '.post-content', '.entry-content', '.story-body',
      '#article-body', '#main-content', '.content',
    ];
    for (const sel of candidates) {
      const el = document.querySelector(sel);
      if (el && (el.textContent ?? '').trim().length > 300) {
        return (el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 4000);
      }
    }
    return (document.body.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 4000);
  }).catch(() => '');

  if (!rawText || rawText.length < 100) {
    const fallback = `${title} — (Could not extract article text from ${url})`;
    if (variableName) articleStore[variableName] = fallback;
    return { success: true, message: `Page text too short, stored fallback`, summary: fallback };
  }

  // Summarize via Groq
  let summary = '';
  try {
    const OpenAI = (await import('openai')).default;
    const groq = new OpenAI({
      apiKey: process.env.GROQ_API_KEY ?? '',
      baseURL: 'https://api.groq.com/openai/v1',
    });
    const topicCtx = topic ? ` Focus on aspects related to: ${topic}.` : '';
    const resp = await groq.chat.completions.create({
      model: process.env.GROQ_MODEL ?? 'llama-3.3-70b-versatile',
      messages: [
        {
          role: 'system',
          content: 'You are a concise news summarizer. Summarize the article in 3-5 sentences covering: what happened, who is involved, and why it matters. Be factual and specific. Do not add preamble.',
        },
        {
          role: 'user',
          content: `Article title: "${title}"\nURL: ${url}${topicCtx}\n\nArticle text:\n${rawText}`,
        },
      ],
      temperature: 0.2,
      max_tokens: 250,
    });
    summary = resp.choices[0].message.content?.trim() ?? '';
  } catch (e) {
    console.warn('[browserReadPage] Groq summarization failed:', (e as Error).message);
    summary = rawText.slice(0, 500).trim() + '...';
  }

  const result = `Title: ${title}\nURL: ${url}\n\n${summary}`;
  if (variableName) {
    articleStore[variableName] = result;
    console.log(`[browserReadPage] Stored "${variableName}": ${result.length} chars`);
  }

  return { success: true, message: `Summarized: "${title}"`, summary: result };
}

// ─── browser_extract_results ──────────────────────────────────────────────────
// The universal "get all results from this page" capability.
// Works on ANY site — search results, job boards, product listings, news feeds.
// Extracts title + URL for every meaningful link on the page, stores as JSON
// in articleStore[variable_name]. The planner can then browser_open each URL.
//
// Usage in plan:
//   { capability: "browser_extract_results", parameters: { variable_name: "jobs", count: 5 } }
// Then access results: {{jobs}} in create_file, or planner uses extracted URLs directly.

async function browserExtractResults(
  variableName: string | undefined,
  count: number,
): Promise<StepResult> {
  const page = await ensurePlaywright();
  const pageUrl = page.url();

  console.log(`[browserExtractResults] Scanning page: ${pageUrl}`);

  // Universal JS extractor — works on any site
  // Strategy: find all meaningful links with visible text, ranked by quality
  const extracted = await page.evaluate((maxCount: number) => {
    interface ResultItem {
      title: string;
      url: string;
      description: string;
      index: number;
    }

    const results: ResultItem[] = [];
    const seen = new Set<string>();

    // Noise patterns to skip
    const SKIP_PATTERNS = [
      /^(javascript:|mailto:|tel:|#)/i,
      /(login|signin|sign-in|logout|signup|register|account|privacy|terms|cookie|help|support|about|contact|adverti|careers|press)/i,
      /\.(css|js|png|jpg|jpeg|gif|svg|ico|pdf|zip|xml|json)$/i,
    ];

    // Current domain for filtering internal nav
    const currentDomain = window.location.hostname;

    // Score a link — higher = more likely to be a real result
    function scoreLink(a: HTMLAnchorElement, text: string): number {
      let score = 0;
      const href = a.href;
      const rect = a.getBoundingClientRect();

      // Must be visible
      if (rect.width === 0 || rect.height === 0) return -1;
      if (rect.top < 0 || rect.top > window.innerHeight * 3) return -1;

      // Good signs
      if (text.length > 20) score += 3;
      if (text.length > 50) score += 2;
      if (rect.top > 100) score += 1; // Not in header
      if (href.includes('/jobs/') || href.includes('/job/')) score += 5;
      if (href.includes('/article') || href.includes('/post') || href.includes('/news')) score += 4;
      if (href.includes('/product') || href.includes('/item') || href.includes('/dp/')) score += 4;
      if (href.includes('/profile') || href.includes('/company')) score += 3;

      // Bad signs
      if (href.includes(currentDomain) && href.split('/').length < 5) score -= 2; // Short internal link
      if (text.length < 10) score -= 2;

      return score;
    }

    // Get description near a link
    function getNearbyText(el: Element): string {
      // Check siblings and parent text
      const parent = el.closest('li, article, [class*="card"], [class*="item"], [class*="result"], [class*="job"], [class*="product"]');
      if (parent) {
        const text = (parent.textContent ?? '').replace(/\s+/g, ' ').trim();
        return text.slice(0, 200);
      }
      return '';
    }

    // Collect all anchor elements
    const anchors = Array.from(document.querySelectorAll('a[href]')) as HTMLAnchorElement[];

    for (const a of anchors) {
      const href = a.href;
      const text = (a.textContent ?? '').replace(/\s+/g, ' ').trim();

      if (!href || !text) continue;
      if (seen.has(href)) continue;
      if (SKIP_PATTERNS.some(p => p.test(href) || p.test(text))) continue;

      const score = scoreLink(a, text);
      if (score < 0) continue;

      seen.add(href);
      results.push({
        title: text.slice(0, 150),
        url: href,
        description: getNearbyText(a),
        index: results.length,
      });
    }

    // Sort by score (re-score with full context)
    results.sort((a, b) => {
      let sa = 0, sb = 0;
      if (a.url.includes('/jobs/') || a.url.includes('/job/')) sa += 5;
      if (b.url.includes('/jobs/') || b.url.includes('/job/')) sb += 5;
      if (a.description.length > 50) sa += 2;
      if (b.description.length > 50) sb += 2;
      if (a.title.length > 30) sa += 1;
      if (b.title.length > 30) sb += 1;
      return sb - sa;
    });

    return results.slice(0, maxCount);
  }, count);

  console.log(`[browserExtractResults] Found ${extracted.length} results on ${pageUrl}`);

  if (extracted.length === 0) {
    const msg = `No results found on ${pageUrl}`;
    if (variableName) articleStore[variableName] = JSON.stringify([]);
    return { success: true, message: msg, summary: msg };
  }

  // Log what we found
  extracted.forEach((r, i) => {
    console.log(`  [${i}] "${r.title.slice(0, 60)}" → ${r.url.slice(0, 80)}`);
  });

  // Store as JSON so planner/create_file can use it
  const json = JSON.stringify(extracted, null, 2);
  if (variableName) {
    articleStore[variableName] = json;
    // Also store individual URLs for easy access: results_0_url, results_1_url, etc.
    extracted.forEach((r, i) => {
      articleStore[`${variableName}_${i}_url`]   = r.url;
      articleStore[`${variableName}_${i}_title`] = r.title;
      articleStore[`${variableName}_${i}_desc`]  = r.description;
    });
    console.log(`[browserExtractResults] Stored ${extracted.length} results in articleStore["${variableName}"]`);
  }

  // Return a human-readable summary too
  const summary = extracted.map((r, i) =>
    `${i + 1}. ${r.title}\n   ${r.url}`
  ).join('\n\n');

  return {
    success: true,
    message: `Extracted ${extracted.length} results from ${pageUrl}`,
    summary,
  };
}

// ─── Desktop App Steps ────────────────────────────────────────────────────────

async function appFindWindowStep(appName: string | undefined, seconds: number | undefined): Promise<StepResult> {
  if (!appName) throw new Error('app_name is required');
  return appFindWindow(appName, seconds ?? 10);
}

async function appFocusWindowStep(appName: string | undefined): Promise<StepResult> {
  if (!appName) throw new Error('app_name is required');
  return appFocusWindow(appName);
}

async function appClickStep(appName: string | undefined, elementName: string | undefined): Promise<StepResult> {
  if (!appName || !elementName) throw new Error('app_name and element_name are required');
  return appClick(appName, elementName);
}

async function appTypeStep(appName: string | undefined, elementName: string | undefined, text: string | undefined): Promise<StepResult> {
  if (!appName || !elementName || !text) throw new Error('app_name, element_name and text are required');
  return appType(appName, elementName, text);
}

async function appScreenshotStep(appName: string | undefined): Promise<StepResult> {
  if (!appName) throw new Error('app_name is required');
  return appScreenshot(appName);
}

async function appVerifyStep(appName: string | undefined, text: string | undefined): Promise<StepResult> {
  if (!appName || !text) throw new Error('app_name and text are required');
  return appVerify(appName, text);
}

// ─── App Launcher ─────────────────────────────────────────────────────────────

async function openApplication(appName: string | undefined): Promise<StepResult> {
  if (!appName) throw new Error('app_name is required');
  if (process.platform === 'win32') return openApplicationWindows(appName);
  if (process.platform === 'darwin') return openApplicationMac(appName);
  return openApplicationLinux(appName);
}

async function openApplicationMac(appName: string): Promise<StepResult> {
  const MAC_KNOWN: Record<string, string> = {
    chrome: 'Google Chrome', vscode: 'Visual Studio Code',
    'visual studio code': 'Visual Studio Code', spotify: 'Spotify',
    discord: 'Discord', terminal: 'Terminal', safari: 'Safari',
    whatsapp: 'WhatsApp', telegram: 'Telegram', slack: 'Slack',
    zoom: 'zoom.us', teams: 'Microsoft Teams', word: 'Microsoft Word',
    excel: 'Microsoft Excel', powerpoint: 'Microsoft PowerPoint',
  };
  const macName = MAC_KNOWN[appName.toLowerCase().trim()] ?? appName;
  for (const name of [macName, appName]) {
    try { await execAsync(`open -a "${name}"`, { timeout: 8000 }); return { success: true, message: `Opened ${appName}` }; }
    catch { /* try next */ }
  }
  throw new Error(`Could not open "${appName}" on macOS`);
}

async function openApplicationLinux(appName: string): Promise<StepResult> {
  const lo = appName.toLowerCase().trim();
  const LINUX_KNOWN: Record<string, string[]> = {
    chrome: ['google-chrome', 'google-chrome-stable', 'chromium'],
    firefox: ['firefox'], vscode: ['code'], discord: ['discord'],
    telegram: ['telegram-desktop'], spotify: ['spotify'],
    calculator: ['gnome-calculator', 'kcalc'],
  };
  const candidates: string[] = [];
  for (const [key, cmds] of Object.entries(LINUX_KNOWN)) {
    if (lo.includes(key) || key.includes(lo)) candidates.push(...cmds);
  }
  candidates.push(lo.replace(/\s+/g, '-'), lo);
  for (const cmd of candidates) {
    try { execAsync(`${cmd} &`); await sleep(500); return { success: true, message: `Launched ${appName}` }; }
    catch { /* try next */ }
  }
  throw new Error(`Could not open "${appName}" on Linux`);
}

// ─── Shell Command ────────────────────────────────────────────────────────────

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

  // Handle "word <path>" on Windows → use "start"
  if (process.platform === 'win32' && /^\s*word\s+/i.test(command)) {
    const filePath = command.replace(/^\s*word\s+/i, '').trim();
    const resolvedPath = resolvePath(filePath);
    await fs.mkdir(path.dirname(resolvedPath), { recursive: true });
    try { await fs.access(resolvedPath); } catch {
      await fs.writeFile(resolvedPath, 'Document created by NEXUS\n', 'utf-8');
    }
    await execAsync(`start "" "${resolvedPath}"`, { timeout: 10_000 });
    return { success: true, message: `Opened ${resolvedPath}` };
  }

  const isEditorLaunch = /^\s*(code|notepad|notepad2|subl|atom|gedit|kate)\s+/i.test(expanded);
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

// ─── File Operations ──────────────────────────────────────────────────────────

async function createFile(filePath: string | undefined, content: string): Promise<StepResult> {
  if (!filePath) throw new Error('path is required');
  const p = resolvePath(filePath);

  // Resolve {{variable_name}} templates from articleStore
  let resolvedContent = content;
  const templateVars = content.match(/\{\{([^}]+)\}\}/g);
  if (templateVars) {
    const store = articleStore;
    for (const tpl of templateVars) {
      const key = tpl.slice(2, -2).trim();
      if (store[key]) {
        resolvedContent = resolvedContent.replace(tpl, store[key]);
        console.log(`[createFile] Resolved {{${key}}} (${store[key].length} chars)`);
      } else {
        console.warn(`[createFile] Template var {{${key}}} not found in articleStore`);
      }
    }
  }

  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.writeFile(p, resolvedContent, 'utf-8');
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

async function setWallpaper(query: string | undefined): Promise<StepResult> {
  if (!query) throw new Error('query is required');
  const wallpaperPath = path.join(os.tmpdir(), `nexus-wallpaper-${Date.now()}.jpg`);
  const provider = await fetchWallpaperImage(query, wallpaperPath);
  const platform = process.platform;

  try {
    if (platform === 'win32') {
      const scriptPath = path.join(os.tmpdir(), `set-wp-${Date.now()}.ps1`);
      const wp = wallpaperPath.replace(/\\/g, '\\\\');
      const script = `Add-Type -TypeDefinition @"\nusing System; using System.Runtime.InteropServices;\npublic class WP {\n  [DllImport("user32.dll", CharSet=CharSet.Auto)]\n  public static extern int SystemParametersInfo(int uAction,int uParam,string lpvParam,int fuWinIni);\n}\n"@\n[WP]::SystemParametersInfo(20, 0, "${wp}", 3)`;
      await fs.writeFile(scriptPath, script, 'utf-8');
      try { await execAsync(`powershell -ExecutionPolicy Bypass -File "${scriptPath}"`, { timeout: 15000 }); }
      finally { await fs.unlink(scriptPath).catch(() => {}); }
    } else if (platform === 'darwin') {
      await execAsync(`osascript -e 'tell application "Finder" to set desktop picture to POSIX file "${wallpaperPath}"'`, { timeout: 15000 });
    } else {
      for (const cmd of [
        `gsettings set org.gnome.desktop.background picture-uri "file://${wallpaperPath}"`,
        `pcmanfm --set-wallpaper "${wallpaperPath}"`,
        `feh --bg-fill "${wallpaperPath}"`,
      ]) {
        try { await execAsync(cmd, { timeout: 8000 }); break; } catch { /* next */ }
      }
    }
    return { success: true, message: `✓ Wallpaper set (source: ${provider})`, path: wallpaperPath };
  } catch (err) {
    return { success: true, message: `Downloaded but auto-set failed`, path: wallpaperPath, warning: (err as Error).message };
  }
}

async function wait(seconds: number): Promise<StepResult> {
  await sleep(seconds * 1000);
  return { success: true, message: `Waited ${seconds}s` };
}

// ─── Download Helpers ─────────────────────────────────────────────────────────

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
      headers: { 'User-Agent': REAL_USER_AGENT, 'Accept': 'image/*,*/*;q=0.8' },
    }, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        const next = res.headers.location.startsWith('http')
          ? res.headers.location
          : `${parsed.protocol}//${parsed.hostname}${res.headers.location}`;
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