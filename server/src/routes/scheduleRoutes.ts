import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth';
import {
  listSchedulesForUser,
  getScheduleById,
  createScheduleForUser,
  updateScheduleForUser,
  deleteScheduleForUser,
} from '../services/scheduleService';
import { syncSchedule, removeSchedule } from '../services/schedulerDaemon';

export const scheduleRoutes = Router();
scheduleRoutes.use(requireAuth);

// ─── List ─────────────────────────────────────────────────────────────────────

scheduleRoutes.get('/api/schedules', async (req, res) => {
  try {
    const schedules = await listSchedulesForUser(req.user!.userId);
    res.json({ schedules });
  } catch (error) {
    console.error('[Schedule] list failed:', error);
    res.status(500).json({ error: 'Schedule listing unavailable' });
  }
});

// ─── Get One ──────────────────────────────────────────────────────────────────

scheduleRoutes.get('/api/schedules/:scheduleId', async (req, res) => {
  try {
    const parsed = z.string().uuid().safeParse(req.params.scheduleId);
    if (!parsed.success) { res.status(400).json({ error: 'Invalid scheduleId' }); return; }

    const schedule = await getScheduleById(parsed.data, req.user!.userId);
    if (!schedule) { res.status(404).json({ error: 'Schedule not found' }); return; }

    res.json({ schedule });
  } catch (error) {
    console.error('[Schedule] detail failed:', error);
    res.status(500).json({ error: 'Schedule detail unavailable' });
  }
});

// ─── Create ───────────────────────────────────────────────────────────────────

scheduleRoutes.post('/api/schedules', async (req, res) => {
  try {
    const schema = z.object({
      name: z.string().trim().min(1).max(120),
      prompt: z.string().trim().min(1).max(10000),
      cronExpression: z.string().trim().min(5).max(100),
      enabled: z.boolean().optional(),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message });
      return;
    }

    const schedule = await createScheduleForUser(req.user!.userId, parsed.data);
    syncSchedule(schedule);
    res.status(201).json({ schedule });
  } catch (error) {
    console.error('[Schedule] create failed:', error);
    res.status(500).json({ error: 'Schedule creation unavailable' });
  }
});

// ─── Update ───────────────────────────────────────────────────────────────────

scheduleRoutes.patch('/api/schedules/:scheduleId', async (req, res) => {
  try {
    const idParsed = z.string().uuid().safeParse(req.params.scheduleId);
    if (!idParsed.success) { res.status(400).json({ error: 'Invalid scheduleId' }); return; }

    const schema = z.object({
      name: z.string().trim().min(1).max(120).optional(),
      prompt: z.string().trim().min(1).max(10000).optional(),
      cronExpression: z.string().trim().min(5).max(100).optional(),
      enabled: z.boolean().optional(),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message });
      return;
    }

    const schedule = await updateScheduleForUser(req.user!.userId, idParsed.data, parsed.data);
    if (!schedule) { res.status(404).json({ error: 'Schedule not found' }); return; }

    syncSchedule(schedule);
    res.json({ schedule });
  } catch (error) {
    console.error('[Schedule] update failed:', error);
    res.status(500).json({ error: 'Schedule update unavailable' });
  }
});

// ─── Trigger Now (Manual Execution) ───────────────────────────────────────────

scheduleRoutes.post('/api/schedules/:scheduleId/run', async (req, res) => {
  try {
    const parsed = z.string().uuid().safeParse(req.params.scheduleId);
    if (!parsed.success) { res.status(400).json({ error: 'Invalid scheduleId' }); return; }

    const schedule = await getScheduleById(parsed.data, req.user!.userId);
    if (!schedule) { res.status(404).json({ error: 'Schedule not found' }); return; }

    // Import and trigger runner
    const { triggerScheduleNow } = await import('../services/schedulerDaemon');
    const result = await triggerScheduleNow(schedule);
    res.json({ message: 'Execution started', ...result });
  } catch (error) {
    console.error('[Schedule] run failed:', error);
    res.status(500).json({ error: (error as Error).message || 'Schedule execution failed' });
  }
});

scheduleRoutes.delete('/api/schedules/:scheduleId', async (req, res) => {
  try {
    const parsed = z.string().uuid().safeParse(req.params.scheduleId);
    if (!parsed.success) { res.status(400).json({ error: 'Invalid scheduleId' }); return; }

    await deleteScheduleForUser(req.user!.userId, parsed.data);
    removeSchedule(parsed.data);
    res.status(204).send();
  } catch (error) {
    console.error('[Schedule] delete failed:', error);
    res.status(500).json({ error: 'Schedule deletion unavailable' });
  }
});
