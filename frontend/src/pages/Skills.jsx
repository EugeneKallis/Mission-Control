import React, { useState, useEffect } from 'react'
import { useAgentContext } from '../context/AgentContext'
import { useWebSocket } from '../hooks/useWebSocket'
import { getApiBase } from '../lib/apiBase'
import { Nav } from '../components/Nav'
import { Header } from '../components/Header'
import { AgentScopePicker } from '../components/AgentScopePicker'
import { LoadingOverlay } from '../components/LoadingOverlay'

const API_BASE = getApiBase()

const CATEGORY_COLORS = {
  job_search: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  research: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  communication: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  default: 'bg-slate-500/20 text-slate-400 border-slate-500/30',
}

function CategoryBadge({ category }) {
  const cls = CATEGORY_COLORS[category] || CATEGORY_COLORS.default
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium border ${cls}`}>
      {(category || 'default').replace('_', ' ')}
    </span>
  )
}

export default function Skills() {
  const { agents, selectedScopeId: agentScope, setSelectedScopeId: setAgentScope } = useAgentContext()
  const { connected, connection, loading, state, refresh } = useWebSocket({ agentScope })

  const [now, setNow] = useState(new Date())
  const [skills, setSkills] = useState([])
  const [skillsLoading, setSkillsLoading] = useState(false)
  const [expandedSkill, setExpandedSkill] = useState(null)
  const [skillContent, setSkillContent] = useState({})
  const [reloadTick, setReloadTick] = useState(0)
  const [loadNotes, setLoadNotes] = useState([])

  const scopedAgents = agentScope === 'all' ? agents : agents.filter((a) => a.id === agentScope)
  const subtitle = agentScope === 'all'
    ? 'Scope: All agents'
    : `Scope: ${agents.find((a) => a.id === agentScope)?.name || agentScope}`

  const fallbackSkills = React.useMemo(() => {
    const jobs = Array.isArray(state?.cron_jobs) ? state.cron_jobs : []
    const scopedIds = new Set(scopedAgents.map((agent) => agent.id))
    const seen = new Set()

    return jobs.flatMap((job) => {
      if (!job?._agent_id || !scopedIds.has(job._agent_id)) return []

      return (Array.isArray(job.skills) ? job.skills : [])
        .filter(Boolean)
        .filter((name) => {
          const key = `${job._agent_id}:${name}`
          if (seen.has(key)) return false
          seen.add(key)
          return true
        })
        .map((name) => ({
          name,
          description: `Referenced by cron job ${job.name}`,
          category: 'cron reference',
          _agent_id: job._agent_id,
          _agent_name: job._agent_name,
          _key: `${job._agent_id}:${name}`,
          _fallback: true,
        }))
    })
  }, [state?.cron_jobs, scopedAgents])

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    setExpandedSkill(null)
    setSkillContent({})

    async function fetchSkills() {
      if (scopedAgents.length === 0) {
        setSkills([])
        setLoadNotes([])
        return
      }

      setSkillsLoading(true)
      try {
        const results = await Promise.allSettled(
          scopedAgents.map(async (agent) => {
            const res = await fetch(`${API_BASE}/remote/skills?target=${encodeURIComponent(agent.url)}`, { cache: 'no-store' })
            if (!res.ok) throw new Error(`skills ${res.status}`)
            const data = await res.json()
            const list = Array.isArray(data?.skills) ? data.skills : []
            return {
              agent,
              message: data?.message || null,
              skills: list.map((skill) => ({
                ...skill,
                _agent_id: agent.id,
                _agent_name: agent.name,
                _key: `${agent.id}:${skill.name}`,
              })),
            }
          })
        )

        const merged = results
          .filter((r) => r.status === 'fulfilled')
          .flatMap((r) => r.value.skills)

        const notes = results
          .filter((r) => r.status === 'fulfilled')
          .map((r) => r.value)
          .filter((entry) => entry.message)
          .map((entry) => `${entry.agent.name}: ${entry.message}`)

        setSkills(merged)
        setLoadNotes(notes)

        const failed = results.filter((r) => r.status === 'rejected')
        if (failed.length > 0) {
          console.error('Some skill fetches failed:', failed.map((f) => f.reason?.message || String(f.reason)))
        }
      } catch (e) {
        console.error('Failed to fetch skills:', e)
        setSkills([])
        setLoadNotes([])
      } finally {
        setSkillsLoading(false)
      }
    }

    fetchSkills()
  }, [agentScope, scopedAgents, reloadTick])

  useEffect(() => {
    if (!expandedSkill || expandedSkill._fallback) return
    if (skillContent[expandedSkill._key]) return

    async function fetchContent() {
      try {
        const agent = agents.find((a) => a.id === expandedSkill._agent_id)
        if (!agent?.url) return
        const res = await fetch(
          `${API_BASE}/remote/skills/content?target=${encodeURIComponent(agent.url)}&name=${encodeURIComponent(expandedSkill.name)}`,
          { cache: 'no-store' }
        )
        if (res.ok) {
          const data = await res.json()
          setSkillContent((prev) => ({ ...prev, [expandedSkill._key]: data.content || '' }))
        }
      } catch (e) {
        console.error('Failed to fetch skill content:', e)
      }
    }
    fetchContent()
  }, [expandedSkill, skillContent, agents])

  return (
    <div className="min-h-screen bg-slate-950 relative">
      <Header connected={connected} connection={connection} lastUpdate={state?.updated_at} now={now} subtitle={subtitle} />
      <LoadingOverlay show={loading || skillsLoading} label="Loading skills..." />

      <main className="max-w-7xl mx-auto px-4 py-6">
        <div className="mb-6">
          <Nav rightContent={<AgentScopePicker agents={agents} value={agentScope} onChange={setAgentScope} />} />
        </div>

        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-white">Skills</h1>
          <button onClick={() => { refresh(); setReloadTick((n) => n + 1) }} className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-xs font-medium transition-colors">
            Refresh
          </button>
        </div>

        {loadNotes.length > 0 && (
          <div className="mb-4 rounded border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200 space-y-1">
            {loadNotes.map((note) => (
              <div key={note}>{note}</div>
            ))}
            {fallbackSkills.length > 0 && (
              <div className="text-amber-300/80">Showing cron-referenced skills as a fallback.</div>
            )}
          </div>
        )}

        {!skillsLoading && skills.length === 0 && fallbackSkills.length === 0 ? (
          <div className="bg-slate-900/50 rounded-lg border border-slate-800 p-12 text-center text-slate-600">
            No skills found for current scope
          </div>
        ) : (
          <div className="space-y-3">
            {[...skills, ...fallbackSkills.filter((fallback) => !skills.some((skill) => skill._key === fallback._key))].map((skill) => (
              <div key={skill._key} className="bg-slate-900/50 rounded-lg border border-slate-800 overflow-hidden">
                <div
                  className="px-4 py-4 flex items-center justify-between cursor-pointer hover:bg-slate-800/30 transition-colors"
                  onClick={() => setExpandedSkill(expandedSkill?._key === skill._key ? null : skill)}
                >
                  <div className="flex items-center gap-3">
                    <div>
                      <div className="text-white font-medium">{skill.name}</div>
                      <div className="text-slate-500 text-xs mt-0.5">{skill.description}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-[10px] uppercase tracking-wide text-violet-300 bg-violet-500/20 border border-violet-500/30 rounded px-2 py-0.5">
                      {skill._agent_name}
                    </span>
                    <CategoryBadge category={skill.category} />
                    {skill._fallback && (
                      <span className="text-[10px] uppercase tracking-wide text-amber-300 bg-amber-500/20 border border-amber-500/30 rounded px-2 py-0.5">
                        Fallback
                      </span>
                    )}
                    <span className="text-slate-600">{expandedSkill?._key === skill._key ? '▲' : '▼'}</span>
                  </div>
                </div>

                {expandedSkill?._key === skill._key && (
                  <div className="px-4 pb-4 border-t border-slate-800/50">
                    <div className="pt-4">
                      <div className="text-slate-500 text-xs uppercase tracking-wider mb-2">Skill Content</div>
                      {skill._fallback ? (
                        <div className="text-xs text-amber-200 bg-amber-500/10 border border-amber-500/30 rounded p-3">
                          This gateway did not expose an installed-skills endpoint, so Mission Control only knows this skill is referenced by one of the cron jobs. Full skill content is unavailable from the current agent API.
                        </div>
                      ) : skillContent[skill._key] ? (
                        <pre className="text-xs text-slate-300 bg-slate-800/50 rounded p-3 whitespace-pre-wrap max-h-96 overflow-y-auto font-mono">
                          {skillContent[skill._key]}
                        </pre>
                      ) : (
                        <div className="flex items-center justify-center h-16">
                          <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
