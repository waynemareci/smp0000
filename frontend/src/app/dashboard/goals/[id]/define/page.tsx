'use client'

import { useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useAuth } from '@clerk/nextjs'
import { apiFetch } from '@/lib/api'
import type { Question } from '@/components/LogAnswerModal'

// ── Types ────────────────────────────────────────────────────────────────────

interface Goal {
  id: string
  title: string
  description: string | null
  status: string
}

interface PhaseEdit {
  title: string
  milestones: string[]
}

// ── Spinner ──────────────────────────────────────────────────────────────────

function Spinner() {
  return (
    <span className="animate-spin border-2 rounded-full border-blue-500 border-t-transparent w-5 h-5 inline-block" />
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function DefineRoadmapPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { getToken } = useAuth()

  const [goal, setGoal] = useState<Goal | null>(null)
  const [phases, setPhases] = useState<PhaseEdit[]>([])
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState(false)
  const [pageError, setPageError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  // Store the rendered prompt for ai-log (ref avoids stale closure in save)
  const renderedPromptRef = useRef<string>('')
  const questionsRef = useRef<Question[]>([])

  // ── Guard + initial AI call ───────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false

    async function init() {
      try {
        const token = await getToken()
        if (cancelled) return

        const [fetchedGoal, fetchedQuestions]: [Goal, Question[]] = await Promise.all([
          apiFetch('/api/goals/' + id, token),
          apiFetch('/api/goals/' + id + '/questions', token),
        ])
        if (cancelled) return

        // Guard: must be researching with all questions resolved
        if (
          fetchedGoal.status !== 'researching' ||
          fetchedQuestions.some((q) => !q.is_resolved)
        ) {
          router.replace('/dashboard/goals/' + id)
          return
        }

        setGoal(fetchedGoal)
        questionsRef.current = fetchedQuestions

        await callAI(fetchedGoal, fetchedQuestions, token, cancelled)
      } catch (err) {
        if (cancelled) return
        setPageError(err instanceof Error ? err.message : 'Failed to load')
      }
    }

    init()
    return () => { cancelled = true }
  }, [id]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── AI call ───────────────────────────────────────────────────────────────

  async function callAI(
    g: Goal,
    qs: Question[],
    token: string | null,
    cancelled = false,
  ) {
    setAiLoading(true)
    setAiError(false)
    setPhases([])

    const researchQa = qs.map((q) => ({ question: q.question, answer: q.answer }))

    // Build the same prompt string for logging
    const qaBlock = researchQa.length
      ? 'Research Q&A:\n' + researchQa.map((p) => `Q: ${p.question}\nA: ${p.answer ?? '(no answer)'}`).join('\n')
      : ''
    const rendered = `${g.title}\n\n${g.description ?? ''}${qaBlock ? '\n\n' + qaBlock : ''}`
    renderedPromptRef.current = rendered

    try {
      const data = await apiFetch('/api/ai/decompose', token, {
        method: 'POST',
        body: JSON.stringify({
          title: g.title,
          description: g.description ?? '',
          mode: 'phases_only',
          research_qa: researchQa,
        }),
      })
      if (cancelled) return

      const incoming: PhaseEdit[] = (data.phases ?? []).map(
        (p: { title: string; milestones: string[] }) => ({
          title: p.title,
          milestones: p.milestones ?? [],
        })
      )
      setPhases(incoming)
    } catch {
      if (!cancelled) setAiError(true)
    } finally {
      if (!cancelled) setAiLoading(false)
    }
  }

  async function handleRegenerate() {
    if (!goal) return
    if (phases.length > 0) {
      if (!window.confirm('This will replace your current edits. Continue?')) return
    }
    const token = await getToken()
    await callAI(goal, questionsRef.current, token)
  }

  // ── Phase / milestone mutations ───────────────────────────────────────────

  function movePhase(i: number, delta: -1 | 1) {
    const j = i + delta
    if (j < 0 || j >= phases.length) return
    setPhases((prev) => {
      const arr = [...prev]
      ;[arr[i], arr[j]] = [arr[j], arr[i]]
      return arr
    })
  }

  function deletePhase(i: number) {
    setPhases((prev) => prev.filter((_, idx) => idx !== i))
  }

  function updatePhaseTitle(i: number, title: string) {
    setPhases((prev) => prev.map((p, idx) => idx === i ? { ...p, title } : p))
  }

  function addPhase() {
    setPhases((prev) => [...prev, { title: '', milestones: [] }])
  }

  function moveMilestone(pi: number, mi: number, delta: -1 | 1) {
    const mj = mi + delta
    setPhases((prev) => prev.map((p, idx) => {
      if (idx !== pi) return p
      if (mj < 0 || mj >= p.milestones.length) return p
      const arr = [...p.milestones]
      ;[arr[mi], arr[mj]] = [arr[mj], arr[mi]]
      return { ...p, milestones: arr }
    }))
  }

  function deleteMilestone(pi: number, mi: number) {
    setPhases((prev) => prev.map((p, idx) =>
      idx !== pi ? p : { ...p, milestones: p.milestones.filter((_, i) => i !== mi) }
    ))
  }

  function updateMilestone(pi: number, mi: number, value: string) {
    setPhases((prev) => prev.map((p, idx) =>
      idx !== pi ? p : { ...p, milestones: p.milestones.map((m, i) => i === mi ? value : m) }
    ))
  }

  function addMilestone(pi: number) {
    setPhases((prev) => prev.map((p, idx) =>
      idx !== pi ? p : { ...p, milestones: [...p.milestones, ''] }
    ))
  }

  // ── Save ──────────────────────────────────────────────────────────────────

  async function handleSave() {
    if (!goal) return
    setSaving(true)
    setSaveError(null)

    try {
      const token = await getToken()

      // 1+2. Create phases then milestones
      for (let pi = 0; pi < phases.length; pi++) {
        const phase = phases[pi]
        if (!phase.title.trim()) continue

        const createdPhase = await apiFetch(`/api/goals/${goal.id}/phases`, token, {
          method: 'POST',
          body: JSON.stringify({ title: phase.title.trim(), phase_order: pi, status: 'pending' }),
        })

        const phaseId: string = createdPhase.id
        const validMilestones = phase.milestones.filter((m) => m.trim().length > 0)

        for (let mi = 0; mi < validMilestones.length; mi++) {
          await apiFetch(`/api/phases/${phaseId}/milestones`, token, {
            method: 'POST',
            body: JSON.stringify({ title: validMilestones[mi].trim(), milestone_order: mi, status: 'pending' }),
          })
        }
      }

      // 3. Transition goal to active
      await apiFetch(`/api/goals/${goal.id}`, token, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'active' }),
      })

      // 4. Log the AI call
      const firstPhaseTitle = phases.find((p) => p.title.trim())?.title ?? ''
      await apiFetch('/api/ai-log', token, {
        method: 'POST',
        body: JSON.stringify({
          goal_id: goal.id,
          prompt_template: 'roadmap_from_research_v1',
          rendered_prompt: renderedPromptRef.current,
          model_name: 'claude-sonnet-4-20250514',
          response_summary: firstPhaseTitle.slice(0, 120),
        }),
      })

      // 5. Navigate to goal detail
      router.push('/dashboard/goals/' + goal.id)
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save roadmap')
      setSaving(false)
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  if (pageError) return <p className="text-red-600">Error: {pageError}</p>
  if (!goal && !pageError) {
    return (
      <div className="flex items-center gap-3 py-10 text-sm text-gray-500">
        <Spinner />
        <span>Loading...</span>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto py-10 px-4 flex flex-col gap-8">

      {/* ── Header ── */}
      <div>
        <h1 className="text-lg font-semibold text-gray-900 mb-1">Define your roadmap</h1>
        <p className="text-sm text-gray-500">
          Based on your research. Edit phases and milestones before saving.
        </p>
      </div>

      {/* ── AI loading ── */}
      {aiLoading && (
        <div className="flex items-center gap-3 py-8 text-sm text-gray-500">
          <Spinner />
          <span>Generating your roadmap based on your research...</span>
        </div>
      )}

      {/* ── AI error ── */}
      {aiError && !aiLoading && (
        <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <p>Something went wrong generating the roadmap.</p>
          <button
            onClick={handleRegenerate}
            className="mt-2 rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 transition-colors"
          >
            Retry
          </button>
        </div>
      )}

      {/* ── Phase editor ── */}
      {!aiLoading && phases.length >= 0 && !aiError && (
        <div className="flex flex-col gap-4">

          {phases.map((phase, pi) => (
            <div key={pi} className="rounded-lg border border-gray-200 bg-white">

              {/* Phase header */}
              <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-100">
                <div className="flex flex-col">
                  <button
                    onClick={() => movePhase(pi, -1)}
                    disabled={pi === 0}
                    aria-label="Move phase up"
                    className="text-gray-400 hover:text-gray-700 disabled:opacity-20 leading-none text-xs px-0.5"
                  >
                    &#x2191;
                  </button>
                  <button
                    onClick={() => movePhase(pi, 1)}
                    disabled={pi === phases.length - 1}
                    aria-label="Move phase down"
                    className="text-gray-400 hover:text-gray-700 disabled:opacity-20 leading-none text-xs px-0.5"
                  >
                    &#x2193;
                  </button>
                </div>
                <input
                  type="text"
                  value={phase.title}
                  onChange={(e) => updatePhaseTitle(pi, e.target.value)}
                  placeholder="Phase title"
                  className="flex-1 text-sm font-medium text-gray-800 border-0 focus:outline-none focus:ring-0 bg-transparent placeholder-gray-300"
                />
                <button
                  onClick={() => deletePhase(pi)}
                  aria-label="Delete phase"
                  className="text-gray-300 hover:text-red-500 transition-colors text-sm shrink-0"
                >
                  &#x2715;
                </button>
              </div>

              {/* Milestones */}
              <div className="px-4 py-2 flex flex-col gap-1.5">
                {phase.milestones.map((ms, mi) => (
                  <div key={mi} className="flex items-center gap-2">
                    <div className="flex flex-col">
                      <button
                        onClick={() => moveMilestone(pi, mi, -1)}
                        disabled={mi === 0}
                        aria-label="Move milestone up"
                        className="text-gray-300 hover:text-gray-600 disabled:opacity-20 leading-none text-xs px-0.5"
                      >
                        &#x2191;
                      </button>
                      <button
                        onClick={() => moveMilestone(pi, mi, 1)}
                        disabled={mi === phase.milestones.length - 1}
                        aria-label="Move milestone down"
                        className="text-gray-300 hover:text-gray-600 disabled:opacity-20 leading-none text-xs px-0.5"
                      >
                        &#x2193;
                      </button>
                    </div>
                    <span className="text-gray-300 text-xs">•</span>
                    <input
                      type="text"
                      value={ms}
                      onChange={(e) => updateMilestone(pi, mi, e.target.value)}
                      placeholder="Milestone"
                      className="flex-1 text-sm text-gray-700 border-0 focus:outline-none focus:ring-0 bg-transparent placeholder-gray-300"
                    />
                    <button
                      onClick={() => deleteMilestone(pi, mi)}
                      aria-label="Delete milestone"
                      className="text-gray-300 hover:text-red-500 transition-colors text-xs shrink-0"
                    >
                      &#x2715;
                    </button>
                  </div>
                ))}
                <button
                  onClick={() => addMilestone(pi)}
                  className="mt-1 self-start text-xs text-blue-500 hover:text-blue-700 transition-colors"
                >
                  + Add milestone
                </button>
              </div>

            </div>
          ))}

          {/* Add phase */}
          <button
            onClick={addPhase}
            className="self-start text-sm text-blue-600 hover:text-blue-800 transition-colors"
          >
            + Add phase
          </button>

        </div>
      )}

      {/* ── Save error ── */}
      {saveError && (
        <p className="text-sm text-red-600">{saveError}</p>
      )}

      {/* ── Controls ── */}
      {!aiLoading && (
        <div className="flex gap-3 items-center">
          <button
            onClick={handleRegenerate}
            disabled={saving || aiLoading}
            className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-40"
          >
            &#x21BA; Regenerate
          </button>
          <button
            onClick={handleSave}
            disabled={saving || aiLoading || phases.filter((p) => p.title.trim()).length === 0}
            className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {saving ? (
              <span className="flex items-center gap-2">
                <Spinner /> Saving...
              </span>
            ) : (
              'Save roadmap \u2192'
            )}
          </button>
        </div>
      )}

    </div>
  )
}
