import { useEffect, useRef, useState, useCallback } from 'react'

const WS_URL = (() => {
  const host = window.location.hostname
  const port = host === 'localhost' ? '5056' : '5056'
  return `ws://${host}:${port}/ws`
})()

export function useWebSocket() {
  const [connected, setConnected] = useState(false)
  const [state, setState] = useState(null)
  const ws = useRef(null)

  const send = useCallback((data) => {
    if (ws.current && ws.current.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify(data))
    }
  }, [])

  const refresh = useCallback(() => {
    send({ type: 'refresh' })
  }, [send])

  useEffect(() => {
    const connect = () => {
      ws.current = new WebSocket(WS_URL)

      ws.current.onopen = () => {
        setConnected(true)
        console.log('Mission Control: Connected')
      }

      ws.current.onmessage = (event) => {
        const message = JSON.parse(event.data)
        console.log("WS msg:", message.type, message.data)
        if (message.type === 'state_full' || message.type === 'state_update' || message.type === 'hermes_sync') {
          setState(message.data)
        }
      }

      ws.current.onclose = () => {
        setConnected(false)
        console.log('Mission Control: Disconnected, retrying in 3s...')
        setTimeout(connect, 3000)
      }

      ws.current.onerror = (err) => {
        console.error('WebSocket error:', err)
        ws.current.close()
      }
    }

    connect()

    return () => {
      if (ws.current) {
        ws.current.close()
      }
    }
  }, [])

  // Keepalive ping
  useEffect(() => {
    if (!connected) return
    const interval = setInterval(() => {
      send({ type: 'ping' })
    }, 30000)
    return () => clearInterval(interval)
  }, [connected, send])

  return { connected, state, send, refresh }
}
