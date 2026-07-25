-- Fábrica de concursos: imports transacionais em rascunho.
-- Migration local; não aplicar remotamente sem autorização operacional separada.

alter table public.admin_curriculum_nodes
  add column if not exists source_id text,
  add column if not exists import_version integer not null default 1;

create unique index if not exists admin_curriculum_contest_source_idx
  on public.admin_curriculum_nodes(contest_id, source_id)
  where source_id is not null;

alter table public.editorial_questions
  add column if not exists source_question_id text,
  add column if not exists version integer not null default 1;

create unique index if not exists editorial_questions_contest_source_idx
  on public.editorial_questions(contest_id, source_question_id)
  where source_question_id is not null;

create or replace function public.admin_replace_curriculum_draft(
  target_contest_id text,
  imported_nodes jsonb,
  allow_replace boolean default false
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  contest_status text;
  item jsonb;
  parent_uuid uuid;
  inserted_count integer := 0;
begin
  select content_status into contest_status
    from public.admin_contests
   where id = target_contest_id
   for update;
  if contest_status is null then raise exception 'contest_not_found'; end if;
  if contest_status in ('ready', 'archived') then raise exception 'published_curriculum_is_immutable'; end if;
  if jsonb_typeof(imported_nodes) <> 'array' or jsonb_array_length(imported_nodes) = 0 then
    raise exception 'curriculum_import_invalid';
  end if;
  if exists (select 1 from public.admin_curriculum_nodes where contest_id = target_contest_id) and not allow_replace then
    raise exception 'curriculum_draft_exists';
  end if;
  if allow_replace then
    if exists (
      select 1 from public.editorial_questions
       where contest_id = target_contest_id and status in ('approved', 'published')
    ) then raise exception 'approved_questions_preserve_curriculum'; end if;
    delete from public.admin_curriculum_nodes where contest_id = target_contest_id;
  end if;
  for item in select value from jsonb_array_elements(imported_nodes)
  loop
    parent_uuid := null;
    if nullif(item->>'parent_source_id', '') is not null then
      select id into parent_uuid
        from public.admin_curriculum_nodes
       where contest_id = target_contest_id
         and source_id = item->>'parent_source_id';
      if parent_uuid is null then raise exception 'curriculum_parent_missing'; end if;
    end if;
    insert into public.admin_curriculum_nodes (
      contest_id, parent_id, source_id, type, name, description, order_index, status, import_version
    ) values (
      target_contest_id,
      parent_uuid,
      item->>'source_id',
      item->>'type',
      item->>'name',
      nullif(item->>'description', ''),
      (item->>'order_index')::integer,
      'draft',
      1
    );
    inserted_count := inserted_count + 1;
  end loop;
  return inserted_count;
end
$$;

create or replace function public.admin_import_question_draft(
  target_contest_id text,
  batch_name text,
  imported_questions jsonb,
  actor_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  created_batch_id uuid;
  item jsonb;
  subtopic_uuid uuid;
  source_id text;
begin
  if jsonb_typeof(imported_questions) <> 'array' or jsonb_array_length(imported_questions) = 0 then
    raise exception 'questions_invalid';
  end if;
  insert into public.question_batches (contest_id, name, status, source, item_count, created_by)
  values (target_contest_id, batch_name, 'draft', 'json_import', jsonb_array_length(imported_questions), actor_id)
  returning id into created_batch_id;
  for item in select value from jsonb_array_elements(imported_questions)
  loop
    source_id := coalesce(item->>'id', item->>'question_id');
    select id into subtopic_uuid
      from public.admin_curriculum_nodes
     where contest_id = target_contest_id
       and source_id = coalesce(item->>'subtopic_id', item->>'topicoEditalId')
       and type = 'subtopic';
    if subtopic_uuid is null then raise exception 'question_subtopic_not_found'; end if;
    insert into public.editorial_questions (
      id, source_question_id, batch_id, contest_id, curriculum_node_id, statement,
      options, correct_answer, explanation, difficulty, source, is_trick,
      status, author_id, payload, version
    ) values (
      target_contest_id || ':' || source_id,
      source_id,
      created_batch_id,
      target_contest_id,
      subtopic_uuid,
      coalesce(item->>'statement', item->>'enunciado'),
      coalesce(item->'options', item->'alternativas', '[]'::jsonb),
      coalesce(item->'correct_answer', item->'respostaCorreta'),
      coalesce(item->>'explanation', item->>'explicacao'),
      coalesce(item->>'difficulty', item->>'dificuldade'),
      coalesce(item->>'source', 'json_import'),
      coalesce((item->>'is_trick')::boolean, false),
      'draft',
      actor_id,
      item,
      1
    );
  end loop;
  return created_batch_id;
end
$$;

revoke all on function public.admin_replace_curriculum_draft(text, jsonb, boolean) from public, anon, authenticated;
revoke all on function public.admin_import_question_draft(text, text, jsonb, uuid) from public, anon, authenticated;
grant execute on function public.admin_replace_curriculum_draft(text, jsonb, boolean) to service_role;
grant execute on function public.admin_import_question_draft(text, text, jsonb, uuid) to service_role;
