'use client'

import { useEffect, useState } from 'react'
import { useAuth } from '@clerk/nextjs'
import { apiFetch } from '@/lib/api'

interface Goal {
  id: string
  title: string
}

interface AILogEntry {
  id: string
  goal_id: string | null
  prompt: string
  response: string | null
  model: string | null
  tokens_used: number | null
  created_at: string
}

interface AILogRow extends AILogEntry {
  goalTitle: string | null
}

export default function AILogPage() {
  const { getToken } = useAuth()
  const [rows, setRows] = useState<AILogRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const token = await getToken()
        if (cancelled) return

        const [entries, goals]: [AILogEntry[], Goal[]] = await Promise.all([
          apiFetch('/api/ai-log', token),
          apiFetch('/api/goals', token),
        ])
        if (cancelled) return

        const goalMap: Record<string, string> = {}
        goals.forEach((g) => { goalMap[g.id] = g.title })

        setRows(
          entries.map((e) => ({
            ...e,
            goalTitle: e.goal_id ? (goalMap[e.goal_id] ?? null) : null,
          }))
        )
      } catch (err) {
        if (cancelled) return
        setError(err instanceof Error ? err.message : 'Failed to load AI log')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function toggleExpanded(id: string) {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  if (loading) return <p className="text-gray-500">Loading AI log...</p>
  if (error) return <p className="text-red-600">Error: {error}</p>

  return (
    <div>
      <h1 className="text-lg font-semibold text-gray-900 mb-6">AI log</h1>

      {rows.length === 0 ? (
        <p className="text-sm text-gray-400">No AI interactions logged yet.</p>
      ) : (
        <div className="flex flex-col gap-4">
          {rows.map((entry) => (
            <div
              key={entry.id}
              className="rounded-lg border border-gray-200 bg-white p-4 flex flex-col gap-2"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex flex-col gap-0.5">
                  {entry.goalTitle && (
                    <p className="text-xs text-gray-400">Goal: {entry.goalTitle}</p>
                  )}
                  {entry.model && (
                    <p className="text-xs text-gray-400">Model: {entry.model}</p>
                  )}
                  {entry.tokens_used != null && (
                    <p className="text-xs text-gray-400">Tokens: {entry.tokens_used.toLocaleString()}</p>
                  )}
                </div>
                <p className="text-xs text-gray-400 shrink-0">
                  {new Date(entry.created_at).toLocaleString()}
                </p>
              </div>

              <button
                onClick={() => toggleExpanded(entry.id)}
                className="self-start text-xs text-blue-600 hover:text-blue-800 transition-colors"
              >
                {expanded[entry.id] ? 'Hide' : 'Show'} prompt &amp; response
              </button>

              {expanded[entry.id] && (
                <div className="flex flex-col gap-3 mt-1">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-gray-400 mb-1">Prompt</p>
                    <pre className="text-xs text-gray-700 bg-gray-50 rounded p-3 whitespace-pre-wrap break-words">
                      {entry.prompt}
                    </pre>
                  </div>
                  {entry.response && (
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-gray-400 mb-1">Response</p>
                      <pre className="text-xs text-gray-700 bg-gray-50 rounded p-3 whitespace-pre-wrap break-words">
                        {entry.response}
                      </pre>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}