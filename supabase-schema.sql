create extension if not exists "pgcrypto";

create table if not exists public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  purpose text,
  admin_name text,
  created_at timestamp with time zone default now()
);

alter table public.groups add column if not exists app_key text;

-- app_key に重複があると unique index を作れないため、重複分は NULL に戻す
with ranked_groups as (
  select
    id,
    row_number() over (partition by app_key order by created_at, id) as rn
  from public.groups
  where app_key is not null
)
update public.groups g
set app_key = null
from ranked_groups r
where g.id = r.id
  and r.rn > 1;

-- 以前に同名の通常indexが作られていても作り直せるようにする
drop index if exists public.groups_app_key_unique;
create unique index groups_app_key_unique on public.groups(app_key);

create table if not exists public.members (
  id uuid primary key default gen_random_uuid(),
  group_id uuid references public.groups(id) on delete cascade,
  name text not null,
  role_memo text,
  created_at timestamp with time zone default now()
);

create unique index if not exists members_group_name_unique on public.members(group_id, name);

create table if not exists public.availability_slots (
  id uuid primary key default gen_random_uuid(),
  group_id uuid references public.groups(id) on delete cascade,
  member_id uuid references public.members(id) on delete cascade,
  date date not null,
  start_time time not null,
  end_time time not null,
  location text not null default 'どちらでも',
  memo text,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  check (location in ('オンライン', '大学', 'どちらでも', 'Zoom')),
  check (end_time > start_time)
);

create index if not exists availability_slots_group_date_idx on public.availability_slots(group_id, date);
create index if not exists availability_slots_member_idx on public.availability_slots(member_id);

create table if not exists public.time_slots (
  id uuid primary key default gen_random_uuid(),
  group_id uuid references public.groups(id) on delete cascade,
  date date not null,
  start_time time not null,
  end_time time not null,
  task_title text,
  location text,
  memo text,
  is_confirmed boolean default false,
  created_at timestamp with time zone default now()
);

alter table public.time_slots add column if not exists created_by_member_id uuid references public.members(id) on delete set null;

create table if not exists public.responses (
  id uuid primary key default gen_random_uuid(),
  group_id uuid references public.groups(id) on delete cascade,
  member_id uuid references public.members(id) on delete cascade,
  time_slot_id uuid references public.time_slots(id) on delete cascade,
  status text not null check (status in ('available', 'maybe', 'unavailable')),
  comment text,
  updated_at timestamp with time zone default now()
);

create unique index if not exists responses_member_slot_unique on public.responses(member_id, time_slot_id);

create table if not exists public.meeting_notes (
  id uuid primary key default gen_random_uuid(),
  group_id uuid references public.groups(id) on delete cascade,
  time_slot_id uuid references public.time_slots(id) on delete cascade,
  todo text,
  decisions text,
  homework text,
  memo text,
  updated_at timestamp with time zone default now()
);

create unique index if not exists meeting_notes_time_slot_unique on public.meeting_notes(time_slot_id);

alter table public.groups enable row level security;
alter table public.members enable row level security;
alter table public.availability_slots enable row level security;
alter table public.time_slots enable row level security;
alter table public.responses enable row level security;
alter table public.meeting_notes enable row level security;

-- groups
 drop policy if exists "Allow anon select groups" on public.groups;
 drop policy if exists "Allow anon insert groups" on public.groups;
 drop policy if exists "Allow anon update groups" on public.groups;
create policy "Allow anon select groups" on public.groups for select to anon using (true);
create policy "Allow anon insert groups" on public.groups for insert to anon with check (true);
create policy "Allow anon update groups" on public.groups for update to anon using (true) with check (true);

-- members
 drop policy if exists "Allow anon select members" on public.members;
 drop policy if exists "Allow anon insert members" on public.members;
 drop policy if exists "Allow anon update members" on public.members;
 drop policy if exists "Allow anon delete members" on public.members;
create policy "Allow anon select members" on public.members for select to anon using (true);
create policy "Allow anon insert members" on public.members for insert to anon with check (true);
create policy "Allow anon update members" on public.members for update to anon using (true) with check (true);
create policy "Allow anon delete members" on public.members for delete to anon using (true);

-- availability_slots
 drop policy if exists "Allow anon select availability_slots" on public.availability_slots;
 drop policy if exists "Allow anon insert availability_slots" on public.availability_slots;
 drop policy if exists "Allow anon update availability_slots" on public.availability_slots;
 drop policy if exists "Allow anon delete availability_slots" on public.availability_slots;
create policy "Allow anon select availability_slots" on public.availability_slots for select to anon using (true);
create policy "Allow anon insert availability_slots" on public.availability_slots for insert to anon with check (true);
create policy "Allow anon update availability_slots" on public.availability_slots for update to anon using (true) with check (true);
create policy "Allow anon delete availability_slots" on public.availability_slots for delete to anon using (true);

-- time_slots
 drop policy if exists "Allow anon select time_slots" on public.time_slots;
 drop policy if exists "Allow anon insert time_slots" on public.time_slots;
 drop policy if exists "Allow anon update time_slots" on public.time_slots;
 drop policy if exists "Allow anon delete time_slots" on public.time_slots;
create policy "Allow anon select time_slots" on public.time_slots for select to anon using (true);
create policy "Allow anon insert time_slots" on public.time_slots for insert to anon with check (true);
create policy "Allow anon update time_slots" on public.time_slots for update to anon using (true) with check (true);
create policy "Allow anon delete time_slots" on public.time_slots for delete to anon using (true);

-- responses
 drop policy if exists "Allow anon select responses" on public.responses;
 drop policy if exists "Allow anon insert responses" on public.responses;
 drop policy if exists "Allow anon update responses" on public.responses;
 drop policy if exists "Allow anon delete responses" on public.responses;
create policy "Allow anon select responses" on public.responses for select to anon using (true);
create policy "Allow anon insert responses" on public.responses for insert to anon with check (true);
create policy "Allow anon update responses" on public.responses for update to anon using (true) with check (true);
create policy "Allow anon delete responses" on public.responses for delete to anon using (true);

-- meeting_notes
 drop policy if exists "Allow anon select meeting_notes" on public.meeting_notes;
 drop policy if exists "Allow anon insert meeting_notes" on public.meeting_notes;
 drop policy if exists "Allow anon update meeting_notes" on public.meeting_notes;
 drop policy if exists "Allow anon delete meeting_notes" on public.meeting_notes;
create policy "Allow anon select meeting_notes" on public.meeting_notes for select to anon using (true);
create policy "Allow anon insert meeting_notes" on public.meeting_notes for insert to anon with check (true);
create policy "Allow anon update meeting_notes" on public.meeting_notes for update to anon using (true) with check (true);
create policy "Allow anon delete meeting_notes" on public.meeting_notes for delete to anon using (true);

-- 固定チームを作成/更新する。ON CONFLICT を使わず、既存DBでも安全に実行できる形にする。
do $$
begin
  if exists (select 1 from public.groups where app_key = 'sampo-quest-main') then
    update public.groups
    set
      name = 'SAMPO QUEST ビジコンチーム',
      description = '空き時間を集めて、全員または多くの人が集まれる作業日時を決めるボード',
      purpose = '企画書・スライド・発表準備を進めるための予定調整',
      admin_name = coalesce(admin_name, '田丸')
    where app_key = 'sampo-quest-main';
  else
    insert into public.groups (app_key, name, description, purpose, admin_name)
    values (
      'sampo-quest-main',
      'SAMPO QUEST ビジコンチーム',
      '空き時間を集めて、全員または多くの人が集まれる作業日時を決めるボード',
      '企画書・スライド・発表準備を進めるための予定調整',
      '田丸'
    );
  end if;
end $$;
