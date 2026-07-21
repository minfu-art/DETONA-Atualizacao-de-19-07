# Rotina V3 — Jornada até a Prova

Documento de arquitetura, fluxos, regras, métricas e UX das **Fases 0 e 1** (auditoria + calendário dinâmico + jornada).

## Status

| Fase | Conteúdo | Estado |
|------|----------|--------|
| 0 | Auditoria da rotina atual, baseline de testes | Concluída |
| 1 | Modelo de dados, semana, mês, jornada, contagem, chibi | Concluída (núcleo) |
| 2–6 | Hoje avançado, execução, análise, integrações finais | Pendente |

## Princípio supremo (XP)

A rotina **não concede XP**, não sobe nível, não altera domínio, estrelas, memória, fila de revisão nem progresso acadêmico do edital.

O avatar chibi e o `positionPct` da trilha representam **apenas o tempo até a prova**, nunca progresso acadêmico.

## Arquitetura

```
app/js/core/routine/
  routineSchema.js      # blocos, profile (exam*, journeyStartDate), schema v2
  routineCalendar.js    # puro: week/month, aggregate, examJourney, chibi
  routinePlanner.js     # plano semanal, reschedule, reduced plan
  routineFocus.js       # timer de sessão
  routineConsistency.js # sequência / meta mínima
  routineMetrics.js     # adesão e métricas de rotina
  index.js              # reexports

app/js/services/routineService.js
  getWeekView / shiftWeekView
  getMonthView
  getExamJourney / setExamMeta

app/js/ui/expedition.js
  Abas: Hoje | Semana | Mês | Jornada | Sessão | Análise
```

### Isolamento

Tudo permanece escopado por `userId` + `contestId` via `progressRepository`, como na V2.

### Offline / PWA

Sem dependência de rede para calendário e jornada. IndexedDB local; stores existentes preservados.

## Núcleos da UI (V3)

1. **Hoje** — próxima ação, KPIs do dia, contagem inline, blocos  
2. **Semana** — grade 7 dias, navegação prev/next, carga e alertas  
3. **Mês** — grade mensal, dots de status, detalhe do dia, marca da prova  
4. **Jornada** — contagem regressiva, trilha, marcos, avatar chibi, formulário da prova  
5. **Sessão** — foco/timer (V2)  
6. **Análise** — métricas de rotina (V2), sem misturar com XP  

## Modelo de dados (campos novos no profile)

| Campo | Tipo | Uso |
|-------|------|-----|
| `examDate` | `YYYY-MM-DD` \| null | Data da prova |
| `examTime` | string \| null | Horário |
| `examLocation` | string \| null | Local opcional |
| `examNotes` | string \| null | Observações |
| `journeyStartDate` | `YYYY-MM-DD` \| null | Início da trilha temporal |
| `schemaVersion` | 2 | Compatível com V2 + campos extras |

`setExamMeta` espelha `examDate` em `player.exam_date` (meta de prova do app) **sem** tocar em XP/nível.

## Funções puras centrais

### `examJourney({ examDate, startDate, today })`

Retorna:

- `hasExam`, `daysLeft`, `weeksLeft`
- `elapsedPct`, `remainingPct`, `positionPct` (0–100 na trilha)
- `phase`: `sem_data` | `preparacao` | `meio` | `reta_final` | `semana_prova` | `prova`
- `milestones[]` (início, 1º mês, revisões, reta final, dia da prova)

### `chibiState(journey)`

Poses leves: `idle` | `walk` | `focus` | `celebrate` + mensagem motivacional **não punitiva**.

### Calendário

- `weekDatesFrom` / `shiftWeek` — semana Dom–Sáb  
- `monthMatrix` / `shiftMonth` — células com `inMonth`  
- `aggregateDays` — minutos, conclusões, revisões, descanso  
- `dayLoadLevel` — empty / low / mid / high / overload  

## Fluxos

### Definir prova

Jornada → preencher data (e opcionais) → `setExamMeta` → trilha e contagem atualizam.

### Navegar calendário

- Semana: `weekCursor` + `getWeekView` / `shiftWeek`  
- Mês: `monthCursor` + `getMonthView`; toque no dia abre detalhe  

### Próxima ação (Hoje)

Reutiliza `nextActionableBlock` da V2; card “Comece por aqui” + botão **Começar agora**.

## Métricas (rotina ≠ acadêmico)

| Métrica | Origem | Não misturar com |
|---------|--------|------------------|
| Adesão semanal | `weekSummaryStats` / metrics | XP |
| Minutos planejados/executados | blocos + daily state | domínio |
| Blocos concluídos/reagendados | status do bloco | estrelas |
| Sequência / shields | consistency | nível do personagem |
| `positionPct` | tempo até a prova | qualquer progresso acadêmico |

## Integrações (Fase 1)

| Integração | Estado |
|------------|--------|
| Edital (subject/topic) | Planejado Fase 5; blocos já têm campos |
| Revisão / fila | Bloco `revisao_fila` navega para review (V2) |
| Backup | Stores de rotina já no backup schema V2; campos exam* no profile |

## Decisões de UX

1. Abas fluidas no mobile (scroll horizontal).  
2. Próxima ação sempre em destaque no Hoje.  
3. Sobrecarga visual (badge) sem bloquear o usuário.  
4. Avatar só na jornada temporal — sem “evolução” por cumprir rotina.  
5. `prefers-reduced-motion` desliga animação do chibi.  
6. Tom sem culpa (“O plano pode ser ajustado…” em fases futuras de replanejamento).  
7. Não copiar identidade visual de apps de terceiros.

## Testes

- `app/tests/routine-intelligent-v2.test.js` — regressão V2  
- `app/tests/routine-v3-calendar.test.js` — calendário, jornada, chibi, serviço, anti-XP  

## Limitações atuais (pós Fase 1)

- Drag-and-drop de blocos ainda não implementado.  
- Modo produtivo / dia difícil avançados (além de “pouco tempo”) na Fase 4.  
- Análise expandida e assistente de planejamento completo na Fase 5.  
- Chibi é emoji/CSS (não sprite de personagem acadêmico).  
