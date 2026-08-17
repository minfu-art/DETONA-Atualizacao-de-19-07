-- Índices das FKs de identidade/auditoria apontados pelo advisor de performance.
create index if not exists course_factory_drafts_created_by_idx
  on public.course_factory_drafts(created_by);

create index if not exists course_factory_drafts_approved_by_idx
  on public.course_factory_drafts(approved_by)
  where approved_by is not null;

create index if not exists course_factory_sources_uploaded_by_idx
  on public.course_factory_sources(uploaded_by);

create index if not exists course_factory_analysis_runs_requested_by_idx
  on public.course_factory_analysis_runs(requested_by);
