begin;

create table if not exists public.course_provision_operations (
  id uuid primary key default gen_random_uuid(),
  operation_id text not null unique
    check (operation_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$'),
  actor_user_id uuid not null references public.profiles(id) on delete restrict,
  contest_id text not null,
  bundle_hash text not null check (bundle_hash ~ '^[a-f0-9]{64}$'),
  status text not null default 'validated'
    check (status in ('validated', 'applying', 'completed', 'failed')),
  confirmation_token_hash text not null check (confirmation_token_hash ~ '^[a-f0-9]{64}$'),
  confirmation_expires_at timestamptz not null,
  confirmation_used_at timestamptz,
  summary jsonb not null default '{}'::jsonb,
  report jsonb not null default '{}'::jsonb,
  steps jsonb not null default '{}'::jsonb,
  error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists course_provision_operations_actor_created_idx
  on public.course_provision_operations (actor_user_id, created_at desc);

alter table public.course_provision_operations enable row level security;
revoke all on table public.course_provision_operations from public, anon, authenticated;
grant select, insert, update on table public.course_provision_operations to service_role;

create or replace function public.claim_course_provision_operation(
  p_operation_id text,
  p_actor_user_id uuid,
  p_bundle_hash text,
  p_confirmation_token_hash text
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  changed_count integer;
begin
  if auth.role() <> 'service_role' then
    raise exception 'service_role_required';
  end if;

  update public.course_provision_operations
  set status = 'applying',
      confirmation_used_at = now(),
      updated_at = now(),
      error_code = null
  where operation_id = p_operation_id
    and actor_user_id = p_actor_user_id
    and bundle_hash = p_bundle_hash
    and status in ('validated', 'failed')
    and confirmation_used_at is null
    and confirmation_expires_at > now()
    and confirmation_token_hash = p_confirmation_token_hash;

  get diagnostics changed_count = row_count;
  return changed_count = 1;
end;
$$;

revoke all on function public.claim_course_provision_operation(text, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.claim_course_provision_operation(text, uuid, text, text)
  to service_role;

commit;
