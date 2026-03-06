'use client'
import { useEffect, useState } from 'react'
import { ExecutionState } from '@/types'

interface StatusStripProps {
  executionState: ExecutionState
  totalSteps: number
  prompt: string
}

export default function StatusStrip({ executionState, totalSteps, prompt }: StatusStripProps) {
  const [elapsed, setElapsed] = useState(0)
  const [startTime] = useState(Date.now())

  useEffect(() => {
    if (executionState.status !== 'executing') return
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - startTime) / 1000)), 1000)
    return () => clearInterval(t)
  }, [executionState.status, startTime])

  const current = executionState.currentStep ?? 0
  const completed = executionState.completedSteps.length
  const pct = totalSteps > 0 ? Math.round((completed / totalSteps) * 100) : 0
  const status = executionState.status

  const statusColor =
    status === 'executing'  ? '#00d4ff' :
    status === 'completed'  ? '#10b981' :
    status === 'failed'     ? '#ef4444' :
    status === 'stopped'    ? '#f59e0b' : '#6b7280'

  const statusLabel =
    status === 'executing'  ? `RUNNING STEP ${current} OF ${totalSteps}` :
    status === 'completed'  ? 'COMPLETED' :
    status === 'failed'     ? 'FAILED' :
    status === 'stopped'    ? 'STOPPED' : 'PLANNING...'

  const fmtTime = (s: number) => `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`

  return (
    <div className="w-full bg-[#080810] border-b border-[rgba(255,255,255,0.06)]">
      {/* Main strip */}
      <div className="flex items-center gap-4 px-4 py-2">
        {/* Status dot + label */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <span
            className="w-2 h-2 rounded-full flex-shrink-0"
            style={{
              backgroundColor: statusColor,
              boxShadow: `0 0 6px ${statusColor}`,
              animation: status === 'executing' ? 'pulse 1.5s ease-in-out infinite' : 'none'
            }}
          />
          <span className="font-mono text-xs font-medium" style={{ color: statusColor }}>
            {statusLabel}
          </span>
        </div>

        <span className="text-[#2d2d40] font-mono text-xs">|</span>

        {/* Prompt truncated */}
        <span className="font-mono text-xs text-[#4b5563] truncate flex-1 max-w-md">
          {prompt.length > 60 ? prompt.slice(0, 57) + '...' : prompt}
        </span>

        <div className="flex items-center gap-4 flex-shrink-0 ml-auto">
          {/* Step counter */}
          <span className="font-mono text-xs text-[#374151]">
            <span className="text-white">{completed}</span>
            <span className="text-[#374151]">/{totalSteps}</span>
            <span className="text-[#2d2d40] ml-1">steps</span>
          </span>

          {/* Percentage */}
          <span className="font-mono text-xs font-bold" style={{ color: statusColor }}>
            {pct}%
          </span>

          {/* Timer */}
          {status === 'executing' && (
            <span className="font-mono text-xs text-[#374151]">
              {fmtTime(elapsed)}
            </span>
          )}

          {/* Summary on complete */}
          {status === 'completed' && executionState.summary && (
            <span className="font-mono text-xs text-[#10b981]">
              {executionState.summary.success}/{executionState.summary.total} ok
              · {((executionState.summary.duration ?? 0) / 1000).toFixed(1)}s
            </span>
          )}
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-[2px] w-full bg-[#0f0f1a] relative overflow-hidden">
        <div
          className="h-full transition-all duration-500 ease-out relative"
          style={{
            width: `${pct}%`,
            background: `linear-gradient(90deg, ${statusColor}88, ${statusColor})`,
            boxShadow: `0 0 8px ${statusColor}`,
          }}
        >
          {/* Shimmer on active */}
          {status === 'executing' && (
            <div className="absolute inset-0 animate-[shimmer_1.5s_infinite]"
              style={{
                background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.3), transparent)',
                backgroundSize: '200% 100%',
              }}
            />
          )}
        </div>
      </div>
    </div>
  )
}