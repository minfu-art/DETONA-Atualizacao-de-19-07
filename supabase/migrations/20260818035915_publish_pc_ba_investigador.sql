-- Publica comercialmente a primeira jornada canônica da Course Factory.
-- O conteúdo acadêmico continua versionado no pacote estático imutável do app.

alter table public.admin_contests
  add column if not exists content_delivery text not null default 'dynamic_package';

alter table public.admin_contests
  drop constraint if exists admin_contests_content_delivery_check;

alter table public.admin_contests
  add constraint admin_contests_content_delivery_check
  check (content_delivery in ('dynamic_package', 'static_bundle'));

insert into public.admin_contests (
  id, code, slug, name, role, description, price_cents, currency,
  color, accent, icon, cover_asset, content_status, sales_status,
  content_delivery, exam_date, published_at
) values (
  'pc_ba_2026',
  'PC BA',
  'pc-ba-2026-investigador',
  'PC BA 2026 — Investigador de Polícia Civil',
  'Investigador de Polícia Civil',
  'Preparação para Investigador da Polícia Civil da Bahia com edital verticalizado, mapa de microconhecimentos e banco inicial de questões.',
  6990,
  'BRL',
  '#24104f',
  '#37d6ff',
  'PCBA',
  null,
  'ready',
  'available',
  'static_bundle',
  '2026-12-06',
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
  content_status = excluded.content_status,
  sales_status = excluded.sales_status,
  content_delivery = excluded.content_delivery,
  exam_date = excluded.exam_date,
  published_at = coalesce(public.admin_contests.published_at, now()),
  archived_at = null,
  updated_at = now();
