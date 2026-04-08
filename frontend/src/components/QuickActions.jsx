import React, { useState } from 'react'

const API = 'http://localhost:5056'

function ActionButton({ onClick, label, icon, color = "bg-slate-700 hover:bg-slate-600", disabled }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`px-3 py-2 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 ${color} ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
    >
      {icon}
      {label}
    </button>
  )
}

export function QuickActions({ send, refresh, cronJobs }) {
  const [running, setRunning] = useState(null)
  const [result, setResult] = useState(null)

  const triggerAction = async (id, action, label) => {
    setRunning(id)
    setResult(null)
    try {
      if (action === 'refresh') {
        refresh()
        setResult({ ok: true, msg: 'Refreshed' })
      } else if (action === 'log_event') {
        send({ type: 'log_event', event_type: 'manual', title: label, status: 'info' })
        setResult({ ok: true, msg: `${label} logged` })
      } else {
        setResult({ ok: true, msg: `${label} triggered` })
      }
    } catch (e) {
      setResult({ ok: false, msg: e.message })
    }
    setRunning(null)
    setTimeout(() => setResult(null), 3000)
  }

  const isRunning = (id) => running === id

  return (
    <div className="card">
      <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
        <svg className="w-5 h-5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
        Quick Actions
      </h2>

      <div className="space-y-3">
        {/* Refresh */}
        <div className="flex items-center justify-between">
          <span className="text-sm text-slate-300">Refresh dashboard</span>
          <ActionButton
            id="refresh"
            onClick={() => triggerAction('refresh', 'refresh')}
            disabled={isRunning('refresh')}
            label={isRunning('refresh') ? 'Refreshing...' : 'Refresh'}
            color="bg-blue-600 hover:bg-blue-500 text-white"
            icon={
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            }
          />
        </div>

        {/* Log custom event */}
        <div className="flex items-center justify-between">
          <span className="text-sm text-slate-300">Log manual event</span>
          <ActionButton
            id="manual"
            onClick={() => triggerAction('manual', 'log_event', 'Manual checkpoint')}
            disabled={isRunning('manual')}
            label="Checkpoint"
            icon={
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            }
          />
        </div>

        {/* Trigger cron jobs */}
        {cronJobs && cronJobs.length > 0 && (
          <>
            <div className="border-t border-slate-700 pt-3 mt-3">
              <p className="text-xs text-slate-500 mb-2">Trigger cron job</p>
              <div className="flex flex-wrap gap-2">
                {cronJobs.slice(0, 4).map(job => (
                  <ActionButton
                    key={job.id}
                    id={job.id}
                    onClick={() => triggerAction(job.id, 'cron', job.name)}
                    disabled={isRunning(job.id) || !job.enabled}
                    label={job.name.split('-').slice(-1)[0].substring(0, 12) || job.name.substring(0, 12)}
                    icon={
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                      </svg>
                    }
                  />
                ))}
              </div>
            </div>
          </>
        )}

        {/* Result feedback */}
        {result && (
          <div className={`mt-2 px-3 py-2 rounded text-xs ${result.ok ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'}`}>
            {result.ok ? '✓' : '✗'} {result.msg}
          </div>
        )}
      </div>
    </div>
  )
}
