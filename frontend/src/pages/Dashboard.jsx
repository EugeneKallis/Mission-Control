import React from 'react'
import { Link } from 'react-router-dom'
import { useWebSocket } from '../hooks/useWebSocket'
import { Nav } from '../components/Nav'
import { Header } from '../components/Header'
import { CronWidget } from '../components/CronWidget'
import { ProcessWidget } from '../components/ProcessWidget'
import { SystemStatsWidget } from '../components/SystemStatsWidget'
import { ActivityTimeline } from '../components/ActivityTimeline'
import { QuickActions } from '../components/QuickActions'
import { JobFunnelWidget } from '../components/JobFunnelWidget'

function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center h-32">
      <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )
}

function StatCard({ label, value, color = "text-slate-100", sublabel }) {
  return (
    <div className="p-3 rounded bg-slate-800/50 text-center">
      <div className={`text-2xl font-bold ${color}`}>{value ?? '—'}</div>
      <div className="text-xs text-slate-500 mt-1">{label}</div>
      {sublabel && <div className="text-xs text-slate-600">{sublabel}</div>}
    </div>
  )
}

export default function Dashboard() {
  const { connected, state, send, refresh } = useWebSocket()
  const [now, setNow] = React.useState(new Date())

  React.useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  const s = state
  const cronJobs = s?.cron_jobs || []
  const processes = s?.active_processes || []
  const jobStats = s?.job_search_today
  const sysStats = s?.system_stats
  const activity = s?.recent_activity || []

  const activeCronCount = cronJobs.filter(j => j.enabled).length

  return (
    <div className="min-h-screen bg-slate-950">
      <Header connected={connected} lastUpdate={s?.updated_at} now={now} />

      <main className="max-w-7xl mx-auto px-4 py-6">
        {/* Nav */}
        <div className="mb-6">
          <Nav />
        </div>

        {/* ── Top stats bar ── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <StatCard label="Active Crons" value={activeCronCount} color="text-amber-400" sublabel={`${cronJobs.length} total`} />
          <StatCard label="Processes" value={processes.length} color="text-emerald-400" />
          <StatCard label="Jobs Submitted" value={jobStats?.roles_submitted || 0} color="text-purple-400" sublabel="today" />
          <StatCard label="Board" value="Kanban" color="text-blue-400" sublabel="Task assignment" />
        </div>

        {/* ── Quick nav cards ── */}
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

        {/* ── Main grid ── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          <CronWidget jobs={cronJobs} />
          <ProcessWidget processes={processes} />
        </div>

        {/* ── Second row ── */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <SystemStatsWidget stats={sysStats} />
          <JobFunnelWidget stats={jobStats} />
          <QuickActions send={send} refresh={refresh} cronJobs={cronJobs} />
        </div>

        {/* ── Activity full width ── */}
        <div className="mt-6">
          <ActivityTimeline events={activity} />
        </div>

        {/* ── Footer ── */}
        <div className="mt-8 pt-4 border-t border-slate-800 flex items-center justify-between">
          <div className="text-xs text-slate-600">
            Mission Control v0.2.0
          </div>
          <div className="flex gap-3">
            <button
              onClick={refresh}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-xs font-medium transition-colors flex items-center gap-1.5"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Refresh
            </button>
          </div>
        </div>
      </main>
    </div>
  )
}
