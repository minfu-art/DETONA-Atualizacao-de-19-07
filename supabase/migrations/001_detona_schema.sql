-- DETONA CONCURSOS — schema Supabase (fase 1)
-- Auth + progresso por usuário/concurso. Questões continuam em JSON no app (fase 2).
-- Rodar no SQL Editor do Supabase ou: supabase db push

-- ---------------------------------------------------------------------------
-- Perfis (espelho público de auth.users)
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null default '',
  email text not null default '',
  role text not null default 'student' check (role in ('student', 'developer')),
  enabled_modules text[] not null default array['pc_al_2026']::text[],
  preferences jsonb not null default '{"theme":"dark","soundEnabled":true}'::jsonb,
  created_at timestamptz not null default now(),
  last_access_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists profiles_email_idx on public.profiles (email);

-- ---------------------------------------------------------------------------
-- Entitlements de concurso (biblioteca)
-- ---------------------------------------------------------------------------
create table if not exists public.contest_entitlements (
  id text primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  contest_id text not null,
  status text not null default 'active' check (status in ('active', 'revoked', 'expired')),
  source text not null default 'grant',
  granted_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, contest_id)
);

create index if not exists contest_entitlements_user_idx
  on public.contest_entitlements (user_id);

-- ---------------------------------------------------------------------------
-- Progresso genérico (espelha coleções do IndexedDB / BACKUP_COLLECTIONS)
-- ---------------------------------------------------------------------------
create table if not exists public.progress_records (
  user_id uuid not null references public.profiles (id) on delete cascade,
  contest_id text not null,
  collection text not null,
  record_key text not null,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, contest_id, collection, record_key)
);

create index if not exists progress_records_user_contest_idx
  on public.progress_records (user_id, contest_id);

create index if not exists progress_records_collection_idx
  on public.progress_records (user_id, contest_id, collection);

create index if not exists progress_records_updated_idx
  on public.progress_records (user_id, contest_id, updated_at desc);

-- ---------------------------------------------------------------------------
-- Tabelas tipadas (consultas/analytics; payload ainda vive em progress_records)
-- Fase 1: player + subtópicos espelhados para relatórios
-- ---------------------------------------------------------------------------
create table if not exists public.players (
  user_id uuid not null references public.profiles (id) on delete cascade,
  contest_id text not null,
  player_id text not null,
  name text not null default '',
  level integer not null default 0,
  mastery_pct numeric(6, 2) not null default 0,
  xp integer not null default 0,
  streak_days integer not null default 0,
  edital_completion_pct numeric(6, 2) not null default 0,
  onboarded boolean not null default false,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, contest_id)
);

create table if not exists public.subtopic_progress (
  user_id uuid not null references public.profiles (id) on delete cascade,
  contest_id text not null,
  subtopic_id text not null,
  discipline_id text not null default '',
  stars integer not null default 0,
  best_accuracy numeric(6, 2) not null default 0,
  attempts_count integer not null default 0,
  last_studied_at timestamptz,
  memory_temperature text,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, contest_id, subtopic_id)
);

create index if not exists subtopic_progress_discipline_idx
  on public.subtopic_progress (user_id, contest_id, discipline_id);

create table if not exists public.daily_logs (
  user_id uuid not null references public.profiles (id) on delete cascade,
  contest_id text not null,
  log_date date not null,
  planned_amount integer not null default 0,
  completed_amount integer not null default 0,
  status text not null default 'pendente',
  xp_earned integer not null default 0,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, contest_id, log_date)
);

create table if not exists public.review_queue (
  user_id uuid not null references public.profiles (id) on delete cascade,
  contest_id text not null,
  question_id text not null,
  subtopic_id text not null default '',
  discipline_id text not null default '',
  next_review_at timestamptz,
  status text not null default 'pending',
  priority_score numeric(10, 2) not null default 0,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, contest_id, question_id)
);

create table if not exists public.wellbeing_logs (
  user_id uuid not null references public.profiles (id) on delete cascade,
  contest_id text not null,
  log_id text not null,
  habit_id text not null default '',
  log_date date,
  amount_done numeric(10, 2) not null default 0,
  completed boolean not null default false,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, contest_id, log_id)
);

create table if not exists public.routine_blocks (
  user_id uuid not null references public.profiles (id) on delete cascade,
  contest_id text not null,
  block_id text not null,
  block_date date,
  status text not null default 'planned',
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, contest_id, block_id)
);

create index if not exists routine_blocks_date_idx
  on public.routine_blocks (user_id, contest_id, block_date);

-- ---------------------------------------------------------------------------
-- updated_at helper
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'profiles', 'contest_entitlements', 'progress_records', 'players',
    'subtopic_progress', 'daily_logs', 'review_queue', 'wellbeing_logs', 'routine_blocks'
  ]
  loop
    execute format(
      'drop trigger if exists set_updated_at on public.%I; create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at();',
      t, t
    );
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Auto-criar profile ao registrar em auth.users
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, name, email, created_at, last_access_at)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', split_part(coalesce(new.email, ''), '@', 1), 'Aluno'),
    coalesce(new.email, ''),
    now(),
    now()
  )
  on conflict (id) do update
    set email = excluded.email,
        last_access_at = now();
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.contest_entitlements enable row level security;
alter table public.progress_records enable row level security;
alter table public.players enable row level security;
alter table public.subtopic_progress enable row level security;
alter table public.daily_logs enable row level security;
alter table public.review_queue enable row level security;
alter table public.wellbeing_logs enable row level security;
alter table public.routine_blocks enable row level security;

-- profiles
drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles
  for select using (auth.uid() = id);

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists profiles_insert_own on public.profiles;
create policy profiles_insert_own on public.profiles
  for insert with check (auth.uid() = id);

-- contest_entitlements
drop policy if exists entitlements_select_own on public.contest_entitlements;
create policy entitlements_select_own on public.contest_entitlements
  for select using (auth.uid() = user_id);

drop policy if exists entitlements_write_own on public.contest_entitlements;
create policy entitlements_write_own on public.contest_entitlements
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- progress_records
drop policy if exists progress_select_own on public.progress_records;
create policy progress_select_own on public.progress_records
  for select using (auth.uid() = user_id);

drop policy if exists progress_insert_own on public.progress_records;
create policy progress_insert_own on public.progress_records
  for insert with check (auth.uid() = user_id);

drop policy if exists progress_update_own on public.progress_records;
create policy progress_update_own on public.progress_records
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists progress_delete_own on public.progress_records;
create policy progress_delete_own on public.progress_records
  for delete using (auth.uid() = user_id);

-- players
drop policy if exists players_all_own on public.players;
create policy players_all_own on public.players
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- subtopic_progress
drop policy if exists subtopic_all_own on public.subtopic_progress;
create policy subtopic_all_own on public.subtopic_progress
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- daily_logs
drop policy if exists daily_logs_all_own on public.daily_logs;
create policy daily_logs_all_own on public.daily_logs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- review_queue
drop policy if exists review_queue_all_own on public.review_queue;
create policy review_queue_all_own on public.review_queue
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- wellbeing_logs
drop policy if exists wellbeing_logs_all_own on public.wellbeing_logs;
create policy wellbeing_logs_all_own on public.wellbeing_logs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- routine_blocks
drop policy if exists routine_blocks_all_own on public.routine_blocks;
create policy routine_blocks_all_own on public.routine_blocks
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Realtime opcional (descomente se quiser live sync)
-- ---------------------------------------------------------------------------
-- alter publication supabase_realtime add table public.progress_records;
