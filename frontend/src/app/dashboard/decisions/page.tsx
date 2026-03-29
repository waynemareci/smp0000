'use client'

import { useEffect, useState } from 'react'
import { useAuth } from '@clerk/nextjs'
import { apiFetch } from '@/lib/api'

interface Goal {
  id: string
  title: string
}

interface Decision {
  id: string
  goal_id: string
  title: string
  decision_made: string
  created_at: string
}

interface DecisionRow extends Decision {
  goalTitle: string
}

export default function DecisionsPage() {
  const { getToken } = useAuth()
  const [rows, setRows] = useState<DecisionRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const token = await getToken()
        if (cancelled) return

        const goals: Goal[] = await apiFetch('/api/goals', token)
        if (cancelled) return

        const perGoal = await Promise.all(
          goals.map(async (g) => {
            const decisions: Decision[] = await apiFetch(
              `/api/goals/${g.id}/decisions`,
              token
            )
            return decisions.map((d) => ({ ...d, goalTitle: g.title }))
          })
        )
        if (cancelled) return

        const all = perGoal
          .flat()
          .sort(
            (a, b) =>
              new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
          )
        setRows(all)
      } catch (err) {
        if (cancelled) return
        setError(err instanceof Error ? err.message : 'Failed to load decisions')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return <p className="text-gray-500">Loading decisions...</p>
  if (error) return <p className="text-red-600">Error: {error}</p>

  return (
    <div>
      <h1 className="text-lg font-semibold text-gray-900 mb-6">Decisions</h1>

      {rows.length === 0 ? (
        <p className="text-sm text-gray-400">No decisions logged yet.</p>
      ) : (
        <div className="flex flex-col gap-4">
          {rows.map((d) => (
            <div
              key={d.id}
              className="rounded-lg border border-gray-200 bg-white p-4 flex flex-col gap-1"
            >
              <div className="flex items-start justify-between gap-4">
                <p className="text-xs text-gray-400">{d.title}</p>
                <p className="text-xs text-gray-400 shrink-0">
                  {new Date(d.created_at).toLocaleDateString()}
                </p>
              </div>
              <p className="text-sm text-gray-800">{d.decision_made}</p>
              <p className="text-xs text-gray-400 mt-1">Goal: {d.goalTitle}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}