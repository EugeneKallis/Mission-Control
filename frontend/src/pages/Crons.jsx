import React, { useState } from 'react'
import { useWebSocket } from '../hooks/useWebSocket'
import { Nav } from '../components/Nav'
import { Header } from '../components/Header'

const STATUS_COLORS = {
  ok: 'bg-emerald-500/20 text-emerald-400',
  error: 'bg-rose-500/20 text-rose-400',
  unknown: 'bg-slate-500/20 text-slate-400',
}

function StatusBadge({ status }) {
  const cls = STATUS_COLORS[status] || STATUS_COLORS.unknown
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium ${cls}`}>
      {status}
    </span>
  )
}

export default function Crons() {
  const { connected, state, refresh, gatewayBase } = useWebSocket()
  const [now, setNow] = useState(new Date())
  const [selectedCron, setSelectedCron] = useState(null)
  const [triggering, setTriggering] = useState(null)
  const [selectedSkill, setSelectedSkill] = useState(null)
  const [editingPrompt, setEditingPrompt] = useState(null)
  const [promptValue, setPromptValue] = useState('')
  const [savingPrompt, setSavingPrompt] = useState(false)

  React.useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  const handleSkillClick = (skill, e) => {
    e.stopPropagation()
    setSelectedSkill(selectedSkill === skill ? null : skill)
    setEditingPrompt(null)
  }

  const handleEditPrompt = (e) => {
    e.stopPropagation()
    setEditingPrompt(selected.id)
    setPromptValue(selected.prompt_preview || '')
  }

  const handleSavePrompt = async () => {
    setSavingPrompt(true)
    try {
      await fetch(`${gatewayBase}/cron/${selected.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt_preview: promptValue })
      })
      setSelectedCron({ ...selected, prompt_preview: promptValue })
      setEditingPrompt(null)
      refresh()
    } catch (e) {
      console.error('Failed to save prompt:', e)
    } finally {
      setSavingPrompt(false)
    }
  }

  const handleCancelEdit = () => {
    setEditingPrompt(null)
    setPromptValue('')
  }

  const cronJobs = state?.cron_jobs || []
  const activity = state?.recent_activity || []

  // Filter activity to cron runs for selected cron
  const cronActivity = selectedCron
    ? activity.filter(e => e.title && e.title.includes(selectedCron.name))
    : []

  const handleTrigger = async (jobId, jobName) => {
    setTriggering(jobId)
    try {
      await fetch(`${gatewayBase}/cron/${jobId}/run`, { method: 'POST' })
    } catch (e) {
      console.error('Failed to trigger cron:', e)
    } finally {
      setTriggering(null)
    }
  }

  const selected = cronJobs.find(j => j.id === selectedCron?.id) || selectedCron

  return (
    <div className="min-h-screen bg-slate-950">
      <Header connected={connected} lastUpdate={state?.updated_at} now={now} />

      <main className="max-w-7xl mx-auto px-4 py-6">
        <div className="mb-6">
          <Nav />
        </div>

        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-white">Cron Jobs</h1>
          <button onClick={refresh} className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-xs font-medium transition-colors">
            Refresh
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Cron list */}
          <div className="lg:col-span-2">
            <div className="bg-slate-900/50 rounded-lg border border-slate-800 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-800 text-left">
                    <th className="px-4 py-3 text-slate-500 font-medium text-xs uppercase tracking-wider">Name</th>
                    <th className="px-4 py-3 text-slate-500 font-medium text-xs uppercase tracking-wider">Schedule</th>
                    <th className="px-4 py-3 text-slate-500 font-medium text-xs uppercase tracking-wider">Last Run</th>
                    <th className="px-4 py-3 text-slate-500 font-medium text-xs uppercase tracking-wider">Next Run</th>
                    <th className="px-4 py-3 text-slate-500 font-medium text-xs uppercase tracking-wider">Status</th>
                    <th className="px-4 py-3 text-slate-500 font-medium text-xs uppercase tracking-wider">Enabled</th>
                  </tr>
                </thead>
                <tbody>
                  {cronJobs.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-12 text-center text-slate-600">
                        No cron jobs found
                      </td>
                    </tr>
                  )}
                  {cronJobs.map(job => (
                    <tr
                      key={job.id}
                      className={`border-b border-slate-800/50 hover:bg-slate-800/30 cursor-pointer transition-colors ${
                        selected?.id === job.id ? 'bg-slate-800/40' : ''
                      }`}
                      onClick={() => setSelectedCron(job.id === selected?.id ? null : job)}
                    >
                      <td className="px-4 py-3 text-slate-200 font-medium">{job.name}</td>
                      <td className="px-4 py-3 text-slate-400 text-xs font-mono">{job.schedule}</td>
                      <td className="px-4 py-3 text-slate-500 text-xs">
                        {job.last_run ? new Date(job.last_run).toLocaleString() : 'Never'}
                      </td>
                      <td className="px-4 py-3 text-slate-500 text-xs">
                        {job.next_run ? new Date(job.next_run).toLocaleString() : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={job.last_status} />
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs ${job.enabled ? 'text-emerald-400' : 'text-slate-600'}`}>
                          {job.enabled ? '●' : '○'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Detail panel */}
          <div className="lg:col-span-1">
            {selected ? (
              <div className="bg-slate-900/50 rounded-lg border border-slate-800 p-4">
                <div className="flex items-start justify-between mb-4">
                  <h2 className="text-lg font-bold text-white">{selected.name}</h2>
                  <button
                    onClick={() => setSelectedCron(null)}
                    className="text-slate-500 hover:text-slate-300"
                  >
                    ✕
                  </button>
                </div>

                <div className="space-y-3 text-sm">
                  <div>
                    <div className="text-slate-500 text-xs uppercase tracking-wider mb-1">Schedule</div>
                    <div className="text-slate-200 font-mono">{selected.schedule}</div>
                  </div>
                  <div>
                    <div className="text-slate-500 text-xs uppercase tracking-wider mb-1">Repeat</div>
                    <div className="text-slate-200">{selected.repeat || '—'}</div>
                  </div>
                  <div>
                    <div className="text-slate-500 text-xs uppercase tracking-wider mb-1">Delivery</div>
                    <div className="text-slate-200">{selected.deliver}</div>
                  </div>
                  <div>
                    <div className="text-slate-500 text-xs uppercase tracking-wider mb-1">Model</div>
                    <div className="text-slate-200">{selected.model || 'default'}</div>
                  </div>
                  <div>
                    <div className="text-slate-500 text-xs uppercase tracking-wider mb-1">Provider</div>
                    <div className="text-slate-200">{selected.provider || '—'}</div>
                  </div>
                  <div>
                    <div className="text-slate-500 text-xs uppercase tracking-wider mb-1">Base URL</div>
                    <div className="text-slate-200 text-xs break-all">{selected.base_url || '—'}</div>
                  </div>
                  <div>
                    <div className="text-slate-500 text-xs uppercase tracking-wider mb-1">Skills</div>
                    <div className="text-slate-200">
                      {selected.skills && selected.skills.length > 0
                        ? selected.skills.map(s => (
                          <button
                            key={s}
                            onClick={(e) => handleSkillClick(s, e)}
                            className={`inline-block rounded px-1.5 py-0.5 text-xs mr-1 mb-1 transition-colors ${
                              selectedSkill === s
                                ? 'bg-blue-600 text-white'
                                : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                            }`}
                          >
                            {s}
                          </button>
                        ))
                        : '—'
                      }
                    </div>
                  </div>

                  {/* Expanded skill view */}
                  {selectedSkill && (
                    <div className="mt-2 p-3 bg-slate-800/50 rounded border border-slate-700">
                      <div className="flex items-center justify-between mb-2">
                        <div className="text-blue-400 text-xs font-medium">Skill: {selectedSkill}</div>
                        <button
                          onClick={() => setSelectedSkill(null)}
                          className="text-slate-500 hover:text-slate-300 text-xs"
                        >
                          ✕
                        </button>
                      </div>
                      <div className="text-slate-400 text-xs mb-2">
                        This cron uses the <span className="text-blue-400">{selectedSkill}</span> skill.
                        The full prompt is shown below.
                      </div>
                    </div>
                  )}

                  {/* Prompt section */}
                  <div>
                    <div className="flex items-center justify-between">
                      <div className="text-slate-500 text-xs uppercase tracking-wider mb-1">Prompt</div>
                      {editingPrompt !== selected.id && (
                        <button
                          onClick={handleEditPrompt}
                          className="text-blue-400 hover:text-blue-300 text-xs mb-1"
                        >
                          Edit
                        </button>
                      )}
                    </div>
                    {editingPrompt === selected.id ? (
                      <div className="mt-1">
                        <textarea
                          value={promptValue}
                          onChange={(e) => setPromptValue(e.target.value)}
                          className="w-full h-64 bg-slate-800 text-slate-300 text-xs rounded p-2 font-mono resize-none focus:outline-none focus:ring-1 focus:ring-blue-500"
                          placeholder="Enter prompt..."
                        />
                        <div className="flex gap-2 mt-2">
                          <button
                            onClick={handleSavePrompt}
                            disabled={savingPrompt}
                            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 text-white rounded text-xs font-medium"
                          >
                            {savingPrompt ? 'Saving...' : 'Save'}
                          </button>
                          <button
                            onClick={handleCancelEdit}
                            className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded text-xs font-medium"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="text-slate-300 text-xs bg-slate-800/50 rounded p-2 mt-1 whitespace-pre-wrap max-h-48 overflow-y-auto font-mono">
                        {selected.prompt_preview || 'No prompt preview available'}
                      </div>
                    )}
                  </div>
                  <div>
                    <div className="text-slate-500 text-xs uppercase tracking-wider mb-1">State</div>
                    <div className="text-slate-200">{selected.state}</div>
                  </div>
                  <div>
                    <div className="text-slate-500 text-xs uppercase tracking-wider mb-1">Last Run</div>
                    <div className="text-slate-300">
                      {selected.last_run ? new Date(selected.last_run).toLocaleString() : 'Never'}
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-500 text-xs uppercase tracking-wider mb-1">Last Status</div>
                    <StatusBadge status={selected.last_status} />
                  </div>
                  <div>
                    <div className="text-slate-500 text-xs uppercase tracking-wider mb-1">Next Run</div>
                    <div className="text-slate-300">
                      {selected.next_run ? new Date(selected.next_run).toLocaleString() : '—'}
                    </div>
                  </div>
                  {selected.paused_at && (
                    <div>
                      <div className="text-slate-500 text-xs uppercase tracking-wider mb-1">Paused At</div>
                      <div className="text-slate-300">{new Date(selected.paused_at).toLocaleString()}</div>
                    </div>
                  )}
                  {selected.paused_reason && (
                    <div>
                      <div className="text-slate-500 text-xs uppercase tracking-wider mb-1">Paused Reason</div>
                      <div className="text-slate-300">{selected.paused_reason}</div>
                    </div>
                  )}
                  <div>
                    <div className="text-slate-500 text-xs uppercase tracking-wider mb-1">Enabled</div>
                    <div className={`text-sm ${selected.enabled ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {selected.enabled ? '● Yes' : '○ No'}
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => handleTrigger(selected.id, selected.name)}
                  disabled={triggering === selected.id}
                  className="mt-4 w-full px-3 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded text-sm font-medium transition-colors"
                >
                  {triggering === selected.id ? 'Triggering...' : 'Run Now'}
                </button>

                {/* Recent runs from activity log */}
                {cronActivity.length > 0 && (
                  <div className="mt-6">
                    <div className="text-slate-500 text-xs uppercase tracking-wider mb-2">Recent Runs</div>
                    <div className="space-y-2">
                      {cronActivity.slice(0, 10).map(event => (
                        <div key={event.id} className="text-xs p-2 bg-slate-800/30 rounded">
                          <div className="text-slate-300">{new Date(event.timestamp).toLocaleString()}</div>
                          <div className={`text-xs ${event.status === 'ok' ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {event.detail || event.status}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="bg-slate-900/50 rounded-lg border border-slate-800 p-8 text-center text-slate-600 text-sm">
                Click a cron job to see details
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
