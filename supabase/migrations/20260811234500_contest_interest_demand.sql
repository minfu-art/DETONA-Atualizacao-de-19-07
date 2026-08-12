-- Fase 10C: sinal de demanda comercial sem PII duplicada ou concessao de acesso.

alter table public.admin_contests
  drop constraint if exists admin_contests_sales_status_check;

alter table public.admin_contests
  add constraint admin_contests_sales_status_check
  check (sales_status in ('unavailable', 'monitoring', 'coming_soon', 'available', 'suspended'));

alter table public.admin_contests
  add column if not exists interest_goal integer;

alter table public.admin_contests
  drop constraint if exists admin_contests_interest_goal_check;

alter table public.admin_contests
  add constraint admin_contests_interest_goal_check
  check (interest_goal is null or interest_goal > 0);

create table if not exists public.contest_interests (
  user_id uuid not null references public.profiles(id) on delete cascade,
  contest_id text not null references public.admin_contests(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, contest_id)
);

create index if not exists contest_interests_contest_id_idx
  on public.contest_interests(contest_id);

alter table public.contest_interests enable row level security;

revoke all on table public.contest_interests from public, anon, authenticated;
grant select, insert, delete on table public.contest_interests to service_role;

create or replace view public.contest_interest_counts
with (security_invoker = true)
as
select contest_id, count(*)::bigint as interest_count
from public.contest_interests
group by contest_id;

revoke all on table public.contest_interest_counts from public, anon, authenticated;
grant select on table public.contest_interest_counts to service_role;

create or replace view public.contest_catalog_subtopic_counts
with (security_invoker = true)
as
select contest_id, count(*)::bigint as subtopic_count
from public.admin_curriculum_nodes
where type = 'subtopic'
  and status <> 'archived'
group by contest_id;

revoke all on table public.contest_catalog_subtopic_counts from public, anon, authenticated;
grant select on table public.contest_catalog_subtopic_counts to service_role;

create or replace view public.contest_catalog_question_counts
with (security_invoker = true)
as
select distinct on (contest_id)
  contest_id,
  item_count::bigint as question_count
from public.question_publication_versions
where status in ('generated', 'published')
order by contest_id, created_at desc;

revoke all on table public.contest_catalog_question_counts from public, anon, authenticated;
grant select on table public.contest_catalog_question_counts to service_role;

comment on table public.contest_interests is
  'Sinal de demanda do produto. Nao representa entitlement nem consentimento de marketing externo.';
comment on column public.admin_contests.interest_goal is
  'Meta administrativa informativa; nunca altera estados do concurso automaticamente.';
