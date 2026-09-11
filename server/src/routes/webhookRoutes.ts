import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth';
import { dispatchWebhook, deleteWebhookForUser, listWebhooksForUser, registerWebhookForUser } from '../services/webhookService';

export const webhookRoutes = Router();
webhookRoutes.use(requireAuth);

webhookRoutes.get('/api/webhooks', async (req, res) => {
  try {
    const webhooks = await listWebhooksForUser(req.user!.userId);
    res.json({ webhooks });
  } catch (error) {
    console.error('[Webhook] list failed:', error);
    res.status(500).json({ error: 'Webhook listing unavailable' });
  }
});

webhookRoutes.post('/api/webhooks', async (req, res) => {
  try {
    const schema = z.object({
      name: z.string().trim().min(1).max(120).optional(),
      url: z.string().url(),
      events: z.array(z.enum(['execution.started', 'execution.completed', 'execution.failed', 'step.error'])).min(1),
      active: z.boolean().optional(),
      headers: z.record(z.string(), z.string()).optional(),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message });
      return;
    }

    const webhook = await registerWebhookForUser(req.user!.userId, parsed.data);
    res.status(201).json({ webhook });
  } catch (error) {
    console.error('[Webhook] register failed:', error);
    res.status(500).json({ error: 'Webhook registration unavailable' });
  }
});

webhookRoutes.delete('/api/webhooks/:webhookId', async (req, res) => {
  try {
    const parsed = z.string().uuid().safeParse(req.params.webhookId);
    if (!parsed.success) { res.status(400).json({ error: 'Invalid webhookId' }); return; }
    await deleteWebhookForUser(req.user!.userId, parsed.data);
    res.status(204).send();
  } catch (error) {
    console.error('[Webhook] delete failed:', error);
    res.status(500).json({ error: 'Webhook deletion unavailable' });
  }
});

webhookRoutes.post('/api/webhooks/:webhookId/test', async (req, res) => {
  try {
    const webhook = (await listWebhooksForUser(req.user!.userId)).find((entry) => entry.id === req.params.webhookId);
    if (!webhook) { res.status(404).json({ error: 'Webhook not found' }); return; }
    const event = webhook.events[0] as 'execution.started' | 'execution.completed' | 'execution.failed' | 'step.error' | undefined;
    if (!event) { res.status(400).json({ error: 'Webhook has no subscribed events' }); return; }
    await dispatchWebhook(event, { test: true, webhookId: webhook.id }, req.user!.userId);
    res.json({ status: 'sent', event });
  } catch (error) {
    console.error('[Webhook] test failed:', error);
    res.status(500).json({ error: 'Webhook test unavailable' });
  }
});
