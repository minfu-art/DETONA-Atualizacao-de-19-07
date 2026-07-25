-- Painel Central DETONA — banco editorial versionado.
-- Não substitui nem altera os 6.480 registros JSON atualmente publicados.

create table if not exists public.question_batches (
  id uuid primary key default gen_random_uuid(),
  contest_id text not null references public.admin_contests(id) on delete restrict,
  name text not null,
  status text not null default 'draft'
    check (status in ('draft', 'technical_review', 'approved', 'published', 'archived')),
  source text,
  item_count integer not null default 0 check (item_count >= 0),
  validation_errors jsonb not null default '[]'::jsonb,
  created_by uuid not null references public.profiles(id) on delete restrict,
  reviewed_by uuid references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.editorial_questions (
  id text primary key,
  batch_id uuid references public.question_batches(id) on delete restrict,
  contest_id text not null references public.admin_contests(id) on delete restrict,
  curriculum_node_id uuid references public.admin_curriculum_nodes(id) on delete restrict,
  statement text not null,
  options jsonb not null,
  correct_answer jsonb not null,
  explanation text not null,
  difficulty text,
  source text,
  is_trick boolean not null default false,
  status text not null default 'draft'
    check (status in ('draft', 'technical_review', 'approved', 'published', 'archived')),
  author_id uuid references public.profiles(id) on delete restrict,
  reviewer_id uuid references public.profiles(id) on delete restrict,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists editorial_questions_filter_idx
  on public.editorial_questions(contest_id, curriculum_node_id, status);
create index if not exists editorial_questions_batch_idx
  on public.editorial_questions(batch_id);

create table if not exists public.question_publication_versions (
  id uuid primary key default gen_random_uuid(),
  contest_id text not null references public.admin_contests(id) on delete restrict,
  version text not null,
  item_count integer not null check (item_count >= 0),
  content_hash text not null,
  storage_path text not null,
  status text not null default 'generated'
    check (status in ('generated', 'published', 'rolled_back')),
  published_by uuid references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  published_at timestamptz,
  rolled_back_at timestamptz,
  unique (contest_id, version)
);

alter table public.question_batches enable row level security;
alter table public.editorial_questions enable row level security;
alter table public.question_publication_versions enable row level security;

revoke all on table public.question_batches from public, anon, authenticated;
revoke all on table public.editorial_questions from public, anon, authenticated;
revoke all on table public.question_publication_versions from public, anon, authenticated;

grant select, insert, update, delete on table public.question_batches to service_role;
grant select, insert, update, delete on table public.editorial_questions to service_role;
grant select, insert, update on table public.question_publication_versions to service_role;

drop trigger if exists set_updated_at on public.question_batches;
create trigger set_updated_at before update on public.question_batches
  for each row execute function public.set_updated_at();
drop trigger if exists set_updated_at on public.editorial_questions;
create trigger set_updated_at before update on public.editorial_questions
  for each row execute function public.set_updated_at();
