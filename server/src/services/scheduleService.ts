import { randomUUID } from 'crypto';
import { prisma } from '../db/prisma';
import { ScheduleRecord } from '../types';

// ─── Row Mapper ───────────────────────────────────────────────────────────────

function toScheduleRecord(row: any): ScheduleRecord {
  return {
    id: row.id,
    userId: row.userId,
    name: row.name,
    prompt: row.prompt,
    cronExpression: row.cronExpression,
    enabled: Boolean(row.enabled),
    lastRunAt: row.lastRunAt ? new Date(row.lastRunAt).toISOString() : null,
    nextRunAt: row.nextRunAt ? new Date(row.nextRunAt).toISOString() : null,
    lastStatus: row.lastStatus ?? null,
    lastSessionId: row.lastSessionId ?? null,
    createdAt: new Date(row.createdAt).toISOString(),
    updatedAt: new Date(row.updatedAt).toISOString(),
  };
}

// ─── List ─────────────────────────────────────────────────────────────────────

export async function listSchedulesForUser(userId: string): Promise<ScheduleRecord[]> {
  const rows = await prisma.$queryRawUnsafe<any[]>(
    `SELECT * FROM "Schedule" WHERE "userId" = $1 ORDER BY "createdAt" DESC`,
    userId,
  );
  return rows.map(toScheduleRecord);
}

// ─── Get By Id ────────────────────────────────────────────────────────────────

export async function getScheduleById(scheduleId: string, userId: string): Promise<ScheduleRecord | null> {
  const rows = await prisma.$queryRawUnsafe<any[]>(
    `SELECT * FROM "Schedule" WHERE "id" = $1 AND "userId" = $2 LIMIT 1`,
    scheduleId,
    userId,
  );
  return rows[0] ? toScheduleRecord(rows[0]) : null;
}

// ─── Create ───────────────────────────────────────────────────────────────────

export async function createScheduleForUser(
  userId: string,
  data: { name: string; prompt: string; cronExpression: string; enabled?: boolean },
): Promise<ScheduleRecord> {
  const id = randomUUID();
  const rows = await prisma.$queryRawUnsafe<any[]>(
    `INSERT INTO "Schedule" ("id","userId","name","prompt","cronExpression","enabled","createdAt","updatedAt")
     VALUES ($1,$2,$3,$4,$5,$6,NOW(),NOW()) RETURNING *`,
    id,
    userId,
    data.name,
    data.prompt,
    data.cronExpression,
    data.enabled ?? true,
  );
  return toScheduleRecord(rows[0]);
}

// ─── Update ───────────────────────────────────────────────────────────────────

export async function updateScheduleForUser(
  userId: string,
  scheduleId: string,
  data: { name?: string; prompt?: string; cronExpression?: string; enabled?: boolean },
): Promise<ScheduleRecord | null> {
  const existing = await getScheduleById(scheduleId, userId);
  if (!existing) return null;

  const rows = await prisma.$queryRawUnsafe<any[]>(
    `UPDATE "Schedule"
     SET "name" = $1, "prompt" = $2, "cronExpression" = $3, "enabled" = $4, "updatedAt" = NOW()
     WHERE "id" = $5 AND "userId" = $6 RETURNING *`,
    data.name ?? existing.name,
    data.prompt ?? existing.prompt,
    data.cronExpression ?? existing.cronExpression,
    data.enabled ?? existing.enabled,
    scheduleId,
    userId,
  );
  return rows[0] ? toScheduleRecord(rows[0]) : null;
}

// ─── Mark Run ─────────────────────────────────────────────────────────────────

export async function markScheduleRun(
  scheduleId: string,
  status: string,
  sessionId: string | null,
): Promise<void> {
  await prisma.$queryRawUnsafe(
    `UPDATE "Schedule" SET "lastRunAt" = NOW(), "lastStatus" = $1, "lastSessionId" = $2, "updatedAt" = NOW() WHERE "id" = $3`,
    status,
    sessionId,
    scheduleId,
  );
}

// ─── Delete ───────────────────────────────────────────────────────────────────

export async function deleteScheduleForUser(userId: string, scheduleId: string): Promise<void> {
  await prisma.$queryRawUnsafe(
    `DELETE FROM "Schedule" WHERE "id" = $1 AND "userId" = $2`,
    scheduleId,
    userId,
  );
}

// ─── List All Enabled (for daemon boot) ───────────────────────────────────────

export async function listAllEnabledSchedules(): Promise<ScheduleRecord[]> {
  const rows = await prisma.$queryRawUnsafe<any[]>(
    `SELECT * FROM "Schedule" WHERE "enabled" = true ORDER BY "createdAt" ASC`,
  );
  return rows.map(toScheduleRecord);
}
