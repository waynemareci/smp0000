'use client'

import { useState } from 'react'
import { useAuth } from '@clerk/nextjs'
import { apiFetch } from '@/lib/api'

export interface Question {
  id: string
  goal_id: string
  question: string
  answer: string | null
  is_resolved: boolean
  question_order: number
  created_at: string
  updated_at: string
}

export interface AnswerDecision {
  id: string
  title: string
  decision_made: string
  created_at: string
}

interface Props {
  goalId: string
  questionId: string
  questionText: string
  onClose: () => void
  onSaved: (updated: Question, decision: AnswerDecision | null) => void
}

export default function LogAnswerModal({ goalId, questionId, questionText, onClose, onSaved }: Props) {
  const { getToken } = useAuth()

  const [answer, setAnswer] = useState('')
  const [logAsDecision, setLogAsDecision] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  async function handleSave() {
    if (!answer.trim()) return
    setSaving(true)
    setSaveError(null)

    try {
      const token = await getToken()

      // 1. Resolve the question with the answer
      const updated: Question = await apiFetch(
        `/api/goals/${goalId}/questions/${questionId}`,
        token,
        {
          method: 'PATCH',
          body: JSON.stringify({ answer: answer.trim(), is_resolved: true }),
        }
      )

      // 2. Optionally log as a decision
      let decision: AnswerDecision | null = null
      if (logAsDecision) {
        decision = await apiFetch(`/api/goals/${goalId}/decisions`, token, {
          method: 'POST',
          body: JSON.stringify({
            title: ('Research answer: ' + questionText.slice(0, 60)),
            decision_made: answer.trim(),
            context: 'Answer to research question logged during research phase.',
            options_considered: '',
          }),
        })
      }

      onSaved(updated, decision)
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save answer')
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-md rounded-lg border border-gray-200 bg-white shadow-lg p-6 flex flex-col gap-4">

        {/* Question context */}
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-gray-400 mb-1">Question</p>
          <p className="text-sm text-gray-700">{questionText}</p>
        </div>

        {/* Answer textarea */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Your answer <span className="text-red-500">*</span>
          </label>
          <textarea
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            placeholder="What did you find? What did you decide?"
            rows={4}
            style={{ minHeight: 80 }}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
            autoFocus
          />
        </div>

        {/* Log as decision toggle */}
        <div>
          <label className="flex items-start gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={logAsDecision}
              onChange={(e) => setLogAsDecision(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="text-sm text-gray-700">Also log this answer as a decision</span>
          </label>
          <p className="mt-0.5 ml-6 text-xs text-gray-400">Decisions are permanent and cannot be edited.</p>
        </div>

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
            disabled={saving || !answer.trim()}
            className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {saving ? 'Saving...' : 'Save answer'}
          </button>
        </div>

      </div>
    </div>
  )
}
