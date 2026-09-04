-- Publica as jornadas estáticas de PM PE e Polícia Penal PE.
-- O acesso do aluno continua condicionado a entitlement; esta migração não concede acessos.

insert into public.admin_contests (
  id, code, slug, name, role, description, price_cents, currency,
  color, accent, icon, cover_asset, content_status, sales_status,
  content_delivery, exam_date, career_area, career_subarea, published_at
) values
  (
    'pm_pe_2027',
    'PM PE',
    'pm-pe-soldado-2027',
    'PM PE 2027 — Soldado',
    'Praça/Soldado',
    'Jornada pré-edital baseada nas seis áreas do último edital oficial, com 503 questões no banco inicial conservador.',
    2490, 'BRL', '#151229', '#ff7a00', 'PMPE', null,
    'ready', 'available', 'static_bundle', null,
    'police_security', 'military_police', now()
  ),
  (
    'pp_pe_2027',
    'PP PE',
    'policia-penal-pe-2027',
    'Polícia Penal PE 2027 — Policial Penal',
    'Policial Penal',
    'Jornada pré-edital baseada no último edital oficial, com 444 questões no banco inicial conservador.',
    2490, 'BRL', '#111827', '#8b5cf6', 'PPPE', null,
    'ready', 'available', 'static_bundle', null,
    'police_security', 'prison_police', now()
  )
on conflict (id) do update set
  code = excluded.code,
  slug = excluded.slug,
  name = excluded.name,
  role = excluded.role,
  description = excluded.description,
  price_cents = excluded.price_cents,
  currency = excluded.currency,
  color = excluded.color,
  accent = excluded.accent,
  icon = excluded.icon,
  cover_asset = excluded.cover_asset,
  content_status = excluded.content_status,
  sales_status = excluded.sales_status,
  content_delivery = excluded.content_delivery,
  exam_date = excluded.exam_date,
  career_area = excluded.career_area,
  career_subarea = excluded.career_subarea,
  published_at = coalesce(public.admin_contests.published_at, excluded.published_at),
  archived_at = null,
  updated_at = now();

do $$
begin
  if (
    select count(*)
    from public.admin_contests
    where id in ('pm_pe_2027', 'pp_pe_2027')
      and content_status = 'ready'
      and sales_status = 'available'
      and content_delivery = 'static_bundle'
      and price_cents = 2490
  ) <> 2 then
    raise exception 'pernambuco_course_publication_failed';
  end if;
end;
$$;
