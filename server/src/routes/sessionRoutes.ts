import { Router } from 'express'
import { getSession } from '../services/sessionService'
import { requireAuth } from '../middleware/auth'
import { z } from 'zod'

export const sessionRoutes = Router()

sessionRoutes.get('/api/session/:sessionId', requireAuth, async (req, res) => {
  if (!z.string().uuid().safeParse(req.params.sessionId).success) {
    res.status(400).json({ error: 'Invalid sessionId' })
    return
  }
  const session = await getSession(req.user!.userId, req.params.sessionId)
  if (!session) {
    res.status(404).json({ error: 'Session not found' })
    return
  }
  res.json(session)
})
