import React from 'react'
import { useAgentContext } from '../context/AgentContext'

function ConnectionStatus({ connected }) {
  return (
    <div className="flex items-center gap-2">
      <div
        className={`w-2 h-2 rounded-full ${
          connected ? 'bg-emerald-500' : 'bg-rose-500'
        }`}
        style={connected ? { animation: 'pulse 2s ease-in-out infinite' } : {}}
      />
      <span className={`text-xs font-medium ${connected ? 'text-emerald-400' : 'text-rose-400'}`}>
        {connected ? 'LIVE' : 'OFFLINE'}
      </span>
    </div>
  )
}

function Clock({ now }) {
  if (!now) return null
  return (
    <span className="text-sm text-slate-400 font-mono">
      {now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
    </span>
  )
}

export function Header({ connected, lastUpdate, now }) {
  const { agents, selectedAgentId, setSelectedAgentId, selectedAgent } = useAgentContext()
  const [query, setQuery] = React.useState('')

  const filtered = React.useMemo(() => {
    if (!query.trim()) return agents
    const q = query.toLowerCase()
    return agents.filter((a) => a.name.toLowerCase().includes(q) || a.url.toLowerCase().includes(q))
  }, [agents, query])

  return (
    <header className="bg-slate-900/80 backdrop-blur border-b border-slate-800 sticky top-0 z-10">
      <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
        <div className="flex items-center gap-6 min-w-0">
          <div className="text-xl font-bold tracking-tight shrink-0">
            <span className="text-blue-400">⬡</span>{' '}
            <span>Mission Control</span>
          </div>

          <div className="hidden md:flex items-center gap-2 min-w-[340px]">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search agent..."
              className="w-36 bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200"
            />
            <select
              value={selectedAgentId || ''}
              onChange={(e) => setSelectedAgentId(e.target.value)}
              disabled={agents.length === 0}
              className="flex-1 bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200 disabled:opacity-60"
            >
              {agents.length === 0 ? (
                <option value="">No agents configured</option>
              ) : (
                filtered.map((agent) => (
                  <option key={agent.id} value={agent.id}>{agent.name}</option>
                ))
              )}
            </select>
          </div>
        </div>

        <div className="flex items-center gap-4 shrink-0">
          <div className="hidden lg:block text-right">
            <div className="text-[10px] uppercase text-slate-500 tracking-wide">Gateway</div>
            <div className="text-xs text-blue-300 font-mono max-w-72 truncate">{selectedAgent?.url}</div>
          </div>

          <Clock now={now} />
          {lastUpdate && (
            <span className="text-xs text-slate-600 hidden sm:block">
              Updated {new Date(lastUpdate).toLocaleTimeString()}
            </span>
          )}
          <ConnectionStatus connected={connected} />
        </div>
      </div>
    </header>
  )
}
