import React from 'react'

export function ProcessWidget({ processes }) {
  if (!processes) return <div className="card h-64">Loading processes...</div>

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
          </svg>
          Active Processes
        </h2>
        <span className="badge-blue">{processes.length} running</span>
      </div>

      <div className="space-y-2 max-h-64 overflow-y-auto">
        {processes.length === 0 ? (
          <p className="text-slate-500 text-sm">No active processes</p>
        ) : (
          processes.map(proc => (
            <div key={proc.id} className="flex items-center justify-between p-2 rounded bg-slate-800/50">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <div className="min-w-0">
                  <div className="text-sm font-medium text-slate-200 truncate" title={proc.command}>
                    {proc.command.split(' ')[0]}
                  </div>
                  <div className="text-xs text-slate-500">
                    PID {proc.pid || '-'} · {proc.status}
                  </div>
                </div>
              </div>
              <button className="text-rose-400 hover:text-rose-300 text-xs font-medium px-2 py-1 rounded hover:bg-rose-500/10 transition-colors">
                Kill
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
