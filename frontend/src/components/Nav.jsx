import React from 'react'
import { Link, useLocation } from 'react-router-dom'

const navClasses = (isActive) =>
  `px-4 py-2 rounded text-sm font-medium transition-colors ${
    isActive
      ? 'bg-blue-600 text-white'
      : 'text-slate-400 hover:text-white hover:bg-slate-800'
  }`

export function Nav() {
  const location = useLocation()

  return (
    <nav className="flex gap-2 bg-slate-800/50 p-2 rounded-lg">
      <Link to="/" className={navClasses(location.pathname === '/')}>
        Overview
      </Link>
      <Link to="/tasks" className={navClasses(location.pathname === '/tasks')}>
        Tasks
      </Link>
      <Link to="/kanban" className={navClasses(location.pathname === '/kanban')}>
        Kanban
      </Link>
      <Link to="/crons" className={navClasses(location.pathname === '/crons')}>
        Crons
      </Link>
      <Link to="/skills" className={navClasses(location.pathname === '/skills')}>
        Skills
      </Link>
      <Link to="/settings" className={navClasses(location.pathname === '/settings')}>
        Settings
      </Link>
      <Link to="/agent-guide" className={navClasses(location.pathname === '/agent-guide')}>
        Guide
      </Link>
    </nav>
  )
}
