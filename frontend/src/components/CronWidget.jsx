import React from 'react'

export function CronWidget({ jobs }) {
  if (!jobs) return <div className="card h-64">Loading cron jobs...</div>

  const activeCount = jobs.filter(j => j.enabled).length

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <svg className="w-5 h-5 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Cron Jobs
        </h2>
        <span className="badge-green">{activeCount}/{jobs.length} active</span>
      </div>

      <div className="space-y-2 max-h-64 overflow-y-auto">
        {jobs.length === 0 ? (
          <p className="text-slate-500 text-sm">No scheduled jobs</p>
        ) : (
          jobs.map(job => (
            <div key={job.id} className="flex items-center justify-between p-2 rounded bg-slate-800/50">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <div className={`w-1.5 h-1.5 rounded-full ${job.enabled ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                  <span className="text-sm font-medium text-slate-200 truncate">{job.name}</span>
                </div>
                <div className="text-xs text-slate-500 ml-3 mt-1">
                  {job.schedule} · {job.deliver}
                </div>
              </div>
              {job.last_run && (
                <span className="text-xs text-slate-500">
                  {new Date(job.last_run).toLocaleDateString()}
                </span>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
