'use client'
import { useState, useEffect } from 'react'
import { useTypewriter } from '@/hooks/useTypewriter'
import { StepStatus, StepResult, Capability } from '@/types'

interface BrowserCardProps {
  capability: Capability
  url?: string
  selector?: string
  value?: string
  variableName?: string
  description: string
  status: StepStatus
  result?: StepResult
  stepNumber: number
}

function StepBadge({ status, number }: { status: StepStatus; number: number }) {
  const cls =
    status === 'running'  ? 'text-[#7c3aed] border-[#7c3aed]/30 bg-[#7c3aed]/5' :
    status === 'complete' ? 'text-[#10b981] border-[#10b981]/30 bg-[#10b981]/5' :
    status === 'error'    ? 'text-[#ef4444] border-[#ef4444]/30 bg-[#ef4444]/5' :
                            'text-[#374151] border-[rgba(255,255,255,0.06)]'
  return (
    <span className={`font-mono text-[10px] px-2 py-0.5 rounded border flex-shrink-0 ${cls}`}>
      #{number}
    </span>
  )
}

function getFavicon(url: string) {
  try {
    const domain = new URL(url).hostname
    return `https://www.google.com/s2/favicons?domain=${domain}&sz=32`
  } catch { return null }
}

function getDomain(url: string) {
  try { return new URL(url).hostname.replace('www.', '') }
  catch { return url.slice(0, 40) }
}

function useStreamLines(lines: string[], intervalMs: number, delay: number) {
  const [visibleLines, setVisibleLines] = useState<string[]>([])
  useEffect(() => {
    setVisibleLines([])
    if (!lines.length) return
    let i = 0
    const start = setTimeout(() => {
      const t = setInterval(() => {
        if (i < lines.length) { setVisibleLines(p => [...p, lines[i]]); i++ }
        else clearInterval(t)
      }, intervalMs)
      return () => clearInterval(t)
    }, delay)
    return () => clearTimeout(start)
  }, [lines.join('|'), intervalMs, delay])
  return { visibleLines }
}

export default function BrowserCard({
  capability, url, selector, value, variableName,
  description, status, result, stepNumber
}: BrowserCardProps) {
  const [loadPct, setLoadPct] = useState(0)
  const [loadDone, setLoadDone] = useState(false)

  const displayUrl = url ?? result?.url ?? ''
  const { displayed: urlTyped } = useTypewriter(
    status !== 'pending' && displayUrl ? displayUrl : '',
    18, 200
  )

  useEffect(() => {
    if (status !== 'running' || capability !== 'browser_open') return
    setLoadPct(0); setLoadDone(false)
    const steps = [15, 40, 65, 85, 95]
    let i = 0
    const t = setInterval(() => {
      if (i < steps.length) { setLoadPct(steps[i]); i++ }
      else clearInterval(t)
    }, 300)
    return () => clearInterval(t)
  }, [status, capability])

  useEffect(() => {
    if (status === 'complete' && capability === 'browser_open') {
      setLoadPct(100)
      setTimeout(() => setLoadDone(true), 400)
    }
  }, [status, capability])

  const favicon = displayUrl ? getFavicon(displayUrl) : null
  const domain  = displayUrl ? getDomain(displayUrl) : ''

  const capLabel: Record<string, string> = {
    browser_open: 'Navigate',
    browser_fill: 'Fill Input',
    browser_click: 'Click',
    browser_read_page: 'Read Page',
    browser_extract_results: 'Extract Results',
    browser_wait_for_element: 'Wait for Element',
    browser_get_page_state: 'Check Page',
  }

  const borderCls =
    status === 'running'  ? 'border-[#7c3aed]/30 shadow-[0_0_20px_rgba(124,58,237,0.06)]' :
    status === 'complete' ? 'border-[#10b981]/25' :
    status === 'error'    ? 'border-[#ef4444]/30' :
                            'border-[rgba(255,255,255,0.06)]'

  return (
    <div className={`rounded-xl overflow-hidden border transition-all duration-500 ${borderCls}`}>
      {/* Browser chrome */}
      <div className="bg-[#0c0c18] border-b border-[rgba(255,255,255,0.05)]">
        {/* Tab bar */}
        <div className="flex items-center gap-2 px-3 pt-2.5 pb-0">
          <div className="flex gap-1.5 flex-shrink-0">
            <span className="w-2.5 h-2.5 rounded-full bg-[#ef4444]/60" />
            <span className="w-2.5 h-2.5 rounded-full bg-[#f59e0b]/60" />
            <span className="w-2.5 h-2.5 rounded-full bg-[#10b981]/60" />
          </div>
          <div className="flex items-center gap-2 bg-[#12121e] rounded-t-md px-3 py-1.5 text-xs font-mono">
            {favicon && status !== 'pending' && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={favicon} alt="" className="w-3 h-3 rounded-sm"
                onError={e => { (e.target as HTMLElement).style.display = 'none' }} />
            )}
            <span className="text-[#6b7280] truncate max-w-[120px]">
              {result?.title ?? domain ?? capLabel[capability] ?? capability}
            </span>
          </div>
          <div className="ml-auto">
            <StepBadge status={status} number={stepNumber} />
          </div>
        </div>

        {/* Address bar */}
        <div className="px-3 pb-2.5 pt-1.5">
          <div className={`flex items-center gap-2 bg-[#080812] rounded-lg px-3 py-1.5 border transition-colors ${status === 'running' ? 'border-[#7c3aed]/30' : 'border-[rgba(255,255,255,0.06)]'}`}>
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" className="text-[#374151] flex-shrink-0">
              <rect x="2" y="4.5" width="6" height="4.5" rx="1" stroke="currentColor" strokeWidth="1"/>
              <path d="M3.5 4.5V3a1.5 1.5 0 013 0v1.5" stroke="currentColor" strokeWidth="1"/>
            </svg>
            <span className="flex-1 font-mono text-[11px] text-[#9ca3af] truncate">
              {status === 'pending'
                ? <span className="text-[#2d2d40] italic">about:blank</span>
                : urlTyped
              }
              {status === 'running' && urlTyped.length < displayUrl.length && (
                <span className="inline-block w-1.5 h-3 bg-[#7c3aed] ml-0.5 animate-pulse" />
              )}
            </span>
            {status === 'running' && (
              <svg className="animate-spin flex-shrink-0" width="10" height="10" viewBox="0 0 10 10" fill="none">
                <circle cx="5" cy="5" r="4" stroke="#7c3aed" strokeWidth="1.5" strokeDasharray="15" strokeDashoffset="6"/>
              </svg>
            )}
            {status === 'complete' && (
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" className="text-[#10b981] flex-shrink-0">
                <path d="M2 5l2.5 2.5L8 3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
              </svg>
            )}
          </div>
        </div>

        {/* Loading bar */}
        {capability === 'browser_open' && !loadDone && loadPct > 0 && (
          <div className="h-[2px] bg-[#0a0a14]">
            <div className="h-full transition-all duration-300"
              style={{ width: `${loadPct}%`, background: 'linear-gradient(90deg, #7c3aed, #a855f7)', boxShadow: '0 0 6px #7c3aed' }} />
          </div>
        )}
      </div>

      {/* Page content area */}
      <div className="bg-[#070710] p-4 min-h-[70px]">
        {capability === 'browser_fill' && (
          <FillVisual selector={selector} value={value} status={status} />
        )}
        {capability === 'browser_click' && (
          <ClickVisual selector={selector} status={status} />
        )}
        {capability === 'browser_read_page' && (
          <ReadVisual variableName={variableName} status={status} result={result} />
        )}
        {capability === 'browser_extract_results' && (
          <ExtractVisual status={status} result={result} />
        )}
        {(capability === 'browser_open' || capability === 'browser_get_page_state') && (
          <OpenVisual status={status} title={result?.title} url={result?.url} />
        )}
        {capability === 'browser_wait_for_element' && (
          <WaitVisual selector={selector} status={status} />
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

function FillVisual({ selector, value, status }: { selector?: string; value?: string; status: StepStatus }) {
  const inputText = status === 'running' || status === 'complete' ? (value ?? '') : ''
  const { displayed } = useTypewriter(inputText, 30, 400)
  const borderCls = status === 'running'
    ? 'border-[#7c3aed]/40 bg-[#7c3aed]/5'
    : 'border-[rgba(255,255,255,0.08)] bg-[#0a0a14]'
  return (
    <div className="space-y-2">
      <div className="text-[#374151] font-mono text-[11px]">
        target: <span className="text-[#6b7280]">{selector?.slice(0, 50)}</span>
      </div>
      <div className={`flex items-center gap-1 rounded-lg border px-3 py-2 font-mono text-xs ${borderCls}`}>
        {status === 'pending' ? (
          <span className="text-[#2d2d40] italic">waiting...</span>
        ) : (
          <>
            <span className="text-white">{displayed}</span>
            {status === 'running' && (
              <span className="inline-block w-1.5 h-3.5 bg-[#7c3aed] animate-pulse" />
            )}
          </>
        )}
      </div>
      {status === 'complete' && (
        <div className="text-[#10b981] font-mono text-[11px]">✓ filled</div>
      )}
    </div>
  )
}

function ClickVisual({ selector, status }: { selector?: string; status: StepStatus }) {
  const [ripple, setRipple] = useState(false)
  useEffect(() => {
    if (status === 'running') { setTimeout(() => setRipple(true), 600) }
  }, [status])
  const btnCls = (status === 'running' || status === 'complete')
    ? 'border-[#7c3aed]/50 bg-[#7c3aed]/10 text-[#a78bfa]'
    : 'border-[rgba(255,255,255,0.08)] text-[#374151]'
  return (
    <div className="space-y-2">
      <div className="text-[#374151] font-mono text-[11px]">
        clicking: <span className="text-[#6b7280]">{selector?.slice(0, 50)}</span>
      </div>
      <div className="flex items-center gap-3">
        <div className="relative">
          <div className={`w-8 h-8 rounded-lg border flex items-center justify-center font-mono text-xs transition-all ${btnCls}`}>
            ↗
          </div>
          {ripple && (
            <div className="absolute inset-0 rounded-lg border-2 border-[#7c3aed] animate-ping" />
          )}
        </div>
        {status === 'complete' && <span className="text-[#10b981] font-mono text-[11px]">✓ clicked</span>}
        {status === 'running' && <span className="text-[#7c3aed] font-mono text-[11px] animate-pulse">clicking...</span>}
      </div>
    </div>
  )
}

function ReadVisual({ variableName, status, result }: { variableName?: string; status: StepStatus; result?: StepResult }) {
  const summary = result?.summary as string | undefined
  const lines = summary ? summary.split('\n').slice(0, 4) : []
  const { visibleLines } = useStreamLines(status === 'complete' ? lines : [], 80, 0)
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-[#374151] font-mono text-[11px]">
        <span>reading page</span>
        {variableName && <span className="text-[#7c3aed]">→ {variableName}</span>}
      </div>
      {status === 'running' && (
        <div className="space-y-1">
          {[90, 70, 80, 50].map((w, i) => (
            <div key={i} className="h-2 rounded bg-[#1a1a2e] relative overflow-hidden" style={{ width: `${w}%` }}>
              <div className="absolute inset-0 shimmer" />
            </div>
          ))}
        </div>
      )}
      {status === 'complete' && visibleLines.length > 0 && (
        <div className="space-y-1 border-l-2 border-[#10b981]/30 pl-3">
          {visibleLines.map((l, i) => (
            <div key={i} className="font-mono text-[11px] text-[#6b7280] leading-relaxed">{l}</div>
          ))}
        </div>
      )}
    </div>
  )
}

function ExtractVisual({ status, result }: { status: StepStatus; result?: StepResult }) {
  const [count, setCount] = useState(0)
  useEffect(() => {
    if (status !== 'running') return
    let n = 0
    const t = setInterval(() => {
      if (n < 5) { n++; setCount(n) } else clearInterval(t)
    }, 300)
    return () => clearInterval(t)
  }, [status])
  return (
    <div className="space-y-2">
      <div className="text-[#374151] font-mono text-[11px]">extracting results from page</div>
      {status === 'running' && (
        <div className="flex items-center gap-2 font-mono text-xs text-[#7c3aed]">
          <span className="animate-spin">⟳</span>
          <span>Found {count}...</span>
        </div>
      )}
      {status === 'complete' && (
        <div className="text-[#10b981] font-mono text-[11px]">✓ {result?.message ?? 'Extracted results'}</div>
      )}
    </div>
  )
}

function OpenVisual({ status, title, url }: { status: StepStatus; title?: string; url?: string }) {
  return (
    <div className="space-y-1">
      {status === 'running' && (
        <div className="flex items-center gap-2 text-[#7c3aed] font-mono text-[11px]">
          <svg className="animate-spin" width="10" height="10" viewBox="0 0 10 10" fill="none">
            <circle cx="5" cy="5" r="4" stroke="#7c3aed" strokeWidth="1.5" strokeDasharray="15" strokeDashoffset="6"/>
          </svg>
          <span>Loading page...</span>
        </div>
      )}
      {status === 'complete' && (
        <div className="space-y-1">
          {title && <div className="font-mono text-xs text-white truncate">{title}</div>}
          {url && <div className="font-mono text-[11px] text-[#4b5563] truncate">{url}</div>}
          <div className="text-[#10b981] font-mono text-[11px]">✓ page loaded</div>
        </div>
      )}
      {status === 'pending' && (
        <div className="text-[#2d2d40] font-mono text-[11px] italic">waiting to navigate...</div>
      )}
    </div>
  )
}

function WaitVisual({ selector, status }: { selector?: string; status: StepStatus }) {
  const [dots, setDots] = useState('')
  useEffect(() => {
    if (status !== 'running') return
    let n = 0
    const t = setInterval(() => { n++; setDots('.'.repeat((n % 3) + 1)) }, 500)
    return () => clearInterval(t)
  }, [status])
  return (
    <div className="font-mono text-[11px] space-y-1">
      <div className="text-[#374151]">waiting for: <span className="text-[#6b7280]">{selector}</span></div>
      {status === 'running' && <div className="text-[#f59e0b]">polling{dots}</div>}
      {status === 'complete' && <div className="text-[#10b981]">✓ element appeared</div>}
    </div>
  )
}