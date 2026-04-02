'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@clerk/nextjs'
import { apiFetch } from '@/lib/api'

// ── Step indicator ───────────────────────────────────────────────────────────

function StepDots({ current }: { current: number }) {
  return (
    <div className="flex items-center gap-2 mb-8">
      {[1, 2].map((n) => (
        <svg key={n} width="12" height="12" viewBox="0 0 12 12">
          {n < current ? (
            // Done — green filled
            <circle cx="6" cy="6" r="6" fill="#22c55e" />
          ) : n === current ? (
            // Active — blue filled
            <circle cx="6" cy="6" r="6" fill="#3b82f6" />
          ) : (
            // Pending — gray outline
            <circle cx="6" cy="6" r="5" fill="none" stroke="#d1d5db" strokeWidth="1.5" />
          )}
        </svg>
      ))}
    </div>
  )
}

// ── Error toast ──────────────────────────────────────────────────────────────

function ErrorToast({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  return (
    <div className="mb-4 flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
      <span className="flex-1">{message}</span>
      <button onClick={onDismiss} className="shrink-0 font-medium hover:text-red-900">&#x2715;</button>
    </div>
  )
}

// ── Spinner ──────────────────────────────────────────────────────────────────

function Spinner() {
  return (
    <span className="animate-spin border-2 rounded-full border-blue-500 border-t-transparent w-5 h-5 inline-block" />
  )
}

// ── Main wizard ──────────────────────────────────────────────────────────────

export default function NewGoalPage() {
  const router = useRouter()
  const { getToken } = useAuth()

  // Form state
  const [step, setStep] = useState(1)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [context, setContext] = useState('')
  const [targetDate, setTargetDate] = useState('')

  // Step 3 state
  const [questionsLoading, setQuestionsLoading] = useState(false)
  const [questionsError, setQuestionsError] = useState(false)
  const [questions, setQuestions] = useState<string[]>([])
  // Save state
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  // ── AI call: questions_only mode ──────────────────────────────────────────

  async function generateQuestions() {
    setQuestionsLoading(true)
    setQuestionsError(false)
    setQuestions([])

    try {
      const token = await getToken()
      const data = await apiFetch('/api/ai/decompose', token, {
        method: 'POST',
        body: JSON.stringify({ title, description: context, mode: 'questions_only' }),
      })
      setQuestions((data.research_questions as string[]) ?? [])
    } catch {
      setQuestionsError(true)
    } finally {
      setQuestionsLoading(false)
    }
  }

  // Fire AI call when arriving at step 2
  useEffect(() => {
    if (step === 2) {
      generateQuestions()
    }
  }, [step]) // eslint-disable-line react-hooks/exhaustive-deps

  // Resize all textareas when questions load
  useEffect(() => {
    document.querySelectorAll('textarea').forEach((el) => {
      el.style.height = 'auto'
      el.style.height = el.scrollHeight + 'px'
    })
  }, [questions])

  // ── Question list helpers ─────────────────────────────────────────────────

  function updateQuestion(index: number, value: string) {
    setQuestions((prev) => prev.map((q, i) => (i === index ? value : q)))
  }

  function deleteQuestion(index: number) {
    setQuestions((prev) => prev.filter((_, i) => i !== index))
  }

  function moveQuestion(index: number, direction: -1 | 1) {
    const next = index + direction
    if (next < 0 || next >= questions.length) return
    setQuestions((prev) => {
      const arr = [...prev]
      ;[arr[index], arr[next]] = [arr[next], arr[index]]
      return arr
    })
  }

  function addQuestion() {
    setQuestions((prev) => [...prev, ''])
  }

  // ── Save sequence ──────────────────────────────────────────────────────────

  async function handleSave(skipQuestions = false) {
    setSaving(true)
    setSaveError(null)

    try {
      const token = await getToken()

      // 1. Create goal with status 'researching'
      const goal = await apiFetch('/api/goals', token, {
        method: 'POST',
        body: JSON.stringify({
          title,
          description: context,
          target_date: targetDate ? new Date(targetDate).toISOString() : null,
          status: 'researching',
        }),
      })

      const goalId: string = goal.id

      // 2. Save questions sequentially (in order)
      if (!skipQuestions) {
        const questionsToSave = questions.filter((q) => q.trim().length > 0)
        for (let i = 0; i < questionsToSave.length; i++) {
          await apiFetch(`/api/goals/${goalId}/questions`, token, {
            method: 'POST',
            body: JSON.stringify({ question: questionsToSave[i], question_order: i }),
          })
        }
      }

      // 3. Log the AI call
      if (!skipQuestions && questions.length > 0) {
        const userMessage = `${title}\n\n${context}`
        const firstQuestion = questions[0] ?? ''
        await apiFetch('/api/ai-log', token, {
          method: 'POST',
          body: JSON.stringify({
            goal_id: goalId,
            prompt_template: 'research_questions_v1',
            rendered_prompt: userMessage,
            model_name: 'claude-sonnet-4-20250514',
            response_summary: firstQuestion.slice(0, 120),
          }),
        })
      }

      // 4. Navigate to goal detail
      router.replace(`/dashboard/goals/${goalId}`)
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save goal')
      setSaving(false)
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-xl mx-auto py-10 px-4">
      <StepDots current={step} />

      {/* ── STEP 1 ── */}
      {step === 1 && (
        <div>
          <h1 className="text-lg font-semibold text-gray-900 mb-6">New goal</h1>

          <div className="flex flex-col gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Goal title <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                autoFocus
                placeholder="e.g. Build a personal algorithmic trading agent"
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                One-line description <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="e.g. A Python ML signal system targeting Hang Seng markets"
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Describe the goal in your own words <span className="text-red-500">*</span>
              </label>
              <textarea
                value={context}
                onChange={(e) => setContext(e.target.value)}
                placeholder={`What are you trying to achieve? What constraints exist?\nWhat does success look like?`}
                rows={4}
                style={{ minHeight: 80 }}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Target completion date <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              <input
                type="date"
                value={targetDate}
                onChange={(e) => setTargetDate(e.target.value)}
                className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div className="mt-6">
            <button
              onClick={() => setStep(2)}
              disabled={!title.trim() || !description.trim() || context.trim().length < 20}
              className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Next: generate agenda &#x2192;
            </button>
          </div>
        </div>
      )}

      {/* ── STEP 2 ── */}
      {step === 2 && (
        <div>
          <h1 className="text-lg font-semibold text-gray-900 mb-1">Research questions</h1>
          <p className="text-sm text-gray-500 mb-6">
            Answer these before defining your roadmap. You can edit, add or remove questions now.
          </p>

          {saveError && (
            <ErrorToast message={saveError} onDismiss={() => setSaveError(null)} />
          )}

          {/* Loading */}
          {questionsLoading && (
            <div className="flex items-center gap-3 py-10 text-sm text-gray-500">
              <Spinner />
              <span>Generating your research agenda...</span>
            </div>
          )}

          {/* Error */}
          {questionsError && !questionsLoading && (
            <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              <p>Something went wrong generating questions. You can retry or skip and save without questions.</p>
              <div className="mt-3 flex gap-2">
                <button
                  onClick={generateQuestions}
                  className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 transition-colors"
                >
                  Retry
                </button>
                <button
                  onClick={() => handleSave(true)}
                  disabled={saving}
                  className="rounded-md border border-red-300 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-100 transition-colors disabled:opacity-40"
                >
                  Skip and save &#x2192;
                </button>
              </div>
            </div>
          )}

          {/* Questions list */}
          {!questionsLoading && !questionsError && questions.length >= 0 && (
            <div className="flex flex-col gap-2">
              {questions.map((q, i) => (
                <div key={i} className="flex items-center gap-2">
                  {/* Up / Down */}
                  <div className="flex flex-col">
                    <button
                      onClick={() => moveQuestion(i, -1)}
                      disabled={i === 0}
                      aria-label="Move up"
                      className="text-gray-400 hover:text-gray-700 disabled:opacity-20 leading-none px-0.5"
                    >
                      &#x2191;
                    </button>
                    <button
                      onClick={() => moveQuestion(i, 1)}
                      disabled={i === questions.length - 1}
                      aria-label="Move down"
                      className="text-gray-400 hover:text-gray-700 disabled:opacity-20 leading-none px-0.5"
                    >
                      &#x2193;
                    </button>
                  </div>

                  {/* Text input */}
                  <textarea
                    value={q}
                    onChange={(e) => updateQuestion(i, e.target.value)}
                    rows={2}
                    className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none overflow-hidden"
                    style={{ minHeight: '2.5rem' }}
                    onInput={(e) => {
                      const el = e.currentTarget
                      el.style.height = 'auto'
                      el.style.height = el.scrollHeight + 'px'
                    }}
                    onFocus={(e) => {
                      const el = e.currentTarget
                      el.style.height = 'auto'
                      el.style.height = el.scrollHeight + 'px'
                    }}
                  />

                  {/* Delete */}
                  <button
                    onClick={() => deleteQuestion(i)}
                    aria-label="Delete question"
                    className="shrink-0 text-gray-400 hover:text-red-600 transition-colors text-sm px-1"
                  >
                    &#x2715;
                  </button>
                </div>
              ))}

              {/* Add question */}
              <button
                onClick={addQuestion}
                className="mt-1 self-start text-sm text-blue-600 hover:text-blue-800 transition-colors"
              >
                + Add question
              </button>
            </div>
          )}

          <p className="mt-3 text-sm text-gray-500">
            When you&apos;re happy with your research questions, click Save to proceed. You&apos;ll answer them on the goal page.
          </p>

          <div className="mt-6 flex gap-3">
            <button
              onClick={() => setStep(1)}
              disabled={saving}
              className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-40"
            >
              &#x2190; Back
            </button>
            <button
              onClick={() => handleSave(false)}
              disabled={saving || questionsLoading}
              className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {saving ? (
                <span className="flex items-center gap-2">
                  <Spinner /> Saving...
                </span>
              ) : (
                'Save and start research \u2192'
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
