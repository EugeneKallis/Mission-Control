import React from 'react'
import { useWebSocket } from '../hooks/useWebSocket'
import { Nav } from '../components/Nav'
import { Header } from '../components/Header'

const API_BASE = `http://${window.location.hostname}:5056`

const COLUMNS = [
  { id: 'pending', label: 'To Do', color: 'text-amber-400' },
  { id: 'in_progress', label: 'In Progress', color: 'text-blue-400' },
  { id: 'completed', label: 'Done', color: 'text-emerald-400' },
]

const STATUS_LABEL = {
  pending: 'To Do',
  in_progress: 'In Progress',
  completed: 'Done',
  cancelled: 'Cancelled',
}

function Card({ todo, agents, onAssign, onMove, onDragStart }) {
  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, todo.id)}
      className="bg-slate-800 border border-slate-700 rounded p-3 mb-2 cursor-grab active:cursor-grabbing"
    >
      <div className="text-sm text-slate-100 mb-2">{todo.content}</div>

      <div className="flex items-center justify-between gap-2 mb-2">
        <span className="text-[10px] uppercase tracking-wide text-slate-500">{STATUS_LABEL[todo.status] || todo.status}</span>
        <span className="text-[10px] text-slate-500">{new Date(todo.created_at).toLocaleDateString()}</span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <select
          value={todo.assigned_agent || ''}
          onChange={(e) => onAssign(todo.id, e.target.value)}
          className="bg-slate-900 border border-slate-700 text-slate-200 text-xs rounded px-2 py-1"
        >
          <option value="">Unassigned</option>
          {agents.map((agent) => (
            <option key={agent} value={agent}>{agent}</option>
          ))}
        </select>

        <select
          value={todo.status === 'cancelled' ? 'completed' : todo.status}
          onChange={(e) => onMove(todo.id, e.target.value)}
          className="bg-slate-900 border border-slate-700 text-slate-200 text-xs rounded px-2 py-1"
        >
          {COLUMNS.map((column) => (
            <option key={column.id} value={column.id}>{column.label}</option>
          ))}
        </select>
      </div>
    </div>
  )
}

export default function Kanban() {
  const { connected, state, refresh } = useWebSocket()
  const [now, setNow] = React.useState(new Date())
  const [draggedId, setDraggedId] = React.useState(null)
  const [agents, setAgents] = React.useState([])
  const [savingId, setSavingId] = React.useState(null)

  React.useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  React.useEffect(() => {
    async function loadAgents() {
      try {
        const res = await fetch(`${API_BASE}/todos/agents`)
        const data = await res.json()
        if (Array.isArray(data?.agents)) {
          setAgents(data.agents)
        }
      } catch (error) {
        console.error('Failed to load agent profiles:', error)
      }
    }

    loadAgents()
  }, [])

  const todos = state?.todos || []
  const dedupedAgents = Array.from(new Set([
    ...agents,
    ...todos.map((t) => t.assigned_agent).filter(Boolean),
  ]))

  const byStatus = {
    pending: todos.filter((t) => t.status === 'pending'),
    in_progress: todos.filter((t) => t.status === 'in_progress'),
    completed: todos.filter((t) => t.status === 'completed' || t.status === 'cancelled'),
  }

  const counts = {
    pending: byStatus.pending.length,
    in_progress: byStatus.in_progress.length,
    completed: byStatus.completed.length,
  }

  async function patchTodo(todoId, payload) {
    setSavingId(todoId)
    try {
      const res = await fetch(`${API_BASE}/todos/${todoId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!res.ok) {
        const text = await res.text()
        throw new Error(text || `Failed with ${res.status}`)
      }

      refresh()
    } catch (error) {
      console.error('Failed to update todo:', error)
    } finally {
      setSavingId(null)
    }
  }

  const handleAssign = (todoId, agent) => patchTodo(todoId, { assigned_agent: agent })
  const handleMove = (todoId, status) => patchTodo(todoId, { status })

  const handleDrop = (e, status) => {
    e.preventDefault()
    if (!draggedId) return
    handleMove(draggedId, status)
    setDraggedId(null)
  }

  return (
    <div className="min-h-screen bg-slate-950">
      <Header connected={connected} lastUpdate={state?.updated_at} now={now} />

      <main className="max-w-7xl mx-auto px-4 py-6">
        <div className="mb-6">
          <Nav />
        </div>

        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-white">Kanban Board</h1>
          <div className="text-xs text-slate-500">
            {savingId ? `Saving ${savingId}...` : 'Drag cards or use dropdowns'}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3 mb-6">
          <div className="bg-slate-900/50 border border-slate-800 rounded p-3 text-center">
            <div className="text-2xl font-bold text-amber-400">{counts.pending}</div>
            <div className="text-xs text-slate-500">To Do</div>
          </div>
          <div className="bg-slate-900/50 border border-slate-800 rounded p-3 text-center">
            <div className="text-2xl font-bold text-blue-400">{counts.in_progress}</div>
            <div className="text-xs text-slate-500">In Progress</div>
          </div>
          <div className="bg-slate-900/50 border border-slate-800 rounded p-3 text-center">
            <div className="text-2xl font-bold text-emerald-400">{counts.completed}</div>
            <div className="text-xs text-slate-500">Done</div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {COLUMNS.map((column) => (
            <section
              key={column.id}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => handleDrop(e, column.id)}
              className="bg-slate-900/50 border border-slate-800 rounded-lg p-3 min-h-64"
            >
              <div className="flex items-center justify-between mb-3">
                <h2 className={`font-semibold ${column.color}`}>{column.label}</h2>
                <span className="text-xs text-slate-500">{byStatus[column.id].length}</span>
              </div>

              {byStatus[column.id].length === 0 ? (
                <div className="text-xs text-slate-600 border border-dashed border-slate-700 rounded p-3 text-center">
                  Nothing here. Beautiful chaos.
                </div>
              ) : (
                byStatus[column.id].map((todo) => (
                  <Card
                    key={todo.id}
                    todo={todo}
                    agents={dedupedAgents}
                    onAssign={handleAssign}
                    onMove={handleMove}
                    onDragStart={(_, id) => setDraggedId(id)}
                  />
                ))
              )}
            </section>
          ))}
        </div>
      </main>
    </div>
  )
}
