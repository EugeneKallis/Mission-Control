import React from 'react'

export function LoadingOverlay({ show, label = 'Loading...' }) {
  if (!show) return null

  return (
    <div className="fixed inset-0 z-40 bg-slate-950/65 backdrop-blur-sm flex items-center justify-center">
      <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-slate-900 border border-slate-700 shadow-lg">
        <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        <span className="text-sm text-slate-200">{label}</span>
      </div>
    </div>
  )
}
