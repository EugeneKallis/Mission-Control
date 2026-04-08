import React, { useState } from 'react'

const API = 'http://localhost:5056'

function StatusBadge({ status }) {
  const colors = {
    pending: 'badge-yellow',
    in_progress: 'badge-blue',
    completed: 'badge-green',
    cancelled: 'badge-red'
  }
  return <span className={colors[status] || colors.pending}>{status.replace('_', ' ')}</span>
}

export function TodoWidget({ todos }) {
  const [completing, setCompleting] = useState(null)

  if (!todos) return <div className="card h-64">Loading tasks...</div>

  const counts = {
    pending: todos.filter(t => t.status === 'pending').length,
    in_progress: todos.filter(t => t.status === 'in_progress').length,
    completed: todos.filter(t => t.status === 'completed').length
  }

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <svg className="w-5 h-5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
          </svg>
          Tasks
        </h2>
        <div className="flex gap-2 text-xs">
          <span className="text-emerald-400">{counts.completed} ✓</span>
          <span className="text-blue-400">{counts.in_progress} →</span>
          <span className="text-amber-400">{counts.pending} ○</span>
        </div>
      </div>

      <div className="space-y-1.5 max-h-72 overflow-y-auto">
        {todos.length === 0 ? (
          <p className="text-slate-500 text-sm text-center py-4">No active tasks</p>
        ) : (
          todos.map(todo => (
            <div 
              key={todo.id} 
              className={`flex items-center justify-between p-2.5 rounded-lg transition-colors ${
                todo.status === 'completed' 
                  ? 'bg-slate-800/30 opacity-60' 
                  : 'bg-slate-800/50 hover:bg-slate-700/50'
              }`}
            >
              <div className="flex items-center gap-2.5 flex-1 min-w-0">
                <StatusBadge status={todo.status} />
                <span className={`text-sm truncate ${todo.status === 'completed' ? 'text-slate-500 line-through' : 'text-slate-200'}`}>
                  {todo.content}
                </span>
              </div>
              {todo.status !== 'completed' && todo.status !== 'cancelled' && (
                <button
                  onClick={() => {/* TODO: mark complete via API */}}
                  className="w-5 h-5 rounded border border-slate-600 hover:border-emerald-500 hover:bg-emerald-500/10 flex items-center justify-center transition-colors shrink-0"
                  title="Mark complete"
                >
                  <span className="text-slate-600 text-xs">○</span>
                </button>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
