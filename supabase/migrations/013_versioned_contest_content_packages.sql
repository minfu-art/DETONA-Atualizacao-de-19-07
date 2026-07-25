-- Pacotes imutáveis e versionados consumidos pelo motor acadêmico.
-- Migration local; não aplicar remotamente sem autorização operacional separada.

create table if not exists public.contest_content_packages (
  id uuid primary key default gen_random_uuid(),
  contest_id text not null references public.admin_contests(id) on delete restrict,
  version text not null,
  metadata jsonb not null check (jsonb_typeof(metadata) = 'object'),
  curriculum_snapshot jsonb not null check (jsonb_typeof(curriculum_snapshot) = 'array'),
  questions_version_id uuid not null references public.question_publication_versions(id) on delete restrict,
  visual_config jsonb not null check (jsonb_typeof(visual_config) = 'object'),
  content_hash text not null,
  status text not null default 'generated'
    check (status in ('draft', 'generated', 'published', 'archived', 'rolled_back')),
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  published_at timestamptz,
  unique (contest_id, version),
  unique (contest_id, content_hash)
);

create unique index if not exists contest_content_one_published_idx
  on public.contest_content_packages(contest_id)
  where status = 'published';

create index if not exists contest_content_history_idx
  on public.contest_content_packages(contest_id, created_at desc);

alter table public.contest_content_packages enable row level security;
revoke all on table public.contest_content_packages from public, anon, authenticated;
grant select, insert, update on table public.contest_content_packages to service_role;

create or replace function public.protect_published_content_package()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if old.status = 'published' and (
    new.contest_id is distinct from old.contest_id
    or new.version is distinct from old.version
    or new.metadata is distinct from old.metadata
    or new.curriculum_snapshot is distinct from old.curriculum_snapshot
    or new.questions_version_id is distinct from old.questions_version_id
    or new.visual_config is distinct from old.visual_config
    or new.content_hash is distinct from old.content_hash
    or new.created_by is distinct from old.created_by
    or new.created_at is distinct from old.created_at
  ) then
    raise exception 'published_package_is_immutable';
  end if;
  return new;
end
$$;

drop trigger if exists protect_published_content_package on public.contest_content_packages;
create trigger protect_published_content_package
  before update on public.contest_content_packages
  for each row execute function public.protect_published_content_package();

revoke all on function public.protect_published_content_package() from public, anon, authenticated;
