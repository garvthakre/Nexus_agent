'use client'
import { useState, useRef, KeyboardEvent } from 'react'

const EXAMPLES = [
  "Open Chrome and search for the latest AI news",
  "Create a folder called 'Projects' and make a Python hello world file",
  "Open Notepad and type a motivational quote",
  "Search YouTube for lofi hip hop music",
  "Create a React component file for a login form",
  "Open Spotify and search for jazz playlist",
]

interface PromptInputProps {
  onSubmit: (prompt: string) => void
  loading: boolean
}

export default function PromptInput({ onSubmit, loading }: PromptInputProps) {
  const [prompt, setPrompt]   = useState('')
  const [focused, setFocused] = useState(false)
  const ref = useRef<HTMLTextAreaElement>(null)

  const submit = () => { if (prompt.trim() && !loading) onSubmit(prompt.trim()) }
  const onKey  = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); submit() }
  }

  return (
    <div className="flex flex-col gap-4">

      {/* Input */}
      <div className="relative">
        <span className="absolute top-[14px] left-[14px] font-mono text-sm text-cyan/50 select-none pointer-events-none">
          &gt;_
        </span>
        <textarea
          ref={ref}
          value={prompt}
          onChange={e => setPrompt(e.target.value)}
          onKeyDown={onKey}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder="Describe what you want to automate..."
          disabled={loading}
          rows={3}
          className={`w-full bg-s3 rounded-[9px] pl-11 pr-4 pt-[14px] pb-[14px]
            text-ntext font-sans text-[13px] leading-[1.55] resize-none outline-none
            transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed
            placeholder:text-dim
            ${focused
              ? 'border border-cyan/35 shadow-[0_0_0_1px_rgba(0,229,255,0.1),0_0_20px_rgba(0,229,255,0.05)]'
              : 'border border-border2'
            }`}
        />
        <span className="absolute bottom-[10px] right-3 font-mono text-[9px] text-dim">
          {prompt.length} chars
        </span>
      </div>

      {/* Submit */}
      <div className="flex items-center gap-3">
        <button
          onClick={submit}
          disabled={!prompt.trim() || loading}
          className={`flex items-center gap-2 px-5 py-[9px] rounded-[8px] font-mono text-[11px]
            font-semibold tracking-[0.06em] transition-all duration-200
            disabled:cursor-not-allowed disabled:opacity-40
            ${prompt.trim() && !loading
              ? 'bg-cyan/10 border border-cyan/30 text-cyan shadow-[0_0_15px_rgba(0,229,255,0.08)]'
              : 'bg-s3 border border-border text-muted'
            }`}
        >
          {loading ? (
            <>
              <svg className="spin-fast" width="11" height="11" viewBox="0 0 11 11" fill="none">
                <circle cx="5.5" cy="5.5" r="4.5" stroke="#00e5ff" strokeWidth="1.4"
                  strokeDasharray="9 18" strokeLinecap="round"/>
              </svg>
              GENERATING PLAN...
            </>
          ) : (
            <>
              <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                <path d="M1 5.5H10M10 5.5L6.5 2M10 5.5L6.5 9"
                  stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              GENERATE PLAN
            </>
          )}
        </button>
        <span className="font-mono text-[9.5px] text-dim tracking-[0.04em] hidden md:block">
          ⌘+Enter to submit
        </span>
      </div>

      {/* Examples */}
      <div className="flex flex-col gap-2">
        <div className="font-mono text-[9.5px] text-muted tracking-[0.06em] uppercase">
          Try an example:
        </div>
        <div className="flex flex-wrap gap-[6px]">
          {EXAMPLES.map((ex, i) => (
            <button
              key={i}
              onClick={() => { setPrompt(ex); ref.current?.focus() }}
              disabled={loading}
              className="font-mono text-[10px] px-[10px] py-1 bg-s3 border border-border
                rounded-[6px] text-muted transition-all duration-150
                hover:text-cyan hover:border-cyan/28 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {ex.length > 45 ? ex.slice(0, 42) + '...' : ex}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}