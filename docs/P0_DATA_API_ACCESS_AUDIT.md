# Auditoria de acesso à Data API — P0.1D

Escopo: frontend na branch `fix/p0-foundation`. O Supabase continua sendo backup/sincronização; o IndexedDB permanece como leitura local imediata.

| Tabela | Uso real no frontend | SELECT | INSERT | UPDATE | DELETE | Classificação |
| --- | --- | --- | --- | --- | --- | --- |
| `profiles` | Carrega o usuário e atualiza perfil | próprio perfil | não | somente `name`, `preferences` | não | ativa |
| `contest_entitlements` | Lista e consulta acesso a concurso | próprios direitos | não | não | não | ativa, escrita administrativa |
| `progress_records` | Pull, upsert e remoção da sincronização | próprios registros | próprios registros | próprios registros | próprios registros | ativa, SSOT na nuvem |
| `players` | Espelho tipado de `player` | necessário ao upsert/RLS | próprio espelho | próprio espelho | próprio espelho | ativa, analytics best-effort |
| `subtopic_progress` | Espelho tipado de `subtopics` | necessário ao upsert/RLS | próprio espelho | próprio espelho | próprio espelho | ativa, analytics best-effort |
| `daily_logs` | Espelho tipado de `dailyLogs` | necessário ao upsert/RLS | próprio espelho | próprio espelho | próprio espelho | ativa, analytics best-effort |
| `review_queue` | Espelho tipado de `reviewQueue` | necessário ao upsert/RLS | próprio espelho | próprio espelho | próprio espelho | ativa, analytics best-effort |
| `wellbeing_logs` | Espelho tipado de `wellbeingLogs` | necessário ao upsert/RLS | próprio espelho | próprio espelho | próprio espelho | ativa, analytics best-effort |
| `routine_blocks` | Espelho tipado de `routineBlocks` | necessário ao upsert/RLS | próprio espelho | próprio espelho | próprio espelho | ativa, analytics best-effort |

## Evidências no código

- `app/js/supabase/authAdapter.js`: `SELECT` em `profiles` e `UPDATE` filtrado para `name`/`preferences`.
- `app/js/supabase/entitlementRepository.js`: apenas `SELECT` em `contest_entitlements`; `save()` recusa mutações no cliente.
- `app/js/supabase/progressCloud.js`: `SELECT`, `upsert` e `DELETE` em `progress_records`; `upsert` e `DELETE` nos seis espelhos tipados.
- `app/js/supabase/hybridProgressAdapter.js`: remoções e limpezas locais são propagadas à nuvem, inclusive pela outbox offline.

Nenhuma das nove tabelas auditadas é pública. Os espelhos tipados são utilizados nesta fase, mas não são a fonte primária: falhas neles não substituem `progress_records`.

## Decisões de segurança

- `anon`: nenhum privilégio em qualquer tabela auditada.
- `authenticated`: apenas as operações acima, sempre limitadas por RLS a `auth.uid()`.
- `profiles`: RLS limita a linha e o GRANT por coluna impede mudanças em `role`, `enabled_modules`, `email` e timestamps.
- `contest_entitlements`: escrita exclusiva do backend privilegiado.
- `service_role`: DML administrativo explícito nas nove tabelas; a chave não pertence ao frontend.
- `handle_new_user` e `set_updated_at`: triggers preservados, com `EXECUTE` revogado de `public`, `anon` e `authenticated`.

## Arquivos locais do Supabase

- `supabase/config.toml` contém apenas configuração de desenvolvimento local e referências a variáveis de ambiente; não contém Project Ref remoto, senha, token ou chave.
- `supabase/.gitignore` ignora `.temp`, `.branches` e arquivos de ambiente locais.
- O Project Ref do vínculo permanece somente em `supabase/.temp/project-ref`, portanto não será versionado.
