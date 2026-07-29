-- Eventos ranqueados isolados do motor acadêmico do DETONA.

create table public.ranked_study_events (
  id uuid primary key default gen_random_uuid(),
  contest_id text not null references public.admin_contests(id) on delete restrict,
  title text not null check (char_length(title) between 3 and 160),
  description text not null check (char_length(description) between 3 and 1000),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  registration_starts_at timestamptz not null,
  registration_ends_at timestamptz not null,
  duration_minutes integer not null check (duration_minutes between 1 and 360),
  question_count integer not null check (question_count between 1 and 200),
  scoring_mode text not null check (scoring_mode in ('simple', 'cebraspe')),
  ranking_release_mode text not null check (ranking_release_mode in ('immediate', 'after_event')),
  status text not null default 'draft'
    check (status in ('draft', 'scheduled', 'registration_open', 'live', 'finished', 'cancelled')),
  result_display_hours integer not null default 24 check (result_display_hours between 1 and 168),
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz,
  cancelled_at timestamptz,
  unique (id, contest_id),
  constraint ranked_event_period_valid check (ends_at > starts_at),
  constraint ranked_event_registration_valid check (
    registration_ends_at > registration_starts_at
    and registration_ends_at <= starts_at
  )
);

create table public.ranked_event_questions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.ranked_study_events(id) on delete cascade,
  contest_id text not null references public.admin_contests(id) on delete restrict,
  question_id text not null,
  order_index integer not null check (order_index >= 0),
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  content_hash text not null check (char_length(content_hash) = 64),
  created_at timestamptz not null default now(),
  unique (event_id, question_id),
  unique (event_id, order_index),
  foreign key (event_id, contest_id)
    references public.ranked_study_events(id, contest_id) on delete cascade
);

create table public.ranked_event_attempts (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.ranked_study_events(id) on delete restrict,
  user_id uuid not null references public.profiles(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 80),
  avatar text,
  started_at timestamptz,
  submitted_at timestamptz,
  elapsed_seconds integer check (elapsed_seconds is null or elapsed_seconds >= 0),
  correct_count integer not null default 0 check (correct_count >= 0),
  incorrect_count integer not null default 0 check (incorrect_count >= 0),
  blank_count integer not null default 0 check (blank_count >= 0),
  score numeric(10,2) not null default 0,
  accuracy numeric(6,3) not null default 0 check (accuracy between 0 and 100),
  status text not null default 'registered'
    check (status in ('registered', 'started', 'submitted', 'timed_out', 'disqualified')),
  answers jsonb not null default '[]'::jsonb check (jsonb_typeof(answers) = 'array'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, user_id)
);

create index ranked_events_contest_window_idx
  on public.ranked_study_events(contest_id, starts_at, ends_at);
create index ranked_event_questions_event_order_idx
  on public.ranked_event_questions(event_id, order_index);
create index ranked_attempts_event_ranking_idx
  on public.ranked_event_attempts(event_id, score desc, accuracy desc, elapsed_seconds, submitted_at);

create trigger ranked_events_set_updated_at
before update on public.ranked_study_events
for each row execute function public.set_updated_at();

create trigger ranked_attempts_set_updated_at
before update on public.ranked_event_attempts
for each row execute function public.set_updated_at();

create or replace function public.protect_ranked_event_snapshot()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  raise exception 'ranked_event_question_snapshot_is_immutable';
end
$$;

create trigger protect_ranked_event_snapshot
before update or delete on public.ranked_event_questions
for each row execute function public.protect_ranked_event_snapshot();

create or replace function public.protect_published_ranked_event()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if old.status <> 'draft' and (
    new.contest_id is distinct from old.contest_id
    or new.title is distinct from old.title
    or new.description is distinct from old.description
    or new.starts_at is distinct from old.starts_at
    or new.ends_at is distinct from old.ends_at
    or new.registration_starts_at is distinct from old.registration_starts_at
    or new.registration_ends_at is distinct from old.registration_ends_at
    or new.duration_minutes is distinct from old.duration_minutes
    or new.question_count is distinct from old.question_count
    or new.scoring_mode is distinct from old.scoring_mode
    or new.ranking_release_mode is distinct from old.ranking_release_mode
    or new.created_by is distinct from old.created_by
  ) then
    raise exception 'published_ranked_event_is_immutable';
  end if;
  return new;
end
$$;

create trigger protect_published_ranked_event
before update on public.ranked_study_events
for each row execute function public.protect_published_ranked_event();

alter table public.ranked_study_events enable row level security;
alter table public.ranked_event_questions enable row level security;
alter table public.ranked_event_attempts enable row level security;

revoke all on table public.ranked_study_events from public, anon, authenticated, service_role;
revoke all on table public.ranked_event_questions from public, anon, authenticated, service_role;
revoke all on table public.ranked_event_attempts from public, anon, authenticated, service_role;

grant select on table public.ranked_study_events to authenticated;
grant select on table public.ranked_event_attempts to authenticated;
grant select, insert, update, delete on table public.ranked_study_events to service_role;
grant select, insert, update, delete on table public.ranked_event_questions to service_role;
grant select, insert, update, delete on table public.ranked_event_attempts to service_role;

create policy ranked_events_student_select
on public.ranked_study_events
for select
to authenticated
using (
  status <> 'draft'
  and exists (
    select 1
    from public.contest_entitlements entitlement
    where entitlement.user_id = (select auth.uid())
      and entitlement.contest_id = ranked_study_events.contest_id
      and entitlement.status = 'active'
  )
);

create policy ranked_attempts_owner_select
on public.ranked_event_attempts
for select
to authenticated
using ((select auth.uid()) = user_id);

-- Questões congeladas, respostas e alterações permanecem exclusivamente no
-- endpoint server-side. Nenhum papel do frontend recebe escrita direta.

revoke all on function public.protect_ranked_event_snapshot() from public, anon, authenticated;
revoke all on function public.protect_published_ranked_event() from public, anon, authenticated;
grant execute on function public.protect_ranked_event_snapshot() to service_role;
grant execute on function public.protect_published_ranked_event() to service_role;
