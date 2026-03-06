'use client'
import { useState, useRef, useEffect, KeyboardEvent } from 'react'

const SUGGESTIONS = [
  "Open Chrome and search for the latest AI news",
  "Create a Python hello world file on the desktop",
  "Search YouTube for lofi hip hop and play first video",
  "Set wallpaper to a cyberpunk city at night",
  "Open WhatsApp and send a message to John",
  "Search Amazon for wireless headphones under 2000 rupees",
  "Create a web scraper and open it in VSCode",
]

interface SearchBarProps {
  onSubmit: (prompt: string) => void
  loading: boolean
  morphed: boolean   // true once submitted — bar moves to top
}

export default function SearchBar({ onSubmit, loading, morphed }: SearchBarProps) {
  const [value, setValue] = useState('')
  const [focused, setFocused] = useState(false)
  const [suggIdx, setSuggIdx] = useState(-1)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!morphed) {
      setTimeout(() => inputRef.current?.focus(), 400)
    }
  }, [morphed])

  const submit = (v = value) => {
    if (v.trim() && !loading) onSubmit(v.trim())
  }

  const handleKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') { submit(); return }
    if (e.key === 'ArrowDown') { setSuggIdx(i => Math.min(i + 1, SUGGESTIONS.length - 1)); e.preventDefault() }
    if (e.key === 'ArrowUp')   { setSuggIdx(i => Math.max(i - 1, -1)); e.preventDefault() }
    if (e.key === 'Tab' && suggIdx >= 0) { setValue(SUGGESTIONS[suggIdx]); setSuggIdx(-1); e.preventDefault() }
    if (e.key === 'Escape') { setFocused(false); setSuggIdx(-1) }
  }

  const showSugg = focused && !morphed && value.length === 0

  if (morphed) {
    // Compact top bar mode
    return (
      <div className="w-full flex items-center gap-3 px-4 py-2.5 bg-[#0d0d18] border-b border-[rgba(0,212,255,0.15)]">
        <div className="flex items-center gap-2 text-[#00d4ff]/60">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.3"/>
            <path d="M9.5 9.5L12.5 12.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
          </svg>
        </div>
        <span className="font-mono text-xs text-[#6b7280] truncate flex-1 max-w-lg">
          {value || 'running task...'}
        </span>
        {loading && (
          <div className="flex gap-1">
            {[0,1,2].map(i => (
              <span key={i} className="w-1 h-1 rounded-full bg-[#00d4ff] animate-bounce"
                style={{ animationDelay: `${i * 150}ms` }} />
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen px-4 pb-24">
      {/* Logo / title */}
      <div className="mb-10 text-center">
        <div className="flex items-center justify-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-xl border border-[#00d4ff]/30 bg-[#00d4ff]/5 flex items-center justify-center">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path d="M10 2L18 6.5V13.5L10 18L2 13.5V6.5L10 2Z" stroke="#00d4ff" strokeWidth="1.5" fill="none"/>
              <circle cx="10" cy="10" r="2.5" fill="#00d4ff" opacity="0.8"/>
            </svg>
          </div>
          <span className="text-white font-mono text-2xl tracking-[0.3em] font-bold">NEXUS</span>
        </div>
        <p className="text-[#4b5563] font-mono text-sm tracking-wider">AI AUTOMATION AGENT</p>
      </div>

      {/* Search bar */}
      <div className="w-full max-w-2xl relative">
        <div className={`
          relative flex items-center gap-3
          bg-[#0f0f1a] border rounded-2xl px-5 py-4
          transition-all duration-300
          ${focused
            ? 'border-[#00d4ff]/40 shadow-[0_0_30px_rgba(0,212,255,0.08)]'
            : 'border-[rgba(255,255,255,0.08)] hover:border-[rgba(255,255,255,0.15)]'
          }
        `}>
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" className="text-[#4b5563] flex-shrink-0">
            <circle cx="7.5" cy="7.5" r="5.5" stroke="currentColor" strokeWidth="1.5"/>
            <path d="M12.5 12.5L16 16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>

          <input
            ref={inputRef}
            value={value}
            onChange={e => { setValue(e.target.value); setSuggIdx(-1) }}
            onKeyDown={handleKey}
            onFocus={() => setFocused(true)}
            onBlur={() => setTimeout(() => setFocused(false), 150)}
            placeholder="What should I automate for you?"
            disabled={loading}
            className="flex-1 bg-transparent text-white font-mono text-sm placeholder:text-[#374151] outline-none disabled:opacity-50"
            autoComplete="off"
            spellCheck={false}
          />

          {value && (
            <button
              onClick={() => { setValue(''); inputRef.current?.focus() }}
              className="text-[#4b5563] hover:text-white transition-colors text-lg leading-none"
            >×</button>
          )}

          <button
            onClick={() => submit()}
            disabled={!value.trim() || loading}
            className={`
              flex items-center gap-2 px-4 py-2 rounded-xl font-mono text-xs font-medium
              transition-all duration-200 flex-shrink-0
              ${value.trim() && !loading
                ? 'bg-[#00d4ff]/10 border border-[#00d4ff]/30 text-[#00d4ff] hover:bg-[#00d4ff]/20'
                : 'bg-[#1a1a2e] border border-transparent text-[#374151] cursor-not-allowed'
              }
            `}
          >
            {loading ? (
              <span className="flex gap-0.5">
                {[0,1,2].map(i => (
                  <span key={i} className="w-1 h-1 rounded-full bg-[#00d4ff] animate-bounce"
                    style={{ animationDelay: `${i*150}ms` }}/>
                ))}
              </span>
            ) : (
              <>
                <span>RUN</span>
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                  <path d="M2 5H8M8 5L5.5 2.5M8 5L5.5 7.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                </svg>
              </>
            )}
          </button>
        </div>

        {/* Suggestions dropdown */}
        {showSugg && (
          <div className="absolute top-full left-0 right-0 mt-2 bg-[#0d0d1a] border border-[rgba(255,255,255,0.08)] rounded-xl overflow-hidden z-50 shadow-2xl">
            <div className="px-4 py-2 border-b border-[rgba(255,255,255,0.05)]">
              <span className="text-[#374151] font-mono text-xs">SUGGESTIONS</span>
            </div>
            {SUGGESTIONS.map((s, i) => (
              <button
                key={i}
                onMouseDown={() => { setValue(s); submit(s) }}
                onMouseEnter={() => setSuggIdx(i)}
                className={`
                  w-full text-left px-4 py-3 font-mono text-xs transition-colors
                  flex items-center gap-3
                  ${suggIdx === i ? 'bg-[#00d4ff]/5 text-white' : 'text-[#6b7280] hover:text-white hover:bg-[#ffffff05]'}
                `}
              >
                <span className="text-[#00d4ff]/40">›</span>
                {s}
              </button>
            ))}
          </div>
        )}

        {/* Hint */}
        <p className="text-center text-[#2d2d40] font-mono text-xs mt-4">
          Press Enter to generate plan · Arrow keys to navigate suggestions
        </p>
      </div>
    </div>
  )
}