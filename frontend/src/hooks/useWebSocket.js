import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { useAgentContext } from '../context/AgentContext'
import { getApiBase } from '../lib/apiBase'

function mergeStates(items) {
  const base = {
    todos: [],
    cron_jobs: [],
    active_processes: [],
    recent_activity: [],
    job_search_today: null,
    system_stats: null,
    updated_at: new Date().toISOString(),
  }

  if (items.length === 0) return base

  const coverage = {}
  let rolesSubmitted = 0
  let rolesQueued = 0

  for (const { agent, data } of items) {
    const agentTag = { _agent_id: agent.id, _agent_name: agent.name }

    const todos = Array.isArray(data?.todos) ? data.todos : []
    const cronJobs = Array.isArray(data?.cron_jobs) ? data.cron_jobs : []
    const processes = Array.isArray(data?.active_processes) ? data.active_processes : []
    const activity = Array.isArray(data?.recent_activity) ? data.recent_activity : []

    base.todos.push(...todos.map((t) => ({ ...t, ...agentTag })))
    base.cron_jobs.push(...cronJobs.map((j) => ({ ...j, ...agentTag })))
    base.active_processes.push(...processes.map((p) => ({ ...p, ...agentTag })))
    base.recent_activity.push(...activity.map((a, idx) => ({ ...a, id: `${agent.id}-${a.id || idx}`, ...agentTag })))

    if (data?.job_search_today) {
      rolesSubmitted += Number(data.job_search_today.roles_submitted || 0)
      rolesQueued += Number(data.job_search_today.roles_queued || 0)
      const src = data.job_search_today.source_coverage || {}
      Object.entries(src).forEach(([k, v]) => {
        coverage[k] = (coverage[k] || 0) + Number(v || 0)
      })
    }

    if (!base.system_stats && data?.system_stats) {
      base.system_stats = data.system_stats
    }

    if (data?.updated_at && data.updated_at > base.updated_at) {
      base.updated_at = data.updated_at
    }
  }

  base.job_search_today = {
    date: new Date().toISOString().slice(0, 10),
    roles_submitted: rolesSubmitted,
    roles_queued: rolesQueued,
    source_coverage: coverage,
  }

  return base
}

export function useWebSocket(options = {}) {
  const { agents, selectedAgent } = useAgentContext()
  const { agentScope = 'selected' } = options

  const [connected, setConnected] = useState(false)
  const [state, setState] = useState(null)
  const [loading, setLoading] = useState(false)

  const ws = useRef(null)
  const pollTimer = useRef(null)
  const mcApiBase = getApiBase()

  const scopeAgents = useMemo(() => {
    if (agentScope === 'all') return agents
    if (agentScope === 'selected') return selectedAgent ? [selectedAgent] : []
    return agents.filter((a) => a.id === agentScope)
  }, [agentScope, agents, selectedAgent])

  const fetchAgentState = useCallback(async (agent) => {
    const gatewayBase = agent?.url
    if (!gatewayBase) throw new Error('Agent missing gateway URL')

    const isLocal = agent?.id === 'local'
    const localOverIngress = isLocal && String(gatewayBase || '').endsWith('/api')

    const url = (isLocal && !localOverIngress)
      ? `${gatewayBase}/state`
      : `${mcApiBase}/remote/state?target=${encodeURIComponent(gatewayBase)}`

    const res = await fetch(url, { cache: 'no-store' })
    if (!res.ok) {
      const errText = await res.text().catch(() => '')
      throw new Error(errText || `HTTP ${res.status}`)
    }
    return await res.json()
  }, [mcApiBase])

  const fetchState = useCallback(async ({ silent = false } = {}) => {
    if (scopeAgents.length === 0) {
      setConnected(false)
      setState(null)
      return
    }

    if (!silent) setLoading(true)

    const results = await Promise.allSettled(scopeAgents.map(async (agent) => ({
      agent,
      data: await fetchAgentState(agent),
    })))

    const ok = results.filter((r) => r.status === 'fulfilled').map((r) => r.value)
    const failed = results.filter((r) => r.status === 'rejected')

    if (ok.length > 0) {
      setState(mergeStates(ok))
      setConnected(true)
    } else {
      setConnected(false)
      if (!silent) setState(null)
    }

    if (failed.length > 0) {
      console.error('State fetch failed for one or more agents:', failed.map((f) => f.reason?.message || String(f.reason)))
    }

    if (!silent) setLoading(false)
  }, [scopeAgents, fetchAgentState])

  const send = useCallback((data) => {
    if (ws.current && ws.current.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify(data))
    }
  }, [])

  const refresh = useCallback(() => {
    fetchState({ silent: false })
  }, [fetchState])

  useEffect(() => {
    setLoading(true)
    setState(null)
    setConnected(false)

    if (ws.current) {
      ws.current.close()
      ws.current = null
    }
    if (pollTimer.current) {
      clearInterval(pollTimer.current)
      pollTimer.current = null
    }

    fetchState({ silent: false })
    pollTimer.current = setInterval(() => fetchState({ silent: true }), 15000)

    return () => {
      if (pollTimer.current) clearInterval(pollTimer.current)
      if (ws.current) ws.current.close()
    }
  }, [fetchState, agentScope])

  return {
    connected,
    loading,
    state,
    send,
    refresh,
    selectedAgent,
    scopeAgents,
  }
}
