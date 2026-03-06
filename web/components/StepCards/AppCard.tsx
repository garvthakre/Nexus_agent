'use client'
import { useState, useEffect } from 'react'
import { useTypewriter } from '@/hooks/useTypewriter'
import { StepStatus, StepResult, Capability } from '@/types'

interface AppCardProps {
  capability: Capability
  appName?: string
  elementName?: string
  text?: string
  description: string
  status: StepStatus
  result?: StepResult
  stepNumber: number
}

const APP_ICONS: Record<string, string> = {
  whatsapp: '💬', discord: '🎮', spotify: '🎵',
  chrome: '🌐', vscode: '💻', code: '💻',
  telegram: '✈️', slack: '💼', zoom: '📹',
  teams: '👥', notepad: '📝', calculator: '🧮',
  excel: '📊', word: '📄', powerpoint: '📊',
  steam: '🎮', default: '🖥️',
}

function getAppIcon(name: string) {
  const lower = name.toLowerCase()
  for (const [key, icon] of Object.entries(APP_ICONS)) {
    if (lower.includes(key)) return icon
  }
  return APP_ICONS.default
}

export default function AppCard({ capability, appName, elementName, text, description, status, result, stepNumber }: AppCardProps) {
  const app = appName ?? ''
  const icon = getAppIcon(app)
  const [windowOpen, setWindowOpen] = useState(false)
  const [cursorPos, setCursorPos] = useState({ x: 20, y: 20 })
  const [clicked, setClicked] = useState(false)

  const { displayed: textTyped } = useTypewriter(
    status === 'running' && capability === 'app_type' ? (text ?? '') : '',
    30, 600
  )

  // Animate window opening
  useEffect(() => {
    if (status === 'running' && capability === 'open_application') {
      setTimeout(() => setWindowOpen(true), 400)
    }
    if (status === 'complete') setWindowOpen(true)
  }, [status, capability])

  // Animate cursor moving to click target
  useEffect(() => {
    if (status === 'running' && capability === 'app_click') {
      setTimeout(() => setCursorPos({ x: 60, y: 40 }), 300)
      setTimeout(() => setClicked(true), 800)
    }
  }, [status, capability])

  const capLabel: Record<string, string> = {
    open_application: 'Launch App',
    app_find_window: 'Find Window',
    app_focus_window: 'Focus Window',
    app_click: 'Click Element',
    app_type: 'Type Text',
    app_screenshot: 'Screenshot',
    app_verify: 'Verify',
    set_wallpaper: 'Set Wallpaper',
  }

  return (
    <div className={`
      rounded-xl overflow-hidden border transition-all duration-500
      ${status === 'running'  ? 'border-[#06b6d4]/30 shadow-[0_0_20px_rgba(6,182,212,0.06)]' :
        status === 'complete' ? 'border-[#10b981]/25' :
        status === 'error'    ? 'border-[#ef4444]/30' :
                                'border-[rgba(255,255,255,0.06)]'}
    `}>
      {/* App header */}
      <div className="flex items-center gap-3 px-4 py-3 bg-[#0a0a14] border-b border-[rgba(255,255,255,0.05)]">
        <span className="text-2xl">{icon}</span>
        <div className="flex-1 min-w-0">
          <div className="font-mono text-sm text-white">{app || description}</div>
          <div className="font-mono text-[11px] text-[#4b5563]">{capLabel[capability] ?? capability}</div>
        </div>
        <StepBadge status={status} number={stepNumber} />
      </div>

      {/* Visual area */}
      <div className="bg-[#060610] p-4 min-h-[80px]">
        {capability === 'open_application' && (
          <OpenAppVisual appName={app} icon={icon} windowOpen={windowOpen} status={status} result={result} />
        )}
        {capability === 'app_click' && (
          <ClickVisual elementName={elementName} cursorPos={cursorPos} clicked={clicked} status={status} />
        )}
        {capability === 'app_type' && (
          <TypeVisual elementName={elementName} text={text ?? ''} typed={textTyped} status={status} />
        )}
        {capability === 'app_find_window' && (
          <FindWindowVisual appName={app} status={status} result={result} />
        )}
        {capability === 'set_wallpaper' && (
          <WallpaperVisual status={status} result={result} />
        )}
        {(capability === 'app_focus_window' || capability === 'app_screenshot' || capability === 'app_verify') && (
          <GenericAppVisual description={description} status={status} result={result} />
        )}

        {status === 'error' && (
          <div className="flex items-start gap-2 text-[#ef4444] font-mono text-xs mt-2">
            <span>✗</span><span>{result?.error ?? 'Step failed'}</span>
          </div>
        )}
      </div>
    </div>
  )
}

function OpenAppVisual({ appName, icon, windowOpen, status, result }: {
  appName: string; icon: string; windowOpen: boolean; status: StepStatus; result?: StepResult
}) {
  return (
    <div className="space-y-3">
      <div className="font-mono text-[11px] text-[#374151]">
        {status === 'pending' ? 'waiting...' :
         status === 'running' ? 'launching application...' :
         status === 'complete' ? '✓ application launched' : ''}
      </div>
      {/* Fake desktop icon → window animation */}
      <div className={`
        flex items-center gap-3 border rounded-lg px-3 py-2 transition-all duration-500 font-mono text-xs
        ${windowOpen
          ? 'border-[#10b981]/30 bg-[#10b981]/5 text-[#10b981]'
          : status === 'running'
            ? 'border-[#06b6d4]/30 bg-[#06b6d4]/5 text-[#06b6d4]'
            : 'border-[rgba(255,255,255,0.06)] text-[#374151]'
        }
      `}>
        <span className="text-xl">{icon}</span>
        <div>
          <div className="text-white">{appName}</div>
          {windowOpen && <div className="text-[11px] opacity-70">{result?.message ?? 'window ready'}</div>}
          {!windowOpen && status === 'running' && <div className="text-[11px] animate-pulse">starting...</div>}
        </div>
        {windowOpen && <span className="ml-auto">✓</span>}
      </div>
    </div>
  )
}

function ClickVisual({ elementName, cursorPos, clicked, status }: {
  elementName?: string; cursorPos: { x: number; y: number }; clicked: boolean; status: StepStatus
}) {
  return (
    <div className="space-y-2">
      <div className="font-mono text-[11px] text-[#374151]">element: <span className="text-[#6b7280]">{elementName}</span></div>
      {/* Miniature desktop with cursor */}
      <div className="relative h-16 bg-[#0a0a14] rounded-lg border border-[rgba(255,255,255,0.06)] overflow-hidden">
        {/* Fake UI elements */}
        <div className="absolute top-3 left-3 w-20 h-3 bg-[#1a1a2e] rounded" />
        <div className="absolute top-3 left-28 w-12 h-3 bg-[#1a1a2e] rounded" />
        <div className="absolute top-8 left-3 right-3 h-8 bg-[#1a1a2e] rounded" />

        {/* Cursor */}
        <div
          className="absolute transition-all duration-500 z-10"
          style={{ left: cursorPos.x, top: cursorPos.y }}
        >
          <svg width="14" height="16" viewBox="0 0 14 16" fill="none">
            <path d="M1 1l10 9H7l2 5-3 1-2-5H1V1z" fill="white" stroke="#000" strokeWidth="0.5"/>
          </svg>
          {clicked && (
            <div className="absolute -inset-3 rounded-full border border-[#06b6d4] animate-[ping_0.5s_ease-out_1]" />
          )}
        </div>
      </div>
      {status === 'complete' && <div className="text-[#10b981] font-mono text-[11px]">✓ clicked</div>}
    </div>
  )
}

function TypeVisual({ elementName, text, typed, status }: {
  elementName?: string; text: string; typed: string; status: StepStatus
}) {
  return (
    <div className="space-y-2">
      <div className="font-mono text-[11px] text-[#374151]">typing into: <span className="text-[#6b7280]">{elementName}</span></div>
      <div className="bg-[#0a0a14] border border-[rgba(255,255,255,0.08)] rounded-lg px-3 py-2 font-mono text-xs min-h-[36px]">
        {status !== 'pending'
          ? <><span className="text-white">{typed || text}</span>
              {status === 'running' && typed.length < text.length && (
                <span className="inline-block w-1.5 h-3.5 bg-[#06b6d4] animate-[blink_1s_step-end_infinite]" />
              )}</>
          : <span className="text-[#2d2d40] italic">waiting...</span>
        }
      </div>
      {status === 'complete' && <div className="text-[#10b981] font-mono text-[11px]">✓ typed</div>}
    </div>
  )
}

function FindWindowVisual({ appName, status, result }: { appName: string; status: StepStatus; result?: StepResult }) {
  return (
    <div className="font-mono text-[11px] space-y-1">
      <div className="text-[#374151]">searching for window: <span className="text-[#6b7280]">{appName}</span></div>
      {status === 'running' && <div className="text-[#06b6d4] animate-pulse">scanning windows...</div>}
      {status === 'complete' && <div className="text-[#10b981]">✓ {result?.message ?? 'window found'}</div>}
    </div>
  )
}

function WallpaperVisual({ status, result }: { status: StepStatus; result?: StepResult }) {
  return (
    <div className="space-y-2">
      <div className="font-mono text-[11px] text-[#374151]">changing desktop wallpaper</div>
      <div className={`h-12 rounded-lg border transition-all duration-700 relative overflow-hidden
        ${status === 'complete'
          ? 'border-[#10b981]/30 bg-gradient-to-br from-[#1a1a3e] to-[#0a0a1e]'
          : 'border-[rgba(255,255,255,0.06)] bg-[#0a0a14]'
        }`}>
        {status === 'complete' && (
          <div className="absolute inset-0 bg-gradient-to-br from-[#7c3aed]/20 to-[#06b6d4]/20 animate-[fadeIn_0.5s_ease-out]" />
        )}
        {status === 'running' && (
          <div className="absolute inset-0 shimmer" />
        )}
      </div>
      {status === 'complete' && <div className="text-[#10b981] font-mono text-[11px]">✓ {result?.message ?? 'wallpaper set'}</div>}
    </div>
  )
}

function GenericAppVisual({ description, status, result }: { description: string; status: StepStatus; result?: StepResult }) {
  return (
    <div className="font-mono text-[11px] space-y-1">
      <div className="text-[#374151]">{description}</div>
      {status === 'running' && <div className="text-[#06b6d4] animate-pulse">executing...</div>}
      {status === 'complete' && <div className="text-[#10b981]">✓ {result?.message ?? 'done'}</div>}
    </div>
  )
}

function StepBadge({ status, number }: { status: StepStatus; number: number }) {
  return (
    <span className={`font-mono text-[10px] px-2 py-0.5 rounded border flex-shrink-0
      ${status === 'running'  ? 'text-[#06b6d4] border-[#06b6d4]/30 bg-[#06b6d4]/5' :
        status === 'complete' ? 'text-[#10b981] border-[#10b981]/30 bg-[#10b981]/5' :
        status === 'error'    ? 'text-[#ef4444] border-[#ef4444]/30 bg-[#ef4444]/5' :
                                'text-[#374151] border-[rgba(255,255,255,0.06)]'
      }`}>
      #{number}
    </span>
  )
}