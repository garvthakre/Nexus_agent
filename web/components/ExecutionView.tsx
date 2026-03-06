'use client'
import { useEffect, useRef, useState } from 'react'
import { Plan, ExecutionState, StepStatus, PlanStep } from '@/types'
import TerminalCard from './StepCards/TerminalCard'
import BrowserCard from './StepCards/BrowserCard'
import FileCard from './StepCards/FileCard'
import AppCard from './StepCards/AppCard'

interface ExecutionViewProps {
  plan: Plan
  executionState: ExecutionState
  onConfirm: () => void
  onStop: () => void
}

function getStepStatus(stepNumber: number, executionState: ExecutionState): StepStatus {
  if (executionState.currentStep === stepNumber && executionState.status === 'executing') return 'running'
  if (executionState.completedSteps.includes(stepNumber)) return 'complete'
  if (executionState.failedStep === stepNumber) return 'error'
  return 'pending'
}

// How many steps to show: show all completed + current + 1 upcoming
function getVisibleSteps(steps: PlanStep[], executionState: ExecutionState): PlanStep[] {
  if (executionState.status === 'idle' || executionState.status === 'planned') {
    // Before execution: show all steps in planning mode
    return steps
  }
  const current = executionState.currentStep ?? 0
  const maxVisible = Math.max(current + 1, executionState.completedSteps.length + 1)
  return steps.slice(0, Math.min(maxVisible + 1, steps.length))
}

export default function ExecutionView({ plan, executionState, onConfirm, onStop }: ExecutionViewProps) {
  const bottomRef = useRef<HTMLDivElement>(null)
  const isExecuting = executionState.status === 'executing'
  const isIdle = executionState.status === 'idle' || executionState.status === 'planned'
  const isComplete = executionState.status === 'completed'

  const visibleSteps = getVisibleSteps(plan.steps, executionState)

  // Auto-scroll to bottom as new steps appear
  useEffect(() => {
    if (isExecuting) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
    }
  }, [executionState.currentStep, isExecuting])

  return (
    <div className="flex flex-col h-full">
      {/* Plan summary row */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-[rgba(255,255,255,0.06)] flex-shrink-0">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs text-[#4b5563]">PLAN</span>
          <span className="font-mono text-xs text-[#00d4ff] bg-[#00d4ff]/10 border border-[#00d4ff]/20 px-2 py-0.5 rounded">
            {plan.intent}
          </span>
        </div>
        <span className="text-[#2d2d40] font-mono text-xs">{plan.steps.length} steps</span>
        <span className="text-[#2d2d40] font-mono text-xs">{plan.confidence}% confidence</span>

        <div className="ml-auto flex items-center gap-2">
          {isIdle && (
            <button
              onClick={onConfirm}
              className="flex items-center gap-2 px-4 py-1.5 bg-[#10b981]/10 border border-[#10b981]/30 rounded-lg font-mono text-xs text-[#10b981] hover:bg-[#10b981]/20 transition-all"
            >
              <span>▶</span> Execute
            </button>
          )}
          {isExecuting && (
            <button
              onClick={onStop}
              className="flex items-center gap-2 px-4 py-1.5 bg-[#ef4444]/10 border border-[#ef4444]/30 rounded-lg font-mono text-xs text-[#ef4444] hover:bg-[#ef4444]/20 transition-all"
            >
              <span>■</span> Stop
            </button>
          )}
          {isComplete && (
            <span className="font-mono text-xs text-[#10b981] flex items-center gap-1">
              <span>✓</span> Complete
            </span>
          )}
        </div>
      </div>

      {/* Steps list */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {visibleSteps.map((step, idx) => {
          const status = getStepStatus(step.step_number, executionState)
          const result = executionState.stepResults[step.step_number]

          return (
            <div
              key={step.step_number}
              className="animate-[slideInUp_0.3s_ease-out]"
              style={{ animationDelay: isIdle ? `${idx * 60}ms` : '0ms', animationFillMode: 'both' }}
            >
              <StepCardRouter
                step={step}
                status={status}
                result={result}
              />
            </div>
          )
        })}

        {/* "Upcoming" ghost steps */}
        {isExecuting && executionState.currentStep !== null && (
          <>
            {plan.steps
              .slice(visibleSteps.length, visibleSteps.length + 2)
              .map((step, i) => (
                <div key={step.step_number} className="opacity-25 animate-[slideInUp_0.3s_ease-out]"
                  style={{ animationDelay: `${i * 100}ms`, animationFillMode: 'both' }}>
                  <GhostStep step={step} />
                </div>
              ))
            }
          </>
        )}

        {/* Completion card */}
        {isComplete && executionState.summary && (
          <div className="animate-[slideInUp_0.4s_ease-out] border border-[#10b981]/30 rounded-xl p-4 bg-[#10b981]/5">
            <div className="flex items-center gap-3">
              <span className="text-2xl">✅</span>
              <div className="font-mono">
                <div className="text-[#10b981] text-sm font-medium">All done!</div>
                <div className="text-[#4b5563] text-xs">
                  {executionState.summary.success}/{executionState.summary.total} steps succeeded
                  · {((executionState.summary.duration ?? 0) / 1000).toFixed(1)}s
                </div>
              </div>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>
    </div>
  )
}

// Routes each step to the right card component
function StepCardRouter({ step, status, result }: { step: PlanStep; status: StepStatus; result: any }) {
  const { capability, parameters, description, step_number } = step

  // Terminal / shell
  if (capability === 'run_shell_command') {
    return (
      <TerminalCard
        command={parameters.command ?? ''}
        description={description}
        status={status}
        result={result}
        stepNumber={step_number}
      />
    )
  }

  // Browser
  if (capability.startsWith('browser_')) {
    return (
      <BrowserCard
        capability={capability}
        url={parameters.url}
        selector={parameters.selector}
        value={parameters.value}
        variableName={parameters.variable_name}
        description={description}
        status={status}
        result={result}
        stepNumber={step_number}
      />
    )
  }

  // File operations
  if (capability === 'create_file' || capability === 'create_folder' || capability === 'download_file') {
    return (
      <FileCard
        capability={capability}
        filePath={parameters.path ?? parameters.destination}
        content={parameters.content}
        description={description}
        status={status}
        result={result}
        stepNumber={step_number}
      />
    )
  }

  // App / desktop / wallpaper / wait / generic
  return (
    <AppCard
      capability={capability}
      appName={parameters.app_name}
      elementName={parameters.element_name}
      text={parameters.text}
      description={description}
      status={status}
      result={result}
      stepNumber={step_number}
    />
  )
}

// Ghosted "upcoming" step placeholder
function GhostStep({ step }: { step: PlanStep }) {
  const icons: Record<string, string> = {
    run_shell_command: '💻', browser_open: '🌐', browser_fill: '✏️',
    browser_click: '👆', browser_read_page: '📖', browser_extract_results: '🔍',
    create_file: '📄', create_folder: '📁', open_application: '📱',
    set_wallpaper: '🖼️', wait: '⏳', default: '⚡',
  }
  const icon = icons[step.capability] ?? icons.default

  return (
    <div className="border border-[rgba(255,255,255,0.04)] rounded-xl px-4 py-3 bg-[#060610] flex items-center gap-3">
      <span className="text-lg grayscale">{icon}</span>
      <div className="flex-1 font-mono">
        <div className="text-[#2d2d40] text-xs">{step.description}</div>
        <div className="text-[#1a1a28] text-[11px]">{step.capability}</div>
      </div>
      <span className="font-mono text-[10px] text-[#1a1a28] border border-[rgba(255,255,255,0.04)] px-2 py-0.5 rounded">
        #{step.step_number}
      </span>
    </div>
  )
}