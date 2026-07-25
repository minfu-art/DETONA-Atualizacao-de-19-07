-- Painel Central DETONA — bootstrap idempotente do catálogo acadêmico atual.
-- ON CONFLICT DO NOTHING preserva qualquer alteração administrativa futura.

insert into public.admin_contests (
  id, code, slug, name, role, description, price_cents, currency,
  color, accent, icon, content_status, sales_status
)
values
  (
    'pc_al_2026', 'PC AL', 'pc-al-2026', 'Policia Civil de Alagoas',
    'Agente e Escrivao',
    'Jornada completa com edital verticalizado, questoes e batalhas.',
    14990, 'BRL', '#7c6af5', '#38bdf8', 'PC', 'ready', 'available'
  ),
  (
    'pf_2026', 'PF', 'pf-2026', 'Policia Federal',
    'Agente de Policia Federal',
    'Modulo independente preparado para o proximo pacote editorial.',
    18990, 'BRL', '#0f766e', '#5eead4', 'PF', 'preparing', 'coming_soon'
  ),
  (
    'prf_2026', 'PRF', 'prf-2026', 'Policia Rodoviaria Federal',
    'Policial Rodoviario Federal',
    'Modulo independente pronto para receber edital e banco de questoes.',
    17990, 'BRL', '#b45309', '#fbbf24', 'PRF', 'preparing', 'coming_soon'
  )
on conflict (id) do nothing;

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'admin_contests_landing_page_id_fkey'
       and conrelid = 'public.admin_contests'::regclass
  ) then
    alter table public.admin_contests
      add constraint admin_contests_landing_page_id_fkey
      foreign key (landing_page_id)
      references public.landing_pages(id)
      on delete set null;
  end if;
end
$$;
