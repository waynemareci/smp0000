'use client'

import { useState } from 'react'
import { useAuth } from '@clerk/nextjs'
import { apiFetch } from '@/lib/api'

export interface SavedDecision {
  id: string
  title: string
  decision_made: string
  created_at: string
}

interface Props {
  goalId: string
  onClose: () => void
  onSaved: (decision: SavedDecision) => void
}

export default function LogDecisionModal({ goalId, onClose, onSaved }: Props) {
  const { getToken } = useAuth()

  const [title, setTitle] = useState('')
  const [why, setWhy] = useState('')
  const [alternatives, setAlternatives] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const canSave = title.trim().length > 0 && why.trim().length > 0

  async function handleSave() {
    if (!canSave) return
    setSaving(true)
    setSaveError(null)

    try {
      const token = await getToken()
      const decision: SavedDecision = await apiFetch(`/api/goals/${goalId}/decisions`, token, {
        method: 'POST',
        body: JSON.stringify({
          title: title.trim(),
          decision_made: why.trim(),
          options_considered: alternatives.trim(),
          context: '',
        }),
      })
      onSaved(decision)
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save decision')
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-md rounded-lg border border-gray-200 bg-white shadow-lg p-6 flex flex-col gap-4">

        <h2 className="text-base font-semibold text-gray-900">Log a decision</h2>

        {/* What was decided */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            What was decided? <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Use PostgreSQL over MySQL"
            autoFocus
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Why */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Why? <span className="text-red-500">*</span>
          </label>
          <textarea
            value={why}
            onChange={(e) => setWhy(e.target.value)}
            placeholder="Rationale, constraints, or key insight that drove this decision"
            rows={3}
            style={{ minHeight: 72 }}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
          />
        </div>

        {/* Alternatives */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Alternatives considered <span className="text-gray-400 font-normal">(optional)</span>
          </label>
          <input
            type="text"
            value={alternatives}
            onChange={(e) => setAlternatives(e.target.value)}
            placeholder="e.g. MySQL, SQLite"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Immutability notice */}
        <p className="text-xs text-gray-400">
          &#x24D8; Decisions are permanent and cannot be edited or deleted.
        </p>

        {/* Error */}
        {saveError && (
          <p className="text-sm text-red-600">{saveError}</p>
        )}

        {/* Actions */}
        <div className="flex gap-3 justify-end">
          <button
            onClick={onClose}
            disabled={saving}
            className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !canSave}
            className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {saving ? 'Saving...' : 'Save decision \u2192'}
          </button>
        </div>

      </div>
    </div>
  )
}