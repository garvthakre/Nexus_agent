import { v4 as uuidv4 } from 'uuid';
import { getProduct, Product } from './catalog';

export type BuyerType = 'human' | 'simulated_agent';
export type CommerceSessionStatus =
  | 'browsing'
  | 'checkout_initiated'
  | 'payment_pending'
  | 'completed'
  | 'failed';
export type TransactionStatus = 'created' | 'authorized' | 'captured' | 'failed';

export interface CommerceMessage {
  role: 'buyer' | 'agent';
  content: string;
  timestamp: string;
}

export interface CartItem {
  productId: string;
  quantity: number;
}

export interface CommerceSession {
  sessionId: string;
  buyerType: BuyerType;
  messages: CommerceMessage[];
  cartItems: CartItem[];
  status: CommerceSessionStatus;
  createdAt: string;
}

export interface TransactionLog {
  sessionId: string;
  razorpayOrderId: string;
  amount: number;
  status: TransactionStatus;
  gatingDecision: string;
  reasoning: string;
  createdAt: string;
  idempotencyKey: string;
}

export interface CheckoutRecord {
  sessionId: string;
  idempotencyKey: string;
  transaction?: TransactionLog;
  inFlight?: Promise<TransactionLog>;
}

export interface CartLine {
  product: Product;
  quantity: number;
  lineTotal: number;
}

const sessions = new Map<string, CommerceSession>();
const transactions = new Map<string, TransactionLog>();
const checkoutRecords = new Map<string, CheckoutRecord>();

function cloneSession(session: CommerceSession): CommerceSession {
  return {
    ...session,
    messages: session.messages.map((message) => ({ ...message })),
    cartItems: session.cartItems.map((item) => ({ ...item })),
  };
}

function cloneTransaction(transaction: TransactionLog): TransactionLog {
  return { ...transaction };
}

function checkoutKey(sessionId: string, idempotencyKey: string): string {
  return `${sessionId}:${idempotencyKey}`;
}

export function createCommerceSession(buyerType: BuyerType = 'human'): CommerceSession {
  const session: CommerceSession = {
    sessionId: uuidv4(),
    buyerType,
    messages: [],
    cartItems: [],
    status: 'browsing',
    createdAt: new Date().toISOString(),
  };
  sessions.set(session.sessionId, session);
  return cloneSession(session);
}

export function getCommerceSession(sessionId: string): CommerceSession | undefined {
  const session = sessions.get(sessionId);
  return session ? cloneSession(session) : undefined;
}

export function addMessage(
  sessionId: string,
  role: CommerceMessage['role'],
  content: string,
): CommerceMessage {
  const session = requireSession(sessionId);
  const message: CommerceMessage = {
    role,
    content,
    timestamp: new Date().toISOString(),
  };
  session.messages.push(message);
  return { ...message };
}

export function addCartItem(
  sessionId: string,
  productId: string,
  quantity: number,
): CommerceSession {
  const session = requireSession(sessionId);
  if (!Number.isSafeInteger(quantity) || quantity < 1) {
    throw new Error('quantity must be a positive integer');
  }
  if (!getProduct(productId)) {
    throw new Error(`Unknown product: ${productId}`);
  }

  const existing = session.cartItems.find((item) => item.productId === productId);
  if (existing) existing.quantity += quantity;
  else session.cartItems.push({ productId, quantity });
  return cloneSession(session);
}

export function removeCartItem(
  sessionId: string,
  productId: string,
  quantity?: number,
): CommerceSession {
  const session = requireSession(sessionId);
  const index = session.cartItems.findIndex((item) => item.productId === productId);
  if (index < 0) throw new Error(`Product is not in the cart: ${productId}`);

  if (quantity === undefined) {
    session.cartItems.splice(index, 1);
  } else {
    if (!Number.isSafeInteger(quantity) || quantity < 1) {
      throw new Error('quantity must be a positive integer');
    }
    const item = session.cartItems[index];
    item.quantity -= quantity;
    if (item.quantity <= 0) session.cartItems.splice(index, 1);
  }
  return cloneSession(session);
}

export function getCart(sessionId: string): CartLine[] {
  const session = requireSession(sessionId);
  return session.cartItems.map((item) => {
    const product = getProduct(item.productId);
    if (!product) throw new Error(`Cart contains unknown product: ${item.productId}`);
    return {
      product,
      quantity: item.quantity,
      lineTotal: product.price * item.quantity,
    };
  });
}

export function getCartTotal(sessionId: string): number {
  return getCart(sessionId).reduce((total, line) => total + line.lineTotal, 0);
}

export function setCommerceSessionStatus(
  sessionId: string,
  status: CommerceSessionStatus,
): CommerceSession {
  const session = requireSession(sessionId);
  session.status = status;
  return cloneSession(session);
}

export function saveTransaction(transaction: TransactionLog): TransactionLog {
  const key = checkoutKey(transaction.sessionId, transaction.idempotencyKey);
  transactions.set(key, cloneTransaction(transaction));
  const record = checkoutRecords.get(key) ?? {
    sessionId: transaction.sessionId,
    idempotencyKey: transaction.idempotencyKey,
  };
  record.transaction = cloneTransaction(transaction);
  delete record.inFlight;
  checkoutRecords.set(key, record);
  return cloneTransaction(transaction);
}

export function getTransaction(
  sessionId: string,
  idempotencyKey: string,
): TransactionLog | undefined {
  const transaction = transactions.get(checkoutKey(sessionId, idempotencyKey));
  return transaction ? cloneTransaction(transaction) : undefined;
}

export function getLatestTransaction(sessionId: string): TransactionLog | undefined {
  const matching = Array.from(transactions.values())
    .filter((transaction) => transaction.sessionId === sessionId)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  return matching[0] ? cloneTransaction(matching[0]) : undefined;
}

export function getCheckoutRecord(
  sessionId: string,
  idempotencyKey: string,
): CheckoutRecord | undefined {
  const record = checkoutRecords.get(checkoutKey(sessionId, idempotencyKey));
  return record
    ? {
        ...record,
        transaction: record.transaction ? cloneTransaction(record.transaction) : undefined,
      }
    : undefined;
}

export async function executeCheckoutOnce(
  sessionId: string,
  idempotencyKey: string,
  operation: () => Promise<TransactionLog>,
): Promise<TransactionLog> {
  requireSession(sessionId);
  const key = checkoutKey(sessionId, idempotencyKey);
  const existing = checkoutRecords.get(key);

  if (existing?.transaction) return cloneTransaction(existing.transaction);
  if (existing?.inFlight) return cloneTransaction(await existing.inFlight);

  const record: CheckoutRecord = { sessionId, idempotencyKey };
  const operationPromise = operation();
  record.inFlight = operationPromise;
  checkoutRecords.set(key, record);

  try {
    const transaction = await operationPromise;
    saveTransaction(transaction);
    return transaction;
  } catch (error) {
    checkoutRecords.delete(key);
    throw error;
  }
}

export function getCommerceSessions(): CommerceSession[] {
  return Array.from(sessions.values()).map(cloneSession);
}

export function getCommerceTransactions(): TransactionLog[] {
  return Array.from(transactions.values()).map(cloneTransaction);
}

function requireSession(sessionId: string): CommerceSession {
  const session = sessions.get(sessionId);
  if (!session) throw new Error(`Commerce session not found: ${sessionId}`);
  return session;
}
