-- Run this in the Supabase SQL editor. Existing rows are preserved, but legacy
-- "default-user" rows are intentionally not exposed to authenticated users.
create table if not exists public.study_sessions (
  id uuid primary key,
  user_id text not null,
  date date not null,
  task_title text not null,
  category text not null,
  minutes integer not null check (minutes >= 0),
  note text,
  type text,
  ended_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.study_tasks (
  id uuid primary key,
  user_id text not null,
  task_data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.study_settings (
  user_id text primary key,
  long_term_goals jsonb not null default '[]'::jsonb,
  weekly_goals jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.study_sessions enable row level security;
alter table public.study_tasks enable row level security;
alter table public.study_settings enable row level security;

drop policy if exists "own sessions" on public.study_sessions;
create policy "own sessions" on public.study_sessions for all
  using (auth.uid()::text = user_id) with check (auth.uid()::text = user_id);

drop policy if exists "own tasks" on public.study_tasks;
create policy "own tasks" on public.study_tasks for all
  using (auth.uid()::text = user_id) with check (auth.uid()::text = user_id);

drop policy if exists "own settings" on public.study_settings;
create policy "own settings" on public.study_settings for all
  using (auth.uid()::text = user_id) with check (auth.uid()::text = user_id);

create index if not exists study_sessions_user_date_idx on public.study_sessions(user_id, date desc);
create index if not exists study_tasks_user_updated_idx on public.study_tasks(user_id, updated_at desc);
