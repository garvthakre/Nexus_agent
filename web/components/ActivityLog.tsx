'use client'
import { useEffect, useRef } from 'react'
import { ActivityEvent, WsMessageType } from '@/types'

interface TypeStyle { color: string; prefix: string }

const TYPE_STYLES: Record<WsMessageType, TypeStyle> = {
  connected:          { color: 'text-green',  prefix: '✓ SYS'  },
  planning:           { color: 'text-cyan',   prefix: '◈  AI'  },
  plan_ready:         { color: 'text-green',  prefix: '✓ PLN'  },
  execution_start:    { color: 'text-cyan',   prefix: '▶ RUN'  },
  step_start:         { color: 'text-ntext',  prefix: '   →'   },
  step_complete:      { color: 'text-green',  prefix: '   ✓'   },
  step_error:         { color: 'text-red',    prefix: '   ✗'   },
  safety_check:       { color: 'text-amber',  prefix: '⚠ SAF' },
  execution_complete: { color: 'text-green',  prefix: '✓ DONE' },
  execution_failed:   { color: 'text-red',    prefix: '✗ FAIL' },
  execution_stopped:  { color: 'text-amber',  prefix: '■ STOP' },
  error:              { color: 'text-red',    prefix: '✗ ERR'  },
}

const FALLBACK: TypeStyle = { color: 'text-muted', prefix: '  ·' }

export default function ActivityLog({ events }: { events: ActivityEvent[] }) {
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [events])

  return (
    <div className="flex flex-col h-full bg-s1 border border-border rounded-[13px] overflow-hidden glow-border">

      {/* Title bar */}
      <div className="flex items-center gap-2 px-[14px] py-[9px] border-b border-border bg-s2 flex-shrink-0">
        <div className="flex gap-[5px]">
          {['#ff5f57','#ffbd2e','#28c840'].map((c, i) => (
            <div key={i} className="w-[9px] h-[9px] rounded-full opacity-75" style={{ background: c }} />
          ))}
        </div>
        <span className="font-mono text-[10.5px] text-muted ml-1">nexus — activity log</span>
        <span className="font-mono text-[9.5px] text-dim ml-auto">{events.length} events</span>
      </div>

      {/* Events */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto py-[10px] font-mono">
        {events.length === 0 ? (
          <div className="text-center text-dim font-mono text-[11px] py-7">
            awaiting activity...
          </div>
        ) : events.map((ev, i) => {
          const s = TYPE_STYLES[ev.type] ?? FALLBACK
          const isLast = i === events.length - 1
          return (
            <div
              key={i}
              className={`flex gap-0 py-[1.5px] text-[10.5px] leading-[1.65] ${isLast ? 'slide-up-anim' : ''}`}
            >
              <span className="text-dim w-[66px] pl-3 pr-2 flex-shrink-0 select-none">{ev.time}</span>
              <span className={`w-[40px] flex-shrink-0 font-semibold ${s.color}`}>{s.prefix}</span>
              <span className={`flex-1 pr-3 break-all ${s.color} ${ev.type === 'connected' ? 'opacity-55' : 'opacity-90'}`}>
                {ev.message}
              </span>
            </div>
          )
        })}

        {/* Blinking cursor */}
        <div className="flex items-center gap-[5px] pl-3 pt-1 font-mono text-[10.5px]">
          <span className="text-dim">nexus@agent</span>
          <span className="text-muted">~</span>
          <span className="text-cyan">$</span>
          <span className="inline-block w-[6.5px] h-3 bg-cyan ml-1 rounded-[1px] cursor-blink" />
        </div>
      </div>
    </div>
  )
}