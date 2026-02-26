'use client'
import { useState } from 'react'
import {
  Plan, PlanStep, ReviewResult, ExecutionState,
  Capability, SafetyRisk, StepStatus, StepResult, ExecutionSummary,
} from '@/types'

// ─── Constants ────────────────────────────────────────────────────────────────

const CAPABILITY_ICONS: Record<Capability, string> = {
  open_application:  '📱',
  set_wallpaper:     '🖼️',
  run_shell_command: '💻',
  browser_open:      '🌐',
  browser_fill:      '✏️',
  browser_click:     '👆',
  type_text:         '⌨️',
  create_file:       '📄',
  create_folder:     '📁',
  wait:              '⏳',
}

const RISK_CLASSES: Record<SafetyRisk, string> = {
  low:    'text-accent3 border-accent3/30 bg-accent3/5',
  medium: 'text-warn border-warn/30 bg-warn/5',
  high:   'text-danger border-danger/30 bg-danger/5',
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface PlanDisplayProps {
  plan: Plan
  executionState: ExecutionState
  onConfirm: () => void
  onStop: () => void
  reviewing: boolean
  review: ReviewResult | null
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function PlanDisplay({
  plan, executionState, onConfirm, onStop, reviewing, review,
}: PlanDisplayProps) {
  const [showJson, setShowJson] = useState(false)

  const { steps } = plan
  const isExecuting = executionState.status === 'executing'
  const isComplete  = executionState.status === 'completed'
  const isFailed    = executionState.status === 'failed'

  const getStepStatus = (stepNumber: number): StepStatus => {
    if (executionState.currentStep === stepNumber && isExecuting) return 'running'
    if (executionState.completedSteps.includes(stepNumber))       return 'complete'
    if (executionState.failedStep === stepNumber)                  return 'error'
    return 'pending'
  }

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Plan header */}
      <div className="bg-surface2 border border-border rounded-lg p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className="text-xs font-mono text-muted uppercase tracking-wider">INTENT</span>
              <span className="text-xs font-mono text-accent bg-accent/10 border border-accent/20 px-2 py-0.5 rounded">
                {plan.intent}
              </span>
              <span className="text-xs font-mono text-muted">{plan.confidence}% confidence</span>
            </div>
            <p className="text-white text-sm font-mono">{plan.summary}</p>
          </div>
          <div className="flex-shrink-0 text-right">
            <div className="text-2xl font-display font-bold text-accent">{plan.confidence}%</div>
            <div className="text-xs text-muted font-mono">CONFIDENCE</div>
          </div>
        </div>

        <div className="mt-3 pt-3 border-t border-border flex items-center gap-4 text-xs font-mono text-muted flex-wrap">
          <span><span className="text-white">{steps.length}</span> STEPS</span>
          <span><span className="text-accent3">{steps.filter(s => s.safety_risk === 'low').length}</span> LOW</span>
          <span><span className="text-warn">{steps.filter(s => s.safety_risk === 'medium').length}</span> MEDIUM</span>
          <span><span className="text-danger">{steps.filter(s => s.safety_risk === 'high').length}</span> HIGH</span>
          {plan.requires_confirmation && (
            <span className="text-warn ml-auto">⚠ REQUIRES CONFIRMATION</span>
          )}
        </div>
      </div>

      {/* Safety review */}
      {review && <SafetyReviewBanner review={review} />}

      {/* Steps list */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-mono text-muted uppercase tracking-wider">EXECUTION PLAN</h3>
          <button
            onClick={() => setShowJson(!showJson)}
            className="text-xs font-mono text-dim hover:text-accent transition-colors"
          >
            {showJson ? 'HIDE JSON' : 'VIEW JSON'}
          </button>
        </div>

        {showJson ? (
          <div className="bg-surface2 border border-border rounded-lg p-4 overflow-auto max-h-64">
            <pre className="text-xs font-mono text-muted whitespace-pre-wrap">
              {JSON.stringify(plan, null, 2)}
            </pre>
          </div>
        ) : (
          <div className="space-y-2">
            {steps.map((step) => (
              <StepCard
                key={step.step_number}
                step={step}
                status={getStepStatus(step.step_number)}
                result={executionState.stepResults[step.step_number]}
              />
            ))}
          </div>
        )}
      </div>

      {/* Progress bar */}
      {isExecuting && executionState.currentStep !== null && (
        <ExecutionProgressBar current={executionState.currentStep} total={steps.length} />
      )}

      {/* Summary */}
      {(isComplete || isFailed) && executionState.summary && (
        <ExecutionSummaryCard summary={executionState.summary} failed={isFailed} />
      )}

      {/* Buttons */}
      {!isExecuting && !isComplete && (
        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={onConfirm}
            disabled={review?.verdict === 'UNSAFE' || reviewing}
            className="
              flex items-center gap-2 px-6 py-2.5
              bg-accent3/10 border border-accent3/30 rounded-lg
              text-accent3 font-mono text-sm font-medium
              hover:bg-accent3/20 hover:border-accent3/50
              disabled:opacity-40 disabled:cursor-not-allowed
              transition-all duration-200
            "
            style={{ boxShadow: '0 0 15px rgba(16,185,129,0.1)' }}
          >
            {reviewing ? (
              <><Spinner color="#10b981" /> REVIEWING SAFETY...</>
            ) : (
              <><span>▶</span> EXECUTE PLAN</>
            )}
          </button>
          {isFailed && (
            <span className="text-danger text-xs font-mono">
              ✗ Stopped at step {executionState.failedStep}
            </span>
          )}
        </div>
      )}

      {isExecuting && (
        <button
          onClick={onStop}
          className="
            flex items-center gap-2 px-6 py-2.5
            bg-danger/10 border border-danger/30 rounded-lg
            text-danger font-mono text-sm
            hover:bg-danger/20 hover:border-danger/50
            transition-all duration-200
          "
        >
          <span>■</span> STOP EXECUTION
        </button>
      )}
    </div>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SafetyReviewBanner({ review }: { review: ReviewResult }) {
  const classes =
    review.verdict === 'SAFE'   ? 'border-accent3/30 bg-accent3/5 text-accent3' :
    review.verdict === 'UNSAFE' ? 'border-danger/30 bg-danger/5 text-danger'   :
                                  'border-warn/30 bg-warn/5 text-warn'

  const icon =
    review.verdict === 'SAFE'   ? '✓' :
    review.verdict === 'UNSAFE' ? '✗' : '⚠'

  return (
    <div className={`border rounded-lg p-3 text-sm font-mono ${classes}`}>
      <div className="flex items-center gap-2 font-medium flex-wrap">
        {icon} AI SAFETY REVIEW: {review.verdict}
        <span className="ml-auto opacity-60 font-normal">{review.confidence}% confidence</span>
      </div>
      {review.recommendation && (
        <p className="mt-1 opacity-80 text-xs">{review.recommendation}</p>
      )}
      {review.risks.length > 0 && review.risks[0] !== 'none' && (
        <ul className="mt-1 text-xs opacity-70 space-y-0.5">
          {review.risks.map((r, i) => <li key={i}>• {r}</li>)}
        </ul>
      )}
    </div>
  )
}

interface StepCardProps {
  step: PlanStep
  status: StepStatus
  result: StepResult | undefined
}

function StepCard({ step, status, result }: StepCardProps) {
  const [expanded, setExpanded] = useState(false)

  const STATUS_STYLES: Record<StepStatus, { border: string; bg: string; indicator: string }> = {
    pending:  { border: 'border-border',     bg: 'bg-surface2',  indicator: 'bg-dim'                    },
    running:  { border: 'border-accent/50',  bg: 'bg-accent/5',  indicator: 'bg-accent animate-pulse'   },
    complete: { border: 'border-accent3/40', bg: 'bg-accent3/5', indicator: 'bg-accent3'                },
    error:    { border: 'border-danger/50',  bg: 'bg-danger/5',  indicator: 'bg-danger'                 },
  }

  const s = STATUS_STYLES[status]

  return (
    <div
      className={`border rounded-lg p-3 transition-all duration-300 cursor-pointer ${s.border} ${s.bg}`}
      onClick={() => setExpanded(!expanded)}
    >
      <div className="flex items-center gap-3">
        <div className="flex-shrink-0 flex items-center gap-2">
          <div className={`w-1.5 h-8 rounded-full transition-all duration-300 ${s.indicator}`} />
          <span className="text-xs font-mono text-dim w-4 text-right">{step.step_number}</span>
        </div>

        <span className="text-base w-6 text-center flex-shrink-0">
          {CAPABILITY_ICONS[step.capability] ?? '⚡'}
        </span>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-white text-xs font-mono truncate">{step.description}</span>
            <span className={`text-xs font-mono px-1.5 py-0.5 rounded border flex-shrink-0 ${RISK_CLASSES[step.safety_risk]}`}>
              {step.safety_risk}
            </span>
          </div>
          <div className="text-dim text-xs font-mono mt-0.5">{step.capability}</div>
        </div>

        <div className="flex-shrink-0 text-xs font-mono">
          {status === 'running'  && <span className="text-accent">RUNNING...</span>}
          {status === 'complete' && <span className="text-accent3">✓ DONE</span>}
          {status === 'error'    && <span className="text-danger">✗ FAILED</span>}
          {status === 'pending'  && <span className="text-dim">PENDING</span>}
        </div>

        <span className="text-dim text-xs">{expanded ? '▲' : '▼'}</span>
      </div>

      {expanded && (
        <div className="mt-3 pt-3 border-t border-border/50 space-y-2 pl-11">
          <div>
            <span className="text-dim text-xs font-mono">PARAMETERS:</span>
            <pre className="text-xs font-mono text-muted mt-1 bg-surface3 p-2 rounded overflow-auto">
              {JSON.stringify(step.parameters, null, 2)}
            </pre>
          </div>
          {result && (
            <div>
              <span className="text-dim text-xs font-mono">RESULT:</span>
              <pre className="text-xs font-mono text-accent3 mt-1 bg-surface3 p-2 rounded overflow-auto max-h-24">
                {JSON.stringify(result, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function ExecutionProgressBar({ current, total }: { current: number; total: number }) {
  const pct = Math.round((current / total) * 100)
  return (
    <div className="bg-surface2 border border-border rounded-lg p-3">
      <div className="flex items-center justify-between mb-2 text-xs font-mono">
        <span className="text-accent">EXECUTING...</span>
        <span className="text-muted">Step {current} / {total}</span>
        <span className="text-accent font-medium">{pct}%</span>
      </div>
      <div className="h-1.5 bg-surface3 rounded-full overflow-hidden">
        <div
          className="h-full bg-accent rounded-full transition-all duration-500 progress-glow"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

function ExecutionSummaryCard({ summary, failed }: { summary: ExecutionSummary; failed: boolean }) {
  return (
    <div className={`border rounded-lg p-4 ${failed ? 'border-danger/30 bg-danger/5' : 'border-accent3/30 bg-accent3/5'}`}>
      <div className={`text-sm font-mono font-medium mb-2 ${failed ? 'text-danger' : 'text-accent3'}`}>
        {failed ? '✗ EXECUTION FAILED' : '✓ EXECUTION COMPLETE'}
      </div>
      <div className="grid grid-cols-3 gap-4 text-xs font-mono">
        <div>
          <div className="text-dim">TOTAL STEPS</div>
          <div className="text-white text-lg font-bold">{summary.total}</div>
        </div>
        <div>
          <div className="text-dim">SUCCESSFUL</div>
          <div className="text-accent3 text-lg font-bold">{summary.success}</div>
        </div>
        <div>
          <div className="text-dim">DURATION</div>
          <div className="text-accent text-lg font-bold">{(summary.duration / 1000).toFixed(1)}s</div>
        </div>
      </div>
    </div>
  )
}

function Spinner({ color = '#00d4ff' }: { color?: string }) {
  return (
    <svg className="animate-spin" width="12" height="12" viewBox="0 0 12 12" fill="none">
      <circle
        cx="6" cy="6" r="5"
        stroke={color} strokeWidth="1.5"
        strokeLinecap="round" strokeDasharray="20" strokeDashoffset="10"
      />
    </svg>
  )
}
