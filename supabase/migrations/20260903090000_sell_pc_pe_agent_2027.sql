-- Abre a venda da jornada PC PE 2027 usando o identificador interno legado pc_pe_2026.
-- O conteúdo é entregue pelo pacote estático de 317 questões; entitlement continua server-side.

update public.admin_contests
set name = 'PC PE 2027 — Agente de Polícia',
    slug = 'pc-pe-agente-2027',
    description = 'Jornada pré-edital 2027 com currículo verticalizado e 317 questões em banco ativo, sujeita à reconciliação quando sair o novo edital.',
    price_cents = 2490,
    currency = 'BRL',
    content_status = 'ready',
    sales_status = 'available',
    content_delivery = 'static_bundle',
    published_at = coalesce(published_at, now()),
    archived_at = null,
    updated_at = now()
where id = 'pc_pe_2026';

do $$
begin
  if not exists (
    select 1
    from public.admin_contests
    where id = 'pc_pe_2026'
      and content_status = 'ready'
      and sales_status = 'available'
      and price_cents = 2490
      and currency = 'BRL'
  ) then
    raise exception 'pc_pe_2027_sale_activation_failed';
  end if;
end;
$$;
