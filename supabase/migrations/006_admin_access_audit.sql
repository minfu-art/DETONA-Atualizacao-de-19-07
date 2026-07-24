-- DETONA CONCURSOS — auditoria mínima do gerenciamento administrativo de acessos
-- A tabela e a função abaixo não ficam disponíveis ao navegador.

create table public.admin_access_audit (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid not null references public.profiles (id) on delete restrict,
  target_user_id uuid not null references public.profiles (id) on delete restrict,
  contest_id text not null,
  action text not null,
  previous_status text,
  new_status text,
  created_at timestamptz not null default now(),
  constraint admin_access_audit_contest_check
    check (contest_id = 'pc_al_2026'),
  constraint admin_access_audit_action_check
    check (action in ('grant_access', 'revoke_access', 'reactivate_access')),
  constraint admin_access_audit_previous_status_check
    check (previous_status is null or previous_status in ('active', 'revoked', 'expired')),
  constraint admin_access_audit_new_status_check
    check (new_status in ('active', 'revoked'))
);

create index admin_access_audit_actor_idx
  on public.admin_access_audit (actor_user_id, created_at desc);

create index admin_access_audit_target_idx
  on public.admin_access_audit (target_user_id, contest_id, created_at desc);

alter table public.admin_access_audit enable row level security;

revoke all privileges on table public.admin_access_audit
  from public, anon, authenticated, service_role;
grant select, insert on table public.admin_access_audit to service_role;

-- Executada exclusivamente pela Edge Function com service_role. O entitlement e
-- sua auditoria são persistidos na mesma transação.
create or replace function public.admin_set_contest_access(
  p_actor_user_id uuid,
  p_target_user_id uuid,
  p_contest_id text,
  p_action text
)
returns table (
  user_id uuid,
  contest_id text,
  status text,
  granted_at timestamptz,
  source text,
  updated_at timestamptz
)
language plpgsql
set search_path = ''
as $$
declare
  v_previous_status text;
  v_new_status text;
begin
  if p_contest_id <> 'pc_al_2026' then
    raise exception 'contest_not_allowed' using errcode = '22023';
  end if;

  if p_action not in ('grant_access', 'revoke_access', 'reactivate_access') then
    raise exception 'action_not_allowed' using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.profiles profile where profile.id = p_target_user_id
  ) then
    raise no_data_found using message = 'target_not_found';
  end if;

  select entitlement.status
    into v_previous_status
    from public.contest_entitlements entitlement
   where entitlement.user_id = p_target_user_id
     and entitlement.contest_id = p_contest_id
   for update;

  if p_action = 'grant_access' then
    insert into public.contest_entitlements (
      id,
      user_id,
      contest_id,
      status,
      source,
      granted_at,
      updated_at
    )
    values (
      'manual_admin:' || p_target_user_id::text || ':' || p_contest_id,
      p_target_user_id,
      p_contest_id,
      'active',
      'manual_admin',
      now(),
      now()
    )
    on conflict (user_id, contest_id)
    do update set
      status = 'active',
      source = 'manual_admin',
      granted_at = case
        when public.contest_entitlements.status = 'active'
          then public.contest_entitlements.granted_at
        else now()
      end,
      updated_at = now();
    v_new_status := 'active';
  else
    if v_previous_status is null then
      raise no_data_found using message = 'entitlement_not_found';
    end if;

    v_new_status := case
      when p_action = 'revoke_access' then 'revoked'
      else 'active'
    end;

    update public.contest_entitlements entitlement
       set status = v_new_status,
           source = case
             when p_action = 'reactivate_access' then 'manual_admin'
             else entitlement.source
           end,
           updated_at = now()
     where entitlement.user_id = p_target_user_id
       and entitlement.contest_id = p_contest_id;
  end if;

  insert into public.admin_access_audit (
    actor_user_id,
    target_user_id,
    contest_id,
    action,
    previous_status,
    new_status
  )
  values (
    p_actor_user_id,
    p_target_user_id,
    p_contest_id,
    p_action,
    v_previous_status,
    v_new_status
  );

  return query
  select
    entitlement.user_id,
    entitlement.contest_id,
    entitlement.status,
    entitlement.granted_at,
    entitlement.source,
    entitlement.updated_at
  from public.contest_entitlements entitlement
  where entitlement.user_id = p_target_user_id
    and entitlement.contest_id = p_contest_id;
end;
$$;

revoke all privileges on function public.admin_set_contest_access(uuid, uuid, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.admin_set_contest_access(uuid, uuid, text, text)
  to service_role;
