import React, { useState } from 'react'
import { useWebSocket } from '../hooks/useWebSocket'
import { Nav } from '../components/Nav'
import { Header } from '../components/Header'
import { useAgentContext } from '../context/AgentContext'

function normalizeUrl(url) {
  return String(url || '').trim().replace(/\/+$/, '')
}

export default function Settings() {
  const { connected, state } = useWebSocket()
  const [now, setNow] = useState(new Date())
  const { customAgents, upsertAgent, removeAgent } = useAgentContext()

  const [form, setForm] = useState({ id: '', name: '', url: '' })
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState(null)

  React.useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  function handleSubmit(e) {
    e.preventDefault()
    if (!form.name.trim() || !form.url.trim()) return
    upsertAgent({ ...form, url: normalizeUrl(form.url) })
    setForm({ id: '', name: '', url: '' })
    setTestResult(null)
  }

  function handleEdit(agent) {
    setForm({ id: agent.id, name: agent.name, url: agent.url })
    setTestResult(null)
  }

  async function testConnection(rawUrl = form.url) {
    const base = normalizeUrl(rawUrl)
    if (!base) {
      setTestResult({ ok: false, message: 'Enter a gateway URL first.' })
      return
    }

    setTesting(true)
    setTestResult({ ok: null, message: 'Testing connection...' })

    try {
      const healthRes = await fetch(`${base}/health`)
      if (!healthRes.ok) {
        throw new Error(`/health returned ${healthRes.status}`)
      }

      const stateRes = await fetch(`${base}/state`)
      if (!stateRes.ok) {
        throw new Error(`/state returned ${stateRes.status}`)
      }

      const stateJson = await stateRes.json()
      const todoCount = Array.isArray(stateJson?.todos) ? stateJson.todos.length : 0
      const cronCount = Array.isArray(stateJson?.cron_jobs) ? stateJson.cron_jobs.length : 0

      setTestResult({
        ok: true,
        message: `Connected. /health and /state OK • ${todoCount} tasks, ${cronCount} crons`,
      })
    } catch (error) {
      setTestResult({
        ok: false,
        message: `Connection failed: ${error?.message || 'Unknown error'}`,
      })
    } finally {
      setTesting(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-950">
      <Header connected={connected} lastUpdate={state?.updated_at} now={now} />

      <main className="max-w-7xl mx-auto px-4 py-6">
        <div className="mb-6">
          <Nav />
        </div>

        <div className="mb-6">
          <h1 className="text-2xl font-bold text-white">Settings</h1>
          <p className="text-sm text-slate-500 mt-1">
            Add each agent and its Mission Control gateway URL. This powers cross-agent skills/cron/task views.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <section className="bg-slate-900/50 border border-slate-800 rounded-lg p-4">
            <h2 className="text-sm font-semibold text-slate-200 mb-3">Add or Update Agent</h2>
            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="text-xs text-slate-500 block mb-1">Agent Name</label>
                <input
                  value={form.name}
                  onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                  placeholder="e.g. coder, planner, qa"
                  className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-sm text-slate-100"
                />
              </div>
              <div>
                <label className="text-xs text-slate-500 block mb-1">Gateway URL</label>
                <input
                  value={form.url}
                  onChange={(e) => {
                    setForm((p) => ({ ...p, url: e.target.value }))
                    setTestResult(null)
                  }}
                  placeholder="http://10.0.0.20:5056"
                  className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-sm text-slate-100"
                />
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="submit"
                  className="px-3 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded text-sm font-medium"
                >
                  {form.id ? 'Update Agent' : 'Add Agent'}
                </button>

                <button
                  type="button"
                  onClick={() => testConnection()}
                  disabled={testing}
                  className="px-3 py-2 bg-slate-700 hover:bg-slate-600 disabled:bg-slate-800 disabled:text-slate-500 text-slate-200 rounded text-sm font-medium"
                >
                  {testing ? 'Testing...' : 'Test Connection'}
                </button>
              </div>

              {testResult && (
                <div
                  className={`text-xs rounded border px-2 py-1.5 ${
                    testResult.ok === true
                      ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/40'
                      : testResult.ok === false
                        ? 'bg-rose-500/10 text-rose-300 border-rose-500/40'
                        : 'bg-slate-800 text-slate-300 border-slate-700'
                  }`}
                >
                  {testResult.message}
                </div>
              )}
            </form>
          </section>

          <section className="bg-slate-900/50 border border-slate-800 rounded-lg p-4">
            <h2 className="text-sm font-semibold text-slate-200 mb-3">Configured Agents</h2>
            {customAgents.length === 0 ? (
              <p className="text-sm text-slate-600">No remote agents configured yet.</p>
            ) : (
              <div className="space-y-2">
                {customAgents.map((agent) => (
                  <div key={agent.id} className="bg-slate-800/50 rounded border border-slate-700 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-sm text-slate-100 font-medium">{agent.name}</div>
                        <div className="text-xs text-slate-500 font-mono">{agent.url}</div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleEdit(agent)}
                          className="px-2 py-1 text-xs bg-slate-700 hover:bg-slate-600 text-slate-200 rounded"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => removeAgent(agent.id)}
                          className="px-2 py-1 text-xs bg-rose-700/70 hover:bg-rose-600 text-rose-100 rounded"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  )
}
