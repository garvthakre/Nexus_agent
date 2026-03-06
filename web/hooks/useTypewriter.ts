'use client'
import { useState, useEffect, useRef } from 'react'

export function useTypewriter(text: string, speed = 28, startDelay = 0) {
  const [displayed, setDisplayed] = useState('')
  const [done, setDone] = useState(false)
  const indexRef = useRef(0)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    setDisplayed('')
    setDone(false)
    indexRef.current = 0

    const start = setTimeout(() => {
      const tick = () => {
        if (indexRef.current < text.length) {
          const next = indexRef.current + 1
          setDisplayed(text.slice(0, next))
          indexRef.current = next
          timerRef.current = setTimeout(tick, speed)
        } else {
          setDone(true)
        }
      }
      tick()
    }, startDelay)

    return () => {
      clearTimeout(start)
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [text, speed, startDelay])

  return { displayed, done }
}

export function useStreamLines(lines: string[], intervalMs = 120, startDelay = 0) {
  const [visibleLines, setVisibleLines] = useState<string[]>([])
  const [done, setDone] = useState(false)

  useEffect(() => {
    setVisibleLines([])
    setDone(false)
    if (!lines.length) { setDone(true); return }

    let i = 0
    const start = setTimeout(() => {
      const interval = setInterval(() => {
        if (i < lines.length) {
          setVisibleLines(prev => [...prev, lines[i]])
          i++
        } else {
          clearInterval(interval)
          setDone(true)
        }
      }, intervalMs)
      return () => clearInterval(interval)
    }, startDelay)

    return () => clearTimeout(start)
  }, [lines.join('|'), intervalMs, startDelay])

  return { visibleLines, done }
}