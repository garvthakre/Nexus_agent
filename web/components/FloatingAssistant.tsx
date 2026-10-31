'use client'

import { useState, useEffect, useRef } from 'react'
import { api } from '@/lib/api'
import type { WsMessage } from '@/types'

const QUICK_ACTIONS = [
  { label: '🎯 Scan & Act on Current Page', prompt: 'Fill this form on the current page with 399 recharge for 9876543210 and proceed to checkout' },
  { label: '⚡ Airtel ₹399 Recharge', prompt: 'Do a recharge of 399 Airtel and open the checkout page' },
  { label: '⚡ Jio ₹299 Plan', prompt: 'Recharge 299 Jio on mobile portal and proceed to pay' },
  { label: '⚡ Check Support Ticket', prompt: 'Open Paytm support portal and check status of latest dispute' },
]

export default function FloatingAssistant() {
  const [isOpen, setIsOpen] = useState(false)
  const [prompt, setPrompt] = useState('')
  const [loading, setLoading] = useState(false)
  const [statusMessage, setStatusMessage] = useState<string>('Ready to automate')
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  const [steps, setSteps] = useState<{ stepNumber: number; desc: string; status: 'pending' | 'running' | 'done' | 'error' }[]>([])
  const [handoffNotice, setHandoffNotice] = useState<string | null>(null)
  const wsRef = useRef<WebSocket | null>(null)

  // Listen for Ctrl+Space to toggle floating assistant
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.code === 'Space') {
        e.preventDefault()
        setIsOpen((prev) => !prev)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  // Setup WebSocket connection to listen to live execution steps
  useEffect(() => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('nexus_token') : null
    const wsUrl = `ws://localhost:3001${token ? `?token=${token}` : ''}`
    
    let ws: WebSocket
    try {
      ws = new WebSocket(wsUrl)
      wsRef.current = ws

      ws.onmessage = (event) => {
        try {
          const msg: WsMessage = JSON.parse(event.data)

          if (msg.type === 'planning') {
            setStatusMessage(msg.message || 'Compiling plan...')
          } else if (msg.type === 'plan_ready' && msg.plan) {
            setStatusMessage(`Plan ready (${msg.plan.steps.length} steps)`)
            setSteps(
              msg.plan.steps.map((s) => ({
                stepNumber: s.step_number,
                desc: s.description,
                status: 'pending',
              }))
            )
          } else if (msg.type === 'step_start' && msg.stepNumber) {
            setStatusMessage(`Executing Step ${msg.stepNumber}: ${msg.step?.description || ''}`)
            setSteps((cur) =>
              cur.map((s) =>
                s.stepNumber === msg.stepNumber ? { ...s, status: 'running' } : s
              )
            )
          } else if (msg.type === 'step_complete' && msg.stepNumber) {
            setSteps((cur) =>
              cur.map((s) =>
                s.stepNumber === msg.stepNumber ? { ...s, status: 'done' } : s
              )
            )
          } else if (msg.type === 'execution_complete') {
            setStatusMessage('Execution Complete!')
            setLoading(false)
            setHandoffNotice(
              'Reached checkout/destination page! Please enter your payment PIN/OTP directly to complete.'
            )
          } else if (msg.type === 'error' || msg.type === 'execution_failed') {
            setStatusMessage(msg.message || 'Execution error')
            setLoading(false)
          }
        } catch {
          // Ignore JSON parse errors
        }
      }
    } catch {
      // WS connection fallback
    }

    return () => {
      if (ws) ws.close()
    }
  }, [isOpen])

  const executeTask = async (taskPrompt: string) => {
    if (!taskPrompt.trim() || loading) return
    setLoading(true)
    setHandoffNotice(null)
    setSteps([])
    setStatusMessage('Analyzing intent and compiling workflow...')

    try {
      // 1. Generate Plan
      const planRes = await api.plan(taskPrompt)
      setActiveSessionId(planRes.sessionId)
      setStatusMessage('Plan generated. Launching browser execution...')

      // 2. Execute Plan
      await api.execute(planRes.sessionId)
    } catch (err) {
      setStatusMessage((err as Error).message || 'Failed to start execution')
      setLoading(false)
    }
  }

  return (
    <>
      {/* ─── FLOATING HOVER BUTTON (Always visible on Top-Left) ─── */}
      <div className="fixed top-4 left-4 z-[9999] select-none font-sans">
        {!isOpen ? (
          <button
            onClick={() => setIsOpen(true)}
            title="Press Ctrl+Space to toggle Nexus Assist"
            className="flex items-center gap-2.5 px-3.5 py-2 rounded-full bg-[#0A1B33]/90 hover:bg-[#112544] 
              border border-[#00BAF2]/40 hover:border-[#00BAF2] text-white shadow-[0_8px_25px_rgba(0,186,242,0.25)] 
              backdrop-blur-md transition-all duration-200 cursor-pointer group hover:scale-105"
          >
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#00BAF2] opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[#00BAF2]"></span>
            </span>
            <span className="font-semibold text-xs tracking-wider uppercase text-white group-hover:text-[#00BAF2]">
              Nexus Assist
            </span>
            <span className="text-[10px] text-gray-400 font-mono bg-black/40 px-1.5 py-0.5 rounded border border-white/10">
              Ctrl+Space
            </span>
          </button>
        ) : (
          /* ─── EXPANDED FLOATING ASSISTANT CARD ─── */
          <div className="w-[380px] bg-[#0A1B33]/95 backdrop-blur-xl border border-[#1F3E6D] rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.7)] overflow-hidden flex flex-col transition-all duration-300">
            
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 bg-[#112544]/80 border-b border-[#1F3E6D]">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-md bg-[#00BAF2] flex items-center justify-center text-black font-bold text-xs">
                  ⚡
                </div>
                <div>
                  <div className="font-bold text-xs text-white tracking-wide">NEXUS COPILOT</div>
                  <div className="text-[10px] text-[#00BAF2] font-mono flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-400"></span>
                    Live Web Automation
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setIsOpen(false)}
                  className="w-7 h-7 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 flex items-center justify-center text-sm transition-colors cursor-pointer"
                  title="Minimize"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Quick Suggestions Strip */}
            <div className="p-3 border-b border-[#1F3E6D]/50 bg-[#0D213F]/50">
              <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">
                Quick Shortcuts
              </div>
              <div className="flex flex-wrap gap-1.5">
                {QUICK_ACTIONS.map((action, i) => (
                  <button
                    key={i}
                    onClick={() => {
                      setPrompt(action.prompt)
                      executeTask(action.prompt)
                    }}
                    className="text-[11px] px-2.5 py-1 rounded-full bg-[#112544] hover:bg-[#00BAF2]/20 
                      text-gray-200 hover:text-[#00BAF2] border border-[#1F3E6D] hover:border-[#00BAF2]/60 
                      transition-all cursor-pointer text-left"
                  >
                    {action.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Step Trace / Status Feed */}
            <div className="p-4 flex-1 min-h-[140px] max-h-[220px] overflow-y-auto space-y-2 text-xs">
              <div className="text-[11px] text-gray-400 flex items-center gap-2 font-mono">
                {loading && (
                  <span className="w-2 h-2 rounded-full bg-[#00BAF2] animate-ping" />
                )}
                <span className="text-[#00BAF2] font-medium">{statusMessage}</span>
              </div>

              {steps.length > 0 && (
                <div className="mt-2 space-y-1.5 pt-2 border-t border-[#1F3E6D]/40">
                  {steps.map((s) => (
                    <div
                      key={s.stepNumber}
                      className="flex items-center gap-2 p-1.5 rounded bg-[#112544]/50 border border-white/5"
                    >
                      <span className="font-mono text-[10px] text-gray-400">#{s.stepNumber}</span>
                      <span className="flex-1 truncate text-gray-300 text-[11px]">{s.desc}</span>
                      {s.status === 'running' && (
                        <span className="text-[10px] text-[#00BAF2] font-bold animate-pulse">Running</span>
                      )}
                      {s.status === 'done' && (
                        <span className="text-[10px] text-green-400 font-bold">✓</span>
                      )}
                      {s.status === 'pending' && (
                        <span className="text-[10px] text-gray-500">•</span>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Safety Handoff Notice */}
              {handoffNotice && (
                <div className="p-2.5 rounded-lg bg-green-500/10 border border-green-500/30 text-green-300 text-[11px] leading-relaxed mt-2">
                  <div className="font-bold flex items-center gap-1 text-green-400 mb-0.5">
                    <span>🛡️ Safe Hand-off Complete</span>
                  </div>
                  {handoffNotice}
                </div>
              )}
            </div>

            {/* Prompt Input Form */}
            <div className="p-3 bg-[#112544]/90 border-t border-[#1F3E6D]">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      executeTask(prompt)
                    }
                  }}
                  placeholder="e.g. Recharge 399 Airtel for 9876543210..."
                  disabled={loading}
                  className="flex-1 bg-black/60 border border-[#1F3E6D] focus:border-[#00BAF2] rounded-lg 
                    px-3 py-2 text-xs text-white placeholder-gray-500 outline-none transition-colors"
                />
                <button
                  onClick={() => executeTask(prompt)}
                  disabled={!prompt.trim() || loading}
                  className="px-3.5 py-2 bg-[#00BAF2] hover:bg-[#00BAF2]/90 disabled:opacity-40 
                    text-[#0A1B33] font-bold text-xs rounded-lg transition-all cursor-pointer flex items-center justify-center"
                >
                  {loading ? '...' : 'Go'}
                </button>
              </div>

              <div className="flex items-center justify-between mt-2 text-[10px] text-gray-500">
                <span>Enter to submit</span>
                <span>Stops safely before payment</span>
              </div>
            </div>

          </div>
        )}
      </div>
    </>
  )
}
