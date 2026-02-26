import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { Plan, ReviewResult } from '../types';

// ─── System Prompt ────────────────────────────────────────────────────────────

const REVIEWER_PROMPT = `You are a security reviewer for an AI automation system.

Review the given execution plan and respond ONLY with raw JSON (no markdown, no backticks):

{
  "verdict": "SAFE",
  "confidence": 95,
  "risks": ["none"],
  "safe_steps": [1, 2, 3],
  "risky_steps": [],
  "recommendation": "Plan is safe to execute"
}

verdict must be exactly: SAFE | UNSAFE | REVIEW_REQUIRED

UNSAFE: rm -rf, disk format, /etc/passwd, SSH keys, network exfiltration, malicious installs
REVIEW_REQUIRED: shell commands modifying system state, payment form fills, system directory writes
SAFE: open apps, create user files, type text, open websites, wait, read files

Return ONLY the JSON object. No explanation outside JSON.`;

// ─── Providers ────────────────────────────────────────────────────────────────

async function reviewWithGroq(plan: Plan): Promise<string> {
  const client = new OpenAI({
    apiKey: process.env.GROQ_API_KEY,
    baseURL: 'https://api.groq.com/openai/v1',
  });

  const response = await client.chat.completions.create({
    model: process.env.GROQ_MODEL ?? 'llama-3.3-70b-versatile',
    messages: [
      { role: 'system', content: REVIEWER_PROMPT },
      { role: 'user', content: `Review this plan:\n${JSON.stringify(plan, null, 2)}` },
    ],
    temperature: 0.1,
    max_tokens: 400,
    response_format: { type: 'json_object' },
  });

  return response.choices[0].message.content ?? '';
}

async function reviewWithAnthropic(plan: Plan): Promise<string> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const response = await client.messages.create({
    model: process.env.ANTHROPIC_MODEL ?? 'claude-opus-4-6',
    max_tokens: 400,
    system: REVIEWER_PROMPT,
    messages: [{ role: 'user', content: `Review this plan:\n${JSON.stringify(plan, null, 2)}` }],
  });

  const block = response.content[0];
  if (block.type !== 'text') throw new Error('Unexpected Anthropic response type');
  return block.text;
}

async function reviewWithOpenAI(plan: Plan): Promise<string> {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const response = await client.chat.completions.create({
    model: process.env.OPENAI_MODEL ?? 'gpt-4o',
    messages: [
      { role: 'system', content: REVIEWER_PROMPT },
      { role: 'user', content: `Review this plan:\n${JSON.stringify(plan, null, 2)}` },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.1,
    max_tokens: 400,
  });

  return response.choices[0].message.content ?? '';
}

// ─── Fallback ─────────────────────────────────────────────────────────────────

function fallbackReview(plan: Plan, reason: string): ReviewResult {
  return {
    verdict: 'REVIEW_REQUIRED',
    confidence: 0,
    risks: [`AI review unavailable: ${reason}`],
    safe_steps: [],
    risky_steps: plan.steps.map((s) => s.step_number),
    recommendation: 'Review steps manually before executing.',
  };
}

// ─── Main Export ──────────────────────────────────────────────────────────────

export async function reviewPlan(plan: Plan): Promise<ReviewResult> {
  const provider = (process.env.AI_PROVIDER ?? 'groq').toLowerCase();
  console.log('[AI Reviewer] Reviewing plan safety...');

  let raw: string;
  try {
    if (provider === 'groq')           raw = await reviewWithGroq(plan);
    else if (provider === 'anthropic') raw = await reviewWithAnthropic(plan);
    else                               raw = await reviewWithOpenAI(plan);
  } catch (err: unknown) {
    const e = err as Error;
    console.warn('[AI Reviewer] Review failed, defaulting to REVIEW_REQUIRED:', e.message);
    return fallbackReview(plan, e.message);
  }

  // Strip markdown fences
  raw = raw.trim();
  if (raw.startsWith('```')) {
    raw = raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
  }

  try {
    const review = JSON.parse(raw) as ReviewResult;
    console.log(`[AI Reviewer] ✓ Verdict: ${review.verdict}`);
    return review;
  } catch {
    return fallbackReview(plan, 'Could not parse reviewer JSON response');
  }
}
