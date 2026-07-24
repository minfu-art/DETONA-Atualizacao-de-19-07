-- DETONA CONCURSOS — avisos administrativos
-- Acesso administrativo reutiliza o papel developer já mantido em public.profiles.

create table public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  summary text not null,
  body text not null,
  category text not null,
  priority text not null default 'normal',
  audience_type text not null default 'all',
  contest_id text,
  suggestions jsonb not null default '[]'::jsonb,
  cta_type text not null default 'none',
  cta_label text,
  cta_value text,
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  is_published boolean not null default false,
  is_pinned boolean not null default false,
  created_by uuid not null references public.profiles (id),
  published_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint announcements_category_check
    check (category in ('event', 'update', 'maintenance', 'focus', 'study_tip', 'official_notice')),
  constraint announcements_priority_check
    check (priority in ('normal', 'high', 'urgent')),
  constraint announcements_audience_check
    check (audience_type in ('all', 'contest')),
  constraint announcements_audience_contest_check
    check (
      (audience_type = 'all' and contest_id is null)
      or (audience_type = 'contest' and nullif(btrim(contest_id), '') is not null)
    ),
  constraint announcements_cta_type_check
    check (cta_type in ('none', 'internal_route', 'external_url')),
  constraint announcements_cta_value_check
    check (
      (cta_type = 'none' and cta_label is null and cta_value is null)
      or (
        cta_type = 'internal_route'
        and nullif(btrim(cta_label), '') is not null
        and cta_value in ('home', 'map', 'edital', 'expedition', 'performance', 'wellbeing', 'profile', 'review')
      )
      or (
        cta_type = 'external_url'
        and nullif(btrim(cta_label), '') is not null
        and cta_value ~ '^https://[^[:space:]]+$'
      )
    ),
  constraint announcements_dates_check
    check (ends_at is null or ends_at > starts_at),
  constraint announcements_title_length_check
    check (char_length(title) between 1 and 80),
  constraint announcements_summary_length_check
    check (char_length(summary) between 1 and 180),
  constraint announcements_body_length_check
    check (char_length(body) between 1 and 4000),
  constraint announcements_suggestions_check
    check (
      jsonb_typeof(suggestions) = 'array'
      and jsonb_array_length(suggestions) <= 5
    ),
  constraint announcements_no_html_check
    check (
      title !~ '<[^>]*>'
      and summary !~ '<[^>]*>'
      and body !~ '<[^>]*>'
      and coalesce(cta_label, '') !~ '<[^>]*>'
      and suggestions::text !~ '<[^>]*>'
    )
);

create index announcements_active_idx
  on public.announcements (is_published, archived_at, starts_at, ends_at);
create index announcements_audience_idx
  on public.announcements (audience_type, contest_id);
create index announcements_home_priority_idx
  on public.announcements (is_pinned desc, priority, published_at desc);

create table public.announcement_reads (
  user_id uuid not null references public.profiles (id) on delete cascade,
  announcement_id uuid not null references public.announcements (id) on delete cascade,
  read_at timestamptz not null default now(),
  dismissed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, announcement_id)
);

create index announcement_reads_announcement_idx
  on public.announcement_reads (announcement_id);

create trigger set_updated_at
  before update on public.announcements
  for each row execute function public.set_updated_at();

create trigger set_updated_at
  before update on public.announcement_reads
  for each row execute function public.set_updated_at();

alter table public.announcements enable row level security;
alter table public.announcement_reads enable row level security;

revoke all privileges on table public.announcements from anon, authenticated, service_role;
revoke all privileges on table public.announcement_reads from anon, authenticated, service_role;

grant select, insert, update on table public.announcements to authenticated;
grant select, insert, update on table public.announcement_reads to authenticated;
grant select, insert, update, delete on table public.announcements to service_role;
grant select, insert, update, delete on table public.announcement_reads to service_role;

create policy announcements_student_select_active
  on public.announcements
  for select to authenticated
  using (
    is_published
    and archived_at is null
    and starts_at <= now()
    and (ends_at is null or ends_at > now())
    and (
      audience_type = 'all'
      or (
        audience_type = 'contest'
        and exists (
          select 1
          from public.contest_entitlements entitlement
          where entitlement.user_id = (select auth.uid())
            and entitlement.contest_id = announcements.contest_id
            and entitlement.status = 'active'
        )
      )
    )
  );

create policy announcements_admin_select
  on public.announcements
  for select to authenticated
  using (
    exists (
      select 1 from public.profiles profile
      where profile.id = (select auth.uid())
        and profile.role = 'developer'
    )
  );

create policy announcements_admin_insert
  on public.announcements
  for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and exists (
      select 1 from public.profiles profile
      where profile.id = (select auth.uid())
        and profile.role = 'developer'
    )
  );

create policy announcements_admin_update
  on public.announcements
  for update to authenticated
  using (
    exists (
      select 1 from public.profiles profile
      where profile.id = (select auth.uid())
        and profile.role = 'developer'
    )
  )
  with check (
    exists (
      select 1 from public.profiles profile
      where profile.id = (select auth.uid())
        and profile.role = 'developer'
    )
  );

create policy announcement_reads_select_own
  on public.announcement_reads
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy announcement_reads_insert_own
  on public.announcement_reads
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy announcement_reads_update_own
  on public.announcement_reads
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
