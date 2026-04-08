import React from 'react'
import { useLocation } from 'react-router-dom'
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

function AgentBadge({ agent }) {
  const assigned = Boolean(agent)
  return (
    <span
      className={`px-2 py-0.5 rounded text-[10px] font-semibold tracking-wide uppercase border ${
        assigned
          ? 'bg-violet-500/20 text-violet-300 border-violet-500/40'
          : 'bg-rose-500/20 text-rose-300 border-rose-500/40'
      }`}
    >
      {assigned ? `Agent: ${agent}` : 'Agent: Unassigned'}
    </span>
  )
}

function Card({ todo, agents, onAssign, onMove, onDragStart, lockAgent }) {
  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, todo.id)}
      className="bg-slate-800 border border-slate-700 rounded p-3 mb-2 cursor-grab active:cursor-grabbing"
    >
      <div className="flex items-center justify-between gap-2 mb-2">
        <AgentBadge agent={todo.assigned_agent} />
        <span className="text-[10px] text-slate-500">{new Date(todo.created_at).toLocaleDateString()}</span>
      </div>

      <div className="text-sm text-slate-100 mb-2">{todo.content}</div>

      <div className="flex items-center justify-between gap-2 mb-2">
        <span className="text-[10px] uppercase tracking-wide text-slate-500">{STATUS_LABEL[todo.status] || todo.status}</span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <select
          value={todo.assigned_agent || ''}
          onChange={(e) => onAssign(todo.id, e.target.value)}
          disabled={Boolean(lockAgent)}
          className="bg-slate-900 border border-slate-700 text-slate-200 text-xs rounded px-2 py-1 disabled:opacity-50"
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
  const { connected, state: wsState } = useWebSocket()
  const location = useLocation()

  const [now, setNow] = React.useState(new Date())
  const [draggedId, setDraggedId] = React.useState(null)
  const [agents, setAgents] = React.useState([])
  const [savingId, setSavingId] = React.useState(null)
  const [board, setBoard] = React.useState({ todos: [], updated_at: null })

  const params = new URLSearchParams(location.search)
  const lockAgent = (params.get('agent') || '').trim()

  const [newContent, setNewContent] = React.useState('')
  const [newAgent, setNewAgent] = React.useState(lockAgent)
  const [newStatus, setNewStatus] = React.useState('pending')

  React.useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  const loadBoard = React.useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/state`)
      if (!res.ok) throw new Error(`state ${res.status}`)
      const data = await res.json()
      setBoard({
        todos: Array.isArray(data?.todos) ? data.todos : [],
        updated_at: data?.updated_at || null,
      })
    } catch (error) {
      console.error('Failed to load board:', error)
    }
  }, [])

  React.useEffect(() => {
    loadBoard()
    const t = setInterval(loadBoard, 12000)
    return () => clearInterval(t)
  }, [loadBoard])

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

  React.useEffect(() => {
    if (lockAgent) setNewAgent(lockAgent)
  }, [lockAgent])

  const todos = board.todos || []
  const filteredTodos = lockAgent
    ? todos.filter((t) => (t.assigned_agent || '').toLowerCase() === lockAgent.toLowerCase())
    : todos

  const dedupedAgents = Array.from(new Set([
    ...agents,
    ...todos.map((t) => t.assigned_agent).filter(Boolean),
  ]))

  const byStatus = {
    pending: filteredTodos.filter((t) => t.status === 'pending'),
    in_progress: filteredTodos.filter((t) => t.status === 'in_progress'),
    completed: filteredTodos.filter((t) => t.status === 'completed' || t.status === 'cancelled'),
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

      await loadBoard()
    } catch (error) {
      console.error('Failed to update todo:', error)
    } finally {
      setSavingId(null)
    }
  }

  async function createTodo(e) {
    e.preventDefault()
    if (!newContent.trim()) return

    setSavingId('new')
    try {
      const payload = {
        content: newContent.trim(),
        assigned_agent: (lockAgent || newAgent || '').trim() || null,
        status: newStatus,
      }
      const res = await fetch(`${API_BASE}/todos/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const text = await res.text()
        throw new Error(text || `Failed with ${res.status}`)
      }

      setNewContent('')
      if (!lockAgent) setNewAgent('')
      setNewStatus('pending')
      await loadBoard()
    } catch (error) {
      console.error('Failed to create todo:', error)
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
      <Header connected={connected} lastUpdate={board.updated_at || wsState?.updated_at} now={now} />

      <main className="max-w-7xl mx-auto px-4 py-6">
        <div className="mb-6">
          <Nav />
        </div>

        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold text-white">Kanban Board</h1>
          <div className="text-xs text-slate-500">
            {savingId ? `Saving ${savingId}...` : 'Always move card to In Progress before starting work'}
          </div>
        </div>

        {lockAgent && (
          <div className="mb-4 rounded border border-violet-500/40 bg-violet-500/10 px-3 py-2 text-sm text-violet-200">
            Agent mode: showing only tasks assigned to <span className="font-semibold">{lockAgent}</span>
          </div>
        )}

        <form onSubmit={createTodo} className="bg-slate-900/50 border border-slate-800 rounded-lg p-3 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
            <input
              value={newContent}
              onChange={(e) => setNewContent(e.target.value)}
              placeholder="Add a new task..."
              className="md:col-span-2 bg-slate-900 border border-slate-700 text-slate-100 text-sm rounded px-3 py-2"
            />
            <select
              value={lockAgent || newAgent}
              onChange={(e) => setNewAgent(e.target.value)}
              disabled={Boolean(lockAgent)}
              className="bg-slate-900 border border-slate-700 text-slate-200 text-sm rounded px-2 py-2 disabled:opacity-50"
            >
              <option value="">Unassigned</option>
              {dedupedAgents.map((agent) => (
                <option key={agent} value={agent}>{agent}</option>
              ))}
            </select>
            <select
              value={newStatus}
              onChange={(e) => setNewStatus(e.target.value)}
              className="bg-slate-900 border border-slate-700 text-slate-200 text-sm rounded px-2 py-2"
            >
              {COLUMNS.map((column) => (
                <option key={column.id} value={column.id}>{column.label}</option>
              ))}
            </select>
          </div>
          <div className="mt-2">
            <button
              type="submit"
              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded text-sm font-medium"
            >
              Add Task
            </button>
          </div>
        </form>

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
                  No tasks in this column.
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
                    lockAgent={lockAgent}
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
