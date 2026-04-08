import React from 'react'

export function JobFunnelWidget({ stats }) {
  if (!stats) {
    return (
      <div className="card">
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <svg className="w-5 h-5 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
          Job Search Today
        </h2>
        <div className="text-slate-500 text-sm">No job data yet</div>
      </div>
    )
  }

  const sources = Object.entries(stats.source_coverage || {})
  const totalSources = sources.length
  const maxCount = Math.max(...sources.map(([, c]) => c), 1)

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <svg className="w-5 h-5 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
          Job Search
        </h2>
        <span className="text-xs text-slate-500">{stats.date}</span>
      </div>

      {/* Big numbers */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="p-3 rounded bg-slate-800/50 text-center">
          <div className="text-2xl font-bold text-emerald-400">{stats.roles_submitted}</div>
          <div className="text-xs text-slate-500 mt-1">Submitted</div>
        </div>
        <div className="p-3 rounded bg-slate-800/50 text-center">
          <div className="text-2xl font-bold text-blue-400">{stats.roles_queued}</div>
          <div className="text-xs text-slate-500 mt-1">Queued</div>
        </div>
        <div className="p-3 rounded bg-slate-800/50 text-center">
          <div className="text-2xl font-bold text-purple-400">{totalSources}</div>
          <div className="text-xs text-slate-500 mt-1">Sources</div>
        </div>
      </div>

      {/* Source breakdown */}
      {sources.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs text-slate-500 mb-1">By source</div>
          {sources.map(([source, count]) => (
            <div key={source} className="flex items-center gap-2">
              <span className="text-xs text-slate-400 w-24 truncate">{source}</span>
              <div className="flex-1 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-purple-500 rounded-full"
                  style={{ width: `${(count / maxCount) * 100}%` }}
                />
              </div>
              <span className="text-xs text-slate-400 w-4 text-right">{count}</span>
            </div>
          ))}
        </div>
      )}

      {sources.length === 0 && (
        <p className="text-xs text-slate-500">No submissions tracked yet</p>
      )}
    </div>
  )
}
