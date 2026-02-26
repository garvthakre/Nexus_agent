'use client'
import { useEffect, useRef, useState, useCallback } from 'react'
import { WsMessage } from '@/types'

type Listener = (data: WsMessage) => void

export function useWebSocket(url: string) {
  const wsRef = useRef<WebSocket | null>(null)
  const [connected, setConnected] = useState(false)
  const [lastMessage, setLastMessage] = useState<WsMessage | null>(null)
  const listenersRef = useRef<Listener[]>([])
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const connect = useCallback(() => {
    try {
      const ws = new WebSocket(url)
      wsRef.current = ws

      ws.onopen = () => {
        setConnected(true)
        console.log('[WS] Connected')
      }

      ws.onmessage = (event: MessageEvent<string>) => {
        try {
          const data = JSON.parse(event.data) as WsMessage
          setLastMessage(data)
          listenersRef.current.forEach((fn) => fn(data))
        } catch (e) {
          console.error('[WS] Parse error', e)
        }
      }

      ws.onclose = () => {
        setConnected(false)
        console.log('[WS] Disconnected, reconnecting in 3s...')
        reconnectTimer.current = setTimeout(connect, 3000)
      }

      ws.onerror = () => {
        console.error('[WS] Error — closing socket')
        ws.close()
      }
    } catch (e) {
      console.error('[WS] Connection failed', e)
      reconnectTimer.current = setTimeout(connect, 3000)
    }
  }, [url])

  useEffect(() => {
    connect()
    return () => {
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current)
      wsRef.current?.close()
    }
  }, [connect])

  /** Register a listener; returns an unsubscribe function */
  const subscribe = useCallback((fn: Listener): (() => void) => {
    listenersRef.current.push(fn)
    return () => {
      listenersRef.current = listenersRef.current.filter((l) => l !== fn)
    }
  }, [])

  const send = useCallback((data: unknown) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data))
    }
  }, [])

  return { connected, lastMessage, subscribe, send }
}
