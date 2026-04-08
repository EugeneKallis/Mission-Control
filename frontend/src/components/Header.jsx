import React from 'react'

function ConnectionStatus({ connected, connection }) {
  const status = connection?.status || (connected ? 'live' : 'offline')
  const detail = connection?.total > 1 ? `${connection.online}/${connection.total} agents reachable` : null

  const palette = {
    live: 'bg-emerald-500 text-emerald-400',
    partial: 'bg-amber-500 text-amber-400',
    offline: 'bg-rose-500 text-rose-400',
  }

  const [dotClass, textClass] = (palette[status] || palette.offline).split(' ')

  return (
    <div className="flex items-center gap-2">
      <div
        className={`w-2 h-2 rounded-full ${dotClass}`}
        style={status === 'live' ? { animation: 'pulse 2s ease-in-out infinite' } : {}}
      />
      <div className="flex flex-col items-end leading-none">
        <span className={`text-xs font-medium ${textClass}`}>
          {status === 'live' ? 'LIVE' : status === 'partial' ? 'PARTIAL' : 'OFFLINE'}
        </span>
        {detail ? <span className="text-[10px] text-slate-500">{detail}</span> : null}
      </div>
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

export function Header({ connected, connection, lastUpdate, now, subtitle }) {
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
          <ConnectionStatus connected={connected} connection={connection} />
        </div>
      </div>
    </header>
  )
}
