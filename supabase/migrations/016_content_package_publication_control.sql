-- Controle operacional reversivel dos pacotes de conteudo.
-- Preserva o pacote imutavel, os entitlements e o progresso dos alunos.

create or replace function public.admin_unpublish_content_package(
  target_contest_id text,
  target_package_id uuid,
  confirmation text,
  actor_id uuid
)
returns public.contest_content_packages
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  locked_contest public.admin_contests;
  target_package public.contest_content_packages;
begin
  if not exists (
    select 1 from public.profiles where id = actor_id and role = 'developer'
  ) then raise exception 'developer_required'; end if;

  select * into locked_contest
    from public.admin_contests
   where id = target_contest_id
   for update;
  if not found then raise exception 'contest_not_found'; end if;
  if confirmation is distinct from locked_contest.code then
    raise exception 'unpublish_confirmation_invalid';
  end if;

  select * into target_package
    from public.contest_content_packages
   where id = target_package_id
     and contest_id = target_contest_id
     and status = 'published'
   for update;
  if not found then raise exception 'published_package_not_found'; end if;

  update public.contest_content_packages
     set status = 'archived'
   where id = target_package.id
  returning * into target_package;

  insert into public.admin_audit_log (
    actor_user_id, contest_id, module, action, target_type, target_id, metadata
  ) values (
    actor_id,
    target_contest_id,
    'contests',
    'unpublish_content_package',
    'content_package',
    target_package.id::text,
    jsonb_build_object(
      'version', target_package.version,
      'content_hash', target_package.content_hash,
      'published_at_preserved', target_package.published_at
    )
  );

  return target_package;
end
$$;

create or replace function public.admin_restore_content_package(
  target_contest_id text,
  target_package_id uuid,
  confirmation text,
  actor_id uuid
)
returns public.contest_content_packages
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  locked_contest public.admin_contests;
  current_package public.contest_content_packages;
  target_package public.contest_content_packages;
  target_questions public.question_publication_versions;
  restored_at_value timestamptz := now();
begin
  if not exists (
    select 1 from public.profiles where id = actor_id and role = 'developer'
  ) then raise exception 'developer_required'; end if;

  select * into locked_contest
    from public.admin_contests
   where id = target_contest_id
   for update;
  if not found then raise exception 'contest_not_found'; end if;
  if confirmation is distinct from locked_contest.code then
    raise exception 'restore_confirmation_invalid';
  end if;

  select * into target_package
    from public.contest_content_packages
   where id = target_package_id
     and contest_id = target_contest_id
     and status in ('archived', 'rolled_back')
   for update;
  if not found then raise exception 'restore_package_not_found'; end if;

  select * into target_questions
    from public.question_publication_versions
   where id = target_package.questions_version_id
     and contest_id = target_contest_id
     and status in ('generated', 'rolled_back', 'published')
   for update;
  if not found then raise exception 'restore_question_snapshot_not_found'; end if;
  if not exists (
    select 1 from public.question_publication_items
     where version_id = target_questions.id
       and contest_id = target_contest_id
  ) then raise exception 'restore_question_snapshot_not_found'; end if;

  select * into current_package
    from public.contest_content_packages
   where contest_id = target_contest_id
     and status = 'published'
   for update;

  if found then
    update public.contest_content_packages
       set status = 'rolled_back'
     where id = current_package.id;

    if current_package.questions_version_id <> target_questions.id then
      update public.question_publication_versions
         set status = 'rolled_back',
             rolled_back_at = restored_at_value
       where id = current_package.questions_version_id
         and status = 'published';
    end if;
  end if;

  update public.question_publication_versions
     set status = 'published',
         published_at = coalesce(published_at, restored_at_value),
         published_by = actor_id,
         rolled_back_at = null
   where id = target_questions.id;

  update public.contest_content_packages
     set status = 'published'
   where id = target_package.id
  returning * into target_package;

  insert into public.admin_audit_log (
    actor_user_id, contest_id, module, action, target_type, target_id, metadata
  ) values (
    actor_id,
    target_contest_id,
    'contests',
    'restore_content_package',
    'content_package',
    target_package.id::text,
    jsonb_build_object(
      'restored_version', target_package.version,
      'content_hash', target_package.content_hash,
      'replaced_package_id', current_package.id,
      'questions_version_id', target_questions.id
    )
  );

  return target_package;
end
$$;

revoke all on function public.admin_unpublish_content_package(text, uuid, text, uuid)
  from public, anon, authenticated;
revoke all on function public.admin_restore_content_package(text, uuid, text, uuid)
  from public, anon, authenticated;

grant execute on function public.admin_unpublish_content_package(text, uuid, text, uuid)
  to service_role;
grant execute on function public.admin_restore_content_package(text, uuid, text, uuid)
  to service_role;
