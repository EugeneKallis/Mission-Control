import React, { useState, useEffect } from 'react'
import { useWebSocket } from '../hooks/useWebSocket'
import { Nav } from '../components/Nav'
import { Header } from '../components/Header'

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
      {category.replace('_', ' ')}
    </span>
  )
}

export default function Skills() {
  const { connected, state, refresh } = useWebSocket()
  const [now, setNow] = useState(new Date())
  const [skills, setSkills] = useState([])
  const [loading, setLoading] = useState(true)
  const [expandedSkill, setExpandedSkill] = useState(null)
  const [skillContent, setSkillContent] = useState({})

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  // Fetch skills from API
  useEffect(() => {
    async function fetchSkills() {
      try {
        const res = await fetch(`http://${window.location.hostname}:5056/skills`)
        if (res.ok) {
          const data = await res.json()
          setSkills(data.skills || [])
        }
      } catch (e) {
        console.error('Failed to fetch skills:', e)
      } finally {
        setLoading(false)
      }
    }
    fetchSkills()
  }, [])

  // Fetch skill markdown content when expanded
  useEffect(() => {
    if (!expandedSkill) return
    if (skillContent[expandedSkill]) return // already loaded

    async function fetchContent() {
      try {
        const res = await fetch(`http://${window.location.hostname}:5056/skills/${encodeURIComponent(expandedSkill)}/content`)
        if (res.ok) {
          const data = await res.json()
          setSkillContent(prev => ({ ...prev, [expandedSkill]: data.content }))
        }
      } catch (e) {
        console.error('Failed to fetch skill content:', e)
      }
    }
    fetchContent()
  }, [expandedSkill])

  return (
    <div className="min-h-screen bg-slate-950">
      <Header connected={connected} lastUpdate={state?.updated_at} now={now} />

      <main className="max-w-7xl mx-auto px-4 py-6">
        <div className="mb-6">
          <Nav />
        </div>

        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-white">Skills</h1>
          <button onClick={refresh} className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-xs font-medium transition-colors">
            Refresh
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-48">
            <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : skills.length === 0 ? (
          <div className="bg-slate-900/50 rounded-lg border border-slate-800 p-12 text-center text-slate-600">
            No skills found
          </div>
        ) : (
          <div className="space-y-3">
            {skills.map(skill => (
              <div key={skill.name} className="bg-slate-900/50 rounded-lg border border-slate-800 overflow-hidden">
                <div
                  className="px-4 py-4 flex items-center justify-between cursor-pointer hover:bg-slate-800/30 transition-colors"
                  onClick={() => setExpandedSkill(expandedSkill === skill.name ? null : skill.name)}
                >
                  <div className="flex items-center gap-3">
                    <div>
                      <div className="text-white font-medium">{skill.name}</div>
                      <div className="text-slate-500 text-xs mt-0.5">{skill.description}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <CategoryBadge category={skill.category} />
                    <span className="text-slate-600">{expandedSkill === skill.name ? '▲' : '▼'}</span>
                  </div>
                </div>

                {expandedSkill === skill.name && (
                  <div className="px-4 pb-4 border-t border-slate-800/50">
                    <div className="pt-4">
                      <div className="text-slate-500 text-xs uppercase tracking-wider mb-2">Skill Content</div>
                      {skillContent[skill.name] ? (
                        <pre className="text-xs text-slate-300 bg-slate-800/50 rounded p-3 whitespace-pre-wrap max-h-96 overflow-y-auto font-mono">
                          {skillContent[skill.name]}
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
