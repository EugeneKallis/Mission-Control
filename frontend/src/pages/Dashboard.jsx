import React from 'react'
import { Link } from 'react-router-dom'
import { useAgentContext } from '../context/AgentContext'
import { useWebSocket } from '../hooks/useWebSocket'
import { Nav } from '../components/Nav'
import { Header } from '../components/Header'
import { CronWidget } from '../components/CronWidget'
import { ProcessWidget } from '../components/ProcessWidget'
import { ActivityTimeline } from '../components/ActivityTimeline'
import { QuickActions } from '../components/QuickActions'
import { JobFunnelWidget } from '../components/JobFunnelWidget'
import { AgentScopePicker } from '../components/AgentScopePicker'
import { LoadingOverlay } from '../components/LoadingOverlay'

function StatCard({ label, value, color = 'text-slate-100', sublabel }) {
  return (
    <div className="p-3 rounded bg-slate-800/50 text-center">
      <div className={`text-2xl font-bold ${color}`}>{value ?? '—'}</div>
      <div className="text-xs text-slate-500 mt-1">{label}</div>
      {sublabel && <div className="text-xs text-slate-600">{sublabel}</div>}
    </div>
  )
}

export default function Dashboard() {
  const { agents } = useAgentContext()
  const [agentScope, setAgentScope] = React.useState('all')
  const { connected, loading, state, send, refresh } = useWebSocket({ agentScope })
  const [now, setNow] = React.useState(new Date())
  const [directTodos, setDirectTodos] = React.useState([])

  React.useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  // Fetch todos directly from API to ensure accurate counts regardless of agent scope
  React.useEffect(() => {
    const apiBase = getApiBase()
    async function loadDirectTodos() {
      try {
        const res = await fetch(`${apiBase}/state?t=${Date.now()}`, { cache: 'no-store' })
        if (!res.ok) return
        const data = await res.json()
        setDirectTodos(Array.isArray(data?.todos) ? data.todos : [])
      } catch (error) {
        // silently ignore
      }
    }
    loadDirectTodos()
    const interval = setInterval(loadDirectTodos, 15000)
    return () => clearInterval(interval)
  }, [])

  const s = state
  const cronJobs = s?.cron_jobs || []
  const processes = s?.active_processes || []
  // Use direct todos for accurate counts; fall back to ws state if still loading
  const todos = directTodos.length > 0 ? directTodos : (s?.todos || [])
  const jobStats = s?.job_search_today
  const activity = s?.recent_activity || []

  const activeCronCount = cronJobs.filter((j) => j.enabled).length
  const todoCount = todos.filter((t) => t.status === 'pending').length
  const inProgressCount = todos.filter((t) => t.status === 'in_progress').length
  const doneCount = todos.filter((t) => t.status === 'completed' || t.status === 'cancelled').length

  const subtitle = agentScope === 'all'
    ? 'Scope: All agents'
    : `Scope: ${agents.find((a) => a.id === agentScope)?.name || agentScope}`

  return (
    <div className="min-h-screen bg-slate-950 relative">
      <Header connected={connected} lastUpdate={s?.updated_at} now={now} subtitle={subtitle} />
      <LoadingOverlay show={loading} label="Loading agent data..." />

      <main className="max-w-7xl mx-auto px-4 py-6">
        <div className="mb-6">
          <Nav
            rightContent={<AgentScopePicker agents={agents} value={agentScope} onChange={setAgentScope} />}
          />
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3 mb-6">
          <StatCard label="Active Crons" value={activeCronCount} color="text-amber-400" sublabel={`${cronJobs.length} total`} />
          <StatCard label="Processes" value={processes.length} color="text-emerald-400" />
          <StatCard label="Jobs Submitted" value={jobStats?.roles_submitted || 0} color="text-purple-400" sublabel="today" />
          <StatCard label="To Do" value={todoCount} color="text-amber-400" />
          <StatCard label="In Progress" value={inProgressCount} color="text-blue-400" />
          <StatCard label="Done" value={doneCount} color="text-emerald-400" />
          <StatCard label="Agents" value={agentScope === 'all' ? agents.length : 1} color="text-violet-400" />
        </div>

        <div className="grid grid-cols-3 gap-4 mb-6">
          <Link to="/kanban" className="p-4 rounded bg-slate-800/50 hover:bg-slate-800 transition-colors text-center">
            <div className="text-lg font-bold text-blue-400">Board</div>
            <div className="text-xs text-slate-500">Kanban</div>
          </Link>
          <Link to="/crons" className="p-4 rounded bg-slate-800/50 hover:bg-slate-800 transition-colors text-center">
            <div className="text-lg font-bold text-amber-400">{cronJobs.length}</div>
            <div className="text-xs text-slate-500">Cron Jobs</div>
          </Link>
          <Link to="/skills" className="p-4 rounded bg-slate-800/50 hover:bg-slate-800 transition-colors text-center">
            <div className="text-lg font-bold text-blue-400">Skills</div>
            <div className="text-xs text-slate-500">View all</div>
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          <CronWidget jobs={cronJobs} />
          <ProcessWidget processes={processes} />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <JobFunnelWidget stats={jobStats} />
          <QuickActions send={send} refresh={refresh} cronJobs={cronJobs} />
        </div>

        <div className="mt-6">
          <ActivityTimeline events={activity} />
        </div>
      </main>
    </div>
  )
}
