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

export function AgentProvider({ children }) {
  const [customAgents, setCustomAgents] = useState([])
  const [selectedAgentId, setSelectedAgentId] = useState('')

  useEffect(() => {
    try {
      const rawAgents = localStorage.getItem(STORAGE_AGENTS)
      const rawSelected = localStorage.getItem(STORAGE_SELECTED)

      if (rawAgents) {
        const parsed = JSON.parse(rawAgents)
        if (Array.isArray(parsed)) {
          const normalized = parsed
            .filter((a) => a && a.name && a.url)
            .map((a) => ({
              id: a.id || makeId(a.name),
              name: a.name,
              url: normalizeUrl(a.url),
            }))
            .filter((a) => a.id !== 'local')

          setCustomAgents(normalized)

          if (rawSelected && normalized.some((a) => a.id === rawSelected)) {
            setSelectedAgentId(rawSelected)
          } else {
            setSelectedAgentId(normalized[0]?.id || '')
          }
          return
        }
      }

      setSelectedAgentId('')
    } catch (error) {
      console.error('Failed to load agent settings:', error)
    }
  }, [])

  useEffect(() => {
    localStorage.setItem(STORAGE_AGENTS, JSON.stringify(customAgents))
  }, [customAgents])

  useEffect(() => {
    if (selectedAgentId) {
      localStorage.setItem(STORAGE_SELECTED, selectedAgentId)
    } else {
      localStorage.removeItem(STORAGE_SELECTED)
    }
  }, [selectedAgentId])

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

  useEffect(() => {
    if (!selectedAgent && agents.length > 0) {
      setSelectedAgentId(agents[0].id)
    }
  }, [agents, selectedAgent])

  function upsertAgent(agent) {
    const id = agent.id ? agent.id : makeId(agent.name)
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

    if (!selectedAgentId) {
      setSelectedAgentId(id)
    }
  }

  function removeAgent(id) {
    if (!id) return
    setCustomAgents((prev) => {
      const next = prev.filter((a) => a.id !== id)
      if (selectedAgentId === id) {
        setSelectedAgentId(next[0]?.id || '')
      }
      return next
    })
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
