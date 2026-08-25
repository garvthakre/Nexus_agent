import { Router } from 'express';
import { listProducts } from '../commerce/catalog';
import { processConversationTurn } from '../commerce/conversationAgent';
import { approveCheckout, initiateCheckout, rejectCheckout } from '../commerce/safetyGate';
import { runSimulation } from '../commerce/simulatedBuyer';
import {
  addCartItem,
  createCommerceSession,
  getCommerceSession,
  getCommerceSessions,
  getCommerceTransactions,
  getTransaction,
  removeCartItem,
  saveTransaction,
  setCommerceSessionStatus,
} from '../commerce/commerceStore';
import { verifyWebhookSignature } from '../commerce/paymentGateway';

export const commerceRoutes = Router();

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Commerce request failed';
}

function idempotencyKey(req: Parameters<Parameters<typeof commerceRoutes.post>[1]>[0]): string {
  const value = req.header('Idempotency-Key');
  if (!value || value.length > 200) throw new Error('Idempotency-Key header is required and must be at most 200 characters');
  return value;
}

commerceRoutes.get('/commerce/catalog', (_req, res) => {
  res.json({ products: listProducts() });
});

commerceRoutes.post('/commerce/session/start', (req, res) => {
  const buyerType = req.body?.buyerType === 'simulated_agent' ? 'simulated_agent' : 'human';
  res.status(201).json(getCommerceSession(createCommerceSession(buyerType).sessionId));
});

commerceRoutes.get('/commerce/session/:sessionId', (req, res) => {
  const session = getCommerceSession(req.params.sessionId);
  if (!session) {
    res.status(404).json({ error: 'Commerce session not found' });
    return;
  }
  res.json({ session, transaction: getCommerceTransactions().filter((item) => item.sessionId === session.sessionId).at(-1) ?? null });
});

commerceRoutes.post('/commerce/session/:sessionId/message', async (req, res) => {
  try {
    const result = await processConversationTurn(req.params.sessionId, String(req.body?.message ?? ''));
    res.json({ result, session: getCommerceSession(req.params.sessionId) });
  } catch (error) {
    res.status(errorMessage(error).includes('not found') ? 404 : 400).json({ error: errorMessage(error) });
  }
});

commerceRoutes.post('/commerce/session/:sessionId/cart', (req, res) => {
  try {
    const session = addCartItem(req.params.sessionId, String(req.body?.productId ?? ''), Number(req.body?.quantity));
    res.json({ session });
  } catch (error) {
    res.status(errorMessage(error).includes('not found') ? 404 : 400).json({ error: errorMessage(error) });
  }
});

commerceRoutes.delete('/commerce/session/:sessionId/cart/:productId', (req, res) => {
  try {
    res.json({ session: removeCartItem(req.params.sessionId, req.params.productId, req.body?.quantity === undefined ? undefined : Number(req.body.quantity)) });
  } catch (error) {
    res.status(errorMessage(error).includes('not found') ? 404 : 400).json({ error: errorMessage(error) });
  }
});

commerceRoutes.post('/commerce/session/:sessionId/checkout', async (req, res) => {
  try {
    const key = idempotencyKey(req);
    const existing = getTransaction(req.params.sessionId, key);
    if (existing) {
      res.json({ decision: existing.gatingDecision, amount: existing.amount, transaction: existing, replayed: true });
      return;
    }
    const outcome = req.body?.demoOutcome === 'failure' ? 'failure' : 'success';
    const result = await initiateCheckout(req.params.sessionId, key, outcome);
    res.status(result.decision === 'human_approval_required' ? 202 : 200).json(result);
  } catch (error) {
    res.status(errorMessage(error).includes('not found') ? 404 : 409).json({ error: errorMessage(error) });
  }
});

commerceRoutes.post('/commerce/session/:sessionId/approve', async (req, res) => {
  try {
    const transaction = await approveCheckout(req.params.sessionId, idempotencyKey(req));
    res.json({ transaction });
  } catch (error) {
    res.status(errorMessage(error).includes('not found') ? 404 : 409).json({ error: errorMessage(error) });
  }
});

commerceRoutes.post('/commerce/session/:sessionId/reject', (req, res) => {
  try {
    res.json({ transaction: rejectCheckout(req.params.sessionId) });
  } catch (error) {
    res.status(errorMessage(error).includes('not found') ? 404 : 409).json({ error: errorMessage(error) });
  }
});

commerceRoutes.post('/commerce/webhook', (req, res) => {
  const signature = req.header('X-Razorpay-Signature') ?? '';
  const rawBody = JSON.stringify(req.body);
  if (!verifyWebhookSignature(rawBody, signature)) {
    res.status(401).json({ error: 'Invalid webhook signature' });
    return;
  }

  const payment = req.body?.payload?.payment?.entity;
  const orderId = payment?.order_id;
  const status = req.body?.event === 'payment.captured' ? 'captured' : req.body?.event === 'payment.failed' ? 'failed' : undefined;
  const transaction = getCommerceTransactions().find((item) => item.razorpayOrderId === orderId);
  if (transaction && status) {
    saveTransaction({ ...transaction, status });
    setCommerceSessionStatus(transaction.sessionId, status === 'captured' ? 'completed' : 'failed');
  }
  res.json({ received: true });
});

commerceRoutes.get('/commerce/metrics', (_req, res) => {
  const transactions = getCommerceTransactions();
  const sessions = getCommerceSessions();
  const initiated = transactions.length;
  const captured = transactions.filter((transaction) => transaction.status === 'captured').length;
  res.json({
    sessions: sessions.length,
    checkoutInitiated: initiated,
    completionRate: initiated ? captured / initiated : 0,
    captured,
    failed: transactions.filter((transaction) => transaction.status === 'failed').length,
    humanGated: transactions.filter((transaction) => transaction.gatingDecision === 'human_approval_required').length,
    autoApproved: transactions.filter((transaction) => transaction.gatingDecision === 'auto_approved').length,
  });
});

commerceRoutes.post('/commerce/simulate', async (req, res) => {
  try {
    res.json(await runSimulation({
      persona: String(req.body?.persona ?? ''),
      goal: String(req.body?.goal ?? ''),
      maxTurns: Number(req.body?.maxTurns ?? 8),
    }));
  } catch (error) {
    res.status(400).json({ error: errorMessage(error) });
  }
});
