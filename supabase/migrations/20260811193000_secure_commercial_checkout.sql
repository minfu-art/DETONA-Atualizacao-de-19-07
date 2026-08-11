-- DETONA CONCURSOS - fundacao comercial segura (Mercado Pago Checkout Pro).
-- Esta migration apenas prepara o schema. Credenciais pertencem exclusivamente
-- ao ambiente das Edge Functions e nunca sao persistidas no banco ou cliente.

create table if not exists public.commerce_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete restrict,
  contest_id text not null references public.admin_contests(id) on delete restrict,
  provider text not null check (provider in ('mercado_pago')),
  idempotency_key text not null check (char_length(idempotency_key) between 16 and 100),
  provider_preference_id text,
  provider_payment_id text,
  checkout_url text,
  amount_cents integer not null check (amount_cents > 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'cancelled', 'expired', 'refunded', 'charged_back')),
  paid_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, idempotency_key)
);

create unique index if not exists commerce_orders_provider_payment_uidx
  on public.commerce_orders(provider, provider_payment_id)
  where provider_payment_id is not null;
create unique index if not exists commerce_orders_provider_preference_uidx
  on public.commerce_orders(provider, provider_preference_id)
  where provider_preference_id is not null;
create index if not exists commerce_orders_user_created_idx
  on public.commerce_orders(user_id, created_at desc);
create index if not exists commerce_orders_contest_status_idx
  on public.commerce_orders(contest_id, status);

create table if not exists public.payment_webhook_events (
  provider text not null check (provider in ('mercado_pago')),
  event_id text not null check (char_length(event_id) between 1 and 160),
  event_type text not null,
  order_id uuid references public.commerce_orders(id) on delete restrict,
  payload_sha256 text not null check (payload_sha256 ~ '^[0-9a-f]{64}$'),
  status text not null default 'received'
    check (status in ('received', 'processed', 'ignored', 'failed')),
  error_code text,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  primary key (provider, event_id)
);

alter table public.commerce_orders enable row level security;
alter table public.payment_webhook_events enable row level security;

revoke all on table public.commerce_orders from public, anon, authenticated;
revoke all on table public.payment_webhook_events from public, anon, authenticated;
grant select on table public.commerce_orders to authenticated;
grant select, insert, update, delete on table public.commerce_orders to service_role;
grant select, insert, update, delete on table public.payment_webhook_events to service_role;

drop policy if exists commerce_orders_select_own on public.commerce_orders;
create policy commerce_orders_select_own
  on public.commerce_orders for select to authenticated
  using ((select auth.uid()) = user_id);

drop trigger if exists set_updated_at on public.commerce_orders;
create trigger set_updated_at before update on public.commerce_orders
  for each row execute function public.set_updated_at();

create or replace function public.apply_verified_commerce_payment(
  p_provider text,
  p_event_id text,
  p_event_type text,
  p_order_id uuid,
  p_provider_payment_id text,
  p_payment_status text,
  p_amount_cents integer,
  p_currency text,
  p_payload_sha256 text
)
returns table (order_status text, entitlement_granted boolean, duplicate_event boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.commerce_orders%rowtype;
  v_inserted integer;
  v_granted boolean := false;
begin
  if p_provider <> 'mercado_pago'
     or p_payment_status not in ('pending', 'approved', 'rejected', 'cancelled', 'expired', 'refunded', 'charged_back')
     or p_amount_cents <= 0
     or p_currency !~ '^[A-Z]{3}$'
     or p_payload_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid_verified_payment' using errcode = '22023';
  end if;

  insert into public.payment_webhook_events (
    provider, event_id, event_type, order_id, payload_sha256, status
  ) values (
    p_provider, p_event_id, p_event_type, p_order_id, p_payload_sha256, 'received'
  ) on conflict (provider, event_id) do nothing;
  get diagnostics v_inserted = row_count;

  if v_inserted = 0 then
    select orders.status into order_status
      from public.commerce_orders orders where orders.id = p_order_id;
    return query select order_status, false, true;
    return;
  end if;

  select * into v_order
    from public.commerce_orders orders
   where orders.id = p_order_id and orders.provider = p_provider
   for update;
  if not found then raise exception 'commerce_order_not_found' using errcode = 'P0002'; end if;
  if v_order.amount_cents <> p_amount_cents or v_order.currency <> p_currency then
    raise exception 'commerce_payment_amount_mismatch' using errcode = '22023';
  end if;

  update public.commerce_orders
     set provider_payment_id = p_provider_payment_id,
         status = p_payment_status,
         paid_at = case when p_payment_status = 'approved' then coalesce(paid_at, now()) else paid_at end,
         updated_at = now()
   where id = p_order_id;

  -- Somente a confirmacao server-side do provedor concede acesso.
  if p_payment_status = 'approved' then
    insert into public.contest_entitlements (
      id, user_id, contest_id, status, source, granted_at, updated_at
    ) values (
      'mercado_pago:' || v_order.user_id::text || ':' || v_order.contest_id,
      v_order.user_id, v_order.contest_id, 'active', 'mercado_pago_checkout', now(), now()
    ) on conflict (user_id, contest_id) do update set
      status = 'active',
      source = 'mercado_pago_checkout',
      updated_at = now();
    v_granted := true;
  end if;

  -- Reembolso/chargeback sao registrados, mas a revogacao exige politica comercial aprovada.
  update public.payment_webhook_events
     set status = 'processed', processed_at = now()
   where provider = p_provider and event_id = p_event_id;

  return query select p_payment_status, v_granted, false;
end;
$$;

revoke all on function public.apply_verified_commerce_payment(
  text, text, text, uuid, text, text, integer, text, text
) from public, anon, authenticated;
grant execute on function public.apply_verified_commerce_payment(
  text, text, text, uuid, text, text, integer, text, text
) to service_role;
