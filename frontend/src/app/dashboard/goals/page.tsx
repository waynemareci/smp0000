'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@clerk/nextjs'
import { apiFetch } from '@/lib/api'

interface Goal {
  id: string
  title: string
  description: string | null
  status: string
  target_date: string | null
}

function StatusBadge({ status }: { status: string }) {
  const colour =
    status === 'researching'
      ? 'bg-amber-100 text-amber-800'
      : status === 'active'
      ? 'bg-green-100 text-green-800'
      : status === 'completed'
      ? 'bg-blue-100 text-blue-800'
      : status === 'paused'
      ? 'bg-yellow-100 text-yellow-800'
      : 'bg-gray-100 text-gray-700'

  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${colour}`}>
      {status}
    </span>
  )
}

export default function GoalsPage() {
  const { getToken } = useAuth()
  const router = useRouter()
  const [goals, setGoals] = useState<Goal[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const token = await getToken()
        if (cancelled) return
        const data = await apiFetch('/api/goals', token)
        if (cancelled) return
        setGoals(data)
      } catch (err) {
        if (cancelled) return
        setError(err instanceof Error ? err.message : 'Failed to load goals')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) {
    return <p className="text-gray-500">Loading goals...</p>
  }

  if (error) {
    return <p className="text-red-600">Error: {error}</p>
  }

  return (
    <div>
      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-lg font-semibold text-gray-900">Goals</h1>
        <button
          onClick={() => router.push('/dashboard/goals/new')}
          className="rounded-md bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-700 transition-colors"
        >
          + New goal
        </button>
      </div>

      {goals.length === 0 ? (
        /* Empty state */
        <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800">
            <svg
              className="h-5 w-5 text-gray-400"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
              viewBox="0 0 24 24"
            >
              <circle cx="12" cy="12" r="9" />
              <circle cx="12" cy="12" r="4" />
              <line x1="12" y1="3" x2="12" y2="1" />
            </svg>
          </div>
          <p className="text-base font-medium text-gray-900">No goals yet</p>
          <p className="max-w-xs text-sm text-gray-500">
            Start by stating your goal. The AI will generate a research agenda. Once you&apos;ve answered the questions, you&apos;ll define the roadmap.
          </p>
          <button
            onClick={() => router.push('/dashboard/goals/new')}
            className="mt-2 rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 transition-colors"
          >
            + Add your first goal
          </button>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left border-collapse">
            <thead>
              <tr className="border-b border-gray-200 text-gray-500 uppercase text-xs">
                <th className="py-3 pr-6 font-medium">Title</th>
                <th className="py-3 pr-6 font-medium">Status</th>
                <th className="py-3 pr-6 font-medium">Target date</th>
                <th className="py-3 font-medium sr-only">Navigate</th>
              </tr>
            </thead>
            <tbody>
              {goals.map((goal) => (
                <tr
                  key={goal.id}
                  onClick={() => router.push(`/dashboard/goals/${goal.id}`)}
                  className={`border-b border-gray-100 hover:bg-white transition-colors cursor-pointer${goal.status === 'researching' ? ' border-l-4 border-amber-400' : ''}`}
                >
                  <td className="py-3 pr-6">
                    <p className="font-medium text-gray-900">{goal.title}</p>
                    {goal.description && (
                      <p className="text-gray-500 mt-0.5 line-clamp-1">
                        {goal.description}
                      </p>
                    )}
                  </td>
                  <td className="py-3 pr-6">
                    <StatusBadge status={goal.status} />
                  </td>
                  <td className="py-3 pr-6 text-gray-600">
                    {goal.target_date
                      ? new Date(goal.target_date).toLocaleDateString()
                      : '—'}
                  </td>
                  <td className="py-3 text-gray-400">→</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}