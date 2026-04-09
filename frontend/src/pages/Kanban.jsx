import React, { useState } from 'react'
import { useAgentContext } from '../context/AgentContext'
import { useWebSocket } from '../hooks/useWebSocket'
import { Nav } from '../components/Nav'
import { Header } from '../components/Header'
import { AgentScopePicker } from '../components/AgentScopePicker'
import { LoadingOverlay } from '../components/LoadingOverlay'
import { getApiBase } from '../lib/apiBase'

const API_BASE = getApiBase()

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

const CONTENT_PREVIEW_MAX_CHARS = 180
const CONTENT_PREVIEW_MAX_LINES = 4

function normalizePrLink(value) {
  const trimmed = (value || '').trim()
  if (!trimmed) return ''
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  return `https://${trimmed}`
}

function contentExceedsPreviewLimit(content) {
  const text = (content || '').trim()
  if (!text) return false
  if (text.length > CONTENT_PREVIEW_MAX_CHARS) return true
  return text.split(/\r?\n/).length > CONTENT_PREVIEW_MAX_LINES
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

function TaskDetailsModal({ todo, onClose }) {
  if (!todo) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 px-4" role="dialog" aria-modal="true" aria-labelledby="task-details-title">
      <div className="w-full max-w-2xl rounded-xl border border-slate-700 bg-slate-900 shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-800 px-5 py-4">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Task details</p>
            <h2 id="task-details-title" className="mt-1 text-lg font-semibold text-white">Full task details</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-slate-700 px-2 py-1 text-xs font-medium text-slate-300 transition hover:border-slate-600 hover:text-white"
          >
            Close
          </button>
        </div>

        <div className="space-y-4 px-5 py-4">
          <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
            <AgentBadge agent={todo.assigned_agent} />
            <span className="rounded border border-slate-700 px-2 py-0.5 uppercase tracking-wide text-slate-300">
              {STATUS_LABEL[todo.status] || todo.status || 'Unknown'}
            </span>
            {todo.pr_required ? (
              <span className="rounded border border-blue-500/40 bg-blue-500/10 px-2 py-0.5 uppercase tracking-wide text-blue-300">
                PR Required
              </span>
            ) : null}
          </div>

          <div>
            <p className="mb-2 text-xs uppercase tracking-[0.2em] text-slate-500">Description</p>
            <div className="max-h-[60vh] overflow-y-auto rounded-lg border border-slate-800 bg-slate-950/70 p-4 text-sm leading-6 text-slate-100 whitespace-pre-wrap break-words">
              {todo.content}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function Card({ todo, agents, onAssign, onDragStart, onPrRequiredToggle, onDelete, onShowMore }) {
  const normalizedPrLink = normalizePrLink(todo.pr_link)
  const shouldClampContent = contentExceedsPreviewLimit(todo.content)

  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, todo.id)}
      className="bg-slate-800 border border-slate-700 rounded p-3 mb-2 cursor-grab active:cursor-grabbing"
    >
      <div className="flex items-center justify-between gap-2 mb-2">
        <AgentBadge agent={todo.assigned_agent} />
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-slate-500">{new Date(todo.created_at).toLocaleDateString()}</span>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(todo.id) }}
            className="text-rose-400 hover:text-rose-300 text-xs px-1.5 py-0.5 rounded hover:bg-rose-500/20 transition-colors"
            title="Delete task"
          >
            ✕
          </button>
        </div>
      </div>

      <div className="mb-2">
        <div
          className="text-sm text-slate-100 whitespace-pre-wrap break-words overflow-hidden"
          style={shouldClampContent ? {
            display: '-webkit-box',
            WebkitBoxOrient: 'vertical',
            WebkitLineClamp: CONTENT_PREVIEW_MAX_LINES,
          } : undefined}
        >
          {todo.content}
        </div>
        {shouldClampContent ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onShowMore(todo)
            }}
            className="mt-2 text-xs font-medium text-blue-400 hover:text-blue-300"
          >
            Show more
          </button>
        ) : null}
      </div>

      {normalizedPrLink && (
        <div className="mb-3 flex items-center gap-2">
          <span className="text-[10px] uppercase tracking-wide text-slate-500">GitHub PR</span>
          <a
            href={normalizedPrLink}
            target="_blank"
            rel="noreferrer"
            className="text-[10px] font-semibold text-blue-400 hover:text-blue-300"
          >
            Open PR ↗
          </a>
        </div>
      )}

      <div className="grid grid-cols-1 gap-2">
        <select
          value={todo.assigned_agent || ''}
          onChange={(e) => onAssign(todo.id, e.target.value)}
          aria-label="Assigned agent"
          className="bg-slate-900 border border-slate-700 text-slate-200 text-xs rounded px-2 py-1"
        >
          <option value="">Unassigned</option>
          {agents.map((agent) => (
            <option key={agent} value={agent}>{agent}</option>
          ))}
        </select>

        {todo.status === 'pending' && (
          <label className="flex items-center gap-2 rounded border border-slate-700 bg-slate-900/70 px-2 py-1.5 text-xs text-slate-300 cursor-pointer">
            <input
              type="checkbox"
              checked={Boolean(todo.pr_required)}
              onChange={(e) => onPrRequiredToggle(todo.id, e.target.checked)}
              className="h-3.5 w-3.5 rounded border-slate-600 bg-slate-900 accent-blue-500"
            />
            PR Required
          </label>
        )}
      </div>
    </div>
  )
}

export default function Kanban() {
  const {
    agents: configuredAgents,
    selectedScopeId: agentScope,
    setSelectedScopeId: setAgentScope,
  } = useAgentContext()
  const { connected, connection, loading: wsLoading, state: wsState } = useWebSocket({ agentScope })

  const [now, setNow] = React.useState(new Date())
  const [draggedId, setDraggedId] = React.useState(null)
  const [savingId, setSavingId] = React.useState(null)
  const [boardLoading, setBoardLoading] = React.useState(false)
  const [board, setBoard] = React.useState({ todos: [], updated_at: null })
  const [expandedTodo, setExpandedTodo] = React.useState(null)

  const [newContent, setNewContent] = useState('')
  const [newAgent, setNewAgent] = useState('')
  const [newPrRequired, setNewPrRequired] = useState(false)

  React.useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  const loadBoard = React.useCallback(async ({ silent = false } = {}) => {
    if (!silent) setBoardLoading(true)
    try {
      const res = await fetch(`${API_BASE}/state?t=${Date.now()}`, { cache: 'no-store' })
      if (!res.ok) throw new Error(`state ${res.status}`)
      const data = await res.json()
      setBoard({
        todos: Array.isArray(data?.todos) ? data.todos : [],
        updated_at: data?.updated_at || null,
      })
    } catch (error) {
      console.error('Failed to load board:', error)
    } finally {
      if (!silent) setBoardLoading(false)
    }
  }, [])

  React.useEffect(() => {
    loadBoard({ silent: false })
    const t = setInterval(() => loadBoard({ silent: true }), 12000)
    return () => clearInterval(t)
  }, [loadBoard])

  const todos = board.todos || []
  const scopedAgentName = agentScope === 'all'
    ? ''
    : (configuredAgents.find((a) => a.id === agentScope)?.name || '')

  const filteredTodos = scopedAgentName
    ? todos.filter((t) => (t.assigned_agent || '').toLowerCase() === scopedAgentName.toLowerCase())
    : todos

  React.useEffect(() => {
    if (scopedAgentName) {
      setNewAgent(scopedAgentName)
    }
  }, [scopedAgentName])

  const dedupedAgents = Array.from(new Set([
    ...configuredAgents.map((agent) => agent.name).filter(Boolean),
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
        assigned_agent: (newAgent || scopedAgentName || '').trim() || null,
        status: 'pending',
        pr_required: newPrRequired,
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

      const created = await res.json().catch(() => null)
      if (created?.id) {
        setBoard((prev) => ({
          todos: [created, ...(prev?.todos || [])],
          updated_at: new Date().toISOString(),
        }))
      }

      setNewContent('')
      setNewAgent('')
      setNewPrRequired(false)
      loadBoard({ silent: true })
    } catch (error) {
      console.error('Failed to create todo:', error)
    } finally {
      setSavingId(null)
    }
  }

  const handleAssign = (todoId, agent) => patchTodo(todoId, { assigned_agent: agent })
  const handleMove = (todoId, status) => patchTodo(todoId, { status })
  const handlePrRequiredToggle = (todoId, prRequired) => patchTodo(todoId, { pr_required: prRequired })

  async function deleteTodo(todoId) {
    if (!window.confirm('Delete this task?')) return
    setSavingId(todoId)
    try {
      const res = await fetch(`${API_BASE}/todos/${todoId}`, { method: 'DELETE' })
      if (!res.ok) throw new Error(`Failed with ${res.status}`)
      setBoard((prev) => ({
        ...prev,
        todos: prev.todos.filter((t) => t.id !== todoId),
      }))
    } catch (error) {
      console.error('Failed to delete todo:', error)
    } finally {
      setSavingId(null)
    }
  }

  const handleDrop = (e, status) => {
    e.preventDefault()
    if (!draggedId) return
    handleMove(draggedId, status)
    setDraggedId(null)
  }

  const subtitle = agentScope === 'all'
    ? 'Scope: All agents'
    : `Scope: ${configuredAgents.find((a) => a.id === agentScope)?.name || agentScope}`

  return (
    <div className="min-h-screen bg-slate-950 relative">
      <Header connected={connected} connection={connection} lastUpdate={board.updated_at || wsState?.updated_at} now={now} subtitle={subtitle} />
      <LoadingOverlay show={boardLoading || wsLoading} label="Loading board data..." />

      <TaskDetailsModal todo={expandedTodo} onClose={() => setExpandedTodo(null)} />

      <main className="max-w-7xl mx-auto px-4 py-6">
        <div className="mb-6">
          <Nav rightContent={<AgentScopePicker agents={configuredAgents} value={agentScope} onChange={setAgentScope} />} />
        </div>

        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold text-white">Kanban Board</h1>
          <div className="text-xs text-slate-500">
            {savingId ? `Saving ${savingId}...` : 'Branch from develop (or main if no develop). Set PR Required = false to auto-merge, true to send PR.'}
          </div>
        </div>

        <form onSubmit={createTodo} className="bg-slate-900/50 border border-slate-800 rounded-lg p-3 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            <textarea
              value={newContent}
              onChange={(e) => setNewContent(e.target.value)}
              placeholder="Add a new task..."
              rows={2}
              className="md:col-span-2 bg-slate-900 border border-slate-700 text-slate-100 text-sm rounded px-3 py-2 resize-y min-h-[60px]"
            />
            <div className="flex flex-col gap-2">
              <select
                value={newAgent}
                onChange={(e) => setNewAgent(e.target.value)}
                className="bg-slate-900 border border-slate-700 text-slate-200 text-sm rounded px-2 py-2"
              >
                <option value="">Unassigned</option>
                {dedupedAgents.map((agent) => (
                  <option key={agent} value={agent}>{agent}</option>
                ))}
              </select>
              <label className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer">
                <input
                  type="checkbox"
                  checked={newPrRequired}
                  onChange={(e) => setNewPrRequired(e.target.checked)}
                  className="w-3.5 h-3.5 rounded border-slate-600 bg-slate-900 accent-blue-500"
                />
                PR Required
              </label>
            </div>
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
                    onPrRequiredToggle={handlePrRequiredToggle}
                    onDragStart={(_, id) => setDraggedId(id)}
                    onDelete={deleteTodo}
                    onShowMore={setExpandedTodo}
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
