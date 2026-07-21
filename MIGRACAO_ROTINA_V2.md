# Migração — Rotina Inteligente V2

## Versões

| Item | Antes | Depois |
|------|--------|--------|
| `DB_VERSION` | 3 | **4** |
| `BACKUP_VERSION` | 3 | **4** |
| `APP_VERSION` (backup) | phase6-intelligent-review-01 | phase6-routine-intelligent-v2 |
| Rotina UI | Metas/semana simples (`StudyRoutine`) | Rotina Inteligente (blocos + foco) |

## Stores adicionados (IndexedDB do concurso)

| Store | keyPath | Índices |
|-------|---------|---------|
| `routineProfiles` | `id` | — |
| `routineBlocks` | `id` | `date`, `status`, `seriesId` |
| `studySessions` | `id` | `blockId`, `date` |
| `routineDailyStates` | `id` (= data) | — |
| `routineWeeklyReviews` | `id` | `weekStart` |
| `routineAchievements` | `id` | — |
| `routineDistractions` | `id` | `sessionId`, `at` |
| `routineReminderSettings` | `id` | — |

Stores antigos **preservados**: `routines`, `dailyLogs`, player, reviewQueue, etc.

## Campos novos (resumo)

Ver `app/js/core/routine/routineSchema.js` — `createRoutineBlock`, `createRoutineProfile`, etc.

Defaults documentados:

- `setupCompleted: false` até o usuário concluir/pular setup
- `flexible: true`
- `minGoal: { type: 'minutes', minutes: 10, ... }`
- `consistency.shields: 0`, `maxShields: 2`, `autoUseShield: true`
- `status` de bloco: `planned`
- `actualMinutes: 0` até sessão real
- `schemaVersion: 1` nos registros da rotina

## Compatibilidade

1. **Upgrade IndexedDB**: `onupgradeneeded` cria stores se não existirem; não apaga dados.
2. **Primeiro `ensureProfile`**: se não houver perfil, migra `routines` legadas via `migrateLegacyRoutinesToProfile`.
3. **Home / batalha**: continuam lendo `routines` + `dailyLogs`; o serviço **escreve** rotinas legadas a partir do perfil (`syncLegacyRoutines`).
4. **Backup v1–v3**: restaura normalmente; coleções V2 ausentes ficam `[]` ou preservam o que já existir no destino.
5. **Backup v4**: inclui todas as coleções da rotina.

## Procedimento de recuperação

1. Exportar Kafra **antes** de atualizar (se possível).
2. Atualizar app (DB sobe para 4 automaticamente no primeiro open).
3. Abrir **Rotina Inteligente** — perfil é criado/migrado.
4. Se algo falhar: restaurar `.rpgsave` / JSON Kafra; validação rejeita arquivo inválido ou de outro concurso.
5. Dados de batalha/domínio/review **não** dependem das novas stores.

## O que não migrar de forma destrutiva

- Não zerar `dailyLogs` ou `routines`.
- Não apagar blocos `completed` / `rescheduled` ao regenerar semana (só remove `planned` com source template/weakspot/review).
