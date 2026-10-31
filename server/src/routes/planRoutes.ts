import { Router } from 'express'
import { planTask } from '../ai/planner'
import { reviewPlan } from '../ai/reviewer'
import { createSession } from '../services/sessionService'
import { broadcast, registerSessionOwner } from '../services/websocketService'
import { ReviewRequest } from '../types'
import { requireAuth } from '../middleware/auth'
import { promptSchema } from '../validation/schemas'
import { scanCurrentPage } from '../executor/stepExecutor'

export const planRoutes = Router()

function isPaytmDthNavigationRequest(prompt: string, pageUrl: string): boolean {
  try {
    const hostname = new URL(pageUrl).hostname.replace(/^www\./, '')
    return hostname === 'paytm.com' && /\b(?:dth|dish\s*(?:tv|recharge)?)\b/i.test(prompt)
  } catch {
    return false
  }
}

planRoutes.post('/api/plan', requireAuth, async (req, res) => {
  try {
    const parsed = promptSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message })
      return
    }
    let { prompt, requireCurrentPage } = parsed.data
    const userPrompt = prompt
    let currentPageUrl = ''

    // ── Auto-scan the currently open page when connected via CDP ──
    // This gives the AI planner full context about what's on screen
    // so it can plan steps that work ON the current tab, not open new ones.
    try {
      const pageScan = await scanCurrentPage()
      currentPageUrl = pageScan.url
      if (requireCurrentPage && !pageScan.cdpConnected) {
        res.status(409).json({
          error: 'This panel is not connected to the browser tab. Open the page in Nexus Chrome (run "npm run chrome") and try again.',
        })
        return
      }
      const isInternalNexus = pageScan.url.includes('localhost:3000') || pageScan.url.includes('127.0.0.1:3000') || pageScan.url.includes('localhost:3001');
      if (pageScan.cdpConnected && pageScan.url && pageScan.url !== 'about:blank' && !isInternalNexus) {
        const inputList = pageScan.inputs
          .map(i => `  [${i.type}] ${i.selector} | label="${i.label}" placeholder="${i.placeholder}" name="${i.name}" value="${i.value}"`)
          .join('\n')
        const buttonList = pageScan.buttons
          .map(b => `  ${b.selector} → "${b.text}"`)
          .join('\n')
        const linkList = pageScan.links
          .map(link => `  ${link.href} → "${link.text}"`)
          .join('\n')

        const pageContext = [
          `\n\n[CURRENT PAGE CONTEXT — CDP connected to user's existing Chrome tab]`,
          `URL: ${pageScan.url}`,
          `Title: ${pageScan.title}`,
          `Page text (truncated): ${pageScan.text.slice(0, 800)}`,
          inputList ? `Visible inputs:\n${inputList}` : 'No visible inputs',
          buttonList ? `Visible buttons:\n${buttonList}` : 'No visible buttons',
          linkList ? `Visible links:\n${linkList}` : 'No visible links',
          `\nIMPORTANT: The user is ALREADY on this page. Do NOT use browser_open to navigate away unless the task explicitly requires a different site.`,
          `Start by interacting with the CURRENT page elements listed above (browser_fill, browser_click).`,
          `If a click leads to a new page/section within the same site, continue from there.`,
          `Use browser_click for a visible same-site destination; use browser_open only when no clickable destination is available. Both actions must stay in this same tab.`,
        ].join('\n')

        prompt = prompt + pageContext
        console.log(`[Plan] Injected current-page context: "${pageScan.title}" @ ${pageScan.url} (${pageScan.inputs.length} inputs, ${pageScan.buttons.length} buttons)`)
      }
    } catch (scanErr) {
      // No CDP or no page — proceed without page context
      console.log('[Plan] No current page context available (CDP not connected or no page)')
    }

    broadcast({ type: 'planning', message: 'Analyzing your request...' }, req.user!.userId)
    const plan = await planTask(prompt, req.user!.userId)

    // Paytm's homepage cards change frequently, so an AI-generated text click
    // is not reliable here. This is navigation only (no payment action) and
    // browser_open keeps the user in the same CDP-controlled tab.
    if (requireCurrentPage && isPaytmDthNavigationRequest(userPrompt, currentPageUrl)) {
      plan.intent = 'paytm_dth_recharge_navigation'
      plan.summary = 'Open the Paytm DTH recharge page in the current tab.'
      plan.steps = [{
        step_number: 1,
        capability: 'browser_open',
        parameters: {
          url: 'https://paytm.com/recharge/dth',
          expected_url_includes: '/recharge/dth',
        },
        description: 'Open the Paytm DTH recharge page in the current tab',
        safety_risk: 'low',
      }]
    }
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
