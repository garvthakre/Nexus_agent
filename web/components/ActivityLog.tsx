'use client'
import { useEffect, useRef, useState } from 'react'
import { ActivityEvent, WsMessageType } from '@/types'

interface TypeStyle {
  color: string
  prefix: string
  dim?: boolean
}

const TYPE_STYLES: Record<WsMessageType, TypeStyle> = {
  connected:          { color: '#10b981', prefix: 'SYS' },
  planning:           { color: '#00d4ff', prefix: 'AI ' },
  plan_ready:         { color: '#10b981', prefix: 'PLN' },
  execution_start:    { color: '#00d4ff', prefix: 'RUN' },
  step_start:         { color: '#9ca3af', prefix: 'STP', dim: true },
  step_complete:      { color: '#10b981', prefix: ' OK' },
  step_error:         { color: '#ef4444', prefix: 'ERR' },
  safety_check:       { color: '#f59e0b', prefix: 'SEC' },
  execution_complete: { color: '#10b981', prefix: 'END' },
  execution_failed:   { color: '#ef4444', prefix: 'FAL' },
  execution_stopped:  { color: '#f59e0b', prefix: 'STP' },
  error:              { color: '#ef4444', prefix: 'ERR' },
}

interface TerminalLine {
  event: ActivityEvent
  id: number
}

interface ActivityLogProps {
  events: ActivityEvent[]
}

export default function ActivityLog({ events }: ActivityLogProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [filter, setFilter] = useState<'all' | 'errors' | 'steps'>('all')
  const [lines, setLines] = useState<TerminalLine[]>([])
  const idRef = useRef(0)

  // Convert events to lines with IDs for animation
  useEffect(() => {
    setLines(events.map(e => ({ event: e, id: idRef.current++ })))
  }, [events])

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [lines])

  const filtered = lines.filter(({ event }) => {
    if (filter === 'errors') return event.type === 'step_error' || event.type === 'error' || event.type === 'execution_failed'
    if (filter === 'steps')  return event.type === 'step_start' || event.type === 'step_complete' || event.type === 'step_error'
    return true
  })

  return (
    <div className="flex flex-col h-full bg-[#060610] rounded-xl border border-[rgba(255,255,255,0.06)] overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[rgba(255,255,255,0.05)] flex-shrink-0">
        <div className="flex items-center gap-2">
          <div className="flex gap-1">
            <span className="w-2 h-2 rounded-full bg-[#ef4444]/60" />
            <span className="w-2 h-2 rounded-full bg-[#f59e0b]/60" />
            <span className="w-2 h-2 rounded-full bg-[#10b981]/60" />
          </div>
          <span className="font-mono text-[11px] text-[#374151]">nexus — log</span>
        </div>
        <span className="font-mono text-[10px] text-[#2d2d40]">{events.length} lines</span>
      </div>

      {/* Filter tabs */}
      <div className="flex border-b border-[rgba(255,255,255,0.04)] flex-shrink-0">
        {(['all', 'steps', 'errors'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`flex-1 py-1.5 font-mono text-[10px] uppercase tracking-wider transition-colors
              ${filter === f
                ? 'text-[#00d4ff] border-b border-[#00d4ff] bg-[#00d4ff]/5'
                : 'text-[#2d2d40] hover:text-[#4b5563]'
              }`}
          >
            {f}
          </button>
        ))}
      </div>

      {/* Log lines */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-2 font-mono text-[11px] space-y-0.5">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-[#1a1a28]">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="1.5"/>
              <path d="M7 8h10M7 12h6M7 16h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
            <span className="text-[10px]">waiting for output...</span>
          </div>
        ) : (
          filtered.map(({ event, id }) => {
            const style = TYPE_STYLES[event.type] ?? { color: '#374151', prefix: '···' }
            return (
              <div
                key={id}
                className="flex items-start gap-2 py-0.5 rounded px-1 hover:bg-[rgba(255,255,255,0.02)] transition-colors group"
              >
                {/* Time */}
                <span className="text-[#1a1a28] flex-shrink-0 text-[10px] pt-px group-hover:text-[#374151] transition-colors">
                  {event.time}
                </span>

                {/* Prefix badge */}
                <span
                  className="flex-shrink-0 text-[10px] font-bold tracking-wider pt-px w-7"
                  style={{ color: style.color }}
                >
                  {style.prefix}
                </span>

                {/* Message */}
                <span
                  className="break-all leading-relaxed"
                  style={{ color: style.dim ? '#4b5563' : style.color, opacity: style.dim ? 0.7 : 1 }}
                >
                  {event.message}
                </span>
              </div>
            )
          })
        )}

        {/* Blinking cursor */}
        {lines.length > 0 && (
          <div className="flex items-center gap-2 px-1 pt-1">
            <span className="text-[#1a1a28] text-[10px] w-[52px]" />
            <span className="text-[#00d4ff] text-[10px]">›</span>
            <span className="w-2 h-3 bg-[#00d4ff] animate-[blink_1s_step-end_infinite] opacity-70" />
          </div>
        )}
      </div>

      {/* Footer stats */}
      <div className="flex items-center gap-3 px-3 py-1.5 border-t border-[rgba(255,255,255,0.04)] flex-shrink-0">
        <StatPill
          label="ok"
          count={events.filter(e => e.type === 'step_complete').length}
          color="#10b981"
        />
        <StatPill
          label="err"
          count={events.filter(e => e.type === 'step_error' || e.type === 'error').length}
          color="#ef4444"
        />
        <StatPill
          label="ai"
          count={events.filter(e => e.type === 'planning').length}
          color="#00d4ff"
        />
      </div>
    </div>
  )
}

function StatPill({ label, count, color }: { label: string; count: number; color: string }) {
  return (
    <div className="flex items-center gap-1">
      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color }} />
      <span className="font-mono text-[10px]" style={{ color: count > 0 ? color : '#2d2d40' }}>
        {count} {label}
      </span>
    </div>
  )
}