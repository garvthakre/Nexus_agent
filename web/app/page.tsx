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

const INIT_STATE: ExecutionState = {
  status: 'idle', currentStep: null,
  completedSteps: [], failedStep: null,
  stepResults: {}, summary: null,
}

export default function HomePage() {
  const { connected, subscribe } = useWebSocket(WS_URL)
  const [loading,   setLoading]   = useState(false)
  const [reviewing, setReviewing] = useState(false)
  const [plan,      setPlan]      = useState<Plan | null>(null)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [review,    setReview]    = useState<ReviewResult | null>(null)
  const [events,    setEvents]    = useState<ActivityEvent[]>([])
  const [exec,      setExec]      = useState<ExecutionState>(INIT_STATE)

  const addEvent = useCallback((type: WsMessageType, message: string) => {
    const time = new Date().toLocaleTimeString('en', { hour12:false, hour:'2-digit', minute:'2-digit', second:'2-digit' })
    setEvents(p => [...p.slice(-200), { type, message, time }])
  }, [])

  // WebSocket
  useEffect(() => {
    const unsub = subscribe((data: WsMessage) => {
      switch (data.type) {
        case 'connected':         addEvent('connected', 'NEXUS Agent online'); break
        case 'planning':          addEvent('planning', data.message ?? ''); break
        case 'plan_ready':        addEvent('plan_ready', `Plan ready: ${data.plan?.intent} (${data.plan?.steps.length} steps)`); break
        case 'execution_start':
          addEvent('execution_start', `Starting execution: ${data.totalSteps} steps`)
          setExec(p => ({ ...p, status:'executing', currentStep:1 })); break
        case 'step_start':
          addEvent('step_start', `Step ${data.stepNumber}: ${data.step?.description}`)
          setExec(p => ({ ...p, currentStep: data.stepNumber ?? null })); break
        case 'step_complete':
          addEvent('step_complete', `Step ${data.stepNumber} done (${data.duration}ms)`)
          setExec(p => ({
            ...p,
            completedSteps: [...p.completedSteps, data.stepNumber!],
            stepResults: data.stepNumber != null && data.result
              ? { ...p.stepResults, [data.stepNumber]: data.result } : p.stepResults,
          })); break
        case 'step_error':
          addEvent('step_error', `Step ${data.stepNumber} failed: ${data.error}`)
          setExec(p => ({ ...p, failedStep: data.stepNumber ?? null })); break
        case 'safety_check':      addEvent('safety_check', data.message ?? ''); break
        case 'execution_complete': {
          const total = data.summary?.total ?? 0, success = data.summary?.success ?? 0
          addEvent('execution_complete', `Complete! ${success}/${total} steps succeeded`)
          setExec(p => ({
            ...p, status:'completed', currentStep:null,
            completedSteps: data.results
              ? data.results.filter((r: { success: boolean }) => r.success).map((r: { stepNumber: number }) => r.stepNumber)
              : Array.from({length:total},(_,i)=>i+1).slice(0,success),
            summary: data.summary ?? null,
          })); break
        }
        case 'execution_failed':
          addEvent('execution_failed', `Failed at step ${data.stepNumber}: ${data.error}`)
          setExec(p => ({ ...p, status:'failed' })); break
        case 'execution_stopped':
          addEvent('execution_stopped', 'Execution stopped by user')
          setExec(p => ({ ...p, status:'stopped' })); break
        case 'error':
          addEvent('error', data.message ?? 'Unknown error'); break
      }
    })
    return unsub
  }, [subscribe, addEvent])

  // Handlers
  const handlePlan = async (prompt: string) => {
    try {
      setLoading(true); setPlan(null); setReview(null); setSessionId(null); setExec(INIT_STATE)
      addEvent('planning', `Analyzing: "${prompt.slice(0,60)}${prompt.length>60?'...':''}"`)
      const res = await api.plan(prompt)
      setPlan(res.plan); setSessionId(res.sessionId)
      addEvent('plan_ready', `Generated: ${res.plan.steps.length} steps`)
      setReviewing(true)
      addEvent('planning', 'Running safety review...')
      const rv = await api.review(res.plan)
      setReview(rv)
      addEvent(rv.verdict==='SAFE'?'step_complete':'safety_check',
        `Safety review: ${rv.verdict} — ${rv.recommendation}`)
    } catch (e: unknown) {
      addEvent('error', (e as Error).message)
    } finally { setLoading(false); setReviewing(false) }
  }

  const handleExecute = async () => {
    if (!sessionId) return
    try {
      setExec(p => ({ ...p, completedSteps:[], failedStep:null }))
      await api.execute(sessionId)
    } catch (e: unknown) { addEvent('error', `Execution start failed: ${(e as Error).message}`) }
  }

  const handleStop = async () => {
    if (!sessionId) return
    try { await api.stop(sessionId) }
    catch (e: unknown) { addEvent('error', (e as Error).message) }
  }

  const handleNew = () => {
    setPlan(null); setReview(null); setSessionId(null); setExec(INIT_STATE)
  }

  const isExec  = exec.status === 'executing'
  const isDone  = exec.status === 'completed'
  const done    = exec.completedSteps.length
  const total   = plan?.steps.length ?? 0
  const pct     = isDone ? 100 : isExec && total ? Math.round((done/total)*100) : 0

  return (
    <div className="min-h-screen flex flex-col bg-bg">
      <Header connected={connected} />

      {/* Agent Status Bar */}
      {(isExec || isDone) && (
        <div className="max-w-[1400px] w-full mx-auto px-6 pt-4">
          <div className={`bg-s2 rounded-[11px] px-4 py-3 flex items-center gap-[14px] border relative overflow-hidden
            ${isExec ? 'border-cyan/20 glow-pulse-anim' : 'border-green/20'}`}>
            {isExec && <div className="absolute inset-0 pointer-events-none shimmer-run" />}
            <div className="relative flex-shrink-0">
              <div className={`w-2 h-2 rounded-full transition-all duration-300
                ${isDone ? 'bg-green' : 'bg-cyan shadow-[0_0_8px_#00e5ff]'}`} />
              {isExec && (
                <div className="absolute -inset-[5px] rounded-full border border-cyan pulse-ring-anim pointer-events-none" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-[6px]">
                <span className="font-mono text-[9.5px] text-muted uppercase tracking-[0.07em] flex-shrink-0">
                  Agent Status
                </span>
                <span className={`font-mono text-[10.5px] ${isDone ? 'text-green' : 'text-cyan'}`}>
                  {isDone ? 'All steps complete — task finished'
                    : exec.currentStep ? `Executing step ${exec.currentStep} of ${total}...`
                    : 'Starting up...'}
                </span>
                <span className="ml-auto font-mono text-[9.5px] text-muted flex-shrink-0">
                  {done}/{total} steps
                </span>
              </div>
              <div className="h-[2.5px] bg-dim rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-[width] duration-500 ease-[cubic-bezier(0.4,0,0.2,1)]
                    ${isDone
                      ? 'bg-gradient-to-r from-green to-[#00cc77]'
                      : 'bg-gradient-to-r from-cyan to-[#0090cc] shadow-[0_0_8px_#00e5ff]'
                    }`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
            <div className="text-right flex-shrink-0">
              <div className={`font-display text-[26px] leading-none ${isDone ? 'text-green' : 'text-cyan'}`}>
                {done}<span className="text-[14px] text-dim">/{total}</span>
              </div>
              <div className="font-mono text-[7.5px] text-muted mt-0.5 tracking-[0.06em]">COMPLETED</div>
            </div>
          </div>
        </div>
      )}

      {/* Main */}
      <main className="flex-1 max-w-[1400px] w-full mx-auto px-6 py-5">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-4 items-start">

          {/* Left */}
          <div className="flex flex-col gap-4">
            {!plan && (
              <div className="mb-1">
                <h1 className="font-display text-[38px] tracking-[0.06em] text-ntext leading-none mb-[6px]">
                  WHAT SHOULD I <span className="text-cyan">AUTOMATE</span>?
                </h1>
                <p className="font-mono text-[11px] text-muted tracking-[0.04em]">
                  Describe your task in plain English. NEXUS will generate and execute an intelligent plan.
                </p>
              </div>
            )}

            {plan && (
              <div className="flex items-center gap-[10px]">
                <button
                  onClick={handleNew}
                  className="font-mono text-[10px] text-dim hover:text-cyan transition-colors
                    bg-transparent border-none cursor-pointer tracking-[0.04em] px-2 py-1 rounded-[5px]"
                >
                  ← NEW TASK
                </button>
                <span className="text-dim font-mono text-[10px]">/</span>
                <span className="font-mono text-[10px] text-muted tracking-[0.04em]">EXECUTION PLAN</span>
              </div>
            )}

            {/* Input */}
            {!plan && (
              <div className="bg-s1 border border-border rounded-[13px] p-5">
                <PromptInput onSubmit={handlePlan} loading={loading} />
              </div>
            )}

            {/* Loading skeleton */}
            {loading && (
              <div className="bg-s1 border border-border rounded-[13px] p-5">
                <div className="flex items-center gap-[10px] font-mono text-[11px] text-muted mb-[14px]">
                  <div className="flex gap-1">
                    {[0,1,2].map(k => (
                      <span key={k} className={`w-[5px] h-[5px] bg-cyan rounded-full inline-block dot-b${k}`} />
                    ))}
                  </div>
                  Generating execution plan...
                </div>
                <div className="flex flex-col gap-2">
                  {[80,60,70,40].map((w, i) => (
                    <div key={i} className="shimmer-skeleton h-[14px] rounded-[4px]" style={{ width:`${w}%` }} />
                  ))}
                </div>
              </div>
            )}

            {/* Plan */}
            {plan && !loading && (
              <div className="bg-s1 border border-border rounded-[13px] p-5">
                <PlanDisplay
                  plan={plan}
                  executionState={exec}
                  onConfirm={handleExecute}
                  onStop={handleStop}
                  reviewing={reviewing}
                  review={review}
                />
              </div>
            )}
          </div>

          {/* Right */}
          <div className="flex flex-col gap-3 lg:sticky lg:top-[90px]">
            <div className="h-[560px]">
              <ActivityLog events={events} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <StatCard label="SESSIONS" value={sessionId ? '1' : '0'} color="text-cyan" />
              <StatCard label="WS STATUS" value={connected ? 'LIVE' : 'OFF'}
                color={connected ? 'text-green' : 'text-red'} />
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border py-3 px-6 mt-4">
        <div className="max-w-[1400px] mx-auto flex items-center justify-between
          font-mono text-[9.5px] text-dim tracking-[0.05em]">
          <span>NEXUS AI AUTOMATION AGENT · v2.0</span>
          <span>TypeScript · Next.js · Groq · WebSocket</span>
        </div>
      </footer>
    </div>
  )
}

function StatCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="bg-s1 border border-border rounded-[10px] p-[12px_14px]">
      <div className="font-mono text-[8.5px] text-dim tracking-[0.07em] mb-1">{label}</div>
      <div className={`font-display text-[22px] ${color}`}>{value}</div>
    </div>
  )
}