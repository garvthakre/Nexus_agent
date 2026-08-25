import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { createCommerceSession, getCommerceSession } from './commerceStore';
import { processConversationTurn, ConversationResult } from './conversationAgent';

export interface SimulationRequest {
  persona: string;
  goal: string;
  maxTurns?: number;
}

export interface SimulationResult {
  sessionId: string;
  status: 'completed' | 'abandoned' | 'failed';
  turns: number;
  messages: ReturnType<typeof getCommerceSession> extends infer T ? T : never;
  lastAction?: ConversationResult['action'];
}

const BUYER_PROMPT = `You are a simulated ecommerce buyer. Generate the next concise buyer message based on the persona, goal, and transcript. Progress naturally: ask a question, select a product, accept or reject an upsell, then decide whether to checkout. Do not narrate your reasoning. Return only the message text. If the goal is fulfilled, say that you are ready to checkout.`;

async function generateBuyerMessage(context: string): Promise<string> {
  const provider = (process.env.AI_PROVIDER ?? 'groq').toLowerCase();
  if (provider === 'groq' || provider === 'openai') {
    const client = new OpenAI(provider === 'groq' ? {
      apiKey: process.env.GROQ_API_KEY,
      baseURL: 'https://api.groq.com/openai/v1',
    } : { apiKey: process.env.OPENAI_API_KEY });
    const response = await client.chat.completions.create({
      model: provider === 'groq'
        ? process.env.GROQ_MODEL ?? 'llama-3.3-70b-versatile'
        : process.env.OPENAI_MODEL ?? 'gpt-4o',
      messages: [
        { role: 'system', content: BUYER_PROMPT },
        { role: 'user', content: context },
      ],
      temperature: 0.5,
      max_tokens: 120,
    });
    return (response.choices[0].message.content ?? '').trim();
  }

  if (provider === 'anthropic') {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const response = await client.messages.create({
      model: process.env.ANTHROPIC_MODEL ?? 'claude-opus-4-6',
      max_tokens: 120,
      system: BUYER_PROMPT,
      messages: [{ role: 'user', content: context }],
    });
    const block = response.content[0];
    if (block.type === 'text') return block.text.trim();
  }

  throw new Error(`Unknown AI_PROVIDER "${provider}"`);
}

export async function runSimulation(request: SimulationRequest): Promise<SimulationResult> {
  const persona = request.persona.trim();
  const goal = request.goal.trim();
  const maxTurns = Math.min(Math.max(request.maxTurns ?? 8, 1), 12);
  if (!persona || !goal) throw new Error('persona and goal are required');

  const session = createCommerceSession('simulated_agent');
  let lastAction: ConversationResult['action'] | undefined;

  for (let turn = 0; turn < maxTurns; turn += 1) {
    const current = getCommerceSession(session.sessionId);
    if (!current) throw new Error('Simulation session disappeared');
    const buyerMessage = await generateBuyerMessage(JSON.stringify({ persona, goal, transcript: current.messages, cart: current.cartItems }));
    if (!buyerMessage) throw new Error('Simulated buyer returned an empty message');

    const result = await processConversationTurn(session.sessionId, buyerMessage);
    lastAction = result.action;
    if (result.action === 'initiate_checkout') {
      return { sessionId: session.sessionId, status: 'completed', turns: turn + 1, messages: getCommerceSession(session.sessionId), lastAction };
    }
  }

  return {
    sessionId: session.sessionId,
    status: 'abandoned',
    turns: maxTurns,
    messages: getCommerceSession(session.sessionId),
    lastAction,
  };
}
