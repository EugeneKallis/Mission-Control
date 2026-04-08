import React from 'react'

export function AgentScopePicker({ agents, value, onChange }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-slate-400">Agent</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-slate-900 border border-slate-700 text-slate-200 text-xs rounded px-2 py-1 min-w-[170px]"
      >
        <option value="all">All agents</option>
        {agents.map((agent) => (
          <option key={agent.id} value={agent.id}>{agent.name}</option>
        ))}
      </select>
    </div>
  )
}
