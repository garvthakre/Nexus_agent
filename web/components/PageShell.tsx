'use client'

import { useState } from 'react'
import Header from '@/components/Header'
import AuthForm from '@/components/AuthForm'

export default function PageShell({ children, title, eyebrow }: { children: React.ReactNode; title: string; eyebrow: string }) {
  const [authenticated] = useState<boolean>(() => typeof window !== 'undefined' && Boolean(localStorage.getItem('nexus_token')))

  if (!authenticated) return <AuthForm />

  return (
    <div className="min-h-screen bg-bg">
      <Header connected={false} />
      <main className="max-w-[1400px] mx-auto px-6 py-8">
        <div className="mb-7">
          <div className="font-mono text-[11px] tracking-[0.18em] text-cyan uppercase mb-2">{eyebrow}</div>
          <h1 className="font-display text-4xl text-ntext tracking-wide">{title}</h1>
        </div>
        {children}
      </main>
    </div>
  )
}