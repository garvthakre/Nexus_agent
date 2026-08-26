import { prisma } from '../db/prisma';
import { Plan, Session } from '../types';

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
  const record = await prisma.session.create({
    data: { userId, plan: plan as object, status: 'planned' },
  });
  const session = toSession(record);
  return { sessionId: record.id, session };
}

export async function getSession(userId: string, sessionId: string): Promise<Session | undefined> {
  const record = await prisma.session.findFirst({ where: { id: sessionId, userId } });
  return record ? toSession(record) : undefined;
}

export async function saveSession(session: Session): Promise<void> {
  await prisma.session.update({
    where: { id: session.sessionId },
    data: { plan: session.plan as object, status: session.status, currentStep: session.currentStep, stopped: session.stopped },
  });
}

export async function logStep(sessionId: string, stepNumber: number, data: { status: string; result?: unknown; error?: string; durationMs?: number }): Promise<void> {
  await prisma.stepLog.create({ data: { sessionId, stepNumber, ...data, result: data.result as object | undefined } });
}
