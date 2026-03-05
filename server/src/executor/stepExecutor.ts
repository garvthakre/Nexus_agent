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

// ─── FIX 1A: Smart waitUntil per domain ──────────────────────────────────────
//
// WHY: domcontentloaded fires before React/Vue renders on SPAs.
// LinkedIn, Spotify, WhatsApp Web etc. need "networkidle" + extra wait.
// YouTube needs "load" + wait. Others are fine with "domcontentloaded".
//
// IMPACT: Tier 0 now runs against actual DOM content → eliminates most
//         unnecessary Groq API escalations (tiers 2/3).

const SPA_DOMAINS = new Set([
  'linkedin.com', 'spotify.com', 'whatsapp.com', 'discord.com',
  'notion.so', 'figma.com', 'slack.com', 'trello.com',
  'asana.com', 'monday.com', 'airtable.com',
]);

function getWaitStrategy(url: string): {
  waitUntil: 'domcontentloaded' | 'networkidle' | 'load';
  extraWait: number;
} {
  const isSpa = [...SPA_DOMAINS].some(d => url.includes(d));
  if (isSpa) return { waitUntil: 'networkidle', extraWait: 2500 };
  if (url.includes('youtube.com')) return { waitUntil: 'load', extraWait: 1500 };
  return { waitUntil: 'domcontentloaded', extraWait: 800 };
}

// ─── Anti-Bot Browser Configuration ──────────────────────────────────────────

const STEALTH_ARGS = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--start-maximized',
  '--disable-blink-features=AutomationControlled',
  '--disable-automation',
  '--disable-infobars',
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-features=IsolateOrigins,site-per-process',
  '--disable-web-security',
  '--allow-running-insecure-content',
  '--disable-component-update',
  '--lang=en-US',
];

const REAL_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

// ─── Stealth Script Injection ─────────────────────────────────────────────────

async function applyStealthScripts(page: import('playwright').Page): Promise<void> {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
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
    Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
    (window as any).chrome = {
      runtime: { id: undefined },
      loadTimes: () => ({}),
      csi: () => ({}),
      app: {},
    };
    const originalQuery = window.navigator.permissions?.query;
    if (originalQuery) {
      (window.navigator.permissions as any).query = (params: PermissionDescriptor) =>
        params.name === 'notifications'
          ? Promise.resolve({ state: Notification.permission } as PermissionStatus)
          : originalQuery.call(window.navigator.permissions, params);
    }
    try {
      Object.defineProperty(screen, 'availWidth',  { get: () => 1920 });
      Object.defineProperty(screen, 'availHeight', { get: () => 1040 });
    } catch { /* ignore */ }
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

/** Expose the live page instance for mid-execution re-planning. */
export function getLivePage(): import('playwright').Page | null {
  return pageInstance;
}

async function ensurePlaywright(): Promise<import('playwright').Page> {
  if (pageInstance) {
    if (await isPageAlive(pageInstance)) return pageInstance;

    console.log('[Browser] Page closed — recovering...');
    pageInstance = null;

    if (browserContext) {
      try {
        pageInstance = await browserContext.newPage();
        await applyStealthScripts(pageInstance);
        console.log('[Browser] ✓ Recovered with new page');
        return pageInstance;
      } catch { browserContext = null; }
    }

    try { await browserInstance?.close(); } catch { /* ignore */ }
    browserInstance = null;
  }

  const { chromium } = await import('playwright');

  const configs = [
    { channel: 'msedge',  args: STEALTH_ARGS, headless: false },
    { channel: 'chrome',  args: STEALTH_ARGS, headless: false },
    {                      args: STEALTH_ARGS, headless: false },
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
    }
  }

  if (!browserInstance) throw new Error('Could not launch browser. Run: npx playwright install chromium');

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

// ─── FIX 1E: Bot Detection (hard throw instead of silent continue) ────────────
//
// WHY: Old code logged "Continuing despite bot detection" and pressed on.
// The next browserReadPage() would read the CAPTCHA page content and store it
// in articleStore as if it were real article text — garbage in, garbage out.
//
// FIX: Throw a typed error after 20s so the executor triggers retry/replan.
// Also saves the blocked URL so adaptive workarounds can try alternatives.

export class BotDetectionError extends Error {
  constructor(public readonly blockedUrl: string, message: string) {
    super(message);
    this.name = 'BotDetectionError';
  }
}

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

  for (let i = 0; i < 20; i++) {
    await sleep(1000);
    const newTitle = await page.title().catch(() => '');
    const stillBlocked = botSignals.some(s => newTitle.toLowerCase().includes(s));

    if (!stillBlocked) {
      console.log(`[Browser] ✓ Bot detection passed after ${i + 1}s`);
      await sleep(500);
      return;
    }

    if (i === 5) {
      try {
        await page.mouse.move(400 + Math.random() * 400, 300 + Math.random() * 200);
        await sleep(200);
        await page.mouse.move(500 + Math.random() * 200, 400 + Math.random() * 100);
      } catch { /* ignore */ }
    }
  }

  // FIX 1E: Hard throw instead of silent continue
  const finalTitle = await page.title().catch(() => '');
  const isReallyBlocked = botSignals.some(s => finalTitle.toLowerCase().includes(s));

  if (isReallyBlocked) {
    throw new BotDetectionError(
      url,
      `Bot detection active on ${url} after 20s — ` +
      `try a different URL or add stealth cookies for this domain`
    );
  }

  console.log('[Browser] ✓ Bot detection cleared (stealth mode worked)');
}

// ─── Main Dispatcher ──────────────────────────────────────────────────────────

export async function executeStep(step: PlanStep): Promise<StepResult> {
  const { capability, parameters } = step;
  console.log(`[Executor] ${capability}`, parameters);

  switch (capability) {
    case 'open_application':       return openApplication(parameters.app_name);
    case 'set_wallpaper':          return setWallpaper(parameters.query);
    case 'run_shell_command':      return runShellCommand(parameters.command);
    case 'browser_open':           return browserOpen(parameters.url);
    case 'browser_fill':           return browserFill(parameters.selector, parameters.value);
    case 'browser_click':          return browserClick(parameters.selector);
    case 'browser_read_page':      return browserReadPage(parameters.variable_name, parameters.topic);
    case 'browser_extract_results': return browserExtractResults(parameters.variable_name, parameters.count ?? 10);
    case 'browser_wait_for_element': return browserWaitForElement(parameters.selector, parameters.seconds ?? 10);
    case 'browser_get_page_state': return browserGetPageState();
    case 'browser_screenshot_analyze':
  return browserScreenshotAnalyze(
    parameters.target_description,
    parameters.action ?? 'click',
    parameters.value
  );
    case 'type_text':              return typeText(parameters.text);
    case 'create_file':            return createFile(parameters.path, parameters.content ?? '');
    case 'create_folder':          return createFolder(parameters.path);
    case 'wait':                   return wait(parameters.seconds ?? 1);
    case 'download_file':          return downloadFileCapability(parameters.url, parameters.destination ?? parameters.path);
    case 'app_find_window':        return appFindWindowStep(parameters.app_name, parameters.seconds);
    case 'app_focus_window':       return appFocusWindowStep(parameters.app_name);
    case 'app_click':              return appClickStep(parameters.app_name, parameters.element_name);
    case 'app_type':               return appTypeStep(parameters.app_name, parameters.element_name, parameters.text);
    case 'app_screenshot':         return appScreenshotStep(parameters.app_name);
    case 'app_verify':             return appVerifyStep(parameters.app_name, parameters.text);
    default: throw new Error(`Unknown capability: ${capability}`);
  }
}

// ─── FIX 1A + 1D: Browser Open with smart wait + click verification ───────────

async function browserOpen(url: string | undefined): Promise<StepResult> {
  if (!url) throw new Error('url is required');

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
    url = (!url.includes('.') || url.includes(' '))
      ? `https://www.bing.com/search?q=${encodeURIComponent(url)}`
      : `https://${url}`;
  }

  const page = await ensurePlaywright();

  // FIX 1A: Use smart wait strategy instead of always domcontentloaded
  const { waitUntil, extraWait } = getWaitStrategy(url);
  console.log(`[browserOpen] waitUntil="${waitUntil}" extraWait=${extraWait}ms for ${url}`);

  await page.goto(url, { waitUntil, timeout: 35_000 });
  await sleep(extraWait);
  await handleBotDetection(page);

  const title = await page.title().catch(() => url!);
  console.log(`[Browser] Loaded: "${title}" — ${url}`);
  return { success: true, url, title, message: `Opened ${url} — "${title}"` };
}

// ─── FIX 1D: Post-click verification ─────────────────────────────────────────
//
// WHY: After clicking, NEXUS used to sleep 1200ms and move on blindly.
// A failed click (due to overlay, timing, stale element) was invisible.
//
// FIX: After every click, check:
//   1. Did the URL change? (navigation click worked)
//   2. Did visible content change? (modal opened, element appeared)
//   3. If neither changed AND the selector looked like a link → warn
//
// This uses a lightweight DOM snapshot (text length + link count) instead of
// full screenshot diff — fast and doesn't need vision API.

async function getPageSnapshot(page: import('playwright').Page): Promise<{ url: string; textLen: number; linkCount: number }> {
  try {
    const snap = await page.evaluate(() => ({
      url:       window.location.href,
      textLen:   (document.body.textContent ?? '').length,
      linkCount: document.querySelectorAll('a[href]').length,
    }));
    return snap;
  } catch {
    return { url: page.url(), textLen: 0, linkCount: 0 };
  }
}

async function verifyClickEffect(
  page: import('playwright').Page,
  snapshotBefore: { url: string; textLen: number; linkCount: number }
): Promise<{ changed: boolean; newUrl: string; newTitle: string; changeType: string }> {
  await sleep(1500);
  const after = await getPageSnapshot(page);
  const newTitle = await page.title().catch(() => '');

  const urlChanged     = after.url !== snapshotBefore.url;
  const contentChanged = Math.abs(after.textLen - snapshotBefore.textLen) > 200;
  const changed = urlChanged || contentChanged;

  let changeType = 'none';
  if (urlChanged)     changeType = 'navigation';
  else if (contentChanged) changeType = 'content-update';

  return { changed, newUrl: after.url, newTitle, changeType };
}

async function browserFill(selector: string | undefined, value: string | undefined): Promise<StepResult> {
  if (!selector) throw new Error('selector is required');
  if (value === undefined) throw new Error('value is required');
  const page = await ensurePlaywright();

  await sleep(300 + Math.random() * 200);

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

  await sleep(200 + Math.random() * 300);

  // FIX 1D: Snapshot before click for verification
  const snapshotBefore = await getPageSnapshot(page);

  const result = await smartFindAndAct(page, selector, 'click');

  // FIX 1D: Verify the click had an effect
  const verify = await verifyClickEffect(page, snapshotBefore);

  // Warn if URL-type selector (links) didn't cause navigation
  const isLinkSelector = selector.includes('h2') || selector.includes('href') ||
                         selector.includes('a[') || selector.includes('title');
  const warning = (!verify.changed && isLinkSelector)
    ? `Click may not have navigated — URL/content unchanged after 1.5s (changeType: ${verify.changeType})`
    : undefined;

  if (warning) {
    console.warn(`[browserClick] ⚠ ${warning}`);
  }

  const livePage = await ensurePlaywright();
  await handleBotDetection(livePage);

  return {
    success: true,
    message: `Clicked via ${result.strategy} (tier ${result.tier}) → "${verify.newTitle || verify.newUrl}"`,
    url: verify.newUrl,
    navigated: verify.changed,
    changeType: verify.changeType,
    ...(warning ? { warning } : {}),
    ...(result.warning ? { strategyWarning: result.warning } : {}),
  };
}

// ─── Article Store ────────────────────────────────────────────────────────────

const articleStore: Record<string, string> = {};

export function getArticleStore(): Record<string, string> {
  return { ...articleStore };
}

export function clearArticleStore(): void {
  Object.keys(articleStore).forEach(k => delete articleStore[k]);
}

// ─── FIX 1B: browserReadPage — honest failure ─────────────────────────────────
//
// WHY: Old code returned success: true with fallback text "Could not extract..."
// when rawText < 100 chars. create_file happily wrote this garbage into reports.
// The task was marked successful but the output was worthless.
//
// FIX: Throw a typed ContentExtractionError so the executor retries or replans.
// Also explicitly detect bot/CAPTCHA pages before attempting extraction.

export class ContentExtractionError extends Error {
  constructor(
    public readonly reason: 'bot_detection' | 'content_too_short' | 'extraction_failed',
    public readonly pageUrl: string,
    message: string
  ) {
    super(message);
    this.name = 'ContentExtractionError';
  }
}

async function browserReadPage(
  variableName: string | undefined,
  topic: string | undefined,
): Promise<StepResult> {
  const page = await ensurePlaywright();
  const url   = page.url();
  const title = await page.title().catch(() => 'Unknown');

  // FIX 1B: Detect bot/CAPTCHA page BEFORE attempting extraction
  const isBotPage = await page.evaluate(() => {
    const t = document.title.toLowerCase();
    return t.includes('just a moment') || t.includes('access denied') ||
           t.includes('are you human') || t.includes('captcha') ||
           t.includes('checking your browser');
  }).catch(() => false);

  if (isBotPage) {
    throw new ContentExtractionError(
      'bot_detection',
      url,
      `Bot detection active on ${url} — cannot extract content`
    );
  }

  // Extract main text
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

  // FIX 1B: Throw honestly instead of returning garbage content
  if (!rawText || rawText.length < 100) {
    throw new ContentExtractionError(
      'content_too_short',
      url,
      `Page content too short (${rawText.length} chars) on ${url} — ` +
      `page may not have loaded fully or requires authentication`
    );
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

// ─── FIX 1C: browserExtractResults — resolve relative URLs ───────────────────
//
// WHY: LinkedIn, Indeed, Naukri, Glassdoor all use relative paths like
// /jobs/view/12345 or /job-listing/abc. The old filter
// `if (!href.startsWith("http"))` silently dropped ALL of these.
// Result: empty results array, task fails, but returns success: true.
//
// FIX: Resolve relative URLs to absolute using window.location inside evaluate().

async function browserExtractResults(
  variableName: string | undefined,
  count: number,
): Promise<StepResult> {
  const page = await ensurePlaywright();
  const pageUrl = page.url();

  console.log(`[browserExtractResults] Scanning page: ${pageUrl}`);

  const extracted = await page.evaluate((maxCount: number) => {
    interface ResultItem {
      title: string;
      url: string;
      description: string;
      index: number;
    }

    const results: ResultItem[] = [];
    const seen = new Set<string>();

    const SKIP_PATTERNS = [
      /^(javascript:|mailto:|tel:|#)/i,
      /(login|signin|sign-in|logout|signup|register|account|privacy|terms|cookie|help|support|about|contact|adverti|careers|press)/i,
      /\.(css|js|png|jpg|jpeg|gif|svg|ico|pdf|zip|xml|json)$/i,
    ];

    const currentDomain = window.location.hostname;
    const currentOrigin = window.location.origin;
    const currentProtocol = window.location.protocol;

    // FIX 1C: Resolve any URL (relative or absolute) to an absolute URL
    function resolveUrl(href: string): string | null {
      if (!href) return null;
      if (href.startsWith('http://') || href.startsWith('https://')) return href;
      if (href.startsWith('//')) return `${currentProtocol}${href}`;
      if (href.startsWith('/')) return `${currentOrigin}${href}`;
      if (href.startsWith('javascript:') || href.startsWith('mailto:') || href.startsWith('#')) return null;
      // Relative path
      return `${currentOrigin}/${href}`;
    }

    function scoreLink(a: HTMLAnchorElement, text: string, absoluteHref: string): number {
      let score = 0;
      const rect = a.getBoundingClientRect();

      if (rect.width === 0 || rect.height === 0) return -1;
      if (rect.top < 0 || rect.top > window.innerHeight * 3) return -1;

      if (text.length > 20) score += 3;
      if (text.length > 50) score += 2;
      if (rect.top > 100) score += 1;
      if (absoluteHref.includes('/jobs/') || absoluteHref.includes('/job/')) score += 5;
      if (absoluteHref.includes('/article') || absoluteHref.includes('/post') || absoluteHref.includes('/news')) score += 4;
      if (absoluteHref.includes('/product') || absoluteHref.includes('/item') || absoluteHref.includes('/dp/')) score += 4;
      if (absoluteHref.includes('/profile') || absoluteHref.includes('/company')) score += 3;
      if (absoluteHref.includes(currentDomain) && absoluteHref.split('/').length < 5) score -= 2;
      if (text.length < 10) score -= 2;

      return score;
    }

    function getNearbyText(el: Element): string {
      const parent = el.closest('li, article, [class*="card"], [class*="item"], [class*="result"], [class*="job"], [class*="product"]');
      if (parent) {
        return (parent.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 200);
      }
      return '';
    }

    const anchors = Array.from(document.querySelectorAll('a[href]')) as HTMLAnchorElement[];

    for (const a of anchors) {
      const rawHref = a.getAttribute('href') ?? '';  // Use getAttribute for raw value
      const text = (a.textContent ?? '').replace(/\s+/g, ' ').trim();

      if (!rawHref || !text) continue;

      // FIX 1C: Resolve to absolute URL before any checks
      const absoluteHref = resolveUrl(rawHref);
      if (!absoluteHref) continue;

      if (seen.has(absoluteHref)) continue;
      if (SKIP_PATTERNS.some(p => p.test(rawHref) || p.test(text))) continue;

      const score = scoreLink(a, text, absoluteHref);
      if (score < 0) continue;

      seen.add(absoluteHref);
      results.push({
        title: text.slice(0, 150),
        url: absoluteHref,  // Always absolute now
        description: getNearbyText(a),
        index: results.length,
      });
    }

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

  // ── Unwrap Bing redirect URLs (bing.com/ck/a) to real destination URLs ──
  // Bing wraps every result in a tracking redirect. The &u= param holds
  // the real URL as base64. Decode it so we navigate to the actual article.
  function unwrapBingUrl(url: string): string {
    if (!url.includes('bing.com/ck/a')) return url;
    try {
      const match = url.match(/[?&]u=a1([A-Za-z0-9+\/=_-]+)/);
      if (match) {
        const b64 = match[1].replace(/-/g, '+').replace(/_/g, '/');
        const decoded = Buffer.from(b64, 'base64').toString('utf-8');
        if (decoded.startsWith('http')) {
          console.log(`[browserExtractResults] Unwrapped Bing URL → ${decoded.slice(0, 80)}`);
          return decoded;
        }
      }
    } catch { /* fall through */ }
    return url;
  }

  // Unwrap bing.com/news/topicview → convert to a real search URL
  function unwrapBingTopicView(url: string): string {
    if (!url.includes('bing.com/news/topicview')) return url;
    try {
      const u = new URL(url);
      const q = u.searchParams.get('q');
      if (q) return `https://www.bing.com/search?q=${encodeURIComponent(q)}`;
    } catch { /* fall through */ }
    return url;
  }

  // Apply URL unwrapping + clean up domain-path titles from Bing
  for (const r of extracted) {
    r.url = unwrapBingUrl(r.url);
    r.url = unwrapBingTopicView(r.url);
    // Bing often uses "scmp.comhttps://..." as link text — replace with description
    if (/^[\w.-]+\.(com|net|org|io|co)\b/i.test(r.title)) {
      r.title = r.description.slice(0, 100).trim() || r.title;
    }
  }

  extracted.forEach((r, i) => {
    console.log(`  [${i}] "${r.title.slice(0, 60)}" → ${r.url.slice(0, 80)}`);
  });

  const json = JSON.stringify(extracted, null, 2);
  if (variableName) {
    articleStore[variableName] = json;
    extracted.forEach((r, i) => {
      articleStore[`${variableName}_${i}_url`]   = r.url;
      articleStore[`${variableName}_${i}_title`] = r.title;
      articleStore[`${variableName}_${i}_desc`]  = r.description;
    });
    console.log(`[browserExtractResults] Stored ${extracted.length} results in articleStore["${variableName}"]`);
  }
  const summary = extracted.map((r, i) =>
    `${i + 1}. ${r.title}\n   ${r.url}`
  ).join('\n\n');

  return {
    success: true,
    message: `Extracted ${extracted.length} results from ${pageUrl}`,
    summary,
  };
}

// ─── New Capability: browser_wait_for_element ─────────────────────────────────
//
// Smarter than "wait N seconds" — waits for a specific element to appear.
// Essential for SPAs: wait for the real content to render before extracting.

async function browserWaitForElement(
  selector: string | undefined,
  timeoutSeconds: number
): Promise<StepResult> {
  if (!selector) throw new Error('selector required for browser_wait_for_element');

  const page = await ensurePlaywright();

  try {
    await page.waitForSelector(selector, {
      state: 'visible',
      timeout: timeoutSeconds * 1000,
    });
    return { success: true, message: `Element "${selector}" appeared on ${page.url()}` };
  } catch {
    throw new Error(
      `Element "${selector}" did not appear within ${timeoutSeconds}s on ${page.url()}`
    );
  }
}

// ─── New Capability: browser_get_page_state ───────────────────────────────────
//
// Lightweight "perception" step. Use after browser_open to verify the real
// page loaded (not a 404, not a CAPTCHA, not an empty shell).
// Prevents garbage from entering articleStore.

async function browserGetPageState(): Promise<StepResult> {
  const page = await ensurePlaywright();

  const state = await page.evaluate(() => {
    const botSignals    = ['just a moment', 'access denied', 'captcha', 'are you human'];
    const errorPatterns = ['404', 'not found', 'error', 'page not exist', 'page not found'];

    const title    = document.title.toLowerCase();
    const isBot    = botSignals.some(s => title.includes(s));
    const isError  = errorPatterns.some(p => title.includes(p));
    const bodyText = (document.body.textContent ?? '').trim();

    return {
      title:      document.title,
      isBot,
      isError,
      hasContent: bodyText.length > 200,
      forms:      document.querySelectorAll('form').length,
      links:      document.querySelectorAll('a[href]').length,
      url:        window.location.href,
    };
  });

  // Hard fail on bot or error page — triggers retry/replan
  if (state.isBot) {
    throw new BotDetectionError(state.url, `Bot detection active on ${state.url}`);
  }
  if (state.isError) {
    throw new Error(`Error page detected: "${state.title}" on ${state.url}`);
  }

  return {
    success: true,
    message: `Page state OK: "${state.title}" (links: ${state.links}, forms: ${state.forms})`,
    ...state,
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

  const home = os.homedir().replace(/\\/g, '/');
  const expanded = process.platform === 'win32'
    ? command.replace(/(^|\s)~(?=[\\/])/g, (_m, pre) => {
        const p = home + '/';
        return pre + (home.includes(' ') ? `"${p}` : p);
      }).replace(/(\.(?:py|js|sh|bat|ps1))(?=\s|$)/g,
        home.includes(' ') ? '$1"' : '$1')
    : command.replace(/(^|\s)~(?=[\\/]|$)/g, `$1${home}/`);

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

  const finalCommand = expanded;


  try {
    const { stdout, stderr } = await execAsync(finalCommand, { timeout: 60_000, maxBuffer: 10 * 1024 * 1024 });
    // Log stdout so Python print() output is visible
    if (stdout.trim()) console.log(`[Shell] stdout: ${stdout.trim().slice(0, 500)}`);
    if (stderr.trim()) console.warn(`[Shell] stderr: ${stderr.trim().slice(0, 500)}`);
    return { success: true, stdout: stdout.trim().slice(0, 5000), stderr: stderr.trim().slice(0, 1000) };
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string; message: string; code?: number };
    const stdoutStr = (e.stdout ?? '').trim();
    const stderrStr = (e.stderr ?? '').trim();

    // Always log the actual error output
    if (stdoutStr) console.log(`[Shell] stdout: ${stdoutStr.slice(0, 500)}`);
    if (stderrStr) console.error(`[Shell] ✗ stderr: ${stderrStr.slice(0, 500)}`);

    // Python/script errors: stderr contains the traceback — surface it as a real failure
    if (stderrStr && (stderrStr.includes('Traceback') || stderrStr.includes('Error:') || stderrStr.includes('error:'))) {
      throw new Error(`Script failed:\n${stderrStr.slice(0, 800)}`);
    }

    // Non-zero exit with output but no clear error — warn but don't fail
    if (stdoutStr || stderrStr) {
      return { success: true, stdout: stdoutStr, stderr: stderrStr, warning: 'Non-zero exit' };
    }

    throw new Error(`Shell failed: ${e.message.slice(0, 300)}`);
  }
}

// ─── File Operations ──────────────────────────────────────────────────────────

async function createFile(filePath: string | undefined, content: string): Promise<StepResult> {
  if (!filePath) throw new Error('path is required');
  const p = resolvePath(filePath);

  let resolvedContent = content;
  const templateVars = content.match(/\{\{([^}]+)\}\}/g);
  if (templateVars) {
    const store = articleStore;
    for (const tpl of templateVars) {
      const key = tpl.slice(2, -2).trim();
if (store[key]) {
        let val = store[key];
        // Escape for Python string literals: apostrophes/quotes/newlines break Python syntax
        if ((filePath ?? '').endsWith('.py')) {
          val = val
            .replace(/\\/g, '\\\\')
            .replace(/'/g, "\\'")
            .replace(/"/g, '\\"')
            .replace(/\r?\n/g, '\\n')
            .replace(/\t/g, '\\t');
        }
        resolvedContent = resolvedContent.split(tpl).join(val);
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

// ───  browser_screenshot_analyze — vision-based element selection
//
// Used by the planner as an EXPLICIT step when a task is known to involve
// a visually complex or non-standard UI element.
//
// This is separate from Tier 5 in Browserengine.ts:
//   - Tier 5 = automatic silent fallback inside smartFindAndAct
//   - browser_screenshot_analyze = a deliberate planner step the AI can choose
//
// Uses Google Gemini Flash (FREE — 1500 req/day at aistudio.google.com).
// Falls back gracefully if GEMINI_API_KEY is not set.

async function browserScreenshotAnalyze(
  targetDescription: string | undefined,
  action: 'click' | 'fill' = 'click',
  value?: string
): Promise<StepResult> {
  if (!targetDescription) {
    throw new Error('browser_screenshot_analyze requires target_description parameter');
  }

  const page = await ensurePlaywright();

  // Take a viewport screenshot (not full page — keeps it fast and under API limits)
  const screenshot = await page.screenshot({ type: 'jpeg', quality: 80, fullPage: false });
  const base64 = screenshot.toString('base64');

  const geminiKey = process.env.GEMINI_API_KEY;
  if (!geminiKey || geminiKey === 'your_gemini_api_key_here') {
    // Graceful fallback: try smartFindAndAct directly without vision
    console.warn('[Vision] GEMINI_API_KEY not set — falling back to smartFindAndAct directly');
    console.warn('[Vision] Get a free key at https://aistudio.google.com → Get API Key');
    const result = await smartFindAndAct(page, targetDescription, action, value);
    return {
      success: true,
      message: `Action performed (no vision key — used DOM fallback): "${targetDescription}"`,
      strategy: result.strategy,
    };
  }

  const geminiModel = process.env.GEMINI_VISION_MODEL ?? 'gemini-1.5-flash';
  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${geminiKey}`;

  const prompt = [
    `I need to ${action === 'fill' ? `fill "${value}" into` : 'click'} the element: "${targetDescription}"`,
    ``,
    `Look at this screenshot of a web page and find the CSS selector for that element.`,
    ``,
    `Rules:`,
    `- Prefer id, name, aria-label, placeholder, or data-testid attributes`,
    `- If unavailable, use a short stable class-based selector`,
    `- For buttons/links, text content is acceptable`,
    `- Reply ONLY with a JSON object, no markdown, no explanation`,
    ``,
    `{ "found": true, "selector": "CSS selector", "fallbackText": "visible text if selector fragile", "confidence": 0-100 }`,
    `or if not visible: { "found": false, "reason": "why" }`,
  ].join('\n');

  let geminiSelector: string | null = null;
  let fallbackText: string | null = null;

  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { inline_data: { mime_type: 'image/jpeg', data: base64 } },
            { text: prompt },
          ],
        }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 200 },
      }),
    });

    if (!response.ok) {
      throw new Error(`Gemini API ${response.status}: ${await response.text()}`);
    }

    const data = await response.json() as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };

    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    const cleaned = rawText.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim();
    const parsed = JSON.parse(cleaned);

    if (parsed.found && parsed.selector) {
      geminiSelector = parsed.selector;
      fallbackText = parsed.fallbackText ?? null;
      console.log(`[Vision] Gemini returned selector: "${geminiSelector}" (confidence: ${parsed.confidence}%)`);
    } else {
      console.warn(`[Vision] Gemini could not find element: ${parsed.reason}`);
    }
  } catch (e) {
    console.warn('[Vision] Gemini call failed:', (e as Error).message);
  }

  // Try Gemini selector first, then fallback text, then original description
  const selectorToTry = geminiSelector ?? fallbackText ?? targetDescription;

  const result = await smartFindAndAct(page, selectorToTry, action, value);

  return {
    success: true,
    message: `Vision fallback succeeded: "${selectorToTry}"`,
    strategy: geminiSelector ? `vision:${selectorToTry}` : `vision-fallback:${selectorToTry}`,
  };
}