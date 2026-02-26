import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { Plan, Capability } from '../types';

// ─── System Prompt ────────────────────────────────────────────────────────────

const AGENT_SYSTEM_PROMPT = `You are an intelligent local automation planner.

Your role is NOT to directly control the system.
Your job is to:
1. Understand the user's natural language request.
2. Convert it into a structured execution plan.
3. Break the task into small atomic steps.
4. Use ONLY the allowed capabilities.
5. Always output structured JSON.
6. Never output natural language explanations unless requested.

CAPABILITIES:
1. open_application   { app_name: string }
2. set_wallpaper      { query: string }
3. run_shell_command  { command: string }
4. browser_open       { url: string }
5. browser_fill       { selector: string, value: string }
6. browser_click      { selector: string }
7. type_text          { text: string }
8. create_file        { path: string, content: string }
9. create_folder      { path: string }
10. wait              { seconds: number }

RULES:
- Break complex tasks into multiple atomic steps.
- Include a short human-readable description per step.
- Include safety_risk: low | medium | high per step.
- If task involves money/payment, set requires_confirmation: true.
- For shell commands, prefer safe non-destructive commands.
- Never delete system files or modify system settings without explicit request.

OUTPUT: ONLY raw JSON — no markdown, no backticks, no explanation:

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
    temperature: 0.2,
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
    temperature: 0.2,
    max_tokens: 2000,
  });

  return response.choices[0].message.content ?? '';
}

//   Validation  

const VALID_CAPABILITIES: Capability[] = [
  'open_application', 'set_wallpaper', 'run_shell_command',
  'browser_open', 'browser_fill', 'browser_click',
  'type_text', 'create_file', 'create_folder', 'wait',
];

function validateAndNormalizePlan(raw: string): Plan {
  // Strip markdown fences if model wrapped response
  let json = raw.trim();
  if (json.startsWith('```')) {
    json = json.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
  }

  const plan = JSON.parse(json) as Plan;

  if (!plan.steps || !Array.isArray(plan.steps)) {
    throw new Error('Invalid plan: missing steps array');
  }

  plan.steps.forEach((step, i) => {
    if (!step.capability) {
      throw new Error(`Step ${i + 1} is missing a capability`);
    }
    if (!VALID_CAPABILITIES.includes(step.capability)) {
      throw new Error(`Step ${i + 1} has invalid capability: "${step.capability}"`);
    }
    if (!step.parameters) step.parameters = {};
    if (!step.safety_risk) step.safety_risk = 'low';
  });

  return plan;
}

// ─── Main Export ──────────────────────────────────────────────────────────────

export async function planTask(userPrompt: string): Promise<Plan> {
  const provider = (process.env.AI_PROVIDER ?? 'groq').toLowerCase();
  console.log(`[AI Planner] Generating plan for: "${userPrompt}"`);
  console.log(`[AI Planner] Using provider: ${provider}`);

  let raw: string;

  try {
    if (provider === 'groq')           raw = await planWithGroq(userPrompt);
    else if (provider === 'anthropic') raw = await planWithAnthropic(userPrompt);
    else if (provider === 'openai')    raw = await planWithOpenAI(userPrompt);
    else throw new Error(`Unknown AI_PROVIDER "${provider}". Use: groq | anthropic | openai`);
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string; code?: string };
    const msg = e.message ?? '';

    if (e.status === 429 || msg.toLowerCase().includes('quota') || msg.toLowerCase().includes('credit')) {
      throw new Error(
        `[${provider.toUpperCase()}] Out of credits. ` +
        `Groq is FREE at console.groq.com — set AI_PROVIDER=groq and GROQ_API_KEY in backend/.env`
      );
    }
    if (e.status === 401 || msg.includes('authentication') || msg.includes('apiKey')) {
      throw new Error(
        `[${provider.toUpperCase()}] Invalid API key. ` +
        `Check your ${provider.toUpperCase()}_API_KEY in backend/.env`
      );
    }
    throw err;
  }

  try {
    const plan = validateAndNormalizePlan(raw);
    console.log(`[AI Planner] ✓ Plan ready: ${plan.steps.length} steps, intent: "${plan.intent}"`);
    return plan;
  } catch (err: unknown) {
    const e = err as Error;
    throw new Error(`Plan parse failed: ${e.message}\nRaw: ${raw.substring(0, 300)}`);
  }
}
