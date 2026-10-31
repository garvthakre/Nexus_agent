import { prisma } from '../db/prisma';
import { Plan, Session } from '../types';

/**
 * Recursively cleanses non-ASCII/WIN1252 characters (like the Indian Rupee sign '₹' U+20B9)
 * from strings and objects so they can be stored in PostgreSQL databases initialized with WIN1252 encoding.
 */
function sanitizeForDb<T>(obj: T): T {
  if (typeof obj === 'string') {
    return obj
      .replace(/₹/g, 'Rs.')
      .replace(/[\u20B9]/g, 'Rs.')
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/[\u201C\u201D]/g, '"')
      .replace(/[\u2013\u2014]/g, '-') as unknown as T;
  }
  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeForDb(item)) as unknown as T;
  }
  if (obj !== null && typeof obj === 'object') {
    const cleaned: any = {};
    for (const [k, v] of Object.entries(obj)) {
      cleaned[k] = sanitizeForDb(v);
    }
    return cleaned as T;
  }
  return obj;
}

function toSession(record: { id: string; userId: string; plan: unknown; status: string; currentStep: number; stopped: boolean }): Session {
  return {
    sessionId: record.id,
    userId: record.userId,
    plan: record.plan as Plan,
    status: record.status,
    currentStep: record.currentStep,
    stopped: record.stopped,
  };
}

export async function createSession(userId: string, plan: Plan): Promise<{ sessionId: string; session: Session }> {
  const sanitizedPlan = sanitizeForDb(plan);
  const record = await prisma.session.create({
    data: { userId, plan: sanitizedPlan as object, status: 'planned' },
  });
  const session = toSession(record);
  return { sessionId: record.id, session };
}

export async function getSession(userId: string, sessionId: string): Promise<Session | undefined> {
  const record = await prisma.session.findFirst({ where: { id: sessionId, userId } });
  return record ? toSession(record) : undefined;
}

export async function saveSession(session: Session): Promise<void> {
  const sanitizedPlan = sanitizeForDb(session.plan);
  await prisma.session.update({
    where: { id: session.sessionId },
    data: { plan: sanitizedPlan as object, status: session.status, currentStep: session.currentStep, stopped: session.stopped },
  });
}

export async function logStep(sessionId: string, stepNumber: number, data: { status: string; result?: unknown; error?: string; durationMs?: number }): Promise<void> {
  const sanitizedData = sanitizeForDb(data);
  await prisma.stepLog.create({ data: { sessionId, stepNumber, ...sanitizedData, result: sanitizedData.result as object | undefined } });
}
