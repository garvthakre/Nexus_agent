'use client'
import { useState } from 'react'
import {
  Plan, PlanStep, ReviewResult, ExecutionState,
  Capability, StepStatus, StepResult, ExecutionSummary,
} from '@/types'

// ── Icons ─────────────────────────────────────────────────────────────────────
const CAP_ICON: Partial<Record<Capability, string>> = {
  open_application: '📱', set_wallpaper: '🖼️', run_shell_command: '💻',
  browser_open: '🌐', browser_fill: '✏️', browser_click: '👆',
  browser_read_page: '📖', browser_extract_results: '⚡',
  browser_wait_for_element: '⏳', browser_get_page_state: '🔍',
  browser_screenshot_analyze: '📸',
  type_text: '⌨️', create_file: '📄', create_folder: '📁',
  wait: '⏳', download_file: '⬇️',
}

// Accent color per capability — returned as Tailwind-compatible hex for inline use only on SVG/border
const CAP_COLOR: Partial<Record<string, string>> = {
  browser_open: '#00e5ff', browser_extract_results: '#a855f7',
  browser_read_page: '#00ffa3', browser_click: '#00e5ff',
  browser_fill: '#ffb340', browser_wait_for_element: '#a855f7',
  browser_get_page_state: '#00e5ff', browser_screenshot_analyze: '#a855f7',
  create_file: '#ffb340', create_folder: '#ffb340',
  run_shell_command: '#ff3d5a', open_application: '#a855f7',
  download_file: '#00e5ff', type_text: '#ddddf0', wait: '#252540',
}
const capColor = (cap: string) => CAP_COLOR[cap] ?? '#00e5ff'

// ── Types ─────────────────────────────────────────────────────────────────────
interface Props {
  plan: Plan | null
  executionState: ExecutionState
  onConfirm: () => void
  onStop: () => void
  reviewing: boolean
  review: ReviewResult | null
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function PlanDisplay({ plan, executionState, onConfirm, onStop, reviewing, review }: Props) {
  const [showJson, setShowJson] = useState(false)

  if (!plan) return null

  const { steps } = plan
  const isExec  = executionState.status === 'executing'
  const isDone  = executionState.status === 'completed'
  const isFail  = executionState.status === 'failed'
  const done    = executionState.completedSteps.length
  const total   = steps.length
  const pct     = isDone ? 100 : isExec && total ? Math.round((done / total) * 100) : 0

  const getStatus = (n: number): StepStatus => {
    if (executionState.currentStep === n && isExec) return 'running'
    if (executionState.completedSteps.includes(n))  return 'complete'
    if (executionState.failedStep === n)             return 'error'
    return 'pending'
  }

  return (
    <div className="flex flex-col gap-4 slide-up-anim">

      {/* ── Plan header ── */}
      <div className="bg-s2 border border-border rounded-[11px] p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-[6px] flex-wrap">
              <span className="font-mono text-[9px] text-muted uppercase tracking-[0.07em]">Intent</span>
              {plan.intent && (
                <span className="font-mono text-[10px] text-cyan bg-cyan/8 border border-cyan/20 px-2 py-[2px] rounded-[5px]">
                  {plan.intent}
                </span>
              )}
            </div>
            <p className="font-sans text-[13px] text-ntext leading-[1.5] mb-3">
              {plan.summary ?? plan.reasoning}
            </p>
            <div className="flex items-center gap-4 font-mono text-[10px] text-muted flex-wrap">
              <span><span className="text-ntext">{total}</span> STEPS</span>
              <span><span className="text-green">{steps.filter((s: PlanStep) => s.safety_risk === 'low').length}</span> LOW</span>
              <span><span className="text-amber">{steps.filter((s: PlanStep) => s.safety_risk === 'medium').length}</span> MED</span>
              <span><span className="text-red">{steps.filter((s: PlanStep) => s.safety_risk === 'high').length}</span> HIGH</span>
              {plan.requires_confirmation && (
                <span className="text-amber ml-auto">⚠ REQUIRES CONFIRMATION</span>
              )}
            </div>
          </div>
          {plan.confidence && (
            <div className="text-right flex-shrink-0">
              <div className="font-display text-[32px] text-cyan leading-none">{plan.confidence}%</div>
              <div className="font-mono text-[8px] text-muted mt-0.5 tracking-[0.06em]">CONFIDENCE</div>
            </div>
          )}
        </div>
      </div>

      {/* ── Progress bar ── */}
      {(isExec || isDone) && (
        <div className={`bg-s2 rounded-[11px] p-3 border
          ${isExec ? 'border-cyan/20 glow-pulse-anim' : 'border-green/20'}`}>
          <div className="flex items-center justify-between mb-2">
            <span className={`font-mono text-[10px] tracking-[0.06em] ${isDone ? 'text-green' : 'text-cyan'}`}>
              {isDone ? '✓ EXECUTION COMPLETE' : `EXECUTING · STEP ${executionState.currentStep} / ${total}`}
            </span>
            <span className={`font-display text-[22px] leading-none ${isDone ? 'text-green' : 'text-cyan'}`}>
              {done}<span className="text-[14px] text-dim">/{total}</span>
            </span>
          </div>
          <div className="h-[3px] bg-dim rounded-full overflow-hidden">
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
      )}

      {/* ── Safety review ── */}
      {review && <SafetyBanner review={review} />}

      {/* ── Steps ── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="font-display text-[14px] tracking-[0.1em] text-ntext">EXECUTION PLAN</div>
          <button
            onClick={() => setShowJson(!showJson)}
            className="font-mono text-[9.5px] text-dim hover:text-cyan transition-colors px-2 py-[2px]"
          >
            {showJson ? 'HIDE JSON' : 'VIEW JSON'}
          </button>
        </div>

        {showJson ? (
          <div className="bg-s2 border border-border rounded-[9px] p-4 overflow-auto max-h-72">
            <pre className="font-mono text-[10.5px] text-muted whitespace-pre-wrap m-0">
              {JSON.stringify(plan, null, 2)}
            </pre>
          </div>
        ) : (
          <div className="flex flex-col">
            {steps.map((step: PlanStep, i: number) => (
              <TimelineStep
                key={step.step_number}
                step={step}
                status={getStatus(step.step_number)}
                index={i}
                result={executionState.stepResults[step.step_number]}
                isLast={i === steps.length - 1}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Summary ── */}
      {(isDone || isFail) && executionState.summary && (
        <SummaryCard summary={executionState.summary} failed={isFail} />
      )}

      {/* ── Action buttons ── */}
      {!isExec && !isDone && (
        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={onConfirm}
            disabled={review?.verdict === 'UNSAFE' || reviewing}
            className={`flex items-center gap-2 px-[22px] py-[9px] rounded-[8px]
              font-mono text-[11px] font-semibold tracking-[0.06em] transition-all duration-200
              disabled:opacity-50 disabled:cursor-not-allowed
              ${review?.verdict === 'UNSAFE' || reviewing
                ? 'bg-s3 border border-border text-muted'
                : 'bg-green/10 border border-green/30 text-green shadow-[0_0_15px_rgba(0,255,163,0.08)]'
              }`}
          >
            {reviewing ? (
              <>
                <svg className="spin-fast" width="11" height="11" viewBox="0 0 11 11" fill="none">
                  <circle cx="5.5" cy="5.5" r="4.5" stroke="#00ffa3" strokeWidth="1.4"
                    strokeDasharray="9 18" strokeLinecap="round"/>
                </svg>
                REVIEWING SAFETY...
              </>
            ) : (
              <><span>▶</span> EXECUTE PLAN</>
            )}
          </button>
          {isFail && (
            <span className="font-mono text-[10px] text-red">
              ✗ Stopped at step {executionState.failedStep}
            </span>
          )}
        </div>
      )}

      {isExec && (
        <button
          onClick={onStop}
          className="flex items-center gap-2 px-[22px] py-[9px] rounded-[8px]
            font-mono text-[11px] font-semibold tracking-[0.06em]
            bg-red/10 border border-red/30 text-red transition-all duration-200
            hover:bg-red/20 hover:border-red/50"
        >
          <span>■</span> STOP EXECUTION
        </button>
      )}
    </div>
  )
}

// ── Timeline Step ─────────────────────────────────────────────────────────────
function TimelineStep({
  step, status, index, result, isLast,
}: {
  step: PlanStep; status: StepStatus; index: number
  result: StepResult | undefined; isLast: boolean
}) {
  const [open, setOpen] = useState(false)
  const running = status === 'running'
  const done    = status === 'complete'
  const error   = status === 'error'
  const pending = status === 'pending'
  const c = capColor(step.capability)

  return (
    <div className={`flex gap-0`} style={{ animationDelay: `${index * 0.04}s` }}>

      {/* Spine */}
      <div className="flex flex-col items-center w-[38px] flex-shrink-0">
        <div className="relative z-[2]">
          {running && (
            <div
              className="absolute -inset-[5px] rounded-full border pulse-ring-anim pointer-events-none"
              style={{ borderColor: c }}
            />
          )}
          <div
            className="w-[26px] h-[26px] rounded-full flex items-center justify-center text-[10px] transition-all duration-300"
            style={{
              background: done ? c : error ? '#ff3d5a' : running ? 'transparent' : '#131320',
              border: `1.5px solid ${done || running ? c : error ? '#ff3d5a' : '#252540'}`,
              boxShadow: done || running ? `0 0 10px ${c}55` : 'none',
            }}
          >
            {done ? (
              <span className="text-[11px] success-pop-anim" style={{ color: '#03030a' }}>✓</span>
            ) : error ? (
              <span className="text-[10px]" style={{ color: '#03030a' }}>✗</span>
            ) : running ? (
              <svg className="spin-fast" width="13" height="13" viewBox="0 0 13 13" fill="none">
                <circle cx="6.5" cy="6.5" r="5" stroke={c} strokeWidth="1.4"
                  strokeDasharray="10 20" strokeLinecap="round"/>
              </svg>
            ) : (
              <span className="font-mono text-[8px] text-muted">{step.step_number}</span>
            )}
          </div>
        </div>

        {!isLast && (
          <div className="flex-1 w-[1.5px] bg-dim relative overflow-hidden min-h-[16px]">
            {done && (
              <div
                className="absolute inset-0 line-fill-anim"
                style={{ background: `linear-gradient(to bottom, ${c}, ${c}77)` }}
              />
            )}
          </div>
        )}
      </div>

      {/* Card */}
      <div
        onClick={() => !pending && setOpen(o => !o)}
        className={`flex-1 ml-[10px] relative overflow-hidden transition-all duration-300
          ${isLast ? '' : 'mb-[3px]'}
          rounded-[9px]
          ${pending ? 'cursor-default' : 'cursor-pointer'}
        `}
        style={{
          background: running ? 'linear-gradient(135deg,#0c0c18,#131320)' : pending ? '#131320' : '#0c0c18',
          border: `1px solid ${running ? c + '44' : error ? 'rgba(255,61,90,0.3)' : pending ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.055)'}`,
          boxShadow: running ? `0 0 18px ${c}14` : 'none',
        }}
      >
        {/* Shimmer scan on running */}
        {running && (
          <div
            className="absolute inset-0 pointer-events-none shimmer-run"
            style={{ background: `linear-gradient(90deg, transparent, ${c}09, transparent)` }}
          />
        )}

        {/* Row */}
        <div className="flex items-center gap-[9px] px-3 py-[9px]">
          <span
            className="text-[15px] leading-none flex-shrink-0"
            style={{ filter: running ? `drop-shadow(0 0 5px ${c})` : 'none' }}
          >
            {CAP_ICON[step.capability] ?? '⚡'}
          </span>

          <div className="flex-1 min-w-0">
            <div className={`font-sans text-[12.5px] font-medium truncate
              ${running ? 'text-white' : done ? 'text-ntext' : pending ? 'text-ntext' : 'text-muted'}`}>
              {step.description}
            </div>
            <div className={`font-mono text-[9.5px] mt-[1px]
              ${pending ? 'text-muted' : 'text-muted'}`}>{step.capability}</div>
          </div>

          <div className="flex items-center gap-[7px] flex-shrink-0">
            {step.safety_risk && (
              <span className={`font-mono text-[9px] px-[6px] py-[1.5px] rounded-[4px] border
                ${step.safety_risk === 'high'   ? 'text-red   bg-red/10   border-red/22'   :
                  step.safety_risk === 'medium' ? 'text-amber bg-amber/10 border-amber/22' :
                                                  'text-green bg-green/8  border-green/18' }`}>
                {step.safety_risk}
              </span>
            )}
            {running && <span className="font-mono text-[10px]" style={{ color: c }}>RUNNING...</span>}
            {done    && <span className="font-mono text-[10px] text-green">✓ DONE</span>}
            {error   && <span className="font-mono text-[10px] text-red">✗ FAILED</span>}
            {!pending && (
              <span className="text-dim text-[9px]">{open ? '▲' : '▼'}</span>
            )}
          </div>
        </div>

        {/* Expandable */}
        {open && !pending && (
          <div className="border-t border-border px-3 py-2 slide-up-anim">
            {running && (
              <div className="flex items-center gap-2">
                <div className="flex gap-1">
                  {[0,1,2].map(k => (
                    <span key={k} className={`w-1 h-1 rounded-full dot-b${k}`}
                      style={{ background: c, display: 'inline-block' }} />
                  ))}
                </div>
                <span className="font-mono text-[11px]" style={{ color: c }}>Processing...</span>
              </div>
            )}
            {done && result && (
              <div className="flex flex-col gap-[6px]">
                <div className="font-mono text-[11px] text-muted">
                  <span className="text-green">✓</span>&nbsp;Step completed
                  {result.message && <span className="ml-2">· {result.message}</span>}
                </div>
                {result.warning && (
                  <div className="font-mono text-[10px] text-amber bg-amber/7 border border-amber/18 rounded-[6px] px-2 py-[5px]">
                    ⚠ {result.warning}
                  </div>
                )}
                <div className="font-mono text-[10px] text-green bg-s3 border border-border rounded-[6px] p-2 max-h-24 overflow-auto">
                  <pre className="m-0 whitespace-pre-wrap">{JSON.stringify(result, null, 2)}</pre>
                </div>
              </div>
            )}
            {error && (
              <div className="font-mono text-[11px] text-red">
                ✗ Step failed — check activity log for details
              </div>
            )}
            <div className="font-mono text-[10px] text-dim mt-2 break-all">
              PARAMS: {JSON.stringify(step.parameters).slice(0, 120)}...
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Safety Banner ─────────────────────────────────────────────────────────────
function SafetyBanner({ review }: { review: ReviewResult }) {
  const ok = review.verdict === 'SAFE', bad = review.verdict === 'UNSAFE'
  return (
    <div className={`rounded-[9px] p-[10px_14px] border
      ${bad ? 'border-red/30   bg-red/6'   :
        ok  ? 'border-green/25 bg-green/5' :
              'border-amber/28 bg-amber/6' }`}>
      <div className={`flex items-center gap-2 font-mono text-[11px] font-semibold flex-wrap
        ${bad ? 'text-red' : ok ? 'text-green' : 'text-amber'}
        ${review.recommendation ? 'mb-[6px]' : ''}`}>
        <span>{bad ? '✗' : ok ? '✓' : '⚠'} AI SAFETY REVIEW: {review.verdict}</span>
        <span className="ml-auto font-normal text-[10px] opacity-65">{review.confidence}% confidence</span>
      </div>
      {review.recommendation && (
        <p className="font-mono text-[10.5px] text-muted m-0 opacity-85">{review.recommendation}</p>
      )}
      {review.risks?.length > 0 && review.risks[0] !== 'none' && (
        <ul className="mt-[6px] p-0 list-none space-y-0.5">
          {review.risks.map((r: string, i: number) => (
            <li key={i} className="font-mono text-[10px] text-muted opacity-75">· {r}</li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ── Summary Card ──────────────────────────────────────────────────────────────
function SummaryCard({ summary, failed }: { summary: ExecutionSummary; failed: boolean }) {
  return (
    <div className={`rounded-[11px] p-4 border slide-up-anim
      ${failed ? 'border-red/28   bg-red/5'    : 'border-green/22 bg-green/8'}`}>
      <div className="flex items-center gap-[10px] mb-3">
        <span className="text-[18px]">{failed ? '❌' : '🎯'}</span>
        <div className={`font-mono text-[11px] font-semibold tracking-[0.05em]
          ${failed ? 'text-red' : 'text-green'}`}>
          {failed ? '✗ EXECUTION FAILED' : '✓ ALL STEPS COMPLETED'}
        </div>
      </div>
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'TOTAL STEPS', value: summary.total,                         color: 'text-ntext' },
          { label: 'SUCCESSFUL',  value: summary.success,                        color: 'text-green' },
          { label: 'DURATION',    value: `${(summary.duration/1000).toFixed(1)}s`, color: 'text-cyan' },
        ].map(({ label, value, color }) => (
          <div key={label}>
            <div className="font-mono text-[8.5px] text-dim tracking-[0.06em] mb-[3px]">{label}</div>
            <div className={`font-display text-[24px] ${color}`}>{value}</div>
          </div>
        ))}
      </div>
    </div>
  )
}