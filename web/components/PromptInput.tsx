'use client'
import { useState, useRef, KeyboardEvent } from 'react'

const EXAMPLE_PROMPTS = [
  "Open Chrome and search for the latest AI news",
  "Create a folder called 'Projects' and make a Python hello world file inside it",
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
  const [prompt, setPrompt] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const handleSubmit = () => {
    if (prompt.trim() && !loading) {
      onSubmit(prompt.trim())
    }
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      handleSubmit()
    }
  }

  const useExample = (example: string) => {
    setPrompt(example)
    textareaRef.current?.focus()
  }

  return (
    <div className="space-y-4">
      {/* Main input */}
      <div className="relative">
        <div className="absolute top-4 left-4 text-accent/60 font-mono text-sm select-none">
          &gt;_
        </div>
        <textarea
          ref={textareaRef}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Describe what you want to automate..."
          disabled={loading}
          rows={3}
          className="
            w-full bg-surface2 border border-border rounded-lg
            pl-12 pr-4 pt-4 pb-4
            text-white font-mono text-sm
            placeholder:text-dim
            focus:outline-none focus:border-accent/50 focus:bg-surface3
            disabled:opacity-50 disabled:cursor-not-allowed
            resize-none transition-all duration-200
            hover:border-border/80
          "
        />
        <div className="absolute bottom-3 right-4 text-dim text-xs font-mono">
          {prompt.length} chars
        </div>
      </div>

      {/* Submit */}
      <div className="flex items-center gap-3">
        <button
          onClick={handleSubmit}
          disabled={!prompt.trim() || loading}
          className="
            flex items-center gap-2 px-6 py-2.5
            bg-accent/10 border border-accent/30 rounded-lg
            text-accent font-mono text-sm font-medium
            hover:bg-accent/20 hover:border-accent/50
            disabled:opacity-40 disabled:cursor-not-allowed
            transition-all duration-200
            focus:outline-none focus:ring-1 focus:ring-accent/50
          "
          style={!prompt.trim() || loading ? {} : { boxShadow: '0 0 15px rgba(0,212,255,0.1)' }}
        >
          {loading ? (
            <>
              <LoadingSpinner />
              Generating Plan...
            </>
          ) : (
            <>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path
                  d="M1 7H13M13 7L8 2M13 7L8 12"
                  stroke="#00d4ff"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              Generate Plan
            </>
          )}
        </button>
        <span className="text-dim text-xs font-mono hidden md:block">⌘+Enter to submit</span>
      </div>

      {/* Examples */}
      <div className="space-y-2">
        <p className="text-dim text-xs font-mono">TRY AN EXAMPLE:</p>
        <div className="flex flex-wrap gap-2">
          {EXAMPLE_PROMPTS.map((ex, i) => (
            <button
              key={i}
              onClick={() => useExample(ex)}
              disabled={loading}
              className="
                text-xs font-mono px-3 py-1.5
                bg-surface2 border border-border rounded
                text-muted hover:text-accent hover:border-accent/30
                disabled:opacity-40
                transition-all duration-150
              "
            >
              {ex.length > 45 ? ex.substring(0, 42) + '...' : ex}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

function LoadingSpinner() {
  return (
    <svg className="animate-spin" width="12" height="12" viewBox="0 0 12 12" fill="none">
      <circle
        cx="6" cy="6" r="5"
        stroke="#00d4ff" strokeWidth="1.5"
        strokeLinecap="round" strokeDasharray="20" strokeDashoffset="10"
      />
    </svg>
  )
}
