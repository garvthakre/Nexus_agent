import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { getProduct, listProducts } from './catalog';
import {
  addCartItem,
  addMessage,
  CommerceMessage,
  CommerceSession,
  getCommerceSession,
  removeCartItem,
} from './commerceStore';

export type ConversationAction =
  | 'add_to_cart'
  | 'remove_from_cart'
  | 'initiate_checkout'
  | 'none';

export interface ConversationResult {
  reply: string;
  action: ConversationAction;
  productId: string | null;
  quantity: number | null;
}

const SYSTEM_PROMPT = `You are the sales agent for Nexus Desk Kit, a developer-workspace store.

Grounding rules:
- Reference only products in the supplied catalog.
- Use the exact product names and prices from the catalog.
- Never invent products, discounts, stock, shipping promises, or prices.
- Answer questions using the catalog, cart, and conversation history.
- When relevant, suggest at most one related product from the selected product's upsellCandidates.
- Only add, remove, or checkout when the buyer clearly asks for that action.
- Return only a JSON object matching the output schema. No markdown or extra text.

OUTPUT SCHEMA:
{
  "reply": "string",
  "action": "add_to_cart" | "remove_from_cart" | "initiate_checkout" | "none",
  "productId": "string or null",
  "quantity": "positive integer or null"
}`;

function formatContext(session: CommerceSession, buyerMessage: string): string {
  const catalog = listProducts().map(({ upsellCandidates, ...product }) => ({
    ...product,
    upsellCandidates,
  }));
  return JSON.stringify({
    buyerMessage,
    catalog,
    cart: session.cartItems,
    conversationHistory: session.messages,
  }, null, 2);
}

async function callGroq(context: string): Promise<string> {
  const client = new OpenAI({
    apiKey: process.env.GROQ_API_KEY,
    baseURL: 'https://api.groq.com/openai/v1',
  });
  const response = await client.chat.completions.create({
    model: process.env.GROQ_MODEL ?? 'llama-3.3-70b-versatile',
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: context },
    ],
    temperature: 0.1,
    max_tokens: 500,
    response_format: { type: 'json_object' },
  });
  return response.choices[0].message.content ?? '';
}

async function callAnthropic(context: string): Promise<string> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const response = await client.messages.create({
    model: process.env.ANTHROPIC_MODEL ?? 'claude-opus-4-6',
    max_tokens: 500,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: context }],
  });
  const block = response.content[0];
  if (block.type !== 'text') throw new Error('Unexpected Anthropic response type');
  return block.text;
}

async function callOpenAI(context: string): Promise<string> {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const response = await client.chat.completions.create({
    model: process.env.OPENAI_MODEL ?? 'gpt-4o',
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: context },
    ],
    temperature: 0.1,
    max_tokens: 500,
    response_format: { type: 'json_object' },
  });
  return response.choices[0].message.content ?? '';
}

function parseResult(raw: string): ConversationResult {
  let json = raw.trim();
  if (json.startsWith('```')) {
    json = json.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
  }

  const result = JSON.parse(json) as Partial<ConversationResult>;
  const validActions: ConversationAction[] = [
    'add_to_cart',
    'remove_from_cart',
    'initiate_checkout',
    'none',
  ];

  if (typeof result.reply !== 'string' || !result.reply.trim()) {
    throw new Error('Conversation response must include a reply');
  }
  if (!result.action || !validActions.includes(result.action)) {
    throw new Error(`Invalid conversation action: ${String(result.action)}`);
  }

  const productId = result.productId ?? null;
  const quantity = result.quantity ?? null;
  if (productId !== null && (typeof productId !== 'string' || !getProduct(productId))) {
    throw new Error(`Conversation response referenced an unknown product: ${String(productId)}`);
  }
  if (quantity !== null && (!Number.isSafeInteger(quantity) || quantity < 1)) {
    throw new Error('Conversation quantity must be a positive integer');
  }
  if ((result.action === 'add_to_cart' || result.action === 'remove_from_cart') &&
      (productId === null || quantity === null)) {
    throw new Error(`${result.action} requires productId and quantity`);
  }
  if (result.action === 'initiate_checkout' && (productId !== null || quantity !== null)) {
    throw new Error('initiate_checkout cannot include a product or quantity');
  }
  if (result.action === 'none' && (productId !== null || quantity !== null)) {
    throw new Error('none cannot include a product or quantity');
  }

  return { reply: result.reply.trim(), action: result.action, productId, quantity };
}

function applyAction(sessionId: string, result: ConversationResult): void {
  if (result.action === 'add_to_cart' && result.productId && result.quantity) {
    addCartItem(sessionId, result.productId, result.quantity);
  }
  if (result.action === 'remove_from_cart' && result.productId && result.quantity) {
    removeCartItem(sessionId, result.productId, result.quantity);
  }
}

export async function processConversationTurn(
  sessionId: string,
  buyerMessage: string,
): Promise<ConversationResult> {
  const normalizedMessage = buyerMessage.trim();
  if (!normalizedMessage) throw new Error('buyerMessage is required');

  const session = getCommerceSession(sessionId);
  if (!session) throw new Error(`Commerce session not found: ${sessionId}`);

  addMessage(sessionId, 'buyer', normalizedMessage);
  const provider = (process.env.AI_PROVIDER ?? 'groq').toLowerCase();
  const context = formatContext({ ...session, messages: [...session.messages, {
    role: 'buyer',
    content: normalizedMessage,
    timestamp: new Date().toISOString(),
  }] }, normalizedMessage);

  let raw: string;
  if (provider === 'groq') raw = await callGroq(context);
  else if (provider === 'anthropic') raw = await callAnthropic(context);
  else if (provider === 'openai') raw = await callOpenAI(context);
  else throw new Error(`Unknown AI_PROVIDER "${provider}"`);

  const result = parseResult(raw);
  applyAction(sessionId, result);
  addMessage(sessionId, 'agent', result.reply);
  return result;
}
