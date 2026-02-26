'use client'

interface HeaderProps {
  connected: boolean
}

export default function Header({ connected }: HeaderProps) {
  return (
    <header className="border-b border-border bg-surface/80 backdrop-blur-sm sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
        {/* Logo */}
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="w-8 h-8 rounded border border-accent/40 flex items-center justify-center bg-accent/5">
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                <path d="M9 1L16 5V13L9 17L2 13V5L9 1Z" stroke="#00d4ff" strokeWidth="1.5" fill="none" />
                <path d="M9 5L13 7.5V12.5L9 15L5 12.5V7.5L9 5Z" fill="#00d4ff" opacity="0.3" />
                <circle cx="9" cy="9" r="2" fill="#00d4ff" />
              </svg>
            </div>
            {connected && (
              <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-accent3 rounded-full animate-pulse-slow" />
            )}
          </div>
          <div>
            <span className="font-display font-800 text-lg text-white tracking-widest">NEXUS</span>
            <span className="text-muted text-xs font-mono ml-2">v1.0</span>
          </div>
        </div>

        {/* Center */}
        <div className="hidden md:flex items-center gap-6 text-xs font-mono text-muted">
          <span>AI AUTOMATION AGENT</span>
          <span className="text-dim">|</span>
          <span>LOCAL ORCHESTRATOR</span>
        </div>

        {/* Right: Connection status */}
        <div className="flex items-center gap-2 text-xs font-mono">
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              connected ? 'bg-accent3 animate-pulse-slow' : 'bg-danger'
            }`}
          />
          <span className={connected ? 'text-accent3' : 'text-danger'}>
            {connected ? 'CONNECTED' : 'OFFLINE'}
          </span>
        </div>
      </div>
    </header>
  )
}
