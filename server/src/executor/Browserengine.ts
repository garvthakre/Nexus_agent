/**
 * browserEngine.ts  — NEXUS Smart Browser Engine v3
 * ─────────────────────────────────────────────────────────────────────────────
 * Tiered fallback browser automation engine.
 *
 * TIER 0 — Direct selector (fast path, no AI)
 * TIER 1 — DOM fuzzy scan (zero cost, pure JS string matching)
 * TIER 2 — Accessibility tree → Groq (free, structured AI reasoning)
 * TIER 3 — Page HTML chunk → Groq re-plan (free, adaptive)
 * TIER 4 — URL param fallback (for supported sites like Amazon, YouTube)
 *
 * v3 fixes:
 *  - Google Search: clicks anchor wrapping h3, not the hidden h3 itself
 *  - nth-result selectors: uses :nth-of-type and index-based JS evaluation
 *  - LinkedIn: proper selectors for job cards
 *  - News articles: extracts real hrefs from search results and navigates directly
 *  - Spotify web: handles search input with multiple fallback selectors
 *  - Page crash recovery: re-creates page on "Target closed" errors
 * ─────────────────────────────────────────────────────────────────────────────
 */

import OpenAI from 'openai';

// ─── Types ────────────────────────────────────────────────────────────────────

export type ElementAction = 'fill' | 'click';

export interface ActionResult {
  success: boolean;
  strategy: string;
  tier: number;
  warning?: string;
}

interface InteractiveElement {
  tag: string;
  id?: string;
  name?: string;
  type?: string;
  text?: string;
  ariaLabel?: string;
  placeholder?: string;
  href?: string;
  role?: string;
  classes?: string;
  visible: boolean;
  selector: string;
}

// ─── Groq Client ─────────────────────────────────────────────────────────────

function getGroqClient(): OpenAI {
  return new OpenAI({
    apiKey: process.env.GROQ_API_KEY ?? '',
    baseURL: 'https://api.groq.com/openai/v1',
  });
}

async function askGroq(systemPrompt: string, userMessage: string, maxTokens = 400): Promise<string> {
  const client = getGroqClient();
  const response = await client.chat.completions.create({
    model: process.env.GROQ_MODEL ?? 'llama-3.3-70b-versatile',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user',   content: userMessage  },
    ],
    temperature: 0.1,
    max_tokens: maxTokens,
    response_format: { type: 'json_object' },
  });
  return response.choices[0].message.content ?? '{}';
}

// ─── Site-Specific Handlers ──────────────────────────────────────────────────
// These run BEFORE the generic tier system for known sites/patterns.

/**
 * Google Search: click the Nth result link.
 * The h3 elements are hidden; the clickable element is the <a> wrapping them.
 * hint examples: "h3", "h3:nth-child(2)", "h3:nth-child(3)"
 */
async function handleGoogleSearchClick(
  page: import('playwright').Page,
  hint: string,
): Promise<ActionResult | null> {
  const url = page.url();
  if (!url.includes('google.com/search') && !url.includes('google.co')) return null;
  if (!hint.includes('h3')) return null;

  // Determine which result index to click (0-based)
  let index = 0;
  const nthMatch = hint.match(/nth-child\((\d+)\)/);
  if (nthMatch) index = parseInt(nthMatch[1], 10) - 1;

  try {
    // Strategy A: Extract all result URLs from the DOM and navigate directly
    const resultUrls = await page.evaluate(() => {
      // Google result links wrap an h3 inside an <a>
      const anchors = Array.from(document.querySelectorAll('a:has(h3)')) as HTMLAnchorElement[];
      return anchors
        .map(a => a.href)
        .filter(href => href && !href.includes('google.com') && href.startsWith('http'));
    });

    if (resultUrls.length > index) {
      const targetUrl = resultUrls[index];
      console.log(`[SiteHandler] Google result ${index}: navigating to ${targetUrl}`);
      await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await sleep(1500);
      return { success: true, strategy: `google-direct-nav:${targetUrl}`, tier: 0 };
    }

    // Strategy B: JavaScript click on the Nth anchor-wrapping-h3
    const clicked = await page.evaluate((idx: number) => {
      const anchors = Array.from(document.querySelectorAll('a:has(h3)')) as HTMLAnchorElement[];
      const filtered = anchors.filter(a => {
        const href = a.href;
        return href && !href.includes('google.com') && href.startsWith('http');
      });
      if (filtered[idx]) {
        filtered[idx].click();
        return true;
      }
      return false;
    }, index);

    if (clicked) {
      await page.waitForLoadState('domcontentloaded', { timeout: 15000 }).catch(() => {});
      await sleep(1500);
      return { success: true, strategy: `google-js-click:index-${index}`, tier: 0 };
    }

    // Strategy C: Use Playwright locator on visible links near h3 headings
    const allLinks = page.locator('a:has(h3)');
    const count = await allLinks.count();
    // Filter to non-Google links
    for (let i = 0, found = 0; i < count && found <= index; i++) {
      const href = await allLinks.nth(i).getAttribute('href').catch(() => '');
      if (!href || href.includes('google.com') || !href.startsWith('http')) continue;
      if (found === index) {
        await allLinks.nth(i).click({ timeout: 5000 });
        await page.waitForLoadState('domcontentloaded', { timeout: 15000 }).catch(() => {});
        await sleep(1500);
        return { success: true, strategy: `google-locator:index-${index}`, tier: 0 };
      }
      found++;
    }
  } catch (e) {
    console.warn('[SiteHandler] Google click failed:', (e as Error).message);
  }

  return null;
}

/**
 * LinkedIn job search: robust selectors for job cards.
 */
async function handleLinkedInClick(
  page: import('playwright').Page,
  hint: string,
): Promise<ActionResult | null> {
  const url = page.url();
  if (!url.includes('linkedin.com')) return null;

  // Determine index
  let index = 0;
  const nthMatch = hint.match(/nth-child\((\d+)\)/);
  if (nthMatch) index = Math.max(0, parseInt(nthMatch[1], 10) - 1);

  const LINKEDIN_SELECTORS = [
    '.jobs-search-results__list-item',
    '.job-card-container',
    'li.scaffold-layout__list-item',
    '[data-occludable-job-id]',
    '.job-card-list__title',
  ];

  for (const sel of LINKEDIN_SELECTORS) {
    try {
      const items = page.locator(sel);
      const count = await items.count();
      if (count > index) {
        await items.nth(index).click({ timeout: 5000 });
        await sleep(1500);
        return { success: true, strategy: `linkedin:${sel}[${index}]`, tier: 0 };
      }
    } catch { /* try next */ }
  }

  return null;
}

/**
 * Bing Search / Bing News: click the Nth result by extracting URLs via JS
 * and navigating directly — bypasses selector fragility entirely.
 *
 * Handles both:
 *   bing.com/search   — regular web results
 *   bing.com/news     — news results (different DOM than web results)
 *
 * hint examples:
 *   "li.b_algo:nth-of-type(1) h2 a"   → index 0
 *   "li.b_algo:nth-of-type(2) h2 a"   → index 1
 *   "li.b_algo:nth-of-type(3) h2 a"   → index 2
 */
async function handleBingClick(
  page: import('playwright').Page,
  hint: string,
): Promise<ActionResult | null> {
  const url = page.url();
  if (!url.includes('bing.com')) return null;

  // Determine which result index (0-based) from the hint
  let index = 0;
  const nthMatch = hint.match(/nth-of-type\((\d+)\)/);
  if (nthMatch) index = Math.max(0, parseInt(nthMatch[1], 10) - 1);

  try {
    // ── Strategy A: JS URL extraction + direct navigation ────────────────────
    // Works regardless of DOM structure / cookie banners / rendering delays.
    const resultUrls = await page.evaluate(() => {
      const isNews = window.location.href.includes('/news/');

      // Bing News DOM: cards with data-url attribute or <a class="title">
      if (isNews) {
        const newsLinks: string[] = [];

        // Primary: news card anchors with direct external href
        document.querySelectorAll('a.title, a[class*="title"], .news-card a').forEach((el) => {
          const a = el as HTMLAnchorElement;
          if (a.href && !a.href.includes('bing.com') && a.href.startsWith('http')) {
            newsLinks.push(a.href);
          }
        });

        // Fallback: any <a> inside a news card container
        if (newsLinks.length === 0) {
          document.querySelectorAll('.news-card, [class*="newscard"], [class*="NewsCard"]').forEach((card) => {
            const a = card.querySelector('a[href]') as HTMLAnchorElement | null;
            if (a?.href && !a.href.includes('bing.com') && a.href.startsWith('http')) {
              newsLinks.push(a.href);
            }
          });
        }

        return newsLinks;
      }

      // Bing Web Search DOM: li.b_algo contains the result
      const webLinks: string[] = [];

      // Primary: standard result structure
      document.querySelectorAll('li.b_algo h2 a, li.b_algo .b_title a').forEach((el) => {
        const a = el as HTMLAnchorElement;
        if (a.href && !a.href.includes('bing.com') && a.href.startsWith('http')) {
          webLinks.push(a.href);
        }
      });

      // Fallback: any result-looking anchor with substantial text
      if (webLinks.length === 0) {
        document.querySelectorAll('li.b_algo a[href]').forEach((el) => {
          const a = el as HTMLAnchorElement;
          if (a.href && !a.href.includes('bing.com') && a.href.startsWith('http') &&
              (a.textContent ?? '').trim().length > 15) {
            webLinks.push(a.href);
          }
        });
      }

      return webLinks;
    });

    console.log(`[SiteHandler] Bing: found ${resultUrls.length} result URLs, targeting index ${index}`);

    if (resultUrls.length > index) {
      const targetUrl = resultUrls[index];
      console.log(`[SiteHandler] Bing result ${index}: navigating to ${targetUrl}`);
      await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await sleep(1500);
      return { success: true, strategy: `bing-direct-nav:${targetUrl}`, tier: 0 };
    }

    // ── Strategy B: Playwright locator scan with multiple selector candidates ─
    const BING_SELECTORS = [
      'li.b_algo h2 a',
      'li.b_algo .b_title a',
      'li.b_algo a[href]:not([href*="bing.com"])',
      '.news-card a.title',
      '.news-card a[href]:not([href*="bing.com"])',
      'a.title[href]:not([href*="bing.com"])',
      'h2 a[href]:not([href*="bing.com"])',
    ];

    for (const sel of BING_SELECTORS) {
      try {
        const locs = page.locator(sel);
        const count = await locs.count();
        if (count > index) {
          const href = await locs.nth(index).getAttribute('href');
          if (href && !href.includes('bing.com')) {
            console.log(`[SiteHandler] Bing locator "${sel}" index ${index}: ${href}`);
            if (href.startsWith('http')) {
              await page.goto(href, { waitUntil: 'domcontentloaded', timeout: 30_000 });
            } else {
              await locs.nth(index).click({ timeout: 5000 });
              await page.waitForLoadState('domcontentloaded', { timeout: 15000 }).catch(() => {});
            }
            await sleep(1500);
            return { success: true, strategy: `bing-locator:${sel}[${index}]`, tier: 0 };
          }
        }
      } catch { /* try next */ }
    }

    // ── Strategy C: JS click on Nth external link ─────────────────────────────
    const clicked = await page.evaluate((idx: number) => {
      const all = Array.from(document.querySelectorAll('a[href]')) as HTMLAnchorElement[];
      const external = all.filter(a => {
        const rect = a.getBoundingClientRect();
        return a.href.startsWith('http') &&
               !a.href.includes('bing.com') &&
               (a.textContent ?? '').trim().length > 15 &&
               rect.width > 0 && rect.height > 0;
      });
      if (external[idx]) { external[idx].click(); return true; }
      return false;
    }, index);

    if (clicked) {
      await page.waitForLoadState('domcontentloaded', { timeout: 15000 }).catch(() => {});
      await sleep(1500);
      return { success: true, strategy: `bing-js-click:index-${index}`, tier: 0 };
    }

  } catch (e) {
    console.warn('[SiteHandler] Bing click failed:', (e as Error).message);
  }

  return null;
}

/**
 * Extract article URLs from Google News/search and open them in sequence.
 * Used for "open top 3 articles" type tasks.
 */
export async function extractAndOpenGoogleResults(
  page: import('playwright').Page,
  count: number = 3,
): Promise<string[]> {
  const urls = await page.evaluate((maxCount: number) => {
    const anchors = Array.from(document.querySelectorAll('a:has(h3)')) as HTMLAnchorElement[];
    return anchors
      .map(a => a.href)
      .filter(href => href && !href.includes('google.com') && href.startsWith('http'))
      .slice(0, maxCount);
  }, count);
  return urls;
}

// ─── DOM Scanner ──────────────────────────────────────────────────────────────

async function scanInteractiveElements(
  page: import('playwright').Page,
): Promise<InteractiveElement[]> {
  return page.evaluate(() => {
    const TAGS = [
      'button', 'a', 'input', 'select', 'textarea',
      '[role="button"]', '[role="link"]', '[role="menuitem"]',
      '[role="option"]', '[role="tab"]', '[role="searchbox"]',
    ];
    const elements: InteractiveElement[] = [];
    const seen = new Set<Element>();

    for (const tag of TAGS) {
      for (const el of Array.from(document.querySelectorAll(tag))) {
        if (seen.has(el)) continue;
        seen.add(el);

        const rect = el.getBoundingClientRect();
        const visible = rect.width > 0 && rect.height > 0 && rect.top >= 0 && rect.top < window.innerHeight * 2;

        let selector = el.tagName.toLowerCase();
        const id = el.getAttribute('id');
        const name = el.getAttribute('name');
        if (id) selector = `#${id}`;
        else if (name) selector = `${selector}[name="${name}"]`;

        const text = (el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 80);
        const ariaLabel = el.getAttribute('aria-label') ?? undefined;
        const placeholder = el.getAttribute('placeholder') ?? undefined;
        const href = el.getAttribute('href') ?? undefined;
        const role = el.getAttribute('role') ?? el.tagName.toLowerCase();
        const classes = el.className?.toString().trim().slice(0, 60) ?? undefined;
        const type = el.getAttribute('type') ?? undefined;

        elements.push({
          tag: el.tagName.toLowerCase(),
          id: id ?? undefined,
          name: name ?? undefined,
          type,
          text: text || undefined,
          ariaLabel,
          placeholder,
          href,
          role,
          classes,
          visible,
          selector,
        });
      }
    }

    return elements.filter(e => e.visible).slice(0, 120);
  });
}

// ─── Accessibility Tree Snapshot ──────────────────────────────────────────────

async function getAccessibilitySnapshot(page: import('playwright').Page): Promise<string> {
  try {
    const snapshot = await page.accessibility.snapshot({ interestingOnly: true });
    if (!snapshot) return '';
    return JSON.stringify(snapshot, null, 2).slice(0, 3000);
  } catch {
    return '';
  }
}

// ─── HTML Chunk Extractor ─────────────────────────────────────────────────────

async function getPageContext(page: import('playwright').Page): Promise<{
  url: string;
  title: string;
  html: string;
}> {
  const url   = page.url();
  const title = await page.title().catch(() => '');
  const html  = await page.evaluate(() => {
    const main = document.querySelector('main, #main, #content, [role="main"], body');
    return (main?.innerHTML ?? document.body.innerHTML).slice(0, 4000);
  }).catch(() => '');
  return { url, title, html };
}

// ─── URL Param Rewriter ───────────────────────────────────────────────────────

interface UrlRewriteResult {
  possible: boolean;
  newUrl?: string;
  reason?: string;
}

async function tryUrlParamFallback(
  page: import('playwright').Page,
  intent: string,
  originalHint: string,
): Promise<UrlRewriteResult> {
  const url = page.url();

  if (url.includes('amazon.')) {
    const currentUrl = new URL(url);
    const k = currentUrl.searchParams.get('k') ?? '';

    const priceMatch = intent.match(/under\s*[₹$£€]?\s*(\d+)/i);
    if (priceMatch) {
      const price = parseInt(priceMatch[1], 10);
      const isIndia = url.includes('amazon.in');
      const maxPricePaise = isIndia ? price * 100 : price * 100;
      const newUrl = `${currentUrl.origin}/s?k=${encodeURIComponent(k)}&rh=p_36%3A-${maxPricePaise}&s=review-rank`;
      return { possible: true, newUrl, reason: `Encoded price filter in URL (max ${price})` };
    }

    if (intent.includes('first') || intent.includes('result') || intent.includes('click product')) {
      const firstProductUrl = await page.evaluate(() => {
        const links = Array.from(document.querySelectorAll('a[href*="/dp/"]')) as HTMLAnchorElement[];
        const visible = links.filter(el => {
          const rect = el.getBoundingClientRect();
          return rect.width > 0 && rect.top > 0;
        });
        return visible[0]?.href ?? null;
      });
      if (firstProductUrl) {
        return { possible: true, newUrl: firstProductUrl, reason: 'Navigating directly to first product URL' };
      }
    }
  }

  if (url.includes('youtube.com') && intent.includes('search')) {
    const queryMatch = intent.match(/search["\s]+(?:for\s+)?["']?([^"']+)["']?/i);
    if (queryMatch) {
      const newUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(queryMatch[1])}`;
      return { possible: true, newUrl, reason: 'Encoded YouTube search in URL' };
    }
  }

  return { possible: false };
}

// ─── Fuzzy Text Match ─────────────────────────────────────────────────────────

const INTENT_KEYWORDS: Record<string, string[]> = {
  'add to cart':  ['add to cart', 'add to bag', 'add to basket', 'buy now', 'add item'],
  'search':       ['search', 'find', 'go', 'submit', 'look up'],
  'checkout':     ['checkout', 'proceed to checkout', 'buy now', 'place order', 'continue'],
  'next':         ['next', 'continue', 'proceed', 'forward'],
  'submit':       ['submit', 'send', 'go', 'ok', 'confirm'],
  'sign in':      ['sign in', 'log in', 'login', 'continue'],
  'close':        ['close', 'dismiss', 'cancel', 'x'],
  'first result': ['', ' '],
};

function fuzzyScore(hint: string, element: InteractiveElement): number {
  const hintLower = hint.toLowerCase();
  let score = 0;

  let intentKeywords: string[] = [];
  for (const [intent, keywords] of Object.entries(INTENT_KEYWORDS)) {
    if (hintLower.includes(intent) || intent.includes(hintLower)) {
      intentKeywords = keywords;
      break;
    }
  }
  const hintWords = hintLower.split(/[\s\-_#./[\]>]+/).filter(w => w.length > 2);
  const allKeywords = [...new Set([...intentKeywords, ...hintWords])];

  const fields = [
    element.text?.toLowerCase() ?? '',
    element.ariaLabel?.toLowerCase() ?? '',
    element.placeholder?.toLowerCase() ?? '',
    element.id?.toLowerCase() ?? '',
    element.name?.toLowerCase() ?? '',
    element.classes?.toLowerCase() ?? '',
  ];

  for (const keyword of allKeywords) {
    if (!keyword) continue;
    for (const field of fields) {
      if (field.includes(keyword)) score += 2;
      if (field === keyword) score += 3;
    }
  }

  return score;
}

// ─── Tier 1: DOM Fuzzy Scan ───────────────────────────────────────────────────

async function tier1FuzzyDomScan(
  page: import('playwright').Page,
  hint: string,
  action: ElementAction,
  value?: string,
): Promise<ActionResult | null> {
  console.log('[Tier 1] DOM fuzzy scan starting...');

  const elements = await scanInteractiveElements(page);
  if (!elements.length) return null;

  const scored = elements
    .map(el => ({ el, score: fuzzyScore(hint, el) }))
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score);

  if (!scored.length) {
    console.log('[Tier 1] No fuzzy matches found');
    return null;
  }

  const best = scored[0];
  console.log(`[Tier 1] Best match score=${best.score} selector="${best.el.selector}" text="${best.el.text?.slice(0, 40)}"`);

  if (best.score < 2) {
    console.log('[Tier 1] Score too low, skipping');
    return null;
  }

  try {
    const loc = page.locator(best.el.selector).first();
    await loc.waitFor({ state: 'visible', timeout: 3000 });

    if (action === 'fill' && value !== undefined) {
      await loc.click({ timeout: 2000 });
      await loc.fill(value, { timeout: 3000 });
    } else {
      await loc.click({ timeout: 2000 });
    }

    console.log(`[Tier 1] ✓ Success via fuzzy match: "${best.el.selector}"`);
    return { success: true, strategy: `fuzzy:${best.el.selector}`, tier: 1 };
  } catch {
    try {
      const jsClicked = await page.evaluate((sel) => {
        const el = document.querySelector(sel) as HTMLElement | null;
        if (el) { el.click(); return true; }
        return false;
      }, best.el.selector);

      if (jsClicked) {
        console.log(`[Tier 1] ✓ Success via JS click: "${best.el.selector}"`);
        return { success: true, strategy: `fuzzy-js:${best.el.selector}`, tier: 1 };
      }
    } catch { /* fall through */ }
  }

  return null;
}

// ─── Tier 2: Accessibility Tree + Groq ───────────────────────────────────────

async function tier2AccessibilityGroq(
  page: import('playwright').Page,
  hint: string,
  action: ElementAction,
  value?: string,
): Promise<ActionResult | null> {
  console.log('[Tier 2] Accessibility tree + Groq starting...');

  const a11yTree = await getAccessibilitySnapshot(page);
  if (!a11yTree) {
    console.log('[Tier 2] No accessibility tree available');
    return null;
  }

  const systemPrompt = `You are a browser automation assistant. Given an accessibility tree of a web page, identify the best element to interact with.

Output ONLY raw JSON. No markdown, no explanation.

Schema:
{
  "found": true/false,
  "elementName": "exact name/label from the tree",
  "elementRole": "button/link/textbox/etc",
  "reasoning": "why this element"
}

If no suitable element found: { "found": false, "reasoning": "why not" }`;

  const userMessage = `I need to ${action} ${value ? `"${value}" into` : ''} the element described as: "${hint}"

Accessibility tree:
${a11yTree}`;

  let raw: string;
  try {
    raw = await askGroq(systemPrompt, userMessage, 300);
  } catch (e) {
    console.warn('[Tier 2] Groq call failed:', (e as Error).message);
    return null;
  }

  let parsed: { found: boolean; elementName?: string; elementRole?: string };
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (!parsed.found || !parsed.elementName) {
    console.log('[Tier 2] Groq says element not found in a11y tree');
    return null;
  }

  console.log(`[Tier 2] Groq identified: role="${parsed.elementRole}" name="${parsed.elementName}"`);

  const strategies = [
    () => page.getByRole(parsed.elementRole as 'button', { name: parsed.elementName!, exact: false }).first(),
    () => page.getByText(parsed.elementName!, { exact: false }).first(),
    () => page.getByLabel(parsed.elementName!, { exact: false }).first(),
    () => page.getByPlaceholder(parsed.elementName!, { exact: false }).first(),
    () => page.locator(`[aria-label*="${parsed.elementName}" i]`).first(),
  ];

  for (const stratFn of strategies) {
    try {
      const loc = stratFn();
      await loc.waitFor({ state: 'visible', timeout: 2000 });

      if (action === 'fill' && value !== undefined) {
        await loc.click({ timeout: 2000 });
        await loc.fill(value, { timeout: 3000 });
      } else {
        await loc.click({ timeout: 2000 });
      }

      console.log(`[Tier 2] ✓ Success via a11y+Groq: "${parsed.elementName}"`);
      return { success: true, strategy: `a11y-groq:${parsed.elementName}`, tier: 2 };
    } catch { /* try next */ }
  }

  return null;
}

// ─── Tier 3: HTML Context + Groq Re-Plan ─────────────────────────────────────

async function tier3HtmlGroqReplan(
  page: import('playwright').Page,
  hint: string,
  action: ElementAction,
  value?: string,
): Promise<ActionResult | null> {
  console.log('[Tier 3] HTML context + Groq re-plan starting...');

  const { url, title, html } = await getPageContext(page);
  const elements = await scanInteractiveElements(page);

  const elementSummary = elements
    .slice(0, 50)
    .map((el, i) => {
      const parts = [`${i}: <${el.tag}>`];
      if (el.id)          parts.push(`id="${el.id}"`);
      if (el.text)        parts.push(`text="${el.text.slice(0, 40)}"`);
      if (el.ariaLabel)   parts.push(`aria-label="${el.ariaLabel}"`);
      if (el.placeholder) parts.push(`placeholder="${el.placeholder}"`);
      if (el.name)        parts.push(`name="${el.name}"`);
      return parts.join(' ');
    })
    .join('\n');

  const systemPrompt = `You are a browser automation expert. You are given information about a live web page and need to identify how to perform an action.

Output ONLY raw JSON. No markdown, no explanation.

Schema:
{
  "approach": "selector | text | role | keyboard | url | skip",
  "selector": "CSS selector if approach=selector",
  "text": "visible text to click if approach=text",
  "role": "ARIA role if approach=role",
  "name": "element name/label if approach=role",
  "key": "keyboard key if approach=keyboard (e.g. Enter)",
  "url": "new URL to navigate to if approach=url",
  "reasoning": "brief explanation"
}

If the action is impossible on this page, use approach=skip.`;

  const userMessage = `Page URL: ${url}
Page title: ${title}

I need to: ${action} ${value ? `"${value}" into` : ''} the element: "${hint}"

Interactive elements on page:
${elementSummary}

Relevant HTML snippet:
${html.slice(0, 2000)}`;

  let raw: string;
  try {
    raw = await askGroq(systemPrompt, userMessage, 400);
  } catch (e) {
    console.warn('[Tier 3] Groq call failed:', (e as Error).message);
    return null;
  }

  let parsed: {
    approach: string;
    selector?: string;
    text?: string;
    role?: string;
    name?: string;
    key?: string;
    url?: string;
    reasoning?: string;
  };

  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  console.log(`[Tier 3] Groq approach="${parsed.approach}" reasoning="${parsed.reasoning}"`);

  try {
    switch (parsed.approach) {
      case 'selector': {
        if (!parsed.selector) return null;
        const loc = page.locator(parsed.selector).first();
        await loc.waitFor({ state: 'visible', timeout: 3000 });
        if (action === 'fill' && value) { await loc.click(); await loc.fill(value); }
        else await loc.click({ timeout: 2000 });
        console.log(`[Tier 3] ✓ selector: "${parsed.selector}"`);
        return { success: true, strategy: `replan-selector:${parsed.selector}`, tier: 3 };
      }

      case 'text': {
        if (!parsed.text) return null;
        const loc = page.getByText(parsed.text, { exact: false }).first();
        await loc.waitFor({ state: 'visible', timeout: 3000 });
        if (action === 'fill' && value) { await loc.click(); await loc.fill(value); }
        else await loc.click({ timeout: 2000 });
        console.log(`[Tier 3] ✓ text: "${parsed.text}"`);
        return { success: true, strategy: `replan-text:${parsed.text}`, tier: 3 };
      }

      case 'role': {
        if (!parsed.name) return null;
        const loc = page.getByRole((parsed.role ?? 'button') as 'button', { name: parsed.name, exact: false }).first();
        await loc.waitFor({ state: 'visible', timeout: 3000 });
        if (action === 'fill' && value) { await loc.click(); await loc.fill(value); }
        else await loc.click({ timeout: 2000 });
        console.log(`[Tier 3] ✓ role="${parsed.role}" name="${parsed.name}"`);
        return { success: true, strategy: `replan-role:${parsed.role}[${parsed.name}]`, tier: 3 };
      }

      case 'keyboard': {
        const key = parsed.key ?? 'Enter';
        await page.keyboard.press(key);
        console.log(`[Tier 3] ✓ keyboard: "${key}"`);
        return { success: true, strategy: `replan-keyboard:${key}`, tier: 3 };
      }

      case 'url': {
        if (!parsed.url) return null;
        await page.goto(parsed.url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
        await sleep(1500);
        console.log(`[Tier 3] ✓ navigate to: "${parsed.url}"`);
        return { success: true, strategy: `replan-url:${parsed.url}`, tier: 3 };
      }

      case 'skip': {
        console.log(`[Tier 3] Groq says skip — ${parsed.reasoning}`);
        return { success: true, strategy: `skip:${parsed.reasoning}`, tier: 3, warning: `Step skipped: ${parsed.reasoning}` };
      }
    }
  } catch (e) {
    console.warn('[Tier 3] Execution of Groq plan failed:', (e as Error).message);
  }

  return null;
}

// ─── Tier 4: URL Param Fallback ───────────────────────────────────────────────

async function tier4UrlFallback(
  page: import('playwright').Page,
  hint: string,
): Promise<ActionResult | null> {
  console.log('[Tier 4] URL param fallback starting...');

  const result = await tryUrlParamFallback(page, hint, hint);

  if (!result.possible || !result.newUrl) {
    console.log('[Tier 4] No URL rewrite applicable');
    return null;
  }

  try {
    await page.goto(result.newUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await sleep(1500);
    console.log(`[Tier 4] ✓ URL rewrite: "${result.newUrl}" — ${result.reason}`);
    return { success: true, strategy: `url-rewrite:${result.newUrl}`, tier: 4, warning: result.reason };
  } catch (e) {
    console.warn('[Tier 4] URL navigation failed:', (e as Error).message);
    return null;
  }
}

// ─── Tier 0: Direct Selector ──────────────────────────────────────────────────

async function tier0Direct(
  page: import('playwright').Page,
  hint: string,
  action: ElementAction,
  value?: string,
): Promise<ActionResult | null> {

  const candidates: Array<{ label: string; loc: import('playwright').Locator }> = [];

  // Special handling for Spotify search (web player)
  if (page.url().includes('spotify.com')) {
    const spotifySelectors = [
      'input[data-testid="search-input"]',
      'input[placeholder*="Search" i]',
      'input[type="text"]',
      '[role="searchbox"]',
      'input',
    ];
    if (hint.toLowerCase().includes('search') || action === 'fill') {
      for (const sel of spotifySelectors) {
        candidates.push({ label: `spotify:${sel}`, loc: page.locator(sel).first() });
      }
    }
  }

  // Special handling for YouTube channel/video results
  if (page.url().includes('youtube.com')) {
    if (hint.includes('ytd-channel-renderer') || hint.includes('channel-name')) {
      candidates.push({ label: 'yt-channel', loc: page.locator('ytd-channel-renderer').first() });
      candidates.push({ label: 'yt-channel-link', loc: page.locator('ytd-channel-renderer a').first() });
    }
    if (hint.includes('ytd-video-renderer') || hint.includes('video-title')) {
      candidates.push({ label: 'yt-video', loc: page.locator('ytd-video-renderer a#video-title').first() });
      candidates.push({ label: 'yt-video-2', loc: page.locator('ytd-rich-item-renderer a#video-title-link').first() });
    }
  }

  // Amazon product results
  if (page.url().includes('amazon.')) {
    if (hint.includes('s-search-result') || hint.includes('h2')) {
      candidates.push({
        label: 'amazon-result',
        loc: page.locator("div[data-component-type='s-search-result'] h2 a").first(),
      });
      candidates.push({
        label: 'amazon-result-2',
        loc: page.locator("a.a-link-normal.s-no-outline").first(),
      });
    }
  }

  // If hint looks like a CSS selector, try it directly
  if (hint.match(/^[#.\[a-z]/i) && !hint.includes('h3:nth-child')) {
    candidates.push({ label: `css:${hint}`, loc: page.locator(hint).first() });
  }

  // Always try role-based and text-based
  if (!hint.includes('h3')) {
    candidates.push(
      { label: `role-btn:${hint}`,    loc: page.getByRole('button', { name: hint, exact: false }).first() },
      { label: `role-link:${hint}`,   loc: page.getByRole('link',   { name: hint, exact: false }).first() },
      { label: `aria:${hint}`,        loc: page.locator(`[aria-label*="${hint}" i]`).first() },
      { label: `placeholder:${hint}`, loc: page.getByPlaceholder(hint, { exact: false }).first() },
      { label: `text:${hint}`,        loc: page.getByText(hint, { exact: false }).first() },
    );
  }

  for (const { label, loc } of candidates) {
    try {
      await loc.waitFor({ state: 'visible', timeout: 2000 });
      if (action === 'fill' && value !== undefined) {
        await loc.click({ timeout: 1500 });
        await loc.fill(value, { timeout: 2000 });
      } else {
        await loc.click({ timeout: 1500 });
      }
      console.log(`[Tier 0] ✓ Direct match: "${label}"`);
      return { success: true, strategy: label, tier: 0 };
    } catch { /* try next */ }
  }

  return null;
}

// ─── Main Export: Smart Find & Act ───────────────────────────────────────────

export async function smartFindAndAct(
  page: import('playwright').Page,
  hint: string,
  action: ElementAction,
  value?: string,
): Promise<ActionResult> {
  console.log(`\n[SmartBrowser] ${action.toUpperCase()} — hint: "${hint.slice(0, 60)}" ${value ? `value: "${value}"` : ''}`);

  // Check if page is still alive
  try {
    await page.evaluate(() => true);
  } catch {
    throw new Error('Page context is closed — cannot perform action');
  }

  await page.waitForLoadState('domcontentloaded').catch(() => {});
  await sleep(600);

  // ── Site-specific handlers (highest priority) ────────────────────────────

  // Google Search click
  if (action === 'click') {
    const googleResult = await handleGoogleSearchClick(page, hint);
    if (googleResult) return googleResult;
  }

  // Bing Search / Bing News — must run before generic tiers
  if (action === 'click' && page.url().includes('bing.com')) {
    const bingResult = await handleBingClick(page, hint);
    if (bingResult) return bingResult;
  }

  // LinkedIn job cards
  if (action === 'click' && page.url().includes('linkedin.com')) {
    const linkedinResult = await handleLinkedInClick(page, hint);
    if (linkedinResult) return linkedinResult;
  }

  // ── Tier 0: Direct selector / common roles ───────────────────────────────
  const t0 = await tier0Direct(page, hint, action, value);
  if (t0) return t0;

  console.log('[SmartBrowser] Tier 0 failed — escalating to Tier 1');
  await sleep(300);

  // ── Tier 1: DOM fuzzy scan ────────────────────────────────────────────────
  const t1 = await tier1FuzzyDomScan(page, hint, action, value);
  if (t1) return t1;

  console.log('[SmartBrowser] Tier 1 failed — escalating to Tier 2');
  await sleep(300);

  // ── Tier 2: Accessibility tree + Groq ────────────────────────────────────
  const t2 = await tier2AccessibilityGroq(page, hint, action, value);
  if (t2) return t2;

  console.log('[SmartBrowser] Tier 2 failed — escalating to Tier 3');
  await sleep(300);

  // ── Tier 3: HTML context + Groq re-plan ──────────────────────────────────
  const t3 = await tier3HtmlGroqReplan(page, hint, action, value);
  if (t3) return t3;

  // ── Tier 4: URL param fallback ────────────────────────────────────────────
  if (action === 'click') {
    console.log('[SmartBrowser] Tier 3 failed — escalating to Tier 4');
    const t4 = await tier4UrlFallback(page, hint);
    if (t4) return t4;
  }

  const currentUrl = page.url();
  throw new Error(
    `All 5 tiers failed for "${hint}" (${action}) on ${currentUrl}.\n` +
    `Tried: direct selector → fuzzy DOM scan → accessibility+Groq → HTML+Groq replan → URL fallback.`
  );
}

// ─── Utility ──────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}