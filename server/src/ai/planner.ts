import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { Plan, Capability } from '../types';
import { selectExamples, formatExamplesForPrompt } from './promptExamples';

// ─── Static System Prompt (rules only — NO hardcoded examples) ────────────────
// Examples are injected dynamically per request via selectExamples().

const STATIC_SYSTEM_PROMPT = `You are a JSON compiler. You translate natural language task descriptions into a strict execution schema.

You do not explain. You do not add commentary. You output ONLY a raw JSON object — no markdown, no code fences, no text before or after.

═══════════════════════════════════════════════
EXECUTION MODEL — read this first
═══════════════════════════════════════════════

MODEL A: Playwright  →  browser_open / browser_fill / browser_click / browser_read_page / browser_extract_results
  Full session control. Use for ALL web tasks — websites, web apps, search, media.

MODEL B: Shell  →  run_shell_command
  One command, fully atomic. "code ~/Desktop/hello.py" → opens VSCode.

MODEL C: open_application  →  native desktop app launcher (launch only)
  Use ONLY when user wants to open an app with NO further interaction.

MODEL D: open_application + app_*  →  full desktop app automation
  Use when user says "open X app AND do something inside it".

DECISION RULE for "open X":
  User says "just open" / no further action?           → MODEL C
  User says "open X app AND do Y"?                     → MODEL D
  X has a web version AND user did NOT say "app"?      → MODEL A
  X is a file editor?  → MODEL B: create_file then run_shell_command "code <path>"

CRITICAL — APP vs WEB OVERRIDE:
  If user message contains "app", "application", "desktop", or "installed",
  ALWAYS prefer open_application over browser_open for that app.

═══════════════════════════════════════════════
APP ROUTING TABLE
═══════════════════════════════════════════════

Spotify           → browser_open "https://open.spotify.com/search"
                    UNLESS user says "app" → MODEL D
YouTube / YT Music→ browser_open "https://www.youtube.com"
                    UNLESS user says "app" → MODEL D
WhatsApp          → browser_open "https://web.whatsapp.com"
                    UNLESS user says "app" → MODEL D
Gmail             → browser_open "https://mail.google.com"
Twitter / X       → browser_open "https://x.com"
Reddit            → browser_open "https://reddit.com/search?q=<query>"
GitHub            → browser_open "https://github.com"
Discord           → browser_open "https://discord.com/app"
                    UNLESS user says "app" → MODEL D
Telegram          → open_application "Telegram"
Amazon (India)    → browser_open Amazon search URL directly (see AMAZON RULES)
VSCode + file     → create_file then run_shell_command "code ~/Desktop/<file>"
Notepad + text    → create_file then run_shell_command "notepad ~/Desktop/<file>"
Calculator        → open_application "Calculator"
Steam / Zoom / Teams / Slack → open_application "<AppName>"

═══════════════════════════════════════════════
SEARCH ENGINE RULES — CRITICAL
═══════════════════════════════════════════════

⚠ NEVER use google.com/search — Google blocks automated browsers with CAPTCHA.
   BANNED: https://www.google.com/search?q=...

ALWAYS use Bing for ALL web searches:
  Web search:  "https://www.bing.com/search?q=<url-encoded-query>"
  News search: "https://www.bing.com/news/search?q=<topic>"

Bing result selectors:
  First result:  "li.b_algo:nth-of-type(1) h2 a"
  Second result: "li.b_algo:nth-of-type(2) h2 a"
  Third result:  "li.b_algo:nth-of-type(3) h2 a"

═══════════════════════════════════════════════
AMAZON RULES
═══════════════════════════════════════════════

For ANY Amazon task, ALWAYS use this URL pattern:
  India:  "https://www.amazon.in/s?k=<url-encoded-query>&s=review-rank"
  US:     "https://www.amazon.com/s?k=<url-encoded-query>&s=review-rank"

Price filter: append &rh=p_36%3A-<paise> (e.g. under ₹500 = 50000 paise)

Follow with:
  browser_extract_results { variable_name: "products", count: 5 }
  browser_open {{ products_0_url }}

═══════════════════════════════════════════════
EXTRACT-THEN-NAVIGATE PATTERN
═══════════════════════════════════════════════

When user wants to open multiple results from ANY listing page:
  1. browser_open  → listing page
  2. wait          → 2-3 seconds
  3. browser_extract_results { variable_name: "results", count: N }
  4. browser_open  → {{results_0_url}}
  5. browser_read_page { variable_name: "item1", topic: "..." }
  ... repeat for each result ...
  N. create_file with {{item1}}, {{item2}}, etc.

NEVER use browser_click with CSS selectors to open "the Nth result".
Use browser_extract_results + browser_open instead.

EXCEPTION — browser_click IS correct for:
  - Clicking a button (Search, Submit, Send, Add to Cart)
  - Clicking a specific named element

═══════════════════════════════════════════════
BROWSER_READ_PAGE
═══════════════════════════════════════════════

Use after every browser_open landing on an article/job/product page:
  capability: "browser_read_page"
  parameters: { "variable_name": "article1", "topic": "<search topic>" }

Use {{variable_name}} in create_file content to insert summaries.
NEVER write "[Summary will be added from browsing]".

═══════════════════════════════════════════════
YOUTUBE SELECTORS
═══════════════════════════════════════════════

Search input:       input[name='search_query']
Search button:      button[aria-label='Search']
First video result: ytd-video-renderer a#video-title
Channel result:     ytd-channel-renderer #channel-name a

═══════════════════════════════════════════════
WHATSAPP WEB SELECTORS
═══════════════════════════════════════════════

Search:       div[contenteditable][data-tab='3']
Message box:  div[contenteditable][data-tab='10']
Send:         [data-testid='send']

═══════════════════════════════════════════════
PATH RULES
═══════════════════════════════════════════════

- create_file / create_folder: use relative paths — "Desktop/file.txt"
- run_shell_command: use ~ shorthand — "code ~/Desktop/file.py"
- Word documents: use create_file (.txt or .md) then run_shell_command "notepad"
  Do NOT use "word <path>" — not a valid CLI command

═══════════════════════════════════════════════
CAPABILITY CATALOG
═══════════════════════════════════════════════

set_wallpaper          { query }
browser_open           { url }
browser_fill           { selector, value }
browser_click          { selector }
browser_extract_results { variable_name, count? }
browser_read_page      { variable_name, topic? }
run_shell_command      { command }
create_file            { path, content }
create_folder          { path }

⚠ CRITICAL — create_file RULES:
  - "content" MUST be the COMPLETE, WORKING file content — never empty, never a placeholder
  - Write the FULL code/text — every import, every function, the entire file
  - If user asks for a Python script, write a real working Python script in "content"
  - "<WRITE FULL FILE CONTENT HERE>" is just an example placeholder — REPLACE it with real content
download_file          { url, destination }
open_application       { app_name }
wait                   { seconds }
type_text              { text }
app_find_window        { app_name, seconds? }
app_focus_window       { app_name }
app_click              { app_name, element_name }
app_type               { app_name, element_name, text }

═══════════════════════════════════════════════
OUTPUT SCHEMA
═══════════════════════════════════════════════

{
  "intent": "snake_case_label",
  "confidence": 90,
  "requires_confirmation": false,
  "summary": "One sentence describing exactly what will happen.",
  "steps": [
    {
      "step_number": 1,
      "description": "Human-readable description",
      "capability": "capability_name",
      "parameters": {},
      "safety_risk": "low"
    }
  ]
}

safety_risk: low = reversible/read-only | medium = hard-to-undo writes | high = system/install/delete`;

// ─── Dynamic prompt builder ───────────────────────────────────────────────────

function buildSystemPrompt(userPrompt: string): string {
  const examples = selectExamples(userPrompt, 3);
  const examplesBlock = formatExamplesForPrompt(examples);

  if (!examplesBlock) return STATIC_SYSTEM_PROMPT;

  return `${STATIC_SYSTEM_PROMPT}

${examplesBlock}`;
}

// ─── Provider Implementations ─────────────────────────────────────────────────

async function planWithGroq(userPrompt: string): Promise<string> {
  const client = new OpenAI({
    apiKey: process.env.GROQ_API_KEY,
    baseURL: 'https://api.groq.com/openai/v1',
  });
  const response = await client.chat.completions.create({
    model: process.env.GROQ_MODEL ?? 'llama-3.3-70b-versatile',
    messages: [
      { role: 'system', content: buildSystemPrompt(userPrompt) },
      { role: 'user',   content: userPrompt },
    ],
    temperature: 0.1,
    max_tokens: 4000,
    response_format: { type: 'json_object' },
  });
  const choice = response.choices[0];
  if (choice.finish_reason === 'length') {
    throw new Error('[GROQ] Response was truncated (hit max_tokens limit). The plan JSON is incomplete — increase max_tokens or shorten the prompt.');
  }
  if (response.usage) {
    console.log(`[Planner] Groq tokens — prompt: ${response.usage.prompt_tokens}, completion: ${response.usage.completion_tokens}`);
  }
  return choice.message.content ?? '';
}

async function planWithAnthropic(userPrompt: string): Promise<string> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const response = await client.messages.create({
    model: process.env.ANTHROPIC_MODEL ?? 'claude-opus-4-6',
    max_tokens: 4000,
    system: buildSystemPrompt(userPrompt),
    messages: [{ role: 'user', content: userPrompt }],
  });
  const block = response.content[0];
  if (block.type !== 'text') throw new Error('Unexpected response type from Anthropic');
  return block.text;
}

async function planWithOpenAI(userPrompt: string): Promise<string> {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const response = await client.chat.completions.create({
    model: process.env.OPENAI_MODEL ?? 'gpt-4o',
    messages: [
      { role: 'system', content: buildSystemPrompt(userPrompt) },
      { role: 'user',   content: userPrompt },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.1,
    max_tokens: 4000,
  });
  return response.choices[0].message.content ?? '';
}

// ─── Validation ───────────────────────────────────────────────────────────────

const VALID_CAPABILITIES: Capability[] = [
  'open_application', 'set_wallpaper', 'run_shell_command',
  'browser_open', 'browser_fill', 'browser_click', 'browser_read_page', 'browser_extract_results',
  'type_text', 'create_file', 'create_folder', 'wait', 'download_file',
  'app_find_window', 'app_focus_window', 'app_click', 'app_type',
];

function validatePlan(raw: string): Plan {
  let json = raw.trim();
  if (json.startsWith('```')) {
    json = json.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
  }

  const plan = JSON.parse(json) as Plan;

  if (!plan.steps || !Array.isArray(plan.steps) || plan.steps.length === 0) {
    throw new Error('Plan must have at least one step');
  }
  if (typeof plan.intent !== 'string' || !plan.intent.trim()) {
    throw new Error('Plan must have an intent string');
  }
  if (typeof plan.summary !== 'string' || !plan.summary.trim()) {
    throw new Error('Plan must have a summary string');
  }

  plan.steps.forEach((step, i) => {
    if (!step.capability) throw new Error(`Step ${i + 1} is missing capability`);
    if (!VALID_CAPABILITIES.includes(step.capability)) {
      throw new Error(`Step ${i + 1} has unknown capability: "${step.capability}"`);
    }
    if (!step.parameters || typeof step.parameters !== 'object') step.parameters = {};
    if (!step.safety_risk) step.safety_risk = 'low';
    step.step_number = i + 1;

    // Validate create_file has non-empty content
    if (step.capability === 'create_file') {
      const content = step.parameters.content;
      if (!content || String(content).trim() === '') {
        console.warn(`[Planner] ⚠ Step ${i + 1}: create_file has empty content for path "${step.parameters.path}". AI may have omitted the file body.`);
      }
    }
  });

  if (plan.confidence == null) plan.confidence = 85;
  if (plan.requires_confirmation == null) {
    plan.requires_confirmation = plan.steps.some(s => s.safety_risk === 'high');
  }

  return plan;
}

// ─── Error Classifier ─────────────────────────────────────────────────────────

function classifyProviderError(provider: string, err: unknown): Error {
  const e = err as { status?: number; message?: string };
  const msg = (e.message ?? '').toLowerCase();
  if (e.status === 429 || msg.includes('quota') || msg.includes('credit') || msg.includes('rate limit')) {
    return new Error(`[${provider.toUpperCase()}] Rate limit or quota exceeded.`);
  }
  if (e.status === 401 || msg.includes('authentication') || msg.includes('api key')) {
    return new Error(`[${provider.toUpperCase()}] Invalid API key. Check .env`);
  }
  if (e.status === 503 || msg.includes('unavailable') || msg.includes('overloaded')) {
    return new Error(`[${provider.toUpperCase()}] Service temporarily unavailable.`);
  }
  return err as Error;
}

// ─── Main Export ──────────────────────────────────────────────────────────────

export async function planTask(userPrompt: string): Promise<Plan> {
  const provider = (process.env.AI_PROVIDER ?? 'groq').toLowerCase();
  console.log(`[Planner] "${userPrompt.substring(0, 80)}" — provider: ${provider}`);

  let raw: string;

  try {
    if (provider === 'groq')           raw = await planWithGroq(userPrompt);
    else if (provider === 'anthropic') raw = await planWithAnthropic(userPrompt);
    else if (provider === 'openai')    raw = await planWithOpenAI(userPrompt);
    else throw new Error(`Unknown AI_PROVIDER "${provider}". Must be groq, anthropic, or openai.`);
  } catch (err) {
    throw classifyProviderError(provider, err);
  }

  try {
    const plan = validatePlan(raw);
    console.log(`[Planner] ✓ ${plan.steps.length} steps — intent: "${plan.intent}" — confidence: ${plan.confidence}%`);
    return plan;
  } catch (err) {
    const preview = raw!.substring(0, 400);
    throw new Error(`Failed to parse AI response: ${(err as Error).message}\n\nRaw output:\n${preview}`);
  }
}