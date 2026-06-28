'use client'

import { ExecutionState } from '@/types'

interface Props {
  executionState: ExecutionState
  totalSteps: number
}

export default function AgentStatusBar({ executionState, totalSteps }: Props) {
  const isExec = executionState.status === 'executing'
  const isDone = executionState.status === 'completed'
  const done = executionState.completedSteps.length
  const pct = isDone ? 100 : isExec && totalSteps ? Math.round((done / totalSteps) * 100) : 0

  return (
    <div className="max-w-[1400px] w-full mx-auto px-6 pt-4">
      <div
        className={`bg-s2 rounded-[11px] px-4 py-3 flex items-center gap-[14px] border relative overflow-hidden
          ${isExec ? 'border-cyan/20 glow-pulse-anim' : 'border-green/20'}`}
      >
        {isExec && <div className="absolute inset-0 pointer-events-none shimmer-run" />}

        <div className="relative flex-shrink-0">
          <div
            className={`w-2 h-2 rounded-full transition-all duration-300
              ${isDone ? 'bg-green' : 'bg-cyan shadow-[0_0_8px_#00e5ff]'}`}
          />
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
              {isDone
                ? 'All steps complete — task finished'
                : executionState.currentStep
                ? `Executing step ${executionState.currentStep} of ${totalSteps}...`
                : 'Starting up...'}
            </span>
            <span className="ml-auto font-mono text-[9.5px] text-muted flex-shrink-0">
              {done}/{totalSteps} steps
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
            {done}
            <span className="text-[14px] text-dim">/{totalSteps}</span>
          </div>
          <div className="font-mono text-[7.5px] text-muted mt-0.5 tracking-[0.06em]">COMPLETED</div>
        </div>
      </div>
    </div>
  )
}
