import React, { useState } from 'react'
import { useWebSocket } from '../hooks/useWebSocket'
import { Nav } from '../components/Nav'
import { Header } from '../components/Header'

const STATUS_COLORS = {
  pending: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  in_progress: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  completed: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  cancelled: 'bg-slate-500/20 text-slate-400 border-slate-500/30',
}

function StatusBadge({ status }) {
  const cls = STATUS_COLORS[status] || STATUS_COLORS.pending
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium border ${cls}`}>
      {status.replace('_', ' ')}
    </span>
  )
}

const FILTERS = ['all', 'pending', 'in_progress', 'completed', 'cancelled']

export default function Tasks() {
  const { connected, state, refresh } = useWebSocket()
  const [now, setNow] = useState(new Date())
  const [filter, setFilter] = useState('all')
  const [expandedId, setExpandedId] = useState(null)

  React.useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  const todos = state?.todos || []

  const filtered = filter === 'all' ? todos : todos.filter(t => t.status === filter)

  const counts = { all: todos.length }
  FILTERS.slice(1).forEach(f => { counts[f] = todos.filter(t => t.status === f).length })

  return (
    <div className="min-h-screen bg-slate-950">
      <Header connected={connected} lastUpdate={state?.updated_at} now={now} />

      <main className="max-w-7xl mx-auto px-4 py-6">
        <div className="mb-6">
          <Nav />
        </div>

        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-white">Tasks</h1>
          <button onClick={refresh} className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-xs font-medium transition-colors">
            Refresh
          </button>
        </div>

        {/* Filter tabs */}
        <div className="flex gap-2 mb-6">
          {FILTERS.map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                filter === f
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              {f === 'all' ? 'All' : f.replace('_', ' ')}
              <span className="ml-1.5 opacity-60">{counts[f]}</span>
            </button>
          ))}
        </div>

        {/* Table */}
        <div className="bg-slate-900/50 rounded-lg border border-slate-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800 text-left">
                <th className="px-4 py-3 text-slate-500 font-medium text-xs uppercase tracking-wider w-32">Status</th>
                <th className="px-4 py-3 text-slate-500 font-medium text-xs uppercase tracking-wider">Content</th>
                <th className="px-4 py-3 text-slate-500 font-medium text-xs uppercase tracking-wider w-48">Created</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-4 py-12 text-center text-slate-600">
                    No tasks found
                  </td>
                </tr>
              )}
              {filtered.map(todo => (
                <React.Fragment key={todo.id}>
                  <tr
                    className="border-b border-slate-800/50 hover:bg-slate-800/30 cursor-pointer transition-colors"
                    onClick={() => setExpandedId(expandedId === todo.id ? null : todo.id)}
                  >
                    <td className="px-4 py-3">
                      <StatusBadge status={todo.status} />
                    </td>
                    <td className="px-4 py-3 text-slate-200">{todo.content}</td>
                    <td className="px-4 py-3 text-slate-500 text-xs">
                      {new Date(todo.created_at).toLocaleString()}
                    </td>
                  </tr>
                  {expandedId === todo.id && (
                    <tr className="bg-slate-800/20">
                      <td colSpan={3} className="px-4 py-4 text-slate-400 text-xs">
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <div className="text-slate-500 mb-1">Task ID</div>
                            <div className="font-mono text-slate-300">{todo.id}</div>
                          </div>
                          <div>
                            <div className="text-slate-500 mb-1">Status</div>
                            <StatusBadge status={todo.status} />
                          </div>
                          <div>
                            <div className="text-slate-500 mb-1">Created</div>
                            <div className="text-slate-300">{new Date(todo.created_at).toLocaleString()}</div>
                          </div>
                          {todo.completed_at && (
                            <div>
                              <div className="text-slate-500 mb-1">Completed</div>
                              <div className="text-slate-300">{new Date(todo.completed_at).toLocaleString()}</div>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  )
}
