-- Painel Central DETONA — concursos, currículo e auditoria administrativa.
-- Migration preparada; não aplicar remotamente nesta fase.

create table if not exists public.admin_contests (
  id text primary key,
  code text not null unique,
  slug text not null unique,
  name text not null,
  role text not null,
  description text not null,
  price_cents integer not null default 0 check (price_cents >= 0),
  currency text not null default 'BRL' check (char_length(currency) = 3),
  color text not null,
  accent text not null,
  icon text not null,
  cover_asset text,
  content_status text not null default 'draft'
    check (content_status in ('draft', 'preparing', 'ready', 'archived')),
  sales_status text not null default 'unavailable'
    check (sales_status in ('unavailable', 'coming_soon', 'available', 'suspended')),
  landing_page_id uuid,
  exam_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz,
  archived_at timestamptz
);

create table if not exists public.admin_curriculum_nodes (
  id uuid primary key default gen_random_uuid(),
  contest_id text not null references public.admin_contests(id) on delete restrict,
  parent_id uuid references public.admin_curriculum_nodes(id) on delete restrict,
  type text not null check (type in ('role', 'discipline', 'topic', 'subtopic')),
  name text not null,
  description text,
  order_index integer not null default 0 check (order_index >= 0),
  status text not null default 'draft'
    check (status in ('draft', 'active', 'inactive', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists admin_curriculum_contest_parent_order_idx
  on public.admin_curriculum_nodes(contest_id, parent_id, order_index);

create table if not exists public.admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid not null references public.profiles(id) on delete restrict,
  contest_id text,
  module text not null,
  action text not null,
  target_type text not null,
  target_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint admin_audit_metadata_object check (jsonb_typeof(metadata) = 'object')
);

create index if not exists admin_audit_actor_created_idx
  on public.admin_audit_log(actor_user_id, created_at desc);
create index if not exists admin_audit_contest_created_idx
  on public.admin_audit_log(contest_id, created_at desc);

alter table public.admin_contests enable row level security;
alter table public.admin_curriculum_nodes enable row level security;
alter table public.admin_audit_log enable row level security;

revoke all on table public.admin_contests from public, anon, authenticated;
revoke all on table public.admin_curriculum_nodes from public, anon, authenticated;
revoke all on table public.admin_audit_log from public, anon, authenticated;

grant select, insert, update, delete on table public.admin_contests to service_role;
grant select, insert, update, delete on table public.admin_curriculum_nodes to service_role;
grant select, insert on table public.admin_audit_log to service_role;

drop trigger if exists set_updated_at on public.admin_contests;
create trigger set_updated_at before update on public.admin_contests
  for each row execute function public.set_updated_at();
drop trigger if exists set_updated_at on public.admin_curriculum_nodes;
create trigger set_updated_at before update on public.admin_curriculum_nodes
  for each row execute function public.set_updated_at();
