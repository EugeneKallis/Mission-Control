import { useEffect, useRef, useState, useCallback } from 'react'
import { useAgentContext } from '../context/AgentContext'

function mapHermesJobsToState(jobs) {
  const list = Array.isArray(jobs) ? jobs : []
  return {
    todos: [],
    cron_jobs: list.map((j) => ({
      id: j.id,
      name: j.name || 'Unnamed',
      schedule: j.schedule_display || j.schedule?.display || j.schedule?.expr || '',
      deliver: j.deliver || 'origin',
      enabled: Boolean(j.enabled),
      last_run: j.last_run_at || null,
      next_run: j.next_run_at || null,
      last_status: j.last_status || 'unknown',
      state: j.state || 'unknown',
      prompt_preview: j.prompt || null,
      model: j.model || null,
      skills: Array.isArray(j.skills) ? j.skills : (j.skill ? [j.skill] : []),
      provider: j.provider || null,
      base_url: j.base_url || null,
      repeat: j.repeat?.display || null,
      paused_at: j.paused_at || null,
      paused_reason: j.paused_reason || null,
    })),
    active_processes: [],
    job_search_today: null,
    system_stats: null,
    recent_activity: [],
    updated_at: new Date().toISOString(),
  }
}

export function useWebSocket() {
  const { selectedAgent } = useAgentContext()
  const [connected, setConnected] = useState(false)
  const [state, setState] = useState(null)
  const ws = useRef(null)
  const pollTimer = useRef(null)

  const gatewayBase = selectedAgent?.url
  const isLocal = selectedAgent?.id === 'local'
  const mcApiBase = `http://${window.location.hostname}:5056`

  const fetchState = useCallback(async () => {
    if (!gatewayBase) return

    // Try backend aggregation first.
    if (!isLocal) {
      try {
        const res = await fetch(`${mcApiBase}/remote/state?target=${encodeURIComponent(gatewayBase)}`)
        if (res.ok) {
          const data = await res.json()
          setState(data)
          setConnected(true)
          return
        }
      } catch {
        // fallback below
      }

      // Fallback: direct browser fetch for Hermes gateways (works when browser can reach LAN IP but backend cannot).
      try {
        const healthRes = await fetch(`${gatewayBase}/health`)
        if (!healthRes.ok) throw new Error(`/health ${healthRes.status}`)
        const health = await healthRes.json().catch(() => ({}))
        const platform = String(health?.platform || '').toLowerCase()

        if (platform === 'hermes-agent') {
          const jobsRes = await fetch(`${gatewayBase}/api/jobs`)
          if (!jobsRes.ok) throw new Error(`/api/jobs ${jobsRes.status}`)
          const jobs = (await jobsRes.json())?.jobs || []
          setState(mapHermesJobsToState(jobs))
          setConnected(true)
          return
        }
      } catch (fallbackError) {
        console.error('State fetch fallback failed:', fallbackError)
      }

      setConnected(false)
      return
    }

    try {
      const res = await fetch(`${gatewayBase}/state`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
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

    if (isLocal) {
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
  }, [gatewayBase, isLocal, fetchState])

  useEffect(() => {
    if (!isLocal || !connected) return
    const interval = setInterval(() => {
      send({ type: 'ping' })
    }, 30000)
    return () => clearInterval(interval)
  }, [isLocal, connected, send])

  return { connected, state, send, refresh, gatewayBase, selectedAgent }
}
