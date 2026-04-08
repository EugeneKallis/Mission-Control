import React, { createContext, useContext, useMemo, useState, useEffect } from 'react'

const AgentContext = createContext(null)

const STORAGE_AGENTS = 'mission_control_agents_v1'
const STORAGE_SELECTED = 'mission_control_selected_agent_v1'

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

function getLocalAgent() {
  const host = window.location.hostname
  const isLocalDev = window.location.port === '5173' || host === 'localhost' || host === '127.0.0.1'

  return {
    id: 'local',
    name: 'local',
    url: isLocalDev ? `http://${host}:5056` : `${window.location.origin}/api`,
    readonly: true,
  }
}

export function AgentProvider({ children }) {
  const [customAgents, setCustomAgents] = useState([])
  const [selectedAgentId, setSelectedAgentId] = useState('local')

  useEffect(() => {
    try {
      const rawAgents = localStorage.getItem(STORAGE_AGENTS)
      const rawSelected = localStorage.getItem(STORAGE_SELECTED)

      if (rawAgents) {
        const parsed = JSON.parse(rawAgents)
        if (Array.isArray(parsed)) {
          setCustomAgents(
            parsed
              .filter((a) => a && a.name && a.url)
              .map((a) => ({
                id: a.id || makeId(a.name),
                name: a.name,
                url: normalizeUrl(a.url),
              })),
          )
        }
      }

      if (rawSelected) {
        setSelectedAgentId(rawSelected)
      }
    } catch (error) {
      console.error('Failed to load agent settings:', error)
    }
  }, [])

  useEffect(() => {
    localStorage.setItem(STORAGE_AGENTS, JSON.stringify(customAgents))
  }, [customAgents])

  useEffect(() => {
    localStorage.setItem(STORAGE_SELECTED, selectedAgentId)
  }, [selectedAgentId])

  const agents = useMemo(() => {
    const local = getLocalAgent()
    const deduped = [local]

    for (const agent of customAgents) {
      if (!agent?.name || !agent?.url) continue
      if (agent.id === 'local') continue
      deduped.push({
        id: agent.id || makeId(agent.name),
        name: agent.name,
        url: normalizeUrl(agent.url),
      })
    }

    return deduped
  }, [customAgents])

  const selectedAgent = useMemo(() => {
    return agents.find((a) => a.id === selectedAgentId) || agents[0] || getLocalAgent()
  }, [agents, selectedAgentId])

  function upsertAgent(agent) {
    const id = agent.id && agent.id !== 'local' ? agent.id : makeId(agent.name)
    const normalized = {
      id,
      name: agent.name?.trim() || id,
      url: normalizeUrl(agent.url),
    }

    setCustomAgents((prev) => {
      const idx = prev.findIndex((a) => a.id === id)
      if (idx >= 0) {
        const next = [...prev]
        next[idx] = normalized
        return next
      }
      return [...prev, normalized]
    })
  }

  function removeAgent(id) {
    if (!id || id === 'local') return
    setCustomAgents((prev) => prev.filter((a) => a.id !== id))
    if (selectedAgentId === id) {
      setSelectedAgentId('local')
    }
  }

  const value = {
    agents,
    customAgents,
    selectedAgent,
    selectedAgentId,
    setSelectedAgentId,
    upsertAgent,
    removeAgent,
    setCustomAgents,
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
