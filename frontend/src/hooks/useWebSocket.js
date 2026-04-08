import { useEffect, useRef, useState, useCallback } from 'react'
import { useAgentContext } from '../context/AgentContext'

export function useWebSocket() {
  const { selectedAgent } = useAgentContext()
  const [connected, setConnected] = useState(false)
  const [state, setState] = useState(null)
  const ws = useRef(null)
  const pollTimer = useRef(null)

  const gatewayBase = selectedAgent?.url
  const isLocal = selectedAgent?.id === 'local'

  const fetchState = useCallback(async () => {
    if (!gatewayBase) return
    try {
      // Probe health first so Hermes API servers don't get spammed with /state calls.
      const healthRes = await fetch(`${gatewayBase}/health`)
      if (!healthRes.ok) throw new Error(`/health=${healthRes.status}`)

      let healthJson = null
      try {
        healthJson = await healthRes.json()
      } catch {
        healthJson = null
      }

      const platform = String(healthJson?.platform || '').toLowerCase()
      if (platform === 'hermes-agent') {
        try {
          const jobsRes = await fetch(`${gatewayBase}/api/jobs`)
          if (jobsRes.ok) {
            const jobsJson = await jobsRes.json()
            const jobs = Array.isArray(jobsJson?.jobs) ? jobsJson.jobs : []
            const mappedCrons = jobs.map((j) => ({
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
            }))

            setState((prev) => ({
              ...(prev || {}),
              todos: [],
              cron_jobs: mappedCrons,
              active_processes: [],
              job_search_today: null,
              system_stats: null,
              recent_activity: [],
              updated_at: new Date().toISOString(),
            }))
          }
        } catch (err) {
          console.warn('Hermes /api/jobs fetch failed:', err)
        }

        setConnected(true)
        return
      }

      const res = await fetch(`${gatewayBase}/state`)
      if (!res.ok) throw new Error(`/state=${res.status}`)
      const data = await res.json()
      setState(data)
      setConnected(true)
    } catch (error) {
      console.error('State fetch failed:', error)
      setConnected(false)
    }
  }, [gatewayBase])

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
