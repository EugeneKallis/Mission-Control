import React from 'react'

function ConnectionStatus({ connected }) {
  return (
    <div className="flex items-center gap-2">
      <div
        className={`w-2 h-2 rounded-full ${connected ? 'bg-emerald-500' : 'bg-rose-500'}`}
        style={connected ? { animation: 'pulse 2s ease-in-out infinite' } : {}}
      />
      <span className={`text-xs font-medium ${connected ? 'text-emerald-400' : 'text-rose-400'}`}>
        {connected ? 'LIVE' : 'OFFLINE'}
      </span>
    </div>
  )
}

function Clock({ now }) {
  if (!now) return null
  return (
    <span className="text-sm text-slate-400 font-mono">
      {now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
    </span>
  )
}

export function Header({ connected, lastUpdate, now, subtitle }) {
  return (
    <header className="bg-slate-900/80 backdrop-blur border-b border-slate-800 sticky top-0 z-10">
      <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
        <div className="flex items-center gap-4 min-w-0">
          <div className="text-xl font-bold tracking-tight shrink-0">
            <span className="text-blue-400">⬡</span>{' '}
            <span>Mission Control</span>
          </div>
          {subtitle ? <div className="text-xs text-blue-300 font-mono truncate max-w-[460px]">{subtitle}</div> : null}
        </div>

        <div className="flex items-center gap-4 shrink-0">
          <Clock now={now} />
          {lastUpdate && (
            <span className="text-xs text-slate-600 hidden sm:block">
              Updated {new Date(lastUpdate).toLocaleTimeString()}
            </span>
          )}
          <ConnectionStatus connected={connected} />
        </div>
      </div>
    </header>
  )
}
