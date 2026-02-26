'use client'
import { useEffect, useRef } from 'react'
import { ActivityEvent, WsMessageType } from '@/types'

interface TypeStyle {
  color: string
  prefix: string
}

const TYPE_STYLES: Record<WsMessageType, TypeStyle> = {
  connected:          { color: 'text-accent3',  prefix: '✓ SYSTEM'   },
  planning:           { color: 'text-accent',   prefix: '◈ AI'       },
  plan_ready:         { color: 'text-accent3',  prefix: '✓ PLAN'     },
  execution_start:    { color: 'text-accent',   prefix: '▶ EXEC'     },
  step_start:         { color: 'text-white',    prefix: '  →'        },
  step_complete:      { color: 'text-accent3',  prefix: '  ✓'        },
  step_error:         { color: 'text-danger',   prefix: '  ✗'        },
  safety_check:       { color: 'text-warn',     prefix: '⚠ SAFETY'  },
  execution_complete: { color: 'text-accent3',  prefix: '✓ COMPLETE' },
  execution_failed:   { color: 'text-danger',   prefix: '✗ FAILED'  },
  execution_stopped:  { color: 'text-warn',     prefix: '■ STOPPED'  },
  error:              { color: 'text-danger',   prefix: '✗ ERROR'   },
}

const FALLBACK_STYLE: TypeStyle = { color: 'text-muted', prefix: ' ·' }

interface ActivityLogProps {
  events: ActivityEvent[]
}

export default function ActivityLog({ events }: ActivityLogProps) {
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [events])

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-2 border-b border-border">
        <span className="text-xs font-mono text-muted uppercase tracking-wider">ACTIVITY LOG</span>
        <span className="text-xs font-mono text-dim">{events.length} events</span>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-1 font-mono text-xs">
        {events.length === 0 ? (
          <div className="text-dim text-center py-8">
            <div className="mb-2">▋</div>
            Waiting for activity...
          </div>
        ) : (
          events.map((event, i) => {
            const style = TYPE_STYLES[event.type] ?? FALLBACK_STYLE
            return (
              <div key={i} className="flex items-start gap-2 animate-fade-in">
                <span className="text-dim flex-shrink-0 w-16 text-right">{event.time}</span>
                <span className={`flex-shrink-0 w-16 ${style.color}`}>{style.prefix}</span>
                <span className={`${style.color} opacity-80 break-all`}>{event.message}</span>
              </div>
            )
          })
        )}
        {events.length > 0 && (
          <div className="text-dim flex items-center gap-1">
            <span>{'>'}</span>
            <span className="cursor-blink">▋</span>
          </div>
        )}
      </div>
    </div>
  )
}
