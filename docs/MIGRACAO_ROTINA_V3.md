# Migração — Rotina V3 (Fases 0–1)

## Objetivo

Ampliar o profile e as views de calendário **sem** recriar stores e **sem** migrar destrutivamente o IndexedDB.

## Stores (inalterados em estrutura de store)

| Store | Mudança V3 |
|-------|------------|
| `routineProfiles` | Novos campos opcionais no documento |
| `routineBlocks` | Sem breaking change |
| `studySessions` | Sem breaking change |
| `routineDailyStates` | Sem breaking change |
| `routineWeeklyReviews` | Sem breaking change |
| `routineAchievements` | Sem breaking change |
| `routineDistractions` | Sem breaking change |
| `routineReminderSettings` | Sem breaking change |

Não há novo object store. Não há `clear()` de rotina na migração.

## Campos novos em `routineProfiles`

| Campo | Default | Notas |
|-------|---------|-------|
| `examDate` | `null` ou valor já existente | Já existia na V2 |
| `examTime` | `null` | Novo |
| `examLocation` | `null` | Novo |
| `examNotes` | `null` | Novo |
| `journeyStartDate` | `createdAt` (YYYY-MM-DD) se ausente | Novo |
| `schemaVersion` | `2` | V2 era 1; normalize aceita ambos |

## Normalização

`normalizeRoutineProfile` preenche defaults se o registro antigo não tiver os campos. Leituras antigas continuam válidas.

```js
examDate: raw.examDate || null,
examTime: raw.examTime || null,
examLocation: raw.examLocation || null,
examNotes: raw.examNotes || null,
journeyStartDate: raw.journeyStartDate || (raw.createdAt ? String(raw.createdAt).slice(0, 10) : null),
schemaVersion: Number(raw.schemaVersion) || ROUTINE_SCHEMA_VERSION, // 2
```

## Compatibilidade

- Blocos existentes: status, datas e minutos preservados.  
- Sequência / shields / conquistas de rotina: intocados.  
- `player.exam_date`: sincronizado só quando o usuário salva em **Jornada** via `setExamMeta`.  
- XP, nível, estrelas, domínio, fila de revisão: **nunca** alterados pela rotina.  
- Isolamento `userId` + `contestId` mantido.

## Defaults de jornada

Se `examDate` existir e `journeyStartDate` for nulo:

1. Usa `createdAt` do profile, ou  
2. Fallback em `examJourney`: 90 dias antes da prova.

## Recuperação

1. Backup envelope já inclui `routineProfiles` (e demais stores de rotina).  
2. Restore reaplica o profile com `normalizeRoutineProfile` nos fluxos de restore existentes.  
3. Se `examDate` no profile e `player.exam_date` divergirem após restore antigo, o usuário pode regravar em Jornada.

## O que NÃO fazer

- Não dropar IndexedDB.  
- Não reindexar blocos em massa.  
- Não apagar planejamentos ao abrir abas Mês/Jornada.  
- Não escrever em `topicProgress` / mastery a partir da rotina.

## Checklist de validação pós-migração

- [ ] Profile antigo carrega sem erro  
- [ ] Semana e mês listam blocos pré-existentes  
- [ ] Definir prova não muda XP  
- [ ] Troca de usuário/concurso isola dados  
- [ ] Backup → restore preserva `examDate` e blocos  
