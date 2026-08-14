-- Alinha o preço canônico do checkout seguro à oferta pública da Jornada PC AL.
-- A guarda impede alteração silenciosa caso o valor tenha sido modificado por outra operação.

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
    raise exception 'PC_AL_CONTEST_NOT_FOUND';
  end if;

  if current_currency <> 'BRL' then
    raise exception 'PC_AL_CURRENCY_MISMATCH';
  end if;

  if current_price not in (14990, 6999) then
    raise exception 'PC_AL_UNEXPECTED_CURRENT_PRICE:%', current_price;
  end if;

  update public.admin_contests
     set price_cents = 6999
   where id = 'pc_al_2026'
     and price_cents <> 6999;
end
$$;
