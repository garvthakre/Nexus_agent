import { randomUUID } from 'crypto';
import { prisma } from '../db/prisma';
import { UserWebhookConfig } from '../types';

export type WebhookEventName = 'execution.started' | 'execution.completed' | 'execution.failed' | 'step.error';

export async function listWebhooksForUser(userId: string): Promise<UserWebhookConfig[]> {
  const rows = await prisma.$queryRawUnsafe<any[]>(`SELECT * FROM "UserWebhook" WHERE "userId" = $1 ORDER BY "createdAt" DESC`, userId);
  return rows.map((row) => ({
    id: row.id,
    userId: row.userId,
    name: row.name ?? null,
    url: row.url,
    events: Array.isArray(row.events) ? row.events : [],
    active: Boolean(row.active),
    headers: row.headers ?? null,
    createdAt: new Date(row.createdAt).toISOString(),
    updatedAt: new Date(row.updatedAt).toISOString(),
  }));
}

export async function registerWebhookForUser(userId: string, data: { name?: string; url: string; events: WebhookEventName[]; active?: boolean; headers?: Record<string, string> }): Promise<UserWebhookConfig> {
  const row = await prisma.$queryRawUnsafe<any>(`INSERT INTO "UserWebhook" ("id","userId","name","url","events","active","headers","createdAt","updatedAt") VALUES ($1,$2,$3,$4,$5,$6,$7,NOW(),NOW()) RETURNING *`,
    randomUUID(),
    userId,
    data.name ?? null,
    data.url,
    JSON.stringify(data.events ?? []),
    data.active ?? true,
    data.headers ? JSON.stringify(data.headers) : null,
  );

  const record = row[0];
  return {
    id: record.id,
    userId: record.userId,
    name: record.name ?? null,
    url: record.url,
    events: Array.isArray(record.events) ? record.events : [],
    active: Boolean(record.active),
    headers: record.headers ?? null,
    createdAt: new Date(record.createdAt).toISOString(),
    updatedAt: new Date(record.updatedAt).toISOString(),
  };
}

export async function dispatchWebhook(event: WebhookEventName, payload: Record<string, unknown>, userId?: string): Promise<void> {
  if (!userId) return;

  const webhooks = await listWebhooksForUser(userId);
  const applicable = webhooks.filter((entry) => entry.active && entry.events.includes(event));

  await Promise.all(applicable.map(async (webhook) => {
    try {
      await fetch(webhook.url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(webhook.headers ?? {}),
        },
        body: JSON.stringify({ event, payload, deliveredAt: new Date().toISOString() }),
      });
    } catch (error) {
      console.error(`[Webhook] Failed for ${webhook.url}:`, error);
    }
  }));
}

export async function deleteWebhookForUser(userId: string, webhookId: string): Promise<void> {
  await prisma.$queryRawUnsafe(`DELETE FROM "UserWebhook" WHERE "id" = $1 AND "userId" = $2`, webhookId, userId);
}
