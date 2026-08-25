import { getCartTotal, getLatestTransaction, getCommerceSession, setCommerceSessionStatus, TransactionLog, executeCheckoutOnce, saveTransaction } from './commerceStore';
import { createRazorpayOrder, buildSimulatedPayment, PaymentResult } from './paymentGateway';
import { logCommerceEvent } from '../utils/Executionlogger';

export interface GateResult {
  decision: 'auto_approved' | 'human_approval_required';
  amount: number;
  transaction?: TransactionLog;
}

function threshold(): number {
  const configured = Number(process.env.COMMERCE_AUTO_APPROVAL_LIMIT ?? 5000);
  return Number.isFinite(configured) && configured >= 0 ? configured : 5000;
}

export async function initiateCheckout(
  sessionId: string,
  idempotencyKey: string,
  outcome: 'success' | 'failure' = 'success',
): Promise<GateResult> {
  const session = getCommerceSession(sessionId);
  if (!session) throw new Error(`Commerce session not found: ${sessionId}`);
  const previous = getLatestTransaction(sessionId);
  if (previous?.status === 'captured') throw new Error('Session already has a captured transaction');

  const amountRupees = getCartTotal(sessionId);
  if (amountRupees < 1) throw new Error('Cannot checkout with an empty cart');
  const decision = amountRupees > threshold() ? 'human_approval_required' : 'auto_approved';
  const reasoning = decision === 'auto_approved'
    ? `Cart total INR ${amountRupees} is at or below the auto-approval limit of INR ${threshold()}.`
    : `Cart total INR ${amountRupees} exceeds the auto-approval limit of INR ${threshold()}.`;

  if (decision === 'human_approval_required') {
    const transaction: TransactionLog = {
      sessionId,
      razorpayOrderId: '',
      amount: amountRupees,
      status: 'created',
      gatingDecision: decision,
      reasoning,
      createdAt: new Date().toISOString(),
      idempotencyKey,
    };
    saveTransaction(transaction);
    setCommerceSessionStatus(sessionId, 'payment_pending');
    void logCommerceEvent({ timestamp: new Date().toISOString(), event: 'checkout_gated', sessionId, amount: amountRupees, status: transaction.status, gatingDecision: decision, reasoning });
    return { decision, amount: amountRupees, transaction };
  }

  const transaction = await executeCheckoutOnce(sessionId, idempotencyKey, async () => {
    const order = await createRazorpayOrder(amountRupees * 100, `nexus_${sessionId}`);
    const initial: TransactionLog = {
      sessionId,
      razorpayOrderId: order.id,
      amount: amountRupees,
      status: 'created',
      gatingDecision: decision,
      reasoning,
      createdAt: new Date().toISOString(),
      idempotencyKey,
    };
    const payment: PaymentResult = buildSimulatedPayment(initial, outcome);
    setCommerceSessionStatus(sessionId, payment.transaction.status === 'captured' ? 'completed' : 'failed');
    void logCommerceEvent({ timestamp: new Date().toISOString(), event: payment.transaction.status === 'captured' ? 'payment_captured' : 'payment_failed', sessionId, transactionId: order.id, amount: amountRupees, status: payment.transaction.status, gatingDecision: decision, reasoning, message: payment.recoveryMessage });
    return payment.transaction;
  });
  return { decision, amount: amountRupees, transaction };
}

export async function approveCheckout(sessionId: string, idempotencyKey: string): Promise<TransactionLog> {
  const session = getCommerceSession(sessionId);
  if (!session) throw new Error(`Commerce session not found: ${sessionId}`);
  const existing = getLatestTransaction(sessionId);
  if (!existing || existing.status !== 'created' || existing.gatingDecision !== 'human_approval_required') {
    throw new Error('No pending human approval exists for this session');
  }
  const order = await createRazorpayOrder(existing.amount * 100, `nexus_${sessionId}`);
  const approved: TransactionLog = { ...existing, idempotencyKey, razorpayOrderId: order.id, gatingDecision: 'human_approved', status: 'created' };
  saveTransaction(approved);
  setCommerceSessionStatus(sessionId, 'payment_pending');
  return approved;
}

export function rejectCheckout(sessionId: string): TransactionLog {
  const existing = getLatestTransaction(sessionId);
  if (!existing || existing.status !== 'created') throw new Error('No pending checkout exists for this session');
  const rejected = { ...existing, status: 'failed' as const, gatingDecision: 'human_rejected' };
  saveTransaction(rejected);
  setCommerceSessionStatus(sessionId, 'failed');
  return rejected;
}
