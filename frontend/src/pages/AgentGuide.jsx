import React, { useState } from 'react'
import { useWebSocket } from '../hooks/useWebSocket'
import { Nav } from '../components/Nav'
import { Header } from '../components/Header'
import { useAgentContext } from '../context/AgentContext'

export default function AgentGuide() {
  const { connected, state } = useWebSocket()
  const { selectedAgent, agents } = useAgentContext()
  const [now, setNow] = useState(new Date())

  React.useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  return (
    <div className="min-h-screen bg-slate-950">
      <Header connected={connected} lastUpdate={state?.updated_at} now={now} />

      <main className="max-w-5xl mx-auto px-4 py-6">
        <div className="mb-6">
          <Nav />
        </div>

        <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-6 space-y-5">
          <h1 className="text-2xl font-bold text-white">Agent Quickstart</h1>
          <p className="text-slate-400 text-sm">
            Share this page with any Hermes agent/profile. It explains how to use Mission Control without guesswork.
          </p>

          <div>
            <div className="text-slate-200 font-semibold mb-2">Current selected agent</div>
            <div className="text-sm text-blue-300">{selectedAgent?.name}</div>
            <div className="text-xs text-slate-500 font-mono">{selectedAgent?.url}</div>
          </div>

          <div>
            <div className="text-slate-200 font-semibold mb-2">How to use</div>
            <ol className="list-decimal list-inside text-sm text-slate-300 space-y-1">
              <li>Open Settings and add each agent with its gateway URL.</li>
              <li>Use the agent selector in the top header to switch context.</li>
              <li>Overview, Tasks, Kanban, Crons, and Skills now read from that selected gateway.</li>
              <li>If data looks stale, hit Refresh on the page.</li>
            </ol>
          </div>

          <div>
            <div className="text-slate-200 font-semibold mb-2">Gateway API expected</div>
            <ul className="text-sm text-slate-300 space-y-1">
              <li><span className="font-mono text-slate-400">GET /state</span> - full dashboard state</li>
              <li><span className="font-mono text-slate-400">GET /skills</span> - list skills</li>
              <li><span className="font-mono text-slate-400">GET /skills/:name/content</span> - skill markdown</li>
              <li><span className="font-mono text-slate-400">PATCH /todos/:id</span> - update status / assignment</li>
              <li><span className="font-mono text-slate-400">GET /todos/agents</span> - available profile names</li>
            </ul>
          </div>

          <div>
            <div className="text-slate-200 font-semibold mb-2">Configured agents ({agents.length})</div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {agents.map((a) => (
                <div key={a.id} className="bg-slate-800/50 border border-slate-700 rounded p-2">
                  <div className="text-sm text-slate-200">{a.name}</div>
                  <div className="text-xs text-slate-500 font-mono break-all">{a.url}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
