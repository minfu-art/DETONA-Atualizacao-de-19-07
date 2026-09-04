-- Course Factory V2: rascunhos isolados, fontes privadas e análise rastreável.
-- Nenhuma estrutura publicada (admin_contests/curriculum/questions) é alterada.

create table if not exists public.course_factory_drafts (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references auth.users(id) on delete cascade,
  status text not null default 'sources'
    check (status in ('sources', 'analyzing', 'proposed', 'analysis_failed', 'map_approved')),
  identity jsonb not null default '{}'::jsonb,
  curriculum jsonb not null default '[]'::jsonb,
  edital_map jsonb not null default '[]'::jsonb,
  analysis_summary jsonb not null default '{}'::jsonb,
  ai_provider text,
  ai_model text,
  revision integer not null default 0 check (revision >= 0),
  approved_at timestamptz,
  approved_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (jsonb_typeof(identity) = 'object'),
  check (jsonb_typeof(curriculum) = 'array'),
  check (jsonb_typeof(edital_map) = 'array'),
  check (jsonb_typeof(analysis_summary) = 'object'),
  check ((status = 'map_approved') = (approved_at is not null))
);

create table if not exists public.course_factory_sources (
  id uuid primary key default gen_random_uuid(),
  course_draft_id uuid not null references public.course_factory_drafts(id) on delete cascade,
  uploaded_by uuid not null references auth.users(id) on delete cascade,
  source_type text not null check (source_type in ('official_edital', 'complementary')),
  category text not null check (category in ('edital', 'apostila', 'legislacao', 'manual', 'material_curso', 'referencia', 'outro')),
  file_name text not null check (char_length(file_name) between 1 and 180),
  mime_type text not null check (mime_type = 'application/pdf'),
  byte_size bigint not null check (byte_size between 1 and 20971520),
  storage_path text not null unique,
  status text not null default 'awaiting_upload'
    check (status in ('awaiting_upload', 'uploaded', 'extracted', 'extraction_error')),
  page_count integer check (page_count is null or page_count between 1 and 5000),
  extraction_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists course_factory_one_official_edital_idx
  on public.course_factory_sources(course_draft_id)
  where source_type = 'official_edital';

create index if not exists course_factory_sources_draft_idx
  on public.course_factory_sources(course_draft_id, created_at);

create unique index if not exists course_factory_source_name_idx
  on public.course_factory_sources(course_draft_id, lower(file_name));

create table if not exists public.course_factory_source_pages (
  id bigint generated always as identity primary key,
  course_draft_id uuid not null references public.course_factory_drafts(id) on delete cascade,
  source_id uuid not null references public.course_factory_sources(id) on delete cascade,
  page_number integer not null check (page_number > 0),
  extracted_text text not null default '',
  status text not null check (status in ('extracted', 'empty', 'error')),
  error_message text,
  created_at timestamptz not null default now(),
  unique (source_id, page_number)
);

create index if not exists course_factory_pages_draft_idx
  on public.course_factory_source_pages(course_draft_id, source_id, page_number);

create table if not exists public.course_factory_analysis_runs (
  id uuid primary key default gen_random_uuid(),
  course_draft_id uuid not null references public.course_factory_drafts(id) on delete cascade,
  requested_by uuid not null references auth.users(id) on delete cascade,
  status text not null check (status in ('running', 'completed', 'failed')),
  provider text not null,
  model text not null,
  response_id text,
  source_count integer not null default 0 check (source_count >= 0),
  error_code text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists course_factory_analysis_runs_draft_idx
  on public.course_factory_analysis_runs(course_draft_id, created_at desc);

alter table public.course_factory_drafts enable row level security;
alter table public.course_factory_sources enable row level security;
alter table public.course_factory_source_pages enable row level security;
alter table public.course_factory_analysis_runs enable row level security;

revoke all on table public.course_factory_drafts from public, anon, authenticated;
revoke all on table public.course_factory_sources from public, anon, authenticated;
revoke all on table public.course_factory_source_pages from public, anon, authenticated;
revoke all on table public.course_factory_analysis_runs from public, anon, authenticated;
revoke all on sequence public.course_factory_source_pages_id_seq from public, anon, authenticated;

grant all on table public.course_factory_drafts to service_role;
grant all on table public.course_factory_sources to service_role;
grant all on table public.course_factory_source_pages to service_role;
grant all on table public.course_factory_analysis_runs to service_role;
grant usage, select on sequence public.course_factory_source_pages_id_seq to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('course-factory-sources', 'course-factory-sources', false, 20971520, array['application/pdf'])
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
