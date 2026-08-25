import { createHmac } from 'crypto';
import { TransactionLog } from './commerceStore';

interface RazorpayOrder {
  id: string;
  amount: number;
  currency: string;
  status: string;
}

export interface PaymentResult {
  transaction: TransactionLog;
  recoveryMessage?: string;
}

function credentials(): string {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) throw new Error('Razorpay credentials are not configured');
  return Buffer.from(`${keyId}:${keySecret}`).toString('base64');
}

export async function createRazorpayOrder(amount: number, receipt: string): Promise<RazorpayOrder> {
  if (!Number.isSafeInteger(amount) || amount < 1) throw new Error('Razorpay amount must be a positive integer in paise');
  const response = await fetch('https://api.razorpay.com/v1/orders', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ amount, currency: 'INR', receipt, payment_capture: 1 }),
  });
  if (!response.ok) throw new Error(`Razorpay order creation failed (${response.status})`);
  return await response.json() as RazorpayOrder;
}

export function buildSimulatedPayment(
  transaction: TransactionLog,
  outcome: 'success' | 'failure',
): PaymentResult {
  if (outcome === 'failure') {
    return {
      transaction: { ...transaction, status: 'failed' },
      recoveryMessage: "That payment didn't go through. Would you like to retry or use a different method?",
    };
  }
  return { transaction: { ...transaction, status: 'captured' } };
}

export function verifyWebhookSignature(rawBody: string, signature: string): boolean {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret || !signature) return false;
  const digest = createHmac('sha256', secret).update(rawBody).digest('hex');
  return digest === signature;
}
