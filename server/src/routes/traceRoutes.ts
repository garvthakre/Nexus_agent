import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth';
import { listTracesForUser, getTraceById } from '../services/traceService';

export const traceRoutes = Router();
traceRoutes.use(requireAuth);

traceRoutes.get('/api/traces', async (req, res) => {
  try {
    const traces = await listTracesForUser(req.user!.userId);
    res.json({ traces });
  } catch (error) {
    console.error('[Trace] list failed:', error);
    res.status(500).json({ error: 'Trace listing unavailable' });
  }
});

traceRoutes.get('/api/traces/:traceId', async (req, res) => {
  try {
    const parsed = z.string().uuid().safeParse(req.params.traceId);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid traceId' });
      return;
    }

    const trace = await getTraceById(parsed.data, req.user!.userId);
    if (!trace) {
      res.status(404).json({ error: 'Trace not found' });
      return;
    }

    res.json({ trace });
  } catch (error) {
    console.error('[Trace] detail failed:', error);
    res.status(500).json({ error: 'Trace detail unavailable' });
  }
});
