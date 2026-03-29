'use client'

import { useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useAuth } from '@clerk/nextjs'
import { apiFetch } from '@/lib/api'
import BulletGraph from '@/components/BulletGraph'
import LogAnswerModal, { type Question, type AnswerDecision } from '@/components/LogAnswerModal'
import LogDecisionModal, { type SavedDecision } from '@/components/LogDecisionModal'

// ── Types ────────────────────────────────────────────────────────────────────

interface Goal {
  id: string
  title: string
  description: string | null
  status: string
  target_date: string | null
}

interface Phase {
  id: string
  goal_id: string
  title: string
  phase_order: number
  status: string
}

interface Milestone {
  id: string
  phase_id: string
  title: string
  milestone_order: number
  status: string
  completed_at: string | null
}

interface Decision {
  id: string
  title: string
  decision_made: string
  created_at: string
}

// ── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const colour =
    status === 'researching'
      ? 'bg-amber-100 text-amber-800'
      : status === 'active' || status === 'in_progress'
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

// ── Loading skeleton ──────────────────────────────────────────────────────────

function Skeleton() {
  return (
    <div className="animate-pulse flex flex-col gap-4 py-6">
      <div className="h-6 bg-gray-200 rounded w-1/2" />
      <div className="h-4 bg-gray-200 rounded w-1/3" />
      <div className="h-4 bg-gray-200 rounded w-2/3" />
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function GoalDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { getToken } = useAuth()

  const [goal, setGoal] = useState<Goal | null>(null)
  const [phases, setPhases] = useState<Phase[]>([])
  const [milestonesMap, setMilestonesMap] = useState<Record<string, Milestone[]>>({})
  const [decisions, setDecisions] = useState<Decision[]>([])
  const [questions, setQuestions] = useState<Question[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedPhases, setExpandedPhases] = useState<Record<string, boolean>>({})

  // Researching-layout state
  const [researchExpanded, setResearchExpanded] = useState(false)
  const [showDecisionModal, setShowDecisionModal] = useState(false)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [modalQuestion, setModalQuestion] = useState<Question | null>(null)
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState('')
  const [addingQuestion, setAddingQuestion] = useState(false)
  const [newQuestionText, setNewQuestionText] = useState('')
  const newQuestionRef = useRef<HTMLInputElement>(null)

  // ── Fetch ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const token = await getToken()
        if (cancelled) return

        const [fetchedGoal, fetchedPhases, fetchedQuestions, fetchedDecisions] = await Promise.all([
          apiFetch('/api/goals/' + id, token),
          apiFetch('/api/goals/' + id + '/phases', token),
          apiFetch('/api/goals/' + id + '/questions', token),
          apiFetch('/api/goals/' + id + '/decisions', token),
        ])
        if (cancelled) return

        const map: Record<string, Milestone[]> = {}
        await Promise.all(
          fetchedPhases.map(async (phase: Phase) => {
            map[phase.id] = await apiFetch('/api/phases/' + phase.id + '/milestones', token)
          })
        )
        if (cancelled) return

        const expanded: Record<string, boolean> = {}
        fetchedPhases.forEach((p: Phase) => { expanded[p.id] = true })

        setGoal(fetchedGoal)
        setPhases(fetchedPhases)
        setMilestonesMap(map)
        setDecisions(fetchedDecisions)
        setQuestions(fetchedQuestions)
        setExpandedPhases(expanded)
      } catch (err) {
        if (cancelled) return
        setError(err instanceof Error ? err.message : 'Failed to load goal')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [id]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Milestone toggle ───────────────────────────────────────────────────────

  async function toggleMilestone(phaseId: string, ms: Milestone, checked: boolean) {
    setMilestonesMap((prev) => ({
      ...prev,
      [phaseId]: prev[phaseId].map((m) =>
        m.id === ms.id
          ? { ...m, status: checked ? 'completed' : 'pending', completed_at: checked ? new Date().toISOString() : null }
          : m
      ),
    }))

    try {
      const token = await getToken()
      await apiFetch(`/api/phases/${phaseId}/milestones/${ms.id}`, token, {
        method: 'PATCH',
        body: JSON.stringify({
          status: checked ? 'completed' : 'pending',
          completed_at: checked ? new Date().toISOString() : null,
        }),
      })
    } catch {
      setMilestonesMap((prev) => ({
        ...prev,
        [phaseId]: prev[phaseId].map((m) => (m.id === ms.id ? ms : m)),
      }))
    }
  }

  // ── Inline title save ─────────────────────────────────────────────────────

  async function saveTitle() {
    if (!goal) { setEditingTitle(false); return }
    const trimmed = titleDraft.trim()
    if (!trimmed || trimmed === goal.title) { setEditingTitle(false); return }
    try {
      const token = await getToken()
      const updated: Goal = await apiFetch(`/api/goals/${id}`, token, {
        method: 'PATCH',
        body: JSON.stringify({ title: trimmed }),
      })
      setGoal(updated)
    } catch {
      setTitleDraft(goal.title)
    }
    setEditingTitle(false)
  }

  // ── Add new question ──────────────────────────────────────────────────────

  async function submitNewQuestion() {
    const text = newQuestionText.trim()
    if (!text) { setAddingQuestion(false); setNewQuestionText(''); return }
    try {
      const token = await getToken()
      const q: Question = await apiFetch(`/api/goals/${id}/questions`, token, {
        method: 'POST',
        body: JSON.stringify({ question: text, question_order: questions.length }),
      })
      setQuestions((prev) => [...prev, q])
    } catch {
      // keep input open so user can retry
      return
    }
    setNewQuestionText('')
    setAddingQuestion(false)
  }

  // ── Modal saved callback ──────────────────────────────────────────────────

  function handleQuestionSaved(updated: Question, decision: AnswerDecision | null) {
    setQuestions((prev) => prev.map((q) => q.id === updated.id ? updated : q))
    if (decision) {
      setDecisions((prev) => [decision, ...prev])
    }
    setModalQuestion(null)
  }

  function handleDecisionSaved(decision: SavedDecision) {
    setDecisions((prev) => [decision, ...prev])
    setShowDecisionModal(false)
    setSuccessMessage('Decision saved')
    setTimeout(() => setSuccessMessage(null), 3000)
  }

  // ── Derived values ─────────────────────────────────────────────────────────

  const allMilestones = Object.values(milestonesMap).flat()
  const totalMilestones = allMilestones.length
  const completedMilestones = allMilestones.filter((m) => m.status === 'completed').length
  const completedPhases = phases.filter((p) => p.status === 'completed').length
  const resolvedCount = questions.filter((q) => q.is_resolved).length
  const totalQCount = questions.length
  const allResolved = totalQCount === 0 || resolvedCount === totalQCount
  const progressPct = totalQCount > 0 ? (resolvedCount / totalQCount) * 100 : 0

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) return <Skeleton />
  if (error) return <p className="text-red-600">Error: {error}</p>
  if (!goal) return null

  const recentDecisions = [...decisions].reverse().slice(0, 3)

  function bulletRanges(total: number) {
    return [
      { label: 'early', max: Math.round(total * 0.33) || 1, color: '#e5e7eb' },
      { label: 'mid',   max: Math.round(total * 0.66) || 2, color: '#d1d5db' },
      { label: 'late',  max: total || 3,                    color: '#9ca3af' },
    ]
  }

  // ── Shared: Recent decisions section ──────────────────────────────────────

  const RecentDecisionsSection = (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-gray-400 mb-3">
        Recent decisions
      </p>
      {recentDecisions.length === 0 ? (
        <p className="text-sm text-gray-400">No decisions logged yet.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {recentDecisions.map((d) => (
            <div key={d.id} className="flex flex-col gap-0.5">
              <div className="flex items-start justify-between gap-2">
                <p className="text-xs text-gray-400">{d.title}</p>
                <p className="text-xs text-gray-400 shrink-0">
                  {new Date(d.created_at).toLocaleDateString()}
                </p>
              </div>
              <p className="text-sm text-gray-800">{d.decision_made}</p>
            </div>
          ))}
        </div>
      )}
      <a href="/dashboard/decisions" className="mt-3 inline-block text-xs text-blue-600 hover:underline">
        View all decisions &#x2192;
      </a>
    </div>
  )

  // ══════════════════════════════════════════════════════════════
  // RESEARCHING LAYOUT
  // ══════════════════════════════════════════════════════════════

  if (goal.status === 'researching') {
    return (
      <div className="max-w-3xl mx-auto flex flex-col gap-8">

        {/* ── Print styles ── */}
        <style>{`
          @media print {
            body * { visibility: hidden; }
            .print-only, .print-only * { visibility: visible; }
            .print-only {
              position: absolute;
              top: 0;
              left: 0;
              width: 100%;
              display: block !important;
              font-family: Georgia, serif;
              color: #000;
            }
          }
        `}</style>

        {/* ── Print-only content (hidden on screen) ── */}
        <div className="print-only" style={{ display: 'none' }}>
          <h2 style={{ fontSize: '1.25rem', marginBottom: '0.5rem' }}>{goal.title}</h2>
          {goal.description && (
            <p style={{ fontSize: '0.9rem', marginBottom: '1rem', color: '#333' }}>
              {goal.description}
            </p>
          )}
          <p style={{ fontWeight: 600, marginBottom: '0.5rem' }}>Research Questions</p>
          <ol style={{ fontSize: '0.9rem', paddingLeft: '1.25rem' }}>
            {questions
              .slice()
              .sort((a, b) => a.question_order - b.question_order)
              .map((q, i) => (
                <li key={i} style={{ marginBottom: '0.4rem' }}>{q.question}</li>
              ))}
          </ol>
        </div>

        {/* ── Header ── */}
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-3 flex-wrap">
            {editingTitle ? (
              <input
                autoFocus
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                onBlur={saveTitle}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { e.preventDefault(); saveTitle() }
                  if (e.key === 'Escape') { setEditingTitle(false); setTitleDraft(goal.title) }
                }}
                className="text-xl font-semibold text-gray-900 border-b border-blue-400 focus:outline-none bg-transparent w-full max-w-md"
              />
            ) : (
              <h1
                onClick={() => { setTitleDraft(goal.title); setEditingTitle(true) }}
                className="text-xl font-semibold text-gray-900 cursor-text hover:underline hover:decoration-dashed"
                title="Click to edit"
              >
                {goal.title}
              </h1>
            )}
            <StatusBadge status={goal.status} />
          </div>
          {goal.target_date && (
            <p className="text-sm text-gray-500">
              Target: {new Date(goal.target_date).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
            </p>
          )}
        </div>

        {/* ── Research questions ── */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
              Research questions ({resolvedCount} of {totalQCount} resolved)
            </p>
            <div className="flex gap-2 no-print">
              <button
                onClick={() => {
                  const shareText = goal.title + '\n\n' +
                    questions
                      .slice()
                      .sort((a, b) => a.question_order - b.question_order)
                      .map((q, i) => `${i + 1}. ${q.question}`)
                      .join('\n')
                  const subject = encodeURIComponent('Research questions: ' + goal.title)
                  const mailtoLink = `mailto:?subject=${subject}&body=${encodeURIComponent(shareText)}`
                  navigator.clipboard.writeText(shareText).then(
                    () => {
                      setSuccessMessage('Questions copied to clipboard')
                      setTimeout(() => setSuccessMessage(null), 3000)
                    },
                    () => { window.location.href = mailtoLink }
                  )
                }}
                className="text-xs text-gray-500 hover:text-gray-800 transition-colors"
              >
                Share questions
              </button>
              <button
                onClick={() => window.print()}
                className="text-xs text-gray-500 hover:text-gray-800 transition-colors"
              >
                Print
              </button>
            </div>
          </div>

          {/* Progress bar */}
          <div className="h-2 w-full rounded-full bg-gray-100 mb-4 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-300 ${allResolved && totalQCount > 0 ? 'bg-green-500' : 'bg-amber-400'}`}
              style={{ width: `${progressPct}%` }}
            />
          </div>

          {/* Question rows */}
          <div className="no-print flex flex-col gap-2">
            {questions
              .slice()
              .sort((a, b) => a.question_order - b.question_order)
              .map((q) => (
                <div
                  key={q.id}
                  className={`rounded-md border p-3 flex flex-col gap-1 ${q.is_resolved ? 'border-gray-100 bg-gray-50' : 'border-gray-200 bg-white'}`}
                >
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={q.is_resolved}
                      readOnly
                      className="mt-0.5 h-4 w-4 rounded border-gray-300 text-amber-500 cursor-default"
                    />
                    <span
                      className={`flex-1 text-sm ${q.is_resolved ? 'line-through text-gray-400' : 'text-gray-800'}`}
                    >
                      {q.question}
                    </span>
                    {!q.is_resolved && (
                      <button
                        onClick={() => setModalQuestion(q)}
                        className="shrink-0 text-xs font-medium text-blue-600 hover:text-blue-800 transition-colors"
                      >
                        Log answer &#x2192;
                      </button>
                    )}
                  </div>
                  {q.is_resolved && q.answer && (
                    <p className="ml-7 text-xs italic text-gray-400">{q.answer}</p>
                  )}
                </div>
              ))}
          </div>

          {/* Add question */}
          <div className="no-print mt-3">
            {addingQuestion ? (
              <input
                ref={newQuestionRef}
                autoFocus
                type="text"
                value={newQuestionText}
                onChange={(e) => setNewQuestionText(e.target.value)}
                onBlur={submitNewQuestion}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { e.preventDefault(); submitNewQuestion() }
                  if (e.key === 'Escape') { setAddingQuestion(false); setNewQuestionText('') }
                }}
                placeholder="Type a question and press Enter..."
                className="w-full rounded-md border border-blue-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            ) : (
              <button
                onClick={() => setAddingQuestion(true)}
                className="text-sm text-blue-600 hover:text-blue-800 transition-colors"
              >
                + Add question
              </button>
            )}
          </div>
        </div>

        {/* ── Roadmap (gated) ── */}
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-400 mb-2">Roadmap</p>
          <p className="text-sm text-gray-500 mb-4">
            Your roadmap will be defined here once all research questions are answered.
          </p>
          <p className="text-sm text-gray-400 mb-4">
            {resolvedCount} of {totalQCount} question{totalQCount !== 1 ? 's' : ''} resolved
          </p>
          <button
            disabled={!allResolved}
            onClick={() => router.push(`/dashboard/goals/${id}/define`)}
            className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
              allResolved
                ? 'bg-gray-900 text-white hover:bg-gray-700 cursor-pointer'
                : 'bg-gray-200 text-gray-400 cursor-not-allowed'
            }`}
          >
            Define roadmap &#x2192;
          </button>
        </div>

        {/* ── Recent decisions ── */}
        {RecentDecisionsSection}

        {/* ── LogAnswerModal ── */}
        {modalQuestion && (
          <LogAnswerModal
            goalId={id}
            questionId={modalQuestion.id}
            questionText={modalQuestion.question}
            onClose={() => setModalQuestion(null)}
            onSaved={handleQuestionSaved}
          />
        )}

        {/* ── Toast ── */}
        {successMessage && (
          <div className="fixed bottom-6 right-6 z-50 rounded-md bg-gray-900 px-4 py-2 text-sm text-white shadow-lg">
            {successMessage}
          </div>
        )}

      </div>
    )
  }

  // ══════════════════════════════════════════════════════════════
  // ACTIVE (+ ALL OTHER STATUS) LAYOUT
  // ══════════════════════════════════════════════════════════════

  return (
    <div className="max-w-3xl mx-auto flex flex-col gap-8">

      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-xl font-semibold text-gray-900">{goal.title}</h1>
            <StatusBadge status={goal.status} />
          </div>
          {goal.target_date && (
            <p className="text-sm text-gray-500">
              Target: {new Date(goal.target_date).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
            </p>
          )}
        </div>
        <button
          onClick={() => setShowDecisionModal(true)}
          className="shrink-0 rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
        >
          + Log decision
        </button>
      </div>

      {/* ── Collapsible research questions (read-only record) ── */}
      {questions.length > 0 && (
        <div className="rounded-lg border border-gray-100">
          <button
            onClick={() => setResearchExpanded((v) => !v)}
            className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
          >
            <span>
              Research questions ({resolvedCount} of {totalQCount} resolved)
            </span>
            <span className="text-gray-400 text-xs">{researchExpanded ? '▾' : '▸'}</span>
          </button>
          {researchExpanded && (
            <div className="border-t border-gray-100 px-4 py-3 flex flex-col gap-2">
              {questions
                .slice()
                .sort((a, b) => a.question_order - b.question_order)
                .map((q) => (
                  <div key={q.id} className="flex flex-col gap-0.5">
                    <p className={`text-sm ${q.is_resolved ? 'line-through text-gray-400' : 'text-gray-700'}`}>
                      {q.question}
                    </p>
                    {q.answer && (
                      <p className="text-xs italic text-gray-400 ml-0">{q.answer}</p>
                    )}
                  </div>
                ))}
            </div>
          )}
        </div>
      )}

      {/* ── Bullet graphs ── */}
      <div className="rounded-lg border border-gray-200 bg-white p-4 flex flex-col gap-4">
        {totalMilestones === 0 ? (
          <p className="text-sm text-gray-400 text-center py-2">
            No milestones yet — they will appear once the roadmap is saved.
          </p>
        ) : (
          <BulletGraph
            title="Milestones complete"
            value={completedMilestones}
            target={Math.round(totalMilestones * 0.5)}
            ranges={bulletRanges(totalMilestones)}
          />
        )}
        {phases.length > 0 && (
          <BulletGraph
            title="Phases complete"
            value={completedPhases}
            target={Math.round(phases.length * 0.5)}
            ranges={bulletRanges(phases.length)}
          />
        )}
      </div>

      {/* ── Roadmap ── */}
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-gray-400 mb-3">Roadmap</p>
        {phases.length === 0 ? (
          <p className="text-sm text-gray-400">No phases yet.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {[...phases].sort((a, b) => a.phase_order - b.phase_order).map((phase) => {
              const milestones = (milestonesMap[phase.id] ?? []).slice().sort(
                (a, b) => a.milestone_order - b.milestone_order
              )
              const completedCount = milestones.filter((m) => m.status === 'completed').length
              const isExpanded = expandedPhases[phase.id] ?? true

              return (
                <div key={phase.id} className="rounded-md border border-gray-200">
                  <button
                    onClick={() =>
                      setExpandedPhases((prev) => ({ ...prev, [phase.id]: !prev[phase.id] }))
                    }
                    className="flex w-full items-center justify-between px-3 py-2 text-left hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-800">{phase.title}</span>
                      <StatusBadge status={phase.status} />
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-xs text-gray-400">
                        {completedCount}/{milestones.length}
                      </span>
                      <span className="text-gray-400 text-xs">{isExpanded ? '▾' : '▸'}</span>
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="border-t border-gray-100 px-3 py-2 flex flex-col gap-1.5">
                      {milestones.length === 0 ? (
                        <p className="text-xs text-gray-400 py-1">No milestones.</p>
                      ) : (
                        milestones.map((ms) => {
                          const done = ms.status === 'completed'
                          return (
                            <label key={ms.id} className="flex items-center gap-2 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={done}
                                onChange={(e) => toggleMilestone(phase.id, ms, e.target.checked)}
                                className="h-3.5 w-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                              />
                              <span className={`text-sm ${done ? 'line-through opacity-50' : 'text-gray-700'}`}>
                                {ms.title}
                              </span>
                            </label>
                          )
                        })
                      )}
                      <button
                        disabled
                        className="mt-1 text-left text-xs text-gray-400 hover:text-gray-600 disabled:cursor-not-allowed"
                      >
                        + Add milestone
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Recent decisions ── */}
      {RecentDecisionsSection}

      {/* ── LogDecisionModal ── */}
      {showDecisionModal && (
        <LogDecisionModal
          goalId={id}
          onClose={() => setShowDecisionModal(false)}
          onSaved={handleDecisionSaved}
        />
      )}

      {/* ── Success toast ── */}
      {successMessage && (
        <div className="fixed bottom-6 right-6 z-50 rounded-md bg-gray-900 px-4 py-2 text-sm text-white shadow-lg">
          {successMessage}
        </div>
      )}

    </div>
  )
}
