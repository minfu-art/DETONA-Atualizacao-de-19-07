-- Aparência mínima por concurso, usando referências privadas a media_assets.
-- Migration local; não aplicar remotamente sem autorização operacional separada.

alter table public.admin_contests
  add column if not exists battle_avatar_asset_id uuid references public.media_assets(id) on delete restrict,
  add column if not exists success_asset_id uuid references public.media_assets(id) on delete restrict,
  add column if not exists error_asset_id uuid references public.media_assets(id) on delete restrict,
  add column if not exists attention_asset_id uuid references public.media_assets(id) on delete restrict,
  add column if not exists cover_media_asset_id uuid references public.media_assets(id) on delete restrict,
  add column if not exists visual_status text not null default 'draft'
    check (visual_status in ('draft', 'published'));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'admin-media',
  'admin-media',
  false,
  8388608,
  array['image/png', 'image/webp']
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create index if not exists media_assets_contest_status_idx
  on public.media_assets(contest_id, status, created_at desc);
