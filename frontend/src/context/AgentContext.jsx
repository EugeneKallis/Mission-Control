import React, { createContext, useContext, useMemo, useState, useEffect, useCallback } from 'react'
import { getApiBase } from '../lib/apiBase'

const AgentContext = createContext(null)

function normalizeUrl(url) {
  if (!url) return ''
  return url.trim().replace(/\/+$/, '')
}

function makeId(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || `agent-${Date.now()}`
}

export function AgentProvider({ children }) {
  const [customAgents, setCustomAgents] = useState([])
  const [selectedAgentId, setSelectedAgentIdState] = useState('')
  const [loading, setLoading] = useState(true)

  const loadSettings = useCallback(async () => {
    try {
      const apiBase = getApiBase()
      const res = await fetch(`${apiBase}/settings/agents`, { cache: 'no-store' })
      if (!res.ok) throw new Error(`settings ${res.status}`)

      const data = await res.json()
      const agents = Array.isArray(data?.agents)
        ? data.agents
            .filter((a) => a && a.id && a.name && a.url)
            .map((a) => ({ id: a.id, name: a.name, url: normalizeUrl(a.url) }))
        : []

      const selected = String(data?.selected_agent_id || '').trim()
      setCustomAgents(agents)
      if (selected && agents.some((a) => a.id === selected)) {
        setSelectedAgentIdState(selected)
      } else {
        setSelectedAgentIdState(agents[0]?.id || '')
      }
    } catch (error) {
      console.error('Failed to load agent settings from backend:', error)
      setCustomAgents([])
      setSelectedAgentIdState('')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadSettings()
  }, [loadSettings])

  const persistSettings = useCallback(async (agents, selectedId) => {
    const apiBase = getApiBase()
    const payload = {
      agents,
      selected_agent_id: selectedId || null,
    }
    const res = await fetch(`${apiBase}/settings/agents`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(text || `settings save failed (${res.status})`)
    }
    const data = await res.json()
    const normalizedAgents = Array.isArray(data?.agents)
      ? data.agents.map((a) => ({ id: a.id, name: a.name, url: normalizeUrl(a.url) }))
      : []
    setCustomAgents(normalizedAgents)
    setSelectedAgentIdState(data?.selected_agent_id || normalizedAgents[0]?.id || '')
  }, [])

  const agents = useMemo(() => {
    return customAgents
      .filter((agent) => agent?.name && agent?.url)
      .map((agent) => ({
        id: agent.id || makeId(agent.name),
        name: agent.name,
        url: normalizeUrl(agent.url),
      }))
  }, [customAgents])

  const selectedAgent = useMemo(() => {
    return agents.find((a) => a.id === selectedAgentId) || agents[0] || null
  }, [agents, selectedAgentId])

  async function upsertAgent(agent) {
    const id = agent.id ? agent.id : makeId(agent.name)
    const normalized = {
      id,
      name: agent.name?.trim() || id,
      url: normalizeUrl(agent.url),
    }

    const nextAgents = (() => {
      const idx = agents.findIndex((a) => a.id === id)
      if (idx >= 0) {
        const arr = [...agents]
        arr[idx] = normalized
        return arr
      }
      return [...agents, normalized]
    })()

    const nextSelected = selectedAgentId || id
    await persistSettings(nextAgents, nextSelected)
  }

  async function removeAgent(id) {
    if (!id) return
    const nextAgents = agents.filter((a) => a.id !== id)
    const nextSelected = selectedAgentId === id ? (nextAgents[0]?.id || '') : selectedAgentId
    await persistSettings(nextAgents, nextSelected)
  }

  async function setSelectedAgentId(id) {
    const nextSelected = id || ''
    await persistSettings(agents, nextSelected)
  }

  const value = {
    agents,
    customAgents: agents,
    selectedAgent,
    selectedAgentId,
    setSelectedAgentId,
    upsertAgent,
    removeAgent,
    refreshAgentSettings: loadSettings,
    loading,
  }

  return <AgentContext.Provider value={value}>{children}</AgentContext.Provider>
}

export function useAgentContext() {
  const ctx = useContext(AgentContext)
  if (!ctx) {
    throw new Error('useAgentContext must be used inside AgentProvider')
  }
  return ctx
}
