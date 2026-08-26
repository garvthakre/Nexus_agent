import { Router } from 'express'
import { planTask } from '../ai/planner'
import { reviewPlan } from '../ai/reviewer'
import { createSession } from '../services/sessionService'
import { broadcast, registerSessionOwner } from '../services/websocketService'
import { ReviewRequest } from '../types'
import { requireAuth } from '../middleware/auth'
import { promptSchema } from '../validation/schemas'

export const planRoutes = Router()

planRoutes.post('/api/plan', requireAuth, async (req, res) => {
  try {
    const parsed = promptSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message })
      return
    }
    const { prompt } = parsed.data

    broadcast({ type: 'planning', message: 'Analyzing your request...' }, req.user!.userId)
    const plan = await planTask(prompt, req.user!.userId)
    const { sessionId } = await createSession(req.user!.userId, plan)
    registerSessionOwner(sessionId, req.user!.userId)

    broadcast({ type: 'plan_ready', sessionId, plan }, req.user!.userId)
    res.json({ sessionId, plan })
  } catch (err: unknown) {
    const e = err as {
      status?: number
      message?: string
      code?: string
      request_id?: string
      headers?: { ['x-groq-region']?: string }
      error?: { code?: string; message?: string }
    }
    const message = e.error?.message ?? e.message ?? 'Planning failed'
    const code = e.error?.code ?? e.code

    console.error('[API /api/plan] Planning failed', {
      status: e.status,
      code,
      message,
      requestId: e.request_id,
      region: e.headers?.['x-groq-region'],
    })

    broadcast({ type: 'error', message }, req.user?.userId)
    res.status(500).json({ error: message })
  }
})

planRoutes.post('/api/review', requireAuth, async (req, res) => {
  try {
    const { plan } = req.body as ReviewRequest
    if (!plan) {
      res.status(400).json({ error: 'plan is required' })
      return
    }
    const review = await reviewPlan(plan, req.user!.userId)
    res.json(review)
  } catch (err: unknown) {
    res.status(500).json({ error: (err as Error).message })
  }
})
