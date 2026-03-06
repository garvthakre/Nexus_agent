'use client'
import { useEffect, useState } from 'react'
import { useTypewriter, useStreamLines } from '@/hooks/useTypewriter'
import { StepStatus, StepResult } from '@/types'

interface TerminalCardProps {
  command: string
  description: string
  status: StepStatus
  result?: StepResult
  stepNumber: number
}

const FAKE_OUTPUTS: Record<string, string[]> = {
  python: [
    'Python 3.11.0',
    'Executing script...',
  ],
  pip: [
    'Looking up package...',
    'Downloading...',
    'Installing...',
    'Successfully installed',
  ],
  node: ['Node.js runtime', 'Executing...'],
  code: ['Opening Visual Studio Code...'],
  notepad: ['Launching Notepad...'],
  npm: ['Reading package.json...', 'Resolving dependencies...', 'Done'],
  default: ['Executing command...'],
}

function getFakeOutput(cmd: string): string[] {
  const lower = cmd.toLowerCase()
  for (const [key, lines] of Object.entries(FAKE_OUTPUTS)) {
    if (lower.includes(key)) return lines
  }
  return FAKE_OUTPUTS.default
}

export default function TerminalCard({ command, description, status, result, stepNumber }: TerminalCardProps) {
  const { displayed: cmdTyped } = useTypewriter(
    status !== 'pending' ? command : '',
    22,
    100
  )

  const fakeLines = getFakeOutput(command)
  const { visibleLines } = useStreamLines(
    status === 'running' || status === 'complete' ? fakeLines : [],
    200,
    command.length * 22 + 200
  )

  const realOutput = result?.stdout ? result.stdout.split('\n').slice(0, 6) : []
  const showReal = status === 'complete' && realOutput.length > 0

  return (
    <div className={`
      rounded-xl overflow-hidden border transition-all duration-500
      ${status === 'running'  ? 'border-[#00d4ff]/30 shadow-[0_0_20px_rgba(0,212,255,0.06)]' :
        status === 'complete' ? 'border-[#10b981]/25 shadow-[0_0_12px_rgba(16,185,129,0.04)]' :
        status === 'error'    ? 'border-[#ef4444]/30' :
                                'border-[rgba(255,255,255,0.06)]'}
    `}>
      {/* Title bar */}
      <div className="flex items-center gap-2 px-4 py-2.5 bg-[#0a0a14] border-b border-[rgba(255,255,255,0.05)]">
        <div className="flex gap-1.5">
          <span className="w-3 h-3 rounded-full bg-[#ef4444]/70" />
          <span className="w-3 h-3 rounded-full bg-[#f59e0b]/70" />
          <span className="w-3 h-3 rounded-full bg-[#10b981]/70" />
        </div>
        <span className="flex-1 text-center font-mono text-xs text-[#374151]">terminal</span>
        <StepBadge status={status} number={stepNumber} />
      </div>

      {/* Terminal body */}
      <div className="bg-[#060610] p-4 font-mono text-xs min-h-[80px]">
        {/* Prompt line */}
        {status !== 'pending' && (
          <div className="flex items-start gap-2 mb-2">
            <span className="text-[#10b981] flex-shrink-0">❯</span>
            <span className="text-[#e2e8f0] break-all">{cmdTyped}
              {status === 'running' && cmdTyped.length < command.length && (
                <span className="inline-block w-2 h-3 bg-[#00d4ff] ml-0.5 animate-pulse" />
              )}
            </span>
          </div>
        )}

        {status === 'pending' && (
          <div className="flex items-center gap-2 text-[#2d2d40]">
            <span>❯</span>
            <span className="italic">waiting...</span>
          </div>
        )}

        {/* Streaming fake output */}
        {visibleLines.map((line, i) => (
          <div key={i} className="text-[#4b5563] pl-4 leading-relaxed animate-[fadeIn_0.2s_ease-out]">
            {line}
          </div>
        ))}

        {/* Real stdout output */}
        {showReal && (
          <div className="mt-2 border-t border-[rgba(255,255,255,0.04)] pt-2">
            {realOutput.map((line, i) => (
              <div key={i} className="text-[#6b7280] pl-4 leading-relaxed text-[11px]">{line}</div>
            ))}
          </div>
        )}

        {/* Success / error indicator */}
        {status === 'complete' && (
          <div className="flex items-center gap-2 mt-2 text-[#10b981]">
            <span>✓</span>
            <span>{result?.message ?? 'Command completed'}</span>
          </div>
        )}

        {status === 'error' && (
          <div className="flex items-start gap-2 mt-2 text-[#ef4444]">
            <span>✗</span>
            <span className="break-all">{result?.error ?? 'Command failed'}</span>
          </div>
        )}
      </div>
    </div>
  )
}

function StepBadge({ status, number }: { status: StepStatus; number: number }) {
  return (
    <span className={`font-mono text-[10px] px-2 py-0.5 rounded border
      ${status === 'running'  ? 'text-[#00d4ff] border-[#00d4ff]/30 bg-[#00d4ff]/5' :
        status === 'complete' ? 'text-[#10b981] border-[#10b981]/30 bg-[#10b981]/5' :
        status === 'error'    ? 'text-[#ef4444] border-[#ef4444]/30 bg-[#ef4444]/5' :
                                'text-[#374151] border-[rgba(255,255,255,0.06)]'
      }`}>
      #{number}
    </span>
  )
}