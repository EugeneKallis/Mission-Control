import React from 'react'

export function AgentTag({ name, className = '' }) {
  if (!name) return null

  return (
    <span
      className={`inline-flex items-center rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide bg-violet-500/20 text-violet-300 border border-violet-500/30 ${className}`.trim()}
    >
      {name}
    </span>
  )
}
