import React from 'react'
import { AgentTag } from './AgentTag'

function EventIcon({ type }) {
  const icons = {
    cron_run: (
      <svg className="w-4 h-4 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    todo_change: (
      <svg className="w-4 h-4 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
      </svg>
    ),
    job_submitted: (
      <svg className="w-4 h-4 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
      </svg>
    ),
    process_change: (
      <svg className="w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2" />
      </svg>
    ),
    manual: (
      <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  }
  return icons[type] || icons.manual
}

function statusDot(status) {
  if (status === "ok" || status === "success") return "bg-emerald-500"
  if (status === "error") return "bg-rose-500"
  return "bg-slate-500"
}

export function ActivityTimeline({ events }) {
  if (!events || events.length === 0) {
    return (
      <div className="card">
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <svg className="w-5 h-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Activity
        </h2>
        <p className="text-slate-500 text-sm">No recent activity</p>
      </div>
    )
  }

  return (
    <div className="card">
      <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
        <svg className="w-5 h-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        Activity
        <span className="text-xs text-slate-500 ml-auto">{events.length} recent</span>
      </h2>

      <div className="space-y-0 max-h-80 overflow-y-auto">
        {events.map((event, idx) => {
          const time = new Date(event.timestamp)
          const isToday = time.toDateString() === new Date().toDateString()
          const timeStr = isToday 
            ? time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            : time.toLocaleDateString([], { month: 'short', day: 'numeric' })

          return (
            <div key={event.id} className="flex items-start gap-3 py-2 relative">
              {/* Vertical line */}
              {idx < events.length - 1 && (
                <div className="absolute left-3.5 top-8 bottom-0 w-px bg-slate-700" />
              )}
              
              {/* Icon */}
              <div className="relative z-10 mt-0.5">
                <div className="w-7 h-7 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center">
                  <EventIcon type={event.type} />
                </div>
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`w-1.5 h-1.5 rounded-full ${statusDot(event.status)}`} />
                  <span className="text-sm font-medium text-slate-200 truncate">{event.title}</span>
                  <AgentTag name={event._agent_name} />
                </div>
                {event.detail && (
                  <p className="text-xs text-slate-500 mt-0.5 truncate">{event.detail}</p>
                )}
              </div>

              <span className="text-xs text-slate-600 shrink-0 mt-0.5">{timeStr}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
