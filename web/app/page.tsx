'use client'
import { useAgentWorkflow } from '@/hooks/useAgentWorkflow'
import Header from '@/components/Header'
import PromptInput from '@/components/PromptInput'
import PlanDisplay from '@/components/PlanDisplay'
import ActivityLog from '@/components/ActivityLog'
import AgentStatusBar from '@/components/AgentStatusBar'
import StatCard from '@/components/StatCard'

const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? 'ws://localhost:3001'

export default function HomePage() {
  const {
    connected,
    loading,
    reviewing,
    plan,
    review,
    sessionId,
    events,
    exec,
    totalSteps,
    handlePlan,
    handleExecute,
    handleStop,
    handleNew,
  } = useAgentWorkflow(WS_URL)

  return (
    <div className="min-h-screen flex flex-col bg-bg">
      <Header connected={connected} />

      {(exec.status === 'executing' || exec.status === 'completed') && (
        <AgentStatusBar executionState={exec} totalSteps={totalSteps} />
      )}

      <main className="flex-1 max-w-[1400px] w-full mx-auto px-6 py-5">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-4 items-start">

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
                  className="font-mono text-[10px] text-dim hover:text-cyan transition-colors bg-transparent border-none cursor-pointer tracking-[0.04em] px-2 py-1 rounded-[5px]"
                >
                  ← NEW TASK
                </button>
                <span className="text-dim font-mono text-[10px]">/</span>
                <span className="font-mono text-[10px] text-muted tracking-[0.04em]">EXECUTION PLAN</span>
              </div>
            )}

            {!plan && (
              <div className="bg-s1 border border-border rounded-[13px] p-5">
                <PromptInput onSubmit={handlePlan} loading={loading} />
              </div>
            )}

            {loading && (
              <div className="bg-s1 border border-border rounded-[13px] p-5">
                <div className="flex items-center gap-[10px] font-mono text-[11px] text-muted mb-[14px]">
                  <div className="flex gap-1">
                    {[0,1,2].map((k) => (
                      <span key={k} className={`w-[5px] h-[5px] bg-cyan rounded-full inline-block dot-b${k}`} />
                    ))}
                  </div>
                  Generating execution plan...
                </div>
                <div className="flex flex-col gap-2">
                  {[80,60,70,40].map((w, i) => (
                    <div key={i} className="shimmer-skeleton h-[14px] rounded-[4px]" style={{ width: `${w}%` }} />
                  ))}
                </div>
              </div>
            )}

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

          <div className="flex flex-col gap-3 lg:sticky lg:top-[90px]">
            <div className="h-[560px]">
              <ActivityLog events={events} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <StatCard label="SESSIONS" value={sessionId ? '1' : '0'} color="text-cyan" />
              <StatCard label="WS STATUS" value={connected ? 'LIVE' : 'OFF'} color={connected ? 'text-green' : 'text-red'} />
            </div>
          </div>
        </div>
      </main>

      <footer className="border-t border-border py-3 px-6 mt-4">
        <div className="max-w-[1400px] mx-auto flex items-center justify-between font-mono text-[9.5px] text-dim tracking-[0.05em]">
          <span>NEXUS AI AUTOMATION AGENT · v2.0</span>
          <span>TypeScript · Next.js · Groq · WebSocket</span>
        </div>
      </footer>
    </div>
  )
}

