-- 自分専用・ログインなしで使う設定です。
-- Supabase SQL Editorで1回だけ実行してください。

alter table public.study_sessions enable row level security;
alter table public.study_tasks enable row level security;
alter table public.study_settings enable row level security;

drop policy if exists "own sessions" on public.study_sessions;
drop policy if exists "own tasks" on public.study_tasks;
drop policy if exists "own settings" on public.study_settings;
drop policy if exists "single user sessions" on public.study_sessions;
drop policy if exists "single user tasks" on public.study_tasks;
drop policy if exists "single user settings" on public.study_settings;

create policy "single user sessions" on public.study_sessions for all
  to anon using (user_id = 'default-user') with check (user_id = 'default-user');

create policy "single user tasks" on public.study_tasks for all
  to anon using (user_id = 'default-user') with check (user_id = 'default-user');

create policy "single user settings" on public.study_settings for all
  to anon using (user_id = 'default-user') with check (user_id = 'default-user');
