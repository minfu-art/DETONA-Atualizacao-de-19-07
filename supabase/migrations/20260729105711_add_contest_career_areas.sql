-- Classificação editorial incremental da Biblioteca por áreas de carreira.
-- Não altera entitlement, conteúdo, progresso ou publicação.

alter table public.admin_contests
  add column if not exists career_area text,
  add column if not exists career_subarea text;

alter table public.admin_contests
  drop constraint if exists admin_contests_career_area_check;

alter table public.admin_contests
  add constraint admin_contests_career_area_check
  check (
    career_area is null
    or career_area in (
      'police_security',
      'administrative',
      'fiscal_control',
      'courts_legal',
      'health_education',
      'armed_forces'
    )
  );

create index if not exists admin_contests_career_area_status_idx
  on public.admin_contests(career_area, content_status, sales_status);

update public.admin_contests
set career_area = 'police_security',
    career_subarea = 'civil_police'
where id = 'pc_al_2026'
  and (career_area is distinct from 'police_security'
    or career_subarea is distinct from 'civil_police');

update public.admin_contests
set career_area = 'police_security',
    career_subarea = 'prison_police'
where id = 'pp_pe_2027'
  and (career_area is distinct from 'police_security'
    or career_subarea is distinct from 'prison_police');

comment on column public.admin_contests.career_area is
  'Área oficial de carreira; NULL é apresentado temporariamente como other.';
comment on column public.admin_contests.career_subarea is
  'Subárea editorial opcional dentro da área de carreira.';
