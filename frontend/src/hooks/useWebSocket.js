import { useEffect, useRef, useState, useCallback } from 'react'
import { useAgentContext } from '../context/AgentContext'
import { getApiBase } from '../lib/apiBase'

export function useWebSocket() {
  const { selectedAgent } = useAgentContext()
  const [connected, setConnected] = useState(false)
  const [state, setState] = useState(null)
  const ws = useRef(null)
  const pollTimer = useRef(null)

  const gatewayBase = selectedAgent?.url
  const isLocal = selectedAgent?.id === 'local'
  const mcApiBase = getApiBase()
  const localOverIngress = isLocal && String(gatewayBase || '').endsWith('/api')

  const fetchState = useCallback(async () => {
    if (!gatewayBase) {
      setConnected(false)
      setState(null)
      return
    }

    try {
      const url = isLocal
        ? `${gatewayBase}/state`
        : `${mcApiBase}/remote/state?target=${encodeURIComponent(gatewayBase)}`

      const res = await fetch(url)
      if (!res.ok) {
        const errText = await res.text().catch(() => '')
        throw new Error(errText || `HTTP ${res.status}`)
      }

      const data = await res.json()
      setState(data)
      setConnected(true)
    } catch (error) {
      console.error('State fetch failed:', error)
      setConnected(false)
    }
  }, [gatewayBase, isLocal, mcApiBase])

  const send = useCallback((data) => {
    if (isLocal && ws.current && ws.current.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify(data))
    }
  }, [isLocal])

  const refresh = useCallback(() => {
    if (isLocal) {
      send({ type: 'refresh' })
      return
    }
    fetchState()
  }, [isLocal, send, fetchState])

  useEffect(() => {
    if (!gatewayBase) return

    let cancelled = false

    if (ws.current) {
      ws.current.close()
      ws.current = null
    }

    if (pollTimer.current) {
      clearInterval(pollTimer.current)
      pollTimer.current = null
    }

    if (isLocal && !localOverIngress) {
      const wsUrl = gatewayBase.replace(/^http/, 'ws') + '/ws'

      const connect = () => {
        if (cancelled) return
        ws.current = new WebSocket(wsUrl)

        ws.current.onopen = () => {
          if (cancelled) return
          setConnected(true)
          console.log('Mission Control: Connected to local websocket')
        }

        ws.current.onmessage = (event) => {
          if (cancelled) return
          const message = JSON.parse(event.data)
          if (message.type === 'state_full' || message.type === 'state_update' || message.type === 'hermes_sync') {
            setState(message.data)
          }
        }

        ws.current.onclose = () => {
          if (cancelled) return
          setConnected(false)
          setTimeout(connect, 3000)
        }

        ws.current.onerror = () => {
          if (cancelled) return
          setConnected(false)
          ws.current?.close()
        }
      }

      connect()

      return () => {
        cancelled = true
        if (ws.current) ws.current.close()
      }
    }

    fetchState()
    pollTimer.current = setInterval(fetchState, 15000)

    return () => {
      cancelled = true
      if (pollTimer.current) clearInterval(pollTimer.current)
    }
  }, [gatewayBase, isLocal, localOverIngress, fetchState])

  useEffect(() => {
    if (!isLocal || !connected) return
    const interval = setInterval(() => {
      send({ type: 'ping' })
    }, 30000)
    return () => clearInterval(interval)
  }, [isLocal, connected, send])

  return { connected, state, send, refresh, gatewayBase, selectedAgent }
}
