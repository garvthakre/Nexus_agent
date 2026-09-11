import { randomUUID } from 'crypto';
import { prisma } from '../db/prisma';
import { TraceRecord, TraceStepRecord } from '../types';

export async function listTracesForUser(userId: string): Promise<TraceRecord[]> {
  const records = await prisma.$queryRawUnsafe<any[]>(`SELECT * FROM "Trace" WHERE "userId" = $1 ORDER BY "createdAt" DESC LIMIT 100`, userId);
  return records.map((record) => ({
    id: record.id,
    userId: record.userId,
    sessionId: record.sessionId ?? null,
    prompt: record.prompt,
    summary: record.summary ?? null,
    status: record.status,
    provider: record.provider ?? null,
    totalSteps: Number(record.totalSteps ?? 0),
    successfulSteps: Number(record.successfulSteps ?? 0),
    failedSteps: Number(record.failedSteps ?? 0),
    totalTokens: Number(record.totalTokens ?? 0),
    llmLatencyMs: Number(record.llmLatencyMs ?? 0),
    executionLatencyMs: Number(record.executionLatencyMs ?? 0),
    metadata: record.metadata ?? null,
    createdAt: new Date(record.createdAt).toISOString(),
    updatedAt: new Date(record.updatedAt).toISOString(),
  }));
}

export async function getTraceById(traceId: string, userId: string): Promise<TraceRecord | null> {
  const record = await prisma.$queryRawUnsafe<any | null>(`SELECT * FROM "Trace" WHERE "id" = $1 AND "userId" = $2 LIMIT 1`, traceId, userId);
  const trace = Array.isArray(record) ? record[0] : record;
  if (!trace) return null;

  const steps = await prisma.$queryRawUnsafe<any[]>(`SELECT * FROM "TraceStep" WHERE "traceId" = $1 ORDER BY "stepNumber" ASC`, traceId);
  return {
    id: trace.id,
    userId: trace.userId,
    sessionId: trace.sessionId ?? null,
    prompt: trace.prompt,
    summary: trace.summary ?? null,
    status: trace.status,
    provider: trace.provider ?? null,
    totalSteps: Number(trace.totalSteps ?? 0),
    successfulSteps: Number(trace.successfulSteps ?? 0),
    failedSteps: Number(trace.failedSteps ?? 0),
    totalTokens: Number(trace.totalTokens ?? 0),
    llmLatencyMs: Number(trace.llmLatencyMs ?? 0),
    executionLatencyMs: Number(trace.executionLatencyMs ?? 0),
    metadata: trace.metadata ?? null,
    createdAt: new Date(trace.createdAt).toISOString(),
    updatedAt: new Date(trace.updatedAt).toISOString(),
    traceSteps: steps.map((step) => ({
      id: step.id,
      traceId: step.traceId,
      stepNumber: Number(step.stepNumber),
      capability: step.capability,
      description: step.description,
      status: step.status,
      error: step.error ?? null,
      result: step.result ?? null,
      screenshotPath: step.screenshotPath ?? null,
      llmLatencyMs: step.llmLatencyMs ?? null,
      executionLatencyMs: step.executionLatencyMs ?? null,
      tokenUsage: step.tokenUsage ?? null,
      startedAt: new Date(step.startedAt).toISOString(),
      completedAt: step.completedAt ? new Date(step.completedAt).toISOString() : null,
    } satisfies TraceStepRecord)),
  };
}

export async function createTraceRecord(input: {
  userId: string;
  sessionId?: string | null;
  prompt: string;
  summary?: string | null;
  status: string;
  provider?: string | null;
  totalSteps: number;
  successfulSteps: number;
  failedSteps: number;
  totalTokens: number;
  llmLatencyMs: number;
  executionLatencyMs: number;
  metadata?: Record<string, unknown> | null;
}): Promise<string> {
  const traceId = randomUUID();
  await prisma.$queryRawUnsafe<any>(`INSERT INTO "Trace" ("id","userId","sessionId","prompt","summary","status","provider","totalSteps","successfulSteps","failedSteps","totalTokens","llmLatencyMs","executionLatencyMs","metadata","createdAt","updatedAt") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,NOW(),NOW())`,
    traceId,
    input.userId,
    input.sessionId ?? null,
    input.prompt,
    input.summary ?? null,
    input.status,
    input.provider ?? null,
    input.totalSteps,
    input.successfulSteps,
    input.failedSteps,
    input.totalTokens,
    input.llmLatencyMs,
    input.executionLatencyMs,
    input.metadata ?? null,
  );
  return traceId;
}

export async function appendTraceStep(input: {
  traceId: string;
  stepNumber: number;
  capability: string;
  description: string;
  status: string;
  error?: string | null;
  result?: Record<string, unknown> | null;
  screenshotPath?: string | null;
  llmLatencyMs?: number | null;
  executionLatencyMs?: number | null;
  tokenUsage?: number | null;
}): Promise<void> {
  await prisma.$queryRawUnsafe<any>(`INSERT INTO "TraceStep" ("id","traceId","stepNumber","capability","description","status","error","result","screenshotPath","llmLatencyMs","executionLatencyMs","tokenUsage","startedAt","completedAt") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,NOW(),NOW())`,
    randomUUID(),
    input.traceId,
    input.stepNumber,
    input.capability,
    input.description,
    input.status,
    input.error ?? null,
    input.result ?? null,
    input.screenshotPath ?? null,
    input.llmLatencyMs ?? null,
    input.executionLatencyMs ?? null,
    input.tokenUsage ?? null,
  );
}
