import React from 'react'

function ConnectionStatus({ connected }) {
  return (
    <div className="flex items-center gap-2">
      <div
        className={`w-2 h-2 rounded-full ${
          connected ? 'bg-emerald-500' : 'bg-rose-500'
        }`}
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

export function Header({ connected, lastUpdate, now }) {
  return (
    <header className="bg-slate-900/80 backdrop-blur border-b border-slate-800 sticky top-0 z-10">
      <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <div className="text-xl font-bold tracking-tight">
            <span className="text-blue-400">⬡</span>{' '}
            <span>Mission Control</span>
          </div>
        </div>
        <div className="flex items-center gap-6">
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
