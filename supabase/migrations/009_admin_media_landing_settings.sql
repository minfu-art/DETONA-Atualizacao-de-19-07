-- Painel Central DETONA — mídia, landing pages e configurações tipadas.

create table if not exists public.avatar_collections (
  id uuid primary key default gen_random_uuid(),
  contest_id text references public.admin_contests(id) on delete restrict,
  name text not null,
  gender text not null check (gender in ('female', 'male', 'neutral')),
  status text not null default 'draft' check (status in ('draft', 'active', 'inactive', 'published', 'archived')),
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.avatar_stages (
  id uuid primary key default gen_random_uuid(),
  collection_id uuid not null references public.avatar_collections(id) on delete restrict,
  stage_number integer not null check (stage_number between 1 and 9),
  minimum_global_mastery numeric(5,2) not null default 0 check (minimum_global_mastery between 0 and 100),
  is_initial boolean not null default false,
  order_index integer not null default 0,
  status text not null default 'draft' check (status in ('draft', 'active', 'inactive', 'published', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(collection_id, stage_number)
);

create table if not exists public.media_assets (
  id uuid primary key default gen_random_uuid(),
  contest_id text references public.admin_contests(id) on delete restrict,
  bucket text not null,
  storage_path text not null unique,
  mime_type text not null check (mime_type in ('image/png', 'image/webp')),
  byte_size bigint not null check (byte_size > 0 and byte_size <= 8388608),
  width integer not null check (width > 0),
  height integer not null check (height > 0),
  has_transparency boolean,
  content_hash text not null,
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  published_at timestamptz
);

create table if not exists public.avatar_assets (
  id uuid primary key default gen_random_uuid(),
  stage_id uuid not null references public.avatar_stages(id) on delete restrict,
  media_asset_id uuid not null references public.media_assets(id) on delete restrict,
  asset_type text not null check (asset_type in (
    'portrait', 'full_body', 'chibi_head', 'success', 'error', 'attention',
    'victory', 'defeat', 'weapon', 'equipment'
  )),
  created_at timestamptz not null default now(),
  unique(stage_id, asset_type)
);

create table if not exists public.landing_pages (
  id uuid primary key default gen_random_uuid(),
  contest_id text not null references public.admin_contests(id) on delete restrict,
  slug text not null unique,
  title text not null,
  seo_title text not null,
  seo_description text not null,
  status text not null default 'draft' check (status in ('draft', 'review', 'published', 'archived')),
  current_version integer not null default 1 check (current_version > 0),
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz
);

create table if not exists public.landing_page_versions (
  id uuid primary key default gen_random_uuid(),
  landing_page_id uuid not null references public.landing_pages(id) on delete restrict,
  version integer not null check (version > 0),
  status text not null default 'draft' check (status in ('draft', 'review', 'published', 'archived')),
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  published_at timestamptz,
  unique(landing_page_id, version)
);

create table if not exists public.landing_page_blocks (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references public.landing_page_versions(id) on delete restrict,
  type text not null check (type in ('hero', 'benefits', 'method', 'features', 'demo', 'testimonials', 'price', 'faq', 'cta', 'footer')),
  content jsonb not null check (jsonb_typeof(content) = 'object'),
  order_index integer not null default 0 check (order_index >= 0),
  is_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.platform_settings (
  key text primary key check (key in (
    'platform_name', 'logo_url', 'support_email', 'whatsapp', 'terms_url',
    'privacy_url', 'maintenance_mode', 'signup_enabled', 'email_confirmation_enabled',
    'minimum_app_version', 'pwa_enabled', 'notifications_enabled'
  )),
  value_type text not null check (value_type in ('string', 'boolean', 'email', 'url')),
  value jsonb not null,
  updated_by uuid not null references public.profiles(id) on delete restrict,
  updated_at timestamptz not null default now()
);

alter table public.avatar_collections enable row level security;
alter table public.avatar_stages enable row level security;
alter table public.avatar_assets enable row level security;
alter table public.media_assets enable row level security;
alter table public.landing_pages enable row level security;
alter table public.landing_page_versions enable row level security;
alter table public.landing_page_blocks enable row level security;
alter table public.platform_settings enable row level security;

revoke all on table public.avatar_collections, public.avatar_stages, public.avatar_assets,
  public.media_assets, public.landing_pages, public.landing_page_versions,
  public.landing_page_blocks, public.platform_settings from public, anon, authenticated;

grant select, insert, update, delete on table public.avatar_collections, public.avatar_stages,
  public.avatar_assets, public.media_assets, public.landing_pages, public.landing_page_versions,
  public.landing_page_blocks, public.platform_settings to service_role;

drop trigger if exists set_updated_at on public.avatar_collections;
create trigger set_updated_at before update on public.avatar_collections for each row execute function public.set_updated_at();
drop trigger if exists set_updated_at on public.avatar_stages;
create trigger set_updated_at before update on public.avatar_stages for each row execute function public.set_updated_at();
drop trigger if exists set_updated_at on public.landing_pages;
create trigger set_updated_at before update on public.landing_pages for each row execute function public.set_updated_at();
drop trigger if exists set_updated_at on public.landing_page_blocks;
create trigger set_updated_at before update on public.landing_page_blocks for each row execute function public.set_updated_at();
