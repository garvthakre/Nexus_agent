'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'

interface HeaderProps {
  connected: boolean
}

export default function Header({ connected }: HeaderProps) {
  const pathname = usePathname()
  const [profileOpen, setProfileOpen] = useState(false)
  const email = typeof window !== 'undefined' ? readTokenEmail() : ''
  const navigation = [
    { href: '/', label: 'Dashboard' },
    { href: '/history', label: 'History' },
    { href: '/webhooks', label: 'Webhooks' },
    { href: '/settings', label: 'Settings' },
  ]

  function logout() {
    localStorage.removeItem('nexus_token')
    window.location.href = '/'
  }

  return (
    <header className="border-b border-border bg-s1 sticky top-0 z-50 flex-shrink-0">
      <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">

        {/* Logo */}
        <div className="flex items-center gap-3">
          <div className="relative w-8 h-8 rounded-md bg-cyan flex items-center justify-center">
            <svg width="16" height="16" viewBox="0 0 18 18" fill="none">
              <path d="M9 1L16 5V13L9 17L2 13V5L9 1Z" stroke="#ffffff" strokeWidth="1.3" fill="none"/>
              <circle cx="9" cy="9" r="2" fill="#ffffff"/>
            </svg>
          </div>

          <div>
            <div className="font-display text-[18px] font-600 text-ntext leading-none">
              Nexus
            </div>
          </div>
        </div>

        <nav className="hidden md:flex items-center gap-1 mx-auto">
          {navigation.map((item) => (
            <Link key={item.href} href={item.href} className={`px-3 py-2 rounded-md text-sm transition-colors ${pathname === item.href ? 'text-cyan bg-cyan/10' : 'text-muted hover:text-ntext hover:bg-s2'}`}>
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          <div className={`hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium
          ${connected
            ? 'text-green bg-green/10 border border-green/30'
            : 'text-muted bg-s2 border border-border'
          }`}>
          <span className={`w-2 h-2 rounded-full ${connected ? 'bg-green' : 'bg-dim'}`} />
          {connected ? 'Connected' : 'Offline'}
          </div>
          <div className="relative">
            <button type="button" onClick={() => setProfileOpen(!profileOpen)} className="w-9 h-9 rounded-md border border-border bg-s2 text-cyan cursor-pointer" aria-label="Open profile menu">
              {email ? email.slice(0, 1).toUpperCase() : 'N'}
            </button>
            {profileOpen && (
              <div className="absolute right-0 top-11 z-50 w-56 bg-s2 border border-border2 rounded-md p-2 shadow-xl">
                <div className="px-3 py-2 border-b border-border mb-1">
                  <div className="text-xs text-muted">SIGNED IN AS</div>
                  <div className="text-sm text-ntext truncate">{email || 'Nexus user'}</div>
                </div>
                <Link href="/settings" onClick={() => setProfileOpen(false)} className="block px-3 py-2 text-sm text-muted hover:text-ntext hover:bg-s3 rounded">API keys</Link>
                <button type="button" onClick={logout} className="w-full text-left px-3 py-2 text-sm text-red hover:bg-s3 rounded cursor-pointer">Log out</button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  )
}

function readTokenEmail(): string {
  try {
    const token = localStorage.getItem('nexus_token')
    if (!token) return ''
    const payload = JSON.parse(atob(token.split('.')[1])) as { email?: string }
    return payload.email ?? ''
  } catch {
    return ''
  }
}
