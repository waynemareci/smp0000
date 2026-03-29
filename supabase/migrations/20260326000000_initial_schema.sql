-- ============================================================
-- SMP Initial Schema
-- Migration: 20260326000000_initial_schema
-- Auth: Clerk (clerk_id is the external auth identifier)
-- ============================================================

-- Extensions
create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- ============================================================
-- updated_at trigger (applied to all mutable tables)
-- ============================================================
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ============================================================
-- ORGS
-- ============================================================
create table orgs (
  id           uuid primary key default uuid_generate_v4(),
  name         text not null,
  slug         text not null unique,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create trigger orgs_updated_at before update on orgs
  for each row execute function set_updated_at();

-- ============================================================
-- USERS
-- clerk_id: the sub claim from Clerk's JWT
-- ============================================================
create table users (
  id           uuid primary key default uuid_generate_v4(),
  clerk_id     text not null unique,   -- Clerk user ID (user_xxxx)
  org_id       uuid references orgs(id) on delete set null,
  email        text not null unique,
  display_name text,
  role         text not null default 'member' check (role in ('owner','admin','member')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index users_clerk_id_idx on users(clerk_id);
create index users_org_id_idx   on users(org_id);
create trigger users_updated_at before update on users
  for each row execute function set_updated_at();

-- ============================================================
-- GOALS
-- ============================================================
create table goals (
  id           uuid primary key default uuid_generate_v4(),
  org_id       uuid references orgs(id) on delete cascade,
  owner_id     uuid references users(id) on delete set null,
  title        text not null,
  description  text,
  status       text not null default 'active'
                 check (status in ('active','paused','completed','archived')),
  target_date  date,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index goals_org_id_idx on goals(org_id);
create trigger goals_updated_at before update on goals
  for each row execute function set_updated_at();

-- ============================================================
-- PHASES
-- ============================================================
create table phases (
  id           uuid primary key default uuid_generate_v4(),
  goal_id      uuid not null references goals(id) on delete cascade,
  title        text not null,
  phase_order  int not null,
  status       text not null default 'pending'
                 check (status in ('pending','in_progress','completed')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique(goal_id, phase_order)
);
create index phases_goal_id_idx on phases(goal_id);
create trigger phases_updated_at before update on phases
  for each row execute function set_updated_at();

-- ============================================================
-- MILESTONES
-- ============================================================
create table milestones (
  id              uuid primary key default uuid_generate_v4(),
  phase_id        uuid not null references phases(id) on delete cascade,
  title           text not null,
  milestone_order int not null,
  status          text not null default 'pending'
                    check (status in ('pending','in_progress','completed')),
  target_date     date,
  completed_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index milestones_phase_id_idx on milestones(phase_id);
create trigger milestones_updated_at before update on milestones
  for each row execute function set_updated_at();

-- ============================================================
-- TASKS
-- ============================================================
create table tasks (
  id           uuid primary key default uuid_generate_v4(),
  milestone_id uuid not null references milestones(id) on delete cascade,
  assignee_id  uuid references users(id) on delete set null,
  title        text not null,
  notes        text,
  status       text not null default 'todo'
                 check (status in ('todo','in_progress','done','blocked')),
  due_date     date,
  completed_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index tasks_milestone_id_idx on tasks(milestone_id);
create trigger tasks_updated_at before update on tasks
  for each row execute function set_updated_at();

-- ============================================================
-- DECISIONS  (append-only)
-- ============================================================
create table decisions (
  id           uuid primary key default uuid_generate_v4(),
  goal_id      uuid not null references goals(id) on delete cascade,
  recorded_by  uuid references users(id) on delete set null,
  title        text not null,
  context      text,
  options_considered text,
  decision_made text not null,
  rationale    text,
  created_at   timestamptz not null default now()
  -- no updated_at: append-only
);
create index decisions_goal_id_idx on decisions(goal_id);

-- ============================================================
-- AI PROMPT LOG  (append-only)
-- ============================================================
create table ai_prompt_log (
  id           uuid primary key default uuid_generate_v4(),
  goal_id      uuid references goals(id) on delete set null,
  user_id      uuid references users(id) on delete set null,
  prompt       text not null,
  response     text,
  model        text,
  tokens_used  int,
  created_at   timestamptz not null default now()
  -- no updated_at: append-only
);
create index ai_prompt_log_goal_id_idx on ai_prompt_log(goal_id);

-- ============================================================
-- METRIC SNAPSHOTS
-- ============================================================
create table metric_snapshots (
  id           uuid primary key default uuid_generate_v4(),
  goal_id      uuid not null references goals(id) on delete cascade,
  metric_key   text not null,
  metric_value numeric,
  snapshot_at  timestamptz not null default now(),
  created_at   timestamptz not null default now()
);
create index metric_snapshots_goal_id_idx on metric_snapshots(goal_id);
create index metric_snapshots_at_idx      on metric_snapshots(snapshot_at);