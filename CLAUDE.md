# SMP — Strategy Management Platform
## Claude Code Standing Context

### What this project is
A web-based Strategy Management Platform (SMP) that uses AI to decompose
complex goals into research-first roadmaps, track decisions, and visualize
progress via bullet graphs. The trading agent (Hang Seng) is the first
dogfood use case — the SMP manages its own development from Day 0.

### Stack
- **Frontend**: Next.js 16 / React / TypeScript — deployed on Vercel
- **Backend**: FastAPI (Python 3.11+)
- **Database**: Supabase cloud only (no local Docker)
  - DATABASE_URL in .env.local points to the cloud project
  - Migrations applied via Supabase SQL Editor
- **Auth**: Clerk (JWT validation on FastAPI side)
- **AI**: Anthropic Claude API (claude-sonnet-4-20250514)

### Environment
- `ENV=cloud` (only mode — no local Docker Postgres)
- DATABASE_URL in .env.local controls the connection

### Server
- FastAPI runs on port 8001 (port 8000 has a persistent conflict on this machine — always use --port 8001)
- Start: `PYTHONIOENCODING=utf-8 python -m uvicorn app.main:app --port 8001`

### Conventions
- FastAPI routers go in `app/routers/`
- Never hardcode secrets — always use os.getenv()
- Clerk user_id (clerk_id) is the foreign key linking auth to our users table
- All tables have: id (uuid), created_at, updated_at (auto-trigger)
- Decisions and ai_prompt_log are append-only (no updates, no deletes)

### Current phase: Phase 5 — TBD

### Phase 4 — Production deployment (complete)

Completed when:
- [x] requirements.txt stripped to SMP-only dependencies
- [x] /api/seed decoupled from day_zero.py / psycopg2 (disabled, returns 410)
- [x] Railway backend deployed and healthy (/health verified)
- [x] Vercel frontend deployed and reachable
- [x] CLERK_JWKS_URL added to Railway environment variables
- [x] Full stack smoke test passed
- [x] AI log page created (/dashboard/ai-log)
- [x] Session 1 wizard merged from 3 steps to 2 steps

Phase 4 completed: 2026-03-30

Post-deployment issues found and resolved:
- AI log page was missing — created /dashboard/ai-log route
- Session 1 steps 1+2 merged into single page (pure layout change)

### Phase 3 — Redesigned goal workflow (complete)

Completed when:
- [x] goal_questions table created in Supabase
- [x] Goals status enum includes 'researching' (new default)
- [x] POST /api/goals/{id}/questions — CRUD endpoints live
- [x] New goal wizard: Step 3 generates research questions only (no phases)
- [x] Goal detail page: dual-status layout (researching vs active)
- [x] LogAnswerModal: inline answer + optional decision record
- [x] /dashboard/goals/[id]/define: Session 2 roadmap definition page
- [x] POST /api/ai/decompose supports three modes: questions_only,
      phases_only (with Q&A context), full (legacy)
- [x] LogDecisionModal wired into active goal detail page
- [x] Sidebar nav updated: Goals, Decisions, AI log

Phase 3 completed: 2026-03-29
Smoke test passed. Issues found and resolved during testing:
- Print view: switched to visibility:hidden inversion approach
- View all decisions: was reloading goal page, now routes correctly
- Decision display: answer text now shown as primary content
- Recent Decisions: fixed sort order (newest-first before slice)
- Sidebar: fixed with h-screen overflow-hidden layout
- LogAnswerModal: decisions now prepend to Recent Decisions on save
- Active layout: read-only research questions section added

### Key decisions logged
1. Parallel build: SMP and trading agent built simultaneously from Day 0
2. Dogfooding: SMP tracks its own development as Goal #1
3. Auth: Clerk chosen over Supabase Auth for better Next.js DX
4. DB: Supabase cloud only — no local Docker. Migrations applied via SQL Editor.
5. Clerk JWT: JWKS URL must include full path — bare instance URL rejected
6. PgBouncer: asyncpg requires statement_cache_size=0 to disable prepared statements
7. ORM timestamps: all columns need server_default=func.now() — db trigger alone is not sufficient for SQLAlchemy inserts
8. Phase 1 complete: 18 routes verified (17 API + /health), all smoke tests passed
9. Known workaround: Wayne's user row (clerk_id: user_3BWrgqRwD0QwOPYFMQ8Ih2N5KMS) was manually inserted during Phase 1 testing. Clerk webhook (Prompt 2) will supersede this for all future users.
10. CORS: currently allow_origins=["*"] in main.py — lock down to Vercel domain once frontend is deployed.
11. Next.js 16 uses proxy.ts not middleware.ts — middleware.ts is deprecated in Next.js 16 and emits a warning. proxy.ts is the correct convention and is confirmed working.
12. Two-session goal workflow adopted: Session 1 captures intent and
    generates research questions only. Phases and milestones are not
    created until all questions are answered (Session 2). This reflects
    the insight that the goal itself may change during research.
13. Goal status 'researching' added as the new default. Full status
    lifecycle: researching → active → paused → completed → archived.
14. Research questions (goal_questions table) are a first-class entity
    with their own answer field and is_resolved flag. Answering a
    question logs an optional decision record — the answer is both
    inline text and a permanent audit entry.
15. 'Define roadmap' button on goal detail page is strictly gated —
    only enabled when all research questions have is_resolved: true.
    No skip option. The research-first workflow is enforced by the UI.
16. AI decompose endpoint supports three modes:
      questions_only — Session 1: returns research questions only
      phases_only    — Session 2: returns phases + milestones,
                       informed by Q&A pairs passed in the request
      full           — legacy mode: returns both (retained for reference)
17. Phase status enum values: pending, in_progress, completed.
    Milestone status enum values: same. 'not_started' is not valid.
18. Answers to research questions are recorded two ways: as inline
    text on the question record (PATCH goal_questions) and optionally
    as a decision record (POST decisions). Both happen in one modal
    action (LogAnswerModal).
19. Research portal deferred to post-MVP: AI chat scoped to research
    questions, web search integration, per-question source attachments.
    Logged as decision record in SMP. Warrants its own design phase.
20. Print view uses visibility:hidden/visible inversion — the only
    reliable way to isolate a single div for printing while hiding
    all other page content.
21. Share questions uses navigator.clipboard.writeText with mailto:
    fallback — avoids dependency on a configured mail client.
22. requirements.txt scoped to SMP-only dependencies — local env had
    100+ packages including streamlit, selenium, PyAudio etc. that
    caused Railway dependency resolution failure
23. /api/seed disabled post-deployment (returns 410) — day_zero.py
    used psycopg2 which is not in the Railway stack. Seed data already
    present in Supabase.
24. CLERK_JWKS_URL must be explicitly set in Railway environment —
    omitting it causes 401 on all authenticated API calls.

### Architecture: two-session goal workflow

Session 1 — Goal intent (wizard at /dashboard/goals/new):
  Step 1: title + one-liner
  Step 2: full description + target date
  Step 3: AI generates research questions (questions_only mode)
          User edits/adds/removes questions
          Save: creates goal (status: researching) + question records
          No phases or milestones created at this point

Research period — goal detail page (/dashboard/goals/[id]):
  Shows research questions with answer fields and resolved toggles
  Progress bar: N of M questions resolved
  Goal title and description remain editable while researching
  'Define roadmap →' button disabled until all questions resolved
  Answers logged via LogAnswerModal (inline + optional decision record)

Session 2 — Roadmap definition (/dashboard/goals/[id]/define):
  AI generates phases + milestones using Q&A pairs as context
  User edits phases/milestones inline (rename, reorder ↑↓, delete ×)
  Save: creates phases + milestones, transitions goal to 'active'
  Second AI call logged to ai_prompt_log with full Q&A context

Active tracking — goal detail page (/dashboard/goals/[id]):
  Full layout: bullet graphs + phase/milestone tree + decision log
  Research questions collapsed but visible as a read-only record
  Milestone checkboxes update progress live
  LogDecisionModal available for ongoing decision capture

### Database additions in Phase 3
  goal_questions table:
    id, goal_id (fk), question (text), answer (text, nullable),
    is_resolved (bool, default false), question_order (int),
    created_at, updated_at

  goals table changes:
    status enum adds 'researching'
    status default changes from 'active' to 'researching'

### Routes added in Phase 3
  /dashboard/goals/new         — redesigned (questions only, no phases)
  /dashboard/goals/[id]        — dual-status layout
  /dashboard/goals/[id]/define — Session 2 roadmap definition
  Components:
    LogAnswerModal             — answer input + optional decision log
    LogDecisionModal           — general decision logging (active goals)