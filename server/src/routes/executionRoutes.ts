import { Router } from 'express'
import { getSession, saveSession } from '../services/sessionService'
import { executeAllSteps } from '../services/executionService'
import { broadcast } from '../services/websocketService'
import { ExecuteRequest, StopRequest } from '../types'
import { requireAuth } from '../middleware/auth'
import { sessionIdSchema } from '../validation/schemas'

export const executionRoutes = Router()

executionRoutes.post('/api/execute', requireAuth, async (req, res) => {
  try {
    const parsed = sessionIdSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: 'Valid sessionId is required' })
      return
    }

    const session = await getSession(req.user!.userId, parsed.data.sessionId)
    if (!session) {
      res.status(404).json({ error: 'Session not found' })
      return
    }

    session.status = 'executing'
    session.stopped = false

    await saveSession(session)
    broadcast({ type: 'execution_start', sessionId: parsed.data.sessionId, totalSteps: session.plan.steps.length })
    res.json({ status: 'executing', message: 'Execution started' })
    void executeAllSteps(parsed.data.sessionId, session)
  } catch (err: unknown) {
    res.status(500).json({ error: (err as Error).message })
  }
})

executionRoutes.post('/api/stop', requireAuth, async (req, res) => {
  const { sessionId } = req.body as StopRequest
  const parsed = sessionIdSchema.safeParse({ sessionId })
  if (!parsed.success) { res.status(400).json({ error: 'Valid sessionId is required' }); return }
  const session = await getSession(req.user!.userId, parsed.data.sessionId)
  if (session) {
    session.stopped = true
    await saveSession(session)
    broadcast({ type: 'execution_stopped', sessionId: parsed.data.sessionId })
  }
  res.json({ status: 'stopped' })
})
