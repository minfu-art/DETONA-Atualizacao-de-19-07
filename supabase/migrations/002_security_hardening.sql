-- DETONA CONCURSOS — P0 security hardening
-- Aplicar somente após 001_detona_schema.sql.
-- Esta migration não contém segredos e não deve ser executada pelo frontend.

-- ---------------------------------------------------------------------------
-- Entitlements: aluno lê os próprios registros; somente service_role escreve.
-- O backend privilegiado deve validar pagamento/concessão e nunca confiar em
-- user_id, contest_id, status ou source enviados diretamente pelo navegador.
-- ---------------------------------------------------------------------------
drop policy if exists entitlements_write_own on public.contest_entitlements;
drop policy if exists entitlements_select_own on public.contest_entitlements;

create policy entitlements_select_own on public.contest_entitlements
  for select to authenticated
  using (auth.uid() = user_id);

revoke all on table public.contest_entitlements from anon;
revoke insert, update, delete on table public.contest_entitlements from authenticated;
grant select on table public.contest_entitlements to authenticated;
grant all privileges on table public.contest_entitlements to service_role;

-- ---------------------------------------------------------------------------
-- Profiles: o trigger de auth cria a linha. O aluno lê a própria linha e só
-- pode atualizar name/preferences. role, enabled_modules, email, timestamps e
-- quaisquer futuras colunas permanecem fora do GRANT de UPDATE.
-- RLS limita a linha; privilégios por coluna limitam os campos.
-- ---------------------------------------------------------------------------
drop policy if exists profiles_insert_own on public.profiles;
drop policy if exists profiles_update_own on public.profiles;
drop policy if exists profiles_update_safe_own on public.profiles;
drop policy if exists profiles_select_own on public.profiles;

create policy profiles_select_own on public.profiles
  for select to authenticated
  using (auth.uid() = id);

create policy profiles_update_safe_own on public.profiles
  for update to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

revoke all on table public.profiles from anon;
revoke insert, update, delete on table public.profiles from authenticated;
grant select on table public.profiles to authenticated;
grant update (name, preferences) on table public.profiles to authenticated;
grant all privileges on table public.profiles to service_role;

-- Evita chamada direta do helper privilegiado. O trigger continua responsável
-- por materializar profiles após inserção em auth.users.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
grant execute on function public.handle_new_user() to service_role;

comment on policy entitlements_select_own on public.contest_entitlements is
  'Aluno pode somente consultar os próprios direitos; mutações exigem service_role.';
comment on policy profiles_update_safe_own on public.profiles is
  'RLS limita a própria linha; GRANT por coluna permite somente name e preferences.';
