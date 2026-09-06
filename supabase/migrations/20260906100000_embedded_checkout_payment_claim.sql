-- Adiciona uma trava curta e recuperável para criação de pagamentos pelo Checkout Transparente.
-- O Checkout Pro existente continua sendo o padrão e não depende destas colunas.

alter table public.commerce_orders
  add column if not exists payment_claim_token text,
  add column if not exists payment_claimed_at timestamptz;

create or replace function public.claim_commerce_payment_attempt(
  p_order_id uuid,
  p_user_id uuid,
  p_request_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.commerce_orders%rowtype;
  v_claimed boolean := false;
begin
  if p_request_id !~ '^[0-9a-fA-F-]{36}$' then
    raise exception 'invalid_payment_request' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('payment:' || p_order_id::text, 0));

  select * into v_order
    from public.commerce_orders orders
   where orders.id = p_order_id
     and orders.user_id = p_user_id
   for update;

  if not found then
    raise exception 'commerce_order_not_found' using errcode = 'P0002';
  end if;

  if v_order.status = 'pending' and v_order.provider_payment_id is null and (
    v_order.payment_claimed_at is null
    or v_order.payment_claimed_at < now() - interval '45 seconds'
    or v_order.payment_claim_token = p_request_id
  ) then
    update public.commerce_orders orders
       set payment_claim_token = p_request_id,
           payment_claimed_at = now(),
           updated_at = now()
     where orders.id = p_order_id
     returning * into v_order;
    v_claimed := true;
  end if;

  return pg_catalog.jsonb_build_object(
    'order', pg_catalog.to_jsonb(v_order),
    'paymentClaimed', v_claimed
  );
end;
$$;

revoke all on function public.claim_commerce_payment_attempt(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.claim_commerce_payment_attempt(uuid, uuid, text)
  to service_role;
