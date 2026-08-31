-- Publica a Jornada PM AL Soldado com preço canônico de R$ 14,99.
-- O conteúdo acadêmico é um pacote estático versionado; o acesso continua
-- condicionado a entitlement ativo criado somente após pagamento confirmado.

insert into public.admin_contests (
  id, code, slug, name, role, description, price_cents, currency,
  color, accent, icon, cover_asset, content_status, sales_status,
  content_delivery, exam_date, career_area, career_subarea, published_at
) values (
  'pm_al_2026',
  'PM AL',
  'pm-al-2026-soldado',
  'PM AL — Jornada de Resgate para Soldado',
  'Soldado do Quadro de Praças',
  'Preparação de retomada baseada no Edital nº 1 - PMAL/2026, com mapa completo e banco inicial de questões em expansão.',
  1499,
  'BRL',
  '#102f57',
  '#f0bd35',
  'PMAL',
  'assets/courses/pm-al-2026.png',
  'ready',
  'available',
  'static_bundle',
  '2026-07-19',
  'police_security',
  'military_police',
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
