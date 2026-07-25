-- Endurecimento final da Fábrica de Concursos.
-- Snapshots imutáveis e operações críticas atômicas.
-- Migration local; não aplicar remotamente sem autorização operacional separada.

alter table public.question_publication_versions
  alter column storage_path drop not null;

create table if not exists public.question_publication_items (
  version_id uuid not null references public.question_publication_versions(id) on delete restrict,
  contest_id text not null references public.admin_contests(id) on delete restrict,
  source_question_id text not null,
  order_index integer not null check (order_index >= 0),
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  created_at timestamptz not null default now(),
  primary key (version_id, source_question_id),
  unique (version_id, order_index)
);

create index if not exists question_publication_items_version_order_idx
  on public.question_publication_items(version_id, order_index);
create index if not exists question_publication_items_contest_version_idx
  on public.question_publication_items(contest_id, version_id);

alter table public.question_publication_items enable row level security;
revoke all on table public.question_publication_items from public, anon, authenticated;
grant select, insert on table public.question_publication_items to service_role;

create or replace function public.protect_question_publication_item()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  raise exception 'question_snapshot_is_immutable';
end
$$;

drop trigger if exists protect_question_publication_item on public.question_publication_items;
create trigger protect_question_publication_item
  before update or delete on public.question_publication_items
  for each row execute function public.protect_question_publication_item();

create or replace function public.protect_question_publication_version()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if old.status in ('published', 'rolled_back') and (
    new.contest_id is distinct from old.contest_id
    or new.version is distinct from old.version
    or new.item_count is distinct from old.item_count
    or new.content_hash is distinct from old.content_hash
    or new.storage_path is distinct from old.storage_path
    or new.created_at is distinct from old.created_at
  ) then
    raise exception 'question_snapshot_version_is_immutable';
  end if;
  return new;
end
$$;

drop trigger if exists protect_question_publication_version on public.question_publication_versions;
create trigger protect_question_publication_version
  before update on public.question_publication_versions
  for each row execute function public.protect_question_publication_version();

create unique index if not exists question_publication_one_published_idx
  on public.question_publication_versions(contest_id)
  where status = 'published';

create table if not exists public.media_upload_sessions (
  id uuid primary key default gen_random_uuid(),
  contest_id text not null references public.admin_contests(id) on delete restrict,
  storage_path text not null unique,
  mime_type text not null check (mime_type in ('image/png', 'image/webp')),
  byte_size bigint not null check (byte_size > 0 and byte_size <= 8388608),
  status text not null default 'pending'
    check (status in ('pending', 'registered', 'cancelled', 'expired')),
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '1 hour'),
  completed_at timestamptz
);

create index if not exists media_upload_sessions_expiry_idx
  on public.media_upload_sessions(status, expires_at)
  where status = 'pending';

alter table public.media_upload_sessions enable row level security;
revoke all on table public.media_upload_sessions from public, anon, authenticated;
grant select, insert, update on table public.media_upload_sessions to service_role;

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
      select 1
        from public.editorial_questions
       where contest_id = target_contest_id
    ) then
      raise exception 'curriculum_has_linked_questions';
    end if;
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

create or replace function public.admin_generate_question_snapshot(
  target_contest_id text,
  snapshot_version text,
  actor_id uuid
)
returns public.question_publication_versions
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  created_version public.question_publication_versions;
  approved_count integer;
  snapshot_hash text;
begin
  if not exists (
    select 1 from public.profiles where id = actor_id and role = 'developer'
  ) then raise exception 'developer_required'; end if;

  perform 1 from public.admin_contests where id = target_contest_id for update;
  if not found then raise exception 'contest_not_found'; end if;

  select count(*)::integer into approved_count
    from public.editorial_questions
   where contest_id = target_contest_id
     and status = 'approved';
  if approved_count = 0 then raise exception 'approved_questions_required'; end if;

  insert into public.question_publication_versions (
    contest_id, version, item_count, content_hash, storage_path, status
  ) values (
    target_contest_id, snapshot_version, 0, 'pending', null, 'generated'
  ) returning * into created_version;

  insert into public.question_publication_items (
    version_id, contest_id, source_question_id, order_index, payload
  )
  select
    created_version.id,
    target_contest_id,
    q.source_question_id,
    row_number() over (order by q.source_question_id)::integer - 1,
    q.payload
  from public.editorial_questions q
  where q.contest_id = target_contest_id
    and q.status = 'approved'
  order by q.source_question_id;

  select encode(
    extensions.digest(
      convert_to(coalesce(jsonb_agg(payload order by order_index), '[]'::jsonb)::text, 'UTF8'),
      'sha256'
    ),
    'hex'
  ) into snapshot_hash
  from public.question_publication_items
  where version_id = created_version.id;

  update public.question_publication_versions
     set item_count = approved_count,
         content_hash = snapshot_hash
   where id = created_version.id
  returning * into created_version;

  insert into public.admin_audit_log (
    actor_user_id, contest_id, module, action, target_type, target_id, metadata
  ) values (
    actor_id,
    target_contest_id,
    'editorial',
    'generate_question_snapshot',
    'question_publication_version',
    created_version.id::text,
    jsonb_build_object(
      'version', snapshot_version,
      'item_count', approved_count,
      'content_hash', snapshot_hash
    )
  );

  return created_version;
end
$$;

create or replace function public.admin_publish_content_package(
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
  published_package public.contest_content_packages;
  target_questions public.question_publication_versions;
  published_at_value timestamptz := now();
  snapshot_item_count integer;
  visual_asset_ids uuid[];
  valid_visual_count integer;
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
    raise exception 'publication_confirmation_invalid';
  end if;

  select * into target_package
    from public.contest_content_packages
   where id = target_package_id
     and contest_id = target_contest_id
     and status = 'generated'
   for update;
  if not found then raise exception 'generated_package_not_found'; end if;

  select * into target_questions
    from public.question_publication_versions
   where id = target_package.questions_version_id
     and contest_id = target_contest_id
     and status in ('generated', 'rolled_back', 'published')
   for update;
  if not found then raise exception 'question_snapshot_not_found'; end if;

  select count(*)::integer into snapshot_item_count
    from public.question_publication_items
   where version_id = target_questions.id
     and contest_id = target_contest_id;

  if not (
    nullif(target_package.metadata->>'name', '') is not null
    and nullif(target_package.metadata->>'role', '') is not null
    and nullif(target_package.metadata->>'description', '') is not null
    and nullif(target_package.metadata->>'slug', '') is not null
    and exists (
      select 1
        from jsonb_array_elements(target_package.curriculum_snapshot) node
       where node->>'type' = 'subtopic'
    )
    and snapshot_item_count > 0
    and snapshot_item_count = target_questions.item_count
    and nullif(target_questions.content_hash, '') is not null
    and nullif(target_package.visual_config->>'battle_avatar', '') is not null
  ) then
    raise exception 'publication_checklist_incomplete';
  end if;

  select coalesce(array_agg(distinct value::uuid), array[]::uuid[])
    into visual_asset_ids
    from jsonb_each_text(target_package.visual_config)
   where value is not null and value not in ('', 'null');

  select count(*)::integer into valid_visual_count
    from public.media_assets
   where id = any(visual_asset_ids)
     and contest_id = target_contest_id
     and status = 'published'
     and bucket = 'admin-media'
     and mime_type in ('image/png', 'image/webp');
  if valid_visual_count <> cardinality(visual_asset_ids) then
    raise exception 'visual_assets_invalid';
  end if;

  select * into published_package
    from public.contest_content_packages
   where contest_id = target_contest_id
     and status = 'published'
   for update;

  if found then
    update public.contest_content_packages
       set status = 'archived'
     where id = published_package.id;
  end if;

  update public.question_publication_versions
     set status = 'rolled_back',
         rolled_back_at = published_at_value
   where contest_id = target_contest_id
     and status = 'published'
     and id <> target_questions.id;

  update public.question_publication_versions
     set status = 'published',
         published_at = published_at_value,
         published_by = actor_id,
         rolled_back_at = null
   where id = target_questions.id;

  update public.contest_content_packages
     set status = 'published',
         published_at = published_at_value
   where id = target_package.id
  returning * into target_package;

  update public.admin_contests
     set content_status = 'ready',
         published_at = published_at_value
   where id = target_contest_id;

  update public.editorial_questions question
     set status = 'published'
   where question.contest_id = target_contest_id
     and question.status = 'approved'
     and exists (
       select 1
         from public.question_publication_items item
        where item.version_id = target_questions.id
          and item.source_question_id = question.source_question_id
     );

  insert into public.admin_audit_log (
    actor_user_id, contest_id, module, action, target_type, target_id, metadata
  ) values (
    actor_id,
    target_contest_id,
    'contests',
    'publish_content_package',
    'content_package',
    target_package.id::text,
    jsonb_build_object(
      'version', target_package.version,
      'content_hash', target_package.content_hash,
      'questions_version_id', target_questions.id
    )
  );

  return target_package;
end
$$;

create or replace function public.admin_rollback_content_package(
  target_contest_id text,
  target_package_id uuid,
  actor_id uuid
)
returns public.contest_content_packages
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  current_package public.contest_content_packages;
  target_package public.contest_content_packages;
  target_questions public.question_publication_versions;
  rollback_at_value timestamptz := now();
begin
  if not exists (
    select 1 from public.profiles where id = actor_id and role = 'developer'
  ) then raise exception 'developer_required'; end if;

  perform 1 from public.admin_contests where id = target_contest_id for update;
  if not found then raise exception 'contest_not_found'; end if;

  select * into current_package
    from public.contest_content_packages
   where contest_id = target_contest_id
     and status = 'published'
   for update;
  if not found then raise exception 'published_package_not_found'; end if;

  select * into target_package
    from public.contest_content_packages
   where id = target_package_id
     and contest_id = target_contest_id
     and status in ('archived', 'rolled_back')
   for update;
  if not found then raise exception 'rollback_package_not_found'; end if;

  select * into target_questions
    from public.question_publication_versions
   where id = target_package.questions_version_id
     and contest_id = target_contest_id
     and status in ('generated', 'rolled_back', 'published')
   for update;
  if not found then raise exception 'rollback_question_snapshot_not_found'; end if;
  if not exists (
    select 1 from public.question_publication_items
     where version_id = target_questions.id
       and contest_id = target_contest_id
  ) then raise exception 'rollback_question_snapshot_not_found'; end if;

  update public.contest_content_packages
     set status = 'rolled_back'
   where id = current_package.id;

  if current_package.questions_version_id <> target_questions.id then
    update public.question_publication_versions
       set status = 'rolled_back',
           rolled_back_at = rollback_at_value
     where id = current_package.questions_version_id
       and status = 'published';
  end if;

  update public.question_publication_versions
     set status = 'published',
         published_at = rollback_at_value,
         published_by = actor_id,
         rolled_back_at = null
   where id = target_questions.id;

  update public.contest_content_packages
     set status = 'published',
         published_at = rollback_at_value
   where id = target_package.id
  returning * into target_package;

  update public.admin_contests
     set content_status = 'ready',
         published_at = rollback_at_value
   where id = target_contest_id;

  insert into public.admin_audit_log (
    actor_user_id, contest_id, module, action, target_type, target_id, metadata
  ) values (
    actor_id,
    target_contest_id,
    'contests',
    'rollback_content_package',
    'content_package',
    target_package.id::text,
    jsonb_build_object(
      'restored_version', target_package.version,
      'replaced_package_id', current_package.id,
      'questions_version_id', target_questions.id
    )
  );

  return target_package;
end
$$;

create or replace function public.admin_save_contest_visual(
  target_contest_id text,
  target_visual jsonb,
  publish_visual boolean,
  actor_id uuid
)
returns public.admin_contests
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  saved_contest public.admin_contests;
  visual_asset_ids uuid[];
  valid_asset_count integer;
  published_at_value timestamptz := now();
begin
  if not exists (
    select 1 from public.profiles where id = actor_id and role = 'developer'
  ) then raise exception 'developer_required'; end if;
  if jsonb_typeof(target_visual) <> 'object' then raise exception 'visual_invalid'; end if;
  if exists (
    select 1 from jsonb_object_keys(target_visual) as keys(key)
     where key not in ('battle_avatar', 'success', 'error', 'attention', 'cover')
  ) then raise exception 'visual_field_invalid'; end if;

  perform 1 from public.admin_contests where id = target_contest_id for update;
  if not found then raise exception 'contest_not_found'; end if;

  select coalesce(array_agg(distinct value::uuid), array[]::uuid[])
    into visual_asset_ids
    from jsonb_each_text(target_visual)
   where value is not null and value not in ('', 'null');

  select count(*)::integer into valid_asset_count
    from public.media_assets
   where id = any(visual_asset_ids)
     and contest_id = target_contest_id
     and status <> 'archived'
     and bucket = 'admin-media'
     and mime_type in ('image/png', 'image/webp');
  if valid_asset_count <> cardinality(visual_asset_ids) then
    raise exception 'visual_asset_contest_mismatch';
  end if;
  if publish_visual and nullif(target_visual->>'battle_avatar', '') is null then
    raise exception 'battle_avatar_required';
  end if;

  if publish_visual and cardinality(visual_asset_ids) > 0 then
    update public.media_assets
       set status = 'published',
           published_at = coalesce(published_at, published_at_value)
     where id = any(visual_asset_ids);
  end if;

  update public.admin_contests
     set battle_avatar_asset_id = nullif(target_visual->>'battle_avatar', '')::uuid,
         success_asset_id = nullif(target_visual->>'success', '')::uuid,
         error_asset_id = nullif(target_visual->>'error', '')::uuid,
         attention_asset_id = nullif(target_visual->>'attention', '')::uuid,
         cover_media_asset_id = nullif(target_visual->>'cover', '')::uuid,
         visual_status = case when publish_visual then 'published' else 'draft' end
   where id = target_contest_id
  returning * into saved_contest;

  insert into public.admin_audit_log (
    actor_user_id, contest_id, module, action, target_type, target_id, metadata
  ) values (
    actor_id,
    target_contest_id,
    'media',
    case when publish_visual then 'publish_contest_visual' else 'save_contest_visual' end,
    'contest_visual',
    target_contest_id,
    jsonb_build_object(
      'visual_status', saved_contest.visual_status,
      'asset_count', cardinality(visual_asset_ids)
    )
  );

  return saved_contest;
end
$$;

revoke all on function public.protect_question_publication_item() from public, anon, authenticated;
revoke all on function public.protect_question_publication_version() from public, anon, authenticated;
revoke all on function public.admin_replace_curriculum_draft(text, jsonb, boolean) from public, anon, authenticated;
revoke all on function public.admin_generate_question_snapshot(text, text, uuid) from public, anon, authenticated;
revoke all on function public.admin_publish_content_package(text, uuid, text, uuid) from public, anon, authenticated;
revoke all on function public.admin_rollback_content_package(text, uuid, uuid) from public, anon, authenticated;
revoke all on function public.admin_save_contest_visual(text, jsonb, boolean, uuid) from public, anon, authenticated;

grant execute on function public.admin_replace_curriculum_draft(text, jsonb, boolean) to service_role;
grant execute on function public.admin_generate_question_snapshot(text, text, uuid) to service_role;
grant execute on function public.admin_publish_content_package(text, uuid, text, uuid) to service_role;
grant execute on function public.admin_rollback_content_package(text, uuid, uuid) to service_role;
grant execute on function public.admin_save_contest_visual(text, jsonb, boolean, uuid) to service_role;
