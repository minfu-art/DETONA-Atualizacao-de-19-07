# Rotina Inteligente V2

## Arquitetura

A Rotina Inteligente vive em `.phase6-grok-work` e se integra ao DETONA CONCURSOS sem backend remoto.

```
app/js/core/routine/          # lógica pura (testável em Node)
  routineSchema.js            # modelos, defaults, migração legada
  routinePlanner.js           # blocos, conflitos, plano reduzido, reagendamento
  routineConsistency.js       # meta mínima, sequência, proteções, conquistas
  routineMetrics.js           # adesão, consistência, sugestões locais
  routineFocus.js             # máquina de estados da sessão de foco
app/js/services/routineService.js  # orquestração + IndexedDB
app/js/ui/expedition.js       # UI (Hoje · Semana · Foco · Progresso · Revisão)
```

Isolamento: cada par `userId + contestId` usa banco IndexedDB próprio (`contestDatabaseName`).  
Os registros da rotina também carregam `userId` e `contestId` para backup portátil.

## Funcionalidades

1. **Configuração inicial** — modelos leve / equilibrada / intensa (pulo permitido).
2. **Hoje** — KPIs, próxima ação, blocos, pouco tempo, fechar dia.
3. **Semana** — grade 7 colunas (desktop) / lista (mobile), alertas, regenerar plano.
4. **Sessão de foco** — 15/25/40/50/custom, countdown ou count-up, pausa, distrações, tempo real.
5. **Progresso** — Consistência (não XP), conquistas, precisão de planejamento.
6. **Revisão semanal** — ~2 min + sugestões locais com confirmação.

## Fluxos principais

### Primeiro acesso
`ensureProfile` → migra `routines` legadas se existirem → setup UI opcional → `completeSetup` → `generateWeekPlan`.

### Execução de bloco
Iniciar → Sessão de Foco → minutos reais (`validSessionMinutes`) → `completeBlock` / parcial → `refreshDailyState`.  
**Não** grava XP, estrelas, LV ou domínio.

### Pouco tempo
`buildReducedPlan` adiciona blocos `source: 'reduced'` **sem** apagar o plano original.

### Reagendamento
`rescheduleBlock` só sugere; `confirmReschedule` marca original como `rescheduled` e cria novo bloco.

## Regras de negócio

| Tema | Regra |
|------|--------|
| Sequência | Sobe só em dia programado com meta mínima |
| Descanso | Não quebra sequência |
| Abrir app | Não conta como dia cumprido |
| Proteção | +1 a cada 7 dias cumpridos; máx. 2; uso automático opcional |
| Proteção | Não esconde falta nas estatísticas |
| Minutos | Só contam com cronômetro real (≥30s se concluída) |
| XP acadêmico | Rotina **não** concede |
| Revisão inteligente | Bloco só navega / inicia; regras da fila intactas |

## Métricas

- **Adesão diária** = min(real, planejado) / planejado ≤ 100%; extras separados.
- **Consistência semanal** = dias programados com meta mínima / dias programados.
- **Precisão** = planejado vs real, blocos concluídos/reagendados/ignorados.
- **Taxa de retomada** = retomadas / dias perdidos.

## Integrações

| Módulo | Integração |
|--------|------------|
| `routines` + `dailyLogs` | Sincronizados para home/batalha (legado) |
| `reviewQueue` | Contagem de vencidas para priorizar blocos |
| `subtopics` | Pontos fracos determinísticos |
| Navegação | `revisao_fila` → `review`; questões → `map` |
| Kafra/backup | Coleções V2 no envelope v4 |
| PWA | Service worker `v46` inclui módulos da rotina |

## Gamificação da rotina

Trilha **Consistência** (separada do XP): sequências, proteções, conquistas (`first_step`, `three_days`, `first_week`, `retake_master`, `ten_focus`, `hundred_q`, `first_weekly_review`, `month_constancy`).  
Recompensa só por execução real.
