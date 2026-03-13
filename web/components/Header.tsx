'use client'

interface HeaderProps {
  connected: boolean
}

export default function Header({ connected }: HeaderProps) {
  return (
    <header className="border-b border-border bg-s1 sticky top-0 z-50 flex-shrink-0">
      <div className="max-w-[1400px] mx-auto px-6 py-[14px] flex items-center justify-between">

        {/* ── Logo ── */}
        <div className="flex items-center gap-3">
          <div className="relative w-9 h-9 rounded-[9px] bg-gradient-to-br from-cyan/14 to-cyan/4 border border-cyan/28 flex items-center justify-center">
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <path d="M9 1L16 5V13L9 17L2 13V5L9 1Z" stroke="#00e5ff" strokeWidth="1.3" fill="none"/>
              <path d="M9 5L13 7.5V12.5L9 15L5 12.5V7.5L9 5Z" fill="#00e5ff" fillOpacity="0.22"/>
              <circle cx="9" cy="9" r="2.2" fill="#00e5ff" fillOpacity="0.9"/>
            </svg>
            {connected && (
              <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-green pulse-dot-anim block" />
            )}
          </div>

          <div>
            <div className="font-display text-[22px] tracking-[0.08em] text-ntext leading-none">
              NEXUS
            </div>
            <div className="font-mono text-[9px] text-muted mt-0.5 tracking-[0.06em]">
              AI AUTOMATION AGENT · v2.0
            </div>
          </div>
        </div>

        {/* ── Center ── */}
        <div className="hidden md:flex items-center gap-4 font-mono text-[10px] text-muted tracking-[0.06em]">
          <span>LOCAL ORCHESTRATOR</span>
          <span className="text-dim">|</span>
          <span>GROQ · LLAMA-3.3-70B</span>
        </div>

        {/* ── Connection status ── */}
        <div className={`flex items-center gap-2 px-3 py-[5px] rounded-[7px] border font-mono text-[10px] tracking-[0.05em]
          ${connected
            ? 'bg-green/7 border-green/22 text-green'
            : 'bg-red/7  border-red/22  text-red'
          }`}>
          <div className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-green pulse-dot-anim' : 'bg-red'}`} />
          {connected ? 'CONNECTED' : 'OFFLINE'}
        </div>
      </div>
    </header>
  )
}