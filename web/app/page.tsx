'use client'
import { useState, useEffect, useCallback } from 'react'
import { useWebSocket } from '@/hooks/useWebSocket'
import { api } from '@/lib/api'
import Header from '@/components/Header'
import SearchBar from '@/components/SearchBar'
import StatusStrip from '@/components/StatusStrip'
import ExecutionView from '@/components/ExecutionView'
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
  const [plan, setPlan]                     = useState<Plan | null>(null)
  const [prompt, setPrompt]                 = useState('')
  const [sessionId, setSessionId]           = useState<string | null>(null)
  const [events, setEvents]                 = useState<ActivityEvent[]>([])
  const [executionState, setExecutionState] = useState<ExecutionState>(INITIAL_EXECUTION_STATE)

  // morphed = search bar has moved to top, execution view is shown
  const morphed = plan !== null || loading

  const addEvent = useCallback((type: WsMessageType, message: string) => {
    const time = new Date().toLocaleTimeString('en', {
      hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit',
    })
    setEvents(prev => [...prev.slice(-300), { type, message, time }])
  }, [])

  // ─── WebSocket ────────────────────────────────────────────────────────────

  useEffect(() => {
    const unsub = subscribe((data: WsMessage) => {
      switch (data.type) {
        case 'connected':
          addEvent('connected', 'NEXUS agent online')
          break
        case 'planning':
          addEvent('planning', data.message ?? '')
          break
        case 'plan_ready':
          if (data.plan) {
            setPlan(data.plan)
            addEvent('plan_ready', `Plan ready: ${data.plan.intent} (${data.plan.steps.length} steps)`)
          }
          break
        case 'execution_start':
          addEvent('execution_start', `Execution started: ${data.totalSteps} steps`)
          setExecutionState(prev => ({ ...prev, status: 'executing', currentStep: 1 }))
          break
        case 'step_start':
          addEvent('step_start', `Step ${data.stepNumber}: ${data.step?.description}`)
          setExecutionState(prev => ({ ...prev, currentStep: data.stepNumber ?? null }))
          break
        case 'step_complete':
          addEvent('step_complete', `Step ${data.stepNumber} done (${data.duration}ms)`)
          setExecutionState(prev => ({
            ...prev,
            completedSteps: [...prev.completedSteps, data.stepNumber!],
            stepResults: data.stepNumber != null && data.result
              ? { ...prev.stepResults, [data.stepNumber]: data.result }
              : prev.stepResults,
          }))
          break
        case 'step_error':
          addEvent('step_error', `Step ${data.stepNumber} failed: ${data.error}`)
          setExecutionState(prev => ({ ...prev, failedStep: data.stepNumber ?? null }))
          break
        case 'safety_check':
          addEvent('safety_check', data.message ?? '')
          break
        case 'execution_complete': {
          const total   = data.summary?.total ?? 0
          const success = data.summary?.success ?? 0
          addEvent('execution_complete', `Done! ${success}/${total} steps succeeded`)
          setExecutionState(prev => ({
            ...prev,
            status: 'completed',
            currentStep: null,
            completedSteps: data.results
              ? data.results.filter(r => r.success).map(r => r.stepNumber)
              : Array.from({ length: success }, (_, i) => i + 1),
            summary: data.summary ?? null,
          }))
          break
        }
        case 'execution_failed':
          addEvent('execution_failed', `Failed: ${data.error}`)
          setExecutionState(prev => ({ ...prev, status: 'failed' }))
          break
        case 'execution_stopped':
          addEvent('execution_stopped', 'Stopped by user')
          setExecutionState(prev => ({ ...prev, status: 'stopped' }))
          break
        case 'error':
          addEvent('error', data.message ?? 'Unknown error')
          break
      }
    })
    return unsub
  }, [subscribe, addEvent])

  // ─── Handlers ─────────────────────────────────────────────────────────────

  const handleGeneratePlan = async (p: string) => {
    try {
      setLoading(true)
      setPrompt(p)
      setPlan(null)
      setSessionId(null)
      setEvents([])
      setExecutionState(INITIAL_EXECUTION_STATE)
      addEvent('planning', `Analyzing: "${p.substring(0, 60)}${p.length > 60 ? '...' : ''}"`)

      const result = await api.plan(p)
      setPlan(result.plan)
      setSessionId(result.sessionId)
      setExecutionState(prev => ({ ...prev, status: 'planned' }))
      addEvent('plan_ready', `Generated ${result.plan.steps.length} steps`)
    } catch (err: unknown) {
      addEvent('error', (err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  const handleExecute = async () => {
    if (!sessionId) return
    try {
      setExecutionState(prev => ({ ...prev, completedSteps: [], failedStep: null }))
      await api.execute(sessionId)
    } catch (err: unknown) {
      addEvent('error', `Execution failed: ${(err as Error).message}`)
    }
  }

  const handleStop = async () => {
    if (!sessionId) return
    try { await api.stop(sessionId) }
    catch (err: unknown) { addEvent('error', (err as Error).message) }
  }

  const handleNewTask = () => {
    setPlan(null)
    setPrompt('')
    setSessionId(null)
    setExecutionState(INITIAL_EXECUTION_STATE)
    setEvents([])
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen flex flex-col bg-[#0a0a0f]">
      {/* Top bar: connection status */}
      <div className="flex items-center justify-between px-4 py-2 bg-[#080810] border-b border-[rgba(255,255,255,0.04)] flex-shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded border border-[#00d4ff]/30 bg-[#00d4ff]/5 flex items-center justify-center">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M6 1L11 3.5V8.5L6 11L1 8.5V3.5L6 1Z" stroke="#00d4ff" strokeWidth="1.2" fill="none"/>
              <circle cx="6" cy="6" r="1.5" fill="#00d4ff" opacity="0.8"/>
            </svg>
          </div>
          <span className="font-mono text-xs text-white tracking-[0.2em] font-bold">NEXUS</span>
          <span className="font-mono text-[10px] text-[#374151]">v1.0</span>
        </div>

        <div className="flex items-center gap-3">
          {morphed && (
            <button
              onClick={handleNewTask}
              className="font-mono text-[11px] text-[#374151] hover:text-[#00d4ff] transition-colors"
            >
              ← new task
            </button>
          )}
          <div className="flex items-center gap-1.5">
            <span className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-[#10b981] animate-pulse' : 'bg-[#ef4444]'}`} />
            <span className={`font-mono text-[10px] ${connected ? 'text-[#10b981]' : 'text-[#ef4444]'}`}>
              {connected ? 'LIVE' : 'OFFLINE'}
            </span>
          </div>
        </div>
      </div>

      {/* Search bar — morphs to compact strip when submitted */}
      {morphed ? (
        <div className="flex-shrink-0">
          {/* Compact command strip */}
          <div className="flex items-center gap-3 px-4 py-2.5 bg-[#0d0d18] border-b border-[rgba(0,212,255,0.1)]">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="text-[#00d4ff]/40 flex-shrink-0">
              <circle cx="5" cy="5" r="3.5" stroke="currentColor" strokeWidth="1.2"/>
              <path d="M8 8l2.5 2.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
            </svg>
            <span className="font-mono text-xs text-[#4b5563] truncate flex-1 max-w-md">{prompt}</span>
            {loading && (
              <div className="flex gap-1 flex-shrink-0">
                {[0,1,2].map(i => (
                  <span key={i} className="w-1 h-1 rounded-full bg-[#00d4ff] animate-bounce"
                    style={{ animationDelay: `${i*150}ms` }} />
                ))}
              </div>
            )}
          </div>

          {/* Status strip */}
          {plan && (
            <StatusStrip
              executionState={executionState}
              totalSteps={plan.steps.length}
              prompt={prompt}
            />
          )}
        </div>
      ) : null}

      {/* Main content */}
      {!morphed ? (
        // Search view — centered
        <SearchBar onSubmit={handleGeneratePlan} loading={loading} morphed={false} />
      ) : loading && !plan ? (
        // Planning skeleton
        <div className="flex-1 flex items-center justify-center">
          <PlanningAnimation />
        </div>
      ) : plan ? (
        // Execution layout: pipeline left + terminal right
        <div className="flex-1 flex overflow-hidden">
          {/* Main execution pipeline */}
          <div className="flex-1 overflow-hidden flex flex-col">
            <ExecutionView
              plan={plan}
              executionState={executionState}
              onConfirm={handleExecute}
              onStop={handleStop}
            />
          </div>

          {/* Side terminal panel */}
          <div className="w-72 flex-shrink-0 border-l border-[rgba(255,255,255,0.05)] p-3">
            <ActivityLog events={events} />
          </div>
        </div>
      ) : null}
    </div>
  )
}

// Planning animation shown while AI thinks
function PlanningAnimation() {
  const messages = [
    'Parsing your request...',
    'Identifying capabilities...',
    'Building execution plan...',
    'Running safety review...',
  ]
  const [msgIdx, setMsgIdx] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setMsgIdx(i => (i + 1) % messages.length), 1200)
    return () => clearInterval(t)
  }, [])

  return (
    <div className="text-center space-y-6">
      {/* Animated hexagon */}
      <div className="flex justify-center">
        <div className="relative w-16 h-16">
          <svg viewBox="0 0 64 64" className="w-full h-full animate-spin" style={{ animationDuration: '3s' }}>
            <path d="M32 4L58 18V46L32 60L6 46V18L32 4Z"
              stroke="#00d4ff" strokeWidth="1.5" fill="none" strokeDasharray="4 2" />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-3 h-3 rounded-full bg-[#00d4ff] animate-pulse" />
          </div>
        </div>
      </div>

      {/* Message */}
      <div className="font-mono text-sm text-[#4b5563] animate-pulse">
        {messages[msgIdx]}
      </div>

      {/* Dots */}
      <div className="flex justify-center gap-1.5">
        {[0,1,2,3].map(i => (
          <span key={i}
            className="w-1.5 h-1.5 rounded-full bg-[#00d4ff]/40 animate-bounce"
            style={{ animationDelay: `${i * 150}ms` }}
          />
        ))}
      </div>
    </div>
  )
}