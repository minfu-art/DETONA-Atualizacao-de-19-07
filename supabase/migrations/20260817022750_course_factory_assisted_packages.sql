-- Course Factory V3: pacotes assistidos por ChatGPT/Codex, sem API paga no app.
-- Mantém o conteúdo importado isolado dos cursos e questões publicados.

alter table public.course_factory_drafts
  drop constraint if exists course_factory_drafts_status_check;

alter table public.course_factory_drafts
  add constraint course_factory_drafts_status_check check (status in (
    'sources', 'analyzing', 'proposed', 'analysis_failed',
    'package_validated', 'package_imported', 'validation_failed', 'map_approved'
  ));

alter table public.course_factory_drafts
  add column if not exists package_hash text,
  add column if not exists package_schema_version integer,
  add column if not exists package_metadata jsonb not null default '{}'::jsonb,
  add column if not exists sources_manifest jsonb not null default '[]'::jsonb,
  add column if not exists microknowledges jsonb not null default '[]'::jsonb,
  add column if not exists validation_report jsonb not null default '{}'::jsonb,
  add column if not exists coverage jsonb not null default '{}'::jsonb,
  add column if not exists question_count integer not null default 0,
  add column if not exists package_imported_at timestamptz;

alter table public.course_factory_drafts
  add constraint course_factory_package_hash_format check (
    package_hash is null or package_hash ~ '^[a-f0-9]{64}$'
  ),
  add constraint course_factory_package_schema_version_check check (
    package_schema_version is null or package_schema_version = 1
  ),
  add constraint course_factory_question_count_check check (question_count >= 0),
  add constraint course_factory_package_metadata_object check (jsonb_typeof(package_metadata) = 'object'),
  add constraint course_factory_sources_manifest_array check (jsonb_typeof(sources_manifest) = 'array'),
  add constraint course_factory_microknowledges_array check (jsonb_typeof(microknowledges) = 'array'),
  add constraint course_factory_validation_report_object check (jsonb_typeof(validation_report) = 'object'),
  add constraint course_factory_coverage_object check (jsonb_typeof(coverage) = 'object');

create table if not exists public.course_factory_draft_questions (
  id uuid primary key default gen_random_uuid(),
  course_draft_id uuid not null references public.course_factory_drafts(id) on delete cascade,
  source_question_id text not null check (source_question_id ~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,159}$'),
  subtopic_id text not null check (subtopic_id ~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,159}$'),
  microknowledge_ids jsonb not null default '[]'::jsonb check (jsonb_typeof(microknowledge_ids) = 'array'),
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  traces jsonb not null default '[]'::jsonb check (jsonb_typeof(traces) = 'array'),
  batch_name text not null check (char_length(batch_name) between 1 and 160),
  order_index integer not null default 0 check (order_index >= 0),
  created_at timestamptz not null default now(),
  unique (course_draft_id, source_question_id)
);

create index if not exists course_factory_draft_questions_draft_idx
  on public.course_factory_draft_questions(course_draft_id, order_index);
create index if not exists course_factory_draft_questions_subtopic_idx
  on public.course_factory_draft_questions(course_draft_id, subtopic_id);

create table if not exists public.course_factory_audit_events (
  id bigint generated always as identity primary key,
  course_draft_id uuid not null references public.course_factory_drafts(id) on delete cascade,
  actor_user_id uuid not null references auth.users(id) on delete cascade,
  action text not null check (action in ('package_imported', 'map_approved')),
  package_hash text check (package_hash is null or package_hash ~ '^[a-f0-9]{64}$'),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now()
);

create index if not exists course_factory_audit_events_draft_idx
  on public.course_factory_audit_events(course_draft_id, created_at desc);
create index if not exists course_factory_audit_events_actor_idx
  on public.course_factory_audit_events(actor_user_id);

alter table public.course_factory_draft_questions enable row level security;
alter table public.course_factory_audit_events enable row level security;

revoke all on table public.course_factory_draft_questions from public, anon, authenticated;
revoke all on table public.course_factory_audit_events from public, anon, authenticated;
revoke all on sequence public.course_factory_audit_events_id_seq from public, anon, authenticated;

grant all on table public.course_factory_draft_questions to service_role;
grant all on table public.course_factory_audit_events to service_role;
grant usage, select on sequence public.course_factory_audit_events_id_seq to service_role;

create or replace function public.import_course_factory_assisted_package(
  p_draft_id uuid,
  p_actor_user_id uuid,
  p_identity jsonb,
  p_curriculum jsonb,
  p_edital_map jsonb,
  p_microknowledges jsonb,
  p_sources_manifest jsonb,
  p_package_metadata jsonb,
  p_validation_report jsonb,
  p_coverage jsonb,
  p_package_hash text,
  p_questions jsonb
) returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_question_count integer;
begin
  if p_actor_user_id is null or p_package_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'invalid_assisted_package';
  end if;
  if not exists (
    select 1 from public.course_factory_drafts
    where id = p_draft_id and created_by = p_actor_user_id and status <> 'map_approved'
  ) then
    raise exception 'course_draft_not_found_or_locked';
  end if;

  delete from public.course_factory_draft_questions where course_draft_id = p_draft_id;

  insert into public.course_factory_draft_questions (
    course_draft_id, source_question_id, subtopic_id, microknowledge_ids,
    payload, traces, batch_name, order_index
  )
  select p_draft_id, row.source_question_id, row.subtopic_id, row.microknowledge_ids,
    row.payload, row.traces, row.batch_name, row.order_index
  from jsonb_to_recordset(coalesce(p_questions, '[]'::jsonb)) as row(
    source_question_id text,
    subtopic_id text,
    microknowledge_ids jsonb,
    payload jsonb,
    traces jsonb,
    batch_name text,
    order_index integer
  );

  get diagnostics v_question_count = row_count;

  update public.course_factory_drafts set
    identity = p_identity,
    curriculum = p_curriculum,
    edital_map = p_edital_map,
    microknowledges = p_microknowledges,
    sources_manifest = p_sources_manifest,
    package_metadata = p_package_metadata,
    validation_report = p_validation_report,
    coverage = p_coverage,
    package_hash = p_package_hash,
    package_schema_version = 1,
    question_count = v_question_count,
    package_imported_at = now(),
    status = 'package_imported',
    revision = revision + 1,
    ai_provider = null,
    ai_model = null,
    updated_at = now()
  where id = p_draft_id and created_by = p_actor_user_id;

  insert into public.course_factory_audit_events (
    course_draft_id, actor_user_id, action, package_hash, metadata
  ) values (
    p_draft_id, p_actor_user_id, 'package_imported', p_package_hash,
    jsonb_build_object(
      'questions', v_question_count,
      'coverage', p_coverage,
      'automatic_ai', false
    )
  );
end;
$$;

revoke all on function public.import_course_factory_assisted_package(
  uuid, uuid, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, text, jsonb
) from public, anon, authenticated;
grant execute on function public.import_course_factory_assisted_package(
  uuid, uuid, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, text, jsonb
) to service_role;

create or replace function public.approve_course_factory_assisted_map(
  p_draft_id uuid,
  p_actor_user_id uuid
) returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_draft public.course_factory_drafts%rowtype;
begin
  select * into v_draft
  from public.course_factory_drafts
  where id = p_draft_id
    and created_by = p_actor_user_id
    and status = 'package_imported'
    and validation_report ->> 'valid' = 'true'
  for update;

  if not found then
    raise exception 'package_not_ready';
  end if;

  update public.course_factory_drafts set
    status = 'map_approved',
    approved_at = now(),
    approved_by = p_actor_user_id,
    revision = revision + 1,
    updated_at = now()
  where id = p_draft_id;

  insert into public.course_factory_audit_events (
    course_draft_id, actor_user_id, action, package_hash, metadata
  ) values (
    p_draft_id, p_actor_user_id, 'map_approved', v_draft.package_hash,
    jsonb_build_object(
      'question_count', v_draft.question_count,
      'coverage', v_draft.coverage,
      'publication_enabled', false
    )
  );
end;
$$;

revoke all on function public.approve_course_factory_assisted_map(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.approve_course_factory_assisted_map(uuid, uuid)
  to service_role;
