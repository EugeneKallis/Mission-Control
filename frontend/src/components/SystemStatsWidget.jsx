import React from 'react'

function ProgressBar({ percent, color = "bg-blue-500", label }) {
  return (
    <div className="mb-3">
      <div className="flex justify-between text-xs mb-1">
        <span className="text-slate-400">{label}</span>
        <span className="text-slate-300">{percent.toFixed(1)}%</span>
      </div>
      <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
        <div
          className={`h-full ${color} rounded-full transition-all duration-500`}
          style={{ width: `${Math.min(percent, 100)}%` }}
        />
      </div>
    </div>
  )
}

export function SystemStatsWidget({ stats }) {
  if (!stats) return <div className="card h-48">Loading system stats...</div>

  const memColor = stats.memory_percent > 80 ? "bg-rose-500" : stats.memory_percent > 60 ? "bg-amber-500" : "bg-blue-500"
  const diskColor = stats.disk_percent > 85 ? "bg-rose-500" : stats.disk_percent > 70 ? "bg-amber-500" : "bg-emerald-500"
  const cpuColor = stats.cpu_percent > 80 ? "bg-rose-500" : stats.cpu_percent > 50 ? "bg-amber-500" : "bg-emerald-500"

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <svg className="w-5 h-5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
          </svg>
          System
        </h2>
        <span className="text-xs text-slate-500">{stats.hostname}</span>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-4">
        <div className="p-3 rounded bg-slate-800/50 text-center">
          <div className="text-2xl font-bold text-emerald-400">{stats.cpu_percent.toFixed(0)}%</div>
          <div className="text-xs text-slate-500 mt-1">CPU</div>
        </div>
        <div className="p-3 rounded bg-slate-800/50 text-center">
          <div className="text-2xl font-bold text-blue-400">{stats.memory_percent.toFixed(0)}%</div>
          <div className="text-xs text-slate-500 mt-1">Memory</div>
        </div>
      </div>

      <ProgressBar percent={stats.cpu_percent} color={cpuColor} label="CPU Usage" />
      <ProgressBar percent={stats.memory_percent} color={memColor} label="Memory" />
      <ProgressBar percent={stats.disk_percent} color={diskColor} label="Disk" />

      <div className="flex justify-between text-xs text-slate-500 mt-2">
        <span>{stats.memory_used_gb}GB / {stats.memory_total_gb}GB</span>
        <span>{stats.disk_used_tb}TB / {stats.disk_total_tb}TB</span>
      </div>
    </div>
  )
}
