-- Corrige a importação editorial para validar antes de escrever e manter
-- lote, questões e auditoria dentro da mesma transação.

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
  question_source_id text;
  question_subtopic_id text;
  question_statement text;
  question_explanation text;
  question_answer jsonb;
begin
  if not exists (
    select 1
      from public.admin_contests as contest
     where contest.id = target_contest_id
     for update
  ) then
    raise exception 'contest_not_found';
  end if;

  if jsonb_typeof(imported_questions) <> 'array'
     or jsonb_array_length(imported_questions) = 0
     or jsonb_array_length(imported_questions) > 1000 then
    raise exception 'questions_invalid';
  end if;

  if exists (
    select 1
      from (
        select
          nullif(trim(coalesce(question->>'id', question->>'question_id')), '') as source_question_id,
          count(*) as occurrence_count
        from jsonb_array_elements(imported_questions) as imported(question)
        group by nullif(trim(coalesce(question->>'id', question->>'question_id')), '')
      ) as incoming
     where incoming.source_question_id is null
        or incoming.occurrence_count > 1
  ) then
    raise exception 'question_id_duplicate';
  end if;

  if exists (
    select 1
      from public.editorial_questions as existing
      join jsonb_array_elements(imported_questions) as imported(question)
        on existing.source_question_id = trim(coalesce(imported.question->>'id', imported.question->>'question_id'))
     where existing.contest_id = target_contest_id
  ) then
    raise exception 'question_id_exists';
  end if;

  -- Todas as validações de conteúdo e currículo ocorrem antes do primeiro insert.
  for item in select imported.question from jsonb_array_elements(imported_questions) as imported(question)
  loop
    question_source_id := nullif(trim(coalesce(item->>'id', item->>'question_id')), '');
    question_subtopic_id := nullif(trim(coalesce(item->>'subtopic_id', item->>'topicoEditalId')), '');
    question_statement := nullif(trim(coalesce(item->>'statement', item->>'enunciado')), '');
    question_explanation := nullif(trim(coalesce(item->>'explanation', item->>'explicacao')), '');
    question_answer := coalesce(item->'correct_answer', item->'respostaCorreta');

    if nullif(item->>'contest_id', '') is not null
       and item->>'contest_id' <> target_contest_id then
      raise exception 'question_contest_mismatch';
    end if;
    if question_source_id is null then raise exception 'question_id_missing'; end if;
    if question_subtopic_id is null then raise exception 'question_subtopic_missing'; end if;
    if question_statement is null then raise exception 'question_statement_missing'; end if;
    if question_explanation is null then raise exception 'question_explanation_missing'; end if;
    if question_answer is null or question_answer = 'null'::jsonb then
      raise exception 'question_answer_invalid';
    end if;

    select node.id
      into subtopic_uuid
      from public.admin_curriculum_nodes as node
     where node.contest_id = target_contest_id
       and node.source_id = question_subtopic_id
       and node.type = 'subtopic';

    if subtopic_uuid is null then
      if exists (
        select 1
          from public.admin_curriculum_nodes as foreign_node
         where foreign_node.source_id = question_subtopic_id
           and foreign_node.type = 'subtopic'
           and foreign_node.contest_id <> target_contest_id
      ) then
        raise exception 'question_subtopic_wrong_contest';
      end if;
      raise exception 'question_subtopic_not_found';
    end if;
  end loop;

  insert into public.question_batches (
    contest_id, name, status, source, item_count, created_by
  ) values (
    target_contest_id,
    batch_name,
    'draft',
    'json_import',
    jsonb_array_length(imported_questions),
    actor_id
  )
  returning id into created_batch_id;

  for item in select imported.question from jsonb_array_elements(imported_questions) as imported(question)
  loop
    question_source_id := trim(coalesce(item->>'id', item->>'question_id'));
    question_subtopic_id := trim(coalesce(item->>'subtopic_id', item->>'topicoEditalId'));

    select node.id
      into subtopic_uuid
      from public.admin_curriculum_nodes as node
     where node.contest_id = target_contest_id
       and node.source_id = question_subtopic_id
       and node.type = 'subtopic';

    insert into public.editorial_questions (
      id, source_question_id, batch_id, contest_id, curriculum_node_id, statement,
      options, correct_answer, explanation, difficulty, source, is_trick,
      status, author_id, payload, version
    ) values (
      target_contest_id || ':' || question_source_id,
      question_source_id,
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

  insert into public.admin_audit_log (
    actor_user_id, contest_id, module, action, target_type, target_id, metadata
  ) values (
    actor_id,
    target_contest_id,
    'editorial',
    'import_draft',
    'question_batch',
    created_batch_id::text,
    jsonb_build_object('item_count', jsonb_array_length(imported_questions))
  );

  return created_batch_id;
end
$$;

revoke all on function public.admin_import_question_draft(text, text, jsonb, uuid)
  from public, anon, authenticated;
grant execute on function public.admin_import_question_draft(text, text, jsonb, uuid)
  to service_role;
