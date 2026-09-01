-- Publica o conteúdo acadêmico inicial da PC PE Agente sem abrir vendas.
-- O acesso continua condicionado a entitlement; nenhum acesso é concedido aqui.

insert into public.admin_contests (
  id, code, slug, name, role, description, price_cents, currency,
  color, accent, icon, cover_asset, content_status, sales_status,
  content_delivery, exam_date, career_area, career_subarea, published_at
) values (
  'pc_pe_2026',
  'PC PE',
  'pc-pe-2026-agente',
  'PC PE — Agente de Polícia',
  'Agente de Polícia',
  'Curso pré-edital com currículo verticalizado e banco inicial de 100 questões inéditas, sujeito à reconciliação quando sair o novo edital.',
  0,
  'BRL',
  '#13233f',
  '#2dd4bf',
  'PCPE',
  null,
  'ready',
  'coming_soon',
  'static_bundle',
  null,
  'police_security',
  'civil_police',
  now()
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
  published_at = coalesce(public.admin_contests.published_at, now()),
  archived_at = null,
  updated_at = now();
