import type { Metadata } from 'next'
import './globals.css'
import FloatingAssistant from '@/components/FloatingAssistant'

export const metadata: Metadata = {
  title: 'NEXUS — AI Automation Agent',
  description: 'Intelligent local automation powered by AI',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="ambient-bg min-h-screen">
        <div className="scan-line" />
        <FloatingAssistant />
        {children}
      </body>
    </html>
  )
}
