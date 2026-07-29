-- Índices das chaves estrangeiras usados na administração e no isolamento.
create index ranked_events_created_by_idx
  on public.ranked_study_events(created_by);

create index ranked_questions_contest_idx
  on public.ranked_event_questions(contest_id);

create index ranked_questions_event_contest_idx
  on public.ranked_event_questions(event_id, contest_id);

create index ranked_attempts_user_idx
  on public.ranked_event_attempts(user_id);
