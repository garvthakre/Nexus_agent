'use client'
import { useEffect, useState } from 'react'
import { useTypewriter } from '@/hooks/useTypewriter'
import { StepStatus, StepResult, Capability } from '@/types'

interface FileCardProps {
  capability: Capability
  filePath?: string
  content?: string
  description: string
  status: StepStatus
  result?: StepResult
  stepNumber: number
}

const EXT_COLORS: Record<string, string> = {
  py: '#3b82f6', js: '#f59e0b', ts: '#3b82f6', tsx: '#06b6d4',
  txt: '#9ca3af', md: '#a78bfa', json: '#10b981', html: '#f97316',
  css: '#06b6d4', sh: '#10b981', bat: '#6b7280', xlsx: '#10b981',
}

const EXT_ICONS: Record<string, string> = {
  py: '🐍', js: '📜', ts: '📘', tsx: '⚛️',
  txt: '📝', md: '📋', json: '{ }', html: '🌐',
  css: '🎨', sh: '⚙️', xlsx: '📊', default: '📄',
}

function getExt(path: string) {
  return path.split('.').pop()?.toLowerCase() ?? ''
}

function getFilename(path: string) {
  return path.split(/[/\\]/).pop() ?? path
}

function getContentPreview(content: string) {
  return content.split('\n').slice(0, 8)
}

export default function FileCard({ capability, filePath, content, description, status, result, stepNumber }: FileCardProps) {
  const path = filePath ?? result?.path ?? ''
  const filename = getFilename(path)
  const ext = getExt(filename)
  const extColor = EXT_COLORS[ext] ?? '#6b7280'
  const extIcon = EXT_ICONS[ext] ?? EXT_ICONS.default

  const [lineCount, setLineCount] = useState(0)
  const contentLines = content ? getContentPreview(content) : []

  // Animate lines appearing when creating file
  useEffect(() => {
    if (status !== 'running' || !contentLines.length) return
    setLineCount(0)
    let i = 0
    const t = setInterval(() => {
      if (i < contentLines.length) { i++; setLineCount(i) }
      else clearInterval(t)
    }, 120)
    return () => clearInterval(t)
  }, [status, contentLines.length])

  useEffect(() => {
    if (status === 'complete') setLineCount(contentLines.length)
  }, [status, contentLines.length])

  const { displayed: pathTyped } = useTypewriter(
    status !== 'pending' ? path : '', 20, 150
  )

  return (
    <div className={`
      rounded-xl overflow-hidden border transition-all duration-500
      ${status === 'running'  ? 'border-[#f59e0b]/30 shadow-[0_0_20px_rgba(245,158,11,0.05)]' :
        status === 'complete' ? 'border-[#10b981]/25' :
        status === 'error'    ? 'border-[#ef4444]/30' :
                                'border-[rgba(255,255,255,0.06)]'}
    `}>
      {/* File header */}
      <div className="flex items-center gap-3 px-4 py-3 bg-[#0a0a14] border-b border-[rgba(255,255,255,0.05)]">
        <span className="text-xl">{extIcon}</span>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm text-white truncate">{filename || 'untitled'}</span>
            {ext && (
              <span className="font-mono text-[10px] px-1.5 py-0.5 rounded border flex-shrink-0"
                style={{ color: extColor, borderColor: `${extColor}40`, backgroundColor: `${extColor}10` }}>
                .{ext}
              </span>
            )}
          </div>
          <div className="font-mono text-[11px] text-[#374151] truncate mt-0.5">{pathTyped}</div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {/* Status */}
          {status === 'running' && (
            <div className="flex items-center gap-1.5 text-[#f59e0b] font-mono text-[11px]">
              <span className="w-1.5 h-1.5 rounded-full bg-[#f59e0b] animate-pulse" />
              writing...
            </div>
          )}
          {status === 'complete' && (
            <div className="flex items-center gap-1.5 text-[#10b981] font-mono text-[11px]">
              <span>✓</span>
              {result?.message?.match(/\d+B/) ? result.message.match(/\d+B/)?.[0] : 'saved'}
            </div>
          )}
          <StepBadge status={status} number={stepNumber} />
        </div>
      </div>

      {/* File content preview */}
      {capability === 'create_file' && (
        <div className="bg-[#060610] p-4 font-mono text-[11px]">
          {status === 'pending' && (
            <div className="text-[#2d2d40] italic">waiting to create file...</div>
          )}

          {(status === 'running' || status === 'complete') && contentLines.length > 0 && (
            <div className="space-y-0.5">
              {contentLines.slice(0, lineCount).map((line, i) => (
                <div key={i} className="flex gap-3 leading-relaxed" style={{ animationDelay: `${i * 80}ms` }}>
                  <span className="text-[#2d2d40] w-5 text-right flex-shrink-0 select-none">{i + 1}</span>
                  <span style={{ color: getLineColor(line, ext) }}>{line || ' '}</span>
                </div>
              ))}
              {status === 'running' && lineCount < contentLines.length && (
                <div className="flex gap-3">
                  <span className="text-[#2d2d40] w-5 text-right flex-shrink-0">{lineCount + 1}</span>
                  <span className="inline-block w-2 h-3 bg-[#f59e0b] animate-pulse" />
                </div>
              )}
              {content && content.split('\n').length > 8 && status === 'complete' && (
                <div className="text-[#374151] pt-1">
                  ... {content.split('\n').length - 8} more lines
                </div>
              )}
            </div>
          )}

          {(status === 'running' || status === 'complete') && contentLines.length === 0 && (
            <div className="text-[#374151] italic">empty file</div>
          )}
        </div>
      )}

      {capability === 'create_folder' && (
        <div className="bg-[#060610] px-4 py-3">
          <div className="flex items-center gap-2 font-mono text-xs">
            <span className="text-2xl">📁</span>
            <div>
              <div className="text-white">{filename}</div>
              {status === 'complete' && <div className="text-[#10b981] text-[11px]">✓ directory created</div>}
              {status === 'running' && <div className="text-[#f59e0b] text-[11px] animate-pulse">creating...</div>}
            </div>
          </div>
        </div>
      )}

      {status === 'error' && (
        <div className="bg-[#060610] px-4 py-3 font-mono text-xs text-[#ef4444]">
          ✗ {result?.error ?? 'Failed'}
        </div>
      )}
    </div>
  )
}

function getLineColor(line: string, ext: string): string {
  if (['py', 'js', 'ts', 'tsx'].includes(ext)) {
    if (line.trim().startsWith('#') || line.trim().startsWith('//')) return '#4b5563'
    if (/^(import|from|const|let|var|def|class|return|if|for|while|async|await)/.test(line.trim())) return '#a78bfa'
    if (line.includes('"') || line.includes("'")) return '#10b981'
    return '#9ca3af'
  }
  return '#9ca3af'
}

function StepBadge({ status, number }: { status: StepStatus; number: number }) {
  return (
    <span className={`font-mono text-[10px] px-2 py-0.5 rounded border
      ${status === 'running'  ? 'text-[#f59e0b] border-[#f59e0b]/30 bg-[#f59e0b]/5' :
        status === 'complete' ? 'text-[#10b981] border-[#10b981]/30 bg-[#10b981]/5' :
        status === 'error'    ? 'text-[#ef4444] border-[#ef4444]/30 bg-[#ef4444]/5' :
                                'text-[#374151] border-[rgba(255,255,255,0.06)]'
      }`}>
      #{number}
    </span>
  )
}