import { Router } from 'express';
import { prisma } from '../db/prisma';
import { requireAuth } from '../middleware/auth';
import { apiKeySchema } from '../validation/schemas';
import { encryptKey } from '../utils/encryption';

export const keyRoutes = Router();
keyRoutes.use(requireAuth);

keyRoutes.post('/api/keys', async (req, res) => {
  try {
    const parsed = apiKeySchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message }); return; }
    const key = await prisma.userApiKey.upsert({
      where: { userId_provider: { userId: req.user!.userId, provider: parsed.data.provider } },
      create: { userId: req.user!.userId, provider: parsed.data.provider, encryptedKey: encryptKey(parsed.data.key) },
      update: { encryptedKey: encryptKey(parsed.data.key) },
    });
    res.status(201).json({ id: key.id, provider: key.provider, updatedAt: key.updatedAt });
  } catch (error) {
    console.error('[Keys] Save failed:', error);
    res.status(500).json({ error: 'API key service unavailable' });
  }
});

keyRoutes.get('/api/keys', async (req, res) => {
  try {
    const keys = await prisma.userApiKey.findMany({
      where: { userId: req.user!.userId },
      select: { provider: true, createdAt: true, updatedAt: true },
      orderBy: { provider: 'asc' },
    });
    res.json(keys);
  } catch (error) {
    console.error('[Keys] List failed:', error);
    res.status(500).json({ error: 'API key service unavailable' });
  }
});
