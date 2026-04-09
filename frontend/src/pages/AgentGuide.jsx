import React, { useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useWebSocket } from '../hooks/useWebSocket'
import { Nav } from '../components/Nav'
import { Header } from '../components/Header'
import { useAgentContext } from '../context/AgentContext'

export default function AgentGuide() {
  const { connected, state } = useWebSocket()
  const { selectedAgent, agents } = useAgentContext()
  const location = useLocation()
  const [now, setNow] = useState(new Date())

  const params = new URLSearchParams(location.search)
  const targetAgent = (params.get('agent') || '').trim()
  const origin = window.location.origin

  React.useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  const directBoardLink = targetAgent
    ? `${origin}/kanban?agent=${encodeURIComponent(targetAgent)}`
    : `${origin}/kanban`

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
            Share this with any Hermes agent so they instantly know the board workflow.
          </p>

          <div>
            <div className="text-slate-200 font-semibold mb-2">Current selected gateway</div>
            <div className="text-sm text-blue-300">{selectedAgent?.name}</div>
            <div className="text-xs text-slate-500 font-mono">{selectedAgent?.url}</div>
          </div>

          {targetAgent ? (
            <div className="rounded border border-violet-500/40 bg-violet-500/10 p-3">
              <div className="text-sm text-violet-200">
                This guide is scoped to agent <span className="font-semibold">{targetAgent}</span>.
                The board link below only shows tasks assigned to this agent.
              </div>
              <div className="mt-2 text-xs text-slate-300 font-mono break-all">{directBoardLink}</div>
            </div>
          ) : (
            <div className="rounded border border-slate-700 bg-slate-800/40 p-3 text-sm text-slate-300">
              Add <span className="font-mono">?agent=agent-name</span> to this page URL to generate a dedicated per-agent guide and board link.
            </div>
          )}

          <div>
            <div className="text-slate-200 font-semibold mb-2">Required workflow for agents</div>
            <ol className="list-decimal list-inside text-sm text-slate-300 space-y-1">
              <li>Open your dedicated Kanban link.</li>
              <li>Only work tasks assigned to your agent name.</li>
              <li>Before starting any task, move it to <span className="font-semibold">In Progress</span>.</li>
              <li>Update the card at each major step so status is always current.</li>
              <li>When done, move to <span className="font-semibold">Done</span> and add final notes in task content if needed.</li>
            </ol>
          </div>

          <div>
            <div className="text-slate-200 font-semibold mb-2">PR Required tasks</div>
            <p className="text-sm text-slate-300 mb-2">
              Some tasks are marked <span className="font-semibold">PR Required</span>. For these:
            </p>
            <ol className="list-decimal list-inside text-sm text-slate-300 space-y-1">
              <li>Do <span className="font-semibold">NOT</span> merge code directly to <code className="text-xs text-violet-300">develop</code> or <code className="text-xs text-violet-300">main</code>.</li>
              <li>Create a <span className="font-semibold">feature branch</span> and implement the changes there.</li>
              <li>Open a Pull Request when the work is complete.</li>
              <li>Post the PR link to Discord when the task is marked done.</li>
            </ol>
          </div>

          <div>
            <div className="text-slate-200 font-semibold mb-2">Discord notifications</div>
            <p className="text-sm text-slate-300 mb-2">
              When a task is completed, the worker sends a notification to the configured Discord channel via the bot API.
            </p>
            <p className="text-sm text-slate-300 mb-2">
              Discord configuration is stored in <code className="text-xs text-violet-300">~/.hermes/profiles/&lt;agent&gt;/.env</code>:
            </p>
            <ul className="list-disc list-inside text-sm text-slate-300 space-y-1">
              <li><code className="text-xs text-slate-400">DISCORD_BOT_TOKEN</code> — the bot token for posting to channels.</li>
              <li><code className="text-xs text-slate-400">DISCORD_HOME_CHANNEL</code> — the channel ID where notifications are posted.</li>
              <li><code className="text-xs text-slate-400">DISCORD_FREE_RESPONSE_CHANNELS</code> — comma-separated channel IDs the bot can post to freely.</li>
            </ul>
          </div>

          <div>
            <div className="text-slate-200 font-semibold mb-2">Agent-specific links</div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {agents.map((a) => {
                const g = `${origin}/agent-guide?agent=${encodeURIComponent(a.name)}`
                const b = `${origin}/kanban?agent=${encodeURIComponent(a.name)}`
                return (
                  <div key={a.id} className="bg-slate-800/50 border border-slate-700 rounded p-3">
                    <div className="text-sm text-slate-100 font-medium mb-1">{a.name}</div>
                    <div className="text-[11px] text-slate-400 mb-1">Guide:</div>
                    <div className="text-xs text-blue-300 font-mono break-all mb-2">{g}</div>
                    <div className="text-[11px] text-slate-400 mb-1">Board:</div>
                    <div className="text-xs text-violet-300 font-mono break-all">{b}</div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
