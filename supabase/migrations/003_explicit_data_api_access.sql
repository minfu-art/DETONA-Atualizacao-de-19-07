-- DETONA CONCURSOS — acesso explícito e mínimo pela Data API
--
-- O frontend usa profiles e contest_entitlements para leitura de identidade/acesso,
-- progress_records como SSOT de sincronização e as seis tabelas tipadas como
-- espelhos best-effort. Todas as tabelas permanecem protegidas por RLS.

-- O schema precisa ser resolvível pelas duas funções da Data API autorizadas.
grant usage on schema public to authenticated, service_role;

-- Nenhuma tabela privada é pública ou acessível sem sessão autenticada.
revoke all privileges on table public.profiles from anon;
revoke all privileges on table public.contest_entitlements from anon;
revoke all privileges on table public.progress_records from anon;
revoke all privileges on table public.players from anon;
revoke all privileges on table public.subtopic_progress from anon;
revoke all privileges on table public.daily_logs from anon;
revoke all privileges on table public.review_queue from anon;
revoke all privileges on table public.wellbeing_logs from anon;
revoke all privileges on table public.routine_blocks from anon;

-- Começa de uma base fechada para evitar herdar privilégios automáticos antigos.
revoke all privileges on table public.profiles from authenticated, service_role;
revoke all privileges on table public.contest_entitlements from authenticated, service_role;
revoke all privileges on table public.progress_records from authenticated, service_role;
revoke all privileges on table public.players from authenticated, service_role;
revoke all privileges on table public.subtopic_progress from authenticated, service_role;
revoke all privileges on table public.daily_logs from authenticated, service_role;
revoke all privileges on table public.review_queue from authenticated, service_role;
revoke all privileges on table public.wellbeing_logs from authenticated, service_role;
revoke all privileges on table public.routine_blocks from authenticated, service_role;

-- profiles: o trigger de auth cria a linha. O aluno lê a própria linha e só pode
-- alterar name/preferences; role, enabled_modules, email e timestamps ficam fora.
drop policy if exists profiles_insert_own on public.profiles;
drop policy if exists profiles_update_own on public.profiles;
drop policy if exists profiles_update_safe_own on public.profiles;
drop policy if exists profiles_select_own on public.profiles;

create policy profiles_select_own on public.profiles
  for select to authenticated
  using ((select auth.uid()) = id);

create policy profiles_update_safe_own on public.profiles
  for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

grant select on table public.profiles to authenticated;
grant update (name, preferences) on table public.profiles to authenticated;

-- contest_entitlements: o aluno somente consulta os próprios direitos.
drop policy if exists entitlements_write_own on public.contest_entitlements;
drop policy if exists entitlements_select_own on public.contest_entitlements;

create policy entitlements_select_own on public.contest_entitlements
  for select to authenticated
  using ((select auth.uid()) = user_id);

grant select on table public.contest_entitlements to authenticated;

-- progress_records: o sincronizador executa pull, upsert e exclusões remotas.
drop policy if exists progress_select_own on public.progress_records;
drop policy if exists progress_insert_own on public.progress_records;
drop policy if exists progress_update_own on public.progress_records;
drop policy if exists progress_delete_own on public.progress_records;

create policy progress_select_own on public.progress_records
  for select to authenticated
  using ((select auth.uid()) = user_id);
create policy progress_insert_own on public.progress_records
  for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy progress_update_own on public.progress_records
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy progress_delete_own on public.progress_records
  for delete to authenticated
  using ((select auth.uid()) = user_id);

grant select, insert, update, delete on table public.progress_records to authenticated;

-- Tabelas tipadas: espelhos efetivamente escritos e removidos pelo frontend.
-- SELECT é necessário para localizar conflitos/linhas durante upsert sob RLS.
drop policy if exists players_all_own on public.players;
drop policy if exists players_select_own on public.players;
drop policy if exists players_insert_own on public.players;
drop policy if exists players_update_own on public.players;
drop policy if exists players_delete_own on public.players;
create policy players_select_own on public.players
  for select to authenticated using ((select auth.uid()) = user_id);
create policy players_insert_own on public.players
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy players_update_own on public.players
  for update to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy players_delete_own on public.players
  for delete to authenticated using ((select auth.uid()) = user_id);
grant select, insert, update, delete on table public.players to authenticated;

drop policy if exists subtopic_all_own on public.subtopic_progress;
drop policy if exists subtopic_select_own on public.subtopic_progress;
drop policy if exists subtopic_insert_own on public.subtopic_progress;
drop policy if exists subtopic_update_own on public.subtopic_progress;
drop policy if exists subtopic_delete_own on public.subtopic_progress;
create policy subtopic_select_own on public.subtopic_progress
  for select to authenticated using ((select auth.uid()) = user_id);
create policy subtopic_insert_own on public.subtopic_progress
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy subtopic_update_own on public.subtopic_progress
  for update to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy subtopic_delete_own on public.subtopic_progress
  for delete to authenticated using ((select auth.uid()) = user_id);
grant select, insert, update, delete on table public.subtopic_progress to authenticated;

drop policy if exists daily_logs_all_own on public.daily_logs;
drop policy if exists daily_logs_select_own on public.daily_logs;
drop policy if exists daily_logs_insert_own on public.daily_logs;
drop policy if exists daily_logs_update_own on public.daily_logs;
drop policy if exists daily_logs_delete_own on public.daily_logs;
create policy daily_logs_select_own on public.daily_logs
  for select to authenticated using ((select auth.uid()) = user_id);
create policy daily_logs_insert_own on public.daily_logs
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy daily_logs_update_own on public.daily_logs
  for update to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy daily_logs_delete_own on public.daily_logs
  for delete to authenticated using ((select auth.uid()) = user_id);
grant select, insert, update, delete on table public.daily_logs to authenticated;

drop policy if exists review_queue_all_own on public.review_queue;
drop policy if exists review_queue_select_own on public.review_queue;
drop policy if exists review_queue_insert_own on public.review_queue;
drop policy if exists review_queue_update_own on public.review_queue;
drop policy if exists review_queue_delete_own on public.review_queue;
create policy review_queue_select_own on public.review_queue
  for select to authenticated using ((select auth.uid()) = user_id);
create policy review_queue_insert_own on public.review_queue
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy review_queue_update_own on public.review_queue
  for update to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy review_queue_delete_own on public.review_queue
  for delete to authenticated using ((select auth.uid()) = user_id);
grant select, insert, update, delete on table public.review_queue to authenticated;

drop policy if exists wellbeing_logs_all_own on public.wellbeing_logs;
drop policy if exists wellbeing_logs_select_own on public.wellbeing_logs;
drop policy if exists wellbeing_logs_insert_own on public.wellbeing_logs;
drop policy if exists wellbeing_logs_update_own on public.wellbeing_logs;
drop policy if exists wellbeing_logs_delete_own on public.wellbeing_logs;
create policy wellbeing_logs_select_own on public.wellbeing_logs
  for select to authenticated using ((select auth.uid()) = user_id);
create policy wellbeing_logs_insert_own on public.wellbeing_logs
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy wellbeing_logs_update_own on public.wellbeing_logs
  for update to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy wellbeing_logs_delete_own on public.wellbeing_logs
  for delete to authenticated using ((select auth.uid()) = user_id);
grant select, insert, update, delete on table public.wellbeing_logs to authenticated;

drop policy if exists routine_blocks_all_own on public.routine_blocks;
drop policy if exists routine_blocks_select_own on public.routine_blocks;
drop policy if exists routine_blocks_insert_own on public.routine_blocks;
drop policy if exists routine_blocks_update_own on public.routine_blocks;
drop policy if exists routine_blocks_delete_own on public.routine_blocks;
create policy routine_blocks_select_own on public.routine_blocks
  for select to authenticated using ((select auth.uid()) = user_id);
create policy routine_blocks_insert_own on public.routine_blocks
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy routine_blocks_update_own on public.routine_blocks
  for update to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy routine_blocks_delete_own on public.routine_blocks
  for delete to authenticated using ((select auth.uid()) = user_id);
grant select, insert, update, delete on table public.routine_blocks to authenticated;

-- O backend privilegiado administra todas as linhas, sem expor sua chave ao app.
grant select, insert, update, delete on table public.profiles to service_role;
grant select, insert, update, delete on table public.contest_entitlements to service_role;
grant select, insert, update, delete on table public.progress_records to service_role;
grant select, insert, update, delete on table public.players to service_role;
grant select, insert, update, delete on table public.subtopic_progress to service_role;
grant select, insert, update, delete on table public.daily_logs to service_role;
grant select, insert, update, delete on table public.review_queue to service_role;
grant select, insert, update, delete on table public.wellbeing_logs to service_role;
grant select, insert, update, delete on table public.routine_blocks to service_role;

-- Triggers continuam ativos, mas os helpers não são endpoints da Data API.
alter function public.handle_new_user() set search_path = '';
revoke execute on function public.handle_new_user() from public, anon, authenticated;
grant execute on function public.handle_new_user() to service_role;

revoke execute on function public.set_updated_at() from public, anon, authenticated;
grant execute on function public.set_updated_at() to service_role;
