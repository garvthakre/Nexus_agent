/**
 * browserEngine.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Tiered fallback browser automation engine.
 *
 * When a selector fails we don't just retry — we escalate through smarter tiers:
 *
 *   TIER 0 — Direct selector (fast path, no AI)
 *   TIER 1 — DOM fuzzy scan (zero cost, pure JS string matching)
 *   TIER 2 — Accessibility tree → Groq (free, structured AI reasoning)
 *   TIER 3 — Page HTML chunk → Groq re-plan (free, adaptive)
 *   TIER 4 — URL param fallback (for supported sites like Amazon, YouTube)
 *
 * Each tier tries a fundamentally different strategy, not just the same
 * broken selector again.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import OpenAI from 'openai';

// ─── Types ────────────────────────────────────────────────────────────────────

export type ElementAction = 'fill' | 'click';

export interface ActionResult {
  success: boolean;
  strategy: string;        // which tier / label succeeded
  tier: number;            // 0-4
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
  selector: string;        // best CSS selector to reach it
}

// ─── Groq Client (free) ───────────────────────────────────────────────────────

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

// ─── DOM Scanner ─────────────────────────────────────────────────────────────
// Runs inside the browser via page.evaluate — no API cost at all.

async function scanInteractiveElements(
  page: import('playwright').Page,
): Promise<InteractiveElement[]> {
  return page.evaluate(() => {
    const TAGS = ['button', 'a', 'input', 'select', 'textarea', '[role="button"]', '[role="link"]', '[role="menuitem"]', '[role="option"]', '[role="tab"]'];
    const elements: InteractiveElement[] = [];
    const seen = new Set<Element>();

    for (const tag of TAGS) {
      const nodes = Array.from(document.querySelectorAll(tag));
      for (const el of nodes) {
        if (seen.has(el)) continue;
        seen.add(el);

        const rect = el.getBoundingClientRect();
        const visible = rect.width > 0 && rect.height > 0 && rect.top >= 0 && rect.top < window.innerHeight * 2;

        // Build a reasonable unique selector
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

    return elements.filter(e => e.visible).slice(0, 120); // cap to avoid huge payloads
  });
}

// ─── Accessibility Tree Snapshot ─────────────────────────────────────────────

async function getAccessibilitySnapshot(page: import('playwright').Page): Promise<string> {
  try {
    const snapshot = await page.accessibility.snapshot({ interestingOnly: true });
    if (!snapshot) return '';
    // Flatten to a readable string, capped at 3000 chars
    return JSON.stringify(snapshot, null, 2).slice(0, 3000);
  } catch {
    return '';
  }
}

// ─── HTML Chunk Extractor ─────────────────────────────────────────────────────
// Gets the most relevant part of the page HTML (body, capped)

async function getPageContext(page: import('playwright').Page): Promise<{
  url: string;
  title: string;
  html: string;
}> {
  const url   = page.url();
  const title = await page.title().catch(() => '');
  const html  = await page.evaluate(() => {
    // Pull main content areas, fall back to full body
    const main = document.querySelector('main, #main, #content, [role="main"], body');
    return (main?.innerHTML ?? document.body.innerHTML).slice(0, 4000);
  }).catch(() => '');
  return { url, title, html };
}

// ─── URL Param Rewriter ───────────────────────────────────────────────────────
// For sites that support URL-based filtering, build a better URL instead of
// fighting with their UI.

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

  // Amazon — price filter, sort, category all via URL
  if (url.includes('amazon.')) {
    const currentUrl = new URL(url);
    const k = currentUrl.searchParams.get('k') ?? '';

    // If the intent mentions price filtering
    const priceMatch = intent.match(/under\s*[₹$£€]?\s*(\d+)/i);
    if (priceMatch) {
      const price = parseInt(priceMatch[1], 10);
      const isIndia = url.includes('amazon.in');
      const maxPricePaise = isIndia ? price * 100 : price * 100; // paise for INR, cents for USD
      const newUrl = `${currentUrl.origin}/s?k=${encodeURIComponent(k)}&rh=p_36%3A-${maxPricePaise}&s=review-rank`;
      return { possible: true, newUrl, reason: `Encoded price filter in URL (max ${price})` };
    }

    // If we're stuck on search results, try navigating to first product directly
    if (intent.includes('first') || intent.includes('result') || intent.includes('click product')) {
      // Try to extract first product URL from DOM
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

  // YouTube — search via URL
  if (url.includes('youtube.com') && intent.includes('search')) {
    const queryMatch = intent.match(/search["\s]+(?:for\s+)?["']?([^"']+)["']?/i);
    if (queryMatch) {
      const newUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(queryMatch[1])}`;
      return { possible: true, newUrl, reason: 'Encoded YouTube search in URL' };
    }
  }

  // Google
  if (url.includes('google.') && intent.includes('search')) {
    return { possible: false };
  }

  return { possible: false };
}

// ─── Fuzzy Text Match ─────────────────────────────────────────────────────────
// Local string matching — zero API cost

const INTENT_KEYWORDS: Record<string, string[]> = {
  'add to cart':     ['add to cart', 'add to bag', 'add to basket', 'buy now', 'add item'],
  'search':          ['search', 'find', 'go', 'submit', 'look up'],
  'checkout':        ['checkout', 'proceed to checkout', 'buy now', 'place order', 'continue'],
  'next':            ['next', 'continue', 'proceed', 'forward'],
  'submit':          ['submit', 'send', 'go', 'ok', 'confirm'],
  'sign in':         ['sign in', 'log in', 'login', 'continue'],
  'close':           ['close', 'dismiss', 'cancel', 'x'],
  'first result':    ['', ' '], // handled differently
};

function fuzzyScore(hint: string, element: InteractiveElement): number {
  const hintLower = hint.toLowerCase();
  let score = 0;

  // Normalize hint to known intents
  let intentKeywords: string[] = [];
  for (const [intent, keywords] of Object.entries(INTENT_KEYWORDS)) {
    if (hintLower.includes(intent) || intent.includes(hintLower)) {
      intentKeywords = keywords;
      break;
    }
  }
  // Also use hint words directly
  const hintWords = hintLower.split(/[\s\-_#./[\]>]+/).filter(w => w.length > 2);
  const allKeywords = [...new Set([...intentKeywords, ...hintWords])];

  // Score element fields
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
      if (field === keyword) score += 3; // exact match bonus
    }
  }

  return score;
}

async function tier1FuzzyDomScan(
  page: import('playwright').Page,
  hint: string,
  action: ElementAction,
  value?: string,
): Promise<ActionResult | null> {
  console.log('[Tier 1] DOM fuzzy scan starting...');

  const elements = await scanInteractiveElements(page);
  if (!elements.length) return null;

  // Score all elements
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

  // Try to interact with it
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
    // Try JS click as secondary
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

// ─── Tier 2 — Accessibility Tree + Groq ──────────────────────────────────────

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

  // Try multiple locator strategies with the AI's identified element
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

// ─── Tier 3 — HTML Context + Groq Re-Plan ────────────────────────────────────

async function tier3HtmlGroqReplan(
  page: import('playwright').Page,
  hint: string,
  action: ElementAction,
  value?: string,
): Promise<ActionResult | null> {
  console.log('[Tier 3] HTML context + Groq re-plan starting...');

  const { url, title, html } = await getPageContext(page);
  const elements = await scanInteractiveElements(page);

  // Build a compact element summary for Groq
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

// ─── Tier 4 — URL Param Fallback ─────────────────────────────────────────────

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

// ─── Tier 0 — Direct Selector ─────────────────────────────────────────────────

async function tier0Direct(
  page: import('playwright').Page,
  hint: string,
  action: ElementAction,
  value?: string,
): Promise<ActionResult | null> {

  // Build candidate selectors from the hint
  const candidates: Array<{ label: string; loc: import('playwright').Locator }> = [];

  // If hint looks like a CSS selector, try it directly
  if (hint.match(/^[#.\[a-z]/i)) {
    candidates.push({ label: `css:${hint}`, loc: page.locator(hint).first() });
  }

  // Always try role-based and text-based
  candidates.push(
    { label: `role-btn:${hint}`,     loc: page.getByRole('button', { name: hint, exact: false }).first() },
    { label: `role-link:${hint}`,    loc: page.getByRole('link',   { name: hint, exact: false }).first() },
    { label: `aria:${hint}`,         loc: page.locator(`[aria-label*="${hint}" i]`).first() },
    { label: `placeholder:${hint}`,  loc: page.getByPlaceholder(hint, { exact: false }).first() },
    { label: `text:${hint}`,         loc: page.getByText(hint, { exact: false }).first() },
  );

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

  await page.waitForLoadState('domcontentloaded').catch(() => {});
  await sleep(600);

  // ── Tier 0: Direct selector / common roles ───────────────────────────────
  const t0 = await tier0Direct(page, hint, action, value);
  if (t0) return t0;

  console.log('[SmartBrowser] Tier 0 failed — escalating to Tier 1');
  await sleep(300);

  // ── Tier 1: DOM fuzzy scan (zero cost) ───────────────────────────────────
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

  // ── Tier 4: URL param fallback (click-only, site-specific) ───────────────
  if (action === 'click') {
    console.log('[SmartBrowser] Tier 3 failed — escalating to Tier 4');
    const t4 = await tier4UrlFallback(page, hint);
    if (t4) return t4;
  }

  // ── All tiers exhausted ───────────────────────────────────────────────────
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