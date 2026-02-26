import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { Plan, Capability } from '../types';

// ─── System Prompt ────────────────────────────────────────────────────────────

const AGENT_SYSTEM_PROMPT = `You are an intelligent local automation planner.

Your role is to convert natural language into a structured execution plan using ONLY the listed capabilities.

CAPABILITIES:
1.  open_application   { app_name: string }
2.  set_wallpaper      { query: string }
3.  run_shell_command  { command: string }
4.  browser_open       { url: string }
5.  browser_fill       { selector: string, value: string }
6.  browser_click      { selector: string }
7.  type_text          { text: string }
8.  create_file        { path: string, content: string }
9.  create_folder      { path: string }
10. wait               { seconds: number }
11. download_file      { url: string, destination: string }

CRITICAL RULES — VIOLATIONS WILL BREAK THE SYSTEM:

1. WALLPAPER RULE: For ANY request involving setting a wallpaper or desktop background,
   use EXACTLY ONE step: set_wallpaper with a descriptive query string.
   The system handles downloading and setting internally.
   NEVER use download_file for wallpapers.
   NEVER use browser_open/browser_fill/browser_click to find wallpaper images.
   CORRECT: { "capability": "set_wallpaper", "parameters": { "query": "naruto anime 4k" } }
   WRONG: { "capability": "download_file", "parameters": { "url": "..." } }

2. NO FAKE URLS: NEVER invent or guess URLs for download_file.
   Only use download_file when the user provides an explicit real URL in their request.
   If no real URL is provided, do NOT include a download_file step.

3. PATHS: Always use relative paths or Desktop/Downloads as destination.
   NEVER use /Users/username or /home/username — use "Downloads/filename.ext" instead.
   The system resolves paths to the correct OS location automatically.

4. SIMPLICITY: Use the minimum steps necessary.
   For "set wallpaper to X" → 1 step: set_wallpaper
   For "open YouTube" → 1 step: browser_open
   For "create a file" → 1 step: create_file

CAPABILITY GUIDE:
- "set wallpaper / change background / desktop background" → set_wallpaper (1 step, always)
- "open app" → open_application
- "go to website / search / open URL" → browser_open
- "download file from [explicit URL]" → download_file (only with real URL)
- "create file / write code" → create_file
- "run command" → run_shell_command

OUTPUT: ONLY raw JSON (no markdown, no backticks, no explanation):

{
  "intent": "short_intent_name",
  "confidence": 85,
  "requires_confirmation": false,
  "summary": "what this plan will do",
  "steps": [
    {
      "step_number": 1,
      "description": "what will happen",
      "capability": "capability_name",
      "parameters": {},
      "safety_risk": "low"
    }
  ]
}`;

// ─── Providers ────────────────────────────────────────────────────────────────

async function planWithGroq(userPrompt: string): Promise<string> {
  const client = new OpenAI({
    apiKey: process.env.GROQ_API_KEY,
    baseURL: 'https://api.groq.com/openai/v1',
  });
  const response = await client.chat.completions.create({
    model: process.env.GROQ_MODEL ?? 'llama-3.3-70b-versatile',
    messages: [
      { role: 'system', content: AGENT_SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.1,
    max_tokens: 2000,
    response_format: { type: 'json_object' },
  });
  return response.choices[0].message.content ?? '';
}

async function planWithAnthropic(userPrompt: string): Promise<string> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const response = await client.messages.create({
    model: process.env.ANTHROPIC_MODEL ?? 'claude-opus-4-6',
    max_tokens: 2000,
    system: AGENT_SYSTEM_PROMPT,
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
      { role: 'system', content: AGENT_SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.1,
    max_tokens: 2000,
  });
  return response.choices[0].message.content ?? '';
}

// ─── Post-processing: fix common AI mistakes ─────────────────────────────────

/**
 * Detects and fixes common AI planning mistakes before execution:
 * - Multi-step wallpaper plans → collapse to single set_wallpaper
 * - Fake download_file URLs → remove the step
 * - Unix paths on Windows → normalize (executor handles this too, but belt+suspenders)
 */
function postProcessPlan(plan: Plan): Plan {
  const FAKE_URL = /example\.(com|org|net)|placeholder\.|your.?url|\/path\/to\/|localhost/i;
  const WALLPAPER_CAPS = new Set(['browser_open', 'browser_fill', 'browser_click', 'download_file']);

  // Check if this is a wallpaper-related plan with multiple steps
  const isWallpaperPlan = plan.intent.toLowerCase().includes('wallpaper') ||
    plan.summary.toLowerCase().includes('wallpaper') ||
    plan.steps.some(s => s.capability === 'set_wallpaper');

  if (isWallpaperPlan) {
    // Find or extract the wallpaper query
    const wpStep = plan.steps.find(s => s.capability === 'set_wallpaper');
    const browserStep = plan.steps.find(s => s.capability === 'browser_open');

    let query = wpStep?.parameters.query;

    // Try to extract query from browser search URL
    if (!query && browserStep?.parameters.url) {
      const url = browserStep.parameters.url;
      const qMatch = url.match(/[?&]q=([^&]+)/);
      if (qMatch) query = decodeURIComponent(qMatch[1]);
    }

    // If AI made a multi-step wallpaper plan, collapse it to 1 step
    if (plan.steps.length > 1 || (plan.steps.length === 1 && plan.steps[0].capability !== 'set_wallpaper')) {
      if (query) {
        console.log(`[Planner] Collapsing ${plan.steps.length}-step wallpaper plan to single set_wallpaper`);
        plan.steps = [{
          step_number: 1,
          description: `Download and set desktop wallpaper: ${query}`,
          capability: 'set_wallpaper',
          parameters: { query },
          safety_risk: 'low',
        }];
      }
    }
  }

  // Remove download_file steps with fake/placeholder URLs
  plan.steps = plan.steps.filter((step) => {
    if (step.capability === 'download_file' && step.parameters.url && FAKE_URL.test(step.parameters.url)) {
      console.warn(`[Planner] Removed download_file step with fake URL: ${step.parameters.url}`);
      return false;
    }
    return true;
  });

  // Re-number steps
  plan.steps.forEach((s, i) => { s.step_number = i + 1; });

  return plan;
}

// ─── Validation ───────────────────────────────────────────────────────────────

const VALID_CAPABILITIES: Capability[] = [
  'open_application', 'set_wallpaper', 'run_shell_command',
  'browser_open', 'browser_fill', 'browser_click',
  'type_text', 'create_file', 'create_folder', 'wait', 'download_file',
];

function validateAndNormalizePlan(raw: string): Plan {
  let json = raw.trim();
  if (json.startsWith('```')) {
    json = json.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
  }

  const plan = JSON.parse(json) as Plan;
  if (!plan.steps || !Array.isArray(plan.steps)) throw new Error('Invalid plan: missing steps array');

  plan.steps.forEach((step, i) => {
    if (!step.capability) throw new Error(`Step ${i + 1} missing capability`);
    if (!VALID_CAPABILITIES.includes(step.capability)) throw new Error(`Step ${i + 1} invalid capability: "${step.capability}"`);
    if (!step.parameters) step.parameters = {};
    if (!step.safety_risk) step.safety_risk = 'low';
  });

  return plan;
}

// ─── Main Export ──────────────────────────────────────────────────────────────

export async function planTask(userPrompt: string): Promise<Plan> {
  const provider = (process.env.AI_PROVIDER ?? 'groq').toLowerCase();
  console.log(`[AI Planner] "${userPrompt}" — provider: ${provider}`);

  let raw: string;
  try {
    if (provider === 'groq')           raw = await planWithGroq(userPrompt);
    else if (provider === 'anthropic') raw = await planWithAnthropic(userPrompt);
    else if (provider === 'openai')    raw = await planWithOpenAI(userPrompt);
    else throw new Error(`Unknown AI_PROVIDER "${provider}"`);
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string };
    const msg = e.message ?? '';
    if (e.status === 429 || msg.toLowerCase().includes('quota') || msg.toLowerCase().includes('credit')) {
      throw new Error(`[${provider.toUpperCase()}] Out of credits. Groq is FREE at console.groq.com`);
    }
    if (e.status === 401 || msg.includes('authentication') || msg.includes('apiKey')) {
      throw new Error(`[${provider.toUpperCase()}] Invalid API key. Check ${provider.toUpperCase()}_API_KEY in .env`);
    }
    throw err;
  }

  try {
    let plan = validateAndNormalizePlan(raw);
    plan = postProcessPlan(plan);
    console.log(`[AI Planner] ✓ ${plan.steps.length} steps, intent: "${plan.intent}"`);
    return plan;
  } catch (err: unknown) {
    throw new Error(`Plan parse failed: ${(err as Error).message}\nRaw: ${raw!.substring(0, 300)}`);
  }
}