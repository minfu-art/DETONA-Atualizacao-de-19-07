do $$
declare
  current_price integer;
  current_currency text;
begin
  select price_cents, currency
    into current_price, current_currency
    from public.admin_contests
   where id = 'pc_al_2026'
   for update;

  if not found then
    raise exception 'PC AL contest pc_al_2026 was not found';
  end if;

  if current_currency <> 'BRL' then
    raise exception 'Unexpected PC AL currency: %', current_currency;
  end if;

  if current_price not in (2490, 6999, 14990) then
    raise exception 'Unexpected PC AL price before migration: %', current_price;
  end if;

  update public.admin_contests
     set price_cents = 2490
   where id = 'pc_al_2026'
     and price_cents <> 2490;

  if not exists (
    select 1
      from public.admin_contests
     where id = 'pc_al_2026'
       and price_cents = 2490
       and currency = 'BRL'
  ) then
    raise exception 'PC AL price validation failed';
  end if;
end $$;
