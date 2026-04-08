import React, { useMemo, useState } from 'react'
import { Nav } from '../components/Nav'
import { Header } from '../components/Header'
import { useAgentContext } from '../context/AgentContext'
import { useWebSocket } from '../hooks/useWebSocket'
import { getApiBase } from '../lib/apiBase'

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function buildScheduleLabel(value, unit) {
  const count = Math.max(1, Number(value) || 1)
  if (unit === 'hours') return `every ${count}h`
  return `every ${count}m`
}

function copy(text, setCopiedKey, key) {
  navigator.clipboard.writeText(text).then(() => {
    setCopiedKey(key)
    window.setTimeout(() => setCopiedKey(''), 1800)
  }).catch(() => {
    setCopiedKey('')
  })
}

export default function AgentGuide() {
  const { connected, connection, state } = useWebSocket()
  const { agents, selectedAgentId } = useAgentContext()
  const [now, setNow] = useState(new Date())
  const [targetAgentId, setTargetAgentId] = useState('')
  const [frequencyValue, setFrequencyValue] = useState(15)
  const [frequencyUnit, setFrequencyUnit] = useState('minutes')
  const [maxTasksPerRun, setMaxTasksPerRun] = useState(1)
  const [noTaskBehavior, setNoTaskBehavior] = useState('silent')
  const [copiedKey, setCopiedKey] = useState('')

  React.useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  React.useEffect(() => {
    if (!targetAgentId && agents.length > 0) {
      setTargetAgentId(selectedAgentId || agents[0].id)
    }
  }, [agents, selectedAgentId, targetAgentId])

  const apiBase = getApiBase()
  const origin = window.location.origin
  const targetAgent = agents.find((agent) => agent.id === targetAgentId) || agents[0] || null
  const scheduleLabel = buildScheduleLabel(frequencyValue, frequencyUnit)
  const boardUrl = `${origin}/kanban`
  const stateUrl = `${apiBase}/state`
  const updateTodoUrl = `${apiBase}/todos/{todo_id}`
  const createJobUrl = targetAgent?.url ? `${targetAgent.url}/api/jobs` : ''
  const jobName = targetAgent ? `mission-control-board-worker-${slugify(targetAgent.name)}` : 'mission-control-board-worker'

  const workerPrompt = useMemo(() => {
    if (!targetAgent) return ''

    return `You are the autonomous Mission Control Kanban worker for agent "${targetAgent.name}".

Mission Control URLs
- UI: ${boardUrl}
- Read board state: GET ${stateUrl}
- Update a task: PATCH ${updateTodoUrl}

Your assignment rules
- ONLY work tasks whose assigned_agent exactly equals "${targetAgent.name}".
- Ignore tasks assigned to any other agent.
- Ignore tasks already in completed or cancelled status.
- Valid statuses you should use are: pending, in_progress, completed.

Run loop for every execution
1. GET ${stateUrl}
2. Read the todos array.
3. Filter to tasks assigned to "${targetAgent.name}".
4. If there is already an in_progress task assigned to you, resume that first.
5. Otherwise pick the oldest pending task assigned to you.
6. Before starting work, immediately PATCH ${updateTodoUrl} with:
   {"status":"in_progress"}
7. Do the actual task work.
8. If you make meaningful progress and the task notes should be updated, PATCH the todo again with:
   {"content":"<keep the existing content and append a short progress note>"}
9. When the task is done, PATCH the todo with:
   {"status":"completed","content":"<keep the existing content and append a concise completion note>"}
10. If you are blocked or cannot complete the task safely, PATCH the todo with:
   {"status":"pending","content":"<keep the existing content and append a concise blocker note with what is needed>"}
11. Re-fetch ${stateUrl} and continue until you have processed ${Math.max(1, Number(maxTasksPerRun) || 1)} task(s) this run or there is no more work assigned to you.

Behavior expectations
- Work one task at a time.
- Never steal work from another agent.
- Keep notes concise and useful.
- Do not wipe existing task content when adding notes; preserve it and append to it.
- If Eugene manually tells you "check the board", treat that as an immediate out-of-band trigger to run this board-check workflow right away instead of waiting for the next scheduled cron tick.
- If no tasks are assigned to you, ${noTaskBehavior === 'silent' ? 'exit silently with no message.' : 'send a short summary saying no tasks are currently assigned to you.'}
- Never recursively create another cron job from inside the recurring worker run.
`
  }, [targetAgent, boardUrl, stateUrl, updateTodoUrl, maxTasksPerRun, noTaskBehavior])

  const bootstrapPrompt = useMemo(() => {
    if (!targetAgent) return ''

    return `You are Hermes agent "${targetAgent.name}".

Set yourself up as the autonomous Kanban worker for tasks assigned to you in Mission Control.

Target agent details
- Agent name: ${targetAgent.name}
- Agent gateway: ${targetAgent.url}
- Mission Control board UI: ${boardUrl}
- Mission Control state endpoint: ${stateUrl}
- Mission Control task update endpoint: ${updateTodoUrl}

What you must do now
1. Create or update a recurring cron job on your own gateway.
2. Use this exact job configuration:
   - name: ${jobName}
   - schedule: ${scheduleLabel}
   - deliver: origin
3. Use the worker prompt below as the cron prompt.
4. If a cron job with that name already exists, update it instead of creating a duplicate.
5. After creating or updating it, briefly confirm the schedule you set.

Worker prompt to install
---
${workerPrompt}
---

Implementation note
- The cron creation endpoint on your gateway is ${createJobUrl || '<agent gateway unavailable>'}
- Use the Mission Control HTTP endpoints above for reading and updating board tasks.
- Do not work tasks for any agent except "${targetAgent.name}".
`
  }, [targetAgent, boardUrl, stateUrl, updateTodoUrl, jobName, scheduleLabel, workerPrompt, createJobUrl])

  const exampleCreatePayload = useMemo(() => {
    if (!targetAgent) return ''

    return JSON.stringify({
      name: jobName,
      schedule: scheduleLabel,
      deliver: 'origin',
      prompt: workerPrompt,
    }, null, 2)
  }, [jobName, scheduleLabel, workerPrompt, targetAgent])

  return (
    <div className="min-h-screen bg-slate-950">
      <Header connected={connected} connection={connection} lastUpdate={state?.updated_at} now={now} subtitle="Prompt generator for autonomous Kanban agents" />

      <main className="max-w-6xl mx-auto px-4 py-6">
        <div className="mb-6">
          <Nav />
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-[360px,1fr] gap-6">
          <aside className="bg-slate-900/50 border border-slate-800 rounded-lg p-4 space-y-4 h-fit">
            <div>
              <h1 className="text-2xl font-bold text-white">Agent Prompt Builder</h1>
              <p className="text-sm text-slate-400 mt-1">
                Generate the one prompt you hand to an agent so it can schedule itself, poll the Kanban board, and only work its assigned tasks.
              </p>
            </div>

            <div>
              <label className="text-xs text-slate-500 block mb-1">Target agent</label>
              <select
                value={targetAgentId}
                onChange={(e) => setTargetAgentId(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-sm text-slate-100"
              >
                {agents.map((agent) => (
                  <option key={agent.id} value={agent.id}>{agent.name}</option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-[1fr,120px] gap-2">
              <div>
                <label className="text-xs text-slate-500 block mb-1">Check frequency</label>
                <input
                  type="number"
                  min="1"
                  value={frequencyValue}
                  onChange={(e) => setFrequencyValue(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-sm text-slate-100"
                />
              </div>
              <div>
                <label className="text-xs text-slate-500 block mb-1">Unit</label>
                <select
                  value={frequencyUnit}
                  onChange={(e) => setFrequencyUnit(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-sm text-slate-100"
                >
                  <option value="minutes">minutes</option>
                  <option value="hours">hours</option>
                </select>
              </div>
            </div>

            <div>
              <label className="text-xs text-slate-500 block mb-1">Max tasks per run</label>
              <input
                type="number"
                min="1"
                value={maxTasksPerRun}
                onChange={(e) => setMaxTasksPerRun(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-sm text-slate-100"
              />
            </div>

            <div>
              <label className="text-xs text-slate-500 block mb-1">No-task behavior</label>
              <select
                value={noTaskBehavior}
                onChange={(e) => setNoTaskBehavior(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-sm text-slate-100"
              >
                <option value="silent">Exit silently</option>
                <option value="summary">Send a short summary</option>
              </select>
            </div>

            <div className="rounded border border-slate-700 bg-slate-800/40 p-3 text-xs text-slate-300 space-y-2">
              <div><span className="text-slate-500">Schedule:</span> <span className="font-mono text-blue-300">{scheduleLabel}</span></div>
              <div><span className="text-slate-500">Job name:</span> <span className="font-mono text-violet-300">{jobName}</span></div>
              <div><span className="text-slate-500">Board state:</span> <span className="font-mono break-all">{stateUrl}</span></div>
              <div><span className="text-slate-500">Task updates:</span> <span className="font-mono break-all">{updateTodoUrl}</span></div>
              {targetAgent && (
                <div><span className="text-slate-500">Agent gateway:</span> <span className="font-mono break-all">{targetAgent.url}</span></div>
              )}
            </div>
          </aside>

          <section className="space-y-6">
            <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-4">
              <div className="flex items-center justify-between gap-3 mb-3">
                <div>
                  <h2 className="text-lg font-semibold text-white">Bootstrap prompt</h2>
                  <p className="text-xs text-slate-500 mt-1">
                    This is the one you hand to the agent. It tells the agent to create or update its own recurring Kanban worker cron job.
                  </p>
                </div>
                <button
                  onClick={() => copy(bootstrapPrompt, setCopiedKey, 'bootstrap')}
                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded text-xs font-medium"
                >
                  {copiedKey === 'bootstrap' ? 'Copied' : 'Copy prompt'}
                </button>
              </div>
              <pre className="text-xs text-slate-300 bg-slate-950/80 rounded p-4 whitespace-pre-wrap overflow-x-auto max-h-[540px]">{bootstrapPrompt || 'Add an agent in Settings first.'}</pre>
            </div>

            <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-4">
              <div className="flex items-center justify-between gap-3 mb-3">
                <div>
                  <h2 className="text-lg font-semibold text-white">Recurring worker prompt</h2>
                  <p className="text-xs text-slate-500 mt-1">
                    This is the prompt that should live inside the recurring cron job once the bootstrap step is done.
                  </p>
                </div>
                <button
                  onClick={() => copy(workerPrompt, setCopiedKey, 'worker')}
                  className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-100 rounded text-xs font-medium"
                >
                  {copiedKey === 'worker' ? 'Copied' : 'Copy worker prompt'}
                </button>
              </div>
              <pre className="text-xs text-slate-300 bg-slate-950/80 rounded p-4 whitespace-pre-wrap overflow-x-auto max-h-[420px]">{workerPrompt || 'No target agent selected.'}</pre>
            </div>

            <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-4">
              <div className="flex items-center justify-between gap-3 mb-3">
                <div>
                  <h2 className="text-lg font-semibold text-white">Example cron payload</h2>
                  <p className="text-xs text-slate-500 mt-1">
                    Handy if you want to inspect or manually reproduce the job creation request against the agent gateway.
                  </p>
                </div>
                <button
                  onClick={() => copy(exampleCreatePayload, setCopiedKey, 'payload')}
                  className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-100 rounded text-xs font-medium"
                >
                  {copiedKey === 'payload' ? 'Copied' : 'Copy payload'}
                </button>
              </div>
              <pre className="text-xs text-slate-300 bg-slate-950/80 rounded p-4 whitespace-pre-wrap overflow-x-auto">{exampleCreatePayload || '{}'}</pre>
            </div>
          </section>
        </div>
      </main>
    </div>
  )
}
