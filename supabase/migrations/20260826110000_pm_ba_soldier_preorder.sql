-- Pré-venda segura da jornada PM BA Soldado.
-- O pagamento cria entitlement somente após confirmação server-side do Mercado Pago.
-- O conteúdo continua bloqueado enquanto content_status = 'preparing'.

alter table public.admin_contests
  drop constraint if exists admin_contests_sales_status_check;

alter table public.admin_contests
  add constraint admin_contests_sales_status_check
  check (sales_status in ('unavailable', 'monitoring', 'coming_soon', 'preorder', 'available', 'suspended'));

insert into public.admin_contests (
  id, code, slug, name, role, description, price_cents, currency,
  color, accent, icon, cover_asset, content_status, sales_status,
  content_delivery, exam_date, career_area, career_subarea, published_at
) values (
  'pm_ba_2026',
  'PM BA',
  'pm-ba-2026-soldado',
  'PM BA 2026 — Soldado',
  'Aluno Soldado da Polícia Militar',
  'Pré-venda da jornada de Soldado da PM BA, com mapa pré-edital em preparação e acesso garantido após a publicação do conteúdo inicial.',
  6999,
  'BRL',
  '#102d25',
  '#d6b34c',
  'PMBA',
  'assets/courses/pm-ba-2026.webp',
  'preparing',
  'preorder',
  'dynamic_package',
  null,
  'police_security',
  'military_police',
  null
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
  published_at = null,
  archived_at = null,
  updated_at = now();

comment on column public.admin_contests.sales_status is
  'Estado comercial: preorder permite checkout durante preparação, sem liberar conteúdo antes da publicação.';
