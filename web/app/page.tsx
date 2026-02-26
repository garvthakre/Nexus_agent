'use client'
import { useState, useEffect, useCallback } from 'react'
import { useWebSocket } from '@/hooks/useWebSocket'
import { api } from '@/lib/api'
import Header from '@/components/Header'
import PromptInput from '@/components/PromptInput'
import PlanDisplay from '@/components/PlanDisplay'
import ActivityLog from '@/components/ActivityLog'
import {
  Plan, ReviewResult, ExecutionState, ActivityEvent,
  WsMessage, WsMessageType,
} from '@/types'

const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? 'ws://localhost:3001'

const INITIAL_EXECUTION_STATE: ExecutionState = {
  status: 'idle',
  currentStep: null,
  completedSteps: [],
  failedStep: null,
  stepResults: {},
  summary: null,
}

export default function HomePage() {
  const { connected, subscribe } = useWebSocket(WS_URL)

  const [loading, setLoading]               = useState(false)
  const [reviewing, setReviewing]           = useState(false)
  const [plan, setPlan]                     = useState<Plan | null>(null)
  const [sessionId, setSessionId]           = useState<string | null>(null)
  const [review, setReview]                 = useState<ReviewResult | null>(null)
  const [events, setEvents]                 = useState<ActivityEvent[]>([])
  const [executionState, setExecutionState] = useState<ExecutionState>(INITIAL_EXECUTION_STATE)

  const addEvent = useCallback((type: WsMessageType, message: string) => {
    const time = new Date().toLocaleTimeString('en', {
      hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit',
    })
    setEvents((prev) => [...prev.slice(-200), { type, message, time }])
  }, [])

  // ─── WebSocket Listener ─────────────────────────────────────────────────────

  useEffect(() => {
    const unsub = subscribe((data: WsMessage) => {
      switch (data.type) {
        case 'connected':
          addEvent('connected', 'NEXUS Agent online')
          break

        case 'planning':
          addEvent('planning', data.message ?? '')
          break

        case 'plan_ready':
          addEvent('plan_ready', `Plan ready: ${data.plan?.intent} (${data.plan?.steps.length} steps)`)
          break

        case 'execution_start':
          addEvent('execution_start', `Starting execution: ${data.totalSteps} steps`)
          setExecutionState((prev) => ({ ...prev, status: 'executing', currentStep: 1 }))
          break

        case 'step_start':
          addEvent('step_start', `Step ${data.stepNumber}: ${data.step?.description}`)
          setExecutionState((prev) => ({ ...prev, currentStep: data.stepNumber ?? null }))
          break

        case 'step_complete':
          addEvent('step_complete', `Step ${data.stepNumber} done (${data.duration}ms)`)
          setExecutionState((prev) => ({
            ...prev,
            completedSteps: [...prev.completedSteps, data.stepNumber!],
            stepResults: data.stepNumber != null && data.result
              ? { ...prev.stepResults, [data.stepNumber]: data.result }
              : prev.stepResults,
          }))
          break

        case 'step_error':
          addEvent('step_error', `Step ${data.stepNumber} failed: ${data.error}`)
          setExecutionState((prev) => ({ ...prev, failedStep: data.stepNumber ?? null }))
          break

        case 'safety_check':
          addEvent('safety_check', `High-risk step ${data.stepNumber}: ${data.message}`)
          break

        case 'execution_complete':
          addEvent('execution_complete', `Complete! ${data.summary?.success}/${data.summary?.total} steps succeeded`)
          setExecutionState((prev) => ({
            ...prev,
            status: 'completed',
            summary: data.summary ?? null,
          }))
          break

        case 'execution_failed':
          addEvent('execution_failed', `Failed at step ${data.stepNumber}: ${data.error}`)
          setExecutionState((prev) => ({ ...prev, status: 'failed' }))
          break

        case 'execution_stopped':
          addEvent('execution_stopped', 'Execution stopped by user')
          setExecutionState((prev) => ({ ...prev, status: 'stopped' }))
          break

        case 'error':
          addEvent('error', data.message ?? 'Unknown error')
          break
      }
    })
    return unsub
  }, [subscribe, addEvent])

  // ─── Handlers ───────────────────────────────────────────────────────────────

  const handleGeneratePlan = async (prompt: string) => {
    try {
      setLoading(true)
      setPlan(null)
      setReview(null)
      setSessionId(null)
      setExecutionState(INITIAL_EXECUTION_STATE)

      addEvent('planning', `Analyzing: "${prompt.substring(0, 60)}${prompt.length > 60 ? '...' : ''}"`)

      const result = await api.plan(prompt)
      setPlan(result.plan)
      setSessionId(result.sessionId)
      addEvent('plan_ready', `Generated: ${result.plan.steps.length} steps`)

      // Auto-run safety review
      setReviewing(true)
      addEvent('planning', 'Running safety review...')
      const reviewResult = await api.review(result.plan)
      setReview(reviewResult)
      addEvent(
        reviewResult.verdict === 'SAFE' ? 'step_complete' : 'safety_check',
        `Safety review: ${reviewResult.verdict} — ${reviewResult.recommendation}`,
      )
    } catch (err: unknown) {
      addEvent('error', (err as Error).message)
    } finally {
      setLoading(false)
      setReviewing(false)
    }
  }

  const handleExecute = async () => {
    if (!sessionId) return
    try {
      setExecutionState((prev) => ({ ...prev, completedSteps: [], failedStep: null }))
      await api.execute(sessionId)
    } catch (err: unknown) {
      addEvent('error', `Execution start failed: ${(err as Error).message}`)
    }
  }

  const handleStop = async () => {
    if (!sessionId) return
    try {
      await api.stop(sessionId)
    } catch (err: unknown) {
      addEvent('error', (err as Error).message)
    }
  }

  const handleNewTask = () => {
    setPlan(null)
    setReview(null)
    setSessionId(null)
    setExecutionState(INITIAL_EXECUTION_STATE)
  }

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen flex flex-col">
      <Header connected={connected} />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 md:px-6 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* Left: Input + Plan */}
          <div className="lg:col-span-2 space-y-6">
            {!plan && (
              <div className="space-y-1">
                <h1 className="font-display font-bold text-3xl text-white tracking-tight">
                  What should I <span className="text-accent">automate</span>?
                </h1>
                <p className="text-muted font-mono text-sm">
                  Describe your task in plain English. NEXUS will generate and execute an intelligent plan.
                </p>
              </div>
            )}

            {plan && (
              <div className="flex items-center gap-3">
                <button
                  onClick={handleNewTask}
                  className="text-xs font-mono text-dim hover:text-accent transition-colors"
                >
                  ← NEW TASK
                </button>
                <span className="text-dim">/</span>
                <span className="text-xs font-mono text-muted">EXECUTION PLAN</span>
              </div>
            )}

            {!plan && (
              <div className="bg-surface border border-border rounded-xl p-5">
                <PromptInput onSubmit={handleGeneratePlan} loading={loading} />
              </div>
            )}

            {loading && <LoadingSkeleton />}

            {plan && !loading && (
              <div className="bg-surface border border-border rounded-xl p-5">
                <PlanDisplay
                  plan={plan}
                  executionState={executionState}
                  onConfirm={handleExecute}
                  onStop={handleStop}
                  reviewing={reviewing}
                  review={review}
                />
              </div>
            )}
          </div>

          {/* Right: Activity log */}
          <div className="lg:col-span-1 space-y-4">
            <div className="bg-surface border border-border rounded-xl h-[600px] flex flex-col sticky top-24">
              <ActivityLog events={events} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <StatCard label="PLANS" value={sessionId ? '1' : '0'} color="text-accent" />
              <StatCard
                label="WS STATUS"
                value={connected ? 'LIVE' : 'OFF'}
                color={connected ? 'text-accent3' : 'text-danger'}
              />
            </div>
          </div>
        </div>
      </main>

      <footer className="border-t border-border py-4 px-6 mt-8">
        <div className="max-w-7xl mx-auto flex items-center justify-between text-xs font-mono text-dim">
          <span>NEXUS AI AUTOMATION AGENT</span>
          <span>TypeScript · Next.js · Groq · WebSocket</span>
        </div>
      </footer>
    </div>
  )
}

// ─── Small helpers ────────────────────────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div className="bg-surface border border-border rounded-xl p-6">
      <div className="flex items-center gap-3 text-sm font-mono text-muted mb-3">
        <div className="flex gap-1">
          {[0, 150, 300].map((delay) => (
            <span
              key={delay}
              className="w-1.5 h-1.5 bg-accent rounded-full animate-bounce"
              style={{ animationDelay: `${delay}ms` }}
            />
          ))}
        </div>
        Generating execution plan...
      </div>
      <div className="space-y-2">
        {[80, 60, 70, 40].map((w, i) => (
          <div key={i} className="shimmer h-4 rounded" style={{ width: `${w}%` }} />
        ))}
      </div>
    </div>
  )
}

interface StatCardProps {
  label: string
  value: string
  color: string
}

function StatCard({ label, value, color }: StatCardProps) {
  return (
    <div className="bg-surface border border-border rounded-lg p-3">
      <div className="text-dim text-xs font-mono mb-1">{label}</div>
      <div className={`text-xl font-bold font-display ${color}`}>{value}</div>
    </div>
  )
}
